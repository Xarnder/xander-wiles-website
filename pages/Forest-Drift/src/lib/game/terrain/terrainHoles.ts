/**
 * Holes in the terrain mesh under basements (Basements and Joined Foundations, plan §4.3).
 *
 * A basement foundation's footprint sits on the terrain vertex grid, so it covers whole terrain
 * cells. Those cells are simply left out of the chunk's index buffer: no triangle reaches into the
 * basement, nothing is drawn or discarded per fragment, and the terrain just outside runs up to the
 * footprint's edge, against the basement's stone walls. Height queries are untouched — the surface
 * sampler decides when terrain doesn't count (WorldSurfaceSampler).
 *
 * Holes are kept in world metres rather than cells, so a cell is cut exactly when it lies inside a
 * hole whatever the chunk's resolution.
 */

export interface TerrainHoleRect {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

const EPS = 1e-6;

export class TerrainHoles {
	private rects: TerrainHoleRect[] = [];
	/** Bumped on every change, so chunks can tell whether their cut is current. */
	revision = 0;

	set(rects: readonly TerrainHoleRect[]): void {
		this.rects = rects.map((r) => ({ ...r }));
		this.revision++;
	}

	get count(): number {
		return this.rects.length;
	}

	/** Holes overlapping the rectangle (with positive area). */
	overlapping(minX: number, maxX: number, minZ: number, maxZ: number): TerrainHoleRect[] {
		const out: TerrainHoleRect[] = [];
		for (const r of this.rects)
			if (r.maxX > minX + EPS && r.minX < maxX - EPS && r.maxZ > minZ + EPS && r.minZ < maxZ - EPS)
				out.push(r);
		return out;
	}
}

/**
 * A chunk's triangle indices with the cells inside `holes` left out, in the same order and winding
 * as the full grid, or `null` when no cell is cut (the chunk then keeps the shared full index
 * buffer). `out` is reused when it's large enough.
 */
export function holedChunkIndices(
	resolution: number,
	originX: number,
	originZ: number,
	step: number,
	holes: readonly TerrainHoleRect[],
	out?: Uint32Array
): { indices: Uint32Array; count: number } | null {
	if (holes.length === 0) return null;
	// Which cells are cut, per row: a cell [x0, x0 + step] × [z0, z0 + step] lies inside a hole.
	const cut = new Uint8Array(resolution * resolution);
	let cutCount = 0;
	for (const h of holes) {
		const x0 = Math.max(0, Math.ceil((h.minX - originX) / step - EPS));
		const x1 = Math.min(resolution, Math.floor((h.maxX - originX) / step + EPS));
		const z0 = Math.max(0, Math.ceil((h.minZ - originZ) / step - EPS));
		const z1 = Math.min(resolution, Math.floor((h.maxZ - originZ) / step + EPS));
		for (let z = z0; z < z1; z++)
			for (let x = x0; x < x1; x++) {
				const i = z * resolution + x;
				if (!cut[i]) {
					cut[i] = 1;
					cutCount++;
				}
			}
	}
	if (cutCount === 0) return null;
	const count = (resolution * resolution - cutCount) * 6;
	const indices = out && out.length >= count ? out : new Uint32Array(resolution * resolution * 6);
	const verticesPerSide = resolution + 1;
	let n = 0;
	for (let z = 0; z < resolution; z++)
		for (let x = 0; x < resolution; x++) {
			if (cut[z * resolution + x]) continue;
			const a = z * verticesPerSide + x;
			const b = a + 1;
			const c = a + verticesPerSide;
			const d = c + 1;
			indices[n++] = a;
			indices[n++] = c;
			indices[n++] = b;
			indices[n++] = b;
			indices[n++] = c;
			indices[n++] = d;
		}
	return { indices, count };
}
