import type { TreeMeshData } from './TreeSpeciesTypes';

/**
 * Low-level, framework-free mesh primitives for stylised trees. Every primitive writes positions,
 * normals, LINEAR vertex colours and a wind weight into one `TreeMeshBuilder`, so a whole tree —
 * trunk and foliage — is a single indexed mesh drawn with a single shared material.
 */

export type Vec3 = [number, number, number];
export type Rgb = [number, number, number];

/** `#RRGGBB` (sRGB) → linear RGB, matching three's colour management (vertex colours are linear). */
export function hexToLinear(hex: string): Rgb {
	const value = Number.parseInt(hex.replace('#', ''), 16);
	const channel = (c: number) => {
		const s = c / 255;
		return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return [channel((value >> 16) & 255), channel((value >> 8) & 255), channel(value & 255)];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
	const k = t < 0 ? 0 : t > 1 ? 1 : t;
	return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function smooth01(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

function hashInts(x: number, y: number, z: number, seed: number): number {
	let h = seed | 0;
	h = Math.imul(h ^ x, 0x27d4eb2d);
	h = Math.imul(h ^ y, 0x165667b1);
	h = Math.imul(h ^ z, 0x85ebca6b);
	h ^= h >>> 15;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 13;
	return (h >>> 0) / 4294967296;
}

/** Smooth 3D value noise in [0, 1] — deterministic per seed; used for foliage lumps. */
export function valueNoise3(x: number, y: number, z: number, seed: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);
	const fx = x - ix;
	const fy = y - iy;
	const fz = z - iz;
	const ux = fx * fx * (3 - 2 * fx);
	const uy = fy * fy * (3 - 2 * fy);
	const uz = fz * fz * (3 - 2 * fz);
	const c = (dx: number, dy: number, dz: number) => hashInts(ix + dx, iy + dy, iz + dz, seed);
	const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * ux;
	const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * ux;
	const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * ux;
	const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * ux;
	const y0 = x00 + (x10 - x00) * uy;
	const y1 = x01 + (x11 - x01) * uy;
	return y0 + (y1 - y0) * uz;
}

function normalize(v: Vec3): Vec3 {
	const len = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / len, v[1] / len, v[2] / len];
}

/** Per-vertex shading inputs a primitive asks its caller for. */
export interface VertexShade {
	color: Rgb;
	wind: number;
}

export class TreeMeshBuilder {
	private readonly positions: number[] = [];
	private readonly normals: number[] = [];
	private readonly colors: number[] = [];
	private readonly wind: number[] = [];
	private readonly indices: number[] = [];

	get vertexCount(): number {
		return this.positions.length / 3;
	}

	addVertex(position: Vec3, normal: Vec3, shade: VertexShade): number {
		const index = this.vertexCount;
		this.positions.push(position[0], position[1], position[2]);
		const n = normalize(normal);
		this.normals.push(n[0], n[1], n[2]);
		this.colors.push(shade.color[0], shade.color[1], shade.color[2]);
		this.wind.push(shade.wind);
		return index;
	}

	addTriangle(a: number, b: number, c: number): void {
		this.indices.push(a, b, c);
	}

	build(): TreeMeshData {
		const positions = new Float32Array(this.positions);
		const min: [number, number, number] = [Infinity, Infinity, Infinity];
		const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
		for (let i = 0; i < positions.length; i += 3) {
			for (let k = 0; k < 3; k++) {
				if (positions[i + k] < min[k]) min[k] = positions[i + k];
				if (positions[i + k] > max[k]) max[k] = positions[i + k];
			}
		}
		return {
			positions,
			normals: new Float32Array(this.normals),
			colors: new Float32Array(this.colors),
			wind: new Float32Array(this.wind),
			indices: new Uint32Array(this.indices),
			min,
			max
		};
	}
}

/** One point on a tube's centre line. */
export interface TubePoint {
	position: Vec3;
	radius: number;
}

/**
 * A tapered, low-sided tube along a polyline (trunks, branches). Open at both ends: the base sits
 * below ground and the top disappears into foliage, so caps would be invisible triangles.
 * `shade(t, side)` gets the fraction along the tube (0 base … 1 top) and the side angle.
 */
export function addTube(
	builder: TreeMeshBuilder,
	path: readonly TubePoint[],
	sides: number,
	shade: (t: number, angle: number, position: Vec3) => VertexShade,
	angleOffset = 0
): void {
	const rings: number[][] = [];
	for (let i = 0; i < path.length; i++) {
		const point = path[i];
		const next = path[Math.min(path.length - 1, i + 1)];
		const prev = path[Math.max(0, i - 1)];
		const axis = normalize([
			next.position[0] - prev.position[0],
			next.position[1] - prev.position[1],
			next.position[2] - prev.position[2]
		]);
		// Build a frame perpendicular to the axis.
		const ref: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
		const u = normalize([
			axis[1] * ref[2] - axis[2] * ref[1],
			axis[2] * ref[0] - axis[0] * ref[2],
			axis[0] * ref[1] - axis[1] * ref[0]
		]);
		const v: Vec3 = [
			axis[1] * u[2] - axis[2] * u[1],
			axis[2] * u[0] - axis[0] * u[2],
			axis[0] * u[1] - axis[1] * u[0]
		];
		const t = path.length === 1 ? 0 : i / (path.length - 1);
		const ring: number[] = [];
		for (let s = 0; s < sides; s++) {
			const angle = angleOffset + (s / sides) * Math.PI * 2;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			const normal: Vec3 = [
				u[0] * cos + v[0] * sin,
				u[1] * cos + v[1] * sin,
				u[2] * cos + v[2] * sin
			];
			const position: Vec3 = [
				point.position[0] + normal[0] * point.radius,
				point.position[1] + normal[1] * point.radius,
				point.position[2] + normal[2] * point.radius
			];
			ring.push(builder.addVertex(position, normal, shade(t, angle, position)));
		}
		rings.push(ring);
	}
	for (let i = 0; i < rings.length - 1; i++) {
		for (let s = 0; s < sides; s++) {
			const a = rings[i][s];
			const b = rings[i][(s + 1) % sides];
			const c = rings[i + 1][s];
			const d = rings[i + 1][(s + 1) % sides];
			builder.addTriangle(a, b, c);
			builder.addTriangle(b, d, c);
		}
	}
}

/** Unit icosphere (subdivision `detail`): 20 × 4^detail triangles. Cached per detail. */
const icosphereCache = new Map<number, { vertices: Vec3[]; faces: [number, number, number][] }>();

export function unitIcosphere(detail: number): {
	vertices: Vec3[];
	faces: [number, number, number][];
} {
	const cached = icosphereCache.get(detail);
	if (cached) return cached;
	const t = (1 + Math.sqrt(5)) / 2;
	let vertices: Vec3[] = [
		[-1, t, 0],
		[1, t, 0],
		[-1, -t, 0],
		[1, -t, 0],
		[0, -1, t],
		[0, 1, t],
		[0, -1, -t],
		[0, 1, -t],
		[t, 0, -1],
		[t, 0, 1],
		[-t, 0, -1],
		[-t, 0, 1]
	].map((v) => normalize(v as Vec3));
	let faces: [number, number, number][] = [
		[0, 11, 5],
		[0, 5, 1],
		[0, 1, 7],
		[0, 7, 10],
		[0, 10, 11],
		[1, 5, 9],
		[5, 11, 4],
		[11, 10, 2],
		[10, 7, 6],
		[7, 1, 8],
		[3, 9, 4],
		[3, 4, 2],
		[3, 2, 6],
		[3, 6, 8],
		[3, 8, 9],
		[4, 9, 5],
		[2, 4, 11],
		[6, 2, 10],
		[8, 6, 7],
		[9, 8, 1]
	];
	for (let d = 0; d < detail; d++) {
		const midCache = new Map<string, number>();
		const nextVertices = vertices.slice();
		const midpoint = (a: number, b: number) => {
			const key = a < b ? `${a}:${b}` : `${b}:${a}`;
			const existing = midCache.get(key);
			if (existing !== undefined) return existing;
			const va = vertices[a];
			const vb = vertices[b];
			const index = nextVertices.length;
			nextVertices.push(normalize([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]));
			midCache.set(key, index);
			return index;
		};
		const nextFaces: [number, number, number][] = [];
		for (const [a, b, c] of faces) {
			const ab = midpoint(a, b);
			const bc = midpoint(b, c);
			const ca = midpoint(c, a);
			nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
		}
		vertices = nextVertices;
		faces = nextFaces;
	}
	const result = { vertices, faces };
	icosphereCache.set(detail, result);
	return result;
}

export interface BlobOptions {
	center: Vec3;
	radii: Vec3;
	detail: number;
	/** Surface lumpiness as a fraction of radius. */
	lumpiness: number;
	seed: number;
	/**
	 * The whole canopy's centre and radii. Normals are blended toward the direction from this
	 * centre, so many clusters shade as one soft volume — the key to the stylised look.
	 */
	canopyCenter: Vec3;
	canopyRadii: Vec3;
	/** 0 = cluster's own normals, 1 = canopy-volume normals. */
	normalBlend: number;
	shade: (position: Vec3, outward: number) => VertexShade;
}

/** A lumpy, squashed icosphere foliage cluster. */
export function addBlob(builder: TreeMeshBuilder, options: BlobOptions): void {
	const sphere = unitIcosphere(options.detail);
	const { center, radii, lumpiness, seed, canopyCenter, canopyRadii } = options;
	const indexOf: number[] = [];
	const displaced: Vec3[] = sphere.vertices.map((v) => {
		const lump =
			1 + (valueNoise3(v[0] * 1.7 + 3.1, v[1] * 1.7, v[2] * 1.7 - 2.3, seed) - 0.5) * 2 * lumpiness;
		return [
			center[0] + v[0] * radii[0] * lump,
			center[1] + v[1] * radii[1] * lump,
			center[2] + v[2] * radii[2] * lump
		];
	});
	// Smooth per-vertex normals of the displaced cluster (ellipsoid-corrected).
	const ownNormals: Vec3[] = sphere.vertices.map((v) =>
		normalize([v[0] / radii[0], v[1] / radii[1], v[2] / radii[2]])
	);
	sphere.vertices.forEach((_, i) => {
		const p = displaced[i];
		const toCanopy = normalize([
			(p[0] - canopyCenter[0]) / (canopyRadii[0] * canopyRadii[0]),
			(p[1] - canopyCenter[1]) / (canopyRadii[1] * canopyRadii[1]),
			(p[2] - canopyCenter[2]) / (canopyRadii[2] * canopyRadii[2])
		]);
		const own = ownNormals[i];
		const k = options.normalBlend;
		const normal: Vec3 = [
			own[0] * (1 - k) + toCanopy[0] * k,
			own[1] * (1 - k) + toCanopy[1] * k,
			own[2] * (1 - k) + toCanopy[2] * k
		];
		const dx = (p[0] - canopyCenter[0]) / canopyRadii[0];
		const dy = (p[1] - canopyCenter[1]) / canopyRadii[1];
		const dz = (p[2] - canopyCenter[2]) / canopyRadii[2];
		const outward = Math.min(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
		indexOf[i] = builder.addVertex(p, normal, options.shade(p, outward));
	});
	for (const [a, b, c] of sphere.faces) builder.addTriangle(indexOf[a], indexOf[b], indexOf[c]);
}

export interface TierOptions {
	/** Y of the tier's rim (before droop) and apex. */
	baseY: number;
	apexY: number;
	radius: number;
	/** Rim points (the jagged rim alternates full and notched radius, so 2 × points rim vertices). */
	points: number;
	rimNotch: number;
	droop: number;
	/** Add a mid ring for a curved (convex) tier profile. */
	midRing: boolean;
	rotation: number;
	/** Horizontal offset of the tier centre (trunk lean). */
	offset: [number, number];
	shade: (position: Vec3, outward: number, underside: boolean) => VertexShade;
}

/** One conifer tier: a jagged, drooping cone with a shallow underside. */
export function addTier(builder: TreeMeshBuilder, options: TierOptions): void {
	const { baseY, apexY, radius, points, rimNotch, droop, rotation, offset } = options;
	const rimCount = points * 2;
	const height = apexY - baseY;
	const apex: Vec3 = [offset[0], apexY, offset[1]];
	const apexIndex = builder.addVertex(apex, [0, 1, 0], options.shade(apex, 0, false));

	const ringAt = (fraction: number, yOf: (notch: boolean) => number, underside: boolean) => {
		const ring: number[] = [];
		for (let i = 0; i < rimCount; i++) {
			const notch = i % 2 === 1;
			const angle = rotation + (i / rimCount) * Math.PI * 2;
			const r = radius * fraction * (notch ? rimNotch : 1);
			const position: Vec3 = [
				offset[0] + Math.cos(angle) * r,
				yOf(notch),
				offset[1] + Math.sin(angle) * r
			];
			const slope = radius / Math.max(0.01, height);
			const normal: Vec3 = underside
				? [Math.cos(angle) * 0.75, -0.55, Math.sin(angle) * 0.75]
				: [Math.cos(angle), slope * 0.9, Math.sin(angle)];
			ring.push(builder.addVertex(position, normal, options.shade(position, fraction, underside)));
		}
		return ring;
	};

	const rimY = (notch: boolean) => baseY - (notch ? droop * 0.55 : droop);
	let inner: number[] | null = null;
	if (options.midRing) {
		inner = ringAt(0.55, () => baseY + height * 0.42, false);
		for (let i = 0; i < rimCount; i++) {
			builder.addTriangle(apexIndex, inner[(i + 1) % rimCount], inner[i]);
		}
	}
	const rim = ringAt(1, rimY, false);
	if (inner) {
		for (let i = 0; i < rimCount; i++) {
			const a = inner[i];
			const b = inner[(i + 1) % rimCount];
			const c = rim[i];
			const d = rim[(i + 1) % rimCount];
			builder.addTriangle(a, b, c);
			builder.addTriangle(b, d, c);
		}
	} else {
		for (let i = 0; i < rimCount; i++)
			builder.addTriangle(apexIndex, rim[(i + 1) % rimCount], rim[i]);
	}
	// Shallow underside back to the trunk, so the tier reads as a solid skirt from below.
	const under: Vec3 = [offset[0], baseY + height * 0.18, offset[1]];
	const underRim = ringAt(1, rimY, true);
	const underIndex = builder.addVertex(under, [0, -1, 0], options.shade(under, 0, true));
	for (let i = 0; i < rimCount; i++)
		builder.addTriangle(underIndex, underRim[i], underRim[(i + 1) % rimCount]);
}

export interface LatheOptions {
	/** Profile from bottom to top: y and radius. */
	profile: readonly { y: number; radius: number }[];
	sides: number;
	lumpiness: number;
	seed: number;
	offset: [number, number];
	/** Closes the top with a point at this y (and the bottom with a flat fan). */
	apexY: number;
	shade: (position: Vec3, t: number, outward: Vec3) => VertexShade;
}

/** A lathed, lumpy spindle (cypress-like canopies and far silhouettes). */
export function addLathe(builder: TreeMeshBuilder, options: LatheOptions): void {
	const { profile, sides, lumpiness, seed, offset, apexY } = options;
	const minY = profile[0].y;
	const span = Math.max(0.01, apexY - minY);
	const rings: number[][] = [];
	profile.forEach((point, ringIndex) => {
		const ring: number[] = [];
		const prev = profile[Math.max(0, ringIndex - 1)];
		const next = profile[Math.min(profile.length - 1, ringIndex + 1)];
		const dr = next.radius - prev.radius;
		const dy = Math.max(0.01, next.y - prev.y);
		for (let s = 0; s < sides; s++) {
			const angle = (s / sides) * Math.PI * 2 + ringIndex * 0.37;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			const lump =
				1 + (valueNoise3(cos * 1.3, point.y * 0.9, sin * 1.3, seed) - 0.5) * 2 * lumpiness;
			const r = point.radius * lump;
			const position: Vec3 = [offset[0] + cos * r, point.y, offset[1] + sin * r];
			const normal = normalize([cos, -dr / dy, sin]);
			ring.push(
				builder.addVertex(
					position,
					normal,
					options.shade(position, (point.y - minY) / span, normal)
				)
			);
		}
		rings.push(ring);
	});
	for (let i = 0; i < rings.length - 1; i++) {
		for (let s = 0; s < sides; s++) {
			const a = rings[i][s];
			const b = rings[i][(s + 1) % sides];
			const c = rings[i + 1][s];
			const d = rings[i + 1][(s + 1) % sides];
			builder.addTriangle(a, c, b);
			builder.addTriangle(b, c, d);
		}
	}
	const top: Vec3 = [offset[0], apexY, offset[1]];
	const topIndex = builder.addVertex(top, [0, 1, 0], options.shade(top, 1, [0, 1, 0]));
	const last = rings[rings.length - 1];
	for (let s = 0; s < sides; s++) builder.addTriangle(last[s], topIndex, last[(s + 1) % sides]);
	const bottom: Vec3 = [offset[0], minY, offset[1]];
	const bottomIndex = builder.addVertex(bottom, [0, -1, 0], options.shade(bottom, 0, [0, -1, 0]));
	const first = rings[0];
	for (let s = 0; s < sides; s++)
		builder.addTriangle(first[(s + 1) % sides], bottomIndex, first[s]);
}
