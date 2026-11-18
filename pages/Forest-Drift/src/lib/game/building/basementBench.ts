/**
 * Phase 0 measurements for Basements and Joined Foundations (technical plan §9): the cost of
 * cutting terrain holes, of walking with basements about, and of the join maths. Run by Vitest in
 * Node and by the dev preview page (`/basements/?dev`) in each browser engine, so the numbers come
 * from the same code everywhere.
 */

import { TerrainChunk } from '../terrain/TerrainChunk';
import { TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../terrain/TerrainSettings';
import { TerrainHoles, holedChunkIndices } from '../terrain/terrainHoles';
import { FoundationManager } from './FoundationManager';
import type { FoundationDefinition } from './FoundationTypes';
import { RoofManager } from './RoofManager';
import { SlabManager } from './SlabManager';
import { StairManager } from './StairManager';
import { WorldSurfaceSampler } from './WorldSurfaceSampler';
import { basementSlabPlans } from './basementMath';
import {
	joinedBuildings,
	polygonInRects,
	segmentInRects,
	unionOutline
} from './foundationJoinMath';

export interface BasementBenchReport {
	terrain: {
		resolution: number;
		/** Populating one chunk with no holes, and with 20 basements cut out of it (median ms). */
		populateMs: number;
		populateHoledMs: number;
		/** Cutting the index buffer alone (median ms). */
		cutMs: number;
		cutCells: number;
	};
	walking: {
		/** getSupportingSurfaceY, µs per call, with 20 foundations near the point. */
		solidUs: number;
		basementUs: number;
		/** basementUs − solidUs, with the same slabs in both: the plan budget is ≤ 2 µs. */
		extraUs: number;
	};
	joins: {
		/** joinedBuildings over 200 foundations in 25 buildings of 8 (ms). */
		buildingsMs: number;
		buildings: number;
		/** The outline of an 8-foundation building, and a slab-sized polygon inside test (µs). */
		outlineUs: number;
		polygonInsideUs: number;
		segmentInsideUs: number;
	};
}

const now = () => performance.now();

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

/** Twenty 10 × 8 m footprints spread over a 96 m chunk, on the 2 m vertex grid. */
function benchFootprints(
	basement: boolean,
	originGridX = 0,
	originGridZ = 0
): FoundationDefinition[] {
	return Array.from({ length: 20 }, (_, i) => ({
		id: `bench-${i}`,
		minGridX: originGridX + (i % 5) * 9 + 1,
		maxGridX: originGridX + (i % 5) * 9 + 6,
		minGridZ: originGridZ + Math.floor(i / 5) * 11 + 1,
		maxGridZ: originGridZ + Math.floor(i / 5) * 11 + 5,
		topY: 10,
		bottomY: 8,
		...(basement ? { basement: { storeys: 2, storeyHeight: 3 } } : {})
	}));
}

function benchTerrain(rounds: number): BasementBenchReport['terrain'] {
	const settings = createDefaultTerrainSettings();
	const sampler = new TerrainHeightSampler(settings);
	const spacing = settings.chunkSize / settings.chunkResolution;
	const holes = new TerrainHoles();
	holes.set(
		benchFootprints(true).map((f) => ({
			minX: f.minGridX * spacing,
			maxX: f.maxGridX * spacing,
			minZ: f.minGridZ * spacing,
			maxZ: f.maxGridZ * spacing
		}))
	);
	const plain = new TerrainChunk(settings.chunkResolution);
	const holed = new TerrainChunk(settings.chunkResolution);
	holed.holes = holes;
	// Five populates per sample: WebKit's and Firefox's timers are only 1 ms fine.
	const populate: number[] = [];
	const populateHoled: number[] = [];
	const perSample = 5;
	for (let i = 0; i < Math.max(3, Math.round(rounds / 3)); i++) {
		let t = now();
		for (let k = 0; k < perSample; k++) plain.populate(0, 0, settings.chunkSize, sampler, i);
		populate.push((now() - t) / perSample);
		t = now();
		for (let k = 0; k < perSample; k++) holed.populate(0, 0, settings.chunkSize, sampler, i);
		populateHoled.push((now() - t) / perSample);
	}
	// Timed in batches: one cut is far below the browser timer's resolution.
	const cut: number[] = [];
	let out: Uint32Array | undefined;
	const overlapping = holes.overlapping(0, settings.chunkSize, 0, settings.chunkSize);
	const batch = 200;
	for (let i = 0; i < rounds; i++) {
		const t = now();
		for (let k = 0; k < batch; k++)
			out = holedChunkIndices(settings.chunkResolution, 0, 0, spacing, overlapping, out)!.indices;
		cut.push((now() - t) / batch);
	}
	plain.dispose();
	holed.dispose();
	return {
		resolution: settings.chunkResolution,
		populateMs: median(populate),
		populateHoledMs: median(populateHoled),
		cutMs: median(cut),
		cutCells: holed.holedCellCount
	};
}

function walkingSampler(foundations: FoundationDefinition[]) {
	const spacing = 2;
	const foundationManager = new FoundationManager(() => spacing);
	const slabManager = new SlabManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => spacing,
		getBuildingGridSize: () => 0.25
	});
	const stairManager = new StairManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => spacing
	});
	const roofManager = new RoofManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => spacing,
		getBuildingGridSize: () => 0.25
	});
	for (const f of foundations) {
		foundationManager.addFoundation(f);
		// The same slabs either way (a solid house with a ground-floor slab and one below would cost
		// the same), so the difference is only the basement code itself.
		const asBasement = { ...f, basement: { storeys: 2, storeyHeight: 3 } };
		basementSlabPlans(asBasement, spacing, 0.25, 0.2).forEach((plan, i) =>
			slabManager.addSlab({ id: `${f.id}-slab-${i}`, foundationId: f.id, ...plan, openings: [] })
		);
	}
	const sampler = new WorldSurfaceSampler(
		{ sample: () => 9 } as never,
		foundationManager,
		slabManager,
		stairManager,
		roofManager,
		() => 0.3
	);
	return { sampler, foundationManager };
}

function benchWalking(calls: number): BasementBenchReport['walking'] {
	const time = (foundations: FoundationDefinition[]) => {
		const { sampler, foundationManager } = walkingSampler(foundations);
		// Points all over the chunk: inside, on rims, between buildings; feet in the basement or above.
		let sink = 0;
		const run = () => {
			const t = now();
			for (let i = 0; i < calls; i++) {
				const x = (i * 7.31) % 96;
				const z = (i * 3.77) % 96;
				const feet = i % 2 === 0 ? 10 : 4;
				sink += sampler.getSupportingSurfaceY(x, z, feet);
				sink += foundationManager.getBasementContainmentRects(x, z, feet).length;
			}
			return ((now() - t) * 1000) / calls;
		};
		run(); // warm up
		const result = median([run(), run(), run()]);
		foundationManager.dispose();
		return sink === Number.NEGATIVE_INFINITY ? -1 : result;
	};
	const solidUs = time(benchFootprints(false));
	const basementUs = time(benchFootprints(true));
	return { solidUs, basementUs, extraUs: basementUs - solidUs };
}

function benchJoins(rounds: number): BasementBenchReport['joins'] {
	// 25 buildings of 8 foundations each: a 4 × 2 block of 4 × 4-cell footprints, all joined.
	const foundations: FoundationDefinition[] = [];
	for (let b = 0; b < 25; b++)
		for (let k = 0; k < 8; k++) {
			const gx = (b % 5) * 40 + (k % 4) * 4;
			const gz = Math.floor(b / 5) * 40 + Math.floor(k / 4) * 4;
			foundations.push({
				id: `b${b}-f${k}`,
				minGridX: gx,
				maxGridX: gx + 4,
				minGridZ: gz,
				maxGridZ: gz + 4,
				topY: 5,
				bottomY: 3,
				joinId: `b${b}-f0`
			});
		}
	const buildingTimes: number[] = [];
	let buildings = 0;
	for (let i = 0; i < rounds; i++) {
		const t = now();
		buildings = joinedBuildings(foundations).length;
		buildingTimes.push(now() - t);
	}
	// A U of 8 footprints, the worst ordinary outline.
	const rects = [
		{ minX: 0, maxX: 4, minZ: 0, maxZ: 4 },
		{ minX: 4, maxX: 8, minZ: 0, maxZ: 4 },
		{ minX: 8, maxX: 12, minZ: 0, maxZ: 4 },
		{ minX: 12, maxX: 16, minZ: 0, maxZ: 4 },
		{ minX: 0, maxX: 4, minZ: 4, maxZ: 8 },
		{ minX: 12, maxX: 16, minZ: 4, maxZ: 8 },
		{ minX: 0, maxX: 4, minZ: 8, maxZ: 12 },
		{ minX: 12, maxX: 16, minZ: 8, maxZ: 12 }
	];
	const polygon = [
		{ x: 0, z: 0 },
		{ x: 16, z: 0 },
		{ x: 16, z: 12 },
		{ x: 12, z: 12 },
		{ x: 12, z: 4 },
		{ x: 4, z: 4 },
		{ x: 4, z: 12 },
		{ x: 0, z: 12 }
	];
	const perCall = (fn: () => unknown) => {
		const n = rounds * 50;
		const t = now();
		for (let i = 0; i < n; i++) fn();
		return ((now() - t) * 1000) / n;
	};
	return {
		buildingsMs: median(buildingTimes),
		buildings,
		outlineUs: perCall(() => unionOutline(rects)),
		polygonInsideUs: perCall(() => polygonInRects(polygon, rects)),
		segmentInsideUs: perCall(() => segmentInRects(1, 1, 15, 2, rects))
	};
}

export function runBasementBench(
	options: { rounds?: number; calls?: number } = {}
): BasementBenchReport {
	const rounds = options.rounds ?? 15;
	const calls = options.calls ?? 20_000;
	return {
		terrain: benchTerrain(rounds),
		walking: benchWalking(calls),
		joins: benchJoins(rounds)
	};
}
