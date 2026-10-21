import { test, expect } from '@playwright/test';
import { createAndEnterWorld, openPauseMenu } from './worldHelpers';

test('pause pages stay on the left and leave the world visible', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/');
	await createAndEnterWorld(page);
	await openPauseMenu(page);
	const panel = page.locator('[data-pause-panel]:visible');
	async function checkPanel() {
		await expect(panel).toHaveCount(1);
		const bounds = await panel.evaluate((el) => {
			const r = el.getBoundingClientRect();
			return { x: r.x, width: r.width, height: r.height };
		});
		expect(bounds!.x).toBe(0);
		expect(bounds!.width).toBeLessThan(page.viewportSize()!.width * 0.9);
		expect(bounds!.height).toBe(page.viewportSize()!.height);
		expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
	}
	await checkPanel();
	await page.getByTestId('pause-world').click();
	await checkPanel();
	await page.getByTestId('pause-world-rename').click();
	await checkPanel();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.getByRole('button', { name: 'Back', exact: true }).click();
	for (const [button, close] of [
		['pause-settings', 'settings-close'],
		['pause-controls', null],
		['pause-creature-lab', null],
		['pause-multiplayer', null],
		['pause-debug', null]
	] as const) {
		await page.getByTestId(button).click();
		await checkPanel();
		for (const viewport of [
			{ width: 844, height: 390 },
			{ width: 320, height: 568 },
			{ width: 390, height: 844 }
		]) {
			await page.setViewportSize(viewport);
			await checkPanel();
		}
		if (button === 'pause-settings' || button === 'pause-creature-lab')
			await page.screenshot({ path: `/tmp/forest-drift-${button}.png` });
		if (button === 'pause-settings') {
			await page.getByTestId('settings-nav-audio').click();
			await checkPanel();
		}
		if (close) await page.getByTestId(close).click();
		else if (button === 'pause-controls')
			await page.getByRole('button', { name: 'Done', exact: true }).click();
		else if (button === 'pause-creature-lab')
			await page.getByRole('button', { name: 'Close Creature Lab' }).click();
		else if (button === 'pause-multiplayer')
			await page.getByRole('button', { name: 'Back', exact: true }).click();
		else await page.getByRole('button', { name: 'Close Dev and Debug controls' }).click();
		await page.setViewportSize({ width: 1280, height: 720 });
		await expect(page.getByTestId('pause-menu')).toBeVisible();
	}
	await page.screenshot({ path: '/tmp/forest-drift-pause.png' });
	await page.getByTestId('pause-resume').click();
	await expect(page.getByTestId('pause-menu')).toBeHidden();
});
