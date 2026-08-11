import type { Routine, RoutineTask } from '$lib/types/routine';
import type { RunSession, TaskStatus } from '$lib/types/run';

function sortedTasks(tasks: RoutineTask[]): RoutineTask[] {
	return [...tasks].sort((a, b) => a.order - b.order);
}

export type StartMode = 'fresh' | 'continue';

/**
 * @param preCompletedIds — task ids to mark completed up front (continue-from-last).
 * Starts at the first task that is not already completed.
 */
export function createRunSession(
	routine: Routine,
	preCompletedIds: Iterable<string> = []
): RunSession {
	const tasks = sortedTasks(routine.tasks);
	const preCompleted = new Set(preCompletedIds);
	const statuses: Record<string, TaskStatus> = {};
	for (const task of tasks) {
		statuses[task.id] = preCompleted.has(task.id) ? 'completed' : 'pending';
	}

	const firstPending = tasks.findIndex((task) => statuses[task.id] !== 'completed');
	const allDone = tasks.length > 0 && firstPending === -1;

	return {
		routineId: routine.id,
		routineName: routine.name,
		tasks,
		statuses,
		currentIndex: allDone ? Math.max(0, tasks.length - 1) : Math.max(0, firstPending),
		phase: tasks.length === 0 || allDone ? 'summary' : 'running'
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

function nextPendingIndex(session: RunSession, statuses: Record<string, TaskStatus>, afterIndex: number): number {
	for (let i = afterIndex + 1; i < session.tasks.length; i++) {
		if (statuses[session.tasks[i].id] === 'pending') return i;
	}
	return -1;
}

function advanceAfterStatus(session: RunSession, status: 'completed' | 'skipped'): RunSession {
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

export function skipCurrent(session: RunSession): RunSession {
	return advanceAfterStatus(session, 'skipped');
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
