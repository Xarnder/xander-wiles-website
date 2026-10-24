import { expect, test } from '@playwright/test';

test('preview stays visible until the PNG is ready and survives PNG failure', async ({ page }) => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route('**/*countryside*.png', async (route) => {
		await gate;
		await route.abort();
	});
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await expect(page.getByTestId('landing-menu')).toBeVisible();
	await expect(page.locator('.landscape img').first()).toBeVisible();
	await expect(page.getByTestId('full-background')).toHaveCount(0);
	await expect
		.poll(() =>
			page
				.locator('.landscape img')
				.first()
				.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
		)
		.toBe(true);
	release();
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('full-background')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
});

test('full background, responsive menu, preferences and world navigation', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('full-background')).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('data-ui-wood', 'ready');
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 390, height: 844 },
		{ width: 320, height: 568 },
		{ width: 280, height: 653 },
		{ width: 360, height: 640 },
		{ width: 768, height: 1024 },
		{ width: 1920, height: 1080 },
		{ width: 844, height: 390 }
	]) {
		await page.setViewportSize(viewport);
		for (const name of ['Play', 'Worlds', 'Settings', 'Online']) {
			const button = page.getByRole('button', { name, exact: true });
			await expect(button).toBeInViewport({ ratio: 1 });
			expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
		}
		await expect(page.getByRole('button', { name: 'Help & Credits', exact: true })).toBeInViewport({
			ratio: 1
		});
		expect(
			await page.getByTestId('landing-menu').evaluate((el) => el.scrollWidth <= el.clientWidth)
		).toBe(true);
		const play = page.getByRole('button', { name: 'Play', exact: true });
		await expect(play).toBeInViewport();
		const bounds = (await play.boundingBox())!;
		expect(bounds.x).toBeGreaterThanOrEqual(0);
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
		await page.screenshot({ path: test.info().outputPath(`landing-${viewport.width}.png`) });
	}
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await page.getByLabel('Graphics quality').selectOption('medium');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await page.reload();
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await expect(page.getByLabel('Graphics quality')).toHaveValue('medium');
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Worlds', exact: true }).click();
	await expect(page.getByTestId('worlds-screen')).toBeVisible();
	await page.getByRole('button', { name: '← Main menu', exact: true }).click();
	await expect(page.getByTestId('landing-menu')).toBeVisible();
});

test('full-screen personal settings exclude world controls and persist audio', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await expect(page.getByTestId('settings-nav-graphics')).toBeVisible();
	await expect(page.getByTestId('settings-nav-world')).toHaveCount(0);
	await expect(page.getByTestId('settings-nav-terrain')).toHaveCount(0);
	await expect(page.getByTestId('settings-nav-building')).toHaveCount(0);
	await page.getByTestId('settings-nav-audio').click();
	const master = page.getByTestId('settings-field-audio.master').locator('input[type="number"]');
	await master.fill('37');
	await master.press('Tab');
	await page.getByLabel('Mute all audio').check();
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 390, height: 844 },
		{ width: 280, height: 653 },
		{ width: 844, height: 390 }
	]) {
		await page.setViewportSize(viewport);
		const box = (await page.locator('.settings-panel').boundingBox())!;
		expect(box.width).toBe(viewport.width);
		expect(box.height).toBe(viewport.height);
		await expect(page.getByTestId('settings-close')).toBeInViewport();
		expect(
			await page.locator('.settings-panel').evaluate((el) => el.scrollWidth <= el.clientWidth)
		).toBe(true);
		await page.screenshot({ path: test.info().outputPath(`settings-${viewport.width}.png`) });
	}
	await page.getByTestId('settings-close').click();
	await page.reload();
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await page.getByTestId('settings-nav-audio').click();
	await expect(master).toHaveValue('37');
	await expect(page.getByLabel('Mute all audio')).toBeChecked();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('settings-overlay')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
});

test('help and credits replace Quit with accessible responsive tabs', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Quit', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Help & Credits', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Help & Credits' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Find your place in the forest.' })).toBeVisible();
	await page.getByRole('tab', { name: 'Help', exact: true }).focus();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByRole('tab', { name: 'Credits', exact: true })).toBeFocused();
	await expect(page.getByRole('heading', { name: 'Xander Wiles', exact: true })).toBeVisible();
	await expect
		.poll(() =>
			page
				.getByAltText('Xander Wiles')
				.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)
		)
		.toBe(true);
	for (const width of [1440, 390, 280]) {
		await page.setViewportSize({ width, height: 900 });
		const dialog = page.getByRole('dialog', { name: 'Help & Credits' });
		expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
		await page.screenshot({ path: test.info().outputPath(`credits-${width}.png`) });
	}
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Help & Credits', exact: true })).toBeFocused();
});

test('Online saves invite links without joining, keeps them after reload, and can forget them', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Online', exact: true }).click();
	const dialog = page.getByTestId('join-world-dialog');
	const save = page.getByTestId('save-invite-link');
	await expect(save).toBeEnabled();
	await save.click();
	await expect(dialog.getByRole('alert')).toContainText('whole invite link');
	await page.getByTestId('join-world-reference').fill('https://example.com/?mp=world-saved-1111');
	await save.click();
	await expect(dialog.getByRole('alert')).toContainText('including its invite code');
	const invite = 'invite-saved-abcdef0123456789';
	const link = `https://example.com/?mp=world-saved-1111#invite=${invite}`;
	await page.getByTestId('join-world-reference').fill(link);
	await page.getByTestId('save-invite-name').fill('Friday building world');
	await save.click();
	await expect(page.getByTestId('save-invite-success')).toContainText('saved on this device');
	await expect(page.getByTestId('landing-menu')).toBeVisible();
	await expect(page.getByTestId('join-world-name')).toHaveValue('');
	await expect(page.getByTestId('recent-worlds')).toContainText('Friday building world');
	await page.setViewportSize({ width: 390, height: 844 });
	await dialog.evaluate((element) => {
		element.scrollTop = 0;
	});
	await page.screenshot({ path: test.info().outputPath('online-saved-links-mobile.png') });
	await page.reload();
	await page.getByRole('button', { name: 'Online', exact: true }).click();
	await expect(page.getByTestId('recent-worlds')).toContainText('Friday building world');
	await page.getByTestId('join-world-reference').fill(link);
	await page.getByTestId('save-invite-name').fill('Friday world');
	await save.click();
	await expect(page.getByTestId('recent-world-join')).toHaveCount(1);
	await expect(page.getByTestId('recent-worlds')).toContainText('Friday world');
	let usedInvite: string | undefined;
	await page.route('**/w/world-saved-1111/snapshot', async (route) => {
		usedInvite = route.request().headers()['authorization'];
		await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
	});
	await page.getByTestId('join-world-name').fill('Sam');
	await page.getByTestId('recent-world-join').click();
	await expect(dialog.getByRole('alert')).toContainText("isn't valid");
	expect(usedInvite).toBe(`Bearer ${invite}`);
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.getByRole('button', { name: 'Online', exact: true }).click();
	await page.getByRole('button', { name: 'Forget Friday world', exact: true }).click();
	await expect(page.getByTestId('recent-worlds')).toHaveCount(0);
	await page.reload();
	await page.getByRole('button', { name: 'Online', exact: true }).click();
	await expect(page.getByTestId('recent-worlds')).toHaveCount(0);
});

test('Online explains joining and only creates role-specific invites after the server accepts the owner password', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Online', exact: true }).click();
	const dialog = page.getByTestId('join-world-dialog');
	await dialog.getByRole('tab', { name: 'How it works', exact: true }).click();
	const help = dialog.getByRole('tabpanel', { name: 'How it works' });
	await expect(help).toContainText('Join with an invite');
	await expect(help).toContainText('Save a link for later');
	await expect(help).toContainText('Roles and permissions');
	await expect(help).toContainText('Guests do not need the owner password');
	await dialog.getByRole('tab', { name: 'Owner', exact: true }).click();
	const create = page.getByTestId('owner-create-invites');
	await expect(create).toBeDisabled();
	await expect(page.getByTestId('owner-world').locator('option')).not.toHaveCount(0);
	let attempts = 0;
	await page.route('**/w', async (route) => {
		attempts++;
		if (route.request().headers()['authorization'] !== 'Bearer test-owner-password') {
			await route.fulfill({
				status: 401,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'That owner password is not correct.' })
			});
			return;
		}
		await route.fulfill({
			status: 201,
			contentType: 'application/json',
			body: JSON.stringify({
				worldId: 'owner-world-1234',
				name: 'Owner test world',
				invites: {
					owner: 'owner-invite-token-123456789',
					editor: 'builder-invite-token-123456789',
					viewer: 'visitor-invite-token-123456789'
				}
			})
		});
	});
	await page.getByTestId('owner-password').fill('wrong-password');
	await create.click();
	await expect(dialog.getByRole('alert')).toContainText('owner password is not correct');
	await expect(page.getByTestId('invite-link-viewer')).toHaveCount(0);
	await page.getByTestId('owner-password').fill('test-owner-password');
	await page.getByTestId('owner-invite-role').selectOption('viewer');
	await create.click();
	await expect(page.getByTestId('owner-publish-success')).toContainText('Owner test world');
	await expect(page.getByRole('textbox', { name: 'Visitor link', exact: true })).toHaveValue(
		/#invite=visitor-invite-token/
	);
	await page.getByTestId('owner-invite-role').selectOption('editor');
	await expect(page.getByRole('textbox', { name: 'Builder link', exact: true })).toHaveValue(
		/#invite=builder-invite-token/
	);
	await expect(page.getByRole('textbox', { name: 'Owner link', exact: true })).not.toBeVisible();
	expect(attempts).toBe(2);
	await page.evaluate(() =>
		Object.defineProperty(navigator.clipboard, 'writeText', {
			configurable: true,
			value: () => Promise.reject(new Error('Clipboard blocked'))
		})
	);
	const builderInvite = page.getByTestId('invite-link-editor');
	await builderInvite.getByRole('button', { name: 'Copy', exact: true }).click();
	await expect(builderInvite.getByRole('status')).toContainText('copy it manually');
	await builderInvite.locator('input').click();
	expect(
		await builderInvite
			.locator('input')
			.evaluate(
				(input: HTMLInputElement) =>
					input.selectionStart === 0 && input.selectionEnd === input.value.length
			)
	).toBe(true);
	await page.setViewportSize({ width: 390, height: 844 });
	await dialog.evaluate((element) => {
		element.scrollTop = 0;
	});
	await page.screenshot({ path: test.info().outputPath('online-owner-mobile.png') });
	await dialog.getByRole('tab', { name: 'How it works', exact: true }).click();
	await dialog.evaluate((element) => {
		element.scrollTop = 0;
	});
	await page.screenshot({ path: test.info().outputPath('online-instructions-mobile.png') });
	await dialog.getByRole('tab', { name: 'Join', exact: true }).click();
	await expect(page.getByTestId('recent-worlds')).toContainText('Owner test world');
});
