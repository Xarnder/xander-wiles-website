/**
 * Procedural weather — shared types and presets. Framework-free (no Three.js).
 *
 *   WeatherState        the authoritative weather (type, intensity, wind, cloudiness, fog) — what a
 *                       save file or, later, a server holds
 *   WeatherEnvironment  every number the world reads (precipitation, sun/sky/fog scales, wind…),
 *                       derived from a state and blended between states during transitions
 *
 * Particles, lightning geometry and audio playback are transient visuals derived locally from
 * these; none of them is ever saved or networked.
 */

export type WeatherType = 'clear' | 'rain' | 'thunderstorm' | 'snow';

export const WEATHER_TYPES: readonly WeatherType[] = ['clear', 'rain', 'thunderstorm', 'snow'];

/** Horizontal unit vector the wind blows toward (world X/Z). */
export interface WindDirection {
	x: number;
	z: number;
}

export interface WeatherState {
	type: WeatherType;
	/** 0..1 severity within the type (drizzle → downpour, flurries → heavy snow). */
	intensity: number;
	windDirection: WindDirection;
	/** m/s. */
	windStrength: number;
	/** 0..1. */
	cloudiness: number;
	/** Multiplies fog density (1 = the sky settings' own fog). */
	fogMultiplier: number;
	/** °C — informational for now (snow/rain choice, future surface frost). */
	temperature?: number;
}

/** Everything the world reads from the weather. Blended field by field during transitions. */
export interface WeatherEnvironment {
	/** 0..1 rainfall. */
	rain: number;
	/** 0..1 snowfall. */
	snow: number;
	/** 0..1 sky cover. */
	cloudiness: number;
	/** 0..1 how dark and heavy the clouds look. */
	cloudDarkness: number;
	/** Multiplies direct sunlight. */
	sunScale: number;
	/** Multiplies sky/ambient and environment light. */
	ambientScale: number;
	/** Multiplies the visible sky dome's brightness. */
	skyBrightness: number;
	/** Multiplies fog density. */
	fogMultiplier: number;
	/** 0..1 how far sky, light and fog colours move toward grey. */
	desaturation: number;
	/** 0..1 cool blue-grey tint (snow, storms). */
	coolness: number;
	/** Wind vector, m/s. */
	windX: number;
	windZ: number;
	/** 0..1 storm activity: drives lightning frequency. */
	lightning: number;
}

/** [value at intensity 0, value at intensity 1]. */
type Range = readonly [number, number];

/** What one weather type looks like across its intensity range. Plain data. */
export interface WeatherPreset {
	type: WeatherType;
	defaultIntensity: number;
	cloudiness: Range;
	cloudDarkness: Range;
	sunScale: Range;
	ambientScale: Range;
	skyBrightness: Range;
	fogMultiplier: Range;
	desaturation: Range;
	coolness: Range;
	windStrength: Range;
	rain: Range;
	snow: Range;
	lightning: Range;
	temperature: number;
}

/**
 * Starting looks, tuned by eye. Rain stays pleasant (never near-black); a thunderstorm is darker,
 * windier and lit by lightning, not just "rain at 1"; snow is bright, soft and hazy.
 */
export const WEATHER_PRESETS: Readonly<Record<WeatherType, WeatherPreset>> = {
	clear: {
		type: 'clear',
		defaultIntensity: 0.6,
		// Intensity 1 = the clearest day.
		cloudiness: [0.38, 0.18],
		cloudDarkness: [0.04, 0],
		sunScale: [0.95, 1],
		ambientScale: [1, 1],
		skyBrightness: [1, 1],
		fogMultiplier: [1.05, 0.95],
		desaturation: [0.04, 0],
		coolness: [0, 0],
		windStrength: [3, 1.5],
		rain: [0, 0],
		snow: [0, 0],
		lightning: [0, 0],
		temperature: 18
	},
	rain: {
		type: 'rain',
		defaultIntensity: 0.6,
		cloudiness: [0.72, 0.94],
		cloudDarkness: [0.22, 0.48],
		sunScale: [0.55, 0.28],
		ambientScale: [0.93, 0.8],
		skyBrightness: [0.86, 0.7],
		fogMultiplier: [1.2, 1.75],
		desaturation: [0.22, 0.4],
		coolness: [0.1, 0.2],
		windStrength: [3, 8],
		rain: [0.22, 1],
		snow: [0, 0],
		lightning: [0, 0],
		temperature: 11
	},
	thunderstorm: {
		type: 'thunderstorm',
		defaultIntensity: 0.8,
		cloudiness: [0.96, 1],
		cloudDarkness: [0.62, 0.82],
		sunScale: [0.2, 0.08],
		ambientScale: [0.72, 0.58],
		skyBrightness: [0.6, 0.46],
		fogMultiplier: [1.6, 2.15],
		desaturation: [0.4, 0.55],
		coolness: [0.25, 0.35],
		windStrength: [8, 15],
		rain: [0.75, 1],
		snow: [0, 0],
		lightning: [0.45, 1],
		temperature: 14
	},
	snow: {
		type: 'snow',
		defaultIntensity: 0.55,
		cloudiness: [0.7, 0.9],
		cloudDarkness: [0.05, 0.16],
		sunScale: [0.55, 0.3],
		ambientScale: [1.02, 0.96],
		skyBrightness: [0.95, 0.86],
		fogMultiplier: [1.4, 2.4],
		desaturation: [0.35, 0.5],
		coolness: [0.45, 0.62],
		windStrength: [1.5, 5],
		rain: [0, 0],
		snow: [0.2, 1],
		lightning: [0, 0],
		temperature: -3
	}
};

function lerpRange(range: Range, t: number): number {
	return range[0] + (range[1] - range[0]) * t;
}

export function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : Number.isFinite(value) ? value : 0;
}

/** A full state for `type` at `intensity`, with the preset's cloud, fog and wind for that intensity. */
export function createWeatherState(
	type: WeatherType,
	intensity = WEATHER_PRESETS[type].defaultIntensity,
	windAngle = 0
): WeatherState {
	const preset = WEATHER_PRESETS[type];
	const i = clamp01(intensity);
	return {
		type,
		intensity: i,
		windDirection: { x: Math.sin(windAngle), z: Math.cos(windAngle) },
		windStrength: lerpRange(preset.windStrength, i),
		cloudiness: lerpRange(preset.cloudiness, i),
		fogMultiplier: lerpRange(preset.fogMultiplier, i),
		temperature: preset.temperature
	};
}

export function createWeatherEnvironment(): WeatherEnvironment {
	return environmentForState(createWeatherState('clear'));
}

/** The environment a state settles to once any transition has finished. */
export function environmentForState(
	state: WeatherState,
	out: WeatherEnvironment = {} as WeatherEnvironment
): WeatherEnvironment {
	const preset = WEATHER_PRESETS[state.type];
	const i = clamp01(state.intensity);
	const wind = Math.max(0, state.windStrength);
	const length = Math.hypot(state.windDirection.x, state.windDirection.z) || 1;
	out.rain = lerpRange(preset.rain, i);
	out.snow = lerpRange(preset.snow, i);
	out.cloudiness = clamp01(state.cloudiness);
	out.cloudDarkness = lerpRange(preset.cloudDarkness, i);
	out.sunScale = lerpRange(preset.sunScale, i);
	out.ambientScale = lerpRange(preset.ambientScale, i);
	out.skyBrightness = lerpRange(preset.skyBrightness, i);
	out.fogMultiplier = Math.max(0.1, state.fogMultiplier);
	out.desaturation = lerpRange(preset.desaturation, i);
	out.coolness = lerpRange(preset.coolness, i);
	out.windX = (state.windDirection.x / length) * wind;
	out.windZ = (state.windDirection.z / length) * wind;
	out.lightning = lerpRange(preset.lightning, i);
	return out;
}

export function copyWeatherEnvironment(
	from: WeatherEnvironment,
	out: WeatherEnvironment
): WeatherEnvironment {
	out.rain = from.rain;
	out.snow = from.snow;
	out.cloudiness = from.cloudiness;
	out.cloudDarkness = from.cloudDarkness;
	out.sunScale = from.sunScale;
	out.ambientScale = from.ambientScale;
	out.skyBrightness = from.skyBrightness;
	out.fogMultiplier = from.fogMultiplier;
	out.desaturation = from.desaturation;
	out.coolness = from.coolness;
	out.windX = from.windX;
	out.windZ = from.windZ;
	out.lightning = from.lightning;
	return out;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = clamp01((x - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

/**
 * Blends two environments the way weather actually changes rather than as one cross-fade:
 * when precipitation is arriving, the clouds, light and fog lead and the rain/snow follows
 * (clear → clouds gather → sun dims → light rain → heavier rain); when it is leaving, the
 * precipitation stops first and the sky clears after. Lightning follows precipitation.
 */
export function lerpWeatherEnvironment(
	from: WeatherEnvironment,
	to: WeatherEnvironment,
	t: number,
	out: WeatherEnvironment
): WeatherEnvironment {
	const x = clamp01(t);
	const fromWet = Math.max(from.rain, from.snow);
	const toWet = Math.max(to.rain, to.snow);
	const arriving = smoothstep(0.35, 1, x);
	const leaving = smoothstep(0, 0.6, x);
	const precip = (a: number, b: number) => a + (b - a) * (b > a ? arriving : leaving);
	const sky =
		toWet > fromWet + 0.02
			? smoothstep(0, 0.65, x)
			: toWet < fromWet - 0.02
				? smoothstep(0.3, 1, x)
				: smoothstep(0, 1, x);
	const mix = (a: number, b: number) => a + (b - a) * sky;
	const wind = smoothstep(0, 1, x);

	out.rain = precip(from.rain, to.rain);
	out.snow = precip(from.snow, to.snow);
	out.lightning = precip(from.lightning, to.lightning);
	out.cloudiness = mix(from.cloudiness, to.cloudiness);
	out.cloudDarkness = mix(from.cloudDarkness, to.cloudDarkness);
	out.sunScale = mix(from.sunScale, to.sunScale);
	out.ambientScale = mix(from.ambientScale, to.ambientScale);
	out.skyBrightness = mix(from.skyBrightness, to.skyBrightness);
	out.fogMultiplier = mix(from.fogMultiplier, to.fogMultiplier);
	out.desaturation = mix(from.desaturation, to.desaturation);
	out.coolness = mix(from.coolness, to.coolness);
	out.windX = from.windX + (to.windX - from.windX) * wind;
	out.windZ = from.windZ + (to.windZ - from.windZ) * wind;
	return out;
}

/**
 * Default transition length (s) for a change: bigger changes take longer, from about 15 s for a
 * small intensity change to a minute for clear ↔ thunderstorm.
 */
export function defaultTransitionSeconds(from: WeatherEnvironment, to: WeatherEnvironment): number {
	const change =
		Math.abs(to.cloudiness - from.cloudiness) +
		Math.abs(to.cloudDarkness - from.cloudDarkness) +
		Math.abs(Math.max(to.rain, to.snow) - Math.max(from.rain, from.snow)) +
		Math.abs(to.lightning - from.lightning) * 0.5;
	return Math.min(60, Math.max(12, 12 + change * 24));
}

/** Same type, intensity, wind, cloud and fog (within rounding). */
export function sameWeatherState(a: WeatherState, b: WeatherState): boolean {
	return (
		a.type === b.type &&
		Math.abs(a.intensity - b.intensity) < 1e-3 &&
		Math.abs(a.windStrength - b.windStrength) < 1e-3 &&
		Math.abs(a.windDirection.x - b.windDirection.x) < 1e-3 &&
		Math.abs(a.windDirection.z - b.windDirection.z) < 1e-3 &&
		Math.abs(a.cloudiness - b.cloudiness) < 1e-3 &&
		Math.abs(a.fogMultiplier - b.fogMultiplier) < 1e-3
	);
}

export function cloneWeatherState(state: WeatherState): WeatherState {
	return { ...state, windDirection: { ...state.windDirection } };
}

// ---------------------------------------------------------------------------------- quality

/** Per-graphics-preset weather detail. Capacities are allocated once per preset. */
export interface WeatherQualityProfile {
	rainCapacity: number;
	snowCapacity: number;
	/** Horizontal radius (m) of the camera-local precipitation volume. */
	rainRadius: number;
	snowRadius: number;
	/** Volume heights (m). Snow's is smaller: it falls slowly and its haze hides distant flakes. */
	rainHeight: number;
	snowHeight: number;
	/** Representative rain impacts per second at full rain. */
	impactsPerSecond: number;
	/** Ripples on lakes and rivers. */
	ripples: boolean;
	/** Visible lightning bolts (the flash always happens). */
	bolts: boolean;
}

export type WeatherQualityTier = 'low' | 'medium' | 'high' | 'ultra';

/**
 * Starting points, tuned by eye and profiling (README "Weather"). The volume is deliberately small:
 * drops beyond ~15 m are sub-pixel streaks the fog hides anyway, so the budget goes where it is
 * seen. Density per cubic metre stays similar across presets — lower presets shrink the volume.
 */
export const WEATHER_QUALITY: Readonly<Record<WeatherQualityTier, WeatherQualityProfile>> = {
	low: {
		rainCapacity: 800,
		snowCapacity: 600,
		rainRadius: 10,
		snowRadius: 8,
		rainHeight: 14,
		snowHeight: 10,
		impactsPerSecond: 12,
		ripples: false,
		bolts: true
	},
	medium: {
		rainCapacity: 1600,
		snowCapacity: 1100,
		rainRadius: 13,
		snowRadius: 9,
		rainHeight: 16,
		snowHeight: 11,
		impactsPerSecond: 24,
		ripples: true,
		bolts: true
	},
	high: {
		rainCapacity: 3000,
		snowCapacity: 2000,
		rainRadius: 15,
		snowRadius: 10,
		rainHeight: 18,
		snowHeight: 12,
		impactsPerSecond: 40,
		ripples: true,
		bolts: true
	},
	ultra: {
		rainCapacity: 5000,
		snowCapacity: 3000,
		rainRadius: 17,
		snowRadius: 12,
		rainHeight: 20,
		snowHeight: 14,
		impactsPerSecond: 60,
		ripples: true,
		bolts: true
	}
};

// ---------------------------------------------------------------------------------- debug

export type WeatherSelection = 'schedule' | WeatherType;

/** Developer controls (Settings → Weather). Not saved with worlds. */
export interface WeatherDebugSettings {
	enabled: boolean;
	/** `schedule` follows the world's procedural weather; anything else forces that weather. */
	selection: WeatherSelection;
	intensity: number;
	/** Seconds for manual changes (0 = a short test blend, about 6 seconds). */
	transitionDuration: number;
	/** Degrees, the direction the wind blows toward (0 = +Z). */
	windDirection: number;
	windStrength: number;
	cloudiness: number;
	/** Multipliers on the preset's precipitation counts. */
	rainDensity: number;
	snowDensity: number;
	/** Multiplier on lightning frequency. */
	lightningFrequency: number;
	/** -1 = follow the weather, otherwise a fixed 0..1 surface wetness. */
	wetnessOverride: number;
	/** -1 = follow the weather, otherwise a fixed 0..1 snow cover on the ground and tops. */
	snowCoverOverride: number;
	/** Freezes the weather clock (the procedural schedule and transitions). */
	paused: boolean;
	/** Speeds the weather clock up (schedule and transitions) for testing. */
	timeScale: number;
	/** Whether the procedural schedule may choose snow (no climate/seasons yet). */
	allowSnow: boolean;
	/** 0..1 weather sound volume (rain, wind, thunder). */
	audioVolume: number;
	showVolume: boolean;
	showImpacts: boolean;
}

export function createDefaultWeatherDebugSettings(): WeatherDebugSettings {
	const clear = createWeatherState('clear');
	return {
		enabled: true,
		selection: 'schedule',
		intensity: clear.intensity,
		transitionDuration: 0,
		windDirection: 0,
		windStrength: clear.windStrength,
		cloudiness: clear.cloudiness,
		rainDensity: 1,
		snowDensity: 1,
		lightningFrequency: 1,
		wetnessOverride: -1,
		snowCoverOverride: -1,
		paused: false,
		timeScale: 1,
		allowSnow: false,
		audioVolume: 0.7,
		showVolume: false,
		showImpacts: false
	};
}

// ---------------------------------------------------------------------------------- persistence

/**
 * What a world saves about its weather: the logical state only. The procedural schedule is a pure
 * function of `seed` and `time`, so those two restore it exactly; a forced (manual) weather and an
 * unfinished manual transition are kept too. Particles, bolts and sounds are never saved.
 */
export interface WeatherSaveState {
	version: 1;
	seed: number;
	/** Logical weather clock (s). */
	time: number;
	mode: 'schedule' | 'manual';
	allowSnow: boolean;
	manual?: WeatherState;
	/** A manual change still in progress when saved. */
	transition?: { from: WeatherState; progress: number; duration: number };
	/** Surface state that takes minutes to build or fade (0..1). */
	wetness?: number;
	snowCover?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A clean state from untrusted data, or null. */
export function sanitizeWeatherState(value: unknown): WeatherState | null {
	if (!isRecord(value)) return null;
	if (!WEATHER_TYPES.includes(value.type as WeatherType)) return null;
	const type = value.type as WeatherType;
	const base = createWeatherState(type, clamp01(finite(value.intensity, 0.5)));
	const wind = isRecord(value.windDirection) ? value.windDirection : {};
	const wx = finite(wind.x, 0);
	const wz = finite(wind.z, 1);
	const length = Math.hypot(wx, wz);
	return {
		type,
		intensity: base.intensity,
		windDirection: length > 1e-6 ? { x: wx / length, z: wz / length } : { x: 0, z: 1 },
		windStrength: Math.min(40, Math.max(0, finite(value.windStrength, base.windStrength))),
		cloudiness: clamp01(finite(value.cloudiness, base.cloudiness)),
		fogMultiplier: Math.min(10, Math.max(0.1, finite(value.fogMultiplier, base.fogMultiplier))),
		temperature: finite(value.temperature, base.temperature ?? 10)
	};
}

/** A clean save from untrusted data, or null (old worlds have none). */
export function sanitizeWeatherSave(value: unknown): WeatherSaveState | null {
	if (!isRecord(value)) return null;
	const manual = value.manual === undefined ? undefined : sanitizeWeatherState(value.manual);
	const mode = value.mode === 'manual' && manual ? 'manual' : 'schedule';
	let transition: WeatherSaveState['transition'];
	if (isRecord(value.transition)) {
		const from = sanitizeWeatherState(value.transition.from);
		if (from) {
			transition = {
				from,
				progress: clamp01(finite(value.transition.progress, 1)),
				duration: Math.min(600, Math.max(0.1, finite(value.transition.duration, 30)))
			};
		}
	}
	return {
		version: 1,
		seed: Math.floor(finite(value.seed, 0)) >>> 0,
		time: Math.max(0, finite(value.time, 0)),
		mode,
		allowSnow: value.allowSnow === true,
		manual: manual ?? undefined,
		transition: mode === 'manual' ? transition : undefined,
		wetness: value.wetness === undefined ? undefined : clamp01(finite(value.wetness, 0)),
		snowCover: value.snowCover === undefined ? undefined : clamp01(finite(value.snowCover, 0))
	};
}
