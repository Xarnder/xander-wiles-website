import { test, expect } from '@playwright/test';
import { createAndEnterWorld, openPauseMenu } from './worldHelpers';

for (const viewport of [
	{ name: 'desktop', width: 1440, height: 900 },
	{ name: 'phone', width: 390, height: 844 },
	{ name: 'landscape', width: 844, height: 390 }
]) {
	test(`world loading scene: ${viewport.name}`, async ({ page }, info) => {
		await page.setViewportSize(viewport);
		if (viewport.name === 'landscape') await page.emulateMedia({ reducedMotion: 'reduce' });
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto('/');
		await expect(page.getByTestId('landing-menu')).toBeVisible();
		if (viewport.name === 'phone') {
			await page.getByRole('button', { name: 'Worlds', exact: true }).click();
			await page.getByTestId('play-default-world').click();
		} else {
			await page.getByRole('button', { name: 'Play', exact: true }).click();
		}
		const loading = page.getByTestId('loading-screen');
		await expect(loading).toBeVisible();
		await expect(loading.getByRole('heading')).toHaveText('ForestDrift');
		const progress = loading.getByRole('progressbar');
		await expect
			.poll(async () => Number(await progress.getAttribute('aria-valuenow')))
			.toBeGreaterThanOrEqual(20);
		await page.waitForTimeout(250);
		await page.screenshot({ path: info.outputPath(`loading-${viewport.name}.png`) });
		await page.keyboard.press('Escape');
		await expect(loading).toBeHidden({ timeout: 20000 });
		await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible();
		await expect(page.getByTestId('pause-menu')).toBeHidden();
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
		expect(errors).toEqual([]);
	});
}

test('saved world Play uses the same loading scene and returns to gameplay', async ({ page }) => {
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Willow Vale', seed: 'loading-screen-review' });
	await openPauseMenu(page);
	await page.getByTestId('pause-quit').click();
	await expect(page.getByTestId('worlds-screen')).toBeVisible();
	await page
		.getByTestId('world-card')
		.filter({ hasText: 'Willow Vale' })
		.getByTestId('play-world')
		.click();
	const loading = page.getByTestId('loading-screen');
	await expect(loading).toBeVisible();
	await expect(loading).toContainText('Willow Vale');
	await expect(loading).toBeHidden({ timeout: 20000 });
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible();
	await openPauseMenu(page);
	await expect(page.getByTestId('pause-menu')).toBeVisible();
});
