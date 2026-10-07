// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	/** Build-time flag: whether the non-commercial CrisperWhisper engine is offered. */
	const __CRISPERWHISPER_ENABLED__: boolean;
	const __APP_VERSION__: string;
}

export {};
