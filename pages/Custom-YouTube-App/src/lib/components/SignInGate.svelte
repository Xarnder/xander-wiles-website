<script lang="ts">
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';
	import { auth } from '$lib/state/auth.svelte';

	const setup = $derived(auth.status === 'setup');
</script>

<section class="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10 text-ink">
	<p class="m-0 text-xs font-semibold tracking-wide text-accent uppercase">Playlist Deck</p>
	<h1 class="mt-2 mb-0 text-3xl leading-tight font-semibold">Your playlists, without the noise</h1>
	<p class="mt-3 mb-6 text-sm leading-relaxed text-muted">
		Sign in with Google to reorder playlists, catch subscription uploads, and browse featured
		videos.
	</p>

	{#if setup}
		<div
			class="mb-4 rounded-2xl border border-line bg-panel px-4 py-3 text-sm leading-relaxed text-muted"
		>
			<p class="m-0">
				This app is not configured yet. Copy
				<code class="text-ink">.env.example</code>
				to
				<code class="text-ink">.env.local</code>
				and set
				<code class="text-ink">PUBLIC_GOOGLE_CLIENT_ID</code>
				and
				<code class="text-ink">PUBLIC_ALLOWED_GOOGLE_EMAILS</code>.
			</p>
		</div>
	{/if}

	{#if auth.error}
		<div class="mb-4">
			<ErrorBanner message={auth.error} />
		</div>
	{/if}

	<button
		type="button"
		class="min-h-11 touch-manipulation rounded-2xl bg-accent px-4 text-base font-semibold text-accent-ink disabled:opacity-50"
		disabled={auth.busy || setup}
		onclick={() => auth.signIn()}
	>
		{auth.busy ? 'Signing in…' : 'Sign in with Google'}
	</button>
</section>
