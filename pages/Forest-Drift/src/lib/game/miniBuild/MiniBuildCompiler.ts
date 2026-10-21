import { MINI_BUILD_SHAPE_TRIANGLES, shapeLimitError } from './miniBuildShapes';
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
 *
 * An angled block (rotation not a whole number of quarter turns) is not grid aligned, so it sits
 * outside all of this: it is emitted as its own turned cuboid (6 quads, or 2 for a plane), never hides
 * another block's face and is never hidden by one. Where it overlaps another block the buried part is
 * simply overdraw — at most 16 blocks, so that costs nothing worth the complexity of clipping.
 *
 * Every vertex also gets a `woodCoord` (see `materials/woodCoords.ts`): each block is one piece of
 * timber with its grain along its longest side, so a slot drawn in solid procedural wood shows long
 * grain on the faces and growth rings on the end grain, and no two blocks look alike.
 */
import {
	MINI_BUILD_COLLISION,
	type MiniBuildBlock,
	type MiniBuildDefinition
} from './MiniBuildTypes';
import {
	compileMiniBuildCollision,
	type MiniBuildCollisionBox
} from './MiniBuildCollisionCompiler';
import {
	anchorGrid,
	blockBox,
	blockCenterGrid,
	computeBounds,
	contentHash,
	gridToMeters,
	grainAxis,
	isAngledBlock,
	localBoundsMeters,
	orientationMatrix,
	type GridBox
} from './miniBuildGrid';
import { surfaceRanks, surfaceWins } from './miniBuildSurfaces';
import { hashStringToUint32 } from '../terrain/seededRandom';
import {
	woodHash,
	woodLogFor,
	writeWoodCoord,
	type Vec3,
	type WoodPieceFrame
} from '../materials/woodCoords';

export interface CompiledMiniBuildGroupData {
	materialSlot: number;
	positions: Float32Array;
	normals: Float32Array;
	uvs: Float32Array;
	/** Solid-wood log-space coordinates (metres), one vec3 per vertex. */
	woodCoords: Float32Array;
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
	woodCoords: number[];
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
	if (blocks.length === 0 || shapeLimitError(blocks)) {
		throw new Error(
			`Mini Build ${definition.id}: ${shapeLimitError(blocks) ?? 'needs at least one block'}`
		);
	}
	// Angled blocks have no grid box that means anything for covering faces.
	const boxes = blocks.map((block) =>
		isAngledBlock(block) || (block.shape && block.shape !== 'cuboid') ? null : blockBox(block)
	);
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
			builder = { positions: [], normals: [], uvs: [], woodCoords: [], indices: [] };
			builders.set(slot, builder);
		}
		const firstVertex = builder.positions.length / 3;
		if (blocks[i].shape === 'cylinder' || blocks[i].shape === 'sphere') {
			emitCurvedBlock(builder, blocks[i], anchor);
			appendWoodCoords(builder, firstVertex, blocks[i], anchor);
			continue;
		}
		if (!box) {
			quads += emitAngledBlock(builder, blocks[i], anchor);
			appendWoodCoords(builder, firstVertex, blocks[i], anchor);
			continue;
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
					const other = boxes[j];
					if (j === i || !other) continue;
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
		appendWoodCoords(builder, firstVertex, blocks[i], anchor);
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
			woodCoords: new Float32Array(builder.woodCoords),
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

/**
 * Log-space coordinates for the vertices a block just emitted: the block is one piece of timber
 * whose grain runs along its longest side and whose pith sits just beyond its thinnest side,
 * jittered by a hash of the block id (stable however blocks are reordered or moved).
 */
function appendWoodCoords(
	builder: GroupBuilder,
	firstVertex: number,
	block: MiniBuildBlock,
	anchor: { x: number; y: number; z: number }
): void {
	const m = orientationMatrix(block.rotation);
	const size = [block.sizeGrid.x, block.sizeGrid.y, block.sizeGrid.z];
	const [thin, wide, grain] = [0, 1, 2].sort((p, q) => size[p] - size[q] || q - p);
	const axis = (k: number): Vec3 => [m[k], m[3 + k], m[6 + k]];
	const c = blockCenterGrid(block);
	const frame: WoodPieceFrame = {
		center: [
			gridToMeters(c.x - anchor.x),
			gridToMeters(c.y - anchor.y),
			gridToMeters(c.z - anchor.z)
		],
		grain: axis(grain),
		wide: axis(wide),
		thin: axis(thin),
		halfThin: gridToMeters(size[thin]) / 2
	};
	const seed = hashStringToUint32(block.id);
	const log = woodLogFor(
		frame.halfThin,
		woodHash(1, 2, 3, seed),
		woodHash(4, 5, 6, seed),
		woodHash(7, 8, 9, seed)
	);
	const vertexCount = builder.positions.length / 3;
	const out = new Float32Array(3);
	for (let v = firstVertex; v < vertexCount; v++) {
		const p = builder.positions;
		writeWoodCoord(out, 0, [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]], frame, log);
		builder.woodCoords.push(out[0], out[1], out[2]);
	}
}

/**
 * A turned cuboid: each face a single quad in the block's own frame, rotated about the grid-box
 * centre. Faces with no area (a plane's edges) are skipped, so a plane is two quads, back to back.
 * UVs are world metres projected onto the face, with the grain along local X as for grid faces.
 */
function emitAngledBlock(
	builder: GroupBuilder,
	block: MiniBuildBlock,
	anchor: { x: number; y: number; z: number }
): number {
	const m = orientationMatrix(block.rotation);
	const c = blockCenterGrid(block);
	const size = [block.sizeGrid.x, block.sizeGrid.y, block.sizeGrid.z];
	const centre = [c.x, c.y, c.z];
	const anchorArr = [anchor.x, anchor.y, anchor.z];
	const world = (local: number[]) =>
		[0, 1, 2].map(
			(r) => centre[r] + m[r * 3] * local[0] + m[r * 3 + 1] * local[1] + m[r * 3 + 2] * local[2]
		);
	const axisDir = (k: number) => [m[k], m[3 + k], m[6 + k]];
	let quads = 0;
	for (const n of [0, 1, 2] as const) {
		const [a, b] = TANGENTS[n];
		if (size[a] === 0 || size[b] === 0) continue;
		const ta = axisDir(a);
		const tb = axisDir(b);
		const swapUv = b === 0;
		for (const dir of [-1, 1] as const) {
			const base = builder.positions.length / 3;
			const normal = axisDir(n).map((v) => v * dir);
			for (const [sa, sb] of [
				[-1, -1],
				[1, -1],
				[1, 1],
				[-1, 1]
			]) {
				const local = [0, 0, 0];
				local[n] = (dir * size[n]) / 2;
				local[a] = (sa * size[a]) / 2;
				local[b] = (sb * size[b]) / 2;
				const p = world(local);
				builder.positions.push(
					gridToMeters(p[0] - anchorArr[0]),
					gridToMeters(p[1] - anchorArr[1]),
					gridToMeters(p[2] - anchorArr[2])
				);
				builder.normals.push(normal[0], normal[1], normal[2]);
				const u = gridToMeters(p[0] * ta[0] + p[1] * ta[1] + p[2] * ta[2]) * MINI_BUILD_UV_SCALE;
				const v = gridToMeters(p[0] * tb[0] + p[1] * tb[1] + p[2] * tb[2]) * MINI_BUILD_UV_SCALE;
				if (swapUv) builder.uvs.push(v, u);
				else builder.uvs.push(u, v);
			}
			// Same winding rule as emitQuad: a × b = +n in the block's frame, and rotation keeps handedness.
			if (dir > 0) builder.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
			else builder.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
			quads++;
		}
	}
	return quads;
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

/** Curved primitives join the same per-material buffers and shared instance batches as cuboids. */
function emitCurvedBlock(
	builder: GroupBuilder,
	block: MiniBuildBlock,
	anchor: { x: number; y: number; z: number }
): void {
	const m = orientationMatrix(block.rotation),
		c = blockCenterGrid(block);
	const size = [block.sizeGrid.x, block.sizeGrid.y, block.sizeGrid.z];
	const centre = [c.x - anchor.x, c.y - anchor.y, c.z - anchor.z];
	for (const triangle of MINI_BUILD_SHAPE_TRIANGLES[block.shape as 'cylinder' | 'sphere']) {
		const points = triangle.map((p) => {
			const local = p.map((v, i) => v * size[i]);
			return [0, 1, 2].map((r) =>
				gridToMeters(
					centre[r] + m[r * 3] * local[0] + m[r * 3 + 1] * local[1] + m[r * 3 + 2] * local[2]
				)
			);
		});
		const a = points[1].map((v, i) => v - points[0][i]),
			b = points[2].map((v, i) => v - points[0][i]);
		const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
		const length = Math.hypot(...n);
		const normal = n.map((v) => v / length);
		const base = builder.positions.length / 3;
		for (const p of points) {
			builder.positions.push(...p);
			builder.normals.push(...normal);
			builder.uvs.push(p[0] * MINI_BUILD_UV_SCALE, p[1] * MINI_BUILD_UV_SCALE);
		}
		builder.indices.push(base, base + 1, base + 2);
	}
}
