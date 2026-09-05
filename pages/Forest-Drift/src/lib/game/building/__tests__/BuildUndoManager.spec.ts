import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildingManager } from '../BuildingManager';
import { BuildUndoManager } from '../BuildUndoManager';

/**
 * Minimal EventTarget-like stand-in for `window` — same reasoning/shape as
 * BuildingLevelManager.spec.ts's FakeWindow: this suite runs in vitest's `node` environment (no
 * real DOM), and the `-` key handler needs an actual dispatch to exercise for real.
 */
class FakeWindow {
	private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

	addEventListener(type: string, handler: (event: unknown) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(handler);
	}

	removeEventListener(type: string, handler: (event: unknown) => void): void {
		this.listeners.get(type)?.delete(handler);
	}

	dispatchEvent(event: { type: string }): void {
		for (const handler of this.listeners.get(event.type) ?? []) handler(event);
	}
}

let fakeWindow: FakeWindow;

beforeEach(() => {
	fakeWindow = new FakeWindow();
	vi.stubGlobal('window', fakeWindow);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function pressKey(code: string): void {
	fakeWindow.dispatchEvent({ type: 'keydown', code } as unknown as { type: string });
}

function makeBuildingManagerStub() {
	return {
		removeWall: vi.fn().mockReturnValue(true),
		removeWallPath: vi.fn().mockReturnValue(true),
		removeOpening: vi.fn().mockReturnValue(true),
		removeSlab: vi.fn().mockReturnValue(true)
	};
}

describe('BuildUndoManager', () => {
	let manager: BuildUndoManager;

	afterEach(() => {
		manager?.dispose();
	});

	it('undo() with an empty history does nothing and returns false', () => {
		const stub = makeBuildingManagerStub();
		manager = new BuildUndoManager(stub as unknown as BuildingManager);

		expect(manager.undo()).toBe(false);
		expect(stub.removeWall).not.toHaveBeenCalled();
	});

	it('undoes a recorded wall by calling removeWall with its id', () => {
		const stub = makeBuildingManagerStub();
		manager = new BuildUndoManager(stub as unknown as BuildingManager);

		manager.record({ kind: 'wall', wallId: 'wall-1' });
		expect(manager.undo()).toBe(true);
		expect(stub.removeWall).toHaveBeenCalledWith('wall-1');
	});

	it('undoes a recorded wall path by calling removeWallPath with its id', () => {
		const stub = makeBuildingManagerStub();
		manager = new BuildUndoManager(stub as unknown as BuildingManager);

		manager.record({ kind: 'wallPath', pathId: 'path-1' });
		expect(manager.undo()).toBe(true);
		expect(stub.removeWallPath).toHaveBeenCalledWith('path-1');
	});

	it('undoes a recorded opening by calling removeOpening with (wallId, openingId)', () => {
		const stub = makeBuildingManagerStub();
		manager = new BuildUndoManager(stub as unknown as BuildingManager);

		manager.record({ kind: 'opening', wallId: 'wall-1', openingId: 'opening-1' });
		expect(manager.undo()).toBe(true);
		expect(stub.removeOpening).toHaveBeenCalledWith('wall-1', 'opening-1');
	});

	it('undoes a recorded slab by calling removeSlab with its id', () => {
		const stub = makeBuildingManagerStub();
		manager = new BuildUndoManager(stub as unknown as BuildingManager);

		manager.record({ kind: 'slab', slabId: 'slab-1' });
		expect(manager.undo()).toBe(true);
		expect(stub.removeSlab).toHaveBeenCalledWith('slab-1');
	});

	it('undoes in LIFO order — most recent action first', () => {
		const stub = makeBuildingManagerStub();
		manager = new BuildUndoManager(stub as unknown as BuildingManager);

		manager.record({ kind: 'wall', wallId: 'wall-1' });
		manager.record({ kind: 'slab', slabId: 'slab-1' });

		manager.undo();
		expect(stub.removeSlab).toHaveBeenCalledWith('slab-1');
		expect(stub.removeWall).not.toHaveBeenCalled();

		manager.undo();
		expect(stub.removeWall).toHaveBeenCalledWith('wall-1');
	});

	it('keeps only the last 5 actions — the 6th recorded action evicts the oldest', () => {
		const stub = makeBuildingManagerStub();
		manager = new BuildUndoManager(stub as unknown as BuildingManager);

		for (let i = 1; i <= 6; i++) {
			manager.record({ kind: 'wall', wallId: `wall-${i}` });
		}

		for (let i = 6; i >= 2; i--) {
			expect(manager.undo()).toBe(true);
			expect(stub.removeWall).toHaveBeenCalledWith(`wall-${i}`);
		}
		// wall-1 was evicted when wall-6 was recorded — nothing left to undo.
		expect(manager.undo()).toBe(false);
		expect(stub.removeWall).not.toHaveBeenCalledWith('wall-1');
	});

	it('pressing the Minus key undoes the last recorded action', () => {
		const stub = makeBuildingManagerStub();
		manager = new BuildUndoManager(stub as unknown as BuildingManager);

		manager.record({ kind: 'wall', wallId: 'wall-1' });
		pressKey('Minus');
		expect(stub.removeWall).toHaveBeenCalledWith('wall-1');
	});

	it('pressing NumpadSubtract also undoes the last recorded action', () => {
		const stub = makeBuildingManagerStub();
		manager = new BuildUndoManager(stub as unknown as BuildingManager);

		manager.record({ kind: 'slab', slabId: 'slab-1' });
		pressKey('NumpadSubtract');
		expect(stub.removeSlab).toHaveBeenCalledWith('slab-1');
	});

	it('unrelated key presses do not trigger undo', () => {
		const stub = makeBuildingManagerStub();
		manager = new BuildUndoManager(stub as unknown as BuildingManager);

		manager.record({ kind: 'wall', wallId: 'wall-1' });
		pressKey('KeyA');
		expect(stub.removeWall).not.toHaveBeenCalled();
	});

	it('dispose() removes the keydown listener — pressing Minus afterward does nothing', () => {
		const stub = makeBuildingManagerStub();
		manager = new BuildUndoManager(stub as unknown as BuildingManager);
		manager.record({ kind: 'wall', wallId: 'wall-1' });

		manager.dispose();
		pressKey('Minus');
		expect(stub.removeWall).not.toHaveBeenCalled();
	});
});
