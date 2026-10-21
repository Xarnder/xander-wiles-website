import { expect, test } from '@playwright/test';
import type { ThreeScene } from '../src/lib/game/ThreeScene';
import { createAndEnterWorld } from './worldHelpers';

type GameWindow = Window & { __forestSession: { scene: ThreeScene } };

test('8 → E → Edit opens a default design and returns to a responsive game', async ({ page }) => {
	test.setTimeout(90_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await createAndEnterWorld(page, {
		name: 'Editor launch regression',
		seed: 'editor-proxy-regression'
	});
	await page.keyboard.press('8');
	await page.keyboard.press('e');
	await expect(page.getByTestId('object-library-modal')).toBeVisible();
	await page.getByTestId('default-designs-grid').getByTestId('mini-build-edit').first().click();
	await expect(page.getByTestId('mini-build-editor')).toBeVisible();
	await expect(page.getByTestId('object-library-modal')).toBeHidden();
	await expect(page.getByTestId('mini-build-editor-canvas')).toBeVisible();
	await page.getByTestId('mini-build-cancel').click();
	if (await page.getByTestId('mini-build-discard-dialog').isVisible())
		await page.getByTestId('mini-build-discard-confirm').click();
	await expect(page.getByTestId('mini-build-editor')).toBeHidden();
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as GameWindow).__forestSession.scene.simulationPaused)
		)
		.toBe(false);
	await page.getByTestId('pause-toggle').click();
	await expect(page.getByTestId('pause-menu')).toBeVisible();
	expect(errors).toEqual([]);
});

test('a failed editor launch offers recovery instead of leaving the game frozen', async ({
	page
}) => {
	test.setTimeout(90_000);
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Editor recovery', seed: 'editor-recovery' });
	await page.evaluate(() => {
		const scene = (window as unknown as GameWindow).__forestSession.scene;
		const result = scene.miniBuilds.createDesign({
			name: 'Broken launch test',
			blocks: [
				{
					id: 'block',
					positionGrid: { x: 0, y: 0, z: 0 },
					sizeGrid: { x: 16, y: 16, z: 16 },
					rotation: { x: 0, y: 0, z: 0 },
					materialSlot: 0
				}
			],
			materials: [{ name: 'Wood', finish: 'wood', material: { type: 'color', color: '#8b5a2b' } }]
		});
		if (!result.ok) throw new Error(result.error);
		const original = scene.miniBuilds.getDesign.bind(scene.miniBuilds);
		scene.miniBuilds.getDesign = (id) => {
			if (id === result.value.id) throw new Error('Simulated editor initialization failure');
			return original(id);
		};
	});
	await page.keyboard.press('8');
	await page.keyboard.press('e');
	await expect(page.getByTestId('object-library-modal')).toBeVisible();
	await page
		.getByTestId('mini-build-card')
		.filter({ hasText: 'Broken launch test' })
		.getByTestId('mini-build-edit')
		.click();
	await expect(page.getByTestId('mini-build-editor-error')).toBeVisible();
	await page.getByTestId('mini-build-editor-error-close').click();
	await expect(page.getByTestId('mini-build-editor-error')).toBeHidden();
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as GameWindow).__forestSession.scene.simulationPaused)
		)
		.toBe(false);
	await page.getByTestId('pause-toggle').click();
	await expect(page.getByTestId('pause-menu')).toBeVisible();
});
