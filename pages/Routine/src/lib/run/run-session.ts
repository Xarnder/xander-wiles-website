import type { Routine, RoutineTask } from '$lib/types/routine';
import type { RunSession, TaskStatus } from '$lib/types/run';

function sortedTasks(tasks: RoutineTask[]): RoutineTask[] {
	return [...tasks].sort((a, b) => a.order - b.order);
}

export function createRunSession(routine: Routine): RunSession {
	const tasks = sortedTasks(routine.tasks);
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
	return Object.values(session.statuses).some((status) => status !== 'pending');
}

function advanceAfterStatus(session: RunSession, status: 'completed' | 'skipped'): RunSession {
	const current = session.tasks[session.currentIndex];
	if (!current || session.phase !== 'running') return session;

	const statuses = { ...session.statuses, [current.id]: status };
	const nextIndex = session.currentIndex + 1;

	if (nextIndex >= session.tasks.length) {
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
