import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Find a biome Phase 2: what the Biomes list costs in the game (plan §8). With the full map open,
 * frames while idle against frames from pressing B until the distances are in, and how long that
 * takes, at full speed and with the CPU throttled 4× (Chromium's throttling slows the main thread,
 * not the map worker). Each round travels 3 km first, so the list scans afresh. Opt-in:
 *
 *   FIND_BIOME_BENCH=1 FOREST_DRIFT_GPU=1 npx playwright test tests/findBiomePerformance.e2e.ts --project=chromium
 *
 * Saves to `FIND_BIOME_BENCH_OUT`.
 */
test.skip(process.env.FIND_BIOME_BENCH !== '1', 'Benchmark: set FIND_BIOME_BENCH=1 to run');

interface Recorder {
	frames: number[];
	running: boolean;
}

const startFrames = (page: Page) =>
	page.evaluate(() => {
		const w = window as unknown as { __rec: Recorder };
		const rec: Recorder = { frames: [], running: true };
		w.__rec = rec;
		let last = performance.now();
		const tick = (now: number) => {
			if (!rec.running) return;
			rec.frames.push(now - last);
			last = now;
			requestAnimationFrame(tick);
		};
		requestAnimationFrame((now) => {
			last = now;
			requestAnimationFrame(tick);
		});
	});

const stopFrames = (page: Page) =>
	page.evaluate(() => {
		const rec = (window as unknown as { __rec: Recorder }).__rec;
		rec.running = false;
		const sorted = [...rec.frames].sort((a, b) => a - b);
		const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
		const round = (n: number) => Math.round(n * 10) / 10;
		return {
			frames: sorted.length,
			medianMs: round(at(0.5)),
			p95Ms: round(at(0.95)),
			longestMs: round(sorted.at(-1) ?? 0)
		};
	});

test('the Biomes list on a 4× slower CPU', async ({ page }) => {
	test.setTimeout(600_000);
	await page.addInitScript(() => localStorage.setItem('forest-drift.graphics.v1', 'medium'));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Find bench', seed: 'forest' });
	await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	await page.waitForTimeout(3000);
	const cdp = await page.context().newCDPSession(page);
	const results: Record<string, unknown[]> = {};
	let leg = 0;
	for (const rate of [1, 4]) {
		await cdp.send('Emulation.setCPUThrottlingRate', { rate });
		const rounds = [];
		for (let i = 0; i < 3; i++) {
			// Somewhere new, so the list scans afresh.
			leg++;
			await page.evaluate(async (leg) => {
				const s = (window as unknown as { __forestSession: { scene: { [k: string]: never } } })
					.__forestSession.scene as unknown as {
					controller: { worldPosition: { x: number; z: number } };
					fastTravel(x: number, z: number): Promise<unknown>;
				};
				const p = s.controller.worldPosition;
				await s.fastTravel(p.x + (leg % 2 ? 3000 : 0), p.z + (leg % 2 ? 0 : 3000));
			}, leg);
			await page.waitForTimeout(1500);
			await page.keyboard.press('Backquote');
			await expect(page.getByTestId('biome-full-map-biome')).not.toHaveText('—', {
				timeout: 30_000
			});
			await page.waitForTimeout(1500);
			await startFrames(page);
			await page.waitForTimeout(1500);
			const idle = await stopFrames(page);
			await startFrames(page);
			const start = Date.now();
			await page.keyboard.press('b');
			await expect(page.getByTestId('biome-list-status')).toHaveText('Nearest within 16 km', {
				timeout: 60_000
			});
			const listMs = Date.now() - start;
			const scanning = await stopFrames(page);
			rounds.push({ idle, scanning, listMs });
			await page.keyboard.press('Escape');
			await page.keyboard.press('Escape');
			await expect(page.getByTestId('biome-full-map')).toBeHidden();
		}
		results[`cpu${rate}x`] = rounds;
		console.log(`cpu ${rate}x`, JSON.stringify(rounds));
	}
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	if (process.env.FIND_BIOME_BENCH_OUT)
		await writeFile(process.env.FIND_BIOME_BENCH_OUT, JSON.stringify(results, null, 2));
});
