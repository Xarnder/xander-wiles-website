import * as THREE from 'three';
import { chunkKey, type ChunkKey } from '../../terrain/chunkKey';
import { TerrainGenerationQueue } from '../../terrain/TerrainGenerationQueue';
import { createBiomeWeights, type TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import {
	sampleSurfaceLattice,
	type SurfacePoint,
	type TerrainSurfaceLattice
} from '../../terrain/terrainSurfaceLattice';
import { hashStringToUint32 } from '../../terrain/seededRandom';
import type { GrassExclusion } from '../grass/GrassManager';
import { GrassAdaptiveQuality, grassAdaptiveFactors, type GrassLodState } from '../grass/grassLod';
import type { GrassGrid } from '../grass/grassPlacement';
import type { VegetationRegionSampler } from '../VegetationRegionSampler';
import { generatePlantAtlas, type PlantAtlas } from './plantAtlas';
import { PlantCardChunk } from './PlantCardChunk';
import { PlantEcology, plantColony } from './plantEcology';
import type { TerrainGroundTint } from '../../terrain/TerrainChunk';
import { smoothstep } from '../../terrain/mathUtils';
import {
	createPlantAtlasTexture,
	createPlantCardTemplate,
	createPlantMaterials,
	createPlantUniforms,
	plantAtlasBytes,
	PLANT_CARD_TRIANGLES,
	type PlantUniforms
} from './plantMaterial';
import {
	ENV_CHANNELS,
	ENV_FOREST,
	ENV_OPENNESS,
	ENV_WET,
	generatePlantChunk,
	type PlantChunkData
} from './plantPlacement';
import {
	plantPrototypeKey,
	PlantPrototypeCache,
	type PlantPrototypeEntry
} from './PlantPrototypeCache';
import {
	PLANT_CHUNK_SIZE,
	PLANT_GENERATOR_VERSION,
	type PlantQualityProfile,
	type PlantSettings
} from './PlantTypes';

export interface PlantDebugSettings {
	showPlantChunks: boolean;
	showPlantSpecies: boolean;
	showPlantLod: boolean;
	showPlantCandidates: boolean;
	showColonyFields: boolean;
}

export interface PlantManagerOptions {
	settings: PlantSettings;
	debug: PlantDebugSettings;
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
	waterDepthAt?: (worldX: number, worldZ: number) => number;
	hasWaterNear?: (minX: number, minZ: number, maxX: number, maxZ: number) => boolean;
	now?: () => number;
}

export interface PlantRenderStats {
	enabled: boolean;
	/** Plants drawn as real geometry (near ring) and as cards (in the frustum). */
	nearInstances: number;
	cardInstances: number;
	/** Cards by LOD band (by chunk nearest distance): LOD1 / LOD2. */
	cardLodInstances: [number, number];
	nearDrawCalls: number;
	cardDrawCalls: number;
	triangles: number;
	activeChunks: number;
	loadedPlants: number;
	/** Distinct species in loaded chunks, and prototypes compiled for the near ring. */
	activeSpecies: number;
	prototypes: number;
	prototypeTriangles: number;
	prototypeCompiles: number;
	/** Instance buffers + prototypes + atlas, bytes. */
	bufferBytes: number;
	atlasBytes: number;
	queuedChunks: number;
	lastGenerationMs: number;
	averageGenerationMs: number;
	adaptiveLevel: number;
	budgetScale: number;
	renderDistance: number;
}

const DEFAULT_QUALITY: PlantQualityProfile = {
	densityScale: 1,
	distanceScale: 1,
	nearScale: 1,
	speciesScale: 1,
	maxPrototypes: 3,
	receiveShadows: true,
	wind: true,
	maxVisibleInstances: 14000
};

const GENERATION_BUDGET_MS = 3;
const PREFETCH_MARGIN = 12;
const ENV_NODES = 5;
const WATER_MARGIN = 12;
const WATER_SPACING = 4;
/** Rebuild the near ring after the camera moves this far (metres). */
const NEAR_REBUILD_DISTANCE = 1.5;
/** Prototype geometry idle this long is released. */
const PROTOTYPE_IDLE_MS = 20_000;
const PLAYER_PUSH_RADIUS = 0.8;

const chunkLineMaterial = new THREE.LineBasicMaterial({ color: 0xff8ad8 });
const debugPointsMaterial = new THREE.PointsMaterial({
	size: 0.22,
	vertexColors: true,
	sizeAttenuation: true
});

interface PlantChunkRecord {
	chunkX: number;
	chunkZ: number;
	revision: number;
	data: PlantChunkData | null;
	cards: PlantCardChunk | null;
	lines: THREE.LineSegments | null;
	points: THREE.Points | null;
}

/** One prototype's instanced batch in the near ring (one draw call). */
interface NearBatch {
	key: string;
	entry: PlantPrototypeEntry;
	geometry: THREE.InstancedBufferGeometry;
	mesh: THREE.Mesh;
	roots: THREE.InstancedBufferAttribute;
	instances: THREE.InstancedBufferAttribute;
	capacity: number;
	count: number;
}

/**
 * Streams procedural flowers and ground plants — see the README's "Flowers and ground plants".
 *
 *   species      plantSpecies.ts / plantEcology.ts (regions → active species, generated on demand)
 *   placement    plantPlacement.ts (pure; per spacing class, colonies, habitat, exclusions)
 *   near (LOD0)  lazily compiled prototypes (PlantPrototypeCache), one instanced batch per
 *                prototype for the plants within ~11 m — rebuilt as the camera moves a metre or two
 *   far (cards)  PlantCardChunk: every plant in a 32 m chunk as one card, one draw call
 *   shared       one atlas, one card template, two materials
 *
 * Per frame: uniforms, one distance test per chunk, and (after the camera has moved 1.5 m) a near
 * ring rebuild over the handful of chunks around it. No per-plant updates, no CPU wind.
 */
export class PlantManager {
	readonly group = new THREE.Group();

	private readonly settings: PlantSettings;
	private readonly debug: PlantDebugSettings;
	private readonly options: PlantManagerOptions;
	private readonly atlas: PlantAtlas;
	private readonly atlasTexture: THREE.DataTexture;
	private readonly uniforms: PlantUniforms = createPlantUniforms();
	private readonly materials: { near: THREE.MeshLambertMaterial; card: THREE.MeshLambertMaterial };
	private readonly cardTemplate = createPlantCardTemplate();
	private readonly prototypes = new PlantPrototypeCache();
	private readonly now: () => number;
	private ecology!: PlantEcology;
	private seedHash = 0;

	private quality: PlantQualityProfile = { ...DEFAULT_QUALITY };
	private readonly adaptive = new GrassAdaptiveQuality();
	private adaptiveEnabled = true;
	private budgetScale = 1;
	private lod: GrassLodState = {
		lod0: 11,
		lod1: 26,
		lod2: 40,
		end: 52,
		density0: 1,
		density1: 0.5,
		density2: 0.2
	};

	private readonly records = new Map<ChunkKey, PlantChunkRecord>();
	private readonly queue = new TerrainGenerationQueue();
	private readonly nearBatches = new Map<string, NearBatch>();
	private readonly nearCentre = new THREE.Vector2(Number.NaN, Number.NaN);
	private nearDirty = true;
	private revision = 0;
	private terrainRevision = -1;
	private exclusionRevision = -1;
	private readonly knownExclusions = new Map<string, string>();
	private readonly lastLoadCenter = new THREE.Vector2(Number.NaN, Number.NaN);
	private lastLoadRadius = -1;
	private readonly weather = { strengthScale: 1, dirX: 0, dirZ: 1, lean: 0, wetness: 0 };
	private lastGenerationMs = 0;
	private averageGenerationMs = 0;
	private lastPruneMs = 0;

	constructor(options: PlantManagerOptions) {
		this.options = options;
		this.settings = options.settings;
		this.debug = options.debug;
		this.now = options.now ?? (() => performance.now());
		this.atlas = generatePlantAtlas(64);
		this.atlasTexture = createPlantAtlasTexture(this.atlas);
		this.materials = createPlantMaterials(this.atlasTexture, this.uniforms);
		this.group.name = 'plants';
		this.setSeed(options.seed);
	}

	getSharedMaterials(): THREE.Material[] {
		return [this.materials.near, this.materials.card];
	}

	setSeed(seed: string): void {
		const version = this.settings.generatorVersion || PLANT_GENERATOR_VERSION;
		this.seedHash = hashStringToUint32(`plants:v${version}:${seed}`, 0x9147);
		this.ecology = new PlantEcology({
			seedHash: this.seedHash,
			speciesScale: () => Math.max(0.2, this.settings.speciesCount * this.quality.speciesScale)
		});
		this.notifySettingsChanged();
	}

	setQualityProfile(profile: PlantQualityProfile): void {
		const regenerate =
			profile.densityScale !== this.quality.densityScale ||
			profile.speciesScale !== this.quality.speciesScale ||
			profile.maxPrototypes !== this.quality.maxPrototypes;
		this.quality = { ...profile };
		this.lastLoadRadius = -1;
		this.nearDirty = true;
		if (regenerate) this.notifySettingsChanged();
	}

	notifySettingsChanged(): void {
		this.revision++;
		this.lastLoadRadius = -1;
		this.nearDirty = true;
		for (const record of this.records.values())
			this.queue.enqueue(record.chunkX, record.chunkZ, this.revision);
	}

	setWeather(
		wind: { strengthScale: number; dirX: number; dirZ: number; lean: number },
		wetness: number
	): void {
		Object.assign(this.weather, wind, { wetness });
	}

	setPerformance(deltaSeconds: number, smoothedFps: number, targetFps: number): void {
		this.adaptive.update(deltaSeconds, smoothedFps, targetFps, this.adaptiveEnabled);
	}

	setAdaptiveEnabled(enabled: boolean): void {
		this.adaptiveEnabled = enabled;
		if (!enabled) this.adaptive.level = 1;
	}

	/**
	 * Distant flower colour for the terrain: where flower colonies are strong, the ground's vertex
	 * colour leans (at most ~18 %) toward their petal colours, so a meadow stays yellow, purple or
	 * white beyond the last plant card. Evaluated once per terrain vertex at generation — nothing per
	 * frame. Ground plants and forest-floor shade are left to the terrain's own colours.
	 */
	terrainTint(): TerrainGroundTint {
		return (x, z, height, colors, offset) => {
			const settings = this.settings;
			if (!settings.enabled || !settings.terrainTint || settings.flowerDensity <= 0) return;
			let r = 0;
			let g = 0;
			let b = 0;
			let total = 0;
			for (const species of this.ecology.speciesAt(x, z)) {
				if (species.kind !== 'flower') continue;
				const [e0, e1] = species.growth.habitat.elevation;
				const band = smoothstep(e0 - 10, e0, height) * (1 - smoothstep(e1, e1 + 18, height));
				if (band <= 0) continue;
				const colony = plantColony(species, x, z);
				if (colony <= 0) continue;
				const w =
					colony * band * species.growth.density * (species.growth.spacing === 'tiny' ? 0.6 : 1);
				r += species.palette.petalBase[0] * w;
				g += species.palette.petalBase[1] * w;
				b += species.palette.petalBase[2] * w;
				total += w;
			}
			if (total <= 0) return;
			const amount = Math.min(0.18, total * 0.12 * Math.min(1.5, settings.flowerDensity));
			colors[offset] += (r / total - colors[offset]) * amount;
			colors[offset + 1] += (g / total - colors[offset + 1]) * amount;
			colors[offset + 2] += (b / total - colors[offset + 2]) * amount;
		};
	}

	/**
	 * How strongly flower colonies hold a spot (0..1) — grass grows sparser and shorter there, so the
	 * flowers stand out of the meadow instead of drowning in it (one shared local vegetation budget).
	 */
	flowerCover(x: number, z: number): number {
		if (!this.settings.enabled || this.settings.flowerDensity <= 0) return 0;
		let cover = 0;
		for (const species of this.ecology.speciesAt(x, z)) {
			if (species.kind !== 'flower') continue;
			cover += plantColony(species, x, z) * species.growth.density;
		}
		return Math.min(1, cover * 0.8 * Math.min(1.5, this.settings.flowerDensity));
	}

	/** The species a region uses (Plant Lab / debugging). */
	getEcology(): PlantEcology {
		return this.ecology;
	}

	update(playerX: number, playerZ: number): void {
		const enabled = this.settings.enabled;
		this.group.visible = enabled;
		if (!enabled) {
			if (this.records.size > 0 || this.nearBatches.size > 0) {
				this.unloadAll();
				this.releaseNear();
			}
			return;
		}
		const terrainRevision = this.options.terrain.getRevision();
		if (terrainRevision !== this.terrainRevision) {
			this.terrainRevision = terrainRevision;
			this.notifySettingsChanged();
		}
		this.syncExclusions();
		this.refreshActiveArea(playerX, playerZ);
		this.processQueue(playerX, playerZ);
	}

	updateView(
		camera: THREE.Camera,
		deltaSeconds: number,
		player: { x: number; feetY: number; z: number }
	): void {
		const u = this.uniforms;
		u.uPlantTime.value = (u.uPlantTime.value + deltaSeconds) % 3600;
		const windOn = this.quality.wind;
		const wind = this.settings.windStrength;
		u.uPlantWind.value.set(
			this.weather.dirX,
			this.weather.dirZ,
			windOn ? 0.5 * wind * Math.min(2.5, this.weather.strengthScale) : 0,
			windOn ? Math.min(0.8, 0.12 * wind + this.weather.lean * 0.5) : 0
		);
		u.uPlantPlayer.value.set(player.x, player.feetY, player.z, PLAYER_PUSH_RADIUS);
		u.uPlantMisc.value.y = Math.min(1, this.weather.wetness) * 0.14;
		u.uPlantMisc.value.z = this.debug.showPlantSpecies ? 1 : 0;
		u.uPlantMisc.value.w = this.debug.showPlantLod ? 1 : 0;
		this.materials.near.alphaTest = this.settings.alphaTest;
		this.materials.card.alphaTest = this.settings.alphaTest;

		this.lod = this.resolveLod();
		u.uPlantLod.value.set(this.lod.lod0, this.lod.lod1, this.lod.lod2, this.lod.end);
		u.uPlantDensity.value.x = this.lod.density0;
		u.uPlantDensity.value.y = this.lod.density1;
		u.uPlantDensity.value.z = this.lod.density2;

		const cameraPosition = camera.getWorldPosition(scratch);
		let total = 0;
		for (const record of this.records.values())
			if (record.cards)
				total += record.cards.updateView(
					cameraPosition.x,
					cameraPosition.z,
					this.lod,
					this.quality.receiveShadows
				);

		if (
			this.nearDirty ||
			Math.hypot(cameraPosition.x - this.nearCentre.x, cameraPosition.z - this.nearCentre.y) >
				NEAR_REBUILD_DISTANCE
		) {
			this.rebuildNearRing(cameraPosition.x, cameraPosition.z);
		}
		for (const batch of this.nearBatches.values()) {
			batch.mesh.visible = batch.count > 0;
			batch.mesh.receiveShadow = this.quality.receiveShadows;
			total += batch.count;
		}
		this.updateBudget(total);
	}

	private resolveLod(): GrassLodState {
		const s = this.settings;
		const a = grassAdaptiveFactors(this.adaptive.level);
		const distance = this.quality.distanceScale * a.distance;
		const end = Math.max(2, s.renderDistance * distance);
		const lod2 = Math.min(end, s.lod2Distance * distance);
		const lod1 = Math.min(lod2, s.lod1Distance * distance);
		const lod0 = Math.min(lod1, s.lod0Distance * this.quality.nearScale);
		const budget = Math.min(1, this.budgetScale);
		return {
			lod0,
			lod1,
			lod2,
			end,
			density0: Math.min(1, s.lod0Density * a.nearDensity * budget),
			density1: Math.min(1, s.lod1Density * a.midDensity * budget),
			density2: Math.min(1, s.lod2Density * a.farDensity * budget)
		};
	}

	private updateBudget(total: number): void {
		const max = this.quality.maxVisibleInstances;
		if (total > max) this.budgetScale = Math.max(0.3, this.budgetScale * (max / total) * 0.98);
		else if (total < max * 0.85 && this.budgetScale < 1)
			this.budgetScale = Math.min(1, this.budgetScale + 0.01);
	}

	/**
	 * The near ring: every plant within the near cut (plus the crossfade band) goes into its
	 * prototype's instanced batch. Prototypes compile on first need; batches grow as required and
	 * are released with their prototype when idle.
	 */
	private rebuildNearRing(cameraX: number, cameraZ: number): void {
		this.nearDirty = false;
		this.nearCentre.set(cameraX, cameraZ);
		const now = this.now();
		const radius = this.lod.lod0 + NEAR_REBUILD_DISTANCE + 0.5;
		const radiusSq = radius * radius;
		const lists = new Map<
			string,
			{ entry: PlantPrototypeEntry; roots: number[]; bytes: number[] }
		>();
		for (const record of this.records.values()) {
			const data = record.data;
			if (!data || !record.cards || record.cards.distanceTo(cameraX, cameraZ) > radius) continue;
			for (let i = 0; i < data.count; i++) {
				const dx = data.positions[i * 3] - cameraX;
				const dz = data.positions[i * 3 + 2] - cameraZ;
				if (dx * dx + dz * dz > radiusSq) continue;
				const species = data.species[data.speciesIndex[i]];
				const key = plantPrototypeKey(species.id, data.prototype[i]);
				let list = lists.get(key);
				if (!list) {
					list = {
						entry: this.prototypes.acquire(species, data.prototype[i], now),
						roots: [],
						bytes: []
					};
					lists.set(key, list);
				}
				list.roots.push(
					data.positions[i * 3],
					data.positions[i * 3 + 1],
					data.positions[i * 3 + 2]
				);
				list.bytes.push(
					data.instance[i * 4],
					data.instance[i * 4 + 1],
					data.instance[i * 4 + 2],
					data.instance[i * 4 + 3]
				);
			}
		}
		for (const [key, batch] of this.nearBatches) {
			if (!lists.has(key)) batch.count = 0;
		}
		for (const [key, list] of lists) {
			let batch = this.nearBatches.get(key);
			const count = list.roots.length / 3;
			if (!batch || batch.capacity < count) {
				if (batch) this.disposeBatch(batch);
				batch = this.createBatch(list.entry, Math.max(16, Math.ceil(count * 1.5)));
				this.nearBatches.set(key, batch);
			}
			(batch.roots.array as Float32Array).set(list.roots);
			(batch.instances.array as Uint8Array).set(list.bytes);
			batch.roots.needsUpdate = true;
			batch.instances.needsUpdate = true;
			batch.roots.clearUpdateRanges();
			batch.roots.addUpdateRange(0, count * 3);
			batch.instances.clearUpdateRanges();
			batch.instances.addUpdateRange(0, count * 4);
			batch.count = count;
			batch.geometry.instanceCount = count;
			batch.entry.lastUsedMs = now;
		}
		// Idle prototypes go every 5 s; past the size cap (fast travel) they go immediately.
		if (now - this.lastPruneMs > 5000 || this.prototypes.size > this.prototypes.maxEntries) {
			this.lastPruneMs = now;
			const inUse = new Set(
				[...this.nearBatches.values()].filter((b) => b.count > 0).map((b) => b.key)
			);
			for (const key of this.prototypes.prune(now, PROTOTYPE_IDLE_MS, inUse)) {
				const batch = this.nearBatches.get(key);
				if (batch) this.disposeBatch(batch);
				this.nearBatches.delete(key);
			}
		}
	}

	private createBatch(entry: PlantPrototypeEntry, capacity: number): NearBatch {
		const g = entry.geometry;
		const geometry = new THREE.InstancedBufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
		geometry.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
		geometry.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
		geometry.setAttribute('aColorA', new THREE.BufferAttribute(g.colors, 3));
		geometry.setAttribute('aColorB', new THREE.BufferAttribute(g.colors2, 3));
		geometry.setAttribute('aPlant', new THREE.BufferAttribute(g.plant, 4));
		geometry.setIndex(new THREE.BufferAttribute(g.indices, 1));
		const roots = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
		roots.setUsage(THREE.DynamicDrawUsage);
		const instances = new THREE.InstancedBufferAttribute(new Uint8Array(capacity * 4), 4, true);
		instances.setUsage(THREE.DynamicDrawUsage);
		geometry.setAttribute('aPlantRoot', roots);
		geometry.setAttribute('aPlantInst', instances);
		geometry.instanceCount = 0;
		const mesh = new THREE.Mesh(geometry, this.materials.near);
		mesh.name = `plant-near:${entry.key}`;
		// The ring follows the camera: always on screen when it has plants, so no culling bounds.
		mesh.frustumCulled = false;
		mesh.castShadow = false;
		mesh.matrixAutoUpdate = false;
		this.group.add(mesh);
		return { key: entry.key, entry, geometry, mesh, roots, instances, capacity, count: 0 };
	}

	private disposeBatch(batch: NearBatch): void {
		batch.mesh.removeFromParent();
		batch.geometry.dispose();
	}

	getRenderStats(frustum: THREE.Frustum | null): PlantRenderStats {
		let cardInstances = 0;
		const cardLodInstances: [number, number] = [0, 0];
		let cardDrawCalls = 0;
		let loaded = 0;
		let bytes = 0;
		let active = 0;
		const species = new Set<string>();
		const sphere = new THREE.Sphere();
		for (const record of this.records.values()) {
			const cards = record.cards;
			if (!cards || !record.data) continue;
			active++;
			loaded += cards.count;
			bytes += cards.bufferBytes + record.data.count * 7;
			for (const s of record.data.species) species.add(s.id);
			if (!cards.mesh.visible) continue;
			const bounds = cards.mesh.geometry.boundingSphere;
			if (frustum && bounds && !frustum.intersectsSphere(sphere.copy(bounds))) continue;
			cardDrawCalls++;
			cardInstances += cards.drawn;
			cardLodInstances[cards.nearestDistance < this.lod.lod1 ? 0 : 1] += cards.drawn;
		}
		let nearInstances = 0;
		let nearDrawCalls = 0;
		let nearTriangles = 0;
		for (const batch of this.nearBatches.values()) {
			bytes += batch.capacity * 16;
			if (batch.count === 0) continue;
			nearDrawCalls++;
			nearInstances += batch.count;
			nearTriangles += batch.count * batch.entry.geometry.triangles;
		}
		const proto = this.prototypes.stats();
		const atlasBytes = plantAtlasBytes(this.atlas);
		return {
			enabled: this.settings.enabled,
			nearInstances,
			cardInstances,
			cardLodInstances,
			nearDrawCalls,
			cardDrawCalls,
			triangles: nearTriangles + cardInstances * PLANT_CARD_TRIANGLES,
			activeChunks: active,
			loadedPlants: loaded,
			activeSpecies: species.size,
			prototypes: proto.prototypes,
			prototypeTriangles: proto.triangles,
			prototypeCompiles: proto.compiles,
			bufferBytes: bytes + proto.bytes + atlasBytes,
			atlasBytes,
			queuedChunks: this.queue.size,
			lastGenerationMs: this.lastGenerationMs,
			averageGenerationMs: this.averageGenerationMs,
			adaptiveLevel: this.adaptive.level,
			budgetScale: this.budgetScale,
			renderDistance: this.lod.end
		};
	}

	notifyDebugChanged(): void {
		for (const record of this.records.values()) this.applyChunkLines(record);
		if (
			this.debug.showPlantCandidates ||
			this.debug.showColonyFields ||
			[...this.records.values()].some((r) => r.points)
		)
			this.notifySettingsChanged();
	}

	dispose(): void {
		this.unloadAll();
		this.releaseNear();
		this.materials.near.dispose();
		this.materials.card.dispose();
		this.atlasTexture.dispose();
		this.group.clear();
	}

	// ------------------------------------------------------------------------------- streaming

	private refreshActiveArea(playerX: number, playerZ: number): void {
		const radius = this.settings.renderDistance * this.quality.distanceScale + PREFETCH_MARGIN;
		const moved = Math.hypot(playerX - this.lastLoadCenter.x, playerZ - this.lastLoadCenter.y);
		if (radius === this.lastLoadRadius && moved < 6) return;
		this.lastLoadRadius = radius;
		this.lastLoadCenter.set(playerX, playerZ);
		const size = PLANT_CHUNK_SIZE;
		const required = new Set<ChunkKey>();
		for (
			let cz = Math.floor((playerZ - radius) / size);
			cz <= Math.floor((playerZ + radius) / size);
			cz++
		) {
			for (
				let cx = Math.floor((playerX - radius) / size);
				cx <= Math.floor((playerX + radius) / size);
				cx++
			) {
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
			this.nearDirty = true;
		}
		this.queue.pruneToRequired(required);
	}

	private processQueue(playerX: number, playerZ: number): void {
		if (this.queue.size === 0) return;
		const started = this.now();
		const px = Math.floor(playerX / PLANT_CHUNK_SIZE);
		const pz = Math.floor(playerZ / PLANT_CHUNK_SIZE);
		const deferred: { chunkX: number; chunkZ: number; revision: number }[] = [];
		while (this.queue.size > 0 && this.now() - started < GENERATION_BUDGET_MS) {
			const [job] = this.queue.take(px, pz, 1);
			if (!job) break;
			if (job.revision !== this.revision) continue;
			if (!this.generate(job.chunkX, job.chunkZ)) deferred.push(job);
		}
		for (const job of deferred) this.queue.enqueue(job.chunkX, job.chunkZ, job.revision);
	}

	private generate(chunkX: number, chunkZ: number): boolean {
		const started = this.now();
		const size = PLANT_CHUNK_SIZE;
		const originX = chunkX * size;
		const originZ = chunkZ * size;
		const terrainSize = this.options.terrain.chunkSize();
		const lattices: (TerrainSurfaceLattice & { cx: number; cz: number })[] = [];
		for (
			let tz = Math.floor(originZ / terrainSize);
			tz <= Math.floor((originZ + size - 1e-6) / terrainSize);
			tz++
		) {
			for (
				let tx = Math.floor(originX / terrainSize);
				tx <= Math.floor((originX + size - 1e-6) / terrainSize);
				tx++
			) {
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
		const water = this.buildWater(originX, originZ);
		const data = generatePlantChunk({
			chunkX,
			chunkZ,
			chunkSize: size,
			seedHash: this.seedHash,
			settings: this.settings,
			quality: this.quality,
			speciesAt: (x, z) => this.ecology.speciesAt(x, z),
			surface,
			environment: this.buildEnvironment(originX, originZ, water?.wetNodes ?? null),
			water: water?.grid ?? null,
			exclusions: this.exclusionsFor(originX, originZ),
			collectDebug: this.debug.showPlantCandidates || this.debug.showColonyFields
		});

		const key = chunkKey(chunkX, chunkZ);
		let record = this.records.get(key);
		if (record) this.clearRecord(record);
		else {
			record = {
				chunkX,
				chunkZ,
				revision: this.revision,
				data: null,
				cards: null,
				lines: null,
				points: null
			};
			this.records.set(key, record);
		}
		record.revision = this.revision;
		record.data = data;
		record.cards = new PlantCardChunk(
			chunkX,
			chunkZ,
			size,
			data,
			this.cardTemplate,
			this.materials.card
		);
		this.group.add(record.cards.mesh);
		if (data.debugPoints && data.debugPoints.length > 0)
			this.addDebugPoints(record, data.debugPoints);
		this.applyChunkLines(record);
		this.nearDirty = true;

		this.lastGenerationMs = this.now() - started;
		this.averageGenerationMs =
			this.averageGenerationMs === 0
				? this.lastGenerationMs
				: this.averageGenerationMs * 0.9 + this.lastGenerationMs * 0.1;
		return true;
	}

	/** Forest, openness and wetness on an 8 m grid (they all vary over tens of metres). */
	private buildEnvironment(
		originX: number,
		originZ: number,
		wetNodes: [number, number][] | null
	): GrassGrid {
		const nodes = ENV_NODES;
		const spacing = PLANT_CHUNK_SIZE / (nodes - 1);
		const data = new Float32Array(nodes * nodes * ENV_CHANNELS);
		const biome = createBiomeWeights();
		for (let z = 0; z < nodes; z++) {
			for (let x = 0; x < nodes; x++) {
				const wx = originX + x * spacing;
				const wz = originZ + z * spacing;
				this.options.heightSampler.sampleBiomeWeights(wx, wz, biome);
				const k = (z * nodes + x) * ENV_CHANNELS;
				data[k + ENV_FOREST] = this.options.vegetationRegionSampler.getForestDensity(wx, wz);
				data[k + ENV_OPENNESS] = Math.min(1, biome.plains + biome.hills * 0.6);
				let wet = 0;
				if (wetNodes) {
					let nearest = Infinity;
					for (const [nx, nz] of wetNodes)
						nearest = Math.min(nearest, Math.hypot(nx - wx, nz - wz));
					wet = 1 - Math.min(1, Math.max(0, (nearest - 2) / 12));
				}
				data[k + ENV_WET] = wet;
			}
		}
		return { originX, originZ, spacing, size: nodes, channels: ENV_CHANNELS, data };
	}

	/** Water depth on a 4 m grid over the chunk plus a margin — only where a river or lake is near. */
	private buildWater(
		originX: number,
		originZ: number
	): { grid: GrassGrid; wetNodes: [number, number][] } | null {
		const { waterDepthAt, hasWaterNear } = this.options;
		if (!waterDepthAt) return null;
		const size = PLANT_CHUNK_SIZE;
		const x0 = originX - WATER_MARGIN;
		const z0 = originZ - WATER_MARGIN;
		const extent = size + WATER_MARGIN * 2;
		if (hasWaterNear && !hasWaterNear(x0, z0, x0 + extent, z0 + extent)) return null;
		const nodes = Math.round(extent / WATER_SPACING) + 1;
		const data = new Float32Array(nodes * nodes);
		const wetNodes: [number, number][] = [];
		for (let z = 0; z < nodes; z++) {
			for (let x = 0; x < nodes; x++) {
				const wx = x0 + x * WATER_SPACING;
				const wz = z0 + z * WATER_SPACING;
				const depth = waterDepthAt(wx, wz);
				data[z * nodes + x] = depth > 0 ? depth + 0.3 : depth;
				if (depth > 0) wetNodes.push([wx, wz]);
			}
		}
		if (wetNodes.length === 0) return null;
		return {
			grid: { originX: x0, originZ: z0, spacing: WATER_SPACING, size: nodes, channels: 1, data },
			wetNodes
		};
	}

	private exclusionsFor(originX: number, originZ: number): Float32Array {
		const pad = 0.3;
		const rects: number[] = [];
		for (const rect of this.options.getExclusions()) {
			if (
				rect.maxX + pad < originX ||
				rect.minX - pad > originX + PLANT_CHUNK_SIZE ||
				rect.maxZ + pad < originZ ||
				rect.minZ - pad > originZ + PLANT_CHUNK_SIZE
			)
				continue;
			rects.push(rect.minX - pad, rect.minZ - pad, rect.maxX + pad, rect.maxZ + pad);
		}
		return new Float32Array(rects);
	}

	/** Buildings changed: regenerate only the plant chunks their old/new footprints touch. */
	private syncExclusions(): void {
		const revision = this.options.getExclusionRevision();
		if (revision === this.exclusionRevision) return;
		this.exclusionRevision = revision;
		const current = new Map<string, GrassExclusion>();
		for (const rect of this.options.getExclusions()) current.set(rect.id, rect);
		const signature = (r: GrassExclusion) => `${r.minX},${r.minZ},${r.maxX},${r.maxZ}`;
		const dirty: [number, number, number, number][] = [];
		const parse = (s: string) => s.split(',').map(Number) as [number, number, number, number];
		for (const [id, rect] of current) {
			const previous = this.knownExclusions.get(id);
			if (previous === signature(rect)) continue;
			dirty.push([rect.minX, rect.minZ, rect.maxX, rect.maxZ]);
			if (previous) dirty.push(parse(previous));
		}
		for (const [id, previous] of this.knownExclusions)
			if (!current.has(id)) dirty.push(parse(previous));
		this.knownExclusions.clear();
		for (const [id, rect] of current) this.knownExclusions.set(id, signature(rect));
		for (const [minX, minZ, maxX, maxZ] of dirty) {
			for (const record of this.records.values()) {
				const x0 = record.chunkX * PLANT_CHUNK_SIZE;
				const z0 = record.chunkZ * PLANT_CHUNK_SIZE;
				if (
					maxX + 0.5 < x0 ||
					minX - 0.5 > x0 + PLANT_CHUNK_SIZE ||
					maxZ + 0.5 < z0 ||
					minZ - 0.5 > z0 + PLANT_CHUNK_SIZE
				)
					continue;
				this.queue.enqueue(record.chunkX, record.chunkZ, this.revision);
			}
		}
	}

	private addDebugPoints(record: PlantChunkRecord, raw: Float32Array): void {
		const count = raw.length / 6;
		const positions = new Float32Array(count * 3);
		const colors = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) {
			const [x, y, z, colony, accepted, hash] = raw.subarray(i * 6, i * 6 + 6);
			positions.set([x, y + 0.12, z], i * 3);
			if (this.debug.showColonyFields) {
				colors.set([colony, colony * 0.85, 0.15 + (1 - colony) * 0.3], i * 3);
			} else if (accepted > 0) {
				const h = hash * 6;
				colors.set(
					[Math.abs(h - 3) - 1, 2 - Math.abs(h - 2), 2 - Math.abs(h - 4)].map((v) =>
						Math.min(1, Math.max(0, v))
					),
					i * 3
				);
			} else {
				colors.set([0.3, 0.3, 0.3], i * 3);
			}
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		record.points = new THREE.Points(geometry, debugPointsMaterial);
		this.group.add(record.points);
	}

	private applyChunkLines(record: PlantChunkRecord): void {
		if (!this.debug.showPlantChunks) {
			if (record.lines) record.lines.visible = false;
			return;
		}
		if (!record.lines) {
			const s = PLANT_CHUNK_SIZE;
			const x0 = record.chunkX * s;
			const z0 = record.chunkZ * s;
			const y = this.options.heightSampler.sample(x0 + s / 2, z0 + s / 2) + 0.5;
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

	private clearRecord(record: PlantChunkRecord): void {
		record.cards?.dispose();
		record.cards = null;
		record.data = null;
		if (record.points) {
			record.points.removeFromParent();
			record.points.geometry.dispose();
			record.points = null;
		}
	}

	private disposeRecord(record: PlantChunkRecord): void {
		this.clearRecord(record);
		if (record.lines) {
			record.lines.removeFromParent();
			record.lines.geometry.dispose();
			record.lines = null;
		}
	}

	/** Frees every near batch and compiled prototype (plants disabled, or disposal). */
	private releaseNear(): void {
		for (const batch of this.nearBatches.values()) this.disposeBatch(batch);
		this.nearBatches.clear();
		this.prototypes.clear();
	}

	private unloadAll(): void {
		for (const record of this.records.values()) this.disposeRecord(record);
		this.records.clear();
		this.queue.clear();
		for (const batch of this.nearBatches.values()) batch.count = 0;
		this.lastLoadRadius = -1;
		this.nearDirty = true;
	}
}

const scratch = new THREE.Vector3();
