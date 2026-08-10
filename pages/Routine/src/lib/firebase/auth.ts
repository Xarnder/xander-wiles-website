import {
	getAuth,
	GoogleAuthProvider,
	onAuthStateChanged,
	signInWithPopup,
	signInWithRedirect,
	getRedirectResult,
	signOut,
	type Auth,
	type User
} from 'firebase/auth';
import { getFirebaseApp } from './app';
import { isE2EMode } from './config';

export type AuthUser = {
	uid: string;
	email: string | null;
	displayName: string | null;
	photoURL: string | null;
};

const E2E_USER: AuthUser = {
	uid: 'e2e-user',
	email: 'e2e@test.local',
	displayName: 'E2E User',
	photoURL: null
};

function mapUser(user: User): AuthUser {
	return {
		uid: user.uid,
		email: user.email,
		displayName: user.displayName,
		photoURL: user.photoURL
	};
}

function getClientAuth(): Auth | null {
	const app = getFirebaseApp();
	if (!app) return null;
	return getAuth(app);
}

export function subscribeAuth(callback: (user: AuthUser | null) => void): () => void {
	if (isE2EMode()) {
		callback(E2E_USER);
		return () => {};
	}

	const auth = getClientAuth();
	if (!auth) {
		callback(null);
		return () => {};
	}

	void getRedirectResult(auth).catch(() => {
		/* ignore redirect errors; user can try again */
	});

	return onAuthStateChanged(auth, (user) => {
		callback(user ? mapUser(user) : null);
	});
}

export async function signInWithGoogle(): Promise<void> {
	if (isE2EMode()) return;
	const auth = getClientAuth();
	if (!auth) {
		throw new Error('Firebase Auth is not configured.');
	}
	const provider = new GoogleAuthProvider();
	try {
		await signInWithPopup(auth, provider);
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
			await signInWithRedirect(auth, provider);
			return;
		}
		throw error;
	}
}

export async function signOutUser(): Promise<void> {
	if (isE2EMode()) return;
	const auth = getClientAuth();
	if (!auth) return;
	await signOut(auth);
}
