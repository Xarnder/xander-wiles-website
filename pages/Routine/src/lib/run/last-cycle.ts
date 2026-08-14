import type { Routine } from '$lib/types/routine';
import type { ProgressSegments, TaskStatus } from '$lib/types/run';
import { buildProgressSegments } from './run-session';

const STORAGE_KEY = 'routine-last-cycles';

export type LastCycleRecord = {
	completedTaskIds: string[];
	skippedTaskIds?: string[];
	laterTaskIds?: string[];
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
	const later = new Set(previous?.laterTaskIds ?? []);

	for (const [taskId, status] of Object.entries(statuses)) {
		completed.delete(taskId);
		skipped.delete(taskId);
		later.delete(taskId);
		if (status === 'completed') completed.add(taskId);
		else if (status === 'skipped') skipped.add(taskId);
		else if (status === 'later' || status === 'pending') later.add(taskId);
	}

	const completedTaskIds = [...completed];
	const skippedTaskIds = [...skipped];
	const laterTaskIds = [...later];
	const resolved = completedTaskIds.length + skippedTaskIds.length;
	const laterHere = laterTaskIds.length;
	const total = resolved + laterHere;
	const percentComplete = total === 0 ? 0 : Math.round((completedTaskIds.length / total) * 100);

	const map = readMap();
	map[routineId] = {
		completedTaskIds,
		skippedTaskIds,
		laterTaskIds,
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

/** Last-run stacked breakdown, or null if this routine has never been finished. */
export function getLastCycleSegments(routine: Routine): ProgressSegments | null {
	const record = getLastCycle(routine.id);
	if (!record) return null;

	const living = new Set(routine.tasks.map((task) => task.id));
	const completedIds = new Set(uniqueLiving(record.completedTaskIds, living));
	const skippedIds = new Set(
		uniqueLiving(record.skippedTaskIds ?? [], living).filter((id) => !completedIds.has(id))
	);

	const leftover = [...living].filter((id) => !completedIds.has(id) && !skippedIds.has(id));
	const laterIds =
		record.laterTaskIds === undefined
			? leftover
			: uniqueLiving(record.laterTaskIds, living).filter(
					(id) => !completedIds.has(id) && !skippedIds.has(id)
				);
	const laterSet = new Set(laterIds);
	const pending = leftover.filter((id) => !laterSet.has(id)).length;

	const completed = completedIds.size;
	const total = living.size;
	const resolvedPercent = total === 0 ? 0 : Math.round((completed / total) * 100);

	return buildProgressSegments(
		{
			completed,
			later: laterSet.size,
			skipped: skippedIds.size,
			pending
		},
		resolvedPercent
	);
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
