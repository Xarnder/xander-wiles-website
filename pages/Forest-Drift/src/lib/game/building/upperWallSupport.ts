/**
 * Upper-floor walls need something under them. On the ground floor a wall can go anywhere on its
 * foundation. Above that, by default, every part of a new wall has to stand on a ceiling, floor or
 * flat roof from below, or on top of a wall from below, so buildings grow upward as real ones do
 * and nothing floats over thin air. Pure (no Three.js): everything is in the foundation's own local
 * building grid, the same as the walls and slabs themselves.
 */
import type { SlabDefinition } from './SlabTypes';
import type { FoundationBuildingDefinition } from './WallTypes';

/** A support's top may sit this far below the new wall's base (a ceiling set lower), metres… */
export const SUPPORT_BELOW_REACH = 0.4;
/** …or this far above it (rounding, or a floor laid on this level itself). */
export const SUPPORT_ABOVE_REACH = 0.05;
/** At or below this base height a wall is on the ground floor and always allowed, metres. */
const GROUND_LEVEL_Y = 0.01;

export interface GridPointLike {
	gridX: number;
	gridZ: number;
}

interface Segment {
	ax: number;
	az: number;
	bx: number;
	bz: number;
	/** Half the supporting wall's thickness, metres. */
	half: number;
}

interface SlabArea {
	points: { x: number; z: number }[];
	holes: { minX: number; maxX: number; minZ: number; maxZ: number }[];
}

/** Answers "is a wall here held up?" for one foundation, level height and wall thickness. */
export interface WallSupport {
	/** Whether the whole of the wall from `a` to `b` (building-grid points) is held up. */
	segmentSupported(a: GridPointLike, b: GridPointLike): boolean;
	/** Whether every segment of a run of points (closed: back to the first) is held up. */
	runSupported(points: readonly GridPointLike[], closed: boolean): boolean;
}

const ALWAYS: WallSupport = { segmentSupported: () => true, runSupported: () => true };

/**
 * The supports under a new wall of `thickness` metres at `baseY` (foundation-local) on `building`.
 * `building` may be undefined (nothing built yet): then only the ground floor is allowed.
 */
export function wallSupportFor(
	building: FoundationBuildingDefinition | undefined,
	baseY: number,
	gridSize: number,
	thickness: number
): WallSupport {
	if (baseY <= GROUND_LEVEL_Y) return ALWAYS;
	const holdsUp = (top: number) =>
		top >= baseY - SUPPORT_BELOW_REACH && top <= baseY + SUPPORT_ABOVE_REACH;
	const toMetres = (p: GridPointLike) => ({ x: p.gridX * gridSize, z: p.gridZ * gridSize });

	const walls: Segment[] = [];
	for (const wall of building?.walls ?? []) {
		if (!holdsUp(wall.baseY + wall.height)) continue;
		walls.push({
			ax: wall.startGridX * gridSize,
			az: wall.startGridZ * gridSize,
			bx: wall.endGridX * gridSize,
			bz: wall.endGridZ * gridSize,
			half: wall.thickness / 2
		});
	}
	for (const path of building?.wallPaths ?? []) {
		if (!holdsUp(path.baseY + path.wallHeight)) continue;
		const count = path.closed ? path.points.length : path.points.length - 1;
		for (let i = 0; i < count; i++) {
			const a = toMetres(path.points[i]);
			const b = toMetres(path.points[(i + 1) % path.points.length]);
			walls.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, half: path.wallThickness / 2 });
		}
	}
	const slabs: SlabArea[] = (building?.slabs ?? [])
		.filter((slab: SlabDefinition) => holdsUp(slab.localY) && slab.points.length >= 3)
		.map((slab) => ({
			points: slab.points.map(toMetres),
			holes: (slab.openings ?? []).map((o) => ({
				minX: o.minGridX * gridSize,
				maxX: o.maxGridX * gridSize,
				minZ: o.minGridZ * gridSize,
				maxZ: o.maxGridZ * gridSize
			}))
		}));

	// The new wall may sit on a support's edge: its centre line within half its own thickness.
	const edge = thickness / 2 + 1e-6;
	const step = Math.max(0.02, gridSize / 2);

	const pointSupported = (x: number, z: number): boolean => {
		for (const w of walls) if (distanceToSegment(x, z, w) <= w.half + edge) return true;
		for (const slab of slabs) {
			const onSlab =
				insidePolygon(x, z, slab.points) || distanceToPolygonEdge(x, z, slab.points) <= edge;
			const overHole = slab.holes.some(
				(h) => x > h.minX + edge && x < h.maxX - edge && z > h.minZ + edge && z < h.maxZ - edge
			);
			if (onSlab && !overHole) return true;
		}
		return false;
	};

	const segmentSupported = (a: GridPointLike, b: GridPointLike): boolean => {
		const from = toMetres(a),
			to = toMetres(b);
		const length = Math.hypot(to.x - from.x, to.z - from.z);
		const samples = Math.max(1, Math.ceil(length / step));
		for (let i = 0; i <= samples; i++) {
			const k = i / samples;
			if (!pointSupported(from.x + (to.x - from.x) * k, from.z + (to.z - from.z) * k)) return false;
		}
		return true;
	};

	return {
		segmentSupported,
		runSupported(points, closed) {
			if (points.length === 1) return segmentSupported(points[0], points[0]);
			const count = closed ? points.length : points.length - 1;
			for (let i = 0; i < count; i++)
				if (!segmentSupported(points[i], points[(i + 1) % points.length])) return false;
			return true;
		}
	};
}

/** What the HUD says when a wall on an upper floor has nothing under it. */
export const UNSUPPORTED_WALL_REASON = 'Needs a ceiling, floor or wall below';

function distanceToSegment(x: number, z: number, s: Segment): number {
	const dx = s.bx - s.ax,
		dz = s.bz - s.az;
	const lengthSquared = dx * dx + dz * dz;
	const t =
		lengthSquared > 0
			? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / lengthSquared))
			: 0;
	return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
}

function insidePolygon(x: number, z: number, points: readonly { x: number; z: number }[]): boolean {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const a = points[i],
			b = points[j];
		if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
	}
	return inside;
}

function distanceToPolygonEdge(
	x: number,
	z: number,
	points: readonly { x: number; z: number }[]
): number {
	let best = Infinity;
	for (let i = 0; i < points.length; i++) {
		const a = points[i],
			b = points[(i + 1) % points.length];
		best = Math.min(best, distanceToSegment(x, z, { ax: a.x, az: a.z, bx: b.x, bz: b.z, half: 0 }));
	}
	return best;
}
