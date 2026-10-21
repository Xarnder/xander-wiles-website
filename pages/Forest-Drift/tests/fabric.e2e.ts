import { expect, test } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

test('stock armchair upholstery uses woven fabric and keeps its wooden frame', async ({ page }) => {
	test.setTimeout(120_000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Fabric workshop', seed: 'fabric' });
	await page.keyboard.press('8');
	await page.keyboard.press('e');
	await page
		.locator('[data-testid="mini-build-card"][data-name="Arm Chair"]')
		.getByTestId('mini-build-edit')
		.click();
	await expect(page.getByTestId('mini-build-material-finish-0')).toHaveValue('wood');
	await expect(page.getByTestId('mini-build-material-finish-1')).toHaveValue('fabric');
	await expect(
		page.getByTestId('mini-build-material-texture-1').locator('option:checked')
	).toHaveText('Auto (Woven fabric)');
	await page.getByTestId('mini-build-material-texture-2').selectOption('woven-fabric');
	await expect(page.getByTestId('mini-build-material-finish-2')).toHaveValue('fabric');
	await page.screenshot({ path: test.info().outputPath('woven-armchair.png') });
	await page.getByTestId('mini-build-save-as').click();
	await page.getByTestId('mini-build-name-input').fill('Woven armchair');
	await page.getByTestId('mini-build-name-confirm').click();
	await expect(page.getByTestId('mini-build-editor')).toBeHidden();
	expect(errors).toEqual([]);
});
