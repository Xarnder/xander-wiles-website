/**
 * Player-vs-wall collision, expressed purely in terms of the same solid rectangles
 * (wallGeometryMath.computeSolidWallSegments) used to build wall geometry — see the README for why
 * this must never be a separate, potentially-inconsistent collision shape. Pure/Three.js-free so
 * it's directly unit-testable; WallManager is the one place that turns solid segments + a wall's
 * WallTransform into the world-space rects consumed here.
 */

/** One solid wall segment's collision footprint in world space — an oriented rectangle (the wall's thickness axis) extruded over a vertical Y range. */
export interface WallCollisionRect {
	centerX: number;
	centerZ: number;
	halfLength: number;
	halfThickness: number;
	/** Direction the rectangle's "length" axis points in world X/Z — see wallGeometryMath.WallTransform. */
	dirX: number;
	dirZ: number;
	minWorldY: number;
	maxWorldY: number;
}

/**
 * Resolves a circle (in a rectangle's own local U/T axes, U along its length, T along its
 * thickness) against that rectangle. Returns the pushed-out (u, t) if the circle overlaps, or
 * `null` if there's no collision. A circle whose center already lies inside the rectangle (the
 * `dist === 0` branch — e.g. a spawn point) escapes along whichever axis has the shallower
 * penetration, since that's the cheapest way out for a thin wall.
 */
export function resolveCircleAgainstLocalRect(
	u: number,
	t: number,
	radius: number,
	halfLength: number,
	halfThickness: number
): { u: number; t: number } | null {
	const clampedU = Math.max(-halfLength, Math.min(halfLength, u));
	const clampedT = Math.max(-halfThickness, Math.min(halfThickness, t));
	const dx = u - clampedU;
	const dt = t - clampedT;
	const dist = Math.hypot(dx, dt);

	if (dist > 0) {
		if (dist >= radius) return null;
		const nx = dx / dist;
		const nt = dt / dist;
		return { u: clampedU + nx * radius, t: clampedT + nt * radius };
	}

	// Circle center is exactly on/inside the rectangle (dist === 0 from the clamp) — push out along
	// whichever axis has the shallower penetration.
	const penetrationU = halfLength - Math.abs(u);
	const penetrationT = halfThickness - Math.abs(t);
	if (penetrationT <= penetrationU) {
		return { u, t: t >= 0 ? halfThickness + radius : -(halfThickness + radius) };
	}
	return { u: u >= 0 ? halfLength + radius : -(halfLength + radius), t };
}

/**
 * Resolves a player's proposed horizontal position against every nearby wall collision rect,
 * treating the player as a vertical capsule approximated in the horizontal plane by a circle of
 * `radius`. Rects whose vertical range doesn't overlap [feetY, headY] are skipped entirely — this
 * is what lets the player walk through a door opening (no solid segment exists there at all) while
 * still being blocked by solid wall above/beside it.
 */
export function resolvePlayerPositionAgainstWalls(
	x: number,
	z: number,
	feetY: number,
	headY: number,
	radius: number,
	rects: readonly WallCollisionRect[]
): { x: number; z: number } {
	let px = x;
	let pz = z;

	// A few passes so pushing out of one rect (e.g. near a corner) doesn't immediately re-overlap
	// another — standard iterative resolution for a small number of static obstacles.
	for (let pass = 0; pass < 3; pass++) {
		for (const rect of rects) {
			if (headY <= rect.minWorldY || feetY >= rect.maxWorldY) continue;

			const relX = px - rect.centerX;
			const relZ = pz - rect.centerZ;
			const perpX = -rect.dirZ;
			const perpZ = rect.dirX;
			const u = relX * rect.dirX + relZ * rect.dirZ;
			const t = relX * perpX + relZ * perpZ;

			const resolved = resolveCircleAgainstLocalRect(
				u,
				t,
				radius,
				rect.halfLength,
				rect.halfThickness
			);
			if (!resolved) continue;

			px = rect.centerX + rect.dirX * resolved.u + perpX * resolved.t;
			pz = rect.centerZ + rect.dirZ * resolved.u + perpZ * resolved.t;
		}
	}

	return { x: px, z: pz };
}
