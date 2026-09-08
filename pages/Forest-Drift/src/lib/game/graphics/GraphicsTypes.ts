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
	/** Only affects the AO buffer's render resolution (see AO_RESOLUTION_SCALE) — the actual look of the AO (radius, contrast, strength, ...) is controlled by the shared, live-tunable `AoTuning` in GraphicsSettings, not per-preset, since it's a look/taste knob rather than a performance tier. */
	readonly aoQuality: AoQuality;

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
		// LOW deliberately never reduces resolution — its performance budget comes entirely from
		// disabling shadows/AO and shrinking render distance, not from rendering below the display's
		// native resolution. `4` is comfortably above every real device pixel ratio in use today, so
		// this is effectively "no cap" rather than a real limit.
		pixelRatioCap: 4,
		anisotropy: 1,
		shadowsEnabled: false,
		shadowCascades: 0,
		shadowMapSizes: [],
		shadowDistance: 0,
		aoEnabled: false,
		aoQuality: 'low',
		antialiasing: 'fxaa',
		bloomEnabled: false,
		bloomStrength: 0,
		bloomRadius: 0,
		bloomThreshold: 1,
		terrainRenderDistanceMultiplier: 0.75,
		treeRenderDistanceMultiplier: 0.6,
		// Never dynamic-resolution-downscale below full res at LOW either — see pixelRatioCap's comment.
		minDynamicResolutionScale: 1
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

/**
 * Every GTAO shader parameter that actually shapes how the ambient occlusion looks — as opposed to
 * `GraphicsPreset.aoQuality`, which only controls the AO buffer's render *resolution* (a performance
 * tier). Shared across every quality level with AO enabled, and fully live-tunable from the debug
 * GUI's "Ambient Occlusion" folder — see `GraphicsPipeline.setAoTuning`/`refreshAoTuning` and
 * `exportSettings()`, which lets a value found by eye in the GUI be handed back as new defaults here.
 * Field names/descriptions are phrased for the GUI, not just the GLSL uniform name, since this is the
 * one part of the graphics system meant to be tuned by a person watching the result, not just read by
 * code — see the README's "Graphics quality" section for the full list of what each one does and the
 * real three.js `GTAOShader`/`PoissonDenoiseShader` defaults this was seeded from.
 */
export interface AoTuning {
	/** GTAOShader `radius` — world-space sample radius; ~1 is roughly the width of one grid cell/wall. */
	radius: number;
	/** GTAOShader `distanceExponent` — raises AO contrast; higher = darker, more defined creases. */
	distanceExponent: number;
	/** GTAOShader `thickness` — max view-space depth difference still counted as a nearby occluder. */
	thickness: number;
	/** GTAOShader `distanceFallOff` — how quickly farther samples contribute less to the occlusion. */
	distanceFallOff: number;
	/** GTAOShader `scale` — overall sample-radius scale; leave at 1 unless `radius` alone isn't enough range. */
	scale: number;
	/** GTAOShader `SAMPLES` — more samples = smoother, more expensive raw AO before denoising. */
	samples: number;
	/** GTAOPass `blendIntensity` — overall strength the denoised AO darkens the scene by. */
	blendIntensity: number;
	/** PoissonDenoiseShader `radius` — denoise blur radius; smooths noise, but can wash out narrow creases if too high. */
	denoiseRadius: number;
	/** PoissonDenoiseShader `rings` — Poisson-disc ring count for the denoiser. */
	denoiseRings: number;
	/** PoissonDenoiseShader `samples` — samples per ring for the denoiser. */
	denoiseSamples: number;
	/** PoissonDenoiseShader `radiusExponent` — higher values cluster denoise samples closer to the current pixel. */
	denoiseRadiusExponent: number;
}

/** Seeded directly from three.js's own `GTAOShader`/`GTAOPass` built-in defaults — a known-reasonable starting point rather than a guess, since it's what the library authors validated the effect against. */
export function createDefaultAoTuning(): AoTuning {
	return {
		radius: 0.25,
		distanceExponent: 1,
		thickness: 1,
		distanceFallOff: 1,
		scale: 1,
		samples: 16,
		blendIntensity: 1,
		denoiseRadius: 8,
		denoiseRings: 2,
		denoiseSamples: 16,
		denoiseRadiusExponent: 2
	};
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
	/** Live-tunable GTAO look parameters — see `AoTuning`'s own doc comment. */
	aoTuning: AoTuning;
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
		showRenderStats: false,
		aoTuning: createDefaultAoTuning()
	};
}

/** Creature budgets are client performance preferences; ecology identities never depend on them. */
export const CREATURE_GRAPHICS_BUDGETS: Record<
	GraphicsQuality,
	{
		maxActive: number;
		nearDistance: number;
		smallRenderDistance: number;
		populationRadius: number;
		shadows: boolean;
	}
> = {
	low: {
		maxActive: 16,
		nearDistance: 35,
		smallRenderDistance: 90,
		populationRadius: 320,
		shadows: false
	},
	medium: {
		maxActive: 25,
		nearDistance: 50,
		smallRenderDistance: 130,
		populationRadius: 384,
		shadows: true
	},
	high: {
		maxActive: 40,
		nearDistance: 70,
		smallRenderDistance: 170,
		populationRadius: 448,
		shadows: true
	},
	ultra: {
		maxActive: 50,
		nearDistance: 80,
		smallRenderDistance: 200,
		populationRadius: 512,
		shadows: true
	}
};
