import type { Routine } from '$lib/types/routine';
import type { TaskStatus } from '$lib/types/run';

const STORAGE_KEY = 'routine-last-cycles';

export type LastCycleRecord = {
	completedTaskIds: string[];
	updatedAt: string;
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

/** Persist which tasks were completed in the finished cycle. */
export function saveLastCycle(
	routineId: string,
	statuses: Record<string, TaskStatus>
): void {
	const completedTaskIds = Object.entries(statuses)
		.filter(([, status]) => status === 'completed')
		.map(([taskId]) => taskId);

	const map = readMap();
	map[routineId] = {
		completedTaskIds,
		updatedAt: new Date().toISOString()
	};
	writeMap(map);
}

export function getLastCycle(routineId: string): LastCycleRecord | null {
	const record = readMap()[routineId];
	if (!record || !Array.isArray(record.completedTaskIds)) return null;
	return record;
}

/** Completed task ids from the last cycle that still exist on the routine. */
export function getContinuableCompletedIds(routine: Routine): string[] {
	const record = getLastCycle(routine.id);
	if (!record) return [];
	const living = new Set(routine.tasks.map((task) => task.id));
	return record.completedTaskIds.filter((id) => living.has(id));
}

/**
 * True when there is at least one remembered completion and at least one task
 * still left to do (so "from last" is useful).
 */
export function canContinueFromLastCycle(routine: Routine): boolean {
	if (routine.tasks.length === 0) return false;
	const completed = new Set(getContinuableCompletedIds(routine));
	if (completed.size === 0) return false;
	return routine.tasks.some((task) => !completed.has(task.id));
}
