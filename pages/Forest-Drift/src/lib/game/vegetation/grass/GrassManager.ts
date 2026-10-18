import * as THREE from 'three';
import { chunkKey, type ChunkKey } from '../../terrain/chunkKey';
import { TerrainGenerationQueue } from '../../terrain/TerrainGenerationQueue';
import { createBiomeWeights, type TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import {
	createSurfacePoint,
	sampleSurfaceLattice,
	type SurfacePoint,
	type TerrainSurfaceLattice
} from '../../terrain/terrainSurfaceLattice';
import { hashStringToUint32 } from '../../terrain/seededRandom';
import type { VegetationRegionSampler } from '../VegetationRegionSampler';
import { generateGrassAtlas, generateGrassPatchAtlas, type GrassAtlas } from './grassAtlas';
import { GrassChunk } from './GrassChunk';
import { GrassAdaptiveQuality, resolveGrassLod, type GrassLodState } from './grassLod';
import {
	createGrassAtlasTexture,
	createGrassCardTemplate,
	createGrassMaterial,
	createGrassUniforms,
	grassAtlasBytes,
	GRASS_TRIANGLES_CROSSED,
	GRASS_TRIANGLES_SINGLE,
	type GrassUniforms
} from './grassMaterial';
import {
	generateGrassChunk,
	REGION_CHANNELS,
	REGION_DENSITY,
	REGION_HEIGHT,
	REGION_SHORTNESS,
	REGION_WARMTH,
	type GrassGrid
} from './grassPlacement';
import { createGrassRegion, sampleGrassRegion } from './GrassRegionSampler';
import {
	GRASS_CHUNK_SIZE,
	GRASS_GENERATOR_VERSION,
	type GrassQualityProfile,
	type GrassSettings
} from './GrassTypes';

/** A rectangle grass never grows in (a foundation / building footprint), world space. */
export interface GrassExclusion {
	id: string;
	minX: number;
	minZ: number;
	maxX: number;
	maxZ: number;
}

export interface GrassDebugSettings {
	showGrassChunks: boolean;
	showGrassLod: boolean;
	showGrassCandidates: boolean;
}

export interface GrassManagerOptions {
	/** Internal sparse-patch renderer; never recursively creates another layer. */
	distantLayer?: boolean;
	settings: GrassSettings;
	debug: GrassDebugSettings;
	seed: string;
	terrain: {
		chunkSize: () => number;
		getRevision: () => number;
		getSurfaceLattice: (chunkX: number, chunkZ: number) => TerrainSurfaceLattice | null;
	};
	heightSampler: TerrainHeightSampler;
	vegetationRegionSampler: VegetationRegionSampler;
	getExclusions: () => readonly GrassExclusion[];
	getExclusionRevision: () => number;
	/** Water column depth at a point, and whether any river/lake is near a rectangle. */
	waterDepthAt?: (worldX: number, worldZ: number) => number;
	hasWaterNear?: (minX: number, minZ: number, maxX: number, maxZ: number) => boolean;
	/**
	 * Competing ground cover (flower colonies) at a point, 0..1: grass thins and shortens there so
	 * the plants show. Omitted, grass ignores other vegetation.
	 */
	groundCover?: (worldX: number, worldZ: number) => number;
	/** Atlas tile size (64 is plenty on weak devices). */
	atlasTileSize?: number;
}

export interface GrassRenderStats {
	enabled: boolean;
	distantInstances: number;
	distantDrawCalls: number;
	distantRenderDistance: number;
	/** Tufts in chunks inside the camera frustum this frame. */
	visibleInstances: number;
	/** Visible tufts by LOD band (by each chunk's nearest distance). */
	lodInstances: [number, number, number];
	activeChunks: number;
	/** Chunks drawn in the main pass = grass draw calls. */
	drawCalls: number;
	triangles: number;
	/** Tufts generated and resident (all LODs). */
	loadedInstances: number;
	/** Instance buffers + the atlas with mips, bytes. */
	bufferBytes: number;
	atlasBytes: number;
	queuedChunks: number;
	lastGenerationMs: number;
	averageGenerationMs: number;
	/** 1 = full quality; lower = adaptive degradation in effect. */
	adaptiveLevel: number;
	/** < 1 when the visible-instance budget is limiting density. */
	budgetScale: number;
	renderDistance: number;
}

const DEFAULT_QUALITY: GrassQualityProfile = {
	densityScale: 1,
	distanceScale: 1,
	crossedCards: true,
	receiveShadows: true,
	wind: true,
	maxVisibleInstances: 60000
};

/** Generation time per frame (ms) before the rest of the queue waits for the next frame. */
const GENERATION_BUDGET_MS = 3;
/** Extra radius (metres) loaded beyond the render distance, so chunks exist before they are seen. */
const PREFETCH_MARGIN = 10;
/** Coarse grids over a chunk (nodes per side): region every 4 m, water every 2 m. */
const REGION_NODES = 5;
const WATER_NODES = 9;
/** Crossed cards morph to one billboard by this distance (metres, × quality distance). */
const CROSSED_CARDS_END = 9;
/** Player push radius, metres. */
const PLAYER_PUSH_RADIUS = 0.85;

const chunkLineMaterial = new THREE.LineBasicMaterial({ color: 0xa6ff4d });
const candidateMaterial = new THREE.PointsMaterial({
	size: 0.12,
	color: 0xffe066,
	sizeAttenuation: true
});

interface GrassChunkRecord {
	chunkX: number;
	chunkZ: number;
	revision: number;
	chunk: GrassChunk | null;
	lines: THREE.LineSegments | null;
	points: THREE.Points | null;
}

/**
 * Streams procedural billboard grass around the player — see the README's "Grass" section.
 *
 *   placement   grassPlacement.ts (pure; world-space cells, region grid, exclusions, colour)
 *   GPU data    GrassChunk (one InstancedBufferGeometry + one draw call per 16 m chunk)
 *   shared      ONE atlas texture, ONE card template, ONE material for all grass
 *   runtime     this class: load/unload ring, time-sliced generation queue, per-frame LOD counts,
 *               wind/weather uniforms, budget and adaptive quality, stats, debug views
 *
 * Per frame: a distance test and an instance count per loaded chunk (dozens), a few uniforms. No
 * per-tuft CPU work, ever — wind and density fades run in the vertex shader.
 */
export class GrassManager {
	readonly group = new THREE.Group();

	private readonly settings: GrassSettings;
	private distant?: GrassManager;
	private readonly chunkSize: number;
	private readonly debug: GrassDebugSettings;
	private readonly options: GrassManagerOptions;
	private readonly atlas: GrassAtlas;
	private readonly atlasTexture: THREE.DataTexture;
	private readonly uniforms: GrassUniforms = createGrassUniforms();
	private readonly material: THREE.MeshLambertMaterial;
	private readonly template = createGrassCardTemplate();

	private quality: GrassQualityProfile = { ...DEFAULT_QUALITY };
	private readonly adaptive = new GrassAdaptiveQuality();
	private adaptiveEnabled = true;
	private budgetScale = 1;
	private lod: GrassLodState;

	private readonly records = new Map<ChunkKey, GrassChunkRecord>();
	private readonly queue = new TerrainGenerationQueue();
	private seedHash = 0;
	private currentSeed = '';
	private distantSyncKey = '';
	private revision = 0;
	private terrainRevision = -1;
	private exclusionRevision = -1;
	private readonly knownExclusions = new Map<string, string>();
	private readonly lastLoadCenter = new THREE.Vector2(Number.NaN, Number.NaN);
	private lastLoadRadius = -1;
	private readonly weather = { strengthScale: 1, dirX: 0, dirZ: 1, lean: 0, wetness: 0 };

	private lastGenerationMs = 0;
	private averageGenerationMs = 0;
	private readonly frameStats = {
		visibleInstances: 0,
		lodInstances: [0, 0, 0] as [number, number, number],
		drawCalls: 0,
		triangles: 0
	};

	constructor(options: GrassManagerOptions) {
		this.options = options;
		this.chunkSize = options.distantLayer ? 48 : GRASS_CHUNK_SIZE;
		this.settings = options.settings;

		this.debug = options.debug;
		this.atlas = options.distantLayer
			? generateGrassPatchAtlas(64)
			: generateGrassAtlas(options.atlasTileSize ?? 128);
		this.atlasTexture = createGrassAtlasTexture(this.atlas);
		this.material = createGrassMaterial(this.atlasTexture, this.uniforms);
		this.uniforms.uGrassMisc.value.x = 1 / this.atlas.tileSize;
		this.group.name = options.distantLayer ? 'distant-grass-patches' : 'grass';
		this.setSeed(options.seed);
		this.lod = resolveGrassLod(this.settings, this.quality, 1, 1);
	}

	/** The one grass material — register it with the shadow pipeline once. */
	getSharedMaterials(): THREE.Material[] {
		return [this.material, ...(this.distant?.getSharedMaterials() ?? [])];
	}

	setSeed(seed: string): void {
		this.currentSeed = seed;
		this.distant?.setSeed(seed);
		// Saved environment values are applied AFTER manager construction. Upgrade here
		// before generation, including same-seed reloads, so old values cannot overwrite it.
		// Upgrade the previous shipped defaults in saved worlds as well as new worlds.
		// Explicitly tuned height ranges remain under the player's control.
		if (
			(this.settings.minHeight === 0.2 && this.settings.maxHeight === 0.52) ||
			(this.settings.minHeight === 0.35 && this.settings.maxHeight === 0.9)
		) {
			this.settings.minHeight = 0.7;
			this.settings.maxHeight = 1.8;
		}
		// The generator version salts the hash: a future placement version never re-plants old worlds.
		const version = this.settings.generatorVersion || GRASS_GENERATOR_VERSION;
		this.seedHash = hashStringToUint32(`grass:v${version}:${seed}`, 0x6a55);
		this.notifySettingsChanged();
	}

	setQualityProfile(profile: GrassQualityProfile): void {
		if (
			(Object.keys(profile) as (keyof GrassQualityProfile)[]).every(
				(key) => profile[key] === this.quality[key]
			)
		)
			return;
		const regenerate = profile.densityScale !== this.quality.densityScale;
		this.quality = { ...profile };
		this.lastLoadRadius = -1;
		if (regenerate) this.notifySettingsChanged();
	}

	/** Placement-affecting settings changed (density, spacing, heights): regenerate loaded chunks. */
	notifySettingsChanged(): void {
		this.distantSyncKey = '';
		this.distant?.notifySettingsChanged();
		// Pending chunks may not have records yet. Drop their old revisions so the
		// next area refresh can enqueue them again instead of silently discarding them.
		this.queue.clear();
		this.revision++;
		this.lastLoadRadius = -1;
		for (const record of this.records.values())
			this.queue.enqueue(record.chunkX, record.chunkZ, this.revision);
	}

	notifyTerrainChanged(): void {
		this.notifySettingsChanged();
	}

	/**
	 * Weather inputs: the same wind the trees get (strength multiplier, direction, steady lean) and
	 * surface wetness (rain darkens grass slightly). Uniforms only.
	 */
	setWeather(
		wind: { strengthScale: number; dirX: number; dirZ: number; lean: number },
		wetness: number
	): void {
		this.distant?.setWeather(wind, wetness);
		this.weather.strengthScale = wind.strengthScale;
		this.weather.dirX = wind.dirX;
		this.weather.dirZ = wind.dirZ;
		this.weather.lean = wind.lean;
		this.weather.wetness = wetness;
	}

	/** Adaptive quality input (once per frame; acts at most once a second, with hysteresis). */
	setPerformance(deltaSeconds: number, smoothedFps: number, targetFps: number): void {
		this.adaptive.update(deltaSeconds, smoothedFps, targetFps, this.adaptiveEnabled);
	}

	/** Developer switch: pin grass at full quality (for benchmarks). */
	setAdaptiveEnabled(enabled: boolean): void {
		this.adaptiveEnabled = enabled;
		if (!enabled) this.adaptive.level = 1;
	}

	/** Streaming: load/unload chunks around the player and run the generation queue (time-sliced). */
	update(playerX: number, playerZ: number, budgetMs = GENERATION_BUDGET_MS): void {
		const started = performance.now();
		const enabled = this.settings.enabled;
		this.group.visible = enabled;
		if (!enabled) {
			this.distantSyncKey = '';
			if (this.records.size > 0 || this.queue.size > 0) this.unloadAll();
			if (this.distant) {
				this.distant.settings.enabled = false;
				this.distant.update(playerX, playerZ, 0);
			}
			return;
		}
		const terrainRevision = this.options.terrain.getRevision();
		if (terrainRevision !== this.terrainRevision) {
			this.terrainRevision = terrainRevision;
			this.notifyTerrainChanged();
		}
		this.syncExclusions();
		this.refreshActiveArea(playerX, playerZ);
		this.processQueue(playerX, playerZ, budgetMs);
		if (!this.options.distantLayer) {
			this.syncDistantLayer();
			this.distant?.update(playerX, playerZ, Math.max(0, budgetMs - (performance.now() - started)));
		}
	}

	/** Per frame: uniforms, then one distance check + instance count per chunk. */
	updateView(
		camera: THREE.Camera,
		deltaSeconds: number,
		player: { x: number; feetY: number; z: number }
	): void {
		const u = this.uniforms;
		u.uGrassTime.value = (u.uGrassTime.value + deltaSeconds) % 3600;
		const windOn = this.quality.wind;
		const wind = this.settings.windStrength;
		u.uGrassWind.value.set(
			this.weather.dirX,
			this.weather.dirZ,
			windOn ? 0.55 * wind * Math.min(2.5, this.weather.strengthScale) : 0,
			windOn ? Math.min(0.9, 0.18 * wind + this.weather.lean * 0.6) : 0
		);
		u.uGrassShade.value.z = Math.min(1, this.weather.wetness) * 0.16;
		u.uGrassPlayer.value.set(
			player.x,
			player.feetY,
			player.z,
			this.settings.playerInteraction ? PLAYER_PUSH_RADIUS : 0
		);
		u.uGrassMisc.value.y = this.debug.showGrassLod ? 1 : 0;
		this.material.alphaTest = this.settings.alphaTest;

		this.lod = resolveGrassLod(this.settings, this.quality, this.adaptive.level, this.budgetScale);
		const lod = this.lod;
		if (!this.options.distantLayer && this.distant) {
			this.distant.uniforms.uGrassPatch.value.set(lod.end * 0.42, lod.end * 0.84, 2.8, 1);
		}
		u.uGrassLod.value.set(lod.lod0, lod.lod1, lod.lod2, lod.end);
		u.uGrassDensity.value.x = lod.density0;
		u.uGrassDensity.value.y = lod.density1;
		u.uGrassDensity.value.z = lod.density2;
		const crossedEnd = this.quality.crossedCards
			? CROSSED_CARDS_END * this.quality.distanceScale
			: 0;
		u.uGrassSize.value.set(
			this.settings.minHeight,
			Math.max(0.01, this.settings.maxHeight - this.settings.minHeight),
			this.settings.widthRatio,
			crossedEnd
		);

		const cameraPosition = camera.getWorldPosition(scratchVector);
		let total = 0;
		for (const record of this.records.values()) {
			const chunk = record.chunk;
			if (!chunk) continue;
			total += chunk.updateView(
				cameraPosition.x,
				cameraPosition.z,
				lod,
				crossedEnd,
				this.quality.receiveShadows
			);
		}
		this.updateBudget(total);
		this.distant?.updateView(camera, deltaSeconds, player);
	}

	/**
	 * Keeps drawn tufts under the preset's cap: if the loaded view would exceed it, density scales
	 * down (proportionally, all LODs alike); it relaxes back slowly once there is headroom.
	 */
	private updateBudget(total: number): void {
		const max = this.quality.maxVisibleInstances;
		if (total > max) {
			this.budgetScale = Math.max(0.3, this.budgetScale * (max / total) * 0.98);
		} else if (total < max * 0.85 && this.budgetScale < 1) {
			this.budgetScale = Math.min(1, this.budgetScale + 0.01);
		}
	}

	getRenderStats(frustum: THREE.Frustum | null): GrassRenderStats {
		let visible = 0;
		const lodInstances: [number, number, number] = [0, 0, 0];
		let drawCalls = 0;
		let triangles = 0;
		let loaded = 0;
		let bytes = 0;
		let active = 0;
		const sphere = new THREE.Sphere();
		for (const record of this.records.values()) {
			const chunk = record.chunk;
			if (!chunk) continue;
			active++;
			loaded += chunk.count;
			bytes += chunk.bufferBytes;
			if (!chunk.mesh.visible) continue;
			const geometrySphere = chunk.mesh.geometry.boundingSphere;
			if (frustum && geometrySphere) {
				sphere.copy(geometrySphere).applyMatrix4(chunk.mesh.matrixWorld);
				if (!frustum.intersectsSphere(sphere)) continue;
			}
			drawCalls++;
			visible += chunk.drawn;
			triangles += chunk.drawn * (chunk.crossed ? GRASS_TRIANGLES_CROSSED : GRASS_TRIANGLES_SINGLE);
			const band =
				chunk.nearestDistance < this.lod.lod0 ? 0 : chunk.nearestDistance < this.lod.lod1 ? 1 : 2;
			lodInstances[band] += chunk.drawn;
		}
		const atlasBytes = grassAtlasBytes(this.atlas);
		const far = this.distant?.getRenderStats(frustum);
		lodInstances[2] += far?.visibleInstances ?? 0;
		return {
			enabled: this.settings.enabled,
			distantInstances: far?.visibleInstances ?? 0,
			distantDrawCalls: far?.drawCalls ?? 0,
			distantRenderDistance: far?.renderDistance ?? 0,
			visibleInstances: visible + (far?.visibleInstances ?? 0),
			lodInstances,
			activeChunks: active + (far?.activeChunks ?? 0),
			drawCalls: drawCalls + (far?.drawCalls ?? 0),
			triangles: triangles + (far?.triangles ?? 0),
			loadedInstances: loaded + (far?.loadedInstances ?? 0),
			bufferBytes: bytes + atlasBytes + (far?.bufferBytes ?? 0),
			atlasBytes: atlasBytes + (far?.atlasBytes ?? 0),
			queuedChunks: this.queue.size + (far?.queuedChunks ?? 0),
			lastGenerationMs: this.lastGenerationMs,
			averageGenerationMs: this.averageGenerationMs,
			adaptiveLevel: this.adaptive.level,
			budgetScale: this.budgetScale,
			renderDistance: this.lod.end
		};
	}

	/** Debug views changed (chunk outlines, candidate points). */
	notifyDebugChanged(): void {
		for (const record of this.records.values()) this.applyChunkLines(record);
		// Candidate points are captured at generation time.
		if (this.debug.showGrassCandidates || [...this.records.values()].some((r) => r.points))
			this.notifySettingsChanged();
	}

	dispose(): void {
		this.distant?.dispose();
		this.unloadAll();
		this.queue.clear();
		this.material.dispose();
		this.atlasTexture.dispose();
		this.group.clear();
	}

	// ------------------------------------------------------------------------------- streaming

	/** One coarse layer, generated only when chunks stream in and sharing a fixed atlas.
	 * Near generation has priority; both layers share the same per-frame time budget. */
	private syncDistantLayer(): void {
		const enabled = this.settings.enabled && this.settings.distantPatches !== false;
		if (!this.distant && !enabled) return;
		if (!this.distant) {
			this.distant = new GrassManager({
				...this.options,
				distantLayer: true,
				seed: this.currentSeed,
				settings: { ...this.settings },
				debug: { showGrassChunks: false, showGrassLod: false, showGrassCandidates: false }
			});
			this.group.add(this.distant.group);
		}
		const key = `${this.revision}:${enabled}:${this.quality.densityScale}:${this.quality.distanceScale}`;
		if (key === this.distantSyncKey) return;
		this.distantSyncKey = key;
		const far = this.distant;
		const nearEnd = this.settings.renderDistance * this.quality.distanceScale;
		Object.assign(far.settings, this.settings, {
			enabled,
			candidateSpacing: Math.max(3.2, this.settings.candidateSpacing * 8),
			renderDistance: Math.min(220, Math.max(96, nearEnd * 3)),
			lod0Distance: nearEnd,
			lod1Distance: nearEnd * 1.5,
			lod2Distance: nearEnd * 2.2,
			lod0Density: 1,
			lod1Density: 0.85,
			lod2Density: 0.6,
			playerInteraction: false
		});
		far.setQualityProfile({
			densityScale: this.quality.densityScale,
			distanceScale: 1,
			crossedCards: false,
			receiveShadows: false,
			wind: false,
			maxVisibleInstances: 6000
		});
	}

	private loadRadius(): number {
		return this.settings.renderDistance * this.quality.distanceScale + PREFETCH_MARGIN;
	}

	private refreshActiveArea(playerX: number, playerZ: number): void {
		const radius = this.loadRadius();
		const moved = Math.hypot(playerX - this.lastLoadCenter.x, playerZ - this.lastLoadCenter.y);
		if (radius === this.lastLoadRadius && moved < 4) return;
		this.lastLoadRadius = radius;
		this.lastLoadCenter.set(playerX, playerZ);
		const size = this.chunkSize;
		const minX = Math.floor((playerX - radius) / size);
		const maxX = Math.floor((playerX + radius) / size);
		const minZ = Math.floor((playerZ - radius) / size);
		const maxZ = Math.floor((playerZ + radius) / size);
		const required = new Set<ChunkKey>();
		for (let cz = minZ; cz <= maxZ; cz++) {
			for (let cx = minX; cx <= maxX; cx++) {
				const dx = Math.max(cx * size - playerX, 0, playerX - (cx + 1) * size);
				const dz = Math.max(cz * size - playerZ, 0, playerZ - (cz + 1) * size);
				if (dx * dx + dz * dz > radius * radius) continue;
				const key = chunkKey(cx, cz);
				required.add(key);
				const record = this.records.get(key);
				if ((!record || record.revision !== this.revision) && !this.queue.has(cx, cz))
					this.queue.enqueue(cx, cz, this.revision);
			}
		}
		for (const [key, record] of this.records) {
			if (required.has(key)) continue;
			this.disposeRecord(record);
			this.records.delete(key);
		}
		this.queue.pruneToRequired(required);
	}

	private processQueue(playerX: number, playerZ: number, budgetMs: number): void {
		if (this.queue.size === 0) return;
		const started = performance.now();
		const playerChunkX = Math.floor(playerX / this.chunkSize);
		const playerChunkZ = Math.floor(playerZ / this.chunkSize);
		const deferred: { chunkX: number; chunkZ: number; revision: number }[] = [];
		while (this.queue.size > 0 && performance.now() - started < budgetMs) {
			const [job] = this.queue.take(playerChunkX, playerChunkZ, 1);
			if (!job) break;
			if (job.revision !== this.revision) continue;
			if (!this.generate(job.chunkX, job.chunkZ)) deferred.push(job);
		}
		// Waiting on terrain: retry next frame (never spin on it within this one).
		for (const job of deferred) this.queue.enqueue(job.chunkX, job.chunkZ, job.revision);
	}

	/** Builds one chunk. Returns false when the terrain under it is not built yet. */
	private generate(chunkX: number, chunkZ: number): boolean {
		const started = performance.now();
		const size = this.chunkSize;
		const originX = chunkX * size;
		const originZ = chunkZ * size;
		const terrainSize = this.options.terrain.chunkSize();
		const tMinX = Math.floor(originX / terrainSize);
		const tMaxX = Math.floor((originX + size - 1e-6) / terrainSize);
		const tMinZ = Math.floor(originZ / terrainSize);
		const tMaxZ = Math.floor((originZ + size - 1e-6) / terrainSize);
		const lattices: (TerrainSurfaceLattice & { cx: number; cz: number })[] = [];
		for (let tz = tMinZ; tz <= tMaxZ; tz++) {
			for (let tx = tMinX; tx <= tMaxX; tx++) {
				const lattice = this.options.terrain.getSurfaceLattice(tx, tz);
				if (!lattice) return false;
				lattices.push({ ...lattice, cx: tx, cz: tz });
			}
		}
		const surface = (x: number, z: number, out: SurfacePoint): boolean => {
			const tx = Math.floor(x / terrainSize);
			const tz = Math.floor(z / terrainSize);
			for (const lattice of lattices)
				if (lattice.cx === tx && lattice.cz === tz) return sampleSurfaceLattice(lattice, x, z, out);
			return false;
		};

		const region = this.buildRegionGrid(originX, originZ, surface);
		const water = this.buildWaterGrid(originX, originZ);
		const exclusions = this.exclusionsFor(originX, originZ);
		const data = generateGrassChunk({
			chunkX,
			chunkZ,
			chunkSize: size,
			seedHash: this.seedHash,
			settings: this.settings,
			densityScale: this.quality.densityScale,
			surface,
			region,
			water,
			exclusions,
			collectDebug: this.debug.showGrassCandidates
		});

		const key = chunkKey(chunkX, chunkZ);
		let record = this.records.get(key);
		if (record) this.clearRecord(record);
		else {
			record = { chunkX, chunkZ, revision: this.revision, chunk: null, lines: null, points: null };
			this.records.set(key, record);
		}
		record.revision = this.revision;
		const maxHeight = this.settings.maxHeight * 1.4;
		const chunk = new GrassChunk(
			chunkX,
			chunkZ,
			size,
			data,
			this.template,
			this.material,
			maxHeight,
			Math.max(0.6, maxHeight * this.settings.widthRatio * (this.options.distantLayer ? 2.5 : 1))
		);
		record.chunk = chunk;
		this.group.add(chunk.mesh);
		if (data.debugPoints && data.debugPoints.length > 0) {
			const geometry = new THREE.BufferGeometry();
			const lifted = data.debugPoints.slice();
			for (let i = 1; i < lifted.length; i += 3) lifted[i] += 0.08;
			geometry.setAttribute('position', new THREE.BufferAttribute(lifted, 3));
			record.points = new THREE.Points(geometry, candidateMaterial);
			this.group.add(record.points);
		}
		this.applyChunkLines(record);

		this.lastGenerationMs = performance.now() - started;
		this.averageGenerationMs =
			this.averageGenerationMs === 0
				? this.lastGenerationMs
				: this.averageGenerationMs * 0.9 + this.lastGenerationMs * 0.1;
		return true;
	}

	/** Region values on a 4 m grid (biomes, forest and elevation all vary over tens of metres). */
	private buildRegionGrid(
		originX: number,
		originZ: number,
		surface: (x: number, z: number, out: SurfacePoint) => boolean
	): GrassGrid {
		const nodes = REGION_NODES;
		const spacing = this.chunkSize / (nodes - 1);
		const data = new Float32Array(nodes * nodes * REGION_CHANNELS);
		const biome = createBiomeWeights();
		const region = createGrassRegion();
		const point = createSurfacePoint();
		for (let z = 0; z < nodes; z++) {
			for (let x = 0; x < nodes; x++) {
				const wx = originX + x * spacing;
				const wz = originZ + z * spacing;
				this.options.heightSampler.sampleBiomeWeights(wx, wz, biome);
				const forest = this.options.vegetationRegionSampler.getForestDensity(wx, wz);
				const height = surface(wx, wz, point)
					? point.height
					: this.options.heightSampler.sample(wx, wz);
				sampleGrassRegion(biome, forest, height, region);
				const cover = this.options.groundCover?.(wx, wz) ?? 0;
				const k = (z * nodes + x) * REGION_CHANNELS;
				data[k + REGION_DENSITY] = region.density * (1 - cover * 0.45);
				data[k + REGION_HEIGHT] = region.heightBias * (1 - cover * 0.35);
				data[k + REGION_WARMTH] = region.warmth;
				data[k + REGION_SHORTNESS] = region.shortness;
			}
		}
		return { originX, originZ, spacing, size: nodes, channels: REGION_CHANNELS, data };
	}

	/** Water depth on a 2 m grid — only where a river or lake is actually near this chunk. */
	private buildWaterGrid(originX: number, originZ: number): GrassGrid | null {
		const { waterDepthAt, hasWaterNear } = this.options;
		if (!waterDepthAt) return null;
		const size = this.chunkSize;
		if (
			hasWaterNear &&
			!hasWaterNear(originX - 2, originZ - 2, originX + size + 2, originZ + size + 2)
		)
			return null;
		const nodes = WATER_NODES;
		const spacing = size / (nodes - 1);
		const data = new Float32Array(nodes * nodes);
		let any = false;
		for (let z = 0; z < nodes; z++) {
			for (let x = 0; x < nodes; x++) {
				// A node in water counts with a margin, so grass stops short of the waterline.
				const depth = waterDepthAt(originX + x * spacing, originZ + z * spacing);
				data[z * nodes + x] = depth > 0 ? depth + 0.25 : depth;
				if (depth > 0) any = true;
			}
		}
		return any ? { originX, originZ, spacing, size: nodes, channels: 1, data } : null;
	}

	private exclusionsFor(originX: number, originZ: number): Float32Array {
		const pad = this.options.distantLayer
			? this.settings.maxHeight * this.settings.widthRatio * 2.5
			: 0.3;
		const rects: number[] = [];
		for (const rect of this.options.getExclusions()) {
			if (
				rect.maxX + pad < originX ||
				rect.minX - pad > originX + this.chunkSize ||
				rect.maxZ + pad < originZ ||
				rect.minZ - pad > originZ + this.chunkSize
			)
				continue;
			rects.push(rect.minX - pad, rect.minZ - pad, rect.maxX + pad, rect.maxZ + pad);
		}
		return new Float32Array(rects);
	}

	/**
	 * Buildings changed: regenerate only the grass chunks under footprints that appeared, moved or
	 * disappeared — never the whole meadow.
	 */
	private syncExclusions(): void {
		const revision = this.options.getExclusionRevision();
		if (revision === this.exclusionRevision) return;
		this.exclusionRevision = revision;
		const current = new Map<string, GrassExclusion>();
		for (const rect of this.options.getExclusions()) current.set(rect.id, rect);
		const dirty: GrassExclusion[] = [];
		const signature = (r: GrassExclusion) => `${r.minX},${r.minZ},${r.maxX},${r.maxZ}`;
		for (const [id, rect] of current) {
			const previous = this.knownExclusions.get(id);
			if (previous === signature(rect)) continue;
			dirty.push(rect);
			if (previous) dirty.push(parseRect(id, previous));
		}
		for (const [id, previous] of this.knownExclusions)
			if (!current.has(id)) dirty.push(parseRect(id, previous));
		this.knownExclusions.clear();
		for (const [id, rect] of current) this.knownExclusions.set(id, signature(rect));
		const pad = this.options.distantLayer
			? this.settings.maxHeight * this.settings.widthRatio * 2.5
			: 0.5;
		for (const rect of dirty) {
			for (const record of this.records.values()) {
				const x0 = record.chunkX * this.chunkSize;
				const z0 = record.chunkZ * this.chunkSize;
				if (
					rect.maxX + pad < x0 ||
					rect.minX - pad > x0 + this.chunkSize ||
					rect.maxZ + pad < z0 ||
					rect.minZ - pad > z0 + this.chunkSize
				)
					continue;
				this.queue.enqueue(record.chunkX, record.chunkZ, this.revision);
			}
		}
	}

	private applyChunkLines(record: GrassChunkRecord): void {
		const show = this.debug.showGrassChunks;
		if (!show) {
			if (record.lines) record.lines.visible = false;
			return;
		}
		if (!record.lines) {
			const s = this.chunkSize;
			const x0 = record.chunkX * s;
			const z0 = record.chunkZ * s;
			const y = this.options.heightSampler.sample(x0 + s / 2, z0 + s / 2) + 0.3;
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute(
				'position',
				new THREE.BufferAttribute(
					new Float32Array([
						x0,
						y,
						z0,
						x0 + s,
						y,
						z0,
						x0 + s,
						y,
						z0,
						x0 + s,
						y,
						z0 + s,
						x0 + s,
						y,
						z0 + s,
						x0,
						y,
						z0 + s,
						x0,
						y,
						z0 + s,
						x0,
						y,
						z0
					]),
					3
				)
			);
			record.lines = new THREE.LineSegments(geometry, chunkLineMaterial);
			this.group.add(record.lines);
		}
		record.lines.visible = true;
	}

	private clearRecord(record: GrassChunkRecord): void {
		record.chunk?.dispose();
		record.chunk = null;
		if (record.points) {
			record.points.removeFromParent();
			record.points.geometry.dispose();
			record.points = null;
		}
	}

	private disposeRecord(record: GrassChunkRecord): void {
		this.clearRecord(record);
		if (record.lines) {
			record.lines.removeFromParent();
			record.lines.geometry.dispose();
			record.lines = null;
		}
	}

	private unloadAll(): void {
		for (const record of this.records.values()) this.disposeRecord(record);
		this.records.clear();
		this.queue.clear();
		this.lastLoadRadius = -1;
	}
}

const scratchVector = new THREE.Vector3();

function parseRect(id: string, signature: string): GrassExclusion {
	const [minX, minZ, maxX, maxZ] = signature.split(',').map(Number);
	return { id, minX, minZ, maxX, maxZ };
}
