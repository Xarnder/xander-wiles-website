import { expect, test } from '@playwright/test';
import {
	createAndEnterWorld,
	openPauseMenu,
	openWorldMenu,
	openWorldNamed,
	waitForSaved
} from './worldHelpers';

test('opens on the Worlds screen with an empty state, not straight into a world', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	await expect(page.getByTestId('worlds-screen')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('worlds-empty')).toBeVisible();
	await expect(page.getByTestId('new-world-button')).toBeVisible();
	await expect(page.getByTestId('import-world-button')).toBeVisible();
	// No canvas exists until a world is actually opened — the renderer isn't started speculatively.
	await expect(page.getByTestId('canvas-container')).toHaveCount(0);

	expect(pageErrors).toEqual([]);
});

test('creates a named world with a chosen seed, opens it, and lists it afterwards', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Forest House', seed: 'quiet-grove-123' });

	await openPauseMenu(page);
	await expect(page.getByTestId('pause-world-name')).toHaveText('Forest House');
	await page.getByTestId('pause-quit').click();

	await expect(page.getByTestId('worlds-screen')).toBeVisible();
	const card = page.getByTestId('world-card').filter({ hasText: 'Forest House' });
	await expect(card).toHaveCount(1);
	await expect(card).toContainText('quiet-grove-123');

	expect(pageErrors).toEqual([]);
});

test('a created world survives a full page reload with its terrain seed intact', async ({
	page
}) => {
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Persisted World', seed: 'stubborn-ridge-77' });
	await waitForSaved(page);

	await page.reload();

	// The world came back from IndexedDB, not from any in-memory state that a reload would have lost.
	await expect(page.getByTestId('worlds-screen')).toBeVisible({ timeout: 15_000 });
	const card = page.getByTestId('world-card').filter({ hasText: 'Persisted World' });
	await expect(card).toHaveCount(1);
	await expect(card).toContainText('stubborn-ridge-77');

	await openWorldNamed(page, 'Persisted World');
	await expect(page.getByTestId('save-indicator')).toBeVisible({ timeout: 20_000 });
});

test('the pause menu saves on demand and reports the result', async ({ page }) => {
	await page.goto('/');
	await createAndEnterWorld(page);

	await openPauseMenu(page);
	await expect(page.getByTestId('save-status')).toBeVisible();
	await page.getByTestId('pause-save').click();

	await expect(page.getByTestId('save-toast')).toHaveText('World Saved', { timeout: 20_000 });
	await waitForSaved(page);
});

test('Cmd/Ctrl+S saves without leaving the game', async ({ page }) => {
	await page.goto('/');
	await createAndEnterWorld(page);

	await page.keyboard.press('ControlOrMeta+s');
	await expect(page.getByTestId('save-toast')).toHaveText('World Saved', { timeout: 20_000 });
	// Still in the world; the browser's own save-page dialog was suppressed.
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible();
});

test('Quit to Worlds returns to the list and tears the world down', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Quittable' });
	await openPauseMenu(page);
	await page.getByTestId('pause-quit').click();

	await expect(page.getByTestId('worlds-screen')).toBeVisible({ timeout: 20_000 });
	await expect(page.getByTestId('canvas-container')).toHaveCount(0);
	await expect(page.getByTestId('world-card').filter({ hasText: 'Quittable' })).toHaveCount(1);

	expect(pageErrors).toEqual([]);
});

test('renames a world from the Worlds screen without creating a second one', async ({ page }) => {
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Before Rename' });
	await openPauseMenu(page);
	await page.getByTestId('pause-quit').click();
	await expect(page.getByTestId('worlds-screen')).toBeVisible();

	await openWorldMenu(page, 'Before Rename');
	await page.getByTestId('world-menu-rename').click();
	await expect(page.getByTestId('rename-world-dialog')).toBeVisible();
	await page.getByTestId('rename-world-name').fill('After Rename');
	await page.getByTestId('rename-world-confirm').click();

	await expect(page.getByTestId('world-card')).toHaveCount(1);
	await expect(page.getByTestId('world-card')).toContainText('After Rename');
});

test('duplicating a world produces a second, independent entry', async ({ page }) => {
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Original' });
	await openPauseMenu(page);
	await page.getByTestId('pause-quit').click();
	await expect(page.getByTestId('worlds-screen')).toBeVisible();

	await openWorldMenu(page, 'Original');
	await page.getByTestId('world-menu-duplicate').click();

	await expect(page.getByTestId('world-card')).toHaveCount(2, { timeout: 15_000 });
	await expect(page.getByTestId('world-card').filter({ hasText: 'Original Copy' })).toHaveCount(1);
});

test('deleting a world requires confirmation and can be cancelled', async ({ page }) => {
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Deletable' });
	await openPauseMenu(page);
	await page.getByTestId('pause-quit').click();
	await expect(page.getByTestId('worlds-screen')).toBeVisible();

	// A single click on the overflow item must not delete anything on its own.
	await openWorldMenu(page, 'Deletable');
	await page.getByTestId('world-menu-delete').click();
	await expect(page.getByTestId('delete-world-dialog')).toBeVisible();
	await expect(page.getByTestId('world-card')).toHaveCount(1);

	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByTestId('world-card')).toHaveCount(1);

	await openWorldMenu(page, 'Deletable');
	await page.getByTestId('world-menu-delete').click();
	await page.getByTestId('delete-world-confirm').click();

	await expect(page.getByTestId('world-card')).toHaveCount(0);
	await expect(page.getByTestId('worlds-empty')).toBeVisible();
});

test('exports a world to a downloadable file and imports it back as a separate copy', async ({
	page
}) => {
	test.setTimeout(90_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Exportable', seed: 'export-seed-9' });
	await waitForSaved(page);
	await openPauseMenu(page);
	await page.getByTestId('pause-quit').click();
	await expect(page.getByTestId('worlds-screen')).toBeVisible();

	await openWorldMenu(page, 'Exportable');
	const downloadPromise = page.waitForEvent('download');
	await page.getByTestId('world-menu-export').click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('Exportable.forestworld');

	const path = await download.path();
	expect(path).toBeTruthy();

	// Importing the same world back must not overwrite the original — it becomes a second world.
	await page.getByTestId('import-world-input').setInputFiles(path!);
	await expect(page.getByTestId('world-card')).toHaveCount(2, { timeout: 20_000 });
	await expect(page.getByTestId('world-card').filter({ hasText: 'Exportable' })).toHaveCount(2);

	expect(pageErrors).toEqual([]);
});

test('rejects an invalid world file with a useful message instead of crashing', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await expect(page.getByTestId('worlds-screen')).toBeVisible({ timeout: 15_000 });

	await page.getByTestId('import-world-input').setInputFiles({
		name: 'not-a-world.forestworld',
		mimeType: 'application/zip',
		buffer: Buffer.from('this is definitely not a zip archive')
	});

	await expect(page.getByTestId('worlds-error')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('world-card')).toHaveCount(0);

	expect(pageErrors).toEqual([]);
});

test('the world browser lists worlds without opening any of them', async ({ page }) => {
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'World One' });
	await openPauseMenu(page);
	await page.getByTestId('pause-quit').click();
	await expect(page.getByTestId('worlds-screen')).toBeVisible();

	await page.getByTestId('new-world-button').click();
	await page.getByTestId('create-world-name').fill('World Two');
	await page.getByTestId('create-world-confirm').click();
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible({
		timeout: 20_000
	});
	await openPauseMenu(page);
	await page.getByTestId('pause-quit').click();

	await expect(page.getByTestId('world-list')).toBeVisible();
	await expect(page.getByTestId('world-card')).toHaveCount(2);
	// Listing the worlds must not have started a renderer for either of them.
	await expect(page.getByTestId('canvas-container')).toHaveCount(0);
});

test('renaming from inside the pause menu updates the world without changing world', async ({
	page
}) => {
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'In-Game Rename' });

	await openPauseMenu(page);
	await page.getByTestId('pause-world').click();
	await page.getByTestId('pause-world-rename').click();
	await page.getByTestId('pause-rename-input').fill('Renamed In Game');
	await page.getByTestId('pause-rename-confirm').click();

	await expect(page.getByTestId('pause-world-panel')).toHaveText('Renamed In Game', {
		timeout: 15_000
	});
	// Still the same session: the canvas was never torn down.
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible();
});
