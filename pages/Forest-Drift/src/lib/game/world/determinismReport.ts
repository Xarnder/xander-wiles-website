import { BiomeField } from '../biomes/BiomeField';
import {
	cellGroupCentres,
	coatedRegionSpecies,
	regionSpecies
} from '../creatures/CreaturePopulationSystem';
import type { SpeciesGenome } from '../creatures/CreatureTypes';
import { BiomeTrees } from '../biomes/BiomeTrees';
import { TreeSpeciesSelector } from '../vegetation/trees/TreeSpeciesSelector';
import {
	BIOME_COUNT,
	BIOME_IDS,
	createBiomeWeightVector,
	createClimateSample,
	createDefaultBiomeSettings
} from '../biomes/BiomeTypes';
import { BaseTerrainSampler } from '../hydrology/BaseTerrainSampler';
import { HydrologySystem } from '../hydrology/HydrologySystem';
import { createDefaultHydrologySettings } from '../hydrology/HydrologyTypes';
import { TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../terrain/TerrainSettings';
import { TreePlacementGenerator } from '../vegetation/TreePlacementGenerator';
import { createDefaultVegetationSettings } from '../vegetation/VegetationTypes';
import { VegetationRegionSampler } from '../vegetation/VegetationRegionSampler';

/**
 * Every player's browser generates the world itself from the seed, so multiplayer needs every browser
 * engine to generate the *same* world. ECMAScript doesn't require `Math.tanh`, `Math.pow`, `Math.sin`
 * and friends to be bit-identical across engines, and the generators use them (plan §2.6).
 *
 * This report hashes what the generators produce for one seed, two ways:
 *
 *   - `exact`  — every value's full 64-bit pattern. A mismatch can be harmless last-bit noise.
 *   - `coarse` — values rounded to a millimetre (heights) or a decision (water/no water, tree/no
 *                tree). A mismatch here means players would see different terrain, lakes or trees.
 *
 * The Vitest suite compares Node against a stored golden report; the Playwright determinism test runs
 * the same code in Chromium, WebKit and Firefox and compares each one's coarse hashes against that
 * golden. Measured October 2026 over 23 seeds: every coarse hash matches in all three engines, while
 * the terrain and water exact hashes differ between engines (Chromium and WebKit agree on terrain only).
 */
export interface DeterminismSection {
	exact: string;
	coarse: string;
	count: number;
}

export interface DeterminismReport {
	seed: string;
	terrain: DeterminismSection;
	hydrology: DeterminismSection & { lakes: number; rivers: number };
	trees: DeterminismSection;
	/** Biome layout with default (enabled) biome settings: dominant biome and climate per point. */
	biomes: DeterminismSection;
	/** The same tree cells as `trees`, in a world with biomes on (biome forests and species). */
	biomeTrees: DeterminismSection;
	/** Creature herds in a world with biomes on: each group's biome and its coat colours. */
	biomeCreatures: DeterminismSection;
}

/** Terrain heights on a 100 × 100 grid covering about 3.7 km × 3.7 km. */
const TERRAIN_GRID = 100;
const TERRAIN_SPACING = 37.3;
/** Water on a 64 × 64 grid covering about 2 km × 2 km (several hydrology regions). */
const WATER_GRID = 64;
const WATER_SPACING = 31.7;
/** Tree cells in a 40 × 40 block. */
const TREE_CELLS = 40;
/** Biomes on a 64 × 64 grid covering about 12 km × 12 km (several climate cycles). */
const BIOME_GRID = 64;
const BIOME_SPACING = 189.7;
/** Creature cells: 16 × 16, one per 512 m region (8 cells apart), about 8 km × 8 km. */
const CREATURE_GRID = 16;
const CREATURE_STRIDE = 8;

export function computeDeterminismReport(seed: string): DeterminismReport {
	const terrainSettings = createDefaultTerrainSettings();
	terrainSettings.seed = seed;
	const terrain = new TerrainHeightSampler(terrainSettings);

	const terrainHash = new DualHash();
	for (let i = 0; i < TERRAIN_GRID; i++) {
		for (let j = 0; j < TERRAIN_GRID; j++) {
			const x = (i - TERRAIN_GRID / 2) * TERRAIN_SPACING + 0.37;
			const z = (j - TERRAIN_GRID / 2) * TERRAIN_SPACING - 0.61;
			const height = terrain.sample(x, z);
			terrainHash.exact(height);
			terrainHash.coarse(Math.round(height * 1000));
		}
	}

	const hydrologySettings = { ...createDefaultHydrologySettings(), enabled: true };
	const hydrology = new HydrologySystem(new BaseTerrainSampler(terrain), hydrologySettings, seed);
	const waterHash = new DualHash();
	for (let i = 0; i < WATER_GRID; i++) {
		for (let j = 0; j < WATER_GRID; j++) {
			const x = (i - WATER_GRID / 2) * WATER_SPACING + 0.13;
			const z = (j - WATER_GRID / 2) * WATER_SPACING + 0.29;
			const water = hydrology.sampleWater(x, z);
			waterHash.exact(water.terrainY);
			waterHash.exact(water.waterSurfaceY);
			waterHash.coarse(water.waterType === 'none' ? 0 : water.waterType === 'river' ? 1 : 2);
			waterHash.coarse(Math.round(water.terrainY * 100));
		}
	}
	const hydrologyStats = hydrology.getStats();

	const vegetationSettings = createDefaultVegetationSettings();
	const regions = new VegetationRegionSampler(vegetationSettings);
	regions.setSeed(seed);
	const trees = new TreePlacementGenerator(terrain, regions, vegetationSettings.trees, {
		getPrototypesPerSpecies: () => 4
	});
	trees.setSeed(seed);
	const treeHash = new DualHash();
	let treeCount = 0;
	for (let cx = -TREE_CELLS / 2; cx < TREE_CELLS / 2; cx++) {
		for (let cz = -TREE_CELLS / 2; cz < TREE_CELLS / 2; cz++) {
			const tree = trees.generateCell(cx, cz);
			if (!tree) {
				treeHash.coarse(-1);
				continue;
			}
			treeCount++;
			treeHash.exact(tree.worldX);
			treeHash.exact(tree.worldZ);
			treeHash.exact(tree.scale);
			treeHash.exact(tree.rotationY);
			treeHash.coarse(cx * 100_003 + cz);
			treeHash.coarse(tree.variant);
			treeHash.coarseText(tree.speciesId);
		}
	}

	// Biomes read only the pre-water terrain; `terrain` above has no hydrology attached.
	const biomeField = new BiomeField(terrain, createDefaultBiomeSettings());
	biomeField.setSeed(seed);
	const biomeWeights = createBiomeWeightVector();
	const climate = createClimateSample();
	const biomeHash = new DualHash();
	for (let i = 0; i < BIOME_GRID; i++) {
		for (let j = 0; j < BIOME_GRID; j++) {
			const x = (i - BIOME_GRID / 2) * BIOME_SPACING + 0.41;
			const z = (j - BIOME_GRID / 2) * BIOME_SPACING - 0.23;
			const dominant = biomeField.classifyPoint(x, z, biomeWeights, climate);
			for (let k = 0; k < BIOME_COUNT; k++) biomeHash.exact(biomeWeights[k]);
			// Visible decisions: which biome, and the climate behind it (already on a 1/4096 grid).
			biomeHash.coarse(dominant);
			biomeHash.coarse(Math.round(climate.temperature * 4096));
			biomeHash.coarse(Math.round(climate.moisture * 4096));
		}
	}

	const biomeTreeSettings = createDefaultVegetationSettings();
	const biomeSpecies = new TreeSpeciesSelector(biomeTreeSettings.species);
	const biomeTrees = new BiomeTrees(biomeField);
	biomeSpecies.setBiomeSource(biomeTrees);
	const biomeTreeRegions = new VegetationRegionSampler(biomeTreeSettings);
	biomeTreeRegions.setSeed(seed);
	const biomeTreeGenerator = new TreePlacementGenerator(
		terrain,
		biomeTreeRegions,
		biomeTreeSettings.trees,
		{ speciesSelector: biomeSpecies, getPrototypesPerSpecies: () => 4, biomes: biomeTrees }
	);
	biomeTreeGenerator.setSeed(seed);
	const biomeTreeHash = new DualHash();
	let biomeTreeCount = 0;
	for (let cx = -TREE_CELLS / 2; cx < TREE_CELLS / 2; cx++) {
		for (let cz = -TREE_CELLS / 2; cz < TREE_CELLS / 2; cz++) {
			const tree = biomeTreeGenerator.generateCell(cx, cz);
			if (!tree) {
				biomeTreeHash.coarse(-1);
				continue;
			}
			biomeTreeCount++;
			biomeTreeHash.exact(tree.worldX);
			biomeTreeHash.exact(tree.scale);
			biomeTreeHash.coarse(cx * 100_003 + cz);
			biomeTreeHash.coarse(tree.variant);
			biomeTreeHash.coarseText(tree.speciesId);
		}
	}

	// Biome coats: every group's centre, its biome and the colours its species wears there.
	const creatureHash = new DualHash();
	let creatureGroups = 0;
	const creatureRegions = new Map<string, SpeciesGenome[]>();
	for (let i = 0; i < CREATURE_GRID; i++)
		for (let j = 0; j < CREATURE_GRID; j++) {
			const cellX = (i - CREATURE_GRID / 2) * CREATURE_STRIDE + 3;
			const cellZ = (j - CREATURE_GRID / 2) * CREATURE_STRIDE + 5;
			const rx = Math.floor(cellX / 8),
				rz = Math.floor(cellZ / 8);
			const key = `${rx}:${rz}`;
			let list = creatureRegions.get(key);
			if (!list) creatureRegions.set(key, (list = regionSpecies(seed, rx, rz)));
			for (const centre of cellGroupCentres(seed, cellX, cellZ)) {
				const profile = BIOME_IDS[biomeField.dominantAt(centre.cx, centre.cz)];
				const species = coatedRegionSpecies(seed, rx, rz, list, profile)[centre.tier];
				const palette = species.appearance.palette;
				creatureHash.exact(centre.cx);
				creatureHash.exact(centre.cz);
				creatureHash.coarseText(profile);
				creatureHash.coarseText(species.id);
				creatureHash.coarseText(palette.primary + palette.secondary + palette.accent);
				creatureHash.coarseText(species.appearance.coat?.pattern ?? '');
				creatureHash.coarse(species.appearance.coat?.lightnessStep ?? -1);
				creatureGroups++;
			}
		}

	return {
		seed,
		terrain: terrainHash.result(TERRAIN_GRID * TERRAIN_GRID),
		hydrology: {
			...waterHash.result(WATER_GRID * WATER_GRID),
			lakes: hydrologyStats.lakes,
			rivers: hydrologyStats.rivers
		},
		trees: treeHash.result(treeCount),
		biomes: biomeHash.result(BIOME_GRID * BIOME_GRID),
		biomeTrees: biomeTreeHash.result(biomeTreeCount),
		biomeCreatures: creatureHash.result(creatureGroups)
	};
}

/** Two FNV-1a 32-bit hashes: one over exact float64 bit patterns, one over coarse integers. */
class DualHash {
	private exactState = 0x811c9dc5;
	private coarseState = 0x811c9dc5;
	private readonly view = new DataView(new ArrayBuffer(8));

	exact(value: number): void {
		this.view.setFloat64(0, value, true);
		for (let i = 0; i < 8; i++) this.exactState = fnv(this.exactState, this.view.getUint8(i));
	}

	coarse(value: number): void {
		this.view.setInt32(0, value | 0, true);
		for (let i = 0; i < 4; i++) this.coarseState = fnv(this.coarseState, this.view.getUint8(i));
	}

	coarseText(text: string): void {
		for (let i = 0; i < text.length; i++)
			this.coarseState = fnv(this.coarseState, text.charCodeAt(i) & 0xff);
	}

	result(count: number): DeterminismSection {
		return {
			exact: (this.exactState >>> 0).toString(16).padStart(8, '0'),
			coarse: (this.coarseState >>> 0).toString(16).padStart(8, '0'),
			count
		};
	}
}

function fnv(state: number, byte: number): number {
	return Math.imul(state ^ byte, 0x01000193) >>> 0;
}

/** The seeds the determinism tests cover: the default world's, a generated-style one, and an odd one. */
export const DETERMINISM_SEEDS = [
	'soft-lowlands-431',
	'peaceful-world',
	'Ünïcode seed #42'
] as const;
