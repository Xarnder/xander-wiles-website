import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld, openWorldNamed } from './worldHelpers';

/**
 * Ranged weapons, Phase 1 (single player): pick up a small creature with K, see it in hand,
 * fire seed pellets that stop at the ground, stow while building, put it down, and the carry
 * never surviving a reload. Plan: docs/2026/11-04/range-weapons.
 */

const SHOTS = process.env.RANGED_SHOTS_DIR;

type Vec = { x: number; y: number; z: number };
type CarryState = { carrying: boolean; charges: number; stowed: boolean; species: string | null };
interface SceneLike {
	setTouchActive(active: boolean): void;
	toggleBuildMode(): void;
	toggleThirdPerson(): void;
	toggleCarry(): boolean;
	setCarryTrigger(held: boolean): void;
	getCarryState(): CarryState;
	buildToolManager: { isNormalMode(): boolean };
	carry: { carriedId: string | null; fire(): boolean };
	heldCreature: { attached: unknown };
	projectiles: { activeCount: number; launched: number; worldHits: number };
	controller: {
		worldPosition: Vec;
		thirdPerson: boolean;
		restoreState(p: Vec, yaw: number, pitch: number): void;
	};
	worldSurfaceSampler: { getSupportingSurfaceY(x: number, z: number, ref: number): number };
	creatures: {
		live: Map<
			string,
			{ compiled: { object: { position: Vec }; compilation: { collision: { height: number } } } }
		>;
		logical: Map<
			string,
			{
				position: Vec;
				spawn: {
					species: {
						name: string;
						bodyPlan: { id: string };
						proportions: Record<string, number>;
					};
					individual: { sizeFactor: number };
				};
			}
		>;
		isCarried(id: string): boolean;
	};
}
type TestWindow = { forestScene: SceneLike };

async function lowGraphics(page: Page) {
	await page.addInitScript(() => localStorage.setItem('forest-drift.graphics.v1', 'low'));
}

/** Stand 1.3 m from the nearest small (or, with `big`, a too-tall) creature, looking at its middle. */
async function aimAtCreature(page: Page, big = false): Promise<void> {
	await expect
		.poll(
			() =>
				page.evaluate((big) => {
					const s = (window as unknown as TestWindow).forestScene;
					const me = s.controller.worldPosition;
					let best: { d: number; id: string } | null = null;
					for (const [id] of s.creatures.live) {
						const r = s.creatures.logical.get(id);
						if (!r) continue;
						const p = r.spawn.species.proportions;
						const h =
							(p.legLength + p.bodyDepth + p.neckLength + p.headSize) *
							r.spawn.individual.sizeFactor;
						const small = h <= 0.9 && r.spawn.species.bodyPlan.id === 'quadruped';
						if (small === big || (big && h > 3)) continue;
						const d = Math.hypot(r.position.x - me.x, r.position.z - me.z);
						if (!best || d < best.d) best = { d, id };
					}
					if (!best) return null;
					const live = s.creatures.live.get(best.id)!;
					const p = live.compiled.object.position;
					const mid = p.y + live.compiled.compilation.collision.height / 2;
					const from = { x: p.x + 1.3, z: p.z };
					const eyeY = s.worldSurfaceSampler.getSupportingSurfaceY(from.x, from.z, Infinity) + 1.7;
					s.controller.restoreState(
						{ x: from.x, y: eyeY, z: from.z },
						Math.atan2(-(p.x - from.x), -(p.z - from.z)),
						Math.atan2(mid - eyeY, 1.3)
					);
					return best.id;
				}, big),
			{ timeout: 30_000 }
		)
		.not.toBeNull();
}

async function carryState(page: Page): Promise<CarryState> {
	return page.evaluate(() => (window as unknown as TestWindow).forestScene.getCarryState());
}

async function enterWalking(page: Page) {
	await page.evaluate(() => {
		const s = (window as unknown as TestWindow).forestScene;
		s.setTouchActive(true);
		if (!s.buildToolManager.isNormalMode()) s.toggleBuildMode();
	});
}

/** Retries the pick-up a few times: creatures wander, so re-aim between attempts. */
async function pickUp(page: Page) {
	for (let attempt = 0; attempt < 5; attempt++) {
		await aimAtCreature(page);
		await page.waitForTimeout(150);
		await page.keyboard.press('k');
		if ((await carryState(page)).carrying) return;
	}
	expect((await carryState(page)).carrying).toBe(true);
}

test.describe('ranged weapons: carrying a small creature (single player)', () => {
	test.beforeEach(async ({ page }) => {
		test.setTimeout(150_000);
		await lowGraphics(page);
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Ranged weapons', seed: 'forest' });
		await enterWalking(page);
	});

	test('pick up, fire, stow, third person, put down', async ({ page }) => {
		await pickUp(page);
		const state = await carryState(page);
		expect(state).toMatchObject({ carrying: true, charges: 5, stowed: false });
		const carriedId = await page.evaluate(
			() => (window as unknown as TestWindow).forestScene.carry.carriedId
		);
		expect(carriedId).toMatch(/^group:forest:/);
		// Out of the herd, in hand, on the HUD and announced.
		expect(
			await page.evaluate(
				(id) => (window as unknown as TestWindow).forestScene.creatures.logical.has(id!),
				carriedId
			)
		).toBe(false);
		await expect(page.getByTestId('carry-hud')).toBeVisible();
		await expect(page.getByTestId('carry-hud')).toHaveAttribute('data-charges', '5');
		await expect(page.getByTestId('carry-announcement')).toContainText(
			`Picked up ${state.species}`
		);
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/carry-first-person.png` });

		// One shot, aimed level so it flies a while: a pellet leaves and a charge is spent.
		await page.evaluate(() => {
			const s = (window as unknown as TestWindow).forestScene;
			s.controller.restoreState(s.controller.worldPosition, 0, 0.03);
		});
		await page.waitForTimeout(100);
		const fired = await page.evaluate(() => {
			const s = (window as unknown as TestWindow).forestScene;
			const before = s.projectiles.launched;
			s.setCarryTrigger(true);
			s.setCarryTrigger(false);
			return { launched: s.projectiles.launched - before, inFlight: s.projectiles.activeCount };
		});
		expect(fired).toEqual({ launched: 1, inFlight: 1 });
		await expect(page.getByTestId('carry-hud')).toHaveAttribute('data-charges', '4');
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/carry-pellet.png` });
		// It ends within its 30 m lifetime (on the ground or simply expiring).
		await expect
			.poll(() =>
				page.evaluate(() => (window as unknown as TestWindow).forestScene.projectiles.activeCount)
			)
			.toBe(0);
		// Fired straight down, it stops at the ground.
		const hitsBefore = await page.evaluate(
			() => (window as unknown as TestWindow).forestScene.projectiles.worldHits
		);
		await page.evaluate(() => {
			const s = (window as unknown as TestWindow).forestScene;
			s.controller.restoreState(s.controller.worldPosition, 0, -1.2);
		});
		await page.waitForTimeout(500);
		await page.evaluate(() => {
			const s = (window as unknown as TestWindow).forestScene;
			s.setCarryTrigger(true);
			s.setCarryTrigger(false);
		});
		await expect
			.poll(() =>
				page.evaluate(() => (window as unknown as TestWindow).forestScene.projectiles.worldHits)
			)
			.toBe(hitsBefore + 1);

		// Holding the trigger keeps firing, never faster than one shot per 350 ms.
		const held = await page.evaluate(async () => {
			const s = (window as unknown as TestWindow).forestScene;
			const before = s.projectiles.launched;
			s.setCarryTrigger(true);
			await new Promise((r) => setTimeout(r, 1100));
			s.setCarryTrigger(false);
			const during = s.projectiles.launched - before;
			// Right after the last shot the minimum gap still applies.
			const again = s.carry.fire() && s.carry.fire();
			return { during, again };
		});
		expect(held.during).toBeGreaterThanOrEqual(2);
		expect(held.during).toBeLessThanOrEqual(4);
		expect(held.again).toBe(false);

		// Build mode stows the creature: still carried, can't fire, and the HUD dims.
		await page.evaluate(() => (window as unknown as TestWindow).forestScene.toggleBuildMode());
		await expect.poll(async () => (await carryState(page)).stowed).toBe(true);
		await page.waitForTimeout(400);
		expect(
			await page.evaluate(() => (window as unknown as TestWindow).forestScene.carry.fire())
		).toBe(false);
		await page.evaluate(() => (window as unknown as TestWindow).forestScene.toggleBuildMode());
		await expect.poll(async () => (await carryState(page)).stowed).toBe(false);

		// Third person: under the left arm.
		await page.evaluate(() => {
			const s = (window as unknown as TestWindow).forestScene;
			s.controller.restoreState(s.controller.worldPosition, 0.6, -0.15);
			s.toggleThirdPerson();
		});
		await page.waitForTimeout(2500);
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/carry-third-person.png` });
		await page.evaluate(() => (window as unknown as TestWindow).forestScene.toggleThirdPerson());

		// K puts it down: back in the herd, near where the player stands.
		await page.keyboard.press('k');
		await expect(page.getByTestId('carry-hud')).toBeHidden();
		await expect(page.getByTestId('carry-announcement')).toContainText(`Put down ${state.species}`);
		const back = await page.evaluate((id) => {
			const s = (window as unknown as TestWindow).forestScene;
			const r = s.creatures.logical.get(id!);
			const me = s.controller.worldPosition;
			return r ? Math.hypot(r.position.x - me.x, r.position.z - me.z) : null;
		}, carriedId);
		expect(back).not.toBeNull();
		expect(back!).toBeLessThan(2);
	});

	test("a big creature can't be picked up", async ({ page }) => {
		await aimAtCreature(page, true);
		await page.waitForTimeout(200);
		await page.keyboard.press('k');
		expect((await carryState(page)).carrying).toBe(false);
		await expect(page.getByTestId('carry-hud')).toBeHidden();
	});

	test('a carry never survives a reload', async ({ page }) => {
		await pickUp(page);
		await page.reload();
		await openWorldNamed(page, 'Ranged weapons');
		await expect(page.getByTestId('loading-screen')).toBeHidden({ timeout: 60_000 });
		await expect
			.poll(() => page.evaluate(() => !!(window as unknown as TestWindow).forestScene?.carry))
			.toBe(true);
		expect((await carryState(page)).carrying).toBe(false);
		await expect(page.getByTestId('carry-hud')).toBeHidden();
	});

	test('the carry HUD fits the phone layout without covering the health bar', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await enterWalking(page);
		await pickUp(page);
		const hud = await page.getByTestId('carry-hud').boundingBox();
		expect(hud).not.toBeNull();
		expect(hud!.x).toBeGreaterThanOrEqual(0);
		expect(hud!.x + hud!.width).toBeLessThanOrEqual(375);
		const bar = await page.locator('[data-testid="health-bar"]').first().boundingBox();
		if (bar) expect(hud!.y + hud!.height).toBeLessThanOrEqual(bar.y + 1);
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/carry-phone.png` });
	});
});
