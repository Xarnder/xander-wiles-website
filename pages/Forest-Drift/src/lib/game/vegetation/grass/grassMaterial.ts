import * as THREE from 'three';
import { setOwnShaderHook } from '../../materials/shader/shaderHooks';
import { GRASS_ATLAS_COLUMNS, GRASS_ATLAS_ROWS, type GrassAtlas } from './grassAtlas';
import { GRASS_RANK_FADE } from './grassLod';

/**
 * ONE material for every grass tuft in the world. Cards are built entirely in the vertex shader
 * from 20 bytes of instance data — no Matrix4 per tuft, no per-tuft CPU work:
 *
 * - axial billboard: the card stays upright (rooted, local Y = world up) and turns about Y to face
 *   the camera horizontally, so it never lies down like a floor sprite when you look down;
 * - near the camera (HIGH/ULTRA) the tuft is two crossed cards at the tuft's own fixed yaw, which
 *   morph smoothly into the single camera-facing card by `crossFadeEnd` — no switch to see;
 * - density LOD: tufts whose rank is above the density at their distance scale down to nothing
 *   over a short rank band (mirrors `grassLod.ts`), so LOD changes crossfade, never pop;
 * - wind: base fixed, tip offset ∝ (local y)² along the weather wind, phase per tuft and broad
 *   gusts from world position, bend clamped so storms never flatten it; plus an optional push away
 *   from the player;
 * - lighting: Lambert with an up-biased normal (a card turned edge-on never goes black), a darker
 *   base and lighter tip, and the instance's terrain-matched colour.
 */
export interface GrassUniforms {
	uGrassAtlas: { value: THREE.Texture | null };
	/** lod0, lod1, lod2, end distances (metres). */
	uGrassLod: { value: THREE.Vector4 };
	/** density at lod0, lod1, lod2; rank fade band. */
	uGrassDensity: { value: THREE.Vector4 };
	/** min height, height range, width ratio, crossed-card fade end (0 = no crossed cards). */
	uGrassSize: { value: THREE.Vector4 };
	/** wind direction x/z, sway strength, steady lean. */
	uGrassWind: { value: THREE.Vector4 };
	uGrassTime: { value: number };
	/** player x/y/z and push radius (0 = off). */
	uGrassPlayer: { value: THREE.Vector4 };
	/** base shade, tip shade, wet darkening, brightness. */
	uGrassShade: { value: THREE.Vector4 };
	/** tile inset (tile UV units); debug LOD colours (0/1). */
	uGrassMisc: { value: THREE.Vector4 };
}

export function createGrassUniforms(): GrassUniforms {
	return {
		uGrassAtlas: { value: null },
		uGrassLod: { value: new THREE.Vector4(14, 32, 50, 64) },
		uGrassDensity: { value: new THREE.Vector4(1, 0.5, 0.22, GRASS_RANK_FADE) },
		uGrassSize: { value: new THREE.Vector4(0.22, 0.4, 1.15, 0) },
		uGrassWind: { value: new THREE.Vector4(0, 1, 0, 0) },
		uGrassTime: { value: 0 },
		uGrassPlayer: { value: new THREE.Vector4(0, -1e5, 0, 0) },
		uGrassShade: { value: new THREE.Vector4(0.68, 1.1, 0, 1) },
		uGrassMisc: { value: new THREE.Vector4(1 / 128, 0, 0, 0) }
	};
}

const VERTEX_PARS = /* glsl */ `
attribute vec3 aGrassPos;
attribute vec4 aGrassShape;
attribute vec4 aGrassTint;
uniform vec4 uGrassLod;
uniform vec4 uGrassDensity;
uniform vec4 uGrassSize;
uniform vec4 uGrassWind;
uniform float uGrassTime;
uniform vec4 uGrassPlayer;
uniform vec4 uGrassMisc;
varying vec2 vGrassUv;
varying vec3 vGrassColor;
varying float vGrassY;
varying float vGrassDist;
float grassDensityAt(float d) {
	if (d <= uGrassLod.x) return uGrassDensity.x;
	if (d <= uGrassLod.y) return mix(uGrassDensity.x, uGrassDensity.y, (d - uGrassLod.x) / max(1e-3, uGrassLod.y - uGrassLod.x));
	if (d <= uGrassLod.z) return mix(uGrassDensity.y, uGrassDensity.z, (d - uGrassLod.y) / max(1e-3, uGrassLod.z - uGrassLod.y));
	return uGrassDensity.z * max(0.0, 1.0 - (d - uGrassLod.z) / max(1e-3, uGrassLod.w - uGrassLod.z));
}
`;

/** Runs at `beginnormal_vertex`: builds the card (kept in grassLocal) and its normal. */
const VERTEX_BUILD = /* glsl */ `
	vec3 grassRootWorld = (modelMatrix * vec4(aGrassPos, 1.0)).xyz;
	vec2 grassToCam = cameraPosition.xz - grassRootWorld.xz;
	float grassDist = length(grassToCam);
	float grassDens = grassDensityAt(grassDist);
	float grassT = clamp((grassDens - aGrassShape.z) / uGrassDensity.w, 0.0, 1.0);
	float grassVis = grassT * grassT * (3.0 - 2.0 * grassT);
	float grassHeight = (uGrassSize.x + aGrassShape.x * uGrassSize.y) * grassVis;
	// Survivors of a thinned LOD widen a little, so coverage falls slower than the count.
	float grassWidth = grassHeight * uGrassSize.z * mix(0.78, 1.22, aGrassShape.y) * (1.0 + (1.0 - min(grassDens, 1.0)) * 0.4);
	vec2 grassFace = grassDist > 1e-3 ? grassToCam / grassDist : vec2(0.0, 1.0);
	vec2 grassBill = vec2(grassFace.y, -grassFace.x);
	float grassYaw = aGrassShape.z * 41.0 + aGrassShape.w * 13.0;
	vec2 grassYawDir = vec2(cos(grassYaw), sin(grassYaw));
	if (dot(grassYawDir, grassBill) < 0.0) grassYawDir = -grassYawDir;
	float grassCross = uGrassSize.w > 0.0 ? 1.0 - smoothstep(uGrassSize.w * 0.5, uGrassSize.w, grassDist) : 0.0;
	vec2 grassMain = normalize(mix(grassBill, grassYawDir, grassCross) + vec2(1e-5, 0.0));
	bool grassSecond = position.z > 0.5;
	vec2 grassAxis = grassSecond ? vec2(-grassMain.y, grassMain.x) : grassMain;
	float grassCardWidth = grassWidth * (grassSecond ? grassCross : 1.0);
	float grassBend = position.y * position.y;
	float grassPhase = aGrassShape.w * 6.2831853 + dot(grassRootWorld.xz, vec2(0.21, 0.17));
	float grassGust = 0.6 + 0.4 * sin(uGrassTime * 0.55 - dot(grassRootWorld.xz, uGrassWind.xy) * 0.09);
	float grassSway = sin(uGrassTime * 2.1 + grassPhase) * 0.6 + sin(uGrassTime * 3.7 + grassPhase * 1.7) * 0.25;
	vec2 grassOffset = uGrassWind.xy * (uGrassWind.w + grassSway * uGrassWind.z) * grassGust * grassBend * grassHeight * 0.45;
	if (uGrassPlayer.w > 0.0) {
		vec2 grassAway = grassRootWorld.xz - uGrassPlayer.xz;
		float grassAwayLen = length(grassAway);
		float grassNear = (1.0 - smoothstep(0.0, uGrassPlayer.w, grassAwayLen)) * step(abs(grassRootWorld.y - uGrassPlayer.y), 1.5);
		grassOffset += (grassAwayLen > 1e-3 ? grassAway / grassAwayLen : vec2(0.0)) * grassNear * grassBend * grassHeight * 0.6;
	}
	// Storms bend, never flatten: the tip moves at most 0.6 of the tuft height sideways.
	float grassOffsetLen = length(grassOffset);
	float grassMaxOffset = grassHeight * 0.6 * grassBend + 1e-5;
	if (grassOffsetLen > grassMaxOffset) grassOffset *= grassMaxOffset / grassOffsetLen;
	float grassDrop = dot(grassOffset, grassOffset) / max(grassHeight, 1e-3) * 0.5;
	vec3 grassLocal = aGrassPos + vec3(
		grassAxis.x * position.x * grassCardWidth + grassOffset.x,
		position.y * grassHeight - grassDrop,
		grassAxis.y * position.x * grassCardWidth + grassOffset.y);
	vec3 objectNormal = normalize(vec3(grassFace.x * 0.4, 1.0, grassFace.y * 0.4));
	float grassVariant = floor(aGrassTint.w * 255.0 + 0.5);
	vec2 grassTile = vec2(mod(grassVariant, ${GRASS_ATLAS_COLUMNS}.0), floor(grassVariant / ${GRASS_ATLAS_COLUMNS}.0));
	vec2 grassIn = vec2(mix(uGrassMisc.x, 1.0 - uGrassMisc.x, uv.x), mix(uGrassMisc.x * 0.5, 1.0 - uGrassMisc.x, uv.y));
	vGrassUv = (grassTile + grassIn) / vec2(${GRASS_ATLAS_COLUMNS}.0, ${GRASS_ATLAS_ROWS}.0);
	vGrassColor = aGrassTint.rgb * aGrassTint.rgb;
	vGrassY = position.y;
	vGrassDist = grassDist;
`;

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2D uGrassAtlas;
uniform vec4 uGrassShade;
uniform vec4 uGrassMisc;
uniform vec4 uGrassLod;
varying vec2 vGrassUv;
varying vec3 vGrassColor;
varying float vGrassY;
varying float vGrassDist;
`;

const FRAGMENT_COLOR = /* glsl */ `
	vec4 grassTexel = texture2D(uGrassAtlas, vGrassUv);
	float grassGradient = mix(uGrassShade.x, uGrassShade.y, vGrassY);
	diffuseColor.rgb *= vGrassColor * grassTexel.rgb * 2.0 * grassGradient * uGrassShade.w * (1.0 - uGrassShade.z);
	diffuseColor.a *= grassTexel.a;
	if (uGrassMisc.y > 0.5) {
		diffuseColor.rgb = vGrassDist < uGrassLod.x ? vec3(1.0, 0.15, 0.1) : vGrassDist < uGrassLod.y ? vec3(0.15, 1.0, 0.2) : vec3(0.2, 0.35, 1.0);
	}
`;

function grassHook(uniforms: GrassUniforms): THREE.Material['onBeforeCompile'] {
	return (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
			.replace('#include <beginnormal_vertex>', VERTEX_BUILD)
			.replace('#include <begin_vertex>', 'vec3 transformed = grassLocal;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
			.replace('#include <map_fragment>', FRAGMENT_COLOR)
			// Double-sided cards keep the up-biased normal on both faces (no flip to "underneath").
			.replace(
				'#include <normal_fragment_begin>',
				'#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );'
			);
	};
}

export function createGrassMaterial(
	atlas: THREE.Texture,
	uniforms: GrassUniforms
): THREE.MeshLambertMaterial {
	uniforms.uGrassAtlas.value = atlas;
	const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 });
	material.name = 'grass';
	setOwnShaderHook(material, grassHook(uniforms), 'grass-v1', uniforms);
	return material;
}

/** The atlas as one small texture with its coverage-preserving mip chain (see grassAtlas.ts). */
export function createGrassAtlasTexture(atlas: GrassAtlas): THREE.DataTexture {
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
	texture.wrapS = THREE.ClampToEdgeWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	// The RGB is a colour multiplier around 1, not an sRGB colour.
	texture.colorSpace = THREE.NoColorSpace;
	texture.name = 'grass-atlas';
	texture.needsUpdate = true;
	return texture;
}

/** Bytes of the atlas with its mip chain. */
export function grassAtlasBytes(atlas: GrassAtlas): number {
	return atlas.levels.reduce((sum, level) => sum + level.data.byteLength, 0);
}

/**
 * The shared card template: two cards (z = 0 main, z = 1 cross), each 2 columns × 3 rows (the middle
 * row lets wind curve the card instead of shearing it). x ∈ [-0.5, 0.5], y ∈ [0, 1] (rooted at the
 * bottom centre). Draw the first 12 indices for one card, all 24 for the crossed pair.
 */
export const GRASS_CARD_INDICES_SINGLE = 12;
export const GRASS_CARD_INDICES_CROSSED = 24;
export const GRASS_TRIANGLES_SINGLE = 4;
export const GRASS_TRIANGLES_CROSSED = 8;

export function createGrassCardTemplate(): {
	position: Float32Array;
	normal: Float32Array;
	uv: Float32Array;
	index: Uint16Array;
} {
	const position: number[] = [];
	const uv: number[] = [];
	const index: number[] = [];
	for (let card = 0; card < 2; card++) {
		const base = position.length / 3;
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 2; col++) {
				position.push(col - 0.5, row / 2, card);
				uv.push(col, row / 2);
			}
		}
		for (let row = 0; row < 2; row++) {
			const a = base + row * 2;
			index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
	}
	return {
		position: new Float32Array(position),
		// Never read (the shader builds the normal), but without a `normal` attribute three.js
		// compiles Lambert as flat-shaded, which drops the smooth normal varying.
		normal: new Float32Array(position.length).map((_, i) => (i % 3 === 1 ? 1 : 0)),
		uv: new Float32Array(uv),
		index: new Uint16Array(index)
	};
}
