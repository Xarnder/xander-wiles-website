import { describe, expect, it } from 'vitest';
import { hashStringToUint32 } from '../../../terrain/seededRandom';
import { compileCreatureGeometry } from '../../CreatureCompiler';
import { regionSpecies } from '../../CreaturePopulationSystem';
import type { CreaturePatternType, SpeciesGenome } from '../../CreatureTypes';
import { generateIndividual } from '../../IndividualGenerator';
import { generateSpecies } from '../../SpeciesGenerator';
import {
	PATTERN_TYPES,
	patternFor,
	patternMask,
	SAVED_PATTERN_TYPES,
	validateSurfaceGenome
} from '../../surface/CreaturePatternGenerator';
import { SURFACE_REGION } from '../../surface/CreatureSurfaceClassifier';
import {
	coatMorph,
	coatRegionSpecies,
	MORPH_RARITY,
	morphSpecies,
	recipeForSave,
	savedPattern
} from '../CreatureBiomeCoat';
import { hexToOklch } from '../oklch';

const NEW: CreaturePatternType[] = ['rosettes', 'reticulated', 'patches', 'speckle', 'saddle'];
const mid = (a: number, b: number) => (a + b) / 2;

describe('Phase 3 patterns', () => {
	it('are appended, so the original shader codes keep their meaning', () => {
		expect(PATTERN_TYPES.slice(0, 10)).toEqual(SAVED_PATTERN_TYPES);
		expect(PATTERN_TYPES.slice(10)).toEqual(NEW);
	});

	it('give bounded, visible masks', () => {
		for (const type of NEW) {
			const pattern = {
				...patternFor(type, 'quadruped', mid, 'dark'),
				offset: [3, 7, 11] as [number, number, number],
				phase: 0
			};
			let on = 0,
				off = 0;
			for (let i = 0; i < 4000; i++) {
				const h = hashStringToUint32(`${type}:${i}`);
				const p = {
					x: ((h & 1023) / 1023 - 0.5) * 0.6,
					y: (((h >> 10) & 1023) / 1023) * 0.5,
					z: ((h >> 20) & 1023) / 1023 - 0.5
				};
				const u = ((h >> 5) & 1023) / 1023;
				const m = patternMask(pattern, p, u, type === 'saddle' ? 1 : (h & 255) / 127.5 - 1);
				expect(m).toBeGreaterThanOrEqual(0);
				expect(m).toBeLessThanOrEqual(1);
				if (m > 0.5) on++;
				else if (m < 0.05) off++;
			}
			expect(on, type).toBeGreaterThan(40);
			expect(off, type).toBeGreaterThan(40);
		}
	});

	it('keeps the saddle on the back of the mid-torso', () => {
		const saddle = {
			...patternFor('saddle', 'quadruped', mid, 'dark'),
			offset: [0, 0, 0] as [number, number, number],
			phase: 0
		};
		const p = { x: 0, y: 0, z: 0 };
		expect(patternMask(saddle, p, 0.5, 1)).toBeGreaterThan(0.9);
		expect(patternMask(saddle, p, 0.5, -1)).toBe(0);
		expect(patternMask(saddle, p, 0.02, 1)).toBe(0);
	});

	it('are never saved: placing maps them to the original ten (Q18)', () => {
		for (const type of NEW) expect(SAVED_PATTERN_TYPES).toContain(savedPattern(type));
		const species = generateSpecies(9, 'quadruped');
		const surface = {
			...species.appearance.surface!,
			primaryPattern: { ...species.appearance.surface!.primaryPattern, type: 'rosettes' as const }
		};
		expect(validateSurfaceGenome(surface)).toMatch(/pattern/);
		const recipe = recipeForSave({ ...species, appearance: { ...species.appearance, surface } });
		expect(recipe.appearance.surface!.primaryPattern.type).toBe('spots');
		expect(validateSurfaceGenome(recipe.appearance.surface)).toBeNull();
	});
});

describe('rare morphs (Q14)', () => {
	it('come up about once in 60, the same every time', () => {
		let count = 0;
		for (let i = 0; i < 12000; i++)
			if (coatMorph(`group:seed:${i % 97}:${i % 13}:${i % 4}`, i)) count++;
		expect(count / 12000).toBeGreaterThan(0.6 / MORPH_RARITY);
		expect(count / 12000).toBeLessThan(1.5 / MORPH_RARITY);
		expect(coatMorph('group:a:1:2:3', 4)).toBe(coatMorph('group:a:1:2:3', 4));
	});

	it('make pale and dark individuals that keep their species accent and identity', () => {
		const [species] = coatRegionSpecies(regionSpecies('morphs', 0, 0), 'forest', 'morphs', '0:0');
		const pale = morphSpecies(species, 'pale');
		const dark = morphSpecies(species, 'dark');
		const l = (s: SpeciesGenome) => hexToOklch(s.appearance.palette.primary).l;
		expect(l(pale)).toBeGreaterThan(l(species) + 0.1);
		expect(l(dark)).toBeLessThan(l(species) - 0.1);
		expect(pale.appearance.palette.accent).toBe(species.appearance.palette.accent);
		expect(pale.id).toBe(species.id);
		expect(pale.appearance.coat!.morph).toBe('pale');
		expect(morphSpecies(species, 'pale')).toBe(pale);
		expect(recipeForSave(pale).id).toBe(`${species.id}_forest_pale`);
	});
});

describe('small-feature colour', () => {
	it('rings horns rather than colouring them flat', () => {
		let checked = 0;
		for (let seed = 1; seed < 80 && checked < 3; seed++) {
			const species = generateSpecies(seed, 'quadruped');
			if (!species.anatomy.features.includes('horns')) continue;
			const c = compileCreatureGeometry({ species, individual: generateIndividual(species, 1) }, 0);
			const g = c.geometry;
			const lightness: number[] = [];
			for (let v = 0; v < g.surface.length / 4; v++)
				if (g.surface[v * 4 + 3] === SURFACE_REGION.HORN)
					lightness.push(g.colors[v * 3] + g.colors[v * 3 + 1] + g.colors[v * 3 + 2]);
			if (lightness.length < 10) continue;
			expect(Math.max(...lightness) - Math.min(...lightness)).toBeGreaterThan(0.08);
			checked++;
		}
		expect(checked).toBeGreaterThan(0);
	});
});
