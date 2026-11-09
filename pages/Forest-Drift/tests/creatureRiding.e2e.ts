import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Riding bipeds (single player): climb on with K, steer and sprint faster than running, get off
 * safely; carry a small creature, ride with it and fire from the seat (Q12 C, F1, F2).
 * Plan: docs/2026/11-07/bipedal-speed-creature.
 */

const SHOTS = process.env.RIDING_SHOTS_DIR;
const RUN = 12;

type Vec = { x: number; y: number; z: number };
interface SceneLike {
	setTouchActive(active: boolean): void;
	toggleBuildMode(): void;
	toggleThirdPerson(): void;
	setCarryTrigger(held: boolean): void;
	getRideState(): { riding: boolean; species: string | null; seat: string | null };
	getCarryState(): { carrying: boolean };
	getHealth(): { current: number };
	buildToolManager: { isNormalMode(): boolean };
	ride: { riddenId: string | null; target: { id: string } | null };
	projectiles: { launched: number };
	controller: {
		worldPosition: Vec;
		mountActive: boolean;
		thirdPerson: boolean;
		setTouchMovement(x: number, z: number): void;
		setTouchRunning(running: boolean): void;
		restoreState(p: Vec, yaw: number, pitch: number): void;
	};
	worldSurfaceSampler: { getSupportingSurfaceY(x: number, z: number, ref: number): number };
	creatures: {
		live: Map<
			string,
			{
				compiled: {
					object: { position: Vec };
					compilation: { collision: { height: number; radius: number } };
				};
			}
		>;
		logical: Map<string, { position: Vec; state: string; intent: { velocity: Vec; gait: string } }>;
		isRideable(id: string): boolean;
		isCarryable(id: string): boolean;
	};
}
type TestWindow = { forestScene: SceneLike };

async function lowGraphics(page: Page) {
	await page.addInitScript(() => localStorage.setItem('forest-drift.graphics.v1', 'low'));
}

/** Stands just outside the nearest live creature of a kind, looking at its middle. */
async function aimAt(page: Page, kind: 'ride' | 'carry'): Promise<void> {
	await expect
		.poll(
			() =>
				page.evaluate((kind) => {
					const s = (window as unknown as TestWindow).forestScene;
					const me = s.controller.worldPosition;
					let best: { d: number; id: string } | null = null;
					for (const [id, live] of s.creatures.live) {
						const ok = kind === 'ride' ? s.creatures.isRideable(id) : s.creatures.isCarryable(id);
						if (!ok || id === s.ride.riddenId) continue;
						const p = live.compiled.object.position;
						const d = Math.hypot(p.x - me.x, p.z - me.z);
						if (!best || d < best.d) best = { d, id };
					}
					if (!best) return null;
					const live = s.creatures.live.get(best.id)!;
					const p = live.compiled.object.position;
					const { height, radius } = live.compiled.compilation.collision;
					const gap = radius + (kind === 'ride' ? 1 : 0.8);
					const from = { x: p.x + gap, z: p.z };
					const eyeY = s.worldSurfaceSampler.getSupportingSurfaceY(from.x, from.z, Infinity) + 1.7;
					const target = p.y + Math.min(height / 2, 2);
					s.controller.restoreState(
						{ x: from.x, y: eyeY, z: from.z },
						Math.atan2(-(p.x - from.x), -(p.z - from.z)),
						Math.atan2(target - eyeY, gap)
					);
					return best.id;
				}, kind),
			{ timeout: 45_000 }
		)
		.not.toBeNull();
}

/**
 * Taps Space while riding and watches, frame by frame for two seconds, the mount's lift above where
 * it stood and how far the rider's eye strays from where it sits on the mount.
 */
async function jumpAndWatch(page: Page) {
	// Drawn and logical heights differ by the body's own stance; this is the stance at rest.
	const sampleSource = (s: SceneLike) => {
		const id = s.ride.riddenId!;
		const drawn = s.creatures.live.get(id)!.compiled.object.position.y;
		return {
			lift: drawn - s.creatures.logical.get(id)!.position.y,
			seat: s.controller.worldPosition.y - drawn
		};
	};
	const rest = await scene(page, sampleSource);
	const watching = page.evaluate(
		async ({ rest, source }) => {
			const s = (window as unknown as TestWindow).forestScene;
			const sample = new Function('s', `return (${source})(s)`) as (s: SceneLike) => {
				lift: number;
				seat: number;
			};
			let highest = 0,
				strayed = 0,
				leftAt = NaN,
				topAt = NaN,
				downAt = NaN;
			const start = performance.now();
			while (performance.now() - start < 2000) {
				await new Promise(requestAnimationFrame);
				const now = (performance.now() - start) / 1000;
				const { lift: drawnLift, seat } = sample(s);
				const lift = drawnLift - rest.lift;
				if (Number.isNaN(leftAt) && lift > 0.15) leftAt = now;
				if (lift > highest) {
					highest = lift;
					topAt = now;
				}
				if (!Number.isNaN(topAt) && Number.isNaN(downAt) && lift < 0.15) downAt = now;
				strayed = Math.max(strayed, Math.abs(seat - rest.seat));
			}
			return {
				highest,
				strayed,
				rising: topAt - leftAt,
				falling: downAt - topAt,
				settled: sample(s).lift - rest.lift
			};
		},
		{ rest, source: sampleSource.toString() }
	);
	await page.keyboard.down('Space');
	await page.waitForTimeout(120);
	await page.keyboard.up('Space');
	return watching;
}

const scene = <T>(page: Page, fn: (s: SceneLike) => T) =>
	page.evaluate((source) => {
		const s = (window as unknown as TestWindow).forestScene;
		return new Function('s', `return (${source})(s)`)(s);
	}, fn.toString()) as Promise<T>;

/**
 * Climbs on (re-aiming between attempts: creatures wander). K is only pressed once the prompt
 * offers the ride: while carrying, K with no mount in view puts the creature down instead (F2).
 */
async function climbOn(page: Page) {
	for (let attempt = 0; attempt < 6; attempt++) {
		await aimAt(page, 'ride');
		const ready = await expect
			.poll(() => scene(page, (s) => s.ride.target !== null), { timeout: 2000 })
			.toBe(true)
			.then(
				() => true,
				() => false
			);
		if (!ready) continue;
		await page.keyboard.press('k');
		if ((await scene(page, (s) => s.getRideState())).riding) return;
	}
	expect((await scene(page, (s) => s.getRideState())).riding).toBe(true);
}

async function pickUp(page: Page) {
	for (let attempt = 0; attempt < 6; attempt++) {
		await aimAt(page, 'carry');
		await page.waitForTimeout(200);
		await page.keyboard.press('k');
		if ((await scene(page, (s) => s.getCarryState())).carrying) return;
	}
	expect((await scene(page, (s) => s.getCarryState())).carrying).toBe(true);
}

test.describe('riding a two-legged creature (single player)', () => {
	test.beforeEach(async ({ page }) => {
		test.setTimeout(180_000);
		await lowGraphics(page);
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Riding', seed: 'forest' });
		await scene(page, (s) => {
			s.setTouchActive(true);
			if (!s.buildToolManager.isNormalMode()) s.toggleBuildMode();
		});
	});

	test('climb on, sprint faster than running, get off safely', async ({ page }) => {
		await climbOn(page);
		const state = await scene(page, (s) => s.getRideState());
		expect(state.seat === 'neck' || state.seat === 'right-shoulder').toBe(true);
		await expect(page.getByTestId('ride-hud')).toBeVisible();
		await expect(page.getByTestId('carry-announcement')).toContainText(`Riding ${state.species}`);
		// Get off is shown just above the health bar, not by the crosshair.
		const hint = page.getByTestId('carry-key-hint');
		await expect(hint).toHaveText('[K] Get off');
		await expect(page.getByTestId('carry-prompt')).toBeHidden();
		const hintBox = (await hint.boundingBox())!;
		const healthBox = (await page.getByTestId('health-hud').boundingBox())!;
		expect(hintBox.y + hintBox.height).toBeLessThanOrEqual(healthBox.y + 1);
		expect(healthBox.y - (hintBox.y + hintBox.height)).toBeLessThan(16);
		expect(hintBox.y).toBeGreaterThan(page.viewportSize()!.height * 0.75);

		// Sprint for a while: the mount runs faster than the player can.
		await scene(page, (s) => {
			s.controller.setTouchMovement(0, 1);
			s.controller.setTouchRunning(true);
		});
		await expect
			.poll(
				() =>
					scene(page, (s) => {
						const r = s.creatures.logical.get(s.ride.riddenId!)!;
						return Math.hypot(r.intent.velocity.x, r.intent.velocity.z);
					}),
				{ timeout: 15_000 }
			)
			.toBeGreaterThan(RUN * 1.15);
		if (SHOTS) {
			await scene(page, (s) => (s.controller.thirdPerson = true));
			await page.waitForTimeout(500);
			await page.screenshot({ path: `${SHOTS}/ride-third-person.png` });
		}
		await scene(page, (s) => {
			s.controller.setTouchMovement(0, 0);
			s.controller.setTouchRunning(false);
		});

		// Space: the mount jumps in one smooth arc and lands; the rider stays in the seat throughout.
		// First let it settle from the sprint (a running body sits a little lower).
		await page.waitForTimeout(1500);
		const jumped = await jumpAndWatch(page);
		expect(jumped.highest).toBeGreaterThan(0.85);
		expect(Math.abs(jumped.settled)).toBeLessThan(0.1);
		// Smooth: rising and falling each take about √(2h/g) (g = 20), not a frame's snap.
		const arc = Math.sqrt((2 * jumped.highest) / 20);
		expect(jumped.rising).toBeGreaterThan(arc * 0.6);
		expect(jumped.falling).toBeGreaterThan(arc * 0.6);
		// The seat's own bob and sway only.
		expect(jumped.strayed).toBeLessThan(0.35);
		expect(await scene(page, (s) => s.getRideState().riding)).toBe(true);

		const ridden = await scene(page, (s) => s.ride.riddenId);
		await page.keyboard.press('k');
		await expect.poll(() => scene(page, (s) => s.controller.mountActive)).toBe(false);
		const landed = await scene(page, (s) => {
			const e = s.controller.worldPosition;
			return {
				eyeAboveGround: e.y - s.worldSurfaceSampler.getSupportingSurfaceY(e.x, e.z, e.y),
				health: s.getHealth().current,
				riding: s.getRideState().riding
			};
		});
		expect(landed.riding).toBe(false);
		expect(landed.eyeAboveGround).toBeCloseTo(1.7, 1);
		expect(landed.health).toBe(36);
		// The mount is back in its herd, standing.
		expect(
			await page.evaluate(
				(id) => (window as unknown as TestWindow).forestScene.creatures.logical.has(id!),
				ridden
			)
		).toBe(true);
		await expect(page.getByTestId('ride-hud')).toHaveCount(0);
	});

	test('carry a small creature onto a mount, fire from the seat, keep it when getting off', async ({
		page
	}) => {
		// The mount can step out of the crosshair just as K is pressed, and then K puts the creature
		// down instead (by design): pick it up again and retry.
		for (let attempt = 0; attempt < 4; attempt++) {
			await pickUp(page);
			await climbOn(page);
			if (await scene(page, (s) => s.getCarryState().carrying)) break;
			await page.keyboard.press('k');
			await expect.poll(() => scene(page, (s) => s.controller.mountActive)).toBe(false);
		}
		expect(await scene(page, (s) => s.getCarryState().carrying)).toBe(true);
		expect(await scene(page, (s) => s.getRideState().riding)).toBe(true);
		await expect(page.getByTestId('carry-key-hint')).toHaveText('[K] Get off · Left click to fire');
		const launched = await scene(page, (s) => {
			const before = s.projectiles.launched;
			s.setCarryTrigger(true);
			s.setCarryTrigger(false);
			return s.projectiles.launched - before;
		});
		expect(launched).toBe(1);
		// K while riding and carrying gets off and keeps the creature (F1).
		await page.keyboard.press('k');
		await expect.poll(() => scene(page, (s) => s.controller.mountActive)).toBe(false);
		expect(await scene(page, (s) => s.getCarryState().carrying)).toBe(true);
		// On foot, K now puts it down, once no biped is in view (looking at one, K climbs on: F2).
		await scene(page, (s) => ((s.controller as unknown as { pitch: number }).pitch = 1.3));
		await page.waitForTimeout(300);
		await page.keyboard.press('k');
		expect(await scene(page, (s) => s.getCarryState().carrying)).toBe(false);
	});
});
