import { MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { setOwnShaderHook } from '../materials/shader/shaderHooks';
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
	vec2 dH = vec2(dFdx(creatureCoatH), dFdy(creatureCoatH)) * creatureCoatAmount;
	vec3 coatNormal = creaturePerturbNormal(-vViewPosition, normal, dH, faceDirection);
	if (creatureCoatAmount > 0.001) normal = coatNormal;
}
`;
const uniforms = {
	creatureSurfaceTable: { value: creatureSurfaceTable().texture },
	creatureNoise: { value: creatureNoiseTexture() }
};
function creatureSurfaceHook(shader: WebGLProgramParametersWithUniforms) {
	shader.uniforms.creatureSurfaceTable = uniforms.creatureSurfaceTable;
	shader.uniforms.creatureNoise = uniforms.creatureNoise;
	shader.vertexShader = shader.vertexShader
		.replace(
			'#include <common>',
			`#include <common>
attribute vec4 surface;
attribute vec4 surfacePattern;
varying vec4 vCreatureSurface;
varying vec4 vCreaturePattern;
varying vec3 vCreatureBind;`
		)
		.replace(
			'#include <begin_vertex>',
			`#include <begin_vertex>
vCreatureSurface = vec4(surface.x / 1000.0, surface.y / 1000.0, surface.z, surface.w);
vCreaturePattern = vec4(surfacePattern.x * (65535.0 / 1024.0), surfacePattern.y * 2.0 - 1.0, surfacePattern.z, surfacePattern.w);
vCreatureBind = position;`
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
			'#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vCreatureSurface.y;'
		);
}

export function createCreatureMaterial(): MeshStandardMaterial {
	const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
	material.name = 'CreatureSurface';
	setOwnShaderHook(material, creatureSurfaceHook, 'creature-surface-v3', uniforms);
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
