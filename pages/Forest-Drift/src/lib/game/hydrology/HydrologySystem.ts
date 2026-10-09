import { hashStringToUint32 } from '../terrain/seededRandom';
import { BaseTerrainSampler as TerrainBase } from './BaseTerrainSampler';
import { HydrologyRegionGenerator, type HydrologyRegion } from './HydrologyRegionGenerator';
import { HydrologySpatialIndex, type RiverSegment } from './HydrologySpatialIndex';
import {
	boundsOverlap,
	clamp,
	clampedHydrology,
	depthForFlow,
	floorDiv,
	lakeRadiusAt,
	meetSinkLake,
	packCell,
	lerp,
	regionKey,
	RIVER_BANK_CLEARANCE,
	riverBands,
	riverBeachCover,
	riverEdgeStone,
	riverWaterEdge,
	smooth01,
	widthForFlow
} from './HydrologyMath';
import {
	createHydrologySample,
	DEEP_WATER_DEPTH,
	type BaseTerrainSampler,
	type HydrologyCarver,
	type HydrologySample,
	type HydrologySettings,
	type LakeDefinition,
	type RiverDefinition,
	type RiverEdgeTint
} from './HydrologyTypes';
import { cameraIsUnderwater } from './underwater';

export interface HydrologyStats {
	regions: number;
	rivers: number;
	lakes: number;
	spatialCells: number;
	lastRegionMs: number;
	readyRegions: number;
	/** Regions queued for generation (0 = everything requested so far is built). */
	pendingRegions: number;
}

/**
 * Cached, deterministic hydrology for the whole world.
 *
 * `shapeHeight` is the hot path: one spatial-cell lookup, then a handful of nearby segments.
 * Region generation is separate and cached. It reads pre-water terrain only, so it cannot recurse
 * back through `TerrainHeightSampler.sample`.
 */
export class HydrologySystem implements HydrologyCarver {
	private seedHash: number;
	private generator: HydrologyRegionGenerator;
	private readonly index = new HydrologySpatialIndex();
	private readonly ready = new Set<string>();
	private readonly indexedRivers = new Map<string, number>();
	private readonly indexedLakes = new Set<string>();
	private readonly pending: { rx: number; rz: number }[] = [];
	private readonly built: { rx: number; rz: number }[] = [];
	private readonly scratch = createHydrologySample();
	private readonly columnScratch = createHydrologySample();
	private focusX = 0;
	private focusZ = 0;
	private revision = 0;
	private lastRegionMs = 0;
	private shapeCount = 0;

	constructor(
		private readonly base: BaseTerrainSampler,
		readonly settings: HydrologySettings,
		seed: string
	) {
		this.seedHash = hashStringToUint32(`${seed}|hydro`, 0x51d0);
		this.generator = this.createGenerator();
	}

	getRevision(): number {
		return this.revision;
	}

	getStats(): HydrologyStats {
		return {
			regions: this.ready.size,
			rivers: this.generator.allRivers.length,
			lakes: this.generator.allLakes.length,
			spatialCells: this.index.size,
			lastRegionMs: this.lastRegionMs,
			readyRegions: this.ready.size,
			pendingRegions: this.pending.length
		};
	}

	/** Samples shaped since the last `takeShapeCount` — used by the performance test. */
	takeShapeCount(): number {
		const count = this.shapeCount;
		this.shapeCount = 0;
		return count;
	}

	setSeed(seed: string): void {
		this.seedHash = hashStringToUint32(`${seed}|hydro`, 0x51d0);
		this.invalidate();
	}

	invalidate(): void {
		this.generator = this.createGenerator();
		this.index.clear();
		this.ready.clear();
		this.indexedRivers.clear();
		this.indexedLakes.clear();
		this.pending.length = 0;
		this.built.length = 0;
		this.revision++;
	}

	isReady(worldX: number, worldZ: number): boolean {
		if (!this.settings.enabled) return true;
		return this.ready.has(this.centerKey(worldX, worldZ));
	}

	/**
	 * Queue the halo around the player, plus a ring about one view-distance out, so terrain chunks
	 * at the edge of the loaded area are usually carved before they are meshed.
	 */
	prepareAround(worldX: number, worldZ: number): void {
		this.focusX = worldX;
		this.focusZ = worldZ;
		if (!this.settings.enabled) return;
		this.queueHalo(worldX, worldZ);
		const ahead = 480;
		this.queueHalo(worldX + ahead, worldZ);
		this.queueHalo(worldX - ahead, worldZ);
		this.queueHalo(worldX, worldZ + ahead);
		this.queueHalo(worldX, worldZ - ahead);
	}

	/** Builds a little of the queued halo. Returns immediately when the queue is empty. */
	tick(budgetMs = 8): void {
		if (!this.settings.enabled) return;
		this.queueHalo(this.focusX, this.focusZ);
		const start = performance.now();
		while (this.pending.length > 0 && performance.now() - start < budgetMs) {
			const job = this.pending.shift();
			if (!job) break;
			this.buildRegion(job.rx, job.rz);
		}
		this.finalizeReady();
	}

	/** Builds every region that can affect this point before a terrain sample is allowed to run. */
	ensureSync(worldX: number, worldZ: number): void {
		if (!this.settings.enabled || this.isReady(worldX, worldZ)) return;
		const { regionSize } = clampedHydrology(this.settings);
		const rx = floorDiv(worldX, regionSize);
		const rz = floorDiv(worldZ, regionSize);
		for (let dz = -1; dz <= 1; dz++) {
			for (let dx = -1; dx <= 1; dx++) {
				const x = rx + dx;
				const z = rz + dz;
				if (this.generator.hasRivers(x, z)) continue;
				this.buildRegion(x, z);
				const index = this.pending.findIndex((job) => job.rx === x && job.rz === z);
				if (index >= 0) this.pending.splice(index, 1);
			}
		}
		this.finalizeReady();
	}

	shapeHeight(worldX: number, worldZ: number, baseHeight: number): number {
		if (!this.settings.enabled) {
			this.scratch.beachCover = 0;
			this.scratch.beachStone = 0;
			this.scratch.shoreWet = 0;
			return baseHeight;
		}
		this.shapeCount++;
		this.ensureSync(worldX, worldZ);
		this.evaluate(worldX, worldZ, baseHeight, this.scratch);
		return this.scratch.terrainY;
	}

	/** Beach written by the latest `shapeHeight` into `scratch` (the centre sample of a normal). */
	copyRiverEdge(out: RiverEdgeTint): void {
		out.cover = this.scratch.beachCover;
		out.stone = this.scratch.beachStone;
		out.wet = this.scratch.shoreWet;
	}

	sampleWaterInto(worldX: number, worldZ: number, out: HydrologySample): void {
		if (!this.settings.enabled) {
			const base = this.base.sample(worldX, worldZ);
			clearSample(out, base);
			return;
		}
		this.evaluate(worldX, worldZ, this.base.sample(worldX, worldZ), out);
	}

	sampleWater(worldX: number, worldZ: number): HydrologySample {
		const out = createHydrologySample();
		this.sampleWaterInto(worldX, worldZ, out);
		return out;
	}

	waterColumnDepth(worldX: number, worldZ: number): number {
		if (!this.settings.enabled) return 0;
		this.evaluate(worldX, worldZ, this.base.sample(worldX, worldZ), this.columnScratch);
		return this.columnScratch.waterDepth;
	}

	/**
	 * Rivers are walkable, including once they are deeper than the old step limit.
	 * A deep lake still refuses a step in from the shore.
	 */
	walkBlockedByWater(worldX: number, worldZ: number): boolean {
		if (!this.settings.enabled) return false;
		this.evaluate(worldX, worldZ, this.base.sample(worldX, worldZ), this.columnScratch);
		const sample = this.columnScratch;
		return sample.waterType === 'lake' && sample.waterDepth > DEEP_WATER_DEPTH;
	}

	/** Camera under the water plane and above the bed at this spot. */
	cameraUnderwater(cameraX: number, cameraY: number, cameraZ: number): boolean {
		if (!this.settings.enabled) return false;
		this.evaluate(cameraX, cameraZ, this.base.sample(cameraX, cameraZ), this.columnScratch);
		return cameraIsUnderwater(cameraY, this.columnScratch);
	}

	getRivers(): readonly RiverDefinition[] {
		return this.generator.allRivers;
	}

	getLakes(): readonly LakeDefinition[] {
		return this.generator.allLakes;
	}

	getRegion(rx: number, rz: number): HydrologyRegion | undefined {
		return this.generator.region(rx, rz);
	}

	getRegions(): Iterable<HydrologyRegion> {
		return this.generator.loadedRegions();
	}

	riversNear(worldX: number, worldZ: number, radius: number): RiverDefinition[] {
		const box = {
			minX: worldX - radius,
			maxX: worldX + radius,
			minZ: worldZ - radius,
			maxZ: worldZ + radius
		};
		return this.generator.allRivers.filter((river) => boundsOverlap(river.bounds, box, 0));
	}

	lakesNear(worldX: number, worldZ: number, radius: number): LakeDefinition[] {
		const box = {
			minX: worldX - radius,
			maxX: worldX + radius,
			minZ: worldZ - radius,
			maxZ: worldZ + radius
		};
		return this.generator.allLakes.filter((lake) => boundsOverlap(lake.bounds, box, 0));
	}

	occupiedCells(): { cx: number; cz: number }[] {
		return this.index.occupiedCells();
	}

	private createGenerator(): HydrologyRegionGenerator {
		const highland =
			this.base instanceof TerrainBase
				? (x: number, z: number) => this.baseHighland(x, z)
				: () => 0.72;
		return new HydrologyRegionGenerator(this.base, this.settings, this.seedHash, highland);
	}

	private baseHighland(x: number, z: number): number {
		return (this.base as TerrainBase).highlandWeight(x, z);
	}

	private centerKey(worldX: number, worldZ: number): string {
		const { regionSize } = clampedHydrology(this.settings);
		return regionKey(floorDiv(worldX, regionSize), floorDiv(worldZ, regionSize));
	}

	private queueHalo(worldX: number, worldZ: number): void {
		const { regionSize } = clampedHydrology(this.settings);
		const rx = floorDiv(worldX, regionSize);
		const rz = floorDiv(worldZ, regionSize);
		for (let dz = -1; dz <= 1; dz++) {
			for (let dx = -1; dx <= 1; dx++) this.queueRegion(rx + dx, rz + dz);
		}
	}

	private queueRegion(rx: number, rz: number): void {
		if (this.generator.hasRivers(rx, rz)) return;
		if (this.pending.some((job) => job.rx === rx && job.rz === rz)) return;
		this.pending.push({ rx, rz });
		if (this.pending.length > 48) {
			const { regionSize } = clampedHydrology(this.settings);
			this.pending.sort((a, b) => {
				const ax = (a.rx + 0.5) * regionSize - this.focusX;
				const az = (a.rz + 0.5) * regionSize - this.focusZ;
				const bx = (b.rx + 0.5) * regionSize - this.focusX;
				const bz = (b.rz + 0.5) * regionSize - this.focusZ;
				return ax * ax + az * az - (bx * bx + bz * bz);
			});
			this.pending.length = 48;
		}
	}

	private buildRegion(rx: number, rz: number): void {
		const start = performance.now();
		this.generator.generateRivers(rx, rz);
		this.built.push({ rx, rz });
		this.lastRegionMs = performance.now() - start;
	}

	private finalizeReady(): void {
		let changed = false;
		for (const region of this.built) {
			const key = regionKey(region.rx, region.rz);
			if (this.ready.has(key) || !this.haloReady(region.rx, region.rz)) continue;
			this.ready.add(key);
			changed = true;
		}
		if (changed) this.resolveAndIndex();
	}

	private haloReady(rx: number, rz: number): boolean {
		for (let dz = -1; dz <= 1; dz++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (!this.generator.hasRivers(rx + dx, rz + dz)) return false;
			}
		}
		return true;
	}

	/**
	 * After tributaries widen a river, drop the surface so it stays below both banks.
	 * Where two ribbons overlap, the higher one falls to the lower so a sheet cannot
	 * hang over the other channel. A river's stretch on its lake (an outlet's start, a sink
	 * river's mouth) stays locked to the lake level; everything else can only fall. Last, every
	 * river that ends in a lake is brought onto it, so river and lake meet at one height.
	 */
	private containRiverSurfaces(): void {
		const scale = this.settings.riverBankScale;
		for (const river of this.generator.allRivers) {
			this.capRiverToBanks(river, scale);
		}
		// A drop has to flow downstream before the next river can see it and fall to match.
		for (let pass = 0; pass < 2; pass++) {
			this.dropOverlappingSurfaces(scale);
			for (const river of this.generator.allRivers) this.propagateSurfaceFall(river);
		}
		this.settleLakeLevels();
		for (const river of this.generator.allRivers) {
			this.meetLakes(river);
			this.propagateSurfaceFall(river);
		}
	}

	/**
	 * A river cannot flow up into a lake. Where one arrives below its lake's level, the lake's rim
	 * was breached by that valley, so the lake can only stand as high as the river: it is lowered to
	 * the river's arrival level. Lakes only ever fall, so repeated passes settle.
	 */
	private settleLakeLevels(): void {
		for (const river of this.generator.allRivers) {
			const start = river.lakeLockStart;
			if (start === undefined || start <= 0) continue;
			if (start >= Math.min(river.endIndex, river.samples.length)) continue;
			const lake = this.generator.lakeById(river.sinkLakeId);
			if (!lake) continue;
			const arrival = river.samples[start - 1].waterY;
			if (Number.isFinite(arrival) && arrival < lake.waterLevel) lake.waterLevel = arrival;
		}
	}

	/** True for samples held on a lake level: an outlet's start, or a sink river's mouth. */
	private lakeLocked(river: RiverDefinition, i: number): boolean {
		return i < (river.lakeLockEnd ?? 0) || i >= (river.lakeLockStart ?? Number.POSITIVE_INFINITY);
	}

	/** Re-seats the locked stretches on their lakes' current levels and eases the approach. */
	private meetLakes(river: RiverDefinition): void {
		const source = this.generator.lakeById(river.outletOfLakeId);
		if (source) {
			const end = Math.min(river.lakeLockEnd ?? 0, river.samples.length);
			for (let i = 0; i < end; i++) river.samples[i].waterY = source.waterLevel;
		}
		const sink = this.generator.lakeById(river.sinkLakeId);
		const start = river.lakeLockStart;
		// A tributary cut short by a confluence never reaches its lake.
		if (!sink || start === undefined || start >= Math.min(river.endIndex, river.samples.length))
			return;
		meetSinkLake(river.samples, start, sink.waterLevel);
	}

	/** Lowest base ground under the ribbon, on both sides, minus the bank clearance. */
	private capRiverToBanks(river: RiverDefinition, scale: number): void {
		if (river.samples.length === 0) return;
		const last = Math.min(river.endIndex, river.samples.length);
		const ownLakes = [
			this.generator.lakeById(river.outletOfLakeId),
			this.generator.lakeById(river.sinkLakeId)
		].filter((lake): lake is LakeDefinition => lake !== null);
		let water = river.samples[0].waterY;
		for (let i = 0; i < last; i++) {
			const sample = river.samples[i];
			if (this.lakeLocked(river, i)) {
				if (i < (river.lakeLockEnd ?? 0)) water = sample.waterY;
				continue;
			}
			const edge = riverWaterEdge(sample.width, scale);
			const px = -sample.tangentZ;
			const pz = sample.tangentX;
			let low = Number.POSITIVE_INFINITY;
			for (const dist of [edge, edge + 1.6]) {
				const ax = sample.x + px * dist;
				const az = sample.z + pz * dist;
				const bx = sample.x - px * dist;
				const bz = sample.z - pz * dist;
				low = Math.min(low, this.generator.bankGround(ax, az, ownLakes));
				low = Math.min(low, this.generator.bankGround(bx, bz, ownLakes));
			}
			water = Math.min(sample.waterY, water, low - RIVER_BANK_CLEARANCE);
			sample.waterY = water;
		}
	}

	/**
	 * A ribbon that reaches another river's channel takes that river's surface when it is lower.
	 * Samples are 8 m apart, so the test adds half a step of slack.
	 */
	private dropOverlappingSurfaces(scale: number): void {
		const cell = 32;
		const grid = new Map<number, { river: RiverDefinition; index: number }[]>();
		for (const river of this.generator.allRivers) {
			const last = Math.min(river.endIndex, river.samples.length);
			for (let i = 0; i < last; i++) {
				const sample = river.samples[i];
				const key = packCell(floorDiv(sample.x, cell), floorDiv(sample.z, cell));
				let list = grid.get(key);
				if (!list) {
					list = [];
					grid.set(key, list);
				}
				list.push({ river, index: i });
			}
		}
		for (const river of this.generator.allRivers) {
			const last = Math.min(river.endIndex, river.samples.length);
			for (let i = 0; i < last; i++) {
				if (this.lakeLocked(river, i)) continue;
				const sample = river.samples[i];
				const reach = riverWaterEdge(sample.width, scale) + 8;
				const cx = floorDiv(sample.x, cell);
				const cz = floorDiv(sample.z, cell);
				const span = Math.ceil((reach + 14) / cell);
				let cap = sample.waterY;
				for (let dz = -span; dz <= span; dz++) {
					for (let dx = -span; dx <= span; dx++) {
						const list = grid.get(packCell(cx + dx, cz + dz));
						if (!list) continue;
						for (const node of list) {
							if (node.river === river) continue;
							const other = node.river.samples[node.index];
							const half = Math.max(0.8, other.width * 0.5);
							if (Math.hypot(sample.x - other.x, sample.z - other.z) > reach + half) continue;
							if (other.waterY < cap) cap = other.waterY;
						}
					}
				}
				sample.waterY = cap;
			}
		}
	}

	/**
	 * Flow, length, and every surface sample. Water can fall after a later river is generated
	 * without the end flow changing, and the spatial index has to pick that up.
	 */
	private surfaceStamp(river: RiverDefinition): number {
		const last = Math.min(river.endIndex, river.samples.length);
		const end = river.samples[Math.max(0, last - 1)];
		let hash = last * 1000 + Math.round((end?.flow ?? 0) * 100);
		for (let i = 0; i < last; i++) {
			hash = Math.imul(hash, 31) + Math.round(river.samples[i].waterY * 20);
		}
		return hash;
	}

	/** Carries a drop downstream. Locked lake samples are left on the lake. */
	private propagateSurfaceFall(river: RiverDefinition): void {
		if (river.samples.length === 0) return;
		const last = Math.min(river.endIndex, river.samples.length);
		let water = river.samples[0].waterY;
		for (let i = 0; i < last; i++) {
			const sample = river.samples[i];
			if (this.lakeLocked(river, i)) {
				// An outlet's locked start sets the level the rest falls from.
				if (i < (river.lakeLockEnd ?? 0)) water = sample.waterY;
				continue;
			}
			water = Math.min(water, sample.waterY);
			sample.waterY = water;
		}
	}

	private resolveAndIndex(): void {
		const rivers = this.generator.allRivers;
		resolveConfluence(rivers, this.settings, clampedHydrology(this.settings).gridSpacing);
		this.containRiverSurfaces();
		for (const river of rivers) {
			const stamp = this.surfaceStamp(river);
			if (this.indexedRivers.get(river.id) === stamp) continue;
			this.index.addRiver(river, this.settings);
			this.indexedRivers.set(river.id, stamp);
		}
		for (const lake of this.generator.allLakes) {
			if (this.indexedLakes.has(lake.id)) continue;
			this.index.addLake(lake);
			this.indexedLakes.add(lake.id);
		}
		this.revision++;
	}

	/**
	 * Closest river's dry bank. Other segments may dig their own channel, but not this shelf.
	 * `wet` is set when any channel owns the point, so the bed is never lifted into a bank.
	 */
	private readonly bankScratch = {
		dist: Number.POSITIVE_INFINITY,
		target: 0,
		influence: 0,
		waterY: Number.NaN,
		contain: 0,
		highWater: Number.NaN,
		wet: false
	};

	private evaluate(worldX: number, worldZ: number, baseHeight: number, out: HydrologySample): void {
		this.ensureSync(worldX, worldZ);
		clearSample(out, baseHeight);
		const bank = this.bankScratch;
		bank.dist = Number.POSITIVE_INFINITY;
		bank.target = 0;
		bank.influence = 0;
		bank.waterY = Number.NaN;
		bank.contain = 0;
		bank.highWater = Number.NaN;
		bank.wet = false;
		const bucket = this.index.bucket(worldX, worldZ);
		if (!bucket) return;

		const bankScale = this.settings.riverBankScale;
		for (const segment of bucket.rivers) {
			applyRiver(worldX, worldZ, baseHeight, segment, bankScale, out, bank);
		}
		if (bank.influence > 1e-4) {
			const shaped = lerp(baseHeight, bank.target, bank.influence);
			if (shaped < out.terrainY) {
				out.terrainY = shaped;
				out.terrainTargetY = bank.target;
				out.terrainInfluence = Math.max(out.terrainInfluence, bank.influence);
			}
		}
		for (const lake of bucket.lakes) {
			applyLake(worldX, worldZ, baseHeight, lake, out, bank);
		}
		// The ribbon is a flat plane. Ground under its outer edge has to stand above that plane.
		// Lakes keep their bed; a lake carve must not leave a river bank below the river again.
		if (!bank.wet && out.waterType !== 'lake' && Number.isFinite(bank.highWater)) {
			const minBank = bank.highWater + RIVER_BANK_CLEARANCE;
			if (out.terrainY < minBank) {
				const raised = Math.min(minBank, out.terrainY + 2.2);
				out.terrainY = raised;
				out.terrainTargetY = raised;
				out.terrainInfluence = Math.max(out.terrainInfluence, 1);
			}
		}
		if (out.terrainInfluence <= 0) out.terrainY = baseHeight;
		out.shoreWet = shoreWetness(out);
	}
}

function clearSample(out: HydrologySample, baseHeight: number): void {
	out.waterType = 'none';
	out.waterSurfaceY = 0;
	out.waterDepth = 0;
	out.distanceToWater = Number.POSITIVE_INFINITY;
	out.terrainTargetY = baseHeight;
	out.terrainInfluence = 0;
	out.terrainY = baseHeight;
	out.riverId = '';
	out.lakeId = '';
	out.flowX = 0;
	out.flowZ = 0;
	out.beachCover = 0;
	out.beachStone = 0;
	out.shoreWaterY = Number.NaN;
	out.shoreWet = 0;
}

/**
 * Wet band: 1 under the nearest water and at its waterline, fading out ~0.6 m above it, and only
 * within a few metres of the water (so a valley floor below some distant river is never "wet").
 */
function shoreWetness(out: HydrologySample): number {
	if (!Number.isFinite(out.shoreWaterY)) return 0;
	const above = out.terrainY - out.shoreWaterY;
	const height = 1 - smooth01((above - 0.02) / 0.28);
	const near = 1 - smooth01((out.distanceToWater - 3) / 4);
	return clamp(height * near, 0, 1);
}

/** Beach material of a lake: mostly sand, some pebbly — fixed per lake. */
function lakeShoreStone(lake: LakeDefinition): number {
	const h = Math.abs(Math.sin(lake.x * 12.9898 + lake.z * 78.233) * 43758.5453) % 1;
	return h * 0.62;
}

function riverProfile(
	dist: number,
	width: number,
	depth: number,
	waterY: number,
	base: number,
	bankScale: number,
	stone: number
): { target: number; influence: number } {
	const { half, beachEnd, bank, valley } = riverBands(width, bankScale);
	if (dist >= valley) return { target: base, influence: 0 };
	const shallow = Math.max(0.12, depth * 0.28);
	if (dist <= half) {
		const s = smooth01(dist / Math.max(0.001, half));
		return { target: waterY - (depth + (shallow - depth) * s), influence: 1 };
	}
	// Mud is the lower lip; stone steps a little higher. Both clear the water skin.
	const lip = waterY + RIVER_BANK_CLEARANCE + stone * 0.22;
	const bankY = Math.max(lip, lerp(waterY + RIVER_BANK_CLEARANCE + 0.2, base, 0.42));
	if (dist <= beachEnd && beachEnd > half + 1e-3) {
		const span = beachEnd - half;
		const s = smooth01((dist - half) / span);
		const ontoShelf = smooth01(Math.min(1, s / 0.28));
		return { target: lerp(waterY - shallow, lip, ontoShelf), influence: 1 };
	}
	if (dist <= bank) {
		const s = smooth01((dist - beachEnd) / Math.max(0.001, bank - beachEnd));
		return { target: lerp(lip, bankY, s), influence: 1 };
	}
	const s = smooth01((dist - bank) / Math.max(0.001, valley - bank));
	return { target: lerp(bankY, base, s), influence: 1 - s };
}

function applyRiver(
	x: number,
	z: number,
	base: number,
	segment: RiverSegment,
	bankScale: number,
	out: HydrologySample,
	bank: {
		dist: number;
		target: number;
		influence: number;
		waterY: number;
		contain: number;
		highWater: number;
		wet: boolean;
	}
): void {
	const abx = segment.x1 - segment.x0;
	const abz = segment.z1 - segment.z0;
	const ab2 = abx * abx + abz * abz;
	let t = ab2 < 1e-6 ? 0 : ((x - segment.x0) * abx + (z - segment.z0) * abz) / ab2;
	if (t < 0) t = 0;
	else if (t > 1) t = 1;
	const cx = segment.x0 + abx * t;
	const cz = segment.z0 + abz * t;
	const dist = Math.hypot(x - cx, z - cz);
	if (dist > segment.reach) return;

	const width = lerp(segment.w0, segment.w1, t);
	const waterY = lerp(segment.y0, segment.y1, t);
	const depth = lerp(segment.d0, segment.d1, t);
	const run = Math.hypot(segment.x1 - segment.x0, segment.z1 - segment.z0);
	const grade = run > 1e-3 ? Math.abs(segment.y1 - segment.y0) / run : 0;
	const stone = riverEdgeStone(cx, cz, grade, width);
	const bands = riverBands(width, bankScale);
	const profile = riverProfile(dist, width, depth, waterY, base, bankScale, stone);
	const signed = dist - bands.half;
	const inChannel = dist <= bands.half;
	if (inChannel) bank.wet = true;
	else if (dist <= riverWaterEdge(width, bankScale) + 1.6) {
		if (!Number.isFinite(bank.highWater) || waterY > bank.highWater) bank.highWater = waterY;
	}
	// The wet channel is the deepest nearby bed. The dry shelf belongs only to the closest bank,
	// otherwise the next bend's channel digs the lip back down to the bed.
	if (inChannel && profile.influence > 1e-4) {
		const shaped = lerp(base, profile.target, profile.influence);
		if (shaped < out.terrainY) {
			out.terrainY = shaped;
			out.terrainTargetY = profile.target;
			out.terrainInfluence = Math.max(out.terrainInfluence, profile.influence);
		}
	}

	const closer = signed < out.distanceToWater;
	if (closer) {
		out.distanceToWater = signed;
		out.beachCover = riverBeachCover(signed, bands.beachEnd - bands.half);
		out.beachStone = stone;
		out.shoreWaterY = waterY;
		if (!inChannel && profile.influence > 1e-4) {
			bank.dist = signed;
			bank.target = profile.target;
			bank.influence = profile.influence;
			bank.waterY = waterY;
			bank.contain = bands.beachEnd - bands.half + 1.6;
		} else {
			bank.influence = 0;
			bank.waterY = Number.NaN;
		}
	}
	if (inChannel && out.waterType !== 'lake' && (out.riverId === '' || closer)) {
		out.waterType = 'river';
		out.waterSurfaceY = waterY;
		out.waterDepth = Math.max(0, waterY - out.terrainY);
		out.riverId = segment.riverId;
		out.flowX = segment.tx;
		out.flowZ = segment.tz;
	}
}

function applyLake(
	x: number,
	z: number,
	base: number,
	lake: LakeDefinition,
	out: HydrologySample,
	bank: { influence: number }
): void {
	const dx = x - lake.x;
	const dz = z - lake.z;
	const radial = Math.hypot(dx, dz);
	const radius = lakeRadiusAt(lake, Math.atan2(dz, dx));
	const d = radius > 1e-4 ? radial / radius : 99;
	const beach = 0.34;
	if (d > 1 + beach) return;
	const shore = smooth01((d - 0.1) / 0.9);
	const edgeFade = 1 - smooth01((d - 0.72) / 0.28);
	const depth = lake.depth * (1 - shore) + 0.16 * shore * edgeFade;
	const bed = lake.waterLevel - Math.max(0.06, depth);
	const influence = d <= 1 ? 1 : 1 - smooth01((d - 1) / beach);
	const target = d <= 1 ? bed : lake.waterLevel;
	if (influence > 1e-4) {
		const shaped = lerp(base, target, influence);
		if (shaped < out.terrainY) {
			out.terrainY = shaped;
			out.terrainTargetY = target;
			out.terrainInfluence = Math.max(out.terrainInfluence, influence);
		}
	}

	const signed = radial - radius;
	if (signed < out.distanceToWater) {
		out.distanceToWater = signed;
		// Beach around the whole shore, fading out across the flat shore band.
		out.beachCover = d <= 1 ? 1 : 1 - smooth01((d - 1) / beach);
		out.beachStone = lakeShoreStone(lake);
		out.shoreWaterY = lake.waterLevel;
		bank.influence = 0;
	}
	if (d < 1) {
		out.waterType = 'lake';
		out.waterSurfaceY = lake.waterLevel;
		out.waterDepth = Math.max(0, lake.waterLevel - out.terrainY);
		out.lakeId = lake.id;
		out.riverId = '';
		out.flowX = 0;
		out.flowZ = 0;
	}
}

function sameLakePair(a: RiverDefinition, b: RiverDefinition): boolean {
	return (
		(a.sinkLakeId !== undefined && a.sinkLakeId === b.outletOfLakeId) ||
		(b.sinkLakeId !== undefined && b.sinkLakeId === a.outletOfLakeId)
	);
}

/** Truncates lower-priority rivers where they meet a higher one, then adds their flow downstream. */
export function resolveConfluence(
	rivers: readonly RiverDefinition[],
	settings: HydrologySettings,
	gridSpacing: number
): void {
	const merge = Math.max(28, gridSpacing * 0.7);
	const sorted = [...rivers].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
	for (const river of sorted) {
		let end = river.samples.length;
		for (const other of sorted) {
			if (other.id === river.id) continue;
			if (other.priority < river.priority) continue;
			if (other.priority === river.priority && other.id >= river.id) continue;
			if (sameLakePair(river, other)) continue;
			if (!boundsOverlap(river.bounds, other.bounds, merge)) continue;
			const hit = firstApproach(river, other, merge);
			if (hit >= 0) end = Math.min(end, hit + 1);
		}
		river.endIndex = Math.max(1, end);
	}

	for (const river of rivers) {
		river.flowExtra.fill(0);
		for (let i = 0; i < river.samples.length; i++)
			river.samples[i].flow = river.samples[i].baseFlow;
	}

	for (const tributary of rivers) {
		if (tributary.endIndex >= tributary.samples.length) continue;
		const endSample = tributary.samples[Math.max(0, tributary.endIndex - 1)];
		let best: RiverDefinition | null = null;
		let bestDist = merge;
		let bestIndex = 0;
		for (const other of rivers) {
			if (other.id === tributary.id) continue;
			if (other.priority < tributary.priority) continue;
			if (other.priority === tributary.priority && other.id >= tributary.id) continue;
			if (sameLakePair(tributary, other)) continue;
			const limit = other.endIndex;
			for (let i = 0; i < limit; i++) {
				const sample = other.samples[i];
				const dist = Math.hypot(sample.x - endSample.x, sample.z - endSample.z);
				if (dist < bestDist) {
					bestDist = dist;
					best = other;
					bestIndex = i;
				}
			}
		}
		if (best) best.flowExtra[bestIndex] += endSample.baseFlow;
	}

	for (const river of rivers) {
		let extra = 0;
		for (let i = 0; i < river.endIndex; i++) {
			extra += river.flowExtra[i] ?? 0;
			const flow = river.samples[i].baseFlow + extra;
			river.samples[i].flow = flow;
			river.samples[i].width = widthForFlow(flow, settings);
			river.samples[i].depth = depthForFlow(flow, settings);
		}
	}
}

function firstApproach(river: RiverDefinition, other: RiverDefinition, merge: number): number {
	const limit = other.endIndex;
	for (let i = 2; i < river.samples.length; i++) {
		const sample = river.samples[i];
		for (let j = 0; j < limit; j++) {
			const otherSample = other.samples[j];
			if (Math.hypot(sample.x - otherSample.x, sample.z - otherSample.z) < merge) return i;
		}
	}
	return -1;
}
