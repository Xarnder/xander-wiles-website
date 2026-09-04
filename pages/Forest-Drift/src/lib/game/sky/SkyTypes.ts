/**
 * Sky/atmosphere configuration. Framework-free, same rule as TerrainSettings/VegetationSettings —
 * read directly by SkySystem/CloudSystem/HdriEnvironmentSystem, mutated live by the debug GUI.
 *
 * ARCHITECTURE: the HDRI (HdriEnvironmentSystem) contributes *lighting/reflections only* — it is
 * not the visible sky by default (`showAsBackground` defaults false). The visible sky is entirely
 * procedural (SkySystem's gradient dome + CloudSystem's cloud layers), which is what gives control
 * over sky colour, horizon haze, fog matching, and moving clouds without being stuck inside a
 * static photographed panorama. See the README "Sky, HDRI and clouds" section for the full
 * rationale, including why an HDRI with visible clouds would double up with CloudSystem.
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
	sunDiskSize: number;
	sunDiskBrightness: number;
	sunDiskSoftness: number;
}

export interface HdriSettings {
	enabled: boolean;
	intensity: number;
	/** Degrees, converted to radians internally. */
	rotation: number;
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

export interface SkySettings {
	sky: VisibleSkySettings;
	hdri: HdriSettings;
	atmosphere: SunAtmosphereSettings;
	clouds: CloudSettings;
	debug: SkyDebugSettings;
}

/**
 * Defaults chosen to look calm and pleasant immediately: clean blue upper sky, soft pale horizon
 * haze, gentle matching fog, warm mid-elevation sun, and two large soft cloud layers drifting
 * slowly. HDRI is on by default but only for lighting (see module doc) — with no asset present it
 * falls back to a lightweight procedural gradient environment rather than failing silently.
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
			sunDiskSize: 0.02,
			sunDiskBrightness: 3.2,
			sunDiskSoftness: 0.012
		},

		hdri: {
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
		}
	};
}
