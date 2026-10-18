<script lang="ts">
	import { onMount } from 'svelte';
	import '$lib/ui/theme.css';
	import { initializeUiWood } from '$lib/ui/woodTexture';
	onMount(() => {
		void initializeUiWood();
	});
	let { children } = $props();
</script>

<svelte:head>
	<title>Forest Drift</title>
	<meta
		name="description"
		content="A procedural, seeded, infinite-terrain exploration prototype built with Three.js and SvelteKit."
	/>
</svelte:head>

{@render children()}

<style>
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		height: 100%;
		overflow: hidden;
		background: #100e0c;
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			sans-serif;
	}

	:global(*) {
		box-sizing: border-box;
	}
</style>
