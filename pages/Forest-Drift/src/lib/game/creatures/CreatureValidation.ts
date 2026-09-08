import type { SpeciesGenome } from './CreatureTypes';

type RecordValue = Record<string, unknown>;
const object = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown, min: number, max: number): v is number =>
	typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 160;
const fields = (v: unknown, keys: string[], min: number, max: number) =>
	object(v) && keys.every((k) => number(v[k], min, max));
const plans = ['quadruped', 'biped', 'hexapod', 'serpentine'];
const featureKinds = [
	'eyes',
	'ears',
	'horns',
	'antennae',
	'spikes',
	'fins',
	'frills',
	'plates',
	'feet',
	'tail-tip'
];

/** Validate untrusted saved recipes before any geometry or GPU allocation. */
export function validateSpecies(value: unknown): string | null {
	if (!object(value)) return 'Species must be an object';
	const s = value;
	if (!text(s.id) || !text(s.name) || !Number.isSafeInteger(s.seed) || s.generatorVersion !== 1)
		return 'Invalid species identity or generator version';
	if (
		!object(s.bodyPlan) ||
		!plans.includes(String(s.bodyPlan.id)) ||
		!number(s.bodyPlan.spineSegments, 2, 24) ||
		!Number.isInteger(s.bodyPlan.spineSegments)
	)
		return 'Invalid body plan';
	if (
		!fields(
			s.proportions,
			[
				'bodyLength',
				'bodyWidth',
				'bodyDepth',
				'neckLength',
				'headSize',
				'legLength',
				'legThickness',
				'stanceWidth',
				'tailLength',
				'tailThickness'
			],
			0.0001,
			300
		) ||
		!fields(s.proportions, ['chestScale', 'waistScale', 'frontLegRatio'], 0.1, 3)
	)
		return 'Invalid anatomical dimensions';
	if (
		!object(s.anatomy) ||
		!number(s.anatomy.symmetryStrength, 0, 1) ||
		!number(s.anatomy.featureScale, 0.1, 3) ||
		!Array.isArray(s.anatomy.features) ||
		s.anatomy.features.length > 10 ||
		!s.anatomy.features.every((f) => featureKinds.includes(String(f))) ||
		new Set(s.anatomy.features).size !== s.anatomy.features.length ||
		!Array.isArray(s.anatomy.signatureTraits) ||
		s.anatomy.signatureTraits.length > 10 ||
		!s.anatomy.signatureTraits.every(text)
	)
		return 'Invalid anatomy features';
	if (!object(s.appearance) || !object(s.appearance.palette)) return 'Invalid appearance';
	const p = s.appearance.palette;
	if (
		!['primary', 'secondary', 'accent', 'eye'].every(
			(k) => typeof p[k] === 'string' && /^#[0-9a-f]{6}$/i.test(p[k] as string)
		) ||
		!number(p.roughness, 0, 1) ||
		!number(p.metalness, 0, 1) ||
		!['solid', 'gradient', 'belly', 'stripe', 'spots', 'bands', 'limb-tips'].includes(
			String(p.pattern)
		)
	)
		return 'Invalid palette';
	if (
		!object(s.locomotion) ||
		!fields(s.locomotion.gait, ['walkFrequency', 'runFrequency'], 0.01, 20) ||
		!fields(
			s.locomotion.gait,
			['strideLength', 'strideLift', 'bodyBob', 'bodySway', 'headBob', 'tailSway'],
			0,
			300
		)
	)
		return 'Invalid gait';
	const gait = s.locomotion.gait as RecordValue;
	const count =
		s.bodyPlan.id === 'quadruped'
			? 4
			: s.bodyPlan.id === 'hexapod'
				? 6
				: s.bodyPlan.id === 'biped'
					? 2
					: 0;
	if (
		!Array.isArray(gait.footPhaseOffsets) ||
		gait.footPhaseOffsets.length !== count ||
		!gait.footPhaseOffsets.every((v) => number(v, 0, 1))
	)
		return 'Invalid limb phases';
	if (
		!fields(s.behaviour, ['curiosity', 'fear', 'sociality', 'territoriality'], 0, 1) ||
		!fields(
			s.behaviour,
			['wanderSpeed', 'fleeSpeed', 'wanderRadius', 'awarenessRadius', 'comfortDistance'],
			0.001,
			1000
		) ||
		!object(s.behaviour) ||
		!number(s.behaviour.preferredGroupSize, 1, 30) ||
		!Number.isInteger(s.behaviour.preferredGroupSize)
	)
		return 'Invalid behaviour';
	if (
		!fields(s.scaleRange, ['min', 'max'], 0.01, 100) ||
		!object(s.scaleRange) ||
		Number(s.scaleRange.min) > Number(s.scaleRange.max)
	)
		return 'Invalid size range';
	if (
		!fields(s.individualVariation, ['size', 'proportions', 'hue', 'features', 'behaviour'], 0, 0.5)
	)
		return 'Invalid mutation limits';
	if (s.voiceProfileId !== undefined && !text(s.voiceProfileId)) return 'Invalid voice profile';
	return null;
}

export function validateIndividual(value: unknown, species: SpeciesGenome): string | null {
	if (!object(value)) return 'Individual must be an object';
	const i = value,
		r = species.individualVariation;
	if (!text(i.id) || i.speciesId !== species.id || !Number.isSafeInteger(i.seed))
		return 'Invalid individual identity';
	if (!number(i.sizeFactor, species.scaleRange.min, species.scaleRange.max))
		return 'Individual size outside species range';
	if (
		!fields(
			i.proportionVariation,
			['length', 'width', 'legs', 'head'],
			1 - r.proportions,
			1 + r.proportions
		)
	)
		return 'Individual proportions outside species range';
	if (
		!object(i.paletteVariation) ||
		!number(i.paletteVariation.hue, -r.hue, r.hue) ||
		!number(i.paletteVariation.lightness, -0.035, 0.035)
	)
		return 'Individual palette outside species range';
	if (
		!object(i.featureVariation) ||
		!number(i.featureVariation.scale, 1 - r.features, 1 + r.features) ||
		!number(
			i.featureVariation.asymmetry,
			-(1 - species.anatomy.symmetryStrength),
			1 - species.anatomy.symmetryStrength
		)
	)
		return 'Individual features outside species range';
	if (
		!object(i.behaviouralVariation) ||
		!number(i.behaviouralVariation.curiosity, -r.behaviour, r.behaviour) ||
		!number(i.behaviouralVariation.fear, -r.behaviour, r.behaviour) ||
		!number(i.behaviouralVariation.speed, 1 - r.behaviour, 1 + r.behaviour)
	)
		return 'Individual behaviour outside species range';
	if (i.age !== undefined && !number(i.age, 0, 10000)) return 'Invalid individual age';
	return null;
}
