import type { Routine } from '$lib/types/routine';

export interface RoutinesRepository {
	subscribeAll(uid: string, cb: (routines: Routine[]) => void): () => void;
	get(uid: string, id: string): Promise<Routine | null>;
	upsert(uid: string, routine: Routine): Promise<void>;
	remove(uid: string, id: string): Promise<void>;
	reorder(uid: string, orderedIds: string[]): Promise<void>;
}
