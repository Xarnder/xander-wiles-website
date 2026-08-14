import { describe, expect, it } from 'vitest';
import {
	createRunSession,
	completeCurrent,
	notTodayCurrent,
	laterCurrent,
	canDeferCurrent,
	goBack,
	canGoBack,
	getProgressPercent,
	getProgressSegments,
	distributePercents
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

	it('marks a task not today and advances', () => {
		let session = createRunSession(makeRoutine(tasks));
		session = notTodayCurrent(session);
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
		session = notTodayCurrent(session);
		expect(session.statuses.t1).toBe('skipped');
		expect(session.currentIndex).toBe(1);
	});

	it('moves to summary after the final task', () => {
		let session = createRunSession(makeRoutine(tasks));
		session = completeCurrent(session);
		session = notTodayCurrent(session);
		session = completeCurrent(session);
		expect(session.phase).toBe('summary');
		const summary = deriveSummary(session);
		expect(summary.completed).toBe(2);
		expect(summary.later).toBe(0);
		expect(summary.skipped).toBe(1);
		expect(summary.percentComplete).toBe(67);
		expect(summary.results.map((r) => r.status)).toEqual(['completed', 'completed', 'skipped']);
		expect(summary.results.map((r) => r.taskId)).toEqual(['t1', 't3', 't2']);
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

	it('continues from last by omitting completed and not-today tasks', () => {
		const session = createRunSession(makeRoutine(tasks), ['t1', 't3']);
		expect(session.tasks.map((task) => task.id)).toEqual(['t2']);
		expect(session.statuses).toEqual({ t2: 'pending' });
		expect(session.currentIndex).toBe(0);
		expect(session.phase).toBe('running');
		expect(getProgressPercent(session)).toBe(0);
	});

	it('opens summary when continue omits every task', () => {
		const session = createRunSession(makeRoutine(tasks), ['t1', 't2', 't3']);
		expect(session.tasks).toEqual([]);
		expect(session.phase).toBe('summary');
		expect(getProgressPercent(session)).toBe(0);
	});

	it('runs only leftover tasks after omitting completed and skipped', () => {
		let session = createRunSession(makeRoutine(tasks), ['t1']);
		expect(session.tasks.map((task) => task.id)).toEqual(['t2', 't3']);
		expect(session.currentIndex).toBe(0);
		expect(getProgressPercent(session)).toBe(0);
		session = completeCurrent(session);
		expect(session.statuses.t2).toBe('completed');
		expect(session.currentIndex).toBe(1);
		expect(session.phase).toBe('running');
		session = completeCurrent(session);
		expect(session.phase).toBe('summary');
		expect(getProgressPercent(session)).toBe(100);
	});

	it('keeps leftover order when omitted tasks sit in the middle', () => {
		const longer: RoutineTask[] = [...tasks, { id: 't4', title: 'Four', order: 3 }];
		let session = createRunSession(makeRoutine(longer), ['t1', 't3']);
		expect(session.tasks.map((task) => task.id)).toEqual(['t2', 't4']);
		expect(session.currentIndex).toBe(0);
		session = completeCurrent(session);
		expect(session.phase).toBe('running');
		expect(session.currentIndex).toBe(1);
		expect(session.tasks[1]?.id).toBe('t4');
		expect(getProgressPercent(session)).toBe(50);
	});

	it('defers a task as later and finishes the rest without coming back', () => {
		let session = createRunSession(makeRoutine(tasks));
		session = laterCurrent(session);
		expect(session.statuses.t1).toBe('later');
		expect(session.currentIndex).toBe(1);
		expect(getProgressPercent(session)).toBe(33);

		session = completeCurrent(session);
		expect(session.statuses.t2).toBe('completed');
		expect(session.currentIndex).toBe(2);

		session = completeCurrent(session);
		expect(session.phase).toBe('summary');
		const summary = deriveSummary(session);
		expect(summary.completed).toBe(2);
		expect(summary.later).toBe(1);
		expect(summary.skipped).toBe(0);
		expect(summary.results.map((r) => r.status)).toEqual(['later', 'completed', 'completed']);
		expect(summary.results.map((r) => r.taskId)).toEqual(['t1', 't2', 't3']);
	});

	it('can mark every remaining task later and still reach summary', () => {
		let session = createRunSession(makeRoutine(tasks));
		session = laterCurrent(session);
		session = laterCurrent(session);
		session = laterCurrent(session);
		expect(session.phase).toBe('summary');
		expect(session.statuses).toEqual({ t1: 'later', t2: 'later', t3: 'later' });
		expect(deriveSummary(session).later).toBe(3);
	});

	it('marks the last remaining task later and opens summary', () => {
		let session = createRunSession(makeRoutine(tasks));
		session = completeCurrent(session);
		session = completeCurrent(session);
		expect(session.currentIndex).toBe(2);
		expect(canDeferCurrent(session)).toBe(true);
		session = laterCurrent(session);
		expect(session.phase).toBe('summary');
		expect(session.statuses.t3).toBe('later');
		expect(deriveSummary(session).later).toBe(1);
	});

	it('keeps later tasks off this pass after a not-today in between', () => {
		let session = createRunSession(makeRoutine(tasks));
		session = laterCurrent(session);
		session = notTodayCurrent(session);
		expect(session.statuses.t2).toBe('skipped');
		expect(session.currentIndex).toBe(2);
		session = completeCurrent(session);
		expect(session.phase).toBe('summary');
		const summary = deriveSummary(session);
		expect(summary.later).toBe(1);
		expect(summary.skipped).toBe(1);
		expect(summary.completed).toBe(1);
		expect(summary.results.map((r) => r.status)).toEqual(['later', 'completed', 'skipped']);
		expect(summary.results.map((r) => r.taskId)).toEqual(['t1', 't3', 't2']);
	});

	it('distributes percents with largest remainder so they sum to 100', () => {
		expect(distributePercents([1, 1, 1])).toEqual([34, 33, 33]);
		expect(distributePercents([1, 2])).toEqual([33, 67]);
		expect(distributePercents([0, 0, 0, 3])).toEqual([0, 0, 0, 100]);
		expect(distributePercents([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
		expect(distributePercents([1, 1, 1, 0]).reduce((sum, n) => sum + n, 0)).toBe(100);
	});

	it('grows stacked progress segments as statuses change', () => {
		let session = createRunSession(makeRoutine(tasks));
		let segments = getProgressSegments(session);
		expect(segments).toMatchObject({
			completed: 0,
			later: 0,
			skipped: 0,
			pending: 3,
			resolvedPercent: 0
		});
		expect(segments.percents).toEqual({
			completed: 0,
			later: 0,
			skipped: 0,
			pending: 100
		});

		session = completeCurrent(session);
		segments = getProgressSegments(session);
		expect(segments.completed).toBe(1);
		expect(segments.pending).toBe(2);
		expect(segments.percents.completed).toBe(33);
		expect(segments.percents.pending).toBe(67);
		expect(segments.resolvedPercent).toBe(33);

		session = laterCurrent(session);
		segments = getProgressSegments(session);
		expect(segments).toMatchObject({ completed: 1, later: 1, skipped: 0, pending: 1 });
		expect(segments.percents.completed + segments.percents.later + segments.percents.pending).toBe(
			100
		);

		session = notTodayCurrent(session);
		segments = getProgressSegments(session);
		expect(segments).toMatchObject({
			completed: 1,
			later: 1,
			skipped: 1,
			pending: 0,
			resolvedPercent: 100
		});
		expect(
			segments.percents.completed +
				segments.percents.later +
				segments.percents.skipped +
				segments.percents.pending
		).toBe(100);
		expect(segments.percents.pending).toBe(0);
	});
});
