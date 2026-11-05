// SvelteKit 3 still resolves this compatibility module at runtime, but publishes
// its declarations under the replacement name. Keep existing imports type-safe.
declare module '$app/environment' {
	export * from '$app/env';
}
