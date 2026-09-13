import { expect, test } from '@playwright/test';
import { openPauseMenu } from './worldHelpers';

test('shows the default world in its own dedicated section and starts playing with one click', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	// Worlds screen is visible
	await expect(page.getByTestId('worlds-screen')).toBeVisible({ timeout: 15_000 });

	// Dedicated Default World section exists
	const defaultSection = page.getByTestId('default-world-section');
	await expect(defaultSection).toBeVisible();
	await expect(defaultSection.getByTestId('default-world-card')).toBeVisible();
	await expect(defaultSection.getByTestId('default-world-name')).toHaveText('Main World');
	await expect(defaultSection).toContainText('soft-lowlands-431');

	// "My Worlds" section still displays empty state for fresh visitors
	await expect(page.getByTestId('worlds-empty')).toBeVisible();
	await expect(page.getByTestId('world-card')).toHaveCount(0);

	// ONE CLICK to start playing!
	await page.getByTestId('play-default-world').click();

	// Enters the game directly
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible({
		timeout: 20_000
	});
	await expect(page.getByTestId('save-indicator')).toBeVisible({ timeout: 20_000 });

	// In-game pause menu confirms we are in Main World
	await openPauseMenu(page);
	await expect(page.getByTestId('pause-world-name')).toHaveText('Main World');
	await page.getByTestId('pause-quit').click();

	// Returning to worlds screen
	await expect(page.getByTestId('worlds-screen')).toBeVisible({ timeout: 20_000 });
	await expect(page.getByTestId('default-world-card')).toBeVisible();

	expect(pageErrors).toEqual([]);
});

test('duplicating the default world adds a copy to My Worlds', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('worlds-screen')).toBeVisible({ timeout: 15_000 });

	// Open default world menu and click Duplicate
	await page.getByTestId('default-world-menu-button').click();
	await expect(page.getByTestId('default-world-menu')).toBeVisible();
	await page.getByTestId('default-world-menu-duplicate').click();

	// My Worlds now has 1 card: "Main World Copy"
	await expect(page.getByTestId('world-card')).toHaveCount(1, { timeout: 15_000 });
	await expect(page.getByTestId('world-card').filter({ hasText: 'Main World Copy' })).toHaveCount(1);
	await expect(page.getByTestId('worlds-empty')).toHaveCount(0);
});
