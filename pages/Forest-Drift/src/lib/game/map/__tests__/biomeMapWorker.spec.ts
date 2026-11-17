import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BIOME_COUNT } from '../../biomes/BiomeTypes';
import { getDefaultWorldDefinition } from '../../world/DefaultWorld';
import type { FromMapWorker, ToMapWorker } from '../biomeMapProtocol';
import { BiomeScan } from '../biomeSearch';
import { MapWorld, mapWorldSettingsOf } from '../mapWorld';

/**
 * The real map worker module, run in Node with a stand-in `self`: a scan and a find on the Main
 * World's settings, with tile jobs flowing alongside.
 */
const received: FromMapWorker[] = [];
const fakeSelf = {
	onmessage: null as ((event: MessageEvent<ToMapWorker>) => void) | null,
	postMessage: (message: FromMapWorker) => received.push(message)
};
const send = (message: ToMapWorker) =>
	fakeSelf.onmessage!({ data: message } as MessageEvent<ToMapWorker>);
const until = async (test: () => boolean, ms = 20_000) => {
	const start = Date.now();
	while (!test()) {
		if (Date.now() - start > ms) throw new Error('timed out');
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
};

const world = getDefaultWorldDefinition();
const settings = mapWorldSettingsOf(world);
const spawn = { x: world.player.position.x, z: world.player.position.z };

beforeAll(async () => {
	vi.stubGlobal('self', fakeSelf);
	await import('../biomeMap.worker');
});
afterAll(() => vi.unstubAllGlobals());

describe('map worker: find a biome', () => {
	it('scans in slices while tiles keep flowing, then answers finds from the scan', async () => {
		send({ t: 'init', generation: 1, settings });
		send({ t: 'scan', generation: 1, id: 7, x: spawn.x, z: spawn.z });
		for (let i = 0; i < 6; i++)
			send({ t: 'tile', generation: 1, key: `1:3:${i}:0`, level: 3, tx: i, tz: 0 });
		// Asked mid-scan: answered once the scan's done.
		send({ t: 'find', generation: 1, id: 8, biome: 0 });
		await until(() => received.some((m) => m.t === 'found'));

		const scans = received.filter((m) => m.t === 'scanned');
		const done = scans.at(-1)!;
		expect(done.done).toBe(true);
		expect(scans.length).toBeGreaterThan(1);
		// Tiles arrive before the scan finishes: they go first.
		const firstScanDone = received.indexOf(done);
		const landTiles = received.filter((m) => m.t === 'tile' && !m.water);
		expect(landTiles).toHaveLength(6);
		for (const tile of landTiles) expect(received.indexOf(tile)).toBeLessThan(firstScanDone);
		expect(received.indexOf(received.find((m) => m.t === 'found')!)).toBeGreaterThan(firstScanDone);

		// Same answer as a scan in one go on the main thread.
		const map = new MapWorld(settings);
		const direct = new BiomeScan(spawn.x, spawn.z, (x, z) => map.classify(x, z), BIOME_COUNT).run();
		expect(done.nearest).toEqual(direct.nearest());
		expect(done.here).toBe(direct.here);
		console.log(
			`scan: ${done.sampled} points, ${Math.round(done.ms)} ms in slices (${((done.ms * 1000) / done.sampled).toFixed(2)} µs each), ${scans.length} progress messages`
		);

		// Every biome found has a patch whose pin is that biome.
		const found = received.find((m) => m.t === 'found')!;
		expect(found.id).toBe(8);
		const missing: string[] = [];
		const findMs: number[] = [];
		for (let biome = 0; biome < BIOME_COUNT; biome++) {
			if (done.nearest[biome] === null) {
				missing.push(String(biome));
				continue;
			}
			received.length = 0;
			send({ t: 'find', generation: 1, id: 100 + biome, biome });
			await until(() => received.some((m) => m.t === 'found'));
			const reply = received.find((m) => m.t === 'found')!;
			if (reply.t !== 'found') continue;
			findMs.push(reply.ms);
			if (biome === done.here && reply.patches.length === 0) continue;
			expect(reply.patches.length).toBeGreaterThan(0);
			for (const patch of reply.patches) expect(map.classify(patch.x, patch.z)).toBe(biome);
			expect(reply.patches[0].distance).toBeGreaterThanOrEqual(done.nearest[biome]!);
		}
		console.log(
			`find: max ${Math.max(...findMs).toFixed(1)} ms; none within 16 km: ${missing.join(', ') || '—'}`
		);
		expect(Math.max(...findMs)).toBeLessThan(150);
	}, 60_000);

	it('drops the scan when cancelled or the world changes', async () => {
		received.length = 0;
		send({ t: 'scan', generation: 1, id: 20, x: 0, z: 0 });
		send({ t: 'cancelScan' });
		send({ t: 'find', generation: 1, id: 21, biome: 0 });
		await until(() => received.some((m) => m.t === 'found'));
		expect(received.find((m) => m.t === 'found')).toMatchObject({ id: 21, patches: [] });
		received.length = 0;
		send({ t: 'scan', generation: 1, id: 22, x: 0, z: 0 });
		send({ t: 'init', generation: 2, settings });
		// A scan for the old world is ignored.
		send({ t: 'scan', generation: 1, id: 23, x: 0, z: 0 });
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(received.filter((m) => m.t === 'scanned')).toHaveLength(0);
	});
});
