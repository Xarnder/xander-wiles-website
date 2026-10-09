import { floorDiv, lakeMaxRadius, packCell, riverReach, unpackCell } from './HydrologyMath';
import type { HydrologySettings, LakeDefinition, RiverDefinition } from './HydrologyTypes';

/** Query cell size. Independent of the coarser routing grid so terrain vertices stay high resolution. */
export const HYDRO_CELL = 64;

export interface RiverSegment {
	riverId: string;
	x0: number;
	z0: number;
	x1: number;
	z1: number;
	y0: number;
	y1: number;
	w0: number;
	w1: number;
	d0: number;
	d1: number;
	tx: number;
	tz: number;
	reach: number;
}

interface Bucket {
	rivers: RiverSegment[];
	lakes: LakeDefinition[];
}

/**
 * World-space grid of the rivers and lakes that can affect a point. Terrain sampling looks up one
 * cell and a handful of segments — it never scans every river in the world.
 */
export class HydrologySpatialIndex {
	private readonly cells = new Map<number, Bucket>();
	private readonly riverCells = new Map<string, number[]>();

	clear(): void {
		this.cells.clear();
		this.riverCells.clear();
	}

	get size(): number {
		return this.cells.size;
	}

	bucket(worldX: number, worldZ: number): Bucket | undefined {
		return this.cells.get(packCell(floorDiv(worldX, HYDRO_CELL), floorDiv(worldZ, HYDRO_CELL)));
	}

	/** Cells that currently hold at least one feature, for the spatial-cell debug overlay. */
	occupiedCells(): { cx: number; cz: number }[] {
		const out: { cx: number; cz: number }[] = [];
		for (const key of this.cells.keys()) out.push(unpackCell(key));
		return out;
	}

	removeRiver(riverId: string): void {
		const keys = this.riverCells.get(riverId);
		if (!keys) return;
		for (const key of keys) {
			const bucket = this.cells.get(key);
			if (!bucket) continue;
			bucket.rivers = bucket.rivers.filter((segment) => segment.riverId !== riverId);
			if (bucket.rivers.length === 0 && bucket.lakes.length === 0) this.cells.delete(key);
		}
		this.riverCells.delete(riverId);
	}

	addRiver(river: RiverDefinition, settings: HydrologySettings): void {
		this.removeRiver(river.id);
		const keys: number[] = [];
		const end = Math.max(1, Math.min(river.endIndex, river.samples.length));
		for (let i = 0; i < end - 1; i++) {
			const a = river.samples[i];
			const b = river.samples[i + 1];
			const reach = Math.max(
				riverReach(a.width, settings.riverBankScale),
				riverReach(b.width, settings.riverBankScale)
			);
			const dx = b.x - a.x;
			const dz = b.z - a.z;
			const len = Math.hypot(dx, dz) || 1;
			const segment: RiverSegment = {
				riverId: river.id,
				x0: a.x,
				z0: a.z,
				x1: b.x,
				z1: b.z,
				y0: a.waterY,
				y1: b.waterY,
				w0: a.width,
				w1: b.width,
				d0: a.depth,
				d1: b.depth,
				tx: dx / len,
				tz: dz / len,
				reach
			};
			this.insertSegment(segment, keys);
		}
		this.riverCells.set(river.id, keys);
	}

	addLake(lake: LakeDefinition): void {
		const reach = lakeMaxRadius(lake) * 1.4;
		const minCx = floorDiv(lake.x - reach, HYDRO_CELL);
		const maxCx = floorDiv(lake.x + reach, HYDRO_CELL);
		const minCz = floorDiv(lake.z - reach, HYDRO_CELL);
		const maxCz = floorDiv(lake.z + reach, HYDRO_CELL);
		for (let cz = minCz; cz <= maxCz; cz++) {
			for (let cx = minCx; cx <= maxCx; cx++) {
				const bucket = this.bucketFor(packCell(cx, cz));
				if (!bucket.lakes.includes(lake)) bucket.lakes.push(lake);
			}
		}
	}

	private insertSegment(segment: RiverSegment, keys: number[]): void {
		const pad = segment.reach;
		const minCx = floorDiv(Math.min(segment.x0, segment.x1) - pad, HYDRO_CELL);
		const maxCx = floorDiv(Math.max(segment.x0, segment.x1) + pad, HYDRO_CELL);
		const minCz = floorDiv(Math.min(segment.z0, segment.z1) - pad, HYDRO_CELL);
		const maxCz = floorDiv(Math.max(segment.z0, segment.z1) + pad, HYDRO_CELL);
		for (let cz = minCz; cz <= maxCz; cz++) {
			for (let cx = minCx; cx <= maxCx; cx++) {
				const key = packCell(cx, cz);
				this.bucketFor(key).rivers.push(segment);
				keys.push(key);
			}
		}
	}

	private bucketFor(key: number): Bucket {
		let bucket = this.cells.get(key);
		if (!bucket) {
			bucket = { rivers: [], lakes: [] };
			this.cells.set(key, bucket);
		}
		return bucket;
	}
}

export type { Bucket };
