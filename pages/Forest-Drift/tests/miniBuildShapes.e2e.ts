import { expect, test } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

test('low-poly shape controls, snapped transforms, limits and saved geometry', async ({ page }) => {
	test.setTimeout(120_000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Shape workshop', seed: 'mini-shapes' });
	await page.keyboard.press('8');
	await page.keyboard.press('e');
	await page.getByTestId('mini-build-create-new').click();
	await page.getByTestId('mini-build-add-cylinder').click();
	const size = page.getByTestId('mini-build-size-y');
	await size.fill('0.93');
	await size.press('Tab');
	await expect(size).toHaveValue('0.9375');
	await page.getByTestId('mini-build-rotation-step').selectOption('22.5');
	await page.getByTestId('mini-build-rotate-x').click();
	await expect(page.getByTestId('mini-build-angle-x')).toHaveValue('22.5');
	for (let i = 1; i < 4; i++) await page.getByTestId('mini-build-add-cylinder').click();
	await expect(page.getByTestId('mini-build-add-cylinder')).toBeDisabled();
	for (let i = 0; i < 2; i++) await page.getByTestId('mini-build-add-sphere').click();
	await expect(page.getByTestId('mini-build-add-sphere')).toBeDisabled();
	await expect(page.getByTestId('mini-build-add')).toBeEnabled();
	await expect(page.getByTestId('mini-build-block-4')).toContainText('Sphere');
	for (let i = 0; i < 6; i++) {
		await page.getByTestId(`mini-build-block-${i}`).click();
		for (const [axis, value] of [
			['y', '0'],
			['x', String((i - 3) * 0.6)]
		]) {
			const field = page.getByTestId(`mini-build-pos-${axis}`);
			await field.fill(value);
			await field.press('Tab');
		}
	}
	await page.screenshot({ path: test.info().outputPath('low-poly-shapes.png') });
	await page.getByTestId('mini-build-save').click();
	await page.getByTestId('mini-build-name-input').fill('Low-poly shapes');
	await page.getByTestId('mini-build-name-confirm').click();
	await expect(page.getByTestId('mini-build-editor')).toBeHidden();
	expect(errors).toEqual([]);
});
