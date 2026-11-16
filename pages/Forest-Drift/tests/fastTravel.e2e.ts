import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { climbOn, lowGraphics, pickUp, type SceneLike } from './creatureHelpers';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Fast travel Phase 0: the jump itself, playing alone (plan:
 * docs/2026/11-16/Fast-Travel/feature-plan/02-technical-plan.md §3–§5, §10). Safe landing with the
 * ground there on the next frame, flying, Go back, lakes, and carried and ridden creatures coming
 * along. Writes the measured hitch to $FAST_TRAVEL_NUMBERS when set.
 */

type Outcome =
	| {
			ok: true;
			x: number;
			y: number;
			z: number;
			moved: boolean;
			carrying: boolean;
			riding: boolean;
			ms: number;
	  }
	| { ok: false; reason: string };

interface TravelScene extends SceneLike {
	fastTravel(x: number, z: number): Promise<Outcome>;
	goBackFromTravel(): Promise<Outcome>;
	fastTravelOrigin(): { x: number; z: number } | null;
	fastTravelLanding(x: number, z: number): { x: number; z: number; moved: boolean };
	canFastTravel(): { ok: boolean; reason?: string };
	controller: SceneLike['controller'] & {
		getYaw(): number;
		getPitch(): number;
		isFlying(): boolean;
		setFlying(on: boolean): void;
		isGrounded(): boolean;
		teleports: number;
	};
	hydrology: {
		getLakes(): readonly { x: number; z: number; baseRadius: number; depth: number }[];
		waterColumnDepth(x: number, z: number): number;
	};
	terrainManager: { getStats(): { queuedChunks: number } };
	treeManager: { getStats(): { queuedChunks: number } };
	ride: SceneLike['ride'] & { riding: boolean };
}

const run = <T, A = undefined>(page: Page, fn: (s: TravelScene, arg: A) => T, arg?: A) =>
	page.evaluate(
		({ source, arg }) => {
			const s = (window as unknown as { forestScene: TravelScene }).forestScene;
			return new Function('s', 'arg', `return (${source})(s, arg)`)(s, arg);
		},
		{ source: fn.toString(), arg }
	) as Promise<Awaited<T>>;

/**
 * Travels to (x, z) and watches the frames after it: the hitch (the longest frame), where the feet
 * are against the surface on each of the first frames, and how long trees and terrain take to settle.
 */
async function travelAndWatch(page: Page, x: number, z: number, prepare = false) {
	return run(
		page,
		async (s, to) => {
			const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
			// Prepared: the landing (and the water there) was worked out when the pin was dropped.
			if (to.prepare) s.fastTravelLanding(to.x, to.z);
			await frame();
			const before = await frame();
			const outcome = await s.fastTravel(to.x, to.z);
			const frames: number[] = [];
			const gaps: number[] = [];
			let last = before;
			for (let i = 0; i < 20; i++) {
				const now = await frame();
				frames.push(now - last);
				last = now;
				const p = s.controller.worldPosition;
				const ground = s.worldSurfaceSampler.getSupportingSurfaceY(p.x, p.z, p.y);
				gaps.push(p.y - 1.7 - ground);
			}
			const settleStart = performance.now();
			let settledMs = -1;
			while (to.measure && performance.now() - settleStart < 20_000) {
				if (
					s.terrainManager.getStats().queuedChunks === 0 &&
					s.treeManager.getStats().queuedChunks === 0
				) {
					settledMs = performance.now() - settleStart;
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			return { outcome, frames, gaps, settledMs };
		},
		{ x, z, prepare, measure: !!process.env.FAST_TRAVEL_NUMBERS }
	);
}

test.describe('fast travel (single player)', () => {
	test.beforeEach(async ({ page }) => {
		test.setTimeout(240_000);
		await lowGraphics(page);
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: 'Fast travel', seed: 'forest' });
	});

	test('lands on the ground at once, keeps the view, and Go back returns exactly', async ({
		page
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		await page.waitForTimeout(1500);
		expect(await run(page, (s) => s.fastTravelOrigin())).toBeNull();
		const start = await run(page, (s) => ({
			x: s.controller.worldPosition.x,
			y: s.controller.worldPosition.y,
			z: s.controller.worldPosition.z,
			yaw: s.controller.getYaw(),
			teleports: s.controller.teleports
		}));

		const trips: {
			distance: number;
			prepared: boolean;
			ms: number;
			hitch: number;
			settledMs: number;
		}[] = [];
		// Cold trips (nothing prepared) and prepared ones (the landing worked out when the pin
		// was dropped, as the map will do), in fresh directions each time.
		const legs: [number, number, boolean][] = [
			[1000, 0, false],
			[0, 3000, false],
			[-5000, 0, false],
			[3500, 3500, false],
			[0, -5000, false],
			[-1000, 0, true],
			[0, -3000, true],
			[4000, 0, true],
			[-3500, -3500, true],
			[0, 5000, true]
		];
		for (const [dx, dz, prepare] of legs) {
			const from = await run(page, (s) => ({ ...s.controller.worldPosition }));
			const watched = await travelAndWatch(page, from.x + dx, from.z + dz, prepare);
			const outcome = watched.outcome;
			expect(outcome.ok).toBe(true);
			if (!outcome.ok) return;
			// Feet stand on the surface on every frame after the trip: no fall, no sinking.
			for (const gap of watched.gaps) expect(Math.abs(gap)).toBeLessThan(0.2);
			trips.push({
				distance: Math.round(Math.hypot(dx, dz)),
				prepared: prepare,
				ms: Math.round(outcome.ms * 10) / 10,
				hitch: Math.round(Math.max(...watched.frames)),
				settledMs: Math.round(watched.settledMs)
			});
		}
		// The minimap names the biome you arrived in at once (no 3 s hold after a trip).
		const here = await run(page, (s) => {
			const p = s.controller.worldPosition;
			return (s as unknown as { biomeNameAt(x: number, z: number): string }).biomeNameAt(p.x, p.z);
		});
		await expect(page.getByTestId('biome-minimap-name')).toHaveText(here, { timeout: 1500 });
		// The view was kept, and every trip counted as a teleport (others snap, not slide).
		const after = await run(page, (s) => ({
			yaw: s.controller.getYaw(),
			teleports: s.controller.teleports
		}));
		expect(after.yaw).toBeCloseTo(start.yaw, 6);
		expect(after.teleports - start.teleports).toBe(legs.length);

		// Go back: exactly where the last trip started; twice: back to where it landed.
		const landed = await run(page, (s) => ({ ...s.controller.worldPosition }));
		const origin = (await run(page, (s) => s.fastTravelOrigin()))!;
		expect((await run(page, (s) => s.goBackFromTravel())).ok).toBe(true);
		const back = await run(page, (s) => ({ ...s.controller.worldPosition }));
		expect(back.x).toBeCloseTo(origin.x, 3);
		expect(back.z).toBeCloseTo(origin.z, 3);
		expect((await run(page, (s) => s.goBackFromTravel())).ok).toBe(true);
		const again = await run(page, (s) => ({ ...s.controller.worldPosition }));
		expect(again.x).toBeCloseTo(landed.x, 3);
		expect(again.z).toBeCloseTo(landed.z, 3);
		expect(again.y).toBeCloseTo(landed.y, 3);

		console.log('fast travel trips', JSON.stringify(trips));
		if (process.env.FAST_TRAVEL_NUMBERS)
			writeFileSync(process.env.FAST_TRAVEL_NUMBERS, JSON.stringify({ trips }, null, 2));
		if (process.env.FAST_TRAVEL_SHOTS) {
			await page.waitForTimeout(2500);
			await page.screenshot({
				path: `${process.env.FAST_TRAVEL_SHOTS}/after-trip.jpg`,
				quality: 80
			});
		}
		expect(errors).toEqual([]);
	});

	test('flying arrives 2 m up and still flying; a lake pin lands on the shore', async ({
		page
	}) => {
		await run(page, (s) => s.controller.setFlying(true));
		const flight = await run(page, async (s) => {
			const p = s.controller.worldPosition;
			const outcome = await s.fastTravel(p.x + 2000, p.z + 800);
			const at = s.controller.worldPosition;
			const ground = s.worldSurfaceSampler.getSupportingSurfaceY(at.x, at.z, Infinity);
			return { outcome, flying: s.controller.isFlying(), above: at.y - 1.7 - ground };
		});
		expect(flight.outcome.ok).toBe(true);
		expect(flight.flying).toBe(true);
		expect(flight.above).toBeGreaterThan(1.5);
		expect(flight.above).toBeLessThan(2.5);
		await run(page, (s) => s.controller.setFlying(false));

		// The deepest lake nearby: its middle is too deep to stand in.
		const lake = await run(page, async (s) => {
			// Visit a few spots so their water is built, then pick the deepest lake found.
			for (const [x, z] of [
				[0, 0],
				[3000, 0],
				[0, 3000],
				[-3000, 0],
				[0, -3000]
			])
				await s.fastTravel(x, z);
			const lakes = [...s.hydrology.getLakes()]
				.filter((l) => s.hydrology.waterColumnDepth(l.x, l.z) > 2)
				.sort((a, b) => b.baseRadius - a.baseRadius);
			return lakes[0] ?? null;
		});
		test.skip(!lake, 'no deep lake in this world');
		const landing = await run(page, (s, l) => s.fastTravelLanding(l.x, l.z), lake!);
		expect(landing.moved).toBe(true);
		const result = await run(
			page,
			async (s, l) => {
				const outcome = await s.fastTravel(l.x, l.z);
				const p = s.controller.worldPosition;
				return { outcome, depth: s.hydrology.waterColumnDepth(p.x, p.z) };
			},
			lake!
		);
		expect(result.outcome.ok).toBe(true);
		if (result.outcome.ok) expect(result.outcome.moved).toBe(true);
		expect(result.depth).toBeLessThanOrEqual(0.5);
		if (process.env.FAST_TRAVEL_SHOTS) {
			await page.waitForTimeout(2500);
			await page.screenshot({
				path: `${process.env.FAST_TRAVEL_SHOTS}/lake-shore.jpg`,
				quality: 80
			});
		}
	});

	test('a carried creature and a ridden one come along', async ({ page }) => {
		await run(page, (s) => {
			s.setTouchActive(true);
			if (!s.buildToolManager.isNormalMode()) s.toggleBuildMode();
		});
		await pickUp(page);
		const carried = await run(page, async (s) => {
			const p = s.controller.worldPosition;
			return s.fastTravel(p.x + 3000, p.z);
		});
		expect(carried.ok && carried.carrying).toBe(true);
		await page.waitForTimeout(1000);
		expect((await run(page, (s) => s.getCarryState())).carrying).toBe(true);
		// Put it down before climbing on, so climbing on finds a mount rather than dropping it.
		await page.keyboard.press('k');
		await expect.poll(() => run(page, (s) => s.getCarryState().carrying)).toBe(false);

		await climbOn(page);
		// Wait until seated (the climb on takes under a second).
		await expect.poll(() => run(page, (s) => s.canFastTravel().ok), { timeout: 5000 }).toBe(true);
		const ridden = await run(page, (s) => s.ride.riddenId);
		const ride = await run(page, async (s) => {
			const p = s.controller.worldPosition;
			const outcome = await s.fastTravel(p.x - 3000, p.z + 1500);
			return outcome;
		});
		expect(ride.ok && ride.riding).toBe(true);
		// Still riding a second later: the herd it came from unloaded, but the mount didn't.
		await page.waitForTimeout(1500);
		const state = await run(
			page,
			(s, id) => {
				const live = s.creatures.live.get(id!);
				const me = s.controller.worldPosition;
				const at = live?.compiled.object.position;
				return {
					riding: s.getRideState().riding,
					same: s.ride.riddenId === id,
					apart: at ? Math.hypot(at.x - me.x, at.z - me.z) : Infinity
				};
			},
			ridden
		);
		expect(state.riding).toBe(true);
		expect(state.same).toBe(true);
		expect(state.apart).toBeLessThan(4);
		if (process.env.FAST_TRAVEL_SHOTS) {
			await run(page, (s) => s.toggleThirdPerson());
			await page.waitForTimeout(800);
			await page.screenshot({
				path: `${process.env.FAST_TRAVEL_SHOTS}/riding-after-trip.jpg`,
				quality: 80
			});
		}
	});
});
