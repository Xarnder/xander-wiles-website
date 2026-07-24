import { Object3D, Vector3 } from 'three';
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
	toggleSquadMode: false,
	toggleSquadDebug: false,
	pause: false,
	map: false,
	method: 'keyboard-mouse'
};

describe('FlightController bank steering', () => {
	it.each([
		{ roll: -1, localDirection: new Vector3(-1, 0, 0), key: 'A', bank: 'left' },
		{ roll: 1, localDirection: new Vector3(1, 0, 0), key: 'D', bank: 'right' }
	])('$key banks and moves $bank', ({ roll, localDirection }) => {
		const aircraft = new Object3D();
		const controller = new FlightController(aircraft);
		controller.reset();
		const start = aircraft.position.clone();
		const expectedDirection = localDirection.applyQuaternion(aircraft.quaternion);

		controller.update(0.5, { ...NEUTRAL_INPUT, roll }, 0, false, false);

		const displacement = aircraft.position.clone().sub(start);
		expect(Math.sign(controller.roll)).toBe(Math.sign(roll));
		expect(displacement.dot(expectedDirection)).toBeGreaterThan(0);
	});
});

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

describe('FlightController looping', () => {
	it('allows continuous pitch through a full vertical loop', () => {
		const aircraft = new Object3D();
		const controller = new FlightController(aircraft);
		controller.reset(new Vector3(0, 1200, 0));

		const forward = new Vector3();
		const up = new Vector3();
		let sawClimb = false;
		let sawInverted = false;
		let sawDive = false;
		let maxAbsPitch = 0;

		for (let step = 0; step < 420; step += 1) {
			controller.update(1 / 60, { ...NEUTRAL_INPUT, pitch: 1, throttle: 1 }, -2000, false, false);
			forward.set(0, 0, -1).applyQuaternion(aircraft.quaternion);
			up.set(0, 1, 0).applyQuaternion(aircraft.quaternion);
			maxAbsPitch = Math.max(maxAbsPitch, Math.abs(controller.pitch));
			if (forward.y > 0.55) sawClimb = true;
			if (forward.y < -0.55) sawDive = true;
			if (up.y < -0.55) sawInverted = true;
		}

		expect(sawClimb).toBe(true);
		expect(sawInverted).toBe(true);
		expect(sawDive).toBe(true);
		expect(maxAbsPitch).toBeGreaterThan(2.5);
	});
});
