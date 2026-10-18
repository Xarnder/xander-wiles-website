#!/usr/bin/env node
/**
 * Forest Drift multiplayer load bots.
 *
 * Connects N fake players to a world room, walks each one round a circle at walking speed sending a
 * pose every 100 ms (the same 24-byte binary pose the game sends), and reports what the room sent
 * back: snapshot rate, bytes per player, and round-trip times.
 *
 *   node tools/bots.mjs --server http://localhost:8787 --world <worldId> --invite <token> --count 19
 *
 * Options:
 *   --server   room server base URL (default http://localhost:8787)
 *   --world    world id (required)
 *   --invite   an editor or viewer invite token (required; the part after `#invite=` in a link)
 *   --count    number of bots (default 20)
 *   --seconds  how long to run (default 30)
 *   --center   x,z to circle around (default: the world's saved player position)
 *   --radius   circle radius in metres (default 6)
 *   --speed    walking speed m/s (default 6)
 *   --json     print the report as JSON only
 *
 * Needs Node 22+ (global WebSocket). Bots stamp poses with Date.now(): accurate against a local
 * `wrangler dev` (same machine clock); against a deployed room it's as good as this machine's clock.
 */

/** The game's player colours (src/lib/game/net/protocol.ts PLAYER_COLOURS). */
const PALETTE = [
	'#e6194b',
	'#f58231',
	'#ffe119',
	'#bfef45',
	'#42d4f4',
	'#4363d8',
	'#911eb4',
	'#f032e6',
	'#fabed4',
	'#469990',
	'#dcbeff',
	'#ffffff',
	'#9a6324',
	'#800000',
	'#aaffc3',
	'#808000',
	'#ffd8b1',
	'#000075',
	'#a9a9a9',
	'#fffac8'
];

const args = parseArgs(process.argv.slice(2));
const server = (args.server ?? 'http://localhost:8787').replace(/\/+$/, '');
const worldId = args.world;
const invite = args.invite;
const count = Number(args.count ?? 20);
const seconds = Number(args.seconds ?? 30);
const radius = Number(args.radius ?? 6);
const speed = Number(args.speed ?? 6);
const jsonOnly = Boolean(args.json);

if (!worldId || !invite) {
	console.error(
		'Usage: node tools/bots.mjs --world <worldId> --invite <token> [--count 20] [--seconds 30]'
	);
	process.exit(1);
}

const snapshotResponse = await fetch(`${server}/w/${worldId}/snapshot`, {
	headers: { Authorization: `Bearer ${invite}` }
});
if (!snapshotResponse.ok) {
	console.error(`Could not load world ${worldId}: HTTP ${snapshotResponse.status}`);
	process.exit(1);
}
const { manifest, base, world: legacyWorld } = await snapshotResponse.json();
// The world's spawn lives in its base record (Phase 3 snapshots), or the whole world (older ones).
const world = base ?? legacyWorld ?? {};
const [centerX, centerZ] = args.center
	? args.center.split(',').map(Number)
	: [world.player?.position?.x ?? 0, world.player?.position?.z ?? 0];
const feetY = (world.player?.position?.y ?? 1.7) - 1.7;

const bots = [];
for (let i = 0; i < count; i++) bots.push(await startBot(i));
log(`${count} bots connected to "${manifest.name}"; walking for ${seconds}s…`);
await sleep(seconds * 1000);
for (const bot of bots) bot.stop();
await sleep(300);

const elapsed = seconds;
const report = {
	world: manifest.name,
	bots: count,
	seconds: elapsed,
	posesSentPerBot: round(avg(bots.map((b) => b.posesSent)) / elapsed, 1),
	snapshotsPerSecondPerBot: round(avg(bots.map((b) => b.snapshots)) / elapsed, 1),
	entriesPerSecondPerBot: round(avg(bots.map((b) => b.entries)) / elapsed, 1),
	downloadBytesPerSecondPerBot: round(avg(bots.map((b) => b.bytesIn)) / elapsed, 0),
	uploadBytesPerSecondPerBot: round(avg(bots.map((b) => b.bytesOut)) / elapsed, 0),
	rttMs: percentiles(bots.flatMap((b) => b.rtts)),
	entryAgeMs: percentiles(bots.flatMap((b) => b.ages)),
	disconnects: bots.filter((b) => b.closedEarly).length
};
if (jsonOnly) console.log(JSON.stringify(report));
else console.log(JSON.stringify(report, null, 2));
process.exit(0);

async function startBot(index) {
	const bot = {
		posesSent: 0,
		snapshots: 0,
		entries: 0,
		bytesIn: 0,
		bytesOut: 0,
		rtts: [],
		ages: [],
		closedEarly: false,
		stop: () => {}
	};
	const socket = new WebSocket(`${server.replace(/^http/, 'ws')}/w/${worldId}/ws`);
	socket.binaryType = 'arraybuffer';
	let running = true;
	let welcomed = false;
	await new Promise((resolve, reject) => {
		socket.onopen = () => {
			const hello = JSON.stringify({
				t: 'hello',
				protocol: 3,
				build: 'load-bot',
				invite,
				capability: null,
				schemaVersion: manifest.schemaVersion,
				generatorVersion: manifest.generatorVersion,
				playerId: `bot-${index.toString().padStart(3, '0')}-${Math.random().toString(36).slice(2, 10)}`,
				name: `Bot ${index + 1}`,
				// A different palette colour per bot, like real players get.
				colour: PALETTE[index % PALETTE.length]
			});
			socket.send(hello);
			bot.bytesOut += hello.length;
		};
		socket.onmessage = (event) => {
			if (typeof event.data === 'string') {
				bot.bytesIn += event.data.length;
				if (event.data === 'KA') return;
				const message = JSON.parse(event.data);
				if (message.t === 'welcome' && !welcomed) {
					welcomed = true;
					resolve();
				}
				if (message.t === 'pong') bot.rtts.push(performance.now() - message.c);
				if (message.t === 'error') reject(new Error(message.message));
				return;
			}
			bot.bytesIn += event.data.byteLength;
			const view = new DataView(event.data);
			if (view.getUint8(0) !== 2) return;
			bot.snapshots++;
			const entries = view.getUint8(1);
			bot.entries += entries;
			for (let i = 0; i < entries; i++) bot.ages.push(view.getUint16(6 + i * 20 + 18, true));
		};
		socket.onclose = () => {
			if (running) bot.closedEarly = true;
		};
		socket.onerror = () => reject(new Error('WebSocket error'));
	});

	const phase = (index / Math.max(1, count)) * Math.PI * 2;
	const start = performance.now();
	let seq = 0;
	const poseTimer = setInterval(() => {
		const t = (performance.now() - start) / 1000;
		const angle = phase + (speed / radius) * t;
		const buffer = new ArrayBuffer(24);
		const view = new DataView(buffer);
		view.setUint8(0, 1);
		view.setUint8(1, 1 | 8); // moving | grounded
		view.setUint16(2, seq++ & 0xffff, true);
		view.setUint32(4, Date.now() % 2 ** 32, true);
		view.setFloat32(8, centerX + radius * Math.sin(angle), true);
		view.setFloat32(12, feetY, true);
		view.setFloat32(16, centerZ + radius * Math.cos(angle), true);
		// Facing along the direction of travel (the camera looks down −Z at yaw 0).
		const yaw = Math.atan2(-Math.cos(angle), Math.sin(angle));
		view.setUint16(
			20,
			Math.round(
				((((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * 65536
			) & 0xffff,
			true
		);
		view.setInt16(22, 0, true);
		if (socket.readyState === WebSocket.OPEN) {
			socket.send(buffer);
			bot.posesSent++;
			bot.bytesOut += 24;
		}
	}, 100);
	const pingTimer = setInterval(() => {
		if (socket.readyState !== WebSocket.OPEN) return;
		const ping = JSON.stringify({ t: 'ping', c: performance.now() });
		socket.send(ping);
		bot.bytesOut += ping.length;
	}, 2000);
	bot.stop = () => {
		running = false;
		clearInterval(poseTimer);
		clearInterval(pingTimer);
		socket.close(1000, 'Bot finished');
	};
	return bot;
}

function parseArgs(list) {
	const out = {};
	for (let i = 0; i < list.length; i++) {
		const key = list[i];
		if (!key.startsWith('--')) continue;
		const next = list[i + 1];
		if (next === undefined || next.startsWith('--')) out[key.slice(2)] = true;
		else {
			out[key.slice(2)] = next;
			i++;
		}
	}
	return out;
}

function percentiles(values) {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const at = (p) =>
		round(sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))], 1);
	return { p50: at(0.5), p90: at(0.9), p99: at(0.99), max: round(sorted[sorted.length - 1], 1) };
}

function avg(values) {
	return values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
}

function round(value, places) {
	const f = 10 ** places;
	return Math.round(value * f) / f;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message) {
	if (!jsonOnly) console.error(message);
}
