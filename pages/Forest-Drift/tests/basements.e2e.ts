import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld, openWorldNamed, waitForSaved } from './worldHelpers';

/**
 * Basements and Joined Foundations Phase 1: basements in the game. Choose two storeys in the
 * Foundation tool's E panel, place a foundation with them, walk in onto the deck from outside and
 * against the stone walls from inside, step through the floor selector's basement storeys, cut the
 * deck with a stair, remove and restore the basement with B and undo, and reload. `BASEMENTS_SHOTS`
 * (a folder) saves screenshots.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GameWindow = Window & { __forestSession: { scene: any } };

const scene = (page: Page) =>
	page.evaluate(() => !!(window as unknown as GameWindow).__forestSession?.scene);

/** Looks straight down at (x, z) from above and waits for the Foundation tool to hover it. */
async function aimDown(page: Page, x: number, z: number, height = 10) {
	await page.evaluate(
		({ x, z, height }) => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			s.controller.restoreState(
				{ x, y: s.terrainManager.getHeightSampler().sample(x, z) + height, z },
				0,
				-Math.PI / 2
			);
		},
		{ x, z, height }
	);
	await page.waitForTimeout(250);
}

const foundationInfo = (page: Page) =>
	page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		const f = s.foundationManager.getFoundations()[0];
		if (!f) return null;
		return {
			id: f.id as string,
			basement: f.basement ?? null,
			topY: f.topY as number,
			slabs: s.buildingManager
				.getSlabsForFoundation(f.id)
				.map((slab: { role?: string; localY: number; openings: unknown[] }) => ({
					role: slab.role ?? null,
					localY: slab.localY,
					openings: slab.openings.length
				})),
			holedCells: s.terrainManager.getHoledCellCount() as number
		};
	});

/** Stands at `from` looking at `at`, hides the click-to-play overlay, and saves a screenshot. */
async function shoot(
	page: Page,
	path: string,
	from: { x: number; y: number; z: number },
	at: { x: number; y: number; z: number }
) {
	await page.evaluate(
		({ from, at }) => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			const dx = at.x - from.x;
			const dz = at.z - from.z;
			s.controller.restoreState(
				from,
				Math.atan2(-dx, -dz),
				Math.atan2(at.y - from.y, Math.hypot(dx, dz))
			);
			s.setTouchActive(true);
		},
		{ from, at }
	);
	await page.waitForTimeout(1200);
	await page.screenshot({ path });
}

const feet = (page: Page) =>
	page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		const p = s.controller.worldPosition;
		return { x: p.x as number, y: (p.y - s.settings.player.eyeHeight) as number, z: p.z as number };
	});

test('basements: place with storeys, walk in and down, floor selector, stairs, B, undo, reload', async ({
	page
}) => {
	test.setTimeout(300_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const shots = process.env.BASEMENTS_SHOTS;

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Basement world', seed: 'basement-seed' });
	await expect.poll(() => scene(page)).toBe(true);

	// E panel: two storeys of 3 m.
	await page.keyboard.press('1');
	await page.keyboard.press('e');
	await expect(page.getByTestId('foundation-customize-modal')).toBeVisible();
	await page.getByTestId('basement-storeys-2').click();
	await expect(page.getByTestId('foundation-basement')).toContainText('2 storeys, 6.0 m deep');
	if (shots) await page.screenshot({ path: `${shots}/foundation-panel.png` });
	await page.getByTestId('foundation-style-done').click();

	// Place a 6 × 5-cell foundation near the spawn with the tool's two corners.
	const site = await page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		const spacing = s.settings.chunkSize / s.settings.chunkResolution;
		const p = s.controller.worldPosition;
		const gx = Math.round(p.x / spacing) + 4;
		const gz = Math.round(p.z / spacing);
		return { spacing, gx, gz };
	});
	await aimDown(page, site.gx * site.spacing, site.gz * site.spacing);
	await page.evaluate(() =>
		(window as unknown as GameWindow).__forestSession.scene.triggerPrimaryAction()
	);
	await aimDown(page, (site.gx + 6) * site.spacing, (site.gz + 5) * site.spacing);
	await expect(page.getByTestId('build-hud')).toContainText('Basement: 2 storeys of 3 m');
	await page.evaluate(() =>
		(window as unknown as GameWindow).__forestSession.scene.triggerPrimaryAction()
	);

	await expect
		.poll(async () => (await foundationInfo(page))?.basement)
		.toEqual({
			storeys: 2,
			storeyHeight: 3
		});
	const placed = (await foundationInfo(page))!;
	expect(placed.slabs).toEqual([
		{ role: 'deck', localY: 0, openings: 0 },
		{ role: 'basement-floor', localY: -3, openings: 0 }
	]);
	await expect.poll(async () => (await foundationInfo(page))?.holedCells).toBe(30);

	const minX = site.gx * site.spacing;
	const minZ = site.gz * site.spacing;
	const centre = { x: minX + 6, z: minZ + 5 };
	const lowest = placed.topY - 6;

	// Walk in from outside, onto the deck: a basement house is stepped onto like any other.
	await page.evaluate(
		({ minX, centre }) => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			const x = minX - 3;
			const y = s.terrainManager.getHeightSampler().sample(x, centre.z);
			// Facing +X (into the house).
			s.controller.restoreState(
				{ x, y: y + s.settings.player.eyeHeight, z: centre.z },
				-Math.PI / 2,
				0
			);
		},
		{ minX, centre }
	);
	await page.keyboard.down('KeyW');
	await page.waitForTimeout(1500);
	await page.keyboard.up('KeyW');
	const onDeck = await feet(page);
	expect(onDeck.x).toBeGreaterThan(minX + 0.5);
	expect(onDeck.y).toBeCloseTo(placed.topY, 1);

	// Down in the Lower Basement, on the lowest floor; walking into a wall keeps you inside.
	await page.evaluate(
		({ centre, lowest }) => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			// Facing −Z.
			s.controller.restoreState(
				{ x: centre.x, y: lowest + s.settings.player.eyeHeight, z: centre.z },
				0,
				0
			);
		},
		{ centre, lowest }
	);
	await page.waitForTimeout(300);
	expect((await feet(page)).y).toBeCloseTo(lowest, 1);
	await page.keyboard.down('KeyW');
	await page.waitForTimeout(2500);
	await page.keyboard.up('KeyW');
	const atWall = await feet(page);
	expect(atWall.y).toBeCloseTo(lowest, 1);
	expect(atWall.z).toBeGreaterThan(minZ + 0.3);
	expect(atWall.z).toBeLessThan(minZ + 0.3 + 0.6);

	// The floor selector reaches both basement storeys and stops there.
	await page.keyboard.press('2');
	await aimDown(page, centre.x, centre.z, 3);
	await expect(page.getByTestId('floor-name')).toHaveText('Ground Floor');
	await page.keyboard.press('BracketLeft');
	await expect(page.getByTestId('floor-name')).toHaveText('Basement');
	await page.keyboard.press('BracketLeft');
	await expect(page.getByTestId('floor-name')).toHaveText('Lower Basement');
	await expect(page.getByTestId('floor-down')).toBeDisabled();
	await page.keyboard.press('BracketLeft');
	await expect(page.getByTestId('floor-name')).toHaveText('Lower Basement');
	for (let i = 0; i < 2; i++) await page.keyboard.press('BracketRight');
	await expect(page.getByTestId('floor-name')).toHaveText('Ground Floor');

	// A stair from the Basement (−3 m) up to the Ground Floor cuts the deck; standing over the hole
	// drops you onto the stair.
	const stairId = await page.evaluate(
		({ id }) => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			const result = s.buildingManager.addStair({
				foundationId: id,
				minGridX: 8,
				maxGridX: 20, // 12 steps of 0.25 m: 3 m
				minGridZ: 8,
				maxGridZ: 12,
				baseY: -3,
				direction: '+x',
				levelIndex: -1,
				gridSizeAtCreation: 0.25,
				minimumStairWidthCells: 4,
				minimumStairRunCells: 2
			});
			return result.valid ? (result.value.id as string) : null;
		},
		{ id: placed.id }
	);
	expect(stairId).not.toBeNull();
	expect((await foundationInfo(page))!.slabs[0].openings).toBe(1);
	const overHole = await page.evaluate(
		({ minX, minZ, topY }) => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			// Over the stair's lower end, inside the hole.
			return s.worldSurfaceSampler.getSupportingSurfaceY(minX + 2.6, minZ + 2.5, topY);
		},
		{ minX, minZ, topY: placed.topY }
	);
	expect(overHole).toBeLessThan(placed.topY - 2);
	expect(overHole).toBeGreaterThan(placed.topY - 3.01);

	// B on the foundation: refused while the stair is down there, then removes it; undo and redo.
	await page.keyboard.press('1');
	await aimDown(page, centre.x, centre.z, 6);
	await expect(page.getByTestId('build-hud')).toContainText('Remove basement');
	await page.keyboard.press('b');
	await expect(page.getByTestId('crosshair-notice')).toHaveText(
		'Empty the basement first (1 piece)'
	);
	await page.evaluate(
		({ stairId }) =>
			(window as unknown as GameWindow).__forestSession.scene.buildingManager.removeStair(stairId),
		{ stairId }
	);
	await page.keyboard.press('b');
	await expect(page.getByTestId('crosshair-notice')).toHaveText('Basement removed');
	expect((await foundationInfo(page))!).toMatchObject({ basement: null, slabs: [] });
	await expect.poll(async () => (await foundationInfo(page))?.holedCells).toBe(0);
	await expect(page.getByTestId('build-hud')).toContainText('Add basement (2 storeys, 6 m)');

	await page.keyboard.press('Minus');
	await expect
		.poll(async () => (await foundationInfo(page))?.basement)
		.toEqual({
			storeys: 2,
			storeyHeight: 3
		});
	await page.keyboard.press('Equal');
	await expect.poll(async () => (await foundationInfo(page))?.basement).toBeNull();
	await page.keyboard.press('Minus');
	await expect.poll(async () => (await foundationInfo(page))?.holedCells).toBe(30);

	// Saved and reloaded: the basement, its slabs and the terrain cut come back.
	await page.keyboard.press('ControlOrMeta+s');
	await waitForSaved(page);
	const before = await foundationInfo(page);
	await page.reload();
	await openWorldNamed(page, 'Basement world');
	await expect.poll(() => scene(page)).toBe(true);
	await expect
		.poll(async () => (await foundationInfo(page))?.holedCells, { timeout: 30_000 })
		.toBe(30);
	expect(await foundationInfo(page)).toEqual(before);

	// Pictures for the record, last: the touch-mode switch that hides the overlay changes input.
	if (shots) {
		const after = (await foundationInfo(page))!;
		await shoot(
			page,
			`${shots}/basement-house-outside.png`,
			{ x: minX - 7, y: after.topY + 4, z: minZ - 7 },
			{ x: centre.x, y: after.topY, z: centre.z }
		);
		await shoot(
			page,
			`${shots}/lower-basement.png`,
			{ x: minX + 1.2, y: lowest + 1.7, z: minZ + 8.8 },
			{ x: minX + 11, y: lowest + 1.2, z: minZ + 1 }
		);
		await page.evaluate(
			({ id }) =>
				(window as unknown as GameWindow).__forestSession.scene.buildingManager.addStair({
					foundationId: id,
					minGridX: 8,
					maxGridX: 20,
					minGridZ: 8,
					maxGridZ: 12,
					baseY: -3,
					direction: '+x',
					levelIndex: -1,
					gridSizeAtCreation: 0.25,
					minimumStairWidthCells: 4,
					minimumStairRunCells: 2
				}),
			{ id: after.id }
		);
		await shoot(
			page,
			`${shots}/stair-hole.png`,
			{ x: minX + 8, y: after.topY + 2.2, z: minZ + 4.5 },
			{ x: minX + 3.2, y: after.topY - 3, z: minZ + 2.5 }
		);
	}
	expect(errors).toEqual([]);
});
