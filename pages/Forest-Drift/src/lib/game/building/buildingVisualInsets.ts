/**
 * Visual-only vertical separations so a wall top, its timber cap, and a slab sitting on that
 * storey never share a plane (depth fighting). Collision and authored `wallHeight` / `slab.localY`
 * stay exact.
 *
 * Looking down, the order is slab (authored Y) > frame beam > wall body. Posts stop inside the
 * beam so their top faces are hidden in the timber instead of sitting on the beam underside.
 */

const EPS = 1e-6;

/** How far a wall body's top sits below the authored wall height. */
export const WALL_TOP_VISUAL_INSET = 0.008;

/** How far a frame beam's top sits below the authored wall height (still above the wall body). */
export const FRAME_TOP_VISUAL_INSET = 0.003;

/** How far a post continues into the beam so the post top is not coplanar with the beam underside. */
export const FRAME_POST_INTO_BEAM = 0.02;

/** How far a frame beam continues past each wall end so its end face is not coplanar with the wall's. */
export const FRAME_BEAM_END_OVERHANG = 0.02;

export function visualSegmentTopY(segmentMaxY: number, authoredWallHeight: number): number {
	if (Math.abs(segmentMaxY - authoredWallHeight) <= EPS) {
		return authoredWallHeight - WALL_TOP_VISUAL_INSET;
	}
	return segmentMaxY;
}

export function frameBeamTopY(authoredTopY: number): number {
	return authoredTopY - FRAME_TOP_VISUAL_INSET;
}

export function framePostTopY(beamBottomY: number, beamHeight: number): number {
	const overlap = Math.min(FRAME_POST_INTO_BEAM, Math.max(0, beamHeight * 0.5));
	return beamBottomY + overlap;
}

/**
 * How far a wall's collision top sits below the authored wall height so that a floor (slab)
 * placed on the storey above is never blocked by the wall below.
 * Slabs sit at the authored storey height (with thickness typically 0.2m below); setting this
 * to 0.1m (10cm) ensures the collision top sits well below the floor surface above (so walking
 * over it on the upper floor is completely unobstructed) while staying safely inside the
 * slab/ceiling structure from below so rooms below remain fully enclosed.
 */
export const WALL_COLLISION_TOP_INSET = 0.1;

export function collisionSegmentMaxY(segmentMaxY: number, authoredWallHeight: number): number {
	if (segmentMaxY >= authoredWallHeight - 1e-4) {
		return Math.max(0.1, authoredWallHeight - WALL_COLLISION_TOP_INSET);
	}
	return segmentMaxY;
}
