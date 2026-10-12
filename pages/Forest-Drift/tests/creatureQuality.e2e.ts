import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { CreatureLab } from '../src/lib/game/creatures/CreatureLab';

/**
 * Procedural creature quality: anatomy validation across many species, attachment debug overlays,
 * animated poses, and CURRENT (pre-rewrite) vs IMPROVED rendering cost. Uses the standalone Lab
 * route (`/creatures/?dev`), so no world is created. On macOS headless Chromium would otherwise
 * render through SwiftShader, so the Metal ANGLE backend is requested (see docs/creature-system.md).
 */
if (process.platform === 'darwin') {
	test.use({
		launchOptions: {
			// Uncapped frame rate so FPS reflects GPU/CPU cost rather than the 60 Hz vsync ceiling.
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
type LabWindow = Window & { creatureLab: CreatureLab };
const PLANS = ['quadruped', 'biped', 'hexapod', 'serpentine'] as const;

test('improved creatures: 100 species per plan validate, overlays render, poses stay attached', async ({
	page
}) => {
	test.setTimeout(240_000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/creatures/?dev');
	await page.waitForFunction(() => (window as unknown as LabWindow).creatureLab?.creature);
	await expect(page.getByTestId('creature-developer')).toBeVisible();
	for (const plan of PLANS) {
		const report = await page.evaluate(
			(plan) => (window as unknown as LabWindow).creatureLab.sample(100, plan),
			plan
		);
		expect(report.successes, plan).toBe(100);
		expect(report.failures, plan).toBe(0);
		expect(report.anatomyIssues, plan).toEqual({});
		expect(report.averageTriangles[0], plan).toBeLessThan(5000);
		expect(report.averageTriangles[2], plan).toBeLessThan(1000);
	}
	for (const plan of PLANS) {
		await page.getByTestId('creature-plan').selectOption(plan);
		for (const toggle of ['limbRoots', 'attachmentVolumes'])
			await page.getByTestId(`creature-debug-${toggle}`).check();
		for (const [gait, time] of [
			['idle', 0.2],
			['walk', 0.45],
			['run', 0.8]
		] as const) {
			await page.evaluate(
				({ gait, time }) => {
					const lab = (window as unknown as LabWindow).creatureLab;
					lab.frameView([1, 0.25, 0.7], 1.6);
					lab.poseAt(time, gait);
				},
				{ gait, time }
			);
			await page
				.getByTestId('creature-viewport')
				.locator('canvas')
				.screenshot({ path: `test-results/creature-quality-${plan}-${gait}.png` });
		}
		expect(
			await page.evaluate(() => (window as unknown as LabWindow).creatureLab.telemetry.issues)
		).toBe(0);
		for (const toggle of ['limbRoots', 'attachmentVolumes'])
			await page.getByTestId(`creature-debug-${toggle}`).uncheck();
	}
	// SURFACE panel: pattern override, shader mask debug view, controlled random palette.
	await expect(page.getByTestId('creature-surface')).toBeVisible();
	await page.getByTestId('creature-surface-pattern').selectOption('spots');
	await page.getByTestId('creature-surface-debug').selectOption('primaryMask');
	await page.getByRole('button', { name: 'Randomise Palette', exact: true }).click();
	const surface = await page.evaluate(() => {
		const c = (window as unknown as LabWindow).creatureLab.creature!;
		return { type: c.compilation.surface?.primaryPattern.type, slot: c.surfaceSlot };
	});
	expect(surface.type).toBe('spots');
	expect(surface.slot).toBeGreaterThan(0);
	await page
		.getByTestId('creature-viewport')
		.locator('canvas')
		.screenshot({ path: 'test-results/creature-quality-surface-mask.png' });
	await page.getByRole('button', { name: 'Reset surface', exact: true }).click();
	// CURRENT (frozen pre-rewrite generator) remains available for side-by-side comparison.
	await page.getByTestId('creature-mode').selectOption('current');
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as LabWindow).creatureLab.creature!.compilation.fingerprint
			)
		)
		.toMatch(/^legacy-/);
	expect(errors).toEqual([]);
});

test('creature rendering cost: CURRENT vs IMPROVED, 1/10/25/50/100 creatures', async ({
	page
}, info) => {
	test.setTimeout(600_000);
	await page.goto('/creatures/?dev');
	await page.waitForFunction(() => (window as unknown as LabWindow).creatureLab?.creature);
	const renderer = await page.evaluate(() => {
		const gl = document.createElement('canvas').getContext('webgl2');
		const ext = gl?.getExtension('WEBGL_debug_renderer_info');
		return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
	});
	const runs: [mode: 'current' | 'improved', lod: 0 | 1 | 2][] = [
		['current', 0],
		['improved', 0],
		['improved', 1],
		['improved', 2]
	];
	const results: Awaited<ReturnType<CreatureLab['benchmark']>>[] = [];
	for (const count of [1, 10, 25, 50, 100])
		for (const [mode, lod] of runs) {
			const result = await page.evaluate(
				({ count, mode, lod }) =>
					(window as unknown as LabWindow).creatureLab.benchmark(count, mode, lod),
				{ count, mode, lod }
			);
			expect(result.fps).toBeGreaterThan(0);
			expect(result.drawCalls).toBeLessThanOrEqual(count + 2);
			results.push(result);
		}
	const byKey = (mode: string, lod: number, count: number) =>
		results.find((r) => r.mode === mode && r.lod === lod && r.count === count)!;
	// The rewrite must not multiply rendering cost: fewer triangles at equal draw calls.
	for (const count of [10, 50, 100])
		expect(byKey('improved', 0, count).triangles).toBeLessThan(
			byKey('current', 0, count).triangles
		);
	// Terrain conformation: previous flat-ground posing vs full grounding/IK on an uneven ramp.
	const terrain = { kind: 'uneven' as const, angle: 15, direction: 'uphill' as const };
	const grounding = [];
	for (const count of [1, 10, 25, 50, 100])
		for (const enabled of [false, true]) {
			const result = await page.evaluate(
				({ count, enabled, terrain }) =>
					(window as unknown as LabWindow).creatureLab.benchmark(count, 'improved', 0, {
						grounding: enabled,
						terrain
					}),
				{ count, enabled, terrain }
			);
			expect(result.fps).toBeGreaterThan(0);
			grounding.push(result);
		}
	// Procedural surface: plain vertex colours vs patterns in the shared shader.
	const surfaces = [];
	for (const count of [1, 10, 25, 50, 100])
		for (const surface of [false, true]) {
			const result = await page.evaluate(
				({ count, surface }) =>
					(window as unknown as LabWindow).creatureLab.benchmark(count, 'improved', 0, { surface }),
				{ count, surface }
			);
			// One draw per creature, and patterns never multiply shader programs.
			expect(result.drawCalls).toBeLessThanOrEqual(count + 2);
			expect(result.programs).toBeLessThanOrEqual(4);
			surfaces.push(result);
		}
	await writeFile(
		info.outputPath('creature-surface-performance.json'),
		JSON.stringify({ renderer, results: surfaces }, null, 2)
	);
	await writeFile(
		info.outputPath('creature-grounding-performance.json'),
		JSON.stringify({ renderer, results: grounding }, null, 2)
	);
	await writeFile(
		info.outputPath('creature-quality-performance.json'),
		JSON.stringify({ renderer, results }, null, 2)
	);
});
