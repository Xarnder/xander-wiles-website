import { describe, expect, it } from 'vitest';
import { BaseTerrainSampler } from '../BaseTerrainSampler';
import { foundationOverlapsWater } from '../foundationWater';
import { HydrologySystem } from '../HydrologySystem';
import { lakeRadiusAt, riverBeachCover, riverEdgeStone, riverWaterEdge } from '../HydrologyMath';
import { writeTerrainColor } from '../../terrain/terrainColor';
import {
	createDefaultHydrologySettings,
	DEEP_WATER_DEPTH,
	type BaseTerrainSampler as BaseSampler,
	type HydrologySettings
} from '../HydrologyTypes';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';

function slope(x: number, z: number): number {
	return 8 + Math.max(0, -z) * 0.04 + Math.abs(x) * 0.16;
}

function bowl(x: number, z: number): number {
	const dx = x - 640;
	const dz = z - 640;
	return 6 + (dx * dx + dz * dz) * 0.00035;
}

function valleyPit(x: number, z: number): number {
	const pit = Math.exp(-(x * x + (z - 80) * (z - 80)) / (90 * 90)) * -12;
	return 24 - z * 0.02 + Math.abs(x) * 0.1 + pit;
}

function systemFor(
	sample: (x: number, z: number) => number,
	overrides: Partial<HydrologySettings> = {},
	seed = 'hydro-test'
): HydrologySystem {
	const settings = {
		...createDefaultHydrologySettings(),
		riverDensity: 1,
		lakeDensity: 0.2,
		...overrides
	};
	const base: BaseSampler = { sample };
	return new HydrologySystem(base, settings, seed);
}

function activeRivers(system: HydrologySystem) {
	return system.getRivers().filter((river) => river.endIndex >= 2 && river.samples.length >= 2);
}

describe('hydrology determinism', () => {
	it('does not depend on which area was generated first', () => {
		const first = systemFor(slope, {}, 'order-seed');
		first.ensureSync(0, -400);
		first.ensureSync(1800, -200);
		const second = systemFor(slope, {}, 'order-seed');
		second.ensureSync(1800, -200);
		second.ensureSync(0, -400);

		for (const [x, z] of [
			[0, -400],
			[96, -200],
			[-64, -800],
			[1280, -100],
			[40, 20]
		] as const) {
			const base = slope(x, z);
			expect(first.shapeHeight(x, z, base)).toBe(second.shapeHeight(x, z, base));
			expect(first.sampleWater(x, z)).toEqual(second.sampleWater(x, z));
		}
		expect(
			first
				.getRivers()
				.map((river) => river.id)
				.sort()
		).toEqual(
			second
				.getRivers()
				.map((river) => river.id)
				.sort()
		);
	});

	it('matches across negative coordinates and the origin', () => {
		const a = systemFor(slope, {}, 'neg-seed');
		const b = systemFor(slope, {}, 'neg-seed');
		a.ensureSync(-1800, -1600);
		b.ensureSync(-1800, -1600);
		for (const [x, z] of [
			[-1800, -1600],
			[-64, -32],
			[-0.5, 0.5],
			[0, 0],
			[-1280, -1280]
		] as const) {
			expect(a.shapeHeight(x, z, slope(x, z))).toBe(b.shapeHeight(x, z, slope(x, z)));
		}
		expect(
			a
				.getRivers()
				.map((river) => river.id)
				.sort()
		).toEqual(
			b
				.getRivers()
				.map((river) => river.id)
				.sort()
		);
	});

	it('keeps a carved height continuous across a chunk and a region boundary', () => {
		const system = systemFor(slope, {}, 'seam-seed');
		system.ensureSync(0, -300);
		system.ensureSync(1280, -300);
		for (const boundary of [96, 1280]) {
			const left = slope(boundary - 0.5, -180);
			const right = slope(boundary + 0.5, -180);
			const gap = Math.abs(
				system.shapeHeight(boundary + 0.5, -180, right) -
					system.shapeHeight(boundary - 0.5, -180, left)
			);
			expect(gap).toBeLessThan(1.5);
		}
	});
});

describe('rivers', () => {
	const system = systemFor(slope, { lakeDensity: 0.05, meanderStrength: 0.8 }, 'river-seed');
	system.ensureSync(0, -500);

	it('starts rivers on higher ground and walks them downhill without cycles', () => {
		const rivers = activeRivers(system);
		expect(rivers.length).toBeGreaterThan(0);
		const region = system.getRegion(0, -1);
		expect(region?.sources.length).toBeGreaterThan(0);
		let terrainSum = 0;
		let terrainCount = 0;
		for (let z = -1200; z <= -40; z += 160) {
			for (let x = -480; x <= 480; x += 160) {
				terrainSum += slope(x, z);
				terrainCount++;
			}
		}
		const sourceMean =
			(region?.sources.reduce((sum, source) => sum + source.height, 0) ?? 0) /
			(region?.sources.length ?? 1);
		expect(sourceMean).toBeGreaterThan(terrainSum / terrainCount);

		for (const river of rivers) {
			expect(new Set(river.cells).size).toBe(river.cells.length);
			let down = 0;
			let steps = 0;
			for (let i = 1; i < river.raw.length; i++) {
				const previous = slope(river.raw[i - 1].x, river.raw[i - 1].z);
				const next = slope(river.raw[i].x, river.raw[i].z);
				if (next <= previous + 0.05) down++;
				steps++;
			}
			expect(down / Math.max(1, steps)).toBeGreaterThan(0.6);
			for (const sample of river.samples) {
				expect(Number.isFinite(sample.x)).toBe(true);
				expect(Number.isFinite(sample.z)).toBe(true);
				expect(Number.isFinite(sample.waterY)).toBe(true);
			}
		}
	});

	it('grows flow and width downstream and does not climb', () => {
		const river = activeRivers(system).sort((a, b) => b.samples.length - a.samples.length)[0];
		expect(river.samples.length).toBeGreaterThan(6);
		const end = river.endIndex - 1;
		expect(river.samples[end].flow).toBeGreaterThan(river.samples[0].flow);
		expect(river.samples[end].width).toBeGreaterThan(river.samples[0].width);
		const limit = river.lakeLockStart ?? end;
		for (let i = 1; i <= limit; i++) {
			expect(river.samples[i].waterY).toBeLessThanOrEqual(river.samples[i - 1].waterY + 1e-4);
		}
	});

	it('carves a channel: deep centre, shallower edge, untouched ground outside', () => {
		const river = activeRivers(system).sort((a, b) => b.samples.length - a.samples.length)[0];
		const sample = river.samples[Math.min(4, river.endIndex - 1)];
		const bed = system.shapeHeight(sample.x, sample.z, slope(sample.x, sample.z));
		expect(bed).toBeLessThan(sample.waterY - 0.05);
		const edgeX = sample.x - sample.tangentZ * sample.width * 0.42;
		const edgeZ = sample.z + sample.tangentX * sample.width * 0.42;
		const edge = system.shapeHeight(edgeX, edgeZ, slope(edgeX, edgeZ));
		expect(edge).toBeGreaterThan(bed);
		expect(edge).toBeLessThan(sample.waterY);
		let dryX = 0;
		let dryZ = 0;
		let foundDry = false;
		for (let x = -1800; x <= 1800 && !foundDry; x += 120) {
			for (let z = -1800; z <= 400 && !foundDry; z += 120) {
				const water = system.sampleWater(x, z);
				if (water.waterType === 'none' && water.terrainInfluence === 0) {
					dryX = x;
					dryZ = z;
					foundDry = true;
				}
			}
		}
		expect(foundDry).toBe(true);
		expect(system.shapeHeight(dryX, dryZ, slope(dryX, dryZ))).toBe(slope(dryX, dryZ));
		const water = system.sampleWater(sample.x, sample.z);
		expect(water.waterType).toBe('river');
		expect(water.riverId).toBe(river.id);
		expect(water.waterDepth).toBeGreaterThan(0.2);
	});

	it('keeps a small shelf of mud or stone on both banks', () => {
		const stones = Array.from({ length: 12 }, (_, i) => riverEdgeStone(i * 40, i * 17, 0.01, 4));
		expect(Math.max(...stones) - Math.min(...stones)).toBeGreaterThan(0.35);
		expect(riverEdgeStone(10, 10, 0.2, 1.8)).toBeGreaterThan(riverEdgeStone(10, 10, 0, 12));
		expect(riverBeachCover(-2, 1.3)).toBe(0);
		expect(riverBeachCover(0.4, 1.3)).toBeGreaterThan(0.8);
		expect(riverBeachCover(3, 1.3)).toBe(0);

		let shelfHits = 0;
		let matchedBanks = false;
		let minStone = 1;
		let maxStone = 0;
		for (const river of activeRivers(system)) {
			for (let i = 1; i < river.endIndex - 1; i += 3) {
				const s = river.samples[i];
				const half = Math.max(0.8, s.width * 0.5);
				const ox = -s.tangentZ * (half + 0.65);
				const oz = s.tangentX * (half + 0.65);
				const left = system.sampleWater(s.x + ox, s.z + oz);
				const right = system.sampleWater(s.x - ox, s.z - oz);
				if (
					left.beachCover > 0.55 &&
					right.beachCover > 0.55 &&
					left.waterType === 'none' &&
					right.waterType === 'none' &&
					Math.abs(left.beachStone - right.beachStone) < 0.02
				) {
					matchedBanks = true;
					minStone = Math.min(minStone, left.beachStone);
					maxStone = Math.max(maxStone, right.beachStone, left.beachStone);
				}
				if (left.beachCover > 0.55 && left.waterType !== 'lake') {
					const x = s.x + ox;
					const z = s.z + oz;
					const h = system.shapeHeight(x, z, slope(x, z));
					const bed = system.shapeHeight(s.x, s.z, slope(s.x, s.z));
					if (h > bed && h > s.waterY + 0.15 && h < s.waterY + 1.15) shelfHits++;
				}
			}
		}
		expect(shelfHits).toBeGreaterThan(0);
		expect(matchedBanks).toBe(true);
		expect(maxStone - minStone).toBeGreaterThan(0.2);

		const mud = new Float32Array(3);
		const rock = new Float32Array(3);
		const grass = new Float32Array(3);
		writeTerrainColor(8, 1, mud, 0, 10, 10, 1, 0);
		writeTerrainColor(8, 1, rock, 0, 10, 10, 1, 1);
		writeTerrainColor(8, 1, grass, 0, 10, 10, 0, 0);
		expect(mud[0]).toBeGreaterThan(mud[2]);
		expect(mud[1]).toBeLessThan(grass[1]);
		expect(rock[0] + rock[1] + rock[2]).toBeGreaterThan(mud[0] + mud[1] + mud[2] + 0.4);
	});

	it('holds the water below both banks and cuts a deeper bed', () => {
		let banks = 0;
		let beds = 0;
		for (const river of activeRivers(system)) {
			const last = Math.min(river.lakeLockStart ?? river.endIndex, river.endIndex);
			for (let i = 1; i < last - 1; i += 4) {
				const s = river.samples[i];
				const edge = riverWaterEdge(s.width, 1);
				const px = -s.tangentZ;
				const pz = s.tangentX;
				for (const side of [1, -1]) {
					const x = s.x + px * edge * side;
					const z = s.z + pz * edge * side;
					const shore = system.sampleWater(x, z);
					if (shore.waterType === 'lake' || shore.distanceToWater <= 0.05) continue;
					expect(shore.terrainY).toBeGreaterThan(s.waterY + 0.15);
					// Also the nearest river, when its ribbon actually reaches this point.
					if (shore.distanceToWater < 2 && Number.isFinite(shore.shoreWaterY)) {
						expect(shore.terrainY).toBeGreaterThan(shore.shoreWaterY + 0.15);
					}
					banks++;
				}
				const bed = system.sampleWater(s.x, s.z);
				if (bed.waterType === 'river' && bed.riverId === river.id) {
					expect(bed.terrainY).toBeLessThan(s.waterY - 0.4);
					beds++;
				}
			}
		}
		expect(banks).toBeGreaterThan(0);
		expect(beds).toBeGreaterThan(0);
	});
});

describe('lakes', () => {
	const system = systemFor(
		bowl,
		{
			lakeDensity: 1,
			riverDensity: 0,
			minRiverSourceElevation: 500,
			minLakeRadius: 24,
			maxLakeRadius: 48
		},
		'lake-seed'
	);
	system.ensureSync(640, 640);

	it('holds a horizontal surface over a carved organic basin', () => {
		const lakes = system.getLakes();
		expect(lakes.length).toBeGreaterThan(0);
		const lake = lakes[0];
		const radii = Array.from({ length: 32 }, (_, i) => lakeRadiusAt(lake, (i / 32) * Math.PI * 2));
		expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(lake.baseRadius * 0.04);
		const centre = system.sampleWater(lake.x, lake.z);
		const inland = system.sampleWater(lake.x + 3, lake.z - 2);
		expect(centre.waterType).toBe('lake');
		expect(centre.lakeId).toBe(lake.id);
		expect(centre.waterSurfaceY).toBe(lake.waterLevel);
		expect(inland.waterSurfaceY).toBe(centre.waterSurfaceY);
		const bed = system.shapeHeight(lake.x, lake.z, bowl(lake.x, lake.z));
		expect(bed).toBeLessThan(lake.waterLevel);
		const shoreAngle = 0.4;
		const shoreRadius = lakeRadiusAt(lake, shoreAngle) * 0.82;
		const shore = system.shapeHeight(
			lake.x + Math.cos(shoreAngle) * shoreRadius,
			lake.z + Math.sin(shoreAngle) * shoreRadius,
			bowl(lake.x + Math.cos(shoreAngle) * shoreRadius, lake.z + Math.sin(shoreAngle) * shoreRadius)
		);
		expect(shore).toBeGreaterThan(bed);
		expect(shore).toBeLessThan(lake.waterLevel);
		const outsideX = lake.x + lake.baseRadius * 5;
		expect(system.shapeHeight(outsideX, lake.z, bowl(outsideX, lake.z))).toBe(
			bowl(outsideX, lake.z)
		);
	});
});

describe('shores and beds (wet band, lake beaches)', () => {
	it('marks the bed and the waterline wet, and dry ground well above the river not', () => {
		const system = systemFor(slope);
		system.ensureSync(0, -400);
		let checked = 0;
		for (const river of activeRivers(system)) {
			for (let i = 1; i < river.endIndex - 1; i += 4) {
				const s = river.samples[i];
				const centre = system.sampleWater(s.x, s.z);
				if (centre.waterType !== 'river' || centre.waterDepth < 0.2) continue;
				expect(centre.shoreWet).toBeCloseTo(1, 3);
				expect(centre.shoreWaterY).toBeCloseTo(centre.waterSurfaceY, 6);
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(0);
		expect(system.sampleWater(5000, 5000).shoreWet).toBe(0);
	});

	it('gives every lake a beach around its shore', () => {
		const system = systemFor(
			bowl,
			{
				lakeDensity: 1,
				riverDensity: 0,
				minRiverSourceElevation: 500,
				minLakeRadius: 24,
				maxLakeRadius: 48
			},
			'lake-seed'
		);
		system.ensureSync(640, 640);
		const lake = system.getLakes()[0];
		const radius = lakeRadiusAt(lake, 0);
		const shore = system.sampleWater(lake.x + radius * 1.02, lake.z);
		expect(shore.beachCover).toBeGreaterThan(0.5);
		expect(shore.shoreWaterY).toBe(lake.waterLevel);
		const bed = system.sampleWater(lake.x, lake.z);
		expect(bed.shoreWet).toBeCloseTo(1, 3);
	});
});

describe('rivers meeting lakes', () => {
	it('meets the lake surface and lets an outlet descend from it', () => {
		const system = systemFor(
			valleyPit,
			{ lakeDensity: 0.15, riverDensity: 1, meanderStrength: 0.35 },
			'join-seed'
		);
		system.ensureSync(0, -400);
		system.ensureSync(0, 200);
		const inlet = system.getRivers().find((river) => river.sinkLakeId && river.samples.length > 4);
		expect(inlet).toBeTruthy();
		const lake = system.getLakes().find((item) => item.id === inlet?.sinkLakeId);
		expect(lake).toBeTruthy();
		const last = inlet!.samples[inlet!.samples.length - 1];
		expect(last.waterY).toBeCloseTo(lake!.waterLevel, 3);
		const outlet = system.getRivers().find((river) => river.outletOfLakeId === lake?.id);
		if (outlet && outlet.samples.length > 2) {
			expect(outlet.samples[0].waterY).toBeCloseTo(lake!.waterLevel, 3);
			expect(outlet.samples[outlet.endIndex - 1].waterY).toBeLessThanOrEqual(
				outlet.samples[0].waterY + 0.05
			);
		}
	});
});

describe('water sampler and foundations', () => {
	it('reports dry ground, a river and a lake', () => {
		const rivers = systemFor(slope, { lakeDensity: 0 }, 'sample-seed');
		rivers.ensureSync(0, -300);
		const river = activeRivers(rivers)[0];
		const atRiver = rivers.sampleWater(river.samples[3].x, river.samples[3].z);
		expect(atRiver.waterType).toBe('river');
		expect(atRiver.distanceToWater).toBeLessThanOrEqual(0);
		// Some point well away from this river is dry (which one depends on where other rivers run).
		const dry = [800, -800, 1400, -1400]
			.flatMap((d) => [
				rivers.sampleWater(river.samples[3].x + d, river.samples[3].z),
				rivers.sampleWater(river.samples[3].x, river.samples[3].z + d)
			])
			.find((sample) => sample.waterType === 'none');
		expect(dry).toBeDefined();
		expect(dry!.waterDepth).toBe(0);

		const lakes = systemFor(
			bowl,
			{ lakeDensity: 1, riverDensity: 0, minRiverSourceElevation: 800 },
			'sample-lake'
		);
		lakes.ensureSync(640, 640);
		const lake = lakes.getLakes()[0];
		const atLake = lakes.sampleWater(lake.x, lake.z);
		expect(atLake.waterType).toBe('lake');
		expect(atLake.waterDepth).toBeGreaterThan(DEEP_WATER_DEPTH);
	});

	it('rejects deep water footprints and accepts dry ground', () => {
		expect(foundationOverlapsWater(() => 0, 0, 8, 0, 8)).toBe(false);
		expect(foundationOverlapsWater(() => 2, 0, 8, 0, 8)).toBe(true);
		expect(
			foundationOverlapsWater((x, z) => (Math.hypot(x - 4, z - 4) < 1 ? 2 : 0), 0, 8, 0, 8)
		).toBe(true);
	});
});

describe('final terrain', () => {
	it('leaves heights unchanged when hydrology is disabled', () => {
		const settings = createDefaultTerrainSettings();
		settings.seed = 'disabled-hydro';
		const terrain = new TerrainHeightSampler(settings);
		const hydroSettings = createDefaultHydrologySettings();
		hydroSettings.enabled = false;
		const hydro = new HydrologySystem(
			new BaseTerrainSampler(terrain),
			hydroSettings,
			settings.seed
		);
		terrain.attachHydrology(hydro);
		expect(terrain.sample(12, -40)).toBe(terrain.sampleBase(12, -40));
		expect(terrain.sample(-80, 20)).toBe(terrain.sampleBase(-80, 20));
	});

	it('shapes the authoritative sampler the same way from either generation order', () => {
		const make = () => {
			const settings = createDefaultTerrainSettings();
			settings.seed = 'shaped-world';
			const terrain = new TerrainHeightSampler(settings);
			const hydro = new HydrologySystem(
				new BaseTerrainSampler(terrain),
				createDefaultHydrologySettings(),
				settings.seed
			);
			terrain.attachHydrology(hydro);
			return { terrain, hydro };
		};
		const a = make();
		const b = make();
		a.hydro.ensureSync(-200, 100);
		a.hydro.ensureSync(1500, -600);
		b.hydro.ensureSync(1500, -600);
		b.hydro.ensureSync(-200, 100);
		for (const [x, z] of [
			[0, 0],
			[96, -48],
			[-96, 96],
			[1280, -1280],
			[-20, 40]
		] as const) {
			expect(a.terrain.sample(x, z)).toBe(b.terrain.sample(x, z));
		}
	});
});

describe('hydrology performance', () => {
	it('keeps height sampling local after a region is cached', () => {
		const settings = createDefaultTerrainSettings();
		settings.seed = 'perf-hydro';
		const terrain = new TerrainHeightSampler(settings);
		const hydro = new HydrologySystem(
			new BaseTerrainSampler(terrain),
			createDefaultHydrologySettings(),
			settings.seed
		);
		terrain.attachHydrology(hydro);
		const generateStarted = performance.now();
		hydro.ensureSync(0, 0);
		const generateMs = performance.now() - generateStarted;
		hydro.takeShapeCount();
		const sampleStarted = performance.now();
		for (let i = 0; i < 1500; i++) terrain.sample((i % 50) * 2, Math.floor(i / 50) * 2);
		const sampleMs = performance.now() - sampleStarted;
		const stats = hydro.getStats();
		process.stdout.write(
			`[hydrology] region ${generateMs.toFixed(1)} ms, 1500 samples ${sampleMs.toFixed(1)} ms, ` +
				`${stats.rivers} rivers, ${stats.lakes} lakes, ${stats.spatialCells} cells\n`
		);
		expect(generateMs).toBeLessThan(4000);
		expect(sampleMs).toBeLessThan(1500);
		expect(stats.spatialCells).toBeGreaterThan(0);
	});
});
