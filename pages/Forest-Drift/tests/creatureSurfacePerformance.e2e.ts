import { writeFile } from 'node:fs/promises';
import { test, type Page } from '@playwright/test';

/**
 * Biome-specific creatures Phase 2 GPU A/B (technical plan §14.1): creature coat micro-texture on
 * and off (`?creatureDetail=off`). Full-screen close-ups of each coat type (the worst case for a
 * per-pixel cost) and the Lab's 25-creature stress scene. Opt-in, needs a real GPU:
 *   CREATURE_BENCH=1 npx playwright test tests/creatureSurfacePerformance.e2e.ts --project=chromium
 * `CREATURE_BENCH_OUT=<file>` saves the numbers (default: the Phase 2 record's folder).
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
