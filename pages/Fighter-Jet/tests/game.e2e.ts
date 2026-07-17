import { expect, test, type Page } from '@playwright/test';

type ViperTestApi = {
	start: () => void;
	pause: () => void;
	resume: () => void;
	restart: () => void;
	success: () => void;
};

async function openTestMission(page: Page): Promise<void> {
	await page.goto('/?testMode=true');
	await expect(page.getByRole('heading', { name: 'Viper Strike' })).toBeVisible();
	await page.getByRole('button', { name: 'Start Mission' }).click();
	await expect(page.getByTestId('game-hud')).toBeVisible({ timeout: 15_000 });
}

test('loads the cinematic main menu', async ({ page }) => {
	await page.goto('/?testMode=true');

	await expect(page).toHaveTitle(/Viper Strike/);
	await expect(page.getByRole('heading', { name: 'Viper Strike' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Start Mission' })).toBeEnabled();
	await expect(page.getByText('Mouse / Arrows')).toBeVisible();
});

test('starts a mission and renders the flight HUD', async ({ page }) => {
	await openTestMission(page);

	await expect(page.getByText('MISSILES', { exact: true })).toBeVisible();
	await expect(page.getByText('ALT', { exact: true })).toBeVisible();
	await expect(page.getByTestId('current-objective')).toBeVisible();
});

test('opens and closes pause without advancing the game', async ({ page }) => {
	await openTestMission(page);
	await page.keyboard.press('Escape');

	await expect(page.getByRole('heading', { name: 'Mission Paused' })).toBeVisible();
	await page.getByRole('button', { name: 'Resume' }).click();
	await expect(page.getByRole('heading', { name: 'Mission Paused' })).toBeHidden();
	await expect(page.getByTestId('game-hud')).toBeVisible();
});

test('changes and persists quality settings', async ({ page }) => {
	await page.goto('/?testMode=true');
	await page.getByRole('button', { name: 'Settings' }).click();
	await page.getByLabel('Quality').selectOption('low');
	await page.getByLabel('Reduced motion').check();
	await page.getByRole('button', { name: 'Close settings' }).click();

	await page.reload();
	await page.getByRole('button', { name: 'Settings' }).click();
	await expect(page.getByLabel('Quality')).toHaveValue('low');
	await expect(page.getByLabel('Reduced motion')).toBeChecked();
});

test('restarts an active mission from pause', async ({ page }) => {
	await openTestMission(page);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Restart Mission' }).click();

	await expect(page.getByTestId('game-hud')).toBeVisible();
	await expect(page.getByTestId('mission-timer')).toContainText('00:');
});

test('supports deterministic mission success and replay', async ({ page }) => {
	await openTestMission(page);
	await page.waitForFunction(() =>
		Boolean((window as Window & { __VIPER_TEST__?: ViperTestApi }).__VIPER_TEST__)
	);
	await page.evaluate(() => {
		(window as Window & { __VIPER_TEST__?: ViperTestApi }).__VIPER_TEST__?.success();
	});

	await expect(page.getByRole('heading', { name: 'Mission Complete' })).toBeVisible();
	await expect(page.getByText('Final score')).toBeVisible();
	await page.getByRole('button', { name: 'Replay Mission' }).click();
	await expect(page.getByTestId('game-hud')).toBeVisible();
});
