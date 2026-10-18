import * as THREE from 'three';
import { sunDirectionFromAngles } from './atmosphereMath';
import type { SunAtmosphereSettings, VisibleSkySettings } from './SkyTypes';

/** Comfortably inside the camera's far plane (2000) and well beyond any realistic fog-far/view-distance setting. */
const SKY_RADIUS = 1900;

const VERTEX_SHADER = /* glsl */ `
	varying vec3 vDirection;
	void main() {
		vDirection = normalize(position);
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	varying vec3 vDirection;

	uniform vec3 uTopColor;
	uniform vec3 uMidColor;
	uniform vec3 uHorizonColor;
	uniform vec3 uGroundHazeColor;
	uniform float uHorizonHeight;
	uniform float uHorizonSoftness;
	uniform float uBrightness;

	uniform vec3 uSunDirection;
	uniform vec3 uSunColor;
	uniform float uSunIntensity;
	uniform float uShowSunDisk;
	uniform float uSunDiskSize;
	uniform float uSunDiskBrightness;
	uniform float uSunDiskSoftness;
	uniform float uStarTime;
	float starHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

	void main() {
		vec3 dir = normalize(vDirection);
		float h = dir.y;

		// Atmospheric shaping, not a flat two-colour gradient: horizon -> mid -> top each blend
		// over their own band, so the sky reads as gently layered rather than a single lerp.
		vec3 upperColor = mix(uHorizonColor, uMidColor, smoothstep(uHorizonHeight, uHorizonHeight + 0.35, h));
		upperColor = mix(upperColor, uTopColor, smoothstep(uHorizonHeight + 0.15, 1.0, h));

		float horizonT = smoothstep(uHorizonHeight - uHorizonSoftness, uHorizonHeight + uHorizonSoftness, h);
		vec3 color = mix(uGroundHazeColor, upperColor, horizonT);

		// Golden light hugs the sunward horizon; the opposite sky keeps a cool rose
		// belt under a violet/blue zenith. Smooth overlapping bands avoid hard stripes.
		float twilight = exp(-pow((uSunDirection.y - 0.015) / 0.16, 2.0));
		float sunDot = dot(dir, uSunDirection);
		float sunward = smoothstep(-0.35, 0.95, sunDot);
		float lowBand = exp(-pow((h - 0.035) / 0.18, 2.0));
		float roseBand = exp(-pow((h - 0.20) / 0.22, 2.0));
		vec3 amber = vec3(1.0, 0.34, 0.075);
		vec3 rose = vec3(0.58, 0.17, 0.25);
		vec3 lavender = vec3(0.23, 0.19, 0.39);
		color = mix(color, mix(lavender, rose, sunward), twilight * roseBand * 0.48);
		color = mix(color, mix(rose, amber, sunward), twilight * lowBand * 0.68);

		// Angular distance (chord length), rather than 1-dot: the old 0.02 dot
		// threshold produced a roughly 23-degree-wide white orb.
		float distanceToSun = length(dir - uSunDirection);
		float radius = max(0.001, uSunDiskSize);
		float edge = clamp(uSunDiskSoftness, 0.00015, radius * 0.45);
		float sunVisible = smoothstep(-0.025, 0.005, uSunDirection.y);
		float halo = exp(-distanceToSun / (radius * 5.0)) * 0.20;
		float glow = pow(max(sunDot, 0.0), 12.0) * 0.035;
		color += uSunColor * (halo + glow) * min(uSunIntensity, 1.5) * sunVisible;

		if (uShowSunDisk > 0.5 && uSunIntensity > 0.0) {
			float disc = 1.0 - smoothstep(radius - edge, radius + edge, distanceToSun);
			vec3 diskColor = mix(uSunColor, vec3(1.0, 0.96, 0.83), 0.25);
			color = mix(color, diskColor * uSunDiskBrightness, disc * sunVisible);
		}

		// A stable spherical star field: one procedural point per sparse sky cell.
		// No star objects, textures, CPU loops or additional draw calls.
		float night = 1.0 - smoothstep(-0.16, 0.025, uSunDirection.y);
		vec3 stars = vec3(0.0);
		if (night > 0.001 && h > 0.015) {
			vec2 skyUv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, asin(clamp(h, -1.0, 1.0)) / 3.14159265 + 0.5);
			vec2 grid = skyUv * vec2(640.0, 320.0);
			vec2 cell = floor(grid);
			float pixelFootprint = max(length(fwidth(grid)) * 0.5, 0.015);
			float seed = starHash(cell);
			float density = 0.065 * sqrt(max(0.0, 1.0 - h * h));
			if (seed > 1.0 - density) {
				vec2 centre = vec2(starHash(cell + 19.3), starHash(cell + 71.7)) * 0.6 + 0.2;
				vec2 offset = fract(grid) - centre;
				offset.x *= max(0.12, sqrt(1.0 - h * h));
				float radius = mix(0.045, 0.14, pow(starHash(cell + 3.1), 5.0));
				float aa = pixelFootprint;
				float point = 1.0 - smoothstep(radius - aa, radius + aa, length(offset));
				float phase = starHash(cell + 41.0) * 6.2831853;
				float twinkle = 0.76 + 0.16 * sin(uStarTime * (0.65 + seed) + phase) + 0.08 * sin(uStarTime * 2.3 + phase * 3.0);
				vec3 tint = mix(vec3(0.64, 0.78, 1.0), vec3(1.0, 0.88, 0.68), starHash(cell + 9.0));
				stars = tint * point * twinkle * night * smoothstep(0.015, 0.18, h) * 1.6;
			}
		}
		gl_FragColor = vec4(color * uBrightness + stars, 1.0);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/**
 * The visible sky: a large inverted sphere with a gradient+haze+sun shader, always re-centred on
 * the camera (see update()) so it behaves like an infinite backdrop rather than a fixed-position
 * object the player could ever approach or leave. This is what actually renders on screen — the
 * HDRI (HdriEnvironmentSystem) only contributes lighting, never this visible gradient.
 */
export class SkySystem {
	readonly mesh: THREE.Mesh;
	private readonly geometry: THREE.SphereGeometry;
	private readonly material: THREE.ShaderMaterial;
	private readonly sunDirection = new THREE.Vector3(0, 1, 0);

	constructor() {
		this.geometry = new THREE.SphereGeometry(SKY_RADIUS, 24, 16);
		this.material = new THREE.ShaderMaterial({
			vertexShader: VERTEX_SHADER,
			fragmentShader: FRAGMENT_SHADER,
			side: THREE.BackSide,
			depthWrite: false,
			fog: false,
			uniforms: {
				uStarTime: { value: 0 },
				uTopColor: { value: new THREE.Color() },
				uMidColor: { value: new THREE.Color() },
				uHorizonColor: { value: new THREE.Color() },
				uGroundHazeColor: { value: new THREE.Color() },
				uHorizonHeight: { value: 0 },
				uHorizonSoftness: { value: 0.1 },
				uBrightness: { value: 1 },
				uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
				uSunColor: { value: new THREE.Color() },
				uSunIntensity: { value: 1 },
				uShowSunDisk: { value: 1 },
				uSunDiskSize: { value: 0.008 },
				uSunDiskBrightness: { value: 1.8 },
				uSunDiskSoftness: { value: 0.0012 }
			}
		});

		this.mesh = new THREE.Mesh(this.geometry, this.material);
		// A sphere centred on the camera is never outside the view frustum in a meaningful sense —
		// skip per-frame frustum culling work for it.
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = -1000;
	}

	applySettings(sky: VisibleSkySettings, atmosphere: SunAtmosphereSettings): void {
		const u = this.material.uniforms;
		(u.uTopColor.value as THREE.Color).set(sky.topColor);
		(u.uMidColor.value as THREE.Color).set(sky.midColor);
		(u.uHorizonColor.value as THREE.Color).set(sky.horizonColor);
		(u.uGroundHazeColor.value as THREE.Color).set(sky.groundHazeColor);
		u.uHorizonHeight.value = sky.horizonHeight;
		u.uHorizonSoftness.value = Math.max(0.001, sky.horizonSoftness);
		u.uBrightness.value = sky.brightness;
		u.uShowSunDisk.value = sky.showSunDisk ? 1 : 0;
		u.uSunDiskSize.value = sky.sunDiskSize;
		u.uSunDiskBrightness.value = sky.sunDiskBrightness;
		u.uSunDiskSoftness.value = Math.max(0.00015, sky.sunDiskSoftness);

		sunDirectionFromAngles(atmosphere.sunElevation, atmosphere.sunAzimuth, this.sunDirection);
		(u.uSunDirection.value as THREE.Vector3).copy(this.sunDirection);
		(u.uSunColor.value as THREE.Color).set(atmosphere.sunColor);
		u.uSunIntensity.value = atmosphere.sunEnabled ? atmosphere.sunIntensity : 0;

		this.mesh.visible = sky.enabled;
	}

	/** The current sun direction, already computed by the last applySettings() call — reused by ThreeScene to aim the directional light. */
	getSunDirection(): THREE.Vector3 {
		return this.sunDirection;
	}

	/** For fog colour matching — see atmosphereMath.resolveFogColor(). */
	getHorizonColorHex(sky: VisibleSkySettings): string {
		return sky.horizonColor;
	}

	/** Keeps the dome centred on the camera every frame — cheap (one position copy), essential for an infinite world. */
	update(cameraPosition: THREE.Vector3, timeSeconds = 0): void {
		this.material.uniforms.uStarTime.value = timeSeconds;
		this.mesh.position.copy(cameraPosition);
	}

	dispose(): void {
		this.geometry.dispose();
		this.material.dispose();
	}
}
