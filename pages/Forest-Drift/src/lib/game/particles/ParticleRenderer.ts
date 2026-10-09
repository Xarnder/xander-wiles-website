import * as THREE from 'three';
import type { ParticlePool } from './ParticlePool';
import type { ParticleBlending } from './ParticleTypes';
import type { ParticleAtlas } from './ParticleTextureGenerator';

/**
 * Draws one `ParticlePool` as camera-facing quads with ONE draw call: an instanced quad whose
 * per-instance attributes ARE the pool's render streams (no copying). Billboarding, rotation and
 * the atlas lookup happen in the vertex shader — no Object3D per particle, no CPU orientation.
 *
 * One renderer per blend mode; every effect with that blend mode shares it, its material, and the
 * one procedural atlas texture.
 */
const VERT = /* glsl */ `
	#include <common>
	#include <fog_pars_vertex>
	attribute vec4 iPosSize;
	attribute vec4 iParams;
	attribute vec4 iColor;
	uniform float uCellsPerSide;
	varying vec2 vUv;
	varying float vOpacity;
	varying vec3 vColor;
	varying float vLighting;
	void main() {
		float c = cos(iParams.y);
		float s = sin(iParams.y);
		vec2 corner = mat2(c, s, -s, c) * position.xy * iPosSize.w;
		vec4 mvPosition;
		if (iColor.w > 0.5) {
			// Flat on the ground plane (ripples on water).
			mvPosition = modelViewMatrix * vec4(iPosSize.xyz + vec3(corner.x, 0.0, corner.y), 1.0);
		} else {
			mvPosition = modelViewMatrix * vec4(iPosSize.xyz, 1.0);
			mvPosition.xy += corner;
		}
		gl_Position = projectionMatrix * mvPosition;
		float cell = iParams.z;
		vec2 cellXY = vec2(mod(cell, uCellsPerSide), floor(cell / uCellsPerSide));
		vUv = (cellXY + vec2(position.x + 0.5, 0.5 - position.y)) / uCellsPerSide;
		vOpacity = iParams.x;
		vColor = iColor.rgb;
		vLighting = iParams.w;
		#include <fog_vertex>
	}
`;

const FRAG = /* glsl */ `
	#include <common>
	#include <fog_pars_fragment>
	uniform sampler2D uAtlas;
	uniform vec3 uLight;
	varying vec2 vUv;
	varying float vOpacity;
	varying vec3 vColor;
	varying float vLighting;
	void main() {
		vec4 tex = texture2D(uAtlas, vUv);
		float alpha = tex.a * vOpacity;
		if (alpha < 0.01) discard;
		vec3 color = tex.rgb * vColor * mix(vec3(1.0), uLight, vLighting);
		gl_FragColor = vec4(color, alpha);
		#include <fog_fragment>
	}
`;

let sharedAtlasTexture: THREE.DataTexture | null = null;

/** The atlas as a GPU texture — created once and shared by every particle renderer. */
export function getParticleAtlasTexture(atlas: ParticleAtlas): THREE.DataTexture {
	if (sharedAtlasTexture) return sharedAtlasTexture;
	const texture = new THREE.DataTexture(
		atlas.pixels,
		atlas.size,
		atlas.size,
		THREE.RGBAFormat,
		THREE.UnsignedByteType
	);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.magFilter = THREE.LinearFilter;
	// No mips: cells are packed edge to edge, and mip levels would bleed neighbouring sprites.
	texture.minFilter = THREE.LinearFilter;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	sharedAtlasTexture = texture;
	return texture;
}

export class ParticleRenderer {
	readonly mesh: THREE.Mesh;
	readonly material: THREE.ShaderMaterial;
	private readonly geometry: THREE.InstancedBufferGeometry;
	private boundTo: Float32Array | null = null;

	constructor(
		private readonly pool: ParticlePool,
		blending: ParticleBlending,
		atlas: ParticleAtlas,
		lightUniform: { value: THREE.Color }
	) {
		this.geometry = new THREE.InstancedBufferGeometry();
		const quad = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
		this.geometry.setAttribute('position', new THREE.BufferAttribute(quad, 3));
		this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
		this.bindPool();

		this.material = new THREE.ShaderMaterial({
			uniforms: THREE.UniformsUtils.merge([
				THREE.UniformsLib.fog,
				{
					uAtlas: { value: null },
					uCellsPerSide: { value: atlas.cellsPerSide },
					uLight: { value: new THREE.Color(1, 1, 1) }
				}
			]),
			vertexShader: VERT,
			fragmentShader: FRAG,
			transparent: true,
			depthWrite: false,
			fog: true,
			blending: blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending
		});
		// Shared (not cloned by UniformsUtils.merge): one atlas, one scene light for every renderer.
		this.material.uniforms.uAtlas.value = getParticleAtlasTexture(atlas);
		this.material.uniforms.uLight = lightUniform;
		this.material.name = `particles:${blending}`;

		this.mesh = new THREE.Mesh(this.geometry, this.material);
		this.mesh.name = `particles:${blending}`;
		this.mesh.frustumCulled = false; // instances move every frame; the pool is already range-culled
		this.mesh.renderOrder = 3; // after water (2)
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
	}

	/** Uploads exactly the live range of the pool's render streams and sets the instance count. */
	sync(): void {
		if (this.boundTo !== this.pool.positionSize) this.bindPool();
		const count = this.pool.count;
		this.geometry.instanceCount = count;
		this.mesh.visible = count > 0;
		if (count === 0) return;
		for (const name of ['iPosSize', 'iParams', 'iColor']) {
			const attribute = this.geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
			attribute.clearUpdateRanges();
			attribute.addUpdateRange(0, count * 4);
			attribute.needsUpdate = true;
		}
	}

	/** GPU bytes of the instance buffers. */
	get bufferBytes(): number {
		return this.pool.positionSize.byteLength * 3;
	}

	dispose(): void {
		this.mesh.removeFromParent();
		this.geometry.dispose();
		this.material.dispose();
	}

	/** (Re)binds the pool's arrays as instance attributes — after construction or a pool resize. */
	private bindPool(): void {
		// After a pool resize, free the old GPU buffers; three re-uploads the new ones on next draw.
		if (this.boundTo) this.geometry.dispose();
		const make = (array: Float32Array) => {
			const attribute = new THREE.InstancedBufferAttribute(array, 4);
			attribute.setUsage(THREE.DynamicDrawUsage);
			return attribute;
		};
		this.geometry.setAttribute('iPosSize', make(this.pool.positionSize));
		this.geometry.setAttribute('iParams', make(this.pool.params));
		this.geometry.setAttribute('iColor', make(this.pool.color));
		this.boundTo = this.pool.positionSize;
	}
}
