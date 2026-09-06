import { expect, test } from '@playwright/test';
import { createAndEnterWorld, openWorldNamed } from './worldHelpers';

const STORAGE_KEY = 'forest-drift.graphics.v1';

test('defaults to HIGH graphics quality on a fresh visit', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics HIGH', {
		timeout: 10_000
	});

	expect(pageErrors).toEqual([]);
});

test('L cycles graphics quality HIGH → ULTRA → LOW → MEDIUM → HIGH', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);
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
	await createAndEnterWorld(page);
	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics HIGH', {
		timeout: 10_000
	});

	// Dispatching the keydown AND polling for the notice inside one page.evaluate() call (rather
	// than `page.keyboard.press()` followed by a separate check) avoids a cross-process timing gap:
	// applying a quality change for the first time does real synchronous work (building a fresh CSM
	// + postprocessing composer), and on a busy page that can take long enough that a *separate*
	// round-trip back to Node before polling starts risks missing the notice's whole visible window
	// entirely. Running both in the same synchronous page script eliminates that gap — see the
	// README's "Graphics quality" section for the full story.
	const result = await page.evaluate(
		() =>
			new Promise<{ appearedWith: string | null; disappearedAfter: boolean }>((resolve) => {
				window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL', bubbles: true }));

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
	await createAndEnterWorld(page);
	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics HIGH', {
		timeout: 10_000
	});

	await page.keyboard.press('l'); // HIGH -> ULTRA
	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics ULTRA');

	const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
	expect(stored).toBe('ultra');

	// Graphics quality is a *local preference*, not world state, so it survives a reload
	// independently of any world — reopening any world shows it again.
	await page.reload();
	await openWorldNamed(page, 'Test World');
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
	await createAndEnterWorld(page);
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
	// Boots a world and then rebuilds the entire shadow/postprocessing pipeline eight times.
	test.setTimeout(180_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);
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
