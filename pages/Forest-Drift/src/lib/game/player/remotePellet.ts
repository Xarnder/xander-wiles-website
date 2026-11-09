/**
 * Drawing another player's pellet from the moment its one `shot` message arrives, whole: it starts
 * at the mouth of the creature this player sees them holding, then catches up with the true arc
 * over a short window, so it lands where and when it really does. Without this, a pellet arriving
 * 100–250 ms late was drawn from part-way along its path, ahead of the shooter as drawn here.
 * Pure, so it's unit-tested.
 *
 * Plan: docs/2026/11-09/remote-projectiles/plan.md §4.2.
 */

/** Rollback switch: false draws remote pellets from their true age, as before. */
export const REMOTE_PELLET_CATCH_UP = true;
/** How long the catch-up takes, ms. */
export const REMOTE_CATCH_UP_MS = 150;

const smooth = (t: number) => {
	const x = Math.min(1, Math.max(0, t));
	return x * x * (3 - 2 * x);
};

/**
 * How far along its flight (ms) to draw a pellet `sinceArrivalMs` after it arrived `ageMs` old:
 * 0 on arrival, speeding up smoothly to its true age (`ageMs + sinceArrivalMs`) by the end of the
 * catch-up, and only ever moving forward.
 */
export function remoteFlightMs(ageMs: number, sinceArrivalMs: number): number {
	const since = Math.max(0, sinceArrivalMs);
	const age = Math.max(0, ageMs);
	if (!REMOTE_PELLET_CATCH_UP) return age + since;
	return since + age * smooth(since / REMOTE_CATCH_UP_MS);
}

/**
 * How much of the gap between the drawn mouth and the true start point is still added, 1 on
 * arrival fading smoothly to 0 by the end of the catch-up.
 */
export function remoteOffsetWeight(sinceArrivalMs: number): number {
	if (!REMOTE_PELLET_CATCH_UP) return 0;
	return 1 - smooth(Math.max(0, sinceArrivalMs) / REMOTE_CATCH_UP_MS);
}
