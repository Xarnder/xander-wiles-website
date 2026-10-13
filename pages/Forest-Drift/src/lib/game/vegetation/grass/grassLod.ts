/**
 * Grass LOD maths, shared by the CPU (per-chunk instance counts, stats) and mirrored exactly by the
 * vertex shader (per-tuft fade) — see `grassMaterial.ts`. Pure.
 *
 * Density LOD, not just geometry LOD: a tuft at distance `d` exists while its fixed rank hash is
 * below `density(d)`. Density is a continuous piecewise-linear curve — full near the player, down
 * through the LOD1/LOD2 levels, to zero at the render distance — so there is no ring where half the
 * grass vanishes at once. Tufts within `fade` of the threshold shrink smoothly (height and width)
 * instead of popping. Because each chunk's instances are sorted by rank, the CPU only has to tell
 * the GPU how many of them could possibly be visible at the chunk's nearest point.
 */
import type { GrassQualityProfile, GrassSettings } from './GrassTypes';

/** Rank band (0..1) over which a tuft scales in/out — the crossfade width. */
export const GRASS_RANK_FADE = 0.07;

export interface GrassLodState {
	/** Effective distances, metres (settings × quality × adaptive). */
	lod0: number;
	lod1: number;
	lod2: number;
	end: number;
	/** Effective densities (0..1) at lod0/lod1/lod2. */
	density0: number;
	density1: number;
	density2: number;
}

export function grassDensityAt(lod: GrassLodState, distance: number): number {
	if (distance <= lod.lod0) return lod.density0;
	if (distance <= lod.lod1)
		return (
			lod.density0 +
			(lod.density1 - lod.density0) * ((distance - lod.lod0) / Math.max(1e-3, lod.lod1 - lod.lod0))
		);
	if (distance <= lod.lod2)
		return (
			lod.density1 +
			(lod.density2 - lod.density1) * ((distance - lod.lod1) / Math.max(1e-3, lod.lod2 - lod.lod1))
		);
	if (distance < lod.end)
		return lod.density2 * (1 - (distance - lod.lod2) / Math.max(1e-3, lod.end - lod.lod2));
	return 0;
}

/** How visible (0..1, the scale fade) a tuft of `rank` is at `distance`. */
export function grassTuftVisibility(lod: GrassLodState, rank: number, distance: number): number {
	const t = (grassDensityAt(lod, distance) - rank) / GRASS_RANK_FADE;
	return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/**
 * Instances of a rank-sorted chunk that can be visible anywhere at or beyond `nearestDistance`
 * (density only falls with distance). `rankCounts[k]` = instances with rank byte < k.
 */
export function grassInstancesWithin(
	lod: GrassLodState,
	rankCounts: Uint32Array,
	nearestDistance: number
): number {
	const density = grassDensityAt(lod, nearestDistance);
	if (density <= 0) return 0;
	// The shader reads a rank byte b as b / 255 and shows the tuft while b / 255 < density, i.e.
	// b ≤ floor(255 · density) — always within the first floor(256 · density) + 1 bytes.
	const k = Math.min(256, Math.floor(density * 256) + 1);
	return rankCounts[k];
}

/**
 * Adaptive quality: a single level `a` (1 = full quality, 0 = most degraded) mapped onto what gives
 * way first, in the order that costs the least visually — far density, then LOD distances, then
 * mid-distance density, then (modestly) near density. Each step uses its own quarter of the range,
 * so a small drop only thins the far grass.
 */
export interface GrassAdaptiveFactors {
	farDensity: number;
	distance: number;
	midDensity: number;
	nearDensity: number;
}

export function grassAdaptiveFactors(level: number): GrassAdaptiveFactors {
	const a = Math.min(1, Math.max(0, level));
	const step = (from: number) => Math.min(1, Math.max(0, (a - from) / 0.25));
	return {
		farDensity: 0.35 + 0.65 * step(0.75),
		distance: 0.72 + 0.28 * step(0.5),
		midDensity: 0.5 + 0.5 * step(0.25),
		nearDensity: 0.75 + 0.25 * step(0)
	};
}

export function resolveGrassLod(
	settings: GrassSettings,
	quality: GrassQualityProfile,
	adaptiveLevel: number,
	budgetScale = 1
): GrassLodState {
	const adaptive = grassAdaptiveFactors(adaptiveLevel);
	const distance = quality.distanceScale * adaptive.distance;
	const end = Math.max(1, settings.renderDistance * distance);
	const lod2 = Math.min(end, settings.lod2Distance * distance);
	const lod1 = Math.min(lod2, settings.lod1Distance * distance);
	const lod0 = Math.min(lod1, settings.lod0Distance * distance);
	const budget = Math.min(1, Math.max(0, budgetScale));
	return {
		lod0,
		lod1,
		lod2,
		end,
		density0: Math.min(1, settings.lod0Density * adaptive.nearDensity * budget),
		density1: Math.min(1, settings.lod1Density * adaptive.midDensity * budget),
		density2: Math.min(1, settings.lod2Density * adaptive.farDensity * budget)
	};
}

/**
 * Hysteresis controller for adaptive grass quality. Fed the smoothed frame rate once per second:
 * three consecutive seconds under 90% of target lower the level one step; eight consecutive seconds
 * above 97% raise it half a step. Never oscillates second to second.
 */
export class GrassAdaptiveQuality {
	level = 1;
	private timer = 0;
	private lowSeconds = 0;
	private highSeconds = 0;

	update(deltaSeconds: number, smoothedFps: number, targetFps: number, enabled: boolean): boolean {
		if (!enabled) {
			const changed = this.level !== 1;
			this.level = 1;
			return changed;
		}
		this.timer += deltaSeconds;
		if (this.timer < 1) return false;
		this.timer = 0;
		const before = this.level;
		if (smoothedFps < targetFps * 0.9) {
			this.highSeconds = 0;
			if (++this.lowSeconds >= 3) {
				this.lowSeconds = 0;
				this.level = Math.max(0, this.level - 0.1);
			}
		} else if (smoothedFps > targetFps * 0.97) {
			this.lowSeconds = 0;
			if (++this.highSeconds >= 8) {
				this.highSeconds = 0;
				this.level = Math.min(1, this.level + 0.05);
			}
		} else {
			this.lowSeconds = 0;
			this.highSeconds = 0;
		}
		return this.level !== before;
	}
}
