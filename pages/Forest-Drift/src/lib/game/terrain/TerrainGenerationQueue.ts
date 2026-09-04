import { chunkKey, type ChunkKey } from './chunkKey';

export interface ChunkJob {
	chunkX: number;
	chunkZ: number;
	/** Terrain revision this job was queued under; consumers discard stale results. */
	revision: number;
}

/**
 * Pending chunk-generation work, keyed by chunk coordinate so a chunk is never queued twice
 * (re-enqueuing simply overwrites the pending job, keeping the latest revision). take() pulls
 * jobs nearest the player first and respects a per-call budget so a caller can spread work
 * across frames.
 */
export class TerrainGenerationQueue {
	private readonly jobs = new Map<ChunkKey, ChunkJob>();

	enqueue(chunkX: number, chunkZ: number, revision: number): void {
		this.jobs.set(chunkKey(chunkX, chunkZ), { chunkX, chunkZ, revision });
	}

	remove(chunkX: number, chunkZ: number): void {
		this.jobs.delete(chunkKey(chunkX, chunkZ));
	}

	has(chunkX: number, chunkZ: number): boolean {
		return this.jobs.has(chunkKey(chunkX, chunkZ));
	}

	get size(): number {
		return this.jobs.size;
	}

	clear(): void {
		this.jobs.clear();
	}

	/** Drops any queued job whose chunk key is not in `requiredKeys` (e.g. the player walked away before it generated). */
	pruneToRequired(requiredKeys: ReadonlySet<ChunkKey>): void {
		for (const key of this.jobs.keys()) {
			if (!requiredKeys.has(key)) this.jobs.delete(key);
		}
	}

	/** Removes and returns every job within `maxDistanceSq` of the player chunk, nearest first — unlike take(), no count limit. */
	takeWithinDistance(
		playerChunkX: number,
		playerChunkZ: number,
		maxDistanceSq: number
	): ChunkJob[] {
		const matched: ChunkJob[] = [];
		for (const [key, job] of this.jobs) {
			if (distanceSq(job, playerChunkX, playerChunkZ) <= maxDistanceSq) {
				matched.push(job);
				this.jobs.delete(key);
			}
		}
		matched.sort(
			(a, b) =>
				distanceSq(a, playerChunkX, playerChunkZ) - distanceSq(b, playerChunkX, playerChunkZ)
		);
		return matched;
	}

	/** Removes and returns up to `count` jobs, nearest the player chunk first. */
	take(playerChunkX: number, playerChunkZ: number, count: number): ChunkJob[] {
		if (this.jobs.size === 0 || count <= 0) return [];

		const sorted = Array.from(this.jobs.values()).sort((a, b) => {
			const da = distanceSq(a, playerChunkX, playerChunkZ);
			const db = distanceSq(b, playerChunkX, playerChunkZ);
			return da - db;
		});

		const taken = sorted.slice(0, count);
		for (const job of taken) {
			this.jobs.delete(chunkKey(job.chunkX, job.chunkZ));
		}
		return taken;
	}
}

function distanceSq(job: ChunkJob, playerChunkX: number, playerChunkZ: number): number {
	const dx = job.chunkX - playerChunkX;
	const dz = job.chunkZ - playerChunkZ;
	return dx * dx + dz * dz;
}
