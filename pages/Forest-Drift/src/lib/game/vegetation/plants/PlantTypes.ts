/**
 * Procedural flowers and ground plants — species, settings and world-state types. Framework- and
 * Three.js-free like every other *Types.ts file. See the README's "Flowers and ground plants".
 *
 * Two levels of variation:
 * - a SPECIES (`PlantSpeciesDefinition`, a few hundred bytes, generated from one seed) fixes the
 *   family, structure, petal/leaf vocabulary, palette, size range, habitat and colony behaviour —
 *   what makes it recognisable;
 * - an INSTANCE (packed bytes in a chunk buffer, never a JS object) only varies cheap details:
 *   height/scale, yaw, hue, wind phase and which of the species' 2–4 prototypes it uses.
 *
 * Nothing per plant is ever saved: a world stores these settings (inside `VegetationSettings`) and
 * `generatorVersion`; species and plants regenerate from (world seed, region, species seed, cell).
 */
import type { RgbColor } from '../../materials/ProceduralMaterialTypes';

/** Bump when species generation or placement changes what a seed produces (see GRASS_GENERATOR_VERSION). */
export const PLANT_GENERATOR_VERSION = 1;

/** Plant chunk edge, metres — streaming, card batching (one draw call) and culling unit. */
export const PLANT_CHUNK_SIZE = 32;

export const FLOWER_FAMILIES = [
	'radial-flower',
	'star-flower',
	'cup-flower',
	'bell-flower',
	'spike-flower',
	'orb-flower',
	'cluster-flower'
] as const;
export const GROUND_FAMILIES = [
	'rosette',
	'fern',
	'broadleaf',
	'clover',
	'succulent',
	'ground-tuft'
] as const;
export type FlowerFamily = (typeof FLOWER_FAMILIES)[number];
export type GroundFamily = (typeof GROUND_FAMILIES)[number];
export type PlantFamily = FlowerFamily | GroundFamily;
export const PLANT_FAMILIES: readonly PlantFamily[] = [...FLOWER_FAMILIES, ...GROUND_FAMILIES];

export type PlantKind = 'flower' | 'ground';

export const PETAL_SHAPES = [
	'round',
	'pointed',
	'teardrop',
	'wide',
	'narrow',
	'heart',
	'diamond',
	'curved'
] as const;
export type PetalShape = (typeof PETAL_SHAPES)[number];

export const LEAF_SHAPES = [
	'lance',
	'oval',
	'heart',
	'frond',
	'trefoil',
	'succulent',
	'spatulate',
	'strap'
] as const;
export type LeafShape = (typeof LEAF_SHAPES)[number];

export const COLOUR_FAMILIES = [
	'white',
	'yellow',
	'orange',
	'pink',
	'red',
	'purple',
	'blue',
	'fantasy'
] as const;
export type ColourFamily = (typeof COLOUR_FAMILIES)[number];

/** Candidate grid a species is placed on: tiny 0.9 m, medium 1.6 m, large 3.2 m cells. */
export type PlantSpacingClass = 'tiny' | 'medium' | 'large';
export const PLANT_SPACING: Readonly<Record<PlantSpacingClass, number>> = {
	tiny: 0.9,
	medium: 1.6,
	large: 3.2
};

export type PlantRarity = 'common' | 'uncommon' | 'rare';

/** Linear-space colours for every part of a species (shader-coloured masks — never baked textures). */
export interface PlantPaletteDefinition {
	family: ColourFamily;
	petalBase: RgbColor;
	petalTip: RgbColor;
	centre: RgbColor;
	stem: RgbColor;
	leafBase: RgbColor;
	leafTip: RgbColor;
}

export interface FlowerDefinition {
	petalShape: PetalShape;
	/** Petals per head (radial/star/cup/bell), petals per blossom (spike/cluster); 0 for orbs. */
	petalCount: number;
	/** Petal length and width, metres. */
	petalLength: number;
	petalWidth: number;
	/** Petal elevation above horizontal, degrees (flat daisy ≈ 8, cup ≈ 55, bell hangs). */
	petalLift: number;
	/** Flower-centre radius, metres. */
	centreRadius: number;
	/** Blossoms per stem: spike florets, cluster heads, bells, orb flowerlets ball (1). */
	blossoms: number;
	/** How far the head nods away from vertical, degrees. */
	headTilt: number;
}

export interface FoliageDefinition {
	leafShape: LeafShape;
	leafCount: number;
	/** Leaf length and width, metres. */
	leafLength: number;
	leafWidth: number;
	/** Leaf elevation above horizontal, degrees. */
	leafAngle: number;
	/** 0 straight … 1 strongly arched (fronds, broad leaves droop). */
	arch: number;
	/** Leaves grow from the base (rosette-like) rather than up the stem. */
	basal: boolean;
}

export interface PlantStructureDefinition {
	/** Plant height range, metres (flowers: to the head; ground plants: to the top of the foliage). */
	height: readonly [number, number];
	/** Stem radius at the base, metres (0 = stemless). */
	stemRadius: number;
	/** Sideways curve of the stem as a fraction of its height. */
	stemBend: number;
	/** Separate stems in one instance (a small clump). */
	stems: number;
	/** Horizontal spread of the whole plant (radius), metres — card width and bounds. */
	radius: number;
}

export interface PlantHabitat {
	/** −1 dry ground … +1 wet edges (river banks, lake shores). */
	moisture: number;
	/** −1 open sunlight … +1 forest floor. */
	shade: number;
	/** Preferred elevation band, metres (soft edges). */
	elevation: readonly [number, number];
	/** Steepest ground it grows on, degrees. */
	maxSlope: number;
	/** Extra liking for open plains (meadow flowers) vs highlands (alpine plants), −1 … +1. */
	meadow: number;
}

export interface PlantGrowthDefinition {
	spacing: PlantSpacingClass;
	/** Colony noise scale, metres — the size of the patches it forms. */
	colonyScale: number;
	/** Colony field threshold: higher = fewer, tighter patches. */
	colonyThreshold: number;
	/** Acceptance inside a colony, 0..1. */
	density: number;
	habitat: PlantHabitat;
	rarity: PlantRarity;
}

export interface PlantLodDefinition {
	/** Multiplies LOD distances for this species (tiny clover ~0.6, tall flowers ~1.4). */
	distanceScale: number;
	/** 0..1 — bright, large plants keep a lower LOD rank and survive farther. */
	importance: number;
	/** Atlas tile of the far card (family impostor). */
	impostorTile: number;
}

export interface PlantSpeciesDefinition {
	id: string;
	seed: number;
	kind: PlantKind;
	family: PlantFamily;
	/** A readable fingerprint, e.g. "8 narrow purple petals, yellow centre, 2 lance leaves". */
	signature: string;
	structure: PlantStructureDefinition;
	flower?: FlowerDefinition;
	foliage: FoliageDefinition;
	palette: PlantPaletteDefinition;
	growth: PlantGrowthDefinition;
	/** 0 floppy (ferns) … 1 rigid (succulents): wind response. */
	stiffness: number;
	prototypeCount: number;
	lod: PlantLodDefinition;
}

export interface PlantSettings {
	enabled: boolean;
	generatorVersion: number;
	flowerDensity: number;
	groundPlantDensity: number;
	/** Multiplies the number of species each region uses. */
	speciesCount: number;
	/** Metres (at HIGH) where the last plant cards fade out. */
	renderDistance: number;
	/** Real geometry (LOD0) out to here, then cards. */
	lod0Distance: number;
	lod1Distance: number;
	lod2Distance: number;
	lod0Density: number;
	lod1Density: number;
	lod2Density: number;
	windStrength: number;
	alphaTest: number;
	/** Flower colonies tint the terrain colour, so meadows stay colourful beyond the plants. */
	terrainTint: boolean;
}

/** Graphics-preset knobs (see `GraphicsPreset.plant*`). */
export interface PlantQualityProfile {
	densityScale: number;
	distanceScale: number;
	/** Multiplies the real-geometry (LOD0) distance. */
	nearScale: number;
	/** Fraction of each region's species kept (LOW shows fewer species). */
	speciesScale: number;
	/** Prototypes compiled per species (≤ the species' own count). */
	maxPrototypes: number;
	receiveShadows: boolean;
	wind: boolean;
	maxVisibleInstances: number;
}

export function createDefaultPlantSettings(): PlantSettings {
	return {
		enabled: true,
		generatorVersion: PLANT_GENERATOR_VERSION,
		flowerDensity: 1,
		groundPlantDensity: 1,
		speciesCount: 1,
		renderDistance: 52,
		lod0Distance: 11,
		lod1Distance: 26,
		lod2Distance: 40,
		lod0Density: 1,
		lod1Density: 0.5,
		lod2Density: 0.2,
		windStrength: 1,
		alphaTest: 0.5,
		terrainTint: true
	};
}
