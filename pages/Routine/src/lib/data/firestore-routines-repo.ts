import {
	collection,
	doc,
	getDoc,
	onSnapshot,
	setDoc,
	deleteDoc,
	writeBatch,
	type DocumentData
} from 'firebase/firestore';
import type { Routine, RoutineTask } from '$lib/types/routine';
import { sortBySortOrder } from '$lib/utils/order';
import { getDb } from '$lib/firebase/firestore';
import type { RoutinesRepository } from './routines-repo';

function routinesPath(uid: string) {
	return collection(getDb()!, 'users', uid, 'routines');
}

function fromDoc(id: string, data: DocumentData): Routine {
	const tasks = Array.isArray(data.tasks)
		? (data.tasks as RoutineTask[]).map((task, index) => ({
				id: String(task.id),
				title: String(task.title ?? ''),
				description: task.description ? String(task.description) : undefined,
				order: typeof task.order === 'number' ? task.order : index,
				disabled: task.disabled === true ? true : undefined
			}))
		: [];

	return {
		id,
		name: String(data.name ?? 'Untitled'),
		description: data.description ? String(data.description) : undefined,
		icon: data.icon ? String(data.icon) : undefined,
		tasks,
		sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
		createdAt: String(data.createdAt ?? new Date().toISOString()),
		updatedAt: String(data.updatedAt ?? new Date().toISOString())
	};
}

function toDoc(routine: Routine): DocumentData {
	return {
		name: routine.name,
		description: routine.description ?? null,
		icon: routine.icon ?? null,
		tasks: routine.tasks.map((task) => ({
			id: task.id,
			title: task.title,
			description: task.description ?? null,
			order: task.order,
			disabled: task.disabled === true
		})),
		sortOrder: routine.sortOrder,
		createdAt: routine.createdAt,
		updatedAt: routine.updatedAt
	};
}

export class FirestoreRoutinesRepository implements RoutinesRepository {
	subscribeAll(uid: string, cb: (routines: Routine[]) => void): () => void {
		const db = getDb();
		if (!db) {
			cb([]);
			return () => {};
		}
		return onSnapshot(
			routinesPath(uid),
			(snapshot) => {
				const routines = sortBySortOrder(
					snapshot.docs.map((document) => fromDoc(document.id, document.data()))
				);
				cb(routines);
			},
			() => {
				cb([]);
			}
		);
	}

	async get(uid: string, id: string): Promise<Routine | null> {
		const db = getDb();
		if (!db) return null;
		const snap = await getDoc(doc(db, 'users', uid, 'routines', id));
		if (!snap.exists()) return null;
		return fromDoc(snap.id, snap.data());
	}

	async upsert(uid: string, routine: Routine): Promise<void> {
		const db = getDb();
		if (!db) throw new Error('Firestore is not configured.');
		await setDoc(doc(db, 'users', uid, 'routines', routine.id), toDoc(routine), { merge: true });
	}

	async remove(uid: string, id: string): Promise<void> {
		const db = getDb();
		if (!db) throw new Error('Firestore is not configured.');
		await deleteDoc(doc(db, 'users', uid, 'routines', id));
	}

	async reorder(uid: string, orderedIds: string[]): Promise<void> {
		const db = getDb();
		if (!db) throw new Error('Firestore is not configured.');
		const batch = writeBatch(db);
		const now = new Date().toISOString();
		orderedIds.forEach((id, index) => {
			batch.set(
				doc(db, 'users', uid, 'routines', id),
				{ sortOrder: index, updatedAt: now },
				{ merge: true }
			);
		});
		await batch.commit();
	}
}
