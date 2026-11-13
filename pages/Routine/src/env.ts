import { defineEnvVars } from '@sveltejs/kit/env';

// These apps are built for static hosting; public settings must be baked in at build time.
const publicString = {
	public: true,
	static: true,
	schema: (value: string | undefined) => value ?? ''
};

export const variables = defineEnvVars({
	PUBLIC_ROUTINE_E2E: publicString,
	PUBLIC_ROUTINE_FIREBASE_API_KEY: publicString,
	PUBLIC_ROUTINE_FIREBASE_AUTH_DOMAIN: publicString,
	PUBLIC_ROUTINE_FIREBASE_PROJECT_ID: publicString,
	PUBLIC_ROUTINE_FIREBASE_STORAGE_BUCKET: publicString,
	PUBLIC_ROUTINE_FIREBASE_MESSAGING_SENDER_ID: publicString,
	PUBLIC_ROUTINE_FIREBASE_APP_ID: publicString
});
