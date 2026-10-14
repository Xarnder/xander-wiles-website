import { expect, test } from '@playwright/test';
import { createAndEnterWorld, openPauseMenu, openWorldNamed, waitForSaved } from './worldHelpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestWindow = Window & { __forestSession: { scene: any } };

test('slot 2 Skirting draws boards on the wall faces toward the player, and they persist', async ({
	page
}) => {
	test.setTimeout(240_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Skirting World', seed: 'remove-seed' });

	await page.keyboard.press('2');
	for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('hotbar-slot-skirting')).toHaveClass(/active/);
	await expect(page.getByTestId('build-hud')).toContainText('SKIRTING');

	await page.keyboard.press('e');
	await expect(page.getByTestId('skirting-customize-modal')).toBeVisible();
	await expect(page.getByTestId('placement-preview-canvas')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('skirting-customize-modal')).toBeHidden();

	// A foundation with a closed 4 × 3 m room of 0.2 m walls, the player standing inside it.
	const room = await page.evaluate(() => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const hs = s.terrainManager.getHeightSampler();
		const spacing = s.settings.chunkSize / s.settings.chunkResolution;
		const minGX = Math.round(56 / spacing);
		const minGZ = Math.round(4 / spacing);
		const maxGX = minGX + 4;
		const maxGZ = minGZ + 4;
		let hi = -Infinity;
		let lo = Infinity;
		for (let gx = minGX; gx <= maxGX; gx++)
			for (let gz = minGZ; gz <= maxGZ; gz++) {
				const h = hs.sample(gx * spacing, gz * spacing);
				hi = Math.max(hi, h);
				lo = Math.min(lo, h);
			}
		const foundation = {
			id: 'skirting-foundation',
			minGridX: minGX,
			maxGridX: maxGX,
			minGridZ: minGZ,
			maxGridZ: maxGZ,
			topY: hi + 0.3,
			bottomY: lo - 0.5
		};
		s.foundationManager.addFoundation(foundation);
		const corners = [
			[4, 4],
			[20, 4],
			[20, 16],
			[4, 16]
		];
		const result = s.buildingManager.addWallPath({
			points: corners.map(([gridX, gridZ]) => ({ gridX, gridZ, foundationId: foundation.id })),
			closed: true,
			baseY: 0,
			wallHeight: 2.6,
			wallThickness: 0.2,
			joinStyle: 'miter',
			miterLimit: 4,
			minimumSegmentLength: 0.25
		});
		return {
			ok: result.valid,
			origin: { x: minGX * spacing, y: foundation.topY, z: minGZ * spacing },
			corners
		};
	});
	expect(room.ok).toBe(true);

	// Draw the run with the tool itself: aim at each wall-line point from inside, click, close.
	const drawn = await page.evaluate(async (room) => {
		const s = (window as unknown as TestWindow).__forestSession.scene;
		const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
		const stand = { x: room.origin.x + 3, y: room.origin.y + 1.7, z: room.origin.z + 2.5 };
		const aim = async (gx: number, gz: number) => {
			const tx = room.origin.x + gx * 0.25;
			const tz = room.origin.z + gz * 0.25;
			const dx = tx - stand.x;
			const dz = tz - stand.z;
			s.controller.restoreState(
				stand,
				Math.atan2(-dx, -dz),
				Math.atan2(room.origin.y - stand.y, Math.hypot(dx, dz))
			);
			s.camera.updateMatrixWorld(true);
			s.buildToolManager.update();
			await wait(30);
		};
		for (const [gx, gz] of room.corners) {
			await aim(gx, gz);
			s.buildToolManager.triggerPrimaryAction();
		}
		await aim(room.corners[0][0], room.corners[0][1]);
		s.buildToolManager.triggerPrimaryAction();
		await wait(50);
		const runs = s.buildingManager.getBuildingForFoundation('skirting-foundation').skirtingRuns;
		return runs;
	}, room);
	expect(drawn).toHaveLength(1);
	const [run] = drawn;
	expect(run.closed).toBe(true);
	expect(run.segments).toHaveLength(4);
	// Drawn counter-clockwise in X/Z from inside: the inside of every wall is on the left (+1).
	for (const segment of run.segments) {
		expect(segment.side).toBe(1);
		expect(segment.offset).toBeCloseTo(0.1, 6);
	}

	if (process.env.SKIRTING_SHOT) {
		await page.evaluate((room) => {
			const s = (window as unknown as TestWindow).__forestSession.scene;
			const eye = { x: room.origin.x + 1.6, y: room.origin.y + 0.75, z: room.origin.z + 2.9 };
			const t = { x: room.origin.x + 4.9, y: room.origin.y + 0.05, z: room.origin.z + 1.1 };
			const dx = t.x - eye.x;
			const dz = t.z - eye.z;
			s.buildToolManager.selectSlot(1);
			s.controller.restoreState(
				eye,
				Math.atan2(-dx, -dz),
				Math.atan2(t.y - eye.y, Math.hypot(dx, dz))
			);
		}, room);
		await page.waitForTimeout(1500);
		await page.screenshot({ path: process.env.SKIRTING_SHOT });
	}

	await waitForSaved(page);
	await openPauseMenu(page);
	await page.getByTestId('pause-quit').click();
	await expect(page.getByTestId('worlds-screen')).toBeVisible();
	await page.reload();
	await openWorldNamed(page, 'Skirting World');
	await expect(page.getByTestId('save-indicator')).toBeVisible({ timeout: 20_000 });
	const reloaded = await page.evaluate(
		() =>
			(
				window as unknown as TestWindow
			).__forestSession.scene.buildingManager.getBuildingForFoundation('skirting-foundation')
				.skirtingRuns.length
	);
	expect(reloaded).toBe(1);
	expect(pageErrors).toEqual([]);
});
