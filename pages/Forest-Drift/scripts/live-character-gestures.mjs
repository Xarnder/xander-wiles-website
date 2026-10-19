import fs from 'node:fs/promises';
import os from 'node:os';
import { chromium } from 'playwright';
import {
	CLIENT_LEAVE_CODE,
	PROTOCOL_VERSION,
	POSE_FLAGS,
	encodePose
} from '../src/lib/game/net/protocol.ts';

// Opt-in production smoke test. Uses viewer access and never edits world contents.
const config = JSON.parse(
	await fs.readFile(
		process.env.FOREST_LIVE_CONFIG ?? `${os.homedir()}/.config/forest-drift/production-world.json`,
		'utf8'
	)
);
const output = process.env.FOREST_GESTURE_OUTPUT ?? '/tmp/forest-live-gestures.json';
const base = process.env.FOREST_LIVE_URL ?? 'https://www.xanderwiles.com/pages/Forest-Drift/';
const report = { at: new Date().toISOString(), passed: false, errors: [] };
const redact = (message) =>
	Object.values(config.invites).reduce(
		(s, secret) => s.replaceAll(secret, '[redacted]'),
		String(message)
	);
const browser = await chromium.launch({
	headless: true,
	args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : []
});
let socket, timer;
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	page.on('pageerror', (e) => report.errors.push(redact(e.message)));
	await page.addInitScript(() => localStorage.setItem('forest-drift.graphics.v1', 'low'));
	await page.goto(`${base}?mp=${config.worldId}#invite=${config.invites.viewer}`);
	await page.getByTestId('join-world-name').fill('Gesture Observer', { timeout: 60000 });
	await page.getByTestId('join-world-confirm').click();
	await page
		.locator('[data-testid="online-status"][data-status="connected"]')
		.waitFor({ timeout: 120000 });
	const point = await page.evaluate(() => {
		const s = window.__forestSession.scene,
			p = s.controller.worldPosition;
		return { x: p.x + 1, y: p.y - s.settings.player.eyeHeight, z: p.z - 3 };
	});
	const { manifest } = await (
		await fetch(`${config.server}/w/${config.worldId}/snapshot`, {
			headers: { Authorization: `Bearer ${config.invites.viewer}` }
		})
	).json();
	const name = `Gesture QA ${Date.now()}`;
	socket = new WebSocket(`${config.server.replace(/^http/, 'ws')}/w/${config.worldId}/ws`);
	await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(Error('Viewer join timed out')), 15000);
		const done = (error) => {
			clearTimeout(timeout);
			if (error) reject(error);
			else resolve();
		};
		socket.onopen = () =>
			socket.send(
				JSON.stringify({
					t: 'hello',
					protocol: PROTOCOL_VERSION,
					build: 'gesture-qa',
					invite: config.invites.viewer,
					capability: null,
					schemaVersion: manifest.schemaVersion,
					generatorVersion: manifest.generatorVersion,
					playerId: `gesture-qa-${Date.now()}`,
					name,
					colour: '#e6194b'
				})
			);
		socket.onmessage = (event) => {
			if (typeof event.data !== 'string' || event.data === 'KA') return;
			const message = JSON.parse(event.data);
			if (message.t === 'welcome') done();
			if (message.t === 'error') done(Error(message.message));
		};
		socket.onerror = () => done(Error('Viewer socket failed'));
		socket.onclose = () => done(Error('Viewer socket closed'));
	});
	let seq = 0,
		yaw = 0,
		pitch = 0,
		building = false,
		jumpAt = 0;
	timer = setInterval(() => {
		if (socket.readyState !== 1) return;
		const age = (Date.now() - jumpAt) / 1000;
		const jumping = jumpAt > 0 && age < 0.9;
		socket.send(
			encodePose({
				seq: seq++ & 65535,
				sampleTime: Date.now(),
				...point,
				y: point.y + (jumping ? Math.sin((age / 0.9) * Math.PI) * 0.9 : 0),
				yaw,
				pitch,
				flags: (jumping ? 0 : POSE_FLAGS.grounded) | (building ? POSE_FLAGS.building : 0)
			})
		);
	}, 100);
	const waitPose = (field, min, max) =>
		page.waitForFunction(
			({ name, field, min, max }) => {
				const pose = window.__forestSession.scene.scene
					.getObjectByName(`remote-player:${name}`)
					?.getObjectByName('character-model')?.userData.animationState;
				return pose && pose[field] >= min && pose[field] <= max;
			},
			{ name, field, min, max },
			{ timeout: 30000 }
		);
	await waitPose('bodyYaw', -0.01, 0.01);
	yaw = 0.4;
	pitch = 0.5;
	building = true;
	await waitPose('reach', 0.8, 1);
	await waitPose('headYaw', 0.3, 0.5);
	await waitPose('pitch', 0.45, 0.55);
	await waitPose('bodyYaw', -0.01, 0.01);
	report.lookAndReach = true;
	yaw = 1.6;
	building = false;
	await waitPose('bodyYaw', 1.4, 1.7);
	await waitPose('reach', 0, 0.01);
	report.bodyFollowing = true;
	jumpAt = Date.now();
	report.landing = await page.evaluate(async (name) => {
		let airborne = false,
			compression = 0;
		const until = performance.now() + 2000;
		while (performance.now() < until) {
			const model = window.__forestSession.scene.scene
				.getObjectByName(`remote-player:${name}`)
				?.getObjectByName('character-model');
			airborne ||= model?.userData.animation === 'airborne';
			compression = Math.max(compression, model?.userData.animationState?.compression ?? 0);
			await new Promise(requestAnimationFrame);
		}
		return { airborne, compression };
	}, name);
	await waitPose('compression', 0, 0);
	report.passed =
		report.landing.airborne && report.landing.compression > 0.01 && report.errors.length === 0;
	await page.evaluate(() => window.__forestMultiplayer?.detach());
} catch (error) {
	report.failure = redact(error.message);
} finally {
	clearInterval(timer);
	socket?.close(CLIENT_LEAVE_CODE, 'QA completed');
	await browser.close();
	await fs.writeFile(output, JSON.stringify(report, null, 2));
	console.log(JSON.stringify(report));
	if (!report.passed) process.exitCode = 1;
}
