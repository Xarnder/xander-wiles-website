import * as THREE from 'three';
import type { WallCollisionRect } from '../building/wallCollision';
import type { CompiledMiniBuildAsset } from './MiniBuildAsset';
import type { MiniBuildAssetCache } from './MiniBuildAssetCache';
import type {
	MiniBuildBudgetCheck,
	MiniBuildChunkBudgetManager
} from './MiniBuildChunkBudgetManager';
import {
	chunkCoordsForPosition,
	chunkIdForPosition,
	chunkIdFromCoords,
	materialKey,
	parseChunkId,
	transformLocalBox,
	type WorldAabb
} from './miniBuildGrid';
import type { MiniBuildLibrary } from './MiniBuildLibrary';
import { MiniBuildRenderBatch } from './MiniBuildRenderBatch';
import {
	MINI_BUILD_WORLD_LIMITS,
	type MiniBuildDefinition,
	type MiniBuildInstance,
	type MiniBuildMaterialSlot,
	type QuarterTurn,
	type WorldChunkId
} from './MiniBuildTypes';

export type InstanceResult<T = void> =
	{ ok: true; value: T } | { ok: false; error: string; budget?: MiniBuildBudgetCheck };

interface InstanceRecord {
	instance: MiniBuildInstance;
	chunkId: WorldChunkId;
	hidden: boolean;
	batchKey: string | null;
}

export interface MiniBuildLoadReport {
	loaded: number;
	inactive: number;
	warnings: string[];
}

export interface MiniBuildInstanceStats {
	instances: number;
	inactiveInstances: number;
	renderedInstances: number;
	activeChunks: number;
	pendingChunks: number;
	batches: number;
	instancedMeshes: number;
	collisionBoxes: number;
	lastChunkActivationMs: number;
}

export interface MiniBuildInstanceManagerOptions {
	parent: THREE.Object3D;
	library: MiniBuildLibrary;
	cache: MiniBuildAssetCache;
	budget: MiniBuildChunkBudgetManager;
	resolveMaterial: (slot: MiniBuildMaterialSlot) => THREE.Material;
	/** Render activation radius in metres (graphics-preset scaled). */
	getActivationRadius?: () => number;
	now?: () => number;
}

const DEG_TO_RAD = Math.PI / 180;
/** Furthest a 4m design can reach from its anchor horizontally (half diagonal) plus slack. */
const MAX_DESIGN_REACH = 3;

/**
 * Placed Mini Builds: the logical index and the streamed runtime representation.
 *
 * Logical state (every instance in the world) lives in cheap maps — by id, by chunk, by design.
 * Runtime state (instanced batches, collision rects) only exists for chunks near the player and is
 * rebuilt from the logical state when a chunk activates. Static objects cost nothing per frame:
 * `update()` does a single chunk-coordinate comparison unless the player crossed a chunk boundary
 * or activations are still pending.
 */
export class MiniBuildInstanceManager {
	private readonly parent: THREE.Object3D;
	private readonly library: MiniBuildLibrary;
	private readonly cache: MiniBuildAssetCache;
	private readonly budget: MiniBuildChunkBudgetManager;
	private readonly resolveMaterial: (slot: MiniBuildMaterialSlot) => THREE.Material;
	private readonly getActivationRadius: () => number;
	private readonly now: () => number;

	private readonly records = new Map<string, InstanceRecord>();
	private readonly chunkIndex = new Map<WorldChunkId, Set<string>>();
	private readonly designIndex = new Map<string, Set<string>>();
	/** Over-budget / over-cap instances from a malformed save: preserved in the save, never rendered. */
	private inactive: MiniBuildInstance[] = [];

	private readonly batches = new Map<string, MiniBuildRenderBatch>();
	private readonly batchesByChunk = new Map<WorldChunkId, Set<string>>();
	private readonly activeChunks = new Set<WorldChunkId>();
	private pending: WorldChunkId[] = [];
	private playerChunk: { cx: number; cz: number } | null = null;
	private playerX = 0;
	private playerZ = 0;
	private lastRadius = -1;
	private lastChunkActivationMs = 0;

	private collisionRects: WallCollisionRect[] = [];
	private collisionKey = '';
	private revisionCounter = 0;
	private readonly matrix = new THREE.Matrix4();

	constructor(options: MiniBuildInstanceManagerOptions) {
		this.parent = options.parent;
		this.library = options.library;
		this.cache = options.cache;
		this.budget = options.budget;
		this.resolveMaterial = options.resolveMaterial;
		this.getActivationRadius =
			options.getActivationRadius ?? (() => MINI_BUILD_WORLD_LIMITS.activationRadius);
		this.now =
			options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
	}

	get revision(): number {
		return this.revisionCounter;
	}

	get count(): number {
		return this.records.size;
	}

	/**
	 * Loads instances in save order, enforcing budgets independently of the UI. Anything that would
	 * exceed a chunk's primitive budget or instance ceiling is kept aside (and written back on save)
	 * rather than instantiated, so a hand-edited world can't freeze the game.
	 */
	load(instances: readonly MiniBuildInstance[]): MiniBuildLoadReport {
		this.clear();
		const overBudgetChunks = new Set<WorldChunkId>();
		for (const instance of instances) {
			const definition = this.library.get(instance.designId);
			if (!definition) {
				this.inactive.push(structuredClone(instance));
				continue;
			}
			const chunkId = chunkIdForPosition(instance.position.x, instance.position.z);
			if (!this.budget.addInstance(instance.id, chunkId, definition.blocks.length)) {
				this.inactive.push(structuredClone(instance));
				overBudgetChunks.add(chunkId);
				continue;
			}
			this.index(structuredClone(instance), chunkId);
		}
		this.revisionCounter++;
		this.forceStreamingRefresh();
		const warnings: string[] = [];
		if (this.inactive.length > 0) {
			warnings.push(
				`${this.inactive.length} Mini Build object${this.inactive.length === 1 ? '' : 's'} exceeded the detail limit in ${overBudgetChunks.size} area${overBudgetChunks.size === 1 ? '' : 's'} and were not loaded.`
			);
		}
		return { loaded: this.records.size, inactive: this.inactive.length, warnings };
	}

	serialize(): MiniBuildInstance[] {
		return [
			...[...this.records.values()].map((record) => structuredClone(record.instance)),
			...this.inactive.map((i) => structuredClone(i))
		];
	}

	get(id: string): MiniBuildInstance | undefined {
		return this.records.get(id)?.instance;
	}

	has(id: string): boolean {
		return this.records.has(id);
	}

	getAll(): MiniBuildInstance[] {
		return [...this.records.values()].map((record) => record.instance);
	}

	getChunkOf(id: string): WorldChunkId | undefined {
		return this.records.get(id)?.chunkId;
	}

	countForDesign(designId: string): number {
		return (
			(this.designIndex.get(designId)?.size ?? 0) +
			this.inactive.filter((i) => i.designId === designId).length
		);
	}

	idsForDesign(designId: string): string[] {
		return [...(this.designIndex.get(designId) ?? [])];
	}

	idsInChunk(chunkId: WorldChunkId): string[] {
		return [...(this.chunkIndex.get(chunkId) ?? [])];
	}

	checkBudget(
		definition: MiniBuildDefinition,
		x: number,
		z: number,
		ignoreInstanceId?: string
	): MiniBuildBudgetCheck {
		const chunkId = chunkIdForPosition(x, z);
		if (ignoreInstanceId && this.records.get(ignoreInstanceId)?.chunkId === chunkId) {
			return this.budget.check(chunkId, 0, 0);
		}
		return this.budget.check(chunkId, definition.blocks.length);
	}

	add(instance: MiniBuildInstance): InstanceResult<MiniBuildInstance> {
		if (this.records.has(instance.id)) return { ok: false, error: 'Duplicate object id.' };
		const definition = this.library.get(instance.designId);
		if (!definition) return { ok: false, error: 'That design no longer exists.' };
		const chunkId = chunkIdForPosition(instance.position.x, instance.position.z);
		const check = this.budget.check(chunkId, definition.blocks.length);
		if (!check.ok || !this.budget.addInstance(instance.id, chunkId, definition.blocks.length)) {
			return { ok: false, error: check.reason ?? 'primitives', budget: check };
		}
		const record = this.index(structuredClone(instance), chunkId);
		this.renderIfStreamed(record);
		this.bump();
		return { ok: true, value: record.instance };
	}

	remove(id: string): boolean {
		const record = this.records.get(id);
		if (!record) return false;
		this.unrender(record, true);
		this.unindex(record);
		this.budget.removeInstance(id);
		this.bump();
		return true;
	}

	/** Budget-validated move; ownership transfers to the destination chunk only if it has room. */
	move(
		id: string,
		position: { x: number; y: number; z: number },
		rotationY: QuarterTurn
	): InstanceResult<MiniBuildInstance> {
		const record = this.records.get(id);
		if (!record) return { ok: false, error: 'That object no longer exists.' };
		const toChunk = chunkIdForPosition(position.x, position.z);
		if (!this.budget.moveInstance(id, toChunk)) {
			const definition = this.library.get(record.instance.designId)!;
			return {
				ok: false,
				error: 'primitives',
				budget: this.budget.check(toChunk, definition.blocks.length)
			};
		}
		this.unrender(record, true);
		if (toChunk !== record.chunkId) {
			this.chunkIndex.get(record.chunkId)?.delete(id);
			if (this.chunkIndex.get(record.chunkId)?.size === 0) this.chunkIndex.delete(record.chunkId);
			record.chunkId = toChunk;
			this.setInIndex(this.chunkIndex, toChunk, id);
		}
		record.instance.position = { ...position };
		record.instance.rotationY = rotationY;
		this.renderIfStreamed(record);
		this.bump();
		return { ok: true, value: record.instance };
	}

	/**
	 * Points one instance at another design (Make Unique). Validates the cost change for its chunk.
	 */
	retarget(id: string, designId: string): InstanceResult<MiniBuildInstance> {
		const record = this.records.get(id);
		const definition = this.library.get(designId);
		if (!record || !definition)
			return { ok: false, error: 'That object or design no longer exists.' };
		const exceeded = this.budget.chunksExceededByCostChange([id], definition.blocks.length);
		if (exceeded.length > 0) return { ok: false, error: 'primitives' };
		this.unrender(record, true);
		this.designIndex.get(record.instance.designId)?.delete(id);
		record.instance.designId = designId;
		this.setInIndex(this.designIndex, designId, id);
		this.budget.setCost(id, definition.blocks.length);
		if (this.activeChunks.has(record.chunkId)) this.renderRecord(record, true);
		this.bump();
		return { ok: true, value: record.instance };
	}

	/** Temporarily hides an instance (held in Move Mode) without touching its budget or index. */
	setHidden(id: string, hidden: boolean): void {
		const record = this.records.get(id);
		if (!record || record.hidden === hidden) return;
		record.hidden = hidden;
		if (hidden) this.unrender(record, true);
		else if (this.activeChunks.has(record.chunkId)) this.renderRecord(record, true);
		this.collisionKey = '';
	}

	/** Cost change of a shared design edit across every chunk it is placed in. */
	chunksExceededByDesignCost(designId: string, newBlockCount: number): WorldChunkId[] {
		return this.budget.chunksExceededByCostChange(this.idsForDesign(designId), newBlockCount);
	}

	/**
	 * A saved design changed revision. The new asset is compiled once (lazily, by the first batch that
	 * needs it); the affected batches are rebuilt from the same instance transforms. Unrelated
	 * batches are untouched.
	 */
	onDesignUpdated(designId: string): void {
		const definition = this.library.get(designId);
		const ids = this.idsForDesign(designId);
		if (!definition) return;
		for (const id of ids) this.budget.setCost(id, definition.blocks.length);
		const touchedChunks = new Set<WorldChunkId>();
		for (const id of ids) {
			const record = this.records.get(id)!;
			this.unrender(record, false);
			touchedChunks.add(record.chunkId);
		}
		for (const id of ids) {
			const record = this.records.get(id)!;
			if (this.activeChunks.has(record.chunkId)) this.renderRecord(record, false);
		}
		this.commitChunks(touchedChunks);
		this.bump();
	}

	removeAllForDesign(designId: string): number {
		const ids = this.idsForDesign(designId);
		for (const id of ids) this.remove(id);
		const inactiveBefore = this.inactive.length;
		this.inactive = this.inactive.filter((instance) => instance.designId !== designId);
		if (this.inactive.length !== inactiveBefore) this.bump();
		return ids.length + (inactiveBefore - this.inactive.length);
	}

	/** Per-frame. Cheap unless the player crossed into another chunk or activations are queued. */
	update(playerX: number, playerZ: number): void {
		this.playerX = playerX;
		this.playerZ = playerZ;
		const { cx, cz } = chunkCoordsForPosition(playerX, playerZ);
		const radius = this.getActivationRadius();
		if (
			!this.playerChunk ||
			this.playerChunk.cx !== cx ||
			this.playerChunk.cz !== cz ||
			radius !== this.lastRadius
		) {
			this.playerChunk = { cx, cz };
			this.lastRadius = radius;
			this.refreshDesiredChunks();
		}
		if (this.pending.length === 0) return;
		const started = this.now();
		for (
			let i = 0;
			i < MINI_BUILD_WORLD_LIMITS.chunkActivationsPerFrame && this.pending.length > 0;
			i++
		) {
			this.activateChunk(this.pending.shift()!);
		}
		this.lastChunkActivationMs = this.now() - started;
	}

	/** Activates every chunk within radius synchronously — used by tests, benchmarks and world load. */
	flushStreaming(): void {
		while (this.pending.length > 0) this.activateChunk(this.pending.shift()!);
	}

	isChunkActive(chunkId: WorldChunkId): boolean {
		return this.activeChunks.has(chunkId);
	}

	getBatches(): readonly MiniBuildRenderBatch[] {
		return [...this.batches.values()];
	}

	getBatchForInstance(id: string): MiniBuildRenderBatch | undefined {
		const key = this.records.get(id)?.batchKey;
		return key ? this.batches.get(key) : undefined;
	}

	/** All instanced meshes near the ray, for combined picking with other systems. */
	getPickMeshes(origin: THREE.Vector3, far: number): THREE.InstancedMesh[] {
		const meshes: THREE.InstancedMesh[] = [];
		const reach = far + MINI_BUILD_WORLD_LIMITS.chunkSize;
		for (const batch of this.batches.values()) {
			if (batch.count === 0) continue;
			const { cx, cz } = parseChunkId(batch.chunkId);
			const size = MINI_BUILD_WORLD_LIMITS.chunkSize;
			const centerX = (cx + 0.5) * size;
			const centerZ = (cz + 0.5) * size;
			if (Math.abs(centerX - origin.x) > reach || Math.abs(centerZ - origin.z) > reach) continue;
			meshes.push(...batch.getMeshes());
		}
		return meshes;
	}

	/** Resolves a raycast hit on an instanced batch mesh back to the logical instance. */
	resolveHit(hit: THREE.Intersection): string | undefined {
		const key = hit.object.userData.miniBuildBatchKey;
		if (typeof key !== 'string' || hit.instanceId === undefined) return undefined;
		return this.batches.get(key)?.idAt(hit.instanceId);
	}

	raycast(
		raycaster: THREE.Raycaster
	): { id: string; distance: number; point: THREE.Vector3 } | null {
		const meshes = this.getPickMeshes(raycaster.ray.origin, raycaster.far);
		if (meshes.length === 0) return null;
		for (const hit of raycaster.intersectObjects(meshes, false)) {
			const id = this.resolveHit(hit);
			if (id) return { id, distance: hit.distance, point: hit.point };
		}
		return null;
	}

	worldAabb(id: string): WorldAabb | null {
		const record = this.records.get(id);
		const definition = record ? this.library.get(record.instance.designId) : undefined;
		if (!record || !definition) return null;
		const data = this.cache.getData(definition);
		return transformLocalBox(
			data.bounds.min,
			data.bounds.max,
			record.instance.position,
			record.instance.rotationY
		);
	}

	/** World collision boxes of instances whose anchors are near a region (placement overlap tests). */
	queryCollisionBoxes(
		region: WorldAabb,
		ignoreInstanceId?: string
	): { id: string; box: WorldAabb }[] {
		const out: { id: string; box: WorldAabb }[] = [];
		const min = chunkCoordsForPosition(
			region.minX - MAX_DESIGN_REACH,
			region.minZ - MAX_DESIGN_REACH
		);
		const max = chunkCoordsForPosition(
			region.maxX + MAX_DESIGN_REACH,
			region.maxZ + MAX_DESIGN_REACH
		);
		for (let cx = min.cx; cx <= max.cx; cx++) {
			for (let cz = min.cz; cz <= max.cz; cz++) {
				for (const id of this.chunkIndex.get(chunkIdFromCoords(cx, cz)) ?? []) {
					if (id === ignoreInstanceId) continue;
					const record = this.records.get(id)!;
					if (record.hidden) continue;
					for (const box of this.collisionBoxesFor(record)) out.push({ id, box });
				}
			}
		}
		return out;
	}

	/** Player collision for the chunk ring around the player — cached until something changes. */
	getNearbyCollisionRects(): WallCollisionRect[] {
		if (!this.playerChunk) return [];
		const key = `${this.playerChunk.cx}:${this.playerChunk.cz}:${this.revisionCounter}`;
		if (key === this.collisionKey) return this.collisionRects;
		this.collisionKey = key;
		const rects: WallCollisionRect[] = [];
		const ring = MINI_BUILD_WORLD_LIMITS.collisionRingChunks;
		for (let dx = -ring; dx <= ring; dx++) {
			for (let dz = -ring; dz <= ring; dz++) {
				for (const id of this.chunkIndex.get(
					chunkIdFromCoords(this.playerChunk.cx + dx, this.playerChunk.cz + dz)
				) ?? []) {
					const record = this.records.get(id)!;
					if (record.hidden) continue;
					for (const box of this.collisionBoxesFor(record)) {
						rects.push({
							centerX: (box.minX + box.maxX) / 2,
							centerZ: (box.minZ + box.maxZ) / 2,
							halfLength: (box.maxX - box.minX) / 2,
							halfThickness: (box.maxZ - box.minZ) / 2,
							dirX: 1,
							dirZ: 0,
							minWorldY: box.minY,
							maxWorldY: box.maxY
						});
					}
				}
			}
		}
		this.collisionRects = rects;
		return rects;
	}

	getStats(): MiniBuildInstanceStats {
		let rendered = 0;
		let meshes = 0;
		for (const batch of this.batches.values()) {
			rendered += batch.count;
			meshes += batch.getMeshes().length;
		}
		return {
			instances: this.records.size,
			inactiveInstances: this.inactive.length,
			renderedInstances: rendered,
			activeChunks: this.activeChunks.size,
			pendingChunks: this.pending.length,
			batches: this.batches.size,
			instancedMeshes: meshes,
			collisionBoxes: this.getNearbyCollisionRects().length,
			lastChunkActivationMs: this.lastChunkActivationMs
		};
	}

	/** Recomputes streaming on the next update (radius or world content changed wholesale). */
	forceStreamingRefresh(): void {
		this.lastRadius = -1;
		if (this.playerChunk) this.update(this.playerX, this.playerZ);
	}

	clear(): void {
		for (const batch of this.batches.values()) {
			batch.dispose();
			this.cache.release(batch.asset);
		}
		this.batches.clear();
		this.batchesByChunk.clear();
		this.activeChunks.clear();
		this.pending = [];
		this.records.clear();
		this.chunkIndex.clear();
		this.designIndex.clear();
		this.inactive = [];
		this.budget.clear();
		this.collisionKey = '';
		this.bump();
	}

	dispose(): void {
		this.clear();
	}

	private bump(): void {
		this.revisionCounter++;
		this.collisionKey = '';
	}

	private index(instance: MiniBuildInstance, chunkId: WorldChunkId): InstanceRecord {
		const record: InstanceRecord = { instance, chunkId, hidden: false, batchKey: null };
		this.records.set(instance.id, record);
		this.setInIndex(this.chunkIndex, chunkId, instance.id);
		this.setInIndex(this.designIndex, instance.designId, instance.id);
		return record;
	}

	private unindex(record: InstanceRecord): void {
		this.records.delete(record.instance.id);
		const chunk = this.chunkIndex.get(record.chunkId);
		chunk?.delete(record.instance.id);
		if (chunk?.size === 0) this.chunkIndex.delete(record.chunkId);
		const design = this.designIndex.get(record.instance.designId);
		design?.delete(record.instance.id);
		if (design?.size === 0) this.designIndex.delete(record.instance.designId);
	}

	private setInIndex(index: Map<string, Set<string>>, key: string, id: string): void {
		let set = index.get(key);
		if (!set) {
			set = new Set();
			index.set(key, set);
		}
		set.add(id);
	}

	private collisionBoxesFor(record: InstanceRecord): WorldAabb[] {
		const definition = this.library.get(record.instance.designId);
		if (!definition) return [];
		const data = this.cache.getData(definition);
		return data.collision.map((box) =>
			transformLocalBox(box.min, box.max, record.instance.position, record.instance.rotationY)
		);
	}

	private signature(instance: MiniBuildInstance): string {
		if (!instance.materialOverrides || instance.materialOverrides.length === 0) return '';
		return [...instance.materialOverrides]
			.sort((a, b) => a.slot - b.slot)
			.map((o) => `${o.slot}=${materialKey(o)}`)
			.join(',');
	}

	private batchKeyFor(record: InstanceRecord, definition: MiniBuildDefinition): string {
		return `${record.chunkId}|${definition.id}|r${definition.revision}|${this.signature(record.instance)}`;
	}

	private renderRecord(record: InstanceRecord, commit: boolean): void {
		if (record.hidden || record.batchKey) return;
		const definition = this.library.get(record.instance.designId);
		if (!definition) return;
		const key = this.batchKeyFor(record, definition);
		let batch = this.batches.get(key);
		if (!batch) {
			const asset = this.cache.acquire(definition);
			batch = new MiniBuildRenderBatch({
				key,
				chunkId: record.chunkId,
				asset,
				materials: this.materialsFor(asset, definition, record.instance),
				parent: this.parent,
				castShadow: this.shouldCastShadow(record.chunkId)
			});
			this.batches.set(key, batch);
			this.setInIndex(this.batchesByChunk, record.chunkId, key);
		}
		this.matrix.makeRotationY(record.instance.rotationY * DEG_TO_RAD);
		this.matrix.setPosition(
			record.instance.position.x,
			record.instance.position.y,
			record.instance.position.z
		);
		batch.add(record.instance.id, this.matrix);
		record.batchKey = key;
		if (commit) batch.commit();
	}

	private unrender(record: InstanceRecord, commit: boolean): void {
		if (!record.batchKey) return;
		const batch = this.batches.get(record.batchKey);
		record.batchKey = null;
		if (!batch) return;
		batch.remove(record.instance.id);
		if (batch.count === 0) {
			this.disposeBatch(batch);
		} else if (commit) {
			batch.commit();
		}
	}

	/** Renders into an active chunk, or activates a newly occupied chunk that is within range. */
	private renderIfStreamed(record: InstanceRecord): void {
		if (this.activeChunks.has(record.chunkId)) {
			this.renderRecord(record, true);
			return;
		}
		if (!this.playerChunk) return;
		const { cx, cz } = parseChunkId(record.chunkId);
		const radiusChunks = Math.ceil(this.lastRadius / MINI_BUILD_WORLD_LIMITS.chunkSize);
		const d = (cx - this.playerChunk.cx) ** 2 + (cz - this.playerChunk.cz) ** 2;
		if (d <= radiusChunks * radiusChunks) {
			this.pending = this.pending.filter((id) => id !== record.chunkId);
			this.activateChunk(record.chunkId);
		}
	}

	private commitChunks(chunks: Iterable<WorldChunkId>): void {
		for (const chunkId of chunks) {
			for (const key of this.batchesByChunk.get(chunkId) ?? []) this.batches.get(key)?.commit();
		}
	}

	private disposeBatch(batch: MiniBuildRenderBatch): void {
		batch.dispose();
		this.cache.release(batch.asset);
		this.batches.delete(batch.key);
		const keys = this.batchesByChunk.get(batch.chunkId);
		keys?.delete(batch.key);
		if (keys?.size === 0) this.batchesByChunk.delete(batch.chunkId);
	}

	private materialsFor(
		asset: CompiledMiniBuildAsset,
		definition: MiniBuildDefinition,
		instance: MiniBuildInstance
	): THREE.Material[] {
		return asset.geometries.map((entry) => {
			const slot = definition.materials[entry.materialSlot] ?? definition.materials[0];
			const override = instance.materialOverrides?.find((o) => o.slot === entry.materialSlot);
			return this.resolveMaterial(override ? { ...slot, material: override.material } : slot);
		});
	}

	private shouldCastShadow(chunkId: WorldChunkId): boolean {
		const { cx, cz } = parseChunkId(chunkId);
		const size = MINI_BUILD_WORLD_LIMITS.chunkSize;
		const dx = (cx + 0.5) * size - this.playerX;
		const dz = (cz + 0.5) * size - this.playerZ;
		return Math.hypot(dx, dz) <= MINI_BUILD_WORLD_LIMITS.shadowDistance + size;
	}

	private refreshDesiredChunks(): void {
		if (!this.playerChunk) return;
		const size = MINI_BUILD_WORLD_LIMITS.chunkSize;
		const radiusChunks = Math.ceil(this.lastRadius / size);
		const desired = new Set<WorldChunkId>();
		const candidates: { id: WorldChunkId; d: number }[] = [];
		const addIfOccupied = (cx: number, cz: number) => {
			const id = chunkIdFromCoords(cx, cz);
			if (!this.chunkIndex.has(id)) return;
			const d = (cx - this.playerChunk!.cx) ** 2 + (cz - this.playerChunk!.cz) ** 2;
			if (d > radiusChunks * radiusChunks) return;
			desired.add(id);
			if (!this.activeChunks.has(id)) candidates.push({ id, d });
		};
		if (this.chunkIndex.size < (radiusChunks * 2 + 1) ** 2) {
			for (const id of this.chunkIndex.keys()) {
				const { cx, cz } = parseChunkId(id);
				addIfOccupied(cx, cz);
			}
		} else {
			for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
				for (let dz = -radiusChunks; dz <= radiusChunks; dz++)
					addIfOccupied(this.playerChunk.cx + dx, this.playerChunk.cz + dz);
			}
		}
		for (const id of [...this.activeChunks]) {
			if (!desired.has(id)) this.deactivateChunk(id);
		}
		candidates.sort((a, b) => a.d - b.d);
		this.pending = candidates.map((c) => c.id);
		// Shadow casting follows distance as the player moves.
		for (const batch of this.batches.values())
			batch.setCastShadow(this.shouldCastShadow(batch.chunkId));
	}

	private activateChunk(chunkId: WorldChunkId): void {
		if (this.activeChunks.has(chunkId)) return;
		this.activeChunks.add(chunkId);
		for (const id of this.chunkIndex.get(chunkId) ?? [])
			this.renderRecord(this.records.get(id)!, false);
		this.commitChunks([chunkId]);
	}

	private deactivateChunk(chunkId: WorldChunkId): void {
		this.activeChunks.delete(chunkId);
		for (const id of this.chunkIndex.get(chunkId) ?? []) {
			const record = this.records.get(id);
			if (record) record.batchKey = null;
		}
		for (const key of [...(this.batchesByChunk.get(chunkId) ?? [])]) {
			const batch = this.batches.get(key);
			if (batch) this.disposeBatch(batch);
		}
		this.batchesByChunk.delete(chunkId);
	}
}
