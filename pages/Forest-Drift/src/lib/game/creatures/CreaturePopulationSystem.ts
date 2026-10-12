import { createNamedRandom, hashStringToUint32 } from '../terrain/seededRandom';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import type {
	BodyPlanId,
	CreatureSpawnDefinition,
	CreatureWorldAccess,
	SpeciesGenome,
	Vec3
} from './CreatureTypes';

export const CREATURE_CELL_SIZE = 64;
export const CREATURE_REGION_SIZE = 512;
export const creatureCellAt = (x: number, z: number) => ({
	x: Math.floor(x / CREATURE_CELL_SIZE),
	z: Math.floor(z / CREATURE_CELL_SIZE)
});
export function creatureDimensions(species: SpeciesGenome, size = 1) {
	const p = species.proportions;
	return {
		radius: Math.max(p.bodyLength * 0.5, p.bodyWidth, p.stanceWidth) * size,
		height: (p.legLength + p.bodyDepth + p.neckLength + p.headSize) * size
	};
}
/** Four support samples keep roots off water/void, steep ledges and building footprints. */
export function creatureSurface(
	access: CreatureWorldAccess,
	x: number,
	z: number,
	radius: number,
	height: number,
	/** tan(max walkable slope); species pass their own (agile animals climb steeper ground). */
	maxSlope = 0.65
): number | undefined {
	const y = access.surface(x, z);
	if (!Number.isFinite(y) || access.blocked(x, z, radius, height)) return;
	const probe = Math.max(0.15, radius * 0.65);
	for (const [dx, dz] of [
		[probe, 0],
		[-probe, 0],
		[0, probe],
		[0, -probe]
	]) {
		const other = access.surface(x + dx, z + dz);
		if (!Number.isFinite(other) || Math.abs(other - y) > probe * maxSlope) return;
	}
	return y;
}
/**
 * One height band per regional species, smallest to giant. Adjacent bands stay far enough apart
 * that two groups read as different sizes even at a glance.
 */
const REGION_HEIGHT_BANDS: readonly (readonly [number, number])[] = [
	[0.55, 0.8],
	[1.2, 1.65],
	[2.3, 3.1],
	[4.4, 6],
	[8.5, 12],
	[16, 26]
];
/** Candidate groups per 64m cell. Each one draws a different regional species. */
const POPULATION_SLOTS = 4;
/**
 * Chance a slot is occupied at density 1. Density still scales it, up to a cap so the max setting
 * does not fill every metre.
 */
const POPULATION_PRESENCE = 0.5;

function hslHex(h: number, saturation: number, lightness: number): string {
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
}

/**
 * Gives the region's species clearly different colours, then tightens individual mutation so
 * members of one group stay close to their species in size and hue.
 */
function showcaseRegion(
	speciesList: SpeciesGenome[],
	worldSeed: string | number,
	regionX: number,
	regionZ: number
): void {
	const rng = createNamedRandom(String(worldSeed), `fauna-showcase-v1:${regionX}:${regionZ}`);
	const baseHue = rng() * 360;
	speciesList.forEach((species, index) => {
		const hue = (baseHue + (index * 360) / speciesList.length + (rng() * 16 - 8) + 360) % 360;
		const palette = species.appearance.palette;
		palette.primary = hslHex(hue, 0.58 + rng() * 0.18, 0.46 + rng() * 0.12);
		palette.secondary = hslHex(hue, 0.28 + rng() * 0.12, 0.78 + rng() * 0.08);
		palette.accent = hslHex(
			(hue + 150 + rng() * 40) % 360,
			0.55 + rng() * 0.2,
			0.42 + rng() * 0.12
		);
		palette.eye = hslHex(hue, 0.2, 0.08);
		species.individualVariation.size = 0.045;
		species.individualVariation.hue = 0.012;
		species.individualVariation.proportions = 0.035;
		species.scaleRange.min = 0.95;
		species.scaleRange.max = 1.05;
	});
}

/** Resize a complete genome coherently, retaining scale-dependent gait and behaviour. */
function stature(species: SpeciesGenome, height: number): SpeciesGenome {
	const previous = creatureDimensions(species).height;
	const factor = height / previous;
	const p = species.proportions;
	for (const key of [
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
	] as const)
		p[key] *= factor;
	const gait = species.locomotion.gait;
	for (const key of ['strideLength', 'strideLift', 'bodyBob', 'bodySway', 'headBob'] as const)
		gait[key] *= factor;
	gait.walkFrequency = Math.max(0.2, Math.min(2.5, 0.9 / Math.sqrt(height)));
	gait.runFrequency = gait.walkFrequency * 1.9;
	const b = species.behaviour;
	b.wanderSpeed = Math.min(2.5, Math.sqrt(height) * 0.45);
	b.fleeSpeed = b.wanderSpeed * 2.8;
	b.wanderRadius = Math.max(6, height * 4);
	b.awarenessRadius = Math.max(7, height * 3);
	b.comfortDistance = Math.max(0.8, height * 0.9);
	return species;
}
export function regionSpecies(
	worldSeed: string | number,
	regionX: number,
	regionZ: number
): SpeciesGenome[] {
	const rng = createNamedRandom(String(worldSeed), `fauna-region-v1:${regionX}:${regionZ}`);
	const plans: BodyPlanId[] = ['quadruped', 'quadruped', 'hexapod', 'biped', 'serpentine'];
	const speciesList = Array.from({ length: REGION_HEIGHT_BANDS.length }, (_, index) => {
		const seed = hashStringToUint32(`${worldSeed}:fauna-v1:${regionX}:${regionZ}:${index}`);
		const species = generateSpecies(seed, plans[Math.floor(rng() * plans.length)]);
		const [minHeight, maxHeight] = REGION_HEIGHT_BANDS[index];
		const sized = stature(species, minHeight + rng() * (maxHeight - minHeight));
		// Small species travel in herds; the largest are landmarks and spawn alone.
		if (index <= 2)
			sized.behaviour.preferredGroupSize = Math.max(3, sized.behaviour.preferredGroupSize);
		else if (index === 3)
			sized.behaviour.preferredGroupSize = Math.min(
				3,
				Math.max(2, sized.behaviour.preferredGroupSize)
			);
		else sized.behaviour.preferredGroupSize = 1;
		return sized;
	});
	showcaseRegion(speciesList, worldSeed, regionX, regionZ);
	return speciesList;
}
/**
 * Picks who is drawn when more creatures are in range than the active cap.
 * Nearest-only would fill the cap with the closest herd and hide the tall, differently coloured
 * groups. Slots are split across small, mid and landmark heights, then leftover slots take the
 * nearest creatures that were not already chosen.
 */
export function selectVisibleCreatures<T extends { distance: number; height: number }>(
	visible: readonly T[],
	limit: number
): T[] {
	if (limit <= 0) return [];
	const sorted = [...visible].sort((a, b) => a.distance - b.distance);
	if (sorted.length <= limit) return sorted;
	const tiers: T[][] = [[], [], []];
	for (const creature of sorted)
		tiers[creature.height >= 8 ? 2 : creature.height >= 2.2 ? 1 : 0].push(creature);
	const quotas = [Math.round(limit * 0.45), Math.round(limit * 0.3), Math.round(limit * 0.25)];
	quotas[0] += limit - quotas.reduce((sum, count) => sum + count, 0);
	const picked: T[] = [];
	const chosen = new Set<T>();
	tiers.forEach((tier, index) => {
		for (const creature of tier.slice(0, Math.max(0, quotas[index]))) {
			picked.push(creature);
			chosen.add(creature);
		}
	});
	for (const creature of sorted) {
		if (picked.length >= limit) break;
		if (!chosen.has(creature)) picked.push(creature);
	}
	return picked;
}

export function generatePopulationCell(
	worldSeed: string | number,
	cellX: number,
	cellZ: number,
	density: number,
	access: CreatureWorldAccess
): CreatureSpawnDefinition[] {
	if (
		!Number.isSafeInteger(cellX) ||
		!Number.isSafeInteger(cellZ) ||
		!Number.isFinite(density) ||
		density <= 0
	)
		return [];
	const rng = createNamedRandom(String(worldSeed), `fauna-cell-v1:${cellX}:${cellZ}`);
	const speciesList = regionSpecies(worldSeed, Math.floor(cellX / 8), Math.floor(cellZ / 8));
	const result: CreatureSpawnDefinition[] = [];
	// Shuffle so the groups in one cell are different species: big size and colour gaps between
	// them, while each group itself stays one species.
	const tiers = speciesList.map((_, index) => index);
	for (let i = tiers.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[tiers[i], tiers[j]] = [tiers[j], tiers[i]];
	}
	const presenceLimit = Math.min(0.92, density * POPULATION_PRESENCE);
	for (let slot = 0; slot < POPULATION_SLOTS; slot++) {
		const presence = rng(),
			cx = (cellX + 0.12 + rng() * 0.76) * 64,
			cz = (cellZ + 0.12 + rng() * 0.76) * 64;
		if (presence >= presenceLimit) continue;
		const index = tiers[slot];
		const species = speciesList[index];
		const dimensions = creatureDimensions(species, 1.1);
		const y = creatureSurface(access, cx, cz, dimensions.radius, dimensions.height);
		if (y === undefined) continue;
		const groupId = `group:${worldSeed}:${cellX}:${cellZ}:${slot}`;
		const groupCentre = { x: cx, y, z: cz };
		const count = index >= 4 ? 1 : species.behaviour.preferredGroupSize;
		for (let member = 0; member < count; member++) {
			const seed = hashStringToUint32(`${groupId}:${member}`);
			const local = createNamedRandom(String(seed), 'placement');
			const individual = generateIndividual(species, seed);
			for (let attempt = 0; attempt < 12; attempt++) {
				const angle = local() * Math.PI * 2,
					distance =
						member === 0
							? 0
							: (dimensions.radius * 2 + 0.6) * Math.sqrt(member + 1) * (1 + local());
				const x = cx + Math.sin(angle) * distance,
					z = cz + Math.cos(angle) * distance;
				const sy = creatureSurface(access, x, z, dimensions.radius, dimensions.height);
				if (
					sy === undefined ||
					result.some(
						(p) =>
							Math.hypot(p.position.x - x, p.position.z - z) <
							dimensions.radius +
								creatureDimensions(p.species, p.individual.sizeFactor).radius +
								0.2
					)
				)
					continue;
				result.push({
					id: `${groupId}:${member}`,
					species,
					individual,
					position: { x, y: sy, z },
					heading: local() * Math.PI * 2,
					groupId,
					groupCentre,
					cellX,
					cellZ,
					persistent: false
				});
				break;
			}
		}
	}
	return result;
}
export class CreaturePopulationSystem {
	cell = generatePopulationCell;
}
/** Fixed validation fixture only; production generation never references these species. */
export function generateCreatureDemo(
	access: CreatureWorldAccess,
	origin: Vec3 = { x: 0, y: 0, z: 0 }
): CreatureSpawnDefinition[] {
	const plans: BodyPlanId[] = ['quadruped', 'quadruped', 'hexapod', 'serpentine', 'quadruped'];
	const heights = [0.8, 3, 0.6, 0.7, 22];
	const result: CreatureSpawnDefinition[] = [];
	plans.forEach((plan, index) => {
		const species = stature(generateSpecies(821001 + index, plan), heights[index]);
		Object.assign(
			species.behaviour,
			index === 0
				? { curiosity: 0.95, fear: 0.05, sociality: 0.9, preferredGroupSize: 4 }
				: index === 1
					? { curiosity: 0.05, fear: 0.95, sociality: 0.8, preferredGroupSize: 3 }
					: index === 2
						? { wanderSpeed: 2.8, fleeSpeed: 5 }
						: { wanderSpeed: 0.35, fleeSpeed: 0.8 }
		);
		const count = index < 2 ? species.behaviour.preferredGroupSize : 1;
		const radius = creatureDimensions(species, 1.1).radius;
		const centre = { x: origin.x + (index - 2) * 35, y: origin.y, z: origin.z + 35 };
		for (let member = 0; member < count; member++) {
			const x = centre.x + member * (radius * 2 + 1),
				z = centre.z;
			const y = creatureSurface(access, x, z, radius, heights[index] * 1.1);
			if (y === undefined) continue;
			result.push({
				id: `demo:${index}:${member}`,
				species,
				individual: generateIndividual(species, 9000 + index * 10 + member),
				position: { x, y, z },
				heading: 0,
				groupId: `demo:${index}`,
				groupCentre: { ...centre, y },
				cellX: Math.floor(x / 64),
				cellZ: Math.floor(z / 64),
				persistent: false
			});
		}
	});
	return result;
}
