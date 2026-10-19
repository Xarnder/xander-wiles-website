import fs from 'node:fs/promises';
import os from 'node:os';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { PROTOCOL_VERSION, POSE_FLAGS, encodePose } from '../src/lib/game/net/protocol.ts';
// Opt-in live test: reads a private viewer invite; never persists credentials or changes world contents.
const w = JSON.parse(
	await fs.readFile(
		process.env.FOREST_LIVE_CONFIG ?? os.homedir() + '/.config/forest-drift/production-world.json',
		'utf8'
	)
);
const output = process.env.FOREST_CROWD_OUTPUT ?? '/tmp/forest-crowd';
const quality = process.env.FOREST_CROWD_QUALITY ?? 'high';
if (!['low', 'medium', 'high', 'ultra'].includes(quality))
	throw new Error('Invalid graphics quality');
let speed = 6;
const redact = (s) =>
	Object.values(w.invites).reduce(
		(text, secret) => text.replaceAll(secret, '[redacted]'),
		String(s)
	);
const { manifest } = await (
	await fetch(`${w.server}/w/${w.worldId}/snapshot`, {
		headers: { Authorization: `Bearer ${w.invites.viewer}` }
	})
).json();
const report = {
	at: new Date().toISOString(),
	scope: 'One Chromium browser, 19 real WebSocket clients; 1280x800',
	quality,
	platform: process.platform,
	errors: [],
	joins: [],
	samples: []
};
const sockets = [],
	timers = [];
let ending = false;
const browser = await chromium.launch({
	headless: true,
	args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : []
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => report.errors.push(redact(e.message)));
await page.addInitScript(
	(quality) => localStorage.setItem('forest-drift.graphics.v1', quality),
	quality
);
try {
	await page.goto(
		'https://xanderwiles.com/pages/Forest-Drift/?mp=' + w.worldId + '#invite=' + w.invites.viewer
	);
	await page.getByTestId('join-world-name').fill('Crowd Observer', { timeout: 60000 });
	await page.getByTestId('join-world-confirm').click();
	await page
		.locator('[data-testid="online-status"][data-status="connected"]')
		.waitFor({ timeout: 120000 });
	await page.waitForTimeout(10000);
	const paths = await page.evaluate(() => {
		const s = window.__forestSession.scene,
			p = s.controller.worldPosition;
		const height = s.terrainManager.getHeightSampler();
		const cx = p.x,
			cz = p.z - 22;
		s.controller.restoreState({ x: p.x, y: p.y, z: p.z }, 0, -0.07);
		return Array.from({ length: 19 }, (_, i) =>
			Array.from({ length: 128 }, (_, j) => {
				const a = (j / 128) * Math.PI * 2;
				const x = cx + ((i % 5) - 2) * 3.2 + Math.sin(a) * 1.5,
					z = cz + Math.floor(i / 5) * 3.2 + Math.cos(a) * 1.5;
				return { x, z, y: height.sample(x, z) };
			})
		);
	});
	report.baseline = await page.evaluate(() => window.__forestSession.scene.measureFrames(10000));
	for (let i = 0; i < 19; i++) {
		const ws = new WebSocket(`${w.server.replace(/^http/, 'ws')}/w/${w.worldId}/ws`);
		sockets.push(ws);
		ws.binaryType = 'arraybuffer';
		await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				ws.close();
				reject(Error('Join timeout'));
			}, 15000);
			ws.onopen = () =>
				ws.send(
					JSON.stringify({
						t: 'hello',
						protocol: PROTOCOL_VERSION,
						build: 'crowd-qa',
						invite: w.invites.viewer,
						capability: null,
						schemaVersion: manifest.schemaVersion,
						generatorVersion: manifest.generatorVersion,
						playerId: 'crowd-' + i + '-' + Date.now(),
						name: 'Crowd ' + (i + 1),
						colour: '#e6194b'
					})
				);
			ws.onmessage = (e) => {
				if (typeof e.data !== 'string' || e.data === 'KA') return;
				const m = JSON.parse(e.data);
				if (m.t === 'welcome') {
					clearTimeout(timeout);
					report.joins.push({
						slot: m.slot,
						players: m.players.length,
						colours: m.players.map((p) => p.colour)
					});
					resolve();
				}
				if (m.t === 'error') {
					clearTimeout(timeout);
					reject(Error(m.message));
				}
			};
			ws.onclose = () => {
				clearTimeout(timeout);
				reject(Error('Socket closed'));
				if (!ending) report.errors.push('Unexpected socket close ' + i);
			};
			ws.onerror = () => {
				clearTimeout(timeout);
				reject(Error('Socket error'));
			};
		});
		let seq = 0,
			angle = i,
			last = performance.now();
		timers.push(
			setInterval(() => {
				if (ws.readyState !== 1) return;
				const now = performance.now();
				angle += (((now - last) / 1000) * speed) / 1.5;
				last = now;
				const a = (angle * 128) / (Math.PI * 2),
					k = Math.floor(a) % 128,
					f = a % 1,
					p = paths[i][k],
					q = paths[i][(k + 1) % 128];
				ws.send(
					encodePose({
						seq: seq++ & 65535,
						sampleTime: Date.now(),
						x: p.x + (q.x - p.x) * f,
						y: p.y + (q.y - p.y) * f,
						z: p.z + (q.z - p.z) * f,
						yaw: Math.atan2(p.x - q.x, p.z - q.z),
						pitch: 0,
						flags:
							POSE_FLAGS.grounded |
							(speed > 0 ? POSE_FLAGS.moving : 0) |
							(speed > 6 ? POSE_FLAGS.running : 0)
					})
				);
			}, 100)
		);
	}
	await page.waitForFunction(() => window.__forestMultiplayer.stats.avatars === 19, null, {
		timeout: 30000
	});
	await page.waitForTimeout(8000);
	const inspect = () =>
		page.evaluate(() => {
			const a = [...window.__forestMultiplayer.avatars.avatars.values()];
			return a.map((v) => ({
				name: v.name,
				colour: v.colour,
				jacket: v.character?.materials.find((m) => m.name === 'Clothing')?.color.getHexString(),
				visible: v.root.visible && v.character?.object.visible,
				state: v.character?.object.userData.animation,
				leg: v.character?.object.getObjectByName('mixamorigLeftUpLeg')?.quaternion.toArray()
			}));
		});
	report.before = await inspect();
	for (const mode of ['walk', 'run', 'idle']) {
		speed = mode === 'walk' ? 6 : mode === 'run' ? 12 : 0;
		await page.waitForTimeout(2000);
		const sample = await page.evaluate(async () => {
			const s = window.__forestSession.scene;
			const [stats, frames] = await Promise.all([
				s.measureFrames(20000),
				s.sampleFrameTimes(20000)
			]);
			frames.sort((a, b) => a - b);
			return {
				...stats,
				p99FrameMs: frames[Math.floor(frames.length * 0.99)],
				framesOver25Ms: frames.filter((v) => v > 25).length,
				totalFrames: frames.length
			};
		});
		const characters = await inspect();
		report.samples.push({ mode, ...sample, states: characters.map((c) => c.state) });
		console.log(mode, JSON.stringify(sample));
	}

	report.after = await inspect();
	report.net = await page.evaluate(() => window.__forestMultiplayer.stats);
	report.graphics = await page.evaluate(() =>
		window.__forestSession.scene.graphicsPipeline.getRenderStats()
	);
	report.browser = browser.version();
	await page.screenshot({
		path: output + '.png',
		style: '.instructions {visibility:hidden!important}'
	});
	report.passed =
		report.joins.at(-1).players === 20 &&
		new Set(report.joins.at(-1).colours).size === 20 &&
		new Set(report.after.map((p) => p.jacket)).size === 19 &&
		report.after.every(
			(p, i) =>
				p.visible &&
				p.jacket === p.colour.slice(1) &&
				JSON.stringify(p.leg) !== JSON.stringify(report.before[i].leg)
		) &&
		report.samples.every(
			(s) =>
				s.fps >= 59 &&
				s.p95FrameMs < 20 &&
				s.states.every((state) => state === (s.mode === 'idle' ? 'idle' : 'moving'))
		) &&
		report.errors.length === 0;
} catch (e) {
	report.failure = redact(e.message);
	report.passed = false;
} finally {
	ending = true;
	timers.forEach(clearInterval);
	sockets.forEach((s) => s.close());
	await page.evaluate(() => window.__forestMultiplayer?.detach()).catch(() => {});
	await browser.close();
	await fs.writeFile(output + '.json', JSON.stringify(report, null, 2));
	console.log(
		JSON.stringify({
			passed: report.passed,
			failure: report.failure,
			baseline: report.baseline,
			samples: report.samples,
			errors: report.errors
		})
	);
}

if (!report.passed) process.exitCode = 1;
