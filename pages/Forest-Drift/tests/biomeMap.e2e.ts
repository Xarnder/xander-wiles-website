import { expect, test, type Page } from '@playwright/test';

/**
 * Biome minimap Phase 0: the map tile worker, end to end in a real browser (worker, transferred
 * pixels, ImageBitmaps, the canvas) through the developer preview at `/biome-map/?dev`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Preview = any;

async function open(page: Page, query = '') {
	const errors: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto(`/biome-map/?dev${query}`);
	await page.waitForFunction(
		() => (window as unknown as { biomeMapPreview?: unknown }).biomeMapPreview
	);
	return errors;
}

async function settle(page: Page, level: number) {
	await page.evaluate(
		(l) => (window as unknown as { biomeMapPreview: Preview }).biomeMapPreview.setView(l),
		level
	);
	await expect
		.poll(
			() =>
				page.evaluate(() =>
					(window as unknown as { biomeMapPreview: Preview }).biomeMapPreview.settled()
				),
			{ timeout: 90_000, intervals: [250] }
		)
		.toBe(true);
}

/** Distinct colours in the middle of the canvas: a drawn map has many, an empty one has one. */
async function colours(page: Page) {
	return page.getByTestId('biome-map-canvas').evaluate((canvas: HTMLCanvasElement) => {
		const ctx = canvas.getContext('2d')!;
		const { data } = ctx.getImageData(
			canvas.width / 4,
			canvas.height / 4,
			canvas.width / 2,
			canvas.height / 2
		);
		const seen = new Set<number>();
		for (let i = 0; i < data.length; i += 4 * 97)
			seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
		return seen.size;
	});
}

test('draws the Main World’s biome map off the main thread, at near and far zoom', async ({
	page
}) => {
	test.setTimeout(240_000);
	const errors = await open(page);
	for (const level of [0, 4]) {
		await settle(page, level);
		expect(await colours(page)).toBeGreaterThan(20);
	}
	const timings = await page.evaluate(() =>
		(window as unknown as { biomeMapPreview: Preview }).biomeMapPreview.client.timings.map(
			(t: { tiles: number; landMs: number } | undefined) => (t ? t.landMs / t.tiles : null)
		)
	);
	console.log('Biome map land ms per tile by level:', JSON.stringify(timings));
	expect(errors).toEqual([]);
});

test('adds rivers and lakes in a world with water, and draws biomes-off land', async ({ page }) => {
	test.setTimeout(240_000);
	const errors = await open(page, '&seed=map-water');
	await settle(page, 1);
	const water = await page.evaluate(() =>
		(window as unknown as { biomeMapPreview: Preview }).biomeMapPreview.client.timings.some(
			(t: { waterTiles: number } | undefined) => t && t.waterTiles > 0
		)
	);
	expect(water).toBe(true);
	await page.goto('/biome-map/?dev&seed=map-water&biomes=off');
	await page.waitForFunction(
		() => (window as unknown as { biomeMapPreview?: unknown }).biomeMapPreview
	);
	await settle(page, 2);
	expect(await colours(page)).toBeGreaterThan(5);
	expect(errors).toEqual([]);
});
