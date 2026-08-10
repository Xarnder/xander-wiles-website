import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirebaseWebConfig, isFirebaseConfigured } from './config';

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp | null {
	if (!isFirebaseConfigured()) return null;
	if (app) return app;
	if (getApps().length > 0) {
		app = getApps()[0]!;
		return app;
	}
	app = initializeApp(getFirebaseWebConfig());
	return app;
}
