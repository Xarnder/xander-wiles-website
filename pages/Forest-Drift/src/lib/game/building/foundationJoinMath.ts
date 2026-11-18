/**
 * Pure maths for joined foundations (Basements and Joined Foundations, technical plan §5).
 *
 * Foundations that touch along an edge, sit at the same `topY` and share a `joinId` form one
 * building. Membership is always worked out from the data, never trusted from it: a foundation
 * whose `joinId` matches but that no longer touches, or no longer lines up, simply falls out into a
 * building of its own. So a half-synced join online, or a hand-edited save, can't make a broken
 * building.
 *
 * Footprints are rectangles on the terrain vertex grid (integers). The inside tests work in any
 * units, as long as the rectangles and the points use the same ones.
 */

import type { FoundationDefinition } from './FoundationTypes';

export const MAX_JOINED_FOUNDATIONS = 8;
/** Tops closer than this count as the same height. */
export const JOIN_HEIGHT_TOLERANCE = 0.001;
const EPS = 1e-9;

export interface GridRect {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

type Footprint = Pick<FoundationDefinition, 'minGridX' | 'maxGridX' | 'minGridZ' | 'maxGridZ'>;
type Joinable = Footprint & Pick<FoundationDefinition, 'id' | 'topY' | 'joinId'>;

export function footprintRect(f: Footprint): GridRect {
	return { minX: f.minGridX, maxX: f.maxGridX, minZ: f.minGridZ, maxZ: f.maxGridZ };
}

/** A stretch of edge two footprints share: on the line `axis = at`, from `from` to `to`. */
export interface SharedEdge {
	/** `'x'`: the line X = at, running along Z. `'z'`: the line Z = at, running along X. */
	axis: 'x' | 'z';
	at: number;
	from: number;
	to: number;
}

/**
 * Where two footprints touch along an edge, with positive length. Touching only at a corner, or not
 * at all, gives `null`. Overlapping footprints (never allowed by placement) also give `null`.
 */
export function sharedEdge(a: Footprint, b: Footprint): SharedEdge | null {
	const ra = footprintRect(a);
	const rb = footprintRect(b);
	const overlapX = Math.min(ra.maxX, rb.maxX) - Math.max(ra.minX, rb.minX);
	const overlapZ = Math.min(ra.maxZ, rb.maxZ) - Math.max(ra.minZ, rb.minZ);
	if (overlapZ > 0 && (ra.maxX === rb.minX || rb.maxX === ra.minX))
		return {
			axis: 'x',
			at: ra.maxX === rb.minX ? ra.maxX : ra.minX,
			from: Math.max(ra.minZ, rb.minZ),
			to: Math.min(ra.maxZ, rb.maxZ)
		};
	if (overlapX > 0 && (ra.maxZ === rb.minZ || rb.maxZ === ra.minZ))
		return {
			axis: 'z',
			at: ra.maxZ === rb.minZ ? ra.maxZ : ra.minZ,
			from: Math.max(ra.minX, rb.minX),
			to: Math.min(ra.maxX, rb.maxX)
		};
	return null;
}

/** Whether two foundations could be one building: an edge in common and the same height. */
export function canJoin(a: Joinable, b: Joinable): boolean {
	return Math.abs(a.topY - b.topY) <= JOIN_HEIGHT_TOLERANCE && sharedEdge(a, b) !== null;
}

export interface JoinedBuilding {
	/** Whose storeys the building uses, and whose id its members' `joinId` should be. */
	anchorId: string;
	/** Member ids, sorted. A lone foundation is a building of one. */
	memberIds: string[];
}

/**
 * The anchor of a set of members: the member whose id is their `joinId` (the existing building's
 * storeys win, Q10). If that foundation has gone, the smallest id stands in, so every client agrees.
 */
export function anchorOf(members: readonly Joinable[]): string {
	const ids = members.map((m) => m.id).sort();
	const votes = new Map<string, number>();
	for (const m of members) if (m.joinId) votes.set(m.joinId, (votes.get(m.joinId) ?? 0) + 1);
	for (const id of ids) if (votes.has(id)) return id;
	return ids[0];
}

/**
 * Every foundation's building. Union-find over pairs with the same `joinId` that can join, so
 * buildings are always edge-connected and level. Deterministic: the result depends only on the
 * definitions, never their order.
 */
export function joinedBuildings(foundations: readonly Joinable[]): JoinedBuilding[] {
	const parent = new Map<string, string>();
	const find = (id: string): string => {
		let root = id;
		while (parent.get(root) !== root) root = parent.get(root)!;
		let node = id;
		while (parent.get(node) !== root) {
			const next = parent.get(node)!;
			parent.set(node, root);
			node = next;
		}
		return root;
	};
	for (const f of foundations) parent.set(f.id, f.id);
	const byJoin = new Map<string, Joinable[]>();
	for (const f of foundations) {
		if (!f.joinId) continue;
		const list = byJoin.get(f.joinId) ?? [];
		list.push(f);
		byJoin.set(f.joinId, list);
	}
	for (const list of byJoin.values())
		for (let i = 0; i < list.length; i++)
			for (let j = i + 1; j < list.length; j++)
				if (canJoin(list[i], list[j])) {
					const a = find(list[i].id);
					const b = find(list[j].id);
					if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
				}
	const groups = new Map<string, Joinable[]>();
	for (const f of foundations) {
		const root = find(f.id);
		const list = groups.get(root) ?? [];
		list.push(f);
		groups.set(root, list);
	}
	const buildings = [...groups.values()].map((members) => ({
		anchorId: anchorOf(members),
		memberIds: members.map((m) => m.id).sort()
	}));
	return buildings.sort((a, b) => (a.memberIds[0] < b.memberIds[0] ? -1 : 1));
}

/**
 * The `joinId` for two or more buildings becoming one (placing a foundation against them, or `L`):
 * the one with more foundations keeps its anchor; on a tie, the smaller anchor id wins.
 */
export function mergedJoinId(buildings: readonly JoinedBuilding[]): string {
	let best = buildings[0];
	for (const b of buildings.slice(1))
		if (
			b.memberIds.length > best.memberIds.length ||
			(b.memberIds.length === best.memberIds.length && b.anchorId < best.anchorId)
		)
			best = b;
	return best.anchorId;
}

/**
 * The `joinId` each side gets when a building is separated: the side with the anchor keeps it; the
 * other side takes its smallest member id. A side of one foundation isn't joined to anything, so its
 * `joinId` is dropped (`undefined`).
 */
export function joinIdsAfterSeparating(
	sides: readonly (readonly string[])[],
	anchorId: string
): Map<string, string | undefined> {
	const out = new Map<string, string | undefined>();
	for (const side of sides) {
		const sorted = [...side].sort();
		const id = side.length < 2 ? undefined : side.includes(anchorId) ? anchorId : sorted[0];
		for (const member of side) out.set(member, id);
	}
	return out;
}

/** Whether foundations of `vertexSpacing` share the building grid: their frames then differ by whole steps. */
export function joinGridAligned(vertexSpacing: number, buildingGridSize: number): boolean {
	const steps = vertexSpacing / buildingGridSize;
	return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/**
 * How far `to`'s local frame is from `from`'s, in building-grid steps: a point at local grid
 * (gx, gz) on `to` is at (gx + dx, gz + dz) on `from`. `null` when the grids don't line up.
 */
export function frameOffset(
	from: Footprint,
	to: Footprint,
	vertexSpacing: number,
	buildingGridSize: number
): { dx: number; dz: number } | null {
	if (!joinGridAligned(vertexSpacing, buildingGridSize)) return null;
	const steps = Math.round(vertexSpacing / buildingGridSize);
	return {
		dx: (to.minGridX - from.minGridX) * steps,
		dz: (to.minGridZ - from.minGridZ) * steps
	};
}

/** Whether a point is inside (or on the edge of) any of the rectangles. */
export function pointInRects(x: number, z: number, rects: readonly GridRect[]): boolean {
	for (const r of rects)
		if (x >= r.minX - EPS && x <= r.maxX + EPS && z >= r.minZ - EPS && z <= r.maxZ + EPS)
			return true;
	return false;
}

/**
 * Whether the whole segment from (ax, az) to (bx, bz) lies in the union of the rectangles, edges
 * included. Containment can only change where the segment crosses a rectangle's side, so the
 * segment is split there and each piece's midpoint tested.
 */
export function segmentInRects(
	ax: number,
	az: number,
	bx: number,
	bz: number,
	rects: readonly GridRect[]
): boolean {
	if (!pointInRects(ax, az, rects) || !pointInRects(bx, bz, rects)) return false;
	const ts = [0, 1];
	const dx = bx - ax;
	const dz = bz - az;
	for (const r of rects) {
		if (Math.abs(dx) > EPS)
			for (const x of [r.minX, r.maxX]) {
				const t = (x - ax) / dx;
				if (t > 0 && t < 1) ts.push(t);
			}
		if (Math.abs(dz) > EPS)
			for (const z of [r.minZ, r.maxZ]) {
				const t = (z - az) / dz;
				if (t > 0 && t < 1) ts.push(t);
			}
	}
	ts.sort((a, b) => a - b);
	for (let i = 0; i + 1 < ts.length; i++) {
		if (ts[i + 1] - ts[i] < EPS) continue;
		const t = (ts[i] + ts[i + 1]) / 2;
		if (!pointInRects(ax + dx * t, az + dz * t, rects)) return false;
	}
	return true;
}

/** A compressed grid over the rectangles: the distinct X and Z lines, and which cells are covered. */
interface UnionGrid {
	xs: number[];
	zs: number[];
	covered: (i: number, j: number) => boolean;
}

function unionGrid(rects: readonly GridRect[]): UnionGrid {
	const xs = [...new Set(rects.flatMap((r) => [r.minX, r.maxX]))].sort((a, b) => a - b);
	const zs = [...new Set(rects.flatMap((r) => [r.minZ, r.maxZ]))].sort((a, b) => a - b);
	const cells = new Uint8Array(Math.max(0, xs.length - 1) * Math.max(0, zs.length - 1));
	const w = xs.length - 1;
	for (let i = 0; i < w; i++)
		for (let j = 0; j + 1 < zs.length; j++) {
			const cx = (xs[i] + xs[i + 1]) / 2;
			const cz = (zs[j] + zs[j + 1]) / 2;
			cells[j * w + i] = pointInRects(cx, cz, rects) ? 1 : 0;
		}
	return {
		xs,
		zs,
		covered: (i, j) => i >= 0 && j >= 0 && i < w && j < zs.length - 1 && cells[j * w + i] === 1
	};
}

function pointInPolygon(
	x: number,
	z: number,
	polygon: readonly { x: number; z: number }[]
): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const a = polygon[i];
		const b = polygon[j];
		if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
	}
	return inside;
}

/**
 * Whether a closed polygon (a slab, a roof footprint, a closed wall path) lies in the union of the
 * rectangles: every edge inside, and no uncovered hole of the union (a courtyard in a ring-shaped
 * building) inside the polygon. With every edge in the union, a gap in it is either wholly inside
 * the polygon or wholly outside, so testing each gap cell's centre is enough.
 */
export function polygonInRects(
	points: readonly { x: number; z: number }[],
	rects: readonly GridRect[]
): boolean {
	if (points.length < 3) return false;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		if (!segmentInRects(a.x, a.z, b.x, b.z, rects)) return false;
	}
	const grid = unionGrid(rects);
	for (let i = 0; i + 1 < grid.xs.length; i++)
		for (let j = 0; j + 1 < grid.zs.length; j++) {
			if (grid.covered(i, j)) continue;
			const cx = (grid.xs[i] + grid.xs[i + 1]) / 2;
			const cz = (grid.zs[j] + grid.zs[j + 1]) / 2;
			if (pointInPolygon(cx, cz, points)) return false;
		}
	return true;
}

/**
 * The outline of the union of the rectangles: closed loops of corner points, math-CCW for outer
 * boundaries and CW for holes, each starting at its lowest-then-leftmost corner. Only the corners
 * where the outline turns are kept, so two footprints side by side give one rectangle.
 */
export function unionOutline(rects: readonly GridRect[]): { x: number; z: number }[][] {
	if (rects.length === 0) return [];
	const grid = unionGrid(rects);
	const { xs, zs, covered } = grid;
	// Directed boundary edges with the covered cell on their left (math-CCW round the solid).
	const next = new Map<string, { x: number; z: number }[]>();
	const key = (x: number, z: number) => `${x},${z}`;
	const add = (x0: number, z0: number, x1: number, z1: number) => {
		const list = next.get(key(x0, z0)) ?? [];
		list.push({ x: x1, z: z1 });
		next.set(key(x0, z0), list);
	};
	for (let i = 0; i + 1 < xs.length; i++)
		for (let j = 0; j + 1 < zs.length; j++) {
			if (!covered(i, j)) continue;
			if (!covered(i, j - 1)) add(xs[i], zs[j], xs[i + 1], zs[j]);
			if (!covered(i + 1, j)) add(xs[i + 1], zs[j], xs[i + 1], zs[j + 1]);
			if (!covered(i, j + 1)) add(xs[i + 1], zs[j + 1], xs[i], zs[j + 1]);
			if (!covered(i - 1, j)) add(xs[i], zs[j + 1], xs[i], zs[j]);
		}
	const loops: { x: number; z: number }[][] = [];
	const starts = [...next.keys()].sort((a, b) => {
		const [ax, az] = a.split(',').map(Number);
		const [bx, bz] = b.split(',').map(Number);
		return az - bz || ax - bx;
	});
	for (const startKey of starts) {
		while ((next.get(startKey)?.length ?? 0) > 0) {
			const [sx, sz] = startKey.split(',').map(Number);
			const loop: { x: number; z: number }[] = [{ x: sx, z: sz }];
			let cx = sx;
			let cz = sz;
			let px = Number.NaN;
			let pz = Number.NaN;
			for (let guard = 0; guard < 100_000; guard++) {
				const options = next.get(key(cx, cz))!;
				// Where the outline pinches at a point, keep the solid on the left by taking the
				// sharpest left-hand turn.
				let pick = 0;
				if (options.length > 1 && !Number.isNaN(px)) {
					const inX = cx - px;
					const inZ = cz - pz;
					let bestTurn = -Infinity;
					options.forEach((o, index) => {
						const outX = o.x - cx;
						const outZ = o.z - cz;
						const turn = Math.atan2(inX * outZ - inZ * outX, inX * outX + inZ * outZ);
						if (turn > bestTurn) {
							bestTurn = turn;
							pick = index;
						}
					});
				}
				const to = options.splice(pick, 1)[0];
				px = cx;
				pz = cz;
				cx = to.x;
				cz = to.z;
				if (cx === sx && cz === sz) break;
				loop.push({ x: cx, z: cz });
			}
			loops.push(simplifyLoop(loop));
		}
	}
	return loops;
}

/** Drops corners where the outline runs straight on. */
function simplifyLoop(loop: { x: number; z: number }[]): { x: number; z: number }[] {
	const out = loop.filter((p, i) => {
		const a = loop[(i - 1 + loop.length) % loop.length];
		const b = loop[(i + 1) % loop.length];
		return (p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x) !== 0;
	});
	let start = 0;
	for (let i = 1; i < out.length; i++)
		if (out[i].z < out[start].z || (out[i].z === out[start].z && out[i].x < out[start].x))
			start = i;
	return [...out.slice(start), ...out.slice(0, start)];
}
