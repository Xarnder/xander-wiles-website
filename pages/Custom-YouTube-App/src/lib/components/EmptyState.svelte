<script lang="ts">
	let { title, detail }: { title: string; detail?: string } = $props();
</script>

<div class="rounded-2xl border border-line bg-panel px-5 py-8 text-center">
	<h2 class="m-0 text-lg font-semibold text-ink">{title}</h2>
	{#if detail}
		<p class="mt-2 mb-0 text-sm leading-relaxed text-muted">{detail}</p>
	{/if}
</div>
