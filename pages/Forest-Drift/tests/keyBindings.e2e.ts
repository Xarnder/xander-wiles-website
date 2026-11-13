import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Key rebinding, end to end. The Controls screen isn't built yet (plan phase 4), so these tests
 * save a profile straight into storage, the same format the screen will write, and check the
 * running game follows it.
 */

const STORAGE_KEY = 'forest-drift.keybindings.v1';

type Binding = { code: string; shift?: boolean; mod?: boolean; alt?: boolean } | null;

/** Saves a profile with these overrides and makes it active before the page loads. */
async function useBindings(page: Page, overrides: Record<string, [Binding, Binding]>) {
	await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
		STORAGE_KEY,
		JSON.stringify({
			version: 1,
			activeProfileId: 'test',
			profiles: [
				{
					id: 'test',
					name: 'Test profile',
					createdAt: '2026-11-10T10:00:00.000Z',
					updatedAt: '2026-11-10T10:00:00.000Z',
					overrides
				}
			]
		})
	] as const);
}

type SceneWindow = {
	forestScene: {
		controller: { worldPosition: { x: number; z: number }; isFlying(): boolean };
	};
};

const position = (page: Page) =>
	page.evaluate(() => {
		const { x, z } = (window as unknown as SceneWindow).forestScene.controller.worldPosition;
		return { x, z };
	});

/** How far the player walks (on the ground plane) while `code` is held. */
async function distanceWhileHolding(page: Page, code: string, ms = 1200): Promise<number> {
	const before = await position(page);
	await page.keyboard.down(code);
	await page.waitForTimeout(ms);
	await page.keyboard.up(code);
	await page.waitForTimeout(150);
	const after = await position(page);
	return Math.hypot(after.x - before.x, after.z - before.z);
}

const isFlying = (page: Page) =>
	page.evaluate(() => (window as unknown as SceneWindow).forestScene.controller.isFlying());

test.describe('key rebinding', () => {
	test('a rebound movement key moves the player, and the old key no longer does', async ({
		page
	}) => {
		await useBindings(page, { 'move.forward': [{ code: 'KeyI' }, null] });
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Rebound Walk' });

		expect(await distanceWhileHolding(page, 'KeyW')).toBeLessThan(0.2);
		expect(await distanceWhileHolding(page, 'KeyI')).toBeGreaterThan(1);
		// Back (S) is untouched by the profile and still works.
		expect(await distanceWhileHolding(page, 'KeyS')).toBeGreaterThan(1);
	});

	test('a secondary key works alongside the primary', async ({ page }) => {
		await useBindings(page, { 'move.forward': [{ code: 'KeyW' }, { code: 'ArrowUp' }] });
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Two Keys' });
		// Leave Build Mode so ↑ isn't also cycling the hotbar.
		await page.keyboard.press('g');
		await expect(page.getByTestId('hotbar')).toBeHidden();

		expect(await distanceWhileHolding(page, 'KeyW')).toBeGreaterThan(1);
		expect(await distanceWhileHolding(page, 'ArrowUp')).toBeGreaterThan(1);
	});

	test('rebound global and building keys follow the profile', async ({ page }) => {
		await useBindings(page, {
			'build.toggle': [{ code: 'KeyJ' }, null],
			'ui.help': [{ code: 'KeyH', shift: true }, null]
		});
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Rebound Keys' });
		const hotbar = page.getByTestId('hotbar');
		const help = page.getByTestId('help-overlay');
		await expect(hotbar).toBeVisible();

		// G no longer toggles Build Mode; J does.
		await page.keyboard.press('g');
		await page.waitForTimeout(300);
		await expect(hotbar).toBeVisible();
		await page.keyboard.press('j');
		await expect(hotbar).toBeHidden();
		await page.keyboard.press('j');
		await expect(hotbar).toBeVisible();

		// Help is now Shift + H: a plain H does nothing.
		await page.keyboard.press('h');
		await page.waitForTimeout(300);
		await expect(help).not.toBeVisible();
		await page.keyboard.press('Shift+H');
		await expect(help).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(help).not.toBeVisible();
	});

	test('rebound flight keys toggle flight and fly up', async ({ page }) => {
		await useBindings(page, {
			'flight.toggle': [{ code: 'KeyO' }, null],
			'flight.up': [{ code: 'KeyR' }, null]
		});
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Rebound Flight' });

		await page.keyboard.press('f');
		await page.waitForTimeout(300);
		expect(await isFlying(page)).toBe(false);
		await page.keyboard.press('o');
		await expect.poll(() => isFlying(page)).toBe(true);

		const heightBefore = await page.evaluate(
			() =>
				(window as unknown as { forestScene: { controller: { worldPosition: { y: number } } } })
					.forestScene.controller.worldPosition.y
		);
		await page.keyboard.down('KeyR');
		await page.waitForTimeout(800);
		await page.keyboard.up('KeyR');
		const heightAfter = await page.evaluate(
			() =>
				(window as unknown as { forestScene: { controller: { worldPosition: { y: number } } } })
					.forestScene.controller.worldPosition.y
		);
		expect(heightAfter - heightBefore).toBeGreaterThan(1);
	});

	test('rebound hotbar and Remove Mode keys follow the profile', async ({ page }) => {
		await useBindings(page, {
			'build.slot3': [{ code: 'KeyY' }, null],
			'build.removeMode': [{ code: 'KeyZ' }, null]
		});
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Rebound Hotbar' });
		const doorSlot = page.getByTestId('hotbar-slot-door');
		const removeToggle = page.getByTestId('hotbar-remove-toggle');
		await expect(doorSlot).toBeVisible();

		// 3 no longer picks the Openings slot; Y does. 1 (not rebound) still picks Foundation.
		await page.keyboard.press('3');
		await page.waitForTimeout(300);
		await expect(doorSlot).not.toHaveClass(/active/);
		await page.keyboard.press('y');
		await expect(doorSlot).toHaveClass(/active/);
		await page.keyboard.press('1');
		await expect(page.getByTestId('hotbar-slot-foundation')).toHaveClass(/active/);

		// X no longer toggles Remove Mode; Z does, and Z again leaves it.
		await page.keyboard.press('x');
		await page.waitForTimeout(300);
		await expect(removeToggle).not.toHaveClass(/active/);
		await page.keyboard.press('z');
		await expect(removeToggle).toHaveClass(/active/);
		await page.keyboard.press('z');
		await expect(removeToggle).not.toHaveClass(/active/);
	});

	test('touch buttons keep their meaning when the keyboard is rebound', async ({ page }) => {
		// The scene's touch path presses default keys; a profile that moves Build Mode off G must
		// not stop the touch "G" (and the keyboard G must not work).
		await useBindings(page, { 'build.toggle': [{ code: 'KeyJ' }, null] });
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Touch Defaults' });
		const hotbar = page.getByTestId('hotbar');
		await expect(hotbar).toBeVisible();
		await page.evaluate(() =>
			(
				window as unknown as { forestScene: { simulateKey(code: string): void } }
			).forestScene.simulateKey('KeyG')
		);
		await expect(hotbar).toBeHidden();
		await page.keyboard.press('g');
		await page.waitForTimeout(300);
		await expect(hotbar).toBeHidden();
	});

	test('a cleared key does nothing, and Esc still pauses whatever the profile says', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));
		await useBindings(page, {
			'build.toggle': [null, null],
			// Locked: this override must be ignored.
			'ui.back': [{ code: 'KeyQ' }, null]
		});
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Cleared Key' });
		const hotbar = page.getByTestId('hotbar');

		await page.keyboard.press('g');
		await page.waitForTimeout(300);
		await expect(hotbar).toBeVisible();

		await page.keyboard.press('q');
		await page.waitForTimeout(300);
		await expect(page.getByTestId('pause-menu')).toBeHidden();
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('pause-menu')).toBeVisible();
		expect(pageErrors).toEqual([]);
	});

	test('broken saved bindings fall back to the default keys', async ({ page }) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));
		await page.addInitScript(
			([key]) => localStorage.setItem(key, '{"version":1,"activeProfileId":"x","profiles":[{'),
			[STORAGE_KEY] as const
		);
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Broken Bindings' });

		expect(await distanceWhileHolding(page, 'KeyW')).toBeGreaterThan(1);
		await page.keyboard.press('g');
		await expect(page.getByTestId('hotbar')).toBeHidden();
		expect(pageErrors).toEqual([]);
	});

	test('bad entries are skipped while good ones still apply', async ({ page }) => {
		await useBindings(page, {
			'move.forward': [{ code: 'KeyI' }, null],
			'move.back': [{ code: 'NotARealKey' }, null],
			'an.action.from.a.newer.version': [{ code: 'KeyP' }, null]
		} as Record<string, [Binding, Binding]>);
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Partly Broken' });

		expect(await distanceWhileHolding(page, 'KeyI')).toBeGreaterThan(1);
		// The broken Move back entry is dropped, so S (the default) still works.
		expect(await distanceWhileHolding(page, 'KeyS')).toBeGreaterThan(1);
	});
});

test.describe('Controls screen', () => {
	async function openFromPause(page: Page) {
		await page.getByTestId('pause-toggle').click();
		await expect(page.getByTestId('pause-menu')).toBeVisible();
		await page.getByTestId('pause-key-bindings').click();
		await expect(page.getByTestId('key-bindings-screen')).toBeVisible();
	}

	async function rebind(page: Page, id: string, slot: 0 | 1, key: string) {
		await page.getByTestId(`key-cap-${id}-${slot}`).click();
		await expect(page.getByTestId('kb-capture-bar')).toBeVisible();
		await page.keyboard.press(key);
	}

	test('fills the screen, opens from Settings and Pause, and rebinds a key that then works', async ({
		page
	}) => {
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Screen Rebind' });

		// From Settings → Controls.
		await page.getByTestId('pause-toggle').click();
		await page.getByTestId('pause-settings').click();
		await page.getByTestId('settings-nav-controls').click();
		await page.getByTestId('settings-field-controls.open').click();
		const screen = page.getByTestId('key-bindings-screen');
		await expect(screen).toBeVisible();
		const box = await screen.boundingBox();
		const viewport = page.viewportSize()!;
		expect(box?.width).toBe(viewport.width);
		expect(box?.height).toBe(viewport.height);

		await rebind(page, 'move.forward', 0, 'i');
		await expect(page.getByTestId('key-cap-move.forward-0')).toHaveText('I');
		await expect(page.getByTestId('kb-toast')).toContainText('Created “My controls”');
		await expect(page.getByTestId('profile-select')).toHaveValue(/^p-/);
		// Keys pressed while the screen is open never reach the game.
		await expect(page.getByTestId('help-overlay')).toHaveCount(0);

		await page.getByTestId('kb-done').click();
		await expect(screen).toBeHidden();
		await page.getByTestId('settings-close').click();
		await page.getByTestId('pause-resume').click();
		await expect(page.getByTestId('pause-menu')).toBeHidden();
		expect(await distanceWhileHolding(page, 'KeyI')).toBeGreaterThan(1);
		expect(await distanceWhileHolding(page, 'KeyW')).toBeLessThan(0.2);

		// The help guide names the new key.
		await page.keyboard.press('h');
		await expect(page.getByTestId('help-overlay')).toBeVisible();
		await expect(page.getByTestId('help-overlay')).toContainText('IASD');
		await page.keyboard.press('Escape');

		// Opening again from Pause shows the same profile.
		await openFromPause(page);
		await expect(page.getByTestId('key-cap-move.forward-0')).toHaveText('I');
	});

	test('shows conflicts everywhere, and Swap or Use for both resolves them', async ({ page }) => {
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Screen Conflicts' });
		await openFromPause(page);
		await expect(page.getByTestId('kb-no-conflicts')).toBeVisible();

		// Jump onto E (Customise in Build Mode): the conflict dialog asks first.
		await rebind(page, 'move.jump', 0, 'e');
		await expect(page.getByTestId('kb-conflict-dialog')).toContainText('Customise / adjust');
		await page.getByTestId('conflict-both').click();
		await expect(page.getByTestId('key-cap-move.jump-0')).toHaveClass(/conflict/);
		await expect(page.getByTestId('kb-clash-move.jump')).toContainText('Customise / adjust');
		await expect(page.getByTestId('kb-nav-badge-movement')).toBeVisible();
		await expect(page.getByTestId('kb-conflict-summary')).toContainText('conflict');
		await expect(page.getByTestId('kb-key-KeyE')).toHaveClass(/conflict/);

		// Done warns while conflicts remain.
		await page.getByTestId('kb-done').click();
		await expect(page.getByTestId('kb-confirm-close')).toBeVisible();
		await page.getByTestId('kb-fix-now').click();

		// Undo, then Swap instead: Customise takes Jump's old key (Space).
		await page.getByTestId('kb-undo').click();
		await expect(page.getByTestId('kb-no-conflicts')).toBeVisible();
		await rebind(page, 'move.jump', 0, 'e');
		await page.getByTestId('conflict-swap').click();
		await expect(page.getByTestId('kb-no-conflicts')).toBeVisible();
		await page.getByTestId('kb-nav-building').click();
		await expect(page.getByTestId('key-cap-build.customise-0')).toHaveText('Space');
	});

	test('refuses browser keys, binds Shift alone and chords, and clears a slot', async ({
		page
	}) => {
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Screen Capture' });
		await openFromPause(page);

		await rebind(page, 'ui.help', 0, 'Control+KeyW');
		await expect(page.getByTestId('kb-capture-refused')).toContainText(
			'browser or system shortcut'
		);
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('kb-capture-bar')).toBeHidden();
		await expect(page.getByTestId('key-cap-ui.help-0')).toHaveText('H');

		await rebind(page, 'ui.help', 1, 'Shift+KeyY');
		await expect(page.getByTestId('key-cap-ui.help-1')).toHaveText('Shift + Y');

		await page.getByTestId('kb-nav-movement').click();
		await page.getByTestId('key-cap-camera.zoom-1').click();
		await page.keyboard.down('Alt');
		await page.keyboard.up('Alt');
		await expect(page.getByTestId('key-cap-camera.zoom-1')).toHaveText(/Alt|Option/);

		await page.getByTestId('key-cap-camera.zoom-1').click();
		await page.getByTestId('kb-capture-clear').click();
		await expect(page.getByTestId('key-cap-camera.zoom-1')).toHaveText('+');

		// Esc is fixed.
		await page.getByTestId('kb-nav-interface').click();
		await expect(page.getByTestId('key-cap-ui.back-0')).toBeDisabled();
	});

	test('manages profiles, and downloads and loads them', async ({ page }) => {
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Screen Profiles' });
		await openFromPause(page);

		await page.getByTestId('profile-new').click();
		const rename = page.getByTestId('profile-rename-input');
		await expect(rename).toBeFocused();
		await rename.fill('Left-handed');
		await rename.press('Enter');
		await rebind(page, 'move.forward', 0, 'i');
		await expect(page.getByTestId('profile-select')).toContainText('Left-handed · 1 changed');

		// Download it.
		const downloadPromise = page.waitForEvent('download');
		await page.getByTestId('kb-download').click();
		await page.getByTestId('kb-download-active').click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(
			/^forest-drift-controls-left-handed-\d{4}-\d\d-\d\d\.json$/
		);
		const path = await download.path();

		// Switch to Default: W is back.
		await page.getByTestId('profile-select').selectOption('default');
		await expect(page.getByTestId('key-cap-move.forward-0')).toHaveText('W');

		// Delete Left-handed, then load it back from the file.
		await page.getByTestId('profile-select').selectOption({ label: 'Left-handed · 1 changed' });
		await page.getByTestId('profile-delete').click();
		await page.getByTestId('kb-confirm-yes').click();
		await expect(page.getByTestId('profile-select')).toHaveValue('default');

		await page.getByTestId('kb-load-input').setInputFiles(path);
		await expect(page.getByTestId('kb-load-dialog')).toContainText('Left-handed · 1 changed key');
		await page.getByTestId('kb-load-use').click();
		await expect(page.getByTestId('kb-toast')).toContainText('Loaded “Left-handed”');
		await expect(page.getByTestId('key-cap-move.forward-0')).toHaveText('I');

		// A file that isn't a controls file changes nothing.
		await page.getByTestId('kb-load-input').setInputFiles({
			name: 'notes.json',
			mimeType: 'application/json',
			buffer: Buffer.from('{"hello":"world"}')
		});
		await expect(page.getByTestId('kb-load-error')).toContainText(
			'isn’t a Forest Drift controls file'
		);
	});

	test('opens from the main menu settings before entering a world', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('landing-menu')).toBeVisible({ timeout: 30_000 });
		await page.getByRole('button', { name: 'Settings', exact: true }).click();
		await page.getByTestId('settings-nav-controls').click();
		await page.getByTestId('settings-field-controls.open').click();
		await expect(page.getByTestId('key-bindings-screen')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('key-bindings-screen')).toBeHidden();
		await expect(page.getByTestId('settings-overlay')).toBeVisible();
	});

	test('fits a phone screen without sideways scrolling', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto('/');
		await expect(page.getByTestId('landing-menu')).toBeVisible({ timeout: 30_000 });
		await page.evaluate(() => window.dispatchEvent(new Event('forest:open-key-bindings')));
		const screen = page.getByTestId('key-bindings-screen');
		await expect(screen).toBeVisible();
		const overflow = await screen.evaluate((el) => el.scrollWidth - el.clientWidth);
		expect(overflow).toBeLessThanOrEqual(0);
		await expect(page.getByTestId('key-cap-move.forward-0')).toBeVisible();
	});
});
