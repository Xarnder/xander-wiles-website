import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Grass benchmark (see the README's "Grass" section): grass OFF vs LOW / MEDIUM / HIGH / ULTRA in
 * representative scenes — never grass alone in an empty scene — plus stress densities and a long
 * walk for memory. On macOS headless Chromium would otherwise use SwiftShader (a CPU rasteriser), so
 * the Metal ANGLE backend is requested, with vsync and the frame-rate cap off so frame times show
 * real headroom rather than a flat 60.
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

type Quality = 'low' | 'medium' | 'high' | 'ultra';
type Config = 'off' | Quality;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyScene = any;
type TestWindow = Window & { __forestSession: { scene: AnyScene } };

interface Spot {
	x: number;
	z: number;
	yaw: number;
}

async function findSpot(page: Page, kind: 'plains' | 'hills' | 'forest' | 'river'): Promise<Spot> {
	return page.evaluate((kind) => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const hs = s.terrainManager.getHeightSampler();
		const veg = s.treeManager.getVegetationRegionSampler();
		const w = { plains: 0, hills: 0, highlands: 0, mountains: 0 };
		const depth = (x: number, z: number) => s.hydrology.waterColumnDepth(x, z);
		let best = { x: 0, z: 0, yaw: 0, score: -Infinity };
		for (let r = 60; r < 1500; r += 45) {
			for (let a = 0; a < 32; a++) {
				const angle = (a / 32) * Math.PI * 2;
				const x = Math.cos(angle) * r;
				const z = Math.sin(angle) * r;
				hs.sampleBiomeWeights(x, z, w);
				const forest = veg.getForestDensity(x, z);
				let water = 0;
				for (let k = -2; k <= 2; k++)
					water = Math.max(water, depth(x + k * 10, z), depth(x, z + k * 10));
				let score: number;
				let yaw = angle;
				if (kind === 'plains') score = w.plains - forest * 2 - (water > 0 ? 5 : 0);
				else if (kind === 'hills') score = w.hills - forest * 2 - (water > 0 ? 5 : 0);
				else if (kind === 'forest')
					score = forest - (water > 0 ? 5 : 0) + (w.plains + w.hills) * 0.2;
				else {
					// On dry ground, looking across water about 15 m away.
					score = -5;
					if (depth(x, z) <= 0)
						for (let b = 0; b < 8; b++) {
							const ba = (b / 8) * Math.PI * 2;
							if (depth(x + Math.sin(ba) * 15, z + Math.cos(ba) * 15) > 0.3) {
								score = 1 - forest;
								yaw = ba + Math.PI;
								break;
							}
						}
				}
				if (score > best.score) best = { x, z, yaw, score };
			}
			if (best.score > 0.95) break;
		}
		return { x: best.x, z: best.z, yaw: best.yaw };
	}, kind);
}

async function goTo(page: Page, spot: Spot, pitch = -0.1): Promise<void> {
	await page.evaluate(
		({ spot, pitch }) => {
			const s = (window as unknown as TestWindow).__forestSession.scene;
			const y = s.terrainManager.getHeightSampler().sample(spot.x, spot.z) + 1.7;
			s.controller.restoreState({ x: spot.x, y, z: spot.z }, spot.yaw, pitch);
		},
		{ spot, pitch }
	);
	await waitForStreaming(page);
}

async function waitForStreaming(page: Page): Promise<number> {
	const started = Date.now();
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const s = (window as unknown as TestWindow).__forestSession.scene;
					const g = s.grassRenderStats();
					return g.queuedChunks === 0 && s.terrainManager.getStats().queuedChunks === 0;
				}),
			{ timeout: 30_000, intervals: [100] }
		)
		.toBe(true);
	return Date.now() - started;
}

async function setConfig(page: Page, config: Config): Promise<void> {
	await page.evaluate((config) => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		s.vegetationSettings.grass.enabled = config !== 'off';
		s.graphicsPipeline.setQuality(config === 'off' ? 'high' : config);
	}, config);
	await page.waitForTimeout(400);
	await waitForStreaming(page);
	await page.waitForTimeout(600);
}

async function setWeather(page: Page, type: 'clear' | 'rain' | 'thunderstorm'): Promise<void> {
	await page.evaluate((type) => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		s.weather.debug.selection = type;
		s.weather.presetDebugValues();
		s.weather.applyDebugSelection();
	}, type);
	await page.waitForTimeout(2500);
}

async function measure(page: Page, sampleMs = 2500) {
	return page.evaluate(
		(ms) => (window as unknown as TestWindow).__forestSession.scene.measureGrassFrames(ms),
		sampleMs
	);
}

test('benchmarks procedural grass', async ({ page }) => {
	test.setTimeout(900_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Grass Bench', seed: 'remove-seed' });
	const renderer = await page.evaluate(() => {
		const gl = document.createElement('canvas').getContext('webgl2');
		const ext = gl?.getExtension('WEBGL_debug_renderer_info');
		return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
	});
	await page.evaluate(() => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		// Fixed resolution and fixed grass quality: compare configurations, not the adaptors.
		s.graphicsSettings.dynamicResolutionEnabled = false;
		s.setGrassAdaptive(false);
	});
	await setWeather(page, 'clear');

	const spots = {
		plains: await findSpot(page, 'plains'),
		hills: await findSpot(page, 'hills'),
		forest: await findSpot(page, 'forest'),
		river: await findSpot(page, 'river')
	};
	const scenes: {
		id: string;
		label: string;
		spot: Spot;
		setup?: () => Promise<void>;
		teardown?: () => Promise<void>;
	}[] = [
		{ id: 'A', label: 'Flat plains, dense grass', spot: spots.plains },
		{ id: 'B', label: 'Rolling hills', spot: spots.hills },
		{ id: 'C', label: 'Dense forest + grass', spot: spots.forest },
		{
			id: 'D',
			label: 'Mini Builds (60 furnished objects) + grass',
			spot: spots.plains,
			setup: async () => {
				await page.evaluate(() =>
					(window as unknown as TestWindow).__forestSession.scene.runMiniBuildBenchmark(
						'mixed',
						60,
						{
							sampleMs: 200
						}
					)
				);
			},
			teardown: async () => {
				await page.evaluate(() =>
					(window as unknown as TestWindow).__forestSession.scene.clearMiniBuildBenchmark()
				);
			}
		},
		{
			id: 'E',
			label: 'Rain + grass + trees + water',
			spot: spots.river,
			setup: () => setWeather(page, 'rain'),
			teardown: () => setWeather(page, 'clear')
		},
		{
			id: 'F',
			label: 'Creatures + grass + thunderstorm',
			spot: { ...spots.forest, x: spots.forest.x + 40 },
			setup: () => setWeather(page, 'thunderstorm'),
			teardown: () => setWeather(page, 'clear')
		}
	];

	const configs: Config[] = ['off', 'low', 'medium', 'high', 'ultra'];
	const results: Record<string, unknown>[] = [];
	await mkdir('docs/grass-review', { recursive: true });
	for (const scene of scenes) {
		await goTo(page, scene.spot);
		await scene.setup?.();
		for (const config of configs) {
			await setConfig(page, config);
			const report = await measure(page);
			const row = { scene: scene.id, label: scene.label, config, ...report };
			results.push(row);
			console.log(
				`[grass perf] ${scene.id} ${config}: ${report.fps} fps · cpu ${report.cpuFrameMs} ms · ` +
					`${report.grass.visibleInstances} tufts · ${report.grass.drawCalls} grass draws · ` +
					`${report.drawCalls} total draws`
			);
			if (config === 'high' && (scene.id === 'A' || scene.id === 'C' || scene.id === 'E'))
				await page.screenshot({ path: `docs/grass-review/scene-${scene.id}-high.png` });
			if (config === 'off' && scene.id === 'A')
				await page.screenshot({ path: 'docs/grass-review/scene-A-off.png' });
		}
		await scene.teardown?.();
	}

	// Stress: ever more visible tufts, looking horizontally through the meadow (worst overdraw).
	await goTo(page, spots.plains, -0.05);
	await setConfig(page, 'high');
	const stress: Record<string, unknown>[] = [];
	const levels = [
		{ label: 'default HIGH', spacing: 0.4, densities: [1, 0.5, 0.22], distance: 64 },
		{ label: 'flat LOD density', spacing: 0.4, densities: [1, 1, 1], distance: 64 },
		{ label: 'spacing 0.28', spacing: 0.28, densities: [1, 1, 1], distance: 64 },
		{ label: 'spacing 0.2, 90 m', spacing: 0.2, densities: [1, 1, 1], distance: 90 }
	];
	for (const level of levels) {
		await page.evaluate((level) => {
			const s = (window as unknown as TestWindow).__forestSession.scene;
			const g = s.vegetationSettings.grass;
			g.candidateSpacing = level.spacing;
			[g.lod0Density, g.lod1Density, g.lod2Density] = level.densities;
			g.renderDistance = level.distance;
			s.grassManager.quality.maxVisibleInstances = 1e9;
			s.grassManager.notifySettingsChanged();
		}, level);
		await page.waitForTimeout(400);
		await waitForStreaming(page);
		await page.waitForTimeout(800);
		const report = await measure(page);
		stress.push({ ...level, ...report });
		console.log(
			`[grass stress] ${level.label}: ${report.grass.visibleInstances} visible / ${report.grass.loadedInstances} loaded · ` +
				`${report.fps} fps · cpu ${report.cpuFrameMs} ms · ${(report.grass.bufferBytes / 1048576).toFixed(1)} MB`
		);
	}
	// Restore defaults.
	await page.evaluate(() => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const g = s.vegetationSettings.grass;
		g.candidateSpacing = 0.4;
		[g.lod0Density, g.lod1Density, g.lod2Density] = [1, 0.5, 0.22];
		g.renderDistance = 64;
		s.grassManager.quality.maxVisibleInstances = 60000;
		s.grassManager.notifySettingsChanged();
	});

	// Travel: ~3 km of streaming; resident grass memory must stay flat.
	const travel: Record<string, unknown>[] = [];
	const heap = () =>
		page.evaluate(
			() =>
				(performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
					?.usedJSHeapSize ?? 0
		);
	for (let step = 0; step <= 20; step++) {
		const spot = { x: spots.plains.x + step * 150, z: spots.plains.z + step * 40, yaw: 0 };
		await page.evaluate((spot) => {
			const s = (window as unknown as TestWindow).__forestSession.scene;
			const y = s.terrainManager.getHeightSampler().sample(spot.x, spot.z) + 1.7;
			s.controller.restoreState({ x: spot.x, y, z: spot.z }, spot.yaw, -0.1);
		}, spot);
		const activationMs = await waitForStreaming(page);
		const g = await page.evaluate(() =>
			(window as unknown as TestWindow).__forestSession.scene.grassRenderStats()
		);
		travel.push({
			metres: Math.round(Math.hypot(step * 150, step * 40)),
			activationMs,
			activeChunks: g.activeChunks,
			loadedInstances: g.loadedInstances,
			bufferBytes: g.bufferBytes,
			averageGenerationMs: g.averageGenerationMs,
			heapBytes: await heap()
		});
	}
	console.log(`[grass travel] ${JSON.stringify(travel.filter((_, i) => i % 5 === 0))}`);

	const first = travel[1] as { bufferBytes: number; activeChunks: number };
	const last = travel[travel.length - 1] as { bufferBytes: number; activeChunks: number };
	expect(last.bufferBytes).toBeLessThan(first.bufferBytes * 1.5);
	expect(last.activeChunks).toBeLessThan(first.activeChunks * 1.5);
	for (const row of results as { config: string; grass: { drawCalls: number } }[])
		if (row.config !== 'off') expect(row.grass.drawCalls).toBeLessThan(120);

	await writeFile(
		'docs/grass-performance.json',
		JSON.stringify(
			{ renderer, date: new Date().toISOString(), results, stress, travel },
			null,
			'\t'
		)
	);
	expect(errors).toEqual([]);
});
