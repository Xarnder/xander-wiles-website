<script lang="ts">
	let {
		title = 'Nothing here yet',
		message,
		actionLabel,
		onaction
	}: {
		title?: string;
		message: string;
		actionLabel?: string;
		onaction?: () => void;
	} = $props();
</script>

<div class="card empty">
	<h2>{title}</h2>
	<p>{message}</p>
	{#if actionLabel && onaction}
		<button type="button" class="btn btn-primary" onclick={onaction}>{actionLabel}</button>
	{/if}
</div>

<style>
	.empty {
		padding: 1.5rem;
		text-align: center;
	}

	h2 {
		margin: 0 0 0.4rem;
		font-family: var(--font-display);
		color: var(--ink);
	}

	p {
		margin: 0 0 1rem;
		color: var(--ink-soft);
		line-height: 1.45;
	}
</style>
