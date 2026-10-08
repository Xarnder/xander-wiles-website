<script lang="ts">
	import { dev } from '$app/environment';
	import AntiTilingTest from '$lib/components/AntiTilingTest.svelte';

	const enabled = dev || new URLSearchParams(location.search).has('dev');
</script>

<svelte:head><title>Forest Drift · Anti-tiling test</title></svelte:head>

{#if enabled}
	<AntiTilingTest />
{:else}
	<p class="note">
		The anti-tiling test scene is a development tool. Add <code>?dev</code> to open it.
	</p>
{/if}

<style>
	.note {
		padding: 2rem;
		font-family: system-ui, sans-serif;
	}
</style>
