import { expect, test } from '@playwright/test';

test('renders the world with no uncaught exceptions and loads at least one chunk', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	await expect(page.getByTestId('canvas-container')).toBeVisible();
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible();

	await expect(page.getByTestId('stats-overlay')).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId('loaded-chunks')).toContainText(/Loaded [1-9]/, {
		timeout: 10_000
	});

	expect(pageErrors).toEqual([]);
});

test('shows click-to-explore instructions before pointer lock is engaged', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('Click to explore')).toBeVisible();
});

test('shows the hotbar with a Foundation slot, selectable with the 1 key', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	const hotbar = page.getByTestId('hotbar');
	await expect(hotbar).toBeVisible();

	const foundationSlot = page.getByTestId('hotbar-slot-foundation');
	await expect(foundationSlot).toBeVisible();
	await expect(foundationSlot).toHaveClass(/active/);

	// Deselect (slot 2 is an empty "none" tool), then reselect Foundation with the "1" key.
	await page.keyboard.press('2');
	await expect(foundationSlot).not.toHaveClass(/active/);

	await page.keyboard.press('1');
	await expect(foundationSlot).toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});

test('renders the sky and shows its GUI sections with no uncaught errors', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	// Missing an HDRI asset by default is expected and handled — collect console messages from
	// the start so we don't race the graceful-fallback log against page load.
	const consoleMessages: string[] = [];
	page.on('console', (msg) => consoleMessages.push(msg.text()));

	await page.goto('/');
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible();

	const topLevelSkyFolder = page.locator('.lil-title', { hasText: 'Sky' }).first();
	await expect(topLevelSkyFolder).toBeVisible({ timeout: 10_000 });

	for (const sectionTitle of ['HDRI', 'Sun & Atmosphere', 'Clouds']) {
		await expect(page.locator('.lil-title', { hasText: sectionTitle }).first()).toBeVisible();
	}

	await expect
		.poll(() => consoleMessages.some((text) => text.includes('procedural fallback environment')), {
			timeout: 10_000
		})
		.toBe(true);

	expect(pageErrors).toEqual([]);
});
