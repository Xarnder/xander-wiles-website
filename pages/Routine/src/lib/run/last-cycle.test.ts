import { beforeEach, describe, expect, it } from 'vitest';
import {
	canContinueFromLastCycle,
	getContinuableCompletedIds,
	getLastCycle,
	getLastCyclePercent,
	saveLastCycle
} from './last-cycle';
import type { Routine } from '$lib/types/routine';

const store = new Map<string, string>();

const localStorageMock = {
	getItem(key: string) {
		return store.has(key) ? store.get(key)! : null;
	},
	setItem(key: string, value: string) {
		store.set(key, value);
	},
	removeItem(key: string) {
		store.delete(key);
	},
	clear() {
		store.clear();
	}
};

Object.defineProperty(globalThis, 'localStorage', {
	value: localStorageMock,
	configurable: true
});

const routine: Routine = {
	id: 'r1',
	name: 'Test',
	tasks: [
		{ id: 't1', title: 'One', order: 0 },
		{ id: 't2', title: 'Two', order: 1 },
		{ id: 't3', title: 'Three', order: 2 }
	],
	sortOrder: 0,
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z'
};

describe('last-cycle', () => {
	beforeEach(() => {
		store.clear();
	});

	it('saves completed ids from a finished cycle', () => {
		saveLastCycle('r1', {
			t1: 'completed',
			t2: 'skipped',
			t3: 'completed'
		});
		expect(getLastCycle('r1')?.completedTaskIds).toEqual(['t1', 't3']);
		expect(getLastCycle('r1')?.percentComplete).toBe(67);
		expect(getLastCyclePercent(routine)).toBe(67);
	});

	it('returns null percent when there is no last cycle', () => {
		expect(getLastCyclePercent(routine)).toBeNull();
	});

	it('stores 0% when nothing was completed', () => {
		saveLastCycle('r1', { t1: 'later', t2: 'skipped', t3: 'later' });
		expect(getLastCyclePercent(routine)).toBe(0);
	});

	it('falls back to current tasks when an older record has no percent', () => {
		store.set(
			'routine-last-cycles',
			JSON.stringify({
				r1: { completedTaskIds: ['t1'], updatedAt: '2026-01-01T00:00:00.000Z' }
			})
		);
		expect(getLastCyclePercent(routine)).toBe(33);
	});

	it('filters out deleted tasks', () => {
		saveLastCycle('r1', { t1: 'completed', gone: 'completed', t2: 'pending' });
		expect(getContinuableCompletedIds(routine)).toEqual(['t1']);
	});

	it('allows continue only when some work remains', () => {
		expect(canContinueFromLastCycle(routine)).toBe(false);
		saveLastCycle('r1', { t1: 'completed', t2: 'skipped', t3: 'pending' });
		expect(canContinueFromLastCycle(routine)).toBe(true);
		saveLastCycle('r1', { t1: 'completed', t2: 'completed', t3: 'completed' });
		expect(canContinueFromLastCycle(routine)).toBe(false);
	});
});
