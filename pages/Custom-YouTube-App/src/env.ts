import { defineEnvVars } from '@sveltejs/kit/env';

// These apps are built for static hosting; public settings must be baked in at build time.
const publicString = {
	public: true,
	static: true,
	schema: (value: string | undefined) => value ?? ''
};

export const variables = defineEnvVars({
	PUBLIC_GOOGLE_CLIENT_ID: publicString,
	PUBLIC_ALLOWED_GOOGLE_EMAILS: publicString
});
