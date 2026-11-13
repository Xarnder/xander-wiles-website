import { BiomeField } from '../../biomes/BiomeField';
import { BIOME_IDS, sanitizeBiomeSettings } from '../../biomes/BiomeTypes';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings, type TerrainSettings } from '../../terrain/TerrainSettings';
import type { HerdBiomeSources } from '../CreaturePopulationSystem';

/**
 * The multiplayer room's view of biomes (biome-specific species, decision Q8): built from the
 * published world's terrain and biome settings, so the room resolves the same species from a
 * creature id as every client does, and its carry and ride checks stay exact. Biomes read only the
 * pre-water base terrain, so no hydrology or edits are involved. Pure (no Three.js, no DOM): it
 * runs in the Worker. Returns null when biomes are off or the settings can't be read — the room
 * then uses today's regional species, which is right for biomes-off worlds.
 */
export function roomBiomeSources(baseWorldJson: string | null): HerdBiomeSources | null {
	if (!baseWorldJson) return null;
	try {
		const world = JSON.parse(baseWorldJson) as {
			seed?: unknown;
			environment?: { terrain?: Partial<TerrainSettings>; biomes?: unknown };
		};
		const biomes = sanitizeBiomeSettings(world.environment?.biomes);
		if (!biomes?.enabled) return null;
		const seed = String(world.environment?.terrain?.seed ?? world.seed ?? '');
		if (!seed) return null;
		const terrain: TerrainSettings = {
			...createDefaultTerrainSettings(),
			...world.environment?.terrain,
			seed
		};
		const field = new BiomeField(new TerrainHeightSampler(terrain), biomes);
		field.setSeed(seed);
		return { rosterAt: (x, z) => BIOME_IDS[field.dominantAt(x, z)] };
	} catch {
		return null;
	}
}
