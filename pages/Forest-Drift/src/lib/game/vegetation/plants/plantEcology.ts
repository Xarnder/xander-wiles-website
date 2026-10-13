/**
 * Which plant species grow where. Pure apart from small caches.
 *
 * The world is divided into ecological REGIONS (~192 m, borders warped so they never run in
 * straight lines). Every 4 × 4 regions share a species POOL (10 flower + 7 ground-plant species,
 * seeded from the world seed and the super-region); each region draws a limited ACTIVE SET from its
 * pool — 3–6 flowers and 2–4 ground plants — so neighbouring regions overlap and a botanical area
 * is recognisable, while far-apart areas differ. Rare species are less likely to be drawn.
 *
 * Within a region, `plantSuitability` (habitat vs. local environment) and each species' own colony
 * field decide where it dominates (see grassPlacement-style placement in `plantPlacement.ts`).
 */
import { hashCellToFloat01 } from '../cellHash';
import { smoothstep } from '../../terrain/mathUtils';
import { generatePlantSpecies } from './plantSpecies';
import type { PlantSpeciesDefinition } from './PlantTypes';

export const PLANT_REGION_SIZE = 192;
const SUPER_REGION = 4;
const POOL_FLOWERS = 10;
const POOL_GROUND = 7;
const REGION_WARP = 55;

/** Local environment for habitat matching (all 0..1 except height, metres). */
export interface PlantEnvironment {
	forest: number;
	/** Open, flat country (plains + some hills) vs highlands/mountains. */
	openness: number;
	/** Near water (river banks, lake shores). */
	wet: number;
	height: number;
}

function latticeHash(x: number, z: number, seed: number): number {
	let h = seed | 0;
	h = Math.imul(h ^ x, 0x27d4eb2d);
	h = Math.imul(h ^ z, 0x165667b1);
	h ^= h >>> 15;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1] from world coordinates (seamless everywhere). */
export function plantValueNoise(x: number, z: number, seed: number): number {
	const ix = Math.floor(x);
	const iz = Math.floor(z);
	const fx = x - ix;
	const fz = z - iz;
	const ux = fx * fx * (3 - 2 * fx);
	const uz = fz * fz * (3 - 2 * fz);
	const a = latticeHash(ix, iz, seed);
	const b = latticeHash(ix + 1, iz, seed);
	const c = latticeHash(ix, iz + 1, seed);
	const d = latticeHash(ix + 1, iz + 1, seed);
	return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/**
 * A species' colony field at a point: two octaves of broad noise at the species' own scale and
 * seed, shaped into dense patches, a thinner halo around them, and empty ground between.
 */
export function plantColony(species: PlantSpeciesDefinition, x: number, z: number): number {
	const s = species.growth.colonyScale;
	const seed = species.seed;
	const n =
		plantValueNoise(x / s, z / s, seed) * 0.7 +
		plantValueNoise(x / (s * 0.37), z / (s * 0.37), seed ^ 0x5bd1e995) * 0.3;
	const t = species.growth.colonyThreshold;
	return smoothstep(t - 0.15, t + 0.1, n);
}

/** How well a species' habitat matches the environment, 0..~1.4. */
export function plantSuitability(species: PlantSpeciesDefinition, env: PlantEnvironment): number {
	const h = species.growth.habitat;
	const shadeEnv = env.forest * 2 - 1;
	const moistEnv = env.wet * 2 - 1 - (env.wet < 0.05 ? 0.2 : 0);
	const shade = Math.max(0, 1 - Math.abs(h.shade - shadeEnv) * 0.55);
	const moisture = Math.max(0, 1 - Math.abs(h.moisture - moistEnv) * 0.5);
	const [e0, e1] = h.elevation;
	const elevation = smoothstep(e0 - 10, e0, env.height) * (1 - smoothstep(e1, e1 + 18, env.height));
	const meadow = Math.min(1.4, Math.max(0.25, 1 + h.meadow * (env.openness - 0.5)));
	return shade * moisture * elevation * meadow;
}

export interface PlantEcologyOptions {
	seedHash: number;
	/** Multiplies the per-region species counts (settings × quality preset). */
	speciesScale: () => number;
}

/** Region species sets and the species they reference, generated and cached on demand. */
export class PlantEcology {
	private readonly species = new Map<number, PlantSpeciesDefinition>();
	private readonly regions = new Map<string, PlantSpeciesDefinition[]>();
	private readonly seedHash: number;
	private readonly speciesScale: () => number;
	private lastScale = Number.NaN;

	constructor(options: PlantEcologyOptions) {
		this.seedHash = options.seedHash;
		this.speciesScale = options.speciesScale;
	}

	/** The (warped) region containing a world point. */
	regionAt(x: number, z: number): { rx: number; rz: number } {
		const wx =
			(plantValueNoise(x / 97, z / 97, this.seedHash ^ 0x2545f491) - 0.5) * 2 * REGION_WARP;
		const wz =
			(plantValueNoise(x / 97, z / 97, this.seedHash ^ 0x6c62272e) - 0.5) * 2 * REGION_WARP;
		return {
			rx: Math.floor((x + wx) / PLANT_REGION_SIZE),
			rz: Math.floor((z + wz) / PLANT_REGION_SIZE)
		};
	}

	speciesAt(x: number, z: number): readonly PlantSpeciesDefinition[] {
		const { rx, rz } = this.regionAt(x, z);
		return this.regionSpecies(rx, rz);
	}

	/** A region's active species set (flowers first). */
	regionSpecies(rx: number, rz: number): PlantSpeciesDefinition[] {
		const scale = this.speciesScale();
		if (scale !== this.lastScale) {
			this.lastScale = scale;
			this.regions.clear();
		}
		const key = `${rx}:${rz}`;
		const cached = this.regions.get(key);
		if (cached) return cached;
		const sx = Math.floor(rx / SUPER_REGION);
		const sz = Math.floor(rz / SUPER_REGION);
		const roll = (channel: number) => hashCellToFloat01(this.seedHash, rx, rz, 1000 + channel);
		const flowers = Math.max(1, Math.round((3 + Math.floor(roll(0) * 4)) * scale));
		const ground = Math.max(1, Math.round((2 + Math.floor(roll(1) * 3)) * scale));
		const chosen = [
			...this.draw(sx, sz, 'flower', POOL_FLOWERS, flowers, roll),
			...this.draw(sx, sz, 'ground', POOL_GROUND, ground, (c) => roll(c + 500))
		];
		this.regions.set(key, chosen);
		if (this.regions.size > 256) this.regions.delete(this.regions.keys().next().value!);
		return chosen;
	}

	getSpecies(seed: number): PlantSpeciesDefinition | undefined {
		return this.species.get(seed);
	}

	/** Distinct pool members, nearest-first in a hashed order; rare species are skipped more often. */
	private draw(
		sx: number,
		sz: number,
		kind: 'flower' | 'ground',
		poolSize: number,
		count: number,
		roll: (channel: number) => number
	): PlantSpeciesDefinition[] {
		const order = Array.from({ length: poolSize }, (_, i) => i).sort(
			(a, b) => roll(10 + a) - roll(10 + b)
		);
		const out: PlantSpeciesDefinition[] = [];
		for (const index of order) {
			if (out.length >= count) break;
			const species = this.poolSpecies(sx, sz, kind, index);
			const keep =
				species.growth.rarity === 'rare' ? 0.35 : species.growth.rarity === 'uncommon' ? 0.75 : 1;
			if (roll(40 + index) < keep) out.push(species);
		}
		return out;
	}

	private poolSpecies(
		sx: number,
		sz: number,
		kind: 'flower' | 'ground',
		index: number
	): PlantSpeciesDefinition {
		const seed =
			Math.floor(
				hashCellToFloat01(this.seedHash, sx, sz, (kind === 'flower' ? 2000 : 3000) + index) *
					4294967296
			) >>> 0 || 1;
		let species = this.species.get(seed);
		if (!species) {
			species = generatePlantSpecies(seed, { kind });
			this.species.set(seed, species);
			if (this.species.size > 512) this.species.delete(this.species.keys().next().value!);
		}
		return species;
	}
}
