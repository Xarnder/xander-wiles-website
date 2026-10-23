import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Tree LOD benchmark and review shots (see the README's "Stylised trees" section): close-ups of
 * each species, a ground-level forest view, a forest edge across a clearing and an elevated far
 * view, at HIGH and ULTRA on a Retina-sized canvas (where the user plays and the GPU is the
 * limit). Frame times are uncapped (vsync and the frame-rate limit off) so they show headroom
 * against the 60 FPS target. `TREE_SHOTS=<dir>` saves screenshots; `TREE_BENCH_OUT=<file>` the
 * numbers (default `docs/tree-lod-performance.json`); `TREE_BENCH_LABEL` tags the run.
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
test.use({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyScene = any;
type TestWindow = Window & { __forestSession: { scene: AnyScene } };

interface View {
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
}

async function waitForStreaming(page: Page): Promise<void> {
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const s = (window as unknown as TestWindow).__forestSession.scene;
					return (
						s.treeManager.getStats().queuedChunks === 0 &&
						s.grassRenderStats().queuedChunks === 0 &&
						s.plantRenderStats().queuedChunks === 0 &&
						s.terrainManager.getStats().queuedChunks === 0
					);
				}),
			{ timeout: 60_000, intervals: [150] }
		)
		.toBe(true);
}

/** The densest forest spot near spawn, on dry ground. */
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

async function place(page: Page, view: View): Promise<void> {
	await page.evaluate((v) => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		// Flying holds the elevated view in place; walking views stand on the ground.
		s.controller.setFlying(v.y - s.terrainManager.getHeightSampler().sample(v.x, v.z) > 3);
		s.controller.restoreState({ x: v.x, y: v.y, z: v.z }, v.yaw, v.pitch);
	}, view);
	await waitForStreaming(page);
	await page.waitForTimeout(700);
}

/**
 * A camera `distance` m from the loaded tree of `species` nearest `near`, looking at its middle,
 * from the side with the fewest trees in between (so the shot shows that tree).
 */
async function viewOfTree(
	page: Page,
	species: string,
	near: { x: number; z: number },
	distance: number
): Promise<View | null> {
	return page.evaluate(
		({ species, near, distance }) => {
			const s = (window as unknown as TestWindow).__forestSession.scene;
			const ids = [
				'oak',
				'pine',
				'cypress',
				'ornamental',
				'spruce',
				'birch',
				'scotsPine',
				'willow'
			];
			const trees: { x: number; y: number; z: number; scale: number; species: string }[] = [];
			for (const record of s.treeManager.active.values()) {
				const c = record.trees;
				if (!c) continue;
				for (let i = 0; i < c.count; i++)
					trees.push({
						x: c.matrices[i * 16 + 12],
						y: c.matrices[i * 16 + 13],
						z: c.matrices[i * 16 + 14],
						scale: Math.hypot(
							c.matrices[i * 16 + 4],
							c.matrices[i * 16 + 5],
							c.matrices[i * 16 + 6]
						),
						species: ids[c.speciesIndex[i]]
					});
			}
			const candidates = trees
				.filter((t) => t.species === species)
				.sort(
					(a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z)
				);
			const target = candidates[0];
			if (!target) return null;
			const mid =
				(
					{ pine: 5.5, cypress: 5.5, spruce: 9, birch: 7, scotsPine: 12, willow: 3.5 } as Record<
						string,
						number
					>
				)[species] ?? 3.6;
			let best: { yaw: number; blockers: number } = { yaw: 0, blockers: Infinity };
			for (let k = 0; k < 16; k++) {
				const yaw = (k / 16) * Math.PI * 2;
				const ex = target.x + Math.sin(yaw) * distance;
				const ez = target.z + Math.cos(yaw) * distance;
				let blockers = 0;
				for (const t of trees) {
					if (t === target) continue;
					// Distance from the tree to the eye→target segment.
					const dx = target.x - ex,
						dz = target.z - ez;
					const len = Math.hypot(dx, dz);
					const u = ((t.x - ex) * dx + (t.z - ez) * dz) / (len * len);
					if (u < 0 || u > 1) continue;
					const d = Math.hypot(ex + dx * u - t.x, ez + dz * u - t.z);
					if (d < 3.5) blockers += 1;
				}
				if (blockers < best.blockers) best = { yaw, blockers };
			}
			const ex = target.x + Math.sin(best.yaw) * distance;
			const ez = target.z + Math.cos(best.yaw) * distance;
			const ground = s.terrainManager.getHeightSampler().sample(ex, ez);
			const eyeY = Math.max(ground + 1.7, target.y + 1.7);
			const dy = target.y + mid * target.scale - eyeY;
			return {
				x: ex,
				y: eyeY,
				z: ez,
				yaw: best.yaw,
				pitch: Math.atan2(dy, distance)
			};
		},
		{ species, near, distance }
	);
}

async function measure(page: Page, sampleMs = 2500) {
	return page.evaluate(async (ms) => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const frames = await s.measureFrames(ms);
		const trees = s.treeRenderStats();
		return {
			fps: frames.fps,
			avgFrameMs: frames.avgFrameMs,
			p95FrameMs: frames.p95FrameMs,
			drawCalls: frames.drawCalls,
			triangles: frames.triangles,
			visibleTreesByLod: trees.visibleTreesByLod,
			visibleBatches: trees.visibleBatches,
			visibleCardBatches: trees.visibleCardBatches,
			prototypeTriangles: trees.prototypeTriangles,
			treeMemoryMB: Math.round((trees.memoryBytes / 1048576) * 100) / 100
		};
	}, sampleMs);
}

test('tree LOD review shots and benchmark', async ({ page }) => {
	test.setTimeout(900_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Tree Bench', seed: 'remove-seed' });
	await page.evaluate(() => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		s.graphicsSettings.dynamicResolutionEnabled = false;
		s.setGrassAdaptive(false);
		s.setPlantAdaptive(false);
		s.weather.debug.selection = 'clear';
		s.weather.presetDebugValues();
		s.weather.applyDebugSelection();
		// Midday, so shots compare shape and shading rather than the time of day.
		s.skySettings.dayCycle.enabled = false;
		s.skySettings.dayCycle.timeOfDay = 0.52;
		s.applySkySettings();
	});
	// Shots show the world only: the HUD and the click-to-play card would cover the trees.
	await page.addStyleTag({
		content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }'
	});
	const shots = process.env.TREE_SHOTS;
	if (shots) await mkdir(shots, { recursive: true });
	const label = process.env.TREE_BENCH_LABEL ?? 'run';
	const forest = await findForest(page);
	const ground = (x: number, z: number) =>
		page.evaluate(
			({ x, z }) =>
				(window as unknown as TestWindow).__forestSession.scene.terrainManager
					.getHeightSampler()
					.sample(x, z),
			{ x, z }
		);

	const results: Record<string, unknown>[] = [];
	for (const quality of ['high', 'ultra'] as const) {
		await page.evaluate((q) => {
			(window as unknown as TestWindow).__forestSession.scene.graphicsPipeline.setQuality(q);
		}, quality);
		await place(page, {
			x: forest.x,
			y: (await ground(forest.x, forest.z)) + 1.7,
			z: forest.z,
			yaw: 0,
			pitch: 0
		});

		const views: { id: string; view: View | null }[] = [];
		for (const species of ['oak', 'pine', 'cypress', 'ornamental', 'birch', 'willow'])
			views.push({ id: `${species}-near`, view: await viewOfTree(page, species, forest, 11) });
		// Tall trees need more room to fit in the frame.
		views.push({ id: 'spruce-near', view: await viewOfTree(page, 'spruce', forest, 18) });
		views.push({ id: 'scotsPine-near', view: await viewOfTree(page, 'scotsPine', forest, 20) });
		views.push({ id: 'oak-mid', view: await viewOfTree(page, 'oak', forest, 32) });
		views.push({ id: 'pine-mid', view: await viewOfTree(page, 'pine', forest, 38) });
		const fy = await ground(forest.x, forest.z);
		views.push({
			id: 'forest-ground',
			view: { x: forest.x, y: fy + 1.7, z: forest.z, yaw: 0.6, pitch: 0.02 }
		});
		views.push({
			id: 'forest-far',
			view: {
				x: forest.x - 120,
				y: fy + 45,
				z: forest.z - 120,
				yaw: Math.PI + Math.PI / 4,
				pitch: -0.18
			}
		});

		for (const { id, view } of views) {
			if (!view) continue;
			await place(page, view);
			const numbers = await measure(page);
			results.push({ label, quality, scene: id, ...numbers });
			if (shots) await page.screenshot({ path: `${shots}/${label}-${quality}-${id}.png` });
		}
		// What the trees cost in the ground-level forest view: without foliage cards, without tree
		// shadows, without trees (each on top of the previous).
		const groundView = views.find((v) => v.id === 'forest-ground')?.view;
		if (groundView) {
			await place(page, groundView);
			for (const variant of ['no-cards', 'no-tree-shadows', 'no-trees'] as const) {
				await page.evaluate((variant) => {
					const s = (window as unknown as TestWindow).__forestSession.scene;
					if (variant === 'no-cards') {
						s.vegetationSettings.rendering.foliageCards = false;
						s.treeManager.notifyRenderingChanged();
					} else if (variant === 'no-tree-shadows') {
						s.vegetationSettings.rendering.castShadows = false;
						s.treeManager.notifyRenderingChanged();
					} else s.treeManager.group.visible = false;
				}, variant);
				await page.waitForTimeout(500);
				results.push({
					label,
					quality,
					scene: `forest-ground ${variant}`,
					...(await measure(page))
				});
			}
			await page.evaluate(() => {
				const s = (window as unknown as TestWindow).__forestSession.scene;
				s.vegetationSettings.rendering.foliageCards = true;
				s.vegetationSettings.rendering.castShadows = true;
				s.treeManager.notifyRenderingChanged();
				s.treeManager.group.visible = true;
			});
		}
	}
	const out = process.env.TREE_BENCH_OUT ?? 'docs/tree-lod-performance.json';
	await writeFile(out, JSON.stringify({ label, errors, results }, null, 2));
	console.table(
		results.map((r) => ({
			q: r.quality,
			scene: r.scene,
			fps: r.fps,
			ms: r.avgFrameMs,
			p95: r.p95FrameMs,
			tris: r.triangles,
			draws: r.drawCalls,
			lod: JSON.stringify(r.visibleTreesByLod)
		}))
	);
	expect(errors.filter((e) => !/hdri|sky\.hdr/i.test(e))).toEqual([]);
});
