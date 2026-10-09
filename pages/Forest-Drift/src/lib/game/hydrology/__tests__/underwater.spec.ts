import { describe, expect, it } from 'vitest';
import { HydrologySystem } from '../HydrologySystem';
import { cameraIsUnderwater } from '../underwater';
import { LAKE_SURFACE_LIFT, RIVER_SURFACE_LIFT } from '../HydrologyMath';
import {
	createDefaultHydrologySettings,
	DEEP_WATER_DEPTH,
	type BaseTerrainSampler as BaseSampler,
	type HydrologySettings
} from '../HydrologyTypes';

function slope(x: number, z: number): number {
	return 8 + Math.max(0, -z) * 0.04 + Math.abs(x) * 0.16;
}

function bowl(x: number, z: number): number {
	const dx = x - 640;
	const dz = z - 640;
	return 6 + (dx * dx + dz * dz) * 0.00035;
}

function systemFor(
	sample: (x: number, z: number) => number,
	overrides: Partial<HydrologySettings> = {},
	seed = 'underwater'
): HydrologySystem {
	const settings = { ...createDefaultHydrologySettings(), riverDensity: 1, ...overrides };
	const base: BaseSampler = { sample };
	return new HydrologySystem(base, settings, seed);
}

describe('camera underwater', () => {
	const bed = 2;
	const surface = 4;

	it('tints only between the water plane and the bed', () => {
		const river = { waterType: 'river' as const, waterSurfaceY: surface, terrainY: bed };
		const plane = surface + RIVER_SURFACE_LIFT;
		expect(cameraIsUnderwater(plane + 0.2, river)).toBe(false);
		expect(cameraIsUnderwater(plane, river)).toBe(false);
		expect(cameraIsUnderwater(plane - 0.05, river)).toBe(true);
		expect(cameraIsUnderwater((plane + bed) / 2, river)).toBe(true);
		expect(cameraIsUnderwater(bed, river)).toBe(false);
		expect(cameraIsUnderwater(bed - 0.2, river)).toBe(false);
	});

	it('ignores dry ground and uses the lake plane', () => {
		expect(cameraIsUnderwater(1, { waterType: 'none', waterSurfaceY: 0, terrainY: 0 })).toBe(false);
		const lake = { waterType: 'lake' as const, waterSurfaceY: surface, terrainY: bed };
		const plane = surface + LAKE_SURFACE_LIFT;
		expect(cameraIsUnderwater(plane - 0.01, lake)).toBe(true);
		expect(cameraIsUnderwater(plane + 0.01, lake)).toBe(false);
	});
});

describe('walking through water', () => {
	it('lets the player walk a deep river and still blocks a deep lake', () => {
		const rivers = systemFor(slope, { lakeDensity: 0 }, 'walk-river');
		rivers.ensureSync(0, -400);
		let submerged = false;
		for (const river of rivers.getRivers().slice()) {
			for (let i = 1; i < river.endIndex - 1; i += 6) {
				const s = river.samples[i];
				const at = rivers.sampleWater(s.x, s.z);
				if (at.waterType !== 'river' || at.riverId !== river.id) continue;
				expect(rivers.walkBlockedByWater(s.x, s.z)).toBe(false);
				const plane = at.waterSurfaceY + RIVER_SURFACE_LIFT;
				expect(rivers.cameraUnderwater(s.x, plane + 0.25, s.z)).toBe(false);
				expect(rivers.cameraUnderwater(s.x, at.terrainY - 0.05, s.z)).toBe(false);
				if (at.terrainY + 1.7 < plane) {
					submerged = true;
					expect(rivers.cameraUnderwater(s.x, at.terrainY + 1.7, s.z)).toBe(true);
				}
			}
		}
		expect(submerged).toBe(true);

		const lakes = systemFor(
			bowl,
			{
				lakeDensity: 1,
				riverDensity: 0,
				minRiverSourceElevation: 500,
				minLakeRadius: 24,
				maxLakeRadius: 48
			},
			'walk-lake'
		);
		lakes.ensureSync(640, 640);
		const lake = lakes.getLakes()[0];
		expect(lakes.sampleWater(lake.x, lake.z).waterDepth).toBeGreaterThan(DEEP_WATER_DEPTH);
		expect(lakes.walkBlockedByWater(lake.x, lake.z)).toBe(true);
	});
});
