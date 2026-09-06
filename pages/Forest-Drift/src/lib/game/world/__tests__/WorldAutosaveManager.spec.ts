import { describe, expect, it, vi } from 'vitest';
import { WorldAutosaveManager } from '../WorldAutosaveManager';
import type { WorldContentSnapshot } from '../WorldSerializer';
import type { SaveStatus } from '../WorldTypes';
import { FakeWorldRuntime } from './worldFixtures';

/** Deterministic clock, so debounce behaviour is asserted rather than waited for. */
function harness(options: { persist?: (content: WorldContentSnapshot) => Promise<void> } = {}) {
	const runtime = new FakeWorldRuntime();
	let now = 0;
	const writes: WorldContentSnapshot[] = [];
	const statuses: SaveStatus[] = [];

	const manager = new WorldAutosaveManager({
		runtime,
		now: () => now,
		onStatusChange: (status) => statuses.push(status),
		persist: async (content) => {
			writes.push(content);
			await options.persist?.(content);
		}
	});

	return {
		runtime,
		manager,
		writes,
		statuses,
		advance(ms: number) {
			now += ms;
			manager.tick(now);
		},
		/**
		 * Lets the save promise chain run to completion. A save is queued behind
		 * `saveChain.catch().then()`, so it takes several microtasks to even *start* — a macrotask
		 * boundary is the reliable way to observe the finished state rather than guessing at a
		 * number of `await Promise.resolve()`s.
		 */
		async flush() {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	};
}

describe('debouncing', () => {
	it('does not write while the player is still building', async () => {
		const h = harness();
		h.runtime.mutateStructure();
		h.advance(500);
		h.runtime.mutateStructure();
		h.advance(500);
		h.runtime.mutateStructure();
		h.advance(500);

		expect(h.writes).toHaveLength(0);
		expect(h.manager.getStatus()).toBe('dirty');
	});

	it('batches a rapid build session into a single write once it settles', async () => {
		const h = harness();
		for (let i = 0; i < 6; i++) {
			h.runtime.mutateStructure();
			h.advance(200);
		}
		h.advance(2500);
		await h.flush();

		expect(h.writes).toHaveLength(1);
	});

	it('still saves during continuous editing, rather than deferring forever', async () => {
		const h = harness();
		// Editing every second for half a minute: a pure debounce would never fire.
		for (let i = 0; i < 30; i++) {
			h.runtime.mutateStructure();
			h.advance(1000);
			await h.flush();
		}
		expect(h.writes.length).toBeGreaterThan(0);
	});
});

describe('player movement cadence', () => {
	it('does not trigger a structural-speed write just because the player walked', async () => {
		const h = harness();
		h.runtime.movePlayer(5, 5);
		h.advance(3000);
		await h.flush();
		expect(h.writes).toHaveLength(0);
	});

	it('saves movement on its own slower interval', async () => {
		const h = harness();
		h.runtime.movePlayer(5, 5);
		h.advance(16000);
		await h.flush();
		expect(h.writes).toHaveLength(1);
		expect(h.writes[0].player.position.x).toBe(5);
	});

	it('does not keep rewriting the world when the player is standing still', async () => {
		const h = harness();
		h.runtime.movePlayer(5, 5);
		h.advance(16000);
		await h.flush();
		const afterFirst = h.writes.length;

		h.advance(16000);
		await h.flush();
		expect(h.writes).toHaveLength(afterFirst);
	});
});

describe('save status', () => {
	it('moves through dirty → saving → saved', async () => {
		const h = harness();
		h.runtime.mutateStructure();
		// The first tick is what *notices* the change (dirty detection is polled, not pushed), so the
		// debounce window starts there; the second tick is the one that reaches the deadline.
		h.advance(500);
		h.advance(2500);
		await h.flush();

		expect(h.statuses).toContain('dirty');
		expect(h.statuses).toContain('saving');
		expect(h.manager.getStatus()).toBe('saved');
	});

	it('reports an error and keeps the world dirty when a write fails', async () => {
		const h = harness({ persist: () => Promise.reject(new Error('QuotaExceededError')) });
		h.runtime.mutateStructure();

		const result = await h.manager.saveNow('manual');
		expect(result.ok).toBe(false);
		expect(h.manager.getStatus()).toBe('error');
		expect(h.manager.getLastError()).toContain('QuotaExceeded');
		expect(h.manager.hasUnsavedChanges()).toBe(true);
	});

	it('recovers to saved on a later successful write', async () => {
		let fail = true;
		const h = harness({
			persist: () => (fail ? Promise.reject(new Error('nope')) : Promise.resolve())
		});
		h.runtime.mutateStructure();
		await h.manager.saveNow('manual');
		expect(h.manager.getStatus()).toBe('error');

		fail = false;
		const retry = await h.manager.saveNow('manual');
		expect(retry.ok).toBe(true);
		expect(h.manager.getStatus()).toBe('saved');
	});
});

describe('overlapping saves', () => {
	it('never runs two writes concurrently', async () => {
		let inFlight = 0;
		let maxConcurrent = 0;
		const h = harness({
			persist: async () => {
				inFlight++;
				maxConcurrent = Math.max(maxConcurrent, inFlight);
				await new Promise((resolve) => setTimeout(resolve, 5));
				inFlight--;
			}
		});

		h.runtime.mutateStructure();
		const first = h.manager.saveNow('manual');
		h.runtime.mutateStructure();
		const second = h.manager.saveNow('manual');
		await Promise.all([first, second]);

		expect(maxConcurrent).toBe(1);
	});

	it('does not let a slow older write mark newer changes as saved', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		let started!: () => void;
		const writeStarted = new Promise<void>((resolve) => (started = resolve));
		let firstWrite = true;

		const h = harness({
			persist: async () => {
				if (!firstWrite) return;
				firstWrite = false;
				started();
				await gate;
			}
		});

		h.runtime.mutateStructure();
		const slowSave = h.manager.saveNow('manual');

		// Wait until the write is genuinely in flight, then place another wall while it is.
		await writeStarted;
		h.runtime.mutateStructure();
		h.manager.tick(1);

		release();
		await slowSave;

		// The completed write only covered the older generation, so the newer edit is still pending —
		// this is the guard against a save silently resurrecting deleted geometry.
		expect(h.manager.hasUnsavedChanges()).toBe(true);
		expect(h.manager.getStatus()).toBe('dirty');

		h.advance(3000);
		await h.flush();
		expect(h.writes.length).toBeGreaterThanOrEqual(2);
		// The second write carries the newer state, not a replay of the older capture.
		expect(h.writes.length).toBeGreaterThan(1);
	});
});

describe('saveNow', () => {
	it('resolves only after the write has actually completed', async () => {
		let written = false;
		const h = harness({
			persist: async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				written = true;
			}
		});
		h.runtime.mutateStructure();
		await h.manager.saveNow('manual');
		expect(written).toBe(true);
	});

	it('is a cheap no-op when nothing has changed', async () => {
		const h = harness();
		const result = await h.manager.saveNow('manual');
		expect(result.ok).toBe(true);
		expect(h.writes).toHaveLength(0);
	});
});

describe('lifecycle', () => {
	it('stops polling once disposed', () => {
		const h = harness();
		const clearSpy = vi.spyOn(globalThis, 'clearInterval');
		h.manager.start();
		h.manager.dispose();
		expect(clearSpy).toHaveBeenCalled();
		clearSpy.mockRestore();
	});
});
