<script lang="ts">
	import { dev } from '$app/environment';
	import { onDestroy } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { TreeLab, type TreeLabView } from '$lib/game/vegetation/trees/TreeLab';
	import { nominalTreeHeight, TREE_SPECIES } from '$lib/game/vegetation/trees/treeSpecies';
	import {
		buildTreeCards,
		buildTreeMesh,
		designTree
	} from '$lib/game/vegetation/trees/treePrototypeGenerator';
	import {
		TREE_SPECIES_IDS,
		triangleCount,
		type TreeSpeciesId
	} from '$lib/game/vegetation/trees/TreeSpeciesTypes';

	// Development tool: the Tree Lab — every species' prototypes, or one prototype at every LOD,
	// with and without foliage cards. Under `vite dev`, or with `?dev`. `?seed=` sets the world
	// seed, `?species=spruce,birch` picks rows, `?mode=lods`, `?cards=0`, `?inspect` hides the panel.
	const params = new URLSearchParams(location.search);
	const enabled = dev || params.has('dev');
	const inspect = params.has('inspect');
	const requested = (params.get('species') ?? '')
		.split(',')
		.filter((id): id is TreeSpeciesId => (TREE_SPECIES_IDS as readonly string[]).includes(id));
	let worldSeed = $state(params.get('seed') ?? 'tree-lab');
	let mode = $state<TreeLabView['mode']>(params.get('mode') === 'lods' ? 'lods' : 'variants');
	let cards = $state(params.get('cards') !== '0');
	let wind = $state(1);
	let selected = $state<TreeSpeciesId[]>(requested.length > 0 ? requested : [...TREE_SPECIES_IDS]);
	let lab: TreeLab | null = null;

	function refresh() {
		lab?.show({ species: selected, worldSeed, mode, cards });
		lab?.setWind(wind);
	}

	function toggle(id: TreeSpeciesId) {
		selected = selected.includes(id)
			? selected.filter((s) => s !== id)
			: TREE_SPECIES_IDS.filter((s) => s === id || selected.includes(s));
		refresh();
	}

	const attach: Attachment<HTMLCanvasElement> = (canvas) => {
		lab = new TreeLab(canvas);
		refresh();
		(window as unknown as { __treeLab?: TreeLab }).__treeLab = lab;
		return () => {
			lab?.dispose();
			lab = null;
		};
	};
	onDestroy(() => lab?.dispose());

	function summary(id: TreeSpeciesId) {
		const species = TREE_SPECIES[id];
		const design = designTree(species, 0, worldSeed);
		const lods = ([0, 1, 2, 3] as const).map((lod) =>
			triangleCount(buildTreeMesh(species, design, lod))
		);
		const card0 = buildTreeCards(species, design, 0)?.cards ?? 0;
		const card1 = buildTreeCards(species, design, 1)?.cards ?? 0;
		return `${nominalTreeHeight(species).toFixed(0)} m · ${lods.join(' / ')} tris · ${card0} / ${card1} cards`;
	}
</script>

<svelte:head><title>Forest Drift · Tree Lab</title></svelte:head>

{#if enabled}
	<div class="lab" class:inspect data-testid="tree-lab">
		<div class="view"><canvas {@attach attach}></canvas></div>
		{#if !inspect}
			<aside>
				<h1>Tree Lab</h1>
				<label>World seed <input bind:value={worldSeed} onchange={refresh} /></label>
				<div class="buttons">
					<button class:on={mode === 'variants'} onclick={() => ((mode = 'variants'), refresh())}
						>Prototypes</button
					>
					<button class:on={mode === 'lods'} onclick={() => ((mode = 'lods'), refresh())}
						>LOD0 → LOD3</button
					>
					<button class:on={cards} onclick={() => ((cards = !cards), refresh())}
						>Foliage cards {cards ? 'on' : 'off'}</button
					>
				</div>
				<label
					>Wind <input
						type="range"
						min="0"
						max="3"
						step="0.1"
						bind:value={wind}
						oninput={() => lab?.setWind(wind)}
					/></label
				>
				<ol>
					{#each TREE_SPECIES_IDS as id, row (id)}
						<li>
							<div class="row">
								<input
									type="checkbox"
									checked={selected.includes(id)}
									onchange={() => toggle(id)}
								/>
								<button
									class="link"
									onclick={() => lab?.focus(selected.indexOf(id), selected.length)}
									disabled={!selected.includes(id)}
									><strong>{TREE_SPECIES[id].label}</strong></button
								>
								<small>{row}</small>
							</div>
							<small>{summary(id)}</small>
						</li>
					{/each}
				</ol>
			</aside>
		{/if}
	</div>
{:else}
	<p class="note">The Tree Lab is a development tool. Add <code>?dev</code> to open it.</p>
{/if}

<style>
	.lab {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-columns: 1fr 340px;
		background: #1d2125;
		color: #e6edf3;
		font:
			13px/1.4 system-ui,
			sans-serif;
	}
	.lab.inspect {
		grid-template-columns: 1fr;
	}
	.view {
		position: relative;
		min-height: 0;
	}
	canvas {
		width: 100%;
		height: 100%;
		display: block;
	}
	aside {
		overflow: auto;
		padding: 12px 14px;
		border-left: 1px solid #30363d;
	}
	h1 {
		font-size: 15px;
		margin: 0 0 8px;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 8px 0;
	}
	button,
	input {
		background: #2d333b;
		color: inherit;
		border: 1px solid #444c56;
		border-radius: 6px;
		padding: 4px 8px;
	}
	button.on {
		background: #1f6feb;
		border-color: #1f6feb;
	}
	button.link {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
	}
	ol {
		list-style: none;
		padding-left: 0;
	}
	li {
		margin-bottom: 10px;
	}
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	small {
		color: #9da7b3;
	}
	.note {
		padding: 2rem;
		font-family: system-ui, sans-serif;
	}
	@media (max-width: 720px) {
		.lab {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr 40%;
		}
		aside {
			border-left: none;
			border-top: 1px solid #30363d;
		}
	}
</style>
