import * as THREE from 'three';
import type { SurfaceStyle } from '../materials/ProceduralMaterialTypes';
import type { WorldObb } from '../miniBuild/miniBuildGrid';
import { compileBarrierLevel, type CompiledBarrierLevel } from './BarrierGeometryCompiler';
import {
	barrierMemberCount,
	barrierSegmentCount,
	layoutBarrier,
	type BarrierLayout
} from './barrierLayout';
import { styleHasFineDetail, type BarrierLod } from './barrierProfiles';
import {
	BARRIER_WOODS,
	barrierMainColor,
	cloneBarrierStyle,
	sanitizeBarrierStyle,
	type BarrierDefinition,
	type BarrierStyleDefinition,
	type BarrierWoodId
} from './BarrierTypes';
import type { BuildingMaterialManager } from './BuildingMaterialManager';
import { foundationLocalFrame } from './FoundationLocalMath';
import type { FoundationDefinition } from './FoundationTypes';
import { colorMaterialFromHex, type BuildingMaterialDefinition } from './MaterialTypes';
import type { WallCollisionRect } from './wallCollision';

/** LOD switch distances (metres, before `setLodScale`): full detail → simplified → silhouette. */
export const BARRIER_LOD_DISTANCES: readonly [number, number, number] = [0, 22, 60];

export interface BarrierManagerOptions {
	materialManager: BuildingMaterialManager;
	getFoundation: (id: string) => FoundationDefinition | undefined;
	getVertexSpacing: () => number;
	/** Highest walkable surface at (x, z) not above `referenceY` — `WorldSurfaceSampler`. */
	sampleSurface?: (worldX: number, worldZ: number, referenceY: number) => number;
	/** Bare terrain height — the reference a terrain fence samples from. */
	sampleTerrain?: (worldX: number, worldZ: number) => number;
	/** One storey (metres): how far above its own floor a building railing looks for stair treads. */
	getStoreyHeight?: () => number;
	/** Ids for the second half of a split path (defaults to `crypto.randomUUID`). */
	createId?: () => string;
}

export interface BarrierPick {
	barrierId: string;
	segmentIndex: number;
	distance: number;
}

export interface BarrierRenderStats {
	barriers: number;
	/** Object3Ds the barrier system owns in the scene graph (LOD roots, level groups, meshes). */
	objects: number;
	meshes: number;
	/** Meshes in the LOD-0 level of every barrier — the draw calls when everything is near. */
	nearDrawCalls: number;
	members: number;
	posts: number;
	balusters: number;
	rails: number;
	vertices: number;
	triangles: number;
	/** LOD-0 / LOD-2 triangle totals. */
	trianglesByLod: [number, number, number];
	bytes: number;
	lastBuildMs: number;
	totalBuildMs: number;
}

interface BarrierEntry {
	definition: BarrierDefinition;
	style: BarrierStyleDefinition;
	root: THREE.LOD;
	levels: CompiledBarrierLevel[];
	pickMesh: THREE.Mesh | null;
	rects: WallCollisionRect[];
	/** Barrier space → world offset (the foundation's local origin, or 0 for a terrain fence). */
	frame: { x: number; y: number; z: number };
	layout: BarrierLayout;
	members: number;
	buildMs: number;
}

export interface BarrierRenderObject {
	root: THREE.LOD;
	levels: CompiledBarrierLevel[];
	/** The LOD-0 main-wood mesh — the one Remove / Paint raycast. */
	pickMesh: THREE.Mesh | null;
}

/**
 * Laid-out members → one `THREE.LOD` with three levels of one (or two, with an accent wood) merged
 * mesh each. Shared by placed barriers and stair railings so both look identical. The caller places
 * `root` (its matrix is left for them) and disposes `levels` when done.
 */
export function buildBarrierRenderObject(
	layout: BarrierLayout,
	style: BarrierStyleDefinition,
	options: {
		origin: { x: number; y: number; z: number };
		seed: number;
		main: THREE.Material;
		accent: THREE.Material;
		lodScale: number;
		name: string;
		userData?: Record<string, unknown>;
	}
): BarrierRenderObject {
	const compile = (lod: BarrierLod) =>
		compileBarrierLevel(layout, style, { lod, origin: options.origin, seed: options.seed });
	const level0 = compile(0);
	const fine = styleHasFineDetail({
		postProfiles: [style.endPost.profile, style.structuralPost.profile],
		caps: layout.posts.map((p) => p.cap),
		baluster: style.baluster.style,
		railProfile: style.topRail.profile
	});
	const levels = [level0, fine ? compile(1) : level0, compile(2)];
	// Static, upload-once geometry: drop the CPU copies once the GPU has them. The LOD-0 main
	// mesh keeps what Remove / Paint raycasts read (positions, normals, indices).
	const seen = new Set<THREE.BufferGeometry>();
	levels.forEach((level, index) => {
		for (const geometry of [level.main, level.accent]) {
			if (!geometry || seen.has(geometry)) continue;
			seen.add(geometry);
			releaseAfterUpload(geometry, index === 0 && geometry === level.main);
		}
	});

	const root = new THREE.LOD();
	root.name = options.name;
	Object.assign(root.userData, options.userData);
	let pickMesh: THREE.Mesh | null = null;
	levels.forEach((level, index) => {
		const holder = new THREE.Group();
		holder.name = `barrier-lod${index}`;
		for (const [slot, geometry, material] of [
			['main', level.main, options.main],
			['accent', level.accent, options.accent]
		] as const) {
			if (!geometry) continue;
			const mesh = new THREE.Mesh(geometry, material);
			mesh.name = `barrier-${slot}`;
			Object.assign(mesh.userData, options.userData);
			mesh.userData.barrierSlot = slot;
			mesh.receiveShadow = true;
			// Near levels cast shadows; the far silhouette doesn't (thin members are sub-pixel there).
			mesh.castShadow = index < 2;
			mesh.matrixAutoUpdate = false;
			holder.add(mesh);
			if (index === 0 && slot === 'main') pickMesh = mesh;
		}
		holder.matrixAutoUpdate = false;
		root.addLevel(holder, BARRIER_LOD_DISTANCES[index] * options.lodScale);
	});
	return { root, levels, pickMesh };
}

/** Disposes every geometry of a render object (shared LOD levels once) and detaches it. */
export function disposeBarrierRenderObject(
	object: Pick<BarrierRenderObject, 'root' | 'levels'>
): void {
	object.root.removeFromParent();
	const disposed = new Set<THREE.BufferGeometry>();
	for (const level of object.levels) {
		for (const geometry of [level.main, level.accent]) {
			if (geometry && !disposed.has(geometry)) {
				geometry.dispose();
				disposed.add(geometry);
			}
		}
	}
}

/** Main and accent wood materials for a style (`color` = paint, or the wood's own colour). */
export function barrierWoodMaterials(
	materialManager: BuildingMaterialManager,
	style: BarrierStyleDefinition,
	color: string = BARRIER_WOODS[style.wood].color
): { main: THREE.Material; accent: THREE.Material } {
	const accentWood = style.accentWood ?? style.wood;
	return {
		main: materialManager.getStyledMaterial(
			'barrier',
			colorMaterialFromHex(color),
			barrierWoodStyle(style.wood),
			{ ownWoodCoords: true }
		),
		accent: materialManager.getStyledMaterial(
			'barrier',
			colorMaterialFromHex(BARRIER_WOODS[accentWood].color),
			barrierWoodStyle(accentWood),
			{ ownWoodCoords: true }
		)
	};
}

/** The procedural wood a barrier wood id stands for (solid wood with geometry-supplied grain). */
export function barrierWoodStyle(wood: BarrierWoodId): SurfaceStyle {
	return { type: 'timber', options: { variant: BARRIER_WOODS[wood].variant }, mapping: 'wood' };
}

/**
 * Frees an attribute's JavaScript array after its first GPU upload (three.js calls `onUpload`
 * then). Positions, normals and the index stay when the geometry is still needed for raycasting.
 */
/** What `Mesh.raycast` reads: positions, plus the normal / UVs it interpolates at every hit. */
const RAYCAST_ATTRIBUTES = new Set(['position', 'normal', 'uv', 'uv1']);

export function releaseAfterUpload(geometry: THREE.BufferGeometry, keepForPicking: boolean): void {
	for (const [name, attribute] of Object.entries(geometry.attributes)) {
		if (keepForPicking && RAYCAST_ATTRIBUTES.has(name)) continue;
		(attribute as THREE.BufferAttribute).onUpload(function (this: THREE.BufferAttribute) {
			(this as { array: unknown }).array = null;
		});
	}
	if (!keepForPicking && geometry.index) {
		geometry.index.onUpload(function (this: THREE.BufferAttribute) {
			(this as { array: unknown }).array = null;
		});
	}
}

function hashSeed(id: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
	return h >>> 0;
}

/**
 * Every placed fence and railing. A barrier's authoritative state is its `BarrierDefinition` (path
 * + style); this manager derives everything else from it in one rebuild — layout, merged LOD
 * geometry, collision rects — and caches the result. Placed barriers are static: nothing here runs
 * per frame (the LOD switch is three.js's own render-time culling), and editing a barrier (paint,
 * restyle, removing a segment) changes the definition and rebuilds, never patches meshes.
 *
 * Runtime cost per barrier: one `THREE.LOD` with three levels of one (or two, with an accent wood)
 * merged mesh each — a 100-baluster balustrade is 1–2 draw calls, not 110 objects.
 */
export class BarrierManager {
	readonly group = new THREE.Group();

	private readonly options: BarrierManagerOptions;
	private readonly entries = new Map<string, BarrierEntry>();
	/** Definitions whose foundation isn't loaded (kept so a save round-trips untouched). */
	private readonly orphans = new Map<string, BarrierDefinition>();
	private readonly order: string[] = [];
	private revision = 0;
	private lodScale = 1;
	private castShadows = true;
	private collisionCache: WallCollisionRect[] | null = null;
	private lastBuildMs = 0;
	private totalBuildMs = 0;

	constructor(options: BarrierManagerOptions) {
		this.options = options;
		this.group.name = 'barriers';
	}

	getRevision(): number {
		return this.revision;
	}

	get(id: string): BarrierDefinition | undefined {
		return this.entries.get(id)?.definition ?? this.orphans.get(id);
	}

	getAll(): BarrierDefinition[] {
		return this.order.map((id) => this.get(id)).filter((d): d is BarrierDefinition => !!d);
	}

	/** Adds (or replaces) a barrier and builds it. Returns false if it could not be built. */
	add(definition: BarrierDefinition): boolean {
		const stored = structuredClone(definition);
		if (this.entries.has(stored.id) || this.orphans.has(stored.id)) this.removeInternal(stored.id);
		this.order.push(stored.id);
		const built = this.build(stored);
		this.revision++;
		this.collisionCache = null;
		return built;
	}

	remove(id: string): boolean {
		if (!this.removeInternal(id)) return false;
		this.revision++;
		this.collisionCache = null;
		return true;
	}

	/**
	 * Removes one segment of a path. An open path splits into the parts either side (a part of a
	 * single point disappears); a closed loop opens up at the removed segment. The exposed vertices
	 * become open ends, so they rebuild with proper end posts. Returns the ids that remain.
	 */
	removeSegment(id: string, segmentIndex: number): string[] {
		const definition = this.get(id);
		if (!definition) return [];
		const n = definition.points.length;
		const segments = barrierSegmentCount(n, definition.closed);
		if (segmentIndex < 0 || segmentIndex >= segments) return [id];
		if (segments <= 1) {
			this.remove(id);
			return [];
		}
		const parts: BarrierDefinition['points'][] = [];
		if (definition.closed) {
			const start = (segmentIndex + 1) % n;
			parts.push(Array.from({ length: n }, (_, i) => definition.points[(start + i) % n]));
		} else {
			parts.push(definition.points.slice(0, segmentIndex + 1));
			parts.push(definition.points.slice(segmentIndex + 1));
		}
		const kept = parts.filter((points) => points.length >= 2);
		const index = this.order.indexOf(id);
		this.removeInternal(id);
		const ids: string[] = [];
		kept.forEach((points, i) => {
			const next: BarrierDefinition = {
				...structuredClone(definition),
				id: i === 0 ? id : (this.options.createId?.() ?? crypto.randomUUID()),
				points: structuredClone(points),
				closed: false
			};
			this.order.splice(index + i, 0, next.id);
			this.build(next);
			ids.push(next.id);
		});
		this.revision++;
		this.collisionCache = null;
		return ids;
	}

	removeForFoundation(foundationId: string): void {
		const ids = this.getAll()
			.filter((definition) => definition.foundationId === foundationId)
			.map((definition) => definition.id);
		if (ids.length === 0) return;
		for (const id of ids) this.removeInternal(id);
		this.revision++;
		this.collisionCache = null;
	}

	/** Paint: recolours the whole barrier (`undefined` = back to its wood's own colour). */
	setMaterial(id: string, material: BuildingMaterialDefinition | undefined): boolean {
		const definition = this.get(id);
		if (!definition) return false;
		definition.material = material ? structuredClone(material) : undefined;
		return this.rebuild(id);
	}

	/** Applies a new style (and optionally a new type) to an existing barrier, keeping its path. */
	restyle(id: string, style: BarrierStyleDefinition, type?: BarrierDefinition['type']): boolean {
		const definition = this.get(id);
		if (!definition) return false;
		definition.style = cloneBarrierStyle(style);
		if (type) definition.type = type;
		definition.material = undefined;
		return this.rebuild(id);
	}

	serialize(): BarrierDefinition[] {
		return structuredClone(this.getAll());
	}

	load(definitions: readonly BarrierDefinition[]): void {
		for (const id of [...this.order]) this.removeInternal(id);
		for (const definition of definitions) {
			const stored = structuredClone(definition);
			this.order.push(stored.id);
			this.build(stored);
		}
		this.revision++;
		this.collisionCache = null;
	}

	/** Rebuilds everything (terrain regenerated, a foundation appeared under a fence, …). */
	rebuildAll(): void {
		for (const id of [...this.order]) this.rebuild(id);
	}

	/** Rebuilds only terrain fences (their bases come from the ground). */
	rebuildTerrainBarriers(): void {
		for (const definition of this.getAll()) {
			if (definition.foundationId === null && definition.baseMode === 'follow-surface')
				this.rebuild(definition.id);
		}
	}

	/** Collision: one thin box per path segment, never per baluster. Cached until something changes. */
	getCollisionRects(): WallCollisionRect[] {
		if (!this.collisionCache) {
			this.collisionCache = [];
			for (const id of this.order) {
				const entry = this.entries.get(id);
				if (entry) this.collisionCache.push(...entry.rects);
			}
		}
		return this.collisionCache;
	}

	getMeshes(): THREE.Mesh[] {
		const meshes: THREE.Mesh[] = [];
		for (const entry of this.entries.values()) if (entry.pickMesh) meshes.push(entry.pickMesh);
		return meshes;
	}

	/** Remove / Paint / restyle targeting: the nearest barrier hit, resolved to its path segment. */
	pick(raycaster: THREE.Raycaster): BarrierPick | null {
		let best: BarrierPick | null = null;
		const hits: THREE.Intersection[] = [];
		for (const entry of this.entries.values()) {
			if (!entry.pickMesh) continue;
			hits.length = 0;
			entry.pickMesh.raycast(raycaster, hits);
			for (const hit of hits) {
				if (hit.distance < raycaster.near || hit.distance > raycaster.far) continue;
				if (best && hit.distance >= best.distance) continue;
				best = {
					barrierId: entry.definition.id,
					segmentIndex: this.segmentNear(entry, hit.point),
					distance: hit.distance
				};
			}
		}
		return best;
	}

	/** One segment's oriented world box (for highlighting), in the `fitBoundsHighlight` shape. */
	getSegmentObb(id: string, segmentIndex: number): WorldObb | null {
		const entry = this.entries.get(id);
		const segment = entry?.layout.segments[segmentIndex];
		if (!entry || !segment) return null;
		const dx = segment.bx - segment.ax;
		const dz = segment.bz - segment.az;
		const length = Math.hypot(dx, dz) || 1;
		return {
			centerX: entry.frame.x + (segment.ax + segment.bx) / 2,
			centerZ: entry.frame.z + (segment.az + segment.bz) / 2,
			halfX: length / 2 + segment.halfThickness,
			halfZ: segment.halfThickness,
			cos: dx / length,
			sin: -dz / length,
			minY: entry.frame.y + segment.minY,
			maxY: entry.frame.y + segment.maxY
		};
	}

	/** The whole barrier's axis-aligned world box, as a `WorldObb`. */
	getWorldObb(id: string): WorldObb | null {
		const box = new THREE.Box3();
		if (!this.getWorldBox(id, box)) return null;
		return {
			centerX: (box.min.x + box.max.x) / 2,
			centerZ: (box.min.z + box.max.z) / 2,
			halfX: (box.max.x - box.min.x) / 2,
			halfZ: (box.max.z - box.min.z) / 2,
			cos: 1,
			sin: 0,
			minY: box.min.y,
			maxY: box.max.y
		};
	}

	/** World-space bounds of one segment (for highlighting). */
	getSegmentBox(id: string, segmentIndex: number, target: THREE.Box3): boolean {
		const entry = this.entries.get(id);
		const segment = entry?.layout.segments[segmentIndex];
		if (!entry || !segment) return false;
		const f = entry.frame;
		const pad = segment.halfThickness;
		target.min.set(
			Math.min(segment.ax, segment.bx) + f.x - pad,
			segment.minY + f.y,
			Math.min(segment.az, segment.bz) + f.z - pad
		);
		target.max.set(
			Math.max(segment.ax, segment.bx) + f.x + pad,
			segment.maxY + f.y,
			Math.max(segment.az, segment.bz) + f.z + pad
		);
		return true;
	}

	getWorldBox(id: string, target: THREE.Box3): boolean {
		const entry = this.entries.get(id);
		if (!entry || entry.layout.segments.length === 0) return false;
		const box = new THREE.Box3();
		target.makeEmpty();
		for (let i = 0; i < entry.layout.segments.length; i++) {
			if (this.getSegmentBox(id, i, box)) target.union(box);
		}
		return true;
	}

	/** Paint preview: show `material` on the barrier's main wood without changing it. */
	previewMaterial(id: string, material: BuildingMaterialDefinition | undefined): () => void {
		const entry = this.entries.get(id);
		if (!entry) return () => {};
		const preview = this.mainMaterial({ ...entry.definition, material });
		const restore: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
		entry.root.traverse((child) => {
			if (child instanceof THREE.Mesh && child.userData.barrierSlot === 'main') {
				restore.push([child, child.material]);
				child.material = preview;
			}
		});
		return () => {
			for (const [mesh, original] of restore) mesh.material = original;
		};
	}

	/** Scales LOD distances (graphics quality). */
	setLodScale(scale: number): void {
		this.lodScale = Math.max(0.25, scale);
		for (const entry of this.entries.values()) this.applyLodDistances(entry);
	}

	setShadowsEnabled(enabled: boolean): void {
		if (this.castShadows === enabled) return;
		this.castShadows = enabled;
		for (const entry of this.entries.values()) this.applyShadows(entry);
	}

	getStats(): BarrierRenderStats {
		const stats: BarrierRenderStats = {
			barriers: this.entries.size,
			objects: 0,
			meshes: 0,
			nearDrawCalls: 0,
			members: 0,
			posts: 0,
			balusters: 0,
			rails: 0,
			vertices: 0,
			triangles: 0,
			trianglesByLod: [0, 0, 0],
			bytes: 0,
			lastBuildMs: this.lastBuildMs,
			totalBuildMs: this.totalBuildMs
		};
		const seen = new Set<CompiledBarrierLevel>();
		for (const entry of this.entries.values()) {
			entry.root.traverse((child) => {
				stats.objects++;
				if (child instanceof THREE.Mesh) stats.meshes++;
			});
			const near = entry.root.levels[0]?.object;
			near?.traverse((child) => {
				if (child instanceof THREE.Mesh) stats.nearDrawCalls++;
			});
			stats.members += entry.members;
			stats.posts += entry.layout.posts.length;
			stats.balusters += entry.layout.balusters.length;
			stats.rails += entry.layout.rails.length + entry.layout.joints.length;
			entry.levels.forEach((level, i) => {
				stats.trianglesByLod[i] += level.triangles;
				if (seen.has(level)) return;
				seen.add(level);
				stats.vertices += level.vertices;
				stats.bytes += level.bytes;
			});
			stats.triangles += entry.levels[0]?.triangles ?? 0;
		}
		return stats;
	}

	dispose(): void {
		for (const id of [...this.order]) this.removeInternal(id);
		this.group.removeFromParent();
	}

	// ------------------------------------------------------------------------------------ build

	private rebuild(id: string): boolean {
		const definition = this.get(id);
		if (!definition) return false;
		this.disposeEntry(id);
		this.orphans.delete(id);
		const built = this.build(definition);
		this.revision++;
		this.collisionCache = null;
		return built;
	}

	private removeInternal(id: string): boolean {
		const had = this.entries.has(id) || this.orphans.has(id);
		this.disposeEntry(id);
		this.orphans.delete(id);
		const index = this.order.indexOf(id);
		if (index >= 0) this.order.splice(index, 1);
		return had;
	}

	private disposeEntry(id: string): void {
		const entry = this.entries.get(id);
		if (!entry) return;
		disposeBarrierRenderObject(entry);
		this.entries.delete(id);
	}

	private frameFor(definition: BarrierDefinition): { x: number; y: number; z: number } | null {
		if (definition.foundationId === null) return { x: 0, y: 0, z: 0 };
		const foundation = this.options.getFoundation(definition.foundationId);
		if (!foundation) return null;
		const frame = foundationLocalFrame(foundation, this.options.getVertexSpacing());
		return { x: frame.originWorldX, y: frame.originWorldY, z: frame.originWorldZ };
	}

	private sampler(
		definition: BarrierDefinition,
		frame: { x: number; y: number; z: number }
	): ((x: number, z: number) => number | null) | undefined {
		const { sampleSurface, sampleTerrain } = this.options;
		if (definition.baseMode !== 'follow-surface' || !sampleSurface) return undefined;
		if (definition.foundationId === null) {
			return (x, z) => {
				const ground = sampleTerrain ? sampleTerrain(x, z) : -Infinity;
				return sampleSurface(x, z, Number.isFinite(ground) ? ground + 0.05 : Infinity);
			};
		}
		// A building railing looks up to one storey above its lowest point for treads to stand on,
		// but never drops below the floor it was drawn on.
		const minY = Math.min(...definition.points.map((p) => p.y));
		const reach = (this.options.getStoreyHeight?.() ?? 3) * 0.98;
		return (x, z) => {
			const world = sampleSurface(x + frame.x, z + frame.z, frame.y + minY + reach);
			return Math.max(minY, world - frame.y);
		};
	}

	private mainMaterial(definition: Pick<BarrierDefinition, 'style' | 'material'>): THREE.Material {
		return barrierWoodMaterials(
			this.options.materialManager,
			definition.style,
			barrierMainColor(definition)
		).main;
	}

	private accentMaterial(style: BarrierStyleDefinition): THREE.Material {
		return barrierWoodMaterials(this.options.materialManager, style).accent;
	}

	private build(definition: BarrierDefinition): boolean {
		const frame = this.frameFor(definition);
		if (!frame || definition.points.length < 2) {
			this.orphans.set(definition.id, definition);
			return false;
		}
		const started = performance.now();
		const style = sanitizeBarrierStyle(definition.style);
		const layout = layoutBarrier({
			points: definition.points,
			closed: definition.closed,
			baseMode: definition.baseMode,
			style,
			sampleBase: this.sampler(definition, frame)
		});
		const origin = definition.points[0];
		const { root, levels, pickMesh } = buildBarrierRenderObject(layout, style, {
			origin,
			seed: hashSeed(definition.id),
			main: this.mainMaterial(definition),
			accent: this.accentMaterial(style),
			lodScale: this.lodScale,
			name: `barrier:${definition.id}`,
			userData: { barrierId: definition.id }
		});
		root.position.set(frame.x + origin.x, frame.y + origin.y, frame.z + origin.z);
		root.updateMatrix();
		root.matrixAutoUpdate = false;
		root.updateMatrixWorld(true);
		this.group.add(root);

		const entry: BarrierEntry = {
			definition,
			style,
			root,
			levels,
			pickMesh,
			rects: this.collisionRects(layout, frame),
			frame,
			layout,
			members: barrierMemberCount(layout),
			buildMs: 0
		};
		this.applyShadows(entry);
		entry.buildMs = performance.now() - started;
		this.lastBuildMs = entry.buildMs;
		this.totalBuildMs += entry.buildMs;
		this.entries.set(definition.id, entry);
		return true;
	}

	private applyLodDistances(entry: BarrierEntry): void {
		entry.root.levels.forEach((level, index) => {
			level.distance = BARRIER_LOD_DISTANCES[index] * this.lodScale;
		});
	}

	/** Near levels cast shadows; the far silhouette doesn't (thin members are sub-pixel there). */
	private applyShadows(entry: BarrierEntry): void {
		entry.root.levels.forEach((level, index) => {
			level.object.traverse((child) => {
				if (child instanceof THREE.Mesh) child.castShadow = this.castShadows && index < 2;
			});
		});
	}

	private collisionRects(
		layout: BarrierLayout,
		frame: { x: number; y: number; z: number }
	): WallCollisionRect[] {
		return layout.segments.map((segment) => {
			const dx = segment.bx - segment.ax;
			const dz = segment.bz - segment.az;
			const length = Math.hypot(dx, dz) || 1;
			const halfThickness = Math.max(0.05, segment.halfThickness);
			return {
				centerX: frame.x + (segment.ax + segment.bx) / 2,
				centerZ: frame.z + (segment.az + segment.bz) / 2,
				halfLength: length / 2 + halfThickness,
				halfThickness,
				dirX: dx / length,
				dirZ: dz / length,
				minWorldY: frame.y + segment.minY,
				maxWorldY: frame.y + segment.maxY
			};
		});
	}

	private segmentNear(entry: BarrierEntry, world: THREE.Vector3): number {
		const x = world.x - entry.frame.x;
		const z = world.z - entry.frame.z;
		let best = 0;
		let bestDistance = Infinity;
		entry.layout.segments.forEach((segment, index) => {
			const dx = segment.bx - segment.ax;
			const dz = segment.bz - segment.az;
			const lengthSq = dx * dx + dz * dz || 1;
			const t = Math.max(
				0,
				Math.min(1, ((x - segment.ax) * dx + (z - segment.az) * dz) / lengthSq)
			);
			const distance = Math.hypot(x - (segment.ax + dx * t), z - (segment.az + dz * t));
			if (distance < bestDistance) {
				bestDistance = distance;
				best = index;
			}
		});
		return best;
	}
}
