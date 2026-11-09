import { expect, test } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestWindow = Window & { __forestSession: { scene: any } };

test('slot 2 defaults to Corner Walls: two clicks on opposite corners build a closed room', async ({
	page
}) => {
	test.setTimeout(180_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Corner World', seed: 'remove-seed' });

	await page.keyboard.press('2');
	await expect(page.getByTestId('hotbar-slot-corner-wall')).toHaveClass(/active/);
	await expect(page.getByTestId('hotbar-slot-corner-wall')).toHaveAccessibleName(
		'Corner Walls (slot 2)'
	);
	await expect(page.getByTestId('build-hud')).toContainText('CORNER WALLS');

	// An empty foundation to build on, the player standing on it.
	const site = await page.evaluate(() => {
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
		s.foundationManager.addFoundation({
			id: 'corner-foundation',
			minGridX: minGX,
			maxGridX: maxGX,
			minGridZ: minGZ,
			maxGridZ: maxGZ,
			topY: hi + 0.3,
			bottomY: lo - 0.5
		});
		return { origin: { x: minGX * spacing, y: hi + 0.3, z: minGZ * spacing } };
	});

	/** Aims at building-grid point (gx, gz) on the foundation, clicks, and returns the HUD text. */
	const clickAt = (gx: number, gz: number) =>
		page.evaluate(
			async ({ site, gx, gz }) => {
				const s = (window as unknown as TestWindow).__forestSession.scene;
				// Aim at the current level's floor height, standing on it.
				const floorY = site.origin.y + s.levelManager.getLevelUiState('corner-foundation').baseY;
				const stand = { x: site.origin.x + 3, y: floorY + 1.7, z: site.origin.z + 2.5 };
				const dx = site.origin.x + gx * 0.25 - stand.x;
				const dz = site.origin.z + gz * 0.25 - stand.z;
				s.controller.restoreState(
					stand,
					Math.atan2(-dx, -dz),
					Math.atan2(floorY - stand.y, Math.hypot(dx, dz))
				);
				s.camera.updateMatrixWorld(true);
				s.buildToolManager.update();
				await new Promise((r) => setTimeout(r, 30));
				s.buildToolManager.triggerPrimaryAction();
				await new Promise((r) => setTimeout(r, 30));
			},
			{ site, gx, gz }
		);
	const wallPaths = () =>
		page.evaluate(
			() =>
				(
					window as unknown as TestWindow
				).__forestSession.scene.buildingManager.getBuildingForFoundation('corner-foundation')
					?.wallPaths ?? []
		);

	// First corner, then a point in line with it: not a room, so nothing is built yet.
	await clickAt(4, 4);
	await expect(page.getByTestId('build-hud')).toContainText('opposite corner');
	await clickAt(4, 16);
	expect(await wallPaths()).toHaveLength(0);

	// The opposite corner: four walls of a right-angled room, closed, in one go.
	await clickAt(20, 16);
	const paths = await wallPaths();
	expect(paths).toHaveLength(1);
	expect(paths[0].closed).toBe(true);
	expect(paths[0].segments).toHaveLength(4);
	expect(paths[0].points.map((p: { gridX: number; gridZ: number }) => [p.gridX, p.gridZ])).toEqual([
		[4, 4],
		[20, 4],
		[20, 16],
		[4, 16]
	]);
	// Ready for the next room straight away.
	await expect(page.getByTestId('build-hud')).toContainText('Click: First corner');

	// Upstairs (]), walls need something under them: a room hanging past the walls below is
	// refused, with the reason shown…
	await page.keyboard.press('BracketRight');
	await expect(page.getByTestId('build-hud')).toContainText('FIRST FLOOR');
	// Fly, so standing up there with no floor yet doesn't mean falling between aim and click.
	await page.evaluate(() =>
		(window as unknown as TestWindow).__forestSession.scene.controller.setFlying(true)
	);
	await clickAt(4, 4);
	await clickAt(28, 16);
	await expect(page.getByTestId('build-hud')).toContainText('Needs a ceiling, floor or wall below');
	expect(await wallPaths()).toHaveLength(1);
	// …a first corner over thin air isn't taken at all…
	await page.mouse.click(10, 10, { button: 'right' });
	await clickAt(28, 4);
	await expect(page.getByTestId('build-hud')).toContainText('Needs a ceiling, floor or wall below');
	await expect(page.getByTestId('build-hud')).toContainText('Click: First corner');
	// …and the same room right on top of the walls below is built.
	await clickAt(4, 4);
	await clickAt(20, 16);
	await expect.poll(async () => (await wallPaths()).length).toBe(2);
	const upstairs = (await wallPaths())[1];
	expect(upstairs.baseY).toBeGreaterThan(2);
	// Undo it and go back down to the ground floor.
	await page.keyboard.press('Minus');
	await expect.poll(async () => (await wallPaths()).length).toBe(1);
	await page.keyboard.press('BracketLeft');
	await expect(page.getByTestId('build-hud')).toContainText('GROUND FLOOR');

	// Undo takes the whole room away in one step.
	await page.keyboard.press('Minus');
	await expect.poll(async () => (await wallPaths()).length).toBe(0);

	// The other ways to draw walls are all still there, one ↓ away.
	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('hotbar-slot-polygon-wall')).toHaveClass(/active/);
	await expect(page.getByTestId('build-hud')).toContainText('CONTINUOUS WALL');
	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('hotbar-slot-wall')).toHaveClass(/active/);

	expect(pageErrors).toEqual([]);
});
