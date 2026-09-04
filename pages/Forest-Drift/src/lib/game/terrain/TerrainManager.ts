import * as THREE from 'three';
import { chunkKey, worldToChunkCoord, type ChunkKey } from './chunkKey';
import { TerrainChunk, terrainMaterial } from './TerrainChunk';
import { TerrainGenerationQueue, type ChunkJob } from './TerrainGenerationQueue';
import { TerrainHeightSampler } from './TerrainHeightSampler';
import type { TerrainSettings } from './TerrainSettings';
import type { VegetationRegionSampler } from '../vegetation/VegetationRegionSampler';

export interface TerrainStats {
	loadedChunks: number;
	queuedChunks: number;
	pooledChunks: number;
	revision: number;
	triangles: number;
}

/**
 * Owns the infinite-chunk lifecycle: which chunks are active around the player, which are
 * queued for (re)generation, and which recycled meshes are sitting in the pool. Framework-free
 * — ThreeScene just calls update() every frame and forwards settings-change notifications.
 */
export class TerrainManager {
	readonly group = new THREE.Group();

	private readonly settings: TerrainSettings;
	private sampler: TerrainHeightSampler;

	private active = new Map<ChunkKey, TerrainChunk>();
	private pool: TerrainChunk[] = [];
	private queue = new TerrainGenerationQueue();

	/** Kept in sync with `active` incrementally (push/splice) so callers raycasting every frame never allocate a fresh array. */
	private readonly activeMeshes: THREE.Mesh[] = [];

	private revision = 0;
	private resolutionAtLastRebuild: number;

	private lastPlayerChunkX = Number.NaN;
	private lastPlayerChunkZ = Number.NaN;

	/** Only used for the 'forestDensity'/'terrainPlusForest' debug views — terrain generation itself never reads this. */
	private vegetationRegionSampler: VegetationRegionSampler | null = null;

	constructor(settings: TerrainSettings) {
		this.settings = settings;
		this.sampler = new TerrainHeightSampler(settings);
		this.resolutionAtLastRebuild = settings.chunkResolution;
		terrainMaterial.wireframe = settings.rendering.wireframe;
	}

	/** Wired in by ThreeScene once the vegetation system exists — purely for debug-view colouring. */
	setVegetationRegionSampler(sampler: VegetationRegionSampler): void {
		this.vegetationRegionSampler = sampler;
	}

	/** Height at a world position — used by the player controller for grounding. */
	sampleHeight(worldX: number, worldZ: number): number {
		return this.sampler.sample(worldX, worldZ);
	}

	/** The shared height sampler instance — same object the terrain mesh itself reads from, so building tools stay in agreement with it (including live seed changes). */
	getHeightSampler(): TerrainHeightSampler {
		return this.sampler;
	}

	/** Meshes of every currently active chunk, for raycasting. Same array reference every call — mutated in place, never reallocated. */
	getActiveMeshes(): readonly THREE.Mesh[] {
		return this.activeMeshes;
	}

	/** Call once per frame with the player's current world position. */
	update(playerWorldX: number, playerWorldZ: number): void {
		const playerChunkX = worldToChunkCoord(playerWorldX, this.settings.chunkSize);
		const playerChunkZ = worldToChunkCoord(playerWorldZ, this.settings.chunkSize);

		if (playerChunkX !== this.lastPlayerChunkX || playerChunkZ !== this.lastPlayerChunkZ) {
			this.lastPlayerChunkX = playerChunkX;
			this.lastPlayerChunkZ = playerChunkZ;
			this.refreshActiveArea(playerChunkX, playerChunkZ);
		}

		this.processQueue(playerChunkX, playerChunkZ);
	}

	/**
	 * Synchronously generates the small ring of chunks immediately around a position, bypassing
	 * the per-frame budget. Called once at startup so the player's spawn point is never surrounded
	 * by empty space while the normal budgeted queue catches up on the rest of the view distance.
	 */
	primeAround(worldX: number, worldZ: number, immediateRadius: number): void {
		const chunkX = worldToChunkCoord(worldX, this.settings.chunkSize);
		const chunkZ = worldToChunkCoord(worldZ, this.settings.chunkSize);

		this.refreshActiveArea(chunkX, chunkZ);
		this.lastPlayerChunkX = chunkX;
		this.lastPlayerChunkZ = chunkZ;

		const jobs = this.queue.takeWithinDistance(chunkX, chunkZ, immediateRadius * immediateRadius);
		for (const job of jobs) this.materializeJob(job);
	}

	/** Non-topology settings changed (noise, shape, seed, warp): regenerate visible chunks in place, progressively. */
	notifySettingsChanged(): void {
		this.revision++;
		for (const chunk of this.active.values()) {
			this.queue.enqueue(chunk.chunkX, chunk.chunkZ, this.revision);
		}
	}

	/** Seed text changed: rebuild the noise generators, then regenerate like any other settings change. */
	notifySeedChanged(): void {
		this.sampler.setSeed(this.settings.seed);
		this.notifySettingsChanged();
	}

	/** chunkSize / chunkResolution changed: vertex topology is different, so every chunk must be rebuilt from scratch. */
	notifyTopologyChanged(): void {
		this.revision++;
		for (const chunk of this.active.values()) {
			this.group.remove(chunk.mesh);
			this.group.remove(chunk.borderLines);
			chunk.dispose();
		}
		for (const chunk of this.pool) chunk.dispose();
		this.active.clear();
		this.pool.length = 0;
		this.activeMeshes.length = 0;
		this.queue.clear();
		this.resolutionAtLastRebuild = this.settings.chunkResolution;

		// Force refreshActiveArea to run again on the next update(), even if the player hasn't moved.
		this.lastPlayerChunkX = Number.NaN;
		this.lastPlayerChunkZ = Number.NaN;
	}

	/** viewDistance changed: force the active area to be recomputed even though the player hasn't moved chunks. */
	notifyViewDistanceChanged(): void {
		this.lastPlayerChunkX = Number.NaN;
		this.lastPlayerChunkZ = Number.NaN;
	}

	applyRenderingSettings(): void {
		terrainMaterial.wireframe = this.settings.rendering.wireframe;
		for (const chunk of this.active.values()) {
			chunk.setBorderVisible(this.settings.rendering.showChunkBorders);
			chunk.setCoordinateLabelVisible(
				this.settings.rendering.showChunkCoordinates,
				this.settings.chunkSize
			);
		}
	}

	getStats(): TerrainStats {
		let triangles = 0;
		for (const chunk of this.active.values()) {
			triangles += chunk.resolution * chunk.resolution * 2;
		}
		return {
			loadedChunks: this.active.size,
			queuedChunks: this.queue.size,
			pooledChunks: this.pool.length,
			revision: this.revision,
			triangles
		};
	}

	dispose(): void {
		for (const chunk of this.active.values()) chunk.dispose();
		for (const chunk of this.pool) chunk.dispose();
		this.active.clear();
		this.pool.length = 0;
		this.activeMeshes.length = 0;
		this.queue.clear();
		this.group.clear();
	}

	private refreshActiveArea(playerChunkX: number, playerChunkZ: number): void {
		const viewDistance = this.settings.viewDistance;
		const viewDistanceSq = viewDistance * viewDistance;
		const required = new Set<ChunkKey>();

		for (let dz = -viewDistance; dz <= viewDistance; dz++) {
			for (let dx = -viewDistance; dx <= viewDistance; dx++) {
				if (dx * dx + dz * dz > viewDistanceSq) continue;
				const cx = playerChunkX + dx;
				const cz = playerChunkZ + dz;
				const key = chunkKey(cx, cz);
				required.add(key);
				if (!this.active.has(key) && !this.queue.has(cx, cz)) {
					this.queue.enqueue(cx, cz, this.revision);
				}
			}
		}

		for (const [key, chunk] of this.active) {
			if (!required.has(key)) this.recycle(key, chunk);
		}

		this.queue.pruneToRequired(required);
	}

	private processQueue(playerChunkX: number, playerChunkZ: number): void {
		const jobs = this.queue.take(playerChunkX, playerChunkZ, this.settings.chunksGeneratedPerFrame);
		for (const job of jobs) this.materializeJob(job);
	}

	private materializeJob(job: ChunkJob): void {
		if (job.revision !== this.revision) return;

		const key = chunkKey(job.chunkX, job.chunkZ);
		let chunk = this.active.get(key);
		if (!chunk) {
			chunk = this.acquireChunk();
			this.group.add(chunk.mesh);
			this.group.add(chunk.borderLines);
			this.active.set(key, chunk);
			this.activeMeshes.push(chunk.mesh);
		}

		chunk.populate(
			job.chunkX,
			job.chunkZ,
			this.settings.chunkSize,
			this.sampler,
			this.revision,
			this.settings.rendering.debugView,
			this.vegetationRegionSampler
		);
		chunk.setActive(true);
		chunk.setBorderVisible(this.settings.rendering.showChunkBorders);
		chunk.setCoordinateLabelVisible(
			this.settings.rendering.showChunkCoordinates,
			this.settings.chunkSize
		);
	}

	private recycle(key: ChunkKey, chunk: TerrainChunk): void {
		this.active.delete(key);
		this.group.remove(chunk.mesh);
		this.group.remove(chunk.borderLines);
		chunk.setActive(false);
		this.pool.push(chunk);

		const meshIndex = this.activeMeshes.indexOf(chunk.mesh);
		if (meshIndex !== -1) this.activeMeshes.splice(meshIndex, 1);
	}

	private acquireChunk(): TerrainChunk {
		const pooled = this.pool.pop();
		if (pooled) return pooled;
		return new TerrainChunk(this.resolutionAtLastRebuild);
	}
}
