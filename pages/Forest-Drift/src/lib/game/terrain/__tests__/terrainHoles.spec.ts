import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TerrainChunk } from '../TerrainChunk';
import { TerrainHeightSampler } from '../TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../TerrainSettings';
import { TerrainHoles, holedChunkIndices } from '../terrainHoles';

const RES = 48;
const SIZE = 96;
const STEP = SIZE / RES; // 2 m, the default terrain vertex spacing

/** Every triangle's centroid in world X/Z, from an index buffer. */
function centroids(indices: ArrayLike<number>, count: number, originX: number, originZ: number) {
	const out: { x: number; z: number }[] = [];
	const side = RES + 1;
	for (let i = 0; i < count; i += 3) {
		let x = 0;
		let z = 0;
		for (let k = 0; k < 3; k++) {
			const v = indices[i + k];
			x += originX + (v % side) * STEP;
			z += originZ + Math.floor(v / side) * STEP;
		}
		out.push({ x: x / 3, z: z / 3 });
	}
	return out;
}

const inside = (
	p: { x: number; z: number },
	r: { minX: number; maxX: number; minZ: number; maxZ: number }
) => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ;

describe('holedChunkIndices', () => {
	it('keeps the shared buffer when no cell is cut', () => {
		expect(holedChunkIndices(RES, 0, 0, STEP, [])).toBeNull();
		// A hole thinner than a cell cuts nothing.
		expect(
			holedChunkIndices(RES, 0, 0, STEP, [{ minX: 3, maxX: 4.5, minZ: 3, maxZ: 9 }])
		).toBeNull();
	});

	it('cuts exactly the cells inside a footprint on the vertex grid', () => {
		const hole = { minX: 10, maxX: 20, minZ: 4, maxZ: 12 }; // 5 × 4 cells
		const cut = holedChunkIndices(RES, 0, 0, STEP, [hole])!;
		expect(cut.count).toBe((RES * RES - 20) * 6);
		const tris = centroids(cut.indices, cut.count, 0, 0);
		expect(tris.some((t) => inside(t, hole))).toBe(false);
		// The cells round it are all still there: 7 × 6 block minus the 20 inside = 22 cells.
		const ring = { minX: 8, maxX: 22, minZ: 2, maxZ: 14 };
		expect(tris.filter((t) => inside(t, ring)).length).toBe(22 * 2);
	});

	it('keeps the same order and winding as the full grid for the cells left', () => {
		const cut = holedChunkIndices(RES, 0, 0, STEP, [{ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }])!;
		// The first cell is gone, so the buffer starts at the second cell (a = 1).
		expect(Array.from(cut.indices.slice(0, 6))).toEqual([1, 50, 2, 2, 50, 51]);
	});

	it('handles holes crossing the chunk edge, and in a chunk far from the origin', () => {
		const originX = 96 * -2084;
		const originZ = 96 * 2083;
		const hole = { minX: originX - 6, maxX: originX + 4, minZ: originZ + 90, maxZ: originZ + 100 };
		const cut = holedChunkIndices(RES, originX, originZ, STEP, [hole])!;
		// Inside this chunk: x 0 … 4 (2 cells), z 90 … 96 (3 cells).
		expect(cut.count).toBe((RES * RES - 6) * 6);
	});

	it('cuts overlapping holes once', () => {
		const a = { minX: 0, maxX: 8, minZ: 0, maxZ: 8 };
		const b = { minX: 4, maxX: 12, minZ: 0, maxZ: 8 };
		expect(holedChunkIndices(RES, 0, 0, STEP, [a, b])!.count).toBe((RES * RES - 24) * 6);
	});

	it('reuses the output buffer', () => {
		const first = holedChunkIndices(RES, 0, 0, STEP, [{ minX: 0, maxX: 4, minZ: 0, maxZ: 4 }])!;
		const second = holedChunkIndices(
			RES,
			0,
			0,
			STEP,
			[{ minX: 10, maxX: 20, minZ: 10, maxZ: 20 }],
			first.indices
		)!;
		expect(second.indices).toBe(first.indices);
	});
});

describe('TerrainHoles', () => {
	it('finds overlapping holes and bumps its revision on change', () => {
		const holes = new TerrainHoles();
		const r0 = holes.revision;
		holes.set([
			{ minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
			{ minX: 200, maxX: 210, minZ: 0, maxZ: 10 }
		]);
		expect(holes.revision).toBe(r0 + 1);
		expect(holes.overlapping(5, 100, 5, 100)).toHaveLength(1);
		// Touching only an edge doesn't count.
		expect(holes.overlapping(10, 20, 0, 10)).toHaveLength(0);
	});
});

describe('TerrainChunk with holes', () => {
	const settings = createDefaultTerrainSettings();
	const sampler = new TerrainHeightSampler(settings);

	it('is cut after populating, restored when the hole goes, and raycasts fall through the cut', () => {
		const chunk = new TerrainChunk(settings.chunkResolution);
		const holes = new TerrainHoles();
		chunk.holes = holes;
		holes.set([{ minX: 10, maxX: 20, minZ: 10, maxZ: 20 }]);
		chunk.populate(0, 0, settings.chunkSize, sampler, 1);
		expect(chunk.holedCellCount).toBe(25);
		const geometry = chunk.mesh.geometry;
		expect(geometry.drawRange.count).toBe((RES * RES - 25) * 6);

		const ray = new THREE.Raycaster(
			new THREE.Vector3(15.3, 1000, 15.4),
			new THREE.Vector3(0, -1, 0)
		);
		expect(ray.intersectObject(chunk.mesh)).toHaveLength(0);
		ray.set(new THREE.Vector3(25.3, 1000, 15.4), new THREE.Vector3(0, -1, 0));
		expect(ray.intersectObject(chunk.mesh)).toHaveLength(1);

		holes.set([]);
		chunk.applyHoles(settings.chunkSize);
		expect(chunk.holedCellCount).toBe(0);
		expect(geometry.drawRange.count).toBe(Infinity);
		ray.set(new THREE.Vector3(15.3, 1000, 15.4), new THREE.Vector3(0, -1, 0));
		expect(ray.intersectObject(chunk.mesh)).toHaveLength(1);
	});

	it('skips work when nothing changed', () => {
		const chunk = new TerrainChunk(settings.chunkResolution);
		const holes = new TerrainHoles();
		chunk.holes = holes;
		holes.set([{ minX: 10, maxX: 20, minZ: 10, maxZ: 20 }]);
		chunk.populate(0, 0, settings.chunkSize, sampler, 1);
		const index = chunk.mesh.geometry.index;
		chunk.applyHoles(settings.chunkSize);
		expect(chunk.mesh.geometry.index).toBe(index);
	});

	it('takes no time worth counting to cut a chunk', () => {
		const holes = Array.from({ length: 20 }, (_, i) => ({
			minX: (i % 5) * 18,
			maxX: (i % 5) * 18 + 12,
			minZ: Math.floor(i / 5) * 22,
			maxZ: Math.floor(i / 5) * 22 + 16
		}));
		const runs = 200;
		const start = performance.now();
		let out: Uint32Array | undefined;
		for (let i = 0; i < runs; i++) out = holedChunkIndices(RES, 0, 0, STEP, holes, out)!.indices;
		const perChunk = (performance.now() - start) / runs;
		// Plan budget: ≤ 0.5 ms extra per chunk rebuild.
		expect(perChunk).toBeLessThan(0.5);
	});
});
