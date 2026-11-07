/**
 * Where a pellet's path meets the world (ranged weapons), using only the collision data the player
 * already walks against: wall-style rectangles (walls, doors, stairs, furniture, fences, Mini
 * Builds) and the building surface heights (terrain, foundations, floors, ceilings, roofs). No
 * extra geometry. Pure, so it's unit-tested.
 *
 * The path is walked in short steps, and each step is tested as a segment, not a point: a steep
 * shot can't skip over a floor or ceiling between two samples, so you can take cover behind walls
 * and below or above floors and ceilings.
 */
import type { WallCollisionRect } from '../building/wallCollision';
import type { Vec3Like } from './creatureProjectile';

/** The world as a pellet sees it (`WorldSurfaceSampler` plus the collision rectangles). */
export interface ProjectileWorld {
	/** Highest walkable surface at (x, z) not above `referenceY` (terrain and foundations always). */
	supportingSurfaceY(x: number, z: number, referenceY: number): number;
	/** Lowest ceiling or roof underside crossed going up from `fromY` to `toY`, or null. */
	ceilingBlockY(x: number, z: number, fromY: number, toY: number): number | null;
	/** Whether `y` is inside a floor, ceiling or roof slab at (x, z). */
	insideSlab(x: number, z: number, y: number): boolean;
	/** Solid rectangles (any number: those far from the path are skipped). */
	rects(): readonly WallCollisionRect[];
}

/** Path step, metres: well under any wall's thickness plus the margin, so none is skipped. */
export const PROJECTILE_STEP = 0.2;
/** A pellet's own size, metres: it stops this close to a rectangle. */
const RECT_MARGIN = 0.06;

/** The first solid point on the segment `from` → `to`, or null when it's clear. */
export function projectileWorldHit(
	from: Vec3Like,
	to: Vec3Like,
	world: ProjectileWorld
): Vec3Like | null {
	const dx = to.x - from.x,
		dy = to.y - from.y,
		dz = to.z - from.z;
	const length = Math.hypot(dx, dy, dz);
	const steps = Math.max(1, Math.ceil(length / PROJECTILE_STEP));
	const reach = RECT_MARGIN + 1;
	const rects = world
		.rects()
		.filter(
			(r) =>
				r.centerX + r.halfLength + r.halfThickness + reach >= Math.min(from.x, to.x) &&
				r.centerX - r.halfLength - r.halfThickness - reach <= Math.max(from.x, to.x) &&
				r.centerZ + r.halfLength + r.halfThickness + reach >= Math.min(from.z, to.z) &&
				r.centerZ - r.halfLength - r.halfThickness - reach <= Math.max(from.z, to.z)
		);
	let previousY = from.y;
	for (let i = 1; i <= steps; i++) {
		const k = i / steps;
		const x = from.x + dx * k,
			y = from.y + dy * k,
			z = from.z + dz * k;
		// Down through terrain, a foundation, a floor or a roof: the surface under where this step
		// started is now above the pellet.
		const below = world.supportingSurfaceY(x, z, previousY);
		if (below >= y) return { x, y: below, z };
		// Up through a ceiling or a roof from underneath.
		const ceiling = world.ceilingBlockY(x, z, previousY, y);
		if (ceiling !== null) return { x, y: ceiling, z };
		// Sideways into the edge of a floor or roof.
		if (world.insideSlab(x, z, y)) return { x, y, z };
		for (const r of rects) {
			if (y < r.minWorldY || y > r.maxWorldY) continue;
			const ox = x - r.centerX,
				oz = z - r.centerZ;
			const u = ox * r.dirX + oz * r.dirZ;
			const v = -ox * r.dirZ + oz * r.dirX;
			if (Math.abs(u) <= r.halfLength + RECT_MARGIN && Math.abs(v) <= r.halfThickness + RECT_MARGIN)
				return { x, y, z };
		}
		previousY = y;
	}
	return null;
}
