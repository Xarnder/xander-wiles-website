import { Vector3 } from 'three';
import type {
	AttachmentMassDefinition,
	BodyVolumeDefinition,
	CreatureDefinition,
	CrossSection,
	JointSemantic,
	ProceduralSkeletonDefinition,
	SpeciesForm,
	TorsoProfile,
	Vec3,
	VolumeDetail
} from './CreatureTypes';
import { resolveSpeciesForm } from './CreatureForm';
import {
	raySurface,
	ringAt,
	sampleVolume,
	surfaceAt,
	volumeDepth,
	type SampledVolume
} from './SweptBodyVolume';

/**
 * Shared anatomy grammar for every body plan:
 *
 *   HOST BODY → EMBEDDED ROOT → ATTACHMENT / JOINT MASS → TAPERED APPENDAGE
 *
 * Limbs, necks and tails start inside their host volume (never on its surface), leave through a
 * torso-relative surface point, and are bridged by a cheap overlapping ellipsoid. Body plans decide
 * where on the torso things attach and how they are posed; this module decides how they connect.
 */

export const vec = (v: Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
export const v3 = (p: Vec3) => new Vector3(p.x, p.y, p.z);
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mirror = (p: Vec3, side: number): Vec3 =>
	side === 1 ? { ...p } : { x: -p.x, y: p.y, z: p.z };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** Reference dimensions after individual variation, form multipliers and correlation rules. */
export interface CreatureDimensions {
	length: number;
	width: number;
	depth: number;
	legs: number;
	head: number;
	neckLength: number;
	neckRadius: number;
	limbRadius: number;
	tailLength: number;
	tailRadius: number;
	stature: number;
	eyeScale: number;
	stanceWidth: number;
	k: number;
}
const STYLE_LIMB: Record<SpeciesForm['style'], number> = {
	elegant: 0.9,
	slender: 0.9,
	cute: 1.05,
	chunky: 1.2,
	heavy: 1.3
};
export function creatureDimensions(def: CreatureDefinition, form: SpeciesForm): CreatureDimensions {
	const { species: s, individual: i } = def,
		p = s.proportions,
		v = i.proportionVariation,
		k = i.sizeFactor;
	const length = p.bodyLength * v.length * k,
		width = p.bodyWidth * v.width * k,
		depth = p.bodyDepth * k,
		legs = p.legLength * v.legs * k;
	const stature = legs + depth + p.neckLength * k + p.headSize * k;
	// Correlated rules: heavy torsos and giants need thicker supports; tiny animals get bigger heads/eyes.
	const heavy = clamp(0.85 + 0.25 * (depth / Math.max(legs, depth * 0.2)), 0.9, 1.35);
	const giant = 1 + clamp(Math.log2(stature / 3) * 0.12, 0, 0.3);
	const tiny = clamp(Math.log2(0.5 / stature) * 0.1, 0, 0.2);
	// Big heads are part of the style, but never more than ~1.8 body widths across.
	const head = Math.min(
		p.headSize * v.head * k * form.headScale * (1 + tiny * 0.5),
		Math.max(width, depth) * 1.8
	);
	const limbRadius = Math.min(
		p.legThickness * k * 0.6 * heavy * giant * STYLE_LIMB[form.style],
		width * 0.3,
		depth * 0.3
	);
	const neckRadius = Math.min(
		head * 0.25 * form.neckThickness * (1 + 0.3 * (form.headScale - 1)),
		Math.min(width, depth) * 0.36
	);
	return {
		length,
		width,
		depth,
		legs,
		head,
		neckLength: p.neckLength * k * form.neckScale,
		neckRadius,
		limbRadius,
		tailLength: p.tailLength * k * form.tailScale,
		tailRadius: Math.min(p.tailThickness * k * 0.9, depth * 0.28, width * 0.3),
		stature,
		eyeScale: form.eyeScale * (1 + tiny),
		stanceWidth: p.stanceWidth * k,
		k
	};
}

export const section = (
	t: number,
	radiusX: number,
	radiusY: number,
	extra: Partial<CrossSection> = {}
): CrossSection => ({ t, radiusX, radiusY, ...extra });

export const TORSO_PROFILES: Record<
	TorsoProfile,
	{
		hipW: number;
		hipD: number;
		waist: number;
		chestW: number;
		chestD: number;
		sag: number;
		/** Underside depth at the waist: < 1 tucks the belly up, > 1 lets it hang. */
		belly: number;
	}
> = {
	slender: { hipW: 0.9, hipD: 0.9, waist: 0.82, chestW: 0.95, chestD: 0.95, sag: 0, belly: 0.82 },
	'deep-chested': {
		hipW: 0.9,
		hipD: 0.88,
		waist: 0.8,
		chestW: 1.04,
		chestD: 1.14,
		sag: 0,
		belly: 0.72
	},
	round: {
		hipW: 1.05,
		hipD: 1.05,
		waist: 1.08,
		chestW: 1.05,
		chestD: 1.05,
		sag: 0.08,
		belly: 1.08
	},
	pear: { hipW: 1.15, hipD: 1.1, waist: 1, chestW: 0.88, chestD: 0.9, sag: 0.05, belly: 1.05 },
	'rear-heavy': {
		hipW: 1.2,
		hipD: 1.15,
		waist: 0.9,
		chestW: 0.92,
		chestD: 0.95,
		sag: 0,
		belly: 0.9
	},
	'front-heavy': {
		hipW: 0.88,
		hipD: 0.9,
		waist: 0.9,
		chestW: 1.2,
		chestD: 1.18,
		sag: 0,
		belly: 0.86
	},
	long: { hipW: 0.92, hipD: 0.92, waist: 0.9, chestW: 0.98, chestD: 0.98, sag: 0.02, belly: 0.9 },
	compact: { hipW: 1, hipD: 1, waist: 0.95, chestW: 1.02, chestD: 1.02, sag: 0.03, belly: 0.94 }
};

/** Joint/volume accumulator with LOD-independent sampled host volumes for attachment queries. */
export class RigBuilder {
	readonly rig: ProceduralSkeletonDefinition = {
		joints: [],
		volumes: [],
		features: [],
		limbs: [],
		groundOffset: 0,
		attachments: [],
		masses: []
	};
	readonly world = new Map<string, Vec3>();
	readonly form: SpeciesForm;
	readonly dims: CreatureDimensions;
	private cache = new Map<string, SampledVolume>();
	constructor(readonly definition: CreatureDefinition) {
		this.form = resolveSpeciesForm(definition.species);
		this.dims = creatureDimensions(definition, this.form);
	}
	add(
		id: string,
		parentId: string | undefined,
		semantic: JointSemantic,
		pos: Vec3,
		mirrorGroup?: string
	) {
		const parent = parentId ? this.world.get(parentId) : { x: 0, y: 0, z: 0 };
		if (!parent) throw new Error(`Missing parent ${parentId} for ${id}`);
		this.rig.joints.push({
			id,
			parentId,
			semantic,
			localPosition: sub(pos, parent),
			mirrorGroup
		});
		this.world.set(id, { ...pos });
		return id;
	}
	at(id: string) {
		const p = this.world.get(id);
		if (!p) throw new Error(`Unknown joint ${id}`);
		return p;
	}
	volume(volume: BodyVolumeDefinition) {
		this.rig.volumes.push(volume);
		return volume;
	}
	/** Path point offsets that place volume points at absolute bind positions. */
	offsets(jointIds: string[], points: (Vec3 | null)[]): Vec3[] {
		return jointIds.map((id, n) =>
			points[n] ? sub(points[n]!, this.at(id)) : { x: 0, y: 0, z: 0 }
		);
	}
	sampled(volumeId: string): SampledVolume {
		let s = this.cache.get(volumeId);
		if (!s) {
			const volume = this.rig.volumes.find((v) => v.id === volumeId);
			if (!volume) throw new Error(`Unknown volume ${volumeId}`);
			s = sampleVolume(volume, this.world);
			this.cache.set(volumeId, s);
		}
		return s;
	}
}

/** Bone the host volume's skin uses at path parameter t (nearest path joint). */
export function hostJointAt(volume: BodyVolumeDefinition, t: number) {
	return volume.jointIds[Math.round(clamp(t, 0, 1) * (volume.jointIds.length - 1))];
}
/** Host chain bones blended at t, for rigid features riding a deforming body. */
export function hostSkinAt(volume: BodyVolumeDefinition, t: number) {
	const chain = clamp(t, 0, 1) * (volume.jointIds.length - 1),
		j = Math.min(volume.jointIds.length - 2, Math.floor(chain)),
		w = chain - j;
	return [
		{ jointId: volume.jointIds[j], weight: 1 - w },
		{ jointId: volume.jointIds[j + 1], weight: w }
	];
}

export interface LimbPairSpec {
	pair: number;
	hostVolumeId: string;
	hostJointId: string;
	/** Position along the host path, 0–1. */
	t: number;
	/** Around the host cross-section for the +X limb: 0 lateral, -π/2 underneath. */
	angle: number;
	radius: number;
	massKind: AttachmentMassDefinition['kind'];
	massScale: number;
	phases: [number, number];
	arm?: boolean;
	/** Radial detail class; six-legged plans use fewer sides per limb. */
	detail?: VolumeDetail;
	/** Plan-specific bind pose from the +X pivot. */
	place(pivot: Vector3, normal: Vector3): { knee: Vector3; foot: Vector3 };
}

/**
 * Torso-relative attachment for one left/right limb pair. The +X limb is solved against the host
 * surface and mirrored, so pairs are exactly symmetric.
 */
export function buildLimbPair(b: RigBuilder, spec: LimbPairSpec) {
	const form = b.form,
		host = b.sampled(spec.hostVolumeId);
	const surface = surfaceAt(host, spec.t, spec.angle);
	const S = surface.point,
		N = surface.normal,
		r = spec.radius;
	const axis = surface.ring.center
		.clone()
		.addScaledVector(surface.ring.normal, surface.ring.ox)
		.addScaledVector(surface.ring.binormal, surface.ring.oy);
	const toAxis = S.distanceTo(axis);
	const rootRadius = r * 1.3;
	// Root penetration scales with the limb, but never reaches more than half way to the host axis.
	const penetration = Math.min(rootRadius * form.limbRootPenetration, toAxis * 0.5);
	const root = S.clone().addScaledVector(N, -penetration);
	const pivot = S.clone().addScaledVector(N, -Math.min(r * 0.25, penetration * 0.5));
	const { knee, foot } = spec.place(pivot.clone(), N.clone());
	const taper = form.limbTaper,
		kneeR = r * lerp(1, taper, 0.5),
		ankleR = r * taper * 0.82;
	const seg = (i: number, f: number) => (i + f) / 3;
	const sections = [
		section(0, rootRadius, rootRadius),
		section(seg(0, 1), r * 1.14, r * 1.14),
		section(seg(1, 0.25), r, r),
		section(seg(1, 0.84), kneeR * 0.96, kneeR * 0.96),
		section(seg(2, 0), kneeR * form.jointScale, kneeR * form.jointScale),
		section(seg(2, 0.17), kneeR * 0.93, kneeR * 0.93),
		section(seg(2, 0.86), ankleR, ankleR),
		section(1, ankleR * 1.06, ankleR * 1.06)
	];
	// Knee-bend side from the bind pose, so IK never flips a knee the skin was not bound for.
	const axisPF = foot.clone().sub(pivot).normalize();
	const bend = knee.clone().sub(pivot);
	bend.addScaledVector(axisPF, -bend.dot(axisPF));
	if (bend.lengthSq() < 1e-12) bend.set(0, 0, spec.pair === 0 ? -1 : 1);
	bend.normalize();
	// Attachment mass: overlaps the torso and the first ~40% of the upper limb.
	const end = pivot.clone().lerp(knee, 0.42);
	const a0 = end.clone().sub(root);
	const massLength = a0.length();
	a0.normalize();
	const a1 = new Vector3(0, 0, 1).addScaledVector(a0, -a0.z);
	if (a1.lengthSq() < 1e-6) a1.set(0, 1, 0).addScaledVector(a0, -a0.y);
	a1.normalize();
	const a2 = new Vector3().crossVectors(a0, a1).normalize();
	const hostR = Math.min(surface.ring.rx, surface.ring.ry, surface.ring.ryl);
	const massR = r * spec.massScale * form.jointMassScale;
	const haunch = spec.massKind === 'hip' ? 1 + 0.35 * form.haunchRoundness : 1;
	const radii: [number, number, number] = [
		massLength * 0.5 + r * 0.35 * (spec.massKind === 'hip' ? 1.15 : 1),
		clamp(massR * 1.45 * haunch, r * 1.08, Math.max(r * 1.08, hostR * 0.75)),
		clamp(massR * 1.25, r * 1.05, Math.max(r * 1.05, hostR * 0.7))
	];
	const centre = root
		.clone()
		.addScaledVector(a0, massLength * 0.5)
		.addScaledVector(N, r * 0.06);
	const rootDepth = volumeDepth(host, vec(root));
	for (const side of [-1, 1] as const) {
		const id = `limb-${spec.pair}-${side}`;
		const hipId = b.add(
			`${id}-hip`,
			spec.hostJointId,
			'limb-root',
			mirror(vec(pivot), side),
			`hip-${spec.pair}`
		);
		const kneeId = b.add(
			`${id}-knee`,
			hipId,
			'lower-limb',
			mirror(vec(knee), side),
			`knee-${spec.pair}`
		);
		const footId = b.add(
			`${id}-foot`,
			kneeId,
			'foot',
			mirror(vec(foot), side),
			`foot-${spec.pair}`
		);
		const P = b.at(hipId),
			K = b.at(kneeId),
			F = b.at(footId);
		const dist = (u: Vec3, w: Vec3) => Math.hypot(u.x - w.x, u.y - w.y, u.z - w.z);
		b.rig.limbs.push({
			id,
			side,
			pair: spec.pair,
			hipId,
			kneeId,
			footId,
			upperLength: dist(P, K),
			lowerLength: dist(K, F),
			restFoot: { ...F },
			phase: spec.phases[side === 1 ? 1 : 0],
			arm: spec.arm,
			bendHint: mirror(vec(bend), side)
		});
		const jointIds = [spec.hostJointId, hipId, kneeId, footId];
		b.volume({
			id,
			jointIds,
			pointOffsets: b.offsets(jointIds, [mirror(vec(root), side), null, null, null]),
			sections,
			caps: { start: 'flat', end: 'dome' },
			part: 'limb',
			detail: spec.detail ?? 'limb',
			segmentRings: [1, 2, 2],
			skinBlend: 0.3
		});
		const massId = `${id}-mass`;
		const m = (v: Vector3) => mirror(vec(v), side);
		b.rig.masses!.push({
			id: massId,
			kind: spec.massKind,
			centre: m(centre),
			axes: [m(a0), m(a1), m(a2)],
			radii: [...radii],
			hostJointId: spec.hostJointId,
			limbJointId: hipId,
			hostWeight: [0.8, 0.12]
		});
		b.rig.attachments!.push({
			limbId: id,
			hostVolumeId: spec.hostVolumeId,
			hostJointId: spec.hostJointId,
			proximalJointId: hipId,
			t: spec.t,
			angle: spec.angle,
			surfacePoint: m(S),
			surfaceNormal: m(N),
			rootPoint: m(root),
			rootRadius,
			penetration,
			rootDepth,
			massId
		});
	}
}

export interface HeadSpec {
	hostJointId: string;
	hostVolumeId: string;
	/** Embedded neck start inside the host. */
	neckBase: Vec3;
	neck: Vec3;
	head: Vec3;
	/** Downward tilt of the face, radians. */
	pitch: number;
	/** Neck radius override (serpents: continuous with the body front). */
	neckRadius?: number;
}
/** Neck swept from inside the host into the head; head ellipsoid; optional muzzle and nose. */
export function buildNeckAndHead(b: RigBuilder, spec: HeadSpec) {
	const { form, dims } = b,
		h = dims.head;
	b.add('neck', spec.hostJointId, 'neck', spec.neck);
	b.add('head', 'neck', 'head', spec.head);
	const forward = new Vector3(0, -Math.sin(spec.pitch), Math.cos(spec.pitch)).normalize();
	const up = new Vector3(0, 1, 0).addScaledVector(forward, -forward.y).normalize();
	const right = new Vector3().crossVectors(up, forward).normalize();
	const H = v3(spec.head);
	const halfLength = h * 0.24 * form.headLength;
	const rx = h * 0.5 * form.headWidth,
		ry = h * 0.46;
	const muzzleLength = h * form.muzzleLength,
		mw = h * 0.5 * form.muzzleWidth,
		mh = h * 0.5 * form.muzzleHeight;
	const muzzleStart = H.clone()
		.addScaledVector(forward, halfLength * 0.2)
		.addScaledVector(up, -ry * 0.22);
	const muzzleEnd = H.clone()
		.addScaledVector(forward, halfLength + muzzleLength * 0.6)
		.addScaledVector(up, -ry * 0.28);
	const tip =
		muzzleLength > 0
			? muzzleEnd.clone().addScaledVector(forward, (mw * 0.9 + mh * 0.85) * 0.5)
			: H.clone().addScaledVector(forward, halfLength + (rx + ry) * 0.3);
	b.add('muzzle', 'head', 'feature', vec(tip));
	const host = b.sampled(spec.hostVolumeId);
	const hostRing = ringAt(host, 1);
	const nr = spec.neckRadius ?? dims.neckRadius;
	const baseR = Math.min(nr * 1.35, Math.max(nr, Math.min(hostRing.rx, hostRing.ry) * 0.95));
	const neckIds = [spec.hostJointId, 'neck', 'head'];
	b.volume({
		id: 'neck',
		jointIds: neckIds,
		pointOffsets: b.offsets(neckIds, [spec.neckBase, null, null]),
		sections: [
			section(0, baseR, baseR),
			section(0.2, lerp(baseR, nr, 0.6), lerp(baseR, nr, 0.6)),
			section(0.5, nr, nr * 1.04),
			section(0.82, nr * 0.95, nr * 0.98),
			section(1, nr * 0.9, nr * 0.92)
		],
		caps: { start: 'flat', end: 'dome' },
		part: 'neck',
		detail: 'limb',
		segmentRings: [3, 3],
		skinBlend: 0.5
	});
	const at = (s: number) => vec(H.clone().addScaledVector(forward, s * halfLength));
	b.volume({
		id: 'head',
		jointIds: ['head', 'head', 'head'],
		pointOffsets: b.offsets(['head', 'head', 'head'], [at(-1), null, at(1)]),
		sections: [
			section(0, rx * 0.64, ry * 0.62),
			section(0.32, rx * 0.97, ry * 0.97),
			section(0.58, rx, ry, { radiusYLower: ry * 1.06 }),
			section(1, rx * 0.68, ry * 0.62, { radiusYLower: ry * 0.66 })
		],
		caps: { start: 'dome', end: 'dome' },
		part: 'head',
		detail: 'face',
		segmentRings: [2, 2]
	});
	if (muzzleLength > 0)
		b.volume({
			id: 'muzzle',
			jointIds: ['head', 'head'],
			pointOffsets: b.offsets(['head', 'head'], [vec(muzzleStart), vec(muzzleEnd)]),
			sections: [
				section(0, mw * 0.88, mh * 0.82),
				section(0.55, mw, mh),
				section(1, mw * 0.92, mh * 0.86)
			],
			caps: { start: 'flat', end: 'dome' },
			part: 'muzzle',
			detail: 'limb',
			segmentRings: [3]
		});
	b.rig.face = {
		centre: vec(H),
		forward: vec(forward),
		up: vec(up),
		right: vec(right),
		radii: { x: rx, y: ry, z: halfLength + (rx + ry) * 0.3 }
	};
}

/** Surface point/normal on the head from the face frame (yaw toward +right, pitch toward up). */
export function faceSurface(b: RigBuilder, yaw: number, pitch: number) {
	const face = b.rig.face!,
		head = b.sampled('head');
	const f = v3(face.forward),
		u = v3(face.up),
		r = v3(face.right),
		c = v3(face.centre);
	const dir = (y: number, p: number) =>
		f
			.clone()
			.multiplyScalar(Math.cos(y) * Math.cos(p))
			.addScaledVector(r, Math.sin(y) * Math.cos(p))
			.addScaledVector(u, Math.sin(p))
			.normalize();
	const reach = (face.radii.x + face.radii.y + face.radii.z) * 2;
	const hit = (y: number, p: number) => {
		const d = dir(y, p);
		return (
			raySurface(head, c, d, reach) ??
			c.clone().addScaledVector(d, Math.min(face.radii.x, face.radii.y, face.radii.z))
		);
	};
	const point = hit(yaw, pitch);
	const e = 0.02;
	const normal = new Vector3()
		.crossVectors(
			hit(yaw + e, pitch).sub(hit(yaw - e, pitch)),
			hit(yaw, pitch + e).sub(hit(yaw, pitch - e))
		)
		.normalize();
	if (normal.dot(point.clone().sub(c)) < 0) normal.negate();
	if (!Number.isFinite(normal.x) || normal.lengthSq() < 0.5) normal.copy(point).sub(c).normalize();
	return { point, normal, forward: f, up: u, right: r };
}

export interface TailSpec {
	hostJointId: string;
	hostVolumeId: string;
	/** Embedded start of the tail inside the host. */
	root: Vec3;
	/** First tail joint, near the host surface. */
	first: Vec3;
	/** Unit direction the tail leaves in (before carriage). */
	direction: Vector3;
}
/** Tail joints `tail-1…5` along a carriage/curl arc, swept from inside the rump and tapered. */
export function buildTail(b: RigBuilder, spec: TailSpec) {
	const { form, dims } = b;
	const length = dims.tailLength,
		R = dims.tailRadius;
	if (length <= 0 || R <= 0) return;
	const ids = [spec.hostJointId];
	let p = v3(spec.first);
	const back = spec.direction.clone().normalize();
	const side = new Vector3(1, 0, 0);
	for (let n = 1; n <= 5; n++) {
		const id = b.add(`tail-${n}`, n === 1 ? spec.hostJointId : `tail-${n - 1}`, 'tail', vec(p));
		ids.push(id);
		const angle = form.tailCarriage + form.tailCurl * 0.42 * n;
		const dir = back.clone().applyAxisAngle(side, back.z < 0 ? angle : -angle);
		p = p.clone().addScaledVector(dir, length / 5);
		// A drooping tail drags along the ground rather than sinking into it.
		p.y = Math.max(p.y, R * 0.6);
	}
	const seg = (i: number, f: number) => (i + f) / 5;
	b.volume({
		id: 'tail',
		jointIds: ids,
		pointOffsets: b.offsets(ids, [spec.root, null, null, null, null, null]),
		sections: [
			section(0, R * 1.18, R * 1.18),
			section(seg(1, 0), R, R),
			section(seg(2, 0.5), R * 0.66, R * 0.66),
			section(seg(4, 0), R * 0.34, R * 0.34),
			section(1, R * 0.16, R * 0.16)
		],
		caps: { start: 'flat', end: 'dome' },
		part: 'tail',
		detail: 'limb',
		segmentRings: [1, 2, 2, 2, 2],
		skinBlend: 0.5
	});
}
