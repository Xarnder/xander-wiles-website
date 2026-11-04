/**
 * Seed pellets fired from a carried creature's mouth: flight, hit tests and the charge budget.
 * Shared by the browser and the multiplayer room, so keep it free of Three.js and DOM imports.
 * Time is always passed in; charges are derived from timestamps (like health regeneration), so
 * neither side needs timers to agree.
 *
 * Plan: docs/2026/11-04/range-weapons (Q9–Q12).
 */

/** Launch speed, m/s (Q11). */
export const PROJECTILE_SPEED = 35;
/** Downward acceleration, m/s²: a light arc, a quarter of normal gravity (Q11). */
export const PROJECTILE_GRAVITY = 4;
/** Pellet collision radius, metres. */
export const PROJECTILE_RADIUS = 0.12;
/** Pellets are removed after this much flight, metres (Q12). */
export const PROJECTILE_MAX_RANGE = 30;
/** …or this long, whichever comes first, ms. */
export const PROJECTILE_MAX_LIFETIME_MS = 1200;
/** Health points one hit takes (Q9): 12 hits from full. */
export const PROJECTILE_DAMAGE = 3;
/** Charges per carry (Q10). */
export const CHARGES_MAX = 5;
/** One charge comes back this often, ms (Q10). */
export const CHARGE_REGEN_MS = 1500;
/** Minimum time between two shots, ms (Q10). */
export const MIN_SHOT_GAP_MS = 350;
/** Player body radius for pellet hits: generous on purpose, with no aim assist (Q26). */
export const BODY_HIT_RADIUS = 0.45;
/** Body capsule height above the feet, metres. */
export const BODY_HIT_HEIGHT = 1.8;

export interface Vec3Like {
	x: number;
	y: number;
	z: number;
}

/** Where a pellet is `tMs` after leaving `origin` along unit `dir`. Closed form: no drift. */
export function projectilePositionAt(
	origin: Vec3Like,
	dir: Vec3Like,
	tMs: number,
	out: Vec3Like = { x: 0, y: 0, z: 0 }
): Vec3Like {
	const t = Math.max(0, tMs) / 1000;
	out.x = origin.x + dir.x * PROJECTILE_SPEED * t;
	out.y = origin.y + dir.y * PROJECTILE_SPEED * t - 0.5 * PROJECTILE_GRAVITY * t * t;
	out.z = origin.z + dir.z * PROJECTILE_SPEED * t;
	return out;
}

/** Distance travelled along the launch direction after `tMs` (the arc adds a little). */
export function projectileDistanceAt(tMs: number): number {
	return (PROJECTILE_SPEED * Math.max(0, tMs)) / 1000;
}

/** How long a pellet flies before it's removed, ms. */
export function projectileLifetimeMs(): number {
	return Math.min(PROJECTILE_MAX_LIFETIME_MS, (PROJECTILE_MAX_RANGE / PROJECTILE_SPEED) * 1000);
}

/** Squared distance from point p to segment ab. */
function segmentPointDistanceSq(a: Vec3Like, b: Vec3Like, p: Vec3Like): number {
	const abx = b.x - a.x,
		aby = b.y - a.y,
		abz = b.z - a.z;
	const len = abx * abx + aby * aby + abz * abz;
	let t = len > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len : 0;
	t = Math.max(0, Math.min(1, t));
	const dx = a.x + abx * t - p.x,
		dy = a.y + aby * t - p.y,
		dz = a.z + abz * t - p.z;
	return dx * dx + dy * dy + dz * dz;
}

/**
 * Does the pellet's path between `t0Ms` and `t1Ms` pass through the body capsule standing on
 * `feet`? Sampled every few centimetres of flight, so even a 15 fps step can't tunnel through a
 * body. Returns the first time (ms) it touches, or null.
 */
export function sweepBody(
	origin: Vec3Like,
	dir: Vec3Like,
	t0Ms: number,
	t1Ms: number,
	feet: Vec3Like,
	bodyRadius = BODY_HIT_RADIUS,
	bodyHeight = BODY_HIT_HEIGHT
): number | null {
	if (t1Ms <= t0Ms) return null;
	const reach = bodyRadius + PROJECTILE_RADIUS;
	const bottom = { x: feet.x, y: feet.y + reach * 0.5, z: feet.z };
	const top = { x: feet.x, y: feet.y + bodyHeight - reach * 0.5, z: feet.z };
	const step = (0.1 / PROJECTILE_SPEED) * 1000; // 10 cm of flight
	const a = { x: 0, y: 0, z: 0 };
	for (let t = t0Ms; ; t = Math.min(t1Ms, t + step)) {
		projectilePositionAt(origin, dir, t, a);
		const closest = Math.max(bottom.y, Math.min(top.y, a.y));
		const dx = a.x - feet.x,
			dy = a.y - closest,
			dz = a.z - feet.z;
		if (dx * dx + dy * dy + dz * dz <= reach * reach) return t;
		if (t >= t1Ms) return null;
	}
}

// ------------------------------------------------------------------------- the room's checks

/** How far a pellet may leave from the shooter's last known eye, metres (muzzle offset + lag). */
const ROOM_ORIGIN_SLACK = 3.5;
/** The room accepts a hit whose path point was this far (horizontally) from the target's feet. */
const ROOM_HIT_SLACK = 3;
/** …and within this band of heights around the target's body. */
const ROOM_HIT_HEIGHT_SLACK = 1.5;
/** The room forgives this much timing error in the shot gap and charge refills, ms. */
export const ROOM_SHOT_TIMING_SLACK_MS = 60;
/**
 * Hits are checked against where the target was over this window before the hit (lag
 * compensation): the shooter sees other players one interpolation delay in the past.
 */
export const ROOM_HIT_REWIND_MS = 800;
/** A shot's `at` may be this far from the room clock, ms. */
export const ROOM_SHOT_CLOCK_SLACK_MS = 1000;
/** A hit may be reported this long after the pellet's lifetime ends (lag), ms. */
const ROOM_HIT_LATE_MS = 400;

/** Eye height used to check a shot's origin against a feet-position pose. */
const ROOM_EYE_HEIGHT = 1.6;

/**
 * Could the pellet have left from here? `pose` is the shooter's last accepted pose (feet).
 * Generous: first-person muzzles sit below and beside the eye, and poses lag a little.
 */
export function shotOriginPlausible(pose: Vec3Like, origin: Vec3Like): boolean {
	return (
		Math.hypot(origin.x - pose.x, origin.y - (pose.y + ROOM_EYE_HEIGHT), origin.z - pose.z) <=
		ROOM_ORIGIN_SLACK
	);
}

/**
 * Could the pellet fired from `origin` along `dir` at `firedAt` have met a player standing at
 * `target` (feet, last accepted pose) at `hitAt`? The room has no walls, so this only checks that
 * the path and the body were close at that moment (ranged weapons Q13, Q14).
 */
export function shotHitPlausible(
	shot: { origin: Vec3Like; dir: Vec3Like; firedAt: number },
	target: Vec3Like,
	hitAt: number
): boolean {
	const flight = hitAt - shot.firedAt;
	if (!(flight >= 0) || flight > projectileLifetimeMs() + ROOM_HIT_LATE_MS) return false;
	const p = projectilePositionAt(shot.origin, shot.dir, Math.min(flight, projectileLifetimeMs()));
	if (Math.hypot(p.x - target.x, p.z - target.z) > BODY_HIT_RADIUS + ROOM_HIT_SLACK) return false;
	return (
		p.y >= target.y - ROOM_HIT_HEIGHT_SLACK &&
		p.y <= target.y + BODY_HIT_HEIGHT + ROOM_HIT_HEIGHT_SLACK
	);
}

/** Whether `point` lies within `slack` metres of the straight segment from a to b (for the room). */
export function nearSegment(a: Vec3Like, b: Vec3Like, point: Vec3Like, slack: number): boolean {
	return segmentPointDistanceSq(a, b, point) <= slack * slack;
}

// ---------------------------------------------------------------------------------------- charges

/** Charges at `at`, plus when the last shot was fired. Regeneration is derived, never ticked. */
export interface ChargeState {
	/** Whole charges at `at`. */
	base: number;
	/** Clock time `base` was recorded (ms). */
	at: number;
	/** Clock time of the last shot (ms). */
	lastShotAt: number;
}

/** A fresh carry: full charges. */
export function createChargeState(now: number): ChargeState {
	return { base: CHARGES_MAX, at: now, lastShotAt: Number.NEGATIVE_INFINITY };
}

/** Whole charges available at `now`. */
export function chargesAt(state: ChargeState, now: number): number {
	if (state.base >= CHARGES_MAX) return CHARGES_MAX;
	const regained = Math.floor(Math.max(0, now - state.at) / CHARGE_REGEN_MS);
	return Math.min(CHARGES_MAX, state.base + regained);
}

/** Milliseconds until the next charge comes back (0 when full). */
export function nextChargeInMs(state: ChargeState, now: number): number {
	if (chargesAt(state, now) >= CHARGES_MAX) return 0;
	const elapsed = Math.max(0, now - state.at) % CHARGE_REGEN_MS;
	return CHARGE_REGEN_MS - elapsed;
}

/**
 * Whether a shot may be fired at `now`. `slackMs` forgives that much timing error (the room uses
 * it: the shooter's clock estimate can shift a few ms between two shots).
 */
export function canSpendCharge(state: ChargeState, now: number, slackMs = 0): boolean {
	return (
		chargesAt(state, now + slackMs) >= 1 && now - state.lastShotAt >= MIN_SHOT_GAP_MS - slackMs
	);
}

/**
 * Spends one charge at `now`, or returns null when none is ready. Regeneration keeps its phase:
 * the time already counted toward the next charge isn't thrown away.
 */
export function spendCharge(state: ChargeState, now: number, slackMs = 0): ChargeState | null {
	if (!canSpendCharge(state, now, slackMs)) return null;
	// Regeneration is judged `slackMs` late; the forgiveness never accumulates past one shot.
	const t = now + slackMs;
	const available = chargesAt(state, t);
	if (available >= CHARGES_MAX) return { base: CHARGES_MAX - 1, at: now, lastShotAt: now };
	const regained = Math.floor(Math.max(0, t - state.at) / CHARGE_REGEN_MS);
	return {
		base: available - 1,
		at: state.at + regained * CHARGE_REGEN_MS,
		lastShotAt: now
	};
}
