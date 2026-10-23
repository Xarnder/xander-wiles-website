<script lang="ts">
	import { dev } from '$app/environment';
	import { onMount } from 'svelte';
	import { DEFAULT_MINI_BUILDS } from '$lib/game/miniBuild/defaultMiniBuilds';
	import { MiniBuildLabScene, type MiniBuildLabView } from '$lib/game/miniBuild/MiniBuildLabScene';
	import { shapeCount } from '$lib/game/miniBuild/miniBuildShapes';
	import {
		effectiveMiniBuildTexture,
		miniBuildTextureLabel
	} from '$lib/game/miniBuild/miniBuildTextures';

	// Development tool: every stock Mini Build under game materials. Available under `vite dev`, or
	// with `?dev`. `?focus=<id>&view=front` frames one design; `?inspect` hides the panel.
	const params = new URLSearchParams(location.search);
	const enabled = dev || params.has('dev');
	const inspect = params.has('inspect');
	const views: MiniBuildLabView[] = ['three-quarter', 'front', 'side', 'back', 'top'];

	let viewport: HTMLDivElement | undefined = $state();
	let lab: MiniBuildLabScene | null = null;
	let focused = $state<string | null>(params.get('focus'));
	let view = $state<MiniBuildLabView>((params.get('view') as MiniBuildLabView) ?? 'three-quarter');
	let procedural = $state(!params.has('flat'));
	let ready = $state(false);

	const rows = DEFAULT_MINI_BUILDS.map((definition) => ({
		definition,
		cuboids: shapeCount(definition.blocks, 'cuboid'),
		cylinders: shapeCount(definition.blocks, 'cylinder'),
		spheres: shapeCount(definition.blocks, 'sphere'),
		textures: definition.materials.map((slot) => effectiveMiniBuildTexture(slot))
	}));

	function show(id: string | null, nextView = view): void {
		focused = id;
		view = nextView;
		lab?.focus(id ? (id.startsWith('default-') ? id : `default-${id}`) : null, nextView);
	}

	onMount(() => {
		if (!enabled || !viewport) return;
		lab = new MiniBuildLabScene(viewport, DEFAULT_MINI_BUILDS, { procedural });
		// Console and e2e access for inspection.
		(window as unknown as { miniBuildLab?: MiniBuildLabScene }).miniBuildLab = lab;
		show(focused, view);
		void lab.whenReady().then(() => (ready = true));
		return () => lab?.dispose();
	});
</script>

<svelte:head><title>Forest Drift · Mini Builds</title></svelte:head>

{#if enabled}
	<main class:inspect data-testid="mini-build-lab" data-ready={ready}>
		<div class="viewport" bind:this={viewport}></div>
		{#if !inspect}
			<aside>
				<h1>Stock Mini Builds</h1>
				<div class="views">
					{#each views as option (option)}
						<button class:active={view === option} onclick={() => show(focused, option)}
							>{option}</button
						>
					{/each}
				</div>
				<label
					><input
						type="checkbox"
						bind:checked={procedural}
						onchange={() => lab?.setProcedural(procedural)}
					/> Procedural materials</label
				>
				<button class="all" class:active={focused === null} onclick={() => show(null)}
					>All designs</button
				>
				<ul>
					{#each rows as row (row.definition.id)}
						<li>
							<button
								class:active={focused === row.definition.id ||
									`default-${focused}` === row.definition.id}
								onclick={() => show(row.definition.id)}
							>
								<strong>{row.definition.name}</strong>
								<span
									>{row.cuboids} cuboids · {row.cylinders} cyl · {row.spheres} sph · {row.definition
										.materials.length} slots</span
								>
								<span class:flat={row.textures.includes('flat')}
									>{row.textures.map((id) => miniBuildTextureLabel(id)).join(', ')}</span
								>
							</button>
						</li>
					{/each}
				</ul>
			</aside>
		{/if}
	</main>
{:else}
	<p class="note">The Mini Build lab is a development tool. Add <code>?dev</code> to open it.</p>
{/if}

<style>
	main {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-columns: 1fr 300px;
		font-family: system-ui, sans-serif;
		background: #1c2124;
		color: #e8e4dc;
	}
	main.inspect {
		grid-template-columns: 1fr;
	}
	.viewport {
		min-width: 0;
		min-height: 0;
	}
	.viewport :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}
	aside {
		overflow-y: auto;
		padding: 12px;
		border-left: 1px solid #333b3f;
		font-size: 12px;
	}
	h1 {
		margin: 0 0 8px;
		font-size: 15px;
	}
	.views {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 8px;
	}
	button {
		font: inherit;
		color: inherit;
		background: #2a3236;
		border: 1px solid #3b4549;
		border-radius: 6px;
		padding: 4px 8px;
		cursor: pointer;
		text-align: left;
	}
	button.active {
		border-color: #d9a75b;
		background: #3a3328;
	}
	.all {
		width: 100%;
		margin: 8px 0;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	li button {
		width: 100%;
		display: grid;
		gap: 2px;
	}
	li span {
		color: #a7b0aa;
	}
	li span.flat {
		color: #ff8a6a;
	}
	.note {
		padding: 2rem;
		font-family: system-ui, sans-serif;
	}
</style>
