import type { HdriPreset } from './hdriPresets';

/**
 * Sky/atmosphere configuration. Framework-free, same rule as TerrainSettings/VegetationSettings —
 * read directly by SkySystem/CloudSystem/HdriEnvironmentSystem, mutated live by the debug GUI.
 *
 * ARCHITECTURE: HDRI supplies lighting/reflections and the daytime panorama. The gradient dome
 * and procedural clouds fade in around dusk and out around morning, driven by game time.
 */

export interface VisibleSkySettings {
	enabled: boolean;
	/** Hex colour strings ('#rrggbb') — lil-gui's colour picker binds directly to these. */
	topColor: string;
	midColor: string;
	horizonColor: string;
	groundHazeColor: string;
	/** View-direction Y (-1..1) where the horizon band is centred. */
	horizonHeight: number;
	/** Width of the smooth horizon transition. */
	horizonSoftness: number;
	brightness: number;
	showSunDisk: boolean;
	/** Angular radius in radians (small-angle chord approximation). */
	sunDiskSize: number;
	sunDiskBrightness: number;
	sunDiskSoftness: number;
}

export interface HdriSettings {
	/** Missing in older worlds: defaults to Cloudscape Sunny. */
	preset?: HdriPreset;
	enabled: boolean;
	intensity: number;
	/** Degrees, converted to radians internally. */
	rotation: number;
	/** Legacy save field; visible backgrounds now follow game time automatically. */
	showAsBackground: boolean;
}

export type FogDensityMode = 'linear' | 'exponential';

export interface SunAtmosphereSettings {
	sunEnabled: boolean;
	sunIntensity: number;
	/** Degrees above the horizon, 0..90. */
	sunElevation: number;
	/** Degrees around the horizon, 0..360. */
	sunAzimuth: number;
	sunColor: string;
	hemisphereIntensity: number;

	fogEnabled: boolean;
	fogNear: number;
	fogFar: number;
	fogColor: string;
	/** When true, fog colour is derived from the sky's horizon colour instead of `fogColor`. */
	fogMatchHorizon: boolean;
	fogDensityMode: FogDensityMode;
}

export interface CloudSettings {
	enabled: boolean;
	/** 1-3 active layers — see CloudSystem's fixed per-layer recipes for how they differ. */
	layerCount: number;
	altitude: number;
	scale: number;
	coverage: number;
	softness: number;
	opacity: number;
	brightness: number;
	shadowTint: number;

	speed1: number;
	speed2: number;
	direction1: number;
	direction2: number;
	driftStrength: number;

	macroScale: number;
	breakupScale: number;
	wispyScale: number;
	edgeThreshold: number;
	edgeSoftness: number;

	lightResponse: number;
	warmth: number;
	coolTint: number;
}

export interface SkyDebugSettings {
	showCloudBounds: boolean;
	showCloudLayerWireframe: boolean;
	showSkyOnly: boolean;
}

/**
 * Real-time sun path. `timeOfDay` is 0 at midnight, 0.25 at sunrise, 0.5 at noon, 0.75 at sunset.
 * Atmosphere elevation/azimuth are the noon pose of that path while the cycle is on, and the
 * static sun pose when it is off.
 */
export interface DayCycleSettings {
	enabled: boolean;
	/** Real-time seconds for one midnight-to-midnight revolution. */
	durationSeconds: number;
	timeOfDay: number;
}

export interface SkySettings {
	sky: VisibleSkySettings;
	hdri: HdriSettings;
	atmosphere: SunAtmosphereSettings;
	clouds: CloudSettings;
	debug: SkyDebugSettings;
	dayCycle: DayCycleSettings;
}

/**
 * Defaults chosen to look calm and pleasant immediately: clean blue upper sky, soft pale horizon
 * haze, gentle matching fog, warm mid-elevation sun, and two large soft cloud layers drifting
 * slowly. Cloudscape Sunny provides environment lighting by default; image-loading failures
 * fall back to a lightweight procedural gradient environment.
 */
export function createDefaultSkySettings(): SkySettings {
	return {
		sky: {
			enabled: true,
			topColor: '#2f79d1',
			midColor: '#79b8ee',
			horizonColor: '#cfe9f2',
			groundHazeColor: '#ded0b6',
			horizonHeight: 0.0,
			horizonSoftness: 0.12,
			brightness: 1.0,
			showSunDisk: true,
			sunDiskSize: 0.008,
			sunDiskBrightness: 1.8,
			sunDiskSoftness: 0.0012
		},

		hdri: {
			preset: 'cloudscape-sunny',
			enabled: true,
			intensity: 1.0,
			rotation: 0,
			showAsBackground: false
		},

		atmosphere: {
			sunEnabled: true,
			sunIntensity: 1.15,
			sunElevation: 45,
			sunAzimuth: 130,
			sunColor: '#fff1d6',
			hemisphereIntensity: 0.9,

			fogEnabled: true,
			fogNear: 140,
			fogFar: 420,
			fogColor: '#cfe9f2',
			fogMatchHorizon: true,
			fogDensityMode: 'linear'
		},

		clouds: {
			enabled: true,
			layerCount: 2,
			altitude: 220,
			scale: 1,
			coverage: 0.45,
			softness: 0.5,
			opacity: 0.85,
			brightness: 1.0,
			shadowTint: 0.35,

			speed1: 0.4,
			speed2: 0.25,
			direction1: 20,
			direction2: 200,
			driftStrength: 1,

			macroScale: 1.5,
			breakupScale: 4,
			wispyScale: 9,
			edgeThreshold: 0.52,
			edgeSoftness: 0.18,

			lightResponse: 0.6,
			warmth: 0.4,
			coolTint: 0.25
		},

		debug: {
			showCloudBounds: false,
			showCloudLayerWireframe: false,
			showSkyOnly: false
		},

		dayCycle: {
			enabled: true,
			durationSeconds: 20 * 60,
			timeOfDay: 0.34
		}
	};
}
