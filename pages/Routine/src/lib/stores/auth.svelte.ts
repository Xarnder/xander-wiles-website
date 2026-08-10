import { subscribeAuth, type AuthUser } from '$lib/firebase/auth';
import { isE2EMode, isFirebaseConfigured } from '$lib/firebase/config';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in' | 'setup_required';

let user: AuthUser | null = $state(null);
let status: AuthStatus = $state('loading');
let unsubscribe: (() => void) | null = null;
let started = false;

export function getAuthUser(): AuthUser | null {
	return user;
}

export function getAuthStatus(): AuthStatus {
	return status;
}

export function startAuthListener(): void {
	if (started) return;
	started = true;

	if (isE2EMode()) {
		user = {
			uid: 'e2e-user',
			email: 'e2e@test.local',
			displayName: 'E2E User',
			photoURL: null
		};
		status = 'signed_in';
		return;
	}

	if (!isFirebaseConfigured()) {
		user = null;
		status = 'setup_required';
		return;
	}

	unsubscribe = subscribeAuth((next) => {
		user = next;
		status = next ? 'signed_in' : 'signed_out';
	});
}

export function stopAuthListener(): void {
	unsubscribe?.();
	unsubscribe = null;
	started = false;
}
