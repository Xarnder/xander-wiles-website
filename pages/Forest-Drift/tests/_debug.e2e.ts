import { test } from '@playwright/test';

test('debug: screenshot default (HIGH) with AO disabled, shadows on', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('graphics-stats').waitFor({ timeout: 10_000 });
	await page.waitForTimeout(2000);
	await page.screenshot({ path: 'test-results/quality-high-no-ao.png' });
});
