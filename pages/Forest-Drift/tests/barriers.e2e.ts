import { expect, test } from '@playwright/test';
import { createAndEnterWorld, openPauseMenu, openWorldNamed, waitForSaved } from './worldHelpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestWindow = Window & { __forestSession: { scene: any } };

test('slot 2 cycles to Fence / Railing, E customises it, and a fence survives a reload', async ({
	page
}) => {
	// World creation and a reload under software rendering.
	test.setTimeout(240_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Fence World', seed: 'remove-seed' });

	await page.keyboard.press('2');
	await expect(page.getByTestId('hotbar-slot-polygon-wall')).toHaveClass(/active/);
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	const slot = page.getByTestId('hotbar-slot-barrier');
	await expect(slot).toHaveClass(/active/);
	await expect(slot).toHaveAccessibleName('Fence / Rail (slot 2)');
	await expect(page.getByTestId('build-hud')).toContainText('FENCE / RAILING');

	await page.keyboard.press('e');
	const modal = page.getByTestId('barrier-customize-modal');
	await expect(modal).toBeVisible();
	await page.getByTestId('barrier-preset').selectOption('garden-fence');
	await page.getByTestId('barrier-wood').selectOption('walnut');
	await expect(page.getByTestId('placement-preview-canvas')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(modal).toBeHidden();

	// The draft settings drive the next fence: build one from them (a click needs pointer lock).
	const created = await page.evaluate(() => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const draft = s.buildingSettings.barrier;
		const hs = s.terrainManager.getHeightSampler();
		const points = [
			[30, 30],
			[38, 30],
			[38, 25]
		].map(([x, z]) => ({ x, y: hs.sample(x, z), z }));
		s.barrierManager.add({
			id: 'e2e-fence',
			type: draft.type,
			foundationId: null,
			points,
			closed: false,
			baseMode: 'follow-surface',
			style: structuredClone(draft.style)
		});
		return s.barrierRenderStats();
	});
	expect(created.barriers).toBe(1);
	expect(created.meshes).toBeLessThanOrEqual(6);

	await waitForSaved(page);
	await openPauseMenu(page);
	await page.getByTestId('pause-quit').click();
	await expect(page.getByTestId('worlds-screen')).toBeVisible();
	await page.reload();
	await openWorldNamed(page, 'Fence World');
	await expect(page.getByTestId('save-indicator')).toBeVisible({ timeout: 20_000 });

	const loaded = await page.evaluate(() => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const fence = s.barrierManager.get('e2e-fence');
		return fence
			? { preset: fence.style.presetId, wood: fence.style.wood, points: fence.points.length }
			: null;
	});
	expect(loaded).toEqual({ preset: 'garden-fence', wood: 'walnut', points: 3 });
	expect(pageErrors).toEqual([]);
});
