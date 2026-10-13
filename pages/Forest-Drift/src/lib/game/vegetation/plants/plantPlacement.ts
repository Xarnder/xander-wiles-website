/**
 * Deterministic flower / ground-plant placement for one 32 m plant chunk. Pure (typed arrays and
 * callbacks), unit-tested directly, worker-ready.
 *
 * Each species is placed on the world-space candidate grid of its spacing class (tiny 0.9 m,
 * medium 1.6 m, large 3.2 m) — tiny flowers close together, ferns and broadleaf plants far apart.
 * A chunk owns the cells whose origin lies inside it, so plants never double up or leave strips
 * at chunk borders, at any coordinate. Per cell:
 *
 *   1. the region's active species of this spacing class compete: each gets
 *        weight = habitat suitability × its colony field × its density × kind density × quality
 *      and the cell is planted with probability ≈ the strongest weight; a second roll picks which
 *      species (weighted) — so colonies form patches with halos, species dominate where they suit
 *   2. foundations (padded rects), water (coarse depth grid), beaches and slopes beyond the
 *      species' tolerance reject it
 *   3. instance bytes: prototype, scale, yaw, hue, wind phase, LOD rank (bigger / brighter plants
 *      rank earlier and survive farther), plus the far card's colours from the species palette
 *
 * Output is sorted by LOD rank (density LOD = instance-count cut, as for grass).
 */
import { hashCellToFloat01 } from '../cellHash';
import { sampleGrassGrid, type GrassGrid } from '../grass/grassPlacement';
import { createSurfacePoint, type SurfacePoint } from '../../terrain/terrainSurfaceLattice';
import { plantColony, plantSuitability, type PlantEnvironment } from './plantEcology';
import { speciesHash01 } from './plantPrototype';
import {
	PLANT_SPACING,
	type PlantQualityProfile,
	type PlantSettings,
	type PlantSpacingClass,
	type PlantSpeciesDefinition
} from './PlantTypes';
import type { RgbColor } from '../../materials/ProceduralMaterialTypes';

/** Environment grid channels. */
export const ENV_FOREST = 0;
export const ENV_OPENNESS = 1;
export const ENV_WET = 2;
export const ENV_CHANNELS = 3;

const Channel = {
	JitterX: 0,
	JitterZ: 1,
	Existence: 2,
	Pick: 3,
	Scale: 4,
	Yaw: 5,
	Hue: 6,
	Phase: 7,
	Rank: 8,
	Prototype: 9
} as const;

const CLASSES: readonly PlantSpacingClass[] = ['tiny', 'medium', 'large'];
const CLASS_SALT: Record<PlantSpacingClass, number> = { tiny: 0x11, medium: 0x22, large: 0x33 };

/** Card / instance height and width are stored as bytes over this range (metres). */
export const PLANT_SIZE_RANGE = 2.5;

export interface PlantChunkInput {
	chunkX: number;
	chunkZ: number;
	chunkSize: number;
	seedHash: number;
	settings: PlantSettings;
	quality: Pick<PlantQualityProfile, 'densityScale' | 'maxPrototypes'>;
	/** The active species of the (warped) region at a point. */
	speciesAt: (worldX: number, worldZ: number) => readonly PlantSpeciesDefinition[];
	surface: (worldX: number, worldZ: number, out: SurfacePoint) => boolean;
	/** Forest, openness, wetness over the chunk. */
	environment: GrassGrid;
	/** Water column depth (one channel), or null when no water is near. */
	water: GrassGrid | null;
	/** [minX, minZ, maxX, maxZ] × n, world space. */
	exclusions: Float32Array;
	/** Debug: record every candidate cell (see `debugPoints`). */
	collectDebug?: boolean;
}

export interface PlantChunkData {
	count: number;
	/** Species referenced by `speciesIndex`. */
	species: PlantSpeciesDefinition[];
	/** World-space roots. */
	positions: Float32Array;
	speciesIndex: Uint8Array;
	prototype: Uint8Array;
	/** scale, yaw, hue shift, wind phase (bytes) for the near prototypes. */
	instance: Uint8Array;
	/** Far-card attributes (see plantMaterial.ts): shape, petal colour+tile, centre colour+species, leaf colour+stiffness. */
	cardShape: Uint8Array;
	cardPetal: Uint8Array;
	cardCentre: Uint8Array;
	cardLeaf: Uint8Array;
	/** `rankCounts[k]` = instances with rank byte < k. */
	rankCounts: Uint32Array;
	/** Largest per-species LOD distance scale in the chunk (bounds the density cut). */
	maxDistanceScale: number;
	minY: number;
	maxY: number;
	maxHeight: number;
	candidates: number;
	/** Debug only: x, y, z, strongest colony value, accepted (0/1), species hash — per candidate cell. */
	debugPoints: Float32Array | null;
}

const encode = (v: number) => Math.round(Math.sqrt(Math.min(1, Math.max(0, v))) * 255);
const mix = (a: RgbColor, b: RgbColor, t: number): RgbColor => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t
];

function firstCellAtOrAfter(edge: number, spacing: number): number {
	return Math.ceil(edge / spacing - 1e-9);
}

export function generatePlantChunk(input: PlantChunkInput): PlantChunkData {
	const { chunkSize, settings, seedHash } = input;
	const originX = input.chunkX * chunkSize;
	const originZ = input.chunkZ * chunkSize;
	const surface = createSurfacePoint();
	const env: PlantEnvironment = { forest: 0, openness: 0, wet: 0, height: 0 };
	const exclusions = input.exclusions;
	const exclusionCount = exclusions.length / 4;
	const speciesList: PlantSpeciesDefinition[] = [];
	const speciesSlot = new Map<PlantSpeciesDefinition, number>();
	const quality = Math.max(0, input.quality.densityScale);
	const debug: number[] | null = input.collectDebug ? [] : null;

	interface Planted {
		x: number;
		y: number;
		z: number;
		species: PlantSpeciesDefinition;
		prototype: number;
		scale: number;
		yaw: number;
		hue: number;
		phase: number;
		rank: number;
	}
	const planted: Planted[] = [];
	let candidates = 0;
	const weights: number[] = [];
	const options: PlantSpeciesDefinition[] = [];

	for (const spacingClass of CLASSES) {
		const spacing = PLANT_SPACING[spacingClass];
		const salt = (seedHash ^ Math.imul(CLASS_SALT[spacingClass], 0x9e3779b1)) | 0;
		const cx0 = firstCellAtOrAfter(originX, spacing);
		const cx1 = firstCellAtOrAfter(originX + chunkSize, spacing) - 1;
		const cz0 = firstCellAtOrAfter(originZ, spacing);
		const cz1 = firstCellAtOrAfter(originZ + chunkSize, spacing) - 1;
		for (let cz = cz0; cz <= cz1; cz++) {
			for (let cx = cx0; cx <= cx1; cx++) {
				candidates++;
				const roll = (channel: number) => hashCellToFloat01(salt, cx, cz, channel);
				const x = (cx + 0.1 + roll(Channel.JitterX) * 0.8) * spacing;
				const z = (cz + 0.1 + roll(Channel.JitterZ) * 0.8) * spacing;
				const regionSpecies = input.speciesAt(x, z);
				options.length = 0;
				weights.length = 0;
				for (const species of regionSpecies)
					if (species.growth.spacing === spacingClass) options.push(species);
				if (options.length === 0) continue;

				if (!input.surface(x, z, surface)) continue;
				env.forest = sampleGrassGrid(input.environment, x, z, ENV_FOREST);
				env.openness = sampleGrassGrid(input.environment, x, z, ENV_OPENNESS);
				env.wet = sampleGrassGrid(input.environment, x, z, ENV_WET);
				env.height = surface.height;
				let best = 0;
				let total = 0;
				let bestColony = 0;
				for (const species of options) {
					const kindDensity =
						species.kind === 'flower' ? settings.flowerDensity : settings.groundPlantDensity;
					const colony = plantColony(species, x, z);
					const w =
						colony > 0
							? plantSuitability(species, env) *
								colony *
								species.growth.density *
								kindDensity *
								quality
							: 0;
					weights.push(w);
					total += w;
					if (w > best) best = w;
					if (colony > bestColony) bestColony = colony;
				}
				const accept = Math.min(0.97, best * 1.7 + (total - best) * 0.35);
				const existence = roll(Channel.Existence);
				if (existence >= accept) {
					debug?.push(x, surface.height, z, bestColony, 0, 0);
					continue;
				}
				// Competition: pick a species weighted by its local strength.
				let target = roll(Channel.Pick) * total;
				let chosen = options[options.length - 1];
				for (let i = 0; i < options.length; i++) {
					target -= weights[i];
					if (target < 0) {
						chosen = options[i];
						break;
					}
				}

				let excluded = false;
				for (let e = 0; e < exclusionCount; e++) {
					const k = e * 4;
					if (
						x >= exclusions[k] &&
						z >= exclusions[k + 1] &&
						x <= exclusions[k + 2] &&
						z <= exclusions[k + 3]
					) {
						excluded = true;
						break;
					}
				}
				if (excluded) continue;
				const slope = (Math.acos(Math.min(1, Math.max(-1, surface.normalY))) * 180) / Math.PI;
				if (slope > chosen.growth.habitat.maxSlope) continue;
				// Beaches carry nothing; wet shelves only moisture-loving plants.
				if (surface.shoreCover > 0.45) continue;
				if (surface.shoreWet > 0.4 && chosen.growth.habitat.moisture < 0.3) continue;
				if (input.water && sampleGrassGrid(input.water, x, z, 0) > 0.01) continue;

				const importance = chosen.lod.importance;
				planted.push({
					x,
					y: surface.height,
					z,
					species: chosen,
					prototype: Math.floor(
						roll(Channel.Prototype) *
							Math.max(1, Math.min(chosen.prototypeCount, input.quality.maxPrototypes))
					),
					scale: roll(Channel.Scale),
					yaw: roll(Channel.Yaw),
					hue: roll(Channel.Hue),
					phase: roll(Channel.Phase),
					rank: Math.min(0.999, roll(Channel.Rank) * 0.72 + (1 - importance) * 0.28)
				});
				debug?.push(x, surface.height, z, bestColony, 1, speciesHash01(chosen));
			}
		}
	}

	// Rank-sort (stable counting sort on the rank byte).
	const count = planted.length;
	const rankByte = planted.map((p) => Math.floor(p.rank * 256));
	const rankCounts = new Uint32Array(257);
	for (const r of rankByte) rankCounts[r + 1]++;
	for (let k = 1; k <= 256; k++) rankCounts[k] += rankCounts[k - 1];
	const cursor = rankCounts.slice(0, 256);
	const order = new Array<number>(count);
	for (let i = 0; i < count; i++) order[cursor[rankByte[i]]++] = i;

	const positions = new Float32Array(count * 3);
	const speciesIndex = new Uint8Array(count);
	const prototype = new Uint8Array(count);
	const instance = new Uint8Array(count * 4);
	const cardShape = new Uint8Array(count * 4);
	const cardPetal = new Uint8Array(count * 4);
	const cardCentre = new Uint8Array(count * 4);
	const cardLeaf = new Uint8Array(count * 4);
	let minY = Infinity;
	let maxY = -Infinity;
	let maxHeight = 0;
	let maxDistanceScale = 0;
	for (let j = 0; j < count; j++) {
		const p = planted[order[j]];
		let slot = speciesSlot.get(p.species);
		if (slot === undefined) {
			slot = speciesList.length;
			speciesList.push(p.species);
			speciesSlot.set(p.species, slot);
		}
		const s = p.species;
		positions[j * 3] = p.x;
		positions[j * 3 + 1] = p.y;
		positions[j * 3 + 2] = p.z;
		speciesIndex[j] = slot;
		prototype[j] = p.prototype;
		instance[j * 4] = Math.round(p.scale * 255);
		instance[j * 4 + 1] = Math.round(p.yaw * 255);
		instance[j * 4 + 2] = Math.round(p.hue * 255);
		instance[j * 4 + 3] = Math.round(p.phase * 255);

		const scale = 0.85 + p.scale * 0.3;
		const height = ((s.structure.height[0] + s.structure.height[1]) / 2) * scale;
		const width = Math.max(height * 0.6, s.structure.radius * 2 * scale);
		maxHeight = Math.max(maxHeight, height);
		maxDistanceScale = Math.max(maxDistanceScale, s.lod.distanceScale);
		cardShape[j * 4] = Math.round(Math.min(1, height / PLANT_SIZE_RANGE) * 255);
		cardShape[j * 4 + 1] = Math.round(Math.min(1, width / PLANT_SIZE_RANGE) * 255);
		cardShape[j * 4 + 2] = Math.floor(p.rank * 256);
		cardShape[j * 4 + 3] = Math.round(p.phase * 255);
		// Per-instance hue variation is baked into the card colours (a ±8 % shade and a slight warm/cool tilt).
		const shade = 0.92 + p.hue * 0.16;
		const tilt = (p.hue - 0.5) * 0.08;
		const petal = mix(s.palette.petalBase, s.palette.petalTip, 0.3);
		const leaf = mix(s.palette.leafBase, s.palette.leafTip, 0.4);
		cardPetal[j * 4] = encode(petal[0] * shade * (1 + tilt));
		cardPetal[j * 4 + 1] = encode(petal[1] * shade);
		cardPetal[j * 4 + 2] = encode(petal[2] * shade * (1 - tilt));
		cardPetal[j * 4 + 3] = s.lod.impostorTile;
		cardCentre[j * 4] = encode(s.palette.centre[0]);
		cardCentre[j * 4 + 1] = encode(s.palette.centre[1]);
		cardCentre[j * 4 + 2] = encode(s.palette.centre[2]);
		cardCentre[j * 4 + 3] = Math.floor(speciesHash01(s) * 256);
		cardLeaf[j * 4] = encode(leaf[0] * shade);
		cardLeaf[j * 4 + 1] = encode(leaf[1] * shade);
		cardLeaf[j * 4 + 2] = encode(leaf[2] * shade);
		// High nibble: stiffness; low nibble: LOD distance scale (0.4 … 1.9).
		cardLeaf[j * 4 + 3] =
			(Math.round(s.stiffness * 15) << 4) |
			Math.round(Math.min(15, Math.max(0, (s.lod.distanceScale - 0.4) * 10)));
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}

	return {
		count,
		species: speciesList,
		positions,
		speciesIndex,
		prototype,
		instance,
		cardShape,
		cardPetal,
		cardCentre,
		cardLeaf,
		rankCounts,
		maxDistanceScale: maxDistanceScale || 1,
		minY: count > 0 ? minY : 0,
		maxY: count > 0 ? maxY : 0,
		maxHeight,
		candidates,
		debugPoints: debug ? new Float32Array(debug) : null
	};
}

/** LOD distance scale stored in a card's leaf byte (see generatePlantChunk). */
export function decodeDistanceScale(byte: number): number {
	return 0.4 + (byte & 15) / 10;
}
