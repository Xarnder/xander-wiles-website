import type { BiomeField } from './BiomeField';
import {
	BIOME_ATMOSPHERE_PROFILES,
	MAX_FOG_DENSITY,
	MAX_FOG_TINT
} from './biomeAtmosphereProfiles';
import { BIOME_COUNT, createBiomeWeightVector, createClimateSample } from './BiomeTypes';

/** Seconds for the local climate to move ~63% of the way to a new biome's (settles in ~4 s). */
export const LOCAL_CLIMATE_TIME_CONSTANT = 1.5;
/** How far the atmosphere must move before the sky look is re-applied. */
const LOOK_EPSILON = 0.004;

/** The climate where the player is, as weather and the sky use it. */
export interface LocalClimateState {
	/** 0..1 climate temperature (with the elevation lapse) — decides rain versus snow. */
	temperature: number;
	/** Multiplies the shared weather's precipitation here (0 desert … ~1.35 jungle). */
	precipitation: number;
	fogR: number;
	fogG: number;
	fogB: number;
	/** 0..MAX_FOG_TINT: how far fog and horizon colours lean toward the fog tint. */
	fogAmount: number;
	/** 1..MAX_FOG_DENSITY: fog distance divisor. */
	fogDensity: number;
}

function neutral(): LocalClimateState {
	return {
		temperature: 0.5,
		precipitation: 1,
		fogR: 1,
		fogG: 1,
		fogB: 1,
		fogAmount: 0,
		fogDensity: 1
	};
}

/**
 * Samples the biome field under the camera and eases toward it, so crossing a border changes the
 * weather and haze over a few seconds rather than in a step. Frame-rate independent; never
 * allocates. While a world's biomes are off it reports `active() === false` and callers keep the
 * pre-biome weather and sky exactly.
 */
export class LocalClimate {
	private readonly field: BiomeField;
	readonly state: LocalClimateState = neutral();
	private readonly target: LocalClimateState = neutral();
	private readonly applied: LocalClimateState = neutral();
	private readonly weights = createBiomeWeightVector();
	private readonly climate = createClimateSample();
	private fresh = true;

	constructor(field: BiomeField) {
		this.field = field;
	}

	active(): boolean {
		return this.field.isEnabled();
	}

	/** Forget the eased state (a new world, or biomes switched): the next update snaps. */
	reset(): void {
		this.fresh = true;
		Object.assign(this.state, neutral());
	}

	/** Eases toward the biome at (x, z). Returns true when the sky look should be re-applied. */
	update(worldX: number, worldZ: number, deltaSeconds: number): boolean {
		if (!this.active()) {
			const wasTinted = this.applied.fogAmount > 0 || this.applied.fogDensity !== 1;
			if (wasTinted || !this.fresh) {
				this.reset();
				Object.assign(this.applied, neutral());
				return wasTinted;
			}
			return false;
		}
		this.sampleTarget(worldX, worldZ);
		const s = this.state;
		const t = this.target;
		const k = this.fresh
			? 1
			: 1 - Math.exp(-Math.max(0, deltaSeconds) / LOCAL_CLIMATE_TIME_CONSTANT);
		this.fresh = false;
		s.temperature += (t.temperature - s.temperature) * k;
		s.precipitation += (t.precipitation - s.precipitation) * k;
		s.fogR += (t.fogR - s.fogR) * k;
		s.fogG += (t.fogG - s.fogG) * k;
		s.fogB += (t.fogB - s.fogB) * k;
		s.fogAmount += (t.fogAmount - s.fogAmount) * k;
		s.fogDensity += (t.fogDensity - s.fogDensity) * k;

		const a = this.applied;
		const moved =
			Math.abs(s.fogAmount - a.fogAmount) > LOOK_EPSILON ||
			Math.abs(s.fogDensity - a.fogDensity) > LOOK_EPSILON ||
			Math.abs(s.fogR - a.fogR) + Math.abs(s.fogG - a.fogG) + Math.abs(s.fogB - a.fogB) >
				LOOK_EPSILON * 3;
		if (moved) Object.assign(a, s);
		return moved;
	}

	private sampleTarget(worldX: number, worldZ: number): void {
		const w = this.weights;
		this.field.weightsAt(worldX, worldZ, w);
		this.field.climateAt(worldX, worldZ, this.climate);
		const t = this.target;
		t.temperature = this.climate.temperature;
		let precipitation = 0;
		let amount = 0;
		let density = 0;
		let r = 0;
		let g = 0;
		let b = 0;
		for (let i = 0; i < BIOME_COUNT; i++) {
			const weight = w[i];
			if (weight <= 0) continue;
			const p = BIOME_ATMOSPHERE_PROFILES[i];
			precipitation += p.precipitation * weight;
			density += p.fog.density * weight;
			const tinted = p.fog.amount * weight;
			amount += tinted;
			r += p.fog.color[0] * tinted;
			g += p.fog.color[1] * tinted;
			b += p.fog.color[2] * tinted;
		}
		t.precipitation = precipitation;
		t.fogAmount = Math.min(MAX_FOG_TINT, amount);
		t.fogDensity = Math.min(MAX_FOG_DENSITY, Math.max(1, density));
		if (amount > 1e-6) {
			t.fogR = r / amount;
			t.fogG = g / amount;
			t.fogB = b / amount;
		} else {
			t.fogR = t.fogG = t.fogB = 1;
		}
	}

	/** River and lake body-colour multiplier at a point (blended across borders). */
	waterTintAt(worldX: number, worldZ: number, out: Float32Array, offset: number): void {
		const w = this.weights;
		this.field.weightsAt(worldX, worldZ, w);
		let r = 0;
		let g = 0;
		let b = 0;
		for (let i = 0; i < BIOME_COUNT; i++) {
			const weight = w[i];
			if (weight <= 0) continue;
			const water = BIOME_ATMOSPHERE_PROFILES[i].water;
			r += water[0] * weight;
			g += water[1] * weight;
			b += water[2] * weight;
		}
		out[offset] = r;
		out[offset + 1] = g;
		out[offset + 2] = b;
	}
}
