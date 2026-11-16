import { MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { setOwnShaderHook } from '../materials/shader/shaderHooks';
import { WEATHER_SURFACE_UNIFORMS } from '../materials/shader/weatherSurface';
import { creatureWeatherAvailable } from './biome/creatureCoatSwitches';
import { creatureSurfaceTable } from './surface/CreatureSurfaceTable';
import { creatureNoiseTexture } from './surface/CreatureSurfaceNoise';

/**
 * Every creature shares ONE MeshStandardMaterial (one shader program). Broad colour blocks come
 * from vertex colours; per-vertex `surface` (roughness, emissive, surface-table slot, region) and
 * `surfacePattern` (longitudinal, radial, pattern masks) attributes let the shader add spots,
 * mottling, stripes and bands in creature-anatomical space — pre-skinning bind positions, so
 * patterns ride the skin and never swim. Per-creature pattern parameters come from the shared
 * surface table; the only other texture is one 32³ noise volume. The extension goes through
 * shaderHooks so it composes with the graphics pipeline's CSM hook instead of replacing it.
 */
const PATTERN_GLSL = /* glsl */ `
uniform highp sampler2D creatureSurfaceTable;
uniform highp sampler3D creatureNoise;
varying vec4 vCreatureSurface;
varying vec4 vCreaturePattern;
varying vec3 vCreatureBind;
float creatureNoiseAt(vec3 q) { return texture(creatureNoise, q / 32.0).r; }
// Mirrors patternMask() in surface/CreaturePatternGenerator.ts.
float creaturePatternMask(int type, vec4 p1, vec4 p2, float oz, vec3 pos, float u, float radial) {
	float s = p1.x;
	vec3 o = vec3(p2.z, p2.w, oz);
	vec3 k = vec3(s, s, s / max(p1.w, 0.2));
	// PATTERN_ROTATION (column-major here): the noise tile never lines up with the body axes.
	const mat3 R = mat3(0.8760347353300577, 0.448785676684342, -0.17650654066683494, -0.24244974031172256, 0.7262543122824973, 0.6432517371246309, 0.41687080242921076, -0.5207169003345813, 0.7450319750104499);
	float th = 1.0 - p1.y;
	if (type == 1) return smoothstep(th - 0.05, th + 0.05, creatureNoiseAt(R * (pos * k) + o));
	if (type == 7)
		return smoothstep(th - 0.05, th + 0.05, creatureNoiseAt(R * (pos * k) + o)) * smoothstep(-0.1, 0.5, radial);
	if (type == 2) {
		float n = creatureNoiseAt(R * (pos * k) + o) * 0.65 + creatureNoiseAt(R * (pos * k * 2.3) + o + 11.3) * 0.35;
		return smoothstep(th - 0.16, th + 0.16, n);
	}
	if (type == 3) {
		float warp = creatureNoiseAt(R * (pos * k * 0.5) + o) - 0.5;
		float wave = 0.5 + 0.5 * sin(6.2831853 * (u * p2.x + p2.y) + warp * 2.5);
		return smoothstep(th - 0.08, th + 0.08, wave);
	}
	if (type == 4 || type == 6) {
		float wave = 0.5 + 0.5 * sin(6.2831853 * (u * p2.x + p2.y));
		return smoothstep(th - 0.12, th + 0.12, wave);
	}
	if (type == 5) {
		float edge = 1.0 - p1.y * 1.2;
		return smoothstep(edge - 0.12, edge + 0.12, radial * 0.5 + 0.5);
	}
	if (type == 8) return smoothstep(-0.3, 1.0, radial);
	// Phase 3 (biome coats): rosettes, reticulated, patches, speckle, saddle.
	if (type == 10) {
		// Rings around the noise's isolated peaks, with a fainter centre.
		float n = creatureNoiseAt(R * (pos * k) + o);
		float tr = 1.0 - p1.y * 0.45;
		float ring = smoothstep(tr - 0.04, tr, n) * (1.0 - smoothstep(tr + 0.06, tr + 0.1, n));
		return max(ring, 0.45 * smoothstep(tr + 0.08, tr + 0.12, n));
	}
	if (type == 11) {
		float ridge = 1.0 - abs(2.0 * creatureNoiseAt(R * (pos * k) + o) - 1.0);
		float w = p1.y * 0.35;
		return smoothstep(1.0 - w - 0.05, 1.0 - w + 0.05, ridge);
	}
	if (type == 12) {
		float n = creatureNoiseAt(R * (pos * k) + o) * 0.8 + creatureNoiseAt(R * (pos * k * 2.2) + o + 5.1) * 0.2;
		return smoothstep(th - 0.03, th + 0.03, n);
	}
	if (type == 13) return smoothstep(th - 0.04, th + 0.04, creatureNoiseAt(R * (pos * k * 2.5) + o));
	if (type == 14) {
		float saddleHalf = 0.18 + p1.y * 0.2;
		return smoothstep(saddleHalf + 0.08, saddleHalf - 0.08, abs(u - 0.5)) * smoothstep(-0.25, 0.35, radial);
	}
	return 0.0;
}
// Coat micro-texture (biome-specific creatures Phase 2). Mirrors surface/CreatureCoatDetail.ts.
// q counts coat features; the noise volume has one blob per ~12 texels (NOISE_FEATURE_TEXELS).
const float CREATURE_NOISE_FEATURE = 12.0;
float creatureCoatRegion(int r) {
	if (r == 21 || r == 22 || r == 17 || r == 24 || r == 25 || r == 27) return 0.0;
	if (r == 19 || r == 20) return 0.4;
	if (r == 16 || r == 18 || r == 26 || r == 28) return 0.6;
	return 1.0;
}
// Coat height 0..1 at bind position q (already in detail cycles) for the given coat type.
float creatureCoatHeight(int type, vec3 q, float u, int region) {
	if (type == 1) {
		// Fur: grain stretched along the part's main axis (limbs run along Y, bodies along Z).
		bool limb = (region >= 7 && region <= 14) || region == 19 || region == 20;
		vec3 s = q * CREATURE_NOISE_FEATURE * (limb ? vec3(1.0, 0.14, 1.0) : vec3(1.0, 1.0, 0.14));
		return creatureNoiseAt(s) * 0.75 + creatureNoiseAt(s * 2.2 + 7.1) * 0.25;
	}
	if (type == 2) {
		// Hide: soft folds (noise ridges) with a little grain.
		float n = creatureNoiseAt(q * CREATURE_NOISE_FEATURE * 0.5);
		return (1.0 - abs(2.0 * n - 1.0)) * 0.8 + creatureNoiseAt(q * CREATURE_NOISE_FEATURE * 2.1 + 3.7) * 0.2;
	}
	if (type == 3) {
		// Scales: offset rows of rounded scales, grooves between them.
		vec2 g = vec2(q.z, q.y * 1.3 + q.x * 0.7);
		float row = floor(g.y);
		g.x += 0.5 * mod(row, 2.0);
		vec2 f = fract(g) - vec2(0.5, 0.15);
		return 1.0 - smoothstep(0.3, 0.72, length(vec2(f.x, f.y * 0.9)));
	}
	if (type == 4) {
		// Chitin: smooth plates along the part (bodies along Z, legs along Y), seams between them.
		bool limb = (region >= 7 && region <= 14) || region == 19 || region == 20;
		float t = fract(limb ? q.y : q.z);
		float seam = smoothstep(0.0, 0.07, t) * smoothstep(1.0, 0.93, t);
		return seam * (0.9 + creatureNoiseAt(q * CREATURE_NOISE_FEATURE * 0.35) * 0.1);
	}
	if (type == 5) {
		// Skin: fine pores.
		return 1.0 - smoothstep(0.62, 0.8, creatureNoiseAt(q * CREATURE_NOISE_FEATURE));
	}
	return 0.5;
}
float creatureCoatH = 0.5;
float creatureCoatAmount = 0.0;
int creatureCoatKind = 0;
vec3 creatureBaseNormal = vec3(0.0, 0.0, 1.0);
// Weather on coats: the same world-wide wetness, snow cover and building exposure as terrain.
uniform float uWxWet;
uniform float uWxSnow;
uniform sampler2D uWxExposure;
uniform vec4 uWxExposureArea;
uniform vec2 uWxExposureDepth;
uniform vec3 uWxSky;
uniform float creatureWeatherScale;
varying vec3 vCreatureWorld;
// Mirrors wxExposed() in materials/shader/weatherSurface.ts: 0 under a roof, 1 in the open.
float creatureExposed(vec3 world) {
	if (uWxExposureArea.w < 0.5) return 1.0;
	vec2 uv = (world.xz - uWxExposureArea.xy) * uWxExposureArea.z;
	if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 1.0;
	uv.y = 1.0 - uv.y;
	float coverTop = uWxExposureDepth.x - texture2D(uWxExposure, uv).r * uWxExposureDepth.y;
	return smoothstep(-0.25, -0.05, world.y - coverTop);
}
vec3 creaturePerturbNormal(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
	vec3 sx = normalize(dFdx(surfPos));
	vec3 sy = normalize(dFdy(surfPos));
	vec3 r1 = cross(sy, surfNorm);
	vec3 r2 = cross(surfNorm, sx);
	float det = dot(sx, r1) * faceDir;
	vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
	return normalize(abs(det) * surfNorm - grad);
}
`;
const PATTERN_APPLY = /* glsl */ `
{
	int slot = int(vCreatureSurface.z + 0.5);
	vec4 a3 = texelFetch(creatureSurfaceTable, ivec2(3, slot), 0);
	int lodMode = int(a3.z + 0.5);
	int debugMode = int(a3.w + 0.5);
	vec3 pos = vCreatureBind * a3.y;
	float u = vCreaturePattern.x, radial = vCreaturePattern.y;
	// Coat micro-texture: a height per pixel, faded by LOD and by its on-screen frequency.
	{
		vec4 coat = texelFetch(creatureSurfaceTable, ivec2(7, slot), 0);
		int coatType = int(coat.y + 0.5);
		if (coatType > 0 && lodMode < 2 && coat.w > 0.0) {
			vec3 q = vCreatureBind * coat.w;
			// Features per pixel along the screen's steeper direction: fade before they alias.
			float perPixel = max(length(dFdx(q)), length(dFdy(q)));
			// Hard-edged cells (scales, chitin seams) alias sooner than soft noise coats.
			float limit = coatType == 3 ? 0.13 : coatType == 4 ? 0.18 : 0.26;
			float fade = (1.0 - smoothstep(limit, limit * 2.0, perPixel)) * (lodMode == 0 ? 1.0 : 0.35);
			creatureCoatAmount = coat.z * fade * creatureCoatRegion(int(vCreatureSurface.w + 0.5));
			creatureCoatH = creatureCoatHeight(coatType, q, u, int(vCreatureSurface.w + 0.5));
		}
	}
	if (debugMode == 1) {
		// vertex colours only
	} else if (debugMode == 4) {
		diffuseColor.rgb = vec3(mix(0.5, creatureCoatH, min(1.0, creatureCoatAmount * 1.6)));
	} else if (debugMode >= 2) {
		int base = debugMode == 2 ? 0 : 4;
		float weight = debugMode == 2 ? vCreaturePattern.z : vCreaturePattern.w;
		vec4 c0 = texelFetch(creatureSurfaceTable, ivec2(base, slot), 0);
		vec4 c1 = texelFetch(creatureSurfaceTable, ivec2(base + 1, slot), 0);
		vec4 c2 = texelFetch(creatureSurfaceTable, ivec2(base + 2, slot), 0);
		vec4 c3 = texelFetch(creatureSurfaceTable, ivec2(base + 3, slot), 0);
		float m = creaturePatternMask(int(c0.w + 0.5), c1, c2, c3.x, pos, u, radial) * weight;
		diffuseColor.rgb = vec3(m);
	} else {
		if (lodMode < 2 && vCreaturePattern.z > 0.002) {
			vec4 c0 = texelFetch(creatureSurfaceTable, ivec2(0, slot), 0);
			vec4 c1 = texelFetch(creatureSurfaceTable, ivec2(1, slot), 0);
			vec4 c2 = texelFetch(creatureSurfaceTable, ivec2(2, slot), 0);
			float m = creaturePatternMask(int(c0.w + 0.5), c1, c2, a3.x, pos, u, radial);
			diffuseColor.rgb = mix(diffuseColor.rgb, c0.rgb, m * c1.z * vCreaturePattern.z);
		}
		if (lodMode < 1 && vCreaturePattern.w > 0.002) {
			vec4 c0 = texelFetch(creatureSurfaceTable, ivec2(4, slot), 0);
			vec4 c1 = texelFetch(creatureSurfaceTable, ivec2(5, slot), 0);
			vec4 c2 = texelFetch(creatureSurfaceTable, ivec2(6, slot), 0);
			vec4 c3 = texelFetch(creatureSurfaceTable, ivec2(7, slot), 0);
			float m = creaturePatternMask(int(c0.w + 0.5), c1, c2, c3.x, pos, u, radial);
			diffuseColor.rgb = mix(diffuseColor.rgb, c0.rgb, m * c1.z * vCreaturePattern.w);
		}
		// Faint albedo grain: the coat reads even under flat light.
		diffuseColor.rgb *= 1.0 + (creatureCoatH - 0.5) * 0.22 * creatureCoatAmount;
	}
}
`;
// Derivatives are taken outside any per-pixel branch (they are undefined in divergent flow).
const COAT_NORMAL = /* glsl */ `
{
	creatureBaseNormal = normal;
	vec2 dH = vec2(dFdx(creatureCoatH), dFdy(creatureCoatH)) * creatureCoatAmount;
	vec3 coatNormal = creaturePerturbNormal(-vViewPosition, normal, dH, faceDirection);
	if (creatureCoatAmount > 0.001) normal = coatNormal;
}
`;
/**
 * Weather on coats (deferred Q12 of the biome-creatures cycle, built 2026-11-16). Snow settles on
 * the upward parts of a coat (backs, heads, the tops of tails) in patches fixed to the body, so it
 * rides along as the animal moves; fur holds the most, scales and chitin the least. Rain darkens
 * coats (fur most), makes them glossier and adds a faint sky sheen. Eyes, noses and hard
 * adornments are left alone, and a creature under a roof stays dry. Uniform-only, skipped while
 * dry and snow-free; it follows the same world-wide wetness and snow cover as the terrain.
 */
const WEATHER_APPLY = /* glsl */ `
if ((uWxWet + uWxSnow) * creatureWeatherScale > 0.002) {
	int region = int(vCreatureSurface.w + 0.5);
	float onCoat = min(1.0, creatureCoatRegion(region) * 1.5);
	float open = creatureExposed(vCreatureWorld) * onCoat * creatureWeatherScale;
	vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
	float up = smoothstep(0.2, 0.7, dot(creatureBaseNormal, upView));
	// How much a coat holds: fur most, then hide and skin, scales and chitin least.
	float holds = creatureCoatKind == 1 ? 1.0 : creatureCoatKind == 3 ? 0.55 : creatureCoatKind == 4 ? 0.45 : 0.8;
	int slot = int(vCreatureSurface.z + 0.5);
	float bodyScale = texelFetch(creatureSurfaceTable, ivec2(3, slot), 0).y;
	vec3 b = vCreatureBind * bodyScale;
	float field = creatureNoiseAt(b * 4.0) * 0.7 + creatureNoiseAt(b * 11.0 + 3.1) * 0.3;
	float snow = up * open * holds * smoothstep(1.0 - uWxSnow * 1.15, 1.1 - uWxSnow * 1.15, field);
	snow = min(snow, 0.92);
	float wet = uWxWet * open * (1.0 - snow);
	float darken = creatureCoatKind == 1 ? 0.32 : 0.2;
	diffuseColor.rgb *= 1.0 - darken * wet;
	diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.9, 0.95), snow);
	roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, wet);
	roughnessFactor = mix(roughnessFactor, 0.9, snow);
	// Snow smooths the coat's texture; wet fur lies flatter.
	normal = normalize(mix(normal, creatureBaseNormal, clamp(snow * 0.85 + wet * 0.4, 0.0, 1.0)));
	float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
	float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
	totalEmissiveRadiance += uWxSky * fresnel * wet * 0.14;
}
`;
const uniforms = {
	creatureSurfaceTable: { value: creatureSurfaceTable().texture },
	creatureNoise: { value: creatureNoiseTexture() },
	creatureWeatherScale: { value: 1 }
};
function creatureSurfaceHook(shader: WebGLProgramParametersWithUniforms) {
	shader.uniforms.creatureSurfaceTable = uniforms.creatureSurfaceTable;
	shader.uniforms.creatureNoise = uniforms.creatureNoise;
	shader.uniforms.creatureWeatherScale = uniforms.creatureWeatherScale;
	Object.assign(shader.uniforms, WEATHER_SURFACE_UNIFORMS);
	shader.vertexShader = shader.vertexShader
		.replace(
			'#include <common>',
			`#include <common>
attribute vec4 surface;
attribute vec4 surfacePattern;
varying vec4 vCreatureSurface;
varying vec4 vCreaturePattern;
varying vec3 vCreatureBind;
varying vec3 vCreatureWorld;`
		)
		.replace(
			'#include <begin_vertex>',
			`#include <begin_vertex>
vCreatureSurface = vec4(surface.x / 1000.0, surface.y / 1000.0, surface.z, surface.w);
vCreaturePattern = vec4(surfacePattern.x * (65535.0 / 1024.0), surfacePattern.y * 2.0 - 1.0, surfacePattern.z, surfacePattern.w);
vCreatureBind = position;`
		)
		.replace(
			'#include <project_vertex>',
			`#include <project_vertex>
vCreatureWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`
		);
	shader.fragmentShader = shader.fragmentShader
		.replace('#include <common>', `#include <common>\n${PATTERN_GLSL}`)
		.replace('#include <color_fragment>', `#include <color_fragment>\n${PATTERN_APPLY}`)
		.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${COAT_NORMAL}`)
		.replace(
			'#include <roughnessmap_fragment>',
			'#include <roughnessmap_fragment>\nroughnessFactor = clamp(vCreatureSurface.x, 0.04, 1.0);'
		)
		.replace(
			'#include <emissivemap_fragment>',
			`#include <emissivemap_fragment>\n${WEATHER_APPLY}\ntotalEmissiveRadiance += diffuseColor.rgb * vCreatureSurface.y;`
		);
}

/** The Lab and `?creatureWeather=off`: weather on coats on (1) or off (0) for every creature. */
export function setCreatureWeatherScale(scale: number): void {
	uniforms.creatureWeatherScale.value = scale;
}

export function createCreatureMaterial(): MeshStandardMaterial {
	uniforms.creatureWeatherScale.value = creatureWeatherAvailable() ? 1 : 0;
	const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
	material.name = 'CreatureSurface';
	setOwnShaderHook(material, creatureSurfaceHook, 'creature-surface-v4', uniforms);
	return material;
}

let shared: { material: MeshStandardMaterial; users: number } | undefined;
/** Reference-counted world material; released with `releaseCreatureMaterial`. */
export function acquireCreatureMaterial(): MeshStandardMaterial {
	if (!shared) shared = { material: createCreatureMaterial(), users: 0 };
	shared.users++;
	return shared.material;
}
export function releaseCreatureMaterial(material: MeshStandardMaterial) {
	if (!shared || shared.material !== material) return;
	if (--shared.users === 0) {
		shared.material.dispose();
		shared = undefined;
	}
}
