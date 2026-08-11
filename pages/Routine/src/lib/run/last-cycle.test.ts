import { beforeEach, describe, expect, it } from 'vitest';
import {
	canContinueFromLastCycle,
	getContinuableCompletedIds,
	getLastCycle,
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
