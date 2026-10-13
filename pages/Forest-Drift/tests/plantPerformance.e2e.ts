import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Flower & ground-plant benchmark (see the README's "Flowers and ground plants" section): plants OFF
 * vs LOW / MEDIUM / HIGH / ULTRA in representative scenes — grass, trees, water, builds and
 * creatures all running — plus stress densities (≈1k → 100k loaded plants), a ground-level overdraw
 * view, and a long walk for memory. On macOS headless Chromium would otherwise use SwiftShader (a CPU rasteriser), so
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
					return (
						s.grassRenderStats().queuedChunks === 0 &&
						s.plantRenderStats().queuedChunks === 0 &&
						s.terrainManager.getStats().queuedChunks === 0
					);
				}),
			{ timeout: 30_000, intervals: [100] }
		)
		.toBe(true);
	return Date.now() - started;
}

async function setConfig(page: Page, config: Config): Promise<void> {
	await page.evaluate((config) => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		s.vegetationSettings.plants.enabled = config !== 'off';
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
		(ms) => (window as unknown as TestWindow).__forestSession.scene.measureVegetationFrames(ms),
		sampleMs
	);
}

const PLANT_DEFAULTS = {
	flowerDensity: 1,
	groundPlantDensity: 1,
	renderDistance: 52,
	lod0Distance: 11,
	densities: [1, 0.5, 0.2]
};

async function setPlants(
	page: Page,
	p: typeof PLANT_DEFAULTS & { maxVisible?: number }
): Promise<void> {
	await page.evaluate((p) => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const v = s.vegetationSettings.plants;
		v.flowerDensity = p.flowerDensity;
		v.groundPlantDensity = p.groundPlantDensity;
		v.renderDistance = p.renderDistance;
		v.lod0Distance = p.lod0Distance;
		v.lod1Distance = Math.max(p.lod0Distance + 4, 26);
		[v.lod0Density, v.lod1Density, v.lod2Density] = p.densities;
		s.plantManager.quality.maxVisibleInstances = p.maxVisible ?? 14000;
		s.plantManager.notifySettingsChanged();
	}, p);
	await page.waitForTimeout(400);
	await waitForStreaming(page);
	await page.waitForTimeout(800);
}

test('benchmarks procedural flowers and ground plants', async ({ page }) => {
	test.setTimeout(900_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Plant Bench', seed: 'remove-seed' });
	const renderer = await page.evaluate(() => {
		const gl = document.createElement('canvas').getContext('webgl2');
		const ext = gl?.getExtension('WEBGL_debug_renderer_info');
		return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
	});
	await page.evaluate(() => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		// Fixed resolution and fixed vegetation quality: compare configurations, not the adaptors.
		s.graphicsSettings.dynamicResolutionEnabled = false;
		s.setGrassAdaptive(false);
		s.setPlantAdaptive(false);
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
		{ id: 'A', label: 'Flower meadow (plains) + grass', spot: spots.plains },
		{ id: 'B', label: 'Rolling hills', spot: spots.hills },
		{ id: 'C', label: 'Forest floor + trees + grass', spot: spots.forest },
		{
			id: 'D',
			label: 'Mini Builds (60 furnished objects) + plants',
			spot: spots.plains,
			setup: async () => {
				await page.evaluate(() =>
					(window as unknown as TestWindow).__forestSession.scene.runMiniBuildBenchmark(
						'mixed',
						60,
						{ sampleMs: 200 }
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
			label: 'Rain + river + plants + grass',
			spot: spots.river,
			setup: () => setWeather(page, 'rain'),
			teardown: () => setWeather(page, 'clear')
		},
		{
			id: 'F',
			label: 'Creatures + thunderstorm + plants',
			spot: { ...spots.forest, x: spots.forest.x + 40 },
			setup: () => setWeather(page, 'thunderstorm'),
			teardown: () => setWeather(page, 'clear')
		}
	];

	// HIGH with plants off is measured on both sides of the plant configurations — right after
	// arriving, other systems are still settling, so the first sample alone would flatter plants.
	const configs: (Config | 'off-after')[] = ['off', 'low', 'medium', 'high', 'ultra', 'off-after'];
	const results: Record<string, unknown>[] = [];
	await mkdir('docs/plant-review', { recursive: true });
	for (const scene of scenes) {
		await goTo(page, scene.spot);
		await scene.setup?.();
		await page.waitForTimeout(3000);
		for (const config of configs) {
			await setConfig(page, config === 'off-after' ? 'off' : config);
			const report = await measure(page);
			const row = { scene: scene.id, label: scene.label, config, ...report };
			results.push(row);
			const p = report.plants;
			console.log(
				`[plant perf] ${scene.id} ${config}: ${report.fps} fps · cpu ${report.cpuFrameMs} ms · ` +
					`${p.nearInstances} near + ${p.cardInstances} cards · ${p.nearDrawCalls}+${p.cardDrawCalls} plant draws · ` +
					`${p.activeSpecies} species / ${p.prototypes} prototypes · ${report.drawCalls} total draws`
			);
			if (config === 'high' && 'ACE'.includes(scene.id))
				await page.screenshot({ path: `docs/plant-review/scene-${scene.id}-high.png` });
			if (config === 'off' && scene.id === 'A')
				await page.screenshot({ path: 'docs/plant-review/scene-A-off.png' });
		}
		await scene.teardown?.();
	}

	// Close-up review shot: looking down into the meadow.
	await goTo(page, spots.plains, -0.55);
	await setConfig(page, 'high');
	await page.screenshot({ path: 'docs/plant-review/meadow-closeup-high.png' });

	// Stress: ever more plants, then a ground-level horizontal view through them (worst overdraw).
	await goTo(page, spots.plains, -0.05);
	const stress: Record<string, unknown>[] = [];
	const levels = [
		{
			label: 'sparse (density 0.25)',
			...PLANT_DEFAULTS,
			flowerDensity: 0.25,
			groundPlantDensity: 0.25
		},
		{ label: 'default HIGH', ...PLANT_DEFAULTS },
		{ label: 'flat LOD density', ...PLANT_DEFAULTS, densities: [1, 1, 1] },
		{
			label: 'density ×3, 80 m, flat',
			...PLANT_DEFAULTS,
			flowerDensity: 3,
			groundPlantDensity: 3,
			renderDistance: 80,
			densities: [1, 1, 1]
		},
		{
			label: 'density ×3, 120 m, near 24 m',
			...PLANT_DEFAULTS,
			flowerDensity: 3,
			groundPlantDensity: 3,
			renderDistance: 120,
			lod0Distance: 24,
			densities: [1, 1, 1]
		}
	];
	for (const level of levels) {
		await setPlants(page, { ...level, maxVisible: 1e9 });
		const report = await measure(page);
		stress.push({ ...level, ...report });
		const p = report.plants;
		console.log(
			`[plant stress] ${level.label}: ${p.loadedPlants} loaded · ${p.nearInstances} near + ${p.cardInstances} cards · ` +
				`${report.fps} fps · cpu ${report.cpuFrameMs} ms · ${(p.bufferBytes / 1048576).toFixed(1)} MB`
		);
	}
	// Overdraw: eye 0.4 m above the ground, looking flat through the densest level.
	const overdraw = await page.evaluate((spot) => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const y = s.terrainManager.getHeightSampler().sample(spot.x, spot.z) + 0.4;
		s.controller.restoreState({ x: spot.x, y, z: spot.z }, spot.yaw, 0);
		return y;
	}, spots.plains);
	await page.waitForTimeout(800);
	const overdrawReport = { eyeY: overdraw, ...(await measure(page)) };
	console.log(`[plant overdraw] ${overdrawReport.fps} fps · cpu ${overdrawReport.cpuFrameMs} ms`);
	await page.screenshot({ path: 'docs/plant-review/overdraw-stress.png' });
	await setPlants(page, PLANT_DEFAULTS);

	// Travel: ~3 km of streaming; resident plant memory must stay flat.
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
		await page.waitForTimeout(150);
		const p = await page.evaluate(() =>
			(window as unknown as TestWindow).__forestSession.scene.plantRenderStats()
		);
		travel.push({
			metres: Math.round(Math.hypot(step * 150, step * 40)),
			activationMs,
			activeChunks: p.activeChunks,
			loadedPlants: p.loadedPlants,
			activeSpecies: p.activeSpecies,
			prototypes: p.prototypes,
			prototypeCompiles: p.prototypeCompiles,
			bufferBytes: p.bufferBytes,
			averageGenerationMs: p.averageGenerationMs,
			heapBytes: await heap()
		});
	}
	console.log(`[plant travel] ${JSON.stringify(travel.filter((_, i) => i % 5 === 0))}`);

	const maxBytes = Math.max(...travel.map((t) => (t as { bufferBytes: number }).bufferBytes));
	const first = travel[1] as { bufferBytes: number; activeChunks: number };
	expect(maxBytes).toBeLessThan(Math.max(first.bufferBytes, 2 * 1048576) * 2);
	for (const t of travel as { activeChunks: number; prototypes: number }[]) {
		expect(t.activeChunks).toBeLessThan(first.activeChunks * 1.5 + 2);
		expect(t.prototypes).toBeLessThanOrEqual(160);
	}
	for (const row of results as {
		config: string;
		plants: { nearDrawCalls: number; cardDrawCalls: number };
	}[])
		if (row.config !== 'off')
			expect(row.plants.nearDrawCalls + row.plants.cardDrawCalls).toBeLessThan(120);

	await writeFile(
		'docs/plant-performance.json',
		JSON.stringify(
			{
				renderer,
				date: new Date().toISOString(),
				results,
				stress,
				overdraw: overdrawReport,
				travel
			},
			null,
			'\t'
		)
	);
	expect(errors).toEqual([]);
});
