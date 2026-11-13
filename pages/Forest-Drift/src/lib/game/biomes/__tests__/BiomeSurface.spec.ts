import { describe, expect, it } from 'vitest';
import { TerrainChunk } from '../../terrain/TerrainChunk';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { writeTerrainColor } from '../../terrain/terrainColor';
import { createGrassRegion } from '../../vegetation/grass/GrassRegionSampler';
import { BiomeField } from '../BiomeField';
import { BIOME_SURFACE_PROFILES } from '../biomeSurfaceProfiles';
import { BiomeSurface } from '../BiomeSurface';
import {
	BIOME_IDS,
	createBiomeWeightVector,
	createDefaultBiomeSettings,
	type BiomeId
} from '../BiomeTypes';

/** A field whose every point is one biome — isolates the surface maths from the climate layout. */
function pureField(id: BiomeId, enabled = true): BiomeField {
	const index = BIOME_IDS.indexOf(id);
	const settings = { ...createDefaultBiomeSettings(), enabled };
	return {
		isEnabled: () => settings.enabled,
		weightsAt: (_x: number, _z: number, out: Float32Array) => {
			out.fill(0);
			out[index] = 1;
			return index;
		}
	} as unknown as BiomeField;
}

function terrainOf(surface: BiomeSurface, h: number, normalY: number, x: number, z: number) {
	const color = new Float32Array(3);
	const ground = new Float32Array(4);
	surface.writeTerrain(h, normalY, x, z, 0, 0, color, 0, ground, 0);
	return { color, ground };
}

describe('biome surface profiles', () => {
	it('defines every biome with colours and amounts in range', () => {
		expect(BIOME_SURFACE_PROFILES).toHaveLength(26);
		for (const [i, p] of BIOME_SURFACE_PROFILES.entries()) {
			for (const c of [p.low, p.mid, p.warm, p.dry, p.lush, p.earth])
				for (const v of c) {
					expect(v, BIOME_IDS[i]).toBeGreaterThanOrEqual(0);
					expect(v, BIOME_IDS[i]).toBeLessThanOrEqual(1);
				}
			for (const v of [p.snow, p.sand, p.soil, p.litter, p.patchiness]) {
				expect(v, BIOME_IDS[i]).toBeGreaterThanOrEqual(0);
				expect(v, BIOME_IDS[i]).toBeLessThanOrEqual(1);
			}
			expect(p.grassDensity).toBeGreaterThanOrEqual(0);
			expect(p.grassHeight).toBeGreaterThan(0);
		}
	});
});

describe('BiomeSurface', () => {
	it('reproduces the countryside colour exactly in Plains', () => {
		const surface = new BiomeSurface(pureField('plains'));
		const legacy = new Float32Array(3);
		for (let i = 0; i < 200; i++) {
			const x = i * 13.37 - 900;
			const z = i * -7.11 + 300;
			const h = -6 + (i % 30);
			const n = 0.5 + (i % 10) * 0.05;
			const { color, ground } = terrainOf(surface, h, n, x, z);
			writeTerrainColor(h, n, legacy, 0, x, z);
			for (let c = 0; c < 3; c++) expect(color[c]).toBeCloseTo(legacy[c], 5);
			expect([...ground]).toEqual([0, 0, 0, 0]);
		}
	});

	it('covers snowy biomes in snow and the desert in sand', () => {
		const snow = new BiomeSurface(pureField('snowyPlains'));
		const sand = new BiomeSurface(pureField('desert'));
		let snowTotal = 0;
		let sandTotal = 0;
		for (let i = 0; i < 400; i++) {
			const x = i * 3.1;
			const z = i * 1.7;
			snowTotal += terrainOf(snow, 2, 1, x, z).ground[0];
			sandTotal += terrainOf(sand, 2, 1, x, z).ground[1];
		}
		expect(snowTotal / 400).toBeGreaterThan(0.85);
		expect(sandTotal / 400).toBeGreaterThan(0.9);
	});

	it('breaks forest litter into patches rather than a uniform floor', () => {
		const surface = new BiomeSurface(pureField('forest'));
		const values = Array.from(
			{ length: 600 },
			(_, i) => terrainOf(surface, 2, 1, i * 2.3, 0).ground[3]
		);
		expect(Math.min(...values)).toBeLessThan(0.05);
		expect(Math.max(...values)).toBeGreaterThan(0.5);
	});

	it('keeps steep rock bare and beaches as beaches', () => {
		const surface = new BiomeSurface(pureField('snowySlopes'));
		expect(terrainOf(surface, 10, 0.3, 5, 5).ground[0]).toBe(0);
		const color = new Float32Array(3);
		const ground = new Float32Array(4);
		surface.writeTerrain(1, 1, 5, 5, 1, 0.5, color, 0, ground, 0);
		expect([...ground]).toEqual([0, 0, 0, 0]);
	});

	it('never covers more than the whole ground', () => {
		const surface = new BiomeSurface(pureField('shrubSavanna'));
		for (let i = 0; i < 300; i++) {
			const { ground } = terrainOf(surface, 3, 0.95, i * 4.4, i * -2.2);
			expect(ground[0] + ground[1] + ground[2] + ground[3]).toBeLessThanOrEqual(1 + 1e-6);
		}
	});

	it('thins grass where the ground is covered and lifts it in tall-grass biomes', () => {
		const desert = new BiomeSurface(pureField('desert'));
		const savanna = new BiomeSurface(pureField('savanna'));
		const a = createGrassRegion();
		a.density = 1;
		desert.applyGrass(10, 10, a);
		expect(a.density).toBeLessThan(0.05);
		expect(a.warmth).toBe(1);
		const b = createGrassRegion();
		b.density = 1;
		savanna.applyGrass(10, 10, b);
		expect(b.heightBias).toBeGreaterThan(1.2);
	});

	it('colours grass tufts from the grass palette, never the ground cover', () => {
		const surface = new BiomeSurface(pureField('snowyPlains'));
		const out = new Float32Array(3);
		surface.writeGrassColor(2, 1, 50, 50, out, 0);
		// Not snow-white: green dominates.
		expect(out[1]).toBeGreaterThan(out[0]);
		expect(out[1]).toBeLessThan(0.6);
	});

	it('follows the real biome field (smoke test on a generated world)', () => {
		const terrainSettings = createDefaultTerrainSettings();
		terrainSettings.seed = 'surface-smoke';
		const field = new BiomeField(
			new TerrainHeightSampler(terrainSettings),
			createDefaultBiomeSettings()
		);
		field.setSeed('surface-smoke');
		const surface = new BiomeSurface(field);
		const w = createBiomeWeightVector();
		for (let i = 0; i < 50; i++) {
			field.weightsAt(i * 97, i * 41, w);
			const { color, ground } = terrainOf(surface, 3, 0.95, i * 97, i * 41);
			for (const v of color) expect(Number.isFinite(v)).toBe(true);
			for (const v of ground) expect(v).toBeGreaterThanOrEqual(0);
		}
	});
});

describe('terrain chunks with biomes', () => {
	function chunkColours(hooks: Parameters<TerrainChunk['populate']>[9]) {
		const settings = createDefaultTerrainSettings();
		settings.seed = 'chunk-parity';
		const sampler = new TerrainHeightSampler(settings);
		const chunk = new TerrainChunk(16);
		chunk.populate(0, 0, 96, sampler, 1, 'normal', null, null, null, hooks);
		const geometry = chunk.mesh.geometry;
		return {
			color: Float32Array.from(geometry.getAttribute('color').array as Float32Array),
			ground: Float32Array.from(geometry.getAttribute('aGround').array as Float32Array)
		};
	}

	it('builds exactly the pre-biome colours when the world has biomes off', () => {
		const off = new BiomeSurface(pureField('desert', false));
		const without = chunkColours(null);
		const withOff = chunkColours({ surface: off, debug: () => {} });
		expect(withOff.color).toEqual(without.color);
		expect(withOff.ground.every((v) => v === 0)).toBe(true);
	});

	it('writes biome ground into the chunk when biomes are on', () => {
		const on = new BiomeSurface(pureField('desert'));
		const built = chunkColours({ surface: on, debug: () => {} });
		let sand = 0;
		for (let i = 1; i < built.ground.length; i += 4) sand += built.ground[i];
		expect(sand / (built.ground.length / 4)).toBeGreaterThan(0.5);
	});
});
