/**
 * What `K` (or the touch creature button) does when carrying and riding can both be in play, and
 * the one prompt that describes it. Pure, so every case is unit-tested.
 *
 * Plan: docs/2026/11-07/bipedal-speed-creature (Q8 A, Q12 C, F1, F2; table in
 * 01-questions-and-decisions.md).
 */

export type CreatureKeyAction =
	/** Pick up the small creature under the crosshair (also from a mount, F2). */
	| 'pickUp'
	/** Put the carried creature down (on foot only, F1). */
	| 'putDown'
	/** Climb onto the biped under the crosshair (also while carrying, F2). */
	| 'mount'
	/** Get off the creature being ridden, keeping anything carried (F1). */
	| 'dismount'
	/** A seat or door under the crosshair owns the key. */
	| 'other'
	/** Nothing to do. */
	| 'none';

export interface CreatureKeyState {
	riding: boolean;
	carrying: boolean;
	seatOrDoorTargeted: boolean;
	/** Distance along the look ray to the rideable creature in reach, or null. */
	rideTarget: number | null;
	/** Distance along the look ray to the carryable creature in reach, or null. */
	carryTarget: number | null;
}

export function routeCreatureKey(state: CreatureKeyState): CreatureKeyAction {
	if (state.riding) return !state.carrying && state.carryTarget !== null ? 'pickUp' : 'dismount';
	if (state.carrying) return state.rideTarget !== null ? 'mount' : 'putDown';
	if (state.seatOrDoorTargeted) return 'other';
	if (
		state.rideTarget !== null &&
		(state.carryTarget === null || state.rideTarget <= state.carryTarget)
	)
		return 'mount';
	return state.carryTarget !== null ? 'pickUp' : 'none';
}

/** What the HUD and the touch button show for the creature key. */
export interface CreaturePrompt {
	action: Exclude<CreatureKeyAction, 'other' | 'none'> | 'waiting';
	label: string;
	/** Short text for the touch button. */
	button: string;
	carrying: boolean;
	riding: boolean;
}

export interface CreaturePromptNames {
	/** Species under the crosshair that `pickUp` / `mount` would act on. */
	carryTarget: string | null;
	rideTarget: string | null;
	/** Online, a request the room hasn't answered yet. */
	carryPending: string | null;
	ridePending: string | null;
}

/** The prompt for `action` (null when the key does nothing for creatures). */
export function creatureKeyPrompt(
	action: CreatureKeyAction,
	state: CreatureKeyState,
	names: CreaturePromptNames
): CreaturePrompt | null {
	const base = { carrying: state.carrying, riding: state.riding };
	if (names.ridePending)
		return { ...base, action: 'waiting', label: 'Climbing on…', button: 'Climbing on…' };
	if (names.carryPending)
		return {
			...base,
			action: 'waiting',
			label: `Picking up ${names.carryPending}…`,
			button: 'Picking up…'
		};
	switch (action) {
		case 'pickUp':
			return {
				...base,
				action,
				label: `Pick up ${names.carryTarget ?? 'creature'}`,
				button: 'Pick up'
			};
		case 'putDown':
			return { ...base, action, label: 'Put down', button: 'Put down' };
		case 'mount':
			return { ...base, action, label: `Ride ${names.rideTarget ?? 'creature'}`, button: 'Ride' };
		case 'dismount':
			return { ...base, action, label: 'Get off', button: 'Get off' };
		default:
			return null;
	}
}
