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

	const notice = page.getByTestId('graphics-notice');
	await page.keyboard.press('l');
	await expect(notice).toHaveText('Graphics: ULTRA', { timeout: 10_000 });
	// Transient — it must fade back out on its own rather than staying on screen permanently (the
	// brief explicitly rules out "a large permanent notification"). Generous timeout: this only
	// needs to confirm it disappears eventually, not exactly when.
	await expect(notice).toBeHidden({ timeout: 15_000 });
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
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics HIGH', {
		timeout: 10_000
	});

	for (let i = 0; i < 12; i++) {
		await page.keyboard.press('l');
	}

	// 12 presses from HIGH lands back on HIGH (12 is a multiple of the 4-level cycle).
	await expect(page.getByTestId('graphics-stats')).toContainText('Graphics HIGH');
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible();

	expect(pageErrors).toEqual([]);
});
