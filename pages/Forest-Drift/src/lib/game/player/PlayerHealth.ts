/**
 * Player health rules, shared by the browser and the multiplayer room (RoomCore runs inside the
 * Cloudflare Worker). Keep this module free of Three.js, DOM and Svelte imports.
 *
 * Health is plain state plus pure functions, and time is always passed in: regeneration is
 * derived from `lastDamageAt`, so neither side needs timers or per-point messages to agree.
 */

/** Kill switch: false hides the bar and stops all damage, leaving saved values untouched. */
export const PLAYER_HEALTH_ENABLED = true;

/** One bar segment per point. */
export const HEALTH_MAX = 36;
/** At or below this the bar shows its low-health state (25%). */
export const HEALTH_LOW = 9;
/** Quiet time after the last hit before regeneration starts. */
export const REGEN_DELAY_MS = 8000;
/** One point back per interval once regeneration has started. */
export const REGEN_INTERVAL_MS = 3000;
/** No damage from any source this long after loading, joining or respawning. */
export const HEALTH_GRACE_MS = 2000;
/** A knocked-out player lies on the floor this long before they can respawn. */
export const RESPAWN_DELAY_MS = 3000;

/** Everything that can hurt a player. `by` is the slot of the player who threw the punch. */
export type DamageSource = { kind: 'fall'; distance: number } | { kind: 'player'; by: number };
export type DamageKind = DamageSource['kind'];

export interface HealthState {
	/** Whole points at `lastDamageAt`; regeneration is added on top of this. */
	base: number;
	/** Clock time (ms) of the last hit, or of the load/join/respawn that set `base`. */
	lastDamageAt: number;
	/** Damage is ignored before this clock time (ms). */
	graceUntil: number;
	dead: boolean;
}

export interface HealthSnapshot {
	current: number;
	max: number;
	dead: boolean;
	low: boolean;
}

function clampPoints(value: number): number {
	return Math.max(0, Math.min(HEALTH_MAX, Math.round(value)));
}

/** Full health (or `points`) with the standard grace period starting at `now`. */
export function createHealthState(now: number, points = HEALTH_MAX): HealthState {
	return {
		base: clampPoints(points),
		lastDamageAt: now,
		graceUntil: now + HEALTH_GRACE_MS,
		dead: false
	};
}

/** Points the player has at `now`, regeneration included. */
export function healthAt(state: HealthState, now: number): number {
	if (state.dead) return 0;
	if (state.base >= HEALTH_MAX) return HEALTH_MAX;
	const regained = Math.floor((now - state.lastDamageAt - REGEN_DELAY_MS) / REGEN_INTERVAL_MS);
	return Math.min(HEALTH_MAX, state.base + Math.max(0, regained));
}

export function isInGrace(state: HealthState, now: number): boolean {
	return now < state.graceUntil;
}

/**
 * Applies `amount` whole points of damage. Ignored while dead or in grace. Returns the new state and
 * how many points were actually taken.
 */
export function damageHealth(
	state: HealthState,
	amount: number,
	now: number
): { state: HealthState; applied: number } {
	const points = Number.isFinite(amount) ? Math.floor(amount) : 0;
	if (points <= 0 || state.dead || isInGrace(state, now)) return { state, applied: 0 };
	const before = healthAt(state, now);
	const after = Math.max(0, before - points);
	return {
		state: { base: after, lastDamageAt: now, graceUntil: state.graceUntil, dead: after === 0 },
		applied: before - after
	};
}

/** Dead for at least the respawn delay (the hit that knocked them out set `lastDamageAt`). */
export function canRespawn(state: HealthState, now: number, slackMs = 0): boolean {
	return state.dead && now >= state.lastDamageAt + RESPAWN_DELAY_MS - slackMs;
}

/** Back to full after death, with a fresh grace period. */
export function reviveHealth(now: number): HealthState {
	return createHealthState(now);
}

/**
 * Rebuilds health from a saved value. Missing or malformed values mean full health, and so does 0:
 * a saved death must never load the player straight back into one.
 */
export function restoreHealth(raw: unknown, now: number): HealthState {
	if (typeof raw !== 'number' || !Number.isFinite(raw)) return createHealthState(now);
	const points = clampPoints(raw);
	return createHealthState(now, points === 0 ? HEALTH_MAX : points);
}

/** A saved value for the world file: whole points, never 0 (see restoreHealth). */
export function savedHealthValue(raw: unknown): number | undefined {
	if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
	const points = clampPoints(raw);
	return points === 0 ? HEALTH_MAX : points;
}

export function healthSnapshot(state: HealthState, now: number): HealthSnapshot {
	const current = healthAt(state, now);
	return { current, max: HEALTH_MAX, dead: state.dead, low: !state.dead && current <= HEALTH_LOW };
}

export function sameHealthSnapshot(a: HealthSnapshot, b: HealthSnapshot): boolean {
	return a.current === b.current && a.dead === b.dead && a.low === b.low && a.max === b.max;
}
