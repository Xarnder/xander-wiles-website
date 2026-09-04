import * as THREE from 'three';
import { InstancedTreeLayer } from './InstancedTreeLayer';
import { createTreeVariantAssets, type TreeVariantAssets } from './treeGeometry';
import { TreePlacementGenerator, type CellEvaluation } from './TreePlacementGenerator';
import { VegetationRegionSampler } from './VegetationRegionSampler';
import type { VegetationSettings } from './VegetationTypes';
import type { FoundationManager } from '../building/FoundationManager';
import { chunkKey, worldToChunkCoord, type ChunkKey } from '../terrain/chunkKey';
import { TerrainGenerationQueue, type ChunkJob } from '../terrain/TerrainGenerationQueue';
import type { TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import type { TerrainSettings } from '../terrain/TerrainSettings';

/** Generous per-variant, per-component instance capacity — see the README for the sizing rationale. */
const CAPACITY_PER_VARIANT = 6000;

const UP_AXIS = new THREE.Vector3(0, 1, 0);

const treeChunkBorderMaterial = new THREE.LineBasicMaterial({ color: 0x33ccff });
const debugPointsMaterial = new THREE.PointsMaterial({
	size: 0.5,
	vertexColors: true,
	sizeAttenuation: true
});

/** Mutable box a tree instance owns so InstancedTreeLayer can update it in place when a swap-remove moves it. */
interface IndexBox {
	index: number;
}

interface ActiveTreeInstance {
	variant: number;
	trunkBox: IndexBox;
	foliageBox: IndexBox;
}

interface VegetationChunkRecord {
	chunkX: number;
	chunkZ: number;
	revision: number;
	instances: ActiveTreeInstance[];
	borderLines: THREE.LineSegments | null;
	debugPoints: THREE.Points | null;
}

export interface VegetationStats {
	loadedChunks: number;
	queuedChunks: number;
	treeInstances: number;
	revision: number;
}

export interface TreeManagerOptions {
	settings: VegetationSettings;
	terrainSettings: TerrainSettings;
	terrainHeightSampler: TerrainHeightSampler;
	foundationManager: FoundationManager;
	seed: string;
}

/**
 * Loads/unloads vegetation chunks around the player and renders every accepted tree via
 * instanced rendering (one InstancedMesh per tree-variant per component — trunk/foliage — so the
 * whole visible forest costs a small, fixed number of draw calls regardless of tree count).
 *
 * Vegetation chunks are aligned to the same world chunkSize as terrain purely for *loading
 * convenience* — every cell's world position, and therefore every tree's existence, still comes
 * entirely from TreePlacementGenerator's (worldSeed, cellX, cellZ) math. A chunk boundary changes
 * which chunk *loads* a cell's tree, never whether that tree exists or where it sits.
 */
export class TreeManager {
	readonly group = new THREE.Group();

	private readonly settings: VegetationSettings;
	private readonly terrainSettings: TerrainSettings;
	private readonly terrainHeightSampler: TerrainHeightSampler;
	private readonly foundationManager: FoundationManager;

	private readonly vegetationRegionSampler: VegetationRegionSampler;
	private readonly treePlacementGenerator: TreePlacementGenerator;

	private readonly variantAssets: TreeVariantAssets[];
	private readonly trunkLayers: InstancedTreeLayer<IndexBox>[];
	private readonly foliageLayers: InstancedTreeLayer<IndexBox>[];

	private readonly active = new Map<ChunkKey, VegetationChunkRecord>();
	private readonly queue = new TerrainGenerationQueue();

	private revision = 0;
	private lastPlayerChunkX = Number.NaN;
	private lastPlayerChunkZ = Number.NaN;

	private readonly scratchMatrix = new THREE.Matrix4();
	private readonly scratchPosition = new THREE.Vector3();
	private readonly scratchQuaternion = new THREE.Quaternion();
	private readonly scratchScale = new THREE.Vector3();

	constructor(options: TreeManagerOptions) {
		this.settings = options.settings;
		this.terrainSettings = options.terrainSettings;
		this.terrainHeightSampler = options.terrainHeightSampler;
		this.foundationManager = options.foundationManager;

		this.vegetationRegionSampler = new VegetationRegionSampler(this.settings);
		this.vegetationRegionSampler.setSeed(options.seed);
		this.treePlacementGenerator = new TreePlacementGenerator(
			this.terrainHeightSampler,
			this.vegetationRegionSampler,
			this.settings.trees
		);
		this.treePlacementGenerator.setSeed(options.seed);

		this.variantAssets = createTreeVariantAssets();
		this.trunkLayers = this.variantAssets.map(
			(assets) =>
				new InstancedTreeLayer(assets.trunkGeometry, assets.trunkMaterial, CAPACITY_PER_VARIANT)
		);
		this.foliageLayers = this.variantAssets.map(
			(assets) =>
				new InstancedTreeLayer(assets.foliageGeometry, assets.foliageMaterial, CAPACITY_PER_VARIANT)
		);
		for (const layer of [...this.trunkLayers, ...this.foliageLayers]) this.group.add(layer.mesh);
	}

	getVegetationRegionSampler(): VegetationRegionSampler {
		return this.vegetationRegionSampler;
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

	/** Vegetation settings changed (forest shape, tree density/scale/slope, debug overlays): regenerate visible chunks, terrain untouched. */
	notifySettingsChanged(): void {
		this.revision++;
		for (const chunk of this.active.values())
			this.queue.enqueue(chunk.chunkX, chunk.chunkZ, this.revision);
	}

	notifySeedChanged(seed: string): void {
		this.vegetationRegionSampler.setSeed(seed);
		this.treePlacementGenerator.setSeed(seed);
		this.notifySettingsChanged();
	}

	/**
	 * Terrain changed (shape, seed, or chunkSize/topology). Vegetation generation is otherwise
	 * independent of terrain settings, but tree Y/slope placement reads the same TerrainHeightSampler,
	 * so visible vegetation is refreshed to stay consistent with the new ground — see the README's
	 * "Terrain settings changes" note for why this is a development-time convenience, not a hard
	 * coupling of the two systems.
	 */
	notifyTerrainChanged(): void {
		this.revision++;
		for (const chunk of this.active.values())
			this.queue.enqueue(chunk.chunkX, chunk.chunkZ, this.revision);
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
		for (const record of this.active.values()) treeInstances += record.instances.length;
		return {
			loadedChunks: this.active.size,
			queuedChunks: this.queue.size,
			treeInstances,
			revision: this.revision
		};
	}

	dispose(): void {
		for (const record of this.active.values()) this.disposeChunkRecord(record);
		this.active.clear();
		this.queue.clear();
		for (const layer of [...this.trunkLayers, ...this.foliageLayers]) layer.dispose();
		for (const assets of this.variantAssets) {
			assets.trunkMaterial.dispose();
			assets.foliageMaterial.dispose();
		}
		this.group.clear();
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

	private materializeJob(job: ChunkJob): void {
		if (job.revision !== this.revision) return;

		const key = chunkKey(job.chunkX, job.chunkZ);
		let record = this.active.get(key);
		if (record) {
			this.clearChunkInstances(record);
		} else {
			record = {
				chunkX: job.chunkX,
				chunkZ: job.chunkZ,
				revision: job.revision,
				instances: [],
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
		// works for any chunkSize/cellSize ratio and negative coordinates (Math.ceil, not floor,
		// so it's the smallest cell index whose origin is >= originX).
		const cellMinX = Math.ceil(originX / cellSize);
		const cellMaxX = Math.ceil((originX + chunkSize) / cellSize) - 1;
		const cellMinZ = Math.ceil(originZ / cellSize);
		const cellMaxZ = Math.ceil((originZ + chunkSize) / cellSize) - 1;

		const collectDebug =
			this.settings.debug.showTreeCells || this.settings.debug.showRejectedTreeCandidates;
		const debugEvaluations: CellEvaluation[] = [];

		for (let cx = cellMinX; cx <= cellMaxX; cx++) {
			for (let cz = cellMinZ; cz <= cellMaxZ; cz++) {
				const evaluation = this.treePlacementGenerator.evaluateCell(cx, cz);
				if (collectDebug) debugEvaluations.push(evaluation);
				if (!evaluation.accepted || !evaluation.tree) continue;
				if (
					this.foundationManager.getTopYAt(evaluation.tree.worldX, evaluation.tree.worldZ) !== null
				)
					continue;
				this.addTreeInstance(
					record,
					evaluation.tree.worldX,
					evaluation.tree.worldZ,
					evaluation.tree.rotationY,
					evaluation.tree.scale,
					evaluation.tree.variant
				);
			}
		}

		this.updateChunkDebugVisuals(record, debugEvaluations);

		if (this.settings.debug.showTreeChunkBorders && !record.borderLines) {
			record.borderLines = this.buildBorderLines(job.chunkX, job.chunkZ);
			this.group.add(record.borderLines);
		}
	}

	private addTreeInstance(
		record: VegetationChunkRecord,
		worldX: number,
		worldZ: number,
		rotationY: number,
		scale: number,
		variant: number
	): void {
		const height = this.terrainHeightSampler.sample(worldX, worldZ);
		this.scratchPosition.set(worldX, height, worldZ);
		this.scratchQuaternion.setFromAxisAngle(UP_AXIS, rotationY);
		this.scratchScale.setScalar(scale);
		this.scratchMatrix.compose(this.scratchPosition, this.scratchQuaternion, this.scratchScale);

		const trunkBox: IndexBox = { index: -1 };
		const foliageBox: IndexBox = { index: -1 };
		const trunkIndex = this.trunkLayers[variant].add(this.scratchMatrix, trunkBox);
		const foliageIndex = this.foliageLayers[variant].add(this.scratchMatrix, foliageBox);

		if (trunkIndex === -1 || foliageIndex === -1) {
			// At instancing capacity — drop this candidate rather than exceed the fixed buffer.
			if (trunkIndex !== -1) this.trunkLayers[variant].remove(trunkIndex, () => {});
			if (foliageIndex !== -1) this.foliageLayers[variant].remove(foliageIndex, () => {});
			return;
		}

		trunkBox.index = trunkIndex;
		foliageBox.index = foliageIndex;
		record.instances.push({ variant, trunkBox, foliageBox });
	}

	private clearChunkInstances(record: VegetationChunkRecord): void {
		for (const instance of record.instances) {
			this.trunkLayers[instance.variant].remove(instance.trunkBox.index, (owner, newIndex) => {
				owner.index = newIndex;
			});
			this.foliageLayers[instance.variant].remove(instance.foliageBox.index, (owner, newIndex) => {
				owner.index = newIndex;
			});
		}
		record.instances.length = 0;

		if (record.debugPoints) {
			this.group.remove(record.debugPoints);
			record.debugPoints.geometry.dispose();
			record.debugPoints = null;
		}
	}

	private disposeChunkRecord(record: VegetationChunkRecord): void {
		this.clearChunkInstances(record);
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
			if (evaluation.accepted) {
				if (!showCells) continue;
				positions.push(
					evaluation.worldX,
					this.terrainHeightSampler.sample(evaluation.worldX, evaluation.worldZ) + 0.3,
					evaluation.worldZ
				);
				colors.push(0.3, 1, 0.3);
			} else {
				if (!showRejected) continue;
				positions.push(
					evaluation.worldX,
					this.terrainHeightSampler.sample(evaluation.worldX, evaluation.worldZ) + 0.3,
					evaluation.worldZ
				);
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
