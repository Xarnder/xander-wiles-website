import { describe, expect, it } from 'vitest';
import { BIOME_COUNT, createDefaultBiomeSettings } from '../../biomes/BiomeTypes';
import { createDefaultHydrologySettings } from '../../hydrology/HydrologyTypes';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { getDefaultWorldDefinition } from '../../world/DefaultWorld';
import { BiomeField } from '../../biomes/BiomeField';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { SCAN_SPACING } from '../biomeSearch';
import { MapWorld, mapWorldSettingsOf, type MapWorldSettings } from '../mapWorld';

/**
 * Find a biome Phase 0, assumption 2: does a 64 m grid find every patch worth pinning? Samples
 * 8 km round a spawn at 32 m, flood-fills every patch, and checks each patch at least ~160 m across
 * (a 5 × 5 block of its own cells) has a 64 m grid point in it. Opt-in (a few seconds per world):
 * `FIND_BIOME_ACCURACY=1 npx vitest run --project server biomeScanAccuracy`.
 */
const FINE = SCAN_SPACING / 2;
const RINGS = 250;
const SIDE = 2 * RINGS + 1;

function world(seed: string): { settings: MapWorldSettings; x: number; z: number } {
	if (seed === 'main') {
		const w = getDefaultWorldDefinition();
		return { settings: mapWorldSettingsOf(w), x: w.player.position.x, z: w.player.position.z };
	}
	const terrain = { ...createDefaultTerrainSettings(), seed };
	const biomes = createDefaultBiomeSettings();
	const field = new BiomeField(new TerrainHeightSampler(terrain), biomes);
	field.setSeed(seed);
	const start = field.getSpawnOffset();
	return {
		settings: { seed, terrain, biomes, hydrology: createDefaultHydrologySettings() },
		x: start.x,
		z: start.z
	};
}

describe.skipIf(process.env.FIND_BIOME_ACCURACY !== '1')('64 m scan accuracy', () => {
	it.each(['main', 'forest', 'alpine', 'drift-42'])(
		'world %s',
		(seed) => {
			const { settings, x, z } = world(seed);
			const map = new MapWorld(settings);
			const grid = new Int8Array(SIDE * SIDE);
			for (let j = 0; j < SIDE; j++)
				for (let i = 0; i < SIDE; i++)
					grid[j * SIDE + i] = map.classify(x + (i - RINGS) * FINE, z + (j - RINGS) * FINE);
			const seen = new Uint8Array(grid.length);
			let patches = 0,
				sized = 0,
				missedSized = 0,
				missedAny = 0;
			const missedSizes: number[] = [];
			const perBiome = new Array(BIOME_COUNT).fill(0);
			for (let start = 0; start < grid.length; start++) {
				if (seen[start]) continue;
				const biome = grid[start];
				const stack = [start];
				seen[start] = 1;
				let cells = 0,
					deep = false,
					coarse = false;
				while (stack.length) {
					const index = stack.pop()!;
					cells++;
					const i = index % SIDE,
						j = (index - i) / SIDE;
					if ((i - RINGS) % 2 === 0 && (j - RINGS) % 2 === 0) coarse = true;
					if (!deep && i >= 2 && j >= 2 && i < SIDE - 2 && j < SIDE - 2) {
						let all = true;
						for (let b = -2; b <= 2 && all; b++)
							for (let a = -2; a <= 2 && all; a++)
								if (grid[(j + b) * SIDE + i + a] !== biome) all = false;
						deep = all;
					}
					for (let b = -1; b <= 1; b++)
						for (let a = -1; a <= 1; a++) {
							const ni = i + a,
								nj = j + b;
							if (ni < 0 || nj < 0 || ni >= SIDE || nj >= SIDE) continue;
							const next = nj * SIDE + ni;
							if (!seen[next] && grid[next] === biome) {
								seen[next] = 1;
								stack.push(next);
							}
						}
				}
				patches++;
				if (!coarse) missedAny++;
				if (deep) {
					sized++;
					perBiome[biome]++;
					if (!coarse) {
						missedSized++;
						missedSizes.push(cells);
					}
				}
			}
			console.log(
				`${seed}: ${patches} patches at 32 m within 8 km; ${sized} at least ~160 m across; ` +
					`64 m misses ${missedSized} of those (sizes in 32 m cells: ${missedSizes.join(', ') || '—'}) ` +
					`and ${missedAny} patches of any size`
			);
			expect(sized).toBeGreaterThan(0);
		},
		60_000
	);
});
