import { BiomeField } from '../biomes/BiomeField';
import type { BiomeSettings } from '../biomes/BiomeTypes';
import { BaseTerrainSampler } from '../hydrology/BaseTerrainSampler';
import { clampedHydrology } from '../hydrology/HydrologyMath';
import { HydrologySystem } from '../hydrology/HydrologySystem';
import type { HydrologySettings } from '../hydrology/HydrologyTypes';
import { TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import type { TerrainSettings } from '../terrain/TerrainSettings';
import type { WorldEnvironmentDefinition } from '../world/WorldTypes';
import {
	drawLand,
	drawWater,
	metresPerPixel,
	TILE_PIXELS,
	tileMetres,
	type MapLandSource
} from './biomeMapTiles';

/** Everything the map needs to know about a world: what the game's own systems are built from. */
export interface MapWorldSettings {
	seed: string;
	terrain: TerrainSettings;
	biomes: BiomeSettings;
	hydrology: HydrologySettings;
}

/** Bytes in one tile's RGBA pixels. */
export const TILE_BYTES = TILE_PIXELS * TILE_PIXELS * 4;

/**
 * A world's terrain, biomes and water, built the way the game builds them (the same seed, the same
 * settings, so the same answers), for drawing map tiles. Lives in the map worker; separate from the
 * game's own instances, so it never evicts their caches or runs on the main thread.
 */
export class MapWorld {
	readonly terrain: TerrainHeightSampler;
	readonly biomes: BiomeField | null;
	readonly hydrology: HydrologySystem | null;
	private readonly source: MapLandSource;

	constructor(settings: MapWorldSettings) {
		this.terrain = new TerrainHeightSampler({ ...settings.terrain, seed: settings.seed });
		const biomes = settings.biomes.enabled ? new BiomeField(this.terrain, settings.biomes) : null;
		biomes?.setSeed(settings.seed);
		this.biomes = biomes;
		this.hydrology = settings.hydrology.enabled
			? new HydrologySystem(new BaseTerrainSampler(this.terrain), settings.hydrology, settings.seed)
			: null;
		const terrain = this.terrain;
		this.source = {
			biomeWeights: biomes
				? (x, z, exact, out) =>
						exact ? biomes.classifyPoint(x, z, out) : biomes.weightsAt(x, z, out)
				: null,
			baseHeight: (x, z) => terrain.sampleBase(x, z),
			lastHeight: biomes ? () => biomes.lastBaseElevation() : undefined
		};
	}

	/** Draws a tile's land (biomes or neutral land, hill shading) into `out`. */
	drawLand(level: number, tx: number, tz: number, out: Uint8ClampedArray, dominant?: Int8Array) {
		drawLand(this.source, level, tx, tz, out, dominant);
	}

	/**
	 * Builds the hydrology regions that can reach a tile (a region's 3 × 3 neighbourhood is built by
	 * `ensureSync`), then draws its rivers and lakes over `out`. Returns false with water off.
	 */
	drawWater(level: number, tx: number, tz: number, out: Uint8ClampedArray): boolean {
		const hydrology = this.hydrology;
		if (!hydrology) return false;
		const { regionSize } = clampedHydrology(hydrology.settings);
		const size = tileMetres(level);
		const x0 = tx * size,
			z0 = tz * size;
		const step = Math.min(size, regionSize);
		for (let z = z0 + step / 2; z < z0 + size + step / 2; z += step)
			for (let x = x0 + step / 2; x < x0 + size + step / 2; x += step)
				hydrology.ensureSync(
					Math.min(x, x0 + size - metresPerPixel(level)),
					Math.min(z, z0 + size - metresPerPixel(level))
				);
		drawWater(hydrology.getRivers(), hydrology.getLakes(), level, tx, tz, out);
		return true;
	}
}

/** The map settings of a saved world (its own seed is the authoritative one). */
export function mapWorldSettingsOf(world: {
	seed: string;
	environment: Pick<WorldEnvironmentDefinition, 'terrain' | 'biomes' | 'hydrology'>;
}): MapWorldSettings {
	return {
		seed: world.seed,
		terrain: { ...world.environment.terrain, seed: world.seed },
		biomes: world.environment.biomes,
		hydrology: world.environment.hydrology
	};
}
