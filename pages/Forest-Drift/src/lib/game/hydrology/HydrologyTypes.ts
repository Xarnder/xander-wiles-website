import type { BiomeWeights } from '../terrain/TerrainHeightSampler';

/**
 * Bump when the routing or carving algorithm changes geography. Saved worlds keep the version they
 * were generated with so an update does not silently move rivers under existing buildings.
 */
export const HYDROLOGY_GENERATOR_VERSION = 2;
/**
 * From generator version 2, a world always has a river passing within this distance (m) of the
 * spawn point (the world origin). Version-1 worlds keep their original geography.
 */
export const SPAWN_RIVER_RADIUS = 100;
export const SPAWN_RIVER_MIN_VERSION = 2;

/**
 * Walkable water versus water that blocks ordinary movement. Kept here so the controller, creatures,
 * trees and foundations do not each invent a depth constant.
 */
export const SHALLOW_WATER_DEPTH = 0.45;
export const DEEP_WATER_DEPTH = 1.15;
/** Trees are rejected once the water column is deeper than this — banks may still grow trees. */
export const TREE_WATER_CLEARANCE = 0.35;

/**
 * Geography-defining hydrology settings. These are part of the world, not a graphics preference:
 * the same seed and the same values must rebuild the same rivers and lakes.
 * Visual-only knobs (colour, waves) live on `HydrologyVisualSettings` and are not saved.
 */
export interface HydrologySettings {
	enabled: boolean;
	generatorVersion: number;
	regionSize: number;
	gridSpacing: number;
	riverDensity: number;
	lakeDensity: number;
	minRiverSourceElevation: number;
	sourceSpacing: number;
	minRiverWidth: number;
	maxRiverWidth: number;
	riverDepthScale: number;
	riverBankScale: number;
	minLakeRadius: number;
	maxLakeRadius: number;
	lakeDepthScale: number;
	meanderStrength: number;
}

export interface HydrologyDebugSettings {
	showHydrologyGrid: boolean;
	showHydrologyRegions: boolean;
	showRiverSources: boolean;
	showRawRiverPaths: boolean;
	showRiverSplines: boolean;
	showFlowDirection: boolean;
	showRiverWidth: boolean;
	showRiverInfluence: boolean;
	showLakeCandidates: boolean;
	showLakeBoundary: boolean;
	showLakeWaterLevel: boolean;
	showLakeBasin: boolean;
	showWaterDepth: boolean;
	showSpatialCells: boolean;
}

/** Developer look controls. They do not move rivers, so they are not part of the saved world. */
export interface HydrologyVisualSettings {
	deepColor: string;
	shallowColor: string;
	transparency: number;
	waveStrength: number;
	flowSpeed: number;
}

export interface Bounds2D {
	minX: number;
	minZ: number;
	maxX: number;
	maxZ: number;
}

export interface RiverSample {
	x: number;
	z: number;
	waterY: number;
	/** Flow before tributaries. Confluence overwrites `flow`. */
	baseFlow: number;
	flow: number;
	width: number;
	depth: number;
	tangentX: number;
	tangentZ: number;
}

export interface RiverDefinition {
	id: string;
	seed: number;
	priority: number;
	sourceX: number;
	sourceZ: number;
	samples: RiverSample[];
	/** Coarse grid polyline before the spline, for the debug view. */
	raw: { x: number; z: number }[];
	/** Hydrology-grid cells the raw route claimed. */
	cells: number[];
	bounds: Bounds2D;
	/** Exclusive end of the active prefix after tributary truncation. */
	endIndex: number;
	/** Extra flow added at a sample by merging tributaries. Propagated downstream. */
	flowExtra: number[];
	sinkLakeId?: string;
	outletOfLakeId?: string;
	/**
	 * Sink rivers: first sample of the mouth stretch held on the lake level (the shoreline run plus
	 * the mouth sample just outside it). Surface passes never move these samples.
	 */
	lakeLockStart?: number;
	/** Outlets: samples before this index sit on the source lake's level and are never moved. */
	lakeLockEnd?: number;
}

export interface LakeDefinition {
	id: string;
	x: number;
	z: number;
	waterLevel: number;
	baseRadius: number;
	depth: number;
	a1: number;
	p1: number;
	a2: number;
	p2: number;
	a3: number;
	p3: number;
	bounds: Bounds2D;
	outletRiverId?: string;
	/** True when the candidate was a drainage sink rather than a scanned basin. */
	sink: boolean;
}

export interface LakeCandidate {
	x: number;
	z: number;
	accepted: boolean;
	waterLevel: number;
}

/**
 * Pre-water terrain. Hydrology must call this and never `TerrainHeightSampler.sample`, or carving
 * would recurse through itself.
 */
export interface BaseTerrainSampler {
	sample(worldX: number, worldZ: number): number;
	sampleBiomeWeights?(worldX: number, worldZ: number, out: BiomeWeights): void;
}

export interface HydrologySample {
	waterType: 'none' | 'river' | 'lake';
	waterSurfaceY: number;
	waterDepth: number;
	/** Metres to the centreline or shoreline. Negative inside the wet footprint. */
	distanceToWater: number;
	terrainTargetY: number;
	terrainInfluence: number;
	/** Height after carving. Equals the base height where nothing influences the point. */
	terrainY: number;
	riverId: string;
	lakeId: string;
	flowX: number;
	flowZ: number;
	/** 0..1 beach material on the nearest river edge or lake shore. */
	beachCover: number;
	/** 0 = mud, 1 = stone. Constant across both banks of the same stretch. */
	beachStone: number;
	/** Surface level of the nearest river or lake (NaN when none is near). */
	shoreWaterY: number;
	/**
	 * 0..1: 1 under water and at the waterline, fading to 0 about 0.6 m above it — drives the
	 * riverbed/lakebed material and the darker, wet band along every shore.
	 */
	shoreWet: number;
}

/** Beach tint left by the most recent `shapeHeight` at this point. */
export interface RiverEdgeTint {
	cover: number;
	stone: number;
	/** See `HydrologySample.shoreWet`. */
	wet: number;
}

export function createDefaultHydrologySettings(): HydrologySettings {
	return {
		enabled: true,
		generatorVersion: HYDROLOGY_GENERATOR_VERSION,
		regionSize: 1280,
		gridSpacing: 64,
		riverDensity: 0.62,
		lakeDensity: 0.42,
		minRiverSourceElevation: 6,
		sourceSpacing: 300,
		minRiverWidth: 1.7,
		maxRiverWidth: 13,
		riverDepthScale: 1,
		riverBankScale: 1,
		minLakeRadius: 18,
		maxLakeRadius: 64,
		lakeDepthScale: 1,
		meanderStrength: 0.7
	};
}

export function createDefaultHydrologyDebug(): HydrologyDebugSettings {
	return {
		showHydrologyGrid: false,
		showHydrologyRegions: false,
		showRiverSources: false,
		showRawRiverPaths: false,
		showRiverSplines: false,
		showFlowDirection: false,
		showRiverWidth: false,
		showRiverInfluence: false,
		showLakeCandidates: false,
		showLakeBoundary: false,
		showLakeWaterLevel: false,
		showLakeBasin: false,
		showWaterDepth: false,
		showSpatialCells: false
	};
}

export function createDefaultHydrologyVisual(): HydrologyVisualSettings {
	return {
		deepColor: '#0f4f5c',
		shallowColor: '#5fa8a0',
		transparency: 0.9,
		waveStrength: 0.55,
		flowSpeed: 0.28
	};
}

export function createHydrologySample(): HydrologySample {
	return {
		waterType: 'none',
		waterSurfaceY: 0,
		waterDepth: 0,
		distanceToWater: Number.POSITIVE_INFINITY,
		terrainTargetY: 0,
		terrainInfluence: 0,
		terrainY: 0,
		riverId: '',
		lakeId: '',
		flowX: 0,
		flowZ: 0,
		beachCover: 0,
		beachStone: 0,
		shoreWaterY: Number.NaN,
		shoreWet: 0
	};
}

/** What `TerrainHeightSampler` needs from hydrology, without a circular import of the system. */
export interface HydrologyCarver {
	readonly settings: { enabled: boolean };
	shapeHeight(worldX: number, worldZ: number, baseHeight: number): number;
	/** Beach of the centre sample. `sampleWithNormal` leaves that sample last. */
	copyRiverEdge(out: RiverEdgeTint): void;
	invalidate(): void;
}
