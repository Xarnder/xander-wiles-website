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
 *   --carry    each bot picks up a small creature near the centre (ranged weapons)
 *   --fire     …and fires a seed pellet whenever a charge is ready (implies --carry)
 *
 * Needs Node 22.18+ (global WebSocket). Bots stamp poses with Date.now(): accurate against a local
 * `wrangler dev` (same machine clock); against a deployed room it's as good as this machine's clock.
 */

import { PLAYER_COLOURS as PALETTE, PROTOCOL_VERSION } from '../../src/lib/game/net/protocol.ts';

const args = parseArgs(process.argv.slice(2));
const server = (args.server ?? 'http://localhost:8787').replace(/\/+$/, '');
const worldId = args.world;
const invite = args.invite;
const count = Number(args.count ?? 20);
const seconds = Number(args.seconds ?? 30);
const radius = Number(args.radius ?? 6);
const speed = Number(args.speed ?? 6);
const jsonOnly = Boolean(args.json);
const fire = Boolean(args.fire);
const carry = fire || Boolean(args.carry);

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
const creatureIds = carry
	? await carryableCreatureIds(String(world.seed ?? ''), centerX, centerZ)
	: [];
if (carry) log(`${creatureIds.length} carryable creatures near the centre`);

const bots = [];
try {
	for (let i = 0; i < count; i++) bots.push(await startBot(i));
} catch (error) {
	for (const bot of bots) bot.stop();
	throw error;
}
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
	disconnects: bots.filter((b) => b.closedEarly).length,
	...(carry
		? {
				carriesGranted: bots.filter((b) => b.carrying).length,
				carryRefusals: countBy(bots.map((b) => b.carryRefusal).filter(Boolean)),
				shotsSentPerSecondPerBot: round(avg(bots.map((b) => b.shotsSent)) / elapsed, 2),
				shotsRefusedPerBot: round(avg(bots.map((b) => b.shotsRefused)), 1),
				shotMessagesReceivedPerSecondPerBot: round(
					avg(bots.map((b) => b.shotsReceived)) / elapsed,
					1
				)
			}
		: {})
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
		carrying: false,
		carryRefusal: null,
		shotsSent: 0,
		shotsRefused: 0,
		shotsReceived: 0,
		stop: () => {}
	};
	const socket = new WebSocket(`${server.replace(/^http/, 'ws')}/w/${worldId}/ws`);
	socket.binaryType = 'arraybuffer';
	let running = true;
	let welcomed = false;
	await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			socket.close();
			reject(new Error('Timed out waiting for welcome'));
		}, 15000);
		socket.onopen = () => {
			const hello = JSON.stringify({
				t: 'hello',
				protocol: PROTOCOL_VERSION,
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
					bot.slot = message.slot;
					clearTimeout(timeout);
					resolve();
				}
				if (message.t === 'pong') bot.rtts.push(performance.now() - message.c);
				if (message.t === 'carryResult') {
					bot.carrying = message.ok;
					if (!message.ok) bot.carryRefusal = message.reason ?? 'refused';
				}
				if (message.t === 'carried' && message.creature === null && message.slot === bot.slot)
					bot.carrying = false;
				if (message.t === 'shot') bot.shotsReceived++;
				if (message.t === 'shotResult' && message.refused) bot.shotsRefused++;
				if (message.t === 'error') {
					clearTimeout(timeout);
					socket.close();
					reject(new Error(message.message));
				}
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
			clearTimeout(timeout);
			if (!welcomed) reject(new Error('Connection closed before welcome'));
			if (running) bot.closedEarly = true;
		};
		socket.onerror = () => {
			clearTimeout(timeout);
			socket.close();
			reject(new Error('WebSocket error'));
		};
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
	// Ranged weapons: pick up one creature each (a second after starting, once poses are in), then
	// fire along the walking direction whenever the room's 350 ms gap allows.
	let shotId = 0;
	const send = (message) => {
		if (socket.readyState !== WebSocket.OPEN) return;
		const text = JSON.stringify(message);
		socket.send(text);
		bot.bytesOut += text.length;
	};
	const carryTimer = carry
		? setTimeout(() => {
				const creature = creatureIds[index % Math.max(1, creatureIds.length)];
				if (creature) send({ t: 'carry', id: 1, creature });
			}, 1000)
		: null;
	const fireTimer = fire
		? setInterval(() => {
				if (!bot.carrying) return;
				const t = (performance.now() - start) / 1000;
				const angle = phase + (speed / radius) * t;
				const x = centerX + radius * Math.sin(angle);
				const z = centerZ + radius * Math.cos(angle);
				// Travel direction around the circle.
				const dx = Math.cos(angle),
					dz = -Math.sin(angle);
				send({
					t: 'shoot',
					shot: ++shotId,
					origin: [x, feetY + 1.3, z],
					dir: [dx, 0, dz],
					at: Date.now()
				});
				bot.shotsSent++;
			}, 360)
		: null;
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
		if (carryTimer) clearTimeout(carryTimer);
		if (fireTimer) clearInterval(fireTimer);
		socket.close(1000, 'Bot finished');
	};
	return bot;
}

/**
 * Ambient creature ids the room will grant near (x, z): the smallest regional species, from the
 * same id ⇄ recipe code the room uses (bundled on the fly; it's TypeScript with bare imports).
 */
async function carryableCreatureIds(seed, x, z) {
	if (!seed) return [];
	const { build } = await import('esbuild');
	const here = new URL('.', import.meta.url).pathname;
	const result = await build({
		stdin: {
			contents: [
				"export { resolveAmbientCreature } from '../../src/lib/game/creatures/carryableCreatureRef';",
				"export { abilityFor } from '../../src/lib/game/creatures/creatureAbilities';",
				"export { CREATURE_CELL_SIZE, CREATURE_CELL_SLOTS } from '../../src/lib/game/creatures/CreaturePopulationSystem';"
			].join('\n'),
			resolveDir: here,
			loader: 'ts'
		},
		bundle: true,
		format: 'esm',
		platform: 'node',
		write: false,
		logLevel: 'error'
	});
	const code = result.outputFiles[0].text;
	const lib = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
	const size = lib.CREATURE_CELL_SIZE;
	const ids = [];
	const cx0 = Math.floor(x / size),
		cz0 = Math.floor(z / size);
	for (let cx = cx0 - 1; cx <= cx0 + 1; cx++)
		for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) {
			// The room accepts creatures whose home cell centre is within 80 m of the player.
			if (Math.hypot((cx + 0.5) * size - x, (cz + 0.5) * size - z) > 70) continue;
			for (let slot = 0; slot < lib.CREATURE_CELL_SLOTS; slot++)
				for (let member = 0; member < 8; member++) {
					const id = `group:${seed}:${cx}:${cz}:${slot}:${member}`;
					const definition = lib.resolveAmbientCreature(seed, id);
					if (definition && lib.abilityFor(definition)) ids.push(id);
				}
		}
	return ids;
}

function countBy(values) {
	const out = {};
	for (const value of values) out[value] = (out[value] ?? 0) + 1;
	return out;
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
