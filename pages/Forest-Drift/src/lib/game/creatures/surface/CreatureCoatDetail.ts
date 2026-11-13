import { createNamedRandom } from '../../terrain/seededRandom';
import type { SpeciesGenome } from '../CreatureTypes';
import { creatureDetailAvailable } from '../biome/creatureCoatSwitches';
import { SURFACE_REGION } from './CreatureSurfaceClassifier';

/**
 * Coat micro-texture (biome-specific creatures Phase 2, decisions Q9, Q10, Q11): fine fur grain,
 * hide wrinkles, scales, chitin plates or skin pores, drawn per pixel by the shared creature shader
 * as bump shading plus a faint albedo grain. No image textures: heights come from the shared 32³
 * noise volume and analytic cells in bind space, so detail rides the skin and never swims.
 *
 * The coat type comes from the body plan (Q10): furred plans wear fur, or bare hide, scales or skin
 * where their biome coat says so; serpents wear scales and hexapods chitin. The biome sets fur
 * thickness and length. Creatures without a biome coat get the same rules with neutral values, so
 * detail applies in every world (Q7).
 */
export type CoatType = 'none' | 'fur' | 'hide' | 'scales' | 'chitin' | 'skin';
/** Shader codes (surface table texel 7.y). */
export const COAT_CODES: Readonly<Record<CoatType, number>> = {
	none: 0,
	fur: 1,
	hide: 2,
	scales: 3,
	chitin: 4,
	skin: 5
};

export interface CoatDetail {
	type: CoatType;
	/** 0..1: how strongly the detail shades (bump and albedo grain). */
	strength: number;
	/** Detail features per body length (grain, scale rows, plates). */
	featuresPerBody: number;
}

/** Feature size limits (metres): giants don't get huge grain, tiny creatures no sub-pixel noise. */
export const COAT_FEATURE_MIN = 0.004;
export const COAT_FEATURE_MAX = 0.06;

const FAMILY_BARE: Record<string, CoatType> = {
	warmDry: 'scales',
	wet: 'skin'
};

/** The coat a species wears, from its body plan, its biome coat and its seed. */
export function coatDetailFor(species: SpeciesGenome): CoatDetail {
	if (!creatureDetailAvailable()) return { type: 'none', strength: 0, featuresPerBody: 0 };
	const plan = species.bodyPlan.id;
	const coat = species.appearance.coat;
	const thickness = coat?.thickness ?? 0.5;
	const length = coat?.length ?? 0.45;
	if (plan === 'serpentine') return { type: 'scales', strength: 0.7, featuresPerBody: 20 };
	if (plan === 'hexapod') return { type: 'chitin', strength: 0.55, featuresPerBody: 7 };
	const rng = createNamedRandom(String(species.seed), `creature-coat-detail-v1:${plan}`);
	const roll = rng();
	if (coat?.bare) {
		const family = familyOf(coat.profile);
		const type = FAMILY_BARE[family] ?? 'hide';
		// Dry biomes split between scaly and bare-hided bodies.
		const chosen = type === 'scales' && roll < 0.5 ? 'hide' : type;
		return chosen === 'scales'
			? { type: 'scales', strength: 0.6, featuresPerBody: 16 }
			: chosen === 'skin'
				? { type: 'skin', strength: 0.4, featuresPerBody: 90 }
				: { type: 'hide', strength: 0.5, featuresPerBody: 18 };
	}
	return {
		type: 'fur',
		strength: 0.3 + 0.45 * thickness,
		// Longer fur reads as coarser locks.
		featuresPerBody: 44 - 20 * length
	};
}

/** Profile id → family, without importing the profile tables into the render path. */
function familyOf(profile: string): string {
	if (
		['desert', 'savanna', 'savannaPlateau', 'shrubSavanna', 'tropicalDryGrassland'].includes(
			profile
		)
	)
		return 'warmDry';
	if (profile === 'swamp') return 'wet';
	return 'other';
}

/** Detail frequency in cycles per metre for a body of `bodyScale` metres, within the size limits. */
export function coatFrequency(detail: CoatDetail, bodyScale: number): number {
	if (detail.type === 'none' || detail.featuresPerBody <= 0) return 0;
	const feature = Math.min(
		COAT_FEATURE_MAX,
		Math.max(COAT_FEATURE_MIN, Math.max(1e-3, bodyScale) / detail.featuresPerBody)
	);
	return 1 / feature;
}

/** LOD multiplier: full at LOD0, faint at LOD1, none at LOD2 (Q11). Mirrors the shader. */
export function coatLodFactor(lod: number): number {
	return lod <= 0 ? 1 : lod === 1 ? 0.35 : 0;
}

/** Where the coat shows: none on eyes, noses and hard adornments, less on feet and fins. */
export function coatRegionMask(region: number): number {
	switch (region) {
		case SURFACE_REGION.EYE:
		case SURFACE_REGION.NOSE:
		case SURFACE_REGION.HORN:
		case SURFACE_REGION.SPIKE:
		case SURFACE_REGION.PLATE:
		case SURFACE_REGION.ANTENNA:
			return 0;
		case SURFACE_REGION.FOOT:
		case SURFACE_REGION.HAND:
			return 0.4;
		case SURFACE_REGION.EAR:
		case SURFACE_REGION.FIN:
		case SURFACE_REGION.FRILL:
		case SURFACE_REGION.TAIL_TIP:
			return 0.6;
		default:
			return 1;
	}
}
