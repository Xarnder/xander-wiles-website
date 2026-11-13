import { BIOME_IDS, type BiomeId } from './BiomeTypes';

type Rgb = readonly [number, number, number];

/**
 * Weather, fog and water per biome (Phase 5). Plain data, blended at the camera by `LocalClimate`.
 *
 * - `precipitation` scales the shared weather's rain and snow here: 0 in the desert (a dry
 *   overcast), above 1 in jungles and swamps. Whether it falls as rain or snow comes from the local
 *   temperature, not from this table.
 * - `fog` tints and thickens the distance haze: humid jungle air, swamp mist, desert dust, cold blue
 *   snowfields. `amount` is capped at 0.3 and `density` at 1.7, so day/night and weather always lead.
 * - `water` multiplies river and lake body colour: darker and greener in swamps, bluer in the cold.
 */
export interface BiomeAtmosphereProfile {
	precipitation: number;
	fog: { color: Rgb; amount: number; density: number };
	water: Rgb;
}

const NONE = { color: [1, 1, 1] as Rgb, amount: 0, density: 1 };
const CLEAR_WATER: Rgb = [1, 1, 1];
const COLD_FOG = { color: [0.86, 0.91, 0.96] as Rgb, amount: 0.18, density: 1.15 };
const COLD_WATER: Rgb = [0.86, 0.96, 1.12];
const DUST = (amount: number, density: number) => ({
	color: [0.92, 0.82, 0.64] as Rgb,
	amount,
	density
});
const HUMID = (amount: number, density: number) => ({
	color: [0.8, 0.9, 0.82] as Rgb,
	amount,
	density
});

const PROFILES: Record<BiomeId, BiomeAtmosphereProfile> = {
	plains: { precipitation: 1, fog: NONE, water: CLEAR_WATER },
	sunflowerPlains: { precipitation: 1, fog: NONE, water: CLEAR_WATER },
	forest: { precipitation: 1, fog: NONE, water: CLEAR_WATER },
	flowerForest: { precipitation: 1, fog: NONE, water: CLEAR_WATER },
	birchForest: { precipitation: 1, fog: NONE, water: CLEAR_WATER },
	oldGrowthBirch: {
		precipitation: 1,
		fog: { color: [0.84, 0.9, 0.84], amount: 0.08, density: 1.1 },
		water: CLEAR_WATER
	},
	darkForest: {
		precipitation: 1.05,
		fog: { color: [0.56, 0.63, 0.54], amount: 0.15, density: 1.2 },
		water: [0.85, 0.92, 0.82]
	},
	silverwood: {
		precipitation: 1,
		fog: { color: [0.78, 0.82, 0.8], amount: 0.25, density: 1.5 },
		water: [0.92, 0.95, 0.95]
	},
	sunlitWood: { precipitation: 1, fog: NONE, water: CLEAR_WATER },
	taiga: {
		precipitation: 1,
		fog: { color: [0.79, 0.85, 0.86], amount: 0.08, density: 1.05 },
		water: [0.92, 0.98, 1.05]
	},
	snowyTaiga: { precipitation: 1, fog: COLD_FOG, water: COLD_WATER },
	jungle: { precipitation: 1.35, fog: HUMID(0.2, 1.4), water: [0.85, 1.02, 0.86] },
	sparseJungle: { precipitation: 1.15, fog: HUMID(0.12, 1.2), water: [0.92, 1.02, 0.92] },
	bambooJungle: { precipitation: 1.3, fog: HUMID(0.18, 1.35), water: [0.86, 1.02, 0.86] },
	meadow: { precipitation: 1, fog: NONE, water: CLEAR_WATER },
	cherryGrove: {
		precipitation: 1,
		fog: { color: [0.96, 0.86, 0.9], amount: 0.12, density: 1 },
		water: CLEAR_WATER
	},
	grove: { precipitation: 1, fog: COLD_FOG, water: COLD_WATER },
	snowySlopes: {
		precipitation: 1,
		fog: { ...COLD_FOG, amount: 0.22, density: 1.3 },
		water: COLD_WATER
	},
	windsweptHills: {
		precipitation: 0.9,
		fog: { color: [0.8, 0.82, 0.82], amount: 0.08, density: 1.05 },
		water: [0.95, 0.98, 1.02]
	},
	snowyPlains: { precipitation: 0.9, fog: COLD_FOG, water: COLD_WATER },
	desert: { precipitation: 0, fog: DUST(0.25, 1.25), water: [1.05, 1.02, 0.92] },
	savanna: { precipitation: 0.5, fog: DUST(0.12, 1.05), water: CLEAR_WATER },
	savannaPlateau: { precipitation: 0.5, fog: DUST(0.12, 1.05), water: CLEAR_WATER },
	swamp: {
		precipitation: 1.3,
		fog: { color: [0.66, 0.73, 0.62], amount: 0.3, density: 1.7 },
		water: [0.62, 0.78, 0.5]
	},
	shrubSavanna: { precipitation: 0.25, fog: DUST(0.18, 1.15), water: CLEAR_WATER },
	tropicalDryGrassland: { precipitation: 0.8, fog: DUST(0.08, 1), water: CLEAR_WATER }
};

/** Index-aligned with BIOME_IDS. */
export const BIOME_ATMOSPHERE_PROFILES: readonly BiomeAtmosphereProfile[] = BIOME_IDS.map(
	(id) => PROFILES[id]
);

/** Hard caps (decision Q26): biome atmosphere never overrides the day cycle or the weather. */
export const MAX_FOG_TINT = 0.3;
export const MAX_FOG_DENSITY = 1.7;
