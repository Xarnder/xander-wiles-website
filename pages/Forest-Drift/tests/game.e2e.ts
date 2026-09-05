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

test('pressing C cycles the draw-snap mode on Wall, Polygon Wall and Ceiling tools with no console errors', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	// Slot 2 (Wall), slot 5 (Polygon/Continuous Wall), slot 6 (Ceiling) — pressing C on each just
	// needs to not throw; the resulting snap behavior itself is covered by polygonDrawSnap.spec.ts.
	for (const slot of ['2', '5', '6']) {
		await page.keyboard.press(slot);
		await page.keyboard.press('c');
		await page.keyboard.press('c');
		await page.keyboard.press('c');
	}

	await page.keyboard.press('1');
	expect(pageErrors).toEqual([]);
});

test('the on-screen floor selector stays hidden until a foundation is targeted, and Page Up/Down never throw with no active foundation', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	await page.keyboard.press('2'); // Wall Tool — a level-aware tool
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

test('the build HUD does not sit underneath the debug GUI panel — its hints and blocking reasons must actually be readable', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await page.keyboard.press('3'); // Window tool — always emits a HUD, even with nothing targeted

	const hud = page.getByTestId('build-hud');
	await expect(hud).toBeVisible();

	// lil-gui auto-places itself at the top-right, full viewport height; the HUD used to be drawn
	// directly underneath it, hiding every hint the build tools produce.
	const hudBox = await hud.boundingBox();
	const guiBox = await page.locator('.lil-gui.lil-root').first().boundingBox();
	expect(hudBox).not.toBeNull();
	expect(guiBox).not.toBeNull();
	const overlaps =
		hudBox!.x < guiBox!.x + guiBox!.width &&
		hudBox!.x + hudBox!.width > guiBox!.x &&
		hudBox!.y < guiBox!.y + guiBox!.height &&
		hudBox!.y + hudBox!.height > guiBox!.y;
	expect(overlaps).toBe(false);

	expect(pageErrors).toEqual([]);
});

test('Wall Tool defaults to Axis + Inline snap on entry, and C still toggles it off', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	// The badge only (re-)renders once the tool's HUD is actually rebuilt (on a target change, or a
	// `C` press forcing one) — with no foundation in view there's nothing to target here, so the
	// default itself is verified indirectly, through the very first `C` press's transition:
	// `'axis-inline' -> 'off'` (the new default) is observably different from the old `'off' ->
	// 'axis'` a single press would have produced.
	await expect(page.getByTestId('hotbar-slot-wall')).toBeVisible();
	await page.keyboard.press('2');
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

test('toggles the help overlay with the H key and the help button, listing controls', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	const helpOverlay = page.getByTestId('help-overlay');
	await expect(page.getByTestId('help-toggle')).toBeVisible();
	await expect(helpOverlay).not.toBeVisible();

	await page.keyboard.press('h');
	await expect(helpOverlay).toBeVisible();
	await expect(helpOverlay).toContainText('WASD');
	await expect(helpOverlay).toContainText('Cycle draw-snap mode');

	await page.keyboard.press('Escape');
	await expect(helpOverlay).not.toBeVisible();

	await page.getByTestId('help-toggle').click();
	await expect(helpOverlay).toBeVisible();

	await page.getByTestId('help-toggle').click();
	await expect(helpOverlay).not.toBeVisible();

	expect(pageErrors).toEqual([]);
});

test('shows Ceiling, Floor, Roof and Stairs hotbar slots in slots 6-9, and a level selector in the GUI', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	const ceilingSlot = page.getByTestId('hotbar-slot-ceiling');
	const floorSlot = page.getByTestId('hotbar-slot-floor');
	const roofSlot = page.getByTestId('hotbar-slot-flat-roof');
	const stairsSlot = page.getByTestId('hotbar-slot-stairs');
	await expect(ceilingSlot).toBeVisible();
	await expect(floorSlot).toBeVisible();
	await expect(roofSlot).toBeVisible();
	await expect(stairsSlot).toBeVisible();

	await page.keyboard.press('6');
	await expect(ceilingSlot).toHaveClass(/active/);

	await page.keyboard.press('7');
	await expect(floorSlot).toHaveClass(/active/);
	await expect(ceilingSlot).not.toHaveClass(/active/);

	await page.keyboard.press('8');
	await expect(roofSlot).toHaveClass(/active/);

	await page.keyboard.press('9');
	await expect(stairsSlot).toHaveClass(/active/);
	await expect(roofSlot).not.toHaveClass(/active/);

	await page.keyboard.press('1');
	await expect(stairsSlot).not.toHaveClass(/active/);

	const buildingFolder = page.locator('.lil-title', { hasText: 'Building' }).first();
	await expect(buildingFolder).toBeVisible({ timeout: 10_000 });
	for (const sectionTitle of ['Levels', 'Slabs', 'Stairs']) {
		await expect(page.locator('.lil-title', { hasText: sectionTitle }).first()).toBeVisible();
	}

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

test('X toggles Remove Mode, shows a Remove HUD, and restores the previously selected hotbar tool on exit', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

	// Window (not Wall) — its HUD always renders something even with nothing targeted (see the
	// "build HUD does not sit underneath the debug GUI panel" test above), so its absence here is a
	// reliable signal, unlike Wall/Foundation which show no HUD at all until a foundation exists.
	const windowSlot = page.getByTestId('hotbar-slot-window');
	const removeToggle = page.getByTestId('hotbar-remove-toggle');
	const hud = page.getByTestId('build-hud');
	await expect(windowSlot).toBeVisible();
	await expect(removeToggle).toBeVisible();

	await page.keyboard.press('3'); // Window — the tool that must be remembered/restored
	await expect(windowSlot).toHaveClass(/active/);
	await expect(removeToggle).not.toHaveClass(/active/);
	await expect(hud).toContainText('WINDOW');

	await page.keyboard.press('x');
	await expect(removeToggle).toHaveClass(/active/);
	// Entering Remove Mode never actually deselects the hotbar slot itself — only the visual
	// "active" highlight moves to the trash icon (see BuildToolManager's class doc comment).
	await expect(hud).toContainText('REMOVE');
	await expect(hud).toContainText('Left Click: Remove');

	await page.keyboard.press('x');
	await expect(removeToggle).not.toHaveClass(/active/);
	await expect(windowSlot).toHaveClass(/active/);
	await expect(hud).not.toContainText('REMOVE');
	await expect(hud).toContainText('WINDOW');

	expect(pageErrors).toEqual([]);
});

test('clicking the hotbar trash icon toggles Remove Mode the same as the X key', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');

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

	const removeToggle = page.getByTestId('hotbar-remove-toggle');
	await expect(removeToggle).toBeVisible();

	await page.keyboard.press('x');
	await expect(removeToggle).toHaveClass(/active/);

	await page.keyboard.press('3'); // Window
	await expect(page.getByTestId('hotbar-remove-toggle')).not.toHaveClass(/active/);
	await expect(page.getByTestId('hotbar-slot-window')).toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});
