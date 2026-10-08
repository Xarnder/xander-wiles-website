import type { SurfaceMappingMode } from './ProceduralMaterialTypes';

/**
 * Pure geometry → texture-coordinate mapping for building surfaces. No Three.js: input is a flat,
 * NON-INDEXED triangle list already transformed into "anchor space" (foundation-local metres — see
 * `SurfaceMappingBinder`), output is a UV per vertex in METRES plus a weathering colour per vertex.
 *
 * Why metres: texture repeat is `1 / tileSize` (a material property), so any surface mapped here gets
 * the same physical texel size — a slate course or a paving stone is the same size on a 3 m roof and
 * a 30 m one, and a wall doesn't stretch its plaster because it is long.
 *
 * Why per-face planar projection rather than mesh UVs or triplanar shading: the procedural builders
 * emit boxes, extrusions and fans with no meaningful UVs, and triplanar blending would need shader
 * injection that collides with CSM's own `onBeforeCompile` (see the README). Every face here is flat,
 * so a planar projection per face is exact — no stretching and no blending seams. Faces that share a
 * plane share a frame, so a wall or roof plane made of many triangles maps continuously.
 */

export interface SurfaceMappingInput {
	/** xyz per vertex, three vertices per triangle, anchor-space metres. */
	positions: Float32Array;
	/** Mapping mode per triangle. */
	modeForTriangle: (triangle: number) => SurfaceMappingMode;
	/** Stable per-building seed (world seed × foundation id) — offsets and tints differ between buildings. */
	seed: number;
	/** Whether to compute weathering colours (skipped for glass etc.). */
	weathering: boolean;
}

export interface SurfaceMappingOutput {
	uv: Float32Array;
	color: Float32Array;
}

/** Horizontal faces (|normal.y| above this) are projected from above on X/Z. */
const HORIZONTAL_THRESHOLD = 0.9;
/** Faces this close to perpendicular count as rectangle halves for grain detection. */
const RIGHT_ANGLE_TOLERANCE = 0.06;

function hashInts(a: number, b: number, c: number, seed: number): number {
	let h = seed | 0;
	h = Math.imul(h ^ a, 0x27d4eb2d);
	h = Math.imul(h ^ b, 0x165667b1);
	h = Math.imul(h ^ c, 0x85ebca6b);
	h ^= h >>> 15;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 13;
	return (h >>> 0) / 4294967296;
}

/** Makes a direction's largest-magnitude component positive, so two triangles of one face agree on its sign. */
function canonicalize(v: [number, number, number]): [number, number, number] {
	const ax = Math.abs(v[0]);
	const ay = Math.abs(v[1]);
	const az = Math.abs(v[2]);
	const dominant = ax >= ay && ax >= az ? v[0] : ay >= az ? v[1] : v[2];
	return dominant < 0 ? [-v[0], -v[1], -v[2]] : v;
}

function normalize(v: [number, number, number]): [number, number, number] {
	const len = Math.hypot(v[0], v[1], v[2]);
	return len > 1e-12 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
}

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: readonly number[], b: readonly number[]): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

interface TriangleFrame {
	normal: [number, number, number];
	uAxis: [number, number, number];
	vAxis: [number, number, number];
	horizontal: boolean;
}

/**
 * The planar frame for a face: X/Z for floors and ceilings; for walls and slopes U runs horizontally
 * along the face and V up it (true in-plane distance, so slopes aren't foreshortened).
 */
function planarFrame(normal: [number, number, number]): TriangleFrame {
	if (Math.abs(normal[1]) > HORIZONTAL_THRESHOLD) {
		return { normal, uAxis: [1, 0, 0], vAxis: [0, 0, 1], horizontal: true };
	}
	const uAxis = normalize(cross([0, 1, 0], normal));
	const vAxis = normalize(cross(normal, uAxis));
	return { normal, uAxis, vAxis, horizontal: false };
}

/**
 * Timber frame: U along the piece's long axis. For a box face split into two right triangles, the
 * longer of the two legs (the second-longest edge) is the face's long side — identical for both
 * triangles — so posts, rails, braces and boards all get grain along their length regardless of
 * orientation. Non-rectangular triangles fall back to the planar frame.
 */
function grainFrame(
	a: readonly number[],
	b: readonly number[],
	c: readonly number[],
	normal: [number, number, number]
): TriangleFrame {
	const edges: [number, number, number][] = [
		[b[0] - a[0], b[1] - a[1], b[2] - a[2]],
		[c[0] - b[0], c[1] - b[1], c[2] - b[2]],
		[a[0] - c[0], a[1] - c[1], a[2] - c[2]]
	];
	const lengths = edges.map((e) => Math.hypot(e[0], e[1], e[2]));
	const order = [0, 1, 2].sort((i, j) => lengths[j] - lengths[i]);
	const leg1 = order[1];
	const leg2 = order[2];
	const cosine = Math.abs(dot(edges[leg1], edges[leg2])) / (lengths[leg1] * lengths[leg2] || 1);
	if (cosine > RIGHT_ANGLE_TOLERANCE) return planarFrame(normal);
	const uAxis = canonicalize(normalize(edges[leg1]));
	const vAxis = normalize(cross(normal, uAxis));
	return { normal, uAxis, vAxis, horizontal: Math.abs(normal[1]) > HORIZONTAL_THRESHOLD };
}

/** Quantized plane identity: triangles in the same plane share offsets (and, on roofs, an eave). */
function planeKey(normal: readonly number[], point: readonly number[]): [number, number, number] {
	const nx = Math.round(normal[0] * 50);
	const ny = Math.round(normal[1] * 50);
	const nz = Math.round(normal[2] * 50);
	const d = Math.round(dot(normal, point) * 20);
	return [nx * 131 + ny * 17 + nz, d, 0];
}

export function computeSurfaceMapping(input: SurfaceMappingInput): SurfaceMappingOutput {
	const { positions, seed } = input;
	const triangleCount = Math.floor(positions.length / 9);
	const uv = new Float32Array(triangleCount * 6);
	const color = new Float32Array(triangleCount * 9);

	const frames: TriangleFrame[] = new Array(triangleCount);
	const keys: [number, number, number][] = new Array(triangleCount);
	const modes: SurfaceMappingMode[] = new Array(triangleCount);
	const a = [0, 0, 0];
	const b = [0, 0, 0];
	const c = [0, 0, 0];

	// Pass 1: frames and piece keys.
	for (let tri = 0; tri < triangleCount; tri++) {
		const o = tri * 9;
		a[0] = positions[o];
		a[1] = positions[o + 1];
		a[2] = positions[o + 2];
		b[0] = positions[o + 3];
		b[1] = positions[o + 4];
		b[2] = positions[o + 5];
		c[0] = positions[o + 6];
		c[1] = positions[o + 7];
		c[2] = positions[o + 8];
		const normal = normalize(
			cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]])
		);
		const mode = input.modeForTriangle(tri);
		modes[tri] = mode;
		const frame = mode === 'grain' ? grainFrame(a, b, c, normal) : planarFrame(normal);
		frames[tri] = frame;
		const key = planeKey(normal, a);
		if (mode === 'grain') {
			// Parallel beams share a plane (every post's front face lies in the wall's frame plane),
			// so the piece is also identified by its centre ACROSS the grain: both triangles of a face
			// span the same V range, so they agree on it.
			const va = dot(a, frame.vAxis);
			const vb = dot(b, frame.vAxis);
			const vc = dot(c, frame.vAxis);
			const mid = (Math.min(va, vb, vc) + Math.max(va, vb, vc)) / 2;
			key[2] = Math.round(mid * 40);
		}
		keys[tri] = key;
	}

	// Roof planes: V measured from each plane's lowest point, so slate courses start at the eave.
	const eaveMin = new Map<string, number>();
	for (let tri = 0; tri < triangleCount; tri++) {
		if (modes[tri] !== 'roof' || frames[tri].horizontal) continue;
		const id = `${keys[tri][0]}:${keys[tri][1]}`;
		const o = tri * 9;
		let min = eaveMin.get(id) ?? Infinity;
		for (let k = 0; k < 3; k++) {
			const v = dot(
				[positions[o + k * 3], positions[o + k * 3 + 1], positions[o + k * 3 + 2]],
				frames[tri].vAxis
			);
			if (v < min) min = v;
		}
		eaveMin.set(id, min);
	}

	const buildingTint = (hashInts(1, 2, 3, seed) - 0.5) * 0.05;
	const buildingOffsetU = hashInts(4, 5, 6, seed) * 23;
	const buildingOffsetV = hashInts(7, 8, 9, seed) * 23;

	const macroOut = { r: 1, g: 1, b: 1 };

	// Pass 2: UVs and colours.
	for (let tri = 0; tri < triangleCount; tri++) {
		const frame = frames[tri];
		const key = keys[tri];
		const mode = modes[tri];
		const pieceA = hashInts(key[0], key[1], key[2], seed);
		const pieceB = hashInts(key[2], key[0], key[1], seed ^ 0x5bd1e995);

		// Offsets break up tiling between pieces and buildings, but never where alignment matters:
		// masonry courses stay level around a building (no V offset on walls), slate courses stay on
		// the eave (no V offset on roofs).
		let offsetU = buildingOffsetU + pieceA * 17;
		let offsetV = 0;
		if (mode === 'grain' || frame.horizontal) offsetV = buildingOffsetV + pieceB * 13;
		if (mode === 'roof' && !frame.horizontal) {
			offsetV = -(eaveMin.get(`${key[0]}:${key[1]}`) ?? 0);
		}
		if (mode === 'roof') offsetU = buildingOffsetU + pieceA * 7;

		const tint = 1 + buildingTint + (pieceB - 0.5) * (mode === 'grain' ? 0.12 : 0.05);
		// Timber pieces are small and already vary per piece; large surfaces get the macro layer.
		const macro = mode !== 'grain' && input.weathering;
		const o = tri * 9;
		for (let k = 0; k < 3; k++) {
			const px = positions[o + k * 3];
			const py = positions[o + k * 3 + 1];
			const pz = positions[o + k * 3 + 2];
			const vertex = tri * 3 + k;
			uv[vertex * 2] = px * frame.uAxis[0] + py * frame.uAxis[1] + pz * frame.uAxis[2] + offsetU;
			uv[vertex * 2 + 1] =
				px * frame.vAxis[0] + py * frame.vAxis[1] + pz * frame.vAxis[2] + offsetV;

			let r = tint;
			let g = tint;
			let bl = tint;
			if (macro) {
				macroVariation(px, py, pz, seed, macroOut);
				r *= macroOut.r;
				g *= macroOut.g;
				bl *= macroOut.b;
			}
			if (input.weathering && !frame.horizontal) {
				// Ground grime and damp: vertical surfaces darken (and warm slightly) toward the
				// foundation top (anchor y = 0) and below it.
				const grime = 1 - smoothstep01((py + 0.3) / 1.8);
				r *= 1 - grime * 0.13;
				g *= 1 - grime * 0.15;
				bl *= 1 - grime * 0.19;
			}
			color[vertex * 3] = r;
			color[vertex * 3 + 1] = g;
			color[vertex * 3 + 2] = bl;
		}
	}

	return { uv, color };
}

/** Non-periodic 3D value noise in [0, 1] — macro variation must NOT repeat with the texture tile. */
function valueNoise3(x: number, y: number, z: number, seed: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);
	const fx = x - ix;
	const fy = y - iy;
	const fz = z - iz;
	const ux = fx * fx * (3 - 2 * fx);
	const uy = fy * fy * (3 - 2 * fy);
	const uz = fz * fz * (3 - 2 * fz);
	const corner = (dx: number, dy: number, dz: number) => hashInts(ix + dx, iy + dy, iz + dz, seed);
	const x00 = corner(0, 0, 0) + (corner(1, 0, 0) - corner(0, 0, 0)) * ux;
	const x10 = corner(0, 1, 0) + (corner(1, 1, 0) - corner(0, 1, 0)) * ux;
	const x01 = corner(0, 0, 1) + (corner(1, 0, 1) - corner(0, 0, 1)) * ux;
	const x11 = corner(0, 1, 1) + (corner(1, 1, 1) - corner(0, 1, 1)) * ux;
	const y0 = x00 + (x10 - x00) * uy;
	const y1 = x01 + (x11 - x01) * uy;
	return y0 + (y1 - y0) * uz;
}

/**
 * Low-frequency, building-seeded colour variation (two octaves, ~4 m and ~1.5 m) — the anti-tiling
 * layer. A texture tile is a few metres across and repeats exactly; multiplying it by variation that
 * never repeats (and differs per building) stops a long wall or a big courtyard reading as a grid of
 * identical tiles. Returns per-channel multipliers around 1, plus a dirt amount.
 */
export function macroVariation(
	x: number,
	y: number,
	z: number,
	seed: number,
	out: { r: number; g: number; b: number }
): void {
	const broad = valueNoise3(x / 4.2, y / 4.2, z / 4.2, seed);
	const detail = valueNoise3(x / 1.4, y / 1.4, z / 1.4, seed ^ 0x2545f491);
	const warmth = valueNoise3(x / 6.5 + 17, y / 6.5, z / 6.5 - 9, seed ^ 0x68e31da4);
	const patch = Math.max(0, broad * 0.65 + detail * 0.35 - 0.55) / 0.45;
	const value = 1 + (broad - 0.5) * 0.16 + (detail - 0.5) * 0.08 - patch * patch * 0.14;
	const shift = (warmth - 0.5) * 0.06;
	out.r = value * (1 + shift);
	out.g = value;
	out.b = value * (1 - shift * 1.4);
}

function smoothstep01(x: number): number {
	const t = x < 0 ? 0 : x > 1 ? 1 : x;
	return t * t * (3 - 2 * t);
}
