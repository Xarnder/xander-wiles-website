import { isE2EMode, isFirebaseConfigured } from '$lib/firebase/config';
import { FirestoreRoutinesRepository } from './firestore-routines-repo';
import { MemoryRoutinesRepository } from './memory-routines-repo';
import type { RoutinesRepository } from './routines-repo';

const memoryRepo = new MemoryRoutinesRepository();
let firestoreRepo: FirestoreRoutinesRepository | null = null;

export function getRoutinesRepository(): RoutinesRepository {
	if (isE2EMode() || !isFirebaseConfigured()) {
		return memoryRepo;
	}
	if (!firestoreRepo) firestoreRepo = new FirestoreRoutinesRepository();
	return firestoreRepo;
}

export function getMemoryRepositoryForTests(): MemoryRoutinesRepository {
	return memoryRepo;
}
