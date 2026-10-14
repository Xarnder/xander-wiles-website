import { Color, SRGBColorSpace } from 'three';
import type { BodyPlanId, CreatureLod } from '../CreatureTypes';
import type { GeometryAccumulator, RegionInfo } from '../SweptBodyVolume';
import {
	patternDetail,
	patternMask,
	sizedPattern,
	type CreatureSurfaceDefinition,
	type IndividualPattern
} from './CreaturePatternGenerator';

/**
 * Compile-time surface classification: everything static about a creature's look is decided once
 * here, never per frame. Broad colour blocks (body, underbelly, accents, far-LOD patterns) are baked
 * into vertex colours; fine patterns (spots, mottling, stripes, bands) get compact per-vertex
 * anatomical coordinates and masks that the shared shader evaluates per pixel.
 */
export const SURFACE_REGION = {
	NONE: 0,
	HEAD: 1,
	MUZZLE: 2,
	NECK: 3,
	TORSO: 4,
	CHEST: 5,
	PELVIS: 6,
	LIMB_FRONT_LEFT: 7,
	LIMB_FRONT_RIGHT: 8,
	LIMB_REAR_LEFT: 9,
	LIMB_REAR_RIGHT: 10,
	LIMB_MID_LEFT: 11,
	LIMB_MID_RIGHT: 12,
	ARM_LEFT: 13,
	ARM_RIGHT: 14,
	TAIL: 15,
	EAR: 16,
	HORN: 17,
	FIN: 18,
	FOOT: 19,
	HAND: 20,
	EYE: 21,
	NOSE: 22,
	JOINT_MASS: 23,
	SPIKE: 24,
	PLATE: 25,
	FRILL: 26,
	ANTENNA: 27,
	TAIL_TIP: 28,
	SERPENT_BODY: 29
} as const;
export type SurfaceRegionId = (typeof SURFACE_REGION)[keyof typeof SURFACE_REGION];
export const SURFACE_REGION_NAMES = Object.fromEntries(
	Object.entries(SURFACE_REGION).map(([name, id]) => [id, name])
) as Record<number, string>;

/** Longitudinal units per limb or tail, so limb bands count per limb rather than per body length. */
export const PART_UNITS = 4;
const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => {
	const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

function limbRegion(kind: string, plan: BodyPlanId): SurfaceRegionId {
	const match = /^limb-(\d+)-(-?1)/.exec(kind);
	if (!match) return SURFACE_REGION.LIMB_FRONT_LEFT;
	const pair = Number(match[1]),
		left = match[2] === '-1';
	if (plan === 'biped')
		return pair === 1
			? left
				? SURFACE_REGION.ARM_LEFT
				: SURFACE_REGION.ARM_RIGHT
			: left
				? SURFACE_REGION.LIMB_REAR_LEFT
				: SURFACE_REGION.LIMB_REAR_RIGHT;
	const last = plan === 'hexapod' ? 2 : 1;
	if (pair === 0) return left ? SURFACE_REGION.LIMB_FRONT_LEFT : SURFACE_REGION.LIMB_FRONT_RIGHT;
	if (pair === last) return left ? SURFACE_REGION.LIMB_REAR_LEFT : SURFACE_REGION.LIMB_REAR_RIGHT;
	return left ? SURFACE_REGION.LIMB_MID_LEFT : SURFACE_REGION.LIMB_MID_RIGHT;
}
export function regionId(info: RegionInfo, t: number, plan: BodyPlanId): SurfaceRegionId {
	switch (info.part) {
		case 'torso':
			if (plan === 'serpentine') return SURFACE_REGION.SERPENT_BODY;
			return t < 0.34
				? SURFACE_REGION.PELVIS
				: t > 0.66
					? SURFACE_REGION.CHEST
					: SURFACE_REGION.TORSO;
		case 'neck':
			return SURFACE_REGION.NECK;
		case 'head':
			return SURFACE_REGION.HEAD;
		case 'muzzle':
			return SURFACE_REGION.MUZZLE;
		case 'nose':
			return SURFACE_REGION.NOSE;
		case 'limb':
			return limbRegion(info.kind, plan);
		case 'joint-mass':
			return SURFACE_REGION.JOINT_MASS;
		case 'foot':
			return SURFACE_REGION.FOOT;
		case 'hand':
			return SURFACE_REGION.HAND;
		case 'tail':
			return SURFACE_REGION.TAIL;
		case 'eye':
		case 'eye-highlight':
			return SURFACE_REGION.EYE;
		case 'feature':
			switch (info.kind) {
				case 'ears':
					return SURFACE_REGION.EAR;
				case 'horns':
					return SURFACE_REGION.HORN;
				case 'fins':
					return SURFACE_REGION.FIN;
				case 'spikes':
					return SURFACE_REGION.SPIKE;
				case 'plates':
					return SURFACE_REGION.PLATE;
				case 'frills':
					return SURFACE_REGION.FRILL;
				case 'antennae':
				case 'antenna-tip':
					return SURFACE_REGION.ANTENNA;
				case 'tail-tip':
					return SURFACE_REGION.TAIL_TIP;
			}
	}
	return SURFACE_REGION.NONE;
}
const isLimb = (r: SurfaceRegionId) =>
	r >= SURFACE_REGION.LIMB_FRONT_LEFT && r <= SURFACE_REGION.ARM_RIGHT;
const isAxial = (r: SurfaceRegionId) =>
	r === SURFACE_REGION.TORSO ||
	r === SURFACE_REGION.CHEST ||
	r === SURFACE_REGION.PELVIS ||
	r === SURFACE_REGION.SERPENT_BODY ||
	r === SURFACE_REGION.NECK ||
	r === SURFACE_REGION.TAIL;

/** Pattern falloff by region: bold on the body, fading down limbs, absent on feet and eyes. */
export function regionPatternWeight(
	pattern: IndividualPattern,
	region: SurfaceRegionId,
	t: number
): number {
	if (pattern.type === 'limb-bands') {
		if (isLimb(region)) return smooth(0.45, 0.6, t) * (1 - smooth(0.93, 0.99, t));
		if (region === SURFACE_REGION.TAIL) return smooth(0.15, 0.3, t);
		return 0;
	}
	const banded = pattern.type === 'bands' || pattern.type === 'stripes';
	const dorsalOnly = pattern.type === 'back-stripe' || pattern.type === 'gradient';
	switch (region) {
		case SURFACE_REGION.TORSO:
		case SURFACE_REGION.CHEST:
		case SURFACE_REGION.PELVIS:
		case SURFACE_REGION.SERPENT_BODY:
			return 1;
		case SURFACE_REGION.NECK:
			return 0.9;
		case SURFACE_REGION.TAIL:
			return 0.85;
		case SURFACE_REGION.JOINT_MASS:
			// Masses carry the body pattern into the limb root, so the seam is not a plain band.
			return banded ? 0.6 : 0.9;
		case SURFACE_REGION.HEAD:
			return banded ? 0.3 : 0.55;
		case SURFACE_REGION.MUZZLE:
			return 0.2;
	}
	if (isLimb(region)) return banded || dorsalOnly ? 0 : 0.7 - 0.4 * smooth(0.3, 0.75, t);
	return 0;
}

export interface SurfaceClassification {
	colors: Float32Array;
	surface: Uint16Array;
	surfacePattern: Uint16Array;
	/** Optional per-vertex masks for Lab debug views. */
	debug?: { underbelly: Float32Array; accent: Float32Array };
}
export interface ClassifyOptions {
	plan: BodyPlanId;
	lod: CreatureLod;
	/**
	 * Body scale (torso path length): patterns are sized relative to the animal, with extra detail
	 * on big bodies (`sizedPattern`).
	 */
	bodyScale: number;
	/** Arc-length fraction for a region's curve parameter (uniform band spacing). */
	arc?: (region: number, t: number) => number;
	accentExtremities: number;
	debug?: boolean;
}

/** Per-vertex classification of a compiled creature (bind pose, creature-local). */
export function classifyCreatureSurface(
	out: GeometryAccumulator,
	positions: Float32Array,
	normals: Float32Array,
	surface: CreatureSurfaceDefinition,
	options: ClassifyOptions
): SurfaceClassification {
	const count = positions.length / 3;
	const colors = new Float32Array(count * 3),
		attributes = new Uint16Array(count * 4),
		pattern = new Uint16Array(count * 4);
	const debug = options.debug
		? { underbelly: new Float32Array(count), accent: new Float32Array(count) }
		: undefined;
	const color = (hex: string) => new Color().setStyle(hex, SRGBColorSpace);
	const pal = surface.palette;
	const primary = color(pal.primary),
		secondary = color(pal.secondary),
		under = color(pal.underbelly),
		accent = color(pal.accent),
		eye = color(pal.eye);
	const secondaryB = surface.secondaryPattern
		? patternColor(surface.secondaryPattern, primary, secondary, under, accent)
		: secondary;
	const nose = eye.clone().lerp(primary, 0.15);
	const horn = under.clone().lerp(accent, 0.3);
	const has = new Set(surface.accents);
	const S = Math.max(1e-4, options.bodyScale);
	const ub = surface.underbelly;
	const bellyEdge = Math.cos(ub.width * Math.PI);
	const A = sizedPattern(surface.primaryPattern, S),
		B = surface.secondaryPattern && sizedPattern(surface.secondaryPattern, S);
	// A big body's fine stripes would alias at far-LOD vertex spacing: bake their average instead.
	const fineRepeats = patternDetail(S) > 2;
	// Far LODs keep major colour blocks: band-like patterns are baked per vertex, noise patterns
	// become their average tint, so a creature does not change colour when it switches LOD.
	const bakeA = options.lod >= 2,
		bakeB = options.lod >= 1;
	const c = new Color();
	for (let v = 0; v < count; v++) {
		const info = out.regions[out.region[v]],
			t = out.params[v];
		const region = regionId(info, t, options.plan);
		const radial = out.radial[v] ?? 0;
		const nx = normals[v * 3],
			ny = normals[v * 3 + 1];
		const x = positions[v * 3],
			y = positions[v * 3 + 1],
			z = positions[v * 3 + 2];
		const arc = options.arc ? options.arc(out.region[v], t) : t;
		const length = info.length ?? 0;
		let u = 0;
		if (isLimb(region)) u = t * PART_UNITS;
		else if (region === SURFACE_REGION.TAIL) u = PART_UNITS * (arc + 0.35 * arc * arc);
		else if (isAxial(region) || region === SURFACE_REGION.HEAD || region === SURFACE_REGION.MUZZLE)
			u = (arc * length) / S;
		let roughness = surface.roughness * (1 - surface.glossVariation * 0.3),
			emissive = 0,
			belly = 0,
			accentMix = 0;
		let maskA = 0,
			maskB = 0;
		switch (info.part) {
			case 'eye':
				c.copy(eye);
				roughness = 0.14;
				break;
			case 'eye-highlight':
				c.setRGB(1, 1, 1);
				roughness = 1;
				emissive = 0.9;
				break;
			case 'nose':
				c.copy(nose);
				roughness = 0.35;
				break;
			case 'foot':
				if (info.kind === 'hoof') {
					c.copy(has.has('feet') ? accent : primary).multiplyScalar(0.85);
					roughness = 0.45;
					accentMix = 1;
				} else {
					accentMix = has.has('feet') ? 0.85 * options.accentExtremities : 0.2;
					c.copy(primary).lerp(accent, accentMix);
				}
				break;
			case 'hand':
				accentMix = has.has('hands') ? 0.7 * options.accentExtremities : 0.15;
				c.copy(primary).lerp(accent, accentMix);
				break;
			case 'feature': {
				const target = featureAccent(info.kind, has);
				if (info.kind === 'horns') {
					c.copy(target ? horn : under.clone().lerp(primary, 0.4));
					roughness = 0.5;
					accentMix = target ? 1 : 0;
				} else if (info.kind === 'antenna-tip') {
					c.copy(target ? accent : secondary);
					accentMix = target ? 1 : 0;
				} else {
					// Base matches the body; the tip carries the accent (or the pattern colour).
					accentMix = smooth(0.1, 0.65, t) * (0.6 + 0.4 * options.accentExtremities);
					c.copy(primary).lerp(target ? accent : secondary, accentMix);
					if (!target) accentMix = 0;
					roughness -= 0.05;
				}
				break;
			}
			default: {
				c.copy(primary);
				// Top a touch deeper, by cross-section rather than world height.
				if (isAxial(region) || region === SURFACE_REGION.HEAD)
					c.multiplyScalar(1 - 0.07 * Math.max(0, radial));
				// Underbelly from the cross-section angle; soft edge.
				const ventral = -radial;
				if (isAxial(region) || region === SURFACE_REGION.JOINT_MASS)
					belly = smooth(bellyEdge - ub.softness, bellyEdge + ub.softness, ventral);
				else if (region === SURFACE_REGION.HEAD)
					belly = smooth(bellyEdge + 0.15 - ub.softness, bellyEdge + 0.15 + ub.softness, ventral);
				else if (region === SURFACE_REGION.MUZZLE)
					belly = Math.max(0.6, smooth(bellyEdge - ub.softness, bellyEdge + ub.softness, ventral));
				else if (isLimb(region)) {
					// Inner upper legs: medial-facing skin near the body.
					const side = /--1/.test(info.kind) ? -1 : 1;
					belly =
						smooth(0.3, 0.85, -side * nx) *
						(1 - smooth(0.2, 0.45, t)) *
						0.7 *
						smooth(-0.6, 0.1, -ny);
				}
				if (region === SURFACE_REGION.JOINT_MASS) belly *= 1 - smooth(0.15, 0.55, t);
				if (
					ub.segmented &&
					(region === SURFACE_REGION.SERPENT_BODY ||
						region === SURFACE_REGION.TORSO ||
						region === SURFACE_REGION.PELVIS)
				)
					belly *= 0.8 + 0.2 * smooth(-0.35, 0.35, Math.sin(TAU * u * 3.5));
				belly = Math.min(1, belly * ub.strength);
				// Limb socks toward the feet when feet carry the accent.
				if (isLimb(region) && has.has('feet') && options.accentExtremities > 0.85) {
					accentMix = 0.6 * smooth(0.86, 0.93, t);
					c.lerp(accent, accentMix);
				}
				roughness += surface.roughnessVariation * (belly * 0.5 - Math.max(0, radial) * 0.5);
				const p = { x: x / S, y: y / S, z: z / S };
				const keep = (pat: IndividualPattern) =>
					regionPatternWeight(pat, region, t) * (pat.type === 'gradient' ? 1 : 1 - 0.85 * belly);
				maskA = keep(A);
				maskB = B ? keep(B) : 0;
				const bake = (pat: IndividualPattern, mask: number, colour: Color) => {
					if (!mask) return;
					const noiseLike =
						pat.type === 'spots' ||
						pat.type === 'mottled' ||
						pat.type === 'dorsal-spots' ||
						(fineRepeats &&
							(pat.type === 'stripes' || pat.type === 'bands' || pat.type === 'limb-bands'));
					const amount = noiseLike
						? pat.density *
							pat.contrast *
							0.5 *
							(pat.type === 'dorsal-spots' ? smooth(-0.1, 0.5, radial) : 1)
						: patternMask(pat, p, u, radial) * pat.contrast;
					c.lerp(colour, amount * mask);
				};
				if (bakeA) {
					bake(A, maskA, secondary);
					maskA = 0;
				}
				if (B && bakeB) {
					bake(B, maskB, secondaryB);
					maskB = 0;
				}
				c.lerp(under, belly);
			}
		}
		colors[v * 3] = c.r;
		colors[v * 3 + 1] = c.g;
		colors[v * 3 + 2] = c.b;
		attributes[v * 4] = Math.round(Math.max(0, Math.min(1, roughness)) * 1000);
		attributes[v * 4 + 1] = Math.round(emissive * 1000);
		attributes[v * 4 + 2] = 0; // surface-table slot, written at instantiation
		attributes[v * 4 + 3] = region;
		pattern[v * 4] = Math.min(65535, Math.round(u * 1024));
		pattern[v * 4 + 1] = Math.round((Math.max(-1, Math.min(1, radial)) * 0.5 + 0.5) * 65535);
		pattern[v * 4 + 2] = Math.round(Math.max(0, Math.min(1, maskA)) * 65535);
		pattern[v * 4 + 3] = Math.round(Math.max(0, Math.min(1, maskB)) * 65535);
		if (debug) {
			debug.underbelly[v] = belly;
			debug.accent[v] = Math.max(0, Math.min(1, accentMix));
		}
	}
	return { colors, surface: attributes, surfacePattern: pattern, debug };
}

function featureAccent(kind: string, has: Set<string>) {
	switch (kind) {
		case 'ears':
			return has.has('ears');
		case 'horns':
			return has.has('horns');
		case 'fins':
			return has.has('fins');
		case 'spikes':
			return has.has('spines');
		case 'plates':
			return has.has('plates');
		case 'frills':
			return has.has('frills');
		case 'antennae':
		case 'antenna-tip':
			return has.has('antennae');
		case 'tail-tip':
			return has.has('tail-tip');
	}
	return true;
}

/** The secondary pattern's colour follows its own tone from the same palette family. */
function patternColor(
	p: IndividualPattern,
	primary: Color,
	secondary: Color,
	under: Color,
	accent: Color
) {
	switch (p.tone) {
		case 'accent':
			return primary.clone().lerp(accent, 0.68);
		case 'underbelly':
			return primary.clone().lerp(under, 0.72);
		case 'dark':
			return primary.clone().multiplyScalar(0.62);
		default:
			return secondary.clone();
	}
}
export { patternColor };
