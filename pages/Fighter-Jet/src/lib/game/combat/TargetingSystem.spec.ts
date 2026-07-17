import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Target } from './Target';
import { scoreTargetCandidate, selectTargetCandidate, TargetingSystem } from './TargetingSystem';

function target(id: string, x: number, y: number, z: number): Target {
	const object = new Object3D();
	return new Target(
		{
			id,
			name: id,
			type: 'radar',
			maxHealth: 100,
			hitRadius: 10,
			isFinal: false,
			scoreValue: 1000,
			position: new Vector3(x, y, z)
		},
		object
	);
}

function camera(): PerspectiveCamera {
	const result = new PerspectiveCamera(60, 1, 0.1, 10000);
	result.position.set(0, 0, 0);
	result.lookAt(0, 0, -1);
	result.updateMatrixWorld(true);
	return result;
}

describe('target candidate scoring', () => {
	it('prefers a central target over a nearer peripheral target', () => {
		const view = camera();
		const central = target('central', 0, 0, -1800);
		const peripheral = target('peripheral', 430, 0, -1050);

		const centralScore = scoreTargetCandidate(view, central);
		const selected = selectTargetCandidate(view, [peripheral, central], () => true);

		expect(centralScore?.angle).toBeCloseTo(0, 6);
		expect(selected?.id).toBe('central');
	});

	it('rejects occluded and out-of-cone candidates', () => {
		const view = camera();
		const hidden = target('hidden', 0, 0, -600);
		const behind = target('behind', 0, 0, 600);

		const selected = selectTargetCandidate(view, [hidden, behind], (_from, to) => to.z > -500);

		expect(selected).toBeNull();
	});
});

describe('target lock retention', () => {
	it('acquires, briefly retains, then breaks a lock outside the easy cone', () => {
		const view = camera();
		const tracked = target('tracked', 0, 0, -1000);
		const system = new TargetingSystem(view, [tracked], () => true, true);
		system.select(tracked);

		system.update(0.1);
		expect(system.locked).toBe(true);

		tracked.position.set(470, 0, -1000);
		system.update(0.3);
		expect(system.lockState).toBe('retaining');

		system.update(0.5);
		system.update(0.01);
		expect(system.locked).toBe(false);
	});

	it('decays acquisition when visibility is interrupted', () => {
		const view = camera();
		const tracked = target('tracked', 0, 0, -1000);
		let visible = true;
		const system = new TargetingSystem(view, [tracked], () => visible);
		system.select(tracked);
		system.update(0.6);
		const acquired = system.progress;
		visible = false;
		system.update(0.2);

		expect(system.progress).toBeLessThan(acquired);
		expect(system.locked).toBe(false);
	});
});
