import { describe, expect, it } from 'vitest';
import { BIOME_IDS } from '../../../biomes/BiomeTypes';
import { regionSpecies } from '../../CreaturePopulationSystem';
import type { SpeciesGenome } from '../../CreatureTypes';
import { validateSpecies } from '../../CreatureValidation';
import { generateIndividual } from '../../IndividualGenerator';
import { paletteIssues, resolveCreaturePalette } from '../../surface/CreaturePaletteGenerator';
import { PATTERN_TYPES } from '../../surface/CreaturePatternGenerator';
import {
	cachedCoatRegionSpecies,
	clearCoatCache,
	coatRegionSpecies,
	MIN_LIGHTNESS_STEP,
	renderedPattern
} from '../CreatureBiomeCoat';
import {
	CREATURE_BIOME_PROFILE_IDS,
	CREATURE_BIOME_PROFILES,
	type CreatureBiomeProfileId
} from '../creatureBiomeProfiles';
import { hexToOklch, oklchToHex } from '../oklch';

const SEED = 'coat-test';
const REGIONS: [number, number][] = [];
for (let x = -3; x < 3; x++) for (let z = -2; z < 2; z++) REGIONS.push([x, z]);
const regions = REGIONS.map(([x, z]) => ({ key: `${x}:${z}`, species: regionSpecies(SEED, x, z) }));

describe('OKLCh conversion', () => {
	it('round-trips sRGB hex colours', () => {
		for (const hex of [
			'#000000',
			'#ffffff',
			'#7a5c3e',
			'#2f7d32',
			'#c0ca33',
			'#4e5d2a',
			'#d16fb0'
		]) {
			const back = oklchToHex(hexToOklch(hex));
			for (let i = 1; i < 7; i += 2)
				expect(
					Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16))
				).toBeLessThanOrEqual(1);
		}
	});

	it('keeps lightness and hue when it pulls an impossible chroma into gamut', () => {
		const hex = oklchToHex({ l: 0.6, c: 0.5, h: 150 });
		const back = hexToOklch(hex);
		expect(back.l).toBeCloseTo(0.6, 2);
		expect(Math.abs(back.h - 150)).toBeLessThan(3);
	});
});

describe('creature biome profiles', () => {
	it('cover every biome and neutral', () => {
		expect(CREATURE_BIOME_PROFILE_IDS).toEqual(['neutral', ...BIOME_IDS]);
		for (const id of CREATURE_BIOME_PROFILE_IDS)
			expect(CREATURE_BIOME_PROFILES[id], id).toBeDefined();
	});

	it('are natural and leave room for six distinct lightness steps', () => {
		for (const id of CREATURE_BIOME_PROFILE_IDS) {
			const p = CREATURE_BIOME_PROFILES[id];
			const [lo, hi] = p.lightness;
			expect(hi - lo, id).toBeGreaterThanOrEqual(5 * MIN_LIGHTNESS_STEP);
			expect(lo, id).toBeGreaterThanOrEqual(0.2);
			expect(hi, id).toBeLessThanOrEqual(0.95);
			expect(p.accents.length, id).toBeGreaterThanOrEqual(3);
			expect(p.patterns.length, id).toBeGreaterThan(0);
			for (const b of p.bodies) expect(b.c, id).toBeLessThanOrEqual(0.12);
			for (const [pattern] of p.patterns) expect(PATTERN_TYPES).toContain(renderedPattern(pattern));
		}
	});
});

describe('coatRegionSpecies', () => {
	const coatedFor = (profile: CreatureBiomeProfileId) =>
		regions.map(({ key, species }) => ({
			key,
			original: species,
			coated: coatRegionSpecies(species, profile, SEED, key)
		}));

	it('changes only appearance, in copies, and stays valid', () => {
		for (const profile of ['neutral', 'desert', 'snowyPlains', 'jungle'] as const) {
			for (const { original, coated } of coatedFor(profile)) {
				const before = JSON.stringify(original);
				coated.forEach((species, i) => {
					const source = original[i];
					expect(species).not.toBe(source);
					expect(species.id).toBe(source.id);
					expect(species.name).toBe(source.name);
					expect(species.proportions).toBe(source.proportions);
					expect(species.anatomy).toBe(source.anatomy);
					expect(species.behaviour).toBe(source.behaviour);
					expect(species.bodyPlan).toBe(source.bodyPlan);
					expect(species.appearance.coat?.profile).toBe(profile);
					expect(validateSpecies(species), `${profile} ${species.id}`).toBeNull();
				});
				expect(JSON.stringify(original)).toBe(before);
			}
		}
	});

	it('gives every species of a region its own lightness step, at least 0.06 apart', () => {
		for (const profile of CREATURE_BIOME_PROFILE_IDS)
			for (const { key, coated } of coatedFor(profile)) {
				const steps = coated.map((s) => s.appearance.coat!.lightnessStep);
				expect(new Set(steps).size, `${profile} ${key}`).toBe(coated.length);
				const byStep = [...coated].sort(
					(a, b) => a.appearance.coat!.lightnessStep - b.appearance.coat!.lightnessStep
				);
				for (let i = 1; i < byStep.length; i++) {
					const gap =
						hexToOklch(byStep[i].appearance.palette.primary).l -
						hexToOklch(byStep[i - 1].appearance.palette.primary).l;
					expect(gap, `${profile} ${key} step ${i}`).toBeGreaterThan(MIN_LIGHTNESS_STEP - 0.01);
				}
			}
	});

	it('never gives neighbouring lightness steps the same pattern, and spreads accents', () => {
		for (const profile of CREATURE_BIOME_PROFILE_IDS)
			for (const { key, coated } of coatedFor(profile)) {
				const coats = coated.map((s) => s.appearance.coat!);
				for (let i = 0; i < coats.length; i++)
					for (let j = i + 1; j < coats.length; j++) {
						const gap = Math.abs(coats[i].lightnessStep - coats[j].lightnessStep);
						if (gap <= 1) expect(coats[i].pattern, `${profile} ${key}`).not.toBe(coats[j].pattern);
						if (coated[i].appearance.palette.accent === coated[j].appearance.palette.accent)
							expect(gap, `${profile} ${key}`).toBeGreaterThanOrEqual(2);
					}
			}
	});

	it('resolves to palettes that pass the palette rules for every profile and individual', () => {
		for (const profile of CREATURE_BIOME_PROFILE_IDS)
			for (const { coated } of coatedFor(profile))
				coated.forEach((species: SpeciesGenome, i) => {
					for (const seed of [i * 7 + 1, i * 7 + 2]) {
						const individual = generateIndividual(species, seed);
						const tone = species.appearance.surface!.primaryPattern.tone;
						const palette = resolveCreaturePalette(species, individual, tone);
						expect(paletteIssues(palette), `${profile} ${species.id}`).toEqual([]);
					}
				});
	});

	it('looks like its biome: snow is pale-capable and grey, the jungle dark and green', () => {
		const lightness = (profile: CreatureBiomeProfileId) =>
			coatedFor(profile).flatMap(({ coated }) =>
				coated.map((s) => hexToOklch(s.appearance.palette.primary))
			);
		const snow = lightness('snowyPlains');
		const jungle = lightness('jungle');
		expect(Math.max(...snow.map((c) => c.l))).toBeGreaterThan(0.88);
		expect(snow.every((c) => c.c < 0.06)).toBe(true);
		expect(Math.max(...jungle.map((c) => c.l))).toBeLessThan(0.7);
		const greens = jungle.filter((c) => c.h > 120 && c.h < 180).length;
		expect(greens / jungle.length).toBeGreaterThan(0.4);
	});

	it('is deterministic and cached', () => {
		clearCoatCache();
		const { key, species } = regions[0];
		const a = coatRegionSpecies(species, 'swamp', SEED, key);
		const b = coatRegionSpecies(species, 'swamp', SEED, key);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		const cached = cachedCoatRegionSpecies(species, 'swamp', SEED, key);
		expect(cachedCoatRegionSpecies(species, 'swamp', SEED, key)).toBe(cached);
		expect(JSON.stringify(cached)).toBe(JSON.stringify(a));
		expect(JSON.stringify(coatRegionSpecies(species, 'swamp', 'other-seed', key))).not.toBe(
			JSON.stringify(a)
		);
	});

	it('leaves classic palettes alone (no coat → original clamps)', () => {
		const species = regions[0].species[0];
		expect(species.appearance.coat).toBeUndefined();
		const palette = resolveCreaturePalette(species, generateIndividual(species, 3), 'light');
		expect(paletteIssues(palette)).toEqual([]);
	});
});
