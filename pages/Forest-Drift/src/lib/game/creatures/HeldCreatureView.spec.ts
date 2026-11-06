import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { CreatureRuntimeManager } from './CreatureRuntimeManager';
import { compileCreatureGeometry } from './CreatureCompiler';
import { abilityFor } from './creatureAbilities';
import { HeldCreatureView, carriedBody } from './HeldCreatureView';
import type { CreatureDefinition } from './CreatureTypes';

const managers: CreatureRuntimeManager[] = [];
afterEach(() => {
	for (const m of managers.splice(0)) m.dispose();
});

/** A few different carryable creatures from a real herd. */
function carryable(count = 4): CreatureDefinition[] {
	const c = new CreatureRuntimeManager(
		'held-view',
		{ surface: () => 0, blocked: () => false },
		undefined
	);
	managers.push(c);
	for (let i = 0; i < 20; i++) c.update({ x: 0, y: 0, z: 0 }, 0.1, 'high');
	const out: CreatureDefinition[] = [];
	const species = new Set<string>();
	for (const r of c.logical.values()) {
		const definition = { species: r.spawn.species, individual: r.spawn.individual };
		if (!abilityFor(definition) || species.has(r.spawn.species.name)) continue;
		species.add(r.spawn.species.name);
		out.push(definition);
		if (out.length === count) break;
	}
	expect(out.length).toBeGreaterThan(0);
	return out;
}

function view() {
	const scene = new THREE.Scene();
	const held = new HeldCreatureView(scene, () => {});
	const holder = scene.getObjectByName('held-creature')!;
	return { held, holder };
}

describe('the carried creature view', () => {
	it('measures the body (torso) inside the whole creature, legs and tail left out', () => {
		for (const definition of carryable()) {
			const { skeleton, bounds } = compileCreatureGeometry(definition, 1);
			const body = carriedBody(skeleton, bounds);
			expect(body.half.x).toBeGreaterThan(0.02);
			expect(body.half.y).toBeGreaterThan(0.02);
			// Its middle is off the ground (the legs are below it) and within the creature.
			expect(body.centre.y - body.half.y).toBeGreaterThan(bounds.min.y);
			expect(body.centre.y).toBeLessThan(bounds.max.y);
			expect(body.half.x * 2).toBeLessThanOrEqual(bounds.max.x - bounds.min.x + 1e-6);
		}
	});

	it('keeps the creature at its real size under the arm, its body centred on the anchor', () => {
		const [definition] = carryable(1);
		const { held, holder } = view();
		held.attach(definition!);
		const anchor = new THREE.Matrix4().makeTranslation(3, 1, -2);
		held.update({ kind: 'third-person', anchor }, 1 / 60, 0, true);
		const inner = holder.children[0]!;
		const creature = inner.children[0]!;
		expect(holder.getWorldScale(new THREE.Vector3()).toArray()).toEqual([1, 1, 1]);
		expect(inner.scale.toArray()).toEqual([1, 1, 1]);
		expect(creature.scale.toArray()).toEqual([1, 1, 1]);
		// The body's centre (not the feet) is what sits on the anchor.
		const { skeleton, bounds } = compileCreatureGeometry(definition!, 1);
		const body = carriedBody(skeleton, bounds);
		const bodyCentre = creature.localToWorld(body.centre.clone());
		expect(bodyCentre.distanceTo(new THREE.Vector3(3, 1, -2))).toBeLessThan(1e-6);
		expect(held.bodyHalfSize.toArray()).toEqual(body.half.toArray());
		held.dispose();
	});

	it('first person: its head is large in the lower-left corner, its body back out of view', () => {
		for (const [aspect, label] of [
			[16 / 9, 'wide'],
			[375 / 812, 'phone']
		] as const) {
			for (const definition of carryable()) {
				const camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 100);
				camera.position.set(5, 2, 5);
				camera.rotation.set(0.1, 0.8, 0, 'YXZ');
				camera.updateMatrixWorld(true);
				const { held } = view();
				held.attach(definition);
				held.update({ kind: 'first-person', camera }, 1 / 60, 0, true);
				const mouth = held.muzzleWorld(new THREE.Vector3())!.project(camera);
				expect(mouth.x, label).toBeLessThan(-0.1);
				expect(mouth.x, label).toBeGreaterThan(-1);
				expect(mouth.y, label).toBeLessThan(-0.1);
				expect(mouth.y, label).toBeGreaterThan(-1);
				// Up close: in front of the camera, about arm's length at most (big heads sit further out).
				const ahead = held
					.muzzleWorld(new THREE.Vector3())!
					.applyMatrix4(camera.matrixWorldInverse);
				expect(-ahead.z).toBeGreaterThan(camera.near);
				expect(-ahead.z).toBeLessThan(1);
				held.dispose();
			}
		}
	});
});
