import { hashCellToFloat01 } from '../vegetation/cellHash';
import { smoothstep } from '../terrain/mathUtils';
import {
	boundsOverlap,
	catmullRom,
	clampedHydrology,
	clamp,
	depthForFlow,
	distanceOutsideLake,
	emptyBounds,
	floorDiv,
	includePoint,
	lakeRadiusAt,
	meetSinkLake,
	outletLakeSpan,
	packCell,
	pointInLake,
	regionKey,
	RIVER_BANK_CLEARANCE,
	riverWaterEdge,
	sinkLakeStart,
	unpackCell,
	widthForFlow
} from './HydrologyMath';
import {
	SPAWN_RIVER_MIN_VERSION,
	SPAWN_RIVER_RADIUS,
	type BaseTerrainSampler,
	type HydrologySettings,
	type LakeCandidate,
	type LakeDefinition,
	type RiverDefinition,
	type RiverSample
} from './HydrologyTypes';

/** Spawn is the world origin (see `ThreeScene.dryGroundNear(0, 0)`). */
const SPAWN_X = 0;
const SPAWN_Z = 0;
/** Cells walked uphill from spawn to look for a source upstream of it. */
const SPAWN_RIVER_UPHILL_CELLS = 7;
/**
 * The spawn river starts with this much flow, as if fed by springs further up: a real river by the
 * time it reaches spawn rather than a trickle.
 */
const SPAWN_RIVER_START_FLOW = 2.6;

const DIRS: readonly (readonly [number, number])[] = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1]
];

interface RawNode {
	x: number;
	z: number;
	h: number;
	cx: number;
	cz: number;
}

export interface HydrologyRegion {
	rx: number;
	rz: number;
	lakes: LakeDefinition[];
	rivers: RiverDefinition[];
	candidates: LakeCandidate[];
	sources: { x: number; z: number; height: number }[];
}

/**
 * Deterministic lakes and river centrelines for one hydrology region.
 *
 * Paths are a function of the seed, the coordinates and the pre-water terrain only. They do not
 * read which region was built first. Confluence (which river wins a shared valley) is applied
 * later by `HydrologySystem`, once every river that can meet them exists.
 */
export class HydrologyRegionGenerator {
	private readonly limits;
	private readonly heights = new Map<number, number>();
	private readonly lakeDone = new Set<string>();
	private readonly riverDone = new Set<string>();
	private readonly regions = new Map<string, HydrologyRegion>();
	private readonly lakes: LakeDefinition[] = [];
	private readonly rivers: RiverDefinition[] = [];

	constructor(
		private readonly base: BaseTerrainSampler,
		private readonly settings: HydrologySettings,
		private readonly seedHash: number,
		private readonly highlandAt: (x: number, z: number) => number = () => 0.72
	) {
		this.limits = clampedHydrology(settings);
	}

	clear(): void {
		this.heights.clear();
		this.lakeDone.clear();
		this.riverDone.clear();
		this.regions.clear();
		this.lakes.length = 0;
		this.rivers.length = 0;
	}

	get allLakes(): readonly LakeDefinition[] {
		return this.lakes;
	}

	get allRivers(): readonly RiverDefinition[] {
		return this.rivers;
	}

	lakeById(id: string | undefined): LakeDefinition | null {
		if (id === undefined) return null;
		return this.lakes.find((lake) => lake.id === id) ?? null;
	}

	/**
	 * Natural ground for a river's bank test. Inside one of the river's own lakes the lake surface is
	 * the bank, so a river can come right up to its lake level instead of being pulled down to the
	 * lake bed beside it.
	 */
	bankGround(x: number, z: number, lakes: readonly LakeDefinition[]): number {
		let ground = this.base.sample(x, z);
		for (const lake of lakes) {
			if (distanceOutsideLake(lake, x, z) <= 0)
				ground = Math.max(ground, lake.waterLevel + RIVER_BANK_CLEARANCE);
		}
		return ground;
	}

	region(rx: number, rz: number): HydrologyRegion | undefined {
		return this.regions.get(regionKey(rx, rz));
	}

	loadedRegions(): Iterable<HydrologyRegion> {
		return this.regions.values();
	}

	hasLakes(rx: number, rz: number): boolean {
		return this.lakeDone.has(regionKey(rx, rz));
	}

	hasRivers(rx: number, rz: number): boolean {
		return this.riverDone.has(regionKey(rx, rz));
	}

	generateLakes(rx: number, rz: number): HydrologyRegion {
		const key = regionKey(rx, rz);
		const existing = this.regions.get(key);
		if (this.lakeDone.has(key) && existing) return existing;

		const region = existing ?? this.blankRegion(rx, rz);
		this.regions.set(key, region);
		this.lakeDone.add(key);

		const { regionSize } = this.limits;
		const spacing = Math.max(this.limits.gridSpacing * 5, 260);
		const originX = rx * regionSize;
		const originZ = rz * regionSize;
		let index = 0;
		for (
			let z = originZ + spacing * 0.5;
			z < originZ + regionSize && region.lakes.length < 3;
			z += spacing
		) {
			for (
				let x = originX + spacing * 0.5;
				x < originX + regionSize && region.lakes.length < 3;
				x += spacing
			) {
				const jx = (this.hash(rx, rz, index, 1) - 0.5) * spacing * 0.5;
				const jz = (this.hash(rx, rz, index, 2) - 0.5) * spacing * 0.5;
				const px = x + jx;
				const pz = z + jz;
				const roll = this.hash(rx, rz, index, 3);
				index++;
				if (roll > clamp(this.settings.lakeDensity, 0, 1)) {
					region.candidates.push({ x: px, z: pz, accepted: false, waterLevel: 0 });
					continue;
				}
				const lake = this.tryBasin(px, pz, `lake:${rx}:${rz}:${index}`);
				region.candidates.push({
					x: px,
					z: pz,
					accepted: lake !== null,
					waterLevel: lake?.waterLevel ?? 0
				});
				if (lake) this.addLake(region, lake);
			}
		}
		return region;
	}

	generateRivers(rx: number, rz: number): HydrologyRegion {
		const region = this.generateLakes(rx, rz);
		const key = regionKey(rx, rz);
		if (this.riverDone.has(key)) return region;
		this.riverDone.add(key);

		const { regionSize, sourceSpacing } = this.limits;
		const originX = rx * regionSize;
		const originZ = rz * regionSize;
		let index = 0;
		for (
			let z = originZ + sourceSpacing * 0.5;
			z < originZ + regionSize && region.sources.length < 4;
			z += sourceSpacing
		) {
			for (
				let x = originX + sourceSpacing * 0.5;
				x < originX + regionSize && region.sources.length < 4;
				x += sourceSpacing
			) {
				const jx = (this.hash(rx + 20, rz, index, 4) - 0.5) * sourceSpacing * 0.55;
				const jz = (this.hash(rx, rz + 20, index, 5) - 0.5) * sourceSpacing * 0.55;
				const px = x + jx;
				const pz = z + jz;
				index++;
				const height = this.base.sample(px, pz);
				const elev = smoothstep(
					this.settings.minRiverSourceElevation,
					this.settings.minRiverSourceElevation + 12,
					height
				);
				const highland = this.highlandAt(px, pz);
				const noise = this.hash(Math.round(px), Math.round(pz), index, 6);
				const weight = noise * elev * (0.3 + 0.7 * highland);
				const threshold = 0.32 * (1.12 - clamp(this.settings.riverDensity, 0, 1));
				if (weight < threshold || elev < 0.12) continue;
				if (
					region.sources.some(
						(source) => Math.hypot(source.x - px, source.z - pz) < sourceSpacing * 0.62
					)
				) {
					continue;
				}
				const cx = floorDiv(px, this.limits.gridSpacing);
				const cz = floorDiv(pz, this.limits.gridSpacing);
				region.sources.push({
					x: (cx + 0.5) * this.limits.gridSpacing,
					z: (cz + 0.5) * this.limits.gridSpacing,
					height
				});
				const river = this.route({
					cx,
					cz,
					id: `r:${cx}:${cz}`,
					priority: height,
					seed: Math.floor(noise * 1_000_000),
					originX: (cx + 0.5) * this.limits.gridSpacing,
					originZ: (cz + 0.5) * this.limits.gridSpacing
				});
				if (river) this.addRiver(region, river);
			}
		}

		if (
			this.settings.generatorVersion >= SPAWN_RIVER_MIN_VERSION &&
			floorDiv(SPAWN_X, regionSize) === rx &&
			floorDiv(SPAWN_Z, regionSize) === rz
		) {
			this.ensureSpawnRiver(region);
		}

		for (const lake of [...region.lakes]) {
			if (lake.outletRiverId) continue;
			const outlet = this.routeOutlet(lake);
			if (!outlet) continue;
			lake.outletRiverId = outlet.id;
			this.addRiver(region, outlet);
		}
		return region;
	}

	/**
	 * Guarantees a river within `SPAWN_RIVER_RADIUS` of spawn, deterministically (it depends only on
	 * the seed, the terrain and this region's own rivers, never on which regions were built first).
	 *
	 * If one of this region's natural rivers already passes within half the radius, nothing is added.
	 * Otherwise: walk uphill from the spawn cell to find sources upstream of it, route each (the
	 * normal downhill router, carving and all) starting with the farthest, and keep the first whose
	 * course passes within half the radius — or, failing that, the full radius. The last resort is a
	 * river rising at the spawn cell itself or a neighbour, which always passes within it.
	 */
	private ensureSpawnRiver(region: HydrologyRegion): void {
		const reach = (river: RiverDefinition) => minDistanceTo(river, SPAWN_X, SPAWN_Z);
		if (region.rivers.some((river) => reach(river) <= SPAWN_RIVER_RADIUS * 0.5)) return;

		const grid = this.limits.gridSpacing;
		const start = { cx: floorDiv(SPAWN_X, grid), cz: floorDiv(SPAWN_Z, grid) };
		const chain = [start];
		const visited = new Set<number>([packCell(start.cx, start.cz)]);
		for (let i = 0; i < SPAWN_RIVER_UPHILL_CELLS; i++) {
			const cur = chain[chain.length - 1];
			const h = this.cellHeight(cur.cx, cur.cz);
			let best: { cx: number; cz: number } | null = null;
			let bestH = h + 0.25;
			for (const [dx, dz] of DIRS) {
				const nx = cur.cx + dx;
				const nz = cur.cz + dz;
				if (visited.has(packCell(nx, nz))) continue;
				const nh = this.cellHeight(nx, nz);
				if (nh > bestH) {
					bestH = nh;
					best = { cx: nx, cz: nz };
				}
			}
			if (!best) break;
			visited.add(packCell(best.cx, best.cz));
			chain.push(best);
		}

		// Farthest upstream first (a longer, more natural river), then the spawn cell itself.
		const candidates = [
			...chain.slice(1).reverse(),
			start,
			...DIRS.map(([dx, dz]) => ({ cx: start.cx + dx, cz: start.cz + dz }))
		];
		// Prefer a river that passes close (clearly in view from spawn); accept the full radius only
		// if no candidate does. Routes are cached per cell, so the second pass is free.
		const routed = new Map<number, RiverDefinition | null>();
		for (const limit of [SPAWN_RIVER_RADIUS * 0.5, SPAWN_RIVER_RADIUS]) {
			for (const cell of candidates) {
				const key = packCell(cell.cx, cell.cz);
				let river = routed.get(key);
				if (river === undefined) {
					river = this.route({
						cx: cell.cx,
						cz: cell.cz,
						id: `spawn:${cell.cx}:${cell.cz}`,
						priority: this.cellHeight(cell.cx, cell.cz) + 1000,
						seed: Math.floor(this.hash(cell.cx, cell.cz, 0, 21) * 1_000_000),
						originX: (cell.cx + 0.5) * grid,
						originZ: (cell.cz + 0.5) * grid,
						startFlow: SPAWN_RIVER_START_FLOW
					});
					routed.set(key, river);
				}
				if (!river || reach(river) > limit) continue;
				region.sources.push({
					x: river.sourceX,
					z: river.sourceZ,
					height: this.cellHeight(cell.cx, cell.cz)
				});
				this.addRiver(region, river);
				return;
			}
		}
	}

	private blankRegion(rx: number, rz: number): HydrologyRegion {
		return { rx, rz, lakes: [], rivers: [], candidates: [], sources: [] };
	}

	private addLake(region: HydrologyRegion, lake: LakeDefinition): void {
		if (this.lakes.some((other) => other.id === lake.id)) return;
		region.lakes.push(lake);
		this.lakes.push(lake);
	}

	private addRiver(region: HydrologyRegion, river: RiverDefinition): void {
		if (this.rivers.some((other) => other.id === river.id)) return;
		region.rivers.push(river);
		this.rivers.push(river);
	}

	private lakeShape(
		x: number,
		z: number
	): Pick<LakeDefinition, 'a1' | 'p1' | 'a2' | 'p2' | 'a3' | 'p3'> {
		const n = (channel: number) => this.hash(Math.round(x * 10), Math.round(z * 10), channel, 9);
		return {
			a1: 0.1 + n(1) * 0.14,
			p1: n(2) * Math.PI * 2,
			a2: 0.06 + n(3) * 0.09,
			p2: n(4) * Math.PI * 2,
			a3: 0.04 + n(5) * 0.06,
			p3: n(6) * Math.PI * 2
		};
	}

	/**
	 * Water sits just below the lowest point on the organic shoreline, so the surface stays inside
	 * the basin instead of hanging over a downhill lobe.
	 */
	private containedWaterLevel(
		x: number,
		z: number,
		baseRadius: number,
		center: number,
		shape: Pick<LakeDefinition, 'a1' | 'p1' | 'a2' | 'p2' | 'a3' | 'p3'>
	): number | null {
		const probe = { ...shape, baseRadius } as LakeDefinition;
		let rimMin = Number.POSITIVE_INFINITY;
		let rimMax = Number.NEGATIVE_INFINITY;
		let rimSum = 0;
		const samples = 20;
		for (let i = 0; i < samples; i++) {
			const angle = (i / samples) * Math.PI * 2;
			const radius = lakeRadiusAt(probe, angle) * 1.03;
			const h = this.base.sample(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius);
			rimSum += h;
			if (h < rimMin) rimMin = h;
			if (h > rimMax) rimMax = h;
		}
		const grade = (rimMax - rimMin) / Math.max(8, baseRadius * 2);
		if (grade > 0.5) return null;
		if (center > rimSum / samples - 0.35) return null;
		return rimMin - 0.06;
	}

	private tryBasin(x: number, z: number, id: string): LakeDefinition | null {
		if (this.lakeNear(x, z, this.settings.minLakeRadius * 2.4)) return null;
		const span = Math.max(1, this.settings.maxLakeRadius - this.settings.minLakeRadius);
		const radius =
			this.settings.minLakeRadius + this.hash(Math.round(x), Math.round(z), 7, 8) * span;
		const center = this.base.sample(x, z);
		const shape = this.lakeShape(x, z);
		const contained = this.containedWaterLevel(x, z, radius, center, shape);
		if (contained === null) return null;
		return this.makeLake(id, x, z, radius, contained, false, shape);
	}

	private makeLake(
		id: string,
		x: number,
		z: number,
		radius: number,
		waterLevel: number,
		sink: boolean,
		shape: Pick<LakeDefinition, 'a1' | 'p1' | 'a2' | 'p2' | 'a3' | 'p3'> = this.lakeShape(x, z)
	): LakeDefinition {
		const lake: LakeDefinition = {
			id,
			x,
			z,
			waterLevel,
			baseRadius: radius,
			depth: (1.15 + radius * 0.042) * this.settings.lakeDepthScale,
			...shape,
			bounds: emptyBounds(),
			sink
		};
		const reach = radius * (1 + lake.a1 + lake.a2 + lake.a3);
		lake.bounds = { minX: x - reach, maxX: x + reach, minZ: z - reach, maxZ: z + reach };
		return lake;
	}

	private createSinkLake(cx: number, cz: number, height: number): LakeDefinition | null {
		const x = (cx + 0.5) * this.limits.gridSpacing;
		const z = (cz + 0.5) * this.limits.gridSpacing;
		const near = this.lakeNear(x, z, 80);
		if (near) return near;
		const rx = floorDiv(x, this.limits.regionSize);
		const rz = floorDiv(z, this.limits.regionSize);
		const existing = this.regions.get(regionKey(rx, rz));
		if (existing && existing.lakes.filter((lake) => lake.sink).length >= 2) return null;
		const region = this.generateLakes(rx, rz);
		const radius = this.settings.minLakeRadius + this.hash(cx, cz, 3, 11) * 8;
		const shape = this.lakeShape(x, z);
		const contained = this.containedWaterLevel(x, z, radius, height, shape);
		if (contained === null) return null;
		const lake = this.makeLake(`sink:${cx}:${cz}`, x, z, radius, contained, true, shape);
		this.addLake(region, lake);
		return lake;
	}

	private routeOutlet(lake: LakeDefinition): RiverDefinition | null {
		let bestX = lake.x;
		let bestZ = lake.z;
		let bestH = Number.POSITIVE_INFINITY;
		let bestAngle = 0;
		const rim = lakeRadiusAt(lake, 0) * 1.12;
		for (let i = 0; i < 16; i++) {
			const angle = (i / 16) * Math.PI * 2;
			const x = lake.x + Math.cos(angle) * rim;
			const z = lake.z + Math.sin(angle) * rim;
			const h = this.base.sample(x, z);
			if (h < bestH) {
				bestH = h;
				bestX = x;
				bestZ = z;
				bestAngle = angle;
			}
		}
		if (bestH > lake.waterLevel + 2.4) return null;
		const grid = this.limits.gridSpacing;
		const sx = bestX + Math.cos(bestAngle) * grid * 0.6;
		const sz = bestZ + Math.sin(bestAngle) * grid * 0.6;
		return this.route({
			cx: floorDiv(sx, grid),
			cz: floorDiv(sz, grid),
			id: `o:${lake.id}`,
			priority: lake.waterLevel - 0.05,
			seed: Math.floor(this.hash(Math.round(lake.x), Math.round(lake.z), 4, 12) * 1_000_000),
			originX: sx,
			originZ: sz,
			lockWaterY: lake.waterLevel,
			forbidLakeId: lake.id,
			outletGrace: 5,
			outletOfLakeId: lake.id,
			noSinkLake: false
		});
	}

	private route(opts: {
		cx: number;
		cz: number;
		id: string;
		priority: number;
		seed: number;
		originX: number;
		originZ: number;
		lockWaterY?: number;
		forbidLakeId?: string;
		outletGrace?: number;
		outletOfLakeId?: string;
		noSinkLake?: boolean;
		/** Flow at the source (default 0.5, a spring). */
		startFlow?: number;
	}): RiverDefinition | null {
		const grid = this.limits.gridSpacing;
		const raw: RawNode[] = [];
		const cells: number[] = [];
		const seen = new Set<number>();
		let cx = opts.cx;
		let cz = opts.cz;
		let prevDx = 0;
		let prevDz = 0;
		const maxSteps = Math.max(8, Math.floor(this.limits.maxTravel / grid));
		const phase = this.hash(opts.cx, opts.cz, opts.seed, 13) * Math.PI * 2;
		let sink: LakeDefinition | null = null;

		for (let step = 0; step < maxSteps; step++) {
			const key = packCell(cx, cz);
			if (seen.has(key)) break;
			seen.add(key);
			const h = this.cellHeight(cx, cz);
			const x = (cx + 0.5) * grid;
			const z = (cz + 0.5) * grid;
			if (step > 0 && Math.hypot(x - opts.originX, z - opts.originZ) > this.limits.maxTravel) break;
			raw.push({ x, z, h, cx, cz });
			cells.push(key);

			const wx = x;
			const wz = z;
			this.generateLakes(
				floorDiv(wx, this.limits.regionSize),
				floorDiv(wz, this.limits.regionSize)
			);
			const hit =
				step > 1 && step >= (opts.outletGrace ?? 0) ? this.lakeAt(wx, wz, opts.forbidLakeId) : null;
			if (hit) {
				sink = hit;
				break;
			}

			const next = this.pickStep(cx, cz, h, prevDx, prevDz, step, phase, seen);
			if (next) {
				prevDx = next.cx - cx;
				prevDz = next.cz - cz;
				cx = next.cx;
				cz = next.cz;
				continue;
			}

			const escape = this.findEscape(cx, cz, h, seen);
			if (escape) {
				prevDx = escape.cx - cx;
				prevDz = escape.cz - cz;
				cx = escape.cx;
				cz = escape.cz;
				continue;
			}

			if (this.neighborsHigher(cx, cz, h)) {
				sink = this.createSinkLake(cx, cz, h);
				break;
			}
			const spill = this.lowestOpen(cx, cz, seen);
			if (!spill) break;
			prevDx = spill.cx - cx;
			prevDz = spill.cz - cz;
			cx = spill.cx;
			cz = spill.cz;
		}

		if (raw.length < 2) return null;
		// An outlet that wanders back into its own lake is not an outlet: the lake keeps no outflow.
		if (sink && sink.id === opts.forbidLakeId) return null;
		return this.finishRiver(raw, cells, opts, sink, phase);
	}

	private pickStep(
		cx: number,
		cz: number,
		h: number,
		prevDx: number,
		prevDz: number,
		step: number,
		phase: number,
		seen: Set<number>
	): { cx: number; cz: number } | null {
		let best: { cx: number; cz: number } | null = null;
		let bestScore = -Infinity;
		const prevLen = Math.hypot(prevDx, prevDz);
		for (const [dx, dz] of DIRS) {
			const nx = cx + dx;
			const nz = cz + dz;
			if (seen.has(packCell(nx, nz))) continue;
			const nh = this.cellHeight(nx, nz);
			const dist = Math.hypot(dx, dz);
			const slope = (h - nh) / dist;
			let score = slope * 48;
			if (prevLen > 0) score += ((dx * prevDx + dz * prevDz) / (dist * prevLen)) * 1.15;
			const lateral = prevLen > 0 ? (dx * -prevDz + dz * prevDx) / (dist * prevLen) : 0;
			const flat = 1 - clamp(Math.abs(slope) / 0.08, 0, 1);
			score +=
				lateral * Math.sin(step * 0.55 + phase) * this.settings.meanderStrength * flat * 0.22;
			if (slope < -0.004) score -= 40;
			if (score > bestScore) {
				bestScore = score;
				best = { cx: nx, cz: nz };
			}
		}
		if (!best || bestScore < -20) return null;
		return best;
	}

	private findEscape(
		cx: number,
		cz: number,
		h: number,
		seen: Set<number>
	): { cx: number; cz: number } | null {
		const start = packCell(cx, cz);
		const parent = new Map<number, number>();
		parent.set(start, -1);
		const queue: { cx: number; cz: number }[] = [{ cx, cz }];
		let read = 0;
		let found = -1;
		let guard = 0;
		while (read < queue.length && guard < 42) {
			let bestI = read;
			let bestH = this.cellHeight(queue[read].cx, queue[read].cz);
			for (let i = read + 1; i < queue.length; i++) {
				const hh = this.cellHeight(queue[i].cx, queue[i].cz);
				if (hh < bestH) {
					bestH = hh;
					bestI = i;
				}
			}
			const swap = queue[read];
			queue[read] = queue[bestI];
			queue[bestI] = swap;
			const cur = queue[read++];
			guard++;
			const key = packCell(cur.cx, cur.cz);
			if (key !== start && bestH < h - 0.3 && !seen.has(key)) {
				found = key;
				break;
			}
			for (const [dx, dz] of DIRS) {
				const nx = cur.cx + dx;
				const nz = cur.cz + dz;
				const nk = packCell(nx, nz);
				if (parent.has(nk) || seen.has(nk)) continue;
				if (this.cellHeight(nx, nz) > h + 2) continue;
				parent.set(nk, key);
				queue.push({ cx: nx, cz: nz });
			}
		}
		if (found < 0) return null;
		let cursor = found;
		for (let i = 0; i < 40; i++) {
			const previous = parent.get(cursor);
			if (previous === undefined || previous === start || previous === -1) break;
			cursor = previous;
		}
		if (seen.has(cursor) || cursor === start) return null;
		return unpackCell(cursor);
	}

	private neighborsHigher(cx: number, cz: number, h: number): boolean {
		let sum = 0;
		let n = 0;
		for (const [dx, dz] of DIRS) {
			sum += this.cellHeight(cx + dx, cz + dz);
			n++;
		}
		return sum / n > h + 0.85;
	}

	private lowestOpen(cx: number, cz: number, seen: Set<number>): { cx: number; cz: number } | null {
		let best: { cx: number; cz: number } | null = null;
		let bestH = Number.POSITIVE_INFINITY;
		for (const [dx, dz] of DIRS) {
			const nx = cx + dx;
			const nz = cz + dz;
			if (seen.has(packCell(nx, nz))) continue;
			const hh = this.cellHeight(nx, nz);
			if (hh < bestH) {
				bestH = hh;
				best = { cx: nx, cz: nz };
			}
		}
		return best;
	}

	private finishRiver(
		raw: RawNode[],
		cells: number[],
		opts: {
			id: string;
			priority: number;
			seed: number;
			lockWaterY?: number;
			outletOfLakeId?: string;
			startFlow?: number;
		},
		sink: LakeDefinition | null,
		phase: number
	): RiverDefinition | null {
		const meandered = this.applyMeander(raw, phase);
		const source = this.lakeById(opts.outletOfLakeId);
		// An outlet starts out on its lake, so its ribbon begins under the lake surface and leaves
		// through the shoreline at the lake level rather than appearing beyond a dry gap.
		if (source && meandered.length > 0) {
			const first = meandered[0];
			const angle = Math.atan2(first.z - source.z, first.x - source.x);
			const inside = lakeRadiusAt(source, angle) * 0.75;
			meandered.unshift({
				x: source.x + Math.cos(angle) * inside,
				z: source.z + Math.sin(angle) * inside
			});
		}
		const curve = this.resample(meandered);
		if (curve.length < 2) return null;
		const lockEnd = source ? outletLakeSpan(curve, source) : 0;
		const ownLakes = [source, sink].filter((lake): lake is LakeDefinition => lake !== null);
		const samples = this.profile(curve, opts.lockWaterY, opts.startFlow, lockEnd, ownLakes);
		// Where an outlet runs straight into the next lake, its start stays on the lake it leaves.
		const lockStart = sink ? Math.max(lockEnd, sinkLakeStart(samples, sink)) : samples.length;
		if (sink) meetSinkLake(samples, lockStart, sink.waterLevel);
		if (samples.some((sample) => !Number.isFinite(sample.x) || !Number.isFinite(sample.waterY)))
			return null;

		const bounds = emptyBounds();
		for (const sample of samples) includePoint(bounds, sample.x, sample.z);
		const river: RiverDefinition = {
			id: opts.id,
			seed: opts.seed,
			priority: opts.priority,
			sourceX: samples[0].x,
			sourceZ: samples[0].z,
			samples,
			raw: raw.map((node) => ({ x: node.x, z: node.z })),
			cells,
			bounds,
			endIndex: samples.length,
			flowExtra: new Array(samples.length).fill(0),
			sinkLakeId: sink?.id,
			outletOfLakeId: opts.outletOfLakeId,
			lakeLockStart: sink && lockStart < samples.length ? lockStart : undefined,
			lakeLockEnd: source ? lockEnd : undefined
		};
		return river;
	}

	private applyMeander(raw: RawNode[], phase: number): { x: number; z: number }[] {
		return raw.map((node, index) => {
			if (index === 0 || index === raw.length - 1) return { x: node.x, z: node.z };
			const prev = raw[index - 1];
			const next = raw[index + 1];
			const dx = next.x - prev.x;
			const dz = next.z - prev.z;
			const len = Math.hypot(dx, dz) || 1;
			const slope = Math.abs(prev.h - next.h) / len;
			const flat = 1 - clamp(slope / 0.045, 0, 1);
			let offset = Math.sin(index * 0.62 + phase) * this.settings.meanderStrength * (3 + 16 * flat);
			let x = node.x + (-dz / len) * offset;
			let z = node.z + (dx / len) * offset;
			if (this.base.sample(x, z) > node.h + 2) {
				offset *= 0.35;
				x = node.x + (-dz / len) * offset;
				z = node.z + (dx / len) * offset;
			}
			return { x, z };
		});
	}

	private resample(points: { x: number; z: number }[]): { x: number; z: number }[] {
		const out: { x: number; z: number }[] = [];
		const spacing = 8;
		const drift = this.limits.gridSpacing * 0.4;
		for (let i = 0; i < points.length - 1; i++) {
			const p0 = points[Math.max(0, i - 1)];
			const p1 = points[i];
			const p2 = points[i + 1];
			const p3 = points[Math.min(points.length - 1, i + 2)];
			const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
			const steps = Math.max(1, Math.round(dist / spacing));
			for (let s = 0; s < steps; s++) {
				const t = s / steps;
				let x = catmullRom(p0.x, p1.x, p2.x, p3.x, t);
				let z = catmullRom(p0.z, p1.z, p2.z, p3.z, t);
				const abx = p2.x - p1.x;
				const abz = p2.z - p1.z;
				const ab2 = abx * abx + abz * abz || 1;
				const u = clamp(((x - p1.x) * abx + (z - p1.z) * abz) / ab2, 0, 1);
				const qx = p1.x + abx * u;
				const qz = p1.z + abz * u;
				const delta = Math.hypot(x - qx, z - qz);
				if (delta > drift) {
					const scale = drift / delta;
					x = qx + (x - qx) * scale;
					z = qz + (z - qz) * scale;
				}
				out.push({ x, z });
			}
		}
		out.push(points[points.length - 1]);
		return out;
	}

	private profile(
		curve: { x: number; z: number }[],
		lockStart?: number,
		startFlow = 0.5,
		/** Leading samples held at `lockStart` (an outlet still on its lake). */
		lockCount = 0,
		ownLakes: readonly LakeDefinition[] = []
	): RiverSample[] {
		const rawY = curve.map((point) => this.base.sample(point.x, point.z) - 0.42);
		const smooth = rawY.slice();
		for (let i = 1; i < smooth.length - 1; i++) {
			smooth[i] = rawY[i - 1] * 0.22 + rawY[i] * 0.56 + rawY[i + 1] * 0.22;
		}
		if (lockStart !== undefined) smooth[0] = lockStart;
		let water = smooth[0];
		let flow = startFlow;
		const samples: RiverSample[] = [];
		for (let i = 0; i < curve.length; i++) {
			const prev = curve[Math.max(0, i - 1)];
			const next = curve[Math.min(curve.length - 1, i + 1)];
			const dx = next.x - prev.x;
			const dz = next.z - prev.z;
			const len = Math.hypot(dx, dz) || 1;
			const tangentX = dx / len;
			const tangentZ = dz / len;
			const width = widthForFlow(flow, this.settings);
			// The outlet stays on the lake until its mouth. Everywhere else the surface drops to
			// whichever bank is lower, so the ribbon cannot sit above the ground beside it.
			if (lockStart !== undefined && i < Math.max(1, lockCount)) {
				water = lockStart;
			} else {
				water = Math.min(water, smooth[i]);
				water = Math.min(
					water,
					this.bankCap(curve[i].x, curve[i].z, tangentX, tangentZ, width, ownLakes)
				);
			}
			const sample: RiverSample = {
				x: curve[i].x,
				z: curve[i].z,
				waterY: water,
				baseFlow: flow,
				flow,
				width,
				depth: depthForFlow(flow, this.settings),
				tangentX,
				tangentZ
			};
			samples.push(sample);
			flow += 0.15;
		}
		return samples;
	}

	/**
	 * Lowest natural ground under the water skin and one vertex further out, on both sides.
	 * The surface is kept `RIVER_BANK_CLEARANCE` below that, which also deepens the cut.
	 */
	private bankCap(
		x: number,
		z: number,
		tangentX: number,
		tangentZ: number,
		width: number,
		ownLakes: readonly LakeDefinition[]
	): number {
		const edge = riverWaterEdge(width, this.settings.riverBankScale);
		const px = -tangentZ;
		const pz = tangentX;
		let low = Number.POSITIVE_INFINITY;
		for (const dist of [edge, edge + 1.6]) {
			low = Math.min(low, this.bankGround(x + px * dist, z + pz * dist, ownLakes));
			low = Math.min(low, this.bankGround(x - px * dist, z - pz * dist, ownLakes));
		}
		return low - RIVER_BANK_CLEARANCE;
	}

	private lakeAt(x: number, z: number, forbidId?: string): LakeDefinition | null {
		let best: LakeDefinition | null = null;
		let bestD = 0.94;
		for (const lake of this.lakes) {
			if (lake.id === forbidId) continue;
			if (!boundsOverlap(lake.bounds, { minX: x, maxX: x, minZ: z, maxZ: z }, 0)) continue;
			const d = pointInLake(lake, x, z);
			if (d < bestD) {
				bestD = d;
				best = lake;
			}
		}
		return best;
	}

	private lakeNear(x: number, z: number, radius: number): LakeDefinition | null {
		for (const lake of this.lakes) {
			if (Math.hypot(lake.x - x, lake.z - z) < radius + lake.baseRadius) return lake;
		}
		return null;
	}

	private cellHeight(cx: number, cz: number): number {
		const key = packCell(cx, cz);
		const cached = this.heights.get(key);
		if (cached !== undefined) return cached;
		const height = this.base.sample(
			(cx + 0.5) * this.limits.gridSpacing,
			(cz + 0.5) * this.limits.gridSpacing
		);
		this.heights.set(key, height);
		return height;
	}

	private hash(a: number, b: number, c: number, channel: number): number {
		return hashCellToFloat01(
			this.seedHash,
			a,
			b,
			channel + c * 17 + this.settings.generatorVersion * 101
		);
	}
}

/** Closest approach (m) of a river's active samples to a point. */
function minDistanceTo(river: RiverDefinition, x: number, z: number): number {
	let best = Number.POSITIVE_INFINITY;
	const end = Math.max(1, Math.min(river.samples.length, river.endIndex));
	for (let i = 0; i < end; i++) {
		const sample = river.samples[i];
		const d = Math.hypot(sample.x - x, sample.z - z);
		if (d < best) best = d;
	}
	return best;
}
