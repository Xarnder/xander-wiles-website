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
	await page.getByTestId('task-menu-0').click();
	await page.getByRole('menuitem', { name: 'Move down' }).click();

	await page.getByTestId('save-routine').click();
	await expect(page.getByTestId('routine-list')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Morning Flow' })).toBeVisible();

	await page.getByRole('button', { name: /Start Morning Flow fresh/i }).click();
	await expect(page.getByTestId('run-screen')).toBeVisible();
	await expect(page.getByTestId('later-task')).toBeVisible();
	await expect(page.getByTestId('not-today-task')).toBeVisible();
	await expect(page.getByTestId('progress-text')).toHaveText('Task 1 of 3');
	await expect(page.getByRole('heading', { name: 'Water' })).toBeVisible();

	await page.getByTestId('complete-task').click();
	await expect(page.getByRole('heading', { name: 'Stretch' })).toBeVisible();

	await page.getByTestId('complete-task').click();
	await expect(page.getByRole('heading', { name: 'Plan day' })).toBeVisible();

	await page.getByTestId('back-task').click();
	await expect(page.getByRole('heading', { name: 'Stretch' })).toBeVisible();

	// Change the previous Complete into Not Today
	await page.getByTestId('not-today-task').click();
	await expect(page.getByRole('heading', { name: 'Plan day' })).toBeVisible();

	await page.getByTestId('complete-task').click();
	await expect(page.getByTestId('routine-summary')).toBeVisible();
	await expect(page.getByTestId('summary-confetti')).toBeAttached();
	await expect(page.getByTestId('summary-complete')).toContainText('2');
	await expect(page.getByTestId('summary-complete')).toContainText('Complete');
	await expect(page.getByTestId('summary-later')).toContainText('0');
	await expect(page.getByTestId('summary-later')).toContainText('Later');
	await expect(page.getByTestId('summary-not-today')).toContainText('1');
	await expect(page.getByTestId('summary-not-today')).toContainText('Not Today');
});

test('disabled tasks are skipped until re-enabled', async ({ page }) => {
	await page.goto('./');
	await page.getByTestId('create-routine').click();

	await page.getByTestId('routine-name').fill('Skip One');
	await page.getByTestId('add-task').click();
	await page.getByTestId('add-task').click();

	const titles = page.locator('[data-testid="task-list"] input');
	await titles.nth(0).fill('Keep');
	await titles.nth(1).fill('Skip me');

	await page.getByTestId('task-menu-1').click();
	await page.getByTestId('toggle-task-disabled-1').click();
	await expect(page.getByTestId(/task-off-banner-/)).toBeVisible();

	await page.getByTestId('save-routine').click();
	await expect(page.getByTestId('routine-list')).toBeVisible();
	await expect(page.getByText('1 task · 1 off')).toBeVisible();

	await page.getByRole('button', { name: /Start Skip One fresh/i }).click();
	await expect(page.getByTestId('run-screen')).toBeVisible();
	await expect(page.getByTestId('progress-text')).toHaveText('Task 1 of 1');
	await expect(page.getByRole('heading', { name: 'Keep' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Skip me' })).toHaveCount(0);

	await page.getByTestId('complete-task').click();
	await expect(page.getByTestId('routine-summary')).toBeVisible();

	await page.getByTestId('finish-home').click();
	await page
		.locator('article')
		.filter({ hasText: 'Skip One' })
		.getByRole('link', { name: 'Edit' })
		.click();
	await expect(page.getByRole('heading', { name: 'Edit routine' })).toBeVisible();
	await expect(page.getByTestId(/task-off-banner-/)).toBeVisible();

	await page.getByTestId('task-menu-1').click();
	await page.getByRole('menuitem', { name: 'Enable task' }).click();
	await expect(page.getByTestId(/task-off-banner-/)).toHaveCount(0);
	await page.getByTestId('save-routine').click();
	await expect(page.getByTestId('routine-list')).toBeVisible();
	await expect(page.getByText('2 tasks')).toBeVisible();
});

test('deleting a task requires confirmation', async ({ page }) => {
	await page.goto('./');
	await page.getByTestId('create-routine').click();

	await page.getByTestId('routine-name').fill('Trim List');
	await page.getByTestId('add-task').click();
	await page.getByTestId('add-task').click();

	const titles = page.locator('[data-testid="task-list"] input');
	await titles.nth(0).fill('Keep');
	await titles.nth(1).fill('Drop me');

	await page.getByTestId('task-menu-1').click();
	await page.getByTestId('delete-task-1').click();
	await expect(page.getByRole('heading', { name: 'Delete task?' })).toBeVisible();
	await expect(page.getByText('"Drop me" will be removed from the routine.')).toBeVisible();

	await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('heading', { name: 'Delete task?' })).toHaveCount(0);
	await expect(titles).toHaveCount(2);

	await page.getByTestId('task-menu-1').click();
	await page.getByTestId('delete-task-1').click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
	await expect(titles).toHaveCount(1);
	await expect(titles.nth(0)).toHaveValue('Keep');

	await page.getByTestId('save-routine').click();
	await expect(page.getByTestId('routine-list')).toBeVisible();
	await expect(page.getByText('1 task')).toBeVisible();
});
