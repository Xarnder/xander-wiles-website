import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { BIOME_IDS, type BiomeId } from '../src/lib/game/biomes/BiomeTypes';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Biomes Phase 6 GPU pass (plan §13.1): frame time, draw calls and triangles at ground level in the
 * densest and most unusual biomes, against today's densest forest (the same world with biomes
 * off), at HIGH and LOW on a Retina-sized canvas. Also an A/B of the terrain `GROUND` shader layer
 * (bare snow, sand, soil and litter) on and off at the same view.
 *
 * Opt-in, since it needs a real GPU and takes several minutes:
 *   BIOME_BENCH=1 npx playwright test tests/biomePerformance.e2e.ts --project=chromium
 * `BIOME_BENCH_OUT=<file>` saves the numbers (default: the Phase 6 record's folder).
 */
test.skip(process.env.BIOME_BENCH !== '1', 'GPU benchmark: set BIOME_BENCH=1 to run');

if (process.platform === 'darwin') {
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
}
test.use({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyScene = any;
type TestWindow = Window & { __forestSession: { scene: AnyScene } };

const BENCH_BIOMES: BiomeId[] = [
	'jungle',
	'bambooJungle',
	'darkForest',
	'silverwood',
	'cherryGrove',
	'swamp',
	'snowyTaiga',
	'desert',
	'snowyPlains'
];
/** Biomes whose ground is mostly bare cover, where the GROUND layer does the most work. */
const GROUND_AB: BiomeId[] = ['desert', 'snowyPlains'];

async function waitForStreaming(page: Page): Promise<void> {
	// Reports what is still queued, so a stall says which system is stuck.
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const s = (window as unknown as TestWindow).__forestSession.scene;
					return [
						`trees ${s.treeManager.getStats().queuedChunks}`,
						`grass ${s.grassRenderStats().queuedChunks}`,
						`plants ${s.plantRenderStats().queuedChunks}`,
						`terrain ${s.terrainManager.getStats().queuedChunks}`
					].join(', ');
				}),
			{ timeout: 120_000, intervals: [250] }
		)
		.toBe('trees 0, grass 0, plants 0, terrain 0');
}

async function standAt(page: Page, at: { x: number; z: number }, yaw = 0.6): Promise<void> {
	await page.evaluate(
		({ x, z, yaw }) => {
			const s = (window as unknown as TestWindow).__forestSession.scene;
			const y = s.terrainManager.getHeightSampler().sample(x, z) + 1.7;
			s.controller.setFlying(false);
			s.controller.restoreState({ x, y, z }, yaw, 0.02);
		},
		{ ...at, yaw }
	);
	await waitForStreaming(page);
	await page.waitForTimeout(800);
}

async function measure(page: Page, sampleMs = 3000) {
	return page.evaluate(async (ms) => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const frames = await s.measureFrames(ms);
		const trees = s.treeRenderStats();
		return {
			fps: frames.fps,
			avgFrameMs: frames.avgFrameMs,
			p95FrameMs: frames.p95FrameMs,
			cpuFrameMs: frames.cpuFrameMs,
			drawCalls: frames.drawCalls,
			triangles: frames.triangles,
			visibleTrees: Object.values(trees.visibleTreesByLod as Record<string, number>).reduce(
				(a, b) => a + b,
				0
			)
		};
	}, sampleMs);
}

/** The point nearest spawn (on dry land) whose dominant biome is `index`, well inside it. */
async function findBiome(page: Page, index: number): Promise<{ x: number; z: number } | null> {
	return page.evaluate((index) => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const field = s.biomeField;
		const w = new Float32Array(32);
		for (let r = 0; r <= 9000; r += 96)
			for (let a = 0, n = Math.max(1, Math.round(r / 48)); a < n; a++) {
				const x = Math.cos((a / n) * Math.PI * 2) * r;
				const z = Math.sin((a / n) * Math.PI * 2) * r;
				if (field.weightsAt(x, z, w) !== index || w[index] < 0.95) continue;
				// Well inside: the same biome 40 m out in four directions.
				let inside = true;
				for (const [dx, dz] of [
					[40, 0],
					[-40, 0],
					[0, 40],
					[0, -40]
				])
					if (field.weightsAt(x + dx, z + dz, w) !== index) inside = false;
				if (inside && !(s.hydrology.waterColumnDepth(x, z) > 0)) return { x, z };
			}
		return null;
	}, index);
}

/** Today's densest forest near spawn (biomes off), as the treePerformance harness picks it. */
async function findForest(page: Page): Promise<{ x: number; z: number }> {
	return page.evaluate(() => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const veg = s.treeManager.getVegetationRegionSampler();
		let best = { x: 0, z: 0, score: -Infinity };
		for (let r = 0; r < 900; r += 40)
			for (let a = 0; a < 24; a++) {
				const x = Math.cos((a / 24) * Math.PI * 2) * r;
				const z = Math.sin((a / 24) * Math.PI * 2) * r;
				const score = veg.getForestDensity(x, z) - (s.hydrology.waterColumnDepth(x, z) > 0 ? 5 : 0);
				if (score > best.score) best = { x, z, score };
			}
		return { x: best.x, z: best.z };
	});
}

/** Zero (or restore) every active terrain chunk's `aGround`, so the shader skips the layer. */
async function setGroundLayer(page: Page, on: boolean): Promise<void> {
	await page.evaluate((on) => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const store = ((
			window as unknown as { __groundBackup?: Map<unknown, Float32Array> }
		).__groundBackup ??= new Map());
		for (const chunk of s.terrainManager.active.values()) {
			const attribute = chunk.mesh.geometry.getAttribute('aGround');
			if (!attribute) continue;
			if (!on) {
				store.set(chunk, Float32Array.from(attribute.array));
				attribute.array.fill(0);
			} else {
				const saved = store.get(chunk);
				if (saved) attribute.array.set(saved);
			}
			attribute.needsUpdate = true;
		}
		if (on) store.clear();
	}, on);
	await page.waitForTimeout(500);
}

test('biome GPU benchmark', async ({ page }) => {
	test.setTimeout(1_800_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Biome Bench', seed: 'biome-bench-1' });
	await page.evaluate(() => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		s.graphicsSettings.dynamicResolutionEnabled = false;
		s.setGrassAdaptive(false);
		s.setPlantAdaptive(false);
		s.weather.debug.selection = 'clear';
		s.weather.presetDebugValues();
		s.weather.applyDebugSelection();
		s.skySettings.dayCycle.enabled = false;
		s.skySettings.dayCycle.timeOfDay = 0.52;
		s.applySkySettings();
	});
	await page.addStyleTag({
		content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }'
	});
	const label = process.env.BIOME_BENCH_LABEL ?? 'run';
	const results: Record<string, unknown>[] = [];

	// Find every spot first (biomes on), so each quality pass visits the same views.
	const spots: { biome: BiomeId; at: { x: number; z: number } }[] = [];
	for (const biome of BENCH_BIOMES) {
		const at = await findBiome(page, BIOME_IDS.indexOf(biome));
		if (at) spots.push({ biome, at });
		else console.log(`no ${biome} found within 9 km`);
	}

	for (const quality of ['high', 'low'] as const) {
		await page.evaluate((q) => {
			(window as unknown as TestWindow).__forestSession.scene.graphicsPipeline.setQuality(q);
		}, quality);

		// Baseline: the same world with biomes off, in today's densest forest.
		await page.evaluate(() =>
			(window as unknown as TestWindow).__forestSession.scene.setBiomesEnabled(false)
		);
		const forest = await findForest(page);
		await standAt(page, forest);
		results.push({
			label,
			quality,
			scene: 'baseline forest (biomes off)',
			...(await measure(page))
		});

		await page.evaluate(() =>
			(window as unknown as TestWindow).__forestSession.scene.setBiomesEnabled(true)
		);
		for (const { biome, at } of spots) {
			await standAt(page, at);
			results.push({ label, quality, scene: biome, ...(await measure(page)) });
			if (quality === 'high' && GROUND_AB.includes(biome)) {
				await setGroundLayer(page, false);
				results.push({
					label,
					quality,
					scene: `${biome} (GROUND layer off)`,
					...(await measure(page))
				});
				await setGroundLayer(page, true);
			}
		}
	}

	const out =
		process.env.BIOME_BENCH_OUT ??
		'docs/2026/11-12/Biomes-and-Enviroments/phase-6/biome-performance.json';
	await writeFile(out, JSON.stringify({ label, spots, errors, results }, null, 2));
	console.table(
		results.map((r) => ({
			q: r.quality,
			scene: r.scene,
			fps: r.fps,
			ms: r.avgFrameMs,
			p95: r.p95FrameMs,
			cpu: r.cpuFrameMs,
			draws: r.drawCalls,
			tris: r.triangles,
			trees: r.visibleTrees
		}))
	);
	expect(errors.filter((e) => !/hdri|sky\.hdr/i.test(e))).toEqual([]);
});
