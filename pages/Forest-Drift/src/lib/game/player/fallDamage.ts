import { HEALTH_MAX } from './PlayerHealth';

/**
 * Fall damage curve, shared by the browser and the multiplayer room. Distance is measured from the
 * highest point reached while airborne to where the feet land (gravity is 18 m/s² with no drag, so
 * this is equivalent to landing speed). A flat jump peaks at about 1.36 m and a storey is 3 m.
 */
export const FALL_SAFE_DISTANCE = 4;
export const FALL_SEGMENTS_PER_METRE = 2;
/** Landing in water at least this deep cancels the damage. */
export const FALL_WATER_CANCEL_DEPTH = 1;
/** Reports above this are nonsense; the room ignores them. */
export const FALL_REPORT_MAX_DISTANCE = 2000;

/** Whole points lost for a fall of `distance` metres: 0 up to 4 m, then 2 per metre, rounded up. */
export function fallDamageSegments(distance: number): number {
	if (!Number.isFinite(distance)) return 0;
	const excess = distance - FALL_SAFE_DISTANCE;
	// Tolerance so float noise on an exactly-4 m drop is not a point of damage.
	if (excess <= 1e-6) return 0;
	return Math.min(HEALTH_MAX, Math.ceil(excess * FALL_SEGMENTS_PER_METRE - 1e-9));
}
