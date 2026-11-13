import { describe, expect, it } from 'vitest';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { BiomeField } from '../BiomeField';
import { BIOME_DEFINITIONS, biomeIndex } from '../biomeDefinitions';
import {
	BIOME_GROUPS,
	BIOME_IDS,
	createBiomeWeightVector,
	createDefaultBiomeSettings,
	type BiomeGroup,
	type BiomeId
} from '../BiomeTypes';

/**
 * World-scale properties over many seeds. Points are classified directly (no lattice), so these
 * measure the biome layout itself. All of this runs in well under a few seconds.
 */

function makeField(seed: string) {
	const terrainSettings = createDefaultTerrainSettings();
	terrainSettings.seed = seed;
	const f = new BiomeField(new TerrainHeightSampler(terrainSettings), createDefaultBiomeSettings());
	f.setSeed(seed);
	return f;
}

const SEEDS = Array.from({ length: 16 }, (_, i) => `world-${i}`);

describe('biome composition (Q14)', () => {
	it('matches the agreed share per group within ±5 percentage points', () => {
		const target: Record<BiomeGroup, number> = {
			temperate: 40,
			cold: 20,
			warmDry: 22,
			tropical: 12,
			swamp: 6
		};
		const totals: Record<BiomeGroup, number> = {
			temperate: 0,
			cold: 0,
			warmDry: 0,
			tropical: 0,
			swamp: 0
		};
		const w = createBiomeWeightVector();
		let count = 0;
		for (const seed of SEEDS) {
			const f = makeField(seed);
			for (let x = -30_000; x <= 30_000; x += 400) {
				for (let z = -30_000; z <= 30_000; z += 400) {
					f.classifyPoint(x, z, w);
					for (let k = 0; k < w.length; k++) totals[BIOME_DEFINITIONS[k].group] += w[k];
					count++;
				}
			}
		}
		for (const group of BIOME_GROUPS) {
			const share = (100 * totals[group]) / count;
			expect(Math.abs(share - target[group]), `${group} = ${share.toFixed(1)}%`).toBeLessThan(5);
		}
	});

	it('has every biome within 10 km of the spawn point on at least 90% of seeds', () => {
		const w = createBiomeWeightVector();
		const seen = new Map<BiomeId, number>();
		for (const seed of SEEDS) {
			const f = makeField(seed);
			const here = new Set<BiomeId>();
			for (let x = -10_000; x <= 10_000; x += 160) {
				for (let z = -10_000; z <= 10_000; z += 160) {
					const d = f.classifyPoint(x, z, w);
					if (w[d] > 0.5) here.add(BIOME_IDS[d]);
				}
			}
			for (const id of here) seen.set(id, (seen.get(id) ?? 0) + 1);
		}
		for (const id of BIOME_IDS) {
			expect(seen.get(id) ?? 0, id).toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * 0.9));
		}
	});
});

describe('biome size (Q10)', () => {
	it('changes biome every 470–710 m along a straight walk (typical diameter 600–900 m)', () => {
		// A straight line through a region of diameter D crosses it in ~π/4·D on average, so the
		// 600–900 m target diameter is ~470–710 m between changes. Changes must hold for 64 m to
		// count, so a walk along a blended border isn't counted as many changes.
		const w = createBiomeWeightVector();
		let changes = 0;
		let distance = 0;
		for (const seed of SEEDS.slice(0, 12)) {
			const f = makeField(seed);
			for (let line = 0; line < 6; line++) {
				const angle = line * 1.047;
				let current = -1;
				let candidate = -1;
				let run = 0;
				for (let s = 0; s < 8000; s += 16) {
					const d = f.classifyPoint(Math.cos(angle) * s + line * 300, Math.sin(angle) * s, w);
					distance += 16;
					if (current < 0) current = d;
					else if (d === current) {
						candidate = -1;
						run = 0;
					} else {
						run = d === candidate ? run + 16 : 16;
						candidate = d;
						if (run >= 64) {
							changes++;
							current = d;
							candidate = -1;
							run = 0;
						}
					}
				}
			}
		}
		const metresPerChange = distance / changes;
		expect(metresPerChange).toBeGreaterThan(470);
		expect(metresPerChange).toBeLessThan(710);
	});
});

describe('impossible neighbours (Q13)', () => {
	const COLD = new Set(
		(['snowyPlains', 'snowyTaiga', 'grove', 'snowySlopes'] as const).map(biomeIndex)
	);
	const HOT = new Set(
		(['desert', 'jungle', 'sparseJungle', 'bambooJungle'] as const).map(biomeIndex)
	);

	it('never blends snow with desert or jungle, at a point or across a 96 m neighbourhood', () => {
		const here = createBiomeWeightVector();
		const there = createBiomeWeightVector();
		const has = (w: Float32Array, set: Set<number>) => [...set].some((k) => w[k] > 0);
		for (const seed of SEEDS.slice(0, 8)) {
			const f = makeField(seed);
			for (let x = -20_000; x <= 20_000; x += 250) {
				for (let z = -20_000; z <= 20_000; z += 250) {
					f.classifyPoint(x, z, here);
					const cold = has(here, COLD);
					const hot = has(here, HOT);
					expect(cold && hot, `${seed} @ ${x},${z}`).toBe(false);
					if (!cold && !hot) continue;
					f.classifyPoint(x + 96, z, there);
					expect(has(there, cold ? HOT : COLD), `${seed} @ ${x},${z} → x+96`).toBe(false);
					f.classifyPoint(x, z + 96, there);
					expect(has(there, cold ? HOT : COLD), `${seed} @ ${x},${z} → z+96`).toBe(false);
				}
			}
		}
	});
});

describe('spawn (Q21)', () => {
	it('spawns in a gentle temperate biome on every seed', () => {
		const gentle = new Set<BiomeId>([
			'plains',
			'sunflowerPlains',
			'forest',
			'flowerForest',
			'birchForest',
			'oldGrowthBirch',
			'sunlitWood',
			'meadow',
			'cherryGrove'
		]);
		const w = createBiomeWeightVector();
		for (let i = 0; i < 40; i++) {
			const seed = `spawn-${i}`;
			const d = makeField(seed).classifyPoint(0, 0, w);
			expect(gentle.has(BIOME_IDS[d]), `${seed}: ${BIOME_IDS[d]}`).toBe(true);
		}
	});
});
