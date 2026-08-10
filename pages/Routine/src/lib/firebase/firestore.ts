import {
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager,
	getFirestore,
	type Firestore
} from 'firebase/firestore';
import { getFirebaseApp } from './app';
import { isFirebaseConfigured } from './config';

let db: Firestore | null = null;
let initialized = false;

export function getDb(): Firestore | null {
	if (!isFirebaseConfigured()) return null;
	if (initialized) return db;

	const app = getFirebaseApp();
	if (!app) return null;

	try {
		db = initializeFirestore(app, {
			localCache: persistentLocalCache({
				tabManager: persistentMultipleTabManager()
			})
		});
	} catch {
		// Already initialized in this page lifetime (HMR / duplicate call).
		db = getFirestore(app);
	}

	initialized = true;
	return db;
}
