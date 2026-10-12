import { createNamedRandom } from '../terrain/seededRandom';
import type {
	BodyPlanId,
	CreatureFeatureKind,
	CreatureStyle,
	FeatureShape,
	FootType,
	HandType,
	SpeciesForm,
	SpeciesGenome,
	TailTipShape,
	TorsoProfile
} from './CreatureTypes';

/**
 * Art-direction rules shared by every body plan. A species gets a style preset (which biases
 * proportions, joint roundness, taper and eye size inside one global visual language), one dominant
 * and one secondary signature trait, and sometimes a minor one. Nothing here is a hand-made creature:
 * every value is drawn from bounded ranges by the species seed.
 */

type Range = readonly [number, number];
interface StylePreset {
	limbTaper: Range;
	jointScale: Range;
	headScale: Range;
	eyeScale: Range;
	mass: number;
	neckScale: Range;
	neckThickness: Range;
	torso: readonly TorsoProfile[];
	feet: readonly FootType[];
	muzzle: Range;
}
export const CREATURE_STYLE_PRESETS: Record<CreatureStyle, StylePreset> = {
	elegant: {
		limbTaper: [0.5, 0.62],
		jointScale: [1.1, 1.2],
		headScale: [0.95, 1.05],
		eyeScale: [1.05, 1.2],
		mass: 0.95,
		neckScale: [1.15, 1.4],
		neckThickness: [0.8, 0.95],
		torso: ['deep-chested', 'slender', 'compact'],
		feet: ['hoof', 'two-toe', 'leaf'],
		muzzle: [0.25, 0.45]
	},
	heavy: {
		limbTaper: [0.72, 0.84],
		jointScale: [1.05, 1.12],
		headScale: [0.78, 0.92],
		eyeScale: [0.9, 1.05],
		mass: 1.25,
		neckScale: [0.6, 0.85],
		neckThickness: [1.2, 1.4],
		torso: ['round', 'rear-heavy', 'front-heavy', 'pear'],
		feet: ['paw', 'hoof', 'three-toe'],
		muzzle: [0.3, 0.5]
	},
	chunky: {
		limbTaper: [0.66, 0.78],
		jointScale: [1.1, 1.2],
		headScale: [0.98, 1.1],
		eyeScale: [1.05, 1.2],
		mass: 1.15,
		neckScale: [0.8, 1],
		neckThickness: [1.05, 1.25],
		torso: ['compact', 'round', 'front-heavy'],
		feet: ['paw', 'hoof', 'three-toe'],
		muzzle: [0.2, 0.4]
	},
	cute: {
		limbTaper: [0.6, 0.72],
		jointScale: [1.05, 1.12],
		headScale: [1.12, 1.3],
		eyeScale: [1.3, 1.55],
		mass: 1,
		neckScale: [0.7, 0.9],
		neckThickness: [1, 1.15],
		torso: ['round', 'pear', 'compact'],
		feet: ['paw', 'leaf', 'two-toe'],
		muzzle: [0.12, 0.28]
	},
	slender: {
		limbTaper: [0.52, 0.65],
		jointScale: [1.05, 1.15],
		headScale: [0.9, 1],
		eyeScale: [1, 1.15],
		mass: 0.9,
		neckScale: [1, 1.25],
		neckThickness: [0.8, 0.95],
		torso: ['long', 'slender'],
		feet: ['two-toe', 'three-toe', 'leaf'],
		muzzle: [0.3, 0.55]
	}
};

const STYLE_BY_STRATEGY: Record<string, readonly CreatureStyle[]> = {
	longleg: ['elegant', 'elegant', 'slender', 'cute'],
	round: ['heavy', 'heavy', 'chunky', 'cute'],
	longbody: ['slender', 'slender', 'elegant', 'chunky'],
	crownhead: ['cute', 'cute', 'chunky', 'elegant']
};

/** Signature traits. `features` are the anatomy kinds a trait needs to be visible. */
export const CREATURE_TRAITS: Record<
	string,
	{
		features?: CreatureFeatureKind[];
		plans?: BodyPlanId[];
		excludes?: string[];
		apply(form: SpeciesForm, between: (a: number, b: number) => number): void;
	}
> = {
	'huge-ears': {
		features: ['ears'],
		apply(f, r) {
			f.earScale = r(1.6, 1.9);
			if (f.earShape === 'diamond') f.earShape = 'leaf';
		}
	},
	'long-neck': {
		plans: ['quadruped', 'biped', 'hexapod'],
		excludes: ['short-neck'],
		apply(f) {
			f.neckScale *= 1.4;
			f.neckThickness *= 0.9;
			f.neckCurve = Math.min(0.45, f.neckCurve + 0.15);
		}
	},
	'short-neck': {
		plans: ['quadruped', 'biped', 'hexapod'],
		excludes: ['long-neck'],
		apply(f) {
			f.neckScale *= 0.65;
			f.neckThickness *= 1.15;
		}
	},
	'very-long-legs': {
		plans: ['quadruped', 'biped', 'hexapod'],
		apply(f) {
			// Long levers need visibly stronger roots.
			f.shoulderMass += 0.15;
			f.hipMass += 0.15;
			f.limbTaper = Math.max(0.45, f.limbTaper - 0.05);
		}
	},
	'round-belly': {
		apply(f, r) {
			f.torsoProfile = r(0, 1) < 0.5 ? 'round' : 'pear';
			f.bellySag = Math.min(0.3, f.bellySag + 0.12);
		}
	},
	'tiny-head': {
		excludes: ['big-head'],
		apply(f) {
			f.headScale *= 0.8;
		}
	},
	'heavy-haunches': {
		plans: ['quadruped', 'biped', 'hexapod'],
		excludes: ['broad-shoulders'],
		apply(f) {
			f.hipMass += 0.35;
			f.haunchRoundness = Math.min(1, f.haunchRoundness + 0.2);
			f.torsoProfile = 'rear-heavy';
		}
	},
	'broad-shoulders': {
		plans: ['quadruped', 'biped', 'hexapod'],
		excludes: ['heavy-haunches'],
		apply(f) {
			f.shoulderMass += 0.35;
			f.torsoProfile = 'front-heavy';
		}
	},
	'long-tail': {
		apply(f) {
			f.tailScale *= 1.6;
		}
	},
	'curled-tail': {
		apply(f, r) {
			f.tailCurl = r(0.7, 1);
		}
	},
	'dorsal-fin': {
		features: ['fins'],
		apply(f) {
			f.backShape = 'fin';
			f.backScale *= 1.25;
		}
	},
	'back-spikes': {
		features: ['spikes'],
		apply(f) {
			f.backShape = 'spike';
		}
	},
	'tall-plates': {
		features: ['plates'],
		apply(f, r) {
			f.backShape = r(0, 1) < 0.6 ? 'plate' : 'diamond';
			f.backScale *= 1.45;
		}
	},
	snout: {
		excludes: ['big-head'],
		apply(f, r) {
			f.muzzleLength = r(0.55, 0.75);
			f.muzzleWidth *= 0.9;
		}
	},
	'big-head': {
		excludes: ['tiny-head', 'snout'],
		apply(f) {
			f.headScale *= 1.22;
			f.eyeScale *= 1.1;
		}
	},
	'big-eyes': {
		apply(f) {
			f.eyeScale *= 1.3;
		}
	},
	horned: {
		features: ['horns'],
		apply(f, r) {
			f.hornShape = 'horn';
			f.featureCurl = r(0.3, 0.5);
		}
	},
	'small-horns': { features: ['horns'], apply: () => {} },
	antennae: { features: ['antennae'], apply: () => {} },
	frilled: { features: ['frills'], apply: () => {} },
	'tail-tip': {
		features: ['tail-tip'],
		apply(f, r) {
			f.tailTip = (['leaf', 'club', 'diamond', 'tuft'] as const)[Math.floor(r(0, 3.999))];
		}
	}
};

const DOMINANT: Record<string, readonly string[]> = {
	longleg: ['huge-ears', 'long-neck', 'very-long-legs'],
	round: ['round-belly', 'tall-plates', 'tiny-head', 'heavy-haunches'],
	longbody: ['long-tail', 'dorsal-fin', 'back-spikes', 'snout'],
	crownhead: ['big-head', 'big-eyes', 'horned', 'huge-ears']
};
const SERPENT_DOMINANT = ['dorsal-fin', 'back-spikes', 'big-head', 'frilled'];
const SECONDARY = [
	'long-neck',
	'short-neck',
	'long-tail',
	'curled-tail',
	'snout',
	'big-eyes',
	'broad-shoulders',
	'heavy-haunches',
	'horned',
	'huge-ears',
	'antennae',
	'frilled',
	'back-spikes',
	'tall-plates'
];
const MINOR = ['tail-tip', 'antennae', 'small-horns', 'big-eyes', 'curled-tail', 'frilled'];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Deterministic from the species seed, body plan and silhouette strategy only — never from the
 * species' feature list — so a recipe saved before forms existed derives exactly what a new species
 * with the same seed is generated with.
 */
export function deriveSpeciesForm(
	species: Pick<SpeciesGenome, 'seed' | 'bodyPlan' | 'anatomy'>
): SpeciesForm {
	const plan = species.bodyPlan.id,
		strategy = species.anatomy.signatureTraits[0] ?? 'round';
	const rng = createNamedRandom(String(species.seed), `creature-form-v1:${plan}:${strategy}`);
	const between = (a: number, b: number) => a + rng() * (b - a);
	const range = (r: Range) => between(r[0], r[1]);
	const pick = <T>(items: readonly T[]) => items[Math.floor(rng() * items.length)];
	const style = pick(STYLE_BY_STRATEGY[strategy] ?? STYLE_BY_STRATEGY.round);
	const preset = CREATURE_STYLE_PRESETS[style];
	const legged = plan !== 'serpentine';
	const hasMuzzle = rng() < (style === 'cute' ? 0.55 : 0.8);
	const form: SpeciesForm = {
		style,
		torsoProfile:
			plan === 'serpentine' ? 'long' : strategy === 'longbody' ? 'long' : pick(preset.torso),
		traits: { dominant: '', secondary: '', minor: '' },
		limbRootPenetration: between(0.62, 0.85),
		shoulderMass: between(0.95, 1.1) * preset.mass,
		hipMass: between(1, 1.15) * preset.mass,
		haunchRoundness: between(0.4, 0.8),
		jointMassScale: between(0.92, 1.08),
		shoulderSpread: plan === 'hexapod' ? between(0.78, 0.9) : between(0.42, 0.58),
		hipSpread: plan === 'hexapod' ? between(0.75, 0.88) : between(0.45, 0.6),
		limbRootAngle: between(0.25, 0.5),
		limbTaper: range(preset.limbTaper),
		jointScale: range(preset.jointScale),
		footType:
			plan === 'hexapod' ? pick(['three-toe', 'two-toe', 'leaf'] as const) : pick(preset.feet),
		handType: pick<HandType>(['mitten', 'paw', 'leaf', 'fingers']),
		footScale: style === 'heavy' ? between(1.12, 1.3) : between(0.92, 1.12),
		chestDepth: between(0.95, 1.12),
		bellySag: between(0, 0.12),
		headScale:
			range(preset.headScale) * (plan === 'serpentine' ? 1.15 : plan === 'biped' ? 1.2 : 1),
		headLength: between(1, 1.22),
		headWidth: between(0.9, 1.08),
		muzzleLength: hasMuzzle ? range(preset.muzzle) : 0,
		muzzleWidth: between(0.46, 0.6),
		muzzleHeight: between(0.36, 0.48),
		eyeScale: range(preset.eyeScale),
		eyeSpacing: style === 'cute' ? between(0.5, 0.65) : between(0.6, 0.82),
		eyeHeight: between(0.14, 0.3),
		neckScale: range(preset.neckScale),
		neckThickness: range(preset.neckThickness),
		neckCurve: between(0, 0.3),
		earShape: pick<FeatureShape>(['leaf', 'leaf', 'rounded-ear', 'petal', 'diamond']),
		hornShape: pick<FeatureShape>(['horn', 'horn', 'spike']),
		backShape: pick<FeatureShape>(['spike', 'plate', 'fin', 'leaf']),
		featureCurl: between(0.12, 0.35),
		earScale: between(0.9, 1.15),
		backScale: between(0.9, 1.1),
		tailScale: 1,
		tailCurl: between(0, 0.25),
		tailCarriage: between(-0.2, 0.45),
		tailTip: pick<TailTipShape>(['leaf', 'club', 'diamond', 'tuft']),
		bellyStrength: between(0.55, 0.9),
		accentExtremities: between(0.6, 1)
	};
	const allowed = (name: string, taken: string[]) => {
		const trait = CREATURE_TRAITS[name];
		return (
			!taken.includes(name) &&
			(!trait.plans || trait.plans.includes(plan)) &&
			!taken.some((t) => CREATURE_TRAITS[t]?.excludes?.includes(name)) &&
			!(trait.excludes ?? []).some((t) => taken.includes(t)) &&
			(legged || !['broad-shoulders', 'heavy-haunches', 'very-long-legs'].includes(name))
		);
	};
	const dominantPool = (plan === 'serpentine' ? SERPENT_DOMINANT : DOMINANT[strategy]) ?? SECONDARY;
	const dominant = pick(dominantPool.filter((t) => allowed(t, [])));
	const secondary = pick(SECONDARY.filter((t) => allowed(t, [dominant])));
	const minorCandidates = MINOR.filter((t) => allowed(t, [dominant, secondary]));
	const minor = rng() < 0.6 && minorCandidates.length ? pick(minorCandidates) : '';
	form.traits = { dominant, secondary, minor };
	for (const name of [dominant, secondary, minor])
		if (name) CREATURE_TRAITS[name].apply(form, between);
	form.shoulderMass = clamp(form.shoulderMass, 0.6, 1.8);
	form.hipMass = clamp(form.hipMass, 0.6, 1.8);
	form.headScale = clamp(form.headScale, 0.6, 1.6);
	form.eyeScale = clamp(form.eyeScale, 0.7, 2);
	form.neckScale = clamp(form.neckScale, 0.4, 2);
	return form;
}

/** Feature kinds a form's traits need to read; species generation adds them to anatomy.features. */
export function traitFeatures(form: SpeciesForm): CreatureFeatureKind[] {
	const out: CreatureFeatureKind[] = [];
	for (const name of [form.traits.dominant, form.traits.secondary, form.traits.minor])
		for (const kind of CREATURE_TRAITS[name]?.features ?? [])
			if (!out.includes(kind)) out.push(kind);
	return out;
}

export function resolveSpeciesForm(species: SpeciesGenome): SpeciesForm {
	return species.form ?? deriveSpeciesForm(species);
}

const STYLES: CreatureStyle[] = ['elegant', 'chunky', 'cute', 'slender', 'heavy'];
const PROFILES: TorsoProfile[] = [
	'slender',
	'deep-chested',
	'round',
	'pear',
	'rear-heavy',
	'front-heavy',
	'long',
	'compact'
];
const FEET: FootType[] = ['hoof', 'paw', 'two-toe', 'three-toe', 'leaf'];
const HANDS: HandType[] = ['mitten', 'paw', 'leaf', 'fingers'];
const SHAPES: FeatureShape[] = [
	'leaf',
	'petal',
	'spike',
	'rounded-ear',
	'fin',
	'plate',
	'horn',
	'diamond'
];
const TIPS: TailTipShape[] = ['leaf', 'club', 'diamond', 'tuft'];
/** Generous numeric bounds: Lab tuning may exceed generated ranges but never break geometry. */
const FORM_RANGES: Partial<Record<keyof SpeciesForm, Range>> = {
	limbRootPenetration: [0, 1.5],
	shoulderMass: [0, 2.5],
	hipMass: [0, 2.5],
	haunchRoundness: [0, 1],
	jointMassScale: [0, 2],
	shoulderSpread: [0, 1],
	hipSpread: [0, 1],
	limbRootAngle: [0, 1.2],
	limbTaper: [0.2, 1.2],
	jointScale: [0.8, 1.6],
	footScale: [0.4, 2],
	chestDepth: [0.6, 1.6],
	bellySag: [0, 0.5],
	headScale: [0.4, 2.2],
	headLength: [0.7, 1.6],
	headWidth: [0.6, 1.5],
	muzzleLength: [0, 1.2],
	muzzleWidth: [0.2, 0.9],
	muzzleHeight: [0.2, 0.8],
	eyeScale: [0.4, 2.5],
	eyeSpacing: [0.2, 1.2],
	eyeHeight: [-0.2, 0.7],
	neckScale: [0.3, 2.5],
	neckThickness: [0.5, 2],
	neckCurve: [0, 0.6],
	featureCurl: [0, 0.8],
	earScale: [0.4, 2.5],
	tailScale: [0, 2.5],
	tailCurl: [0, 1.2],
	tailCarriage: [-0.8, 1],
	bellyStrength: [0, 1],
	accentExtremities: [0, 1],
	backScale: [0.2, 2.5]
};

/** Rejects malformed saved forms before compilation. Returns an error message or null. */
export function validateSpeciesForm(value: unknown): string | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Invalid species form';
	const f = value as Record<string, unknown>;
	const traits = f.traits as Record<string, unknown> | undefined;
	if (
		!STYLES.includes(f.style as CreatureStyle) ||
		!PROFILES.includes(f.torsoProfile as TorsoProfile) ||
		!FEET.includes(f.footType as FootType) ||
		!HANDS.includes(f.handType as HandType) ||
		![f.earShape, f.hornShape, f.backShape].every((s) => SHAPES.includes(s as FeatureShape)) ||
		!TIPS.includes(f.tailTip as TailTipShape) ||
		!traits ||
		typeof traits !== 'object' ||
		!['dominant', 'secondary', 'minor'].every(
			(k) => typeof traits[k] === 'string' && (traits[k] as string).length <= 40
		)
	)
		return 'Invalid species form vocabulary';
	for (const [key, r] of Object.entries(FORM_RANGES)) {
		if (!r) continue;
		const v = f[key];
		if (typeof v !== 'number' || !Number.isFinite(v) || v < r[0] || v > r[1])
			return `Invalid species form value: ${key}`;
	}
	return null;
}
