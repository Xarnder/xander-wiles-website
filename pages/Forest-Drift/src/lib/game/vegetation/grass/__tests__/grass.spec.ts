import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
	createSurfacePoint,
	sampleSurfaceLattice,
	type SurfacePoint,
	type TerrainSurfaceLattice
} from '../../../terrain/terrainSurfaceLattice';
import type { TerrainHeightSampler } from '../../../terrain/TerrainHeightSampler';
import type { VegetationRegionSampler } from '../../VegetationRegionSampler';
import {
	GRASS_ATLAS_ALPHA_CUTOFF,
	GRASS_ATLAS_COLUMNS,
	GRASS_ATLAS_ROWS,
	generateGrassAtlas
} from '../grassAtlas';
import {
	GRASS_RANK_FADE,
	GrassAdaptiveQuality,
	grassAdaptiveFactors,
	grassDensityAt,
	grassInstancesWithin,
	grassTuftVisibility,
	resolveGrassLod
} from '../grassLod';
import { GrassManager, type GrassExclusion } from '../GrassManager';
import {
	generateGrassChunk,
	REGION_CHANNELS,
	type GrassChunkData,
	type GrassChunkInput,
	type GrassGrid
} from '../grassPlacement';
import { createGrassRegion, sampleGrassRegion } from '../GrassRegionSampler';
import {
	createDefaultGrassSettings,
	GRASS_CHUNK_SIZE,
	type GrassQualityProfile
} from '../GrassTypes';

const FULL_QUALITY: GrassQualityProfile = {
	densityScale: 1,
	distanceScale: 1,
	crossedCards: true,
	receiveShadows: false,
	wind: true,
	maxVisibleInstances: 1e9
};

function flatSurface(normalY = 1) {
	return (x: number, z: number, out: SurfacePoint) => {
		out.height = 2 + Math.sin(x * 0.1) * 0.5 + Math.cos(z * 0.07) * 0.5;
		out.normalX = Math.sqrt(Math.max(0, 1 - normalY * normalY));
		out.normalY = normalY;
		out.normalZ = 0;
		out.shoreCover = 0;
		out.shoreStone = 0;
		out.shoreWet = 0;
		return true;
	};
}

function regionGrid(originX: number, originZ: number, size: number, density = 1): GrassGrid {
	const nodes = 3;
	const data = new Float32Array(nodes * nodes * REGION_CHANNELS);
	for (let i = 0; i < nodes * nodes; i++) {
		data[i * REGION_CHANNELS] = density;
		data[i * REGION_CHANNELS + 1] = 1;
	}
	return {
		originX,
		originZ,
		spacing: size / (nodes - 1),
		size: nodes,
		channels: REGION_CHANNELS,
		data
	};
}

function chunkInput(
	chunkX: number,
	chunkZ: number,
	overrides: Partial<GrassChunkInput> = {}
): GrassChunkInput {
	const chunkSize = overrides.chunkSize ?? GRASS_CHUNK_SIZE;
	return {
		chunkX,
		chunkZ,
		chunkSize,
		seedHash: 0x12345678,
		settings: createDefaultGrassSettings(),
		densityScale: 1,
		surface: flatSurface(),
		region: regionGrid(chunkX * chunkSize, chunkZ * chunkSize, chunkSize),
		water: null,
		exclusions: new Float32Array(0),
		...overrides
	};
}

function worldPoints(
	data: GrassChunkData,
	chunkX: number,
	chunkZ: number,
	chunkSize = GRASS_CHUNK_SIZE
) {
	const points: [number, number][] = [];
	for (let i = 0; i < data.count; i++)
		points.push([
			data.positions[i * 3] + chunkX * chunkSize,
			data.positions[i * 3 + 2] + chunkZ * chunkSize
		]);
	return points;
}

/** World positions of a chunk's tufts as stable strings (mm precision). */
function worldKeys(
	data: GrassChunkData,
	chunkX: number,
	chunkZ: number,
	chunkSize = GRASS_CHUNK_SIZE
) {
	const keys: string[] = [];
	for (let i = 0; i < data.count; i++) {
		const x = data.positions[i * 3] + chunkX * chunkSize;
		const z = data.positions[i * 3 + 2] + chunkZ * chunkSize;
		keys.push(`${x.toFixed(3)},${z.toFixed(3)}`);
	}
	return keys;
}

describe('grass atlas', () => {
	const atlas = generateGrassAtlas(64);

	it('is deterministic and builds a mip chain down to 8 texels per tile', () => {
		const again = generateGrassAtlas(64);
		expect(atlas.levels.map((l) => [l.width, l.height])).toEqual([
			[256, 128],
			[128, 64],
			[64, 32],
			[32, 16]
		]);
		atlas.levels.forEach((level, i) => expect(level.data).toEqual(again.levels[i].data));
	});

	it('keeps each tuft’s alpha-tested coverage at every mip level (no thinning at distance)', () => {
		for (let variant = 0; variant < GRASS_ATLAS_COLUMNS * GRASS_ATLAS_ROWS; variant++) {
			const target = atlas.coverage[variant];
			expect(target).toBeGreaterThan(0.08);
			for (const level of atlas.levels) {
				const tile = level.width / GRASS_ATLAS_COLUMNS;
				const column = variant % GRASS_ATLAS_COLUMNS;
				const row = Math.floor(variant / GRASS_ATLAS_COLUMNS);
				let pass = 0;
				for (let y = 0; y < tile; y++)
					for (let x = 0; x < tile; x++) {
						const index = ((row * tile + y) * level.width + column * tile + x) * 4 + 3;
						if (level.data[index] / 255 > GRASS_ATLAS_ALPHA_CUTOFF) pass++;
					}
				expect(Math.abs(pass / (tile * tile) - target)).toBeLessThan(0.09);
			}
		}
	});

	it('roots every tuft at the bottom of its tile and fills transparent texels with blade colour', () => {
		const level = atlas.levels[0];
		const tile = level.width / GRASS_ATLAS_COLUMNS;
		for (let variant = 0; variant < 8; variant++) {
			const column = variant % GRASS_ATLAS_COLUMNS;
			const row = Math.floor(variant / GRASS_ATLAS_COLUMNS);
			let bottom = 0;
			for (let x = 0; x < tile; x++) {
				const index = ((row * tile + 1) * level.width + column * tile + x) * 4 + 3;
				if (level.data[index] > 128) bottom++;
			}
			expect(bottom, `variant ${variant}`).toBeGreaterThan(0);
		}
		// No black (unfilled) colour anywhere — transparent texels carry dilated blade colour.
		for (let i = 0; i < level.data.length; i += 4) {
			expect(level.data[i] + level.data[i + 1] + level.data[i + 2]).toBeGreaterThan(60);
		}
	});
});

describe('grass placement', () => {
	it('is deterministic and independent of chunk generation order', () => {
		const a = generateGrassChunk(chunkInput(0, 0));
		generateGrassChunk(chunkInput(3, -2));
		const b = generateGrassChunk(chunkInput(0, 0));
		expect(a.count).toBeGreaterThan(200);
		expect(b.positions).toEqual(a.positions);
		expect(b.shape).toEqual(a.shape);
		expect(b.tint).toEqual(a.tint);
	});

	it('has no seams: four 16 m chunks equal one 32 m chunk exactly, negatives included', () => {
		const region = regionGrid(-64, -64, 128);
		const small: [number, number][] = [];
		for (const [cx, cz] of [
			[-2, -2],
			[-1, -2],
			[-2, -1],
			[-1, -1]
		])
			small.push(...worldPoints(generateGrassChunk(chunkInput(cx, cz, { region })), cx, cz));
		const big = worldPoints(
			generateGrassChunk(chunkInput(-1, -1, { chunkSize: 32, region })),
			-1,
			-1,
			32
		);
		expect(small.length).toBe(big.length);
		// Same tufts (to Float32 storage precision): no duplicates along borders, no gaps.
		const bucket = new Map<string, [number, number][]>();
		for (const p of big) {
			const key = `${Math.round(p[0])},${Math.round(p[1])}`;
			bucket.set(key, [...(bucket.get(key) ?? []), p]);
		}
		const used = new Set<[number, number]>();
		for (const p of small) {
			const match = (bucket.get(`${Math.round(p[0])},${Math.round(p[1])}`) ?? []).find(
				(q) => !used.has(q) && Math.abs(q[0] - p[0]) < 1e-3 && Math.abs(q[1] - p[1]) < 1e-3
			);
			expect(match, `${p}`).toBeDefined();
			used.add(match!);
		}
	});

	it('keeps tufts inside their own chunk and roots them on the surface', () => {
		const data = generateGrassChunk(chunkInput(-3, 5));
		const surface = flatSurface();
		const point = createSurfacePoint();
		for (let i = 0; i < data.count; i++) {
			const x = data.positions[i * 3];
			const z = data.positions[i * 3 + 2];
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThan(GRASS_CHUNK_SIZE);
			expect(z).toBeGreaterThanOrEqual(0);
			expect(z).toBeLessThan(GRASS_CHUNK_SIZE);
			surface(x - 3 * GRASS_CHUNK_SIZE, z + 5 * GRASS_CHUNK_SIZE, point);
			expect(data.positions[i * 3 + 1]).toBeCloseTo(point.height, 5);
		}
	});

	it('sorts instances by LOD rank and counts ranks for the density cut', () => {
		const data = generateGrassChunk(chunkInput(1, 1));
		for (let i = 1; i < data.count; i++)
			expect(data.shape[i * 4 + 2]).toBeGreaterThanOrEqual(data.shape[(i - 1) * 4 + 2]);
		expect(data.rankCounts[256]).toBe(data.count);
		expect(data.rankCounts[0]).toBe(0);
	});

	it('lower quality keeps a stable subset of the full meadow', () => {
		const full = new Set(worldKeys(generateGrassChunk(chunkInput(0, 0)), 0, 0));
		const low = worldKeys(generateGrassChunk(chunkInput(0, 0, { densityScale: 0.5 })), 0, 0);
		expect(low.length).toBeGreaterThan(0);
		expect(low.length).toBeLessThan(full.size);
		for (const key of low) expect(full.has(key)).toBe(true);
	});

	it('excludes foundations, water and cliffs, and keeps normal plains', () => {
		const plain = generateGrassChunk(chunkInput(0, 0));
		const footprint = generateGrassChunk(
			chunkInput(0, 0, { exclusions: new Float32Array([2, 2, 10, 10]) })
		);
		for (let i = 0; i < footprint.count; i++) {
			const x = footprint.positions[i * 3];
			const z = footprint.positions[i * 3 + 2];
			expect(x >= 2 && x <= 10 && z >= 2 && z <= 10).toBe(false);
		}
		expect(footprint.count).toBeLessThan(plain.count);

		const waterData = new Float32Array(9).fill(1.5); // under 1.5 m of water everywhere
		const underwater = generateGrassChunk(
			chunkInput(0, 0, {
				water: { originX: 0, originZ: 0, spacing: 8, size: 3, channels: 1, data: waterData }
			})
		);
		expect(underwater.count).toBe(0);

		const cliff = generateGrassChunk(chunkInput(0, 0, { surface: flatSurface(0.55) }));
		expect(cliff.count).toBe(0);
		const steep = generateGrassChunk(chunkInput(0, 0, { surface: flatSurface(0.8) }));
		expect(steep.count).toBeGreaterThan(0);
		expect(steep.count).toBeLessThan(plain.count);
	});

	it('clumps: density varies in broad patches rather than uniformly', () => {
		// Count tufts per 4 m cell over a 4 × 4 chunk area; patches give a wide spread.
		const counts: number[] = [];
		for (let cx = 0; cx < 4; cx++)
			for (let cz = 0; cz < 4; cz++) {
				const data = generateGrassChunk(chunkInput(cx, cz, { region: regionGrid(0, 0, 64) }));
				const cells = new Array(16).fill(0);
				for (let i = 0; i < data.count; i++) {
					const ix = Math.floor(data.positions[i * 3] / 4);
					const iz = Math.floor(data.positions[i * 3 + 2] / 4);
					cells[iz * 4 + ix]++;
				}
				counts.push(...cells);
			}
		const sorted = [...counts].sort((a, b) => a - b);
		const p10 = sorted[Math.floor(sorted.length * 0.1)];
		const p90 = sorted[Math.floor(sorted.length * 0.9)];
		expect(p90).toBeGreaterThan(p10 * 1.6);
	});
});

describe('grass region rules', () => {
	const region = createGrassRegion();
	const weights = (plains: number, hills: number, highlands: number, mountains: number) => ({
		plains,
		hills,
		highlands,
		mountains
	});

	it('is densest on plains, sparse on highlands, rare on mountains, thinner in forests and up high', () => {
		const plains = sampleGrassRegion(weights(1, 0, 0, 0), 0, 5, region).density;
		const hills = sampleGrassRegion(weights(0, 1, 0, 0), 0, 5, region).density;
		const highlands = sampleGrassRegion(weights(0, 0, 1, 0), 0, 5, region).density;
		const mountains = sampleGrassRegion(weights(0, 0, 0, 1), 0, 5, region).density;
		expect(plains).toBeGreaterThan(hills);
		expect(hills).toBeGreaterThan(highlands);
		expect(highlands).toBeGreaterThan(mountains);
		const forest = sampleGrassRegion(weights(1, 0, 0, 0), 1, 5, region).density;
		expect(forest).toBeGreaterThan(0.2);
		expect(forest).toBeLessThan(plains);
		const alpine = sampleGrassRegion(weights(1, 0, 0, 0), 0, 120, region).density;
		expect(alpine).toBeLessThan(plains * 0.3);
	});
});

describe('grass LOD', () => {
	const settings = createDefaultGrassSettings();
	const lod = resolveGrassLod(settings, FULL_QUALITY, 1, 1);

	it('falls continuously from full density to zero at the render distance', () => {
		expect(grassDensityAt(lod, 0)).toBe(settings.lod0Density);
		expect(grassDensityAt(lod, settings.lod1Distance)).toBeCloseTo(settings.lod1Density, 6);
		expect(grassDensityAt(lod, settings.lod2Distance)).toBeCloseTo(settings.lod2Density, 6);
		expect(grassDensityAt(lod, settings.renderDistance)).toBe(0);
		let previous = Infinity;
		for (let d = 0; d <= settings.renderDistance + 5; d += 0.25) {
			const density = grassDensityAt(lod, d);
			expect(density).toBeLessThanOrEqual(previous + 1e-9);
			// No ring: density never drops by more than a sliver over a quarter metre.
			if (Number.isFinite(previous)) expect(previous - density).toBeLessThan(0.02);
			previous = density;
		}
	});

	it('fades a tuft smoothly across its threshold instead of popping', () => {
		const rank = 0.4;
		let previous = 1;
		for (let d = 0; d <= settings.renderDistance; d += 0.1) {
			const v = grassTuftVisibility(lod, rank, d);
			expect(v).toBeLessThanOrEqual(previous + 1e-9);
			expect(previous - v).toBeLessThan(0.1);
			previous = v;
		}
		expect(GRASS_RANK_FADE).toBeGreaterThan(0);
	});

	it('draws a rank-prefix of each chunk: farther never shows a tuft nearer hides', () => {
		const data = generateGrassChunk(chunkInput(0, 0));
		let previous = Infinity;
		for (let d = 0; d <= settings.renderDistance + 4; d += 1) {
			const count = grassInstancesWithin(lod, data.rankCounts, d);
			expect(count).toBeLessThanOrEqual(previous);
			// Every tuft the shader could show at d is within the drawn prefix.
			for (let i = count; i < data.count; i++)
				expect(grassTuftVisibility(lod, data.shape[i * 4 + 2] / 255, d)).toBe(0);
			previous = count;
		}
		expect(grassInstancesWithin(lod, data.rankCounts, settings.renderDistance)).toBe(0);
	});

	it('degrades far density first, then distance, mid and (modestly) near density', () => {
		const slight = grassAdaptiveFactors(0.8);
		expect(slight.farDensity).toBeLessThan(1);
		expect(slight.distance).toBe(1);
		expect(slight.midDensity).toBe(1);
		const worst = grassAdaptiveFactors(0);
		expect(worst.nearDensity).toBeGreaterThanOrEqual(0.75);
		expect(worst.distance).toBeLessThan(1);
	});

	it('adapts with hysteresis — no second-to-second oscillation', () => {
		const adaptive = new GrassAdaptiveQuality();
		for (let s = 0; s < 2; s++) adaptive.update(1, 40, 60, true);
		expect(adaptive.level).toBe(1);
		adaptive.update(1, 40, 60, true);
		expect(adaptive.level).toBeCloseTo(0.9, 6);
		// Alternating good/bad seconds never move it.
		for (let s = 0; s < 20; s++) adaptive.update(1, s % 2 ? 40 : 60, 60, true);
		expect(adaptive.level).toBeCloseTo(0.9, 6);
		// Sustained headroom recovers slowly.
		for (let s = 0; s < 8; s++) adaptive.update(1, 60, 60, true);
		expect(adaptive.level).toBeCloseTo(0.95, 6);
	});
});

describe('terrain surface lattice', () => {
	it('interpolates on the mesh’s own triangles (exact at vertices, planar inside)', () => {
		const side = 3;
		const positions = new Float32Array(side * side * 3);
		const normals = new Float32Array(side * side * 3);
		for (let z = 0; z < side; z++)
			for (let x = 0; x < side; x++) {
				const i = (z * side + x) * 3;
				positions[i] = x * 2;
				positions[i + 1] = x * x + z * 3;
				positions[i + 2] = z * 2;
				normals[i + 1] = 1;
			}
		const lattice: TerrainSurfaceLattice = {
			originX: 0,
			originZ: 0,
			step: 2,
			verticesPerSide: side,
			positions,
			normals,
			shores: new Float32Array(side * side * 3)
		};
		const out = createSurfacePoint();
		expect(sampleSurfaceLattice(lattice, 2, 2, out)).toBe(true);
		expect(out.height).toBeCloseTo(1 + 3, 6);
		// Inside triangle a-c-b of cell (0,0): plane through (0,0,0), (2,1,0), (0,3,2).
		sampleSurfaceLattice(lattice, 0.5, 0.5, out);
		expect(out.height).toBeCloseTo(0.25 * 1 + 0.25 * 3, 6);
		expect(sampleSurfaceLattice(lattice, -0.1, 0, out)).toBe(false);
	});
});

describe('GrassManager streaming', () => {
	function createManager(exclusions: GrassExclusion[] = [], exclusionRevision = { value: 0 }) {
		const terrainSize = 96;
		const resolution = 8;
		const side = resolution + 1;
		const lattice = (cx: number, cz: number): TerrainSurfaceLattice => {
			const positions = new Float32Array(side * side * 3);
			const normals = new Float32Array(side * side * 3);
			for (let z = 0; z < side; z++)
				for (let x = 0; x < side; x++) {
					const i = (z * side + x) * 3;
					positions[i] = cx * terrainSize + (x * terrainSize) / resolution;
					positions[i + 1] = 1;
					positions[i + 2] = cz * terrainSize + (z * terrainSize) / resolution;
					normals[i + 1] = 1;
				}
			return {
				originX: cx * terrainSize,
				originZ: cz * terrainSize,
				step: terrainSize / resolution,
				verticesPerSide: side,
				positions,
				normals,
				shores: new Float32Array(side * side * 3)
			};
		};
		const cache = new Map<string, TerrainSurfaceLattice>();
		const vegetation = {
			grass: createDefaultGrassSettings(),
			debug: { showGrassChunks: false, showGrassLod: false, showGrassCandidates: false }
		};
		const manager = new GrassManager({
			settings: vegetation.grass,
			debug: vegetation.debug,
			seed: 'grass-test',
			terrain: {
				chunkSize: () => terrainSize,
				getRevision: () => 1,
				getSurfaceLattice: (cx, cz) => {
					const key = `${cx}:${cz}`;
					if (!cache.has(key)) cache.set(key, lattice(cx, cz));
					if (cache.size > 64) cache.delete(cache.keys().next().value!);
					return cache.get(key)!;
				}
			},
			heightSampler: {
				sampleBiomeWeights: (_x: number, _z: number, out: { plains: number }) => {
					Object.assign(out, { plains: 1, hills: 0, highlands: 0, mountains: 0 });
				},
				sample: () => 1
			} as unknown as TerrainHeightSampler,
			vegetationRegionSampler: { getForestDensity: () => 0 } as unknown as VegetationRegionSampler,
			getExclusions: () => exclusions,
			getExclusionRevision: () => exclusionRevision.value,
			atlasTileSize: 32
		});
		manager.setQualityProfile(FULL_QUALITY);
		return { manager, vegetation };
	}

	function settle(manager: GrassManager, x: number, z: number) {
		const camera = new THREE.PerspectiveCamera();
		camera.position.set(x, 2, z);
		camera.updateMatrixWorld();
		for (let i = 0; i < 400 && (i === 0 || manager.getRenderStats(null).queuedChunks > 0); i++) {
			manager.update(x, z);
			manager.updateView(camera, 1 / 60, { x, feetY: 1, z });
		}
	}

	it.each([
		[0.2, 0.52],
		[0.35, 0.9]
	])(
		'upgrades saved grass heights %s–%s after construction and sends them to the shader',
		(minHeight, maxHeight) => {
			const { manager, vegetation } = createManager();
			// ThreeScene constructs the manager first, then loads a world's environment
			// into the same settings object and calls setSeed (even for the same seed).
			Object.assign(vegetation.grass, { minHeight, maxHeight });
			manager.setSeed('grass-test');
			settle(manager, 0, 0);
			const material = manager.getSharedMaterials()[0];
			const shader = {
				uniforms: {} as Record<string, THREE.IUniform>,
				vertexShader: '',
				fragmentShader: ''
			};
			material.onBeforeCompile(
				shader as Parameters<typeof material.onBeforeCompile>[0],
				{} as THREE.WebGLRenderer
			);
			const size = shader.uniforms.uGrassSize.value as THREE.Vector4;
			expect(size.x).toBe(0.7);
			expect(size.x + size.y).toBeCloseTo(1.8);
			expect(vegetation.grass.minHeight).toBe(0.7);
			expect(vegetation.grass.maxHeight).toBe(1.8);
			manager.dispose();
		}
	);

	it('preserves custom heights when loading a world', () => {
		const { manager, vegetation } = createManager();
		Object.assign(vegetation.grass, { minHeight: 1.2, maxHeight: 2.4 });
		manager.setSeed('grass-test');
		expect(vegetation.grass.minHeight).toBe(1.2);
		expect(vegetation.grass.maxHeight).toBe(2.4);
		manager.dispose();
	});

	it('uses one mesh per chunk with shared material/atlas, and stays bounded over a long walk', () => {
		const { manager } = createManager();
		settle(manager, 0, 0);
		const start = manager.getRenderStats(null);
		expect(start.activeChunks).toBeGreaterThan(20);
		expect(start.loadedInstances).toBeGreaterThan(20000);
		const meshes = manager.group.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
		expect(meshes.length).toBe(start.activeChunks);
		const materials = new Set(meshes.map((m) => m.material));
		expect(materials.size).toBe(1);
		expect(manager.getSharedMaterials()).toEqual([...materials]);

		let maxChunks = 0;
		let maxBytes = 0;
		for (let step = 1; step <= 50; step++) {
			settle(manager, step * 40, step * 15);
			const stats = manager.getRenderStats(null);
			maxChunks = Math.max(maxChunks, stats.activeChunks);
			maxBytes = Math.max(maxBytes, stats.bufferBytes);
		}
		// ~2.1 km later the resident set is the same size as at the start — nothing accumulates.
		expect(maxChunks).toBeLessThanOrEqual(start.activeChunks + 8);
		expect(maxBytes).toBeLessThan(start.bufferBytes * 1.3);
		expect(manager.group.children.length).toBe(manager.getRenderStats(null).activeChunks);
		manager.dispose();
		expect(manager.group.children.length).toBe(0);
	});

	it('regenerates only the chunks under a new foundation', () => {
		const exclusions: GrassExclusion[] = [];
		const revision = { value: 0 };
		const { manager } = createManager(exclusions, revision);
		settle(manager, 0, 0);
		const before = manager.getRenderStats(null).loadedInstances;
		const meshesBefore = new Set(manager.group.children);
		exclusions.push({ id: 'f1', minX: 2, minZ: 2, maxX: 12, maxZ: 12 });
		revision.value++;
		settle(manager, 0, 0);
		// Only the chunk(s) under the 10 m footprint were rebuilt; every other mesh is untouched.
		const rebuilt = manager.group.children.filter((mesh) => !meshesBefore.has(mesh));
		expect(rebuilt.length).toBeGreaterThan(0);
		expect(rebuilt.length).toBeLessThanOrEqual(4);
		expect(manager.getRenderStats(null).loadedInstances).toBeLessThan(before);
	});

	it('draws fewer tufts with distance and nothing past the render distance', () => {
		const { manager } = createManager();
		settle(manager, 0, 0);
		const stats = manager.getRenderStats(null);
		expect(stats.visibleInstances).toBeGreaterThan(0);
		expect(stats.visibleInstances).toBeLessThan(stats.loadedInstances);
		expect(stats.drawCalls).toBeLessThanOrEqual(stats.activeChunks);
	});
});
