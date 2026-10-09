import * as THREE from 'three';
import { TreePlacementGenerator, type CellEvaluation } from './TreePlacementGenerator';
import { VegetationRegionSampler } from './VegetationRegionSampler';
import type { VegetationSettings } from './VegetationTypes';
import { TreeChunk, type PlantedTree, type TreeShadowPolicy } from './trees/TreeChunk';
import type { TreeLodDistances } from './trees/treeLod';
import {
	createTreeMaterial,
	setTreeSurfaceDetail,
	type TreeSurfaceDetail,
	type TreeWindUniforms
} from './trees/treeMaterial';
import { TreePrototypeCache } from './trees/TreePrototypeCache';
import { TreeSpeciesSelector } from './trees/TreeSpeciesSelector';
import { getTreeSpecies } from './trees/treeSpecies';
import type { TreeSpeciesDefinition } from './trees/TreeSpeciesTypes';
import type { FoundationManager } from '../building/FoundationManager';
import { chunkKey, worldToChunkCoord, type ChunkKey } from '../terrain/chunkKey';
import { TerrainGenerationQueue, type ChunkJob } from '../terrain/TerrainGenerationQueue';
import { createHeightSample, type TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import type { TerrainSettings } from '../terrain/TerrainSettings';

/**
 * The stable identity of a procedural tree: its vegetation cell, and nothing else.
 *
 * This works precisely because tree existence/position/species/variant/scale are all derived from
 * `(worldSeed, cellX, cellZ)` alone (see TreePlacementGenerator) — so a cell reference is enough to
 * name a specific tree forever, in a save file or, later, in a multiplayer message, without either
 * side having sent the tree's data.
 */
export function proceduralTreeId(cellX: number, cellZ: number): string {
	return `${cellX}:${cellZ}`;
}

const treeChunkBorderMaterial = new THREE.LineBasicMaterial({ color: 0x33ccff });
const debugPointsMaterial = new THREE.PointsMaterial({
	size: 0.5,
	vertexColors: true,
	sizeAttenuation: true
});

/** Graphics-preset knobs for trees (see `GraphicsPreset.tree*`). */
export interface TreeQualityProfile {
	lodDistanceScale: number;
	densityScale: number;
	maxShadowLod: number;
	wind: boolean;
	/** Procedural bark/leaf detail level on near trees. */
	surfaceDetail: TreeSurfaceDetail;
}

const DEFAULT_QUALITY: TreeQualityProfile = {
	lodDistanceScale: 1,
	densityScale: 1,
	maxShadowLod: 0,
	wind: true,
	surfaceDetail: 2
};

interface VegetationChunkRecord {
	chunkX: number;
	chunkZ: number;
	revision: number;
	trees: TreeChunk | null;
	borderLines: THREE.LineSegments | null;
	debugPoints: THREE.Points | null;
}

export interface VegetationStats {
	loadedChunks: number;
	queuedChunks: number;
	treeInstances: number;
	revision: number;
}

/** Tuning/debug view of the tree system (see the Vegetation settings and the stats overlay). */
export interface TreeRenderStats {
	/** Trees in chunks whose batches intersect the camera frustum, per LOD. */
	visibleTreesByLod: [number, number, number, number];
	visibleTrees: number;
	/** Batches in the camera frustum = tree draw calls in the main pass. */
	visibleBatches: number;
	activeBatches: number;
	activeChunks: number;
	prototypeGeometries: number;
	prototypeTriangles: number;
	/** Prototype geometry + per-chunk instance data, bytes. */
	memoryBytes: number;
	/** Trees per LOD across all loaded chunks. */
	loadedTreesByLod: [number, number, number, number];
	/** Wall-clock milliseconds of the most recent chunk materialization. */
	lastChunkBuildMs: number;
}

export interface TreeManagerOptions {
	settings: VegetationSettings;
	terrainSettings: TerrainSettings;
	terrainHeightSampler: TerrainHeightSampler;
	foundationManager: FoundationManager;
	seed: string;
	/** Rejects trees standing in river channels and lakes. Omitted, placement ignores water. */
	waterDepthAt?: (worldX: number, worldZ: number) => number;
}

/** Horizontal canopy radius at scale 1 (metres) — for keeping crowns clear of buildings. */
function canopyRadius(species: TreeSpeciesDefinition): number {
	const canopy = species.canopy;
	if (canopy.kind === 'blobs') return canopy.width[1] / 2;
	if (canopy.kind === 'tiers') return canopy.baseRadius[1];
	return canopy.radius[1];
}

/**
 * Streams the stylised tree system around the player — see the README's "Stylised trees" section.
 *
 * Layers, kept separate:
 *   - placement: TreePlacementGenerator + TreeSpeciesSelector (where trees go, which species)
 *   - prototypes: TreePrototypeCache (shared compiled geometry per species × variant × LOD)
 *   - rendering: TreeChunk (per-chunk instanced batches per prototype × LOD, one shared material)
 *   - runtime: this class (chunk load/unload queue, budgeted LOD updates, wind, stats)
 *
 * Per-frame CPU work is: one chunk-distance check per loaded chunk, at most
 * `lodRebuildsPerFrame` chunk re-batches when the camera has moved enough, and one wind uniform.
 * No per-tree objects, updates, raycasts or animation.
 */
export class TreeManager {
	readonly group = new THREE.Group();

	private readonly settings: VegetationSettings;
	private readonly terrainSettings: TerrainSettings;
	private readonly terrainHeightSampler: TerrainHeightSampler;
	private readonly foundationManager: FoundationManager;

	private readonly vegetationRegionSampler: VegetationRegionSampler;
	private readonly speciesSelector: TreeSpeciesSelector;
	private readonly treePlacementGenerator: TreePlacementGenerator;

	private readonly prototypes: TreePrototypeCache;
	private readonly material: THREE.MeshLambertMaterial;
	private readonly wind: TreeWindUniforms;
	/** Weather wind (strength multiplier, direction, lean) — see `setWeatherWind`. */
	private readonly weatherWind = { strengthScale: 1, dirX: 0, dirZ: 1, lean: 0 };
	private quality: TreeQualityProfile = { ...DEFAULT_QUALITY };
	private proceduralSurfaces = true;
	private appliedSurfaceDetail: TreeSurfaceDetail = DEFAULT_QUALITY.surfaceDetail;

	private readonly active = new Map<ChunkKey, VegetationChunkRecord>();
	private readonly queue = new TerrainGenerationQueue();

	/**
	 * Deterministic ids of procedural trees the player has removed — the vegetation half of
	 * `ProceduralWorldOverrides`. It is the ONLY vegetation state ever persisted: every tree that
	 * still exists is regenerated from `(seed, cell)` instead.
	 */
	private removedTreeIds = new Set<string>();
	private overrideRevision = 0;

	private revision = 0;
	private lastPlayerChunkX = Number.NaN;
	private lastPlayerChunkZ = Number.NaN;
	private readonly camera = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
	private lastChunkBuildMs = 0;

	constructor(options: TreeManagerOptions) {
		this.settings = options.settings;
		this.terrainSettings = options.terrainSettings;
		this.terrainHeightSampler = options.terrainHeightSampler;
		this.foundationManager = options.foundationManager;

		this.vegetationRegionSampler = new VegetationRegionSampler(this.settings);
		this.vegetationRegionSampler.setSeed(options.seed);
		this.speciesSelector = new TreeSpeciesSelector(this.settings.species);
		this.treePlacementGenerator = new TreePlacementGenerator(
			this.terrainHeightSampler,
			this.vegetationRegionSampler,
			this.settings.trees,
			{
				speciesSelector: this.speciesSelector,
				getPrototypesPerSpecies: () => this.settings.rendering.prototypesPerSpecies,
				getDensityScale: () => this.quality.densityScale,
				waterDepthAt: options.waterDepthAt
			}
		);
		this.treePlacementGenerator.setSeed(options.seed);

		this.prototypes = new TreePrototypeCache(options.seed);
		const { material, wind } = createTreeMaterial(this.quality.surfaceDetail);
		this.material = material;
		this.wind = wind;
		this.group.name = 'trees';
	}

	getVegetationRegionSampler(): VegetationRegionSampler {
		return this.vegetationRegionSampler;
	}

	/** The persisted procedural-tree exceptions. Sorted so an unchanged world serializes to identical bytes run after run. */
	getRemovedTreeIds(): string[] {
		return [...this.removedTreeIds].sort();
	}

	/** Applied on world load, before any chunk is generated, so removed trees never appear even briefly. */
	setRemovedTreeIds(ids: Iterable<string>): void {
		this.removedTreeIds = new Set(ids);
		this.overrideRevision++;
		this.notifySettingsChanged();
	}

	/** Removes one deterministic tree, permanently for this world. Returns `false` if it was already removed. */
	removeProceduralTree(cellX: number, cellZ: number): boolean {
		const id = proceduralTreeId(cellX, cellZ);
		if (this.removedTreeIds.has(id)) return false;
		this.removedTreeIds.add(id);
		this.overrideRevision++;
		this.notifySettingsChanged();
		return true;
	}

	getOverrideRevision(): number {
		return this.overrideRevision;
	}

	/** Every tree in the world uses this ONE material — register it with the shadow pipeline once. */
	getSharedMaterials(): THREE.Material[] {
		return [this.material];
	}

	/** Applies a graphics preset's tree profile. Density changes regenerate; everything else is live. */
	setQualityProfile(profile: TreeQualityProfile): void {
		const densityChanged = profile.densityScale !== this.quality.densityScale;
		this.quality = { ...profile };
		this.applySurfaceDetail();
		this.invalidateLods();
		this.applyShadowPolicy();
		if (densityChanged) this.notifySettingsChanged();
	}

	/**
	 * Procedural bark and leaves on/off — follows Graphics → Procedural materials, so switching it
	 * off restores the plain vertex-coloured trees.
	 */
	setProceduralSurfaces(enabled: boolean): void {
		if (this.proceduralSurfaces === enabled) return;
		this.proceduralSurfaces = enabled;
		this.applySurfaceDetail();
	}

	/** The procedural surface level actually in use (0 = off). */
	getSurfaceDetail(): TreeSurfaceDetail {
		return this.proceduralSurfaces ? this.quality.surfaceDetail : 0;
	}

	private applySurfaceDetail(): void {
		const detail = this.getSurfaceDetail();
		if (detail === this.appliedSurfaceDetail) return;
		this.appliedSurfaceDetail = detail;
		setTreeSurfaceDetail(this.material, this.wind, detail);
	}

	/** Rendering settings changed (LOD distances, shadows, wind, prototype count). */
	notifyRenderingChanged(): void {
		this.invalidateLods();
		this.applyShadowPolicy();
	}

	update(playerWorldX: number, playerWorldZ: number): void {
		const chunkSize = this.terrainSettings.chunkSize;
		const playerChunkX = worldToChunkCoord(playerWorldX, chunkSize);
		const playerChunkZ = worldToChunkCoord(playerWorldZ, chunkSize);

		if (playerChunkX !== this.lastPlayerChunkX || playerChunkZ !== this.lastPlayerChunkZ) {
			this.lastPlayerChunkX = playerChunkX;
			this.lastPlayerChunkZ = playerChunkZ;
			this.refreshActiveArea(playerChunkX, playerChunkZ);
		}

		this.processQueue(playerChunkX, playerChunkZ);
	}

	/**
	 * Weather wind for the tree shader: a sway multiplier (bounded), the direction it blows toward
	 * and a steady downwind lean. Uniforms only — no per-tree work.
	 */
	setWeatherWind(wind: { strengthScale: number; dirX: number; dirZ: number; lean: number }): void {
		this.weatherWind.strengthScale = wind.strengthScale;
		this.weatherWind.dirX = wind.dirX;
		this.weatherWind.dirZ = wind.dirZ;
		this.weatherWind.lean = wind.lean;
	}

	/**
	 * Per-frame view update: advances the wind clock and re-assigns LODs for chunks the camera has
	 * moved enough relative to (nearest first, budgeted). Chunks entirely inside one LOD band skip
	 * per-tree work entirely.
	 */
	updateView(cameraPosition: THREE.Vector3, deltaSeconds: number): void {
		const rendering = this.settings.rendering;
		this.wind.uTreeTime.value = (this.wind.uTreeTime.value + deltaSeconds) % 3600;
		const windOn = rendering.windEnabled && this.quality.wind;
		this.wind.uTreeWindStrength.value = windOn
			? rendering.windStrength * this.weatherWind.strengthScale
			: 0;
		this.wind.uTreeWindDir.value.set(this.weatherWind.dirX, this.weatherWind.dirZ);
		this.wind.uTreeWindLean.value = windOn ? this.weatherWind.lean : 0;

		this.camera.copy(cameraPosition);
		const distances = this.lodDistances();
		const threshold = Math.max(0.5, rendering.lodUpdateDistance);
		const candidates: { chunk: TreeChunk; distance: number }[] = [];
		for (const record of this.active.values()) {
			const chunk = record.trees;
			if (!chunk || chunk.count === 0) continue;
			if (chunk.needsBuild) {
				candidates.push({ chunk, distance: -1 });
				continue;
			}
			const moved = chunk.lastEvaluation.distanceTo(cameraPosition);
			if (!(moved >= threshold)) continue;
			const [near] = chunk.distanceRange(cameraPosition);
			candidates.push({ chunk, distance: near });
		}
		candidates.sort((a, b) => a.distance - b.distance);
		const budget = Math.max(1, rendering.lodRebuildsPerFrame);
		let rebuilt = 0;
		for (const { chunk } of candidates) {
			if (rebuilt >= budget && !chunk.needsBuild) break;
			const changed = chunk.assignLods(cameraPosition, distances);
			if (changed || chunk.needsBuild) {
				chunk.rebuildBatches(this.prototypes, this.material, this.shadowPolicy());
				rebuilt++;
			}
		}
	}

	/** Vegetation settings changed (forest shape, tree density/scale/slope, species mix, debug overlays): regenerate visible chunks, terrain untouched. */
	notifySettingsChanged(): void {
		this.revision++;
		for (const chunk of this.active.values())
			this.queue.enqueue(chunk.chunkX, chunk.chunkZ, this.revision);
	}

	notifySeedChanged(seed: string): void {
		this.vegetationRegionSampler.setSeed(seed);
		this.treePlacementGenerator.setSeed(seed);
		this.prototypes.setWorldSeed(seed);
		this.notifySettingsChanged();
	}

	/**
	 * Terrain changed (shape, seed, or chunkSize/topology). Tree Y/slope placement reads the same
	 * TerrainHeightSampler, so visible vegetation is refreshed to stay on the new ground.
	 */
	notifyTerrainChanged(): void {
		this.notifySettingsChanged();
		this.lastPlayerChunkX = Number.NaN;
		this.lastPlayerChunkZ = Number.NaN;
	}

	notifyViewDistanceChanged(): void {
		this.lastPlayerChunkX = Number.NaN;
		this.lastPlayerChunkZ = Number.NaN;
	}

	setBorderVisibility(visible: boolean): void {
		for (const record of this.active.values()) {
			if (visible) {
				if (!record.borderLines) {
					record.borderLines = this.buildBorderLines(record.chunkX, record.chunkZ);
					this.group.add(record.borderLines);
				}
				record.borderLines.visible = true;
			} else if (record.borderLines) {
				record.borderLines.visible = false;
			}
		}
	}

	getStats(): VegetationStats {
		let treeInstances = 0;
		for (const record of this.active.values()) treeInstances += record.trees?.count ?? 0;
		return {
			loadedChunks: this.active.size,
			queuedChunks: this.queue.size,
			treeInstances,
			revision: this.revision
		};
	}

	/** Detailed tuning stats. `frustum` (the camera's) limits "visible" counts to batches on screen. */
	getRenderStats(frustum: THREE.Frustum | null): TreeRenderStats {
		const visibleTreesByLod: [number, number, number, number] = [0, 0, 0, 0];
		const loadedTreesByLod: [number, number, number, number] = [0, 0, 0, 0];
		let visibleBatches = 0;
		let activeBatches = 0;
		let activeChunks = 0;
		let memoryBytes = 0;
		const sphere = new THREE.Sphere();
		for (const record of this.active.values()) {
			const chunk = record.trees;
			if (!chunk) continue;
			activeChunks++;
			chunk.lodCounts(loadedTreesByLod);
			memoryBytes += chunk.memoryBytes();
			for (const mesh of chunk.getBatches()) {
				activeBatches++;
				if (!mesh.boundingSphere) continue;
				sphere.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
				if (frustum && !frustum.intersectsSphere(sphere)) continue;
				visibleBatches++;
				visibleTreesByLod[mesh.userData.treeLod as number] += mesh.count;
			}
		}
		const prototypeStats = this.prototypes.getStats();
		return {
			visibleTreesByLod,
			visibleTrees: visibleTreesByLod.reduce((a, b) => a + b, 0),
			visibleBatches,
			activeBatches,
			activeChunks,
			prototypeGeometries: prototypeStats.geometries,
			prototypeTriangles: prototypeStats.triangles,
			memoryBytes: memoryBytes + prototypeStats.bytes,
			loadedTreesByLod,
			lastChunkBuildMs: this.lastChunkBuildMs
		};
	}

	dispose(): void {
		for (const record of this.active.values()) this.disposeChunkRecord(record);
		this.active.clear();
		this.queue.clear();
		this.prototypes.dispose();
		this.material.dispose();
		this.group.clear();
	}

	private lodDistances(): TreeLodDistances {
		const rendering = this.settings.rendering;
		const scale = this.quality.lodDistanceScale;
		return {
			lod1: rendering.lod1Distance * scale,
			lod2: Math.max(rendering.lod1Distance, rendering.lod2Distance) * scale,
			lod3: Math.max(rendering.lod2Distance, rendering.lod3Distance) * scale,
			hysteresis: rendering.lodHysteresis
		};
	}

	private shadowPolicy(): TreeShadowPolicy {
		return {
			castShadows: this.settings.rendering.castShadows,
			maxShadowLod: this.quality.maxShadowLod
		};
	}

	private invalidateLods(): void {
		for (const record of this.active.values())
			record.trees?.lastEvaluation.set(Number.NaN, Number.NaN, Number.NaN);
	}

	private applyShadowPolicy(): void {
		const policy = this.shadowPolicy();
		for (const record of this.active.values()) record.trees?.applyShadowPolicy(policy);
	}

	private refreshActiveArea(playerChunkX: number, playerChunkZ: number): void {
		const viewDistance = this.settings.loading.treeViewDistanceChunks;
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

		for (const [key, record] of this.active) {
			if (!required.has(key)) {
				this.disposeChunkRecord(record);
				this.active.delete(key);
			}
		}

		this.queue.pruneToRequired(required);
	}

	private processQueue(playerChunkX: number, playerChunkZ: number): void {
		const jobs = this.queue.take(
			playerChunkX,
			playerChunkZ,
			this.settings.loading.treeChunksGeneratedPerFrame
		);
		for (const job of jobs) this.materializeJob(job);
	}

	/** True when a tree's trunk or (with buildingClearance) crown would intersect a foundation. */
	private blockedByBuilding(worldX: number, worldZ: number, radius: number): boolean {
		const fm = this.foundationManager;
		if (fm.getTopYAt(worldX, worldZ) !== null) return true;
		if (!this.settings.trees.buildingClearance || radius <= 0) return false;
		for (let i = 0; i < 8; i++) {
			const angle = (i / 8) * Math.PI * 2;
			if (
				fm.getTopYAt(worldX + Math.cos(angle) * radius, worldZ + Math.sin(angle) * radius) !== null
			)
				return true;
		}
		return false;
	}

	private materializeJob(job: ChunkJob): void {
		if (job.revision !== this.revision) return;
		const started = typeof performance !== 'undefined' ? performance.now() : 0;

		const key = chunkKey(job.chunkX, job.chunkZ);
		let record = this.active.get(key);
		if (record) {
			this.clearChunk(record);
		} else {
			record = {
				chunkX: job.chunkX,
				chunkZ: job.chunkZ,
				revision: job.revision,
				trees: null,
				borderLines: null,
				debugPoints: null
			};
			this.active.set(key, record);
		}
		record.revision = job.revision;

		const chunkSize = this.terrainSettings.chunkSize;
		const cellSize = this.settings.trees.treeCellSize;
		const originX = job.chunkX * chunkSize;
		const originZ = job.chunkZ * chunkSize;

		// The cell whose *origin* falls in [originX, originX + chunkSize) belongs to this chunk —
		// works for any chunkSize/cellSize ratio and negative coordinates.
		const cellMinX = Math.ceil(originX / cellSize);
		const cellMaxX = Math.ceil((originX + chunkSize) / cellSize) - 1;
		const cellMinZ = Math.ceil(originZ / cellSize);
		const cellMaxZ = Math.ceil((originZ + chunkSize) / cellSize) - 1;

		const collectDebug =
			this.settings.debug.showTreeCells || this.settings.debug.showRejectedTreeCandidates;
		const debugEvaluations: CellEvaluation[] = [];
		const planted: PlantedTree[] = [];
		const maxTrees = Math.max(0, this.settings.trees.maxTreesPerChunk);
		const sample = createHeightSample();

		for (let cx = cellMinX; cx <= cellMaxX; cx++) {
			for (let cz = cellMinZ; cz <= cellMaxZ; cz++) {
				const evaluation = this.treePlacementGenerator.evaluateCell(cx, cz);
				if (collectDebug) debugEvaluations.push(evaluation);
				const tree = evaluation.tree;
				if (!evaluation.accepted || !tree) continue;
				if (planted.length >= maxTrees) continue;
				// The world save stores *exceptions* to the deterministic forest, never the forest itself.
				if (this.removedTreeIds.has(proceduralTreeId(cx, cz))) continue;
				const crown =
					canopyRadius(getTreeSpecies(tree.speciesId)) * tree.scale * tree.widthScale * 0.7;
				if (this.blockedByBuilding(tree.worldX, tree.worldZ, crown)) continue;
				this.terrainHeightSampler.sampleWithNormal(tree.worldX, tree.worldZ, sample);
				planted.push({ tree, groundY: sample.height, normalY: sample.normalY });
			}
		}

		const chunk = new TreeChunk(job.chunkX, job.chunkZ, planted);
		record.trees = chunk;
		this.group.add(chunk.group);
		// Build immediately when we know where the camera is, so a chunk never appears late.
		if (Number.isFinite(this.camera.x) && chunk.count > 0) {
			chunk.assignLods(this.camera, this.lodDistances());
			chunk.rebuildBatches(this.prototypes, this.material, this.shadowPolicy());
		}

		this.updateChunkDebugVisuals(record, debugEvaluations);
		if (this.settings.debug.showTreeChunkBorders && !record.borderLines) {
			record.borderLines = this.buildBorderLines(job.chunkX, job.chunkZ);
			this.group.add(record.borderLines);
		}
		if (started) this.lastChunkBuildMs = performance.now() - started;
	}

	private clearChunk(record: VegetationChunkRecord): void {
		record.trees?.dispose();
		record.trees = null;
		if (record.debugPoints) {
			this.group.remove(record.debugPoints);
			record.debugPoints.geometry.dispose();
			record.debugPoints = null;
		}
	}

	private disposeChunkRecord(record: VegetationChunkRecord): void {
		this.clearChunk(record);
		if (record.borderLines) {
			this.group.remove(record.borderLines);
			record.borderLines.geometry.dispose();
			record.borderLines = null;
		}
	}

	private updateChunkDebugVisuals(
		record: VegetationChunkRecord,
		evaluations: CellEvaluation[]
	): void {
		const showCells = this.settings.debug.showTreeCells;
		const showRejected = this.settings.debug.showRejectedTreeCandidates;
		if (!showCells && !showRejected) return;

		const positions: number[] = [];
		const colors: number[] = [];

		for (const evaluation of evaluations) {
			if (evaluation.accepted ? !showCells : !showRejected) continue;
			positions.push(
				evaluation.worldX,
				this.terrainHeightSampler.sample(evaluation.worldX, evaluation.worldZ) + 0.3,
				evaluation.worldZ
			);
			if (evaluation.accepted) colors.push(0.3, 1, 0.3);
			else {
				const isSlope = evaluation.rejectionReason === 'slope';
				colors.push(isSlope ? 1 : 0.55, 0.3, isSlope ? 0.3 : 0.85);
			}
		}

		if (positions.length === 0) return;

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		const points = new THREE.Points(geometry, debugPointsMaterial);
		this.group.add(points);
		record.debugPoints = points;
	}

	private buildBorderLines(chunkX: number, chunkZ: number): THREE.LineSegments {
		const chunkSize = this.terrainSettings.chunkSize;
		const originX = chunkX * chunkSize;
		const originZ = chunkZ * chunkSize;
		const corners: [number, number][] = [
			[originX, originZ],
			[originX + chunkSize, originZ],
			[originX + chunkSize, originZ + chunkSize],
			[originX, originZ + chunkSize]
		];

		const positions = new Float32Array(4 * 2 * 3);
		let i = 0;
		for (let c = 0; c < 4; c++) {
			const [x0, z0] = corners[c];
			const [x1, z1] = corners[(c + 1) % 4];
			const y0 = this.terrainHeightSampler.sample(x0, z0) + 0.15;
			const y1 = this.terrainHeightSampler.sample(x1, z1) + 0.15;
			positions[i++] = x0;
			positions[i++] = y0;
			positions[i++] = z0;
			positions[i++] = x1;
			positions[i++] = y1;
			positions[i++] = z1;
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		return new THREE.LineSegments(geometry, treeChunkBorderMaterial);
	}
}
