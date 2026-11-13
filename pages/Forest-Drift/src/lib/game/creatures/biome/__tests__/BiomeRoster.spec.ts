import { describe, expect, it } from 'vitest';
import { BIOME_IDS } from '../../../biomes/BiomeTypes';
import { abilityFor } from '../../creatureAbilities';
import { rideFor } from '../../creatureRiding';
import { generateIndividual } from '../../IndividualGenerator';
import { generateSpecies } from '../../SpeciesGenerator';
import {
	BIOME_FAMILIES,
	biomeFamilyOf,
	rosterDensity,
	rosterKeyOf,
	rosterProfile
} from '../biomeRosters';
import {
	biomeRoster,
	clearRosterCache,
	rosterEntryCarryable,
	type RosterEntry
} from '../BiomeRoster';

const KEYS = [...new Set(BIOME_IDS.map((b) => rosterKeyOf(b)!))];
const regions = (n: number) =>
	Array.from({ length: n }, (_, i) => [(i % 17) - 8, Math.floor(i / 17) - 4] as const);

describe('biome rosters', () => {
	it('cover every biome with one of six families, and biomes off with none', () => {
		for (const biome of BIOME_IDS) expect(BIOME_FAMILIES).toContain(biomeFamilyOf(biome));
		expect(biomeFamilyOf('neutral')).toBeNull();
		expect(rosterDensity('neutral')).toBe(1);
		expect(rosterDensity('desert')).toBeLessThan(rosterDensity('jungle'));
	});

	it('always have something to carry and something to ride (Q6)', () => {
		for (const key of KEYS)
			for (const [rx, rz] of regions(60)) {
				const roster = biomeRoster('guarantees', rx, rz, key);
				expect(roster.length, key).toBe(rosterProfile(key).count);
				const small = roster.filter(rosterEntryCarryable);
				expect(small.length, `${key} ${rx},${rz}`).toBeGreaterThan(0);
				// The room's own rule, on a real individual.
				const carry = small[0].species;
				expect(
					abilityFor({ species: carry, individual: generateIndividual(carry, 3) })
				).not.toBeNull();
				const biped = roster.find((e) => e.species.bodyPlan.id === 'biped');
				expect(biped, `${key} ${rx},${rz}`).toBeDefined();
				expect(
					rideFor({ species: biped!.species, individual: generateIndividual(biped!.species, 3) })
				).not.toBeNull();
			}
	});

	it('keep giants to open land and jungle, with a rare one in the desert (Q5)', () => {
		const giants = (key: string) =>
			regions(80).filter(([rx, rz]) => biomeRoster('giants', rx, rz, key).some((e) => e.band >= 4))
				.length;
		for (const key of ['temperateForest', 'cold', 'cold:snowyPlains', 'wet'])
			expect(giants(key), key).toBe(0);
		expect(giants('openTemperate')).toBeGreaterThan(40);
		expect(giants('tropical')).toBeGreaterThan(40);
		const desert = giants('warmDry:desert');
		expect(desert).toBeGreaterThan(5);
		expect(desert).toBeLessThan(40);
	});

	it('lean each family toward its animals (Q1, Q13)', () => {
		const share = (key: string, test: (e: RosterEntry) => boolean) => {
			let hit = 0,
				all = 0;
			for (const [rx, rz] of regions(120))
				for (const e of biomeRoster('lean', rx, rz, key)) {
					all++;
					if (test(e)) hit++;
				}
			return hit / all;
		};
		const serpent = (e: RosterEntry) => e.species.bodyPlan.id === 'serpentine';
		const longleg = (e: RosterEntry) => e.species.anatomy.signatureTraits[0] === 'longleg';
		const round = (e: RosterEntry) => e.species.anatomy.signatureTraits[0] === 'round';
		const biped = (e: RosterEntry) => e.species.bodyPlan.id === 'biped';
		expect(share('wet', serpent)).toBeGreaterThan(share('temperateForest', serpent) * 2);
		expect(share('openTemperate', longleg)).toBeGreaterThan(share('cold', longleg) * 2);
		expect(share('cold', round)).toBeGreaterThan(share('openTemperate', round) * 1.5);
		expect(share('tropical:bambooJungle', biped)).toBeGreaterThan(share('cold', biped));
		const fins = share(
			'wet',
			(e) =>
				e.species.form?.traits.dominant === 'dorsal-fin' ||
				e.species.form?.traits.secondary === 'dorsal-fin'
		);
		expect(fins).toBeGreaterThan(
			share(
				'cold',
				(e) =>
					e.species.form?.traits.dominant === 'dorsal-fin' ||
					e.species.form?.traits.secondary === 'dorsal-fin'
			)
		);
	});

	it('name species with the family word (Q7) and scale herds by family (Q14)', () => {
		for (const key of KEYS) {
			const words = rosterProfile(key).lean.nameWords!;
			for (const e of biomeRoster('names', 1, 2, key))
				expect(words).toContain(e.species.name.split(' ')[0]);
		}
		const herd = (key: string) =>
			regions(40).reduce(
				(n, [rx, rz]) =>
					n + biomeRoster('herds', rx, rz, key)[0].species.behaviour.preferredGroupSize,
				0
			);
		expect(herd('openTemperate')).toBeGreaterThan(herd('cold'));
	});

	it('is deterministic and cached, and does not change species made without a lean', () => {
		clearRosterCache();
		const a = biomeRoster('det', 3, -2, 'tropical');
		expect(biomeRoster('det', 3, -2, 'tropical')).toBe(a);
		clearRosterCache();
		expect(JSON.stringify(biomeRoster('det', 3, -2, 'tropical'))).toBe(JSON.stringify(a));
		expect(JSON.stringify(biomeRoster('other', 3, -2, 'tropical'))).not.toBe(JSON.stringify(a));
		for (const plan of ['quadruped', 'biped', 'hexapod', 'serpentine'] as const)
			for (const seed of [1, 42, 9001])
				expect(generateSpecies(seed, plan, undefined)).toEqual(generateSpecies(seed, plan));
	});
});
