<script lang="ts">
	import { dev } from '$app/environment';
	import MaterialGallery from '$lib/components/MaterialGallery.svelte';

	// Development tool: available under `vite dev`, or in a build with `?dev` (used by e2e tests).
	const enabled = dev || new URLSearchParams(location.search).has('dev');
</script>

<svelte:head><title>Forest Drift · Materials</title></svelte:head>

{#if enabled}
	<MaterialGallery />
{:else}
	<p class="note">The material gallery is a development tool. Add <code>?dev</code> to open it.</p>
{/if}

<style>
	.note {
		padding: 2rem;
		font-family: system-ui, sans-serif;
	}
</style>
