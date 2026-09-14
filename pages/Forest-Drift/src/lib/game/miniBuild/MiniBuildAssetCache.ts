import { compileMiniBuildData, type CompiledMiniBuildData } from './MiniBuildCompiler';
import {
	createMiniBuildAsset,
	estimateMiniBuildDataBytes,
	type CompiledMiniBuildAsset
} from './MiniBuildAsset';
import { MINI_BUILD_COMPILER_VERSION, type MiniBuildDefinition } from './MiniBuildTypes';

export function miniBuildAssetKey(
	definition: Pick<MiniBuildDefinition, 'id' | 'revision'>
): string {
	return `${definition.id}:r${definition.revision}:c${MINI_BUILD_COMPILER_VERSION}`;
}

interface CacheEntry {
	data: CompiledMiniBuildData;
	asset: CompiledMiniBuildAsset | null;
	refs: number;
}

export interface MiniBuildAssetCacheStats {
	entries: number;
	gpuAssets: number;
	referenced: number;
	compiles: number;
	lastCompileMs: number;
	totalCompileMs: number;
	estimatedBytes: number;
	vertices: number;
	triangles: number;
}

export interface MiniBuildAssetCacheOptions {
	/** Unreferenced entries kept warm (LRU) before disposal — cheap re-placement after a removal. */
	maxUnreferenced?: number;
	now?: () => number;
}

/**
 * Compile once, share everywhere. Keyed by design id + revision + compiler version, so a saved
 * edit (revision++) naturally produces one new compile while every other design's asset is
 * untouched.
 *
 * Lifecycle is reference counted per *consumer* (a render batch, the ghost preview), not per
 * placed copy: 100 chairs in one chunk hold a single reference. When the last reference is
 * released the asset moves to a small LRU of unreferenced entries and is disposed only when evicted,
 * so geometry still in use can never be freed underneath a batch.
 */
export class MiniBuildAssetCache {
	private readonly entries = new Map<string, CacheEntry>();
	private readonly maxUnreferenced: number;
	private readonly now: () => number;
	private compiles = 0;
	private lastCompileMs = 0;
	private totalCompileMs = 0;

	constructor(options: MiniBuildAssetCacheOptions = {}) {
		this.maxUnreferenced = options.maxUnreferenced ?? 48;
		this.now =
			options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
	}

	/** Pure compiled data (bounds, collision, stats) without allocating GPU geometry. */
	getData(definition: MiniBuildDefinition): CompiledMiniBuildData {
		return this.entryFor(definition).data;
	}

	acquire(definition: MiniBuildDefinition): CompiledMiniBuildAsset {
		const key = miniBuildAssetKey(definition);
		const entry = this.entryFor(definition);
		if (!entry.asset || entry.asset.disposed) entry.asset = createMiniBuildAsset(key, entry.data);
		entry.refs++;
		// Referenced entries leave the LRU ordering (re-inserted at the end on release).
		return entry.asset;
	}

	release(asset: CompiledMiniBuildAsset): void {
		const entry = this.entries.get(asset.key);
		if (!entry || entry.asset !== asset || entry.refs === 0) return;
		entry.refs--;
		if (entry.refs === 0) {
			this.entries.delete(asset.key);
			this.entries.set(asset.key, entry);
			this.evict();
		}
	}

	has(definition: Pick<MiniBuildDefinition, 'id' | 'revision'>): boolean {
		return this.entries.has(miniBuildAssetKey(definition));
	}

	refCount(definition: Pick<MiniBuildDefinition, 'id' | 'revision'>): number {
		return this.entries.get(miniBuildAssetKey(definition))?.refs ?? 0;
	}

	/** Drops unreferenced entries for a design (all revisions) — used after delete. */
	purgeDesign(designId: string): void {
		for (const [key, entry] of [...this.entries]) {
			if (entry.data.designId !== designId || entry.refs > 0) continue;
			entry.asset?.dispose();
			this.entries.delete(key);
		}
	}

	get compileCount(): number {
		return this.compiles;
	}

	getStats(): MiniBuildAssetCacheStats {
		let gpuAssets = 0;
		let referenced = 0;
		let estimatedBytes = 0;
		let vertices = 0;
		let triangles = 0;
		for (const entry of this.entries.values()) {
			if (entry.asset && !entry.asset.disposed) gpuAssets++;
			if (entry.refs > 0) referenced++;
			estimatedBytes += estimateMiniBuildDataBytes(entry.data);
			vertices += entry.data.stats.vertices;
			triangles += entry.data.stats.triangles;
		}
		return {
			entries: this.entries.size,
			gpuAssets,
			referenced,
			compiles: this.compiles,
			lastCompileMs: this.lastCompileMs,
			totalCompileMs: this.totalCompileMs,
			estimatedBytes,
			vertices,
			triangles
		};
	}

	dispose(): void {
		for (const entry of this.entries.values()) entry.asset?.dispose();
		this.entries.clear();
	}

	private entryFor(definition: MiniBuildDefinition): CacheEntry {
		const key = miniBuildAssetKey(definition);
		const existing = this.entries.get(key);
		if (existing) {
			if (existing.refs === 0) {
				// Touch for LRU order.
				this.entries.delete(key);
				this.entries.set(key, existing);
			}
			return existing;
		}
		const started = this.now();
		const data = compileMiniBuildData(definition);
		this.lastCompileMs = this.now() - started;
		this.totalCompileMs += this.lastCompileMs;
		this.compiles++;
		const entry: CacheEntry = { data, asset: null, refs: 0 };
		this.entries.set(key, entry);
		this.evict(key);
		return entry;
	}

	/** `keep` protects an entry that is about to be referenced by the caller. */
	private evict(keep?: string): void {
		let unreferenced = 0;
		for (const [key, entry] of this.entries) if (entry.refs === 0 && key !== keep) unreferenced++;
		if (unreferenced <= this.maxUnreferenced) return;
		for (const [key, entry] of this.entries) {
			if (unreferenced <= this.maxUnreferenced) break;
			if (entry.refs > 0 || key === keep) continue;
			entry.asset?.dispose();
			this.entries.delete(key);
			unreferenced--;
		}
	}
}
