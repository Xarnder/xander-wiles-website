/**
 * The Mini Build compiler: logical cuboids → one merged, indexed surface per material slot.
 *
 * Pure numeric code with no Three.js dependency, so it can move to a Web Worker unchanged. The
 * Three.js wrapper lives in MiniBuildAsset.ts.
 *
 * Because every block is an axis-aligned box on an integer grid, hidden surfaces can be removed
 * exactly without any CSG:
 *
 *   for each block, for each of its six faces
 *     rasterise the face into grid cells
 *     mark cells another opaque block covers from the outside as hidden
 *     remove cells where another coplanar, same-facing surface is drawn instead (never z-fights)
 *     greedily merge the visible cells into maximal rectangles and emit them as quads — a rectangle
 *     may run across hidden cells, because they sit against or inside a solid block anyway
 *
 * Which of two coplanar surfaces is drawn comes from miniBuildSurfaces.ts (opaque over glass, planes
 * over cuboid faces, the last-selected plane over other planes), shared with the editor so both
 * agree. The loser is removed rather than nudged by a depth epsilon: an epsilon small enough to be
 * invisible up close shimmers at a distance, and removing it also saves the overdraw.
 *
 * A plane (a block with zero size on one axis) goes through the same path: its four edge faces have
 * zero area and emit nothing, and its two opposite faces become one quad each — two-sided, 4
 * triangles, never a six-sided cuboid.
 *
 * A face is at most 64 × 64 cells and there are at most 16 blocks, so the worst case is a few
 * hundred thousand cell tests — well under a millisecond in practice (see the compiler tests).
 */
import {
	MINI_BUILD_COLLISION,
	MINI_BUILD_LIMITS,
	type MiniBuildDefinition
} from './MiniBuildTypes';
import {
	compileMiniBuildCollision,
	type MiniBuildCollisionBox
} from './MiniBuildCollisionCompiler';
import {
	anchorGrid,
	blockBox,
	computeBounds,
	contentHash,
	gridToMeters,
	grainAxis,
	localBoundsMeters,
	type GridBox
} from './miniBuildGrid';
import { surfaceRanks, surfaceWins } from './miniBuildSurfaces';

export interface CompiledMiniBuildGroupData {
	materialSlot: number;
	positions: Float32Array;
	normals: Float32Array;
	uvs: Float32Array;
	indices: Uint16Array | Uint32Array;
}

export interface CompiledMiniBuildData {
	designId: string;
	designRevision: number;
	contentHash: string;
	/** One entry per material slot actually used, ordered by slot. */
	groups: CompiledMiniBuildGroupData[];
	/** Metres relative to the anchor (bottom-centre). */
	bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
	collision: MiniBuildCollisionBox[];
	primitiveCost: number;
	stats: {
		vertices: number;
		triangles: number;
		quads: number;
		/** Face cells removed because they were covered or coplanar duplicates. */
		hiddenCells: number;
	};
}

/** UV density: one texture unit per metre, so a long table never stretches its grain. */
export const MINI_BUILD_UV_SCALE = 1;

interface GroupBuilder {
	positions: number[];
	normals: number[];
	uvs: number[];
	indices: number[];
}

/** Per-cell state while compiling one face. */
const VISIBLE = 0;
/** Covered from outside by an opaque block: never seen, so a merged quad may run across it. */
const HIDDEN = 1;
const EMITTED = 2;
/** Another surface is drawn here instead, or glass covers it: must stay empty. */
const REMOVED = 3;

function mergeable(state: number): boolean {
	return state === VISIBLE || state === HIDDEN;
}

function rowIsHidden(cells: Uint8Array, start: number, length: number): boolean {
	for (let k = start; k < start + length; k++) if (cells[k] !== HIDDEN) return false;
	return true;
}

/** Tangent pairs chosen so `a × b = +n` (Y×Z = X, Z×X = Y, X×Y = Z) — see emitQuad's winding. */
const TANGENTS: Record<0 | 1 | 2, [0 | 1 | 2, 0 | 1 | 2]> = {
	0: [1, 2],
	1: [2, 0],
	2: [0, 1]
};

function coord(box: GridBox, which: 'min' | 'max', axis: 0 | 1 | 2): number {
	const v = box[which];
	return axis === 0 ? v.x : axis === 1 ? v.y : v.z;
}

export function compileMiniBuildData(definition: MiniBuildDefinition): CompiledMiniBuildData {
	const blocks = definition.blocks;
	if (blocks.length === 0 || blocks.length > MINI_BUILD_LIMITS.maxBlocks) {
		throw new Error(
			`Mini Build ${definition.id} must have 1–${MINI_BUILD_LIMITS.maxBlocks} blocks`
		);
	}
	const boxes = blocks.map(blockBox);
	const ranks = surfaceRanks(blocks, definition.materials);
	const bounds = computeBounds(blocks);
	const anchor = anchorGrid(bounds);
	const builders = new Map<number, GroupBuilder>();
	let quads = 0;
	let hiddenCells = 0;

	for (let i = 0; i < blocks.length; i++) {
		const box = boxes[i];
		const slot = blocks[i].materialSlot;
		let builder = builders.get(slot);
		if (!builder) {
			builder = { positions: [], normals: [], uvs: [], indices: [] };
			builders.set(slot, builder);
		}
		const grain = grainAxis(blocks[i].rotation);

		for (const n of [0, 1, 2] as const) {
			const [a, b] = TANGENTS[n];
			const aMin = coord(box, 'min', a);
			const bMin = coord(box, 'min', b);
			const width = coord(box, 'max', a) - aMin;
			const height = coord(box, 'max', b) - bMin;
			for (const dir of [-1, 1] as const) {
				const plane = dir > 0 ? coord(box, 'max', n) : coord(box, 'min', n);
				const cells = new Uint8Array(width * height);

				for (let j = 0; j < boxes.length; j++) {
					if (j === i) continue;
					const other = boxes[j];
					const oMin = coord(other, 'min', n);
					const oMax = coord(other, 'max', n);
					// A block covers this face when it occupies the space just outside it. Planes have no
					// volume and never cover; glass only covers other glass, so it never hides a surface.
					const coversOutside =
						(dir > 0 ? oMin <= plane && oMax > plane : oMin < plane && oMax >= plane) &&
						(!ranks[j].transparent || ranks[i].transparent);
					// Another block has a face in this exact plane facing the same way: exactly one of the
					// two is drawn (see miniBuildSurfaces.ts).
					const otherDrawnInstead =
						(dir > 0 ? oMax === plane : oMin === plane) && surfaceWins(ranks[j], ranks[i]);
					if (!coversOutside && !otherDrawnInstead) continue;
					// Cells may be merged over only when an opaque block hides them and nothing else is
					// drawn in this plane.
					const state = otherDrawnInstead || ranks[j].transparent ? REMOVED : HIDDEN;
					const ua = Math.max(aMin, coord(other, 'min', a)) - aMin;
					const ub = Math.min(aMin + width, coord(other, 'max', a)) - aMin;
					const va = Math.max(bMin, coord(other, 'min', b)) - bMin;
					const vb = Math.min(bMin + height, coord(other, 'max', b)) - bMin;
					if (ua >= ub || va >= vb) continue;
					for (let v = va; v < vb; v++) {
						for (let k = v * width + ua; k < v * width + ub; k++) {
							if (cells[k] < state) cells[k] = state;
						}
					}
				}
				for (let k = 0; k < cells.length; k++) if (cells[k] !== VISIBLE) hiddenCells++;

				// Greedy rectangle merge: start at a visible cell, grow across visible or hidden cells.
				for (let v = 0; v < height; v++) {
					for (let u = 0; u < width; u++) {
						if (cells[v * width + u] !== VISIBLE) continue;
						let runEnd = u + 1;
						while (runEnd < width && mergeable(cells[v * width + runEnd])) runEnd++;
						// Hidden cells only help as a bridge; never let them trail off the end.
						while (cells[v * width + runEnd - 1] === HIDDEN) runEnd--;
						let rowEnd = v + 1;
						grow: while (rowEnd < height) {
							for (let k = u; k < runEnd; k++) {
								if (!mergeable(cells[rowEnd * width + k])) break grow;
							}
							rowEnd++;
						}
						while (rowEnd > v + 1 && rowIsHidden(cells, (rowEnd - 1) * width + u, runEnd - u)) {
							rowEnd--;
						}
						// Visible cells are consumed; hidden ones stay free to bridge other rectangles.
						for (let rv = v; rv < rowEnd; rv++) {
							for (let k = rv * width + u; k < rv * width + runEnd; k++) {
								if (cells[k] === VISIBLE) cells[k] = EMITTED;
							}
						}
						emitQuad(
							builder,
							n,
							dir,
							plane,
							a,
							aMin + u,
							aMin + runEnd,
							b,
							bMin + v,
							bMin + rowEnd,
							anchor,
							grain
						);
						quads++;
						u = runEnd - 1;
					}
				}
			}
		}
	}

	const groups: CompiledMiniBuildGroupData[] = [];
	let vertices = 0;
	let triangles = 0;
	for (const slot of [...builders.keys()].sort((x, y) => x - y)) {
		const builder = builders.get(slot)!;
		if (builder.indices.length === 0) continue;
		const vertexCount = builder.positions.length / 3;
		vertices += vertexCount;
		triangles += builder.indices.length / 3;
		groups.push({
			materialSlot: slot,
			positions: new Float32Array(builder.positions),
			normals: new Float32Array(builder.normals),
			uvs: new Float32Array(builder.uvs),
			indices:
				vertexCount > 0xffff ? new Uint32Array(builder.indices) : new Uint16Array(builder.indices)
		});
	}

	return {
		designId: definition.id,
		designRevision: definition.revision,
		contentHash: contentHash(definition),
		groups,
		bounds: localBoundsMeters(bounds),
		collision: compileMiniBuildCollision(blocks, MINI_BUILD_COLLISION),
		primitiveCost: blocks.length,
		stats: { vertices, triangles, quads, hiddenCells }
	};
}

function emitQuad(
	builder: GroupBuilder,
	n: 0 | 1 | 2,
	dir: -1 | 1,
	plane: number,
	a: 0 | 1 | 2,
	a0: number,
	a1: number,
	b: 0 | 1 | 2,
	b0: number,
	b1: number,
	anchor: { x: number; y: number; z: number },
	grain: 0 | 1 | 2
): void {
	const base = builder.positions.length / 3;
	const anchorArr = [anchor.x, anchor.y, anchor.z];
	const corners: [number, number][] = [
		[a0, b0],
		[a1, b0],
		[a1, b1],
		[a0, b1]
	];
	// Grain runs along u when the block's local X lies in this face's plane; otherwise the
	// canonical tangent order is used. Both keep UVs in world metres.
	const swapUv = grain === b;
	for (const [ca, cb] of corners) {
		const p = [0, 0, 0];
		p[n] = gridToMeters(plane - anchorArr[n]);
		p[a] = gridToMeters(ca - anchorArr[a]);
		p[b] = gridToMeters(cb - anchorArr[b]);
		builder.positions.push(p[0], p[1], p[2]);
		const normal = [0, 0, 0];
		normal[n] = dir;
		builder.normals.push(normal[0], normal[1], normal[2]);
		const u = gridToMeters(ca) * MINI_BUILD_UV_SCALE;
		const v = gridToMeters(cb) * MINI_BUILD_UV_SCALE;
		if (swapUv) builder.uvs.push(v, u);
		else builder.uvs.push(u, v);
	}
	// Corners run +a then +b. That winding faces +n when (a × b) points along +n, which holds for
	// every tangent pair in TANGENTS; flip for negative faces so front faces always point outward.
	if (dir > 0) {
		builder.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
	} else {
		builder.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
	}
}
