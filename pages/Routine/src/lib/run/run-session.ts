import { isTaskDisabled, type Routine, type RoutineTask } from '$lib/types/routine';
import type { ProgressSegments, RunSession, StartMode, TaskStatus } from '$lib/types/run';

function sortedTasks(tasks: RoutineTask[]): RoutineTask[] {
	return [...tasks].sort((a, b) => a.order - b.order);
}

export type { StartMode } from '$lib/types/run';

/**
 * @param omitIds — task ids left out of this run (completed / not today last cycle).
 * Remaining tasks start pending. Empty leftover list opens summary.
 */
export function createRunSession(
	routine: Routine,
	omitIds: Iterable<string> = [],
	startMode: StartMode = 'fresh'
): RunSession {
	const omitted = new Set(omitIds);
	const tasks = sortedTasks(routine.tasks).filter(
		(task) => !isTaskDisabled(task) && !omitted.has(task.id)
	);
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
		phase: tasks.length === 0 ? 'summary' : 'running',
		startMode,
		recordedStatStatuses: null
	};
}

export function getCurrentTask(session: RunSession): RoutineTask | null {
	if (session.phase !== 'running') return null;
	return session.tasks[session.currentIndex] ?? null;
}

export function hasProgress(session: RunSession): boolean {
	return session.tasks.some((task) => session.statuses[task.id] !== 'pending');
}

/**
 * Largest-remainder percents so slices always sum to 100 (or all 0 when empty).
 * Zero-count slices stay 0 and never receive leftover points.
 */
export function distributePercents(counts: number[]): number[] {
	const total = counts.reduce((sum, n) => sum + Math.max(0, n), 0);
	if (total <= 0) return counts.map(() => 0);

	const raw = counts.map((n) => (Math.max(0, n) / total) * 100);
	const floors = raw.map((n) => Math.floor(n));
	let leftover = 100 - floors.reduce((sum, n) => sum + n, 0);

	const order = raw
		.map((n, i) => ({ i, frac: n - Math.floor(n), count: counts[i] ?? 0 }))
		.filter((entry) => entry.count > 0)
		.sort((a, b) => b.frac - a.frac || a.i - b.i);

	const result = [...floors];
	for (let k = 0; k < leftover && k < order.length; k++) {
		result[order[k]!.i] += 1;
	}
	return result;
}

export function buildProgressSegments(
	counts: {
		completed: number;
		later: number;
		skipped: number;
		pending: number;
	},
	resolvedPercent?: number
): ProgressSegments {
	const { completed, later, skipped, pending } = counts;
	const total = completed + later + skipped + pending;
	const [completedPct, laterPct, skippedPct, pendingPct] = distributePercents([
		completed,
		later,
		skipped,
		pending
	]);
	const resolved =
		resolvedPercent ?? (total === 0 ? 0 : Math.round(((total - pending) / total) * 100));

	return {
		total,
		pending,
		completed,
		later,
		skipped,
		percents: {
			completed: completedPct ?? 0,
			later: laterPct ?? 0,
			skipped: skippedPct ?? 0,
			pending: pendingPct ?? 0
		},
		resolvedPercent: resolved
	};
}

export function getProgressSegments(session: RunSession): ProgressSegments {
	let pending = 0;
	let completed = 0;
	let later = 0;
	let skipped = 0;

	for (const task of session.tasks) {
		const status = session.statuses[task.id] ?? 'pending';
		if (status === 'completed') completed += 1;
		else if (status === 'later') later += 1;
		else if (status === 'skipped') skipped += 1;
		else pending += 1;
	}

	const total = session.tasks.length;
	const resolved =
		total === 0
			? 0
			: session.phase === 'summary'
				? 100
				: Math.round(((total - pending) / total) * 100);

	return buildProgressSegments({ completed, later, skipped, pending }, resolved);
}

/** Share of tasks no longer pending (0–100). Summary is always 100. */
export function getProgressPercent(session: RunSession): number {
	return getProgressSegments(session).resolvedPercent;
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
