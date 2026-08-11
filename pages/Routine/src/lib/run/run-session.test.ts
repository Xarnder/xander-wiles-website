import { describe, expect, it } from 'vitest';
import { createRunSession, completeCurrent, skipCurrent, goBack, canGoBack } from './run-session';
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
});
