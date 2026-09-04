import { CellHashChannel, hashCellToFloat01 } from './cellHash';
import {
	TREE_VARIANT_COUNT,
	type ProceduralTreeDefinition,
	type TreePlacementSettings
} from './VegetationTypes';
import type { VegetationRegionSampler } from './VegetationRegionSampler';
import { clamp01, smoothstep } from '../terrain/mathUtils';
import { createHeightSample, type TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import { hashStringToUint32 } from '../terrain/seededRandom';

const RADIANS_PER_DEGREE = Math.PI / 180;
/** Distinguishes tree-cell hashing from every other named seed channel in the game. */
const SEED_SALT = 0x7ee5;

export type RejectionReason = 'density' | 'slope' | null;

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
	private seedHash = 0;

	constructor(
		terrainHeightSampler: TerrainHeightSampler,
		vegetationRegionSampler: VegetationRegionSampler,
		settings: TreePlacementSettings
	) {
		this.terrainHeightSampler = terrainHeightSampler;
		this.vegetationRegionSampler = vegetationRegionSampler;
		this.settings = settings;
	}

	setSeed(seed: string): void {
		this.seedHash = hashStringToUint32(seed, SEED_SALT);
	}

	/** Evaluates one vegetation cell — this is the entire deterministic placement pipeline for a single candidate. */
	evaluateCell(cellX: number, cellZ: number): CellEvaluation {
		const settings = this.settings;
		const cellSize = settings.treeCellSize;
		const cellOriginX = cellX * cellSize;
		const cellOriginZ = cellZ * cellSize;

		const offsetXRoll = hashCellToFloat01(this.seedHash, cellX, cellZ, CellHashChannel.OffsetX);
		const offsetZRoll = hashCellToFloat01(this.seedHash, cellX, cellZ, CellHashChannel.OffsetZ);
		const worldX = cellOriginX + offsetXRoll * cellSize;
		const worldZ = cellOriginZ + offsetZRoll * cellSize;

		const base: Pick<CellEvaluation, 'cellX' | 'cellZ' | 'worldX' | 'worldZ'> = {
			cellX,
			cellZ,
			worldX,
			worldZ
		};

		const density = this.vegetationRegionSampler.getForestDensity(worldX, worldZ);
		let acceptProbability = density * settings.treeDensityMultiplier;

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

		const sample = createHeightSample();
		this.terrainHeightSampler.sampleWithNormal(worldX, worldZ, sample);
		const slopeDegrees = Math.acos(Math.min(1, Math.max(-1, sample.normalY))) / RADIANS_PER_DEGREE;
		if (slopeDegrees > settings.maxTreeSlopeDegrees) {
			return { ...base, accepted: false, rejectionReason: 'slope', tree: null };
		}

		const scaleRoll = hashCellToFloat01(this.seedHash, cellX, cellZ, CellHashChannel.Scale);
		const rotationRoll = hashCellToFloat01(this.seedHash, cellX, cellZ, CellHashChannel.Rotation);
		const variantRoll = hashCellToFloat01(this.seedHash, cellX, cellZ, CellHashChannel.Variant);

		const tree: ProceduralTreeDefinition = {
			id: `${cellX}:${cellZ}`,
			cellX,
			cellZ,
			worldX,
			worldZ,
			scale: settings.minTreeScale + scaleRoll * (settings.maxTreeScale - settings.minTreeScale),
			rotationY: rotationRoll * Math.PI * 2,
			variant: Math.min(TREE_VARIANT_COUNT - 1, Math.floor(variantRoll * TREE_VARIANT_COUNT))
		};

		return { ...base, accepted: true, rejectionReason: null, tree };
	}

	/** Convenience for callers that only care about accepted trees (the normal, non-debug rendering path). */
	generateCell(cellX: number, cellZ: number): ProceduralTreeDefinition | null {
		return this.evaluateCell(cellX, cellZ).tree;
	}
}
