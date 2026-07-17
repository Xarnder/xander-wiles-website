import {
	BufferAttribute,
	BufferGeometry,
	Color,
	Group,
	Mesh,
	MeshStandardMaterial,
	Raycaster,
	Vector3
} from 'three';
import { GAME_CONFIG } from '../config/gameConfig';
import type { QualityLevel } from '../types';
import { hashNoise2D, smoothstep } from '../utils/math';

const _raycaster = new Raycaster();

export class Terrain extends Group {
	readonly mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
	private readonly worldSize = GAME_CONFIG.world.size;

	constructor(quality: QualityLevel) {
		super();
		this.name = 'Terrain';
		const segments =
			quality === 'low'
				? GAME_CONFIG.world.segmentsLow
				: quality === 'medium'
					? GAME_CONFIG.world.segmentsMedium
					: GAME_CONFIG.world.segmentsHigh;
		const geometry = this.createGeometry(segments);
		const material = new MeshStandardMaterial({
			vertexColors: true,
			roughness: 0.96,
			metalness: 0.02,
			flatShading: quality === 'low'
		});
		this.mesh = new Mesh(geometry, material);
		this.mesh.receiveShadow = quality !== 'low';
		this.mesh.name = 'DesertTerrain';
		this.add(this.mesh);
	}

	terrainHeightAt(x: number, z: number): number {
		const centerX = GAME_CONFIG.world.installationCenterX;
		const centerZ = GAME_CONFIG.world.installationCenterZ;
		const distance = Math.hypot(x - centerX, z - centerZ);
		const flatten = smoothstep(
			GAME_CONFIG.world.installationRadius,
			GAME_CONFIG.world.installationRadius * 1.85,
			distance
		);
		const broad =
			Math.sin(x * 0.0011 + 0.7) * 62 +
			Math.sin(z * 0.00145 - 1.2) * 48 +
			Math.sin((x + z) * 0.00062) * 84;
		const ridges = Math.pow(Math.abs(Math.sin(x * 0.00185) * Math.cos(z * 0.0014)), 2.2) * 330;
		const detail =
			hashNoise2D(Math.floor(x / 180), Math.floor(z / 180)) * 34 +
			hashNoise2D(Math.floor(x / 75), Math.floor(z / 75)) * 12;
		const edgeMountains = smoothstep(2100, 5600, Math.hypot(x, z + 1800)) * ridges;
		const natural = Math.max(-18, broad + detail + edgeMountains);
		return GAME_CONFIG.world.baseElevation * (1 - flatten) + natural * flatten;
	}

	hasLineOfSight(from: Vector3, to: Vector3, clearance = 4): boolean {
		const distance = from.distanceTo(to);
		const steps = Math.max(4, Math.ceil(distance / 90));
		for (let index = 1; index < steps; index += 1) {
			const alpha = index / steps;
			const x = from.x + (to.x - from.x) * alpha;
			const y = from.y + (to.y - from.y) * alpha;
			const z = from.z + (to.z - from.z) * alpha;
			if (this.terrainHeightAt(x, z) + clearance > y) return false;
		}
		return true;
	}

	raycastTerrain(origin: Vector3, direction: Vector3, maxDistance = 10000): Vector3 | null {
		_raycaster.set(origin, direction);
		_raycaster.far = maxDistance;
		const hit = _raycaster.intersectObject(this.mesh, false)[0];
		if (hit) return hit.point.clone();
		return null;
	}

	private createGeometry(segments: number): BufferGeometry {
		const side = segments + 1;
		const vertexCount = side * side;
		const positions = new Float32Array(vertexCount * 3);
		const colors = new Float32Array(vertexCount * 3);
		const indexCount = segments * segments * 6;
		const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
		const color = new Color();
		let vertex = 0;
		for (let zIndex = 0; zIndex <= segments; zIndex += 1) {
			const z = (zIndex / segments - 0.5) * this.worldSize;
			for (let xIndex = 0; xIndex <= segments; xIndex += 1) {
				const x = (xIndex / segments - 0.5) * this.worldSize;
				const y = this.terrainHeightAt(x, z);
				positions[vertex * 3] = x;
				positions[vertex * 3 + 1] = y;
				positions[vertex * 3 + 2] = z;
				const heightMix = smoothstep(-30, 310, y);
				color.setRGB(0.52 + heightMix * 0.12, 0.32 + heightMix * 0.1, 0.15 + heightMix * 0.09);
				const variation = hashNoise2D(xIndex, zIndex) * 0.035;
				colors[vertex * 3] = color.r + variation;
				colors[vertex * 3 + 1] = color.g + variation;
				colors[vertex * 3 + 2] = color.b + variation * 0.5;
				vertex += 1;
			}
		}
		let offset = 0;
		for (let zIndex = 0; zIndex < segments; zIndex += 1) {
			for (let xIndex = 0; xIndex < segments; xIndex += 1) {
				const topLeft = zIndex * side + xIndex;
				const topRight = topLeft + 1;
				const bottomLeft = topLeft + side;
				const bottomRight = bottomLeft + 1;
				indices[offset] = topLeft;
				indices[offset + 1] = bottomLeft;
				indices[offset + 2] = topRight;
				indices[offset + 3] = topRight;
				indices[offset + 4] = bottomLeft;
				indices[offset + 5] = bottomRight;
				offset += 6;
			}
		}
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new BufferAttribute(positions, 3));
		geometry.setAttribute('color', new BufferAttribute(colors, 3));
		geometry.setIndex(new BufferAttribute(indices, 1));
		geometry.computeVertexNormals();
		geometry.computeBoundingSphere();
		return geometry;
	}
}
