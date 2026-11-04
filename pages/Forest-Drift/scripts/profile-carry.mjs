import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

/**
 * Ranged weapons frame pacing (plan §11). Same harness as profile-walking.mjs: a fresh local Main
 * World in headless Chromium on the real GPU, frame callback intervals per phase. Phases compare
 * the same session without and with a carried creature, then firing, walking while firing, and a
 * "four carriers" load (this player firing plus three simulated carriers: their creatures drawn
 * under an arm in view and their pellets at the room's sustained rate).
 *
 *   PROFILE_OUT=/tmp/forest-carry node scripts/profile-carry.mjs
 *
 * Start the production preview on port 4185 first. PROFILE_QUALITY picks the graphics preset
 * (default medium, as the plan's budget is stated). Never joins a room or edits an online world.
 */
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const quality = process.env.PROFILE_QUALITY ?? 'medium';
const browser = await chromium.launch({
	headless: true,
	args: ['--use-angle=metal', '--enable-gpu']
});
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	await page.addInitScript((q) => localStorage.setItem('forest-drift.graphics.v1', q), quality);
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(process.env.PROFILE_URL ?? 'http://127.0.0.1:4185/');
	// The game opens on the main menu; Main World is on the Worlds screen.
	await page.getByRole('button', { name: 'Worlds', exact: true }).click();
	await page.getByTestId('play-default-world').click();
	await page.waitForFunction(() => window.__forestSession?.scene?.controller);
	await page.waitForTimeout(10000);

	const report = await page.evaluate(async () => {
		const s = window.__forestSession.scene;
		const c = s.controller;
		c.setTouchActive(true);
		if (!s.buildToolManager.isNormalMode()) s.toggleBuildMode();
		const frame = () => new Promise(requestAnimationFrame);
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));

		// Per-frame costs of the systems this feature adds or touches.
		let costs = {};
		const wrap = (name, object, method) => {
			const fn = object[method];
			object[method] = function (...args) {
				const start = performance.now();
				try {
					return fn.apply(this, args);
				} finally {
					costs[name] = (costs[name] ?? 0) + performance.now() - start;
				}
			};
		};
		wrap('projectiles', s.projectiles, 'update');
		wrap('heldCreature', s.heldCreature, 'update');
		wrap('creatures', s.creatures, 'update');
		wrap('carry', s.carry, 'update');

		/** Stand next to the nearest small four-legged creature and pick it up. */
		async function pickUp() {
			for (let attempt = 0; attempt < 20; attempt++) {
				const me = c.worldPosition;
				let best = null;
				for (const [id, live] of s.creatures.live) {
					const r = s.creatures.logical.get(id);
					if (!r) continue;
					const p = r.spawn.species.proportions;
					const h =
						(p.legLength + p.bodyDepth + p.neckLength + p.headSize) * r.spawn.individual.sizeFactor;
					if (h > 0.9 || r.spawn.species.bodyPlan.id !== 'quadruped') continue;
					const d = Math.hypot(r.position.x - me.x, r.position.z - me.z);
					if (!best || d < best.d) best = { d, live };
				}
				if (best) {
					const p = best.live.compiled.object.position;
					const mid = p.y + best.live.compiled.compilation.collision.height / 2;
					const from = { x: p.x + 1.3, z: p.z };
					const eyeY = s.worldSurfaceSampler.getSupportingSurfaceY(from.x, from.z, Infinity) + 1.7;
					c.restoreState(
						{ x: from.x, y: eyeY, z: from.z },
						Math.atan2(-(p.x - from.x), -(p.z - from.z)),
						Math.atan2(mid - eyeY, 1.3)
					);
					await wait(150);
					if (s.toggleCarry() && s.getCarryState().carrying) return true;
				}
				await wait(500);
			}
			return false;
		}

		// Three simulated carriers: their creatures in view, their pellets at the sustained rate.
		const others = [];
		let otherPelletsAt = 0;
		function simulateOthers(nowMs) {
			const camera = s.camera;
			camera.updateMatrixWorld();
			others.forEach((view, i) => {
				const anchor = camera.matrixWorld.clone();
				const offset = anchor.clone().makeTranslation(-2 + i * 2, -0.8, -5);
				anchor.multiply(offset);
				view.update({ kind: 'third-person', anchor }, 1 / 60, nowMs, false);
			});
			// 3 carriers × one pellet per 1.5 s (5-shot bursts averaged out): one every 0.5 s.
			if (nowMs - otherPelletsAt >= 500) {
				otherPelletsAt = nowMs;
				const e = c.worldPosition;
				const a = Math.random() * Math.PI * 2;
				const origin = { x: e.x + Math.sin(a) * 12, y: e.y - 0.4, z: e.z + Math.cos(a) * 12 };
				const dir = { x: -Math.sin(a), y: 0.02, z: -Math.cos(a) };
				s.projectiles.spawn(origin, dir, '#e0b040', performance.now());
			}
		}

		const phases = [];
		async function measure(name, seconds, setup, perFrame) {
			setup?.();
			const frames = [];
			const sums = {};
			let slow = 0;
			const slowFrames = [];
			const start = performance.now();
			let last = start;
			costs = {};
			while (performance.now() - start < seconds * 1000) {
				await frame();
				const now = performance.now();
				frames.push(now - last);
				if (now - last > 25) {
					slow++;
					// What this feature's systems cost in the frame before the slow one, plus
					// whether a pellet had just been fired (first-use work shows up here).
					slowFrames.push({
						ms: Math.round((now - last) * 10) / 10,
						at: Math.round(now - start),
						costs: Object.fromEntries(
							Object.entries(costs).map(([k, v]) => [k, Math.round(v * 100) / 100])
						),
						launched: s.projectiles.launched
					});
				}
				last = now;
				perFrame?.(now);
				for (const [k, v] of Object.entries(costs)) sums[k] = (sums[k] ?? 0) + v;
				costs = {};
			}
			frames.sort((a, b) => a - b);
			const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
			phases.push({
				name,
				frames: frames.length,
				fps: Math.round((1000 / mean) * 10) / 10,
				meanMs: Math.round(mean * 100) / 100,
				p95: Math.round(frames[Math.floor(frames.length * 0.95)] * 100) / 100,
				p99: Math.round(frames[Math.floor(frames.length * 0.99)] * 100) / 100,
				max: Math.round(frames.at(-1) * 100) / 100,
				over25: slow,
				slowFrames,
				pelletsInFlightAtEnd: s.projectiles.activeCount,
				costMsPerFrame: Object.fromEntries(
					Object.entries(sums).map(([k, v]) => [k, Math.round((v / frames.length) * 1000) / 1000])
				)
			});
		}

		const walk = (on) => c.setTouchMovement(0, on ? 1 : 0);
		await measure('idle', 8, () => walk(false));
		await measure('walk', 15, () => walk(true));
		walk(false);
		const picked = await pickUp();
		if (!picked) return { error: 'could not pick up a creature' };
		await wait(1500); // let the in-hand copy compile and settle
		c.restoreState(c.worldPosition, c.getYaw(), 0.05);
		await measure('carry-idle', 8, () => walk(false));
		await measure('carry-fire', 15, () => s.setCarryTrigger(true));
		await measure('carry-fire-walk', 15, () => walk(true));
		walk(false);
		const definition = s.heldCreature.attached;
		const View = s.heldCreature.constructor;
		for (let i = 0; i < 3; i++) {
			const view = new View(s.scene, (m) => s.graphicsPipeline.registerMaterial(m));
			view.attach(definition);
			others.push(view);
		}
		await measure('four-carriers-fire', 15, () => walk(false), simulateOthers);
		s.setCarryTrigger(false);
		for (const view of others) view.dispose();
		return {
			quality: s.getGraphicsQuality(),
			launched: s.projectiles.launched,
			worldHits: s.projectiles.worldHits,
			phases
		};
	});
	const output = { measuredAt: new Date().toISOString(), viewport: '1280x800', report, errors };
	const out = process.env.PROFILE_OUT;
	if (out) await fs.writeFile(`${out}.json`, JSON.stringify(output, null, 2));
	console.log(JSON.stringify(output, null, 2));
} finally {
	await browser.close();
}
