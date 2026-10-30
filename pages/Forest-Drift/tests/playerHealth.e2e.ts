import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld, openWorldNamed, openWorldsScreen } from './worldHelpers';

/**
 * Player health: the 36-segment bar's place in the bottom HUD, fall damage through the real
 * landing path (`debugDropPlayer` lifts the player and lets them fall), death and respawn, and
 * saving. Layout, not GPU performance: graphics stay on Low.
 */

type TestWindow = Window & {
	__forestSession?: {
		scene: {
			debugDropPlayer(metres: number): void;
			getHealth(): { current: number; dead: boolean };
			toggleBuildMode(): void;
			controller: {
				interactionPose: { action: string } | null;
				interactionThirdPerson: boolean;
			};
		};
		saveNow(trigger: string): Promise<unknown>;
	} | null;
};

async function lowGraphics(page: Page) {
	await page.addInitScript(() => localStorage.setItem('forest-drift.graphics.v1', 'low'));
}

async function box(page: Page, testId: string) {
	const rect = await page.getByTestId(testId).first().boundingBox();
	expect(rect).not.toBeNull();
	return rect!;
}

/** Past the 2 s grace period after entering the world. */
async function settle(page: Page) {
	await page.waitForTimeout(2500);
}

async function drop(page: Page, metres: number) {
	await page.evaluate(
		(m) => (window as TestWindow).__forestSession!.scene.debugDropPlayer(m),
		metres
	);
}

const health = (page: Page) => page.getByTestId('health-bar');

test.describe('Player health', () => {
	test('sits just above the hotbar and drops into its place without one', async ({ page }) => {
		test.setTimeout(180_000);
		await lowGraphics(page);
		await page.goto('/');
		await createAndEnterWorld(page, { name: 'Health Layout' });

		await expect(page.getByTestId('health-seg')).toHaveCount(36);
		await expect(health(page)).toHaveAttribute('aria-valuenow', '36');
		await expect(health(page)).toHaveAttribute('role', 'meter');

		const bar = await box(page, 'health-bar');
		const row = await box(page, 'health-hud');
		const tray = await page.getByTestId('hotbar').locator('.tool-tray').boundingBox();
		expect(row.y + row.height).toBeLessThanOrEqual(tray!.y);
		expect(tray!.y - (row.y + row.height)).toBeLessThanOrEqual(10);
		expect(bar.height).toBeLessThanOrEqual(12);
		// The row (bar + number) spans the hotbar's full width, with the number at its right end.
		expect(Math.abs(row.x - tray!.x)).toBeLessThanOrEqual(2);
		expect(Math.abs(row.width - tray!.width)).toBeLessThanOrEqual(2);
		await expect(page.getByTestId('health-count')).toHaveText('36/36');
		const count = await box(page, 'health-count');
		expect(count.x).toBeGreaterThan(bar.x + bar.width);

		// Build mode off (G): no hotbar, and the bar takes its place at the bottom.
		await page.evaluate(() => (window as TestWindow).__forestSession!.scene.toggleBuildMode());
		await expect(page.getByTestId('hotbar')).toHaveCount(0);
		await expect
			.poll(async () => {
				const moved = await box(page, 'health-bar');
				return Math.round(moved.y + moved.height);
			})
			.toBeGreaterThanOrEqual(Math.round(tray!.y + tray!.height) - 2);
		// Same width without the hotbar, so pressing G doesn't resize it.
		expect(Math.abs((await box(page, 'health-hud')).width - row.width)).toBeLessThanOrEqual(2);
	});

	test('falls cost the agreed segments, kill, respawn and save', async ({ page }) => {
		test.setTimeout(240_000);
		await lowGraphics(page);
		await page.goto('/');
		await createAndEnterWorld(page, { name: 'Health Falls' });
		await settle(page);

		// 10 m: 2 per metre over 4 m = 12 segments.
		await drop(page, 10);
		await expect(health(page)).toHaveAttribute('aria-valuenow', '24', { timeout: 10_000 });
		await expect(page.getByTestId('health-count')).toHaveText('24/36');
		await expect(page.locator('[data-testid="health-seg"][data-state="empty"]')).toHaveCount(12, {
			timeout: 5_000
		});

		// The damaged value survives a save and reopen.
		await page.evaluate(() => (window as TestWindow).__forestSession!.saveNow('manual'));
		await page.reload();
		await openWorldNamed(page, 'Health Falls');
		await expect(health(page)).toHaveAttribute('aria-valuenow', '24');

		// 30 m from 24 is fatal.
		await settle(page);
		await drop(page, 30);
		const card = page.getByTestId('death-card');
		await expect(card).toBeVisible({ timeout: 10_000 });
		await expect(card).toContainText('You fell too far');
		// Lying on the floor (the beds' lying pose), seen from third person.
		const pose = () =>
			page.evaluate(() => {
				const c = (window as TestWindow).__forestSession!.scene.controller;
				return { action: c.interactionPose?.action ?? null, third: c.interactionThirdPerson };
			});
		expect(await pose()).toEqual({ action: 'lie', third: true });
		// Respawn waits 3 s: the button counts down, and Enter does nothing until then.
		const respawn = page.getByTestId('death-respawn');
		await expect(respawn).toBeDisabled();
		await expect(respawn).toHaveText(/Respawn in [1-3]/);
		await page.keyboard.press('Enter');
		await expect(card).toBeVisible();
		await expect(respawn).toBeEnabled({ timeout: 5_000 });
		await expect(respawn).toHaveText('Respawn');
		await expect(respawn).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(card).toBeHidden();
		await expect(health(page)).toHaveAttribute('aria-valuenow', '36');
		expect((await pose()).action).toBeNull();
	});

	test('worlds from before fall damage keep it off', async ({ page }) => {
		test.setTimeout(180_000);
		await lowGraphics(page);
		await page.goto('/');
		await openWorldsScreen(page);
		await page.getByTestId('play-default-world').click();
		await expect(page.getByTestId('loading-screen')).toBeHidden({ timeout: 30_000 });
		await settle(page);
		await drop(page, 30);
		await page.waitForTimeout(3000);
		const current = await page.evaluate(
			() => (window as TestWindow).__forestSession!.scene.getHealth().current
		);
		expect(current).toBe(36);
	});

	test('animations are skipped with reduced motion', async ({ page }) => {
		test.setTimeout(180_000);
		await lowGraphics(page);
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		await createAndEnterWorld(page, { name: 'Health Motion' });
		const transition = await page
			.getByTestId('health-seg')
			.first()
			.evaluate((el) => getComputedStyle(el).transitionDuration);
		expect(transition).toBe('0s');
	});
});

test.describe('Player health on touch screens', () => {
	test.use({ hasTouch: true, viewport: { width: 375, height: 812 }, isMobile: true });

	test('stays clear of the touch controls and never takes a touch', async ({ page }) => {
		test.setTimeout(240_000);
		await lowGraphics(page);
		await page.goto('/?touch=1');
		await createAndEnterWorld(page, { name: 'Health Touch' });
		await page.getByTestId('touch-start-btn').click();

		const bar = await box(page, 'health-bar');
		const tray = await page.getByTestId('hotbar').locator('.tool-tray').boundingBox();
		expect(bar.y + bar.height).toBeLessThanOrEqual(tray!.y);
		for (const selector of ['.touch-movement-cluster', '.touch-actions-cluster']) {
			const cluster = await page.locator(selector).first().boundingBox();
			if (!cluster) continue;
			const overlaps =
				cluster.x < bar.x + bar.width &&
				cluster.x + cluster.width > bar.x &&
				cluster.y < bar.y + bar.height &&
				cluster.y + cluster.height > bar.y;
			expect(overlaps, selector).toBe(false);
		}
		await expect(health(page)).toHaveCSS('pointer-events', 'none');
	});
});
