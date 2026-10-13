/**
 * Deterministic plant species from one seed. A species is a few hundred bytes of rules — the
 * expensive parts (prototype geometry) compile lazily and only for species actually near the
 * player (see PlantPrototypeCache).
 *
 * Parameters are CORRELATED, never independent dice: the family picks the petal and leaf
 * vocabularies, a size class picks height and everything that scales with it (head size, stem
 * thickness, spacing, LOD distance), big heads get thicker stems, tall plants get fewer larger
 * leaves, succulents are stemless and stiff, ferns never flower. That keeps every species a
 * recognisable "signature" rather than procedural confetti.
 *
 * Draw order from the seeded RNG is fixed: never add a draw in the middle (it would change every
 * existing species); append, or use a separate named stream.
 */
import { rng } from '../atlas/alphaAtlas';
import { impostorTile } from './plantAtlas';
import { generatePlantPalette, paletteIssues, pickColourFamily, type Random } from './plantPalette';
import {
	FLOWER_FAMILIES,
	GROUND_FAMILIES,
	type FlowerDefinition,
	type FoliageDefinition,
	type LeafShape,
	type PetalShape,
	type PlantFamily,
	type PlantKind,
	type PlantRarity,
	type PlantSpacingClass,
	type PlantSpeciesDefinition
} from './PlantTypes';

const range = (random: Random, min: number, max: number) => min + random() * (max - min);
const int = (random: Random, min: number, max: number) => Math.floor(range(random, min, max + 1));
const pick = <T>(random: Random, items: readonly T[]): T =>
	items[Math.floor(random() * items.length)];

function weighted<T extends string>(random: Random, weights: readonly (readonly [T, number])[]): T {
	const total = weights.reduce((sum, [, w]) => sum + w, 0);
	let target = random() * total;
	for (const [value, w] of weights) {
		target -= w;
		if (target < 0) return value;
	}
	return weights[weights.length - 1][0];
}

const FLOWER_WEIGHTS: readonly (readonly [PlantFamily, number])[] = [
	['radial-flower', 3],
	['star-flower', 2],
	['cup-flower', 1.5],
	['bell-flower', 1.5],
	['spike-flower', 1.5],
	['orb-flower', 1.1],
	['cluster-flower', 1.5]
];
const GROUND_WEIGHTS: readonly (readonly [PlantFamily, number])[] = [
	['rosette', 2],
	['fern', 2],
	['broadleaf', 1.5],
	['clover', 2],
	['succulent', 1],
	['ground-tuft', 1.5]
];

const PETALS_BY_FAMILY: Partial<Record<PlantFamily, readonly PetalShape[]>> = {
	'radial-flower': ['round', 'narrow', 'teardrop', 'heart', 'curved', 'wide'],
	'star-flower': ['pointed', 'diamond', 'narrow'],
	'cup-flower': ['round', 'wide', 'heart', 'teardrop'],
	'bell-flower': ['round', 'curved', 'wide'],
	'spike-flower': ['round', 'teardrop', 'heart'],
	'orb-flower': ['round'],
	'cluster-flower': ['round', 'heart', 'teardrop', 'pointed'],
	clover: ['round']
};

/** Size classes: [height min, max] metres and a weight. Giants stay rare. */
const FLOWER_SIZES: readonly (readonly [readonly [number, number], number])[] = [
	[[0.07, 0.13], 0.18],
	[[0.18, 0.34], 0.45],
	[[0.38, 0.75], 0.32],
	[[0.85, 1.3], 0.05]
];

export function speciesId(seed: number): string {
	return `plant-${(seed >>> 0).toString(16).padStart(8, '0')}`;
}

function spacingFor(height: number, radius: number, family: PlantFamily): PlantSpacingClass {
	if (family === 'clover' || height < 0.13) return 'tiny';
	if (family === 'fern' || family === 'broadleaf' || height > 0.6 || radius > 0.45) return 'large';
	return 'medium';
}

function flowerFor(family: PlantFamily, height: number, random: Random): FlowerDefinition {
	const shape = pick<PetalShape>(random, PETALS_BY_FAMILY[family] ?? ['round']);
	// Head size scales with the plant (and is what everything else is correlated with).
	const head = Math.max(0.014, height * range(random, 0.13, 0.24));
	switch (family) {
		case 'radial-flower':
			return {
				petalShape: shape,
				petalCount: int(random, 5, 14) + (random() < 0.08 ? 4 : 0),
				petalLength: head,
				petalWidth: head * (shape === 'narrow' ? 0.22 : range(random, 0.3, 0.5)),
				petalLift: range(random, 4, 20),
				centreRadius: head * range(random, 0.28, 0.45),
				blossoms: 1,
				headTilt: range(random, 5, 35)
			};
		case 'star-flower':
			return {
				petalShape: shape,
				petalCount: int(random, 5, 6),
				petalLength: head * 0.9,
				petalWidth: head * range(random, 0.35, 0.5),
				petalLift: range(random, 0, 12),
				centreRadius: head * range(random, 0.15, 0.25),
				blossoms: 1,
				headTilt: range(random, 10, 40)
			};
		case 'cup-flower':
			return {
				petalShape: shape,
				petalCount: int(random, 5, 8),
				petalLength: head * 0.9,
				petalWidth: head * range(random, 0.55, 0.75),
				petalLift: range(random, 45, 65),
				centreRadius: head * 0.25,
				blossoms: 1,
				headTilt: range(random, 0, 20)
			};
		case 'bell-flower':
			return {
				petalShape: shape,
				petalCount: 5,
				petalLength: head * 0.75,
				petalWidth: head * 0.5,
				petalLift: range(random, -75, -55),
				centreRadius: head * 0.12,
				blossoms: int(random, 1, 3),
				headTilt: range(random, 60, 100)
			};
		case 'spike-flower':
			return {
				petalShape: shape,
				petalCount: 3,
				petalLength: head * 0.45,
				petalWidth: head * 0.35,
				petalLift: range(random, 20, 40),
				centreRadius: 0,
				blossoms: int(random, 6, 10),
				headTilt: range(random, 0, 10)
			};
		case 'orb-flower':
			return {
				petalShape: 'round',
				petalCount: 0,
				petalLength: head * 0.8,
				petalWidth: head * 0.8,
				petalLift: 0,
				centreRadius: head * range(random, 0.45, 0.6),
				blossoms: 1,
				headTilt: range(random, 0, 15)
			};
		case 'clover':
			return {
				petalShape: 'round',
				petalCount: 0,
				petalLength: 0.018,
				petalWidth: 0.018,
				petalLift: 0,
				centreRadius: range(random, 0.012, 0.02),
				blossoms: int(random, 0, 3),
				headTilt: 0
			};
		default:
			// cluster-flower: several small 5-petal heads on branching stalks.
			return {
				petalShape: shape,
				petalCount: 5,
				petalLength: head * 0.45,
				petalWidth: head * 0.35,
				petalLift: range(random, 5, 25),
				centreRadius: head * 0.14,
				blossoms: int(random, 3, 4),
				headTilt: range(random, 0, 25)
			};
	}
}

function foliageFor(family: PlantFamily, height: number, random: Random): FoliageDefinition {
	switch (family) {
		case 'rosette':
			return {
				leafShape: pick(random, ['spatulate', 'oval', 'lance'] as LeafShape[]),
				leafCount: int(random, 5, 12),
				leafLength: height * range(random, 1.1, 1.6),
				leafWidth: height * range(random, 0.35, 0.6),
				leafAngle: range(random, 12, 35),
				arch: range(random, 0.2, 0.5),
				basal: true
			};
		case 'fern':
			return {
				leafShape: 'frond',
				leafCount: int(random, 3, 7),
				leafLength: height * range(random, 1.15, 1.4),
				leafWidth: height * range(random, 0.35, 0.5),
				leafAngle: range(random, 45, 70),
				arch: range(random, 0.5, 0.85),
				basal: true
			};
		case 'broadleaf':
			return {
				leafShape: pick(random, ['heart', 'oval'] as LeafShape[]),
				leafCount: int(random, 3, 8),
				leafLength: height * range(random, 0.55, 0.8),
				leafWidth: height * range(random, 0.4, 0.6),
				leafAngle: range(random, 15, 40),
				arch: range(random, 0.3, 0.6),
				basal: true
			};
		case 'clover':
			return {
				leafShape: 'trefoil',
				leafCount: int(random, 4, 8),
				leafLength: range(random, 0.05, 0.08),
				leafWidth: range(random, 0.05, 0.08),
				leafAngle: 0,
				arch: 0,
				basal: true
			};
		case 'succulent':
			return {
				leafShape: 'succulent',
				leafCount: int(random, 6, 12),
				leafLength: height * range(random, 0.9, 1.3),
				leafWidth: height * range(random, 0.35, 0.5),
				leafAngle: range(random, 30, 60),
				arch: 0.05,
				basal: true
			};
		case 'ground-tuft':
			return {
				leafShape: 'strap',
				leafCount: 3,
				leafLength: height,
				leafWidth: height * range(random, 0.8, 1.1),
				leafAngle: 85,
				arch: 0.1,
				basal: true
			};
		default: {
			// Flowers: tall plants carry fewer, larger leaves; small ones a basal tuft.
			const tall = height > 0.35;
			return {
				leafShape: pick(random, ['lance', 'oval', 'spatulate', 'heart', 'strap'] as LeafShape[]),
				leafCount: tall ? int(random, 2, 4) : int(random, 3, 6),
				leafLength: height * (tall ? range(random, 0.25, 0.4) : range(random, 0.4, 0.65)),
				leafWidth: height * (tall ? range(random, 0.08, 0.14) : range(random, 0.14, 0.24)),
				leafAngle: range(random, 25, 55),
				arch: range(random, 0.2, 0.5),
				basal: !tall || random() < 0.4
			};
		}
	}
}

/** Generates a species. `kind` / `family` constrain it (the Plant Lab and regions use them). */
export function generatePlantSpecies(
	seed: number,
	options: { kind?: PlantKind; family?: PlantFamily } = {}
): PlantSpeciesDefinition {
	const random = rng(seed ^ 0x9e3779b9);
	const kind: PlantKind = options.kind ?? (random() < 0.6 ? 'flower' : 'ground');
	const family =
		options.family ?? weighted(random, kind === 'flower' ? FLOWER_WEIGHTS : GROUND_WEIGHTS);
	const isFlower = (FLOWER_FAMILIES as readonly string[]).includes(family);

	// Size class first: everything else is correlated with it.
	let height: number;
	if (isFlower) {
		const sizes = FLOWER_SIZES.map(([, w], i) => [String(i), w] as const);
		const band = FLOWER_SIZES[Number(weighted(random, sizes))][0];
		height = range(random, band[0], band[1]);
	} else {
		const bands: Record<string, [number, number]> = {
			rosette: [0.06, 0.16],
			fern: [0.3, 0.85],
			broadleaf: [0.18, 0.55],
			clover: [0.05, 0.11],
			succulent: [0.06, 0.18],
			'ground-tuft': [0.22, 0.5]
		};
		const band = bands[family] ?? [0.1, 0.3];
		height = range(random, band[0], band[1]);
	}

	const colour = pickColourFamily(family, random);
	const palette = generatePlantPalette(family, colour, random);
	const flower =
		isFlower || (family === 'clover' && random() < 0.6)
			? flowerFor(family, height, random)
			: undefined;
	const foliage = foliageFor(family, height, random);
	const head = flower ? flower.petalLength : 0;
	const stemless =
		family === 'succulent' ||
		family === 'rosette' ||
		family === 'clover' ||
		family === 'ground-tuft' ||
		family === 'fern' ||
		family === 'broadleaf';
	// Clumps only for simple single-head families (multi-head families are already busy).
	const clumpable =
		family === 'radial-flower' ||
		family === 'star-flower' ||
		family === 'cup-flower' ||
		family === 'orb-flower';
	const stems =
		clumpable && height < 0.2 ? int(random, 2, 4) : clumpable && random() < 0.25 ? 2 : 1;
	const radius = Math.max(
		head * 1.3 + (stems > 1 ? height * 0.25 : 0),
		foliage.basal
			? foliage.leafLength * Math.cos((foliage.leafAngle * Math.PI) / 180) * 0.9
			: foliage.leafLength * 0.6,
		family === 'clover' ? range(random, 0.18, 0.32) : 0.03
	);

	const shadeLoving =
		family === 'fern' || family === 'broadleaf' || (family === 'bell-flower' && random() < 0.6);
	const habitat = {
		moisture:
			family === 'fern'
				? range(random, 0.3, 0.8)
				: family === 'broadleaf'
					? range(random, 0.3, 0.7)
					: family === 'succulent'
						? range(random, -0.9, -0.5)
						: range(random, -0.5, 0.6),
		shade: shadeLoving
			? range(random, 0.4, 0.9)
			: family === 'succulent'
				? -0.7
				: range(random, -0.7, 0.2),
		elevation: (family === 'succulent' || (isFlower && height < 0.15 && random() < 0.4)
			? [range(random, 15, 35), range(random, 80, 130)]
			: [range(random, -25, -5), range(random, 45, 80)]) as [number, number],
		maxSlope: family === 'succulent' ? 48 : range(random, 26, 40),
		meadow: isFlower
			? range(random, 0, 0.9)
			: family === 'succulent'
				? -0.8
				: range(random, -0.4, 0.4)
	};
	const fantasy = palette.family === 'fantasy';
	const rarity: PlantRarity =
		fantasy || height > 0.8 ? 'rare' : isFlower && height > 0.4 ? 'uncommon' : 'common';
	const stiffness =
		family === 'succulent'
			? 0.92
			: family === 'clover'
				? 0.75
				: family === 'fern'
					? 0.2
					: family === 'ground-tuft'
						? 0.45
						: isFlower
							? Math.max(0.2, 0.6 - height * 0.4)
							: 0.5;
	const spacing = spacingFor(height, radius, family);
	const bright = isFlower ? Math.max(...palette.petalBase) : 0;

	const species: PlantSpeciesDefinition = {
		id: speciesId(seed),
		seed: seed >>> 0,
		kind: isFlower ? 'flower' : 'ground',
		family,
		signature: '',
		structure: {
			height: [height * 0.82, height * 1.15],
			stemRadius: stemless ? 0 : 0.0025 + head * 0.04 + height * 0.004,
			stemBend: range(random, 0.02, 0.12),
			stems,
			radius
		},
		flower,
		foliage,
		palette,
		growth: {
			spacing,
			colonyScale:
				spacing === 'tiny'
					? range(random, 5, 14)
					: spacing === 'medium'
						? range(random, 9, 24)
						: range(random, 14, 34),
			colonyThreshold: rarity === 'rare' ? range(random, 0.62, 0.72) : range(random, 0.42, 0.6),
			density: rarity === 'rare' ? range(random, 0.35, 0.55) : range(random, 0.6, 1),
			habitat,
			rarity
		},
		stiffness,
		prototypeCount: isFlower ? int(random, 3, 4) : int(random, 2, 3),
		lod: {
			distanceScale: Math.min(1.6, Math.max(0.55, 0.6 + height * 1.2 + radius * 0.4)),
			importance: Math.min(1, bright * 0.7 + Math.min(1, height) * 0.3),
			impostorTile: impostorTile(family)
		}
	};
	species.signature = describeSpecies(species);
	return species;
}

/** "8 narrow purple petals, yellow centre, 2 lance leaves" — fingerprints for the Plant Lab and tests. */
export function describeSpecies(species: PlantSpeciesDefinition): string {
	const f = species.flower;
	const leaves = `${species.foliage.leafCount} ${species.foliage.leafShape} ${species.family === 'fern' ? 'fronds' : 'leaves'}`;
	const size = `${Math.round(species.structure.height[1] * 100)} cm`;
	if (!f) return `${species.family}, ${leaves}, ${size}`;
	const colour = species.palette.family;
	switch (species.family) {
		case 'orb-flower':
			return `${colour} orb heads, ${leaves}, ${size}`;
		case 'spike-flower':
			return `${f.blossoms}-floret ${colour} spike, ${leaves}, ${size}`;
		case 'bell-flower':
			return `${f.blossoms} ${colour} bells, ${leaves}, ${size}`;
		case 'cluster-flower':
			return `${f.blossoms} small ${colour} heads, ${f.petalShape} petals, ${leaves}, ${size}`;
		case 'clover':
			return `${species.family} patch with ${f.blossoms} ${colour} blossoms, ${size}`;
		default:
			return `${f.petalCount} ${f.petalShape} ${colour} petals, ${species.structure.stems > 1 ? `${species.structure.stems} stems, ` : ''}${leaves}, ${size}`;
	}
}

/** Problems with a species (empty = valid): dimensions, counts, palette, finite numbers. */
export function speciesIssues(species: PlantSpeciesDefinition): string[] {
	const issues: string[] = [];
	const [hMin, hMax] = species.structure.height;
	if (!(hMin > 0.02 && hMax >= hMin && hMax < 1.6)) issues.push('height out of range');
	if (!(species.structure.radius > 0.01 && species.structure.radius < 1.2))
		issues.push('radius out of range');
	if (species.flower) {
		const f = species.flower;
		const petals =
			species.family === 'orb-flower' || species.family === 'clover'
				? f.petalCount === 0
				: f.petalCount >= 3 && f.petalCount <= 20;
		if (!petals) issues.push('petal count');
		if (!(f.petalLength > 0 && f.petalLength < 0.4)) issues.push('petal length');
	}
	if (species.kind === 'ground' && species.family === 'fern' && species.flower)
		issues.push('ferns do not flower');
	if (!(species.foliage.leafCount >= 1 && species.foliage.leafCount <= 14))
		issues.push('leaf count');
	if (!(species.prototypeCount >= 2 && species.prototypeCount <= 6)) issues.push('prototype count');
	issues.push(...paletteIssues(species.palette, species.kind === 'flower'));
	const numbers =
		JSON.stringify(species).match(/-?\d+(\.\d+)?(e[-+]?\d+)?|NaN|null|Infinity/g) ?? [];
	if (numbers.some((n) => n === 'NaN' || n === 'null' || n === 'Infinity'))
		issues.push('non-finite value');
	return issues;
}

export { FLOWER_FAMILIES, GROUND_FAMILIES };
