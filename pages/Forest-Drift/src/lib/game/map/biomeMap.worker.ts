/// <reference lib="webworker" />
import type { FromMapWorker, ToMapWorker } from './biomeMapProtocol';
import { BIOME_COUNT } from '../biomes/BiomeTypes';
import { BiomeScan } from './biomeSearch';
import { TILE_BYTES, MapWorld } from './mapWorld';

/**
 * The biome map worker (technical plan §3–4): draws map tiles off the main thread with its own
 * copy of the world's terrain, biomes and water. One tile at a time, in the order asked (the client
 * asks nearest first and cancels tiles it no longer wants); the worker yields between tiles so
 * cancels arrive before the next one starts.
 *
 * Find a biome (its technical plan §4) shares the worker: a scan runs in slices of about 8 ms.
 * Land tiles always go first, so a tile waits at most one slice; scan slices and water tiles take
 * turns. `find` is answered from the finished scan.
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

/** Length of one scan slice, in milliseconds. */
const SCAN_SLICE_MS = 8;
/** How often a running scan reports its progress. */
const SCAN_PROGRESS_MS = 100;
type FindJob = Extract<ToMapWorker, { t: 'find' }>;
let scan: { id: number; generation: number; scan: BiomeScan; posted: number } | null = null;
const finds: FindJob[] = [];
/** Scan slices and water tiles take turns: true when it's the scan's. */
let scanTurn = true;

const scanning = () => !!scan && !scan.scan.done;

const post = (message: FromMapWorker, transfer: Transferable[] = []) =>
	(self as unknown as Worker).postMessage(message, transfer);

/**
 * Yields to the worker's message queue between jobs (so cancels and new requests get in) without
 * `setTimeout`'s 4 ms minimum for nested timers, which added about 200 ms to a scan's 50 slices.
 */
const tick = new MessageChannel();
tick.port1.onmessage = () => work();
(tick.port1 as unknown as { unref?: () => void }).unref?.();

function schedule() {
	const idle = queue.length === 0 && waterQueue.length === 0 && !scanning() && finds.length === 0;
	if (scheduled || idle) return;
	scheduled = true;
	tick.port2.postMessage(null);
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

function postScan(job: NonNullable<typeof scan>) {
	job.posted = performance.now();
	post({
		t: 'scanned',
		generation: job.generation,
		id: job.id,
		done: job.scan.done,
		nearest: job.scan.nearest(),
		here: job.scan.here,
		ms: job.scan.ms,
		sampled: job.scan.sampled
	});
}

function slice(job: NonNullable<typeof scan>) {
	job.scan.step(SCAN_SLICE_MS);
	if (job.scan.done || performance.now() - job.posted >= SCAN_PROGRESS_MS) postScan(job);
}

/** Answers a find from the finished scan (none for a stale world or without a scan). */
function answer(job: FindJob) {
	const start = performance.now();
	const patches =
		scan && scan.scan.done && job.generation === generation ? scan.scan.patches(job.biome) : [];
	post({
		t: 'found',
		generation: job.generation,
		id: job.id,
		patches,
		ms: performance.now() - start
	});
}

function work() {
	scheduled = false;
	try {
		const job = queue.shift();
		if (job) {
			if (job.generation === generation) land(job);
		} else if (finds.length && !scanning()) {
			answer(finds.shift()!);
		} else if (scanning() && (scanTurn || waterQueue.length === 0)) {
			scanTurn = false;
			slice(scan!);
		} else {
			scanTurn = true;
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
		scan = null;
		for (const job of finds.splice(0)) answer(job);
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
	} else if (message.t === 'scan') {
		if (!world || message.generation !== generation) return;
		scan = {
			id: message.id,
			generation,
			scan: new BiomeScan(message.x, message.z, (x, z) => world!.classify(x, z), BIOME_COUNT),
			posted: performance.now()
		};
		schedule();
	} else if (message.t === 'find') {
		finds.push(message);
		schedule();
	} else if (message.t === 'cancelScan') {
		scan = null;
		for (const job of finds.splice(0)) answer(job);
	}
};
