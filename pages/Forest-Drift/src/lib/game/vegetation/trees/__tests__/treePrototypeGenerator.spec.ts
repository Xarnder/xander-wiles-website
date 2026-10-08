import { describe, expect, it } from 'vitest';
import { buildTreeMesh, designTree } from '../treePrototypeGenerator';
import { TREE_SPECIES } from '../treeSpecies';
import { TREE_LODS, TREE_SPECIES_IDS, triangleCount, type TreeMeshData } from '../TreeSpeciesTypes';

function allMeshes(worldSeed = 'test-world') {
	const meshes: { speciesId: string; variant: number; lod: number; mesh: TreeMeshData }[] = [];
	for (const speciesId of TREE_SPECIES_IDS) {
		const species = TREE_SPECIES[speciesId];
		for (let variant = 0; variant < species.prototypeCount; variant++) {
			const design = designTree(species, variant, worldSeed);
			for (const lod of TREE_LODS) {
				meshes.push({ speciesId, variant, lod, mesh: buildTreeMesh(species, design, lod) });
			}
		}
	}
	return meshes;
}

describe('tree prototype generation', () => {
	const meshes = allMeshes();

	it('stays within every species triangle budget at every LOD', () => {
		for (const { speciesId, lod, mesh } of meshes) {
			const budget = TREE_SPECIES[speciesId as keyof typeof TREE_SPECIES].triangleBudget[lod];
			expect(triangleCount(mesh), `${speciesId} LOD${lod}`).toBeLessThanOrEqual(budget);
			expect(triangleCount(mesh)).toBeGreaterThan(0);
		}
	});

	it('gets strictly cheaper with each LOD', () => {
		for (const speciesId of TREE_SPECIES_IDS) {
			const counts = TREE_LODS.map((lod) =>
				triangleCount(
					meshes.find((m) => m.speciesId === speciesId && m.variant === 0 && m.lod === lod)!.mesh
				)
			);
			for (let i = 1; i < counts.length; i++)
				expect(counts[i], speciesId).toBeLessThan(counts[i - 1]);
		}
	});

	it('produces valid geometry: finite data, in-range indices, unit normals, sane bounds', () => {
		for (const { speciesId, lod, mesh } of meshes) {
			const vertexCount = mesh.positions.length / 3;
			expect(mesh.normals.length).toBe(mesh.positions.length);
			expect(mesh.colors.length).toBe(mesh.positions.length);
			expect(mesh.wind.length).toBe(vertexCount);
			for (const value of mesh.positions)
				if (!Number.isFinite(value)) throw new Error(`NaN position ${speciesId}`);
			for (const index of mesh.indices)
				if (index >= vertexCount) throw new Error('index out of range');
			for (let i = 0; i < mesh.normals.length; i += 3) {
				const len = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
				if (Math.abs(len - 1) > 1e-3) throw new Error(`non-unit normal ${speciesId} LOD${lod}`);
			}
			for (const c of mesh.colors) if (!(c >= 0 && c <= 1)) throw new Error('colour out of range');
			for (const w of mesh.wind)
				if (!(w >= 0 && w <= 1.5)) throw new Error('wind weight out of range');
			// Trees stand on the ground, 3–20 m tall, a few metres wide.
			expect(mesh.min[1]).toBeLessThanOrEqual(0);
			expect(mesh.max[1]).toBeGreaterThan(3);
			expect(mesh.max[1]).toBeLessThan(20);
			expect(mesh.max[0] - mesh.min[0]).toBeLessThan(8);
		}
	});

	it('winds triangles outward (front faces agree with vertex normals)', () => {
		for (const { speciesId, lod, mesh } of meshes) {
			let agree = 0;
			const total = mesh.indices.length / 3;
			for (let t = 0; t < total; t++) {
				const [a, b, c] = [mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]];
				const p = (i: number) => [
					mesh.positions[i * 3],
					mesh.positions[i * 3 + 1],
					mesh.positions[i * 3 + 2]
				];
				const [pa, pb, pc] = [p(a), p(b), p(c)];
				const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
				const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
				const face = [
					e1[1] * e2[2] - e1[2] * e2[1],
					e1[2] * e2[0] - e1[0] * e2[2],
					e1[0] * e2[1] - e1[1] * e2[0]
				];
				const n = [0, 1, 2].map(
					(k) => mesh.normals[a * 3 + k] + mesh.normals[b * 3 + k] + mesh.normals[c * 3 + k]
				);
				if (face[0] * n[0] + face[1] * n[1] + face[2] * n[2] > 0) agree++;
			}
			expect(agree / total, `${speciesId} LOD${lod}`).toBeGreaterThan(0.95);
		}
	});

	it('is deterministic per world seed and differs between seeds and variants', () => {
		const again = allMeshes();
		meshes.forEach((entry, i) => {
			expect(Array.from(again[i].mesh.positions)).toEqual(Array.from(entry.mesh.positions));
		});
		const other = allMeshes('another-world');
		expect(Array.from(other[0].mesh.positions)).not.toEqual(Array.from(meshes[0].mesh.positions));
		const v0 = meshes.find((m) => m.speciesId === 'oak' && m.variant === 0 && m.lod === 0)!.mesh;
		const v1 = meshes.find((m) => m.speciesId === 'oak' && m.variant === 1 && m.lod === 0)!.mesh;
		expect(Array.from(v1.positions)).not.toEqual(Array.from(v0.positions));
	});

	it('keeps each prototype silhouette consistent across LODs (bounds within 15%)', () => {
		for (const speciesId of TREE_SPECIES_IDS) {
			const lod0 = meshes.find(
				(m) => m.speciesId === speciesId && m.variant === 0 && m.lod === 0
			)!.mesh;
			for (const lod of [1, 2, 3]) {
				const other = meshes.find(
					(m) => m.speciesId === speciesId && m.variant === 0 && m.lod === lod
				)!.mesh;
				expect(
					Math.abs(other.max[1] - lod0.max[1]) / lod0.max[1],
					`${speciesId} LOD${lod} height`
				).toBeLessThan(0.15);
				const w0 = lod0.max[0] - lod0.min[0];
				const w = other.max[0] - other.min[0];
				expect(Math.abs(w - w0) / w0, `${speciesId} LOD${lod} width`).toBeLessThan(0.3);
			}
		}
	});
});
