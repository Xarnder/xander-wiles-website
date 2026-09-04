import * as THREE from 'three';
import {
	createBiomeWeights,
	createHeightSample,
	type BiomeWeights,
	type TerrainHeightSampler
} from './TerrainHeightSampler';
import type { TerrainDebugView } from './TerrainSettings';
import {
	writeBiomeDebugColor,
	writeCombinedDebugColor,
	writeForestDebugColor,
	writeScalarDebugColor,
	writeTerrainColor
} from './terrainColor';
import type { VegetationRegionSampler } from '../vegetation/VegetationRegionSampler';

/** "Elevation" debug view maps this world-height range onto the 0..1 grayscale ramp. */
const ELEVATION_DEBUG_MIN = -30;
const ELEVATION_DEBUG_MAX = 90;

/** Indices only depend on resolution, never on chunk position — cached and shared by every chunk of a given size. */
const sharedIndexCache = new Map<number, Uint32Array>();

function getSharedIndices(resolution: number): Uint32Array {
	let indices = sharedIndexCache.get(resolution);
	if (indices) return indices;

	const verticesPerSide = resolution + 1;
	indices = new Uint32Array(resolution * resolution * 6);
	let i = 0;
	for (let z = 0; z < resolution; z++) {
		for (let x = 0; x < resolution; x++) {
			const a = z * verticesPerSide + x;
			const b = a + 1;
			const c = a + verticesPerSide;
			const d = c + 1;
			indices[i++] = a;
			indices[i++] = c;
			indices[i++] = b;
			indices[i++] = b;
			indices[i++] = c;
			indices[i++] = d;
		}
	}
	sharedIndexCache.set(resolution, indices);
	return indices;
}

/** Single material shared by every chunk — toggling wireframe here affects all terrain at once. */
export const terrainMaterial = new THREE.MeshStandardMaterial({
	vertexColors: true,
	roughness: 0.95,
	metalness: 0,
	side: THREE.FrontSide
});

const borderMaterial = new THREE.LineBasicMaterial({ color: 0xff5533 });

/**
 * One square patch of terrain mesh. Geometry buffers are pre-sized for `resolution` and are
 * reused in place by populate() so a chunk can be recycled to a new (chunkX, chunkZ) without
 * allocating new typed arrays or a new BufferGeometry.
 */
export class TerrainChunk {
	readonly resolution: number;
	readonly mesh: THREE.Mesh;
	readonly borderLines: THREE.LineSegments;

	chunkX = 0;
	chunkZ = 0;
	/** The settings revision this chunk's geometry currently reflects. */
	revision = -1;

	private readonly geometry: THREE.BufferGeometry;
	private readonly positions: Float32Array;
	private readonly normals: Float32Array;
	private readonly colors: Float32Array;
	private readonly uvs: Float32Array;

	private coordSprite: THREE.Sprite | null = null;
	private coordCanvas: HTMLCanvasElement | null = null;
	private coordTexture: THREE.CanvasTexture | null = null;

	constructor(resolution: number) {
		this.resolution = resolution;
		const verticesPerSide = resolution + 1;
		const vertexCount = verticesPerSide * verticesPerSide;

		this.positions = new Float32Array(vertexCount * 3);
		this.normals = new Float32Array(vertexCount * 3);
		this.colors = new Float32Array(vertexCount * 3);
		this.uvs = new Float32Array(vertexCount * 2);

		this.geometry = new THREE.BufferGeometry();
		this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
		this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
		this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
		this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
		this.geometry.setIndex(new THREE.BufferAttribute(getSharedIndices(resolution), 1));

		this.mesh = new THREE.Mesh(this.geometry, terrainMaterial);

		const borderGeometry = new THREE.BufferGeometry();
		this.borderLines = new THREE.LineSegments(borderGeometry, borderMaterial);
		this.borderLines.visible = false;
	}

	/** Recomputes every vertex from absolute world coordinates. Never uses chunk-relative noise input. */
	populate(
		chunkX: number,
		chunkZ: number,
		chunkSize: number,
		sampler: TerrainHeightSampler,
		revision: number,
		debugView: TerrainDebugView = 'normal',
		vegetationRegionSampler: VegetationRegionSampler | null = null
	): void {
		this.chunkX = chunkX;
		this.chunkZ = chunkZ;
		this.revision = revision;

		const resolution = this.resolution;
		const verticesPerSide = resolution + 1;
		const originX = chunkX * chunkSize;
		const originZ = chunkZ * chunkSize;
		const step = chunkSize / resolution;
		const sample = createHeightSample();
		const needsBiomeWeights = debugView === 'biomeColors' || debugView === 'terrainPlusForest';
		const biomeWeights: BiomeWeights | null = needsBiomeWeights ? createBiomeWeights() : null;

		for (let zi = 0; zi < verticesPerSide; zi++) {
			const worldZ = originZ + zi * step;
			for (let xi = 0; xi < verticesPerSide; xi++) {
				const worldX = originX + xi * step;
				const vertexIndex = zi * verticesPerSide + xi;
				const p = vertexIndex * 3;

				sampler.sampleWithNormal(worldX, worldZ, sample);

				this.positions[p] = worldX;
				this.positions[p + 1] = sample.height;
				this.positions[p + 2] = worldZ;

				this.normals[p] = sample.normalX;
				this.normals[p + 1] = sample.normalY;
				this.normals[p + 2] = sample.normalZ;

				switch (debugView) {
					case 'biomeColors':
						sampler.sampleBiomeWeights(worldX, worldZ, biomeWeights as BiomeWeights);
						writeBiomeDebugColor(biomeWeights as BiomeWeights, this.colors, p);
						break;
					case 'biomeMask':
						writeScalarDebugColor(sampler.sampleBiomeMaskValue01(worldX, worldZ), this.colors, p);
						break;
					case 'elevation': {
						const normalized =
							(sample.height - ELEVATION_DEBUG_MIN) / (ELEVATION_DEBUG_MAX - ELEVATION_DEBUG_MIN);
						writeScalarDebugColor(normalized, this.colors, p);
						break;
					}
					case 'forestDensity': {
						const density = vegetationRegionSampler?.getForestDensity(worldX, worldZ) ?? 0;
						writeForestDebugColor(density, this.colors, p);
						break;
					}
					case 'terrainPlusForest': {
						sampler.sampleBiomeWeights(worldX, worldZ, biomeWeights as BiomeWeights);
						const density = vegetationRegionSampler?.getForestDensity(worldX, worldZ) ?? 0;
						writeCombinedDebugColor(biomeWeights as BiomeWeights, density, this.colors, p);
						break;
					}
					default:
						writeTerrainColor(sample.height, sample.normalY, this.colors, p);
				}

				const uvIndex = vertexIndex * 2;
				this.uvs[uvIndex] = worldX / 8;
				this.uvs[uvIndex + 1] = worldZ / 8;
			}
		}

		this.geometry.attributes.position.needsUpdate = true;
		this.geometry.attributes.normal.needsUpdate = true;
		this.geometry.attributes.color.needsUpdate = true;
		this.geometry.attributes.uv.needsUpdate = true;
		this.geometry.computeBoundingBox();
		this.geometry.computeBoundingSphere();

		this.updateBorderOutline(chunkSize);
	}

	private updateBorderOutline(chunkSize: number): void {
		const originX = this.chunkX * chunkSize;
		const originZ = this.chunkZ * chunkSize;
		const lift = 0.05;
		const verticesPerSide = this.resolution + 1;
		const outline = new Float32Array(verticesPerSide * 4 * 3);
		let i = 0;

		// Edge along +X (z = 0) and edge along +Z (x = 0), plus the far two edges, sampled
		// directly from the already-computed heightmap edges to stay exactly on the mesh surface.
		const edge = (fromX: number, fromZ: number, toX: number, toZ: number, count: number) => {
			for (let s = 0; s < count - 1; s++) {
				const t0 = s / (count - 1);
				const t1 = (s + 1) / (count - 1);
				const x0 = fromX + (toX - fromX) * t0;
				const z0 = fromZ + (toZ - fromZ) * t0;
				const x1 = fromX + (toX - fromX) * t1;
				const z1 = fromZ + (toZ - fromZ) * t1;
				const xi0 = Math.round(((x0 - originX) / chunkSize) * this.resolution);
				const zi0 = Math.round(((z0 - originZ) / chunkSize) * this.resolution);
				const xi1 = Math.round(((x1 - originX) / chunkSize) * this.resolution);
				const zi1 = Math.round(((z1 - originZ) / chunkSize) * this.resolution);
				const y0 = this.heightAt(xi0, zi0);
				const y1 = this.heightAt(xi1, zi1);
				outline[i++] = x0;
				outline[i++] = y0 + lift;
				outline[i++] = z0;
				outline[i++] = x1;
				outline[i++] = y1 + lift;
				outline[i++] = z1;
			}
		};

		edge(originX, originZ, originX + chunkSize, originZ, verticesPerSide);
		edge(originX, originZ + chunkSize, originX + chunkSize, originZ + chunkSize, verticesPerSide);
		edge(originX, originZ, originX, originZ + chunkSize, verticesPerSide);
		edge(originX + chunkSize, originZ, originX + chunkSize, originZ + chunkSize, verticesPerSide);

		this.borderLines.geometry.setAttribute('position', new THREE.BufferAttribute(outline, 3));
		this.borderLines.geometry.attributes.position.needsUpdate = true;
		this.borderLines.geometry.computeBoundingSphere();
	}

	private heightAt(xi: number, zi: number): number {
		const verticesPerSide = this.resolution + 1;
		const clampedX = Math.max(0, Math.min(verticesPerSide - 1, xi));
		const clampedZ = Math.max(0, Math.min(verticesPerSide - 1, zi));
		return this.positions[(clampedZ * verticesPerSide + clampedX) * 3 + 1];
	}

	setBorderVisible(visible: boolean): void {
		this.borderLines.visible = visible;
	}

	setActive(active: boolean): void {
		this.mesh.visible = active;
	}

	/** Lazily creates a small canvas-texture sprite showing "chunkX, chunkZ" above the chunk. */
	setCoordinateLabelVisible(visible: boolean, chunkSize: number): void {
		if (!visible) {
			if (this.coordSprite) this.coordSprite.visible = false;
			return;
		}
		const sprite = this.coordSprite ?? this.createCoordSprite();
		this.drawCoordLabel();
		const centerIndex = Math.round(this.resolution / 2);
		const centerHeight = this.heightAt(centerIndex, centerIndex);
		sprite.position.set(
			this.chunkX * chunkSize + chunkSize / 2,
			centerHeight + 4,
			this.chunkZ * chunkSize + chunkSize / 2
		);
		sprite.visible = true;
	}

	private createCoordSprite(): THREE.Sprite {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 64;
		const texture = new THREE.CanvasTexture(canvas);
		const spriteMaterial = new THREE.SpriteMaterial({
			map: texture,
			depthTest: false,
			transparent: true
		});
		const sprite = new THREE.Sprite(spriteMaterial);
		sprite.scale.set(12, 3, 1);
		this.coordCanvas = canvas;
		this.coordTexture = texture;
		this.coordSprite = sprite;
		this.mesh.add(sprite);
		return sprite;
	}

	private drawCoordLabel(): void {
		if (!this.coordCanvas || !this.coordTexture) return;
		const ctx = this.coordCanvas.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, this.coordCanvas.width, this.coordCanvas.height);
		ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
		ctx.fillRect(0, 0, this.coordCanvas.width, this.coordCanvas.height);
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 28px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(
			`${this.chunkX}, ${this.chunkZ}`,
			this.coordCanvas.width / 2,
			this.coordCanvas.height / 2
		);
		this.coordTexture.needsUpdate = true;
	}

	dispose(): void {
		this.geometry.dispose();
		this.borderLines.geometry.dispose();
		this.coordTexture?.dispose();
	}
}
