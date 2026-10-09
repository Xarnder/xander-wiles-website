import * as THREE from 'three';
import { setOwnShaderHook } from './shaderHooks';
import { injectWeatherSurface, WEATHER_SURFACE_UNIFORMS } from './weatherSurface';

/**
 * Solid (volumetric) procedural wood — a GLSL port of three.js's `WoodNodeMaterial`
 * (examples/jsm/materials/WoodNodeMaterial.js, itself ported from Blender), the material behind
 * https://threejs.org/examples/webgpu_tsl_wood.html.
 *
 * That material is TSL, which only runs on `WebGPURenderer`; this game renders with
 * `WebGLRenderer` + CSM, so the same functions are written here in GLSL and injected into a
 * `MeshStandardMaterial` through `shaderHooks.ts` (composing with CSM, like every other procedural
 * shader in the game). The algorithm, constants and presets are kept as close to the original as
 * GLSL allows:
 *
 *   rings   — distance from the log's axis (Z), warped by three scales of 3D noise, with a
 *             per-ring size variance, sharpened by `ringBias` and blurred with view distance
 *             (the original's anti-aliasing);
 *   detail  — radial "splotch" variation around the log;
 *   cells   — Voronoi pores/fibres in the cross-section (constant along the grain, so they read
 *             as long fibre streaks), shrinking with distance;
 *   colour  — mix(dark, light, rings) soft-light-blended with the cells and splotches.
 *
 * Because it is evaluated in a 3D "log space" (see `woodCoords.ts`), grain wraps continuously
 * around a beam's edges and its end faces show growth rings, exactly like a cut block of timber.
 */

export interface WoodParameters {
	centerSize: number;
	largeWarpScale: number;
	largeGrainStretch: number;
	smallWarpStrength: number;
	smallWarpScale: number;
	fineWarpStrength: number;
	fineWarpScale: number;
	/** Ring spacing in wood units (the original stores 1 / rings-per-unit). */
	ringThickness: number;
	ringBias: number;
	ringSizeVariance: number;
	ringVarianceScale: number;
	barkThickness: number;
	splotchScale: number;
	splotchIntensity: number;
	cellScale: number;
	cellSize: number;
	darkGrainColor: string;
	lightGrainColor: string;
}

/** The original's ten genus presets, verbatim. */
export const WOOD_GENUS_PRESETS = {
	teak: {
		centerSize: 1.11,
		largeWarpScale: 0.32,
		largeGrainStretch: 0.24,
		smallWarpStrength: 0.059,
		smallWarpScale: 2,
		fineWarpStrength: 0.006,
		fineWarpScale: 32.8,
		ringThickness: 1 / 34,
		ringBias: 0.03,
		ringSizeVariance: 0.03,
		ringVarianceScale: 4.4,
		barkThickness: 0.3,
		splotchScale: 0.2,
		splotchIntensity: 0.541,
		cellScale: 910,
		cellSize: 0.1,
		darkGrainColor: '#0c0504',
		lightGrainColor: '#926c50'
	},
	walnut: {
		centerSize: 1.07,
		largeWarpScale: 0.42,
		largeGrainStretch: 0.34,
		smallWarpStrength: 0.016,
		smallWarpScale: 10.3,
		fineWarpStrength: 0.028,
		fineWarpScale: 12.7,
		ringThickness: 1 / 32,
		ringBias: 0.08,
		ringSizeVariance: 0.03,
		ringVarianceScale: 5.5,
		barkThickness: 0.98,
		splotchScale: 1.84,
		splotchIntensity: 0.97,
		cellScale: 710,
		cellSize: 0.31,
		darkGrainColor: '#311e13',
		lightGrainColor: '#523424'
	},
	white_oak: {
		centerSize: 1.23,
		largeWarpScale: 0.21,
		largeGrainStretch: 0.21,
		smallWarpStrength: 0.034,
		smallWarpScale: 2.44,
		fineWarpStrength: 0.01,
		fineWarpScale: 14.3,
		ringThickness: 1 / 34,
		ringBias: 0.82,
		ringSizeVariance: 0.16,
		ringVarianceScale: 1.4,
		barkThickness: 0.7,
		splotchScale: 0.2,
		splotchIntensity: 0.541,
		cellScale: 800,
		cellSize: 0.28,
		darkGrainColor: '#8b4c21',
		lightGrainColor: '#c57e43'
	},
	pine: {
		centerSize: 1.23,
		largeWarpScale: 0.21,
		largeGrainStretch: 0.18,
		smallWarpStrength: 0.041,
		smallWarpScale: 2.44,
		fineWarpStrength: 0.006,
		fineWarpScale: 23.2,
		ringThickness: 1 / 24,
		ringBias: 0.1,
		ringSizeVariance: 0.07,
		ringVarianceScale: 5,
		barkThickness: 0.35,
		splotchScale: 0.51,
		splotchIntensity: 3.32,
		cellScale: 1480,
		cellSize: 0.07,
		darkGrainColor: '#c58355',
		lightGrainColor: '#d19d61'
	},
	poplar: {
		centerSize: 1.43,
		largeWarpScale: 0.33,
		largeGrainStretch: 0.18,
		smallWarpStrength: 0.04,
		smallWarpScale: 4.3,
		fineWarpStrength: 0.004,
		fineWarpScale: 33.6,
		ringThickness: 1 / 37,
		ringBias: 0.07,
		ringSizeVariance: 0.03,
		ringVarianceScale: 3.8,
		barkThickness: 0.3,
		splotchScale: 1.92,
		splotchIntensity: 0.71,
		cellScale: 830,
		cellSize: 0.04,
		darkGrainColor: '#716347',
		lightGrainColor: '#998966'
	},
	maple: {
		centerSize: 1.4,
		largeWarpScale: 0.38,
		largeGrainStretch: 0.25,
		smallWarpStrength: 0.067,
		smallWarpScale: 2.5,
		fineWarpStrength: 0.005,
		fineWarpScale: 33.6,
		ringThickness: 1 / 35,
		ringBias: 0.1,
		ringSizeVariance: 0.07,
		ringVarianceScale: 4.6,
		barkThickness: 0.61,
		splotchScale: 0.46,
		splotchIntensity: 1.49,
		cellScale: 800,
		cellSize: 0.03,
		darkGrainColor: '#b08969',
		lightGrainColor: '#bc9d7d'
	},
	red_oak: {
		centerSize: 1.21,
		largeWarpScale: 0.24,
		largeGrainStretch: 0.25,
		smallWarpStrength: 0.044,
		smallWarpScale: 2.54,
		fineWarpStrength: 0.01,
		fineWarpScale: 14.5,
		ringThickness: 1 / 34,
		ringBias: 0.92,
		ringSizeVariance: 0.03,
		ringVarianceScale: 5.6,
		barkThickness: 1.01,
		splotchScale: 0.28,
		splotchIntensity: 3.48,
		cellScale: 800,
		cellSize: 0.25,
		darkGrainColor: '#af613b',
		lightGrainColor: '#e0a27a'
	},
	cherry: {
		centerSize: 1.33,
		largeWarpScale: 0.11,
		largeGrainStretch: 0.33,
		smallWarpStrength: 0.024,
		smallWarpScale: 2.48,
		fineWarpStrength: 0.01,
		fineWarpScale: 15.3,
		ringThickness: 1 / 36,
		ringBias: 0.02,
		ringSizeVariance: 0.04,
		ringVarianceScale: 6.5,
		barkThickness: 0.09,
		splotchScale: 1.27,
		splotchIntensity: 1.24,
		cellScale: 1530,
		cellSize: 0.15,
		darkGrainColor: '#913f27',
		lightGrainColor: '#b45837'
	},
	cedar: {
		centerSize: 1.11,
		largeWarpScale: 0.39,
		largeGrainStretch: 0.12,
		smallWarpStrength: 0.061,
		smallWarpScale: 1.9,
		fineWarpStrength: 0.006,
		fineWarpScale: 4.8,
		ringThickness: 1 / 25,
		ringBias: 0.01,
		ringSizeVariance: 0.07,
		ringVarianceScale: 6.7,
		barkThickness: 0.1,
		splotchScale: 0.61,
		splotchIntensity: 2.54,
		cellScale: 630,
		cellSize: 0.19,
		darkGrainColor: '#9a5b49',
		lightGrainColor: '#ae745e'
	},
	mahogany: {
		centerSize: 1.25,
		largeWarpScale: 0.26,
		largeGrainStretch: 0.29,
		smallWarpStrength: 0.044,
		smallWarpScale: 2.54,
		fineWarpStrength: 0.01,
		fineWarpScale: 15.3,
		ringThickness: 1 / 38,
		ringBias: 0.01,
		ringSizeVariance: 0.33,
		ringVarianceScale: 1.2,
		barkThickness: 0.07,
		splotchScale: 0.77,
		splotchIntensity: 1.39,
		cellScale: 1400,
		cellSize: 0.23,
		darkGrainColor: '#501d12',
		lightGrainColor: '#6d3722'
	}
} as const satisfies Record<string, WoodParameters>;

export type WoodGenus = keyof typeof WOOD_GENUS_PRESETS;
export const WOOD_GENERA = Object.keys(WOOD_GENUS_PRESETS) as WoodGenus[];

/**
 * The original's finishes. It uses a clearcoat layer and darkens the colour; this port has no
 * clearcoat (MeshStandardMaterial), so a finish maps to the same darkening plus a roughness.
 */
export const WOOD_FINISHES = {
	raw: { darken: 1, roughness: 0.82 },
	matte: { darken: 0.6, roughness: 0.62 },
	semigloss: { darken: 0.4, roughness: 0.4 },
	gloss: { darken: 0.2, roughness: 0.18 }
} as const;

export type WoodFinish = keyof typeof WOOD_FINISHES;

/**
 * Game timber looks, built on the genus presets. Structural framing in the Alpine reference is
 * dark, aged oak; the others match the existing timber variants.
 */
export const GAME_WOOD_PRESETS: Readonly<
	Record<string, { base: WoodGenus; overrides: Partial<WoodParameters>; finish: WoodFinish }>
> = {
	'dark-oak': {
		base: 'walnut',
		overrides: {
			darkGrainColor: '#1d120b',
			lightGrainColor: '#4a3121',
			ringBias: 0.3,
			splotchIntensity: 1.2
		},
		finish: 'raw'
	},
	'aged-brown': {
		base: 'white_oak',
		overrides: { darkGrainColor: '#3b2416', lightGrainColor: '#7a5134' },
		finish: 'raw'
	},
	weathered: {
		base: 'cedar',
		overrides: { darkGrainColor: '#4f463d', lightGrainColor: '#8a7f71', splotchIntensity: 1.6 },
		finish: 'raw'
	},
	fresh: { base: 'pine', overrides: {}, finish: 'raw' },
	'dark-stained': {
		base: 'mahogany',
		overrides: { darkGrainColor: '#2a160d', lightGrainColor: '#5e331f' },
		finish: 'matte'
	}
};

export function resolveWoodParameters(
	genus: WoodGenus,
	overrides: Partial<WoodParameters> = {}
): WoodParameters {
	return { ...WOOD_GENUS_PRESETS[genus], ...overrides };
}

/** Shared uniform objects; mutate `.value`s to retune live without recompiling. */
export interface WoodUniforms {
	uWoodA: { value: THREE.Vector4 };
	uWoodB: { value: THREE.Vector4 };
	uWoodC: { value: THREE.Vector4 };
	uWoodD: { value: THREE.Vector4 };
	uWoodE: { value: THREE.Vector4 };
	uWoodDark: { value: THREE.Color };
	uWoodLight: { value: THREE.Color };
	/** Wood units per metre of `woodCoord`. 1 = the three.js example's scale (a ring every ~3 cm: stylised, readable at game distances). */
	uWoodScale: { value: number };
	/** 0 = absolute wood colour; 1 = relative (tinted by the vertex colour, e.g. a player-chosen plank colour). */
	uWoodTintMode: { value: number };
	/**
	 * Relative mode only: minimum linear luminance of the tint colour (0 = none). Floor details lift
	 * very dark player-chosen colours so the grain stays visible; building frames keep their paint.
	 */
	uWoodMinLuma: { value: number };
	/** Finish darkening (the original's clearcoat darken). */
	uWoodDarken: { value: number };
}

export function createWoodUniforms(): WoodUniforms {
	return {
		uWoodA: { value: new THREE.Vector4() },
		uWoodB: { value: new THREE.Vector4() },
		uWoodC: { value: new THREE.Vector4() },
		uWoodD: { value: new THREE.Vector4() },
		uWoodE: { value: new THREE.Vector4() },
		uWoodDark: { value: new THREE.Color() },
		uWoodLight: { value: new THREE.Color() },
		uWoodScale: { value: 1 },
		uWoodTintMode: { value: 0 },
		uWoodMinLuma: { value: 0 },
		uWoodDarken: { value: 1 }
	};
}

/** Copies wood parameters into uniforms (colours converted from sRGB to linear). */
export function setWoodUniforms(
	uniforms: WoodUniforms,
	p: WoodParameters,
	options: {
		scale?: number;
		tintMode?: 'absolute' | 'relative';
		finish?: WoodFinish;
		minLuma?: number;
	} = {}
): void {
	uniforms.uWoodA.value.set(
		p.centerSize,
		p.largeWarpScale,
		p.largeGrainStretch,
		p.smallWarpStrength
	);
	uniforms.uWoodB.value.set(
		p.smallWarpScale,
		p.fineWarpStrength,
		p.fineWarpScale,
		1 / p.ringThickness
	);
	uniforms.uWoodC.value.set(p.ringBias, p.ringSizeVariance, p.ringVarianceScale, p.barkThickness);
	uniforms.uWoodD.value.set(p.splotchScale, p.splotchIntensity, p.cellScale, p.cellSize);
	uniforms.uWoodE.value.set(0, 0, 0, 0);
	uniforms.uWoodDark.value.set(p.darkGrainColor);
	uniforms.uWoodLight.value.set(p.lightGrainColor);
	if (options.scale !== undefined) uniforms.uWoodScale.value = options.scale;
	uniforms.uWoodTintMode.value = options.tintMode === 'relative' ? 1 : 0;
	uniforms.uWoodMinLuma.value = options.minLuma ?? 0;
	uniforms.uWoodDarken.value = WOOD_FINISHES[options.finish ?? 'raw'].darken;
}

const WOOD_GLSL = /* glsl */ `
uniform vec4 uWoodA; // centerSize, largeWarpScale, largeGrainStretch, smallWarpStrength
uniform vec4 uWoodB; // smallWarpScale, fineWarpStrength, fineWarpScale, ringsPerUnit
uniform vec4 uWoodC; // ringBias, ringSizeVariance, ringVarianceScale, barkThickness
uniform vec4 uWoodD; // splotchScale, splotchIntensity, cellScale, cellSize
uniform vec3 uWoodDark;
uniform vec3 uWoodLight;
uniform float uWoodScale;
uniform float uWoodTintMode;
uniform float uWoodMinLuma;
uniform float uWoodDarken;
varying vec3 vWoodCoord;

// --- noise (stand-in for MaterialX mx_noise_float / mx_noise_vec3: gradient noise in [-1, 1]) ---
vec3 woodGrad(vec3 p) {
	vec3 q = fract(p * vec3(0.1031, 0.1030, 0.0973));
	q += dot(q, q.yxz + 33.33);
	// Unnormalised: the length spread is invisible in wood and saves a rsqrt per lattice corner.
	return fract((q.xxy + q.yxx) * q.zyx) * 2.0 - 1.0;
}

float woodNoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	float n000 = dot(woodGrad(i), f);
	float n100 = dot(woodGrad(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
	float n010 = dot(woodGrad(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
	float n110 = dot(woodGrad(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
	float n001 = dot(woodGrad(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
	float n101 = dot(woodGrad(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
	float n011 = dot(woodGrad(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
	float n111 = dot(woodGrad(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));
	float nx00 = mix(n000, n100, u.x);
	float nx10 = mix(n010, n110, u.x);
	float nx01 = mix(n001, n101, u.x);
	float nx11 = mix(n011, n111, u.x);
	return mix(mix(nx00, nx10, u.y), mix(nx01, nx11, u.y), u.z) * 1.6;
}

vec3 woodNoise3(vec3 p) {
	return vec3(
		woodNoise(p),
		woodNoise(p + vec3(31.416, -17.21, 7.13)),
		woodNoise(p + vec3(-11.73, 23.93, 5.31))
	);
}

float woodMapRange(float x, float fromMin, float fromMax, float toMin, float toMax) {
	float t = (x - fromMin) / (fromMax - fromMin);
	float r = toMin + t * (toMax - toMin);
	return clamp(r, min(toMin, toMax), max(toMin, toMax));
}

vec3 woodSoftLight(float t, vec3 col1, vec3 col2) {
	vec3 scr = vec3(1.0) - (vec3(1.0) - col2) * (vec3(1.0) - col1);
	return (1.0 - t) * col1 + t * ((vec3(1.0) - col1) * col2 * col1 + col1 * scr);
}

// spaceWarp: noise (detail 1, normalised) pushes the point radially in the XY (cross-section) plane.
vec3 woodSpaceWarp(vec3 p, float strength, float xyScale, float zScale) {
	vec3 combined = vec3(xyScale, xyScale, zScale) * p;
	vec3 n = woodNoise3(combined * 2.4) * 0.5 * strength;
	vec3 pXy = vec3(p.xy, 0.0);
	vec3 dir = length(pXy) > 1e-5 ? normalize(pXy) : vec3(1.0, 0.0, 0.0);
	return n * dir + pXy;
}

float woodRings(float w, float ringsPerUnit, float bias, float sizeVariance, float varianceScale, float bark, float viewUnits) {
	float rings = fract(((woodNoise(vec3(w * varianceScale, 0.37, 0.71)) * 0.5 + 0.5) * sizeVariance + w) * ringsPerUnit) * bark;
	float sharp = min(woodMapRange(rings, 0.0, bias, 0.0, 1.0), woodMapRange(rings, bias, 1.0, 1.0, 0.0));
	float blurAmount = max(viewUnits / 10.0, 1.0);
	return smoothstep(-blurAmount, blurAmount, sharp - 0.5) * 0.5 + 0.5;
}

float woodDetail(vec3 warp, vec3 p, float y, float splotchScale) {
	float radial = clamp(atan(warp.y, warp.x) / 6.28318530718 + 0.5, 0.0, 1.0) * 6.28318530718 * 3.0;
	vec3 combined = vec3(sin(radial), y, cos(radial) * p.z);
	vec3 scaled = vec3(0.1, 1.19, 0.05) * combined;
	return woodNoise(scaled * splotchScale) * 0.5 + 0.5;
}

vec3 woodHash3(vec3 p) {
	vec3 p3 = fract(p * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.xxy + p3.yzz) * p3.zyx);
}

// Smooth Voronoi (the original's voronoi3d), evaluated on the z = 0 slice it is called with.
float woodVoronoi(vec3 x, float smoothness, float randomness) {
	vec3 p = floor(x);
	vec3 f = fract(x);
	float res = 0.0;
	float total = 0.0;
	for (int k = -WOOD_VORONOI_Z; k <= WOOD_VORONOI_Z; k++)
		for (int j = -1; j <= 1; j++)
			for (int i = -1; i <= 1; i++) {
				vec3 b = vec3(float(i), float(j), float(k));
				vec3 r = b - f + woodHash3(p + b) * randomness;
				float d = length(r);
				float w = exp(-d * d / max(smoothness * smoothness, 0.001));
				res += d * w;
				total += w;
			}
	if (total > 0.0) res /= total;
	return smoothstep(0.0, 1.0, res);
}

float woodCells(vec3 p, float cellScale, float cellSize) {
	vec3 warp = woodSpaceWarp(p * (cellScale / 50.0), cellScale / 1000.0, 0.1, 1.77);
	float cells = woodVoronoi(vec3(warp.xy * 75.0, 0.0), 0.5, 1.0);
	return woodMapRange(cells, cellSize, cellSize + 0.21, 0.0, 1.0);
}

vec3 woodColor(vec3 p, float viewUnits) {
	float center = woodMapRange(length(p.xy), 0.0, 1.0, 0.0, uWoodA.x);
	vec3 mainWarp = woodSpaceWarp(woodSpaceWarp(p, center, uWoodA.y, uWoodA.z), uWoodA.w, uWoodB.x, 0.17);
	vec3 detailWarp = mainWarp;
	float cells = 1.0;
	#if WOOD_QUALITY > 0
	// Fine warp (a few mm) and pores (~1 mm) are sub-pixel beyond a few metres — fade them out and
	// skip their noise entirely there. Far away the pores' soft-light averages to cells = 1.
	float near = 1.0 - smoothstep(4.0, 8.0, viewUnits);
	if (near > 0.0) {
		detailWarp = woodSpaceWarp(mainWarp, uWoodB.y * near, uWoodB.z, 0.17);
		cells = mix(1.0, woodCells(mainWarp, uWoodD.z, uWoodD.w / max(viewUnits * 10.0, 1.0)), near);
	}
	#endif
	float rings = woodRings(length(detailWarp), uWoodB.w, uWoodC.x, uWoodC.y, uWoodC.z, uWoodC.w, viewUnits);
	float detail = woodDetail(detailWarp, p, length(detailWarp), uWoodD.x);
	vec3 base = mix(uWoodDark, uWoodLight, rings);
	#if WOOD_QUALITY > 0
	base = woodSoftLight(0.407, base, vec3(cells));
	#endif
	return woodSoftLight(uWoodD.y, base, vec3(detail)) * uWoodDarken;
}
`;

export type WoodShaderQuality = 0 | 1 | 2;

/**
 * Installs (or, with `null` uniforms, removes) the solid-wood shading on a material. Meshes must
 * carry a `woodCoord` (vec3, metres in the piece's log space) attribute — see `woodCoords.ts`.
 */
export function applySolidWoodShader(
	material: THREE.Material,
	uniforms: WoodUniforms | null,
	quality: WoodShaderQuality = 2
): void {
	if (!uniforms) {
		setOwnShaderHook(material, null);
		return;
	}
	const hook: THREE.Material['onBeforeCompile'] = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		const defines = `#define WOOD_QUALITY ${quality}\n#define WOOD_VORONOI_Z ${quality >= 2 ? 1 : 0}\n`;
		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				'#include <common>\nattribute vec3 woodCoord;\nvarying vec3 vWoodCoord;\nuniform float uWoodScale;'
			)
			.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\nvWoodCoord = woodCoord * uWoodScale;'
			);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>\n${defines}${WOOD_GLSL}`)
			.replace(
				'#include <color_fragment>',
				/* glsl */ `#include <color_fragment>
	{
		float woodViewUnits = length(vViewPosition) * uWoodScale;
		vec3 wood = woodColor(vWoodCoord, woodViewUnits);
		// Absolute: the wood's own colours (× weathering tint in the vertex colour).
		// Relative: the grain's brightness pattern, normalised around 1, tinted by the material /
		// vertex colour (a painted or player-chosen colour) — the hue stays exactly the chosen one.
		// Average of woodColor: rings average ~0.75 of the way to light; the pore soft-light (with
		// pores mostly open, value ~1) brightens by its weight, 0.407; the splotch pass averages out.
		vec3 woodMean = mix(uWoodDark, uWoodLight, 0.75) * (WOOD_QUALITY > 0 ? 1.407 : 1.0);
		const vec3 woodLuma = vec3(0.2126, 0.7152, 0.0722);
		float woodRelative = dot(wood, woodLuma) / max(dot(woodMean, woodLuma), 0.002);
		// A very dark chosen colour would swallow the grain: lift it (same hue) to uWoodMinLuma.
		float woodTintLuma = max(dot(diffuseColor.rgb, woodLuma), 1e-4);
		float woodLift = mix(1.0, clamp(uWoodMinLuma / woodTintLuma, 1.0, 6.0), uWoodTintMode);
		diffuseColor.rgb *= mix(wood, vec3(woodRelative), uWoodTintMode) * woodLift;
	}`
			);
		// Rain and snow on exposed decks, paths and framing tops (see weatherSurface.ts).
		injectWeatherSurface(shader);
	};
	setOwnShaderHook(material, hook, `wood:${quality}:wx`, { ...uniforms, ...WEATHER_SURFACE_UNIFORMS });
}
