import { describe, expect, it } from 'vitest';
import { createDefaultBiomeSettings } from '../../biomes/BiomeTypes';
import { createDefaultHydrologySettings } from '../../hydrology/HydrologyTypes';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { BiomeMapClient, type MapWorkerLike } from '../BiomeMapClient';
import type { FromMapWorker, ToMapWorker } from '../biomeMapProtocol';
import { TILE_PIXELS, tileKey } from '../biomeMapTiles';
import type { MapWorldSettings } from '../mapWorld';
import { paintView, wantedTiles, type MapViewport } from '../mapView';

const settings: MapWorldSettings = {
	seed: 's',
	terrain: createDefaultTerrainSettings(),
	biomes: createDefaultBiomeSettings(),
	hydrology: createDefaultHydrologySettings()
};

class FakeWorker implements MapWorkerLike {
	readonly sent: ToMapWorker[] = [];
	onmessage: ((event: MessageEvent<FromMapWorker>) => void) | null = null;
	terminated = false;
	postMessage(message: ToMapWorker) {
		this.sent.push(message);
	}
	terminate() {
		this.terminated = true;
	}
	reply(key: string, generation: number, final: boolean) {
		this.onmessage?.({
			data: {
				t: 'tile',
				generation,
				key,
				pixels: new ArrayBuffer(4),
				water: final,
				final,
				ms: 1
			}
		} as MessageEvent<FromMapWorker>);
	}
	tiles() {
		return this.sent.filter((m) => m.t === 'tile') as Extract<ToMapWorker, { t: 'tile' }>[];
	}
}

/** Images are plain labels; released ones are recorded. */
function setup(capacity = 120) {
	const worker = new FakeWorker();
	const released: string[] = [];
	let n = 0;
	const client = new BiomeMapClient<string>(
		() => worker,
		async () => `image-${n++}`,
		(image) => released.push(image),
		capacity
	);
	return { worker, client, released };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('biome map client', () => {
	it('starts the worker, asks for missing tiles once, and cancels unwanted ones', () => {
		const { worker, client } = setup();
		client.init(settings);
		expect(worker.sent[0]).toMatchObject({ t: 'init', generation: 1 });
		client.want([
			{ level: 2, tx: 0, tz: 0 },
			{ level: 2, tx: 1, tz: 0 }
		]);
		client.want([{ level: 2, tx: 0, tz: 0 }]);
		expect(worker.tiles().map((m) => m.key)).toEqual([tileKey(1, 2, 0, 0), tileKey(1, 2, 1, 0)]);
		expect(worker.sent.at(-1)).toEqual({ t: 'cancel', key: tileKey(1, 2, 1, 0) });
		expect(client.pendingCount).toBe(1);
	});

	it('shows land first, then the same tile with water, never the other way round', async () => {
		const { worker, client, released } = setup();
		client.init(settings);
		client.want([{ level: 0, tx: 3, tz: -4 }]);
		const key = tileKey(1, 0, 3, -4);
		worker.reply(key, 1, false);
		await flush();
		expect(client.get(0, 3, -4)).toEqual({ image: 'image-0', final: false });
		// Still pending (its water is on the way), so it isn't asked for again.
		client.want([{ level: 0, tx: 3, tz: -4 }]);
		expect(worker.tiles()).toHaveLength(1);
		worker.reply(key, 1, true);
		await flush();
		expect(client.get(0, 3, -4)).toEqual({ image: 'image-1', final: true });
		expect(released).toEqual(['image-0']);
		expect(client.pendingCount).toBe(0);
	});

	it('drops tiles of an old world, and keeps the most recently used within capacity', async () => {
		const { worker, client, released } = setup(2);
		client.init(settings);
		for (const tx of [0, 1, 2]) {
			client.want([{ level: 1, tx, tz: 0 }]);
			worker.reply(tileKey(1, 1, tx, 0), 1, true);
			await flush();
			if (tx === 1) client.get(1, 0, 0); // touch tile 0, so tile 1 is the oldest
		}
		expect(client.cachedCount).toBe(2);
		expect(client.get(1, 1, 0)).toBeUndefined();
		expect(client.get(1, 0, 0)).toBeDefined();
		client.init(settings); // world changed
		expect(client.cachedCount).toBe(0);
		worker.reply(tileKey(1, 1, 5, 0), 1, true); // late tile from the old world
		await flush();
		expect(client.cachedCount).toBe(0);
		expect(released.length).toBeGreaterThanOrEqual(3);
		client.dispose();
		expect(worker.terminated).toBe(true);
	});
});

describe('biome map view', () => {
	const view: MapViewport = { level: 2, centreX: 0, centreZ: 0, width: 180, height: 180, scale: 1 };

	it('asks for the coarser level first while tiles are missing, and nothing extra once complete', async () => {
		const { worker, client } = setup();
		client.init(settings);
		const wanted = wantedTiles(client, view);
		expect(wanted[0].level).toBe(3);
		expect(wanted.filter((t) => t.level === 2).length).toBeGreaterThan(0);
		client.want(wanted);
		for (const m of worker.tiles()) worker.reply(m.key, 1, true);
		await flush();
		expect(wantedTiles(client, view).every((t) => t.level === 2)).toBe(true);
	});

	it('borrows part of a coarser tile while a sharper one is drawn, and reports gaps', async () => {
		const { worker, client } = setup();
		client.init(settings);
		const calls: unknown[][] = [];
		const painter = { drawImage: (...args: unknown[]) => calls.push(args) };
		const own = wantedTiles(client, view).filter((t) => t.level === 2);
		expect(paintView(painter, client, view)).toBe(own.length);
		client.want([{ level: 3, tx: -1, tz: -1 }]);
		worker.reply(tileKey(1, 3, -1, -1), 1, true);
		await flush();
		calls.length = 0;
		const blank = paintView(painter, client, view);
		expect(blank).toBeLessThan(own.length);
		// Tile (−1, −1) at level 2 is the bottom-right quarter of level 3's (−1, −1).
		const quarter = TILE_PIXELS / 2;
		expect(calls).toContainEqual([
			'image-0',
			quarter,
			quarter,
			quarter,
			quarter,
			expect.any(Number),
			expect.any(Number),
			128,
			128
		]);
	});
});
