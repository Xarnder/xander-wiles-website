import { expect, test } from '@playwright/test';
import {
	createAndEnterWorld,
	openPauseMenu,
	openSettingsMenu,
	openWorldsScreen
} from './worldHelpers';

/**
 * Biomes Phase 1 (docs/2026/11-12/Biomes-and-Enviroments): the biome-name card, the pause-menu
 * line, the confirmed on/off switch in Settings → World → Biomes, and the size choice at creation.
 */

test('a new world names the biome you start in, and biomes can be switched off with confirmation', async ({
	page
}) => {
	// Spawn is in a biome forest; headless (software-rendered) frames are slow there, so opening
	// the pause and settings menus alone takes ~45 s. Measured total ~95 s.
	test.setTimeout(180_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Biome World', seed: 'biome-e2e-1' });

	// Spawn is always a gentle temperate biome (decision Q21); announced after a few seconds there.
	const announcement = page.getByTestId('biome-announcement');
	await expect(announcement).toHaveText(
		/Entered (Plains|Sunflower Plains|Forest|Flower Forest|Birch Forest|Old Growth Birch Forest|Sunlit Wood|Meadow|Cherry Grove)/,
		{ timeout: 15_000 }
	);
	await expect(announcement).toHaveAttribute('aria-live', 'polite');
	await expect(page.getByTestId('biome-card')).toHaveAttribute('aria-hidden', 'true');

	await openPauseMenu(page);
	await expect(page.getByTestId('pause-biome')).toContainText("You're in");
	await page.getByTestId('pause-settings').click();
	await expect(page.getByTestId('settings-overlay')).toBeVisible();
	await page.getByTestId('settings-nav-world').click();
	await expect(page.getByTestId('settings-group-world-biomes')).toBeVisible();

	// Cancelling changes nothing.
	await page.getByTestId('settings-field-world.biomes.toggle').click();
	await expect(page.getByTestId('confirm-biomes')).toBeVisible();
	await expect(page.getByTestId('confirm-biomes-cancel')).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('confirm-biomes')).toBeHidden();
	await expect(page.getByTestId('settings-field-world.biomes.toggle')).toHaveText(
		/Turn biomes off/
	);

	// Confirming switches them off; the button label and the other biome fields follow.
	await page.getByTestId('settings-field-world.biomes.toggle').click();
	await page.getByTestId('confirm-biomes-yes').click();
	await expect(page.getByTestId('confirm-biomes')).toBeHidden();
	await expect(page.getByTestId('settings-field-world.biomes.toggle')).toHaveText(/Turn biomes on/);
	await expect(
		page.getByTestId('settings-field-world.biomes.size').locator('select')
	).toBeDisabled();

	expect(pageErrors).toEqual([]);
});

test('the New World dialog offers a biome size, defaulting to Normal', async ({ page }) => {
	await page.goto('/');
	await openWorldsScreen(page);
	await page.getByTestId('new-world-button').click();
	const size = page.getByTestId('create-world-biome-size');
	await expect(size).toHaveValue('normal');
	await size.selectOption('large');
	await expect(size).toHaveValue('large');
});

test('the biome-name card can be turned off in Graphics settings', async ({ page }) => {
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Quiet Biomes', seed: 'biome-e2e-2' });
	await openSettingsMenu(page);
	await page.getByTestId('settings-nav-graphics').click();
	const toggle = page.getByTestId('settings-field-graphics.biomeNames').locator('input');
	await expect(toggle).toBeChecked();
	await toggle.uncheck();
	await expect(toggle).not.toBeChecked();
	expect(await page.evaluate(() => localStorage.getItem('forest-drift.biome-names.v1'))).toBe('0');
});
