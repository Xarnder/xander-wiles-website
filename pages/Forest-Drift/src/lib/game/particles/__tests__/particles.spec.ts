import { describe, expect, it } from 'vitest';
import type { LakeDefinition } from '../../hydrology/HydrologyTypes';
import { createParticleBurst, ParticleEffectManager } from '../ParticleEffectManager';
import { createParticleSpawn, ParticlePool } from '../ParticlePool';
import {
	ATLAS_CELL_SIZE,
	ATLAS_SIZE,
	generateSplashDroplet,
	getParticleAtlas,
	particleAtlasBuildCount
} from '../ParticleTextureGenerator';
import {
	createDefaultParticleDebugSettings,
	createParticleRandom,
	PARTICLE_QUALITY
} from '../ParticleTypes';
import {
	generateLakeSplashZones,
	LAKE_SHORE_SPLASH,
	LAKE_SHORE_SPLASH_ID,
	splashBand,
	type SplashZoneSettings
} from '../effects/lakeShoreSplash';
import { LakeShoreSplashSource } from '../effects/LakeShoreSplashSource';

// ---------------------------------------------------------------- pool

describe('ParticlePool', () => {
	const spawnAt = (pool: ParticlePool, life = 1, killY = -Infinity) => {
		const p = createParticleSpawn();
		p.life = life;
		p.killY = killY;
		return pool.spawn(p);
	};

	it('never exceeds its capacity, refusing extra particles instead of growing', () => {
		const pool = new ParticlePool(10);
		const arrays = [pool.positionSize, pool.params, pool.color];
		let started = 0;
		for (let i = 0; i < 25; i++) if (spawnAt(pool)) started++;
		expect(started).toBe(10);
		expect(pool.count).toBe(10);
		expect([pool.positionSize, pool.params, pool.color]).toEqual(arrays);
	});

	it('returns expired particles to the pool and reuses their slots', () => {
		const pool = new ParticlePool(8);
		for (let i = 0; i < 4; i++) spawnAt(pool, 0.5);
		for (let i = 0; i < 4; i++) spawnAt(pool, 2);
		pool.update(1); // the four short-lived ones expire
		expect(pool.count).toBe(4);
		for (let i = 0; i < 4; i++) expect(spawnAt(pool, 2)).toBe(true);
		expect(pool.count).toBe(8);
		expect(spawnAt(pool)).toBe(false);
	});

	it('retires particles that fall back below their kill height (into the water)', () => {
		const pool = new ParticlePool(4);
		const p = createParticleSpawn();
		p.life = 10;
		p.vy = 1;
		p.gravity = 9.8;
		p.killY = -0.1;
		pool.spawn(p);
		let frames = 0;
		while (pool.count > 0 && frames < 200) {
			pool.update(1 / 60);
			frames++;
		}
		expect(pool.count).toBe(0);
		expect(frames).toBeLessThan(40); // up ~0.05 m and back down past −0.1 m in well under a second
	});

	it('writes dense render streams: size and opacity interpolate over life', () => {
		const pool = new ParticlePool(4);
		const p = createParticleSpawn();
		p.life = 1;
		p.size0 = 1;
		p.size1 = 0;
		p.alpha0 = 1;
		p.alpha1 = 0;
		pool.spawn(p);
		pool.update(0.5);
		expect(pool.positionSize[3]).toBeCloseTo(0.5, 5);
		expect(pool.params[0]).toBeCloseTo(0.5, 5);
	});
});

// ---------------------------------------------------------------- manager

function burstAt(seed: number) {
	const b = createParticleBurst();
	b.seed = seed;
	b.dirX = 1;
	b.dirZ = 0;
	return b;
}

describe('ParticleEffectManager (shared budget, determinism)', () => {
	it('keeps ambient effects inside their share of the global budget, dropping the rest', () => {
		const manager = new ParticleEffectManager({ renderers: false });
		const low = PARTICLE_QUALITY.low;
		manager.setQuality(low);
		manager.register(LAKE_SHORE_SPLASH);
		for (let i = 0; i < 1000; i++) manager.emitBurst(LAKE_SHORE_SPLASH_ID, burstAt(i));
		expect(manager.activeParticles).toBeLessThanOrEqual(Math.floor(low.budget * low.ambientShare));
		expect(manager.getStats().dropped).toBeGreaterThan(0);
	});

	it('does not grow storage however many bursts run (pooled, fixed arrays)', () => {
		const manager = new ParticleEffectManager({ renderers: false });
		manager.setQuality(PARTICLE_QUALITY.medium);
		manager.register(LAKE_SHORE_SPLASH);
		const before = manager.getStats().bufferBytes;
		for (let frame = 0; frame < 2000; frame++) {
			manager.emitBurst(LAKE_SHORE_SPLASH_ID, burstAt(frame));
			manager.update(1 / 60);
		}
		expect(manager.getStats().bufferBytes).toBe(before);
		expect(manager.activeParticles).toBeLessThanOrEqual(manager.getStats().capacity);
	});

	it('emits identical bursts for identical seeds, and different ones otherwise', () => {
		const run = (seed: number) => {
			const manager = new ParticleEffectManager({ renderers: false });
			manager.register(LAKE_SHORE_SPLASH);
			const count = manager.emitBurst(LAKE_SHORE_SPLASH_ID, burstAt(seed));
			manager.update(0.1);
			return { count, stats: manager.getStats().activeParticles };
		};
		expect(run(42)).toEqual(run(42));
		const counts = new Set(Array.from({ length: 12 }, (_, i) => run(i).count));
		expect(counts.size).toBeGreaterThan(1);
	});

	it('scales with quality: a smaller budget at Low, more at Ultra', () => {
		expect(PARTICLE_QUALITY.low.budget).toBeLessThan(PARTICLE_QUALITY.medium.budget);
		expect(PARTICLE_QUALITY.high.budget).toBeLessThan(PARTICLE_QUALITY.ultra.budget);
		const manager = new ParticleEffectManager({ renderers: false });
		manager.register(LAKE_SHORE_SPLASH);
		manager.setQuality(PARTICLE_QUALITY.ultra);
		expect(manager.getStats().capacity).toBe(PARTICLE_QUALITY.ultra.budget);
		manager.setQuality(PARTICLE_QUALITY.low);
		expect(manager.getStats().capacity).toBe(PARTICLE_QUALITY.low.budget);
	});
});

// ---------------------------------------------------------------- procedural textures

describe('procedural particle textures', () => {
	it('builds the atlas once and serves it from cache', () => {
		const a = getParticleAtlas();
		const b = getParticleAtlas();
		expect(a).toBe(b);
		expect(particleAtlasBuildCount()).toBe(1);
		expect(a.pixels.length).toBe(ATLAS_SIZE * ATLAS_SIZE * 4);
		expect(a.cells.get('water-droplet')?.length).toBe(4);
		expect(a.cells.get('water-mist')?.length).toBe(2);
	});

	it('draws a soft, transparent-edged, asymmetric droplet with a bright off-centre highlight', () => {
		const size = ATLAS_CELL_SIZE;
		const px = new Uint8Array(size * size * 4);
		generateSplashDroplet(px, size, 0, createParticleRandom(7));
		const alpha = (x: number, y: number) => px[(y * size + x) * 4 + 3];
		const red = (x: number, y: number) => px[(y * size + x) * 4];
		// Transparent corners, opaque-ish body.
		for (const [x, y] of [
			[0, 0],
			[size - 1, 0],
			[0, size - 1],
			[size - 1, size - 1]
		])
			expect(alpha(x, y)).toBe(0);
		const c = size / 2;
		expect(alpha(c, c)).toBeGreaterThan(180);
		// Soft edge: a range of partial alphas, not a hard disc.
		let partial = 0;
		for (let i = 0; i < size * size; i++) {
			const a = px[i * 4 + 3];
			if (a > 10 && a < 240) partial++;
		}
		expect(partial).toBeGreaterThan(100);
		// Not radially symmetric: mirrored points differ somewhere.
		let asymmetric = 0;
		for (let y = 0; y < size; y++)
			for (let x = 0; x < size; x++)
				if (Math.abs(alpha(x, y) - alpha(size - 1 - x, size - 1 - y)) > 40) asymmetric++;
		expect(asymmetric).toBeGreaterThan(20);
		// Highlight is brighter than the body at the centre, and not exactly at the centre.
		let best = 0;
		let bestX = 0;
		let bestY = 0;
		for (let y = 0; y < size; y++)
			for (let x = 0; x < size; x++)
				if (alpha(x, y) > 128 && red(x, y) > best) {
					best = red(x, y);
					bestX = x;
					bestY = y;
				}
		expect(best).toBeGreaterThan(red(c, c));
		expect(Math.hypot(bestX - c, bestY - c)).toBeGreaterThan(2);
	});
});

// ---------------------------------------------------------------- splash zones

function circleLake(radius = 30, waterLevel = 2): LakeDefinition {
	return {
		id: 'lake:test',
		x: 0,
		z: 0,
		waterLevel,
		baseRadius: radius,
		depth: 3,
		a1: 0,
		p1: 0,
		a2: 0,
		p2: 0,
		a3: 0,
		p3: 0,
		bounds: { minX: -radius, minZ: -radius, maxX: radius, maxZ: radius },
		sink: false
	};
}

/** Terrain around a circular lake: below water inside, rising at `slope(angle)` (rise/run) outside. */
function shoreTerrain(lake: LakeDefinition, slope: (angle: number) => number) {
	return (x: number, z: number) => {
		const d = Math.hypot(x - lake.x, z - lake.z) - lake.baseRadius;
		if (d <= 0) return lake.waterLevel - 0.5 + d * 0.05;
		return lake.waterLevel + d * slope(Math.atan2(z, x));
	};
}

const SETTINGS: SplashZoneSettings = { candidateSpacing: 4, density: 1, slopeThreshold: 24 };

describe('lake splash zones', () => {
	const lake = circleLake();

	it('finds none on a gentle beach, and several along a steep bank', () => {
		const gentle = generateLakeSplashZones(
			lake,
			shoreTerrain(lake, () => 0.08),
			SETTINGS,
			1
		);
		expect(gentle).toHaveLength(0);
		const steep = generateLakeSplashZones(
			lake,
			shoreTerrain(lake, () => 1.6),
			SETTINGS,
			1
		);
		expect(steep.length).toBeGreaterThan(10);
	});

	it('only places zones on the steep side of a lake, at the waterline, facing the water', () => {
		const zones = generateLakeSplashZones(
			lake,
			shoreTerrain(lake, (a) => (Math.cos(a) > 0 ? 1.4 : 0.05)),
			SETTINGS,
			1
		);
		expect(zones.length).toBeGreaterThan(3);
		for (const zone of zones) {
			expect(zone.x).toBeGreaterThan(0); // steep side only
			const d = Math.hypot(zone.x, zone.z);
			expect(Math.abs(d - lake.baseRadius)).toBeLessThan(0.6); // at the shoreline
			expect(zone.y).toBeCloseTo(lake.waterLevel + 0.04, 6); // the logical surface
			// Facing the water: the splash direction points back toward the lake centre.
			expect(zone.nx * -zone.x + zone.nz * -zone.z).toBeGreaterThan(0);
			expect(zone.strength).toBeGreaterThan(0);
			expect(zone.strength).toBeLessThanOrEqual(1);
		}
	});

	it('rejects shoreline points with no dry bank nearby (submerged shelf / river mouth)', () => {
		const flooded = () => lake.waterLevel - 1;
		expect(generateLakeSplashZones(lake, flooded, SETTINGS, 1)).toHaveLength(0);
	});

	it('is deterministic for a lake, seed and terrain — and varies with the seed', () => {
		const terrain = shoreTerrain(lake, () => 1.2);
		const settings = { ...SETTINGS, density: 0.5 };
		const a = generateLakeSplashZones(lake, terrain, settings, 99);
		const b = generateLakeSplashZones(lake, terrain, settings, 99);
		expect(a).toEqual(b);
		const c = generateLakeSplashZones(lake, terrain, settings, 100);
		expect(c.map((z) => z.seed)).not.toEqual(a.map((z) => z.seed));
	});

	it('respects candidate spacing and density', () => {
		const terrain = shoreTerrain(lake, () => 1.6);
		const perimeter = Math.PI * 2 * lake.baseRadius;
		const dense = generateLakeSplashZones(lake, terrain, { ...SETTINGS, candidateSpacing: 4 }, 1);
		expect(dense.length).toBeLessThanOrEqual(Math.floor(perimeter / 4));
		const sparse = generateLakeSplashZones(lake, terrain, { ...SETTINGS, candidateSpacing: 12 }, 1);
		expect(sparse.length).toBeLessThan(dense.length);
		const none = generateLakeSplashZones(lake, terrain, { ...SETTINGS, density: 0 }, 1);
		expect(none).toHaveLength(0);
		const half = generateLakeSplashZones(lake, terrain, { ...SETTINGS, density: 0.4 }, 1);
		expect(half.length).toBeLessThan(dense.length);
	});

	it('makes steeper banks stronger', () => {
		const mild = generateLakeSplashZones(
			lake,
			shoreTerrain(lake, () => 0.6),
			SETTINGS,
			1
		);
		const cliff = generateLakeSplashZones(
			lake,
			shoreTerrain(lake, () => 3),
			SETTINGS,
			1
		);
		const mean = (zones: { strength: number }[]) =>
			zones.reduce((s, z) => s + z.strength, 0) / Math.max(1, zones.length);
		expect(mean(cliff)).toBeGreaterThan(mean(mild));
	});
});

// ---------------------------------------------------------------- activation by distance

describe('splash activation by distance', () => {
	it('bands zones: full near, off far', () => {
		const q = PARTICLE_QUALITY.high;
		expect(splashBand(5, q)).toBe('full');
		expect(splashBand(q.fullDistance + 1, q)).toBe('reduced');
		expect(splashBand(q.cullDistance + 1, q)).toBe('off');
		expect(splashBand(30, q, 20)).toBe('off'); // developer cull override
	});

	it('splashes near a steep lake, stops when the player leaves, resumes on return', () => {
		const lake = circleLake(20);
		const hydrology = {
			settings: { enabled: true },
			lakesNear: (x: number, z: number, r: number) =>
				Math.hypot(x - lake.x, z - lake.z) < r + lake.baseRadius ? [lake] : [],
			getRevision: () => 1
		};
		const particles = new ParticleEffectManager({ renderers: false });
		particles.setQuality(PARTICLE_QUALITY.high);
		const source = new LakeShoreSplashSource(
			particles,
			hydrology,
			shoreTerrain(lake, () => 1.5),
			() => 7,
			createDefaultParticleDebugSettings()
		);
		const run = (seconds: number, x: number, z: number) => {
			let peak = 0;
			for (let t = 0; t < seconds; t += 1 / 30) {
				source.update(1 / 30, x, z);
				particles.update(1 / 30);
				peak = Math.max(peak, particles.activeParticles);
			}
			return peak;
		};
		expect(run(8, 30, 0)).toBeGreaterThan(0);
		expect(source.getStats().activeZones).toBeGreaterThan(0);
		run(3, 5000, 0); // walk far away; let live droplets finish
		expect(source.getStats().activeZones).toBe(0);
		expect(run(5, 5000, 0)).toBe(0);
		expect(run(8, 30, 0)).toBeGreaterThan(0);
	});
});
