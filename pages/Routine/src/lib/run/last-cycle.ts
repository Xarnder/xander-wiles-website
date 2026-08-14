import type { Routine } from '$lib/types/routine';
import type { TaskStatus } from '$lib/types/run';

const STORAGE_KEY = 'routine-last-cycles';

export type LastCycleRecord = {
	completedTaskIds: string[];
	skippedTaskIds?: string[];
	updatedAt: string;
	percentComplete?: number;
};

type LastCycleMap = Record<string, LastCycleRecord>;

function readMap(): LastCycleMap {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as LastCycleMap;
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

function writeMap(map: LastCycleMap): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch {
		/* ignore quota / private mode */
	}
}

function uniqueLiving(ids: Iterable<string>, living: Set<string>): string[] {
	const seen = new Set<string>();
	for (const id of ids) {
		if (living.has(id)) seen.add(id);
	}
	return [...seen];
}

/**
 * Persist last-cycle outcomes. A continue-from-last run only includes leftover
 * tasks, so this merges into the previous record instead of replacing it.
 */
export function saveLastCycle(
	routineId: string,
	statuses: Record<string, TaskStatus>
): void {
	const previous = getLastCycle(routineId);
	const completed = new Set(previous?.completedTaskIds ?? []);
	const skipped = new Set(previous?.skippedTaskIds ?? []);

	for (const [taskId, status] of Object.entries(statuses)) {
		completed.delete(taskId);
		skipped.delete(taskId);
		if (status === 'completed') completed.add(taskId);
		if (status === 'skipped') skipped.add(taskId);
	}

	const completedTaskIds = [...completed];
	const skippedTaskIds = [...skipped];
	const resolved = completedTaskIds.length + skippedTaskIds.length;
	const laterHere = Object.values(statuses).filter(
		(status) => status === 'later' || status === 'pending'
	).length;
	const total = resolved + laterHere;
	const percentComplete = total === 0 ? 0 : Math.round((completedTaskIds.length / total) * 100);

	const map = readMap();
	map[routineId] = {
		completedTaskIds,
		skippedTaskIds,
		percentComplete,
		updatedAt: new Date().toISOString()
	};
	writeMap(map);
}

export function getLastCycle(routineId: string): LastCycleRecord | null {
	const record = readMap()[routineId];
	if (!record || !Array.isArray(record.completedTaskIds)) return null;
	return record;
}

/** Last-run completion percent, or null if this routine has never been finished. */
export function getLastCyclePercent(routine: Routine): number | null {
	const record = getLastCycle(routine.id);
	if (!record) return null;
	if (routine.tasks.length === 0) return 0;
	const living = new Set(routine.tasks.map((task) => task.id));
	const completed = uniqueLiving(record.completedTaskIds, living).length;
	return Math.round((completed / routine.tasks.length) * 100);
}

/** Completed + not-today task ids from the last cycle that still exist. */
export function getOmittedTaskIds(routine: Routine): string[] {
	const record = getLastCycle(routine.id);
	if (!record) return [];
	const living = new Set(routine.tasks.map((task) => task.id));
	return uniqueLiving(
		[...record.completedTaskIds, ...(record.skippedTaskIds ?? [])],
		living
	);
}

/**
 * True when last cycle left some tasks out (completed or not today) and some
 * leftover work remains — so "from last" is useful.
 */
export function canContinueFromLastCycle(routine: Routine): boolean {
	if (routine.tasks.length === 0) return false;
	const omitted = new Set(getOmittedTaskIds(routine));
	if (omitted.size === 0) return false;
	return routine.tasks.some((task) => !omitted.has(task.id));
}
