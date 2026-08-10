import { env } from '$env/dynamic/public';

export function isE2EMode(): boolean {
	return env.PUBLIC_ROUTINE_E2E === 'true';
}

export function getFirebaseWebConfig() {
	return {
		apiKey: env.PUBLIC_ROUTINE_FIREBASE_API_KEY ?? '',
		authDomain: env.PUBLIC_ROUTINE_FIREBASE_AUTH_DOMAIN ?? '',
		projectId: env.PUBLIC_ROUTINE_FIREBASE_PROJECT_ID ?? '',
		storageBucket: env.PUBLIC_ROUTINE_FIREBASE_STORAGE_BUCKET ?? '',
		messagingSenderId: env.PUBLIC_ROUTINE_FIREBASE_MESSAGING_SENDER_ID ?? '',
		appId: env.PUBLIC_ROUTINE_FIREBASE_APP_ID ?? ''
	};
}

export function isFirebaseConfigured(): boolean {
	if (isE2EMode()) return false;
	const config = getFirebaseWebConfig();
	return Boolean(
		config.apiKey &&
		config.authDomain &&
		config.projectId &&
		config.appId &&
		!config.apiKey.includes('YOUR_') &&
		config.apiKey.length > 8
	);
}
