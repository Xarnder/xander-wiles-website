import { describe, expect, it } from 'vitest';
import { BaseTerrainSampler } from '../BaseTerrainSampler';
import { HydrologySystem } from '../HydrologySystem';
import {
	createDefaultHydrologySettings,
	SPAWN_RIVER_RADIUS,
	type HydrologySettings
} from '../HydrologyTypes';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';

/** Closest active river water to spawn (the origin), after confluence is resolved. */
function nearestRiverToSpawn(system: HydrologySystem): { distance: number; x: number; z: number } {
	let best = { distance: Number.POSITIVE_INFINITY, x: 0, z: 0 };
	for (const river of system.getRivers()) {
		const end = Math.min(river.samples.length, river.endIndex);
		for (let i = 0; i < end; i++) {
			const s = river.samples[i];
			const d = Math.hypot(s.x, s.z);
			if (d < best.distance) best = { distance: d, x: s.x, z: s.z };
		}
	}
	return best;
}

function syntheticSystem(
	sample: (x: number, z: number) => number,
	seed: string,
	overrides: Partial<HydrologySettings> = {}
): HydrologySystem {
	return new HydrologySystem(
		{ sample },
		{ ...createDefaultHydrologySettings(), ...overrides },
		seed
	);
}

const TERRAINS: Record<string, (x: number, z: number) => number> = {
	// Spawn on a hilltop: every natural river flows away from it.
	hilltop: (x, z) => 30 - Math.hypot(x, z) * 0.04,
	// Spawn in a basin.
	basin: (x, z) => 6 + Math.hypot(x, z) * 0.03,
	// A long even slope.
	slope: (x, z) => 20 + z * 0.03 + Math.sin(x * 0.01) * 2,
	// Nearly flat lowland: no source qualifies for a natural river.
	flat: (x, z) => 2 + Math.sin(x * 0.004) * 0.6 + Math.cos(z * 0.005) * 0.6
};

describe('a river near spawn', () => {
	for (const [name, terrain] of Object.entries(TERRAINS)) {
		it(`always runs within ${SPAWN_RIVER_RADIUS} m of spawn (${name})`, () => {
			for (const seed of ['a', 'b', 'c']) {
				const system = syntheticSystem(terrain, `${name}-${seed}`);
				system.ensureSync(0, 0);
				const nearest = nearestRiverToSpawn(system);
				expect(nearest.distance, `${name}/${seed}`).toBeLessThanOrEqual(SPAWN_RIVER_RADIUS);
				// And it is real water there.
				expect(system.sampleWater(nearest.x, nearest.z).waterType).toBe('river');
			}
		});
	}

	it('runs within the radius on the real game terrain, across seeds', () => {
		for (const seed of ['river-valley-7', 'alpine-1', 'meadow-42', 'forest-drift', 'zz-top']) {
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
			expect(nearestRiverToSpawn(system).distance, seed).toBeLessThanOrEqual(SPAWN_RIVER_RADIUS);
		}
	});

	it('is deterministic, whichever area is generated first', () => {
		const a = syntheticSystem(TERRAINS.hilltop, 'order');
		a.ensureSync(0, 0);
		a.ensureSync(2600, -1800);
		const b = syntheticSystem(TERRAINS.hilltop, 'order');
		b.ensureSync(2600, -1800);
		b.ensureSync(0, 0);
		const spawnRiver = (s: HydrologySystem) =>
			s
				.getRivers()
				.filter((r) => r.id.startsWith('spawn:'))
				.map((r) => r.samples.map((p) => [p.x, p.z]));
		expect(spawnRiver(a)).toEqual(spawnRiver(b));
	});

	it('leaves version-1 worlds exactly as they were generated', () => {
		const v1 = syntheticSystem(TERRAINS.hilltop, 'legacy', { generatorVersion: 1 });
		v1.ensureSync(0, 0);
		expect(v1.getRivers().some((r) => r.id.startsWith('spawn:'))).toBe(false);
	});

	it('does nothing when hydrology is disabled', () => {
		const off = syntheticSystem(TERRAINS.hilltop, 'off', { enabled: false });
		off.ensureSync(0, 0);
		expect(off.sampleWater(0, 0).waterType).toBe('none');
	});
});
