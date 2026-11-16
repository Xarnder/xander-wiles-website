import type { FromMapWorker, ToMapWorker } from './biomeMapProtocol';
import { TILE_PIXELS, tileKey } from './biomeMapTiles';
import type { MapWorldSettings } from './mapWorld';

/** Most tiles kept on the main thread: 120 × 64 KB ≈ 7.7 MB (technical plan §4.4, Q16). */
export const MAP_TILE_CAPACITY = 120;

/** What the worker client needs from a worker: lets tests run it with a fake. */
export interface MapWorkerLike {
	postMessage(message: ToMapWorker): void;
	onmessage: ((event: MessageEvent<FromMapWorker>) => void) | null;
	terminate(): void;
}

export interface MapTile<B> {
	image: B;
	/** Rivers and lakes are drawn (or the world has none). */
	final: boolean;
}

export interface MapTileRef {
	level: number;
	tx: number;
	tz: number;
}

/** Per-level timings, for the performance record and the developer preview. */
export interface MapTileTimings {
	tiles: number;
	landMs: number;
	waterTiles: number;
	waterMs: number;
}

/**
 * Main-thread side of the biome map (technical plan §4.3–4.4): asks the worker for the tiles a view
 * wants, nearest first, cancels the ones it stops wanting, and keeps finished tiles as images in a
 * small LRU (closing evicted bitmaps). Generic over the image type so tests need no DOM.
 */
export class BiomeMapClient<B = ImageBitmap> {
	private generation = 0;
	private readonly tiles = new Map<string, MapTile<B>>();
	private readonly pending = new Set<string>();
	private worker: MapWorkerLike | null = null;
	readonly timings: MapTileTimings[] = [];
	errors = 0;
	/** Called when a tile arrives (or improves), e.g. to schedule a redraw. */
	onTile: ((key: string) => void) | null = null;

	constructor(
		private readonly createWorker: () => MapWorkerLike = () =>
			new Worker(new URL('./biomeMap.worker.ts', import.meta.url), {
				type: 'module'
			}) as unknown as MapWorkerLike,
		private readonly toImage: (pixels: Uint8ClampedArray) => Promise<B> = (pixels) =>
			createImageBitmap(
				new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, TILE_PIXELS, TILE_PIXELS)
			) as Promise<B>,
		private readonly release: (image: B) => void = (image) =>
			(image as unknown as ImageBitmap).close?.(),
		readonly capacity = MAP_TILE_CAPACITY
	) {}

	/** Starts (or restarts, for a changed world) the worker with the world's settings. */
	init(settings: MapWorldSettings): void {
		this.generation++;
		this.clear();
		if (!this.worker) {
			this.worker = this.createWorker();
			this.worker.onmessage = (event) => this.receive(event.data);
		}
		this.worker.postMessage({
			t: 'init',
			generation: this.generation,
			settings: structuredClone(settings)
		});
	}

	/** The cached tile, if any (refreshing its place in the LRU). */
	get(level: number, tx: number, tz: number): MapTile<B> | undefined {
		const key = tileKey(this.generation, level, tx, tz);
		const tile = this.tiles.get(key);
		if (tile) {
			this.tiles.delete(key);
			this.tiles.set(key, tile);
		}
		return tile;
	}

	/**
	 * The tiles a view wants now, in drawing order (nearest first). Requests the missing ones and
	 * cancels requests for tiles no longer wanted.
	 */
	want(refs: readonly MapTileRef[]): void {
		if (!this.worker) return;
		const wanted = new Set<string>();
		for (const { level, tx, tz } of refs) {
			const key = tileKey(this.generation, level, tx, tz);
			wanted.add(key);
			if (this.tiles.has(key) || this.pending.has(key)) continue;
			this.pending.add(key);
			this.worker.postMessage({ t: 'tile', generation: this.generation, key, level, tx, tz });
		}
		for (const key of this.pending)
			if (!wanted.has(key)) {
				this.pending.delete(key);
				this.worker.postMessage({ t: 'cancel', key });
			}
	}

	get pendingCount(): number {
		return this.pending.size;
	}
	get cachedCount(): number {
		return this.tiles.size;
	}

	private receive(message: FromMapWorker): void {
		if (message.t === 'error') {
			this.errors++;
			console.error('Biome map worker:', message.message);
			return;
		}
		if (message.generation !== this.generation) return;
		const level = Number(message.key.split(':')[1]);
		const timing = (this.timings[level] ??= { tiles: 0, landMs: 0, waterTiles: 0, waterMs: 0 });
		if (message.water) {
			timing.waterTiles++;
			timing.waterMs += message.ms;
		} else {
			timing.tiles++;
			timing.landMs += message.ms;
		}
		// A land tile still counts as pending until its water arrives (so it isn't asked for again).
		if (message.final) this.pending.delete(message.key);
		const generation = this.generation;
		void this.toImage(new Uint8ClampedArray(message.pixels)).then((image) => {
			if (generation !== this.generation) return this.release(image);
			const old = this.tiles.get(message.key);
			// Water can't be overwritten by a late land image.
			if (old?.final && !message.final) return this.release(image);
			if (old) {
				this.release(old.image);
				this.tiles.delete(message.key);
			}
			this.tiles.set(message.key, { image, final: message.final });
			this.evict();
			this.onTile?.(message.key);
		});
	}

	private evict(): void {
		while (this.tiles.size > this.capacity) {
			const [key, tile] = this.tiles.entries().next().value as [string, MapTile<B>];
			this.tiles.delete(key);
			this.release(tile.image);
		}
	}

	private clear(): void {
		for (const tile of this.tiles.values()) this.release(tile.image);
		this.tiles.clear();
		this.pending.clear();
	}

	/** Stops the worker and frees every tile (the map turned off, or the world closed). */
	dispose(): void {
		this.clear();
		this.worker?.terminate();
		this.worker = null;
	}
}
