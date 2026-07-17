import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { InputState } from '../types';
import { BALANCE } from '../config/balance';
import { FlightController } from './FlightController';

const NEUTRAL_INPUT: InputState = {
	pitch: 0,
	roll: 0,
	yaw: 0,
	throttle: 0.55,
	afterburner: false,
	fire: false,
	cycleTarget: false,
	cycleCamera: false,
	pause: false,
	map: false,
	method: 'keyboard-mouse'
};

describe('FlightController ground collision', () => {
	it('reports a crash instead of pushing the player away from terrain', () => {
		const aircraft = new Object3D();
		const controller = new FlightController(aircraft);
		controller.reset();
		aircraft.position.y = 1;

		const crashed = controller.update(1 / 90, NEUTRAL_INPUT, 0, true, true);

		expect(crashed).toBe(true);
		expect(controller.speed).toBe(0);
		expect(controller.velocity.lengthSq()).toBe(0);
		expect(aircraft.position.y).toBe(BALANCE.flight.crashClearance);
	});

	it('retains ground avoidance for protected scripted flight', () => {
		const aircraft = new Object3D();
		const controller = new FlightController(aircraft);
		controller.reset();
		aircraft.position.y = 1;

		const crashed = controller.update(1 / 90, NEUTRAL_INPUT, 0, true, false);

		expect(crashed).toBe(false);
		expect(aircraft.position.y).toBe(BALANCE.flight.terrainClearance);
		expect(controller.speed).toBeGreaterThan(0);
	});
});
