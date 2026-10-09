import * as THREE from 'three';
import {
	createFieldSeeds,
	createFieldWrapOffsets,
	FIELD_LAYER_COUNTS,
	FIELD_LAYER_RADII,
	fieldWrapOffsets,
	type ParticleFieldFrame
} from './ParticleFieldMath';
import { getParticleAtlasTexture } from './ParticleRenderer';
import type { ParticleAtlas } from './ParticleTextureGenerator';
import type { ParticleFieldDefinition } from './ParticleTypes';

/**
 * Draws a camera-local particle field (rain or snow) in ONE draw call. The only per-instance data is
 * a static random seed; position, fall, wind drift, wrap-around recycling, flutter, spin and fades
 * all happen in the vertex shader (see ParticleFieldMath for the same maths in TypeScript). The CPU
 * sets a dozen uniforms per frame and the instance count — never touches a particle.
 *
 * Shares the particle atlas texture and the scene light uniform with every other particle renderer.
 */
const VERT = /* glsl */ `
	#include <common>
	#include <fog_pars_vertex>
	attribute vec4 iSeed;
	uniform vec3 uVolume;      // 2r, h, 2r (outer layer)
	uniform vec3 uLayerRadii;  // layer radius as a fraction of r, innermost first
	uniform vec2 uLayerCounts; // instances (of every 20) in layer 0, and in layers 0 + 1
	uniform vec2 uWrap0;       // per-layer x/z wrap offsets (CPU, double precision)
	uniform vec2 uWrap1;
	uniform vec2 uWrap2;
	uniform float uWrapY;
	uniform float uPhase;
	uniform vec2 uCycles;      // min, range
	uniform vec2 uSize;        // width, length
	uniform float uSizeJitter;
	uniform float uOpacity;
	uniform vec2 uNearFade;
	uniform vec3 uDir;
	uniform vec3 uFlutter;     // amplitude, cycles, spin cycles
	uniform vec4 uShelter;     // minX, minZ, maxX, maxZ (relative to the anchor)
	uniform vec2 uShelterTop;  // top y (relative to the anchor), enabled
	uniform float uPixelAngle;
	uniform vec2 uCells;       // first atlas cell, cell count
	uniform float uCellsPerSide;
	varying vec2 vUv;
	varying float vOpacity;

	void main() {
		// Nested layers by instance index: most particles in a small box round the camera.
		float slot = mod(float(gl_InstanceID), 20.0);
		float layerScale = slot < uLayerCounts.x ? uLayerRadii.x : (slot < uLayerCounts.y ? uLayerRadii.y : uLayerRadii.z);
		vec2 wrap = slot < uLayerCounts.x ? uWrap0 : (slot < uLayerCounts.y ? uWrap1 : uWrap2);
		float radius = uVolume.x * 0.5 * layerScale;
		float size = radius * 2.0;
		float cycles = uCycles.x + floor(iSeed.w * uCycles.y);
		float fall = fract(iSeed.y - cycles * uPhase);
		vec3 local = vec3(
			mod(iSeed.x * size + wrap.x, size) - radius,
			mod(fall * uVolume.y + uWrapY, uVolume.y) - uVolume.y * 0.5,
			mod(iSeed.z * size + wrap.y, size) - radius
		);

		float jitter = 1.0 + (fract(iSeed.w * 53.71) - 0.5) * 2.0 * uSizeJitter;
		float alpha = uOpacity * (0.7 + 0.3 * fract(iSeed.x * 91.7 + iSeed.z * 13.1));
		// Box to cylinder, and soft top/bottom so the wrap never pops.
		alpha *= 1.0 - smoothstep(radius * 0.72, radius, length(local.xz));
		float v = (local.y + uVolume.y * 0.5) / uVolume.y;
		alpha *= smoothstep(0.0, 0.08, v) * (1.0 - smoothstep(0.9, 1.0, v));
		// Inside a shelter (the building the camera is in): hidden.
		if (uShelterTop.y > 0.5 && local.y < uShelterTop.x &&
			local.x > uShelter.x && local.x < uShelter.z && local.z > uShelter.y && local.z < uShelter.w) {
			alpha = 0.0;
		}

	#ifdef FIELD_FLAKE
		float k1 = uFlutter.y + floor(fract(iSeed.w * 13.7) * uFlutter.y);
		float k2 = uFlutter.y + floor(fract(iSeed.x * 7.3) * uFlutter.y);
		local.x += sin(6.2831853 * k1 * uPhase + iSeed.w * 31.4) * uFlutter.x;
		local.z += cos(6.2831853 * k2 * uPhase + iSeed.x * 17.2) * uFlutter.x * 0.8;
	#endif

		vec4 world = modelMatrix * vec4(local, 1.0);
		float camDistance = distance(world.xyz, cameraPosition);
		alpha *= smoothstep(uNearFade.x, uNearFade.y, camDistance);
		vec4 mvPosition = viewMatrix * world;

	#ifdef FIELD_FLAKE
		float spinTurns = floor((fract(iSeed.y * 29.3) - 0.5) * 2.0 * uFlutter.z + 0.5);
		float angle = 6.2831853 * spinTurns * uPhase + iSeed.z * 6.2831853;
		float c = cos(angle);
		float s = sin(angle);
		mvPosition.xy += mat2(c, s, -s, c) * position.xy * uSize.x * jitter;
		float cell = uCells.x + floor(fract(iSeed.w * 7.31) * uCells.y);
	#else
		// A thin quad along the fall direction, turned to face the camera.
		vec3 axis = normalize((viewMatrix * vec4(uDir, 0.0)).xyz);
		vec3 side = cross(axis, normalize(mvPosition.xyz));
		float sideLength = length(side);
		side = sideLength > 1e-4 ? side / sideLength : vec3(1.0, 0.0, 0.0);
		// Never thinner than about a pixel: wider and fainter instead, so it does not shimmer.
		float minWidth = camDistance * uPixelAngle * 1.2;
		float width = max(uSize.x * jitter, minWidth);
		alpha *= (uSize.x * jitter) / width;
		mvPosition.xyz += side * position.x * width - axis * position.y * uSize.y * jitter;
		float cell = uCells.x;
	#endif

		gl_Position = projectionMatrix * mvPosition;
		if (alpha < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off-screen: no fragments
		vec2 cellXY = vec2(mod(cell, uCellsPerSide), floor(cell / uCellsPerSide));
		vUv = (cellXY + vec2(position.x + 0.5, 0.5 - position.y)) / uCellsPerSide;
		vOpacity = alpha;
		#include <fog_vertex>
	}
`;

const FRAG = /* glsl */ `
	#include <common>
	#include <fog_pars_fragment>
	uniform sampler2D uAtlas;
	uniform vec3 uLight;
	uniform vec3 uColor;
	uniform float uLighting;
	varying vec2 vUv;
	varying float vOpacity;
	void main() {
		vec4 tex = texture2D(uAtlas, vUv);
		float alpha = tex.a * vOpacity;
		if (alpha < 0.008) discard;
		vec3 color = tex.rgb * uColor * mix(vec3(1.0), uLight, uLighting);
		gl_FragColor = vec4(color, alpha);
		#include <fog_fragment>
	}
`;

function hashId(id: string): number {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

export class ParticleFieldRenderer {
	readonly mesh: THREE.Mesh;
	readonly material: THREE.ShaderMaterial;
	private readonly geometry: THREE.InstancedBufferGeometry;
	private seeds: Float32Array = new Float32Array(0);
	private readonly offsets = createFieldWrapOffsets();
	private count = 0;

	constructor(
		readonly definition: ParticleFieldDefinition,
		atlas: ParticleAtlas,
		lightUniform: { value: THREE.Color },
		capacity: number
	) {
		this.geometry = new THREE.InstancedBufferGeometry();
		const quad = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
		this.geometry.setAttribute('position', new THREE.BufferAttribute(quad, 3));
		this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
		const cells = atlas.cells.get(definition.textureId);
		if (!cells) throw new Error(`unknown particle texture "${definition.textureId}"`);

		this.material = new THREE.ShaderMaterial({
			uniforms: THREE.UniformsUtils.merge([
				THREE.UniformsLib.fog,
				{
					uAtlas: { value: null },
					uCellsPerSide: { value: atlas.cellsPerSide },
					uCells: { value: new THREE.Vector2(cells[0], cells.length) },
					uLight: { value: new THREE.Color(1, 1, 1) },
					uColor: { value: new THREE.Color(...definition.color) },
					uLighting: { value: definition.lighting },
					uVolume: { value: new THREE.Vector3(40, 24, 40) },
					uLayerRadii: { value: new THREE.Vector3(...FIELD_LAYER_RADII) },
					uLayerCounts: {
						value: new THREE.Vector2(
							FIELD_LAYER_COUNTS[0],
							FIELD_LAYER_COUNTS[0] + FIELD_LAYER_COUNTS[1]
						)
					},
					uWrap0: { value: new THREE.Vector2() },
					uWrap1: { value: new THREE.Vector2() },
					uWrap2: { value: new THREE.Vector2() },
					uWrapY: { value: 0 },
					uPhase: { value: 0 },
					uCycles: { value: new THREE.Vector2(1, 1) },
					uSize: { value: new THREE.Vector2(0.01, 0.6) },
					uSizeJitter: { value: 0.25 },
					uOpacity: { value: 1 },
					uNearFade: { value: new THREE.Vector2(0.5, 2) },
					uDir: { value: new THREE.Vector3(0, -1, 0) },
					uFlutter: { value: new THREE.Vector3() },
					uShelter: { value: new THREE.Vector4() },
					uShelterTop: { value: new THREE.Vector2() },
					uPixelAngle: { value: 0.001 }
				}
			]),
			defines: definition.shape === 'flake' ? { FIELD_FLAKE: 1 } : {},
			vertexShader: VERT,
			fragmentShader: FRAG,
			transparent: true,
			depthWrite: false,
			fog: true,
			blending:
				definition.blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending
		});
		this.material.uniforms.uAtlas.value = getParticleAtlasTexture(atlas);
		this.material.uniforms.uLight = lightUniform;
		this.material.name = `particle-field:${definition.id}`;

		this.mesh = new THREE.Mesh(this.geometry, this.material);
		this.mesh.name = `particle-field:${definition.id}`;
		this.mesh.frustumCulled = false; // the volume always surrounds the camera
		this.mesh.renderOrder = 3;
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
		this.mesh.visible = false;
		this.setCapacity(capacity);
	}

	get capacity(): number {
		return this.seeds.length / 4;
	}

	get liveCount(): number {
		return this.count;
	}

	/** GPU bytes of the seed buffer. */
	get bufferBytes(): number {
		return this.seeds.byteLength;
	}

	/** Allocates the seed buffer — only when the capacity actually changes (graphics quality). */
	setCapacity(capacity: number): void {
		const next = Math.max(0, Math.floor(capacity));
		if (next === this.capacity && this.seeds.length > 0) return;
		this.seeds = createFieldSeeds(next, hashId(this.definition.id));
		const attribute = new THREE.InstancedBufferAttribute(this.seeds, 4);
		attribute.setUsage(THREE.StaticDrawUsage);
		if (this.geometry.getAttribute('iSeed')) this.geometry.dispose();
		this.geometry.setAttribute('iSeed', attribute);
		this.setCount(Math.min(this.count, next));
	}

	/** Live particles: the first `count` seeds (seeds are random, so any prefix is evenly spread). */
	setCount(count: number): void {
		this.count = Math.max(0, Math.min(this.capacity, Math.floor(count)));
		this.geometry.instanceCount = this.count;
		this.mesh.visible = this.count > 0;
	}

	update(frame: ParticleFieldFrame): void {
		const u = this.material.uniforms;
		const offsets = fieldWrapOffsets(frame, this.offsets);
		this.mesh.position.set(frame.anchorX, frame.anchorY, frame.anchorZ);
		(u.uVolume.value as THREE.Vector3).set(frame.radius * 2, frame.height, frame.radius * 2);
		(u.uWrap0.value as THREE.Vector2).set(offsets.xz[0], offsets.xz[1]);
		(u.uWrap1.value as THREE.Vector2).set(offsets.xz[2], offsets.xz[3]);
		(u.uWrap2.value as THREE.Vector2).set(offsets.xz[4], offsets.xz[5]);
		u.uWrapY.value = offsets.y;
		u.uPhase.value = frame.phase;
		(u.uCycles.value as THREE.Vector2).set(frame.cycleMin, frame.cycleRange);
		(u.uSize.value as THREE.Vector2).set(frame.width, frame.length);
		u.uSizeJitter.value = frame.sizeJitter;
		u.uOpacity.value = frame.opacity;
		(u.uNearFade.value as THREE.Vector2).set(frame.nearFadeStart, frame.nearFadeEnd);
		(u.uDir.value as THREE.Vector3).set(frame.dirX, frame.dirY, frame.dirZ);
		(u.uFlutter.value as THREE.Vector3).set(
			frame.flutterAmplitude,
			frame.flutterCycles,
			frame.spinCycles
		);
		(u.uShelter.value as THREE.Vector4).set(
			frame.shelterMinX - frame.anchorX,
			frame.shelterMinZ - frame.anchorZ,
			frame.shelterMaxX - frame.anchorX,
			frame.shelterMaxZ - frame.anchorZ
		);
		(u.uShelterTop.value as THREE.Vector2).set(
			frame.shelterTopY - frame.anchorY,
			frame.shelterEnabled ? 1 : 0
		);
		u.uPixelAngle.value = frame.pixelAngle;
	}

	dispose(): void {
		this.mesh.removeFromParent();
		this.geometry.dispose();
		this.material.dispose();
	}
}
