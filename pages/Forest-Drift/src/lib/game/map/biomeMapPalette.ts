import { BIOME_COUNT, BIOME_IDS, type BiomeId } from '../biomes/BiomeTypes';
import { oklchToHex, type Oklch } from '../creatures/biome/oklch';

/**
 * The biome map's colours (biome minimap, decision Q9): a palette made for reading a map, not the
 * debug view's. Biomes keep a hint of how they look (sand, snow, deep green), grouped by hue:
 * greens for temperate forest, blue-greys for the cold, saturated greens for the tropics, ochres
 * for dry land, olive for the swamp. Within a group they differ in lightness first, so neighbours
 * stay apart for colour-blind players too (checked in the palette tests against the biome pairs
 * that actually border each other).
 *
 * Defined in OKLCh (perceptual lightness), converted once to sRGB bytes.
 */
export const BIOME_MAP_OKLCH: Readonly<Record<BiomeId, Oklch>> = {
	// Temperate forests and open land.
	forest: { l: 0.55, c: 0.11, h: 140 },
	flowerForest: { l: 0.6, c: 0.1, h: 345 },
	birchForest: { l: 0.68, c: 0.11, h: 128 },
	oldGrowthBirch: { l: 0.78, c: 0.07, h: 135 },
	darkForest: { l: 0.4, c: 0.07, h: 150 },
	silverwood: { l: 0.73, c: 0.02, h: 150 },
	sunlitWood: { l: 0.64, c: 0.13, h: 112 },
	meadow: { l: 0.89, c: 0.08, h: 150 },
	cherryGrove: { l: 0.82, c: 0.07, h: 355 },
	plains: { l: 0.8, c: 0.1, h: 115 },
	sunflowerPlains: { l: 0.88, c: 0.16, h: 102 },
	// Cold.
	taiga: { l: 0.47, c: 0.05, h: 195 },
	snowyTaiga: { l: 0.79, c: 0.04, h: 215 },
	grove: { l: 0.57, c: 0.055, h: 165 },
	snowySlopes: { l: 0.91, c: 0.015, h: 240 },
	windsweptHills: { l: 0.66, c: 0.02, h: 90 },
	snowyPlains: { l: 0.97, c: 0.005, h: 250 },
	// Tropical.
	jungle: { l: 0.45, c: 0.13, h: 152 },
	sparseJungle: { l: 0.62, c: 0.16, h: 155 },
	bambooJungle: { l: 0.7, c: 0.18, h: 138 },
	// Dry.
	desert: { l: 0.91, c: 0.06, h: 90 },
	savanna: { l: 0.72, c: 0.12, h: 75 },
	savannaPlateau: { l: 0.55, c: 0.1, h: 55 },
	shrubSavanna: { l: 0.83, c: 0.07, h: 55 },
	tropicalDryGrassland: { l: 0.92, c: 0.09, h: 85 },
	// Wet.
	swamp: { l: 0.52, c: 0.06, h: 100 }
};

/** Land with biomes off (Q8): a quiet green-grey, so the shading and water carry the map. */
export const NEUTRAL_LAND_OKLCH: Oklch = { l: 0.72, c: 0.05, h: 130 };
/** Rivers and lakes. */
export const WATER_OKLCH: Oklch = { l: 0.6, c: 0.09, h: 235 };

function rgb(colour: Oklch): [number, number, number] {
	const hex = oklchToHex(colour);
	return [
		parseInt(hex.slice(1, 3), 16),
		parseInt(hex.slice(3, 5), 16),
		parseInt(hex.slice(5, 7), 16)
	];
}

/** sRGB bytes per biome, index-aligned with `BIOME_IDS` (3 per biome). */
export const BIOME_MAP_RGB: Uint8Array = (() => {
	const out = new Uint8Array(BIOME_COUNT * 3);
	BIOME_IDS.forEach((id, i) => out.set(rgb(BIOME_MAP_OKLCH[id]), i * 3));
	return out;
})();
export const NEUTRAL_LAND_RGB = rgb(NEUTRAL_LAND_OKLCH);
export const WATER_RGB = rgb(WATER_OKLCH);

/** `#rrggbb` of a biome's map colour (legends, tests, the developer preview). */
export function biomeMapHex(index: number): string {
	return oklchToHex(BIOME_MAP_OKLCH[BIOME_IDS[index]]);
}
