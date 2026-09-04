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

	void main() {
		vec3 dir = normalize(vDirection);
		float h = dir.y;

		// Atmospheric shaping, not a flat two-colour gradient: horizon -> mid -> top each blend
		// over their own band, so the sky reads as gently layered rather than a single lerp.
		vec3 upperColor = mix(uHorizonColor, uMidColor, smoothstep(uHorizonHeight, uHorizonHeight + 0.35, h));
		upperColor = mix(upperColor, uTopColor, smoothstep(uHorizonHeight + 0.15, 1.0, h));

		float horizonT = smoothstep(uHorizonHeight - uHorizonSoftness, uHorizonHeight + uHorizonSoftness, h);
		vec3 color = mix(uGroundHazeColor, upperColor, horizonT);

		// Soft warm glow toward the sun, concentrated near the horizon band around it.
		float sunDot = max(dot(dir, uSunDirection), 0.0);
		float glow = pow(sunDot, 10.0) * 0.6 + pow(sunDot, 2.5) * 0.18;
		color += uSunColor * glow * uSunIntensity;

		if (uShowSunDisk > 0.5) {
			float disc = smoothstep(
				1.0 - uSunDiskSize - uSunDiskSoftness,
				1.0 - uSunDiskSize + uSunDiskSoftness,
				sunDot
			);
			color += uSunColor * disc * uSunDiskBrightness;
		}

		gl_FragColor = vec4(color * uBrightness, 1.0);
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
				uSunDiskSize: { value: 0.02 },
				uSunDiskBrightness: { value: 3 },
				uSunDiskSoftness: { value: 0.01 }
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
		u.uSunDiskSoftness.value = Math.max(0.0005, sky.sunDiskSoftness);

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
	update(cameraPosition: THREE.Vector3): void {
		this.mesh.position.copy(cameraPosition);
	}

	dispose(): void {
		this.geometry.dispose();
		this.material.dispose();
	}
}
