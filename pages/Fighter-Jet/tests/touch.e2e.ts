import { expect, test, type Locator, type Page } from '@playwright/test';

async function openTouchMission(page: Page): Promise<Locator> {
	await page.goto('/?testMode=true');
	await page.getByRole('button', { name: 'Start Mission' }).click();
	await expect(page.getByTestId('game-hud')).toBeVisible();
	const controls = page.locator('[aria-label="Touch flight controls"]');
	await expect(controls).toBeVisible();
	return controls;
}

test('offers complete touch controls and an iOS-safe tilt fallback', async ({ page }) => {
	const controls = await openTouchMission(page);

	await expect(controls.getByRole('button', { name: 'STICK' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	for (const name of ['MAP', 'PAUSE', 'TARGET', 'CAMERA', 'Fire missile']) {
		const button = controls.getByRole('button', { name, exact: true });
		await expect(button).toBeVisible();
		const box = await button.boundingBox();
		expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
	}

	await controls.getByRole('button', { name: 'TILT', exact: true }).click();
	await expect(controls.getByRole('button', { name: 'TILT', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(controls.getByRole('button', { name: 'ENABLE TILT' })).toBeVisible();
	await controls.getByRole('button', { name: 'ENABLE TILT' }).click();
	await expect(controls.locator('span[role="status"]')).toContainText(
		/(unavailable|enabled|denied|secure HTTPS|could not be enabled)/i
	);

	await controls.getByRole('button', { name: 'STICK' }).click();
	await expect(page.getByLabel(/Flight stick/)).toBeVisible();

	await controls.getByRole('button', { name: 'PAUSE' }).click();
	await expect(page.getByRole('heading', { name: 'Mission Paused' })).toBeVisible();
	await page.getByRole('button', { name: 'Resume' }).click();
	await expect(controls).toBeVisible();
});

test('persists tilt preferences and adapts to portrait', async ({ page }) => {
	await page.goto('/?testMode=true');
	await page.getByRole('button', { name: 'Settings' }).click();
	await page.getByLabel('Flight control').selectOption('tilt');
	const tiltSensitivity = page.getByRole('slider', { name: /Tilt sensitivity/i });
	await tiltSensitivity.fill('1.2');
	await page.getByRole('button', { name: 'Close settings' }).click();
	await page.reload();
	await page.getByRole('button', { name: 'Settings' }).click();
	await expect(page.getByLabel('Flight control')).toHaveValue('tilt');
	await expect(page.getByRole('slider', { name: /Tilt sensitivity/i })).toHaveValue('1.2');
	await page.getByRole('button', { name: 'Close settings' }).click();

	await page.setViewportSize({ width: 390, height: 844 });
	const controls = await openTouchMission(page);
	await expect(controls.getByText('Landscape recommended')).toBeVisible();
	await expect(controls.getByRole('button', { name: 'ENABLE TILT' })).toBeVisible();
});
