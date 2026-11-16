import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Fast travel Phase 3: the cut's cost on a slower machine (Chromium CPU throttled 4×, plan §10:
 * the jump ≤ 250 ms), how long the land takes to fill back in, and what the faster terrain
 * streaming after a trip costs per frame. Opt-in, like the other GPU benchmarks:
 *
 *   TRAVEL_BENCH=1 FOREST_DRIFT_GPU=1 npx playwright test tests/fastTravelPerformance.e2e.ts --project=chromium
 *
 * Saves to `TRAVEL_BENCH_OUT`.
 */
test.skip(process.env.TRAVEL_BENCH !== '1', 'Benchmark: set TRAVEL_BENCH=1 to run');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scene = any;
const run = <R, A>(page: Page, fn: (s: Scene, arg: A) => R | Promise<R>, arg: A) =>
	page.evaluate(
		({ source, arg }) =>
			new Function('s', 'arg', `return (${source})(s, arg)`)(
				(window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene,
				arg
			),
		{ source: fn.toString(), arg }
	) as Promise<R>;

interface Trip {
	distance: number;
	prepared: boolean;
	jumpMs: number;
	longestFrameMs: number;
	settledMs: number;
	boostMedianMs: number;
	boostP95Ms: number;
}

/** One trip, watched: the jump, the longest frame after it, and the frames while the land refills. */
async function trip(page: Page, dx: number, dz: number, prepared: boolean): Promise<Trip> {
	return run(
		page,
		async (s, a) => {
			const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
			const p = s.controller.worldPosition;
			const to = { x: p.x + a.dx, z: p.z + a.dz };
			if (a.prepared) s.fastTravelLanding(to.x, to.z);
			await frame();
			let last = await frame();
			const outcome = await s.fastTravel(to.x, to.z);
			const start = performance.now();
			const frames: number[] = [];
			let settledMs = -1;
			while (performance.now() - start < 20_000) {
				const now = await frame();
				frames.push(now - last);
				last = now;
				if (
					s.terrainManager.getStats().queuedChunks === 0 &&
					s.treeManager.getStats().queuedChunks === 0
				) {
					settledMs = performance.now() - start;
					break;
				}
			}
			const sorted = frames.slice(1).sort((x, y) => x - y);
			const pick = (q: number) =>
				sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
			const round = (n: number) => Math.round(n * 10) / 10;
			return {
				distance: Math.round(Math.hypot(a.dx, a.dz)),
				prepared: a.prepared,
				jumpMs: round(outcome.ms),
				longestFrameMs: round(Math.max(...frames)),
				settledMs: Math.round(settledMs),
				boostMedianMs: round(pick(0.5)),
				boostP95Ms: round(pick(0.95))
			};
		},
		{ dx, dz, prepared }
	);
}

/** Frame times standing still, for comparison. */
async function idleFrames(page: Page) {
	return run(
		page,
		async () => {
			const frames: number[] = [];
			let last = await new Promise<number>((r) => requestAnimationFrame(r));
			for (let i = 0; i < 180; i++) {
				const now = await new Promise<number>((r) => requestAnimationFrame(r));
				frames.push(now - last);
				last = now;
			}
			frames.sort((a, b) => a - b);
			return {
				medianMs: Math.round(frames[90] * 10) / 10,
				p95Ms: Math.round(frames[Math.floor(frames.length * 0.95)] * 10) / 10
			};
		},
		undefined
	);
}

test('fast travel on a 4× slower CPU', async ({ page }) => {
	test.setTimeout(600_000);
	await page.addInitScript(() => localStorage.setItem('forest-drift.graphics.v1', 'medium'));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Travel bench', seed: 'forest' });
	await page.waitForTimeout(4000);
	const legs: [number, number, boolean][] = [
		[1000, 0, false],
		[0, 3000, false],
		[-5000, 0, false],
		[3500, 3500, false],
		[0, -5000, false],
		[-1000, 0, true],
		[0, -3000, true],
		[4000, 0, true],
		[-3500, -3500, true],
		[0, 5000, true]
	];
	const results: Record<string, { idle: unknown; trips: Trip[] }> = {};
	const cdp = await page.context().newCDPSession(page);
	for (const rate of [1, 4]) {
		await cdp.send('Emulation.setCPUThrottlingRate', { rate });
		await page.waitForTimeout(2000);
		const idle = await idleFrames(page);
		const trips: Trip[] = [];
		for (const [dx, dz, prepared] of legs) {
			trips.push(await trip(page, dx, dz, prepared));
			await page.waitForTimeout(500);
		}
		results[`cpu${rate}x`] = { idle, trips };
		console.log(`cpu ${rate}x`, JSON.stringify({ idle, trips }));
	}
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	for (const t of results.cpu4x.trips) expect(t.settledMs).toBeGreaterThan(0);
	if (process.env.TRAVEL_BENCH_OUT)
		await writeFile(process.env.TRAVEL_BENCH_OUT, JSON.stringify(results, null, 2));
});
