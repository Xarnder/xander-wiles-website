<script lang="ts">
	let online = $state(true);
</script>

<svelte:window bind:online />

{#if !online}
	<div class="banner" role="status" data-testid="offline-banner">
		You’re offline. Edits will sync when you’re back online.
	</div>
{/if}

<style>
	.banner {
		margin: 0 0 0.85rem;
		padding: 0.7rem 0.95rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink-soft);
		font-size: 0.92rem;
		line-height: 1.4;
	}
</style>
