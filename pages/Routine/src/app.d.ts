/// <reference types="@sveltejs/kit" />

declare namespace App {
	// interface Error {}
	// interface Locals {}
	// interface PageData {}
	// interface PageState {}
	// interface Platform {}
}

interface ImportMetaEnv {
	readonly PUBLIC_ROUTINE_E2E?: string;
	readonly PUBLIC_ROUTINE_FIREBASE_API_KEY?: string;
	readonly PUBLIC_ROUTINE_FIREBASE_AUTH_DOMAIN?: string;
	readonly PUBLIC_ROUTINE_FIREBASE_PROJECT_ID?: string;
	readonly PUBLIC_ROUTINE_FIREBASE_STORAGE_BUCKET?: string;
	readonly PUBLIC_ROUTINE_FIREBASE_MESSAGING_SENDER_ID?: string;
	readonly PUBLIC_ROUTINE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
