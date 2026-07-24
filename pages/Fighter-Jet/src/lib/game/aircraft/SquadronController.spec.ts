import { Euler, Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../config/balance';
import { Target } from '../combat/Target';
import { SquadronController } from './SquadronController';

const NO_ATTACK = (): void => {};
const STEP = 1 / 60;

function createLeader(): { player: Object3D; velocity: Vector3 } {
	const player = new Object3D();
	player.position.set(100, 300, 200);
	player.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), 0.35);
	const velocity = new Vector3(0, 0, -BALANCE.flight.cruiseSpeed).applyQuaternion(
		player.quaternion
	);
	return { player, velocity };
}

function createTarget(id = 'target-1', isFinal = false): Target {
	return new Target(
		{
			id,
			name: id,
			type: isFinal ? 'command' : 'radar',
			maxHealth: 100,
			hitRadius: 12,
			isFinal,
			scoreValue: 1000,
			position: new Vector3(80, 240, -350)
		},
		new Object3D()
	);
}

describe('SquadronController formation mode', () => {
	it('starts four wingmen in the correct V target positions', () => {
		const { player, velocity } = createLeader();
		const squadron = new SquadronController();
		squadron.reset(player, velocity);
		const inverseLeaderRotation = player.quaternion.clone().invert();
		const spacing = BALANCE.squadron.formationSpacing;
		const depth = BALANCE.squadron.formationDepth;
		const expectedOffsets = [
			new Vector3(-spacing, 0, depth),
			new Vector3(spacing, 0, depth),
			new Vector3(-spacing * 2, 0, depth * 2),
			new Vector3(spacing * 2, 0, depth * 2)
		];

		expect(squadron.mode).toBe('formation');
		expect(squadron.jets).toHaveLength(4);
		for (let index = 0; index < squadron.jets.length; index += 1) {
			const jet = squadron.jets[index];
			const localTarget = jet.targetPosition
				.clone()
				.sub(player.position)
				.applyQuaternion(inverseLeaderRotation);
			expect(localTarget.distanceTo(expectedOffsets[index])).toBeLessThan(0.001);
			expect(jet.position.distanceTo(jet.targetPosition)).toBeLessThan(0.001);
		}
	});

	it.each([
		// Nose-up climb: FlightController stores pitch inverted via euler.set(-pitch, ...).
		{ flightPitch: -0.42, relation: 'below', expectedSign: -1 },
		{ flightPitch: 0.42, relation: 'above', expectedSign: 1 }
	])(
		'keeps trailing slots $relation the leader from the pilot perspective',
		({ flightPitch, expectedSign }) => {
			const player = new Object3D();
			player.position.set(0, 300, 0);
			player.quaternion.setFromEuler(new Euler(-flightPitch, Math.PI, 0, 'YXZ'));
			const velocity = new Vector3(0, 0, -BALANCE.flight.cruiseSpeed).applyQuaternion(
				player.quaternion
			);
			const squadron = new SquadronController();
			squadron.reset(player, velocity);
			const inverseLeaderRotation = player.quaternion.clone().invert();
			const forward = new Vector3(0, 0, -1).applyQuaternion(player.quaternion);
			expect(Math.sign(forward.y)).toBe(-Math.sign(flightPitch) || 0);

			for (const jet of squadron.jets) {
				const localTarget = jet.targetPosition
					.clone()
					.sub(player.position)
					.applyQuaternion(inverseLeaderRotation);
				expect(Math.sign(localTarget.y)).toBe(expectedSign);
				expect(localTarget.z).toBeGreaterThan(0);
			}
			const rearLocalTarget = squadron.jets[3].targetPosition
				.clone()
				.sub(player.position)
				.applyQuaternion(inverseLeaderRotation);
			expect(Math.abs(rearLocalTarget.y)).toBeGreaterThan(40);
		}
	);

	it('banks progressively instead of copying a sudden leader roll', () => {
		const { player, velocity } = createLeader();
		const squadron = new SquadronController();
		squadron.reset(player, velocity);
		const jet = squadron.jets[0];
		const before = jet.quaternion.clone();
		player.quaternion.multiply(new Quaternion().setFromEuler(new Euler(0, 0, -0.9, 'YXZ')));

		squadron.update(STEP, 'strikes', player, velocity, [], NO_ATTACK);

		const wingmanChange = before.angleTo(jet.quaternion);
		const leaderChange = before.angleTo(player.quaternion);
		expect(wingmanChange).toBeGreaterThan(0);
		expect(wingmanChange).toBeLessThan(leaderChange * 0.25);
	});

	it('shows each target point and forward direction when squad debug is enabled', () => {
		const { player, velocity } = createLeader();
		const squadron = new SquadronController();
		squadron.reset(player, velocity);
		const jet = squadron.jets[0];
		const targetMarker = squadron.getObjectByName(`${jet.callsign} Target`);
		const directionArrow = squadron.getObjectByName(`${jet.callsign} Direction`);

		expect(squadron.debugVisible).toBe(false);
		expect(targetMarker?.visible).toBe(false);
		expect(directionArrow?.visible).toBe(false);

		squadron.setDebugVisuals(true);
		squadron.update(STEP, 'strikes', player, velocity, [], NO_ATTACK);

		expect(squadron.debugVisible).toBe(true);
		expect(targetMarker?.visible).toBe(true);
		expect(directionArrow?.visible).toBe(true);
		expect(targetMarker?.position.distanceTo(jet.targetPosition)).toBeLessThan(0.001);
		expect(directionArrow?.position.distanceTo(jet.position)).toBeLessThan(0.001);
		const arrowDirection = new Vector3(0, 1, 0).applyQuaternion(directionArrow!.quaternion);
		expect(arrowDirection.dot(jet.velocity.clone().normalize())).toBeGreaterThan(0.999);

		expect(squadron.toggleDebugVisuals()).toBe(false);
		expect(targetMarker?.visible).toBe(false);
		expect(directionArrow?.visible).toBe(false);
	});

	it('uses bounded steering and a modest speed advantage to catch its moving slot', () => {
		const { player, velocity } = createLeader();
		const squadron = new SquadronController();
		squadron.reset(player, velocity);
		const jet = squadron.jets[0];
		jet.position.add(new Vector3(0, 0, 500).applyQuaternion(player.quaternion));
		const start = jet.position.clone();
		const initialDirection = jet.velocity.clone().normalize();

		squadron.update(STEP, 'strikes', player, velocity, [], NO_ATTACK);

		const moved = jet.position.distanceTo(start);
		const turnAngle = initialDirection.angleTo(jet.velocity.clone().normalize());
		expect(moved).toBeLessThanOrEqual(jet.velocity.length() * STEP + 0.001);
		expect(turnAngle).toBeLessThanOrEqual(BALANCE.squadron.formationMaxTurnRate * STEP + 0.001);
		expect(jet.velocity.length()).toBeGreaterThan(velocity.length());
		expect(jet.velocity.length()).toBeLessThanOrEqual(
			velocity.length() +
				BALANCE.squadron.catchupSpeedMargin +
				BALANCE.squadron.tightTurnSpeedBoost +
				BALANCE.squadron.tightTurnCatchupBoost +
				0.001
		);
	});

	it('anticipates moving formation slots through a sustained tight bank', () => {
		const { player, velocity } = createLeader();
		const squadron = new SquadronController();
		squadron.reset(player, velocity);
		let yaw = 0.35;

		for (let frame = 0; frame < 240; frame += 1) {
			yaw += 1.2 * STEP;
			player.quaternion.setFromEuler(new Euler(0, yaw, -0.95, 'YXZ'));
			velocity.set(0, 0, -BALANCE.flight.cruiseSpeed).applyQuaternion(player.quaternion);
			player.position.addScaledVector(velocity, STEP);
			squadron.update(STEP, 'strikes', player, velocity, [], NO_ATTACK);
		}

		for (const jet of squadron.jets) {
			expect(jet.position.distanceTo(jet.targetPosition)).toBeLessThan(180);
		}
	});

	it('flies back toward formation without snapping when the mode changes', () => {
		const { player, velocity } = createLeader();
		const squadron = new SquadronController();
		squadron.reset(player, velocity);
		squadron.setMode('free-squad');
		squadron.update(STEP, 'strikes', player, velocity, [], NO_ATTACK);
		const jet = squadron.jets[0];
		jet.position.add(new Vector3(700, 100, 500));
		const beforeReturn = jet.position.clone();

		squadron.setMode('formation');
		squadron.update(STEP, 'strikes', player, velocity, [], NO_ATTACK);

		expect(squadron.mode).toBe('formation');
		expect(jet.position.equals(jet.targetPosition)).toBe(false);
		expect(jet.position.distanceTo(beforeReturn)).toBeLessThan(
			(velocity.length() + BALANCE.squadron.catchupSpeedMargin + 10) * STEP
		);
		expect(jet.position.distanceTo(jet.targetPosition)).toBeLessThan(
			beforeReturn.distanceTo(jet.targetPosition)
		);
	});
});

describe('SquadronController free squad mode', () => {
	it('advances through spatial waypoints and eventually attacks eligible targets', () => {
		const { player, velocity } = createLeader();
		const squadron = new SquadronController();
		const target = createTarget();
		const onAttack = vi.fn();
		squadron.reset(player, velocity);
		squadron.setMode('free-squad');

		squadron.update(STEP, 'combat-zone', player, velocity, [target], onAttack);
		const firstWaypoint = squadron.jets[0].targetPosition.clone();
		for (let elapsed = 0; elapsed < BALANCE.squadron.waypointTimeout + 0.5; elapsed += STEP) {
			squadron.update(STEP, 'combat-zone', player, velocity, [target], onAttack);
		}

		expect(squadron.mode).toBe('free-squad');
		expect(squadron.jets[0].targetPosition.equals(firstWaypoint)).toBe(false);
		expect(squadron.jets.some((jet) => jet.state === 'attack-run')).toBe(true);
		expect(onAttack).toHaveBeenCalled();
		expect(onAttack.mock.calls[0]?.[1]).toBe(target);
	});

	it('ignores final targets and continues using patrol target points', () => {
		const { player, velocity } = createLeader();
		const squadron = new SquadronController();
		const finalTarget = createTarget('final', true);
		const onAttack = vi.fn();
		squadron.reset(player, velocity);
		squadron.setMode('free-squad');

		for (let elapsed = 0; elapsed < BALANCE.squadron.waypointTimeout + 0.5; elapsed += STEP) {
			squadron.update(STEP, 'final-target', player, velocity, [finalTarget], onAttack);
		}

		expect(onAttack).not.toHaveBeenCalled();
		for (const jet of squadron.jets) {
			expect(jet.targetPosition.distanceToSquared(player.position)).toBeGreaterThan(0);
			expect(jet.state).toBe('break');
		}
	});
});
