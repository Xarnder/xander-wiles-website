import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Mini Build performance scenes (see docs/MiniBuild.md). On macOS, headless Chromium otherwise
 * renders through SwiftShader — a CPU rasteriser — which would measure the software renderer rather
 * than the Mini Build architecture, so the Metal ANGLE backend is requested there.
 */
if (process.platform === 'darwin') {
	test.use({
		launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }
	});
}

interface BenchScene {
	controller: {
		worldPosition: { x: number; y: number; z: number };
		restoreState(position: { x: number; y: number; z: number }, yaw: number, pitch: number): void;
	};
	runMiniBuildBenchmark(
		scenario: string,
		count: number,
		options?: { sampleMs?: number; naiveComparison?: boolean }
	): Promise<Record<string, unknown>>;
	clearMiniBuildBenchmark(): number;
}
type TestWindow = Window & { __forestSession: { scene: BenchScene } };

test('measures Mini Build performance scenes', async ({ page }, info) => {
	test.setTimeout(300_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Mini Build Bench', seed: 'bench-seed' });
	const renderer = await page.evaluate(() => {
		const gl = document.createElement('canvas').getContext('webgl2');
		const ext = gl?.getExtension('WEBGL_debug_renderer_info');
		return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
	});
	await page.evaluate(() => {
		const scene = (window as unknown as TestWindow).__forestSession.scene;
		const p = scene.controller.worldPosition;
		scene.controller.restoreState({ x: p.x, y: p.y + 6, z: p.z }, -Math.PI / 2, -0.35);
	});
	// Let terrain and trees finish streaming so the baseline is stable.
	await page.waitForTimeout(4000);

	const scenarios: [string, string, number, boolean][] = [
		['Baseline (no Mini Builds)', 'baseline', 0, false],
		['Small house (30 mixed defaults)', 'mixed', 30, false],
		['Furnished large house (150 mixed defaults)', 'mixed', 150, false],
		['Repetition stress (100 identical 16-block chairs)', 'repeated', 100, true],
		['Unique design stress (100 different 16-block designs)', 'unique', 100, false],
		['Dense area (4 chunks filled to 512)', 'dense', 128, false],
		['Simple props (1000 × 1–4 blocks)', 'simple', 1000, false],
		['Repeated 1000 chairs (36 chunks)', 'repeated', 1000, true]
	];
	const results: Record<string, unknown>[] = [];
	for (const [label, scenario, count, naiveComparison] of scenarios) {
		const report = await page.evaluate(
			([s, n, naive]) =>
				(window as unknown as TestWindow).__forestSession.scene.runMiniBuildBenchmark(s, n, {
					sampleMs: 3000,
					naiveComparison: naive
				}),
			[scenario, count, naiveComparison] as const
		);
		results.push({ label, renderer, ...report });
		console.log(`[mini-build perf] ${label}: ${JSON.stringify(report)}`);
		if (scenario === 'repeated') {
			expect(report.compiles).toBe(1);
			// One batch (≤3 material meshes) per chunk — never a mesh per object or per cuboid.
			expect(Number(report.miniBuildInstancedMeshes)).toBeLessThanOrEqual(
				Number(report.chunksUsed) * 3
			);
		}
		if (scenario === 'unique') expect(report.compiles).toBe(count);
		expect(report.placed).toBe(count);
		await page.evaluate(() =>
			(window as unknown as TestWindow).__forestSession.scene.clearMiniBuildBenchmark()
		);
	}
	await writeFile(info.outputPath('mini-build-performance.json'), JSON.stringify(results, null, 2));
	expect(pageErrors).toEqual([]);
});
