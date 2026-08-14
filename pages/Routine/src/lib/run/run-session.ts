import type { Routine, RoutineTask } from '$lib/types/routine';
import type { RunSession, TaskStatus } from '$lib/types/run';

function sortedTasks(tasks: RoutineTask[]): RoutineTask[] {
	return [...tasks].sort((a, b) => a.order - b.order);
}

export type StartMode = 'fresh' | 'continue';

/**
 * @param omitIds — task ids left out of this run (completed / not today last cycle).
 * Remaining tasks start pending. Empty leftover list opens summary.
 */
export function createRunSession(
	routine: Routine,
	omitIds: Iterable<string> = []
): RunSession {
	const omitted = new Set(omitIds);
	const tasks = sortedTasks(routine.tasks).filter((task) => !omitted.has(task.id));
	const statuses: Record<string, TaskStatus> = {};
	for (const task of tasks) {
		statuses[task.id] = 'pending';
	}

	return {
		routineId: routine.id,
		routineName: routine.name,
		tasks,
		statuses,
		currentIndex: 0,
		phase: tasks.length === 0 ? 'summary' : 'running'
	};
}

export function getCurrentTask(session: RunSession): RoutineTask | null {
	if (session.phase !== 'running') return null;
	return session.tasks[session.currentIndex] ?? null;
}

export function hasProgress(session: RunSession): boolean {
	return session.tasks.some((task) => session.statuses[task.id] !== 'pending');
}

/** Share of tasks no longer pending (0–100). Summary is always 100. */
export function getProgressPercent(session: RunSession): number {
	if (session.tasks.length === 0) return 0;
	if (session.phase === 'summary') return 100;
	const done = session.tasks.filter((task) => session.statuses[task.id] !== 'pending').length;
	return Math.round((done / session.tasks.length) * 100);
}

/** Next pending task after `afterIndex`, wrapping around. */
function nextPendingIndex(
	session: RunSession,
	statuses: Record<string, TaskStatus>,
	afterIndex: number
): number {
	const n = session.tasks.length;
	if (n === 0) return -1;
	for (let step = 1; step <= n; step++) {
		const i = (afterIndex + step) % n;
		if (statuses[session.tasks[i].id] === 'pending') return i;
	}
	return -1;
}

function advanceAfterStatus(
	session: RunSession,
	status: 'completed' | 'later' | 'skipped'
): RunSession {
	const current = session.tasks[session.currentIndex];
	if (!current || session.phase !== 'running') return session;

	const statuses = { ...session.statuses, [current.id]: status };
	const nextIndex = nextPendingIndex(session, statuses, session.currentIndex);

	if (nextIndex === -1) {
		return {
			...session,
			statuses,
			currentIndex: session.currentIndex,
			phase: 'summary'
		};
	}

	return {
		...session,
		statuses,
		currentIndex: nextIndex,
		phase: 'running'
	};
}

export function completeCurrent(session: RunSession): RunSession {
	return advanceAfterStatus(session, 'completed');
}

/** Drop the current task from today's obligations (does not come back this run). */
export function notTodayCurrent(session: RunSession): RunSession {
	return advanceAfterStatus(session, 'skipped');
}

export function canDeferCurrent(session: RunSession): boolean {
	return session.phase === 'running';
}

/** Mark the current task Later — still to do, but not in this pass. */
export function laterCurrent(session: RunSession): RunSession {
	return advanceAfterStatus(session, 'later');
}

export function goBack(session: RunSession): RunSession {
	if (session.phase === 'summary') {
		const lastIndex = Math.max(0, session.tasks.length - 1);
		return {
			...session,
			phase: 'running',
			currentIndex: lastIndex
		};
	}
	if (session.currentIndex <= 0) return session;
	return {
		...session,
		currentIndex: session.currentIndex - 1,
		phase: 'running'
	};
}

export function canGoBack(session: RunSession): boolean {
	if (session.phase === 'summary') return session.tasks.length > 0;
	return session.currentIndex > 0;
}
