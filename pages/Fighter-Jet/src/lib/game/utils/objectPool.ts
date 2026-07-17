export interface PoolOptions<T> {
	create: () => T;
	reset?: (item: T) => void;
	initialSize?: number;
	maxSize?: number;
}

/** Allocation-bounded pool with duplicate-release protection. */
export class ObjectPool<T> {
	private readonly available: T[] = [];
	private readonly active = new Set<T>();
	private readonly createItem: () => T;
	private readonly resetItem?: (item: T) => void;
	private readonly maxSize: number;

	constructor(options: PoolOptions<T>) {
		this.createItem = options.create;
		this.resetItem = options.reset;
		this.maxSize = Math.max(1, options.maxSize ?? Number.POSITIVE_INFINITY);
		const initialSize = Math.min(this.maxSize, Math.max(0, options.initialSize ?? 0));
		for (let index = 0; index < initialSize; index += 1) this.available.push(this.createItem());
	}

	acquire(): T | null {
		const item = this.available.pop() ?? (this.size < this.maxSize ? this.createItem() : null);
		if (item === null) return null;
		this.active.add(item);
		return item;
	}

	release(item: T): boolean {
		if (!this.active.delete(item)) return false;
		this.resetItem?.(item);
		this.available.push(item);
		return true;
	}

	releaseAll(): void {
		for (const item of this.active) {
			this.resetItem?.(item);
			this.available.push(item);
		}
		this.active.clear();
	}

	forEachActive(callback: (item: T) => void): void {
		this.active.forEach(callback);
	}

	get activeCount(): number {
		return this.active.size;
	}

	get availableCount(): number {
		return this.available.length;
	}

	get size(): number {
		return this.active.size + this.available.length;
	}
}
