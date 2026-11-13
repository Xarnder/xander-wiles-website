import { describe, expect, it } from 'vitest';
import { BIOME_DEFINITIONS, biomeIndex, getBiomeDefinition } from '../biomeDefinitions';
import { BIOME_IDS, type LandformClass } from '../BiomeTypes';

const LANDFORMS: LandformClass[] = ['lowland', 'highland', 'mountain'];

describe('biome definitions', () => {
	it('defines exactly the 26 agreed biomes, index-aligned and unique (Q1)', () => {
		expect(BIOME_IDS).toHaveLength(26);
		expect(new Set(BIOME_IDS).size).toBe(26);
		BIOME_DEFINITIONS.forEach((def, i) => expect(def.id).toBe(BIOME_IDS[i]));
	});

	it('keeps the append-only id order (saved weights and hashes are index-based)', () => {
		// Changing this list breaks every lattice tile and the determinism golden: append only.
		expect(BIOME_IDS.slice(0, 5)).toEqual([
			'forest',
			'flowerForest',
			'birchForest',
			'oldGrowthBirch',
			'darkForest'
		]);
		expect(BIOME_IDS[25]).toBe('tropicalDryGrassland');
	});

	it("uses Forest Drift's own names for the two most distinctive biomes (Q2)", () => {
		expect(getBiomeDefinition('silverwood').name).toBe('Silverwood');
		expect(getBiomeDefinition('sunlitWood').name).toBe('Sunlit Wood');
	});

	it('gives every variant a base-biome parent and the six agreed variants (Q12)', () => {
		const variants = BIOME_DEFINITIONS.filter((d) => d.overlay?.kind === 'variant');
		expect(variants.map((v) => v.id).sort()).toEqual(
			[
				'bambooJungle',
				'cherryGrove',
				'flowerForest',
				'oldGrowthBirch',
				'silverwood',
				'sunflowerPlains'
			].sort()
		);
		for (const v of variants) {
			if (v.overlay?.kind !== 'variant') throw new Error('unreachable');
			const parent = getBiomeDefinition(v.overlay.parent);
			expect(parent.overlay, `${v.id} parent`).toBeUndefined();
			expect(parent.boxes.length, `${v.id} parent has boxes`).toBeGreaterThan(0);
			expect(v.group).toBe(parent.group);
		}
	});

	it('has valid boxes and debug colours', () => {
		for (const def of BIOME_DEFINITIONS) {
			expect(def.debugColor).toMatch(/^#[0-9a-f]{6}$/i);
			for (const b of def.boxes) {
				expect(b.temperature[0]).toBeGreaterThanOrEqual(0);
				expect(b.temperature[1]).toBeLessThanOrEqual(1);
				expect(b.temperature[0]).toBeLessThan(b.temperature[1]);
				expect(b.moisture[0]).toBeGreaterThanOrEqual(0);
				expect(b.moisture[1]).toBeLessThanOrEqual(1);
				expect(b.moisture[0]).toBeLessThan(b.moisture[1]);
			}
		}
	});

	it.each(LANDFORMS)(
		'base boxes cover every %s climate exactly once (no gaps, no overlaps)',
		(landform) => {
			const boxes = BIOME_DEFINITIONS.flatMap((def) =>
				def.boxes.filter((b) => b.landform === landform).map((b) => ({ id: def.id, ...b }))
			);
			// A grid offset from every box edge (edges are multiples of 0.01).
			for (let t = 0.0025; t < 1; t += 0.005) {
				for (let m = 0.0025; m < 1; m += 0.005) {
					const hits = boxes.filter(
						(b) =>
							t >= b.temperature[0] &&
							t < b.temperature[1] &&
							m >= b.moisture[0] &&
							m < b.moisture[1]
					);
					expect(hits.length, `${landform} t=${t.toFixed(4)} m=${m.toFixed(4)}`).toBe(1);
				}
			}
		}
	);

	it('places every base biome on at least one landform', () => {
		for (const def of BIOME_DEFINITIONS) {
			if (def.overlay) continue;
			expect(def.boxes.length, def.id).toBeGreaterThan(0);
		}
		expect(biomeIndex('swamp')).toBeGreaterThanOrEqual(0);
		expect(getBiomeDefinition('swamp').overlay?.kind).toBe('lowWet');
	});
});
