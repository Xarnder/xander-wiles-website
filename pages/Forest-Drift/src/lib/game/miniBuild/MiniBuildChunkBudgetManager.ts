import { MINI_BUILD_WORLD_LIMITS, type WorldChunkId } from './MiniBuildTypes';

export interface MiniBuildBudgetLimits {
	primitiveBudgetPerChunk: number;
	maxInstancesPerChunk: number;
	nearBudgetRatio: number;
}

export type MiniBuildBudgetFailure = 'primitives' | 'instances';

export interface MiniBuildBudgetCheck {
	ok: boolean;
	reason?: MiniBuildBudgetFailure;
	usage: number;
	remaining: number;
	/** Adding would leave the chunk at or above the "becoming very detailed" threshold. */
	nearLimit: boolean;
}

interface ChunkUsage {
	primitives: number;
	instances: number;
}

/**
 * The player-facing detail budget: source cuboids per Mini Build chunk.
 *
 * Maintained incrementally as authored state changes (add / remove / move / design edit), never by
 * scanning placed objects — `getPrimitiveUsage` is a map lookup. An instance is charged to exactly
 * one chunk: the one containing its anchor.
 */
export class MiniBuildChunkBudgetManager {
	private readonly chunks = new Map<WorldChunkId, ChunkUsage>();
	private readonly instances = new Map<string, { chunkId: WorldChunkId; cost: number }>();
	readonly limits: MiniBuildBudgetLimits;

	constructor(limits: Partial<MiniBuildBudgetLimits> = {}) {
		this.limits = {
			primitiveBudgetPerChunk:
				limits.primitiveBudgetPerChunk ?? MINI_BUILD_WORLD_LIMITS.primitiveBudgetPerChunk,
			maxInstancesPerChunk:
				limits.maxInstancesPerChunk ?? MINI_BUILD_WORLD_LIMITS.maxInstancesPerChunk,
			nearBudgetRatio: limits.nearBudgetRatio ?? MINI_BUILD_WORLD_LIMITS.nearBudgetRatio
		};
	}

	getPrimitiveUsage(chunkId: WorldChunkId): number {
		return this.chunks.get(chunkId)?.primitives ?? 0;
	}

	getInstanceCount(chunkId: WorldChunkId): number {
		return this.chunks.get(chunkId)?.instances ?? 0;
	}

	getRemainingPrimitiveBudget(chunkId: WorldChunkId): number {
		return this.limits.primitiveBudgetPerChunk - this.getPrimitiveUsage(chunkId);
	}

	canAdd(chunkId: WorldChunkId, primitiveCost: number): boolean {
		return this.check(chunkId, primitiveCost).ok;
	}

	check(chunkId: WorldChunkId, primitiveCost: number, extraInstances = 1): MiniBuildBudgetCheck {
		const usage = this.getPrimitiveUsage(chunkId);
		const next = usage + primitiveCost;
		const remaining = this.limits.primitiveBudgetPerChunk - usage;
		const nearLimit = next >= this.limits.primitiveBudgetPerChunk * this.limits.nearBudgetRatio;
		if (next > this.limits.primitiveBudgetPerChunk) {
			return { ok: false, reason: 'primitives', usage, remaining, nearLimit: true };
		}
		if (this.getInstanceCount(chunkId) + extraInstances > this.limits.maxInstancesPerChunk) {
			return { ok: false, reason: 'instances', usage, remaining, nearLimit: true };
		}
		return { ok: true, usage, remaining, nearLimit };
	}

	has(instanceId: string): boolean {
		return this.instances.has(instanceId);
	}

	getCost(instanceId: string): number | undefined {
		return this.instances.get(instanceId)?.cost;
	}

	getChunkOf(instanceId: string): WorldChunkId | undefined {
		return this.instances.get(instanceId)?.chunkId;
	}

	addInstance(instanceId: string, chunkId: WorldChunkId, primitiveCost: number): boolean {
		if (this.instances.has(instanceId)) return false;
		if (!this.canAdd(chunkId, primitiveCost)) return false;
		this.instances.set(instanceId, { chunkId, cost: primitiveCost });
		const usage = this.usageFor(chunkId);
		usage.primitives += primitiveCost;
		usage.instances++;
		return true;
	}

	removeInstance(instanceId: string): boolean {
		const record = this.instances.get(instanceId);
		if (!record) return false;
		this.instances.delete(instanceId);
		const usage = this.chunks.get(record.chunkId);
		if (usage) {
			usage.primitives -= record.cost;
			usage.instances--;
			if (usage.instances <= 0) this.chunks.delete(record.chunkId);
		}
		return true;
	}

	/** Validates the destination before transferring the cost. Same-chunk moves always succeed. */
	moveInstance(instanceId: string, toChunkId: WorldChunkId): boolean {
		const record = this.instances.get(instanceId);
		if (!record) return false;
		if (record.chunkId === toChunkId) return true;
		if (!this.canAdd(toChunkId, record.cost)) return false;
		this.removeInstance(instanceId);
		this.instances.set(instanceId, { chunkId: toChunkId, cost: record.cost });
		const usage = this.usageFor(toChunkId);
		usage.primitives += record.cost;
		usage.instances++;
		return true;
	}

	/**
	 * Checks a set of per-instance cost changes (a shared design edit) without applying them.
	 * Returns the chunks that would exceed the budget.
	 */
	chunksExceededByCostChange(instanceIds: Iterable<string>, newCost: number): WorldChunkId[] {
		const deltas = new Map<WorldChunkId, number>();
		for (const id of instanceIds) {
			const record = this.instances.get(id);
			if (!record) continue;
			deltas.set(record.chunkId, (deltas.get(record.chunkId) ?? 0) + newCost - record.cost);
		}
		const exceeded: WorldChunkId[] = [];
		for (const [chunkId, delta] of deltas) {
			if (this.getPrimitiveUsage(chunkId) + delta > this.limits.primitiveBudgetPerChunk)
				exceeded.push(chunkId);
		}
		return exceeded;
	}

	/** Applies a cost change unconditionally — callers validate with `chunksExceededByCostChange` first. */
	setCost(instanceId: string, newCost: number): void {
		const record = this.instances.get(instanceId);
		if (!record) return;
		const usage = this.usageFor(record.chunkId);
		usage.primitives += newCost - record.cost;
		record.cost = newCost;
	}

	getChunkIds(): WorldChunkId[] {
		return [...this.chunks.keys()];
	}

	clear(): void {
		this.chunks.clear();
		this.instances.clear();
	}

	private usageFor(chunkId: WorldChunkId): ChunkUsage {
		let usage = this.chunks.get(chunkId);
		if (!usage) {
			usage = { primitives: 0, instances: 0 };
			this.chunks.set(chunkId, usage);
		}
		return usage;
	}
}
