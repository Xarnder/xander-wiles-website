import { describe, expect, it } from 'vitest';
import { TreePlacementGenerator } from '../TreePlacementGenerator';
import { createDefaultVegetationSettings, type TreePlacementSettings } from '../VegetationTypes';
import type { TerrainHeightSampler, HeightSample } from '../../terrain/TerrainHeightSampler';
import type { VegetationRegionSampler } from '../VegetationRegionSampler';

/** A flat terrain stand-in — same shape TreePlacementGenerator actually calls, nothing more. */
function makeTerrainSampler(height: number, slopeDegrees: number): TerrainHeightSampler {
	const radians = (slopeDegrees * Math.PI) / 180;
	const normalY = Math.cos(radians);
	const normalX = Math.sin(radians);
	return {
		sample: () => height,
		sampleWithNormal: (_x: number, _z: number, out: HeightSample) => {
			out.height = height;
			out.normalX = normalX;
			out.normalY = normalY;
			out.normalZ = 0;
		}
	} as unknown as TerrainHeightSampler;
}

function makeConstantDensitySampler(density: number): VegetationRegionSampler {
	return { getForestDensity: () => density } as unknown as VegetationRegionSampler;
}

function makeGenerator(
	density: number,
	slopeDegrees: number,
	settingsOverrides: Partial<TreePlacementSettings> = {},
	seed = 'tree-placement-world'
): TreePlacementGenerator {
	const settings = { ...createDefaultVegetationSettings().trees, ...settingsOverrides };
	const generator = new TreePlacementGenerator(
		makeTerrainSampler(0, slopeDegrees),
		makeConstantDensitySampler(density),
		settings
	);
	generator.setSeed(seed);
	return generator;
}

describe('deterministic tree candidates', () => {
	it('produces identical position/rotation/scale/variant for the same seed and cell', () => {
		const a = makeGenerator(1, 0);
		const b = makeGenerator(1, 0);

		const evalA = a.evaluateCell(12, -7);
		const evalB = b.evaluateCell(12, -7);

		expect(evalA).toEqual(evalB);
		expect(evalA.accepted).toBe(true);
	});

	it('different cells deterministically produce different candidates (no accidental constant output)', () => {
		const generator = makeGenerator(1, 0);
		const first = generator.evaluateCell(0, 0).tree;
		const second = generator.evaluateCell(1, 0).tree;
		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		expect(first).not.toEqual(second);
	});

	it('a different seed produces a different candidate for the same cell', () => {
		const a = makeGenerator(1, 0, {}, 'seed-one');
		const b = makeGenerator(1, 0, {}, 'seed-two');
		expect(a.evaluateCell(5, 5)).not.toEqual(b.evaluateCell(5, 5));
	});
});

describe('negative and zero-crossing cell coordinates', () => {
	it('places the candidate within its own cell bounds for negative cellX/cellZ', () => {
		const cellSize = 6;
		const generator = makeGenerator(1, 0, { treeCellSize: cellSize });

		for (const [cellX, cellZ] of [
			[-5, -5],
			[-5, 5],
			[5, -5],
			[-1, 0],
			[0, -1]
		] as const) {
			const evaluation = generator.evaluateCell(cellX, cellZ);
			expect(evaluation.worldX).toBeGreaterThanOrEqual(cellX * cellSize);
			expect(evaluation.worldX).toBeLessThan((cellX + 1) * cellSize);
			expect(evaluation.worldZ).toBeGreaterThanOrEqual(cellZ * cellSize);
			expect(evaluation.worldZ).toBeLessThan((cellZ + 1) * cellSize);
		}
	});

	it('is deterministic and consistent across the world-zero boundary', () => {
		const a = makeGenerator(1, 0);
		const b = makeGenerator(1, 0);
		for (const [cellX, cellZ] of [
			[-1, -1],
			[0, 0],
			[1, 1]
		] as const) {
			expect(a.evaluateCell(cellX, cellZ)).toEqual(b.evaluateCell(cellX, cellZ));
		}
	});
});

describe('forest density drives acceptance', () => {
	it('a forced-dense forest accepts substantially more candidates than forced-open terrain', () => {
		const dense = makeGenerator(1, 0);
		const open = makeGenerator(0, 0);

		let denseAccepted = 0;
		let openAccepted = 0;
		const sampleCount = 200;
		for (let i = 0; i < sampleCount; i++) {
			if (dense.evaluateCell(i, 0).accepted) denseAccepted++;
			if (open.evaluateCell(i, 0).accepted) openAccepted++;
		}

		expect(openAccepted).toBe(0);
		expect(denseAccepted).toBeGreaterThan(sampleCount * 0.9);
	});
});

describe('slope rejection', () => {
	it('rejects a candidate on terrain steeper than maxTreeSlopeDegrees', () => {
		const generator = makeGenerator(1, 60, { maxTreeSlopeDegrees: 40 });
		const evaluation = generator.evaluateCell(3, 3);
		expect(evaluation.accepted).toBe(false);
		expect(evaluation.rejectionReason).toBe('slope');
	});

	it('accepts the same otherwise-valid candidate when the slope is within the limit', () => {
		const generator = makeGenerator(1, 10, { maxTreeSlopeDegrees: 40 });
		const evaluation = generator.evaluateCell(3, 3);
		expect(evaluation.accepted).toBe(true);
	});
});

describe('stylised tree placement', () => {
	it('keeps neighbouring trees at least minTreeSpacing apart', () => {
		const spacing = 3;
		const generator = makeGenerator(1, 0, { minTreeSpacing: spacing, treeCellSize: 6 });
		const trees = [];
		for (let x = -6; x < 6; x++)
			for (let z = -6; z < 6; z++) trees.push(generator.generateCell(x, z)!);
		for (let i = 0; i < trees.length; i++) {
			for (let j = i + 1; j < trees.length; j++) {
				const d = Math.hypot(trees[i].worldX - trees[j].worldX, trees[i].worldZ - trees[j].worldZ);
				expect(d).toBeGreaterThanOrEqual(spacing - 1e-9);
			}
		}
	});

	it('assigns a valid species, prototype variant and bounded variation deterministically', () => {
		const a = makeGenerator(1, 0);
		const b = makeGenerator(1, 0);
		const species = new Set<string>();
		for (let i = 0; i < 200; i++) {
			const tree = a.generateCell(i, -i)!;
			expect(tree).toEqual(b.generateCell(i, -i));
			species.add(tree.speciesId);
			expect(tree.variant).toBeGreaterThanOrEqual(0);
			expect(tree.widthScale).toBeGreaterThan(0.8);
			expect(tree.widthScale).toBeLessThan(1.2);
			expect(tree.tint).toBeGreaterThanOrEqual(0);
			expect(tree.tint).toBeLessThan(1);
		}
		expect(species.size).toBeGreaterThan(1);
	});

	it('a lower density scale plants a stable subset of the same trees', () => {
		const settings = { ...createDefaultVegetationSettings().trees };
		const make = (scale: number) => {
			const g = new TreePlacementGenerator(
				makeTerrainSampler(0, 0),
				makeConstantDensitySampler(0.6),
				settings,
				{
					getDensityScale: () => scale
				}
			);
			g.setSeed('subset-world');
			return g;
		};
		const full = make(1);
		const reduced = make(0.6);
		let fullCount = 0;
		let reducedCount = 0;
		for (let i = 0; i < 300; i++) {
			const r = reduced.generateCell(i, 7);
			const f = full.generateCell(i, 7);
			if (f) fullCount++;
			if (r) {
				reducedCount++;
				expect(r).toEqual(f);
			}
		}
		expect(reducedCount).toBeLessThan(fullCount);
	});

	it('uses the configured prototype count per species', () => {
		const settings = { ...createDefaultVegetationSettings().trees };
		const g = new TreePlacementGenerator(
			makeTerrainSampler(0, 0),
			makeConstantDensitySampler(1),
			settings,
			{
				getPrototypesPerSpecies: () => 1
			}
		);
		g.setSeed('one-prototype');
		for (let i = 0; i < 100; i++) expect(g.generateCell(i, 0)!.variant).toBe(0);
	});
});
