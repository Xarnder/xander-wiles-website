import type { SpeciesGenome, TerrainLocomotion } from './CreatureTypes';
import { resolveSpeciesForm } from './CreatureForm';

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Terrain behaviour from body plan, size and style. Quadrupeds and hexapods follow the support plane
 * closely; bipeds stay upright and mostly pitch the pelvis; serpents conform locally instead of
 * tilting as one body. Small animals climb steeper ground than giants.
 */
export function deriveTerrainLocomotion(
	species: Pick<SpeciesGenome, 'bodyPlan' | 'proportions' | 'anatomy' | 'seed'> &
		Partial<Pick<SpeciesGenome, 'form'>>
): TerrainLocomotion {
	const plan = species.bodyPlan.id,
		p = species.proportions;
	const stature = p.legLength + p.bodyDepth + p.neckLength + p.headSize;
	const form = resolveSpeciesForm(species as SpeciesGenome);
	// ±8° by size: a 0.25 m animal climbs ~8° steeper than a 1 m one, a 16 m giant ~8° less.
	const sizeSlope = clamp(-Math.log2(Math.max(stature, 0.01)) * 4, -8, 8) * DEG;
	const heavy = form.style === 'heavy' ? -4 * DEG : form.style === 'slender' ? 2 * DEG : 0;
	const longNeck = clamp((form.neckScale - 1) * 0.5, 0, 0.25);
	switch (plan) {
		case 'biped':
			return {
				maxWalkSlope: 30 * DEG + sizeSlope + heavy,
				bodyPitchFollowStrength: 0.45,
				bodyRollFollowStrength: 0.18,
				maxBodyPitch: 18 * DEG,
				maxBodyRoll: 7 * DEG,
				bodyGroundResponse: 5,
				footGroundAlignStrength: 0.55,
				stepHeight: 0.14,
				stepTriggerDistance: 0.32,
				dutyFactor: 0.6,
				neckSlopeCompensation: 0.25,
				headSlopeCompensation: 0.45,
				spineSlopeCompensation: 0.5
			};
		case 'hexapod':
			return {
				maxWalkSlope: 42 * DEG + sizeSlope + heavy,
				bodyPitchFollowStrength: 0.95,
				bodyRollFollowStrength: 0.8,
				maxBodyPitch: 40 * DEG,
				maxBodyRoll: 30 * DEG,
				bodyGroundResponse: 8,
				footGroundAlignStrength: 0.8,
				stepHeight: 0.18,
				stepTriggerDistance: 0.3,
				dutyFactor: 0.55,
				neckSlopeCompensation: 0.15,
				headSlopeCompensation: 0.25,
				spineSlopeCompensation: 0
			};
		case 'serpentine':
			return {
				maxWalkSlope: 32 * DEG + sizeSlope + heavy,
				bodyPitchFollowStrength: 1,
				bodyRollFollowStrength: 0.4,
				maxBodyPitch: 35 * DEG,
				maxBodyRoll: 15 * DEG,
				bodyGroundResponse: 4,
				footGroundAlignStrength: 0,
				stepHeight: 0,
				stepTriggerDistance: 0.3,
				dutyFactor: 1,
				neckSlopeCompensation: 0.3,
				headSlopeCompensation: 0.4,
				spineSlopeCompensation: 0
			};
		default:
			return {
				maxWalkSlope: 34 * DEG + sizeSlope + heavy,
				bodyPitchFollowStrength: 0.88,
				bodyRollFollowStrength: 0.6,
				maxBodyPitch: 34 * DEG,
				maxBodyRoll: 22 * DEG,
				bodyGroundResponse: 6,
				footGroundAlignStrength: 0.6,
				stepHeight: 0.13,
				stepTriggerDistance: 0.32,
				dutyFactor: 0.62,
				neckSlopeCompensation: 0.35 + longNeck,
				headSlopeCompensation: 0.3,
				spineSlopeCompensation: 0
			};
	}
}
export function resolveTerrainLocomotion(species: SpeciesGenome): TerrainLocomotion {
	return species.locomotion.terrain ?? deriveTerrainLocomotion(species);
}

const RANGES: Record<keyof TerrainLocomotion, [number, number]> = {
	maxWalkSlope: [0, 1.4],
	bodyPitchFollowStrength: [0, 1],
	bodyRollFollowStrength: [0, 1],
	maxBodyPitch: [0, 1.4],
	maxBodyRoll: [0, 1.4],
	bodyGroundResponse: [0.1, 60],
	footGroundAlignStrength: [0, 1],
	stepHeight: [0, 1],
	stepTriggerDistance: [0.01, 2],
	dutyFactor: [0.2, 1],
	neckSlopeCompensation: [0, 1],
	headSlopeCompensation: [0, 1],
	spineSlopeCompensation: [0, 1]
};
export function validateTerrainLocomotion(value: unknown): string | null {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return 'Invalid terrain locomotion';
	const v = value as Record<string, unknown>;
	for (const [key, [lo, hi]] of Object.entries(RANGES)) {
		const n = v[key];
		if (typeof n !== 'number' || !Number.isFinite(n) || n < lo || n > hi)
			return `Invalid terrain locomotion value: ${key}`;
	}
	return null;
}
