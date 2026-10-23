import { describe, expect, it } from 'vitest';
import { addBlob, TreeMeshBuilder } from '../treeMeshKit';
import {
	buildTreeCards,
	buildTreeMesh,
	buildTreeShadowProxy,
	designTree,
	lodHasCards
} from '../treePrototypeGenerator';
import { TREE_SPECIES } from '../treeSpecies';
import { cardTileRect, generateTreeCardAtlas, TREE_CARD_ALPHA_CUTOFF } from '../treeCardAtlas';
import {
	TREE_CARD_TILES,
	TREE_FOLIAGE_CODE_BASE,
	TREE_LODS,
	TREE_SPECIES_IDS,
	TREE_SURFACE_CODES,
	triangleCount,
	type TreeMeshData
} from '../TreeSpeciesTypes';

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
			// Trees stand on the ground, 3–30 m tall (spruces are the tall ones), a few metres wide.
			expect(mesh.min[1]).toBeLessThanOrEqual(0);
			expect(mesh.max[1]).toBeGreaterThan(3);
			expect(mesh.max[1]).toBeLessThan(30);
			expect(mesh.max[0] - mesh.min[0]).toBeLessThan(10);
		}
	});

	it('tags every vertex with its species bark or foliage surface, with unit bark axes', () => {
		for (const { speciesId, lod, mesh } of meshes) {
			const species = TREE_SPECIES[speciesId as keyof typeof TREE_SPECIES];
			const bark = TREE_SURFACE_CODES[species.surface.bark];
			const foliage = TREE_SURFACE_CODES[species.surface.foliage];
			const vertexCount = mesh.positions.length / 3;
			expect(mesh.surface.length).toBe(vertexCount * 4);
			const codes = new Set<number>();
			for (let v = 0; v < vertexCount; v++) {
				const code = mesh.surface[v * 4];
				codes.add(code);
				if (code === bark) {
					const axis = Math.hypot(
						mesh.surface[v * 4 + 1],
						mesh.surface[v * 4 + 2],
						mesh.surface[v * 4 + 3]
					);
					expect(axis).toBeCloseTo(1, 4);
				}
			}
			expect(codes.has(foliage), `${speciesId} LOD${lod} foliage`).toBe(true);
			for (const code of codes) expect([bark, foliage]).toContain(code);
			// Bark codes are below the foliage base and foliage at or above it: the shader branches on that.
			expect(bark).toBeLessThan(TREE_FOLIAGE_CODE_BASE);
			expect(foliage).toBeGreaterThanOrEqual(TREE_FOLIAGE_CODE_BASE);
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

	it('gives near broadleaf LODs a shadow proxy: far fewer triangles, within the visible bounds', () => {
		for (const speciesId of TREE_SPECIES_IDS) {
			const species = TREE_SPECIES[speciesId];
			const design = designTree(species, 0, 'proxy-world');
			for (const lod of TREE_LODS) {
				const proxy = buildTreeShadowProxy(species, design, lod);
				if (species.canopy.kind !== 'blobs' || lod >= 2) {
					expect(proxy, `${speciesId} LOD${lod}`).toBeNull();
					continue;
				}
				const visible = buildTreeMesh(species, design, lod);
				expect(proxy, `${speciesId} LOD${lod}`).not.toBeNull();
				expect(triangleCount(proxy!)).toBeLessThan(triangleCount(visible) * 0.4);
				for (let k = 0; k < 3; k++) {
					// Within a centimetre (a five-sided trunk ring on a bent trunk dips a millimetre lower).
					expect(proxy!.max[k]).toBeLessThanOrEqual(visible.max[k] + 0.01);
					expect(proxy!.min[k]).toBeGreaterThanOrEqual(visible.min[k] - 0.01);
				}
			}
		}
	});

	it('a coarser, slightly shrunk blob with the same lumps lies inside the finer one', () => {
		// The shadow proxy's guarantee, per cluster: every vertex and facet centre of the coarse
		// blob is inside the fine blob along its ray from the centre — so a proxy never shadows the
		// lit side of the crown it stands in for.
		const blob = (detail: number, scale: number) => {
			const builder = new TreeMeshBuilder();
			addBlob(builder, {
				center: [0.3, 4, -0.2],
				radii: [1.4 * scale, 1.1 * scale, 1.3 * scale],
				detail,
				lumpiness: 0.14,
				fineLumps: 0.7,
				seed: 1234,
				canopyCenter: [0, 4, 0],
				canopyRadii: [2.5, 2, 2.5],
				normalBlend: 0.6,
				shade: () => ({ color: [1, 1, 1], wind: 0, surface: 4 })
			});
			return builder.build();
		};
		const centre = [0.3, 4, -0.2];
		const reach = (mesh: TreeMeshData, dir: number[]) => {
			// Möller–Trumbore from the centre along `dir`: distance to the surface.
			let best = Infinity;
			const P = (i: number) => [
				mesh.positions[i * 3],
				mesh.positions[i * 3 + 1],
				mesh.positions[i * 3 + 2]
			];
			for (let t = 0; t < mesh.indices.length; t += 3) {
				const [a, b, c] = [P(mesh.indices[t]), P(mesh.indices[t + 1]), P(mesh.indices[t + 2])];
				const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
				const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
				const p = [
					dir[1] * e2[2] - dir[2] * e2[1],
					dir[2] * e2[0] - dir[0] * e2[2],
					dir[0] * e2[1] - dir[1] * e2[0]
				];
				const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
				if (Math.abs(det) < 1e-12) continue;
				const s = [centre[0] - a[0], centre[1] - a[1], centre[2] - a[2]];
				const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
				if (u < -1e-9 || u > 1 + 1e-9) continue;
				const q = [
					s[1] * e1[2] - s[2] * e1[1],
					s[2] * e1[0] - s[0] * e1[2],
					s[0] * e1[1] - s[1] * e1[0]
				];
				const v = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) / det;
				if (v < -1e-9 || u + v > 1 + 1e-9) continue;
				const d = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
				if (d > 0 && d < best) best = d;
			}
			return best;
		};
		for (const [fine, coarse] of [
			[2, 1],
			[1, 0]
		]) {
			const visible = blob(fine, 1);
			const proxy = blob(coarse, 0.95);
			const points: number[][] = [];
			for (let i = 0; i < proxy.positions.length; i += 3)
				points.push([proxy.positions[i], proxy.positions[i + 1], proxy.positions[i + 2]]);
			for (let t = 0; t < proxy.indices.length; t += 3) {
				const [a, b, c] = [0, 1, 2].map((k) => proxy.indices[t + k] * 3);
				points.push(
					[0, 1, 2].map(
						(k) => (proxy.positions[a + k] + proxy.positions[b + k] + proxy.positions[c + k]) / 3
					)
				);
			}
			for (const point of points) {
				const d = [point[0] - centre[0], point[1] - centre[1], point[2] - centre[2]];
				const length = Math.hypot(d[0], d[1], d[2]);
				const dir = d.map((x) => x / length);
				expect(length, `detail ${coarse} inside detail ${fine}`).toBeLessThanOrEqual(
					reach(visible, dir) + 1e-6
				);
			}
		}
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

describe('foliage cards', () => {
	const designs = TREE_SPECIES_IDS.flatMap((speciesId) => {
		const species = TREE_SPECIES[speciesId];
		return Array.from({ length: species.prototypeCount }, (_, variant) => ({
			speciesId,
			variant,
			species,
			design: designTree(species, variant, 'card-world')
		}));
	});

	it('gives every species cards on LOD0 and LOD1 only, fewer on LOD1', () => {
		for (const { speciesId, species, design } of designs) {
			const lod0 = buildTreeCards(species, design, 0);
			const lod1 = buildTreeCards(species, design, 1);
			expect(lod0, speciesId).not.toBeNull();
			expect(lod1, speciesId).not.toBeNull();
			expect(lod1!.cards, speciesId).toBeLessThan(lod0!.cards);
			expect(lod1!.cards, speciesId).toBeGreaterThan(lod0!.cards * 0.3);
			for (const lod of [2, 3] as const) {
				expect(lodHasCards(lod)).toBe(false);
				expect(buildTreeCards(species, design, lod)).toBeNull();
			}
			// A few hundred cards at most: geometry is never the cost, overdraw is.
			expect(lod0!.cards, speciesId).toBeLessThanOrEqual(240);
			expect(triangleCount(lod0!), speciesId).toBeLessThanOrEqual(1200);
		}
	});

	it('produces valid card geometry: finite, unit normals, UVs inside the layer tile, anchors on the card', () => {
		for (const { speciesId, species, design } of designs) {
			for (const lod of [0, 1] as const) {
				const cards = buildTreeCards(species, design, lod)!;
				const vertexCount = cards.positions.length / 3;
				expect(cards.uvs.length).toBe(vertexCount * 2);
				expect(cards.anchors.length).toBe(vertexCount * 4);
				for (const value of cards.positions)
					if (!Number.isFinite(value)) throw new Error(`NaN card position ${speciesId}`);
				for (const index of cards.indices)
					if (index >= vertexCount) throw new Error('card index out of range');
				for (let i = 0; i < cards.normals.length; i += 3) {
					const len = Math.hypot(cards.normals[i], cards.normals[i + 1], cards.normals[i + 2]);
					if (Math.abs(len - 1) > 1e-3) throw new Error(`non-unit card normal ${speciesId}`);
				}
				for (const c of cards.colors)
					if (!(c >= 0 && c <= 1)) throw new Error('card colour out of range');
				for (const w of cards.wind)
					if (!(w >= 0 && w <= 1.5)) throw new Error('card wind out of range');
				const rects = species.cards.map((layer) => cardTileRect(layer.tile));
				for (let v = 0; v < vertexCount; v++) {
					const u = cards.uvs[v * 2];
					const t = cards.uvs[v * 2 + 1];
					const inTile = rects.some(
						([u0, v0, u1, v1]) =>
							u >= u0 - 1e-6 && u <= u1 + 1e-6 && t >= v0 - 1e-6 && t <= v1 + 1e-6
					);
					if (!inTile) throw new Error(`${speciesId} card UV outside its tiles`);
					const along = cards.anchors[v * 4 + 3];
					expect(along).toBeGreaterThanOrEqual(0);
					expect(along).toBeLessThanOrEqual(1);
				}
				// Cards sit on their crown: never far outside the prototype, never below the ground.
				const mesh = buildTreeMesh(species, design, lod);
				expect(cards.min[1], `${speciesId} LOD${lod}`).toBeGreaterThan(-0.4);
				expect(cards.max[1], `${speciesId} LOD${lod}`).toBeLessThan(mesh.max[1] + 2);
				expect(cards.max[0] - cards.min[0]).toBeLessThan(mesh.max[0] - mesh.min[0] + 4);
			}
		}
	});

	it('is deterministic per design and differs between variants', () => {
		const oak = TREE_SPECIES.oak;
		const a = buildTreeCards(oak, designTree(oak, 0, 'card-world'), 0)!;
		const b = buildTreeCards(oak, designTree(oak, 0, 'card-world'), 0)!;
		const c = buildTreeCards(oak, designTree(oak, 1, 'card-world'), 0)!;
		expect(Array.from(b.positions)).toEqual(Array.from(a.positions));
		expect(Array.from(c.positions)).not.toEqual(Array.from(a.positions));
	});

	it('leaves the crown design untouched (cards draw from their own seed)', () => {
		for (const { species, variant } of designs.slice(0, 6)) {
			const design = designTree(species, variant, 'card-world');
			const before = Array.from(buildTreeMesh(species, design, 0).positions);
			buildTreeCards(species, design, 0);
			expect(Array.from(buildTreeMesh(species, design, 0).positions)).toEqual(before);
		}
	});
});

describe('tree card atlas', () => {
	const atlas = generateTreeCardAtlas(64);

	it('paints one sprayed tile per card kind with real coverage', () => {
		expect(atlas.coverage).toHaveLength(TREE_CARD_TILES.length);
		for (const [i, coverage] of atlas.coverage.entries()) {
			expect(coverage, TREE_CARD_TILES[i]).toBeGreaterThan(0.08);
			// Sprays, not solid squares: plenty of gaps between leaves.
			expect(coverage, TREE_CARD_TILES[i]).toBeLessThan(0.6);
		}
	});

	it("builds a full mip chain that keeps each tile's coverage", () => {
		const base = atlas.levels[0];
		expect(base.width).toBe(64 * 4);
		expect(base.height).toBe(64 * 2);
		expect(atlas.levels.length).toBeGreaterThanOrEqual(4);
		// Coverage of the whole atlas above the cutoff, per level, stays close to level 0.
		const passing = (data: Uint8Array) => {
			let n = 0;
			for (let i = 3; i < data.length; i += 4) if (data[i] / 255 > TREE_CARD_ALPHA_CUTOFF) n++;
			return n / (data.length / 4);
		};
		const level0 = passing(base.data);
		for (const level of atlas.levels.slice(1, -1))
			expect(Math.abs(passing(level.data) - level0)).toBeLessThan(0.08);
	});

	it('is deterministic', () => {
		const again = generateTreeCardAtlas(64);
		expect(Array.from(again.levels[0].data)).toEqual(Array.from(atlas.levels[0].data));
	});
});
