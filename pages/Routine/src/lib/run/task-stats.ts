import type { ProgressSegments, TaskStatus } from '$lib/types/run';
import { buildProgressSegments, distributePercents } from './run-session';

const STORAGE_KEY = 'routine-task-stats';

export type TaskOutcomeCounts = {
	firstTime: number;
	later: number;
	notToday: number;
};

export type RoutineTaskStatsRecord = {
	cycleCount: number;
	tasks: Record<string, TaskOutcomeCounts>;
	updatedAt: string;
};

type StatsMap = Record<string, RoutineTaskStatsRecord>;

function emptyCounts(): TaskOutcomeCounts {
	return { firstTime: 0, later: 0, notToday: 0 };
}

function readMap(): StatsMap {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as StatsMap;
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

function writeMap(map: StatsMap): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch {
		/* ignore quota / private mode */
	}
}

export function outcomeFromStatus(status: TaskStatus): keyof TaskOutcomeCounts | null {
	if (status === 'completed') return 'firstTime';
	if (status === 'later') return 'later';
	if (status === 'skipped') return 'notToday';
	return null;
}

export function observationTotal(counts: TaskOutcomeCounts): number {
	return Math.max(0, counts.firstTime) + Math.max(0, counts.later) + Math.max(0, counts.notToday);
}

export function applyCycleDelta(
	current: Record<string, TaskOutcomeCounts>,
	statuses: Record<string, TaskStatus>,
	delta: 1 | -1
): Record<string, TaskOutcomeCounts> {
	const next = { ...current };
	for (const [taskId, status] of Object.entries(statuses)) {
		const key = outcomeFromStatus(status);
		if (!key) continue;
		const prev = next[taskId] ?? emptyCounts();
		next[taskId] = {
			firstTime: Math.max(0, prev.firstTime + (key === 'firstTime' ? delta : 0)),
			later: Math.max(0, prev.later + (key === 'later' ? delta : 0)),
			notToday: Math.max(0, prev.notToday + (key === 'notToday' ? delta : 0))
		};
	}
	return next;
}

/**
 * Record first-pass outcomes from a finished fresh cycle.
 * If `previous` is set, that snapshot is replaced (go-back then finish again).
 */
export function recordFreshCycleStats(
	routineId: string,
	statuses: Record<string, TaskStatus>,
	previous?: Record<string, TaskStatus> | null
): void {
	const map = readMap();
	const existing = map[routineId];
	let tasks = { ...(existing?.tasks ?? {}) };
	let cycleCount = existing?.cycleCount ?? 0;

	if (previous) {
		tasks = applyCycleDelta(tasks, previous, -1);
	} else {
		cycleCount += 1;
	}

	tasks = applyCycleDelta(tasks, statuses, 1);
	map[routineId] = {
		tasks,
		cycleCount,
		updatedAt: new Date().toISOString()
	};
	writeMap(map);
}

export function getRoutineTaskStats(routineId: string): RoutineTaskStatsRecord | null {
	const record = readMap()[routineId];
	if (!record || typeof record !== 'object' || !record.tasks) return null;
	return record;
}

export function getTaskOutcomeCounts(
	routineId: string,
	taskId: string
): TaskOutcomeCounts {
	return getRoutineTaskStats(routineId)?.tasks[taskId] ?? emptyCounts();
}

export function clearRoutineTaskStats(routineId: string): void {
	const map = readMap();
	if (!(routineId in map)) return;
	delete map[routineId];
	writeMap(map);
}

export function sumOutcomeCounts(countsList: Iterable<TaskOutcomeCounts>): TaskOutcomeCounts {
	const sum = emptyCounts();
	for (const counts of countsList) {
		sum.firstTime += counts.firstTime;
		sum.later += counts.later;
		sum.notToday += counts.notToday;
	}
	return sum;
}

export function outcomePercents(counts: TaskOutcomeCounts): TaskOutcomeCounts {
	const [firstTime, later, notToday] = distributePercents([
		counts.firstTime,
		counts.later,
		counts.notToday
	]);
	return {
		firstTime: firstTime ?? 0,
		later: later ?? 0,
		notToday: notToday ?? 0
	};
}

/** Stacked bar: first-time (teal), later (blue), not today (forest). */
export function outcomeSegments(counts: TaskOutcomeCounts): ProgressSegments {
	const total = observationTotal(counts);
	const firstTimePercent = total === 0 ? 0 : Math.round((counts.firstTime / total) * 100);
	return buildProgressSegments(
		{
			completed: counts.firstTime,
			later: counts.later,
			skipped: counts.notToday,
			pending: 0
		},
		firstTimePercent
	);
}
