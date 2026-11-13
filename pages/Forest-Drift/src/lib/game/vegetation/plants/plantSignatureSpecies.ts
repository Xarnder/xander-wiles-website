import { describeSpecies, generatePlantSpecies, speciesId } from './plantSpecies';
import type { PlantFamily, PlantKind, PlantSpeciesDefinition } from './PlantTypes';

/**
 * Signature plants (biomes Phase 4): the few plants that DEFINE a biome, so they can't be left to
 * the random regional pools — Sunflower Plains needs sunflowers, not "a yellow flower".
 *
 * Each is an ordinary generated species of the right family (so prototypes, cards, LOD and wind
 * all work unchanged), with its look, size and habitat pinned. Seeds are fixed constants: the same
 * signature plant everywhere, in every world.
 */
export type SignaturePlantId = 'sunflower' | 'reed' | 'fern' | 'deadShrub' | 'paleBloom';

export const SIGNATURE_PLANT_IDS: readonly SignaturePlantId[] = [
	'sunflower',
	'reed',
	'fern',
	'deadShrub',
	'paleBloom'
];

/** Fixed seeds, in their own range so they never collide with a pool species' hashed seed. */
const SEEDS: Record<SignaturePlantId, number> = {
	sunflower: 0x51e0_0001,
	reed: 0x51e0_0002,
	fern: 0x51e0_0003,
	deadShrub: 0x51e0_0004,
	paleBloom: 0x51e0_0005
};

const BASES: Record<SignaturePlantId, { kind: PlantKind; family: PlantFamily }> = {
	sunflower: { kind: 'flower', family: 'radial-flower' },
	reed: { kind: 'flower', family: 'spike-flower' },
	fern: { kind: 'ground', family: 'fern' },
	deadShrub: { kind: 'ground', family: 'ground-tuft' },
	paleBloom: { kind: 'flower', family: 'bell-flower' }
};

type Overrides = (base: PlantSpeciesDefinition) => PlantSpeciesDefinition;

const OVERRIDES: Record<SignaturePlantId, Overrides> = {
	/** Tall, single-headed, golden with a dark centre, standing in broad fields. */
	sunflower: (base) => ({
		...base,
		structure: { height: [0.95, 1.3], stemRadius: 0.012, stemBend: 0.04, stems: 1, radius: 0.22 },
		flower: {
			petalShape: 'narrow',
			petalCount: 20,
			petalLength: 0.085,
			petalWidth: 0.024,
			petalLift: 14,
			centreRadius: 0.055,
			blossoms: 1,
			headTilt: 24
		},
		foliage: {
			leafShape: 'heart',
			leafCount: 4,
			leafLength: 0.17,
			leafWidth: 0.13,
			leafAngle: 35,
			arch: 0.35,
			basal: false
		},
		palette: {
			family: 'yellow',
			petalBase: [0.92, 0.58, 0.04],
			petalTip: [0.98, 0.74, 0.1],
			centre: [0.11, 0.055, 0.02],
			stem: [0.17, 0.3, 0.06],
			leafBase: [0.13, 0.3, 0.05],
			leafTip: [0.24, 0.44, 0.08]
		},
		growth: {
			spacing: 'medium',
			colonyScale: 22,
			colonyThreshold: 0.36,
			density: 0.95,
			habitat: { moisture: 0, shade: -0.8, elevation: [-30, 90], maxSlope: 30, meadow: 0.9 },
			rarity: 'common'
		},
		stiffness: 0.55,
		lod: { ...base.lod, distanceScale: 1.6, importance: 1 }
	}),
	/** Cattail reeds: tall strap leaves and a brown seed head, in swamps. */
	reed: (base) => ({
		...base,
		structure: { height: [0.8, 1.2], stemRadius: 0.006, stemBend: 0.05, stems: 2, radius: 0.18 },
		flower: {
			petalShape: 'narrow',
			petalCount: 4,
			petalLength: 0.02,
			petalWidth: 0.012,
			petalLift: 70,
			centreRadius: 0.016,
			blossoms: 8,
			headTilt: 4
		},
		foliage: {
			leafShape: 'strap',
			leafCount: 5,
			leafLength: 0.6,
			leafWidth: 0.022,
			leafAngle: 76,
			arch: 0.22,
			basal: true
		},
		palette: {
			family: 'orange',
			petalBase: [0.2, 0.1, 0.04],
			petalTip: [0.28, 0.15, 0.06],
			centre: [0.16, 0.08, 0.03],
			stem: [0.22, 0.32, 0.1],
			leafBase: [0.16, 0.28, 0.08],
			leafTip: [0.36, 0.44, 0.16]
		},
		growth: {
			spacing: 'medium',
			colonyScale: 12,
			colonyThreshold: 0.4,
			density: 0.9,
			habitat: { moisture: 0.4, shade: -0.3, elevation: [-30, 40], maxSlope: 22, meadow: 0.2 },
			rarity: 'common'
		},
		stiffness: 0.35,
		lod: { ...base.lod, distanceScale: 1.4, importance: 0.5 }
	}),
	/** Forest-floor fern: deep green fronds in shade. */
	fern: (base) => ({
		...base,
		structure: { ...base.structure, height: [0.45, 0.8] },
		palette: {
			...base.palette,
			stem: [0.1, 0.2, 0.04],
			leafBase: [0.06, 0.2, 0.03],
			leafTip: [0.16, 0.36, 0.06]
		},
		growth: {
			spacing: 'large',
			colonyScale: 18,
			colonyThreshold: 0.42,
			density: 0.85,
			habitat: { moisture: 0.4, shade: 0.7, elevation: [-30, 90], maxSlope: 36, meadow: -0.3 },
			rarity: 'common'
		}
	}),
	/** A dry, leafless grey-brown shrub in deserts and shrub savanna. */
	deadShrub: (base) => ({
		...base,
		structure: { ...base.structure, height: [0.3, 0.55], radius: 0.28 },
		palette: {
			...base.palette,
			family: 'orange',
			stem: [0.24, 0.18, 0.12],
			leafBase: [0.26, 0.2, 0.13],
			leafTip: [0.44, 0.37, 0.25]
		},
		growth: {
			spacing: 'large',
			colonyScale: 20,
			colonyThreshold: 0.5,
			density: 0.6,
			habitat: { moisture: -0.8, shade: -0.8, elevation: [-30, 110], maxSlope: 40, meadow: 0 },
			rarity: 'common'
		},
		stiffness: 0.85
	}),
	/** Silverwood's pale, nodding bells on the dim forest floor. */
	paleBloom: (base) => ({
		...base,
		structure: { ...base.structure, height: [0.22, 0.38] },
		palette: {
			...base.palette,
			family: 'white',
			petalBase: [0.8, 0.83, 0.86],
			petalTip: [0.94, 0.95, 0.97],
			centre: [0.72, 0.78, 0.68],
			stem: [0.32, 0.38, 0.34],
			leafBase: [0.3, 0.36, 0.32],
			leafTip: [0.5, 0.56, 0.52]
		},
		growth: {
			spacing: 'tiny',
			colonyScale: 10,
			colonyThreshold: 0.42,
			density: 0.8,
			habitat: { moisture: 0.2, shade: 0.6, elevation: [-30, 90], maxSlope: 34, meadow: -0.2 },
			rarity: 'common'
		}
	})
};

const cache = new Map<SignaturePlantId, PlantSpeciesDefinition>();

/** The signature species (built once, then shared). */
export function getSignaturePlant(id: SignaturePlantId): PlantSpeciesDefinition {
	let species = cache.get(id);
	if (!species) {
		const seed = SEEDS[id];
		const base = generatePlantSpecies(seed, BASES[id]);
		species = OVERRIDES[id](base);
		species.id = speciesId(seed);
		species.seed = seed >>> 0;
		species.signature = describeSpecies(species);
		cache.set(id, species);
	}
	return species;
}
