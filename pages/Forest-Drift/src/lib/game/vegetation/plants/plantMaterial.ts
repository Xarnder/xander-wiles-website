import * as THREE from 'three';
import { setOwnShaderHook } from '../../materials/shader/shaderHooks';
import { GRASS_RANK_FADE } from '../grass/grassLod';
import { PLANT_ATLAS_COLUMNS, PLANT_ATLAS_ROWS, type PlantAtlas } from './plantAtlas';
import { PLANT_SIZE_RANGE } from './plantPlacement';

/**
 * The two plant materials — the only ones, whatever the number of species:
 *
 * NEAR: instanced prototype geometry (one InstancedBufferGeometry per prototype in the near ring).
 *   Each instance is 16 bytes of root + 4 bytes (scale, yaw, hue, wind phase); the transform is
 *   built in the vertex shader. Colour = mix(base, secondary, mask.G) × mask shade, from per-vertex
 *   species colours and the shared atlas; a per-instance hue tilt varies every plant.
 * CARD: one axial billboard per plant for everything beyond the near range (all species share it,
 *   one draw call per 32 m chunk), coloured from the family impostor tile: petal × R, centre × G,
 *   foliage × the rest, shade × B.
 *
 * The near → card hand-off is a screen-door crossfade: both draw inside a short band, with
 * complementary 4 × 4 Bayer dither masks, so a pixel always shows exactly one of the two — no pop,
 * no blending, no sorting. Density LOD on cards follows grass (rank vs a distance curve, scaled per
 * species so tiny clover fades early and tall flowers last). Wind is vertex-only.
 */
export interface PlantUniforms {
	uPlantAtlas: { value: THREE.Texture | null };
	/** near cut, lod1, lod2, end (metres). */
	uPlantLod: { value: THREE.Vector4 };
	/** card density at lod0, lod1, lod2; rank fade band. */
	uPlantDensity: { value: THREE.Vector4 };
	/** wind dir x/z, sway, lean. */
	uPlantWind: { value: THREE.Vector4 };
	uPlantTime: { value: number };
	/** player x/y/z, push radius. */
	uPlantPlayer: { value: THREE.Vector4 };
	/** near crossfade band (m), wet darkening, debug species (0/1), debug LOD (0/1). */
	uPlantMisc: { value: THREE.Vector4 };
}

export function createPlantUniforms(): PlantUniforms {
	return {
		uPlantAtlas: { value: null },
		uPlantLod: { value: new THREE.Vector4(11, 26, 40, 52) },
		uPlantDensity: { value: new THREE.Vector4(1, 0.5, 0.2, GRASS_RANK_FADE) },
		uPlantWind: { value: new THREE.Vector4(0, 1, 0, 0) },
		uPlantTime: { value: 0 },
		uPlantPlayer: { value: new THREE.Vector4(0, -1e5, 0, 0) },
		uPlantMisc: { value: new THREE.Vector4(1.5, 0, 0, 0) }
	};
}

const COMMON = /* glsl */ `
uniform vec4 uPlantLod;
uniform vec4 uPlantMisc;
`;

const DITHER = /* glsl */ `
float plantBayer(vec2 p) {
	ivec2 i = ivec2(mod(p, 4.0));
	int k = i.x + i.y * 4;
	float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
	return (m[k] + 0.5) / 16.0;
}
vec3 plantDebugHue(float h) {
	return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}
`;

/** Shared vertex helpers: wind and the player push, in world space. */
const VERTEX_WIND = /* glsl */ `
uniform vec4 uPlantWind;
uniform float uPlantTime;
uniform vec4 uPlantPlayer;
vec2 plantWindOffset(vec2 rootXZ, float rootY, float phase, float weight, float stiffness, float headFlag, float reach) {
	float flex = 1.0 - stiffness * 0.85;
	float p = phase * 6.2831853 + dot(rootXZ, vec2(0.23, 0.19));
	float gust = 0.6 + 0.4 * sin(uPlantTime * 0.55 - dot(rootXZ, uPlantWind.xy) * 0.09);
	float sway = sin(uPlantTime * (1.8 + headFlag * 0.9) + p) * 0.65 + sin(uPlantTime * 3.3 + p * 1.6) * 0.25;
	vec2 offset = uPlantWind.xy * (uPlantWind.w + sway * uPlantWind.z * (1.0 + headFlag * 0.5)) * gust * weight * flex * reach;
	if (uPlantPlayer.w > 0.0) {
		vec2 away = rootXZ - uPlantPlayer.xz;
		float d = length(away);
		float near = (1.0 - smoothstep(0.0, uPlantPlayer.w, d)) * step(abs(rootY - uPlantPlayer.y), 1.5);
		offset += (d > 1e-3 ? away / d : vec2(0.0)) * near * weight * reach * 0.8;
	}
	// Bend, never flatten.
	float len = length(offset);
	float maxLen = reach * 0.6 * weight + 1e-5;
	return len > maxLen ? offset * (maxLen / len) : offset;
}
`;

// ------------------------------------------------------------------------------------------- near

const NEAR_VERTEX_PARS = /* glsl */ `
attribute vec3 aColorA;
attribute vec3 aColorB;
attribute vec4 aPlant;
attribute vec3 aPlantRoot;
attribute vec4 aPlantInst;
varying vec3 vPlantColorA;
varying vec3 vPlantColorB;
varying vec2 vPlantUv;
varying float vPlantFade;
varying float vPlantHash;
${COMMON}
${VERTEX_WIND}
`;

const NEAR_VERTEX_BUILD = /* glsl */ `
	float plantScale = 0.85 + aPlantInst.x * 0.3;
	float plantYaw = aPlantInst.y * 6.2831853;
	float plantC = cos(plantYaw);
	float plantS = sin(plantYaw);
	vec3 plantLocal = position * plantScale;
	plantLocal = vec3(plantC * plantLocal.x + plantS * plantLocal.z, plantLocal.y, -plantS * plantLocal.x + plantC * plantLocal.z);
	float plantReach = 0.05 + max(0.0, plantLocal.y) * 0.4;
	vec2 plantWind = plantWindOffset(aPlantRoot.xz, aPlantRoot.y, aPlantInst.w, aPlant.x, aPlant.z, aPlant.y, plantReach);
	vec3 plantWorld = aPlantRoot + plantLocal + vec3(plantWind.x, -dot(plantWind, plantWind) * 0.5 / max(0.05, plantLocal.y + 0.05), plantWind.y);
	vec3 objectNormal = normalize(vec3(plantC * normal.x + plantS * normal.z, normal.y, -plantS * normal.x + plantC * normal.z));
	float plantDist = length(cameraPosition.xz - aPlantRoot.xz);
	vPlantFade = 1.0 - smoothstep(uPlantLod.x - uPlantMisc.x, uPlantLod.x, plantDist);
	// Collapse instances fully past the near cut (cheap: nothing rasterises).
	if (vPlantFade <= 0.0) plantWorld = aPlantRoot;
	float plantShade = 0.92 + aPlantInst.z * 0.16;
	vec3 plantTint = vec3(1.0 + (aPlantInst.z - 0.5) * 0.08, 1.0, 1.0 - (aPlantInst.z - 0.5) * 0.08) * plantShade;
	vPlantColorA = aColorA * plantTint;
	vPlantColorB = aColorB * plantTint;
	vPlantUv = uv;
	vPlantHash = aPlant.w;
`;

const NEAR_FRAGMENT_PARS = /* glsl */ `
uniform sampler2D uPlantAtlas;
varying vec3 vPlantColorA;
varying vec3 vPlantColorB;
varying vec2 vPlantUv;
varying float vPlantFade;
varying float vPlantHash;
${COMMON}
${DITHER}
`;

const NEAR_FRAGMENT_COLOR = /* glsl */ `
	if (plantBayer(gl_FragCoord.xy) >= vPlantFade) discard;
	vec4 plantTexel = texture2D(uPlantAtlas, vPlantUv);
	diffuseColor.rgb *= mix(vPlantColorA, vPlantColorB, plantTexel.g) * plantTexel.r * 2.0 * (1.0 - uPlantMisc.y);
	diffuseColor.a *= plantTexel.a;
	if (uPlantMisc.z > 0.5) diffuseColor.rgb = plantDebugHue(vPlantHash) * plantTexel.r * 2.0;
	if (uPlantMisc.w > 0.5) diffuseColor.rgb = vec3(1.0, 0.15, 0.1);
`;

// ------------------------------------------------------------------------------------------- card

const CARD_VERTEX_PARS = /* glsl */ `
attribute vec3 aPlantRoot;
attribute vec4 aCardShape;
attribute vec4 aCardPetal;
attribute vec4 aCardCentre;
attribute vec4 aCardLeaf;
uniform vec4 uPlantDensity;
varying vec2 vPlantUv;
varying vec3 vPlantPetal;
varying vec3 vPlantCentre;
varying vec3 vPlantLeaf;
varying float vPlantFade;
varying float vPlantHash;
varying float vPlantDist;
${COMMON}
${VERTEX_WIND}
float plantDensityAt(float d) {
	if (d <= uPlantLod.x) return uPlantDensity.x;
	if (d <= uPlantLod.y) return mix(uPlantDensity.x, uPlantDensity.y, (d - uPlantLod.x) / max(1e-3, uPlantLod.y - uPlantLod.x));
	if (d <= uPlantLod.z) return mix(uPlantDensity.y, uPlantDensity.z, (d - uPlantLod.y) / max(1e-3, uPlantLod.z - uPlantLod.y));
	return uPlantDensity.z * max(0.0, 1.0 - (d - uPlantLod.z) / max(1e-3, uPlantLod.w - uPlantLod.z));
}
`;

const CARD_VERTEX_BUILD = /* glsl */ `
	float plantLeafByte = floor(aCardLeaf.w * 255.0 + 0.5);
	float plantDistanceScale = 0.4 + mod(plantLeafByte, 16.0) / 10.0;
	float plantStiffness = floor(plantLeafByte / 16.0) / 15.0;
	vec2 plantToCam = cameraPosition.xz - aPlantRoot.xz;
	float plantDist = length(plantToCam);
	float plantDens = plantDensityAt(plantDist / plantDistanceScale);
	float plantT = clamp((plantDens - aCardShape.z) / uPlantDensity.w, 0.0, 1.0);
	float plantVis = plantT * plantT * (3.0 - 2.0 * plantT);
	float plantHeight = aCardShape.x * ${PLANT_SIZE_RANGE.toFixed(2)} * plantVis;
	float plantWidth = aCardShape.y * ${PLANT_SIZE_RANGE.toFixed(2)} * plantVis * (1.0 + (1.0 - min(plantDens, 1.0)) * 0.25);
	vec2 plantFace = plantDist > 1e-3 ? plantToCam / plantDist : vec2(0.0, 1.0);
	vec2 plantRight = vec2(plantFace.y, -plantFace.x);
	float plantBend = position.y * position.y;
	vec2 plantWind = plantWindOffset(aPlantRoot.xz, aPlantRoot.y, aCardShape.w, plantBend, plantStiffness, 0.0, plantHeight);
	vec3 plantWorld = aPlantRoot + vec3(plantRight.x * position.x * plantWidth + plantWind.x, position.y * plantHeight, plantRight.y * position.x * plantWidth + plantWind.y);
	vec3 objectNormal = normalize(vec3(plantFace.x * 0.4, 1.0, plantFace.y * 0.4));
	vPlantFade = smoothstep(uPlantLod.x - uPlantMisc.x, uPlantLod.x, plantDist);
	if (vPlantFade <= 0.0 || plantVis <= 0.0) plantWorld = aPlantRoot;
	float plantTile = floor(aCardPetal.w * 255.0 + 0.5);
	vec2 plantCell = vec2(mod(plantTile, ${PLANT_ATLAS_COLUMNS}.0), floor(plantTile / ${PLANT_ATLAS_COLUMNS}.0));
	vec2 plantIn = vec2(mix(0.01, 0.99, uv.x), mix(0.005, 0.99, uv.y));
	vPlantUv = (plantCell + plantIn) / vec2(${PLANT_ATLAS_COLUMNS}.0, ${PLANT_ATLAS_ROWS}.0);
	vPlantPetal = aCardPetal.rgb * aCardPetal.rgb;
	vPlantCentre = aCardCentre.rgb * aCardCentre.rgb;
	vPlantLeaf = aCardLeaf.rgb * aCardLeaf.rgb;
	vPlantHash = aCardCentre.w;
	vPlantDist = plantDist;
`;

const CARD_FRAGMENT_PARS = /* glsl */ `
uniform sampler2D uPlantAtlas;
varying vec2 vPlantUv;
varying vec3 vPlantPetal;
varying vec3 vPlantCentre;
varying vec3 vPlantLeaf;
varying float vPlantFade;
varying float vPlantHash;
varying float vPlantDist;
${COMMON}
${DITHER}
`;

const CARD_FRAGMENT_COLOR = /* glsl */ `
	if (plantBayer(gl_FragCoord.xy) < 1.0 - vPlantFade) discard;
	vec4 plantTexel = texture2D(uPlantAtlas, vPlantUv);
	float plantFoliage = max(0.0, 1.0 - plantTexel.r - plantTexel.g);
	vec3 plantColor = vPlantPetal * plantTexel.r + vPlantCentre * plantTexel.g + vPlantLeaf * plantFoliage;
	diffuseColor.rgb *= plantColor * plantTexel.b * 2.0 * (1.0 - uPlantMisc.y);
	diffuseColor.a *= plantTexel.a;
	if (uPlantMisc.z > 0.5) diffuseColor.rgb = plantDebugHue(vPlantHash) * plantTexel.b * 2.0;
	if (uPlantMisc.w > 0.5) diffuseColor.rgb = vPlantDist < uPlantLod.y ? vec3(0.15, 1.0, 0.2) : vec3(0.2, 0.35, 1.0);
`;

function hook(
	uniforms: PlantUniforms,
	vertexPars: string,
	vertexBuild: string,
	fragmentPars: string,
	fragmentColor: string
): THREE.Material['onBeforeCompile'] {
	return (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${vertexPars}`)
			.replace('#include <beginnormal_vertex>', vertexBuild)
			.replace('#include <begin_vertex>', 'vec3 transformed = plantWorld;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>\n${fragmentPars}`)
			.replace('#include <map_fragment>', fragmentColor)
			// Thin double-sided cards keep their up-biased normal on both faces.
			.replace(
				'#include <normal_fragment_begin>',
				'#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );'
			);
	};
}

function material(
	name: string,
	uniforms: PlantUniforms,
	key: string,
	h: THREE.Material['onBeforeCompile']
) {
	const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 });
	m.name = name;
	setOwnShaderHook(m, h, key, uniforms);
	return m;
}

export function createPlantMaterials(
	atlas: THREE.Texture,
	uniforms: PlantUniforms
): {
	near: THREE.MeshLambertMaterial;
	card: THREE.MeshLambertMaterial;
} {
	uniforms.uPlantAtlas.value = atlas;
	return {
		near: material(
			'plants-near',
			uniforms,
			'plants-near-v1',
			hook(uniforms, NEAR_VERTEX_PARS, NEAR_VERTEX_BUILD, NEAR_FRAGMENT_PARS, NEAR_FRAGMENT_COLOR)
		),
		card: material(
			'plants-card',
			uniforms,
			'plants-card-v1',
			hook(uniforms, CARD_VERTEX_PARS, CARD_VERTEX_BUILD, CARD_FRAGMENT_PARS, CARD_FRAGMENT_COLOR)
		)
	};
}

/** The atlas as one texture with its coverage-preserving mip chain. Channels are masks (no colour space). */
export function createPlantAtlasTexture(atlas: PlantAtlas): THREE.DataTexture {
	const base = atlas.levels[0];
	const texture = new THREE.DataTexture(base.data, base.width, base.height, THREE.RGBAFormat);
	texture.mipmaps = atlas.levels.map((level) => ({
		data: level.data,
		width: level.width,
		height: level.height
	})) as unknown as THREE.DataTexture['mipmaps'];
	texture.generateMipmaps = false;
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.colorSpace = THREE.NoColorSpace;
	texture.name = 'plant-atlas';
	texture.needsUpdate = true;
	return texture;
}

export function plantAtlasBytes(atlas: PlantAtlas): number {
	return atlas.levels.reduce((sum, level) => sum + level.data.byteLength, 0);
}

/** The far card: one upright card, 2 columns × 3 rows (the middle row lets wind curve it). */
export const PLANT_CARD_TRIANGLES = 4;
export function createPlantCardTemplate(): {
	position: Float32Array;
	normal: Float32Array;
	uv: Float32Array;
	index: Uint16Array;
} {
	const position: number[] = [];
	const uv: number[] = [];
	for (let row = 0; row < 3; row++)
		for (let col = 0; col < 2; col++) {
			position.push(col - 0.5, row / 2, 0);
			uv.push(col, row / 2);
		}
	return {
		position: new Float32Array(position),
		// Required: without a normal attribute three.js compiles Lambert flat-shaded.
		normal: new Float32Array(position.length).map((_, i) => (i % 3 === 1 ? 1 : 0)),
		uv: new Float32Array(uv),
		index: new Uint16Array([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4])
	};
}
