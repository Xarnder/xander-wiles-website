/// <reference lib="webworker" />
import type { FromMapWorker, ToMapWorker } from './biomeMapProtocol';
import { TILE_BYTES, MapWorld } from './mapWorld';

/**
 * The biome map worker (technical plan §3–4): draws map tiles off the main thread with its own
 * copy of the world's terrain, biomes and water. One tile at a time, in the order asked (the client
 * asks nearest first and cancels tiles it no longer wants); the worker yields between tiles so
 * cancels arrive before the next one starts.
 */
let world: MapWorld | null = null;
let generation = -1;
type Job = Extract<ToMapWorker, { t: 'tile' }>;
/** Tiles waiting for their land, in the order asked. */
const queue: Job[] = [];
/**
 * Tiles whose land has been sent and whose rivers and lakes come next. Land always goes first:
 * water can need hydrology regions built (about 10 ms each, up to ~170 for the farthest zoom), and
 * a whole view of land is worth more than water on one tile.
 */
const waterQueue: { job: Job; pixels: Uint8ClampedArray<ArrayBuffer> }[] = [];
let scheduled = false;

const post = (message: FromMapWorker, transfer: Transferable[] = []) =>
	(self as unknown as Worker).postMessage(message, transfer);

function schedule() {
	if (scheduled || (queue.length === 0 && waterQueue.length === 0)) return;
	scheduled = true;
	setTimeout(work, 0);
}

function land(job: Job) {
	if (!world) return;
	const pixels = new Uint8ClampedArray(TILE_BYTES);
	const start = performance.now();
	world.drawLand(job.level, job.tx, job.tz, pixels);
	const ms = performance.now() - start;
	const hasWater = !!world.hydrology;
	const copy = hasWater ? pixels.slice() : pixels;
	post(
		{
			t: 'tile',
			generation,
			key: job.key,
			pixels: copy.buffer,
			water: false,
			final: !hasWater,
			ms
		},
		[copy.buffer]
	);
	if (hasWater) waterQueue.push({ job, pixels });
}

function water(job: Job, pixels: Uint8ClampedArray<ArrayBuffer>) {
	if (!world) return;
	const start = performance.now();
	world.drawWater(job.level, job.tx, job.tz, pixels);
	post(
		{
			t: 'tile',
			generation,
			key: job.key,
			pixels: pixels.buffer,
			water: true,
			final: true,
			ms: performance.now() - start
		},
		[pixels.buffer]
	);
}

function work() {
	scheduled = false;
	try {
		const job = queue.shift();
		if (job) {
			if (job.generation === generation) land(job);
		} else {
			const next = waterQueue.shift();
			if (next && next.job.generation === generation) water(next.job, next.pixels);
		}
	} catch (error) {
		post({ t: 'error', message: String(error) });
	}
	schedule();
}

self.onmessage = (event: MessageEvent<ToMapWorker>) => {
	const message = event.data;
	if (message.t === 'init') {
		generation = message.generation;
		queue.length = 0;
		waterQueue.length = 0;
		try {
			world = new MapWorld(message.settings);
		} catch (error) {
			world = null;
			post({ t: 'error', message: String(error) });
		}
	} else if (message.t === 'tile') {
		queue.push(message);
		schedule();
	} else if (message.t === 'cancel') {
		const index = queue.findIndex((job) => job.key === message.key);
		if (index >= 0) queue.splice(index, 1);
		const wet = waterQueue.findIndex((entry) => entry.job.key === message.key);
		if (wet >= 0) waterQueue.splice(wet, 1);
	}
};
