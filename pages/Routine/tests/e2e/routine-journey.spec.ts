import { expect, test } from '@playwright/test';

test('core routine journey', async ({ page }) => {
	await page.goto('./');
	await expect(page.getByRole('heading', { name: 'Your routines' })).toBeVisible();

	await page.getByTestId('create-routine').click();
	await expect(page.getByRole('heading', { name: 'Create routine' })).toBeVisible();

	await page.getByTestId('routine-name').fill('Morning Flow');
	await page.getByTestId('add-task').click();
	await page.getByTestId('add-task').click();
	await page.getByTestId('add-task').click();

	const titles = page.locator('[data-testid="task-list"] input');
	await titles.nth(0).fill('Stretch');
	await titles.nth(1).fill('Water');
	await titles.nth(2).fill('Plan day');

	// Reorder: move first task down so Water becomes first
	await page.getByRole('button', { name: 'Down' }).first().click();

	await page.getByTestId('save-routine').click();
	await expect(page.getByTestId('routine-list')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Morning Flow' })).toBeVisible();

	await page.getByRole('button', { name: /Start Morning Flow/i }).click();
	await expect(page.getByTestId('run-screen')).toBeVisible();
	await expect(page.getByTestId('progress-text')).toHaveText('Task 1 of 3');
	await expect(page.getByRole('heading', { name: 'Water' })).toBeVisible();

	await page.getByTestId('complete-task').click();
	await expect(page.getByRole('heading', { name: 'Stretch' })).toBeVisible();

	await page.getByTestId('complete-task').click();
	await expect(page.getByRole('heading', { name: 'Plan day' })).toBeVisible();

	await page.getByTestId('back-task').click();
	await expect(page.getByRole('heading', { name: 'Stretch' })).toBeVisible();

	// Change the previous Complete into Skip
	await page.getByTestId('skip-task').click();
	await expect(page.getByRole('heading', { name: 'Plan day' })).toBeVisible();

	await page.getByTestId('complete-task').click();
	await expect(page.getByTestId('routine-summary')).toBeVisible();
	await expect(page.getByTestId('summary-stats')).toContainText('2');
	await expect(page.getByTestId('summary-stats')).toContainText('completed');
	await expect(page.getByTestId('summary-stats')).toContainText('1');
	await expect(page.getByTestId('summary-stats')).toContainText('skipped');
});
