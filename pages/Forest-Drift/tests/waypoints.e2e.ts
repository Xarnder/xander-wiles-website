import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld, openPauseMenu, openWorldNamed } from './worldHelpers';

/**
 * Waypoints and carry badges: paw badges over carryable creatures, the pause menu's Waypoints
 * panel, the moving "nearest carryable creature" waypoint, personal waypoints, beacons, the locator
 * bar in single player, and waypoints kept across a reload.
 */

const SHOTS = process.env.WAYPOINT_SHOTS_DIR;

type Vec = { x: number; y: number; z: number };
interface SceneLike {
	setTouchActive(active: boolean): void;
	toggleBuildMode(): void;
	useCreatureKey(): boolean;
	buildToolManager: { isNormalMode(): boolean };
	carry: { carrying: boolean };
	carryHints: { shown: number };
	controller: { worldPosition: Vec; restoreState(p: Vec, yaw: number, pitch: number): void };
	worldSurfaceSampler: { getSupportingSurfaceY(x: number, z: number, ref: number): number };
	scene: { getObjectsByProperty(key: string, value: string): { visible: boolean }[] };
	getWaypoints(): { id: string; name: string; enabled: boolean; status: string }[];
	creatures: {
		live: Map<
			string,
			{ compiled: { object: { position: Vec }; compilation: { collision: { height: number } } } }
		>;
		isCarryable(id: string): boolean;
		nearestCarryable(from: Vec): { id: string; x: number; y: number; z: number } | null;
	};
}
type TestWindow = { forestScene: SceneLike };
const run = <T>(page: Page, fn: (s: SceneLike) => T) =>
	page.evaluate(
		(source) =>
			new Function('s', `return (${source})(s);`)((window as unknown as TestWindow).forestScene),
		fn.toString()
	) as Promise<T>;

async function walking(page: Page) {
	await run(page, (s) => {
		s.setTouchActive(true);
		if (!s.buildToolManager.isNormalMode()) s.toggleBuildMode();
	});
}

/** Stand 12 m from the nearest carryable creature, facing it. */
async function standNearCarryable(page: Page) {
	await expect
		.poll(
			() =>
				run(page, (s) => {
					const me = s.controller.worldPosition;
					const found = s.creatures.nearestCarryable(me);
					if (!found) return false;
					const from = { x: found.x + 12, z: found.z };
					const eyeY = s.worldSurfaceSampler.getSupportingSurfaceY(from.x, from.z, Infinity) + 1.7;
					s.controller.restoreState(
						{ x: from.x, y: eyeY, z: from.z },
						Math.atan2(-(found.x - from.x), -(found.z - from.z)),
						-0.12
					);
					return true;
				}),
			{ timeout: 30_000 }
		)
		.toBe(true);
}

test.describe('waypoints', () => {
	test.beforeEach(async ({ page }) => {
		test.setTimeout(150_000);
		await page.addInitScript(() => localStorage.setItem('forest-drift.graphics.v1', 'low'));
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Waypoints', seed: 'forest' });
		await walking(page);
	});

	test('badges, the creature waypoint, personal waypoints, beacons and the locator bar', async ({
		page
	}) => {
		// Paw badges float over the carryable creatures nearby.
		await standNearCarryable(page);
		await expect
			.poll(() => run(page, (s) => s.carryHints.shown), { timeout: 15_000 })
			.toBeGreaterThan(0);
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/carry-badges.png` });

		// Pause → Waypoints: the creature waypoint is listed first, off.
		await openPauseMenu(page);
		await page.getByTestId('pause-waypoints').click();
		await expect(page.getByTestId('pause-waypoints-panel')).toBeVisible();
		const creatureRow = page.locator('[data-testid="waypoint-row"][data-id="nearest-carryable"]');
		await expect(creatureRow).toHaveAttribute('data-status', 'off');
		await creatureRow.getByTestId('waypoint-toggle').click();
		await expect(creatureRow).toHaveAttribute('data-status', 'active');
		await expect(creatureRow.getByTestId('waypoint-toggle')).toHaveAttribute(
			'aria-checked',
			'true'
		);
		await expect(creatureRow.getByTestId('waypoint-detail')).toContainText(' m');

		// A personal waypoint where the player stands.
		await page.getByTestId('waypoint-name-input').fill('Camp');
		await page.getByTestId('waypoint-add').click();
		await expect(page.getByTestId('waypoint-row')).toHaveCount(2);
		const campRow = page.getByTestId('waypoint-row').nth(1);
		await expect(campRow).toContainText('Camp');
		// Single player: the Public switch is there, off and unavailable, and says why.
		await expect(campRow.getByTestId('waypoint-visibility')).toBeDisabled();
		await expect(campRow.getByTestId('waypoint-visibility')).toHaveAttribute(
			'aria-checked',
			'false'
		);
		await expect(campRow.getByTestId('waypoint-sharing')).toHaveText(
			'Only you can see it · public waypoints are for online worlds'
		);
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/pause-waypoints.png` });

		// Resume: two beacons, and the locator bar (single player!) shows two waypoint pins.
		await page.getByTestId('pause-waypoints-back').click();
		await page.getByTestId('pause-resume').click();
		await walking(page);
		await expect
			.poll(() =>
				run(
					page,
					(s) =>
						s.scene.getObjectsByProperty('name', 'waypoint-beam').filter((o) => o.visible).length
				)
			)
			.toBe(2);
		const bar = page.getByTestId('locator-bar');
		await expect(bar).toBeVisible();
		await expect(bar.locator('.locator-marker.waypoint')).toHaveCount(2);
		// Walk away from Camp so its beacon is easy to see, facing it.
		await run(page, (s) => {
			const p = s.controller.worldPosition;
			s.controller.restoreState({ x: p.x + 40, y: p.y + 6, z: p.z + 40 }, Math.PI * 0.25, -0.05);
		});
		await page.waitForTimeout(1500);
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/waypoint-beacons.png` });
		await expect(bar.locator('.locator-marker.waypoint').filter({ hasText: 'Camp' })).toHaveCount(
			1
		);

		// Picking a creature up hides the creature waypoint (you have one) until it's put down.
		await standNearCarryable(page);
		for (let attempt = 0; attempt < 8; attempt++) {
			const picked = await run(page, (s) => {
				const me = s.controller.worldPosition;
				const found = s.creatures.nearestCarryable(me)!;
				const from = { x: found.x + 1.3, z: found.z };
				const eyeY = s.worldSurfaceSampler.getSupportingSurfaceY(from.x, from.z, Infinity) + 1.7;
				s.controller.restoreState(
					{ x: from.x, y: eyeY, z: from.z },
					Math.atan2(-(found.x - from.x), -(found.z - from.z)),
					Math.atan2(found.y + 0.3 - eyeY, 1.3)
				);
				return false;
			});
			void picked;
			await page.waitForTimeout(150);
			await page.keyboard.press('k');
			if (await run(page, (s) => s.carry.carrying)) break;
		}
		expect(await run(page, (s) => s.carry.carrying)).toBe(true);
		await expect.poll(() => run(page, (s) => s.getWaypoints()[0]!.status)).toBe('carrying');
		expect(await run(page, (s) => s.carryHints.shown)).toBe(0);
		await expect(bar.locator('.locator-marker.waypoint')).toHaveCount(1);
		await page.keyboard.press('k');
		await expect.poll(() => run(page, (s) => s.getWaypoints()[0]!.status)).toBe('active');
	});

	test('waypoints are kept with the world across a reload, and can be removed', async ({
		page
	}) => {
		await openPauseMenu(page);
		await page.getByTestId('pause-waypoints').click();
		await page.getByTestId('waypoint-name-input').fill('Well');
		await page.getByTestId('waypoint-add').click();
		await page
			.locator('[data-testid="waypoint-row"][data-id="nearest-carryable"]')
			.getByTestId('waypoint-toggle')
			.click();
		await page.reload();
		await openWorldNamed(page, 'Waypoints');
		const rows = await run(page, (s) => s.getWaypoints().map((w) => [w.name, w.enabled]));
		expect(rows).toEqual([
			['Nearest carryable creature', true],
			['Well', true]
		]);
		await openPauseMenu(page);
		await page.getByTestId('pause-waypoints').click();
		await page.getByTestId('waypoint-row').nth(1).getByTestId('waypoint-remove').click();
		await expect(page.getByTestId('waypoint-row')).toHaveCount(1);
		// Turning the badges off sticks too.
		await page.getByTestId('carry-hints-toggle').uncheck();
		expect(
			await run(
				page,
				(s) => (s as unknown as { waypoints: { carryHints: boolean } }).waypoints.carryHints
			)
		).toBe(false);
	});
});
