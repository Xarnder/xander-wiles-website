<script lang="ts">
	import { dev } from '$app/environment';
	import { onDestroy } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { PlantLab } from '$lib/game/vegetation/plants/PlantLab';
	import { generatePlantSpecies } from '$lib/game/vegetation/plants/plantSpecies';
	import { PlantEcology } from '$lib/game/vegetation/plants/plantEcology';
	import type { PlantKind, PlantSpeciesDefinition } from '$lib/game/vegetation/plants/PlantTypes';
	import type { RgbColor } from '$lib/game/materials/ProceduralMaterialTypes';
	import { buildPlantPrototype } from '$lib/game/vegetation/plants/plantPrototype';

	// Development tool: the Plant Lab — generated species, their prototype banks and far cards.
	// Under `vite dev`, or with `?dev`. `?seed=N` fixes the first seed; `?inspect` hides the panel.
	const params = new URLSearchParams(location.search);
	const enabled = dev || params.has('dev');
	const inspect = params.has('inspect');
	let seed = $state(Number(params.get('seed') ?? 1) || 1);
	let species = $state<PlantSpeciesDefinition[]>([]);
	let lab: PlantLab | null = null;

	function generate(kind: PlantKind | 'mixed', count = 8) {
		const list: PlantSpeciesDefinition[] = [];
		for (let i = 0; i < count; i++) {
			const k: PlantKind = kind === 'mixed' ? (i % 3 === 2 ? 'ground' : 'flower') : kind;
			list.push(generatePlantSpecies(Math.imul(seed + i, 2654435761) >>> 0, { kind: k }));
		}
		show(list);
	}

	function region() {
		const ecology = new PlantEcology({ seedHash: seed >>> 0, speciesScale: () => 1 });
		show([...ecology.regionSpecies(0, 0)]);
	}

	function show(list: PlantSpeciesDefinition[]) {
		species = list;
		lab?.showSpecies(list);
	}

	const attach: Attachment<HTMLCanvasElement> = (canvas) => {
		lab = new PlantLab(canvas);
		generate('mixed');
		return () => {
			lab?.dispose();
			lab = null;
		};
	};
	onDestroy(() => lab?.dispose());

	const css = (c: RgbColor) =>
		`rgb(${c.map((v) => Math.round(Math.pow(Math.min(1, v), 1 / 2.2) * 255)).join(',')})`;
	const triangles = (s: PlantSpeciesDefinition) =>
		Array.from({ length: s.prototypeCount }, (_, v) => buildPlantPrototype(s, v).triangles).join(
			' / '
		);
</script>

<svelte:head><title>Forest Drift · Plant Lab</title></svelte:head>

{#if enabled}
	<div class="lab" class:inspect data-testid="plant-lab">
		<div class="view"><canvas {@attach attach}></canvas></div>
		{#if !inspect}
			<aside>
				<h1>Plant Lab</h1>
				<label>Seed <input type="number" bind:value={seed} /></label>
				<div class="buttons">
					<button data-testid="plant-lab-flowers" onclick={() => generate('flower')}
						>Random flowers</button
					>
					<button data-testid="plant-lab-ground" onclick={() => generate('ground')}
						>Random ground plants</button
					>
					<button onclick={() => generate('mixed')}>Mixed</button>
					<button onclick={region}>Region set</button>
					<button onclick={() => ((seed += 8), generate('mixed'))}>Next ›</button>
				</div>
				<ol>
					{#each species as s (s.id)}
						<li>
							<div class="row">
								<strong>{s.family}</strong>
								<span class="rarity {s.growth.rarity}">{s.growth.rarity}</span>
							</div>
							<div>{s.signature}</div>
							<div class="swatches">
								{#each [s.palette.petalBase, s.palette.petalTip, s.palette.centre, s.palette.leafBase, s.palette.leafTip, s.palette.stem] as c, i (i)}
									<span style:background={css(c)}></span>
								{/each}
								<small>{s.palette.family}</small>
							</div>
							<small>
								{s.prototypeCount} prototypes · {triangles(s)} tris · {s.growth.spacing} spacing · colony
								{s.growth.colonyScale.toFixed(0)} m · seed {s.seed}
							</small>
						</li>
					{/each}
				</ol>
			</aside>
		{/if}
	</div>
{:else}
	<p class="note">The Plant Lab is a development tool. Add <code>?dev</code> to open it.</p>
{/if}

<style>
	.lab {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-columns: 1fr 360px;
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
	input {
		width: 120px;
	}
	ol {
		padding-left: 18px;
	}
	li {
		margin-bottom: 10px;
	}
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.rarity {
		font-size: 11px;
		padding: 0 6px;
		border-radius: 8px;
		background: #30363d;
	}
	.rarity.rare {
		background: #6e40c9;
	}
	.rarity.uncommon {
		background: #1f6feb;
	}
	.swatches {
		display: flex;
		gap: 3px;
		align-items: center;
		margin: 3px 0;
	}
	.swatches span {
		width: 16px;
		height: 16px;
		border-radius: 3px;
		border: 1px solid #0006;
	}
	small {
		color: #9da7b3;
	}
	.note {
		padding: 2rem;
		font-family: system-ui, sans-serif;
	}
</style>
