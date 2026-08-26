<script lang="ts">
	import BottomTabBar from '$lib/components/BottomTabBar.svelte';
	import { auth } from '$lib/state/auth.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<div class="flex min-h-dvh flex-col bg-canvas text-ink">
	<header
		class="flex items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3"
		style="padding-top: max(0.75rem, env(safe-area-inset-top))"
	>
		<h1 class="m-0 text-lg font-semibold">Playlist Deck</h1>
		<div class="flex min-w-0 items-center gap-2">
			{#if auth.email}
				<p
					class="m-0 max-w-36 truncate rounded-full border border-line bg-raised px-3 py-1 text-xs text-muted"
				>
					{auth.email}
				</p>
			{/if}
			<button
				type="button"
				class="min-h-11 touch-manipulation rounded-xl border border-line px-3 text-sm font-medium text-ink"
				onclick={() => auth.signOut()}
			>
				Sign out
			</button>
		</div>
	</header>

	<main class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
		{@render children?.()}
	</main>

	<BottomTabBar />
</div>
