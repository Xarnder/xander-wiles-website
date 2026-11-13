import { createNoise2D } from 'simplex-noise';
import { describe, expect, it } from 'vitest';
import { createMulberry32 } from '../../terrain/seededRandom';
import {
	ClimateSampler,
	equalizeSimplex,
	LAPSE_PER_METRE,
	LAPSE_START,
	SPAWN_MOISTURE,
	SPAWN_TEMPERATURE
} from '../ClimateSampler';
import { createClimateSample, createDefaultBiomeSettings } from '../BiomeTypes';

function sampler(seed: string, settings = createDefaultBiomeSettings()) {
	const climate = new ClimateSampler(settings);
	climate.setSeed(seed);
	return climate;
}

describe('equalizeSimplex', () => {
	it('is monotonic and maps the ends to 0 and 1', () => {
		expect(equalizeSimplex(-2)).toBe(0);
		expect(equalizeSimplex(2)).toBe(1);
		expect(equalizeSimplex(0)).toBeCloseTo(0.5, 6);
		let previous = -1;
		for (let v = -1; v <= 1; v += 0.001) {
			const u = equalizeSimplex(v);
			expect(u).toBeGreaterThanOrEqual(previous);
			previous = u;
		}
	});

	it('makes simplex noise roughly uniform (each tenth holds 10% ± 1.5%)', () => {
		const noise = createNoise2D(createMulberry32(12345));
		const buckets = new Array(10).fill(0);
		const n = 200_000;
		const random = createMulberry32(99);
		for (let i = 0; i < n; i++) {
			const u = equalizeSimplex(noise(random() * 500, random() * 500));
			buckets[Math.min(9, Math.floor(u * 10))]++;
		}
		for (const count of buckets) expect(Math.abs(count / n - 0.1)).toBeLessThan(0.015);
	});
});

describe('ClimateSampler', () => {
	it('is deterministic per seed and differs between seeds', () => {
		const a = sampler('climate-a');
		const b = sampler('climate-a');
		const c = sampler('climate-b');
		const sa = createClimateSample();
		const sb = createClimateSample();
		const sc = createClimateSample();
		let differs = 0;
		for (let i = 0; i < 200; i++) {
			const x = i * 731 - 50_000;
			const z = i * -419 + 20_000;
			a.sample(x, z, 5, sa);
			b.sample(x, z, 5, sb);
			c.sample(x, z, 5, sc);
			expect(sb).toEqual(sa);
			if (sc.temperature !== sa.temperature) differs++;
		}
		expect(differs).toBeGreaterThan(150);
	});

	it('reproduces the same climate after switching seed and back', () => {
		const climate = sampler('first');
		const before = createClimateSample();
		const after = createClimateSample();
		climate.sample(1234, -5678, 0, before);
		climate.setSeed('second');
		climate.setSeed('first');
		climate.sample(1234, -5678, 0, after);
		expect(after).toEqual(before);
	});

	it('rounds every value to the 1/4096 grid (cross-engine safety)', () => {
		const climate = sampler('quantum');
		const s = createClimateSample();
		for (let i = 0; i < 100; i++) {
			climate.sample(i * 97.3, i * -61.7, i * 0.4, s);
			for (const v of [s.temperature, s.moisture, s.rarity]) {
				expect(Number.isInteger(v * 4096)).toBe(true);
				expect(v).toBeGreaterThanOrEqual(0);
				expect(v).toBeLessThanOrEqual(1);
			}
		}
	});

	it('cools with elevation above the lapse start', () => {
		const climate = sampler('lapse');
		const low = createClimateSample();
		const high = createClimateSample();
		climate.sample(800, 800, LAPSE_START, low);
		climate.sample(800, 800, LAPSE_START + 20, high);
		if (low.temperature > 0.2) {
			expect(low.temperature - high.temperature).toBeCloseTo(20 * LAPSE_PER_METRE, 3);
		}
		expect(high.moisture).toBe(low.moisture);
	});

	it('puts the spawn point in the temperate window for almost every seed (Q21)', () => {
		const s = createClimateSample();
		let inside = 0;
		const seeds = 60;
		for (let i = 0; i < seeds; i++) {
			const climate = sampler(`spawn-${i}`);
			climate.sample(0, 0, 0, s);
			if (
				s.temperature >= SPAWN_TEMPERATURE[0] - 1e-3 &&
				s.temperature <= SPAWN_TEMPERATURE[1] + 1e-3 &&
				s.moisture >= SPAWN_MOISTURE[0] - 1e-3 &&
				s.moisture <= SPAWN_MOISTURE[1] + 1e-3
			)
				inside++;
		}
		expect(inside).toBe(seeds);
	});

	it('leaves the domain alone when the spawn guarantee is off', () => {
		const climate = sampler('no-spawn', { ...createDefaultBiomeSettings(), spawnTemperate: false });
		expect(climate.getSpawnOffset()).toEqual({ x: 0, z: 0 });
	});

	it('applies the world temperature and moisture biases', () => {
		const warm = sampler('bias', {
			...createDefaultBiomeSettings(),
			temperatureBias: 0.2,
			spawnTemperate: false
		});
		const plain = sampler('bias', { ...createDefaultBiomeSettings(), spawnTemperate: false });
		const a = createClimateSample();
		const b = createClimateSample();
		plain.sample(3000, 3000, 0, a);
		warm.sample(3000, 3000, 0, b);
		expect(b.temperature).toBeCloseTo(Math.min(1, a.temperature + 0.2), 3);
	});
});
