import {
	BIOME_IDS,
	type BiomeDefinition,
	type BiomeGroup,
	type BiomeId,
	type ClimateBox,
	type LandformClass
} from './BiomeTypes';

/**
 * The 26 biomes (decision Q1) as data. Adding one = adding an entry (and appending its id).
 *
 * Climate space: temperature and moisture are both 0..1 and EQUAL-AREA — `ClimateSampler` remaps
 * its noise so every value is equally common. A box's width therefore reads directly as a share of
 * that landform's area. Temperature already includes the elevation lapse, so high ground is colder.
 *
 * BASE biomes partition each landform class's (temperature × moisture) square without gaps or
 * overlaps (tested in `biomeDefinitions.spec.ts`); borders only blend inside the classifier's
 * feather. OVERLAYS then take a share of the base result:
 * - variants replace part of one parent where the rarity field is high (Q12);
 * - the swamp takes over warm, very wet, low lowland whatever base biome is there (Q16).
 *
 * The temperature axis keeps snowy biomes (≤ 0.07 in the lowlands, ≤ 0.12 on uplands, ≤ 0.34 on
 * mountains) far from desert and jungle (≥ 0.66 on uplands and mountains, ≥ 0.82 in the lowlands), so
 * snow can never border desert or jungle (Q13). Values are tuned against the composition targets
 * in Q14 — see `biomeComposition.spec.ts`.
 */

function box(
	landform: LandformClass,
	temperature: readonly [number, number],
	moisture: readonly [number, number]
): ClimateBox {
	return { landform, temperature, moisture };
}

function base(
	id: BiomeId,
	name: string,
	group: BiomeGroup,
	debugColor: string,
	boxes: ClimateBox[]
): BiomeDefinition {
	return { id, name, group, boxes, debugColor };
}

function variant(
	id: BiomeId,
	name: string,
	group: BiomeGroup,
	debugColor: string,
	parent: BiomeId
): BiomeDefinition {
	return { id, name, group, boxes: [], overlay: { kind: 'variant', parent }, debugColor };
}

/** Lowland temperature edges (plains + hills). */
const L_COLD = 0.07;
const L_COOL = 0.17;
const L_BIRCH = 0.36;
const L_FOREST = 0.5;
const L_WARM = 0.62;
const L_HOT = 0.82;

const DEFINITIONS: readonly BiomeDefinition[] = [
	base('forest', 'Forest', 'temperate', '#2f7d32', [
		box('lowland', [L_BIRCH, L_FOREST], [0.3, 0.64])
	]),
	variant('flowerForest', 'Flower Forest', 'temperate', '#d16fb0', 'forest'),
	base('birchForest', 'Birch Forest', 'temperate', '#9ccc65', [
		box('lowland', [L_COOL, L_BIRCH], [0.3, 0.64])
	]),
	variant('oldGrowthBirch', 'Old Growth Birch Forest', 'temperate', '#c5e1a5', 'birchForest'),
	base('darkForest', 'Dark Forest', 'temperate', '#1b4d1f', [
		box('lowland', [L_COOL, L_WARM], [0.64, 1])
	]),
	variant('silverwood', 'Silverwood', 'temperate', '#9fa8a3', 'darkForest'),
	base('sunlitWood', 'Sunlit Wood', 'temperate', '#7cb342', [
		box('lowland', [L_FOREST, L_WARM], [0.3, 0.64])
	]),
	base('taiga', 'Taiga', 'cold', '#3e6b5a', [box('lowland', [L_COLD, L_COOL], [0.3, 1])]),
	base('snowyTaiga', 'Snowy Taiga', 'cold', '#a9c8c0', [box('lowland', [0, L_COLD], [0.45, 1])]),
	base('jungle', 'Jungle', 'tropical', '#0b6e2f', [
		box('lowland', [L_HOT, 1], [0.66, 1]),
		box('highland', [0.66, 1], [0.75, 1])
	]),
	base('sparseJungle', 'Sparse Jungle', 'tropical', '#4caf50', [
		box('lowland', [L_WARM, L_HOT], [0.7, 1]),
		box('lowland', [L_HOT, 1], [0.5, 0.66]),
		box('highland', [0.66, 1], [0.5, 0.75]),
		box('mountain', [0.7, 1], [0.5, 1])
	]),
	variant('bambooJungle', 'Bamboo Jungle', 'tropical', '#76ff03', 'jungle'),
	base('meadow', 'Meadow', 'temperate', '#aed581', [box('highland', [0.26, 0.66], [0.14, 1])]),
	variant('cherryGrove', 'Cherry Grove', 'temperate', '#f8bbd0', 'meadow'),
	base('grove', 'Grove', 'cold', '#80cbc4', [
		box('highland', [0, 0.12], [0.3, 1]),
		box('mountain', [0.22, 0.34], [0.3, 1])
	]),
	base('snowySlopes', 'Snowy Slopes', 'cold', '#eceff1', [box('mountain', [0, 0.22], [0, 1])]),
	base('windsweptHills', 'Windswept Hills', 'cold', '#8d9b87', [
		box('highland', [0.12, 0.26], [0, 1]),
		box('highland', [0.26, 0.66], [0, 0.14]),
		box('mountain', [0.22, 0.34], [0, 0.3]),
		box('mountain', [0.34, 0.7], [0, 1])
	]),
	base('plains', 'Plains', 'temperate', '#c0ca33', [box('lowland', [L_COLD, L_WARM], [0, 0.3])]),
	variant('sunflowerPlains', 'Sunflower Plains', 'temperate', '#ffd54f', 'plains'),
	base('snowyPlains', 'Snowy Plains', 'cold', '#ffffff', [
		box('lowland', [0, L_COLD], [0, 0.45]),
		box('highland', [0, 0.12], [0, 0.3])
	]),
	base('desert', 'Desert', 'warmDry', '#f4d58d', [box('lowland', [L_HOT, 1], [0, 0.26])]),
	base('savanna', 'Savanna', 'warmDry', '#c9a227', [
		box('lowland', [L_WARM, L_HOT], [0.1, 0.3]),
		box('lowland', [L_HOT, 1], [0.26, 0.5])
	]),
	base('savannaPlateau', 'Savanna Plateau', 'warmDry', '#a1662f', [
		box('highland', [0.66, 1], [0, 0.5]),
		box('mountain', [0.7, 1], [0, 0.5])
	]),
	{
		id: 'swamp',
		name: 'Swamp',
		group: 'swamp',
		boxes: [],
		overlay: {
			kind: 'lowWet',
			temperature: [L_COOL + 0.18, L_HOT],
			moisture: [0.8, 1],
			maxElevation: [6, 14]
		},
		debugColor: '#4e5d2a'
	},
	base('shrubSavanna', 'Shrub Savanna', 'warmDry', '#d7b98e', [
		box('lowland', [L_WARM, L_HOT], [0, 0.1])
	]),
	base('tropicalDryGrassland', 'Tropical Dry Grassland', 'warmDry', '#dce775', [
		box('lowland', [L_WARM, L_HOT], [0.3, 0.7])
	])
];

/** Index-aligned with BIOME_IDS. */
export const BIOME_DEFINITIONS: readonly BiomeDefinition[] = BIOME_IDS.map((id) => {
	const def = DEFINITIONS.find((d) => d.id === id);
	if (!def) throw new Error(`Missing biome definition: ${id}`);
	return def;
});

export function biomeIndex(id: BiomeId): number {
	return BIOME_IDS.indexOf(id);
}

export function getBiomeDefinition(id: BiomeId): BiomeDefinition {
	return BIOME_DEFINITIONS[biomeIndex(id)];
}
