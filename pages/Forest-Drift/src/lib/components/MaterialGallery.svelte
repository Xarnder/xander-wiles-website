<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		MaterialGalleryScene,
		type GalleryMaps,
		type GallerySample
	} from '$lib/game/materials/gallery/MaterialGalleryScene';
	import { createMaterialMapSource } from '$lib/game/materials/MaterialMapSource';
	import { MATERIAL_PALETTES } from '$lib/game/materials/materialPalettes';
	import { MATERIAL_PRESETS, resolveMaterialRecipe } from '$lib/game/materials/materialPresets';
	import {
		MATERIAL_QUALITIES,
		PROCEDURAL_MATERIAL_TYPES,
		PROCEDURAL_VARIANTS,
		type MaterialPaletteId,
		type MaterialQuality,
		type ProceduralMaterialType
	} from '$lib/game/materials/ProceduralMaterialTypes';

	/**
	 * Development material gallery: inspect every procedural material on its own, on real-world-sized
	 * sample geometry, with live controls and the raw maps it generated. Not part of the game UI.
	 */

	let viewport: HTMLDivElement;
	let gallery: MaterialGalleryScene | null = null;

	let type = $state<ProceduralMaterialType>('plaster');
	let variant = $state<string>(MATERIAL_PRESETS.plaster.variant);
	let seed = $state('gallery-1');
	let scale = $state(1);
	let roughness = $state(MATERIAL_PRESETS.plaster.roughness);
	let weathering = $state(MATERIAL_PRESETS.plaster.weathering);
	let dirt = $state(MATERIAL_PRESETS.plaster.dirt);
	let moss = $state(MATERIAL_PRESETS.plaster.moss);
	let variation = $state(MATERIAL_PRESETS.plaster.variation);
	let planks = $state(false);
	let quality = $state<MaterialQuality>('medium');
	let palette = $state<MaterialPaletteId>('alpine');
	let sample = $state<GallerySample>('wall');

	let status = $state('Generating…');
	let maps = $state<GalleryMaps | null>(null);
	let swatches = $state<{ type: ProceduralMaterialType; variant: string; url: string }[]>([]);

	let albedoCanvas = $state<HTMLCanvasElement>();
	let normalCanvas = $state<HTMLCanvasElement>();
	let roughnessCanvas = $state<HTMLCanvasElement>();
	let aoCanvas = $state<HTMLCanvasElement>();

	const variants = $derived(PROCEDURAL_VARIANTS[type] as readonly string[]);

	function selectType(next: ProceduralMaterialType, nextVariant?: string): void {
		type = next;
		const preset = MATERIAL_PRESETS[next];
		variant = nextVariant ?? preset.variant;
		roughness = preset.roughness;
		weathering = preset.weathering;
		dirt = preset.dirt;
		moss = preset.moss;
		variation = preset.variation;
		planks = false;
		if (next === 'slate') sample = 'roof';
		else if (next === 'paving' || next === 'grass' || next === 'ground') sample = 'floor';
		else if (next === 'timber') sample = 'block';
		else sample = 'wall';
	}

	function newSeed(): void {
		seed = `gallery-${Math.floor(Math.random() * 1e6)}`;
	}

	/** Draws one channel set of an RGBA map into a canvas, V up (as it appears on a surface). */
	function draw(
		canvas: HTMLCanvasElement | undefined,
		image: { data: Uint8Array; size: number },
		channel: 'rgb' | 0 | 1
	): void {
		if (!canvas) return;
		canvas.width = image.size;
		canvas.height = image.size;
		const context = canvas.getContext('2d');
		if (!context) return;
		const out = context.createImageData(image.size, image.size);
		for (let y = 0; y < image.size; y++) {
			for (let x = 0; x < image.size; x++) {
				const source = ((image.size - 1 - y) * image.size + x) * 4;
				const target = (y * image.size + x) * 4;
				if (channel === 'rgb') {
					out.data[target] = image.data[source];
					out.data[target + 1] = image.data[source + 1];
					out.data[target + 2] = image.data[source + 2];
				} else {
					const v = image.data[source + channel];
					out.data[target] = v;
					out.data[target + 1] = v;
					out.data[target + 2] = v;
				}
				out.data[target + 3] = 255;
			}
		}
		context.putImageData(out, 0, 0);
	}

	let requestId = 0;
	async function refresh(): Promise<void> {
		if (!gallery) return;
		const id = ++requestId;
		status = 'Generating…';
		const result = await gallery.show({
			type,
			quality,
			palette,
			sample,
			options: {
				variant: variant as never,
				seed,
				scale,
				roughness,
				weathering,
				dirt,
				moss,
				variation,
				planks: type === 'timber' && planks
			}
		});
		if (id !== requestId || !result) return;
		maps = result;
		draw(albedoCanvas, result.albedo, 'rgb');
		draw(normalCanvas, result.normal, 'rgb');
		draw(roughnessCanvas, result.orm, 1);
		draw(aoCanvas, result.orm, 0);
		const stats = gallery.getStats();
		status = `${result.albedo.size}² · ${result.milliseconds.toFixed(0)} ms · ${(stats.gpuBytes / 1048576).toFixed(1)} MB GPU in ${stats.textureSets} set(s)`;
	}

	$effect(() => {
		// Track every control; any change regenerates (cached recipes are instant).
		void [
			type,
			variant,
			seed,
			scale,
			roughness,
			weathering,
			dirt,
			moss,
			variation,
			planks,
			quality,
			palette,
			sample
		];
		void refresh();
	});

	async function buildSwatches(): Promise<void> {
		const source = createMaterialMapSource();
		const results: typeof swatches = [];
		for (const swatchType of PROCEDURAL_MATERIAL_TYPES) {
			for (const swatchVariant of PROCEDURAL_VARIANTS[swatchType] as readonly string[]) {
				const recipe = resolveMaterialRecipe(swatchType, {
					variant: swatchVariant as never,
					quality: 'low'
				});
				const data = await source.generate(recipe);
				const canvas = document.createElement('canvas');
				draw(canvas, { data: data.albedo, size: data.size }, 'rgb');
				results.push({ type: swatchType, variant: swatchVariant, url: canvas.toDataURL() });
				swatches = [...results];
			}
		}
		source.dispose();
	}

	onMount(() => {
		gallery = new MaterialGalleryScene(viewport);
		void refresh();
		void buildSwatches();
	});

	onDestroy(() => gallery?.dispose());
</script>

<div class="gallery" data-testid="material-gallery">
	<aside class="controls">
		<h1>Procedural materials</h1>
		<label
			>Material
			<select
				value={type}
				onchange={(e) => selectType(e.currentTarget.value as ProceduralMaterialType)}
				data-testid="gallery-type"
			>
				{#each PROCEDURAL_MATERIAL_TYPES as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
		</label>
		<label
			>Variant
			<select bind:value={variant} data-testid="gallery-variant">
				{#each variants as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
		</label>
		{#if type === 'timber'}
			<label class="inline"><input type="checkbox" bind:checked={planks} /> Planks</label>
		{/if}
		<label
			>Seed
			<span class="row">
				<input type="text" bind:value={seed} data-testid="gallery-seed" />
				<button type="button" onclick={newSeed} data-testid="gallery-new-seed">New</button>
			</span>
		</label>
		{#each [['Scale', 0.25, 4, 0.05], ['Roughness', 0, 1, 0.01], ['Weathering', 0, 1, 0.01], ['Dirt', 0, 1, 0.01], ['Moss', 0, 1, 0.01], ['Variation', 0, 1, 0.01]] as const as [label, min, max, step] (label)}
			<label
				>{label}
				{#if label === 'Scale'}
					<input type="range" {min} {max} {step} bind:value={scale} />
					<output>{scale.toFixed(2)}</output>
				{:else if label === 'Roughness'}
					<input type="range" {min} {max} {step} bind:value={roughness} />
					<output>{roughness.toFixed(2)}</output>
				{:else if label === 'Weathering'}
					<input type="range" {min} {max} {step} bind:value={weathering} />
					<output>{weathering.toFixed(2)}</output>
				{:else if label === 'Dirt'}
					<input type="range" {min} {max} {step} bind:value={dirt} />
					<output>{dirt.toFixed(2)}</output>
				{:else if label === 'Moss'}
					<input type="range" {min} {max} {step} bind:value={moss} />
					<output>{moss.toFixed(2)}</output>
				{:else}
					<input type="range" {min} {max} {step} bind:value={variation} />
					<output>{variation.toFixed(2)}</output>
				{/if}
			</label>
		{/each}
		<label
			>Quality
			<select bind:value={quality}>
				{#each MATERIAL_QUALITIES as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
		</label>
		<label
			>Palette
			<select bind:value={palette}>
				{#each Object.values(MATERIAL_PALETTES) as option (option.id)}
					<option value={option.id}>{option.label}</option>
				{/each}
			</select>
		</label>
		<label
			>Sample
			<select bind:value={sample}>
				<option value="wall">Wall panel (3 × 2 m)</option>
				<option value="block">Beam / block</option>
				<option value="roof">Roof slope</option>
				<option value="floor">Floor (3 × 3 m)</option>
				<option value="sphere">Sphere</option>
			</select>
		</label>
		<p class="status" data-testid="gallery-status">{status}</p>
		{#if maps}
			<p class="key" title={maps.key}>Seed: {seed}</p>
		{/if}
	</aside>

	<main>
		<div class="viewport" bind:this={viewport}></div>
		<section class="maps">
			<figure>
				<canvas bind:this={albedoCanvas}></canvas>
				<figcaption>Albedo</figcaption>
			</figure>
			<figure>
				<canvas bind:this={normalCanvas}></canvas>
				<figcaption>Normal</figcaption>
			</figure>
			<figure>
				<canvas bind:this={roughnessCanvas}></canvas>
				<figcaption>Roughness</figcaption>
			</figure>
			<figure>
				<canvas bind:this={aoCanvas}></canvas>
				<figcaption>Ambient occlusion</figcaption>
			</figure>
		</section>
		<section class="swatches" aria-label="All materials">
			{#each swatches as swatch (`${swatch.type}:${swatch.variant}`)}
				<button
					type="button"
					class:active={swatch.type === type && swatch.variant === variant}
					onclick={() => selectType(swatch.type, swatch.variant)}
				>
					<img src={swatch.url} alt="" />
					<span>{swatch.type}<br />{swatch.variant}</span>
				</button>
			{/each}
		</section>
	</main>
</div>

<style>
	.gallery {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-columns: 17rem 1fr;
		background: #161b1d;
		color: #e6ece8;
		font-size: 0.85rem;
	}

	.controls {
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		border-right: 1px solid #2c3538;
	}

	h1 {
		margin: 0 0 0.4rem;
		font-size: 1.05rem;
	}

	label {
		display: grid;
		gap: 0.25rem;
	}

	label.inline {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.row {
		display: flex;
		gap: 0.4rem;
	}

	.row input {
		flex: 1;
		min-width: 0;
	}

	select,
	input[type='text'],
	button {
		font: inherit;
		color: inherit;
		background: #232b2e;
		border: 1px solid #3a4549;
		border-radius: 6px;
		padding: 0.3rem 0.5rem;
	}

	button {
		cursor: pointer;
	}

	output {
		justify-self: end;
		margin-top: -1.35rem;
		opacity: 0.7;
	}

	.status,
	.key {
		margin: 0;
		opacity: 0.75;
		font-variant-numeric: tabular-nums;
	}

	main {
		display: grid;
		grid-template-rows: 1fr auto auto;
		min-width: 0;
		min-height: 0;
	}

	.viewport {
		min-height: 0;
		position: relative;
	}

	.viewport :global(canvas) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.maps {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
		padding: 0.5rem;
		border-top: 1px solid #2c3538;
	}

	figure {
		margin: 0;
		display: grid;
		gap: 0.2rem;
	}

	figure canvas {
		width: 100%;
		aspect-ratio: 1;
		max-height: 9rem;
		object-fit: contain;
		image-rendering: auto;
		background: #000;
	}

	figcaption {
		text-align: center;
		opacity: 0.7;
	}

	.swatches {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
		padding: 0.5rem;
		border-top: 1px solid #2c3538;
	}

	.swatches button {
		flex: 0 0 auto;
		display: grid;
		gap: 0.2rem;
		padding: 0.25rem;
		font-size: 0.7rem;
		line-height: 1.1;
		text-align: center;
	}

	.swatches button.active {
		border-color: #9fd18b;
	}

	.swatches img {
		width: 4.5rem;
		height: 4.5rem;
		display: block;
		border-radius: 4px;
	}

	@media (max-width: 760px) {
		.gallery {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
			overflow-y: auto;
		}

		.controls {
			border-right: none;
			border-bottom: 1px solid #2c3538;
		}

		main {
			min-height: 80vh;
		}

		.maps {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
