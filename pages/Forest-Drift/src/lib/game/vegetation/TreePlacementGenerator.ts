import { CellHashChannel, hashCellToFloat01 } from './cellHash';
import { getTreeSpecies } from './trees/treeSpecies';
import { TreeSpeciesSelector } from './trees/TreeSpeciesSelector';
import {
	createDefaultVegetationSettings,
	type ProceduralTreeDefinition,
	type TreePlacementSettings
} from './VegetationTypes';
import type { VegetationRegionSampler } from './VegetationRegionSampler';
import { clamp01, smoothstep } from '../terrain/mathUtils';
import { createHeightSample, type TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import { TREE_WATER_CLEARANCE } from '../hydrology/HydrologyTypes';
import { hashStringToUint32 } from '../terrain/seededRandom';

const RADIANS_PER_DEGREE = Math.PI / 180;
/** Distinguishes tree-cell hashing from every other named seed channel in the game. */
const SEED_SALT = 0x7ee5;

export type RejectionReason = 'density' | 'slope' | 'water' | null;

export interface TreePlacementOptions {
	/** Species-per-site rules (defaults to the default species mix). */
	speciesSelector?: TreeSpeciesSelector;
	/** Prototype designs per species; 0 = each species' default. Read live. */
	getPrototypesPerSpecies?: () => number;
	/** Graphics-preset density scale (LOW plants fewer trees). Read live; trees kept are a stable subset. */
	getDensityScale?: () => number;
	/** Water-column depth at a world point. Trees deeper than `TREE_WATER_CLEARANCE` are rejected. */
	waterDepthAt?: (worldX: number, worldZ: number) => number;
}

export interface CellEvaluation {
	cellX: number;
	cellZ: number;
	worldX: number;
	worldZ: number;
	accepted: boolean;
	rejectionReason: RejectionReason;
	tree: ProceduralTreeDefinition | null;
}

/**
 * Deterministic candidate tree generation. Given (worldSeed, cellX, cellZ) — and nothing else, in
 * particular no chunk/load-order state — always produces the same candidate offset, existence
 * roll, scale, rotation and variant. This is what a future multiplayer server and every client
 * independently agree on without exchanging tree data at all.
 *
 * Forest REGION selection (does this area want trees at all) comes entirely from
 * VegetationRegionSampler and never looks at terrain biome. Individual candidate VALIDITY may
 * still be rejected using terrain properties (slope, treeline elevation) — that distinction is
 * deliberate: region selection is independent of terrain, but a candidate can still be physically
 * unsuitable for where the terrain sampler says the ground actually is.
 */
export class TreePlacementGenerator {
	private readonly terrainHeightSampler: TerrainHeightSampler;
	private readonly vegetationRegionSampler: VegetationRegionSampler;
	private readonly settings: TreePlacementSettings;
	private readonly speciesSelector: TreeSpeciesSelector;
	private readonly options: Required<Omit<TreePlacementOptions, 'speciesSelector'>>;
	private seedHash = 0;

	constructor(
		terrainHeightSampler: TerrainHeightSampler,
		vegetationRegionSampler: VegetationRegionSampler,
		settings: TreePlacementSettings,
		options: TreePlacementOptions = {}
	) {
		this.terrainHeightSampler = terrainHeightSampler;
		this.vegetationRegionSampler = vegetationRegionSampler;
		this.settings = settings;
		this.speciesSelector =
			options.speciesSelector ?? new TreeSpeciesSelector(createDefaultVegetationSettings().species);
		this.options = {
			getPrototypesPerSpecies: options.getPrototypesPerSpecies ?? (() => 0),
			getDensityScale: options.getDensityScale ?? (() => 1),
			waterDepthAt: options.waterDepthAt ?? (() => 0)
		};
	}

	setSeed(seed: string): void {
		this.seedHash = hashStringToUint32(seed, SEED_SALT);
		this.speciesSelector.setSeed(seed);
	}

	/** Evaluates one vegetation cell — this is the entire deterministic placement pipeline for a single candidate. */
	evaluateCell(cellX: number, cellZ: number): CellEvaluation {
		const settings = this.settings;
		const cellSize = settings.treeCellSize;
		const cellOriginX = cellX * cellSize;
		const cellOriginZ = cellZ * cellSize;

		const offsetXRoll = hashCellToFloat01(this.seedHash, cellX, cellZ, CellHashChannel.OffsetX);
		const offsetZRoll = hashCellToFloat01(this.seedHash, cellX, cellZ, CellHashChannel.OffsetZ);
		// Minimum spacing: keep each candidate `margin` away from its cell's edges, so two trees in
		// neighbouring cells are always at least 2 × margin apart — deterministic, no neighbour lookups.
		const margin = Math.min(cellSize * 0.45, Math.max(0, settings.minTreeSpacing) / 2);
		const span = cellSize - margin * 2;
		const worldX = cellOriginX + margin + offsetXRoll * span;
		const worldZ = cellOriginZ + margin + offsetZRoll * span;

		const base: Pick<CellEvaluation, 'cellX' | 'cellZ' | 'worldX' | 'worldZ'> = {
			cellX,
			cellZ,
			worldX,
			worldZ
		};

		const density = this.vegetationRegionSampler.getForestDensity(worldX, worldZ);
		// The density scale multiplies the acceptance probability against the same roll, so a lower
		// scale keeps a stable SUBSET of the trees a higher one plants — quality changes never reshuffle.
		let acceptProbability =
			density * settings.treeDensityMultiplier * this.options.getDensityScale();

		if (settings.enableTreeLine) {
			const height = this.terrainHeightSampler.sample(worldX, worldZ);
			const treeLineFactor =
				1 - smoothstep(settings.treeLineStartHeight, settings.treeLineEndHeight, height);
			acceptProbability *= treeLineFactor;
		}
		acceptProbability = clamp01(acceptProbability);

		const existenceRoll = hashCellToFloat01(this.seedHash, cellX, cellZ, CellHashChannel.Existence);
		if (existenceRoll >= acceptProbability) {
			return { ...base, accepted: false, rejectionReason: 'density', tree: null };
		}

		if (this.options.waterDepthAt(worldX, worldZ) > TREE_WATER_CLEARANCE) {
			return { ...base, accepted: false, rejectionReason: 'water', tree: null };
		}

		const sample = createHeightSample();
		this.terrainHeightSampler.sampleWithNormal(worldX, worldZ, sample);
		const slopeDegrees = Math.acos(Math.min(1, Math.max(-1, sample.normalY))) / RADIANS_PER_DEGREE;
		if (slopeDegrees > settings.maxTreeSlopeDegrees) {
			return { ...base, accepted: false, rejectionReason: 'slope', tree: null };
		}

		const roll = (channel: number) => hashCellToFloat01(this.seedHash, cellX, cellZ, channel);
		const speciesId = this.speciesSelector.pick(
			{ worldX, worldZ, height: sample.height, density, slopeDegrees },
			roll(CellHashChannel.Species)
		);
		const species = getTreeSpecies(speciesId);
		const prototypes = this.options.getPrototypesPerSpecies() || species.prototypeCount;
		const [scaleMin, scaleMax] = species.instanceScale;
		const [widthMin, widthMax] = species.instanceWidthScale;
		const placementScale =
			settings.minTreeScale +
			roll(CellHashChannel.Scale) * (settings.maxTreeScale - settings.minTreeScale);

		const tree: ProceduralTreeDefinition = {
			id: `${cellX}:${cellZ}`,
			cellX,
			cellZ,
			speciesId,
			variant: Math.min(prototypes - 1, Math.floor(roll(CellHashChannel.Variant) * prototypes)),
			worldX,
			worldZ,
			scale:
				placementScale * (scaleMin + roll(CellHashChannel.Scale + 100) * (scaleMax - scaleMin)),
			widthScale: widthMin + roll(CellHashChannel.Width) * (widthMax - widthMin),
			rotationY: roll(CellHashChannel.Rotation) * Math.PI * 2,
			tint: roll(CellHashChannel.Tint)
		};

		return { ...base, accepted: true, rejectionReason: null, tree };
	}

	/** Convenience for callers that only care about accepted trees (the normal, non-debug rendering path). */
	generateCell(cellX: number, cellZ: number): ProceduralTreeDefinition | null {
		return this.evaluateCell(cellX, cellZ).tree;
	}
}
