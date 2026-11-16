import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Biome minimap Phase 3: costs on a slower machine (Chromium CPU throttled 4×) and how long the
 * farthest zoom takes to fill in, water included. Opt-in, like the other GPU benchmarks:
 *
 *   MAP_BENCH=1 FOREST_DRIFT_GPU=1 npx playwright test tests/biomeMapPerformance.e2e.ts --project=chromium
 *
 * Saves to the Phase 3 folder (`MAP_BENCH_OUT`).
 */
test.skip(process.env.MAP_BENCH !== '1', 'Benchmark: set MAP_BENCH=1 to run');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scene = any;
const scene = <R>(page: Page, fn: (s: Scene) => R | Promise<R>) =>
	page.evaluate(
		(source) =>
			new Function('s', `return (${source})(s)`)(
				(window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene
			),
		fn.toString()
	) as Promise<R>;

async function settleWorld(page: Page) {
	await expect
		.poll(
			() =>
				scene(
					page,
					(s) =>
						s.treeManager.getStats().queuedChunks +
						s.grassRenderStats().queuedChunks +
						s.plantRenderStats().queuedChunks +
						s.terrainManager.getStats().queuedChunks
				),
			{ timeout: 180_000, intervals: [500] }
		)
		.toBe(0);
}

/** Frame time with the minimap shown or hidden. */
async function frames(page: Page, shown: boolean) {
	await scene(page, (s) => s.setBiomeMapVisible(false));
	if (shown) await scene(page, (s) => s.setBiomeMapVisible(true));
	await page.waitForTimeout(3000);
	return scene(page, async (s) => {
		const cost = s.biomeMap.cost;
		Object.assign(cost, { frames: 0, totalMs: 0, maxMs: 0, paints: 0 });
		const start = performance.now();
		const p = s.controller.worldPosition;
		const from = { x: p.x, y: p.y, z: p.z };
		let samples: number[] = [];
		let last = performance.now();
		await new Promise<void>((resolve) => {
			const step = () => {
				const now = performance.now();
				samples.push(now - last);
				last = now;
				const t = (now - start) / 1000;
				s.controller.restoreState(
					{ x: from.x + t * 20, y: from.y + 40, z: from.z - t * 20 },
					0.8,
					-0.2
				);
				if (t < 12) requestAnimationFrame(step);
				else resolve();
			};
			requestAnimationFrame(step);
		});
		samples = samples.slice(5).sort((a, b) => a - b);
		s.controller.restoreState(from, 0, 0);
		return {
			medianFrameMs: Math.round(samples[Math.floor(samples.length / 2)] * 10) / 10,
			p95FrameMs: Math.round(samples[Math.floor(samples.length * 0.95)] * 10) / 10,
			mapAverageMs: cost.frames ? Math.round((cost.totalMs / cost.frames) * 1000) / 1000 : 0,
			mapMaxMs: cost.maxMs,
			paints: cost.paints,
			frames: cost.frames
		};
	});
}

test('biome map costs on a 4× slower CPU, and the farthest zoom with water', async ({ page }) => {
	test.setTimeout(900_000);
	const results: Record<string, unknown> = {};
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Map bench', seed: 'map-water' });
	await settleWorld(page);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	results.throttled4x = {
		minimapOff: await frames(page, false),
		minimapOn: await frames(page, true)
	};

	// The farthest minimap zoom (8 km), from cold: how long until it shows, and until water is in.
	await scene(page, (s) => s.setBiomeMapVisible(false));
	await page.waitForTimeout(500);
	await scene(page, (s) => {
		s.biomeMapPrefs.zoom = 5;
		s.setBiomeMapVisible(true);
	});
	const start = Date.now();
	let firstDrawn = 0;
	await expect
		.poll(
			async () => {
				const state = await scene(page, (s) => ({
					cached: s.biomeMap.tileClient?.cachedCount ?? 0,
					pending: s.biomeMap.tileClient?.pendingCount ?? -1
				}));
				if (!firstDrawn && state.cached > 0) firstDrawn = Date.now() - start;
				return state.cached > 0 && state.pending === 0;
			},
			{ timeout: 600_000, intervals: [100] }
		)
		.toBe(true);
	const timings = await scene(page, (s) =>
		s.biomeMap.tileClient.timings
			.map(
				(
					t: { tiles: number; landMs: number; waterTiles: number; waterMs: number } | undefined,
					level: number
				) =>
					t
						? {
								level,
								tiles: t.tiles,
								landMs: Math.round(t.landMs / Math.max(1, t.tiles)),
								waterTiles: t.waterTiles,
								waterMs: Math.round(t.waterMs / Math.max(1, t.waterTiles))
							}
						: null
			)
			.filter(Boolean)
	);
	results.farthestZoomThrottled4x = {
		firstTilesMs: firstDrawn,
		allWithWaterMs: Date.now() - start,
		perLevel: timings
	};
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	const out =
		process.env.MAP_BENCH_OUT ?? 'docs/2026/11-16/Biome-Minimap/phase-3/map-performance.json';
	await writeFile(out, JSON.stringify(results, null, 2));
	console.log(JSON.stringify(results, null, 2));
});
