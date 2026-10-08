<script lang="ts">
	import { dev } from '$app/environment';
	import WoodTest from '$lib/components/WoodTest.svelte';

	const enabled = dev || new URLSearchParams(location.search).has('dev');
</script>

<svelte:head><title>Forest Drift · Wood test</title></svelte:head>

{#if enabled}
	<WoodTest />
{:else}
	<p class="note">
		The wood test scene is a development tool. Add <code>?dev</code> to open it.
	</p>
{/if}

<style>
	.note {
		padding: 2rem;
		font-family: system-ui, sans-serif;
	}
</style>
