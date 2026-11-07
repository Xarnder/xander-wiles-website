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
	useCreatureKey(): boolean;
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

/** Just the Three.js shapes the pose test reads (no Three.js import in the page). */
interface V3 {
	x: number;
	y: number;
	z: number;
	clone(): V3;
	copy(v: V3): V3;
	set(x: number, y: number, z: number): V3;
	sub(v: V3): V3;
	setY(y: number): V3;
	normalize(): V3;
	addScaledVector(v: V3, s: number): V3;
	project(camera: unknown): V3;
	applyMatrix4(m: unknown): V3;
}
interface Obj3 {
	position: V3;
	scale: V3;
	getObjectByName(name: string): Obj3 | undefined;
	getWorldPosition(out: V3): V3;
	getWorldScale(out: V3): V3;
	children: Obj3[];
}
interface PoseScene extends SceneLike {
	scene: Obj3;
	camera: {
		position: V3;
		matrixWorldInverse: unknown;
		lookAt(x: number, y: number, z: number): void;
		updateMatrixWorld(): void;
	};
	renderer: { render(scene: unknown, camera: unknown): void };
	heldCreature: { attached: unknown; bodyHalfSize: V3; muzzleWorld(out: V3): V3 | null };
	miniBuildInteraction: { localCharacter: { object: Obj3 } | null };
}

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
		// The put-down hint sits just above the health bar, not by the crosshair.
		const hint = page.getByTestId('carry-key-hint');
		await expect(hint).toHaveText('[K] Put down · Left click to fire');
		await expect(page.getByTestId('carry-prompt')).toBeHidden();
		const hintBox = (await hint.boundingBox())!;
		const healthBox = (await page.getByTestId('health-hud').boundingBox())!;
		const viewport = page.viewportSize()!;
		expect(hintBox.y + hintBox.height).toBeLessThanOrEqual(healthBox.y + 1);
		expect(healthBox.y - (hintBox.y + hintBox.height)).toBeLessThan(16);
		expect(hintBox.y).toBeGreaterThan(viewport.height * 0.75);
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
		await expect(hint).toHaveText('[K] Put down');
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

	test('held at its real size: head and neck in first person, tucked under the arm in third', async ({
		page
	}) => {
		await pickUp(page);
		await page.waitForTimeout(300);

		// First person: nothing between the scene and the creature is scaled, and its head is in the
		// lower-left of the view, large.
		const firstPerson = await page.evaluate(() => {
			const s = (window as unknown as { forestScene: PoseScene }).forestScene;
			const held = s.scene.getObjectByName('held-creature')!;
			const v = held.position.clone();
			// Holder → recoil group → the compiled creature.
			const inner = held.children[0]!;
			const scale = inner.scale.x * inner.children[0]!.scale.x;
			const mouth = s.heldCreature.muzzleWorld(v.clone())!.project(s.camera);
			const body = held.getWorldPosition(v.clone()).project(s.camera);
			// Camera space: −Z is ahead, so a body centre past the near plane is behind the view.
			const bodyView = held.getWorldPosition(v.clone()).applyMatrix4(s.camera.matrixWorldInverse);
			return {
				scale,
				holderScale: held.getWorldScale(v.clone()).x,
				mouth: { x: mouth.x, y: mouth.y },
				body: { x: body.x, y: body.y, behind: bodyView.z > -0.1 }
			};
		});
		expect(firstPerson.scale).toBeCloseTo(1, 3);
		expect(firstPerson.holderScale).toBeCloseTo(1, 3);
		expect(firstPerson.mouth.x).toBeGreaterThan(-1);
		expect(firstPerson.mouth.x).toBeLessThan(-0.15);
		expect(firstPerson.mouth.y).toBeGreaterThan(-1);
		expect(firstPerson.mouth.y).toBeLessThan(-0.1);
		// The body runs back out of the corner: below and left of the head, or off screen.
		expect(firstPerson.body.behind || firstPerson.body.y < firstPerson.mouth.y).toBe(true);
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/carry-pose-first-person.png` });

		// Third person: under the left arm, pressed to the side, the arm over its back and the hand
		// down its far side.
		await page.evaluate(() => {
			const s = (window as unknown as { forestScene: PoseScene }).forestScene;
			s.controller.restoreState(s.controller.worldPosition, 0.6, -0.15);
			s.toggleThirdPerson();
		});
		await page.waitForTimeout(2500);
		const pose = await page.evaluate(() => {
			const s = (window as unknown as { forestScene: PoseScene }).forestScene;
			const character = s.miniBuildInteraction.localCharacter!.object;
			const held = s.scene.getObjectByName('held-creature')!;
			const at = (name: string) =>
				character.getObjectByName(`mixamorig${name}`)!.getWorldPosition(held.position.clone());
			const centre = held.getWorldPosition(held.position.clone());
			const shoulder = at('LeftArm');
			const left = shoulder.clone().sub(at('RightArm')).setY(0).normalize();
			const out = (p: { x: number; y: number; z: number }) =>
				(p.x - shoulder.x) * left.x + (p.z - shoulder.z) * left.z;
			const half = s.heldCreature.bodyHalfSize;
			return {
				half: { x: half.x, y: half.y },
				holderScale: held.getWorldScale(held.position.clone()).x,
				centreOut: out(centre),
				centreBelowShoulder: shoulder.y - centre.y,
				elbowAboveCentre: at('LeftForeArm').y - centre.y,
				elbowOut: out(at('LeftForeArm')),
				handOut: out(at('LeftHand'))
			};
		});
		expect(pose.holderScale).toBeCloseTo(1, 3);
		expect(pose.centreBelowShoulder).toBeGreaterThan(pose.half.y);
		// The elbow arches above its back and past its middle; the hand reaches its far side.
		expect(pose.elbowAboveCentre).toBeGreaterThan(pose.half.y * 0.6);
		expect(pose.elbowOut).toBeGreaterThan(pose.centreOut);
		expect(pose.handOut).toBeGreaterThan(pose.centreOut + pose.half.x * 0.6);
		if (SHOTS) {
			await page.screenshot({ path: `${SHOTS}/carry-pose-behind.png` });
			// Look at the hold from the side and the front: the render camera is moved just before each
			// draw, so the game itself (and the pose) is untouched.
			for (const [name, out, forward] of [
				['side', 1.7, 0.2],
				['front', 0.9, 1.5]
			] as const) {
				await page.evaluate(
					({ out, forward }) => {
						const s = (window as unknown as { forestScene: PoseScene }).forestScene;
						const camera = s.camera;
						const renderer = s.renderer as PoseScene['renderer'] & {
							originalRender?: PoseScene['renderer']['render'];
						};
						renderer.originalRender ??= renderer.render;
						renderer.render = (scene, view) => {
							if (view === camera) {
								const character = s.miniBuildInteraction.localCharacter!.object;
								const held = s.scene.getObjectByName('held-creature')!;
								const centre = held.getWorldPosition(held.position.clone());
								const at = (name: string) =>
									character
										.getObjectByName(`mixamorig${name}`)!
										.getWorldPosition(held.position.clone());
								const left = at('LeftArm').sub(at('RightArm')).setY(0).normalize();
								const ahead = held.position.clone().set(-left.z, 0, left.x);
								camera.position
									.copy(centre)
									.addScaledVector(left, out)
									.addScaledVector(ahead, forward);
								camera.position.y += 0.25;
								camera.lookAt(centre.x, centre.y + 0.1, centre.z);
								camera.updateMatrixWorld();
							}
							return renderer.originalRender!.call(renderer, scene, view);
						};
					},
					{ out, forward }
				);
				await page.waitForTimeout(400);
				await page.screenshot({ path: `${SHOTS}/carry-pose-${name}.png` });
			}
			await page.evaluate(() => {
				const s = (window as unknown as { forestScene: PoseScene }).forestScene;
				const renderer = s.renderer as PoseScene['renderer'] & {
					originalRender?: PoseScene['renderer']['render'];
				};
				if (renderer.originalRender) renderer.render = renderer.originalRender;
			});
		}
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
