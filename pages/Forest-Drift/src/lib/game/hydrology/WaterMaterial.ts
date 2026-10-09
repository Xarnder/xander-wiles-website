import * as THREE from 'three';
import type { HydrologyVisualSettings } from './HydrologyTypes';

/**
 * One shared, fully procedural water material for rivers and lakes (no textures). A vertex
 * attribute picks downstream flow versus a slow, wind-driven lake surface; geometry never moves —
 * all animation is the time uniform.
 *
 * Per pixel:
 *  - **Waves**: three octaves of analytic-derivative noise (normals straight from the derivatives),
 *    advected along the river with two-phase flow mapping so they travel downstream forever without
 *    stretching. The finest octave fades with distance.
 *  - **Depth**: `aDepth` is the real water column at each vertex (water surface minus the carved
 *    bed, sampled when the mesh is built), so shallows are clear and show the sand and pebbles,
 *    deep water absorbs red first and turns teal-green, and the waterline fades out softly.
 *  - **Reflection**: a sky gradient by reflected direction, Schlick Fresnel, and a tight sun glint
 *    with glitter.
 *  - **Foam**: a broken band where the water thins against the bank, and streaks along the current
 *    on faster stretches.
 */
const VERT = /* glsl */ `
	#include <common>
	#include <fog_pars_vertex>
	attribute vec2 aFlow;
	attribute float aDepth;
	attribute float aKind;
	varying vec3 vWorld;
	varying vec2 vFlow;
	varying float vDepth;
	varying float vKind;
	void main() {
		vec4 world = modelMatrix * vec4(position, 1.0);
		vec4 mvPosition = viewMatrix * world;
		gl_Position = projectionMatrix * mvPosition;
		vWorld = world.xyz;
		vFlow = aFlow;
		vDepth = aDepth;
		vKind = aKind;
		#include <fog_vertex>
	}
`;

const FRAG = /* glsl */ `
	#include <common>
	#include <fog_pars_fragment>
	uniform float uTime;
	uniform vec3 uSunDirection;
	uniform vec3 uSunColor;
	uniform vec3 uDeepColor;
	uniform vec3 uShallowColor;
	uniform vec3 uSkyColor;
	uniform float uOpacity;
	uniform float uWaveStrength;
	uniform float uFlowSpeed;
	uniform float uQuality;
	uniform vec3 uCameraPosition;
	varying vec3 vWorld;
	varying vec2 vFlow;
	varying float vDepth;
	varying float vKind;

	float wHash(vec2 p) {
		vec3 p3 = fract(vec3(p.xyx) * 0.1031);
		p3 += dot(p3, p3.yzx + 33.33);
		return fract((p3.x + p3.y) * p3.z);
	}

	// Value noise in [-1, 1] with its analytic gradient: (value, d/dx, d/dy).
	vec3 wNoised(vec2 x) {
		vec2 i = floor(x);
		vec2 f = fract(x);
		vec2 u = f * f * (3.0 - 2.0 * f);
		vec2 du = 6.0 * f * (1.0 - f);
		float a = wHash(i);
		float b = wHash(i + vec2(1.0, 0.0));
		float c = wHash(i + vec2(0.0, 1.0));
		float d = wHash(i + vec2(1.0, 1.0));
		float k = a - b - c + d;
		float v = a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y;
		vec2 g = du * (vec2(b - a, c - a) + k * u.yx);
		return vec3(v * 2.0 - 1.0, g * 2.0);
	}

	// Wave height gradient (d/dx, d/dz) of the surface at p, three octaves, rotated between octaves.
	vec2 wWaves(vec2 p, float fine) {
		vec2 grad = vec2(0.0);
		mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
		vec3 n = wNoised(p * 0.85);
		grad += n.yz * 0.85 * 0.5;
		if (uQuality >= 0.5) {
			p = rot * p;
			n = wNoised(p * 2.3 + 11.0);
			grad += (transpose(rot) * n.yz) * 2.3 * 0.2 * (0.35 + 0.65 * fine);
		}
		if (uQuality >= 1.5 && fine > 0.0) {
			p = rot * p;
			n = wNoised(p * 6.1 - 7.0);
			grad += (transpose(rot) * transpose(rot) * n.yz) * 6.1 * 0.035 * fine;
		}
		return grad;
	}

	void main() {
		vec3 toCamera = uCameraPosition - vWorld;
		float viewDist = length(toCamera);
		vec3 viewDir = toCamera / max(viewDist, 1e-4);
		float fine = 1.0 - smoothstep(14.0, 40.0, viewDist);
		bool river = vKind < 0.5;

		// --- Flow-mapped waves: two phases half a cycle apart, cross-faded, so the pattern travels
		// with the current but never stretches.
		float speed = river ? length(vFlow) : 0.0;
		vec2 dir = river ? vFlow / max(speed, 1e-4) : vec2(0.0);
		vec2 p = vWorld.xz;
		vec2 grad;
		if (river) {
			float cycle = uTime * 0.45;
			float ph0 = fract(cycle);
			float ph1 = fract(cycle + 0.5);
			float w0 = 1.0 - abs(1.0 - 2.0 * ph0);
			// Stretch the pattern along the current: ripples are longer down the river than across it.
			vec2 across = vec2(-dir.y, dir.x);
			vec2 q = vec2(dot(p, dir) * 0.8, dot(p, across));
			float travel = 2.2 * speed * (0.5 + uFlowSpeed * 1.8);
			vec2 g0 = wWaves(q - vec2(ph0 * travel, 0.0) + 3.1, fine);
			vec2 g1 = wWaves(q - vec2(ph1 * travel, 0.0) + 17.7, fine);
			vec2 gq = mix(g1, g0, w0);
			grad = dir * gq.x * 0.6 + across * gq.y;
			grad *= 0.7 + 0.6 * min(speed, 1.5);
		} else {
			vec2 wind = vec2(uTime * 0.21, -uTime * 0.13);
			grad = wWaves(p * 0.7 + wind, fine) * 0.75 + wWaves(p * 0.31 - wind * 0.6 + 5.0, 0.0) * 0.35;
		}
		// Ripples flatten with distance: far away they would only alias into grey static.
		float waveScale = uWaveStrength * 0.32 * (1.0 - 0.75 * smoothstep(25.0, 140.0, viewDist));
		vec3 n = normalize(vec3(-grad.x * waveScale, 1.0, -grad.y * waveScale));

		// --- Depth, absorption and the soft waterline.
		float depth = max(vDepth, 0.0);
		vec3 absorb = vec3(0.95, 0.36, 0.26);
		vec3 transmit = exp(-absorb * depth * 1.6);
		float clarity = (transmit.r + transmit.g + transmit.b) / 3.0;
		// The body colour shifts from the shallow tint to the deep one as the column thickens.
		vec3 body = mix(uShallowColor, uDeepColor, smoothstep(0.0, 1.8, depth));
		body *= mix(vec3(1.0), transmit * 0.5 + 0.5, 0.35);
		vec3 sunDir = normalize(uSunDirection);
		float sunUp = clamp(sunDir.y * 2.0 + 0.2, 0.05, 1.0);
		body *= (0.42 + 0.58 * max(dot(n, sunDir), 0.0)) * (0.35 + 0.65 * sunUp);

		// --- Reflection: sky gradient by reflected direction, Schlick Fresnel.
		float ndv = clamp(dot(n, viewDir), 0.0, 1.0);
		float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
		vec3 r = reflect(-viewDir, n);
		vec3 horizon = mix(uSkyColor, vec3(0.86, 0.9, 0.93), 0.25) * (0.4 + 0.6 * sunUp);
		vec3 zenith = uSkyColor * mix(0.75, 1.0, sunUp);
		vec3 sky = mix(horizon, zenith, smoothstep(0.0, 0.55, r.y));
		vec3 col = mix(body, sky, fresnel * (uQuality >= 0.5 ? 0.62 : 0.4));

		// --- Sun glint and glitter.
		vec3 halfDir = normalize(sunDir + viewDir);
		float nh = max(dot(n, halfDir), 0.0);
		float glint = pow(nh, uQuality >= 1.5 ? 520.0 : 200.0) * 2.6 + pow(nh, 60.0) * 0.06;
		col += uSunColor * glint * sunUp;

		// --- Opacity: thin water is clear; reflections are opaque.
		float alpha = mix(0.08, uOpacity, 1.0 - clarity);
		alpha = max(alpha, fresnel * 0.6);

		// --- Foam: a broken band where the water thins on the bank, and streaks on faster water.
		float foam = 0.0;
		if (uQuality >= 0.5) {
			vec2 fp = vWorld.xz;
			if (river) fp -= dir * uTime * speed * 1.1;
			float breakup = wNoised(fp * 2.3).x * 0.35 + wNoised(fp * 0.7 + 4.0).x * 0.15 + 0.5;
			float edge = (1.0 - smoothstep(0.02, 0.14, depth)) * smoothstep(0.45, 0.75, breakup);
			// Rivers churn against their banks; lakes barely lap at theirs.
			foam = edge * (river ? 0.45 : 0.12);
			if (river) {
				// Soft, broken streaks along fast currents (broad and faint, so they never read as lines).
				vec2 sp = vec2(dot(vWorld.xz, dir) - uTime * speed * 1.6, dot(vWorld.xz, vec2(-dir.y, dir.x)));
				float streak = smoothstep(0.62, 0.9, wNoised(sp * vec2(0.3, 0.9)).x * 0.5 + 0.5);
				streak *= smoothstep(0.4, 0.7, wNoised(sp * 0.4 + 9.0).x * 0.5 + 0.5);
				foam += streak * smoothstep(1.0, 1.7, speed) * 0.16 * fine;
			}
			foam = clamp(foam, 0.0, 1.0);
			col = mix(col, vec3(0.93, 0.96, 0.97) * (0.45 + 0.55 * sunUp), foam);
			alpha = max(alpha, foam * 0.9);
		}
		// Soft contact with the bank.
		alpha *= smoothstep(0.0, 0.05, depth + 0.012);

		gl_FragColor = vec4(col, alpha);
		#include <fog_fragment>
	}
`;

export interface WaterMaterialUniforms {
	uTime: { value: number };
	uSunDirection: { value: THREE.Vector3 };
	uSunColor: { value: THREE.Color };
	uDeepColor: { value: THREE.Color };
	uShallowColor: { value: THREE.Color };
	uSkyColor: { value: THREE.Color };
	uOpacity: { value: number };
	uWaveStrength: { value: number };
	uFlowSpeed: { value: number };
	uQuality: { value: number };
	uCameraPosition: { value: THREE.Vector3 };
}

export function createWaterMaterial(): THREE.ShaderMaterial {
	const material = new THREE.ShaderMaterial({
		uniforms: THREE.UniformsUtils.merge([
			THREE.UniformsLib.fog,
			{
				uTime: { value: 0 },
				uSunDirection: { value: new THREE.Vector3(0.4, 0.8, 0.2) },
				uSunColor: { value: new THREE.Color('#fff4d2') },
				uDeepColor: { value: new THREE.Color('#0f4f5c') },
				uShallowColor: { value: new THREE.Color('#5fa8a0') },
				uSkyColor: { value: new THREE.Color('#d7eef8') },
				uOpacity: { value: 0.9 },
				uWaveStrength: { value: 0.55 },
				uFlowSpeed: { value: 0.28 },
				uQuality: { value: 2 },
				uCameraPosition: { value: new THREE.Vector3() }
			}
		]),
		vertexShader: VERT,
		fragmentShader: FRAG,
		transparent: true,
		depthWrite: false,
		// Seen from above and from underneath (wading/swimming); also independent of mesh winding.
		side: THREE.DoubleSide,
		fog: true,
		polygonOffset: true,
		polygonOffsetFactor: -2,
		polygonOffsetUnits: -2
	});
	material.toneMapped = true;
	return material;
}

export function applyWaterLook(
	material: THREE.ShaderMaterial,
	visual: HydrologyVisualSettings,
	quality: number
): void {
	const uniforms = material.uniforms as unknown as WaterMaterialUniforms;
	uniforms.uDeepColor.value.set(visual.deepColor);
	uniforms.uShallowColor.value.set(visual.shallowColor);
	uniforms.uOpacity.value = visual.transparency;
	uniforms.uWaveStrength.value = quality <= 0 ? visual.waveStrength * 0.5 : visual.waveStrength;
	uniforms.uFlowSpeed.value = visual.flowSpeed;
	uniforms.uQuality.value = quality;
}

export function waterQualityFor(quality: 'low' | 'medium' | 'high' | 'ultra'): number {
	if (quality === 'low') return 0;
	if (quality === 'medium') return 1;
	if (quality === 'high') return 2;
	return 3;
}
