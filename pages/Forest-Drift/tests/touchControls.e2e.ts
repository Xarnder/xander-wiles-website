import { expect, test } from '@playwright/test';

test.describe('Touch / iPad Controls', () => {
	test('displays iPad touch controls and starts gameplay with tap', async ({ page }) => {
		test.setTimeout(260_000);
		const pageErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));

		// Load with touch enabled
		await page.goto('/?touch=1');

		await expect(page.getByTestId('worlds-screen')).toBeVisible({ timeout: 15_000 });
		await page.getByTestId('play-default-world').click();

		// Wait for canvas to load
		await expect(page.getByTestId('canvas-container').locator('canvas')).toBeVisible({
			timeout: 20_000
		});

		// Instructions overlay shows "Tap to explore" and "Tap to Play" button
		const instructions = page.locator('.instructions');
		await expect(instructions).toBeVisible();
		await expect(instructions).toContainText('Tap to explore');
		const startBtn = page.getByTestId('touch-start-btn');
		await expect(startBtn).toBeVisible();

		// Tap to start gameplay
		await startBtn.click();

		// Instructions fade out
		await expect(instructions).not.toBeVisible();

		// Touch Controls UI layer is active
		const touchControls = page.getByTestId('touch-controls');
		await expect(touchControls).toBeVisible();

		// Movement cluster: virtual joystick, run, jump
		await expect(page.getByTestId('touch-joystick')).toBeVisible();
		await expect(page.getByTestId('touch-run-btn')).toBeVisible();
		await expect(page.getByTestId('touch-jump-btn')).toBeVisible();

		// Look swipe zone
		await expect(page.getByTestId('touch-look-zone')).toBeVisible();

		// Top mode buttons: Build, Remove, Paint, Move, Music
		await expect(page.getByTestId('touch-build-toggle')).toBeVisible();
		await expect(page.getByTestId('touch-remove-toggle')).toBeVisible();
		await expect(page.getByTestId('touch-paint-toggle')).toBeVisible();
		await expect(page.getByTestId('touch-move-toggle')).toBeVisible();
		const musicToggle = page.getByTestId('touch-music-toggle');
		await expect(musicToggle).toBeVisible();
		await expect(musicToggle.locator('img')).toHaveAttribute(
			'src',
			/(music.*\.svg|data:image\/svg\+xml)/
		);

		// Tapping Music toggle enters Music Mode and adds active class
		await musicToggle.click();
		await expect(musicToggle).toHaveClass(/active/);
		// Tapping Music toggle again exits Music Mode
		await musicToggle.click();
		await expect(musicToggle).not.toHaveClass(/active/);

		// Primary action buttons: Place, Cancel
		await expect(page.getByTestId('touch-place-btn')).toBeVisible();
		await expect(page.getByTestId('touch-cancel-btn')).toBeVisible();

		// Secondary tools: Undo, Snap, Type, Rotate
		await expect(page.getByTestId('touch-undo-btn')).toBeVisible();
		await expect(page.getByTestId('touch-snap-btn')).toBeVisible();
		await expect(page.getByTestId('touch-variant-btn')).toBeVisible();
		await expect(page.getByTestId('touch-rotate-btn')).toBeVisible();

		// Toggle Sprint button changes state
		await page.getByTestId('touch-run-btn').click();
		await expect(page.getByTestId('touch-run-btn')).toHaveClass(/active/);
		await page.getByTestId('touch-run-btn').click();
		await expect(page.getByTestId('touch-run-btn')).not.toHaveClass(/active/);

		// Build Mode is ON by default: hotbar is visible and toggle is active
		await expect(page.getByTestId('hotbar')).toBeVisible();
		await expect(page.getByTestId('touch-build-toggle')).toHaveClass(/active/);

		// Tapping Build toggle turns build mode off and hides hotbar
		await page.getByTestId('touch-build-toggle').click();
		await expect(page.getByTestId('hotbar')).not.toBeVisible();
		await expect(page.getByTestId('touch-build-toggle')).not.toHaveClass(/active/);

		// Tapping Build toggle again restores build mode and hotbar
		await page.getByTestId('touch-build-toggle').click();
		await expect(page.getByTestId('hotbar')).toBeVisible();
		await expect(page.getByTestId('touch-build-toggle')).toHaveClass(/active/);

		// Tap hotbar slot to change tools
		await page.getByTestId('hotbar-slot-polygon-wall').click();
		await expect(page.getByTestId('hotbar-slot-polygon-wall')).toHaveClass(/active/);

		// Tap touch variant button to switch tool variant inside slot
		await page.getByTestId('touch-variant-btn').click();
		await expect(page.getByTestId('hotbar-slot-wall')).toHaveClass(/active/);

		// Verify Touch Edit button appears for customizable tools and opens scrollable edit modal
		const editBtn = page.getByTestId('touch-edit-btn');
		await expect(editBtn).toBeVisible();
		await editBtn.click();

		const customizeModal = page.getByTestId('placement-customize-modal');
		await expect(customizeModal).toBeVisible();
		const panel = customizeModal;

		// Verify panel has scrollable overflow enabled
		const panelOverflowY = await panel.evaluate((el) => window.getComputedStyle(el).overflowY);
		expect(['auto', 'scroll']).toContain(panelOverflowY);

		// Close edit modal via close button
		const closeCustomiseBtn = customizeModal.locator('button[aria-label="Close customise"]');
		await expect(closeCustomiseBtn).toBeVisible();
		await closeCustomiseBtn.click();
		await expect(customizeModal).not.toBeVisible();

		// Verify hotbar slot labels are strictly single-line (never wrap to new line)
		const slotLabels = page.locator('.slot-label');
		const labelCount = await slotLabels.count();
		expect(labelCount).toBeGreaterThan(0);
		for (let i = 0; i < labelCount; i++) {
			const label = slotLabels.nth(i);
			const whiteSpace = await label.evaluate((el) => window.getComputedStyle(el).whiteSpace);
			expect(whiteSpace).toBe('nowrap');
		}

		// Floor selector is visible on the right side for level-aware tools
		const floorSelector = page.getByTestId('floor-selector');
		await expect(floorSelector).toBeVisible();
		const selectorBox = (await floorSelector.boundingBox())!;
		// Positioned on the right side of the screen (> 75% of 1280px width)
		expect(selectorBox.x + selectorBox.width).toBeGreaterThan(1280 * 0.75);

		// Up & Down arrow buttons are interactive
		const upBtn = page.getByTestId('floor-up');
		const downBtn = page.getByTestId('floor-down');
		await expect(upBtn).toBeVisible();
		await expect(downBtn).toBeVisible();

		// Tapping floor arrow works in touch mode
		if (await upBtn.isEnabled()) {
			await upBtn.click();
			await expect(page.getByTestId('floor-name')).not.toHaveText('');
			if (await downBtn.isEnabled()) {
				await downBtn.click();
			}
		}

		// Ensure floor selector does not collide with bottom action cluster or top bar
		const actionsCluster = page.locator('.touch-actions-cluster');
		const actionsBox = (await actionsCluster.boundingBox())!;
		expect(selectorBox.y + selectorBox.height).toBeLessThan(actionsBox.y);

		// Open Help via touch button
		await page.getByTestId('touch-help-btn').click();
		const helpOverlay = page.getByTestId('help-overlay');
		await expect(helpOverlay).toBeVisible();
		await expect(helpOverlay).toContainText('Touch / iPad Controls');
		await expect(helpOverlay).toContainText('Virtual Joystick');
		await expect(helpOverlay).toContainText('Swipe to Look');

		// Close help
		await page.locator('.help-close').click();
		await expect(helpOverlay).not.toBeVisible();

		// Open Pause menu via touch button
		await page.getByTestId('touch-pause-btn').click();
		await expect(page.getByTestId('pause-menu')).toBeVisible();

		// Resume game
		await page.getByTestId('pause-resume').click();
		await expect(page.getByTestId('pause-menu')).not.toBeVisible();
		await expect(touchControls).toBeVisible();

		// Contextual Door Hover Button:
		// When hovering/aiming at a door, Open Door buttons appear both under the crosshair and in action cluster
		await expect(page.getByTestId('touch-door-button')).not.toBeVisible();
		await page.evaluate(() => {
			(window as any).__setTestLookedAtDoor?.('door-sample-1');
		});
		const doorHoverBtn = page.getByTestId('touch-door-button');
		const doorClusterBtn = page.getByTestId('touch-door-cluster-btn');
		await expect(doorHoverBtn).toBeVisible();
		await expect(doorHoverBtn).toContainText('Open Door');
		await expect(doorHoverBtn.locator('img')).toHaveAttribute('src', /(open.*\.svg|data:image\/svg\+xml)/);
		await expect(doorClusterBtn).toBeVisible();
		await expect(doorClusterBtn).toContainText('Open Door');

		// Capture screenshot with the contextual door hover button visible
		await page.screenshot({
			path: '/Users/xanderwiles/.gemini/antigravity-ide/brain/c76a6ac6-8fac-473c-a095-69a31c283f0c/touch_door_hover_screenshot.png'
		});

		// Clear door hover state
		await page.evaluate(() => {
			(window as any).__setTestLookedAtDoor?.(null);
		});
		await expect(doorHoverBtn).not.toBeVisible();

		// Capture screenshot of the gameplay screen with raised UI elements
		await page.screenshot({
			path: '/Users/xanderwiles/.gemini/antigravity-ide/brain/c76a6ac6-8fac-473c-a095-69a31c283f0c/touch_controls_screenshot.png'
		});

		// --- Test Phone Landscape (e.g. iPhone 13/14 landscape 844x390) ---
		await page.setViewportSize({ width: 844, height: 390 });
		await page.waitForTimeout(300);
		await expect(touchControls).toBeVisible();
		await expect(page.getByTestId('touch-joystick')).toBeVisible();
		await expect(page.getByTestId('hotbar')).toBeVisible();
		await expect(page.getByTestId('touch-place-btn')).toBeVisible();

		// Floor selector on landscape phone: right side, above action cluster, no collision
		await expect(floorSelector).toBeVisible();
		const landscapeBox = (await floorSelector.boundingBox())!;
		expect(landscapeBox.x + landscapeBox.width).toBeGreaterThan(844 * 0.75);
		const landscapeActionsBox = (await actionsCluster.boundingBox())!;
		expect(landscapeBox.y + landscapeBox.height).toBeLessThan(landscapeActionsBox.y);

		// Utility buttons (Touch: On/Off & Pause) sit completely above joystick and run button
		const utilityBox = (await page.locator('.utility-buttons').boundingBox())!;
		const joystickBox = (await page.getByTestId('touch-joystick').boundingBox())!;
		const runBox = (await page.getByTestId('touch-run-btn').boundingBox())!;
		expect(utilityBox.y + utilityBox.height).toBeLessThanOrEqual(joystickBox.y);
		expect(utilityBox.y + utilityBox.height).toBeLessThanOrEqual(runBox.y);

		// Instructions / Guide (Build HUD) is shrunk and sits above utility buttons without collision
		const buildHud = page.getByTestId('build-hud');
		if (await buildHud.isVisible()) {
			const buildHudBox = (await buildHud.boundingBox())!;
			expect(buildHudBox.y + buildHudBox.height).toBeLessThanOrEqual(utilityBox.y);
		}

		await page.screenshot({
			path: '/Users/xanderwiles/.gemini/antigravity-ide/brain/c76a6ac6-8fac-473c-a095-69a31c283f0c/phone_landscape_screenshot.png'
		});

		// Switch to Stairs tool (which has rich options: railings, framing, hole, width, color)
		await page.getByTestId('hotbar-slot-stairs').click();
		await expect(page.getByTestId('hotbar-slot-stairs')).toHaveClass(/active/);

		// Verify Edit Modal in Landscape on phone: fits inside viewport
		await editBtn.click();
		await expect(customizeModal).toBeVisible();
		const landscapePanelBox = (await panel.boundingBox())!;
		expect(landscapePanelBox.height).toBeLessThanOrEqual(390);
		expect(landscapePanelBox.y).toBeGreaterThanOrEqual(0);

		// Verify CSS scrollable overflow is enabled on the modal panel
		const landscapeOverflowY = await panel.evaluate((el) => window.getComputedStyle(el).overflowY);
		expect(['auto', 'scroll']).toContain(landscapeOverflowY);

		// In short landscape viewport (e.g. 320px height with mobile browser address bars), verify scrollability
		await page.setViewportSize({ width: 844, height: 320 });
		await page.waitForTimeout(200);
		const shortScrollable = await panel.evaluate((el) => el.scrollHeight > el.clientHeight);
		expect(shortScrollable).toBe(true);

		await panel.evaluate((el) => {
			el.scrollTop = 50;
		});
		const shortScrolled = await panel.evaluate((el) => el.scrollTop);
		expect(shortScrolled).toBeGreaterThan(0);

		await page.screenshot({
			path: '/Users/xanderwiles/.gemini/antigravity-ide/brain/c76a6ac6-8fac-473c-a095-69a31c283f0c/phone_landscape_edit_modal.png'
		});

		await closeCustomiseBtn.click();
		await expect(customizeModal).not.toBeVisible();

		// --- Test Phone Portrait (e.g. iPhone 13/14 portrait 390x844) ---
		await page.setViewportSize({ width: 390, height: 844 });
		await page.waitForTimeout(300);
		await expect(touchControls).toBeVisible();
		await expect(page.getByTestId('touch-joystick')).toBeVisible();
		await expect(page.getByTestId('hotbar')).toBeVisible();
		await expect(page.getByTestId('touch-place-btn')).toBeVisible();

		// Floor selector on portrait phone: right side, above action cluster, no collision
		await expect(floorSelector).toBeVisible();
		const portraitBox = (await floorSelector.boundingBox())!;
		expect(portraitBox.x + portraitBox.width).toBeGreaterThan(390 * 0.7);
		const portraitActionsBox = (await actionsCluster.boundingBox())!;
		expect(portraitBox.y + portraitBox.height).toBeLessThan(portraitActionsBox.y);

		await page.screenshot({
			path: '/Users/xanderwiles/.gemini/antigravity-ide/brain/c76a6ac6-8fac-473c-a095-69a31c283f0c/phone_portrait_screenshot.png'
		});

		// In constrained portrait viewport (e.g. 390x600 phone with keyboard or browser bars):
		await page.setViewportSize({ width: 390, height: 600 });
		await page.waitForTimeout(200);

		// Verify Edit Modal in Portrait on phone: fits inside viewport, is scrollable
		await editBtn.click();
		await expect(customizeModal).toBeVisible();
		const portraitPanelBox = (await panel.boundingBox())!;
		expect(portraitPanelBox.height).toBeLessThanOrEqual(600);
		expect(portraitPanelBox.y).toBeGreaterThanOrEqual(0);

		const portraitScrollable = await panel.evaluate((el) => el.scrollHeight > el.clientHeight);
		expect(portraitScrollable).toBe(true);

		await panel.evaluate((el) => {
			el.scrollTop = 60;
		});
		const portraitScrolled = await panel.evaluate((el) => el.scrollTop);
		expect(portraitScrolled).toBeGreaterThan(0);

		await page.screenshot({
			path: '/Users/xanderwiles/.gemini/antigravity-ide/brain/c76a6ac6-8fac-473c-a095-69a31c283f0c/phone_portrait_edit_modal.png'
		});

		await closeCustomiseBtn.click();
		await expect(customizeModal).not.toBeVisible();

		// Reset viewport
		await page.setViewportSize({ width: 1280, height: 720 });

		expect(pageErrors).toEqual([]);
	});
});
