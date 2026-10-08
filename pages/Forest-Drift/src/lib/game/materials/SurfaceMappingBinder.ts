import * as THREE from 'three';
import { hashStringToUint32 } from '../terrain/seededRandom';
import type { SurfaceMappingMode } from './ProceduralMaterialTypes';
import { computeSurfaceMapping } from './surfaceMapping';

/** Per-material mapping request, stored on `material.userData` so any mesh using it can be mapped. */
export interface SurfaceMappingSpec {
	mode: SurfaceMappingMode;
	/** Write weathering vertex colours (the material must then use `vertexColors`). */
	weathering: boolean;
}

const SPEC_KEY = 'surfaceMapping';
/**
 * Faces are subdivided until no edge exceeds this (metres) so the per-vertex macro tint and ground
 * grime in `surfaceMapping.ts` have some resolution on big walls and roofs. Kept coarse: stone and
 * ground anti-tiling happens per pixel in `shader/surfaceShader.ts`, so this only carries
 * low-frequency colour and costs few extra triangles.
 */
const MAX_MAPPED_EDGE = 3;
/** Upper bound on segments per edge, so a degenerate giant face can't explode the vertex count. */
const MAX_SEGMENTS = 40;
const GEOMETRY_KEY = 'surfaceMappingApplied';

interface AppliedRecord {
	signature: string;
	/** The material (or array) last confirmed against `signature` — lets the per-draw check skip rebuilding the signature string. */
	materialRef: THREE.Material | THREE.Material[];
	positionAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
	positionVersion: number;
}

export interface SurfaceMappingBinderOptions {
	/**
	 * World-space origin of a foundation's local frame. Mapping in foundation-local space means the
	 * pattern is continuous across every mesh of one building (walls, frame, roof, paving) and stays
	 * attached to the building rather than to world coordinates. `null` → map in world space.
	 */
	getFoundationOrigin: (foundationId: string) => THREE.Vector3 | null;
	/** World seed — combined with each foundation id for per-building variation. */
	getWorldSeed: () => string;
}

/** Stops the binder mapping meshes of this material (it now keeps its own UVs). */
export function clearSurfaceMappingSpec(material: THREE.Material): void {
	delete material.userData[SPEC_KEY];
}

export function getSurfaceMappingSpec(material: THREE.Material): SurfaceMappingSpec | undefined {
	return material.userData[SPEC_KEY] as SurfaceMappingSpec | undefined;
}

/**
 * Gives procedural-material meshes real-world UVs and weathering colours WITHOUT any procedural
 * builder having to know about textures.
 *
 * `watch(material, spec)` hooks `material.onBeforeRender` — a cheap check per draw call — and
 * queues any geometry that hasn't been mapped for that spec (or whose positions changed since).
 * `flush()` (called once per frame, before rendering) maps the queue: positions are transformed into
 * the owning foundation's local frame, de-indexed if necessary (a planar projection needs per-face
 * vertices), and given `uv` + `color` attributes from `computeSurfaceMapping`. Mutating geometry
 * happens between frames, never mid-render, so the renderer never sees a half-updated buffer.
 *
 * A newly built mesh therefore renders exactly one frame before its UVs exist; materials set
 * `defaultAttributeValues.color` to white so that frame is untextured-looking, not black.
 */
export class SurfaceMappingBinder {
	private readonly options: SurfaceMappingBinderOptions;
	private readonly queue = new Map<THREE.BufferGeometry, THREE.Mesh>();
	private readonly watched = new Set<THREE.Material>();
	private readonly tempMatrix = new THREE.Matrix4();
	private readonly tempVector = new THREE.Vector3();
	private mappedGeometryCount = 0;
	/** Bumped by `invalidateAll` — part of every signature, so all geometry re-maps lazily. */
	private generation = 0;

	constructor(options: SurfaceMappingBinderOptions) {
		this.options = options;
	}

	watch(material: THREE.Material, spec: SurfaceMappingSpec): void {
		material.userData[SPEC_KEY] = spec;
		if (this.watched.has(material)) return;
		this.watched.add(material);
		const previous = material.onBeforeRender;
		material.onBeforeRender = (renderer, scene, camera, geometry, object, group) => {
			previous.call(material, renderer, scene, camera, geometry, object, group);
			if (!(object as THREE.Mesh).isMesh || this.isCurrent(geometry, object as THREE.Mesh)) return;
			this.queue.set(geometry, object as THREE.Mesh);
		};
		material.addEventListener('dispose', () => this.watched.delete(material));
	}

	/** Maps every queued geometry. Returns how many were mapped (for stats/tests). */
	flush(): number {
		if (this.queue.size === 0) return 0;
		let count = 0;
		for (const [geometry, mesh] of this.queue) {
			if (this.isCurrent(geometry, mesh)) continue;
			this.mapGeometry(geometry, mesh);
			count++;
		}
		this.queue.clear();
		this.mappedGeometryCount += count;
		return count;
	}

	/** Maps every mesh under `root` that uses a watched material, immediately (gallery, tests). */
	mapNow(root: THREE.Object3D): void {
		root.updateWorldMatrix(true, true);
		root.traverse((object) => {
			const mesh = object as THREE.Mesh;
			if (!mesh.isMesh || this.isCurrent(mesh.geometry, mesh)) return;
			if (this.signatureFor(mesh) === '') return;
			this.mapGeometry(mesh.geometry, mesh);
		});
	}

	/** Forces every watched geometry to be re-mapped on its next render (world seed changed). */
	invalidateAll(): void {
		this.generation++;
	}

	getMappedGeometryCount(): number {
		return this.mappedGeometryCount;
	}

	dispose(): void {
		this.queue.clear();
		this.watched.clear();
	}

	/** The mapping modes this mesh's material(s) want, per draw group — '' when none are procedural. */
	private signatureFor(mesh: THREE.Mesh): string {
		const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		const parts: string[] = [];
		let any = false;
		for (const material of materials) {
			const spec = material ? getSurfaceMappingSpec(material) : undefined;
			if (spec) any = true;
			parts.push(spec ? `${spec.mode}${spec.weathering ? '+w' : ''}` : '-');
		}
		return any ? `${this.generation}:${parts.join(',')}` : '';
	}

	private isCurrent(geometry: THREE.BufferGeometry, mesh: THREE.Mesh): boolean {
		const record = geometry.userData[GEOMETRY_KEY] as AppliedRecord | undefined;
		if (!record) return false;
		const position = geometry.getAttribute('position');
		if (
			record.positionAttribute !== position ||
			record.positionVersion !== (position as THREE.BufferAttribute).version
		) {
			return false;
		}
		if (
			record.materialRef === mesh.material &&
			record.signature.startsWith(`${this.generation}:`)
		) {
			return true;
		}
		// Material swapped (paint preview, procedural toggle) — only re-map if the mapping changed.
		if (record.signature !== this.signatureFor(mesh)) return false;
		record.materialRef = mesh.material;
		return true;
	}

	private findFoundationId(object: THREE.Object3D): string | null {
		let current: THREE.Object3D | null = object;
		while (current) {
			const id = current.userData.foundationId;
			if (typeof id === 'string') return id;
			current = current.parent;
		}
		return null;
	}

	private mapGeometry(geometry: THREE.BufferGeometry, mesh: THREE.Mesh): void {
		const signature = this.signatureFor(mesh);
		if (signature === '') return;
		if (geometry.index) deindexInPlace(geometry);
		subdivideLargeTriangles(geometry, MAX_MAPPED_EDGE);
		const position = geometry.getAttribute('position');
		const vertexCount = position.count;
		if (vertexCount < 3) return;

		mesh.updateWorldMatrix(true, false);
		const foundationId = this.findFoundationId(mesh);
		const origin = foundationId ? this.options.getFoundationOrigin(foundationId) : null;
		this.tempMatrix.copy(mesh.matrixWorld);
		const anchored = new Float32Array(vertexCount * 3);
		for (let i = 0; i < vertexCount; i++) {
			this.tempVector.fromBufferAttribute(position, i).applyMatrix4(this.tempMatrix);
			if (origin) this.tempVector.sub(origin);
			anchored[i * 3] = this.tempVector.x;
			anchored[i * 3 + 1] = this.tempVector.y;
			anchored[i * 3 + 2] = this.tempVector.z;
		}

		const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		const specForMaterialIndex = (index: number) =>
			(materials[index] && getSurfaceMappingSpec(materials[index])) || undefined;
		const triangleSpec: (SurfaceMappingSpec | undefined)[] = new Array(Math.floor(vertexCount / 3));
		if (Array.isArray(mesh.material) && geometry.groups.length > 0) {
			for (const group of geometry.groups) {
				const spec = specForMaterialIndex(group.materialIndex ?? 0);
				const end = Math.min(vertexCount, group.start + group.count);
				for (let v = group.start; v < end; v += 3) triangleSpec[v / 3] = spec;
			}
		} else {
			triangleSpec.fill(specForMaterialIndex(0));
		}

		const seedText = `${this.options.getWorldSeed()}::${foundationId ?? 'world'}`;
		const result = computeSurfaceMapping({
			positions: anchored,
			modeForTriangle: (tri) => triangleSpec[tri]?.mode ?? 'planar',
			seed: hashStringToUint32(seedText),
			weathering: triangleSpec.some((spec) => spec?.weathering)
		});
		geometry.setAttribute('uv', new THREE.BufferAttribute(result.uv, 2));
		geometry.setAttribute('color', new THREE.BufferAttribute(result.color, 3));
		geometry.userData[GEOMETRY_KEY] = {
			signature,
			materialRef: mesh.material,
			positionAttribute: geometry.getAttribute('position'),
			positionVersion: (geometry.getAttribute('position') as THREE.BufferAttribute).version
		} satisfies AppliedRecord;
	}
}

/**
 * Uniformly subdivides every non-indexed triangle whose longest edge exceeds `maxEdge` into an
 * n × n barycentric grid (n = ⌈longest / maxEdge⌉), interpolating every attribute. The two triangles
 * of a rectangular face share their longest edge (the diagonal), so they pick the same n and the
 * subdivided face stays crack-free. Draw groups are re-based onto the new vertex ranges. In place.
 */
export function subdivideLargeTriangles(geometry: THREE.BufferGeometry, maxEdge: number): void {
	const position = geometry.getAttribute('position');
	const vertexCount = position.count;
	const triangleCount = Math.floor(vertexCount / 3);
	const segments = new Uint16Array(triangleCount);
	let outputVertices = 0;
	let any = false;
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();
	for (let tri = 0; tri < triangleCount; tri++) {
		a.fromBufferAttribute(position, tri * 3);
		b.fromBufferAttribute(position, tri * 3 + 1);
		c.fromBufferAttribute(position, tri * 3 + 2);
		const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
		const n = Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(longest / maxEdge)));
		segments[tri] = n;
		if (n > 1) any = true;
		outputVertices += n * n * 3;
	}
	if (!any) return;

	// Vertex start of each input triangle in the output, for re-basing groups.
	const outputStart = new Uint32Array(triangleCount + 1);
	for (let tri = 0; tri < triangleCount; tri++) {
		outputStart[tri + 1] = outputStart[tri] + segments[tri] * segments[tri] * 3;
	}

	for (const name of Object.keys(geometry.attributes)) {
		const attribute = geometry.getAttribute(name);
		const itemSize = attribute.itemSize;
		const out = new Float32Array(outputVertices * itemSize);
		let w = 0;
		const emit = (tri: number, i: number, j: number, n: number) => {
			// Barycentric point (i, j) on the n-grid of triangle `tri`.
			const wb = i / n;
			const wc = j / n;
			const wa = 1 - wb - wc;
			for (let k = 0; k < itemSize; k++) {
				out[w++] =
					attribute.getComponent(tri * 3, k) * wa +
					attribute.getComponent(tri * 3 + 1, k) * wb +
					attribute.getComponent(tri * 3 + 2, k) * wc;
			}
		};
		for (let tri = 0; tri < triangleCount; tri++) {
			const n = segments[tri];
			for (let i = 0; i < n; i++) {
				for (let j = 0; j < n - i; j++) {
					emit(tri, i, j, n);
					emit(tri, i + 1, j, n);
					emit(tri, i, j + 1, n);
					if (j < n - i - 1) {
						emit(tri, i + 1, j, n);
						emit(tri, i + 1, j + 1, n);
						emit(tri, i, j + 1, n);
					}
				}
			}
		}
		geometry.setAttribute(name, new THREE.BufferAttribute(out, itemSize, attribute.normalized));
	}

	for (const group of geometry.groups) {
		const firstTri = Math.floor(group.start / 3);
		const lastTri = Math.min(triangleCount, Math.floor((group.start + group.count) / 3));
		group.start = outputStart[firstTri];
		group.count = outputStart[lastTri] - outputStart[firstTri];
	}
	geometry.setDrawRange(0, Infinity);
}

/**
 * Expands an indexed geometry into per-triangle vertices, in place (the mesh keeps the same
 * geometry object, which managers hold references to for disposal and picking). Draw groups stay
 * valid: they index into the index buffer, and the expanded vertices keep the index order.
 */
export function deindexInPlace(geometry: THREE.BufferGeometry): void {
	const index = geometry.index;
	if (!index) return;
	for (const name of Object.keys(geometry.attributes)) {
		const attribute = geometry.getAttribute(name);
		const itemSize = attribute.itemSize;
		const ArrayType = (attribute.array as Float32Array).constructor as Float32ArrayConstructor;
		const array = new ArrayType(index.count * itemSize);
		for (let i = 0; i < index.count; i++) {
			const source = index.getX(i);
			for (let k = 0; k < itemSize; k++) {
				array[i * itemSize + k] = attribute.getComponent(source, k);
			}
		}
		geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize, attribute.normalized));
	}
	geometry.setIndex(null);
}
