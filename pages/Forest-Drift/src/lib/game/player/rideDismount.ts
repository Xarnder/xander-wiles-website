/**
 * Where a rider lands when they get off (Q9 A): on safe ground beside the creature, its right side
 * first (both seats are on or toward the right, Q5), then the left, the front and the back, then
 * further out all round. Pure: the caller says which spots are safe.
 *
 * Plan: docs/2026/11-07/bipedal-speed-creature/feature-plan/02-technical-plan.md §3.8.
 */

export interface DismountQuery {
	/** The creature's centre and heading (`atan2(x, z)`, creature convention). */
	x: number;
	z: number;
	heading: number;
	/** Its footprint radius, metres. */
	radius: number;
	/** Always safe: where the rider stood before climbing on. */
	fallback: { x: number; z: number };
}

/** Gap between the creature's side and the rider's body, metres. */
const SIDE_GAP = 0.6;
/** The outer ring of last-chance spots, as a multiple of the creature's radius. */
const OUTER_RING = 1.5;

/** Spots to try, best first. */
export function dismountCandidates(query: DismountQuery): { x: number; z: number }[] {
	const near = query.radius + SIDE_GAP;
	const far = query.radius * OUTER_RING + SIDE_GAP;
	// Forward is (sin h, cos h); the creature's right is (-cos h, sin h).
	const around = (angle: number, distance: number) => ({
		x: query.x + Math.sin(query.heading + angle) * distance,
		z: query.z + Math.cos(query.heading + angle) * distance
	});
	const right = -Math.PI / 2;
	const preferred = [right, -right, 0, Math.PI].map((angle) => around(angle, near));
	const ring = Array.from({ length: 8 }, (_, i) => around(right + (i * Math.PI) / 4, far));
	return [...preferred, ...ring];
}

/** The first safe candidate, or the fallback spot. */
export function chooseDismountSpot(
	query: DismountQuery,
	safe: (x: number, z: number) => boolean
): { x: number; z: number } {
	for (const spot of dismountCandidates(query)) if (safe(spot.x, spot.z)) return spot;
	return { ...query.fallback };
}
