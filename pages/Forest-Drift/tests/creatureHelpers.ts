import { expect, type Page } from '@playwright/test';

/**
 * Shared creature steps for e2e tests: find, climb onto and pick up creatures in a single-player
 * world (riding, fast travel). Moved out of creatureRiding.e2e.ts.
 */

export type Vec = { x: number; y: number; z: number };
export interface SceneLike {
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
		nearestCarryable(from: Vec): { x: number; z: number } | null;
		nearestRideable(from: Vec): { x: number; z: number } | null;
	};
}
export type TestWindow = { forestScene: SceneLike };

export async function lowGraphics(page: Page) {
	await page.addInitScript(() => localStorage.setItem('forest-drift.graphics.v1', 'low'));
}

/** Stands just outside the nearest live creature of a kind, looking at its middle. */
export async function aimAt(page: Page, kind: 'ride' | 'carry'): Promise<void> {
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
					if (!best) {
						// None drawn nearby (the herds near spawn differ by seed): go to the nearest one.
						const far =
							kind === 'ride' ? s.creatures.nearestRideable(me) : s.creatures.nearestCarryable(me);
						if (far) {
							const y = s.worldSurfaceSampler.getSupportingSurfaceY(far.x + 3, far.z, Infinity);
							s.controller.restoreState({ x: far.x + 3, y: y + 1.7, z: far.z }, 0, 0);
						}
						return null;
					}
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

export const scene = <T>(page: Page, fn: (s: SceneLike) => T) =>
	page.evaluate((source) => {
		const s = (window as unknown as TestWindow).forestScene;
		return new Function('s', `return (${source})(s)`)(s);
	}, fn.toString()) as Promise<T>;

/**
 * Climbs on (re-aiming between attempts: creatures wander). K is only pressed once the prompt
 * offers the ride: while carrying, K with no mount in view puts the creature down instead (F2).
 */
export async function climbOn(page: Page) {
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

export async function pickUp(page: Page) {
	for (let attempt = 0; attempt < 6; attempt++) {
		await aimAt(page, 'carry');
		await page.waitForTimeout(200);
		await page.keyboard.press('k');
		if ((await scene(page, (s) => s.getCarryState())).carrying) return;
	}
	expect((await scene(page, (s) => s.getCarryState())).carrying).toBe(true);
}
