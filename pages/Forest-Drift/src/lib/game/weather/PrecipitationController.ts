import { createParticleBurst, type ParticleEffectManager } from '../particles/ParticleEffectManager';
import {
	createParticleFieldFrame,
	fieldCyclesFor,
	wrapMod,
	type ParticleFieldFrame
} from '../particles/ParticleFieldMath';
import type { ParticleEffectDefinition, ParticleFieldDefinition } from '../particles/ParticleTypes';
import type { WeatherEnvironment, WeatherQualityProfile } from './WeatherTypes';
import { WEATHER_QUALITY } from './WeatherTypes';

/**
 * Rain and snow, on the shared particle system:
 *
 *   - Falling precipitation is two GPU particle FIELDS (`weather-rain`, `weather-snow`): fixed
 *     capacity per graphics preset, live count = capacity × amount, animated and recycled entirely
 *     in the vertex shader inside a volume that follows the camera. The CPU sets uniforms only.
 *   - Rain IMPACTS are a few dozen representative bursts per second near the camera (not one per
 *     drop): a tiny splash on the ground, floors and roofs, or a flat ripple on lakes and rivers.
 *     Each samples the surfaces at one point — no raycasts, no per-drop collision.
 *   - SHELTER: when the camera is under a roof, a box around the building (grown from a handful of
 *     coarse "is there cover here?" probes) hides precipitation inside it, so it does not fall
 *     through the roof; outside the doors and windows it carries on. Impacts under cover are skipped.
 *
 * Every particle counts against the one particle budget; nothing allocates per frame.
 */

/** Rain streaks: thin, cool grey, lit by the scene. */
export const WEATHER_RAIN_FIELD: ParticleFieldDefinition = {
	id: 'weather-rain',
	textureId: 'rain-streak',
	shape: 'streak',
	blending: 'normal',
	// Drops catch the bright sky as much as the scene light: partly unlit, so they read on grey days.
	lighting: 0.55,
	color: [0.86, 0.9, 0.97]
};

/** Snowflakes: soft, near white, lit by the scene. */
export const WEATHER_SNOW_FIELD: ParticleFieldDefinition = {
	id: 'weather-snow',
	textureId: 'snowflake',
	shape: 'flake',
	blending: 'normal',
	lighting: 0.6,
	color: [1, 1, 1]
};

/** A raindrop hitting the ground: two to four tiny droplets bouncing up. */
export const RAIN_SPLASH: ParticleEffectDefinition = {
	id: 'rain-splash',
	priority: 'ambient',
	maxParticles: 400,
	burstMin: 2,
	burstMax: 4,
	lifetimeMin: 0.2,
	lifetimeMax: 0.36,
	sizeStart: 0.035,
	sizeEnd: 0.02,
	sizeJitter: 0.35,
	speedMin: 0.15,
	speedMax: 0.5,
	upMin: 0.9,
	upMax: 1.7,
	spread: 0.55,
	spawnRadius: 0.04,
	gravity: 9.8,
	drag: 0.4,
	opacityStart: 0.55,
	opacityEnd: 0,
	fadeIn: 0.05,
	spin: 2,
	color: [0.88, 0.93, 1],
	lighting: 1,
	textureId: 'water-droplet',
	blending: 'normal',
	killDepth: 0.05
};

/** A raindrop on water: one flat ring spreading and fading. */
export const RAIN_RIPPLE: ParticleEffectDefinition = {
	id: 'rain-ripple',
	priority: 'ambient',
	maxParticles: 240,
	burstMin: 1,
	burstMax: 1,
	lifetimeMin: 0.55,
	lifetimeMax: 0.9,
	sizeStart: 0.05,
	sizeEnd: 0.42,
	sizeJitter: 0.3,
	speedMin: 0,
	speedMax: 0,
	upMin: 0,
	upMax: 0,
	spread: 0,
	spawnRadius: 0,
	gravity: 0,
	drag: 0,
	opacityStart: 0.5,
	opacityEnd: 0,
	fadeIn: 0.04,
	spin: 0,
	color: [0.86, 0.92, 0.98],
	lighting: 1,
	textureId: 'rain-ripple',
	blending: 'normal',
	killDepth: 1,
	orientation: 'ground'
};

/** Surfaces the impacts and the shelter test read — a handful of point queries per frame. */
export interface PrecipitationSurfaces {
	/** Highest surface rain lands on at (x, z): terrain, foundations, floors, roofs. */
	groundY(x: number, z: number): number;
	/** Underside of the nearest roof/ceiling above `fromY` at (x, z), or null in the open. */
	coverAbove(x: number, z: number, fromY: number): number | null;
	/** Water surface at (x, z), or NaN when there is no water. */
	waterY(x: number, z: number): number;
}

/** Where the camera is and what it can see, this frame. */
export interface PrecipitationView {
	x: number;
	y: number;
	z: number;
	/** Feet height (shelter probes start just above it). */
	feetY: number;
	/** Horizontal view direction (unit). */
	lookX: number;
	lookZ: number;
	/** Radians per screen pixel (vertical FOV ÷ viewport height). */
	pixelAngle: number;
	/** Rough visibility test for impact positions (frustum). */
	visible(x: number, y: number, z: number): boolean;
}

export interface PrecipitationShelter {
	active: boolean;
	minX: number;
	minZ: number;
	maxX: number;
	maxZ: number;
	topY: number;
}

export interface PrecipitationStats {
	rain: number;
	snow: number;
	rainCapacity: number;
	snowCapacity: number;
	impactsPerSecond: number;
	sheltered: boolean;
	densityScale: number;
}

const RAIN_PERIOD = 64;
const SNOW_PERIOD = 256;
const SHELTER_PROBE_INTERVAL = 0.2;
const SHELTER_MAX_REACH = 30;

function mulberry(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export class PrecipitationController {
	private quality: WeatherQualityProfile = WEATHER_QUALITY.high;
	private readonly rainFrame: ParticleFieldFrame = createParticleFieldFrame();
	private readonly snowFrame: ParticleFieldFrame = createParticleFieldFrame();
	private readonly burst = createParticleBurst();
	private readonly random = mulberry(0x7a1e);
	private rainClock = 0;
	private snowClock = 0;
	private rainDriftX = 0;
	private rainDriftZ = 0;
	private snowDriftX = 0;
	private snowDriftZ = 0;
	private impactDebt = 0;
	private impactSeed = 1;
	private impactRate = 0;
	private shelterTimer = 0;
	readonly shelter: PrecipitationShelter = {
		active: false,
		minX: 0,
		minZ: 0,
		maxX: 0,
		maxZ: 0,
		topY: 0
	};
	/** Last impact positions (x, y, z triples) — the debug view draws them. */
	readonly impactPoints = new Float32Array(32 * 3);
	private impactCursor = 0;
	/** Adaptive quality: 0.35..1 multiplier on counts and impacts. */
	densityScale = 1;

	constructor(
		private readonly particles: ParticleEffectManager,
		private readonly surfaces: PrecipitationSurfaces
	) {
		particles.register(RAIN_SPLASH);
		particles.register(RAIN_RIPPLE);
		particles.registerField(WEATHER_RAIN_FIELD, this.quality.rainCapacity);
		particles.registerField(WEATHER_SNOW_FIELD, this.quality.snowCapacity);
		this.configureFrames();
	}

	get volumeRadius(): number {
		return Math.max(this.rainFrame.radius, this.snowFrame.radius);
	}

	get volumeHeight(): number {
		return Math.max(this.quality.rainHeight, this.quality.snowHeight);
	}

	setQuality(quality: WeatherQualityProfile): void {
		this.quality = quality;
		this.particles.setFieldCapacity(WEATHER_RAIN_FIELD.id, quality.rainCapacity);
		this.particles.setFieldCapacity(WEATHER_SNOW_FIELD.id, quality.snowCapacity);
		this.configureFrames();
	}

	update(
		deltaSeconds: number,
		env: WeatherEnvironment,
		view: PrecipitationView,
		density: { rain: number; snow: number }
	): void {
		const dt = Math.min(0.1, Math.max(0, deltaSeconds));
		this.shelterTimer -= dt;
		if (this.shelterTimer <= 0) {
			this.shelterTimer = SHELTER_PROBE_INTERVAL;
			this.probeShelter(view);
		}

		const rainCount = this.quality.rainCapacity * Math.pow(Math.max(0, env.rain), 0.9) * density.rain;
		const snowCount = this.quality.snowCapacity * Math.max(0, env.snow) * density.snow;
		const rain = this.particles.setFieldCount(
			WEATHER_RAIN_FIELD.id,
			Math.round(rainCount * this.densityScale)
		);
		const snow = this.particles.setFieldCount(
			WEATHER_SNOW_FIELD.id,
			Math.round(snowCount * this.densityScale)
		);

		if (rain > 0) this.updateRain(dt, env, view);
		if (snow > 0) this.updateSnow(dt, env, view);
		this.updateImpacts(dt, env, view, rain > 0);
	}

	getStats(): PrecipitationStats {
		return {
			rain: this.particles.getFieldCount(WEATHER_RAIN_FIELD.id),
			snow: this.particles.getFieldCount(WEATHER_SNOW_FIELD.id),
			rainCapacity: this.quality.rainCapacity,
			snowCapacity: this.quality.snowCapacity,
			impactsPerSecond: this.impactRate,
			sheltered: this.shelter.active,
			densityScale: this.densityScale
		};
	}

	/** Fixed per-preset parts of the two frames (volume, speeds, sizes). */
	private configureFrames(): void {
		const q = this.quality;
		const rain = this.rainFrame;
		rain.radius = q.rainRadius;
		rain.height = q.rainHeight;
		Object.assign(rain, fieldCyclesFor(8.5, 11.5, q.rainHeight, RAIN_PERIOD));
		rain.width = 0.016;
		rain.sizeJitter = 0.25;
		rain.nearFadeStart = 0.4;
		rain.nearFadeEnd = 1.6;
		rain.flutterAmplitude = 0;

		const snow = this.snowFrame;
		snow.radius = q.snowRadius;
		snow.height = q.snowHeight;
		Object.assign(snow, fieldCyclesFor(0.7, 1.45, q.snowHeight, SNOW_PERIOD));
		snow.width = 0.13;
		snow.length = 0.13;
		snow.sizeJitter = 0.45;
		snow.nearFadeStart = 0.6;
		snow.nearFadeEnd = 2.2;
		// Sideways flutter: ~3–6 s per sway; a slow spin.
		snow.flutterAmplitude = 0.32;
		snow.flutterCycles = 50;
		snow.spinCycles = 40;
		snow.dirX = 0;
		snow.dirY = -1;
		snow.dirZ = 0;
	}

	private placeFrame(frame: ParticleFieldFrame, view: PrecipitationView): void {
		frame.anchorX = view.x;
		frame.anchorY = view.y + frame.height * 0.18;
		frame.anchorZ = view.z;
		frame.pixelAngle = view.pixelAngle;
		frame.shelterEnabled = this.shelter.active;
		frame.shelterMinX = this.shelter.minX;
		frame.shelterMinZ = this.shelter.minZ;
		frame.shelterMaxX = this.shelter.maxX;
		frame.shelterMaxZ = this.shelter.maxZ;
		frame.shelterTopY = this.shelter.topY;
	}

	private updateRain(dt: number, env: WeatherEnvironment, view: PrecipitationView): void {
		const frame = this.rainFrame;
		const amount = Math.min(1, Math.max(0, env.rain));
		// Rain is carried by the wind but falls fast, so it slants rather than drifts.
		const windScale = 0.55;
		const vx = clampWind(env.windX * windScale, 7);
		const vz = clampWind(env.windZ * windScale, 7);
		const size = frame.radius * 2;
		this.rainDriftX = wrapMod(this.rainDriftX + vx * dt, size);
		this.rainDriftZ = wrapMod(this.rainDriftZ + vz * dt, size);
		this.rainClock = wrapMod(this.rainClock + dt, RAIN_PERIOD);
		frame.phase = this.rainClock / RAIN_PERIOD;
		frame.driftX = this.rainDriftX;
		frame.driftZ = this.rainDriftZ;
		const fall = 10;
		const length = Math.hypot(vx, fall, vz);
		frame.dirX = vx / length;
		frame.dirY = -fall / length;
		frame.dirZ = vz / length;
		// Heavier rain: longer, a little more opaque streaks. Light rain stays faint.
		frame.length = 0.55 + 0.45 * amount;
		frame.opacity = 0.38 + 0.32 * amount;
		this.placeFrame(frame, view);
		this.particles.updateField(WEATHER_RAIN_FIELD.id, frame);
	}

	private updateSnow(dt: number, env: WeatherEnvironment, view: PrecipitationView): void {
		const frame = this.snowFrame;
		const amount = Math.min(1, Math.max(0, env.snow));
		this.snowClock = wrapMod(this.snowClock + dt, SNOW_PERIOD);
		// Snow rides the wind almost fully, in gusts — it drifts sideways where rain only slants.
		const t = this.snowClock;
		const gust = 1 + 0.35 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1.1);
		const vx = clampWind(env.windX * 0.85 * gust, 9);
		const vz = clampWind(env.windZ * 0.85 * gust, 9);
		const size = frame.radius * 2;
		this.snowDriftX = wrapMod(this.snowDriftX + vx * dt, size);
		this.snowDriftZ = wrapMod(this.snowDriftZ + vz * dt, size);
		frame.phase = this.snowClock / SNOW_PERIOD;
		frame.driftX = this.snowDriftX;
		frame.driftZ = this.snowDriftZ;
		frame.opacity = 0.65 + 0.3 * amount;
		this.placeFrame(frame, view);
		this.particles.updateField(WEATHER_SNOW_FIELD.id, frame);
	}

	private updateImpacts(
		dt: number,
		env: WeatherEnvironment,
		view: PrecipitationView,
		raining: boolean
	): void {
		this.impactRate = raining
			? this.quality.impactsPerSecond * Math.min(1, env.rain) * this.densityScale
			: 0;
		if (this.impactRate <= 0) {
			this.impactDebt = 0;
			return;
		}
		this.impactDebt += this.impactRate * dt;
		const reach = Math.max(4, this.quality.rainRadius * 0.6);
		let budget = 8; // never more than a few per frame, however long the frame was
		while (this.impactDebt >= 1 && budget-- > 0) {
			this.impactDebt -= 1;
			const angle =
				Math.atan2(view.lookX, view.lookZ) + (this.random() - 0.5) * 2.4;
			// Biased toward the player, like the precipitation itself.
			const distance = 2 + Math.pow(this.random(), 1.4) * (reach - 2);
			const x = view.x + Math.sin(angle) * distance;
			const z = view.z + Math.cos(angle) * distance;
			const ground = this.surfaces.groundY(x, z);
			if (!Number.isFinite(ground)) continue;
			if (this.surfaces.coverAbove(x, z, ground + 0.1) !== null) continue; // under a roof
			const water = this.surfaces.waterY(x, z);
			const onWater = Number.isFinite(water) && water >= ground - 0.05;
			if (onWater && !this.quality.ripples) continue;
			const y = onWater ? water + 0.09 : ground + 0.02;
			if (!view.visible(x, y, z)) continue;
			const burst = this.burst;
			burst.x = x;
			burst.y = y;
			burst.z = z;
			burst.dirX = env.windX || 1;
			burst.dirZ = env.windZ;
			burst.strength = Math.min(1, 0.4 + env.rain * 0.6);
			burst.seed = this.impactSeed++;
			burst.countScale = 1;
			this.particles.emitBurst(onWater ? RAIN_RIPPLE.id : RAIN_SPLASH.id, burst);
			const o = (this.impactCursor++ % 32) * 3;
			this.impactPoints[o] = x;
			this.impactPoints[o + 1] = y;
			this.impactPoints[o + 2] = z;
		}
		if (this.impactDebt > 4) this.impactDebt = 4;
	}

	/**
	 * Is the camera under a roof? If so, march out along ±X and ±Z (1 m steps) to where the cover
	 * ends: that box is the building, and precipitation inside it (below the roof) is hidden. A
	 * dozen-or-so point queries five times a second — never per particle.
	 */
	private probeShelter(view: PrecipitationView): void {
		const fromY = view.feetY + 0.3;
		const roof = this.surfaces.coverAbove(view.x, view.z, fromY);
		const shelter = this.shelter;
		if (roof === null) {
			shelter.active = false;
			return;
		}
		const reach = (dx: number, dz: number) => {
			for (let d = 1; d <= SHELTER_MAX_REACH; d++) {
				if (this.surfaces.coverAbove(view.x + dx * d, view.z + dz * d, fromY) === null) {
					return d - 0.5;
				}
			}
			return SHELTER_MAX_REACH;
		};
		shelter.active = true;
		shelter.maxX = view.x + reach(1, 0);
		shelter.minX = view.x - reach(-1, 0);
		shelter.maxZ = view.z + reach(0, 1);
		shelter.minZ = view.z - reach(0, -1);
		shelter.topY = roof + 0.4;
	}
}

function clampWind(value: number, max: number): number {
	return value > max ? max : value < -max ? -max : value;
}
