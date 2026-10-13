/**
 * Reading the BUILT terrain surface — the vertex lattice a terrain chunk was meshed from — instead
 * of re-sampling the height function. Things rooted on the ground (grass) interpolate it on exactly
 * the triangles the terrain mesh draws, so they sit on the rendered surface even where the mesh's
 * straight edges cut across a curved hill, and cost no noise evaluation at all. Pure, no Three.js.
 */

/** A chunk's vertex lattice: `verticesPerSide²` vertices `step` metres apart from its origin. */
export interface TerrainSurfaceLattice {
	originX: number;
	originZ: number;
	step: number;
	verticesPerSide: number;
	/** xyz per vertex (world space). */
	positions: Float32Array;
	/** Unit normal per vertex. */
	normals: Float32Array;
	/** Beach cover, beach stone, wet shelf per vertex (0..1) — see `RiverEdgeTint`. */
	shores: Float32Array;
}

export interface SurfacePoint {
	height: number;
	normalX: number;
	normalY: number;
	normalZ: number;
	shoreCover: number;
	shoreStone: number;
	shoreWet: number;
}

export function createSurfacePoint(): SurfacePoint {
	return {
		height: 0,
		normalX: 0,
		normalY: 1,
		normalZ: 0,
		shoreCover: 0,
		shoreStone: 0,
		shoreWet: 0
	};
}

/**
 * Interpolates the lattice at a world point on the mesh's own triangulation (each cell is split
 * along its b–c diagonal: triangles a-c-b and b-c-d, see TerrainChunk's shared indices). Returns
 * false when the point lies outside the lattice.
 */
export function sampleSurfaceLattice(
	lattice: TerrainSurfaceLattice,
	worldX: number,
	worldZ: number,
	out: SurfacePoint
): boolean {
	const cells = lattice.verticesPerSide - 1;
	const gx = (worldX - lattice.originX) / lattice.step;
	const gz = (worldZ - lattice.originZ) / lattice.step;
	if (!(gx >= 0 && gz >= 0 && gx <= cells && gz <= cells)) return false;
	const xi = Math.min(cells - 1, Math.floor(gx));
	const zi = Math.min(cells - 1, Math.floor(gz));
	const fx = gx - xi;
	const fz = gz - zi;
	const side = lattice.verticesPerSide;
	const a = zi * side + xi;
	const b = a + 1;
	const c = a + side;
	const d = c + 1;
	// Barycentric weights for the triangle containing (fx, fz).
	let wa = 0;
	let wb: number;
	let wc: number;
	let wd = 0;
	if (fx + fz <= 1) {
		wa = 1 - fx - fz;
		wb = fx;
		wc = fz;
	} else {
		wd = fx + fz - 1;
		wb = 1 - fz;
		wc = 1 - fx;
	}
	const p = lattice.positions;
	const n = lattice.normals;
	const s = lattice.shores;
	const mix = (array: Float32Array, k: number) =>
		array[a * 3 + k] * wa + array[b * 3 + k] * wb + array[c * 3 + k] * wc + array[d * 3 + k] * wd;
	out.height = mix(p, 1);
	const nx = mix(n, 0);
	const ny = mix(n, 1);
	const nz = mix(n, 2);
	const length = Math.hypot(nx, ny, nz) || 1;
	out.normalX = nx / length;
	out.normalY = ny / length;
	out.normalZ = nz / length;
	out.shoreCover = mix(s, 0);
	out.shoreStone = mix(s, 1);
	out.shoreWet = mix(s, 2);
	return true;
}
