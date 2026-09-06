import { expect, type Page } from '@playwright/test';

/**
 * The game now opens on the Worlds screen rather than dropping straight into a world, so every test
 * that wants to be *inside* a world starts here. Kept in one place so the entry flow can change
 * without touching every gameplay test.
 */
export async function createAndEnterWorld(
	page: Page,
	{ name = 'Test World', seed = 'test-seed-001' }: { name?: string; seed?: string } = {}
): Promise<void> {
	await expect(page.getByTestId('worlds-screen')).toBeVisible({ timeout: 15_000 });
	await page.getByTestId('new-world-button').click();
	await expect(page.getByTestId('create-world-dialog')).toBeVisible();
	await page.getByTestId('create-world-name').fill(name);
	await page.getByTestId('create-world-seed').fill(seed);
	await page.getByTestId('create-world-confirm').click();

	// Creating a world opens it, so the canvas and the HUD are the signal that we're in-world.
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible({
		timeout: 20_000
	});
	await expect(page.getByTestId('stats-overlay')).toBeVisible({ timeout: 20_000 });
}

/** Opens an existing world from the Worlds list by its displayed name. */
export async function openWorldNamed(page: Page, name: string): Promise<void> {
	const card = page.getByTestId('world-card').filter({ hasText: name }).first();
	await card.getByTestId('play-world').click();
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible({
		timeout: 20_000
	});
}

/** Opens the per-world overflow menu on the Worlds screen. */
export async function openWorldMenu(page: Page, name: string) {
	const card = page.getByTestId('world-card').filter({ hasText: name }).first();
	await card.getByTestId('world-menu-button').click();
	await expect(page.getByTestId('world-menu')).toBeVisible();
	return card;
}

/**
 * Opens the in-game pause menu.
 *
 * Escape has to reach the page's own handler, and the first Escape while pointer-locked is consumed
 * by the browser releasing the pointer — but these tests never engage pointer lock (it's unreliable
 * to drive in automation), so a single press is enough.
 */
export async function openPauseMenu(page: Page): Promise<void> {
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('pause-menu')).toBeVisible();
}

/** Waits for autosave/manual save to settle, so assertions about stored data aren't racing a write. */
export async function waitForSaved(page: Page): Promise<void> {
	await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-status', 'saved', {
		timeout: 20_000
	});
}
