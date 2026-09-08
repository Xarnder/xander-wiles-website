import type {
	CloudSettings,
	DayCycleSettings,
	SkySettings,
	SunAtmosphereSettings,
	VisibleSkySettings
} from './SkyTypes';

/** One full day/night revolution in real time — 20 minutes. */
export const DEFAULT_DAY_CYCLE_SECONDS = 20 * 60;

export const NIGHT_SKY = {
	topColor: '#070b18',
	midColor: '#121a38',
	horizonColor: '#1a2036',
	groundHazeColor: '#12100e',
	sunColor: '#c8d6ff'
} as const;

export const TWILIGHT_SKY = {
	topColor: '#2a3878',
	midColor: '#e07038',
	horizonColor: '#ffc090',
	groundHazeColor: '#c49268',
	sunColor: '#ffb060'
} as const;

export function createDefaultDayCycleSettings(): DayCycleSettings {
	return {
		enabled: true,
		durationSeconds: DEFAULT_DAY_CYCLE_SECONDS,
		/** Mid-morning so a new world is not midnight or high noon. */
		timeOfDay: 0.34
	};
}

export function formatClockFromDayFraction(timeOfDay: number): string {
	const wrapped = wrapTimeOfDay(timeOfDay);
	const totalMinutes = Math.round(wrapped * 24 * 60) % (24 * 60);
	const hours24 = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	const suffix = hours24 < 12 ? 'AM' : 'PM';
	const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
	return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function dayPhaseLabel(timeOfDay: number): string {
	const solar = solarElevationFactor(timeOfDay);
	const t = wrapTimeOfDay(timeOfDay);
	if (solar < -0.15) return 'Night';
	if (solar < 0.12) return t < 0.5 ? 'Dawn' : 'Dusk';
	if (t < 0.45) return 'Morning';
	if (t < 0.55) return 'Midday';
	return 'Afternoon';
}

export function formatDayClock(timeOfDay: number): string {
	return `${formatClockFromDayFraction(timeOfDay)} · ${dayPhaseLabel(timeOfDay)}`;
}

export function wrapTimeOfDay(timeOfDay: number): number {
	if (!Number.isFinite(timeOfDay)) return 0;
	const wrapped = timeOfDay % 1;
	return wrapped < 0 ? wrapped + 1 : wrapped;
}

export function advanceTimeOfDay(
	timeOfDay: number,
	deltaSeconds: number,
	durationSeconds: number
): number {
	const duration = durationSeconds > 1 ? durationSeconds : DEFAULT_DAY_CYCLE_SECONDS;
	return wrapTimeOfDay(timeOfDay + deltaSeconds / duration);
}

/**
 * Solar elevation factor: -1 at midnight, 0 at sunrise/sunset, +1 at noon.
 * `timeOfDay` 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
 */
export function solarElevationFactor(timeOfDay: number): number {
	return -Math.cos(wrapTimeOfDay(timeOfDay) * Math.PI * 2);
}

export function sunAnglesForTimeOfDay(
	timeOfDay: number,
	noonElevation: number,
	noonAzimuth: number
): { elevation: number; azimuth: number } {
	const solar = solarElevationFactor(timeOfDay);
	const peak = Number.isFinite(noonElevation) ? noonElevation : 45;
	const elevation = solar >= 0 ? solar * peak : solar * 18;
	const azimuth = ((Number.isFinite(noonAzimuth) ? noonAzimuth : 130) + (wrapTimeOfDay(timeOfDay) - 0.5) * 360 + 360) % 360;
	return { elevation, azimuth };
}

export function daylightAmount(timeOfDay: number): number {
	return smoothstep(-0.08, 0.42, solarElevationFactor(timeOfDay));
}

export function twilightAmount(timeOfDay: number): number {
	const solar = solarElevationFactor(timeOfDay);
	const t = Math.exp(-((solar / 0.22) ** 2));
	return t;
}

export interface EffectiveSkyLook {
	sky: VisibleSkySettings;
	atmosphere: SunAtmosphereSettings;
	clouds: CloudSettings;
	hdriIntensity: number;
	hemiSky: string;
	hemiGround: string;
}

export function ensureDayCycleSettings(sky: SkySettings): DayCycleSettings {
	if (!sky.dayCycle) sky.dayCycle = createDefaultDayCycleSettings();
	const cycle = sky.dayCycle;
	if (typeof cycle.enabled !== 'boolean') cycle.enabled = true;
	if (!Number.isFinite(cycle.durationSeconds) || cycle.durationSeconds < 1) {
		cycle.durationSeconds = DEFAULT_DAY_CYCLE_SECONDS;
	}
	cycle.timeOfDay = wrapTimeOfDay(cycle.timeOfDay);
	return cycle;
}

/**
 * When the cycle is on, daytime colours stay the authored sky settings and night/twilight
 * are blended over them. Elevation/azimuth sliders are the noon pose of the path.
 */
export function resolveEffectiveSky(settings: SkySettings): EffectiveSkyLook {
	const cycle = ensureDayCycleSettings(settings);
	if (!cycle.enabled) {
		return {
			sky: settings.sky,
			atmosphere: settings.atmosphere,
			clouds: settings.clouds,
			hdriIntensity: settings.hdri.intensity,
			hemiSky: '#dcefff',
			hemiGround: '#40391f'
		};
	}

	const { elevation, azimuth } = sunAnglesForTimeOfDay(
		cycle.timeOfDay,
		settings.atmosphere.sunElevation,
		settings.atmosphere.sunAzimuth
	);
	const day = daylightAmount(cycle.timeOfDay);
	const twilight = twilightAmount(cycle.timeOfDay);

	const daySky = {
		topColor: settings.sky.topColor,
		midColor: settings.sky.midColor,
		horizonColor: settings.sky.horizonColor,
		groundHazeColor: settings.sky.groundHazeColor,
		sunColor: settings.atmosphere.sunColor
	};
	const nightBlend = mixPalette(NIGHT_SKY, daySky, day);
	const palette = mixPalette(nightBlend, TWILIGHT_SKY, twilight * (0.35 + (1 - day) * 0.5));

	const sunIntensity =
		settings.atmosphere.sunEnabled === false
			? 0
			: elevation >= 0
				? settings.atmosphere.sunIntensity * (0.22 + 0.78 * day) + twilight * 0.22
				: 0.035 * (1 + elevation / 18);

	return {
		sky: {
			...settings.sky,
			topColor: palette.topColor,
			midColor: palette.midColor,
			horizonColor: palette.horizonColor,
			groundHazeColor: palette.groundHazeColor,
			brightness: settings.sky.brightness * (0.38 + 0.62 * day),
			showSunDisk: settings.sky.showSunDisk && elevation > -1.5
		},
		atmosphere: {
			...settings.atmosphere,
			sunElevation: elevation,
			sunAzimuth: azimuth,
			sunColor: palette.sunColor,
			sunIntensity,
			hemisphereIntensity: settings.atmosphere.hemisphereIntensity * (0.14 + 0.86 * day)
		},
		clouds: {
			...settings.clouds,
			brightness: settings.clouds.brightness * (0.22 + 0.78 * day),
			warmth: clamp01(settings.clouds.warmth + twilight * 0.35)
		},
		hdriIntensity: settings.hdri.intensity * (0.1 + 0.9 * day),
		hemiSky: mixHex('#1a2848', '#dcefff', day),
		hemiGround: mixHex('#0a0806', '#40391f', day)
	};
}

export function mixHex(a: string, b: string, t: number): string {
	const amount = clamp01(t);
	const from = parseHex(a);
	const to = parseHex(b);
	return rgbToHex(
		from.r + (to.r - from.r) * amount,
		from.g + (to.g - from.g) * amount,
		from.b + (to.b - from.b) * amount
	);
}

function mixPalette<T extends Record<string, string>>(from: T, to: T, t: number): T {
	const amount = clamp01(t);
	const result = { ...from };
	for (const key of Object.keys(from) as (keyof T)[]) {
		result[key] = mixHex(from[key], to[key], amount) as T[keyof T];
	}
	return result;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
	const raw = hex.startsWith('#') ? hex.slice(1) : hex;
	const full =
		raw.length === 3 ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}` : raw.padEnd(6, '0');
	return {
		r: Number.parseInt(full.slice(0, 2), 16) || 0,
		g: Number.parseInt(full.slice(2, 4), 16) || 0,
		b: Number.parseInt(full.slice(4, 6), 16) || 0
	};
}

function rgbToHex(r: number, g: number, b: number): string {
	const channel = (value: number) =>
		Math.round(clamp(value, 0, 255))
			.toString(16)
			.padStart(2, '0');
	return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function clamp01(value: number): number {
	return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = clamp01((x - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}
