import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { animateCreature } from './CreatureAnimationSystem';
import { compileCreature } from './CreatureCompiler';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import type { CreatureIntent } from './CreatureTypes';

const walk: CreatureIntent = {
	velocity: { x: 0, y: 0, z: 1 },
	heading: 0,
	angularVelocity: 0,
	gait: 'walk'
};
function make(seed: number) {
	const species = generateSpecies(seed, 'quadruped');
	return compileCreature({ species, individual: generateIndividual(species, seed + 700) });
}
function pose(creature: ReturnType<typeof make>) {
	return creature.skeleton.bones.flatMap((bone) => [
		...bone.position.toArray(),
		...bone.quaternion.toArray()
	]);
}

describe('quadruped procedural animation', () => {
	it('walks 25 different anatomies with finite bones and fixed limb lengths', () => {
		for (let seed = 0; seed < 25; seed++) {
			const creature = make(seed);
			const rest = JSON.stringify(creature.compilation.skeleton);
			for (let frame = 0; frame < 12; frame++) {
				animateCreature(
					creature,
					{ ...walk, gait: frame % 2 ? 'run' : 'walk', heading: frame * 0.08 },
					frame / 12,
					1 / 12,
					() => 0
				);
				expect(pose(creature).every(Number.isFinite)).toBe(true);
				for (const limb of creature.compilation.skeleton.limbs) {
					const hip = creature.bonesById.get(limb.hipId)!.getWorldPosition(new Vector3());
					const knee = creature.bonesById.get(limb.kneeId)!.getWorldPosition(new Vector3());
					const foot = creature.bonesById.get(limb.footId)!.getWorldPosition(new Vector3());
					expect(hip.distanceTo(knee)).toBeCloseTo(limb.upperLength, 7);
					expect(knee.distanceTo(foot)).toBeCloseTo(limb.lowerLength, 7);
				}
			}
			expect(JSON.stringify(creature.compilation.skeleton)).toBe(rest);
			creature.dispose();
		}
	});
	it('returns continuously to the same walk pose after one cycle', () => {
		const creature = make(14);
		const period = 1 / creature.compilation.definition.species.locomotion.gait.walkFrequency;
		animateCreature(creature, walk, 0.12, 1 / 60);
		const start = pose(creature);
		animateCreature(creature, walk, 0.12 + period, 1 / 60);
		pose(creature).forEach((v, i) => expect(v).toBeCloseTo(start[i], 7));
		creature.dispose();
	});
	it('alternates feet by the species gait phase and lifts them clear of the pad plane', () => {
		const creature = make(14);
		const frequency = creature.compilation.definition.species.locomotion.gait.walkFrequency;
		animateCreature(creature, walk, 0.25 / frequency, 1 / 60, () => 0);
		const limbs = creature.compilation.skeleton.limbs;
		const heights = limbs.map(
			(limb) =>
				creature.bonesById.get(limb.footId)!.getWorldPosition(new Vector3()).y - limb.restFoot.y
		);
		expect(heights[0]).toBeGreaterThan(heights[1]);
		expect(heights[3]).toBeGreaterThan(heights[2]);
		creature.dispose();
	});
	it('samples terrain in world coordinates and keeps translated, rotated feet grounded', () => {
		const creature = make(14);
		creature.object.position.set(120, 0, -230);
		creature.object.rotation.y = 1.7;
		const terrain = (x: number, z: number) => 3 + (x - 120) * 0.02 + (z + 230) * 0.015;
		animateCreature(creature, { ...walk, gait: 'idle', heading: 1.7 }, 0, 1 / 60, terrain);
		expect(creature.object.position.y).toBe(3);
		for (const limb of creature.compilation.skeleton.limbs) {
			const foot = creature.bonesById.get(limb.footId)!.getWorldPosition(new Vector3());
			expect(foot.y - terrain(foot.x, foot.z)).toBeCloseTo(limb.restFoot.y, 5);
		}
		creature.dispose();
	});
	it('looks toward a world target and ignores invalid time without poisoning bones', () => {
		const creature = make(7);
		animateCreature(
			creature,
			{ ...walk, gait: 'idle', lookTarget: { x: 10, y: 2, z: 10 } },
			1,
			1 / 60
		);
		expect(creature.bonesById.get('head')!.rotation.y).toBeGreaterThan(0);
		const before = pose(creature);
		animateCreature(creature, walk, NaN, 1 / 60);
		expect(pose(creature)).toEqual(before);
		creature.dispose();
	});
});
