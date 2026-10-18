<script lang="ts">
	import { dev } from '$app/environment';
	import { onMount } from 'svelte';
	import {
		computeDeterminismReport,
		DETERMINISM_SEEDS,
		type DeterminismReport
	} from '$lib/game/world/determinismReport';

	// Test page for multiplayer determinism (plan §8.7): generates the same fingerprints as the Vitest
	// golden, but in whichever browser engine opens it. Under `vite dev`, or with `?dev`.
	const params = new URLSearchParams(location.search);
	const enabled = dev || params.has('dev');
	// `?sweep=N` fingerprints N extra seeds ("sweep-1" …) to compare engines over more worlds.
	const sweep = Math.max(0, Math.min(200, Number(params.get('sweep') ?? 0) || 0));
	const seeds =
		sweep > 0 ? Array.from({ length: sweep }, (_, i) => `sweep-${i + 1}`) : [...DETERMINISM_SEEDS];
	let reports = $state<DeterminismReport[] | null>(null);
	let ms = $state(0);

	onMount(() => {
		if (!enabled) return;
		// Let the page paint first; the generation itself takes about half a second.
		setTimeout(() => {
			const start = performance.now();
			reports = seeds.map((seed) => computeDeterminismReport(seed));
			ms = Math.round(performance.now() - start);
		}, 0);
	});
</script>

<svelte:head><title>Forest Drift — determinism</title></svelte:head>

<main>
	{#if !enabled}
		<p>Development page. Add <code>?dev</code> to the address.</p>
	{:else if !reports}
		<p>Generating…</p>
	{:else}
		<p>{navigator.userAgent} · {ms} ms</p>
		<pre data-testid="determinism-report">{JSON.stringify(reports, null, 2)}</pre>
	{/if}
</main>

<style>
	main {
		padding: 1rem;
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		color: #eaf6ff;
		background: #101814;
		min-height: 100vh;
	}
</style>
