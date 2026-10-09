import type { EffectiveSkyLook } from '../sky/dayNightMath';
import { clamp01, type WeatherEnvironment } from './WeatherTypes';

/**
 * How the weather changes the world's look — framework-free. The day/night cycle resolves the
 * sky's look (colours, sun, fog, clouds) as before; `applyWeatherToLook` then layers the weather
 * on top, so every existing system (SkySystem, CloudSystem, fog, lights, HDRI) keeps rendering it
 * and no parallel weather renderer exists:
 *
 *   clouds  coverage, opacity, darkness, softness, speed and direction (wind)
 *   sky     dome brightness, colours pulled toward luminance-matched greys (so night stays night)
 *   light   direct sun and sky/ambient/environment scaled; colours desaturated and cooled
 *   fog     nearer and thicker, tinted with the greyed horizon
 *   flash   lightning adds a brief ambient/sky/cloud boost on top — never touching the sun
 *
 * Also integrates surface wetness (slow to soak, slower to dry) and turns the wind into tree sway.
 */

export interface TreeWindParams {
	/** Multiplies the tree shader's sway (1 = authored calm breeze). */
	strengthScale: number;
	/** Unit direction the wind blows toward. */
	dirX: number;
	dirZ: number;
	/** Steady lean (m at the crown) in the wind direction, bounded. */
	lean: number;
}

export class WeatherEnvironmentController {
	private wet = 0;
	private snow = 0;

	/** 0..1 surface wetness right now. */
	get wetness(): number {
		return this.wet;
	}

	/** 0..1 snow lying on exposed upward surfaces right now. */
	get snowCover(): number {
		return this.snow;
	}

	setWetness(value: number): void {
		this.wet = clamp01(value);
	}

	setSnowCover(value: number): void {
		this.snow = clamp01(value);
	}

	/**
	 * Snow builds up over a couple of minutes of snowfall (faster when heavy) and melts slowly once it
	 * stops — quickly in rain. `override` ≥ 0 pins the value (debug).
	 */
	updateSnowCover(deltaSeconds: number, env: WeatherEnvironment, override = -1): number {
		if (override >= 0) {
			this.snow = clamp01(override);
			return this.snow;
		}
		const target = env.snow > 0.05 ? Math.min(1, 0.3 + env.snow * 0.8) : 0;
		const rate =
			target > this.snow ? (0.15 + env.snow) / 140 : env.rain > 0.05 ? 1 / 70 : 1 / 600;
		const step = Math.min(Math.abs(target - this.snow), rate * Math.max(0, deltaSeconds));
		this.snow = clamp01(this.snow + Math.sign(target - this.snow) * step);
		return this.snow;
	}

	/**
	 * Rain soaks surfaces over a couple of minutes and they dry over several; snow barely wets.
	 * `override` ≥ 0 pins the value (debug).
	 */
	updateWetness(deltaSeconds: number, env: WeatherEnvironment, override = -1): number {
		if (override >= 0) {
			this.wet = clamp01(override);
			return this.wet;
		}
		const target = env.rain > 0.03 ? 0.45 + 0.55 * env.rain : env.snow > 0.05 ? 0.15 : 0;
		const rate = target > this.wet ? (0.25 + env.rain) / 120 : 1 / 420;
		const step = Math.min(Math.abs(target - this.wet), rate * Math.max(0, deltaSeconds));
		this.wet = clamp01(this.wet + Math.sign(target - this.wet) * step);
		return this.wet;
	}

	treeWind(env: WeatherEnvironment, out: TreeWindParams): TreeWindParams {
		const speed = Math.hypot(env.windX, env.windZ);
		out.dirX = speed > 1e-4 ? env.windX / speed : 0;
		out.dirZ = speed > 1e-4 ? env.windZ / speed : 1;
		// Calm (~2 m/s) keeps the authored breeze; a storm sways about 2.4× harder, never more.
		out.strengthScale = Math.min(2.4, 0.8 + speed * 0.1);
		out.lean = Math.min(0.35, Math.max(0, speed - 3) * 0.03);
		return out;
	}
}

/** Returns a new look with `env` (and a lightning `flash`, 0..~1.3) applied. Never mutates `look`. */
export function applyWeatherToLook(
	look: EffectiveSkyLook,
	env: WeatherEnvironment,
	flash = 0
): EffectiveSkyLook {
	const cloud = clamp01(env.cloudiness);
	const overcast = clamp01((cloud - 0.3) / 0.65);
	const skyGrey = clamp01(env.desaturation + overcast * 0.45);
	const cool = clamp01(env.coolness);
	// Under overcast the horizon haze stays light (it is lit cloud seen edge-on): darkening it like
	// the dome would make fogged distant hills a dark band under a bright cloud deck.
	const domeDarken = env.skyBrightness;
	const horizonDarken = 1 + (env.skyBrightness - 1) * 0.15;
	const wind = Math.hypot(env.windX, env.windZ);
	const windDegrees = wind > 0.05 ? (Math.atan2(-env.windX, -env.windZ) * 180) / Math.PI : null;
	const fog = Math.max(0.1, env.fogMultiplier);
	const f = Math.max(0, flash);

	const sky = {
		...look.sky,
		topColor: weatherColor(look.sky.topColor, skyGrey, cool, domeDarken),
		midColor: weatherColor(look.sky.midColor, skyGrey, cool, 1 + (domeDarken - 1) * 0.6),
		horizonColor: weatherColor(look.sky.horizonColor, skyGrey, cool, horizonDarken),
		groundHazeColor: weatherColor(look.sky.groundHazeColor, skyGrey, cool, horizonDarken),
		brightness: look.sky.brightness + f * 0.8,
		showSunDisk: look.sky.showSunDisk && cloud < 0.9,
		sunDiskBrightness: look.sky.sunDiskBrightness * (1 - smoothstep(0.45, 0.92, cloud))
	};

	const atmosphere = {
		...look.atmosphere,
		sunColor: weatherColor(look.atmosphere.sunColor, env.desaturation * 0.6, cool * 0.5, 1),
		sunIntensity: look.atmosphere.sunIntensity * env.sunScale,
		hemisphereIntensity: look.atmosphere.hemisphereIntensity * env.ambientScale + f * 2.6,
		fogNear: look.atmosphere.fogNear / Math.pow(fog, 0.8),
		fogFar: look.atmosphere.fogFar / Math.pow(fog, 0.85)
	};

	const clouds = {
		...look.clouds,
		coverage: Math.min(0.98, Math.max(0.05, look.clouds.coverage + (cloud - 0.3) * 0.75)),
		opacity: look.clouds.opacity + (1 - look.clouds.opacity) * smoothstep(0.4, 1, cloud),
		brightness: look.clouds.brightness * (1 - 0.55 * clamp01(env.cloudDarkness)) + f * 1.6,
		shadowTint:
			look.clouds.shadowTint + (1 - look.clouds.shadowTint) * clamp01(env.cloudDarkness),
		edgeSoftness: look.clouds.edgeSoftness * (1 + overcast * 0.6),
		coolTint: clamp01(look.clouds.coolTint + cool * 0.4),
		warmth: look.clouds.warmth * (1 - overcast * 0.7),
		speed1: look.clouds.speed1 * (1 + wind / 8),
		speed2: look.clouds.speed2 * (1 + wind / 8),
		direction1: windDegrees ?? look.clouds.direction1,
		direction2: windDegrees !== null ? windDegrees + 25 : look.clouds.direction2
	};

	const hemiDesat = env.desaturation * 0.8;
	let hemiSky = weatherColor(look.hemiSky, hemiDesat, cool, 1);
	if (f > 0) hemiSky = mixColor(hemiSky, '#e4ecff', Math.min(1, f));
	return {
		sky,
		atmosphere,
		clouds,
		hdriIntensity: look.hdriIntensity * env.ambientScale + f * 1.1,
		hemiSky,
		hemiGround: weatherColor(look.hemiGround, hemiDesat, cool * 0.5, 1)
	};
}

// ---------------------------------------------------------------------------------- colour

function parse(hex: string): [number, number, number] {
	const raw = hex.startsWith('#') ? hex.slice(1) : hex;
	const full =
		raw.length === 3
			? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
			: raw.padEnd(6, '0');
	return [
		(Number.parseInt(full.slice(0, 2), 16) || 0) / 255,
		(Number.parseInt(full.slice(2, 4), 16) || 0) / 255,
		(Number.parseInt(full.slice(4, 6), 16) || 0) / 255
	];
}

function toHex(r: number, g: number, b: number): string {
	const channel = (value: number) =>
		Math.round(Math.min(1, Math.max(0, value)) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Pulls a colour toward a grey of the same luminance (so a night sky stays dark and a noon sky
 * stays bright), cooled toward blue-grey by `cool`, then scaled by `darken`.
 */
export function weatherColor(hex: string, desaturate: number, cool: number, darken: number): string {
	const [r, g, b] = parse(hex);
	const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	const gr = l * (1 - cool * 0.1);
	const gg = l * (1 + cool * 0.01);
	const gb = l * (1 + cool * 0.14);
	const t = clamp01(desaturate);
	return toHex(
		(r + (gr - r) * t) * darken,
		(g + (gg - g) * t) * darken,
		(b + (gb - b) * t) * darken
	);
}

function mixColor(a: string, b: string, t: number): string {
	const [ar, ag, ab] = parse(a);
	const [br, bg, bb] = parse(b);
	return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = clamp01((x - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}
