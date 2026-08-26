<script lang="ts">
	import { auth } from '$lib/state/auth.svelte';
</script>

<section class="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10 text-ink">
	<p class="m-0 text-xs font-semibold tracking-wide text-accent uppercase">Playlist Deck</p>
	<h1 class="mt-2 mb-0 text-3xl leading-tight font-semibold">This account is not allowed</h1>
	<p class="mt-3 mb-6 text-sm leading-relaxed text-muted">
		{#if auth.email}
			<strong class="font-medium text-ink">{auth.email}</strong> is not on the allowlist.
		{:else}
			This Google account is not on the allowlist.
		{/if}
		Sign out and try another account.
	</p>

	{#if auth.error}
		<p class="mb-4 text-sm text-danger" role="alert">{auth.error}</p>
	{/if}

	<button
		type="button"
		class="min-h-11 touch-manipulation rounded-2xl bg-accent px-4 text-base font-semibold text-accent-ink"
		onclick={() => auth.signOut()}
	>
		Sign out / try another account
	</button>
</section>
