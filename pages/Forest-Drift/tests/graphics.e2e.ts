import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'forest-drift.graphics.v1';

test('defaults to HIGH graphics quality on a fresh visit', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics HIGH', {
		timeout: 10_000
	});

	expect(pageErrors).toEqual([]);
});

test('L cycles graphics quality HIGH → ULTRA → LOW → MEDIUM → HIGH', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	const stats = page.getByTestId('graphics-stats');
	await expect(stats).toContainText('Graphics HIGH', { timeout: 10_000 });

	const sequence = ['ULTRA', 'LOW', 'MEDIUM', 'HIGH'];
	for (const expected of sequence) {
		await page.keyboard.press('l');
		await expect(stats).toContainText(`Graphics ${expected}`, { timeout: 10_000 });
	}

	expect(pageErrors).toEqual([]);
});

test('L shows a HUD notification naming the new quality, which fades back out on its own', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics HIGH', {
		timeout: 10_000
	});

	await page.keyboard.press('l');

	// Polling this predicate from *inside* the page in a single round-trip (rather than issuing one
	// CDP round-trip per poll tick, which this page's busy WebGL render loop can make slow enough to
	// miss a several-second-wide window entirely) is what actually catches this transient element
	// reliably — see the README's "Graphics quality" section for the full story.
	const result = await page.evaluate(
		() =>
			new Promise<{ appearedWith: string | null; disappearedAfter: boolean }>((resolve) => {
				let appearedWith: string | null = null;
				const start = performance.now();
				const poll = () => {
					const el = document.querySelector('[data-testid="graphics-notice"]');
					if (el && appearedWith === null) appearedWith = el.textContent;
					if (appearedWith !== null && !el) {
						resolve({ appearedWith, disappearedAfter: true });
						return;
					}
					if (performance.now() - start > 8000) {
						resolve({ appearedWith, disappearedAfter: !el });
						return;
					}
					setTimeout(poll, 20);
				};
				poll();
			})
	);

	expect(result.appearedWith).toBe('Graphics: ULTRA');
	// Transient — it must fade back out on its own rather than staying on screen permanently (the
	// brief explicitly rules out "a large permanent notification").
	expect(result.disappearedAfter).toBe(true);
});

test('graphics quality persists across a reload', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics HIGH', {
		timeout: 10_000
	});

	await page.keyboard.press('l'); // HIGH -> ULTRA
	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics ULTRA');

	const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
	expect(stored).toBe('ultra');

	await page.reload();
	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics ULTRA', {
		timeout: 10_000
	});
});

test('L does not change graphics quality while typing into the paint palette colour picker', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics HIGH', {
		timeout: 10_000
	});

	await page.keyboard.press('p'); // Paint Mode
	await page.keyboard.press('c'); // open the colour palette
	await expect(page.getByTestId('material-palette')).toBeVisible();

	const colorPicker = page.getByLabel('Custom colour picker');
	await colorPicker.focus();
	await colorPicker.press('l');

	await expect(page.getByTestId('graphics-notice')).toHaveCount(0);
	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics HIGH');

	expect(pageErrors).toEqual([]);
});

test('switching graphics quality repeatedly keeps the world running with no console errors', async ({
	page
}) => {
	test.setTimeout(60_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	const stats = page.getByTestId('graphics-stats');
	await expect(stats).toContainText('Graphics HIGH', { timeout: 10_000 });

	// Two full cycles through all four levels — rebuilding CSM/composer/GTAO each time — must not
	// leak resources or crash the render loop (see GraphicsPipeline.dispose/teardownCsm/disposeComposer).
	const sequence = ['ULTRA', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA', 'LOW', 'MEDIUM', 'HIGH'];
	for (const expected of sequence) {
		await page.keyboard.press('l');
		await expect(stats).toContainText(`Graphics ${expected}`, { timeout: 10_000 });
	}

	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible();

	expect(pageErrors).toEqual([]);
});
