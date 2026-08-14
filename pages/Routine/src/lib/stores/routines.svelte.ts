import { getRoutinesRepository } from '$lib/data';
import { clearRoutineTaskStats } from '$lib/run/task-stats';
import type { Routine } from '$lib/types/routine';
import { getAuthUser } from './auth.svelte';

let routines: Routine[] = $state([]);
let loading = $state(false);
let error: string | null = $state(null);
let unsubscribe: (() => void) | null = null;
let activeUid: string | null = null;

export function getRoutines(): Routine[] {
	return routines;
}

export function getRoutinesLoading(): boolean {
	return loading;
}

export function getRoutinesError(): string | null {
	return error;
}

export function syncRoutinesForCurrentUser(): void {
	const user = getAuthUser();
	const uid = user?.uid ?? null;

	if (uid === activeUid && unsubscribe) return;

	unsubscribe?.();
	unsubscribe = null;
	activeUid = uid;
	routines = [];
	error = null;

	if (!uid) {
		loading = false;
		return;
	}

	loading = true;
	const repo = getRoutinesRepository();
	unsubscribe = repo.subscribeAll(uid, (next) => {
		routines = next;
		loading = false;
	});
}

export function stopRoutinesSync(): void {
	unsubscribe?.();
	unsubscribe = null;
	activeUid = null;
	routines = [];
	loading = false;
	error = null;
}

export async function saveRoutine(routine: Routine): Promise<void> {
	const user = getAuthUser();
	if (!user) throw new Error('You must be signed in to save routines.');
	error = null;
	await getRoutinesRepository().upsert(user.uid, routine);
}

export async function deleteRoutine(id: string): Promise<void> {
	const user = getAuthUser();
	if (!user) throw new Error('You must be signed in to delete routines.');
	error = null;
	await getRoutinesRepository().remove(user.uid, id);
	clearRoutineTaskStats(id);
}

export async function reorderRoutines(orderedIds: string[]): Promise<void> {
	const user = getAuthUser();
	if (!user) throw new Error('You must be signed in to reorder routines.');
	error = null;
	await getRoutinesRepository().reorder(user.uid, orderedIds);
}

export async function getRoutineById(id: string): Promise<Routine | null> {
	const user = getAuthUser();
	if (!user) return null;
	const cached = routines.find((routine) => routine.id === id);
	if (cached) return cached;
	return getRoutinesRepository().get(user.uid, id);
}
