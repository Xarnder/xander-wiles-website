import { describe, expect, it } from 'vitest';
import {
	createRunSession,
	completeCurrent,
	skipCurrent,
	goBack,
	canGoBack,
	getProgressPercent
} from './run-session';
import { deriveSummary } from './summary';
import type { Routine, RoutineTask } from '$lib/types/routine';

function makeRoutine(tasks: RoutineTask[]): Routine {
	return {
		id: 'r1',
		name: 'Test Routine',
		tasks,
		sortOrder: 0,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z'
	};
}

describe('run-session', () => {
	const tasks: RoutineTask[] = [
		{ id: 't1', title: 'One', order: 0 },
		{ id: 't2', title: 'Two', order: 1 },
		{ id: 't3', title: 'Three', order: 2 }
	];

	it('completes a task and advances', () => {
		let session = createRunSession(makeRoutine(tasks));
		session = completeCurrent(session);
		expect(session.statuses.t1).toBe('completed');
		expect(session.currentIndex).toBe(1);
		expect(session.phase).toBe('running');
	});

	it('skips a task and advances', () => {
		let session = createRunSession(makeRoutine(tasks));
		session = skipCurrent(session);
		expect(session.statuses.t1).toBe('skipped');
		expect(session.currentIndex).toBe(1);
	});

	it('goes back without erasing status', () => {
		let session = createRunSession(makeRoutine(tasks));
		session = completeCurrent(session);
		session = goBack(session);
		expect(session.currentIndex).toBe(0);
		expect(session.statuses.t1).toBe('completed');
		expect(canGoBack(session)).toBe(false);
	});

	it('allows changing a previous status', () => {
		let session = createRunSession(makeRoutine(tasks));
		session = completeCurrent(session);
		session = goBack(session);
		session = skipCurrent(session);
		expect(session.statuses.t1).toBe('skipped');
		expect(session.currentIndex).toBe(1);
	});

	it('moves to summary after the final task', () => {
		let session = createRunSession(makeRoutine(tasks));
		session = completeCurrent(session);
		session = skipCurrent(session);
		session = completeCurrent(session);
		expect(session.phase).toBe('summary');
		const summary = deriveSummary(session);
		expect(summary.completed).toBe(2);
		expect(summary.skipped).toBe(1);
		expect(summary.percentComplete).toBe(67);
		expect(summary.results.map((r) => r.status)).toEqual(['skipped', 'completed', 'completed']);
		expect(summary.results.map((r) => r.taskId)).toEqual(['t2', 't1', 't3']);
	});

	it('handles a single-task routine', () => {
		let session = createRunSession(makeRoutine([{ id: 'only', title: 'Solo', order: 0 }]));
		session = completeCurrent(session);
		expect(session.phase).toBe('summary');
		expect(deriveSummary(session).percentComplete).toBe(100);
	});

	it('starts fresh with all tasks pending', () => {
		const session = createRunSession(makeRoutine(tasks));
		expect(session.statuses).toEqual({ t1: 'pending', t2: 'pending', t3: 'pending' });
		expect(session.currentIndex).toBe(0);
		expect(session.phase).toBe('running');
		expect(getProgressPercent(session)).toBe(0);
	});

	it('continues from last by pre-completing remembered tasks', () => {
		const session = createRunSession(makeRoutine(tasks), ['t1', 't3']);
		expect(session.statuses.t1).toBe('completed');
		expect(session.statuses.t2).toBe('pending');
		expect(session.statuses.t3).toBe('completed');
		expect(session.currentIndex).toBe(1);
		expect(session.phase).toBe('running');
		expect(getProgressPercent(session)).toBe(67);
	});

	it('opens summary when continue marks every task done', () => {
		const session = createRunSession(makeRoutine(tasks), ['t1', 't2', 't3']);
		expect(session.phase).toBe('summary');
		expect(getProgressPercent(session)).toBe(100);
	});

	it('skips already-completed tasks when advancing from a continue gap', () => {
		let session = createRunSession(makeRoutine(tasks), ['t1', 't3']);
		expect(session.currentIndex).toBe(1);
		expect(getProgressPercent(session)).toBe(67);
		session = completeCurrent(session);
		expect(session.statuses.t2).toBe('completed');
		expect(session.phase).toBe('summary');
		expect(getProgressPercent(session)).toBe(100);
	});

	it('jumps forward to the next pending after a later task was pre-completed', () => {
		const longer: RoutineTask[] = [...tasks, { id: 't4', title: 'Four', order: 3 }];
		let session = createRunSession(makeRoutine(longer), ['t1', 't3']);
		expect(session.currentIndex).toBe(1); // t2
		session = completeCurrent(session);
		expect(session.phase).toBe('running');
		expect(session.currentIndex).toBe(3); // t4, skipping completed t3
		expect(getProgressPercent(session)).toBe(75);
	});
});
