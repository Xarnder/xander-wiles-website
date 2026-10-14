import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Fence / railing benchmark (see the README's "Fences and railings" section): per-barrier cost for
 * 10 / 50 / 100 m runs in a simple and a fancy style, then 20 / 50 / 100 paths at once compared
 * with none, in the same scene. Metal ANGLE with vsync and the frame cap off, as in the vegetation
 * benchmarks, so frame times show headroom rather than a flat 60.
 */
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestWindow = Window & { __forestSession: { scene: any } };

test('benchmarks fences and railings', async ({ page }) => {
	test.setTimeout(600_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Barrier Bench', seed: 'remove-seed' });
	await page.evaluate(() => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		s.graphicsSettings.dynamicResolutionEnabled = false;
		s.setGrassAdaptive?.(false);
		s.setPlantAdaptive?.(false);
		const y = s.terrainManager.getHeightSampler().sample(40, 30) + 1.7;
		s.controller.restoreState({ x: 40, y, z: 30 }, 0, -0.12);
	});
	await page.waitForTimeout(6000);

	// ---- per-barrier cost
	const single = await page.evaluate(() => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const hs = s.terrainManager.getHeightSampler();
		const manager = s.barrierManager;
		const rows = [];
		for (const preset of ['simple-wood-fence', 'fancy-newel'] as const) {
			for (const length of [10, 50, 100]) {
				const points = [];
				for (let x = 0; x <= length + 1e-6; x += 10)
					points.push({ x: 20 + x, y: hs.sample(20 + x, 40), z: 40 });
				const id = `bench-${preset}-${length}`;
				const started = performance.now();
				manager.add({
					id,
					type: 'fence',
					foundationId: null,
					points,
					closed: false,
					baseMode: 'follow-surface',
					style: s.barrierPresetStyle(preset)
				});
				const buildMs = performance.now() - started;
				const stats = manager.getStats();
				rows.push({
					preset,
					length,
					members: stats.members,
					posts: stats.posts,
					balusters: stats.balusters,
					rails: stats.rails,
					objects: stats.objects,
					meshes: stats.meshes,
					nearDrawCalls: stats.nearDrawCalls,
					vertices: stats.vertices,
					triangles: stats.triangles,
					trianglesByLod: stats.trianglesByLod,
					gpuBytes: stats.bytes,
					buildMs: +buildMs.toFixed(2)
				});
				manager.remove(id);
			}
		}
		return rows;
	});
	for (const row of single)
		console.log(
			`[barrier] ${row.preset} ${row.length} m: ${row.members} members → ${row.meshes} meshes, ` +
				`${row.nearDrawCalls} draw(s) near, ${row.triangles} tris LOD0, ${(row.gpuBytes / 1024).toFixed(0)} KB, ${row.buildMs} ms`
		);

	// ---- stress: many paths in view
	const measure = () =>
		page.evaluate(async () => {
			const s = (window as unknown as TestWindow).__forestSession.scene;
			await new Promise((r) => setTimeout(r, 800));
			const m = await s.measureFrames(2500);
			return { fps: m.fps, frameMs: m.avgFrameMs, cpuMs: m.cpuFrameMs, drawCalls: m.drawCalls };
		});
	const stress = [];
	const baseline = await measure();
	stress.push({
		paths: 0,
		...baseline,
		...(await page.evaluate(() =>
			(window as unknown as TestWindow).__forestSession.scene.barrierRenderStats()
		))
	});
	for (const count of [20, 50, 100]) {
		await page.evaluate((count) => {
			const s = (window as unknown as TestWindow).__forestSession.scene;
			const hs = s.terrainManager.getHeightSampler();
			const manager = s.barrierManager;
			for (const d of manager.getAll()) manager.remove(d.id);
			const presets = [
				'classic-interior',
				'simple-wood-fence',
				'garden-fence',
				'deck-railing',
				'fancy-newel'
			] as const;
			for (let i = 0; i < count; i++) {
				const cx = 10 + (i % 10) * 7;
				const cz = 5 - Math.floor(i / 10) * 6;
				const pts = [
					[cx, cz],
					[cx + 5, cz],
					[cx + 5, cz - 3]
				].map(([x, z]) => ({ x, y: hs.sample(x, z), z }));
				const preset = presets[i % presets.length];
				manager.add({
					id: `stress-${i}`,
					type: 'fence',
					foundationId: null,
					points: pts,
					closed: false,
					baseMode: 'follow-surface',
					style: s.barrierPresetStyle(preset)
				});
			}
		}, count);
		const frames = await measure();
		const stats = await page.evaluate(() =>
			(window as unknown as TestWindow).__forestSession.scene.barrierRenderStats()
		);
		stress.push({ paths: count, ...frames, ...stats });
		console.log(
			`[barrier stress] ${count} paths: ${stats.members} members, ${stats.objects} objects, ` +
				`${stats.meshes} meshes · ${frames.fps} fps · ${frames.frameMs} ms frame · ${frames.drawCalls} draws`
		);
	}
	const heap = await page.evaluate(
		() =>
			(performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ??
			0
	);

	const fancy100 = single.find((r) => r.preset === 'fancy-newel' && r.length === 100)!;
	expect(fancy100.meshes).toBeLessThanOrEqual(6);
	expect(fancy100.members).toBeGreaterThan(500);
	const worst = stress.at(-1) as { objects: number; members: number };
	expect(worst.objects).toBeLessThan(worst.members / 4);

	await mkdir('docs', { recursive: true });
	await writeFile(
		'docs/barrier-performance.json',
		JSON.stringify({ date: new Date().toISOString(), single, stress, heapBytes: heap }, null, '\t')
	);
	expect(errors).toEqual([]);
});
