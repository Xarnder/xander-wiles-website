import { expect, test } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

test('menus share one baked wood image across dialogs and touch layouts', async ({ page }) => {
	let woodWorkers = 0;
	page.on('worker', (worker) => {
		if (worker.url().includes('woodTexture')) woodWorkers++;
	});
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('data-ui-wood', 'ready');
	const texture = await page.evaluate(() =>
		document.documentElement.style.getPropertyValue('--fd-wood-image')
	);
	expect(texture).toContain('blob:');
	for (const viewport of [
		{ width: 1440, height: 1000 },
		{ width: 390, height: 844 }
	]) {
		await page.setViewportSize(viewport);
		await page.getByTestId('new-world-button').click();
		const dialog = page.getByTestId('create-world-dialog');
		await expect(dialog).toHaveAttribute('data-ui-surface', 'panel');
		const box = (await dialog.boundingBox())!;
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
		await page.screenshot({ path: test.info().outputPath(`create-${viewport.width}.png`) });
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		await page.screenshot({ path: test.info().outputPath(`start-${viewport.width}.png`) });
	}
	expect(woodWorkers).toBe(1);
	expect(
		await page.evaluate(() => document.documentElement.style.getPropertyValue('--fd-wood-image'))
	).toBe(texture);
	expect(
		await page.evaluate(() => performance.getEntriesByName('forest-ui-wood-bake').length)
	).toBe(1);
});

test('fullscreen menus and editor use the shared theme without rebaking', async ({ page }) => {
	test.setTimeout(240_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	let woodWorkers = 0;
	page.on('worker', (worker) => {
		if (worker.url().includes('woodTexture')) woodWorkers++;
	});
	await page.addInitScript(() => localStorage.setItem('forest-drift.graphics.v1', 'low'));
	await page.goto('/');
	await createAndEnterWorld(page);
	await expect(page.getByTestId('pause-toggle')).toHaveCSS('background-image', /blob:/);
	await expect(page.getByTestId('save-indicator')).toHaveCSS('background-image', /blob:/);
	await page.keyboard.press('2');
	await expect(page.getByTestId('build-hud')).toHaveCSS('background-image', /blob:/);
	await expect(page.getByTestId('fps-counter')).toHaveCSS('background-image', /blob:/);
	await page.keyboard.press('8');
	await expect(page.getByTestId('mini-build-chunk-usage')).toHaveCSS('background-image', /blob:/);
	await page.keyboard.press('2');
	for (const width of [1440, 390]) {
		await page.setViewportSize({ width, height: 900 });
		const move = page.getByTestId('hotbar-move-toggle');
		const icon = (await move.locator('img').boundingBox())!;
		const shortcut = (await move.locator('.slot-number').boundingBox())!;
		const button = (await move.boundingBox())!;
		expect(Math.abs(icon.x + icon.width / 2 - button.x - button.width / 2)).toBeLessThan(1);
		expect(icon.y).toBeGreaterThanOrEqual(shortcut.y + shortcut.height);
		await page.screenshot({ path: test.info().outputPath(`hud-${width}.png`) });
	}
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('pause-menu')).toBeVisible();
	await expect(page.getByTestId('pause-menu')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.8)');
	const resume = page.getByTestId('pause-resume');
	const resumeBox = (await resume.boundingBox())!;
	expect(
		await page.evaluate(
			({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="pause-menu"]') !== null,
			{ x: resumeBox.x + 10, y: resumeBox.y + 10 }
		)
	).toBe(true);
	await page.screenshot({ path: test.info().outputPath('pause.png') });
	await page.getByTestId('pause-settings').click();
	await expect(page.locator('.settings-panel')).toHaveAttribute('data-ui-surface', 'panel');
	await page.getByTestId('settings-search').fill('shadow');
	await page.screenshot({ path: test.info().outputPath('settings.png') });
	await page.getByTestId('settings-close').click();
	await page.getByTestId('pause-creature-lab').click();
	await expect(page.getByTestId('creature-lab')).toHaveAttribute('data-ui-surface', 'panel');
	await page.screenshot({ path: test.info().outputPath('creature-lab.png') });
	await page.getByRole('button', { name: 'Close Creature Lab' }).click();
	await page.getByTestId('pause-controls').click();
	await expect(page.locator('.help-panel')).toHaveAttribute('data-ui-surface', 'panel');
	await page.screenshot({ path: test.info().outputPath('help.png') });
	await page.locator('.help-close').click();
	await page.getByTestId('pause-resume').click();
	await page.keyboard.press('2');
	await page.keyboard.press('e');
	await expect(page.getByTestId('placement-customize-modal')).toHaveAttribute(
		'data-ui-surface',
		'panel'
	);
	await page.screenshot({ path: test.info().outputPath('placement.png') });
	await page.getByRole('button', { name: 'Close customise', exact: true }).click();
	await page.keyboard.press('8');
	await page.keyboard.press('e');
	await expect(page.getByTestId('object-library-modal')).toBeVisible();
	await page.screenshot({ path: test.info().outputPath('library.png') });
	await page.getByTestId('mini-build-create-new').click();
	await expect(page.getByTestId('mini-build-editor')).toHaveAttribute('data-ui-surface', 'panel');
	await page.screenshot({ path: test.info().outputPath('editor.png') });
	await page.getByTestId('mini-build-add').click();
	await page.getByTestId('mini-build-save').click();
	await expect(page.getByTestId('mini-build-name-dialog')).toHaveAttribute(
		'data-ui-surface',
		'panel'
	);
	await page.screenshot({ path: test.info().outputPath('editor-name.png') });
	expect(woodWorkers).toBe(1);
	expect(errors).toEqual([]);
});

test('touch dialogs stay usable when wood generation is unavailable', async ({ browser }) => {
	const context = await browser.newContext({
		hasTouch: true,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	await page.route('**/*woodTexture.worker*', (route) => route.abort());
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('data-ui-wood', 'fallback');
	await page.getByTestId('new-world-button').tap();
	const create = page.getByTestId('create-world-confirm');
	expect((await create.boundingBox())!.height).toBeGreaterThanOrEqual(44);
	await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
	await expect(page.getByTestId('create-world-dialog')).toBeHidden();
	await context.close();
});
