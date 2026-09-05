import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FirstPersonController } from '../FirstPersonController';
import { FoundationManager } from '../../building/FoundationManager';
import { SlabManager } from '../../building/SlabManager';
import { StairManager } from '../../building/StairManager';
import type { StairDefinition } from '../../building/StairTypes';
import { WorldSurfaceSampler } from '../../building/WorldSurfaceSampler';
import { resolvePlayerPositionAgainstWalls } from '../../building/wallCollision';

/** Minimal EventTarget-like stand-in for `window`/`document`/the canvas element — this test suite runs in vitest's `node` environment (no real DOM; see vite.config.ts), same reasoning as BuildToolManager.spec.ts's FakeElement. */
class FakeTarget {
	private readonly listeners = new Map<string, Set<(event: unknown) => void>>();
	addEventListener(type: string, handler: (event: unknown) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(handler);
	}
	removeEventListener(type: string, handler: (event: unknown) => void): void {
		this.listeners.get(type)?.delete(handler);
	}
	dispatch(type: string, event: unknown = {}): void {
		for (const handler of this.listeners.get(type) ?? []) handler(event);
	}
}

const PLAYER_RADIUS = 0.35;
const EYE_HEIGHT = 1.7;
const GRID_SIZE = 0.25;
const VERTEX_SPACING = 2;

function makeStair(overrides: Partial<StairDefinition> = {}): StairDefinition {
	return {
		id: 'stair-1',
		foundationId: 'f1',
		minGridX: 0,
		maxGridX: 12, // 12 cells @ 0.25m = 3m run = 12 steps = 3m total rise
		minGridZ: 0,
		maxGridZ: 4, // 4 cells = 1m width
		baseY: 0,
		direction: '+x',
		levelIndex: 0,
		gridSizeAtCreation: GRID_SIZE,
		...overrides
	};
}

/** Builds a real FoundationManager/SlabManager/StairManager/WorldSurfaceSampler/FirstPersonController stack — the same classes and wiring ThreeScene.ts uses — around one straight staircase, for true end-to-end movement simulation. `foundationTopY` defaults to 0 (flush with terrain); pass a higher value to reproduce a foundation raised above the surrounding ground, as any real foundation built to level out sloped terrain typically is. */
function setup(foundationTopY = 0, terrainHeight = 0) {
	const foundationManager = new FoundationManager(() => VERTEX_SPACING);
	foundationManager.addFoundation({
		id: 'f1',
		minGridX: 0,
		maxGridX: 40,
		minGridZ: 0,
		maxGridZ: 40,
		topY: foundationTopY,
		bottomY: foundationTopY - 2
	});
	const slabManager = new SlabManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => GRID_SIZE
	});
	const stairManager = new StairManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING
	});
	const sampler = new WorldSurfaceSampler(
		{ sample: () => terrainHeight } as never,
		foundationManager,
		slabManager,
		stairManager,
		() => 0.3
	);

	const fakeDom = Object.assign(new FakeTarget(), { requestPointerLock: () => undefined });
	const controller = new FirstPersonController({
		domElement: fakeDom as unknown as HTMLElement,
		camera: new THREE.PerspectiveCamera(),
		getSupportingSurfaceY: (x, z, ref) => sampler.getSupportingSurfaceY(x, z, ref),
		getCeilingBlockY: (x, z, from, to) => sampler.getCeilingBlockY(x, z, from, to),
		settings: {
			walkSpeed: 4,
			runSpeed: 12,
			eyeHeight: EYE_HEIGHT,
			gravityEnabled: true,
			jumpSpeed: 6
		},
		resolveHorizontalCollision: (x, z, feetY, headY) =>
			resolvePlayerPositionAgainstWalls(x, z, feetY, headY, PLAYER_RADIUS, [
				...stairManager.getAllCollisionRects()
			])
	});

	return { foundationManager, slabManager, stairManager, controller };
}

/** Faces the controller toward +X ("forward" is -Z at yaw 0, rotated by yaw — see FirstPersonController.ts). */
function faceTowardPlusX(controller: FirstPersonController): void {
	// yaw is a private field, but only TS-private (a real runtime property) — same trick every
	// other test in this file relies on to drive movement without simulating real mouse-look input.
	(controller as unknown as { yaw: number }).yaw = -Math.PI / 2;
}

describe('FirstPersonController — walking up/down stairs', () => {
	let fakeWindow: FakeTarget;
	let fakeDocument: FakeTarget & { pointerLockElement: null; exitPointerLock: () => void };

	beforeEach(() => {
		fakeWindow = new FakeTarget();
		fakeDocument = Object.assign(new FakeTarget(), {
			pointerLockElement: null,
			exitPointerLock: () => {}
		});
		vi.stubGlobal('window', fakeWindow);
		vi.stubGlobal('document', fakeDocument);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('climbs a full staircase smoothly at a normal (60fps) frame rate, without jumping', () => {
		const { stairManager, controller } = setup();
		stairManager.addStair(makeStair());

		controller.spawn(-1, 0.5);
		faceTowardPlusX(controller);
		fakeWindow.dispatch('keydown', { code: 'KeyW' });

		const dt = 1 / 60;
		let maxY = controller.worldPosition.y;
		let sawTop = false;
		for (let frame = 0; frame < 400; frame++) {
			controller.update(dt);
			maxY = Math.max(maxY, controller.worldPosition.y);
			if (Math.abs(controller.worldPosition.y - (3 + EYE_HEIGHT)) < 0.05) sawTop = true;
		}

		expect(sawTop).toBe(true);
		expect(maxY).toBeGreaterThanOrEqual(3 + EYE_HEIGHT - 0.05);
	});

	it('regression: climbs correctly even at a very low frame rate / after a frame-time hitch (the swept step-up check) — a single 0.1s-dt frame at run speed used to skip clean over a tread and strand the player at ground level for the rest of the staircase', () => {
		const { stairManager, controller } = setup();
		stairManager.addStair(makeStair());

		controller.spawn(-1, 0.5);
		faceTowardPlusX(controller);
		fakeWindow.dispatch('keydown', { code: 'ShiftLeft' }); // run speed — the adversarial case
		fakeWindow.dispatch('keydown', { code: 'KeyW' });

		// 0.1s is the real animate loop's clamped worst case (see ThreeScene.animate) — at
		// runSpeed=12 that's 1.2m of horizontal movement per frame, well past a single 0.25m tread.
		const dt = 0.1;
		const positions: number[] = [];
		for (let frame = 0; frame < 30 && controller.worldPosition.x < 3.5; frame++) {
			controller.update(dt);
			positions.push(controller.worldPosition.y);
		}

		// The player must have climbed close to the top of the run while still within/just past its
		// footprint — not fallen back to ground level (1.7) partway across, which is what "stairs
		// have no collision until you jump" looked like before this fix.
		expect(Math.max(...positions)).toBeGreaterThan(EYE_HEIGHT + 2.0);
	});

	it('walking straight up the middle of a minimum-width stair is never pushed sideways by the side collision rects', () => {
		const { stairManager, controller } = setup();
		stairManager.addStair(makeStair({ minGridZ: 0, maxGridZ: 4 })); // 1m width, dead centre at z=0.5

		controller.spawn(-1, 0.5);
		faceTowardPlusX(controller);
		fakeWindow.dispatch('keydown', { code: 'KeyW' });

		const dt = 1 / 60;
		for (let frame = 0; frame < 300; frame++) {
			controller.update(dt);
			expect(controller.worldPosition.z).toBeCloseTo(0.5, 1);
		}
	});

	it('descending stairs stays grounded and comes down one step at a time, without becoming airborne', () => {
		const { stairManager, controller } = setup();
		stairManager.addStair(makeStair());

		// Start at the top of the stair (x=2.9 is within the topmost tread's [2.75, 3.0] span),
		// walking backward (away from +X, i.e. down the run).
		controller.spawn(2.9, 0.5);
		faceTowardPlusX(controller);
		fakeWindow.dispatch('keydown', { code: 'KeyS' });

		const dt = 1 / 60;
		let maxUpwardJumpBetweenFrames = 0;
		let previousY = controller.worldPosition.y;
		for (let frame = 0; frame < 400 && controller.worldPosition.x > -1; frame++) {
			controller.update(dt);
			// Y should never suddenly jump UP while walking backward off a staircase — only ever
			// decrease or stay level as each lower tread is reached.
			maxUpwardJumpBetweenFrames = Math.max(
				maxUpwardJumpBetweenFrames,
				controller.worldPosition.y - previousY
			);
			previousY = controller.worldPosition.y;
		}

		expect(maxUpwardJumpBetweenFrames).toBeLessThan(0.01);
		expect(controller.worldPosition.y).toBeCloseTo(EYE_HEIGHT, 1);
	});

	it('regression: walking from lower terrain onto an elevated foundation, then up its stairs, works without jumping — a foundation this much above the surrounding ground (levelling out a slope) is the ordinary case, not an edge case', () => {
		// Foundation top sits 2m above the surrounding terrain — well past the old, buggy
		// SUPPORT_EPSILON (~0.05m) tolerance that used to gate foundation tops the same way slab
		// tops are gated. That made the player clip straight through the foundation edge instead of
		// stepping up onto it, leaving them stranded at the wrong height below it — which, since a
		// stair's baseY is measured from that same foundation top, then made the stairs built on it
		// look "unreachable without jumping" too, even though the stairs' own collision was correct.
		const { stairManager, controller } = setup(2, 0);
		stairManager.addStair(makeStair({ baseY: 0 })); // starts exactly at the foundation's own top

		// Spawn out on the lower terrain, well clear of the foundation, then walk onto it and
		// straight up the stairs in one continuous approach.
		controller.spawn(-5, 0.5);
		expect(controller.worldPosition.y).toBeCloseTo(0 + EYE_HEIGHT); // grounded on terrain first

		faceTowardPlusX(controller);
		fakeWindow.dispatch('keydown', { code: 'KeyW' });

		const dt = 1 / 60;
		let steppedOntoFoundation = false;
		let reachedStairTop = false;
		for (let frame = 0; frame < 600; frame++) {
			controller.update(dt);
			if (Math.abs(controller.worldPosition.y - (2 + EYE_HEIGHT)) < 0.05) {
				steppedOntoFoundation = true;
			}
			if (Math.abs(controller.worldPosition.y - (2 + 3 + EYE_HEIGHT)) < 0.05) {
				reachedStairTop = true;
			}
		}

		expect(steppedOntoFoundation).toBe(true);
		expect(reachedStairTop).toBe(true);
	});
});
