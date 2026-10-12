<script lang="ts">
	import { dev } from '$app/environment';
	import { onMount } from 'svelte';
	import CreatureLabModal from '$lib/components/CreatureLabModal.svelte';

	// Development tool: the Creature Lab without a world. Available under `vite dev`, or with `?dev`.
	// `?inspect` hides the Lab chrome so the viewport fills the window (screenshots, art review).
	const params = new URLSearchParams(location.search);
	const enabled = dev || params.has('dev');
	const inspect = params.has('inspect');
	onMount(() => {
		document.body.classList.toggle('creature-inspect', inspect);
		return () => document.body.classList.remove('creature-inspect');
	});
</script>

<svelte:head><title>Forest Drift · Creature Lab</title></svelte:head>

{#if enabled}
	<CreatureLabModal onClose={() => history.back()} expose />
{:else}
	<p class="note">
		The standalone Creature Lab is a development tool. Add <code>?dev</code> to open it.
	</p>
{/if}

<style>
	.note {
		padding: 2rem;
		font-family: system-ui, sans-serif;
	}
	:global(body.creature-inspect [data-testid='creature-lab']) {
		width: 100vw;
		height: 100vh;
		border-radius: 0;
	}
	:global(body.creature-inspect .backdrop) {
		padding: 0;
	}
	:global(body.creature-inspect [data-testid='creature-lab'] header),
	:global(body.creature-inspect [data-testid='creature-lab'] aside),
	:global(body.creature-inspect [data-testid='creature-lab'] .views) {
		display: none;
	}
	:global(body.creature-inspect [data-testid='creature-lab'] .content) {
		grid-template-columns: 1fr;
	}
</style>
