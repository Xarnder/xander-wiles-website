import { createNamedRandom, hashStringToUint32 } from '../terrain/seededRandom';
import type {
	BodyPlanId,
	CreatureFeatureKind,
	CreaturePattern,
	SpeciesGenome
} from './CreatureTypes';

/** V1 dimensions are reference metres; scaleRange bounds individual.sizeFactor, not height. */
export function generateSpecies(seed: number, bodyPlan: BodyPlanId = 'quadruped'): SpeciesGenome {
	if (!Number.isSafeInteger(seed)) throw new Error('Creature seed must be a safe integer');
	const rng = createNamedRandom(String(seed), `creature-species-v1:${bodyPlan}`);
	const between = (a: number, b: number) => a + rng() * (b - a);
	const pick = <T>(items: readonly T[]) => items[Math.floor(rng() * items.length)];
	const strategy = pick(['longleg', 'round', 'longbody', 'crownhead'] as const);
	const stature = Math.exp(between(Math.log(0.12), Math.log(25)));
	const leg = strategy === 'longleg' ? between(1.3, 1.8) : between(0.45, 0.8);
	const length = strategy === 'longbody' ? between(2.3, 3.1) : between(1.05, 1.55);
	const depth = strategy === 'round' ? between(0.85, 1.15) : between(0.42, 0.65);
	const head = strategy === 'crownhead' ? between(0.65, 0.85) : between(0.3, 0.46);
	const neck = strategy === 'longleg' ? between(0.5, 0.85) : between(0.18, 0.35);
	const adjustedLeg = bodyPlan === 'serpentine' ? 0.06 : bodyPlan === 'hexapod' ? leg * 0.5 : leg;
	const adjustedLength = bodyPlan === 'serpentine' ? length * 2.8 : length;
	const referenceHeight = adjustedLeg + depth + neck + head;
	const scale = stature / referenceHeight;
	const dominant: Record<typeof strategy, CreatureFeatureKind> = {
		longleg: 'antennae',
		round: 'plates',
		longbody: 'fins',
		crownhead: 'horns'
	};
	const features: CreatureFeatureKind[] = [
		'eyes',
		dominant[strategy],
		pick(['ears', 'frills', 'spikes', 'tail-tip'] as const)
	];
	if (bodyPlan !== 'serpentine') features.push('feet');
	const hue = between(0, 360);
	const light = between(0.38, 0.62);
	const color = (h: number, saturation: number, lightness: number) => {
		const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
		const hh = (((h % 360) + 360) % 360) / 60;
		const x = chroma * (1 - Math.abs((hh % 2) - 1));
		const rgb =
			hh < 1
				? [chroma, x, 0]
				: hh < 2
					? [x, chroma, 0]
					: hh < 3
						? [0, chroma, x]
						: hh < 4
							? [0, x, chroma]
							: hh < 5
								? [x, 0, chroma]
								: [chroma, 0, x];
		return (
			'#' +
			rgb
				.map((v) =>
					Math.round((v + lightness - chroma / 2) * 255)
						.toString(16)
						.padStart(2, '0')
				)
				.join('')
		);
	};
	const fear = between(0.2, 0.9);
	const sociality = between(0.15, 0.95);
	const speed = Math.min(4, Math.sqrt(stature) * between(0.35, 0.75));
	const footPhaseOffsets =
		bodyPlan === 'hexapod'
			? [0, 0.5, 0.5, 0, 0, 0.5]
			: bodyPlan === 'biped'
				? [0, 0.5]
				: bodyPlan === 'serpentine'
					? []
					: [0, 0.5, 0.5, 0];
	return {
		id: `sp_1_${(hashStringToUint32(`${seed}:${bodyPlan}`) >>> 0).toString(16)}`,
		name: `${pick(['Moss', 'Dusk', 'Amber', 'Mist', 'River', 'Moon'])} ${strategy === 'longleg' ? 'Stilt' : strategy === 'round' ? 'Pebbleback' : strategy === 'longbody' ? 'Ribbon' : 'Crownling'}`,
		seed,
		generatorVersion: 1,
		bodyPlan: {
			id: bodyPlan,
			spineSegments: bodyPlan === 'serpentine' ? 10 + Math.floor(rng() * 7) : 4
		},
		proportions: {
			bodyLength: adjustedLength * scale,
			bodyWidth: depth * between(0.65, 0.9) * scale,
			bodyDepth: depth * scale,
			chestScale: strategy === 'crownhead' ? 1.2 : between(0.95, 1.1),
			waistScale: strategy === 'round' ? 1.05 : 0.76,
			neckLength: neck * scale,
			headSize: head * scale,
			legLength: adjustedLeg * scale,
			legThickness: Math.max(depth * 0.15, adjustedLeg * 0.09) * scale,
			stanceWidth: depth * 0.85 * scale,
			tailLength: (strategy === 'longbody' ? 1.3 : 0.65) * scale,
			tailThickness: depth * 0.23 * scale,
			frontLegRatio: between(0.9, 1.05)
		},
		anatomy: {
			symmetryStrength: between(0.95, 1),
			features,
			signatureTraits: [strategy, dominant[strategy], bodyPlan],
			featureScale: between(0.8, 1.15)
		},
		appearance: {
			palette: {
				primary: color(hue, 0.42, light),
				secondary: color(hue + 20, 0.3, Math.min(0.85, light + 0.18)),
				accent: color(hue + 155, 0.48, 0.58),
				eye: '#18252b',
				roughness: between(0.65, 0.9),
				metalness: 0,
				pattern: pick<CreaturePattern>([
					'solid',
					'gradient',
					'belly',
					'stripe',
					'spots',
					'bands',
					'limb-tips'
				])
			}
		},
		locomotion: {
			gait: {
				walkFrequency: Math.max(0.25, Math.min(2.5, 0.9 / Math.sqrt(stature))),
				runFrequency: Math.max(0.5, Math.min(4, 1.7 / Math.sqrt(stature))),
				strideLength: adjustedLeg * scale * 0.65,
				strideLift: adjustedLeg * scale * 0.18,
				bodyBob: stature * 0.012,
				bodySway: stature * 0.008,
				headBob: stature * 0.009,
				tailSway: 0.18,
				footPhaseOffsets
			}
		},
		behaviour: {
			curiosity: (1 - fear) * between(0.5, 1),
			fear,
			sociality,
			territoriality: between(0, 0.3),
			preferredGroupSize: 1 + Math.round(sociality * 6),
			wanderSpeed: speed,
			fleeSpeed: speed * 2.8,
			wanderRadius: Math.max(4, stature * 4),
			awarenessRadius: Math.max(5, stature * 3),
			comfortDistance: Math.max(0.6, stature * 0.9)
		},
		scaleRange: { min: 0.9, max: 1.1 },
		individualVariation: {
			size: 0.1,
			proportions: 0.07,
			hue: 0.025,
			features: 0.08,
			behaviour: 0.12
		}
	};
}
