import { describe, expect, it } from 'vitest';
import { classifyBiomes, landformClasses, type BiomeClassifierInput } from '../BiomeClassifier';
import { biomeIndex } from '../biomeDefinitions';
import {
	BIOME_IDS,
	createBiomeWeightVector,
	createDefaultBiomeSettings,
	type BiomeId
} from '../BiomeTypes';

function input(
	t: number,
	m: number,
	landform: 'plains' | 'hills' | 'highlands' | 'mountains' = 'plains',
	rarity = 0,
	baseElevation = 20
): BiomeClassifierInput {
	return {
		climate: { temperature: t, moisture: m, rarity },
		landform: {
			lowland: landform === 'plains' || landform === 'hills' ? 1 : 0,
			highland: landform === 'highlands' ? 1 : 0,
			mountain: landform === 'mountains' ? 1 : 0
		},
		baseElevation
	};
}

function dominant(i: BiomeClassifierInput, settings = createDefaultBiomeSettings()): BiomeId {
	return BIOME_IDS[classifyBiomes(i, settings, createBiomeWeightVector())];
}

describe('classifyBiomes', () => {
	it('returns weights that are non-negative and sum to 1 everywhere', () => {
		const out = createBiomeWeightVector();
		const settings = createDefaultBiomeSettings();
		let minWeight = 0;
		let worstSum = 0;
		let wrongDominant = 0;
		for (const landform of ['plains', 'hills', 'highlands', 'mountains'] as const) {
			for (let t = 0; t <= 1; t += 0.037) {
				for (let m = 0; m <= 1; m += 0.041) {
					for (const rarity of [0, 0.5, 0.9, 1]) {
						for (const elevation of [-5, 4, 10, 30]) {
							const d = classifyBiomes(input(t, m, landform, rarity, elevation), settings, out);
							let sum = 0;
							let max = 0;
							for (let k = 0; k < out.length; k++) {
								minWeight = Math.min(minWeight, out[k]);
								max = Math.max(max, out[k]);
								sum += out[k];
							}
							worstSum = Math.max(worstSum, Math.abs(sum - 1));
							if (out[d] !== max) wrongDominant++;
						}
					}
				}
			}
		}
		expect(minWeight).toBeGreaterThanOrEqual(0);
		expect(worstSum).toBeLessThan(1e-5);
		expect(wrongDominant).toBe(0);
	});

	it('picks the expected biome in the middle of each climate', () => {
		expect(dominant(input(0.03, 0.2))).toBe('snowyPlains');
		expect(dominant(input(0.03, 0.7))).toBe('snowyTaiga');
		expect(dominant(input(0.12, 0.6))).toBe('taiga');
		expect(dominant(input(0.43, 0.45))).toBe('forest');
		expect(dominant(input(0.27, 0.45))).toBe('birchForest');
		expect(dominant(input(0.56, 0.45))).toBe('sunlitWood');
		expect(dominant(input(0.45, 0.75))).toBe('darkForest');
		expect(dominant(input(0.4, 0.15))).toBe('plains');
		expect(dominant(input(0.92, 0.1))).toBe('desert');
		expect(dominant(input(0.72, 0.2))).toBe('savanna');
		expect(dominant(input(0.72, 0.05))).toBe('shrubSavanna');
		expect(dominant(input(0.72, 0.5))).toBe('tropicalDryGrassland');
		expect(dominant(input(0.92, 0.85))).toBe('jungle');
		expect(dominant(input(0.92, 0.58))).toBe('sparseJungle');
		expect(dominant(input(0.45, 0.5, 'highlands'))).toBe('meadow');
		expect(dominant(input(0.2, 0.5, 'highlands'))).toBe('windsweptHills');
		expect(dominant(input(0.05, 0.6, 'highlands'))).toBe('grove');
		expect(dominant(input(0.8, 0.2, 'highlands'))).toBe('savannaPlateau');
		expect(dominant(input(0.1, 0.5, 'mountains'))).toBe('snowySlopes');
	});

	it('puts the swamp only on warm, very wet, low lowland (Q16)', () => {
		expect(dominant(input(0.6, 0.92, 'plains', 0, 2))).toBe('swamp');
		expect(dominant(input(0.6, 0.92, 'plains', 0, 30))).not.toBe('swamp');
		expect(dominant(input(0.6, 0.92, 'highlands', 0, 2))).not.toBe('swamp');
		expect(dominant(input(0.6, 0.6, 'plains', 0, 2))).not.toBe('swamp');
	});

	it('replaces part of a parent with its variant where rarity is high (Q12)', () => {
		expect(dominant(input(0.43, 0.45, 'plains', 0.99))).toBe('flowerForest');
		expect(dominant(input(0.43, 0.45, 'plains', 0.5))).toBe('forest');
		expect(dominant(input(0.4, 0.15, 'plains', 0.99))).toBe('sunflowerPlains');
		expect(dominant(input(0.45, 0.5, 'highlands', 0.99))).toBe('cherryGrove');
		expect(dominant(input(0.92, 0.85, 'plains', 0.99))).toBe('bambooJungle');
		expect(dominant(input(0.45, 0.75, 'plains', 0.99))).toBe('silverwood');
		expect(dominant(input(0.27, 0.45, 'plains', 0.99))).toBe('oldGrowthBirch');
	});

	it('produces no variants when variant rarity is zero', () => {
		const settings = { ...createDefaultBiomeSettings(), variantRarity: 0 };
		const out = createBiomeWeightVector();
		classifyBiomes(input(0.43, 0.45, 'plains', 1), settings, out);
		expect(out[biomeIndex('flowerForest')]).toBe(0);
		expect(out[biomeIndex('forest')]).toBe(1);
	});

	it('blends at a border, and sharper settings narrow the blend', () => {
		const soft = { ...createDefaultBiomeSettings(), borderSharpness: 1 };
		const sharp = { ...createDefaultBiomeSettings(), borderSharpness: 6 };
		const border = input(0.36 + 0.012, 0.45); // just inside forest, near the birch edge
		const a = createBiomeWeightVector();
		const b = createBiomeWeightVector();
		classifyBiomes(border, soft, a);
		classifyBiomes(border, sharp, b);
		expect(a[biomeIndex('birchForest')]).toBeGreaterThan(0.05);
		expect(b[biomeIndex('birchForest')]).toBeLessThan(a[biomeIndex('birchForest')]);
		expect(b[biomeIndex('forest')]).toBeGreaterThan(a[biomeIndex('forest')]);
	});

	it('blends lowland and highland biomes for the same climate across a landform change', () => {
		const out = createBiomeWeightVector();
		const mixed = input(0.45, 0.5, 'plains');
		mixed.landform.lowland = 0.5;
		mixed.landform.highland = 0.5;
		classifyBiomes(mixed, { ...createDefaultBiomeSettings(), borderSharpness: 1 }, out);
		expect(out[biomeIndex('forest')]).toBeCloseTo(0.5, 2);
		expect(out[biomeIndex('meadow')]).toBeCloseTo(0.5, 2);
	});

	it('derives contiguous landform classes that always sum to exactly 1', () => {
		const out = { lowland: 0, highland: 0, mountain: 0 };
		for (let macro = -15; macro <= 15; macro += 0.25) {
			for (const mountainWeight of [0, 0.3, 0.7, 1]) {
				for (const range of [0, 0.5, 1]) {
					landformClasses(macro, mountainWeight, range, out);
					expect(out.lowland + out.highland + out.mountain).toBe(1);
					expect(Math.min(out.lowland, out.highland, out.mountain)).toBeGreaterThanOrEqual(0);
				}
			}
		}
		// Raised plateaus are upland; low ground is lowland.
		expect(landformClasses(12, 0, 0, out).highland).toBe(1);
		expect(landformClasses(0, 0, 0, out).lowland).toBe(1);
		// Flat ground the landform mask calls "mountains" but with no range rising is not mountain.
		expect(landformClasses(0, 1, 0, out).mountain).toBe(0);
		// A real range is mountain whether it rises from lowland or from a plateau.
		expect(landformClasses(0, 1, 1, out).mountain).toBe(1);
		expect(landformClasses(12, 1, 1, out).mountain).toBe(1);
	});
});
