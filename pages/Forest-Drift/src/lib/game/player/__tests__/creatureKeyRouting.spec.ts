import { describe, expect, it } from 'vitest';
import { creatureKeyPrompt, routeCreatureKey, type CreatureKeyState } from '../creatureKeyRouting';

const state = (over: Partial<CreatureKeyState>): CreatureKeyState => ({
	riding: false,
	carrying: false,
	seatOrDoorTargeted: false,
	rideTarget: null,
	carryTarget: null,
	...over
});

describe('K with carrying and riding (Q8 A, Q12 C, F1, F2)', () => {
	it('riding, empty-handed: picks up a creature in reach, otherwise gets off', () => {
		expect(routeCreatureKey(state({ riding: true, carryTarget: 1.2 }))).toBe('pickUp');
		expect(routeCreatureKey(state({ riding: true }))).toBe('dismount');
		expect(routeCreatureKey(state({ riding: true, rideTarget: 1 }))).toBe('dismount');
	});

	it('riding and carrying: always gets off, keeping the carried creature (F1)', () => {
		expect(routeCreatureKey(state({ riding: true, carrying: true, carryTarget: 1 }))).toBe(
			'dismount'
		);
		expect(routeCreatureKey(state({ riding: true, carrying: true }))).toBe('dismount');
	});

	it('riding: a seat or door under the crosshair never takes the key', () => {
		expect(routeCreatureKey(state({ riding: true, seatOrDoorTargeted: true }))).toBe('dismount');
	});

	it('on foot and carrying: climbs onto a biped, otherwise puts the creature down (F2)', () => {
		expect(routeCreatureKey(state({ carrying: true, rideTarget: 2 }))).toBe('mount');
		expect(routeCreatureKey(state({ carrying: true }))).toBe('putDown');
		expect(routeCreatureKey(state({ carrying: true, seatOrDoorTargeted: true }))).toBe('putDown');
	});

	it('on foot, empty-handed: seats and doors first, then the nearer creature', () => {
		expect(routeCreatureKey(state({ seatOrDoorTargeted: true, rideTarget: 1 }))).toBe('other');
		expect(routeCreatureKey(state({ rideTarget: 1, carryTarget: 1.5 }))).toBe('mount');
		expect(routeCreatureKey(state({ rideTarget: 2, carryTarget: 1.5 }))).toBe('pickUp');
		expect(routeCreatureKey(state({ rideTarget: 2.5 }))).toBe('mount');
		expect(routeCreatureKey(state({ carryTarget: 0.5 }))).toBe('pickUp');
		expect(routeCreatureKey(state({}))).toBe('none');
	});
});

describe('the creature prompt (Q28)', () => {
	const names = {
		carryTarget: 'Moss Pebbleback',
		rideTarget: 'Dusk Stilt',
		carryPending: null,
		ridePending: null
	};

	it('names the creature the key would act on', () => {
		const ride = state({ rideTarget: 1 });
		expect(creatureKeyPrompt('mount', ride, names)).toMatchObject({
			action: 'mount',
			label: 'Ride Dusk Stilt',
			button: 'Ride'
		});
		expect(creatureKeyPrompt('pickUp', state({ carryTarget: 1 }), names)?.label).toBe(
			'Pick up Moss Pebbleback'
		);
		expect(creatureKeyPrompt('dismount', state({ riding: true }), names)).toMatchObject({
			label: 'Get off',
			riding: true
		});
		expect(creatureKeyPrompt('putDown', state({ carrying: true }), names)?.label).toBe('Put down');
	});

	it('says when the room is still deciding, and nothing when the key has no creature job', () => {
		expect(
			creatureKeyPrompt('none', state({}), { ...names, ridePending: 'Dusk Stilt' })?.label
		).toBe('Climbing on…');
		expect(
			creatureKeyPrompt('none', state({}), { ...names, carryPending: 'Moss Pebbleback' })?.label
		).toBe('Picking up Moss Pebbleback…');
		expect(creatureKeyPrompt('none', state({}), names)).toBeNull();
		expect(creatureKeyPrompt('other', state({ seatOrDoorTargeted: true }), names)).toBeNull();
	});
});
