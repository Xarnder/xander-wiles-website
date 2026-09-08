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
	height: number
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
		if (!Number.isFinite(other) || Math.abs(other - y) > probe * 0.65) return;
	}
	return y;
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
	return Array.from({ length: 6 }, (_, index) => {
		const seed = hashStringToUint32(`${worldSeed}:fauna-v1:${regionX}:${regionZ}:${index}`);
		const species = generateSpecies(seed, plans[Math.floor(rng() * plans.length)]);
		const height =
			index < 3
				? 0.5 + rng()
				: index === 3
					? 2 + rng() * 2
					: index === 4
						? 5 + rng() * 5
						: 10 + rng() * 20;
		return stature(species, height);
	});
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
	// At default density most cells are empty. Independent slots keep existing IDs stable as density rises.
	for (let slot = 0; slot < 3; slot++) {
		const presence = rng(),
			choice = rng(),
			cx = (cellX + 0.15 + rng() * 0.7) * 64,
			cz = (cellZ + 0.15 + rng() * 0.7) * 64;
		if (presence >= Math.min(1, density * 0.16)) continue;
		const index =
			choice < 0.84 ? Math.floor(choice / 0.28) : choice < 0.97 ? 3 : choice < 0.995 ? 4 : 5;
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
