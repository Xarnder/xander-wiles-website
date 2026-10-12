import type { CreatureCompilation, Vec3 } from './CreatureTypes';
import { jointWorldPositions } from './SkeletonGenerator';
import { sampleVolume, volumeDepth, volumePath, type SampledVolume } from './SweptBodyVolume';

export type AnatomyIssueCode =
	| 'FLOATING_LIMB'
	| 'DEEP_LIMB_ROOT'
	| 'FLOATING_MASS'
	| 'FLOATING_NECK'
	| 'FLOATING_HEAD'
	| 'FLOATING_TAIL'
	| 'FLOATING_FEATURE'
	| 'NON_FINITE'
	| 'INVALID_BOUNDS'
	| 'BELOW_GROUND'
	| 'INVALID_SKIN';
export interface AnatomyIssue {
	code: AnatomyIssueCode;
	id: string;
	/** Normalised host depth (1 = on the surface) where relevant. */
	value?: number;
}

/** Roots must sit at least this far inside their host (normalised elliptical depth). */
export const ROOT_EMBED_LIMIT = 0.97;
/** …but not so deep that the limb travels through most of the torso. */
export const ROOT_DEPTH_FLOOR = 0.3;

/**
 * Generator validation: every organic appendage must start inside its host, roots must not tunnel
 * through the body, and geometry/skinning must be finite and normalised. Intersection at roots is
 * required here, not treated as an error.
 */
export function validateCreatureAnatomy(c: CreatureCompilation): AnatomyIssue[] {
	const issues: AnatomyIssue[] = [];
	const g = c.geometry,
		rig = c.skeleton,
		vertices = g.positions.length / 3;
	for (const [name, array] of Object.entries({
		positions: g.positions,
		normals: g.normals,
		colors: g.colors,
		surface: g.surface,
		skinWeights: g.skinWeights
	}))
		if (!array.every(Number.isFinite)) issues.push({ code: 'NON_FINITE', id: name });
	const b = c.bounds;
	if (
		![b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, b.radius, b.height].every(
			Number.isFinite
		) ||
		b.height <= 0 ||
		b.min.y !== 0
	)
		issues.push({ code: 'INVALID_BOUNDS', id: 'bounds' });
	if (!g.indices.every((i) => i < vertices)) issues.push({ code: 'NON_FINITE', id: 'indices' });
	// Feet define the ground plane; nothing should sink noticeably below it in the bind pose.
	let lowest = Infinity;
	for (let n = 1; n < g.positions.length; n += 3) lowest = Math.min(lowest, g.positions[n]);
	if (lowest < -0.04 * b.height)
		issues.push({ code: 'BELOW_GROUND', id: 'geometry', value: lowest / b.height });
	for (let v = 0; v < vertices; v++) {
		let sum = 0;
		for (let k = 0; k < 4; k++) {
			const w = g.skinWeights[v * 4 + k];
			if (w < 0 || w > 1 || g.skinIndices[v * 4 + k] >= rig.joints.length) sum = NaN;
			sum += w;
		}
		if (!(Math.abs(sum - 1) < 1e-4)) {
			issues.push({ code: 'INVALID_SKIN', id: `vertex-${v}` });
			break;
		}
	}
	const world = jointWorldPositions(rig);
	const sampled = new Map<string, SampledVolume>();
	const host = (id: string) => {
		let s = sampled.get(id);
		if (!s) {
			const volume = rig.volumes.find((v) => v.id === id);
			if (!volume) return undefined;
			s = sampleVolume(volume, world);
			sampled.set(id, s);
		}
		return s;
	};
	const depth = (volumeId: string, p: Vec3) => {
		const s = host(volumeId);
		return s ? volumeDepth(s, p) : Infinity;
	};
	for (const a of rig.attachments ?? []) {
		const d = depth(a.hostVolumeId, a.rootPoint);
		if (!(d < ROOT_EMBED_LIMIT)) issues.push({ code: 'FLOATING_LIMB', id: a.limbId, value: d });
		else if (d < ROOT_DEPTH_FLOOR) issues.push({ code: 'DEEP_LIMB_ROOT', id: a.limbId, value: d });
		const limb = rig.volumes.find((v) => v.id === a.limbId);
		if (limb) {
			// The swept limb's own first point is the embedded root; it must agree with the record.
			const first = volumePath(limb, world)[0];
			const e = depth(a.hostVolumeId, first);
			if (!(e < ROOT_EMBED_LIMIT))
				issues.push({ code: 'FLOATING_LIMB', id: `${a.limbId}-path`, value: e });
		}
		const mass = rig.masses?.find((m) => m.id === a.massId);
		if (mass) {
			// The mass must reach into the host: its inner end sits inside the body.
			const hostEnd = {
				x: mass.centre.x - mass.axes[0].x * mass.radii[0] * 0.85,
				y: mass.centre.y - mass.axes[0].y * mass.radii[0] * 0.85,
				z: mass.centre.z - mass.axes[0].z * mass.radii[0] * 0.85
			};
			const dm = depth(a.hostVolumeId, hostEnd);
			if (!(dm < 1)) issues.push({ code: 'FLOATING_MASS', id: mass.id, value: dm });
		}
	}
	const neck = rig.volumes.find((v) => v.id === 'neck');
	if (neck) {
		const path = volumePath(neck, world);
		const bodyVolume = rig.volumes.find(
			(v) => v.id !== 'neck' && v.part === 'torso' && v.jointIds.includes(neck.jointIds[0])
		);
		const d = bodyVolume ? depth(bodyVolume.id, path[0]) : Infinity;
		if (!(d < 1)) issues.push({ code: 'FLOATING_NECK', id: 'neck', value: d });
		const dh = depth('head', path[path.length - 1]);
		if (!(dh < 1)) issues.push({ code: 'FLOATING_HEAD', id: 'head', value: dh });
	}
	const tail = rig.volumes.find((v) => v.id === 'tail');
	if (tail) {
		const d = depth('torso', volumePath(tail, world)[0]);
		if (!(d < 1)) issues.push({ code: 'FLOATING_TAIL', id: 'tail', value: d });
	}
	for (const f of rig.features) {
		if (!f.hostVolumeId) continue;
		const j = world.get(f.hostJointId);
		if (!j) {
			issues.push({ code: 'FLOATING_FEATURE', id: f.id });
			continue;
		}
		const base = { x: j.x + f.offset.x, y: j.y + f.offset.y, z: j.z + f.offset.z };
		const d = depth(f.hostVolumeId, base);
		if (!(d < 1)) issues.push({ code: 'FLOATING_FEATURE', id: f.id, value: d });
	}
	return issues;
}
