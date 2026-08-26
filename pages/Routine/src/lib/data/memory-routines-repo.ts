import type { Routine, RoutineTask } from '$lib/types/routine';
import { sortBySortOrder } from '$lib/utils/order';
import type { RoutinesRepository } from './routines-repo';

function cloneRoutine(routine: Routine): Routine {
	return {
		...routine,
		tasks: routine.tasks.map((task) => ({ ...task }))
	};
}

export class MemoryRoutinesRepository implements RoutinesRepository {
	private data = new Map<string, Map<string, Routine>>();
	private listeners = new Map<string, Set<(routines: Routine[]) => void>>();

	private ensureUser(uid: string): Map<string, Routine> {
		if (!this.data.has(uid)) this.data.set(uid, new Map());
		return this.data.get(uid)!;
	}

	private emit(uid: string): void {
		const routines = sortBySortOrder([...this.ensureUser(uid).values()].map(cloneRoutine));
		const set = this.listeners.get(uid);
		if (!set) return;
		for (const cb of set) cb(routines);
	}

	subscribeAll(uid: string, cb: (routines: Routine[]) => void): () => void {
		if (!this.listeners.has(uid)) this.listeners.set(uid, new Set());
		this.listeners.get(uid)!.add(cb);
		cb(sortBySortOrder([...this.ensureUser(uid).values()].map(cloneRoutine)));
		return () => {
			this.listeners.get(uid)?.delete(cb);
		};
	}

	async get(uid: string, id: string): Promise<Routine | null> {
		const found = this.ensureUser(uid).get(id);
		return found ? cloneRoutine(found) : null;
	}

	async upsert(uid: string, routine: Routine): Promise<void> {
		this.ensureUser(uid).set(routine.id, cloneRoutine(routine));
		this.emit(uid);
	}

	async remove(uid: string, id: string): Promise<void> {
		this.ensureUser(uid).delete(id);
		this.emit(uid);
	}

	async reorder(uid: string, orderedIds: string[]): Promise<void> {
		const userMap = this.ensureUser(uid);
		const now = new Date().toISOString();
		orderedIds.forEach((id, index) => {
			const existing = userMap.get(id);
			if (!existing) return;
			userMap.set(id, { ...existing, sortOrder: index, updatedAt: now });
		});
		this.emit(uid);
	}

	/** Test helper */
	seed(uid: string, routines: Routine[]): void {
		const userMap = this.ensureUser(uid);
		userMap.clear();
		for (const routine of routines) {
			userMap.set(routine.id, cloneRoutine(routine));
		}
		this.emit(uid);
	}
}

export function normalizeTasks(tasks: RoutineTask[]): RoutineTask[] {
	return tasks
		.map((task, index) => ({
			id: task.id,
			title: task.title.trim(),
			description: task.description?.trim() || undefined,
			order: index,
			disabled: task.disabled === true ? true : undefined
		}))
		.filter((task) => task.title.length > 0);
}
