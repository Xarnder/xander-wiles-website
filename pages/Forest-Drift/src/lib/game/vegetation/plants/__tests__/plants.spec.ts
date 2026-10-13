import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { TerrainHeightSampler } from '../../../terrain/TerrainHeightSampler';
import type { SurfacePoint, TerrainSurfaceLattice } from '../../../terrain/terrainSurfaceLattice';
import type { GrassGrid } from '../../grass/grassPlacement';
import type { VegetationRegionSampler } from '../../VegetationRegionSampler';
import { generatePlantAtlas, PLANT_ATLAS_ALPHA_CUTOFF, PLANT_ATLAS_COLUMNS } from '../plantAtlas';
import { PlantEcology, plantColony, plantSuitability } from '../plantEcology';
import { PlantManager } from '../PlantManager';
import { paletteIssues } from '../plantPalette';
import {
	decodeDistanceScale,
	ENV_CHANNELS,
	generatePlantChunk,
	type PlantChunkData,
	type PlantChunkInput
} from '../plantPlacement';
import { buildPlantPrototype } from '../plantPrototype';
import { PlantPrototypeCache } from '../PlantPrototypeCache';
import { generatePlantSpecies, speciesIssues } from '../plantSpecies';
import {
	createDefaultPlantSettings,
	FLOWER_FAMILIES,
	GROUND_FAMILIES,
	PLANT_CHUNK_SIZE,
	type PlantQualityProfile,
	type PlantSpeciesDefinition
} from '../PlantTypes';

const SEEDS = Array.from({ length: 240 }, (_, i) => Math.imul(i + 1, 2654435761) >>> 0);

describe('plant species', () => {
	it('is deterministic: the same seed gives the same species', () => {
		for (const seed of SEEDS.slice(0, 20))
			expect(generatePlantSpecies(seed)).toEqual(generatePlantSpecies(seed));
		expect(generatePlantSpecies(SEEDS[0]).signature).not.toBe(
			generatePlantSpecies(SEEDS[1]).signature
		);
	});

	it('produces valid species: dimensions, petal counts, palettes, no NaN', () => {
		for (const seed of SEEDS) {
			const species = generatePlantSpecies(seed);
			expect(speciesIssues(species), `${seed} ${species.signature}`).toEqual([]);
		}
	});

	it('covers every family and respects kind / family constraints', () => {
		const families = new Set(SEEDS.map((seed) => generatePlantSpecies(seed).family));
		for (const family of [...FLOWER_FAMILIES, ...GROUND_FAMILIES])
			expect(families.has(family), family).toBe(true);
		for (const seed of SEEDS.slice(0, 40)) {
			expect(generatePlantSpecies(seed, { kind: 'ground' }).kind).toBe('ground');
			expect(generatePlantSpecies(seed, { family: 'fern' }).flower).toBeUndefined();
		}
	});

	it('correlates its design: big heads thicken stems, succulents are stiff and stemless', () => {
		const flowers = SEEDS.map((s) => generatePlantSpecies(s, { kind: 'flower' })).filter(
			(s) => s.structure.stemRadius > 0 && s.flower
		);
		const small = flowers.filter((s) => s.flower!.petalLength < 0.03);
		const big = flowers.filter((s) => s.flower!.petalLength > 0.06);
		const mean = (list: PlantSpeciesDefinition[]) =>
			list.reduce((a, s) => a + s.structure.stemRadius, 0) / list.length;
		expect(mean(big)).toBeGreaterThan(mean(small) * 1.5);
		for (const seed of SEEDS.slice(0, 30)) {
			const succulent = generatePlantSpecies(seed, { family: 'succulent' });
			expect(succulent.stiffness).toBeGreaterThan(0.85);
			expect(succulent.structure.stemRadius).toBe(0);
			expect(succulent.growth.habitat.moisture).toBeLessThan(0);
		}
	});

	it('keeps palettes coherent: petals stand out from their own leaves', () => {
		for (const seed of SEEDS) {
			const s = generatePlantSpecies(seed, { kind: 'flower' });
			expect(paletteIssues(s.palette, true)).toEqual([]);
		}
	});
});

describe('plant prototypes', () => {
	it('are deterministic, finite and within the triangle budget', () => {
		const perFamily = new Map<string, number[]>();
		for (const seed of SEEDS.slice(0, 160)) {
			const species = generatePlantSpecies(seed);
			for (let v = 0; v < species.prototypeCount; v++) {
				const a = buildPlantPrototype(species, v);
				const b = buildPlantPrototype(species, v);
				expect(a.positions).toEqual(b.positions);
				for (const array of [a.positions, a.normals, a.uvs, a.colors, a.colors2, a.plant])
					expect(array.every(Number.isFinite)).toBe(true);
				expect(a.indices.every((i) => i < a.positions.length / 3)).toBe(true);
				expect(a.triangles).toBeGreaterThan(0);
				expect(a.triangles).toBeLessThanOrEqual(200);
				perFamily.set(species.family, [...(perFamily.get(species.family) ?? []), a.triangles]);
			}
		}
		for (const [family, tris] of perFamily) {
			const mean = tris.reduce((a, b) => a + b, 0) / tris.length;
			expect(mean, family).toBeLessThanOrEqual(128);
		}
	});

	it('pins the base and lets tips move (wind weights 0 at the root, up to 1 at the top)', () => {
		const species = generatePlantSpecies(SEEDS[3], { family: 'radial-flower' });
		const g = buildPlantPrototype(species, 0);
		let lowMax = 0;
		let highMax = 0;
		for (let i = 0; i < g.positions.length / 3; i++) {
			const y = g.positions[i * 3 + 1];
			if (y < g.height * 0.05) lowMax = Math.max(lowMax, g.plant[i * 4]);
			if (y > g.height * 0.9) highMax = Math.max(highMax, g.plant[i * 4]);
		}
		expect(lowMax).toBeLessThan(0.15);
		expect(highMax).toBeGreaterThan(0.7);
	});

	it('1 000 plants of one species reuse its small prototype bank', () => {
		const cache = new PlantPrototypeCache();
		const species = generatePlantSpecies(SEEDS[5]);
		for (let i = 0; i < 1000; i++) cache.acquire(species, i % species.prototypeCount, i);
		expect(cache.compiles).toBe(species.prototypeCount);
		expect(cache.size).toBeLessThanOrEqual(4);
		expect(cache.prune(1_000_000, 10, new Set())).toHaveLength(species.prototypeCount);
		expect(cache.size).toBe(0);
	});
});

describe('plant atlas', () => {
	it('is deterministic and keeps alpha-tested coverage at every mip level', () => {
		const atlas = generatePlantAtlas(32);
		expect(generatePlantAtlas(32).levels[0].data).toEqual(atlas.levels[0].data);
		for (let tile = 0; tile < 32; tile++) {
			const target = atlas.coverage[tile];
			expect(target, `tile ${tile}`).toBeGreaterThan(0.05);
			for (const level of atlas.levels) {
				const size = level.width / PLANT_ATLAS_COLUMNS;
				const cx = tile % PLANT_ATLAS_COLUMNS;
				const cy = Math.floor(tile / PLANT_ATLAS_COLUMNS);
				let pass = 0;
				for (let y = 0; y < size; y++)
					for (let x = 0; x < size; x++)
						if (
							level.data[((cy * size + y) * level.width + cx * size + x) * 4 + 3] / 255 >
							PLANT_ATLAS_ALPHA_CUTOFF
						)
							pass++;
				expect(Math.abs(pass / (size * size) - target), `tile ${tile} @ ${size}`).toBeLessThan(
					0.12
				);
			}
		}
	});
});

// ------------------------------------------------------------------------------- placement

const QUALITY: PlantQualityProfile = {
	densityScale: 1,
	distanceScale: 1,
	nearScale: 1,
	speciesScale: 1,
	maxPrototypes: 4,
	receiveShadows: false,
	wind: true,
	maxVisibleInstances: 1e9
};

/** A meadow every species likes: open, half wet, 20 m up. */
function environment(
	originX: number,
	originZ: number,
	size: number,
	forest = 0,
	wet = 0.5
): GrassGrid {
	const data = new Float32Array(9 * ENV_CHANNELS);
	for (let i = 0; i < 9; i++) {
		data[i * ENV_CHANNELS] = forest;
		data[i * ENV_CHANNELS + 1] = 1;
		data[i * ENV_CHANNELS + 2] = wet;
	}
	return { originX, originZ, spacing: size / 2, size: 3, channels: ENV_CHANNELS, data };
}

function flat(normalY = 1) {
	return (x: number, z: number, out: SurfacePoint) => {
		out.height = 20 + Math.sin(x * 0.05) * 0.4;
		out.normalX = Math.sqrt(Math.max(0, 1 - normalY * normalY));
		out.normalY = normalY;
		out.normalZ = 0;
		out.shoreCover = 0;
		out.shoreStone = 0;
		out.shoreWet = 0;
		return true;
	};
}

/** A fixed set of meadow-friendly species (one per spacing class at least). */
const MEADOW: PlantSpeciesDefinition[] = (() => {
	const pick = (
		family: (typeof FLOWER_FAMILIES)[number] | (typeof GROUND_FAMILIES)[number],
		seed: number
	) => {
		const s = structuredClone(generatePlantSpecies(seed, { family }));
		s.growth.habitat = {
			moisture: 0,
			shade: -0.6,
			elevation: [-50, 200],
			maxSlope: 35,
			meadow: 0.5
		};
		s.growth.colonyThreshold = 0.45;
		s.growth.density = 0.9;
		return s;
	};
	return [
		pick('radial-flower', 11),
		pick('star-flower', 12),
		pick('clover', 13),
		pick('fern', 14),
		pick('spike-flower', 15)
	];
})();

function input(
	chunkX: number,
	chunkZ: number,
	overrides: Partial<PlantChunkInput> = {}
): PlantChunkInput {
	const chunkSize = overrides.chunkSize ?? PLANT_CHUNK_SIZE;
	return {
		chunkX,
		chunkZ,
		chunkSize,
		seedHash: 0xbeef,
		settings: createDefaultPlantSettings(),
		quality: QUALITY,
		speciesAt: () => MEADOW,
		surface: flat(),
		environment: environment(chunkX * chunkSize, chunkZ * chunkSize, chunkSize),
		water: null,
		exclusions: new Float32Array(0),
		...overrides
	};
}

function worldPoints(data: PlantChunkData): [number, number, string][] {
	return Array.from({ length: data.count }, (_, i) => [
		data.positions[i * 3],
		data.positions[i * 3 + 2],
		data.species[data.speciesIndex[i]].id
	]);
}

describe('plant placement', () => {
	it('is deterministic and independent of chunk order', () => {
		const a = generatePlantChunk(input(0, 0));
		generatePlantChunk(input(5, -3));
		const b = generatePlantChunk(input(0, 0));
		expect(a.count).toBeGreaterThan(50);
		expect(b.positions).toEqual(a.positions);
		expect(b.instance).toEqual(a.instance);
		expect(b.cardPetal).toEqual(a.cardPetal);
	});

	it('has no seams: four 32 m chunks equal one 64 m chunk, negatives included', () => {
		const env = environment(-128, -128, 256);
		const small = [
			[-2, -2],
			[-1, -2],
			[-2, -1],
			[-1, -1]
		].flatMap(([cx, cz]) => worldPoints(generatePlantChunk(input(cx, cz, { environment: env }))));
		const big = worldPoints(generatePlantChunk(input(-1, -1, { chunkSize: 64, environment: env })));
		expect(small.length).toBe(big.length);
		const key = (p: [number, number, string]) => `${p[0].toFixed(2)},${p[1].toFixed(2)},${p[2]}`;
		const keys = new Set(big.map(key));
		const smallKeys = small.map(key);
		expect(new Set(smallKeys).size).toBe(smallKeys.length); // no duplicates
		for (const k of smallKeys) expect(keys.has(k), k).toBe(true); // no gaps
	});

	it('forms colonies: each species clusters in patches instead of uniform confetti', () => {
		const cells = new Map<string, number[]>();
		for (let cx = 0; cx < 3; cx++)
			for (let cz = 0; cz < 3; cz++) {
				const data = generatePlantChunk(input(cx, cz, { environment: environment(0, 0, 96) }));
				for (let i = 0; i < data.count; i++) {
					const id = data.species[data.speciesIndex[i]].id;
					if (!cells.has(id)) cells.set(id, new Array(144).fill(0));
					const ix = Math.min(11, Math.floor(data.positions[i * 3] / 8));
					const iz = Math.min(11, Math.floor(data.positions[i * 3 + 2] / 8));
					cells.get(id)![iz * 12 + ix]++;
				}
			}
		let patchy = 0;
		for (const counts of cells.values()) {
			const sorted = [...counts].sort((a, b) => a - b);
			if (sorted[129] > sorted[14] * 2 + 1) patchy++;
		}
		expect(cells.size).toBeGreaterThanOrEqual(3);
		expect(patchy).toBeGreaterThanOrEqual(cells.size - 1);
	});

	it('never plants underwater, on cliffs or through foundations', () => {
		const plain = generatePlantChunk(input(0, 0));
		const water = new Float32Array(25).fill(1);
		expect(
			generatePlantChunk(
				input(0, 0, {
					water: { originX: 0, originZ: 0, spacing: 8, size: 5, channels: 1, data: water }
				})
			).count
		).toBe(0);
		expect(generatePlantChunk(input(0, 0, { surface: flat(0.5) })).count).toBe(0);
		const built = generatePlantChunk(input(0, 0, { exclusions: new Float32Array([4, 4, 20, 20]) }));
		for (let i = 0; i < built.count; i++) {
			const x = built.positions[i * 3];
			const z = built.positions[i * 3 + 2];
			expect(x >= 4 && x <= 20 && z >= 4 && z <= 20).toBe(false);
		}
		expect(built.count).toBeLessThan(plain.count);
	});

	it('shifts the mix with habitat: forest floors favour ferns over open-sun flowers', () => {
		const share = (data: PlantChunkData, family: string) =>
			Array.from(
				{ length: data.count },
				(_, i) => data.species[data.speciesIndex[i]].family
			).filter((f) => f === family).length / Math.max(1, data.count);
		const species = [
			{
				...structuredClone(MEADOW[0]),
				growth: { ...MEADOW[0].growth, habitat: { ...MEADOW[0].growth.habitat, shade: -0.8 } }
			},
			{
				...structuredClone(MEADOW[3]),
				growth: {
					...MEADOW[3].growth,
					spacing: 'medium' as const,
					habitat: { ...MEADOW[3].growth.habitat, shade: 0.8 }
				}
			}
		];
		const open = generatePlantChunk(
			input(0, 0, { speciesAt: () => species, environment: environment(0, 0, 32, 0) })
		);
		const forest = generatePlantChunk(
			input(0, 0, { speciesAt: () => species, environment: environment(0, 0, 32, 1) })
		);
		expect(share(forest, 'fern')).toBeGreaterThan(share(open, 'fern'));
	});

	it('sorts by LOD rank so the drawn prefix always holds every visible plant', () => {
		const data = generatePlantChunk(input(0, 0));
		for (let i = 1; i < data.count; i++)
			expect(data.cardShape[i * 4 + 2]).toBeGreaterThanOrEqual(data.cardShape[(i - 1) * 4 + 2]);
		expect(data.rankCounts[256]).toBe(data.count);
		for (let i = 0; i < data.count; i++) {
			const scale = decodeDistanceScale(data.cardLeaf[i * 4 + 3]);
			expect(scale).toBeLessThanOrEqual(data.maxDistanceScale + 0.06);
		}
	});

	it('lower quality keeps a stable subset of plants and positions', () => {
		const full = new Set(
			worldPoints(generatePlantChunk(input(0, 0))).map((p) => `${p[0]},${p[1]}`)
		);
		const low = worldPoints(
			generatePlantChunk(input(0, 0, { quality: { ...QUALITY, densityScale: 0.5 } }))
		);
		expect(low.length).toBeGreaterThan(0);
		expect(low.length).toBeLessThan(full.size);
		for (const p of low) expect(full.has(`${p[0]},${p[1]}`)).toBe(true);
	});
});

describe('plant ecology', () => {
	it('gives each region a limited, deterministic species set shared with its neighbours', () => {
		const ecology = new PlantEcology({ seedHash: 1234, speciesScale: () => 1 });
		const a = ecology.regionSpecies(0, 0);
		expect(
			new PlantEcology({ seedHash: 1234, speciesScale: () => 1 })
				.regionSpecies(0, 0)
				.map((s) => s.id)
		).toEqual(a.map((s) => s.id));
		const flowers = a.filter((s) => s.kind === 'flower').length;
		const ground = a.filter((s) => s.kind === 'ground').length;
		expect(flowers).toBeGreaterThanOrEqual(1);
		expect(flowers).toBeLessThanOrEqual(6);
		expect(ground).toBeLessThanOrEqual(4);
		const neighbour = new Set(ecology.regionSpecies(1, 0).map((s) => s.id));
		expect(a.some((s) => neighbour.has(s.id))).toBe(true);
		const fewer = new PlantEcology({ seedHash: 1234, speciesScale: () => 0.5 }).regionSpecies(0, 0);
		expect(fewer.length).toBeLessThan(a.length);
	});

	it('rates habitat and colonies in [0, ~1.4]', () => {
		const s = MEADOW[0];
		const v = plantSuitability(s, { forest: 0, openness: 1, wet: 0.5, height: 20 });
		expect(v).toBeGreaterThan(0.3);
		expect(plantSuitability(s, { forest: 0, openness: 1, wet: 0.5, height: 500 })).toBe(0);
		for (let x = 0; x < 50; x += 7) {
			const c = plantColony(s, x, x * 1.3);
			expect(c).toBeGreaterThanOrEqual(0);
			expect(c).toBeLessThanOrEqual(1);
		}
	});
});

describe('PlantManager streaming', () => {
	function createManager() {
		const terrainSize = 96;
		const side = 9;
		const cache = new Map<string, TerrainSurfaceLattice>();
		const lattice = (cx: number, cz: number): TerrainSurfaceLattice => {
			const positions = new Float32Array(side * side * 3);
			const normals = new Float32Array(side * side * 3);
			for (let z = 0; z < side; z++)
				for (let x = 0; x < side; x++) {
					const i = (z * side + x) * 3;
					positions.set([cx * terrainSize + x * 12, 15, cz * terrainSize + z * 12], i);
					normals[i + 1] = 1;
				}
			return {
				originX: cx * terrainSize,
				originZ: cz * terrainSize,
				step: 12,
				verticesPerSide: side,
				positions,
				normals,
				shores: new Float32Array(side * side * 3)
			};
		};
		const settings = createDefaultPlantSettings();
		const debug = {
			showPlantChunks: false,
			showPlantSpecies: false,
			showPlantLod: false,
			showPlantCandidates: false,
			showColonyFields: false
		};
		const clock = { ms: 0 };
		const world = {
			revision: 0,
			/** One lattice lookup per 32 m plant chunk generated (each sits inside one 96 m terrain chunk). */
			generated: 0,
			exclusions: [] as { id: string; minX: number; minZ: number; maxX: number; maxZ: number }[]
		};
		const manager = new PlantManager({
			settings,
			debug,
			seed: 'plant-test',
			terrain: {
				chunkSize: () => terrainSize,
				getRevision: () => 1,
				getSurfaceLattice: (cx, cz) => {
					world.generated++;
					const key = `${cx}:${cz}`;
					if (!cache.has(key)) cache.set(key, lattice(cx, cz));
					if (cache.size > 64) cache.delete(cache.keys().next().value!);
					return cache.get(key)!;
				}
			},
			heightSampler: {
				sampleBiomeWeights: (_x: number, _z: number, out: object) =>
					Object.assign(out, { plains: 1, hills: 0, highlands: 0, mountains: 0 }),
				sample: () => 15
			} as unknown as TerrainHeightSampler,
			vegetationRegionSampler: { getForestDensity: () => 0 } as unknown as VegetationRegionSampler,
			getExclusions: () => world.exclusions,
			getExclusionRevision: () => world.revision,
			now: () => (clock.ms += 0.5)
		});
		manager.setQualityProfile(QUALITY);
		return { manager, settings, clock, world };
	}

	function settle(manager: PlantManager, clock: { ms: number }, x: number, z: number) {
		const camera = new THREE.PerspectiveCamera();
		camera.position.set(x, 16.7, z);
		camera.updateMatrixWorld();
		for (let i = 0; i < 600 && (i === 0 || manager.getRenderStats(null).queuedChunks > 0); i++) {
			clock.ms += 250;
			manager.update(x, z);
			manager.updateView(camera, 1 / 60, { x, feetY: 15, z });
		}
	}

	it('shares two materials, builds only nearby prototypes, and stays bounded over a long walk', () => {
		const { manager, clock, settings } = createManager();
		settle(manager, clock, 0, 0);
		const start = manager.getRenderStats(null);
		expect(start.loadedPlants).toBeGreaterThan(100);
		expect(start.nearInstances).toBeGreaterThan(0);
		expect(start.nearDrawCalls).toBeLessThanOrEqual(start.prototypes);
		const meshes = manager.group.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
		expect(new Set(meshes.map((m) => m.material)).size).toBeLessThanOrEqual(2);
		// Far species never compiled near geometry.
		expect(start.prototypes).toBeLessThan(start.activeSpecies * 4);

		let maxChunks = 0;
		let maxPrototypes = 0;
		let maxBytes = 0;
		for (let step = 1; step <= 40; step++) {
			settle(manager, clock, step * 60, step * 20);
			const stats = manager.getRenderStats(null);
			maxChunks = Math.max(maxChunks, stats.activeChunks);
			maxPrototypes = Math.max(maxPrototypes, stats.prototypes);
			maxBytes = Math.max(maxBytes, stats.bufferBytes);
		}
		expect(maxChunks).toBeLessThanOrEqual(start.activeChunks + 6);
		expect(maxPrototypes).toBeLessThanOrEqual(160);
		expect(maxBytes).toBeLessThan(start.bufferBytes * 3);
		settings.enabled = false;
		manager.update(0, 0);
		const off = manager.getRenderStats(null);
		expect(off.prototypes).toBe(0);
		expect(off.loadedPlants).toBe(0);
		manager.dispose();
		expect(manager.group.children.length).toBe(0);
	});

	it('tints distant terrain toward flower colonies, capped, and not when disabled', () => {
		const { manager, settings } = createManager();
		const tint = manager.terrainTint();
		const base = [0.2, 0.3, 0.1];
		let changed = 0;
		for (let i = 0; i < 400; i++) {
			const colors = new Float32Array(base);
			tint(i * 3.7, i * 2.3, 15, colors, 0);
			const delta = Math.max(...[0, 1, 2].map((k) => Math.abs(colors[k] - base[k])));
			expect(delta).toBeLessThanOrEqual(0.19);
			if (delta > 0.005) changed++;
		}
		expect(changed).toBeGreaterThan(10);
		settings.terrainTint = false;
		const colors = new Float32Array(base);
		for (let i = 0; i < 100; i++) tint(i * 3.7, i * 2.3, 15, colors, 0);
		expect([...colors]).toEqual(base.map((v) => Math.fround(v)));
	});

	it('a new foundation regenerates only the chunks it touches and clears its footprint', () => {
		const { manager, clock, world } = createManager();
		settle(manager, clock, 0, 0);
		const before = manager.getRenderStats(null);
		world.exclusions = [{ id: 'a', minX: 3, minZ: 3, maxX: 9, maxZ: 9 }];
		world.revision++;
		world.generated = 0;
		manager.update(0, 0);
		expect(world.generated).toBe(1); // one 32 m chunk holds the whole 6 m footprint
		expect(before.activeChunks).toBeGreaterThan(4);
		settle(manager, clock, 0, 0);
		expect(manager.getRenderStats(null).loadedPlants).toBeLessThan(before.loadedPlants);
		manager.dispose();
	});

	it('adaptive quality steps down under sustained low FPS and recovers slowly', () => {
		const { manager } = createManager();
		manager.setAdaptiveEnabled(true);
		for (let i = 0; i < 60 * 4; i++) manager.setPerformance(1 / 60, 40, 60);
		const low = manager.getRenderStats(null).adaptiveLevel;
		expect(low).toBeLessThan(1);
		for (let i = 0; i < 60 * 4; i++) manager.setPerformance(1 / 60, 90, 60);
		expect(manager.getRenderStats(null).adaptiveLevel).toBe(low); // 8 s hysteresis
		for (let i = 0; i < 60 * 30; i++) manager.setPerformance(1 / 60, 90, 60);
		expect(manager.getRenderStats(null).adaptiveLevel).toBeGreaterThan(low);
		manager.setAdaptiveEnabled(false);
		expect(manager.getRenderStats(null).adaptiveLevel).toBe(1);
		manager.dispose();
	});
});
