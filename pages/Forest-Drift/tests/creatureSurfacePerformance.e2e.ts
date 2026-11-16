import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Biome-specific creatures Phase 2 GPU A/B (technical plan §14.1): creature coat micro-texture on
 * and off (`?creatureDetail=off`). Full-screen close-ups of each coat type (the worst case for a
 * per-pixel cost) and the Lab's 25-creature stress scene. Opt-in, needs a real GPU:
 *   CREATURE_BENCH=1 npx playwright test tests/creatureSurfacePerformance.e2e.ts --project=chromium
 * `CREATURE_BENCH_OUT=<file>` saves the numbers (default: the Phase 2 record's folder).
 *
 * The release test (Phase 4) compares everything on with `?creatureCoats=off&creatureDetail=off`:
 * the Lab's 100-creature benchmark (compile and frame time, programs, draws) and a biome world
 * near spawn with live herds. Saved to the Phase 4 folder (`CREATURE_RELEASE_OUT`).
 */
test.skip(process.env.CREATURE_BENCH !== '1', 'GPU benchmark: set CREATURE_BENCH=1 to run');
if (process.platform === 'darwin')
	test.use({
		launchOptions: {
			args: [
				'--use-angle=metal',
				'--enable-gpu',
				'--ignore-gpu-blocklist',
				'--disable-gpu-vsync',
				'--disable-frame-rate-limit'
			]
		}
	});
test.use({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Lab = any;
const SPECIMENS: [string, string, number][] = [
	['quadruped', 'snowyTaiga', 40],
	['quadruped', 'desert', 41],
	['serpentine', 'swamp', 40],
	['hexapod', 'jungle', 40],
	['biped', 'swamp', 42]
];

async function open(page: Page, query: string) {
	await page.goto(`/creatures/?dev&inspect${query}`);
	await page.waitForFunction(() => (window as unknown as { creatureLab?: unknown }).creatureLab);
	await page.addStyleTag({
		content:
			'[data-testid=creature-viewport] { height: 900px !important; min-height: 900px !important; }'
	});
	await page.waitForTimeout(500);
}

/** Median and p95 frame time (ms) of the Lab's own render loop over `ms`. */
async function frames(page: Page, ms = 2500) {
	return page.evaluate(async (ms) => {
		const samples: number[] = [];
		let last = performance.now();
		const start = last;
		await new Promise<void>((resolve) => {
			const step = (now: number) => {
				samples.push(now - last);
				last = now;
				if (now - start < ms) requestAnimationFrame(step);
				else resolve();
			};
			requestAnimationFrame(step);
		});
		const sorted = samples.slice(5).sort((a, b) => a - b);
		const at = (q: number) => Math.round(sorted[Math.floor(sorted.length * q)] * 100) / 100;
		return { medianMs: at(0.5), p95Ms: at(0.95), frames: sorted.length };
	}, ms);
}

async function run(page: Page, detail: 'on' | 'off') {
	await open(page, detail === 'off' ? '&creatureDetail=off' : '');
	const results: Record<string, unknown>[] = [];
	for (const [plan, biome, seed] of SPECIMENS) {
		await page.evaluate(
			({ plan, biome, seed }) => {
				const lab = (window as unknown as { creatureLab: Lab }).creatureLab;
				lab.biome = biome;
				lab.generate(seed, 7, plan, 1, 0);
				lab.gait = 'idle';
				lab.frameView([1, 0.3, 0.7], 0.45);
			},
			{ plan, biome, seed }
		);
		await page.waitForTimeout(400);
		results.push({ detail, scene: `close-up ${plan} (${biome})`, ...(await frames(page)) });
	}
	const stress = await page.evaluate(() =>
		(window as unknown as { creatureLab: Lab }).creatureLab.benchmark(25)
	);
	results.push({ detail, scene: 'stress 25', fps: stress.fps, frameMs: stress.frameMs });
	return results;
}

test('creature coat detail GPU A/B', async ({ page }) => {
	test.setTimeout(600_000);
	const results = [...(await run(page, 'on')), ...(await run(page, 'off'))];
	const out =
		process.env.CREATURE_BENCH_OUT ??
		'docs/2026/11-12/Biomes-Specfic-Creatures/phase-2/coat-detail-performance.json';
	await writeFile(out, JSON.stringify(results, null, 2));
	console.table(results);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scene = any;
async function worldFrames(page: Page, query: string) {
	await page.goto(`/${query}`);
	await createAndEnterWorld(page, { name: 'Creature release', seed: 'creature-biomes-e2e' });
	await page.evaluate(() => {
		const s = (window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene;
		s.graphicsSettings.dynamicResolutionEnabled = false;
		s.weather.debug.selection = 'clear';
		s.weather.presetDebugValues();
		s.weather.applyDebugSelection();
		s.skySettings.dayCycle.enabled = false;
		s.skySettings.dayCycle.timeOfDay = 0.45;
		s.applySkySettings();
	});
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const s = (window as unknown as { __forestSession: { scene: Scene } }).__forestSession
						.scene;
					return (
						s.treeManager.getStats().queuedChunks +
						s.grassRenderStats().queuedChunks +
						s.plantRenderStats().queuedChunks +
						s.terrainManager.getStats().queuedChunks
					);
				}),
			{ timeout: 120_000, intervals: [500] }
		)
		.toBe(0);
	await page.waitForTimeout(4000);
	return page.evaluate(async () => {
		const s = (window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene;
		const frames = await s.measureFrames(4000);
		return {
			live: s.creatures.live.size,
			frameMs: frames.avgFrameMs,
			p95FrameMs: frames.p95FrameMs,
			cpuFrameMs: frames.cpuFrameMs,
			drawCalls: frames.drawCalls
		};
	});
}

test('creature release A/B: coats and detail on vs off', async ({ page }) => {
	test.setTimeout(900_000);
	const results: Record<string, unknown>[] = [];
	for (const [label, query] of [
		['on', ''],
		['off', '?creatureCoats=off&creatureDetail=off']
	] as const) {
		await page.goto(`/creatures/${query ? query + '&' : '?'}dev&inspect`);
		await page.waitForFunction(() => (window as unknown as { creatureLab?: unknown }).creatureLab);
		const lab = await page.evaluate(() =>
			(window as unknown as { creatureLab: Lab }).creatureLab.benchmark(100)
		);
		results.push({
			label,
			scene: 'Lab 100 creatures',
			compileMs: Math.round(lab.compileMs),
			frameMs: Math.round(lab.frameMs * 100) / 100,
			programs: lab.programs,
			drawCalls: lab.drawCalls
		});
		results.push({ label, scene: 'Biome world near spawn', ...(await worldFrames(page, query)) });
	}
	const out =
		process.env.CREATURE_RELEASE_OUT ??
		'docs/2026/11-12/Biomes-Specfic-Creatures/phase-4/creature-release-performance.json';
	await writeFile(out, JSON.stringify(results, null, 2));
	console.table(results);
});

/**
 * Biome-specific species (Phase 2): the same biome world with family rosters on and off
 * (`?creatureRosters=off`, today's regional species). Saved to the species Phase 2 folder
 * (`SPECIES_RELEASE_OUT`).
 */
test('species release A/B: rosters on vs off', async ({ page }) => {
	test.setTimeout(900_000);
	const results: Record<string, unknown>[] = [];
	for (const [label, query] of [
		['on', ''],
		['off', '?creatureRosters=off'],
		['on (again)', '']
	] as const) {
		const frames = await worldFrames(page, query);
		const herd = await page.evaluate(() => {
			const s = (window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene;
			const species = new Set<string>();
			let giants = 0;
			for (const r of s.creatures.logical.values()) {
				species.add(r.spawn.species.id);
				const p = r.spawn.species.proportions;
				if (
					(p.legLength + p.bodyDepth + p.neckLength + p.headSize) * r.spawn.individual.sizeFactor >
					6
				)
					giants++;
			}
			let shadowed = 0;
			const me = s.controller.worldPosition;
			let near = 0;
			for (const live of s.creatures.live.values()) {
				let casts = false;
				live.compiled.object.traverse((o: { castShadow?: boolean }) => {
					if (o.castShadow) casts = true;
				});
				if (casts) shadowed++;
				const p = live.compiled.object.position;
				if (Math.hypot(p.x - me.x, p.z - me.z) < 40) near++;
			}
			return {
				logical: s.creatures.logical.size,
				species: species.size,
				giants,
				shadowed,
				within40m: near
			};
		});
		results.push({ label, scene: 'Biome world near spawn', ...frames, ...herd });
	}
	const out =
		process.env.SPECIES_RELEASE_OUT ??
		'docs/2026/11-13/Biome-Specific-Species/phase-2/species-release-performance.json';
	await writeFile(out, JSON.stringify(results, null, 2));
	console.table(results);
});

/**
 * Weather on coats (2026-11-16): full-screen close-ups and 100 Lab creatures, dry, in rain and in
 * snow (the Lab's weather preview drives the same uniforms as the game's weather). Saved to the
 * weather-on-coats folder (`CREATURE_WEATHER_OUT`).
 */
test('weather on coats GPU A/B', async ({ page }) => {
	test.setTimeout(600_000);
	const results: Record<string, unknown>[] = [];
	await open(page, '');
	for (const [weather, wet, snow] of [
		['dry', 0, 0],
		['rain', 1, 0],
		['snow', 0, 0.9],
		['dry (again)', 0, 0]
	] as const) {
		await page.evaluate(
			([wet, snow]) =>
				(
					window as unknown as { creatureLab: { setWeatherPreview(w: number, s: number): void } }
				).creatureLab.setWeatherPreview(wet, snow),
			[wet, snow]
		);
		for (const [plan, biome, seed] of SPECIMENS) {
			await page.evaluate(
				({ plan, biome, seed }) => {
					const lab = (window as unknown as { creatureLab: Lab }).creatureLab;
					lab.biome = biome;
					lab.generate(seed, 7, plan, 1, 0);
					lab.gait = 'idle';
					lab.frameView([1, 0.3, 0.7], 0.45);
				},
				{ plan, biome, seed }
			);
			await page.waitForTimeout(400);
			results.push({ weather, scene: `close-up ${plan} (${biome})`, ...(await frames(page)) });
		}
		const lab = await page.evaluate(() =>
			(window as unknown as { creatureLab: Lab }).creatureLab.benchmark(100)
		);
		results.push({
			weather,
			scene: 'Lab 100 creatures',
			frameMs: Math.round(lab.frameMs * 100) / 100,
			programs: lab.programs,
			drawCalls: lab.drawCalls
		});
	}
	const out =
		process.env.CREATURE_WEATHER_OUT ??
		'docs/2026/11-16/Weather-On-Coats/weather-coats-performance.json';
	await writeFile(out, JSON.stringify(results, null, 2));
	console.table(results);
});
