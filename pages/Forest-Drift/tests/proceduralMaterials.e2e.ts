import { expect, test, type Page } from '@playwright/test';

/**
 * Procedural materials in the real game and the material dev tools. Screenshots are attached to the
 * report for manual inspection; the automated assertions are deliberately NOT pixel-exact (GPU
 * drivers differ) — they check that materials load without errors and that surfaces carry real
 * texture detail compared with the original flat look from the same fixed camera.
 */
if (process.platform === 'darwin') {
	// SwiftShader (headless default) would make each world take minutes; see miniBuildPerformance.
	test.use({
		launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }
	});
}
test.use({ viewport: { width: 1280, height: 720 } });

interface FrozenController {
	camera: {
		rotation: { set(x: number, y: number, z: number, order: string): void };
		position: { copy(value: unknown): void };
	};
	pitch: number;
	yaw: number;
	worldPosition: unknown;
	restoreState(position: { x: number; y: number; z: number }, yaw: number, pitch: number): void;
	update(): void;
}

interface SceneHandle {
	whenMaterialsReady(): Promise<void>;
	getMaterialStats(): { textureSets: number; bindings: number; mappedGeometries: number };
	controller: FrozenController;
}
type GameWindow = Window & { __forestSession: { scene: SceneHandle } };

/** The Main World's saved spawn view — the building, retaining wall, courtyard and grass. */
const WIDE_POSE = { position: { x: 45, y: 3.9, z: 1.6 }, yaw: -24.4288, pitch: 0.0704 };

function collectProblems(page: Page): string[] {
	const problems: string[] = [];
	page.on('pageerror', (error) => problems.push(error.message));
	page.on('console', (message) => {
		const text = message.text();
		if (/Shader Error|WebGLProgram|THREE\.WebGL/.test(text) && message.type() === 'error') {
			problems.push(text);
		}
	});
	return problems;
}

async function openMainWorld(page: Page, query = ''): Promise<void> {
	await page.goto(`/${query}`);
	await page.getByTestId('play-default-world').click();
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible({
		timeout: 30_000
	});
	await page.addStyleTag({
		content:
			'body * { visibility: hidden !important; } [data-testid="canvas-container"], [data-testid="canvas-container"] canvas { visibility: visible !important; }'
	});
	await page.evaluate((pose) => {
		const scene = (window as unknown as GameWindow).__forestSession.scene;
		const controller = scene.controller;
		controller.restoreState(pose.position, pose.yaw, pose.pitch);
		// Freeze the camera at the pose (no gravity, ground snapping or walk bob).
		controller.update = function (this: FrozenController) {
			this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
			this.camera.position.copy(this.worldPosition);
		};
	}, WIDE_POSE);
	await page.waitForTimeout(3000);
	await page.evaluate(() =>
		(window as unknown as GameWindow).__forestSession.scene.whenMaterialsReady()
	);
	await page.waitForTimeout(1000);
}

/**
 * Mean absolute luminance difference between horizontally adjacent pixels inside a region — a
 * simple "fine detail energy" measure. Flat-shaded polygons score near zero inside a face.
 */
async function detailEnergy(
	page: Page,
	region: { x: number; y: number; width: number; height: number }
) {
	const png = await page.screenshot({ clip: region });
	return page.evaluate(async (base64) => {
		const image = new Image();
		image.src = `data:image/png;base64,${base64}`;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		const context = canvas.getContext('2d') as CanvasRenderingContext2D;
		context.drawImage(image, 0, 0);
		const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
		let sum = 0;
		let count = 0;
		for (let y = 0; y < height; y++) {
			for (let x = 1; x < width; x++) {
				const i = (y * width + x) * 4;
				const a = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
				const b = data[i - 4] * 0.299 + data[i - 3] * 0.587 + data[i - 2] * 0.114;
				sum += Math.abs(a - b);
				count++;
			}
		}
		return sum / count;
	}, png.toString('base64'));
}

// Inside the courtyard paving and the foreground grass in the wide view.
const PAVING_REGION = { x: 1080, y: 470, width: 160, height: 45 };
const GRASS_REGION = { x: 100, y: 600, width: 600, height: 100 };

test('Main World renders procedural materials with real surface detail and no errors', async ({
	page
}, info) => {
	test.setTimeout(300_000);
	const problems = collectProblems(page);

	await openMainWorld(page, '?materials=flat&lighting=classic');
	await info.attach('main-world-flat.png', {
		body: await page.screenshot(),
		contentType: 'image/png'
	});
	const flatPaving = await detailEnergy(page, PAVING_REGION);
	const flatGrass = await detailEnergy(page, GRASS_REGION);

	await openMainWorld(page);
	await info.attach('main-world-procedural.png', {
		body: await page.screenshot(),
		contentType: 'image/png'
	});
	const stats = await page.evaluate(() =>
		(window as unknown as GameWindow).__forestSession.scene.getMaterialStats()
	);
	expect(stats.bindings).toBeGreaterThan(5);
	expect(stats.textureSets).toBeGreaterThan(5);
	expect(stats.mappedGeometries).toBeGreaterThan(10);
	expect(await detailEnergy(page, PAVING_REGION)).toBeGreaterThan(flatPaving * 1.3 + 0.5);
	expect(await detailEnergy(page, GRASS_REGION)).toBeGreaterThan(flatGrass * 1.3 + 0.5);

	await openMainWorld(page, '?tiling=legacy');
	await info.attach('main-world-tiled-textures.png', {
		body: await page.screenshot(),
		contentType: 'image/png'
	});

	expect(problems).toEqual([]);
});

test('anti-tiling test scene compares tiled and world-scale surfaces', async ({ page }, info) => {
	test.setTimeout(240_000);
	const problems = collectProblems(page);
	for (const tiling of ['legacy', 'new']) {
		for (const view of ['wall-close', 'courtyard-close', 'field-wide']) {
			await page.goto(`/materials/anti-tiling/?dev&quality=medium&tiling=${tiling}&view=${view}`);
			const root = page.getByTestId('anti-tiling-test');
			await expect(root).toHaveAttribute('data-ready', 'true', { timeout: 120_000 });
			await info.attach(`${tiling}-${view}.png`, {
				body: await page.screenshot(),
				contentType: 'image/png'
			});
		}
	}
	await expect(page.getByTestId('anti-tiling-toggle')).toHaveText('New: world-scale');
	expect(problems).toEqual([]);
});

test('material gallery generates every material', async ({ page }) => {
	test.setTimeout(180_000);
	const problems = collectProblems(page);
	await page.goto('/materials/?dev');
	await expect(page.getByTestId('material-gallery')).toBeVisible();
	await expect(page.getByTestId('gallery-status')).toContainText('ms', { timeout: 60_000 });
	await page.getByTestId('gallery-type').selectOption('slate');
	await expect(page.getByTestId('gallery-status')).toContainText('ms', { timeout: 60_000 });
	await page.getByTestId('gallery-new-seed').click();
	await expect(page.getByTestId('gallery-status')).toContainText('ms', { timeout: 60_000 });
	await expect(page.locator('.swatches button')).toHaveCount(24, { timeout: 120_000 });
	expect(problems).toEqual([]);
});
