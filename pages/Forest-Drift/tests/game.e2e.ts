import { expect, test } from '@playwright/test';
import { createAndEnterWorld, openPauseMenu, openSettingsMenu } from './worldHelpers';

test('renders the world with no uncaught exceptions and loads at least one chunk', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	await expect(page.getByTestId('canvas-container')).toBeVisible();
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible();

	await expect(page.getByTestId('world-load-status')).toContainText(/Loaded [1-9]/, {
		timeout: 10_000
	});

	expect(pageErrors).toEqual([]);
});

test('shows click-to-explore instructions before pointer lock is engaged', async ({ page }) => {
	await page.goto('/');
	await createAndEnterWorld(page);
	await expect(page).toHaveTitle('Forest Drift');
	await expect(page.getByAltText('Forest Drift')).toBeVisible();
	await expect(page.getByText('Click to explore')).toBeVisible();
});

test('shows the hotbar with a Foundation slot, selectable with the 1 key', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	const hotbar = page.getByTestId('hotbar');
	await expect(hotbar).toBeVisible();

	const foundationSlot = page.getByTestId('hotbar-slot-foundation');
	await expect(foundationSlot).toBeVisible();
	await expect(foundationSlot).toHaveClass(/active/);

	// Deselect Foundation by picking another slot, then reselect it with the "1" key.
	await page.keyboard.press('2');
	await expect(foundationSlot).not.toHaveClass(/active/);

	await page.keyboard.press('1');
	await expect(foundationSlot).toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});

test('G toggles Build Mode and hides/shows the hotbar', async ({ page }) => {
	await page.goto('/');
	await createAndEnterWorld(page);

	const hotbar = page.getByTestId('hotbar');
	await expect(hotbar).toBeVisible();

	await page.keyboard.press('g');
	await expect(hotbar).toBeHidden();

	await page.keyboard.press('g');
	await expect(hotbar).toBeVisible();
	await expect(page.getByTestId('hotbar-slot-foundation')).toHaveClass(/active/);
});

test('groups walls, openings and slabs on slots 2–4, with ↑/↓ cycling the variants', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	const polyWallSlot = page.getByTestId('hotbar-slot-polygon-wall');
	const doorSlot = page.getByTestId('hotbar-slot-door');
	const ceilingSlot = page.getByTestId('hotbar-slot-ceiling');
	const stairsSlot = page.getByTestId('hotbar-slot-stairs');
	await expect(polyWallSlot).toBeVisible();
	await expect(doorSlot).toBeVisible();
	await expect(ceilingSlot).toBeVisible();
	await expect(stairsSlot).toBeVisible();

	await page.keyboard.press('2');
	await expect(polyWallSlot).toHaveClass(/active/);
	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('hotbar-slot-wall')).toHaveClass(/active/);

	await page.keyboard.press('3');
	await expect(page.getByTestId('hotbar-slot-door')).toHaveClass(/active/);
	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('hotbar-slot-window')).toHaveClass(/active/);

	await page.keyboard.press('4');
	await expect(page.getByTestId('hotbar-slot-ceiling')).toHaveClass(/active/);
	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('hotbar-slot-floor')).toHaveClass(/active/);
	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('hotbar-slot-flat-roof')).toHaveClass(/active/);

	await page.keyboard.press('5');
	await expect(page.getByTestId('hotbar-slot-stairs')).toHaveClass(/active/);

	await page.keyboard.press('6');
	await expect(page.getByTestId('hotbar-slot-floor-carpet')).toHaveClass(/active/);
	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('hotbar-slot-floor-path')).toHaveClass(/active/);
	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('hotbar-slot-floor-planks')).toHaveClass(/active/);
	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('hotbar-slot-floor-tiles')).toHaveClass(/active/);

	await page.keyboard.press('8');
	await expect(page.getByTestId('hotbar-slot-place-object')).toHaveClass(/active/);

	await page.keyboard.press('1');
	await expect(page.getByTestId('hotbar-slot-foundation')).toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});

test('pressing C cycles the draw-snap mode on Wall, Polygon Wall and Ceiling tools with no console errors', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	// Slot 2 (Poly Wall), slot 2+↓ (Wall), slot 4 (Ceiling) — pressing C on each just
	// needs to not throw; the resulting snap behavior itself is covered by polygonDrawSnap.spec.ts.
	await page.keyboard.press('2');
	for (let i = 0; i < 3; i++) await page.keyboard.press('c');
	await page.keyboard.press('ArrowDown');
	for (let i = 0; i < 3; i++) await page.keyboard.press('c');
	await page.keyboard.press('4');
	for (let i = 0; i < 3; i++) await page.keyboard.press('c');

	await page.keyboard.press('1');
	expect(pageErrors).toEqual([]);
});

test('E opens the ceiling height modal and closes it again', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	await page.keyboard.press('4');
	await expect(page.getByTestId('hotbar-slot-ceiling')).toHaveClass(/active/);
	await expect(page.getByTestId('placement-height-modal')).not.toBeVisible();

	await page.keyboard.press('e');
	const modal = page.getByTestId('placement-height-modal');
	await expect(modal).toBeVisible();
	await expect(modal).toContainText('Ceiling height');
	await expect(modal).toContainText('Following top of walls');

	await page.keyboard.press('e');
	await expect(modal).not.toBeVisible();

	expect(pageErrors).toEqual([]);
});

test('E opens window and door customise with a sill / from-floor height control', async ({
	page
}) => {
	test.setTimeout(90_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	await page.keyboard.press('3');
	await expect(page.getByTestId('hotbar-slot-door')).toHaveClass(/active/);
	await page.keyboard.press('e');
	const modal = page.getByTestId('placement-customize-modal');
	await expect(modal).toBeVisible();
	await expect(modal).toContainText('Customise Door');
	await expect(page.getByTestId('placement-preview-canvas')).toBeVisible();
	await expect(page.getByTestId('placement-sill')).toBeVisible();
	await expect(modal).toContainText('From floor');
	await expect(page.getByTestId('placement-sill-number')).toHaveValue('0');
	await page.getByTestId('placement-sill').fill('0.4');
	await expect(page.getByTestId('placement-sill-number')).toHaveValue('0.4');

	await page.keyboard.press('e');
	await expect(modal).not.toBeVisible();
	await expect(page.getByTestId('placement-preview-canvas')).toHaveCount(0);

	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('hotbar-slot-window')).toHaveClass(/active/);
	await page.keyboard.press('e');
	await expect(modal).toBeVisible();
	await expect(modal).toContainText('Customise Window');
	await expect(page.getByTestId('placement-sill')).toBeVisible();
	await expect(modal.getByText('Sill', { exact: true })).toBeVisible();
	await expect(page.getByTestId('placement-sill-number')).toHaveValue('0.9');
	await page.getByTestId('placement-sill').fill('1.5');
	await expect(page.getByTestId('placement-sill-number')).toHaveValue('1.5');

	await page.keyboard.press('e');
	await expect(modal).not.toBeVisible();

	expect(pageErrors).toEqual([]);
});

test('E opens stairs customise with colour, framing, railings, hole and hole framing', async ({
	page
}) => {
	test.setTimeout(90_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	await page.keyboard.press('5');
	await expect(page.getByTestId('hotbar-slot-stairs')).toHaveClass(/active/);
	await page.keyboard.press('e');
	const modal = page.getByTestId('placement-customize-modal');
	await expect(modal).toBeVisible();
	await expect(modal).toContainText('Customise Stairs');
	await expect(page.getByTestId('placement-preview-canvas')).toBeVisible();
	await expect(page.getByTestId('placement-color')).toBeVisible();
	await expect(page.getByTestId('placement-stair-frame-on')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('placement-stair-railings-on')).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByTestId('placement-stair-opening-on')).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByTestId('placement-stair-opening-frame-on')).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	await page.getByTestId('placement-stair-frame-off').click();
	await expect(page.getByTestId('placement-stair-frame-off')).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByTestId('placement-stair-railings-off').click();
	await expect(page.getByTestId('placement-stair-railings-off')).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByTestId('placement-stair-opening-off').click();
	await expect(page.getByTestId('placement-stair-opening-off')).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByTestId('placement-stair-opening-frame-off').click();
	await expect(page.getByTestId('placement-stair-opening-frame-off')).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	await page.keyboard.press('e');
	await expect(modal).not.toBeVisible();

	expect(pageErrors).toEqual([]);
});

test('E opens the Object Library from hotbar slot 8', async ({ page }) => {
	test.setTimeout(90_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	await page.keyboard.press('8');
	await expect(page.getByTestId('hotbar-slot-place-object')).toHaveClass(/active/);
	await page.keyboard.press('e');
	const library = page.getByTestId('object-library-modal');
	await expect(library).toBeVisible();
	await expect(library).toContainText('My Builds');
	await expect(library).toContainText('Default Designs');
	await expect(page.getByTestId('mini-build-create-new')).toBeVisible();
	const chair = page.locator('[data-testid="mini-build-card"][data-name="Chair"]');
	await expect(chair).toBeVisible();

	await page.getByTestId('object-library-search').fill('book');
	await expect(page.locator('[data-testid="mini-build-card"][data-name="Bookcase"]')).toBeVisible();
	await expect(chair).toHaveCount(0);

	await page.getByTestId('object-library-done').click();
	await expect(library).not.toBeVisible();

	expect(pageErrors).toEqual([]);
});

test('the on-screen floor selector stays hidden until a foundation is targeted, and Page Up/Down never throw with no active foundation', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	await page.keyboard.press('2'); // Poly Wall — a level-aware tool
	const floorSelector = page.getByTestId('floor-selector');
	// No foundation exists anywhere in a fresh world, so nothing can ever be targeted — the selector
	// (which only appears once buildHud.level is set) must stay absent rather than show a misleading
	// "Ground Floor" for a foundation that doesn't exist.
	await expect(floorSelector).not.toBeVisible();

	await page.keyboard.press('PageUp');
	await page.keyboard.press('PageDown');

	await page.keyboard.press('1');
	expect(pageErrors).toEqual([]);
});

test('the build HUD does not sit underneath the pause button', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);
	await page.keyboard.press('3'); // Door tool — always emits a HUD, even with nothing targeted

	const hud = page.getByTestId('build-hud');
	await expect(hud).toBeVisible();

	const hudBox = await hud.boundingBox();
	const pauseBox = await page.getByTestId('pause-toggle').boundingBox();
	expect(hudBox).not.toBeNull();
	expect(pauseBox).not.toBeNull();
	const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
		a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
	expect(overlaps(hudBox!, pauseBox!)).toBe(false);

	expect(pageErrors).toEqual([]);
});

test('Wall Tool defaults to Axis + Inline snap on entry, and C still toggles it off', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	// The badge only (re-)renders once the tool's HUD is actually rebuilt (on a target change, or a
	// `C` press forcing one) — with no foundation in view there's nothing to target here, so the
	// default itself is verified indirectly, through the very first `C` press's transition:
	// `'axis-inline' -> 'off'` (the new default) is observably different from the old `'off' ->
	// 'axis'` a single press would have produced.
	await page.keyboard.press('2');
	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('hotbar-slot-wall')).toBeVisible();
	const snapBadge = page.getByTestId('snap-badge');

	await page.keyboard.press('c');
	await expect(snapBadge).not.toBeVisible(); // axis-inline -> off: proves the default was Axis + Inline, not Off

	await page.keyboard.press('c');
	await expect(snapBadge).toBeVisible();
	await expect(snapBadge).toHaveText('AXIS SNAP'); // off -> axis

	await page.keyboard.press('c');
	await expect(snapBadge).not.toBeVisible(); // axis -> off (Wall Tool never reaches axis-inline by cycling)

	// Re-selecting the tool resets back to the default rather than remembering the last choice —
	// the very next `C` press goes straight back to `off` again, not `axis`.
	await page.keyboard.press('1');
	await page.keyboard.press('2');
	await page.keyboard.press('c');
	await expect(snapBadge).not.toBeVisible();

	await page.keyboard.press('1');
	expect(pageErrors).toEqual([]);
});

test('toggles the help overlay with the H key and from the pause menu, listing controls', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	const helpOverlay = page.getByTestId('help-overlay');
	await expect(page.getByTestId('pause-toggle')).toBeVisible();
	await expect(helpOverlay).not.toBeVisible();

	await page.keyboard.press('h');
	await expect(helpOverlay).toBeVisible();
	await expect(helpOverlay).toContainText('WASD');
	await expect(helpOverlay).toContainText('Cycle draw-snap mode');

	await page.keyboard.press('Escape');
	await expect(helpOverlay).not.toBeVisible();

	await openPauseMenu(page);
	await expect(page.getByTestId('pause-settings')).toBeVisible();
	await expect(page.getByTestId('pause-creature-lab')).toBeVisible();
	await expect(page.getByTestId('pause-respawn')).toBeVisible();
	await page.getByTestId('pause-controls').click();
	await expect(helpOverlay).toBeVisible();

	await helpOverlay.getByRole('button', { name: 'Close' }).click();
	await expect(helpOverlay).not.toBeVisible();
	await expect(page.getByTestId('pause-menu')).toBeVisible();

	expect(pageErrors).toEqual([]);
});

test('puts Stairs on slot 5 and still shows Levels, Slabs and Stairs in Settings', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	const stairsSlot = page.getByTestId('hotbar-slot-stairs');
	await expect(stairsSlot).toBeVisible();

	await page.keyboard.press('5');
	await expect(stairsSlot).toHaveClass(/active/);

	await page.keyboard.press('1');
	await expect(stairsSlot).not.toHaveClass(/active/);

	await openSettingsMenu(page);
	await page.getByTestId('settings-nav-building').click();
	for (const section of ['levels', 'slabs', 'stairs']) {
		await expect(page.getByTestId(`settings-group-${section}`)).toBeVisible();
	}

	expect(pageErrors).toEqual([]);
});

test('shows the Building settings groups for Grid, Walls, Windows and Doors', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible();

	await openSettingsMenu(page);
	await page.getByTestId('settings-nav-building').click();
	for (const section of ['grid', 'walls', 'windows', 'doors']) {
		await expect(page.getByTestId(`settings-group-${section}`)).toBeVisible();
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
	await createAndEnterWorld(page);
	await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible();

	await openSettingsMenu(page);
	await page.getByTestId('settings-nav-sky').click();
	for (const section of ['hdri', 'atmosphere', 'clouds']) {
		await expect(page.getByTestId(`settings-group-${section}`)).toBeVisible();
	}

	await expect
		.poll(() => consoleMessages.some((text) => text.includes('procedural fallback environment')), {
			timeout: 10_000
		})
		.toBe(true);

	expect(pageErrors).toEqual([]);
});

test('X toggles Remove Mode, shows a Remove HUD, and restores the previously selected hotbar tool on exit', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	// Door (not Wall) — its HUD always renders something even with nothing targeted (see the
	// "build HUD does not sit underneath the debug GUI panel" test above), so its absence here is a
	// reliable signal, unlike Wall/Foundation which show no HUD at all until a foundation exists.
	const doorSlot = page.getByTestId('hotbar-slot-door');
	const removeToggle = page.getByTestId('hotbar-remove-toggle');
	const hud = page.getByTestId('build-hud');
	await expect(doorSlot).toBeVisible();
	await expect(removeToggle).toBeVisible();

	await page.keyboard.press('3'); // Door — the tool that must be remembered/restored
	await expect(doorSlot).toHaveClass(/active/);
	await expect(removeToggle).not.toHaveClass(/active/);
	await expect(hud).toContainText('DOOR');

	await page.keyboard.press('x');
	await expect(removeToggle).toHaveClass(/active/);
	// Entering Remove Mode never actually deselects the hotbar slot itself — only the visual
	// "active" highlight moves to the trash icon (see BuildToolManager's class doc comment).
	await expect(hud).toContainText('REMOVE');
	await expect(hud).toContainText('Left Click: Remove');

	await page.keyboard.press('x');
	await expect(removeToggle).not.toHaveClass(/active/);
	await expect(doorSlot).toHaveClass(/active/);
	await expect(hud).not.toContainText('REMOVE');
	await expect(hud).toContainText('DOOR');

	expect(pageErrors).toEqual([]);
});

test('clicking the hotbar trash icon toggles Remove Mode the same as the X key', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	const removeToggle = page.getByTestId('hotbar-remove-toggle');
	await expect(removeToggle).toBeVisible();

	await removeToggle.click();
	await expect(removeToggle).toHaveClass(/active/);
	await expect(page.getByTestId('build-hud')).toContainText('REMOVE');

	await removeToggle.click();
	await expect(removeToggle).not.toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});

test('selecting a hotbar slot while Remove Mode is active exits Remove Mode', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	const removeToggle = page.getByTestId('hotbar-remove-toggle');
	await expect(removeToggle).toBeVisible();

	await page.keyboard.press('x');
	await expect(removeToggle).toHaveClass(/active/);

	await page.keyboard.press('3'); // Door
	await expect(page.getByTestId('hotbar-remove-toggle')).not.toHaveClass(/active/);
	await expect(page.getByTestId('hotbar-slot-door')).toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});

test('P toggles Paint Mode, shows a Paint HUD, and restores the previously selected hotbar tool on exit', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	// Door (not Wall) — its HUD always renders something even with nothing targeted, same
	// reasoning as the equivalent Remove Mode test above.
	const doorSlot = page.getByTestId('hotbar-slot-door');
	const paintToggle = page.getByTestId('hotbar-paint-toggle');
	const hud = page.getByTestId('build-hud');
	await expect(doorSlot).toBeVisible();
	await expect(paintToggle).toBeVisible();

	await page.keyboard.press('3'); // Door — the tool that must be remembered/restored
	await expect(doorSlot).toHaveClass(/active/);
	await expect(paintToggle).not.toHaveClass(/active/);
	await expect(hud).toContainText('DOOR');

	await page.keyboard.press('p');
	await expect(paintToggle).toHaveClass(/active/);
	await expect(hud).toContainText('PAINT');
	await expect(hud).toContainText('Left Click: Paint');

	await page.keyboard.press('p');
	await expect(paintToggle).not.toHaveClass(/active/);
	await expect(doorSlot).toHaveClass(/active/);
	await expect(hud).not.toContainText('PAINT');
	await expect(hud).toContainText('DOOR');

	expect(pageErrors).toEqual([]);
});

test('clicking the hotbar paint icon toggles Paint Mode the same as the P key', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	const paintToggle = page.getByTestId('hotbar-paint-toggle');
	await expect(paintToggle).toBeVisible();

	await paintToggle.click();
	await expect(paintToggle).toHaveClass(/active/);
	await expect(page.getByTestId('build-hud')).toContainText('PAINT');

	await paintToggle.click();
	await expect(paintToggle).not.toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});

test('selecting a hotbar slot while Paint Mode is active exits Paint Mode', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	const paintToggle = page.getByTestId('hotbar-paint-toggle');
	await expect(paintToggle).toBeVisible();

	await page.keyboard.press('p');
	await expect(paintToggle).toHaveClass(/active/);

	await page.keyboard.press('3'); // Door
	await expect(page.getByTestId('hotbar-paint-toggle')).not.toHaveClass(/active/);
	await expect(page.getByTestId('hotbar-slot-door')).toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});

test('Remove Mode and Paint Mode are mutually exclusive — pressing one while the other is active switches straight over', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	const removeToggle = page.getByTestId('hotbar-remove-toggle');
	const paintToggle = page.getByTestId('hotbar-paint-toggle');
	await expect(removeToggle).toBeVisible();
	await expect(paintToggle).toBeVisible();

	await page.keyboard.press('x');
	await expect(removeToggle).toHaveClass(/active/);
	await expect(paintToggle).not.toHaveClass(/active/);

	await page.keyboard.press('p');
	await expect(paintToggle).toHaveClass(/active/);
	await expect(removeToggle).not.toHaveClass(/active/);

	await page.keyboard.press('x');
	await expect(removeToggle).toHaveClass(/active/);
	await expect(paintToggle).not.toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});

test('C opens the colour palette in Paint Mode, and it can be closed without exiting Paint Mode', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);

	const paintToggle = page.getByTestId('hotbar-paint-toggle');
	await expect(paintToggle).toBeVisible();

	await page.keyboard.press('p');
	await expect(paintToggle).toHaveClass(/active/);

	const palette = page.getByTestId('material-palette');
	await expect(palette).not.toBeVisible();

	await page.keyboard.press('c');
	await expect(palette).toBeVisible();
	await expect(palette).toContainText('Neutrals');
	await expect(palette).toContainText('Saved Colours');

	await page.getByRole('button', { name: 'Close palette' }).click();
	await expect(palette).not.toBeVisible();
	// Still in Paint Mode — closing the palette must not have exited it.
	await expect(paintToggle).toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});

test('selecting a colour swatch in the palette updates the HUD colour swatch', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page);
	await expect(page.getByTestId('hotbar-paint-toggle')).toBeVisible();

	await page.keyboard.press('p');
	await page.keyboard.press('c');

	const palette = page.getByTestId('material-palette');
	await expect(palette).toBeVisible();

	await page.getByRole('button', { name: 'Red', exact: true }).click();
	await expect(palette).not.toBeVisible();

	await expect(page.getByTestId('paint-color-swatch')).toHaveCSS(
		'background-color',
		'rgb(193, 68, 60)'
	);

	expect(pageErrors).toEqual([]);
});
