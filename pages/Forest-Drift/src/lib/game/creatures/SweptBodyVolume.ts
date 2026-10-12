import { CatmullRomCurve3, Vector3 } from 'three';
import type {
	BodyVolumeDefinition,
	CreatureLod,
	CreaturePart,
	CrossSection,
	Vec3,
	VolumeDetail
} from './CreatureTypes';

/** [bone index, weight] pairs; normalised and padded to four slots when written. */
export type SkinInfluence = [number, number][];
export interface RegionInfo {
	part: CreaturePart;
	/** Feature kind, foot type, limb id… used for colour blocking. */
	kind: string;
}
export interface GeometryAccumulator {
	positions: number[];
	indices: number[];
	skinIndices: number[];
	skinWeights: number[];
	uvs: number[];
	/** Per-vertex index into `regions`. */
	region: number[];
	/** Per-vertex position along its part, 0 = root/base, 1 = tip. */
	params: number[];
	regions: RegionInfo[];
}
export const geometryAccumulator = (): GeometryAccumulator => ({
	positions: [],
	indices: [],
	skinIndices: [],
	skinWeights: [],
	uvs: [],
	region: [],
	params: [],
	regions: []
});
export function regionIndex(out: GeometryAccumulator, part: CreaturePart, kind = ''): number {
	let n = out.regions.findIndex((r) => r.part === part && r.kind === kind);
	if (n < 0) n = out.regions.push({ part, kind }) - 1;
	return n;
}

/** Cross-section and ring budget for one level of detail. Anatomy never depends on it. */
export interface CreatureLodQuality {
	sides: Record<VolumeDetail, number>;
	/** Multiplies each volume's per-segment ring count. */
	ringScale: number;
	domeRings: number;
	/** Insert a ring at every authored cross-section (keeps knees/shoulders crisp). */
	sectionRings: boolean;
	ellipsoidRings: number;
	ellipsoidSides: number;
	/** Eye highlights, noses, toes and other sub-silhouette detail. */
	fineDetail: boolean;
}
export const CREATURE_LOD_QUALITY: Record<CreatureLod, CreatureLodQuality> = {
	0: {
		sides: { face: 16, major: 12, limb: 8, minor: 6 },
		ringScale: 1,
		domeRings: 3,
		sectionRings: true,
		ellipsoidRings: 6,
		ellipsoidSides: 8,
		fineDetail: true
	},
	1: {
		sides: { face: 9, major: 8, limb: 6, minor: 4 },
		ringScale: 0.5,
		domeRings: 2,
		sectionRings: false,
		ellipsoidRings: 4,
		ellipsoidSides: 6,
		fineDetail: true
	},
	2: {
		sides: { face: 6, major: 6, limb: 4, minor: 4 },
		ringScale: 0.25,
		domeRings: 1,
		sectionRings: false,
		ellipsoidRings: 3,
		ellipsoidSides: 4,
		fineDetail: false
	}
};
/** Fixed, LOD-independent resolution for attachment and validation queries. */
export const ANALYSIS_QUALITY: CreatureLodQuality = {
	sides: { face: 16, major: 16, limb: 16, minor: 16 },
	ringScale: 2,
	domeRings: 4,
	sectionRings: true,
	ellipsoidRings: 8,
	ellipsoidSides: 12,
	fineDetail: true
};

const v3 = (p: Vec3) => new Vector3(p.x, p.y, p.z);

/** Bind-pose path points: each joint position plus the volume's optional per-point offset. */
export function volumePath(volume: BodyVolumeDefinition, world: Map<string, Vec3>): Vec3[] {
	return volume.jointIds.map((id, n) => {
		const p = world.get(id);
		if (!p) throw new Error(`Volume ${volume.id} references missing joint ${id}`);
		const o = volume.pointOffsets?.[n];
		return o ? { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z } : { ...p };
	});
}

interface ProfileSample {
	rx: number;
	ry: number;
	ryl: number;
	ox: number;
	oy: number;
	rot: number;
}
/**
 * Monotone cubic interpolation of the authored cross-sections: smooth bulges at local extrema and no
 * overshoot on tapers, so a handful of sections reads as a rounded, organic profile.
 */
export function sectionAt(sections: CrossSection[], t: number): ProfileSample {
	const channels = (s: CrossSection) => [
		s.radiusX,
		s.radiusY,
		s.radiusYLower ?? s.radiusY,
		s.offsetX ?? 0,
		s.offsetY ?? 0,
		s.rotation ?? 0
	];
	if (sections.length === 1 || t <= sections[0].t) {
		const [rx, ry, ryl, ox, oy, rot] = channels(sections[0]);
		return { rx, ry, ryl, ox, oy, rot };
	}
	const last = sections[sections.length - 1];
	if (t >= last.t) {
		const [rx, ry, ryl, ox, oy, rot] = channels(last);
		return { rx, ry, ryl, ox, oy, rot };
	}
	let i = 0;
	while (i < sections.length - 2 && sections[i + 1].t < t) i++;
	const a = sections[i],
		b = sections[i + 1],
		h = b.t - a.t;
	const f = h <= 0 ? 0 : (t - a.t) / h;
	const ca = channels(a),
		cb = channels(b);
	const prev = sections[i - 1],
		next = sections[i + 2];
	const cp = prev ? channels(prev) : undefined,
		cn = next ? channels(next) : undefined;
	const out = ca.map((va, c) => {
		const vb = cb[c];
		const secant = h > 0 ? (vb - va) / h : 0;
		const tangent = (other: number[] | undefined, otherT: number | undefined, start: boolean) => {
			if (!other || otherT === undefined) return secant;
			const outer = start ? (va - other[c]) / (a.t - otherT) : (other[c] - vb) / (otherT - b.t);
			if (!Number.isFinite(outer) || outer * secant <= 0) return 0;
			return (2 * outer * secant) / (outer + secant);
		};
		const m0 = tangent(cp, prev?.t, true) * h,
			m1 = tangent(cn, next?.t, false) * h;
		const f2 = f * f,
			f3 = f2 * f;
		return (
			(2 * f3 - 3 * f2 + 1) * va + (f3 - 2 * f2 + f) * m0 + (-2 * f3 + 3 * f2) * vb + (f3 - f2) * m1
		);
	});
	return {
		rx: Math.max(1e-5, out[0]),
		ry: Math.max(1e-5, out[1]),
		ryl: Math.max(1e-5, out[2]),
		ox: out[3],
		oy: out[4],
		rot: out[5]
	};
}

export interface SweepRing extends ProfileSample {
	t: number;
	center: Vector3;
	tangent: Vector3;
	normal: Vector3;
	binormal: Vector3;
	dome: boolean;
}
const curves = new WeakMap<Vec3[], CatmullRomCurve3>();
function pathCurve(points: Vec3[]) {
	let curve = curves.get(points);
	if (!curve) {
		curve = new CatmullRomCurve3(points.map(v3), false, 'centripetal');
		curves.set(points, curve);
	}
	return curve;
}

function ringParameters(
	volume: BodyVolumeDefinition,
	segments: number,
	quality: CreatureLodQuality
): number[] {
	const ts: number[] = [];
	for (let s = 0; s < segments; s++) {
		const count = Math.max(1, Math.round((volume.segmentRings?.[s] ?? 4) * quality.ringScale));
		for (let k = 0; k < count; k++) ts.push((s + k / count) / segments);
	}
	ts.push(1);
	if (quality.sectionRings) {
		const spacing = 1 / Math.max(2, ts.length);
		for (const section of volume.sections)
			if (
				section.t > 0 &&
				section.t < 1 &&
				!ts.some((t) => Math.abs(t - section.t) < spacing * 0.35)
			)
				ts.push(section.t);
		ts.sort((a, b) => a - b);
	}
	return ts;
}

/**
 * Rings of a swept volume: rotation-minimising frames (the previous normal projected onto each new
 * tangent plane), the interpolated profile, and optional hemi-ellipsoid domes past either end.
 */
export function sweepRings(
	volume: BodyVolumeDefinition,
	points: Vec3[],
	quality: CreatureLodQuality
): SweepRing[] {
	if (points.length < 2) throw new Error('A sweep needs at least two path points');
	const curve = pathCurve(points);
	const ts = ringParameters(volume, points.length - 1, quality);
	const normal = volume.initialNormal ? v3(volume.initialNormal) : new Vector3(1, 0, 0);
	const rings: SweepRing[] = [];
	for (const t of ts) {
		const center = curve.getPoint(t),
			tangent = curve.getTangent(t).normalize();
		normal.addScaledVector(tangent, -normal.dot(tangent));
		if (normal.lengthSq() < 1e-10) {
			normal.set(0, 1, 0).addScaledVector(tangent, -tangent.y);
			if (normal.lengthSq() < 1e-10) normal.set(0, 0, 1).addScaledVector(tangent, -tangent.z);
		}
		normal.normalize();
		rings.push({
			t,
			center,
			tangent,
			normal: normal.clone(),
			binormal: new Vector3().crossVectors(tangent, normal).normalize(),
			dome: false,
			...sectionAt(volume.sections, t)
		});
	}
	const dome = (end: SweepRing, direction: number) => {
		const out: SweepRing[] = [];
		const length = (end.rx + Math.max(end.ry, end.ryl)) * 0.5;
		for (let k = 1; k <= quality.domeRings + 1; k++) {
			const phi = (k / (quality.domeRings + 1)) * Math.PI * 0.5,
				scale = k === quality.domeRings + 1 ? 0.0005 : Math.cos(phi);
			out.push({
				...end,
				center: end.center.clone().addScaledVector(end.tangent, direction * length * Math.sin(phi)),
				rx: end.rx * scale,
				ry: end.ry * scale,
				ryl: end.ryl * scale,
				dome: true
			});
		}
		return out;
	};
	const start = volume.caps?.start === 'dome' ? dome(rings[0], -1).reverse() : [];
	const end = volume.caps?.end === 'dome' ? dome(rings[rings.length - 1], 1) : [];
	return [...start, ...rings, ...end];
}

export function ringPoint(ring: ProfileSample & SweepRing, angle: number, target = new Vector3()) {
	const s = Math.sin(angle);
	return target
		.copy(ring.center)
		.addScaledVector(ring.normal, Math.cos(angle) * ring.rx + ring.ox)
		.addScaledVector(ring.binormal, s * (s < 0 ? ring.ryl : ring.ry) + ring.oy);
}

function pushVertex(
	out: GeometryAccumulator,
	p: Vector3,
	influences: SkinInfluence,
	u: number,
	v: number,
	region: number,
	param: number
) {
	out.positions.push(p.x, p.y, p.z);
	const merged = new Map<number, number>();
	for (const [bone, weight] of influences)
		if (weight > 0) merged.set(bone, (merged.get(bone) ?? 0) + weight);
	const slots = [...merged].sort((a, b) => b[1] - a[1]).slice(0, 4);
	const total = slots.reduce((sum, [, w]) => sum + w, 0) || 1;
	for (let n = 0; n < 4; n++) {
		out.skinIndices.push(slots[n]?.[0] ?? 0);
		out.skinWeights.push(slots[n] ? slots[n][1] / total : 0);
	}
	if (!slots.length) out.skinWeights[out.skinWeights.length - 4] = 1;
	out.uvs.push(u, v);
	out.region.push(region);
	out.params.push(param);
}

/** Linear blend along the path's bones: the default weighting for deforming chains. */
export function chainInfluence(boneIndices: number[], t: number): SkinInfluence {
	const chain = Math.max(0, Math.min(1, t)) * (boneIndices.length - 1),
		j = Math.min(boneIndices.length - 2, Math.floor(chain)),
		w = chain - j;
	return [
		[boneIndices[j], 1 - w],
		[boneIndices[j + 1], w]
	];
}

const smooth = (a: number, b: number, x: number) => {
	const f = Math.max(0, Math.min(1, (x - a) / (b - a)));
	return f * f * (3 - 2 * f);
};
/**
 * Joint-centred weighting for bone-at-joint rigs: a segment belongs to the bone at its start, and
 * only the `blend` fraction nearest each joint mixes with the neighbouring bone (50/50 exactly at the
 * joint). Mid-segment vertices stay rigid, so limbs bend at knees instead of along their length.
 */
export function jointBlendInfluence(boneIndices: number[], t: number, blend = 0.5): SkinInfluence {
	const segments = boneIndices.length - 1,
		chain = Math.max(0, Math.min(1, t)) * segments,
		j = Math.min(segments - 1, Math.floor(chain)),
		f = chain - j,
		b = Math.max(0.01, Math.min(0.5, blend));
	const prev = j > 0 ? 0.5 * (1 - smooth(0, b, f)) : 0;
	const next = 0.5 * smooth(1 - b, 1, f);
	const out: SkinInfluence = [[boneIndices[j], 1 - prev - next]];
	if (prev > 0) out.push([boneIndices[j - 1], prev]);
	if (next > 0) out.push([boneIndices[j + 1], next]);
	return out;
}

export interface SweepAppendOptions {
	region: number;
	/** Overrides chain weighting. */
	skin?: (t: number) => SkinInfluence;
	/** Duplicate the final ring under a flat cap so the cap edge stays sharp (hooves, plates). */
	hardEnd?: boolean;
}
export function appendSweep(
	out: GeometryAccumulator,
	volume: BodyVolumeDefinition,
	points: Vec3[],
	boneIndices: number[],
	quality: CreatureLodQuality,
	options: SweepAppendOptions
) {
	const rings = sweepRings(volume, points, quality);
	const sides = quality.sides[volume.detail ?? 'major'];
	const skin =
		options.skin ?? ((t: number) => jointBlendInfluence(boneIndices, t, volume.skinBlend ?? 0.5));
	const start = out.positions.length / 3,
		p = new Vector3();
	rings.forEach((ring, r) => {
		const influences = skin(ring.t);
		for (let c = 0; c < sides; c++) {
			const angle = (c / sides) * Math.PI * 2 + ring.rot;
			pushVertex(
				out,
				ringPoint(ring, angle, p),
				influences,
				c / sides,
				ring.t,
				options.region,
				ring.t
			);
			if (r < rings.length - 1) {
				const here = start + r * sides + c,
					next = start + r * sides + ((c + 1) % sides);
				out.indices.push(here, next, here + sides, next, next + sides, here + sides);
			}
		}
	});
	const flat = (ringIndex: number, end: boolean, hard: boolean) => {
		const ring = rings[ringIndex];
		let base = start + ringIndex * sides;
		if (hard) {
			base = out.positions.length / 3;
			const influences = skin(ring.t);
			for (let c = 0; c < sides; c++)
				pushVertex(
					out,
					ringPoint(ring, (c / sides) * Math.PI * 2 + ring.rot, p),
					influences,
					c / sides,
					ring.t,
					options.region,
					ring.t
				);
		}
		const centre = out.positions.length / 3;
		pushVertex(
			out,
			p
				.copy(ring.center)
				.addScaledVector(ring.normal, ring.ox)
				.addScaledVector(ring.binormal, ring.oy),
			skin(ring.t),
			0.5,
			ring.t,
			options.region,
			ring.t
		);
		for (let c = 0; c < sides; c++) {
			const a = base + c,
				b = base + ((c + 1) % sides);
			out.indices.push(centre, ...(end ? [a, b] : [b, a]));
		}
	};
	if (volume.caps?.start !== 'dome') flat(0, false, false);
	if (volume.caps?.end !== 'dome') flat(rings.length - 1, true, !!options.hardEnd);
}

export interface EllipsoidOptions {
	centre: Vector3;
	/** Orthonormal; axes[0] is the long/host→appendage axis. axes[2] is recomputed as a0 × a1. */
	axes: [Vector3, Vector3, Vector3];
	radii: [number, number, number];
	region: number;
	/** Weighting by position along axes[0], s ∈ [-1, 1]. */
	skin: (s: number) => SkinInfluence;
	rings: number;
	sides: number;
	/** Flattens the -axes[1] half (soles, plates). 1 = round. */
	lowerScale?: number;
}
/** Low-poly UV ellipsoid: joint masses, eyes, paws and toes. */
export function appendEllipsoid(out: GeometryAccumulator, o: EllipsoidOptions) {
	const start = out.positions.length / 3,
		p = new Vector3(),
		[a0, a1] = o.axes,
		// Rebuilt right-handed so triangle winding (and normals) always face outward.
		a2 = new Vector3().crossVectors(a0, a1).normalize(),
		[r0, r1, r2] = o.radii;
	const at = (s: number, ring: number, angle: number) => {
		const c = Math.cos(angle),
			sn = Math.sin(angle);
		return p
			.copy(o.centre)
			.addScaledVector(a0, s * r0)
			.addScaledVector(a1, c * ring * r1 * (c < 0 ? (o.lowerScale ?? 1) : 1))
			.addScaledVector(a2, sn * ring * r2);
	};
	pushVertex(out, at(-1, 0, 0), o.skin(-1), 0.5, 0, o.region, 0);
	for (let i = 1; i < o.rings; i++) {
		const phi = (i / o.rings) * Math.PI,
			s = -Math.cos(phi),
			ring = Math.sin(phi);
		for (let c = 0; c < o.sides; c++)
			pushVertex(
				out,
				at(s, ring, (c / o.sides) * Math.PI * 2),
				o.skin(s),
				c / o.sides,
				i / o.rings,
				o.region,
				(s + 1) / 2
			);
	}
	pushVertex(out, at(1, 0, 0), o.skin(1), 0.5, 1, o.region, 1);
	const first = start + 1,
		apex = start + 1 + (o.rings - 1) * o.sides;
	for (let c = 0; c < o.sides; c++) {
		const n = (c + 1) % o.sides;
		out.indices.push(start, first + n, first + c);
		const last = first + (o.rings - 2) * o.sides;
		out.indices.push(apex, last + c, last + n);
	}
	for (let i = 0; i < o.rings - 2; i++)
		for (let c = 0; c < o.sides; c++) {
			const n = (c + 1) % o.sides,
				a = first + i * o.sides,
				b = a + o.sides;
			out.indices.push(a + c, a + n, b + c, a + n, b + n, b + c);
		}
}

/** LOD-independent sampled volume for surface queries, embedding tests and validation. */
export interface SampledVolume {
	id: string;
	volume: BodyVolumeDefinition;
	points: Vec3[];
	rings: SweepRing[];
	/** Rings without domes, for (t, angle) surface queries. */
	body: SweepRing[];
}
export function sampleVolume(
	volume: BodyVolumeDefinition,
	world: Map<string, Vec3>
): SampledVolume {
	const points = volumePath(volume, world);
	const rings = sweepRings(volume, points, ANALYSIS_QUALITY);
	return { id: volume.id, volume, points, rings, body: rings.filter((r) => !r.dome) };
}

function lerpRing(a: SweepRing, b: SweepRing, f: number): SweepRing {
	const mix = (x: number, y: number) => x + (y - x) * f;
	const normal = a.normal.clone().lerp(b.normal, f).normalize();
	const tangent = a.tangent.clone().lerp(b.tangent, f).normalize();
	return {
		t: mix(a.t, b.t),
		center: a.center.clone().lerp(b.center, f),
		tangent,
		normal,
		binormal: new Vector3().crossVectors(tangent, normal).normalize(),
		rx: mix(a.rx, b.rx),
		ry: mix(a.ry, b.ry),
		ryl: mix(a.ryl, b.ryl),
		ox: mix(a.ox, b.ox),
		oy: mix(a.oy, b.oy),
		rot: mix(a.rot, b.rot),
		dome: a.dome && b.dome
	};
}
/** Interpolated cross-section frame at path parameter t (0–1, domes excluded). */
export function ringAt(sampled: SampledVolume, t: number): SweepRing {
	const rings = sampled.body;
	if (t <= rings[0].t) return rings[0];
	for (let n = 0; n < rings.length - 1; n++)
		if (t <= rings[n + 1].t)
			return lerpRing(
				rings[n],
				rings[n + 1],
				(t - rings[n].t) / (rings[n + 1].t - rings[n].t || 1)
			);
	return rings[rings.length - 1];
}
export interface SurfaceSample {
	point: Vector3;
	normal: Vector3;
	ring: SweepRing;
}
/** Surface point and outward normal at (t, angle); angle 0 = +normal axis, π/2 = +binormal. */
export function surfaceAt(sampled: SampledVolume, t: number, angle: number): SurfaceSample {
	const ring = ringAt(sampled, t);
	const point = ringPoint(ring, angle);
	const dt = 0.004,
		da = 0.01;
	const ta = ringPoint(ringAt(sampled, Math.min(1, t + dt)), angle).sub(
		ringPoint(ringAt(sampled, Math.max(0, t - dt)), angle)
	);
	const aa = ringPoint(ring, angle + da).sub(ringPoint(ring, angle - da));
	const normal = new Vector3().crossVectors(ta, aa).normalize();
	const outward = point.clone().sub(ring.center);
	if (normal.dot(outward) < 0) normal.negate();
	if (!Number.isFinite(normal.x) || normal.lengthSq() < 0.5) normal.copy(outward).normalize();
	return { point, normal, ring };
}

/**
 * Normalised elliptical depth of `p` inside the volume: 0 on the path axis, 1 on the surface, > 1
 * outside. Each point is measured in the cross-section of the ring pair it projects between.
 */
export function volumeDepth(sampled: SampledVolume, p: Vec3): number {
	const rings = sampled.rings,
		q = v3(p),
		d = new Vector3();
	let best = Infinity;
	for (let n = 0; n < rings.length - 1; n++) {
		const a = rings[n],
			b = rings[n + 1];
		// Slab between the two ring planes; consecutive slabs tile the volume, including bends.
		const da = d.subVectors(q, a.center).dot(a.tangent),
			db = d.subVectors(q, b.center).dot(b.tangent);
		if (da < -1e-9 || db > 1e-9) continue;
		const f = da - db > 1e-12 ? da / (da - db) : 0;
		const ring = lerpRing(a, b, f);
		d.subVectors(q, ring.center);
		const u = d.dot(ring.normal) - ring.ox,
			v = d.dot(ring.binormal) - ring.oy;
		const rho = Math.hypot(u / ring.rx, v / (v < 0 ? ring.ryl : ring.ry));
		if (rho < best) best = rho;
	}
	return best;
}

/** First surface crossing from an inside origin along `direction` (binary search on depth). */
export function raySurface(
	sampled: SampledVolume,
	origin: Vector3,
	direction: Vector3,
	maxDistance: number
): Vector3 | null {
	let inside = 0,
		outside = -1;
	const steps = 32;
	for (let n = 1; n <= steps; n++) {
		const s = (n / steps) * maxDistance;
		if (volumeDepth(sampled, origin.clone().addScaledVector(direction, s)) > 1) {
			outside = s;
			break;
		}
		inside = s;
	}
	if (outside < 0) return null;
	for (let n = 0; n < 18; n++) {
		const mid = (inside + outside) / 2;
		if (volumeDepth(sampled, origin.clone().addScaledVector(direction, mid)) > 1) outside = mid;
		else inside = mid;
	}
	return origin.clone().addScaledVector(direction, (inside + outside) / 2);
}

/** Area-weighted smooth normals. Separate parts never share vertices, so creases stay where authored. */
export function computeNormals(positions: ArrayLike<number>, indices: ArrayLike<number>) {
	const normals = new Float32Array(positions.length);
	for (let i = 0; i < indices.length; i += 3) {
		const a = indices[i] * 3,
			b = indices[i + 1] * 3,
			c = indices[i + 2] * 3;
		const abx = positions[b] - positions[a],
			aby = positions[b + 1] - positions[a + 1],
			abz = positions[b + 2] - positions[a + 2];
		const acx = positions[c] - positions[a],
			acy = positions[c + 1] - positions[a + 1],
			acz = positions[c + 2] - positions[a + 2];
		const nx = aby * acz - abz * acy,
			ny = abz * acx - abx * acz,
			nz = abx * acy - aby * acx;
		for (const k of [a, b, c]) {
			normals[k] += nx;
			normals[k + 1] += ny;
			normals[k + 2] += nz;
		}
	}
	for (let i = 0; i < normals.length; i += 3) {
		const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
		if (length > 1e-20) {
			normals[i] /= length;
			normals[i + 1] /= length;
			normals[i + 2] /= length;
		} else normals[i + 1] = 1;
	}
	return normals;
}
