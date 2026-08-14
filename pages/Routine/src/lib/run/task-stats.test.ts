import { beforeEach, describe, expect, it } from 'vitest';
import {
	applyCycleDelta,
	clearRoutineTaskStats,
	getRoutineTaskStats,
	getTaskOutcomeCounts,
	observationTotal,
	outcomeFromStatus,
	outcomePercents,
	recordFreshCycleStats,
	sumOutcomeCounts
} from './task-stats';

const store = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
	value: {
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
	},
	configurable: true
});

describe('task-stats', () => {
	beforeEach(() => {
		store.clear();
	});

	it('maps statuses to first-pass outcomes', () => {
		expect(outcomeFromStatus('completed')).toBe('firstTime');
		expect(outcomeFromStatus('later')).toBe('later');
		expect(outcomeFromStatus('skipped')).toBe('notToday');
		expect(outcomeFromStatus('pending')).toBeNull();
	});

	it('records a fresh cycle per task', () => {
		recordFreshCycleStats('r1', { t1: 'completed', t2: 'later', t3: 'skipped' });
		expect(getRoutineTaskStats('r1')?.cycleCount).toBe(1);
		expect(getTaskOutcomeCounts('r1', 't1')).toEqual({ firstTime: 1, later: 0, notToday: 0 });
		expect(getTaskOutcomeCounts('r1', 't2')).toEqual({ firstTime: 0, later: 1, notToday: 0 });
		expect(getTaskOutcomeCounts('r1', 't3')).toEqual({ firstTime: 0, later: 0, notToday: 1 });
	});

	it('replaces a cycle when previous statuses are provided', () => {
		const first = { t1: 'later' as const, t2: 'completed' as const };
		recordFreshCycleStats('r1', first);
		recordFreshCycleStats('r1', { t1: 'completed', t2: 'skipped' }, first);
		expect(getRoutineTaskStats('r1')?.cycleCount).toBe(1);
		expect(getTaskOutcomeCounts('r1', 't1')).toEqual({ firstTime: 1, later: 0, notToday: 0 });
		expect(getTaskOutcomeCounts('r1', 't2')).toEqual({
			firstTime: 0,
			later: 0,
			notToday: 1
		});
	});

	it('accumulates separate fresh cycles', () => {
		recordFreshCycleStats('r1', { t1: 'completed' });
		recordFreshCycleStats('r1', { t1: 'later' });
		expect(getRoutineTaskStats('r1')?.cycleCount).toBe(2);
		expect(getTaskOutcomeCounts('r1', 't1')).toEqual({ firstTime: 1, later: 1, notToday: 0 });
		expect(observationTotal(getTaskOutcomeCounts('r1', 't1'))).toBe(2);
	});

	it('builds percents that sum to 100', () => {
		const percents = outcomePercents({ firstTime: 1, later: 1, notToday: 1 });
		expect(percents.firstTime + percents.later + percents.notToday).toBe(100);
	});

	it('sums overall counts', () => {
		expect(
			sumOutcomeCounts([
				{ firstTime: 2, later: 1, notToday: 0 },
				{ firstTime: 1, later: 0, notToday: 3 }
			])
		).toEqual({ firstTime: 3, later: 1, notToday: 3 });
	});

	it('clears a routine', () => {
		recordFreshCycleStats('r1', { t1: 'completed' });
		clearRoutineTaskStats('r1');
		expect(getRoutineTaskStats('r1')).toBeNull();
	});

	it('ignores pending when applying a delta', () => {
		const next = applyCycleDelta({}, { t1: 'pending', t2: 'completed' }, 1);
		expect(next.t1).toBeUndefined();
		expect(next.t2).toEqual({ firstTime: 1, later: 0, notToday: 0 });
	});
});
