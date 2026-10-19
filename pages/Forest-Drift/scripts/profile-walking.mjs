import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({
	headless: true,
	args: ['--use-angle=metal', '--enable-gpu']
});
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	// Opt-in GPU diagnostic: starts a fresh local Main World, never joins or edits a live room.
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(process.env.PROFILE_URL ?? 'http://127.0.0.1:4185/');
	await page.getByTestId('play-default-world').click();
	await page.waitForFunction(() => window.__forestSession?.scene?.controller);
	await page.waitForTimeout(10000);
	const cdp = await page.context().newCDPSession(page);
	const sampleCpu = process.env.PROFILE_CPU === '1';
	if (sampleCpu) {
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.start');
	}
	const report = await page.evaluate(async () => {
		const s = window.__forestSession.scene,
			c = s.controller;
		let frameCosts = {};
		let phase = 'idle';
		const names = [
			'controller',
			'hydrology',
			'terrainManager',
			'water',
			'treeManager',
			'grassManager',
			'plantManager',
			'miniBuilds',
			'buildToolManager',
			'creatures',
			'skySystem',
			'cloudSystem',
			'graphicsPipeline',
			'surfaceBinder',
			'furnitureManager',
			'music'
		];
		for (const name of names)
			for (const method of [
				'update',
				'updateView',
				'prepareAround',
				'tick',
				'render',
				'flush',
				'animate',
				'updateLights'
			]) {
				const o = s[name];
				if (typeof o?.[method] !== 'function') continue;
				const fn = o[method];
				o[method] = function (...args) {
					const start = performance.now();
					try {
						return fn.apply(this, args);
					} finally {
						const ms = performance.now() - start;
						const k = name + '.' + method;
						frameCosts[k] = (frameCosts[k] ?? 0) + ms;
					}
				};
			}
		const update = c.update;
		let elapsed = 0;
		c.update = function (dt) {
			if (phase === 'turn' || phase === 'walk-turn')
				this.addTouchLook(-dt * 240, Math.cos(elapsed) * dt * 16);
			elapsed += dt;
			return update.call(this, dt);
		};
		c.setTouchActive(true);
		const phases = [];
		for (const [name, seconds] of [
			['idle', 6],
			['turn', 14],
			['walk', 25],
			['walk-turn', 14]
		]) {
			phase = name;
			c.setTouchMovement(0, name.startsWith('walk') ? 1 : 0);
			const frames = [],
				slow = [];
			const start = performance.now();
			let last = start;
			frameCosts = {};
			const sums = {};
			while (performance.now() - start < seconds * 1000) {
				await new Promise(requestAnimationFrame);
				const now = performance.now(),
					dt = now - last;
				last = now;
				frames.push(dt);
				for (const [k, v] of Object.entries(frameCosts)) sums[k] = (sums[k] ?? 0) + v;
				if (dt > 25)
					slow.push({
						dt,
						costs: frameCosts,
						position: c.worldPosition.toArray(),
						programs: s.renderer.info.programs?.length
					});
				frameCosts = {};
			}
			frames.sort((a, b) => a - b);
			phases.push({
				name,
				frames: frames.length,
				fps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
				p95: frames[Math.floor(frames.length * 0.95)],
				p99: frames[Math.floor(frames.length * 0.99)],
				max: frames.at(-1),
				over25: slow.length,
				over50: slow.filter((f) => f.dt > 50).length,
				costs: sums,
				slow: slow.sort((a, b) => b.dt - a.dt).slice(0, 30)
			});
		}
		return { phases, quality: s.graphicsPipeline.getQuality(), renderer: s.renderer.info.render };
	});
	const out = process.env.PROFILE_OUT ?? '/tmp/forest-walking';
	if (sampleCpu) {
		const { profile } = await cdp.send('Profiler.stop');
		await fs.writeFile(out + '.cpuprofile', JSON.stringify(profile));
	}
	await fs.writeFile(out + '.json', JSON.stringify({ ...report, errors }, null, 2));
	if (errors.length) process.exitCode = 1;
	console.log(
		JSON.stringify(
			report.phases.map(({ slow, costs, ...rest }) => ({ ...rest, top: slow.slice(0, 3), costs }))
		)
	);
} finally {
	await browser.close();
}
