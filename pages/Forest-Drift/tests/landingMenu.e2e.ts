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
