/**
 * Fast travel's rules, without Three.js or the DOM (plan: docs/2026/11-16/Fast-Travel/feature-plan/
 * 02-technical-plan.md). The scene does the jump itself (`ThreeScene.fastTravel`); this module
 * decides whether a trip is allowed, where it lands, and remembers where the last one started for
 * **Go back**.
 */

/**
 * Release switch (plan §12): off for everyone with the build constant, or for one session with
 * `?fastTravel=off`. Off hides the map's pin and buttons and the pause menu's Go back.
 */
export const FAST_TRAVEL_AVAILABLE = true;
let switchedOff = false;
export function readFastTravelSwitch(search: string): void {
	switchedOff = new URLSearchParams(search).get('fastTravel') === 'off';
}
export const fastTravelAvailable = () => FAST_TRAVEL_AVAILABLE && !switchedOff;

/** Why a trip can't happen right now. */
export type TravelRefusal =
	/** Knocked out: the death card is showing (Q2). */
	| 'knockedOut'
	/** Another trip is still on its way (online: waiting for the room). */
	| 'busy'
	/** Climbing onto or off a creature: wait until you're seated or standing. */
	| 'mounting'
	/** Online: the owner turned fast travel off for everyone else (Q3). */
	| 'ruleOff'
	/** Online: not joined yet, or the connection dropped. */
	| 'connecting'
	/** Online: the room said no (it may know something this client doesn't). */
	| 'refused';

export type TravelPermission = { ok: true } | { ok: false; reason: TravelRefusal };

/** What the Travel button says when it's disabled. */
export const TRAVEL_REFUSAL_TEXT: Record<TravelRefusal, string> = {
	knockedOut: "You're knocked out",
	busy: 'Travelling…',
	mounting: 'Wait until you’re seated',
	ruleOff: 'The owner has turned off fast travel',
	connecting: 'Connecting…',
	refused: 'Fast travel was refused'
};

/** What the scene knows about the player when deciding. */
export interface TravelState {
	knockedOut: boolean;
	travelling: boolean;
	/** Mid-climb on or off a creature (not seated, not standing). */
	mounting: boolean;
	/** Online only; undefined when playing alone. */
	online?: {
		connected: boolean;
		owner: boolean;
		/** The owner's rule (`env.rules.fastTravel`), true by default. */
		ruleOn: boolean;
	};
}

export function travelPermission(state: TravelState): TravelPermission {
	if (state.knockedOut) return { ok: false, reason: 'knockedOut' };
	if (state.travelling) return { ok: false, reason: 'busy' };
	if (state.mounting) return { ok: false, reason: 'mounting' };
	const online = state.online;
	if (online) {
		if (!online.owner && !online.ruleOn) return { ok: false, reason: 'ruleOff' };
		if (!online.connected) return { ok: false, reason: 'connecting' };
	}
	return { ok: true };
}

// ------------------------------------------------------------------ landing

/** Rings of the dry-ground search: every 14 m out to 196 m, 12 points each (as respawning was). */
export const LANDING_RINGS = 14;
export const LANDING_RING_STEP = 14;
export const LANDING_RING_POINTS = 12;
/** The readout warns when the landing is further than this from the pin. */
export const LANDING_NOTE_DISTANCE = 10;

export interface LandingWater {
	/** Feet would be in deep water here (you couldn't stand). */
	deep(x: number, z: number): boolean;
	/** Shallow enough to count as shore for the ring search. */
	dry(x: number, z: number): boolean;
}

export interface Landing {
	x: number;
	z: number;
	/** Moved off the pin to the nearest dry ground. */
	moved: boolean;
}

/**
 * Where a trip to (x, z) lands: the pin itself unless it's in deep water, otherwise the first dry
 * point walking rings outward. Past the last ring it stays on the pin (you land in the water, as
 * respawning always has).
 */
export function findLanding(x: number, z: number, water: LandingWater): Landing {
	if (!water.deep(x, z)) return { x, z, moved: false };
	for (let ring = 1; ring <= LANDING_RINGS; ring++) {
		const radius = ring * LANDING_RING_STEP;
		for (let i = 0; i < LANDING_RING_POINTS; i++) {
			const angle = (i / LANDING_RING_POINTS) * Math.PI * 2 + ring * 0.4;
			const sx = x + Math.cos(angle) * radius;
			const sz = z + Math.sin(angle) * radius;
			if (water.dry(sx, sz)) return { x: sx, z: sz, moved: true };
		}
	}
	return { x, z, moved: false };
}

/** "Lands on the shore" when the landing is noticeably away from the pin; null otherwise. */
export function landingNote(pin: { x: number; z: number }, landing: Landing): string | null {
	if (!landing.moved) return null;
	const off = Math.hypot(landing.x - pin.x, landing.z - pin.z);
	return off > LANDING_NOTE_DISTANCE ? 'Lands on the shore' : null;
}

// ------------------------------------------------------------------ Go back

/** Where a trip started: the eye position, view and flight, exactly as they were. */
export interface TravelOrigin {
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
	flying: boolean;
}

/**
 * Remembers where the last trip started (Q6). Only the last trip; the scene clears it when the
 * world changes. Going back is itself a trip, so it remembers where *it* started: pressing Go back
 * twice returns to where the first trip landed.
 */
export class TravelMemory {
	private origin: TravelOrigin | null = null;

	get last(): TravelOrigin | null {
		return this.origin;
	}

	remember(origin: TravelOrigin): void {
		if (![origin.x, origin.y, origin.z, origin.yaw, origin.pitch].every(Number.isFinite)) return;
		this.origin = { ...origin };
	}

	clear(): void {
		this.origin = null;
	}
}

/** What a trip did, for the UI and tests. */
export type TravelOutcome =
	| {
			ok: true;
			/** Feet position where the player arrived. */
			x: number;
			y: number;
			z: number;
			moved: boolean;
			/** Kept carrying / riding (Q4). */
			carrying: boolean;
			riding: boolean;
			/** Milliseconds the jump took on the main thread (the cut's hitch, before the next frame). */
			ms: number;
	  }
	| { ok: false; reason: TravelRefusal };
