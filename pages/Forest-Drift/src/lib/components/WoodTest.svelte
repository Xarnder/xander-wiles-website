<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		WOOD_TEST_VIEWS,
		WoodTestScene,
		type WoodTestView
	} from '$lib/game/materials/gallery/WoodTestScene';
	import {
		MATERIAL_QUALITIES,
		type MaterialQuality
	} from '$lib/game/materials/ProceduralMaterialTypes';

	/**
	 * Solid procedural wood test page: the three.js TSL wood example recreated with our GLSL port
	 * (`?view=boards`), and the game's framing and floor-detail wood (`?view=frame`).
	 * `window.__woodTest` lets automated screenshots drive it.
	 */
	const params = new URLSearchParams(location.search);
	let viewport: HTMLDivElement;
	let scene: WoodTestScene | null = null;
	let view = $state<WoodTestView>((params.get('view') as WoodTestView) ?? 'boards');
	let quality = $state<MaterialQuality>((params.get('quality') as MaterialQuality) ?? 'high');

	$effect(() => {
		scene?.setView(view);
	});
	$effect(() => {
		scene?.setQuality(quality);
	});

	onMount(() => {
		scene = new WoodTestScene(viewport, { quality });
		scene.setView(view);
		(window as unknown as { __woodTest: unknown }).__woodTest = {
			setView: (next: WoodTestView) => (view = next),
			setQuality: (next: MaterialQuality) => (quality = next)
		};
	});

	onDestroy(() => {
		delete (window as unknown as { __woodTest?: unknown }).__woodTest;
		scene?.dispose();
	});
</script>

<div class="test" data-testid="wood-test">
	<div class="viewport" bind:this={viewport}></div>
	<nav class="bar">
		{#each WOOD_TEST_VIEWS as option (option)}
			<button class:active={view === option} onclick={() => (view = option)}>{option}</button>
		{/each}
		<span class="sep"></span>
		{#each MATERIAL_QUALITIES as option (option)}
			<button class:active={quality === option} onclick={() => (quality = option)}>{option}</button>
		{/each}
	</nav>
</div>

<style>
	.test {
		position: fixed;
		inset: 0;
		background: #30353a;
	}
	.viewport {
		position: absolute;
		inset: 0;
	}
	.viewport :global(canvas) {
		width: 100%;
		height: 100%;
		display: block;
	}
	.bar {
		position: absolute;
		left: 12px;
		top: 12px;
		display: flex;
		gap: 6px;
		align-items: center;
		font-family: system-ui, sans-serif;
	}
	.sep {
		width: 12px;
	}
	button {
		background: rgba(20, 22, 24, 0.75);
		color: #ddd;
		border: 1px solid #555;
		border-radius: 4px;
		padding: 4px 10px;
		cursor: pointer;
	}
	button.active {
		background: #c9a46a;
		color: #111;
	}
</style>
