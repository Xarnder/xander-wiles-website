import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld, openWorldNamed } from './worldHelpers';

/**
 * Biome minimap Phase 1: the corner minimap in the game. Toggle, zoom, size, the remembered
 * choice, biomes-off worlds, and what it costs the main thread on a flight.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scene = any;
async function sceneValue<R>(page: Page, read: (s: Scene) => R): Promise<R> {
	return page.evaluate(
		(source) =>
			new Function('s', `return (${source})(s)`)(
				(window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene
			),
		read.toString()
	) as Promise<R>;
}

/** Waits until the minimap has tiles to show (the worker has drawn some). */
async function mapDrawn(page: Page) {
	await expect
		.poll(() => sceneValue(page, (s) => s.biomeMap.tileClient?.cachedCount ?? 0), {
			timeout: 30_000
		})
		.toBeGreaterThan(0);
}

test('shows the biome map in a biome world; ; hides it, ’ and / zoom, and the choice is remembered', async ({
	page
}) => {
	test.setTimeout(180_000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Minimap', seed: 'minimap-e2e' });
	const map = page.getByTestId('biome-minimap');
	await expect(map).toBeVisible({ timeout: 15_000 });
	await mapDrawn(page);
	await expect(page.getByTestId('biome-minimap-name')).not.toBeEmpty({ timeout: 20_000 });
	await expect(page.getByTestId('biome-minimap-scale')).toHaveText('1 km');
	// The coordinates are the player's.
	const position = await sceneValue(page, (s) => ({
		x: Math.round(s.controller.worldPosition.x),
		z: Math.round(s.controller.worldPosition.z)
	}));
	const coords = (await page.getByTestId('biome-minimap-coordinates').textContent()) ?? '';
	const digits = (n: number) =>
		Math.abs(n)
			.toString()
			.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
	expect(coords).toContain(digits(position.x));
	expect(coords).toContain(digits(position.z));
	if (process.env.MINIMAP_SHOTS)
		await page.screenshot({ path: `${process.env.MINIMAP_SHOTS}/minimap-hud.png` });

	await page.keyboard.press('Quote');
	await expect(page.getByTestId('biome-minimap-scale')).toHaveText('500 m');
	await page.keyboard.press('Slash');
	await page.keyboard.press('Slash');
	await expect(page.getByTestId('biome-minimap-scale')).toHaveText('2 km');

	await page.keyboard.press('Semicolon');
	await expect(map).toBeHidden();
	// Off costs nothing: no worker, no canvas.
	expect(await sceneValue(page, (s) => s.biomeMap.workerRunning)).toBe(false);

	// Remembered across a reload.
	await page.reload();
	await openWorldNamed(page, 'Minimap');
	await page.waitForTimeout(1500);
	await expect(map).toBeHidden();
	await page.keyboard.press('Semicolon');
	await expect(map).toBeVisible();
	await expect(page.getByTestId('biome-minimap-scale')).toHaveText('2 km');
	expect(errors).toEqual([]);
});

test('follows the size setting, and shows a terrain map with a note when biomes are off', async ({
	page
}) => {
	test.setTimeout(180_000);
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Minimap size', seed: 'minimap-size' });
	const canvas = page.getByTestId('biome-minimap-canvas');
	await expect(canvas).toBeVisible({ timeout: 15_000 });
	expect((await canvas.boundingBox())?.width).toBeCloseTo(180, 0);
	await page.evaluate(() => {
		const s = (window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene;
		s.biomeMapPrefs.size = 'large';
		s.settingsHost.biomeMap.changed();
	});
	await expect.poll(async () => (await canvas.boundingBox())?.width).toBeCloseTo(240, 0);

	// A world without biomes: hidden until chosen (Q6), then a terrain map with a note (Q8).
	await page.evaluate(() =>
		(
			window as unknown as { __forestSession: { scene: Scene } }
		).__forestSession.scene.setBiomesEnabled(false)
	);
	await page.evaluate(() =>
		(window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene.emitStats()
	);
	await expect(page.getByTestId('biome-minimap')).toBeHidden();
	await page.keyboard.press('Semicolon');
	await expect(page.getByTestId('biome-minimap-name')).toHaveText('Biomes are off in this world');
	await mapDrawn(page);
});

test('costs the main thread almost nothing on a long flight', async ({ page }) => {
	test.setTimeout(240_000);
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Minimap flight', seed: 'minimap-flight' });
	await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	await mapDrawn(page);
	const result = await page.evaluate(async () => {
		const s = (window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene;
		s.controller.setFlying(true);
		const cost = s.biomeMap.cost;
		Object.assign(cost, { frames: 0, totalMs: 0, maxMs: 0, paints: 0 });
		const start = performance.now();
		const p = s.controller.worldPosition;
		const from = { x: p.x, y: p.y + 60, z: p.z };
		// 40 m/s to the north-east for 20 s.
		await new Promise<void>((resolve) => {
			const step = () => {
				const t = (performance.now() - start) / 1000;
				s.controller.restoreState(
					{ x: from.x + t * 28, y: from.y, z: from.z - t * 28 },
					Math.PI / 4,
					-0.2
				);
				if (t < 20) requestAnimationFrame(step);
				else resolve();
			};
			requestAnimationFrame(step);
		});
		return {
			frames: cost.frames,
			averageMs: cost.totalMs / Math.max(1, cost.frames),
			maxMs: cost.maxMs,
			paints: cost.paints,
			tiles: s.biomeMap.tileClient?.cachedCount ?? 0
		};
	});
	console.log('Minimap main-thread cost on a 20 s flight:', JSON.stringify(result));
	expect(result.frames).toBeGreaterThan(20);
	expect(result.averageMs).toBeLessThan(0.5);
});

test('the full map opens with `, pauses alone, reads out what you point at, pans, zooms and closes', async ({
	page
}) => {
	test.setTimeout(180_000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Full map', seed: 'minimap-e2e' });
	await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	await page.keyboard.press('Backquote');
	const map = page.getByTestId('biome-full-map');
	await expect(map).toBeVisible();
	expect(await sceneValue(page, (s) => s.simulationPaused)).toBe(true);
	// Opens one step further out than the minimap (1 km → 2 km), centred on you.
	await expect(page.getByTestId('biome-full-map-scale')).toHaveText('2 km across');
	await expect(page.getByTestId('biome-full-map-biome')).not.toHaveText('—', { timeout: 20_000 });
	await expect(page.getByTestId('biome-full-map-distance')).toHaveText('You are here');
	await expect
		.poll(() => sceneValue(page, (s) => s.biomeMap.tileClient?.cachedCount ?? 0), {
			timeout: 30_000
		})
		.toBeGreaterThan(4);
	if (process.env.MINIMAP_SHOTS)
		await page.screenshot({ path: `${process.env.MINIMAP_SHOTS}/full-map.png` });

	// Pointing somewhere else: its own biome, distance, direction and coordinates.
	const box = (await page.getByTestId('biome-full-map-canvas').boundingBox())!;
	await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2);
	await expect(page.getByTestId('biome-full-map-distance')).toContainText('east');
	const before = await page.getByTestId('biome-full-map-coordinates').textContent();
	// Dragging pans: the same screen point is now a different place.
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 120, { steps: 5 });
	await page.mouse.up();
	await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2);
	await expect(page.getByTestId('biome-full-map-coordinates')).not.toHaveText(before ?? '');

	await page.getByTestId('biome-full-map-zoom-out').click();
	await expect(page.getByTestId('biome-full-map-scale')).toHaveText('4 km across');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, -120);
	await expect(page.getByTestId('biome-full-map-scale')).toHaveText('2 km across');
	await page.keyboard.press('Minus');
	await expect(page.getByTestId('biome-full-map-scale')).toHaveText('4 km across');

	await page.keyboard.press('Escape');
	await expect(map).toBeHidden();
	expect(await sceneValue(page, (s) => s.simulationPaused)).toBe(false);
	await expect(page.getByTestId('pause-menu')).toBeHidden();

	// From the pause menu, and by clicking the minimap.
	await page.keyboard.press('Escape');
	await page.getByTestId('pause-map').click();
	await expect(map).toBeVisible();
	await page.getByTestId('biome-full-map-close').click();
	await expect(map).toBeHidden();
	await page.getByTestId('biome-minimap-open').click();
	await expect(map).toBeVisible();
	await page.keyboard.press('Backquote');
	await expect(map).toBeHidden();

	// With the minimap off, the full map still works and stops its worker when closed.
	await page.keyboard.press('Semicolon');
	await expect(page.getByTestId('biome-minimap')).toBeHidden();
	expect(await sceneValue(page, (s) => s.biomeMap.workerRunning)).toBe(false);
	await page.keyboard.press('Backquote');
	await expect(map).toBeVisible();
	expect(await sceneValue(page, (s) => s.biomeMap.workerRunning)).toBe(true);
	await page.keyboard.press('Escape');
	expect(await sceneValue(page, (s) => s.biomeMap.workerRunning)).toBe(false);
	expect(errors).toEqual([]);
});

test('the full map works by keyboard alone and describes itself to screen readers', async ({
	page,
	browserName
}) => {
	// Safari moves focus to buttons with Option+Tab (Tab alone skips them unless set otherwise).
	const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
	test.setTimeout(180_000);
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Keyboard map', seed: 'minimap-e2e' });
	await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	// The minimap is decorative; the biome card already announces where you are.
	await expect(page.locator('[data-testid="biome-minimap"] .frame')).toHaveAttribute(
		'aria-hidden',
		'true'
	);
	await page.keyboard.press('Backquote');
	const dialog = page.getByRole('dialog', { name: 'Biome map' });
	await expect(dialog).toBeVisible();
	await expect(dialog).toHaveAttribute('aria-modal', 'true');
	await expect(page.getByRole('application', { name: /Arrow keys pan/ })).toBeFocused();
	await expect(page.getByTestId('biome-full-map-distance')).toHaveText('You are here');
	// Arrow keys move the centre crosshair; the readout follows it.
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect(page.getByTestId('biome-full-map-distance')).toContainText('east');
	await expect(dialog.getByRole('status')).not.toBeEmpty({ timeout: 5000 });
	// Tab reaches the buttons; Enter presses them.
	await page.keyboard.press(tab);
	await expect(page.getByTestId('biome-full-map-zoom-in')).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('biome-full-map-scale')).toHaveText('1 km across');
	await page.keyboard.press(tab);
	await page.keyboard.press(tab);
	await expect(page.getByTestId('biome-full-map-centre')).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('biome-full-map-distance')).toHaveText('You are here');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
});
