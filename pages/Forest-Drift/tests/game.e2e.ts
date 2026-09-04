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
	await expect(page).toHaveTitle('Forest Drift');
	await expect(page.getByAltText('Forest Drift')).toBeVisible();
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

test('shows Wall, Window and Door hotbar slots and switches the active tool with 2/3/4', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	const wallSlot = page.getByTestId('hotbar-slot-wall');
	const windowSlot = page.getByTestId('hotbar-slot-window');
	const doorSlot = page.getByTestId('hotbar-slot-door');
	await expect(wallSlot).toBeVisible();
	await expect(windowSlot).toBeVisible();
	await expect(doorSlot).toBeVisible();

	await page.keyboard.press('2');
	await expect(wallSlot).toHaveClass(/active/);

	await page.keyboard.press('3');
	await expect(windowSlot).toHaveClass(/active/);
	await expect(wallSlot).not.toHaveClass(/active/);

	await page.keyboard.press('4');
	await expect(doorSlot).toHaveClass(/active/);
	await expect(windowSlot).not.toHaveClass(/active/);

	await page.keyboard.press('1');
	await expect(page.getByTestId('hotbar-slot-foundation')).toHaveClass(/active/);
	await expect(doorSlot).not.toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});

test('shows a Polygon/Continuous Wall hotbar slot in slot 5, selectable with the 5 key', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	const polygonWallSlot = page.getByTestId('hotbar-slot-polygon-wall');
	await expect(polygonWallSlot).toBeVisible();

	await page.keyboard.press('5');
	await expect(polygonWallSlot).toHaveClass(/active/);

	await page.keyboard.press('1');
	await expect(polygonWallSlot).not.toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});

test('shows the Building GUI folder with Grid, Walls, Windows and Doors sections', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible();

	const buildingFolder = page.locator('.lil-title', { hasText: 'Building' }).first();
	await expect(buildingFolder).toBeVisible({ timeout: 10_000 });

	for (const sectionTitle of ['Grid', 'Walls', 'Windows', 'Doors']) {
		await expect(page.locator('.lil-title', { hasText: sectionTitle }).first()).toBeVisible();
	}

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
