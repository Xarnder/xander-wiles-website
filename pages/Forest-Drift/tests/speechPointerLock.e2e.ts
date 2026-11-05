import { expect, test } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

test.use({ headless: false });
test.skip(
	process.env.FOREST_SPEECH_POINTERLOCK !== '1',
	'Requires a visible browser for native pointer lock'
);

test('F6 releases pointer lock into speech options without pausing the game', async ({ page }) => {
	await page.goto('/');
	await createAndEnterWorld(page);
	await page.bringToFront();
	await page.getByTestId('canvas-container').locator('canvas').click();
	await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(true);
	await page.keyboard.press('F6');
	await expect(page.getByTestId('tutorial-menu')).toBeVisible();
	await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(false);
	await expect(page.getByTestId('pause-menu')).toBeHidden();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('tutorial-menu')).toBeHidden();
	await expect(page.getByTestId('pause-menu')).toBeHidden();
});
