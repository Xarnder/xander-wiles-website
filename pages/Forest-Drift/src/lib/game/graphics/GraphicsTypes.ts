/**
 * Central "quality preset" architecture for rendering — see the README's "Graphics quality" section
 * for the full design rationale. Every quality-dependent rendering decision (shadows, ambient
 * occlusion, anti-aliasing, bloom, pixel ratio, render-distance multipliers) is looked up from ONE
 * `GraphicsPreset` here rather than scattered `if (quality === 'high')` checks throughout the
 * renderer — `GraphicsPipeline` is the only place that reads these values.
 */

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

export type AntiAliasMode = 'fxaa' | 'smaa';

export type AoQuality = 'low' | 'medium' | 'high';

export interface GraphicsPreset {
	readonly label: string;

	/** `renderer.setPixelRatio()` is capped at `min(window.devicePixelRatio, pixelRatioCap)` — never the raw device ratio unconditionally. */
	readonly pixelRatioCap: number;
	/** Passed to `renderer.capabilities.getMaxAnisotropy()`-capped texture filtering; 1 = off. */
	readonly anisotropy: number;

	readonly shadowsEnabled: boolean;
	/** Cascaded shadow map count (CSM). Ignored when `shadowsEnabled` is false. */
	readonly shadowCascades: number;
	/** One shadow-map resolution per cascade, near → far — the near cascade carries the most visual weight so it gets the highest resolution. */
	readonly shadowMapSizes: readonly number[];
	/** CSM's far plane (world units) — deliberately independent of and much shorter than the camera/terrain view distance, since shadow quality degrades the more world space a cascade has to cover. */
	readonly shadowDistance: number;

	readonly aoEnabled: boolean;
	readonly aoQuality: AoQuality;
	/** GTAO sample radius, world units. */
	readonly aoRadius: number;
	/** GTAO blend intensity — how strongly the computed occlusion darkens the scene (kept subtle; never full black). */
	readonly aoIntensity: number;

	readonly antialiasing: AntiAliasMode;

	readonly bloomEnabled: boolean;
	readonly bloomStrength: number;
	readonly bloomRadius: number;
	readonly bloomThreshold: number;

	readonly terrainRenderDistanceMultiplier: number;
	readonly treeRenderDistanceMultiplier: number;

	/** Lower bound `renderScale` dynamic resolution may drop to for this preset (see GraphicsSettings.dynamicResolutionEnabled). 1 disables downscaling headroom entirely. */
	readonly minDynamicResolutionScale: number;
}

export const GRAPHICS_PRESETS: Readonly<Record<GraphicsQuality, GraphicsPreset>> = {
	low: {
		label: 'Low',
		pixelRatioCap: 0.8,
		anisotropy: 1,
		shadowsEnabled: false,
		shadowCascades: 0,
		shadowMapSizes: [],
		shadowDistance: 0,
		aoEnabled: false,
		aoQuality: 'low',
		aoRadius: 3,
		aoIntensity: 0.7,
		antialiasing: 'fxaa',
		bloomEnabled: false,
		bloomStrength: 0,
		bloomRadius: 0,
		bloomThreshold: 1,
		terrainRenderDistanceMultiplier: 0.75,
		treeRenderDistanceMultiplier: 0.6,
		minDynamicResolutionScale: 0.6
	},
	medium: {
		label: 'Medium',
		pixelRatioCap: 1.0,
		anisotropy: 4,
		shadowsEnabled: true,
		shadowCascades: 2,
		shadowMapSizes: [1536, 1024],
		shadowDistance: 60,
		aoEnabled: true,
		aoQuality: 'low',
		aoRadius: 4,
		aoIntensity: 0.85,
		antialiasing: 'smaa',
		bloomEnabled: false,
		bloomStrength: 0,
		bloomRadius: 0,
		bloomThreshold: 1,
		terrainRenderDistanceMultiplier: 0.85,
		treeRenderDistanceMultiplier: 0.8,
		minDynamicResolutionScale: 0.65
	},
	high: {
		label: 'High',
		pixelRatioCap: 1.5,
		anisotropy: 8,
		shadowsEnabled: true,
		shadowCascades: 3,
		shadowMapSizes: [2048, 1024, 1024],
		shadowDistance: 100,
		aoEnabled: true,
		aoQuality: 'medium',
		aoRadius: 5,
		aoIntensity: 1.0,
		antialiasing: 'smaa',
		bloomEnabled: false,
		bloomStrength: 0,
		bloomRadius: 0,
		bloomThreshold: 1,
		terrainRenderDistanceMultiplier: 1,
		treeRenderDistanceMultiplier: 1,
		minDynamicResolutionScale: 0.7
	},
	ultra: {
		label: 'Ultra',
		pixelRatioCap: 2.0,
		anisotropy: 16,
		shadowsEnabled: true,
		shadowCascades: 4,
		shadowMapSizes: [2048, 2048, 1024, 1024],
		shadowDistance: 140,
		aoEnabled: true,
		aoQuality: 'high',
		aoRadius: 6,
		aoIntensity: 1.1,
		antialiasing: 'smaa',
		// Very subtle — only the brightest sun/sky highlights bloom; see the README for why ULTRA
		// deliberately does not use TAA (ghosting/smearing on a moving first-person camera) and keeps
		// bloom this restrained (the brief explicitly warns against "cartoon bloom").
		bloomEnabled: true,
		bloomStrength: 0.12,
		bloomRadius: 0.3,
		bloomThreshold: 0.92,
		terrainRenderDistanceMultiplier: 1,
		treeRenderDistanceMultiplier: 1,
		minDynamicResolutionScale: 0.75
	}
};

const QUALITY_ORDER: readonly GraphicsQuality[] = ['low', 'medium', 'high', 'ultra'];

/** `L` cycles LOW → MEDIUM → HIGH → ULTRA → LOW. */
export function nextGraphicsQuality(quality: GraphicsQuality): GraphicsQuality {
	const index = QUALITY_ORDER.indexOf(quality);
	return QUALITY_ORDER[(index + 1) % QUALITY_ORDER.length];
}

export function graphicsQualityLabel(quality: GraphicsQuality): string {
	return GRAPHICS_PRESETS[quality].label;
}

export interface GraphicsSettings {
	quality: GraphicsQuality;
	/** Smoothly scales resolution down (within the active preset's `minDynamicResolutionScale`) when frame time rises above `targetFps`'s budget, and back up when it recovers. */
	dynamicResolutionEnabled: boolean;
	targetFps: number;
	/** `renderer.toneMappingExposure` — a debug-GUI knob independent of quality preset; every preset uses ACESFilmicToneMapping, only the exposure is player/developer-tunable. */
	toneMappingExposure: number;
	/** Debug-GUI-only: shows the extended render-stats overlay (draw calls, triangles, shadow cost, etc). */
	showRenderStats: boolean;
}

/**
 * HIGH is the default on the (reasonable) assumption that most players are on capable desktop
 * hardware — see the brief's explicit instruction not to aggressively auto-detect via user-agent.
 * A player on weaker hardware can drop to MEDIUM/LOW with a single `L` press, and their choice is
 * then remembered (see GraphicsSettingsStore).
 */
export function createDefaultGraphicsSettings(): GraphicsSettings {
	return {
		quality: 'high',
		dynamicResolutionEnabled: true,
		targetFps: 60,
		toneMappingExposure: 1.0,
		showRenderStats: false
	};
}
