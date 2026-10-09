import { describe, expect, it } from 'vitest';
import { BaseTerrainSampler } from '../BaseTerrainSampler';
import { HydrologySystem } from '../HydrologySystem';
import {
	distanceOutsideLake,
	LAKE_MOUTH_REACH,
	meetSinkLake,
	outletLakeSpan,
	sinkLakeStart
} from '../HydrologyMath';
import { createDefaultHydrologySettings, type LakeDefinition } from '../HydrologyTypes';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';

const ROUND_LAKE: LakeDefinition = {
	id: 'round',
	x: 0,
	z: 0,
	waterLevel: 5,
	baseRadius: 40,
	depth: 2,
	a1: 0,
	p1: 0,
	a2: 0,
	p2: 0,
	a3: 0,
	p3: 0,
	bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
	sink: true
};

/** Points every 8 m along +X starting at `from`. */
function line(from: number, count: number): { x: number; z: number }[] {
	return Array.from({ length: count }, (_, i) => ({ x: from + i * 8, z: 0 }));
}

describe('river mouths on lakes', () => {
	it('locks an outlet until it has left the shore, mouth sample included', () => {
		// 20, 28, 36 inside; 44 is 4 m out (the mouth); 52 is 12 m out.
		expect(outletLakeSpan(line(20, 6), ROUND_LAKE)).toBe(4);
		// Starting off the lake, there is nothing to lock.
		expect(outletLakeSpan(line(60, 4), ROUND_LAKE)).toBe(0);
	});

	it('locks a sink river from its mouth sample onwards', () => {
		// Flowing in along −X: 76, 68, 60, 52 (12 m out), 44 (mouth, 4 m out), 36, 28 inside.
		const points = line(28, 7).reverse();
		expect(sinkLakeStart(points, ROUND_LAKE)).toBe(4);
		expect(distanceOutsideLake(ROUND_LAKE, points[4].x, points[4].z)).toBeLessThanOrEqual(
			LAKE_MOUTH_REACH
		);
		// A river that never reaches the lake is left alone.
		expect(sinkLakeStart(line(60, 4).reverse(), ROUND_LAKE)).toBe(4);
	});

	it('puts the mouth on the lake level and eases a higher river down onto it', () => {
		const samples = [9, 8.6, 8.2, 7.8, 7.4, 7, 6.6, 3, 2].map((waterY) => ({ waterY }));
		meetSinkLake(samples, 7, 5);
		expect(samples[7].waterY).toBe(5);
		expect(samples[8].waterY).toBe(5);
		for (let i = 1; i < samples.length; i++) {
			expect(samples[i].waterY).toBeLessThanOrEqual(samples[i - 1].waterY + 1e-9);
		}
		// The step onto the lake is spread over the approach, not one jump at the shore.
		expect(samples[6].waterY - samples[7].waterY).toBeLessThan(0.5);
	});
});

describe('generated rivers meet their lakes at one height', () => {
	for (const seed of ['river-valley-7', 'meadow-42', 'alpine-1']) {
		it(`matches every lake junction (${seed})`, () => {
			const settings = createDefaultTerrainSettings();
			settings.seed = seed;
			const terrain = new TerrainHeightSampler(settings);
			const system = new HydrologySystem(
				new BaseTerrainSampler(terrain),
				createDefaultHydrologySettings(),
				seed
			);
			terrain.attachHydrology(system);
			system.ensureSync(0, 0);
			const lakes = new Map(system.getLakes().map((lake) => [lake.id, lake]));
			let junctions = 0;
			for (const river of system.getRivers()) {
				const end = Math.min(river.endIndex, river.samples.length);
				const sink = river.sinkLakeId ? lakes.get(river.sinkLakeId) : undefined;
				const start = river.lakeLockStart;
				if (sink && start !== undefined && start < end) {
					junctions++;
					for (let i = start; i < end; i++) {
						expect(river.samples[i].waterY).toBeCloseTo(sink.waterLevel, 6);
					}
					// Never climbing into the lake: everything upstream is at or above it.
					for (let i = 0; i < start; i++) {
						expect(river.samples[i].waterY).toBeGreaterThanOrEqual(sink.waterLevel - 1e-6);
					}
				}
				const source = river.outletOfLakeId ? lakes.get(river.outletOfLakeId) : undefined;
				if (source) {
					junctions++;
					// The outlet starts on its own lake and holds its level until it leaves the shore.
					const first = river.samples[0];
					expect(distanceOutsideLake(source, first.x, first.z)).toBeLessThan(0);
					expect(river.lakeLockEnd).toBeGreaterThan(0);
					for (let i = 0; i < (river.lakeLockEnd ?? 0); i++) {
						expect(river.samples[i].waterY).toBeCloseTo(source.waterLevel, 6);
					}
					// It never flows back into the lake it left.
					expect(river.sinkLakeId).not.toBe(river.outletOfLakeId);
				}
			}
			expect(junctions).toBeGreaterThan(0);
		});
	}
});
