import { describe, expect, it } from 'vitest';
import { hashStringToUint32 } from '../terrain/seededRandom';
import {
	creatureDimensions,
	generatePopulationCell,
	regionSpecies
} from './CreaturePopulationSystem';
import type { CreatureWorldAccess } from './CreatureTypes';

const flat: CreatureWorldAccess = { surface: () => 0, blocked: () => false };
/** Carry limit from the ranged-weapons plan (Q2): small enough to tuck under an arm. */
const CARRY_MAX_HEIGHT = 0.9;

/**
 * Ranged weapons Q3 / F1 (docs/2026/11-04/range-weapons): every region's smallest species is a
 * quadruped. The change must touch nothing else, so the larger bands are pinned to their output
 * from before the change (the snapshot was recorded on the old generator).
 */
const SEEDS = ['forest', '42'];
const REGIONS: [number, number][] = [];
for (let x = -4; x < 4; x++) for (let z = -2; z < 2; z++) REGIONS.push([x, z]);

const fingerprint = (value: unknown) => hashStringToUint32(JSON.stringify(value));

describe('regional fauna: the smallest species is always a quadruped', () => {
	it('holds in every region, for several seeds', () => {
		for (const seed of ['forest', '42', 'meadow'])
			for (let x = -12; x < 12; x++)
				for (let z = -12; z < 12; z++)
					expect(regionSpecies(seed, x, z)[0].bodyPlan.id, `${seed} ${x},${z}`).toBe('quadruped');
	});

	it('stays in the smallest height band', () => {
		for (const [x, z] of REGIONS) {
			const { height } = creatureDimensions(regionSpecies('forest', x, z)[0]);
			expect(height).toBeGreaterThanOrEqual(0.55 - 1e-9);
			expect(height).toBeLessThanOrEqual(0.8 + 1e-9);
		}
	});

	it('spawns individuals small enough to carry', () => {
		let checked = 0;
		for (let x = -16; x < 16; x++)
			for (let z = -8; z < 8; z++) {
				const smallest = regionSpecies('forest', Math.floor(x / 8), Math.floor(z / 8))[0].id;
				for (const spawn of generatePopulationCell('forest', x, z, 1, flat)) {
					if (spawn.species.id !== smallest) continue;
					expect(spawn.species.bodyPlan.id).toBe('quadruped');
					const { height } = creatureDimensions(spawn.species, spawn.individual.sizeFactor);
					expect(height).toBeLessThanOrEqual(CARRY_MAX_HEIGHT);
					checked++;
				}
			}
		expect(checked).toBeGreaterThan(50);
	});

	it('is deterministic', () => {
		expect(regionSpecies('forest', 3, -2)).toEqual(regionSpecies('forest', 3, -2));
	});
});

describe('regional fauna: larger bands are unchanged', () => {
	it('keeps bands 1–5 identical to the pre-change generator', () => {
		const rows = SEEDS.flatMap((seed) =>
			REGIONS.map(([x, z]) => {
				const species = regionSpecies(seed, x, z).slice(1);
				return `${seed} ${x},${z}: ${species.map(fingerprint).join(' ')}`;
			})
		);
		expect(rows).toMatchSnapshot();
	});
});
