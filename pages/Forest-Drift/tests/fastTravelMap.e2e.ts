import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Fast travel Phase 1: travelling from the full map (plan §7, Q6, Q8). Click to pin, the pin's
 * readout, Travel here, Go back on the map and in the pause menu, the keyboard (Enter pins, T
 * travels, Esc clears the pin first), touch, and the disabled label. Runs in Chromium, WebKit and
 * Firefox (`webkit-map`, `firefox-map`); screenshots to $FAST_TRAVEL_SHOTS.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scene = any;
async function sceneValue<R, A = undefined>(
	page: Page,
	read: (s: Scene, arg: A) => R,
	arg?: A
): Promise<Awaited<R>> {
	return page.evaluate(
		({ source, arg }) =>
			new Function('s', 'arg', `return (${source})(s, arg)`)(
				(window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene,
				arg
			),
		{ source: read.toString(), arg }
	) as Promise<Awaited<R>>;
}

const me = (page: Page) =>
	sceneValue(page, (s) => ({ x: s.controller.worldPosition.x, z: s.controller.worldPosition.z }));

/** The readout's coordinates ("x 1 234 · z −567") as numbers. */
async function readoutPoint(page: Page) {
	const text = (await page.getByTestId('biome-full-map-coordinates').textContent()) ?? '';
	const [x, z] = text
		.split('·')
		.map((part) => Number(part.replace(/[xz\s\u202f\u00a0]/g, '').replace('\u2212', '-')));
	return { x, z };
}

const shots = process.env.FAST_TRAVEL_SHOTS;

async function openMap(page: Page) {
	await page.keyboard.press('Backquote');
	await expect(page.getByTestId('biome-full-map')).toBeVisible();
	await expect(page.getByTestId('biome-full-map-biome')).not.toHaveText('—', { timeout: 20_000 });
}

test('click to pin, Travel here, then Go back from the pause menu and the map', async ({
	page
}) => {
	test.setTimeout(180_000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Travel map', seed: 'minimap-e2e' });
	await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	const start = await me(page);

	await openMap(page);
	const map = page.getByTestId('biome-full-map');
	// Before a trip: no Go back, and the hint says how to pin.
	await expect(page.getByTestId('biome-full-map-go-back')).toBeHidden();
	await expect(map).toContainText('Click to pin');
	await page.getByTestId('biome-full-map-zoom-out').click();
	await expect(page.getByTestId('biome-full-map-scale')).toHaveText('4 km across');
	await expect
		.poll(() => sceneValue(page, (s) => s.biomeMap.tileClient?.cachedCount ?? 0), {
			timeout: 30_000
		})
		.toBeGreaterThan(4);

	// A click (no drag) drops a pin 300 px east: the readout describes it and offers Travel here.
	const box = (await page.getByTestId('biome-full-map-canvas').boundingBox())!;
	await page.mouse.click(box.x + box.width / 2 + 300, box.y + box.height / 2 - 40);
	const travel = page.getByTestId('biome-full-map-travel');
	await expect(travel).toHaveText('Travel here');
	await expect(page.getByTestId('biome-full-map-distance')).toContainText('east');
	await expect(map.getByRole('status')).toContainText('Pinned:');
	// Moving the mouse away doesn't change what the readout describes.
	const pinned = await readoutPoint(page);
	await page.mouse.move(box.x + 40, box.y + box.height - 120);
	await page.waitForTimeout(150);
	expect(await readoutPoint(page)).toEqual(pinned);
	if (shots) await page.screenshot({ path: `${shots}/map-pin.jpg`, quality: 80 });

	// Esc clears the pin first; the map stays open.
	await page.keyboard.press('Escape');
	await expect(travel).toBeHidden();
	await expect(map).toBeVisible();

	// The disabled label: mid-trip, the button says so and can't be pressed.
	await page.mouse.click(box.x + box.width / 2 + 300, box.y + box.height / 2 - 40);
	await sceneValue(page, (s) => (s.travelling = true));
	await expect(travel).toHaveText('Travelling…');
	await expect(travel).toBeDisabled();
	await sceneValue(page, (s) => (s.travelling = false));
	await expect(travel).toHaveText('Travel here');

	const target = await readoutPoint(page);
	await travel.click();
	await expect(map).toBeHidden();
	expect(await sceneValue(page, (s) => s.simulationPaused)).toBe(false);
	const arrived = await me(page);
	// Lands on the pin (to the metre the readout rounds to), unless it had to move ashore.
	expect(Math.hypot(arrived.x - target.x, arrived.z - target.z)).toBeLessThan(2);
	expect(Math.hypot(arrived.x - start.x, arrived.z - start.z)).toBeGreaterThan(500);
	await expect(page.getByTestId('biome-minimap')).toBeVisible();

	// Go back from the pause menu: exactly where the trip started.
	await page.keyboard.press('Escape');
	await page.getByTestId('pause-go-back').click();
	await expect(page.getByTestId('pause-menu')).toBeHidden();
	const back = await me(page);
	expect(Math.hypot(back.x - start.x, back.z - start.z)).toBeLessThan(0.01);

	// Go back from the map returns to where that trip started (the landing).
	await openMap(page);
	await page.getByTestId('biome-full-map-go-back').click();
	await expect(map).toBeHidden();
	const again = await me(page);
	expect(Math.hypot(again.x - arrived.x, again.z - arrived.z)).toBeLessThan(0.01);
	expect(errors).toEqual([]);
});

test('a pin in a lake says it lands on the shore, and does', async ({ page }) => {
	test.setTimeout(180_000);
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Travel lake', seed: 'forest' });
	await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	// Find a deep lake (visiting a few spots builds their water), then stand 150 m east of it.
	const lake = await sceneValue(page, async (s) => {
		for (const [x, z] of [
			[0, 0],
			[3000, 0],
			[0, 3000],
			[-3000, 0],
			[0, -3000]
		])
			await s.fastTravel(x, z);
		const lakes = [...s.hydrology.getLakes()]
			.filter(
				(l: { x: number; z: number; baseRadius: number }) =>
					l.baseRadius > 60 && s.hydrology.waterColumnDepth(l.x, l.z) > 2
			)
			.sort((a: { baseRadius: number }, b: { baseRadius: number }) => b.baseRadius - a.baseRadius);
		const found = lakes[0];
		if (!found) return null;
		await s.fastTravel(found.x + found.baseRadius + 150, found.z);
		return { x: found.x, z: found.z };
	});
	test.skip(!lake, 'no deep lake in this world');
	await openMap(page);
	// Pin the lake's middle: west of you by the gap, at the map's scale.
	const here = await me(page);
	const box = (await page.getByTestId('biome-full-map-canvas').boundingBox())!;
	const metresPerPx = 2000 / Math.min(box.width, box.height);
	await page.mouse.click(
		box.x + box.width / 2 + (lake!.x - here.x) / metresPerPx,
		box.y + box.height / 2 + (lake!.z - here.z) / metresPerPx
	);
	await expect(page.getByTestId('biome-full-map-note')).toHaveText('Lands on the shore');
	if (shots) {
		// Rivers and lakes arrive after the land.
		await page.waitForTimeout(4000);
		await page.screenshot({ path: `${shots}/map-lake-pin.jpg`, quality: 80 });
	}
	await page.getByTestId('biome-full-map-travel').click();
	await expect(page.getByTestId('biome-full-map')).toBeHidden();
	const depth = await sceneValue(page, (s) =>
		s.hydrology.waterColumnDepth(s.controller.worldPosition.x, s.controller.worldPosition.z)
	);
	expect(depth).toBeLessThanOrEqual(0.5);
});

test('by keyboard: Enter pins the crosshair, T travels, Esc clears the pin before closing', async ({
	page
}) => {
	test.setTimeout(180_000);
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Travel keys', seed: 'minimap-e2e' });
	await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	const start = await me(page);
	await openMap(page);
	await expect(
		page.getByRole('application', { name: /Enter pins the centre, T travels/ })
	).toBeFocused();
	for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('biome-full-map-travel')).toBeVisible();
	await expect(page.getByTestId('biome-full-map-distance')).toContainText('south');
	await expect(page.getByRole('dialog', { name: 'Biome map' }).getByRole('status')).toContainText(
		'Pinned:'
	);
	// Esc: first the pin, then the map.
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('biome-full-map-travel')).toBeHidden();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('biome-full-map')).toBeHidden();

	await openMap(page);
	for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	// The readout catches up on the next frame: wait for the pin's own announcement.
	await expect(page.getByRole('dialog', { name: 'Biome map' }).getByRole('status')).toContainText(
		'Pinned:'
	);
	const target = await readoutPoint(page);
	await page.keyboard.press('t');
	await expect(page.getByTestId('biome-full-map')).toBeHidden();
	const arrived = await me(page);
	expect(Math.hypot(arrived.x - target.x, arrived.z - target.z)).toBeLessThan(2);
	expect(arrived.z - start.z).toBeGreaterThan(300);
});

test.describe('touch', () => {
	test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
	test('a tap pins, a drag pans, and the buttons fit a phone', async ({ page, browserName }) => {
		test.skip(browserName === 'firefox', 'Firefox has no touch emulation in Playwright');
		test.setTimeout(180_000);
		await page.goto('/');
		await createAndEnterWorld(page, { name: 'Travel touch', seed: 'minimap-e2e' });
		await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
		await page.getByTestId('biome-minimap-open').tap();
		await expect(page.getByTestId('biome-full-map')).toBeVisible();
		await expect(page.getByTestId('biome-full-map-biome')).not.toHaveText('—', {
			timeout: 20_000
		});
		const box = (await page.getByTestId('biome-full-map-canvas').boundingBox())!;
		await page.touchscreen.tap(box.x + box.width / 2 + 80, box.y + box.height / 2 - 120);
		const travel = page.getByTestId('biome-full-map-travel');
		await expect(travel).toBeVisible();
		// Both pin buttons sit inside the screen.
		for (const id of ['biome-full-map-travel', 'biome-full-map-clear-pin']) {
			const b = (await page.getByTestId(id).boundingBox())!;
			expect(b.x).toBeGreaterThanOrEqual(0);
			expect(b.x + b.width).toBeLessThanOrEqual(390);
			expect(b.y + b.height).toBeLessThanOrEqual(844);
		}
		if (shots) await page.screenshot({ path: `${shots}/map-pin-phone.jpg`, quality: 80 });
		await expect(page.getByRole('dialog', { name: 'Biome map' }).getByRole('status')).toContainText(
			'Pinned:'
		);
		const target = await readoutPoint(page);
		await travel.tap();
		await expect(page.getByTestId('biome-full-map')).toBeHidden();
		const arrived = await me(page);
		expect(Math.hypot(arrived.x - target.x, arrived.z - target.z)).toBeLessThan(2);
	});
});
