/**
 * Developer stress scenes for Mini Builds. Places designs through the normal MiniBuildSystem API —
 * budgets, instancing and caching all apply exactly as in play — skipping only overlap tests so a
 * grid of objects can be laid out quickly. Benchmark designs are named "Benchmark …" so they can be
 * cleared without touching player designs.
 */
import { colorMaterialFromHex } from '../building/MaterialTypes';
import { DEFAULT_MINI_BUILDS } from './defaultMiniBuilds';
import { cloneBlock, cloneMaterials } from './miniBuildGrid';
import type { MiniBuildSystem } from './MiniBuildSystem';
import {
	MINI_BUILD_WORLD_LIMITS,
	type MiniBuildBlock,
	type MiniBuildDraft,
	type QuarterTurn
} from './MiniBuildTypes';

/**
 * repeated — one 16-block chair many times · unique — every copy its own 16-block design ·
 * simple — 1–4 block props (instance-count stress) · dense — chunks filled to the budget ·
 * mixed — the default furniture set round-robin (a furnished house).
 */
export type MiniBuildBenchmarkScenario = 'repeated' | 'unique' | 'simple' | 'dense' | 'mixed';

export const BENCHMARK_PREFIX = 'Benchmark';

export interface MiniBuildBenchmarkPlacement {
	scenario: MiniBuildBenchmarkScenario;
	requested: number;
	placed: number;
	rejectedByBudget: number;
	designsCreated: number;
	compiles: number;
	compileMs: number;
	placeMs: number;
	chunksUsed: number;
	primitiveUnits: number;
}

/** Coordinates in 0.125m units (scaled ×2 to 0.0625m grid units) so benchmark designs keep their size. */
function block(
	id: string,
	x: number,
	y: number,
	z: number,
	sx: number,
	sy: number,
	sz: number,
	slot: number
): MiniBuildBlock {
	return {
		id,
		positionGrid: { x: x * 2, y: y * 2, z: z * 2 },
		sizeGrid: { x: sx * 2, y: sy * 2, z: sz * 2 },
		rotation: { x: 0, y: 0, z: 0 },
		materialSlot: slot
	};
}

/** A deterministic 16-block chair-like design; `variant` perturbs proportions so unique designs really differ. */
export function benchmarkChairDraft(variant = 0): MiniBuildDraft {
	const w = 4 + (variant % 3);
	const d = 4 + ((variant >> 2) % 2);
	const seat = 3 + ((variant >> 3) % 2);
	const blocks: MiniBuildBlock[] = [
		block('l1', 0, 0, 0, 1, seat, 1, 0),
		block('l2', w - 1, 0, 0, 1, seat, 1, 0),
		block('l3', 0, 0, d - 1, 1, seat, 1, 0),
		block('l4', w - 1, 0, d - 1, 1, seat, 1, 0),
		block('s1', 0, seat, 0, w, 1, d, 1),
		block('r1', 0, seat - 2, 1, w, 1, 1, 0),
		block('r2', 0, seat - 2, d - 2, w, 1, 1, 0),
		block('b1', 0, seat + 1, 0, 1, 5, 1, 0),
		block('b2', w - 1, seat + 1, 0, 1, 5, 1, 0),
		block('b3', 1, seat + 2, 0, w - 2, 1, 1, 1),
		block('b4', 1, seat + 4, 0, w - 2, 1, 1, 1),
		block('t1', 0, seat + 6, 0, w, 1, 1, 0),
		block('a1', 0, seat + 1, 1, 1, 2, d - 1, 1),
		block('a2', w - 1, seat + 1, 1, 1, 2, d - 1, 1),
		block('c1', 1, seat + 1, 1, w - 2, 1, d - 2, 2),
		block('f1', 1, 0, 1, w - 2, 1, d - 2, 2)
	];
	return {
		name: `${BENCHMARK_PREFIX} Chair ${variant}`,
		blocks,
		materials: [
			{ name: 'Wood', finish: 'wood', material: colorMaterialFromHex('#8B5A2B') },
			{
				name: 'Fabric',
				finish: 'fabric',
				material: colorMaterialFromHex(
					`#${(0x506070 + variant * 1237).toString(16).slice(-6).padStart(6, '0')}`
				)
			},
			{ name: 'Cushion', finish: 'fabric', material: colorMaterialFromHex('#E8DCC8') }
		]
	};
}

/** 1–4 block props for instance-count stress. */
export function benchmarkSimpleDraft(blockCount: 1 | 2 | 3 | 4): MiniBuildDraft {
	const blocks = [
		block('a', 0, 0, 0, 2, 2, 2, 0),
		block('b', 0, 2, 0, 2, 1, 2, 0),
		block('c', 2, 0, 0, 1, 1, 2, 0),
		block('d', 0, 0, 2, 2, 1, 1, 0)
	].slice(0, blockCount);
	return {
		name: `${BENCHMARK_PREFIX} Prop ${blockCount}`,
		blocks,
		materials: [{ name: 'Crate', finish: 'wood', material: colorMaterialFromHex('#A0783C') }]
	};
}

export interface BenchmarkPlacementOptions {
	originX: number;
	originZ: number;
	surfaceY: (x: number, z: number) => number;
}

/**
 * Lays instances out chunk by chunk in a square spiral around the origin, keeping each chunk just
 * under its budget/instance ceiling so the requested count spreads over as many chunks as needed.
 */
export function placeMiniBuildBenchmark(
	system: MiniBuildSystem,
	scenario: MiniBuildBenchmarkScenario,
	count: number,
	options: BenchmarkPlacementOptions
): MiniBuildBenchmarkPlacement {
	const compilesBefore = system.cache.compileCount;
	const compileMsBefore = system.cache.getStats().totalCompileMs;
	const started = performance.now();
	const designIds: string[] = [];
	const createDesign = (draft: MiniBuildDraft) => {
		const result = system.createDesign(draft);
		if (!result.ok) throw new Error(result.error);
		designIds.push(result.value.id);
		return result.value;
	};

	const pickDesign: (index: number) => { id: string; cost: number } = (() => {
		if (scenario === 'unique') {
			return (index: number) => {
				const design = createDesign(benchmarkChairDraft(index + 1));
				return { id: design.id, cost: design.blocks.length };
			};
		}
		if (scenario === 'simple') {
			const designs = ([1, 2, 3, 4] as const).map((n) => createDesign(benchmarkSimpleDraft(n)));
			return (index: number) => ({
				id: designs[index % 4].id,
				cost: designs[index % 4].blocks.length
			});
		}
		if (scenario === 'mixed') {
			const designs = DEFAULT_MINI_BUILDS.map((template) =>
				createDesign({
					name: `${BENCHMARK_PREFIX} ${template.name}`,
					blocks: template.blocks.map(cloneBlock),
					materials: cloneMaterials(template.materials)
				})
			);
			return (index: number) => ({
				id: designs[index % designs.length].id,
				cost: designs[index % designs.length].blocks.length
			});
		}
		const chair = createDesign(benchmarkChairDraft(0));
		return () => ({ id: chair.id, cost: chair.blocks.length });
	})();

	const size = MINI_BUILD_WORLD_LIMITS.chunkSize;
	const fill = scenario === 'dense' ? 1 : 0.9;
	const originCx = Math.floor(options.originX / size) + 1;
	const originCz = Math.floor(options.originZ / size);
	const chunkOrder = spiral(64);
	let placed = 0;
	let rejected = 0;
	let chunkIndex = 0;
	let slotInChunk = 0;
	let index = 0;
	const usedChunks = new Set<string>();
	let pending: { index: number; design: { id: string; cost: number } } | null = null;

	while (placed < count && chunkIndex < chunkOrder.length) {
		const probe = pickDesignPreview(scenario);
		const perChunk = Math.min(
			MINI_BUILD_WORLD_LIMITS.maxInstancesPerChunk - 1,
			Math.floor((MINI_BUILD_WORLD_LIMITS.primitiveBudgetPerChunk * fill) / probe)
		);
		const columns = Math.ceil(Math.sqrt(perChunk));
		const spacing = size / columns;
		if (slotInChunk >= perChunk) {
			chunkIndex++;
			slotInChunk = 0;
			continue;
		}
		const [dcx, dcz] = chunkOrder[chunkIndex];
		const x = (originCx + dcx) * size + spacing * ((slotInChunk % columns) + 0.5);
		const z = (originCz + dcz) * size + spacing * (Math.floor(slotInChunk / columns) + 0.5);
		// A rejected placement retries the same design in the next chunk rather than creating another.
		if (!pending || pending.index !== index) pending = { index, design: pickDesign(index) };
		const design = pending.design;
		const result = system.placeInstance(
			design.id,
			{ x, y: options.surfaceY(x, z), z },
			((index % 4) * 90) as QuarterTurn
		);
		if (result.ok) {
			placed++;
			usedChunks.add(`${originCx + dcx}:${originCz + dcz}`);
		} else {
			rejected++;
			chunkIndex++;
			slotInChunk = 0;
			continue;
		}
		slotInChunk++;
		index++;
	}
	system.instances.flushStreaming();

	let primitiveUnits = 0;
	for (const chunkId of usedChunks) primitiveUnits += system.budget.getPrimitiveUsage(chunkId);
	return {
		scenario,
		requested: count,
		placed,
		rejectedByBudget: rejected,
		designsCreated: designIds.length,
		compiles: system.cache.compileCount - compilesBefore,
		compileMs: system.cache.getStats().totalCompileMs - compileMsBefore,
		placeMs: performance.now() - started,
		chunksUsed: usedChunks.size,
		primitiveUnits
	};
}

/** Planning cost per slot: a fixed average for mixed props keeps the in-chunk grid stable. */
function pickDesignPreview(scenario: MiniBuildBenchmarkScenario): number {
	if (scenario === 'simple') return 2.5;
	return scenario === 'mixed' ? 12 : 16;
}

/** Removes every benchmark design and its instances. Player designs are never touched. */
export function clearMiniBuildBenchmark(system: MiniBuildSystem): number {
	let removed = 0;
	for (const definition of system.library.list()) {
		if (!definition.name.startsWith(BENCHMARK_PREFIX)) continue;
		const result = system.deleteDesign(definition.id, { deleteInstances: true });
		if (result.ok) removed += result.value.removedInstances;
	}
	return removed;
}

function spiral(rings: number): [number, number][] {
	const out: [number, number][] = [[0, 0]];
	for (let r = 1; r <= rings && out.length < 4096; r++) {
		for (let dx = -r; dx <= r; dx++) out.push([dx, -r], [dx, r]);
		for (let dz = -r + 1; dz <= r - 1; dz++) out.push([-r, dz], [r, dz]);
	}
	return out;
}
