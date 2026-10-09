import { lakeRadiusAt } from '../../hydrology/HydrologyMath';
import type { LakeDefinition } from '../../hydrology/HydrologyTypes';
import {
	particleHash,
	type ParticleEffectDefinition,
	type ParticleQualityProfile
} from '../ParticleTypes';

/**
 * Lake-shore splashes — the first effect on the particle system. This file owns WHERE splashes
 * belong (deterministic splash zones along steep lake shores) and the effect's look as plain data;
 * the particle system owns how they move and render.
 */

export const LAKE_SHORE_SPLASH_ID = 'lake-shore-splash';

/**
 * Small, soft, short-lived droplets flung up and out from the waterline, with a few faint mist
 * puffs (High/Ultra only). Subtle by design: a few centimetres each, gone within a second.
 */
export const LAKE_SHORE_SPLASH: ParticleEffectDefinition = {
	id: LAKE_SHORE_SPLASH_ID,
	priority: 'ambient',
	maxParticles: 1500,
	burstMin: 4,
	burstMax: 9,
	lifetimeMin: 0.35,
	lifetimeMax: 0.85,
	sizeStart: 0.11,
	sizeEnd: 0.06,
	sizeJitter: 0.35,
	speedMin: 0.35,
	speedMax: 1.1,
	upMin: 1.1,
	upMax: 2.5,
	spread: 0.35,
	spawnRadius: 0.35,
	gravity: 9.0,
	drag: 0.6,
	opacityStart: 0.85,
	opacityEnd: 0.0,
	fadeIn: 0.06,
	spin: 2.5,
	color: [0.86, 0.93, 0.97],
	lighting: 0.85,
	textureId: 'water-droplet',
	blending: 'normal',
	killDepth: 0.12,
	variants: [
		{
			weight: 0.7,
			sizeScale: 2.4,
			speedScale: 0.45,
			lifetimeScale: 1.5,
			opacityScale: 0.5,
			dragScale: 3.5,
			textureId: 'water-mist',
			secondary: true
		}
	]
};

/** One place along a steep lake shore where splashes happen. Plain data, regenerated on demand. */
export interface SplashZoneDefinition {
	lakeId: string;
	x: number;
	/** Just above the logical lake surface (never the rendered mesh). */
	y: number;
	z: number;
	/** Horizontal unit direction from the bank out over the water — splashes fly this way. */
	nx: number;
	nz: number;
	/** 0..1 from the bank's steepness: steeper banks splash a little harder and more often. */
	strength: number;
	/** Deterministic per zone (world seed × lake × shoreline position). */
	seed: number;
	/** Bank slope at the zone, degrees (debug). */
	slopeDegrees: number;
}

export interface SplashZoneSettings {
	/** Metres of shoreline between candidate points. */
	candidateSpacing: number;
	/** 0..1 share of qualifying candidates kept (before the steepness weighting). */
	density: number;
	/** Banks gentler than this (degrees) never splash. */
	slopeThreshold: number;
}

/** Final (carved) terrain height — the authoritative sampler, never the rendered mesh. */
export type TerrainHeightAt = (worldX: number, worldZ: number) => number;

/** Horizontal run (m) over which the bank's steepness is measured, starting at the waterline. */
const SLOPE_RUN = 2.5;
const MAX_ZONES_PER_LAKE = 160;

export function lakeIdHash(id: string): number {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/**
 * Walks a lake's shoreline and returns sparse, deterministic splash zones where the terrain rises
 * steeply out of the water.
 *
 *   candidates every `candidateSpacing` m of shore (jittered, from the seed)
 *   → find the true waterline along the shore normal (where the carved terrain meets the surface)
 *   → reject where there is none nearby (a river mouth, a submerged shelf: no bank to hit)
 *   → measure the bank's slope over the first 2.5 m above the water; reject gentle banks
 *   → keep a hashed subset (`density`, weighted toward steeper banks)
 *
 * Runs once per lake when it streams in; nothing here runs per frame.
 */
export function generateLakeSplashZones(
	lake: LakeDefinition,
	terrainHeight: TerrainHeightAt,
	settings: SplashZoneSettings,
	worldSeed: number
): SplashZoneDefinition[] {
	const spacing = Math.max(1, settings.candidateSpacing);
	const lakeSeed = lakeIdHash(lake.id) ^ worldSeed;
	const perimeter = estimatePerimeter(lake);
	const count = Math.min(2000, Math.max(6, Math.floor(perimeter / spacing)));
	const zones: SplashZoneDefinition[] = [];
	const water = lake.waterLevel;
	const threshold = Math.max(1, settings.slopeThreshold);

	for (let i = 0; i < count; i++) {
		const jitter = (particleHash(i, 1, 0, lakeSeed) - 0.5) * 0.7;
		const angle = ((i + 0.5 + jitter) / count) * Math.PI * 2;
		const { x: sx, z: sz, nx, nz } = shorePoint(lake, angle);

		// The waterline: first point, walking outward along the shore normal, where the bank is dry.
		let waterline = Number.NaN;
		for (let step = -8; step <= 16; step++) {
			const t = step * 0.25;
			if (terrainHeight(sx + nx * t, sz + nz * t) >= water) {
				waterline = t;
				break;
			}
		}
		if (Number.isNaN(waterline)) continue; // no bank here: river mouth or a submerged shelf
		const wx = sx + nx * waterline;
		const wz = sz + nz * waterline;

		const rise = terrainHeight(wx + nx * SLOPE_RUN, wz + nz * SLOPE_RUN) - water;
		const slopeDegrees = (Math.atan2(rise, SLOPE_RUN) * 180) / Math.PI;
		if (slopeDegrees < threshold) continue;

		const steepness = Math.min(1, (slopeDegrees - threshold) / 35);
		const strength = 0.25 + 0.75 * steepness;
		const keep = Math.min(1, settings.density) * (0.55 + 0.45 * steepness);
		if (particleHash(i, 2, 0, lakeSeed) >= keep) continue;

		zones.push({
			lakeId: lake.id,
			// A hand's width out over the water from the waterline.
			x: wx - nx * 0.15,
			y: water + 0.04,
			z: wz - nz * 0.15,
			nx: -nx,
			nz: -nz,
			strength,
			seed: Math.floor(particleHash(i, 3, 0, lakeSeed) * 4294967295) >>> 0,
			slopeDegrees
		});
		if (zones.length >= MAX_ZONES_PER_LAKE) break;
	}
	return zones;
}

/** Shoreline point at `angle`, with its true outward normal (from the outline's derivative). */
function shorePoint(
	lake: LakeDefinition,
	angle: number
): { x: number; z: number; nx: number; nz: number } {
	const r = lakeRadiusAt(lake, angle);
	const da = 1e-3;
	const dr = (lakeRadiusAt(lake, angle + da) - lakeRadiusAt(lake, angle - da)) / (2 * da);
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	// Tangent dP/dθ, rotated a quarter turn to point out of the lake.
	const tx = dr * cos - r * sin;
	const tz = dr * sin + r * cos;
	let nx = tz;
	let nz = -tx;
	if (nx * cos + nz * sin < 0) {
		nx = -nx;
		nz = -nz;
	}
	const length = Math.hypot(nx, nz) || 1;
	return { x: lake.x + cos * r, z: lake.z + sin * r, nx: nx / length, nz: nz / length };
}

function estimatePerimeter(lake: LakeDefinition): number {
	let total = 0;
	const steps = 48;
	let px = 0;
	let pz = 0;
	for (let i = 0; i <= steps; i++) {
		const a = (i / steps) * Math.PI * 2;
		const r = lakeRadiusAt(lake, a);
		const x = Math.cos(a) * r;
		const z = Math.sin(a) * r;
		if (i > 0) total += Math.hypot(x - px, z - pz);
		px = x;
		pz = z;
	}
	return total;
}

export type SplashBand = 'full' | 'reduced' | 'far' | 'off';

/** Distance band of a zone for the current quality: full, reduced rate, sparse, or not simulated. */
export function splashBand(
	distance: number,
	profile: ParticleQualityProfile,
	cullOverride = 0
): SplashBand {
	const cull = cullOverride > 0 ? cullOverride : profile.cullDistance;
	if (distance > cull) return 'off';
	if (distance <= Math.min(profile.fullDistance, cull)) return 'full';
	if (distance <= Math.min(profile.reducedDistance, cull)) return 'reduced';
	return 'far';
}

/** Burst interval multiplier and particle-count multiplier for a band. */
export const SPLASH_BAND_FACTORS: Readonly<
	Record<SplashBand, { interval: number; count: number }>
> = {
	full: { interval: 1, count: 1 },
	reduced: { interval: 2.2, count: 0.6 },
	far: { interval: 4, count: 0.4 },
	off: { interval: Infinity, count: 0 }
};

/**
 * Seconds until a zone's next splash: irregular (1.5–5 s base), a little more often on steeper
 * banks, scaled by quality and distance. Deterministic from the zone seed and burst number.
 */
export function splashInterval(
	zone: SplashZoneDefinition,
	burstNumber: number,
	frequencyScale: number,
	band: SplashBand
): number {
	const base = 1.5 + 3.5 * particleHash(burstNumber, 9, 0, zone.seed);
	const steep = 0.7 + 0.6 * zone.strength;
	return (base / (Math.max(0.05, frequencyScale) * steep)) * SPLASH_BAND_FACTORS[band].interval;
}
