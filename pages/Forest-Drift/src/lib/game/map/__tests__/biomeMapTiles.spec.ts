import { describe, expect, it } from 'vitest';
import { BiomeField } from '../../biomes/BiomeField';
import { BIOME_COUNT, createDefaultBiomeSettings } from '../../biomes/BiomeTypes';
import type { LakeDefinition, RiverDefinition } from '../../hydrology/HydrologyTypes';
import { createDefaultHydrologySettings } from '../../hydrology/HydrologyTypes';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { WATER_RGB } from '../biomeMapPalette';
import {
	drawLand,
	drawWater,
	MAP_LEVELS,
	metresPerPixel,
	TILE_PIXELS,
	tileAt,
	tileMetres,
	tilesForView,
	type MapLandSource
} from '../biomeMapTiles';
import { MapWorld, TILE_BYTES, type MapWorldSettings } from '../mapWorld';

const seed = 'biome-map-tiles';
const settings: MapWorldSettings = {
	seed,
	terrain: { ...createDefaultTerrainSettings(), seed },
	biomes: { ...createDefaultBiomeSettings(), enabled: true },
	hydrology: { ...createDefaultHydrologySettings(), enabled: true }
};
const world = new MapWorld(settings);
/** The game's own biome lookup for the same world. */
const game = new BiomeField(new TerrainHeightSampler(settings.terrain), settings.biomes);
game.setSeed(seed);
const spawn = game.getSpawnOffset();

describe('biome map tile maths', () => {
	it('doubles metres per pixel per level, 2 to 128 m', () => {
		expect(Array.from({ length: MAP_LEVELS }, (_, l) => metresPerPixel(l))).toEqual([
			2, 4, 8, 16, 32, 64, 128
		]);
		expect(tileMetres(0)).toBe(256);
		expect(tileMetres(6)).toBe(16384);
	});

	it('finds the tile holding a point, far from the origin too', () => {
		for (const [x, z] of [
			[0, 0],
			[-0.001, 255.9],
			[-200_000, 199_999],
			[spawn.x, spawn.z]
		])
			for (let level = 0; level < MAP_LEVELS; level++) {
				const { tx, tz } = tileAt(level, x, z);
				const size = tileMetres(level);
				expect(x).toBeGreaterThanOrEqual(tx * size);
				expect(x).toBeLessThan((tx + 1) * size);
				expect(z).toBeGreaterThanOrEqual(tz * size);
				expect(z).toBeLessThan((tz + 1) * size);
			}
	});

	it('lists a view’s tiles nearest first, covering it', () => {
		const tiles = tilesForView(2, 1500, -700, 3000);
		const size = tileMetres(2);
		const d = (t: { tx: number; tz: number }) =>
			Math.hypot((t.tx + 0.5) * size - 1500, (t.tz + 0.5) * size + 700);
		for (let i = 1; i < tiles.length; i++)
			expect(d(tiles[i])).toBeGreaterThanOrEqual(d(tiles[i - 1]));
		for (const [x, z] of [
			[0, -2200],
			[2999, 799],
			[1500, -700]
		])
			expect(tiles).toContainEqual(tileAt(2, x, z));
	});
});

describe('biome map tile drawing', () => {
	it('colours each pixel by the same biome the game sees there', () => {
		for (const level of [0, 1, 2, 3, 5]) {
			const { tx, tz } = tileAt(level, spawn.x, spawn.z);
			const dominant = new Int8Array(TILE_PIXELS * TILE_PIXELS);
			world.drawLand(level, tx, tz, new Uint8ClampedArray(TILE_BYTES), dominant);
			const mpp = metresPerPixel(level);
			let same = 0;
			const samples = 200;
			for (let i = 0; i < samples; i++) {
				const p = (i * 7919) % (TILE_PIXELS * TILE_PIXELS);
				const x = tx * tileMetres(level) + ((p % TILE_PIXELS) + 0.5) * mpp;
				const z = tz * tileMetres(level) + (Math.floor(p / TILE_PIXELS) + 0.5) * mpp;
				if (dominant[p] === game.dominantAt(x, z)) same++;
			}
			// Levels 0–2 read the same lattice as the game: identical. Further out the map classifies
			// each pixel directly, which can differ from the lattice's blend on a border.
			if (level <= 2) expect(same, `level ${level}`).toBe(samples);
			else expect(same / samples, `level ${level}`).toBeGreaterThan(0.95);
		}
	});

	it('shades slopes lit from the north-west, and draws neutral land with biomes off', () => {
		// A ridge: rising to the east on the west half, falling to the east on the east half.
		const ridge: MapLandSource = {
			biomeWeights: null,
			baseHeight: (x) => 100 - Math.abs(x - 128) * 0.4
		};
		const out = new Uint8ClampedArray(TILE_BYTES);
		drawLand(ridge, 0, 0, 0, out);
		const lum = (px: number) => out[(64 * TILE_PIXELS + px) * 4 + 1];
		// The west face (x < 128 m, pixels < 64) faces west, toward the light: brighter.
		expect(lum(20)).toBeGreaterThan(lum(100) + 20);
		const flat: MapLandSource = { biomeWeights: null, baseHeight: () => 5 };
		const plain = new Uint8ClampedArray(TILE_BYTES);
		const dominant = new Int8Array(TILE_PIXELS * TILE_PIXELS);
		drawLand(flat, 0, 0, 0, plain, dominant);
		expect(new Set(plain.subarray(0, 400)).size).toBeLessThan(6);
		expect(dominant.every((d) => d === -1)).toBe(true);
	});

	it('blends biome colours by weight for soft borders', () => {
		let half = true;
		const source: MapLandSource = {
			biomeWeights: (_x, _z, _exact, out) => {
				out.fill(0);
				out[0] = half ? 0.5 : 1;
				out[1] = half ? 0.5 : 0;
				return 0;
			},
			baseHeight: () => 0
		};
		const blended = new Uint8ClampedArray(TILE_BYTES);
		drawLand(source, 0, 0, 0, blended);
		half = false;
		const pure = new Uint8ClampedArray(TILE_BYTES);
		drawLand(source, 0, 0, 0, pure);
		expect(blended[0]).not.toBe(pure[0]);
		expect(BIOME_COUNT).toBe(26);
	});

	it('draws rivers at least about a pixel wide and lakes in their shape', () => {
		const river = {
			bounds: { minX: 0, minZ: 100, maxX: 256, maxZ: 100 },
			endIndex: 2,
			samples: [
				{ x: 0, z: 100, width: 1 },
				{ x: 256, z: 100, width: 1 }
			]
		} as unknown as RiverDefinition;
		const lake = {
			x: 60,
			z: 200,
			baseRadius: 20,
			a1: 0,
			a2: 0,
			a3: 0,
			p1: 0,
			p2: 0,
			p3: 0,
			bounds: { minX: 30, minZ: 170, maxX: 90, maxZ: 230 }
		} as unknown as LakeDefinition;
		const out = new Uint8ClampedArray(TILE_BYTES);
		for (let i = 0; i < out.length; i += 4) out.set([200, 200, 200, 255], i);
		drawWater([river], [lake], 0, 0, 0, out);
		const at = (xm: number, zm: number) => {
			const o = (Math.floor(zm / 2) * TILE_PIXELS + Math.floor(xm / 2)) * 4;
			return [out[o], out[o + 1], out[o + 2]];
		};
		const near = (rgb: number[]) => Math.abs(rgb[2] - WATER_RGB[2]) < 30;
		expect(near(at(128, 99))).toBe(true); // a 1 m river still shows at 2 m/px
		expect(at(128, 120)).toEqual([200, 200, 200]);
		expect(near(at(60, 200))).toBe(true); // lake centre
		expect(at(60, 240)).toEqual([200, 200, 200]);
	});

	it('draws real rivers and lakes for a world with water', () => {
		const level = 2;
		let wet = 0;
		for (let dx = -2; dx <= 2 && wet === 0; dx++)
			for (let dz = -2; dz <= 2; dz++) {
				const { tx, tz } = tileAt(level, spawn.x + dx * 1024, spawn.z + dz * 1024);
				const pixels = new Uint8ClampedArray(TILE_BYTES);
				world.drawLand(level, tx, tz, pixels);
				const before = pixels.slice();
				expect(world.drawWater(level, tx, tz, pixels)).toBe(true);
				for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 2] !== before[i + 2]) wet++;
			}
		expect(wet).toBeGreaterThan(20);
	});
});
