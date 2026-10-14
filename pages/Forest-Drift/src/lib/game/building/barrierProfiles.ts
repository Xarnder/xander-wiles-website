/**
 * Low-poly member prototypes for fences and railings: square/chamfered/tapered posts and
 * balusters, procedurally turned (lathed) balusters and newel posts, and post caps. Pure — no
 * Three.js — and cached by `BarrierGeometryCompiler` per (style, dimensions, LOD), so a railing with
 * 200 identical turned balusters runs the lathe once.
 *
 * Every vertex height is stored as `y = yA · h + yB`, where `h` is the member's own height, so ONE
 * prototype serves every length: decorative blocks stay a fixed size at the ends (`yA` 0 or 1) while
 * the turned shaft between them stretches (`yA` a fraction). Balusters on a slope all have different
 * heights and still share one prototype.
 *
 * Local frame: +X runs along the path, +Z across it, +Y up; the member's footprint is centred on
 * the origin. Silhouette matters far more than polygon count — turned parts use 6–10 sides.
 */

import type { BarrierBalusterStyle, BarrierPostCap, BarrierPostProfile } from './BarrierTypes';

export type BarrierLod = 0 | 1 | 2;

export interface BarrierPrototype {
	/** Local X/Z (metres) per vertex; Y comes from `yA · h + yB`. */
	xz: Float32Array;
	yA: Float32Array;
	yB: Float32Array;
	normals: Float32Array;
	indices: number[];
	vertexCount: number;
}

type Vec2 = readonly [number, number];

/** One loft ring: height anchor plus the section's scale on X and Z. */
interface Ring {
	yA: number;
	yB: number;
	sx: number;
	sz: number;
}

/** Height used for normal estimates only — real members stretch around it. */
const NOMINAL_HEIGHT = 1;

class PrototypeBuilder {
	private readonly xz: number[] = [];
	private readonly yA: number[] = [];
	private readonly yB: number[] = [];
	private readonly normals: number[] = [];
	private readonly indices: number[] = [];

	private vertex(x: number, z: number, ya: number, yb: number, nx: number, ny: number, nz: number) {
		const len = Math.hypot(nx, ny, nz) || 1;
		this.xz.push(x, z);
		this.yA.push(ya);
		this.yB.push(yb);
		this.normals.push(nx / len, ny / len, nz / len);
		return this.yA.length - 1;
	}

	/**
	 * Extrudes `section` (a closed polygon in unit X/Z, see `SQUARE`) through `rings`. `smooth` shares ring
	 * vertices and uses radial normals (turned work); otherwise every side is its own flat quad.
	 */
	loft(
		section: readonly Vec2[],
		rings: readonly Ring[],
		smooth: boolean,
		capBottom: boolean,
		capTop: boolean
	): void {
		const m = section.length;
		const ringY = (r: Ring) => r.yA * NOMINAL_HEIGHT + r.yB;
		if (smooth) {
			const base: number[] = [];
			for (let k = 0; k < rings.length; k++) {
				const ring = rings[k];
				const prev = rings[Math.max(0, k - 1)];
				const next = rings[Math.min(rings.length - 1, k + 1)];
				const dy = ringY(next) - ringY(prev);
				const dr = (next.sx + next.sz - prev.sx - prev.sz) / 2;
				const slope = Math.abs(dy) > 1e-6 ? -dr / dy : 0;
				base.push(this.yA.length);
				for (const [sx, sz] of section) {
					const rlen = Math.hypot(sx, sz) || 1;
					this.vertex(sx * ring.sx, sz * ring.sz, ring.yA, ring.yB, sx / rlen, slope, sz / rlen);
				}
			}
			for (let k = 0; k < rings.length - 1; k++) {
				for (let i = 0; i < m; i++) {
					const a = base[k] + i;
					const b = base[k] + ((i + 1) % m);
					const c = base[k + 1] + ((i + 1) % m);
					const d = base[k + 1] + i;
					this.indices.push(a, b, c, a, c, d);
				}
			}
		} else {
			for (let k = 0; k < rings.length - 1; k++) {
				const r0 = rings[k];
				const r1 = rings[k + 1];
				for (let i = 0; i < m; i++) {
					const [x0, z0] = section[i];
					const [x1, z1] = section[(i + 1) % m];
					// Face normal from the nominal quad.
					const ax = x0 * r0.sx;
					const az = z0 * r0.sz;
					const bx = x1 * r0.sx;
					const bz = z1 * r0.sz;
					const cx = x1 * r1.sx;
					const cz = z1 * r1.sz;
					const ay = ringY(r0);
					const cy = ringY(r1);
					const e1 = [bx - ax, 0, bz - az];
					const e2 = [cx - ax, cy - ay, cz - az];
					const nx = e1[1] * e2[2] - e1[2] * e2[1];
					const ny = e1[2] * e2[0] - e1[0] * e2[2];
					const nz = e1[0] * e2[1] - e1[1] * e2[0];
					// Outward: the section is CCW seen from +Y, so flip if pointing inwards.
					const mx = (ax + bx) / 2;
					const mz = (az + bz) / 2;
					const sign = nx * mx + nz * mz < 0 ? -1 : 1;
					const a = this.vertex(ax, az, r0.yA, r0.yB, nx * sign, ny * sign, nz * sign);
					const b = this.vertex(bx, bz, r0.yA, r0.yB, nx * sign, ny * sign, nz * sign);
					const c = this.vertex(cx, cz, r1.yA, r1.yB, nx * sign, ny * sign, nz * sign);
					const d = this.vertex(
						x0 * r1.sx,
						z0 * r1.sz,
						r1.yA,
						r1.yB,
						nx * sign,
						ny * sign,
						nz * sign
					);
					// (a, b, c) winds counter-clockwise around the unflipped normal.
					if (sign > 0) this.indices.push(a, b, c, a, c, d);
					else this.indices.push(a, c, b, a, d, c);
				}
			}
		}
		if (capBottom) this.cap(section, rings[0], -1);
		if (capTop) this.cap(section, rings[rings.length - 1], 1);
	}

	private cap(section: readonly Vec2[], ring: Ring, ny: number): void {
		if (ring.sx < 1e-4 && ring.sz < 1e-4) return;
		const first = this.yA.length;
		for (const [sx, sz] of section)
			this.vertex(sx * ring.sx, sz * ring.sz, ring.yA, ring.yB, 0, ny, 0);
		for (let i = 1; i < section.length - 1; i++) {
			// Sections run clockwise seen from above, so (0, i, i+1) faces up; the bottom cap is reversed.
			if (ny > 0) this.indices.push(first, first + i, first + i + 1);
			else this.indices.push(first, first + i + 1, first + i);
		}
	}

	/** An axis-aligned block from `y0` to `y1` (each `[yA, yB]`), half-sizes `hx`/`hz`. */
	box(hx: number, hz: number, y0: readonly [number, number], y1: readonly [number, number]): void {
		this.loft(
			SQUARE,
			[
				{ yA: y0[0], yB: y0[1], sx: hx, sz: hz },
				{ yA: y1[0], yB: y1[1], sx: hx, sz: hz }
			],
			false,
			true,
			true
		);
	}

	build(): BarrierPrototype {
		return {
			xz: new Float32Array(this.xz),
			yA: new Float32Array(this.yA),
			yB: new Float32Array(this.yB),
			normals: new Float32Array(this.normals),
			indices: this.indices,
			vertexCount: this.yA.length
		};
	}
}

/** Unit sections, all wound the same way (clockwise seen from +Y with +Z towards the viewer). */
const SQUARE: readonly Vec2[] = [
	[1, 1],
	[1, -1],
	[-1, -1],
	[-1, 1]
];

function chamferedSquare(c = 0.28): Vec2[] {
	return [
		[1, 1 - c],
		[1, -1 + c],
		[1 - c, -1],
		[-1 + c, -1],
		[-1, -1 + c],
		[-1, 1 - c],
		[-1 + c, 1],
		[1 - c, 1]
	];
}

function circle(sides: number): Vec2[] {
	const out: Vec2[] = [];
	for (let i = 0; i < sides; i++) {
		const a = -((i + 0.5) / sides) * Math.PI * 2;
		out.push([Math.cos(a), Math.sin(a)]);
	}
	return out;
}

/** A turned shaft between two absolute heights: `profile` is [fraction, radius] pairs. */
function turnedRings(
	from: number,
	toFromTop: number,
	profile: readonly (readonly [number, number])[],
	hx: number,
	hz: number
): Ring[] {
	// y = from + f · (h − from − toFromTop)  →  yA = f, yB = from − f · (from + toFromTop)
	return profile.map(([f, r]) => ({
		yA: f,
		yB: from - f * (from + toFromTop),
		sx: r * hx,
		sz: r * hz
	}));
}

function thin<T>(list: readonly T[], keepEvery: number): T[] {
	if (keepEvery <= 1 || list.length <= 3) return [...list];
	return list.filter((_, i) => i === 0 || i === list.length - 1 || i % keepEvery === 0);
}

const BALUSTER_VASE: readonly (readonly [number, number])[] = [
	[0, 0.7],
	[0.03, 0.88],
	[0.07, 0.6],
	[0.27, 0.9],
	[0.47, 0.6],
	[0.76, 0.42],
	[0.92, 0.56],
	[0.97, 0.82],
	[1, 0.64]
];

const NEWEL_TURNING: readonly (readonly [number, number])[] = [
	[0, 0.78],
	[0.04, 0.92],
	[0.09, 0.66],
	[0.36, 0.88],
	[0.62, 0.6],
	[0.86, 0.52],
	[0.95, 0.8],
	[1, 0.7]
];

const POST_TURNING: readonly (readonly [number, number])[] = [
	[0, 0.82],
	[0.05, 0.92],
	[0.1, 0.72],
	[0.9, 0.72],
	[0.95, 0.92],
	[1, 0.82]
];

/** Post body (no cap). `width` is the footprint side. */
export function buildPostPrototype(
	profile: BarrierPostProfile,
	width: number,
	lod: BarrierLod
): BarrierPrototype {
	const b = new PrototypeBuilder();
	const h = width / 2;
	if (lod === 2) {
		b.box(h, h, [0, 0], [1, 0]);
		return b.build();
	}
	const sides = lod === 0 ? 10 : 6;
	switch (profile) {
		case 'square':
			b.box(h, h, [0, 0], [1, 0]);
			break;
		case 'chamfered':
			b.loft(
				chamferedSquare(),
				[
					{ yA: 0, yB: 0, sx: h, sz: h },
					{ yA: 1, yB: 0, sx: h, sz: h }
				],
				false,
				true,
				true
			);
			break;
		case 'tapered':
			b.loft(
				SQUARE,
				[
					{ yA: 0, yB: 0, sx: h, sz: h },
					{ yA: 1, yB: 0, sx: h * 0.8, sz: h * 0.8 }
				],
				false,
				true,
				true
			);
			break;
		case 'turned': {
			b.box(h, h, [0, 0], [0, 0.2]);
			b.loft(
				circle(sides),
				turnedRings(0.2, 0.12, thin(POST_TURNING, lod === 0 ? 1 : 2), h, h),
				true,
				false,
				false
			);
			b.box(h, h, [1, -0.12], [1, 0]);
			break;
		}
		case 'classic-newel': {
			b.box(h * 1.12, h * 1.12, [0, 0], [0, 0.05]);
			b.box(h, h, [0, 0.05], [0, 0.34]);
			b.loft(
				circle(sides),
				turnedRings(0.34, 0.22, thin(NEWEL_TURNING, lod === 0 ? 1 : 2), h, h),
				true,
				false,
				false
			);
			b.box(h, h, [1, -0.22], [1, 0]);
			break;
		}
	}
	return b.build();
}

/** One baluster/picket. `width` along the path, `depth` across it. */
export function buildBalusterPrototype(
	style: Exclude<BarrierBalusterStyle, 'none'>,
	width: number,
	depth: number,
	lod: BarrierLod
): BarrierPrototype {
	const b = new PrototypeBuilder();
	const hx = width / 2;
	const hz = depth / 2;
	switch (lod === 2 ? 'square' : style) {
		case 'square':
		case 'slender':
			b.box(hx, hz, [0, 0], [1, 0]);
			break;
		case 'tapered':
			// Pickets narrow to a point at the top.
			b.loft(
				SQUARE,
				[
					{ yA: 0, yB: 0, sx: hx, sz: hz },
					{ yA: 1, yB: -Math.min(0.08, width * 1.2), sx: hx * 0.9, sz: hz },
					{ yA: 1, yB: 0, sx: hx * 0.12, sz: hz }
				],
				false,
				true,
				true
			);
			break;
		case 'chamfered':
			b.loft(
				chamferedSquare(0.3),
				[
					{ yA: 0, yB: 0, sx: hx, sz: hz },
					{ yA: 1, yB: 0, sx: hx, sz: hz }
				],
				false,
				true,
				true
			);
			break;
		case 'turned': {
			// Past ~20 m a turned baluster is a few pixels wide: a slimmed box reads the same.
			if (lod === 1) {
				b.box(hx * 0.8, hz * 0.8, [0, 0], [1, 0]);
				break;
			}
			b.box(hx, hz, [0, 0], [0, 0.09]);
			b.loft(circle(8), turnedRings(0.09, 0.07, BALUSTER_VASE, hx, hz), true, false, false);
			b.box(hx, hz, [1, -0.07], [1, 0]);
			break;
		}
	}
	return b.build();
}

/**
 * A post cap sitting on the post top (`y = 0` here; every ring uses `yA = 0`). Sized from the post
 * width so caps scale with their post.
 */
export function buildCapPrototype(
	cap: BarrierPostCap,
	postWidth: number,
	lod: BarrierLod
): BarrierPrototype {
	const b = new PrototypeBuilder();
	const w = postWidth;
	const h = w / 2;
	const at = (y: number) => [0, y] as const;
	const plate = (scale: number, thickness: number) =>
		b.box(h * scale, h * scale, at(0), at(thickness));
	if (lod === 2) {
		plate(1.15, w * 0.14);
		return b.build();
	}
	const sides = lod === 0 ? 10 : 6;
	switch (cap) {
		case 'flat':
			plate(1.25, w * 0.18);
			break;
		case 'bevelled':
			b.loft(
				SQUARE,
				[
					{ yA: 0, yB: 0, sx: h * 1.2, sz: h * 1.2 },
					{ yA: 0, yB: w * 0.12, sx: h * 1.2, sz: h * 1.2 },
					{ yA: 0, yB: w * 0.3, sx: h * 0.82, sz: h * 0.82 }
				],
				false,
				true,
				true
			);
			break;
		case 'pyramid':
			plate(1.15, w * 0.12);
			b.loft(
				SQUARE,
				[
					{ yA: 0, yB: w * 0.12, sx: h * 1.05, sz: h * 1.05 },
					{ yA: 0, yB: w * 0.62, sx: h * 0.02, sz: h * 0.02 }
				],
				false,
				false,
				false
			);
			break;
		case 'ball': {
			plate(1.12, w * 0.12);
			const lat = lod === 0 ? 7 : 4;
			const rings: Ring[] = [
				{ yA: 0, yB: w * 0.12, sx: h * 0.42, sz: h * 0.42 },
				{ yA: 0, yB: w * 0.2, sx: h * 0.34, sz: h * 0.34 }
			];
			// A sphere from 60° below its equator (where it sits on the neck) up to the pole.
			const r = h * 0.86;
			const cy = w * 0.2 + r * Math.sin(Math.PI / 3);
			for (let i = 0; i <= lat; i++) {
				const a = -Math.PI / 3 + (i / lat) * (Math.PI / 2 + Math.PI / 3);
				const rr = Math.max(0.0005, Math.cos(a) * r);
				rings.push({ yA: 0, yB: cy + Math.sin(a) * r, sx: rr, sz: rr });
			}
			b.loft(circle(sides), rings, true, false, true);
			break;
		}
		case 'turned': {
			plate(1.18, w * 0.14);
			const profile: [number, number][] = [
				[w * 0.14, 0.78],
				[w * 0.22, 0.86],
				[w * 0.3, 0.5],
				[w * 0.62, 0.7],
				[w * 0.86, 0.36],
				[w * 1.0, 0.44],
				[w * 1.22, 0.16],
				[w * 1.35, 0.01]
			];
			const used = lod === 0 ? profile : thin(profile, 2);
			b.loft(
				circle(sides),
				used.map(([y, r]) => ({ yA: 0, yB: y, sx: r * h, sz: r * h })),
				true,
				false,
				true
			);
			break;
		}
	}
	return b.build();
}

/** True when LOD1 would actually differ from LOD0 for this style (lathes, caps, round rails). */
export function styleHasFineDetail(input: {
	postProfiles: readonly BarrierPostProfile[];
	caps: readonly (BarrierPostCap | null)[];
	baluster: BarrierBalusterStyle;
	railProfile: string;
}): boolean {
	return (
		input.baluster === 'turned' ||
		input.postProfiles.some((p) => p === 'turned' || p === 'classic-newel') ||
		input.caps.some((c) => c === 'ball' || c === 'turned') ||
		input.railProfile === 'rounded'
	);
}
