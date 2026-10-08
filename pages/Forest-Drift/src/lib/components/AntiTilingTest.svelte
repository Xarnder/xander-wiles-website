<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		ANTI_TILING_VIEWS,
		AntiTilingTestScene,
		type AntiTilingView
	} from '$lib/game/materials/gallery/AntiTilingTestScene';
	import {
		MATERIAL_QUALITIES,
		type MaterialQuality
	} from '$lib/game/materials/ProceduralMaterialTypes';

	/**
	 * Fixed-camera comparison of repeated texture tiles vs world-scale non-repeating surfaces on a long
	 * wall, a large courtyard and a broad field. URL: `?view=<view>&tiling=legacy&quality=high`.
	 * `window.__antiTiling` lets automated screenshot tests drive it.
	 */
	const params = new URLSearchParams(location.search);
	let viewport: HTMLDivElement;
	let scene: AntiTilingTestScene | null = null;
	let view = $state<AntiTilingView>((params.get('view') as AntiTilingView) ?? 'wall-wide');
	let antiTiling = $state(params.get('tiling') !== 'legacy');
	let quality = $state<MaterialQuality>((params.get('quality') as MaterialQuality) ?? 'high');
	let ready = $state(false);

	async function refresh(): Promise<void> {
		if (!scene) return;
		ready = false;
		scene.setView(view);
		scene.setAntiTiling(antiTiling);
		scene.setQuality(quality);
		await scene.ready();
		ready = true;
	}

	$effect(() => {
		void [view, antiTiling, quality];
		void refresh();
	});

	onMount(() => {
		scene = new AntiTilingTestScene(viewport, { antiTiling, quality });
		(window as unknown as { __antiTiling: unknown }).__antiTiling = {
			setView: (next: AntiTilingView) => (view = next),
			setAntiTiling: (next: boolean) => (antiTiling = next),
			setQuality: (next: MaterialQuality) => (quality = next),
			ready: () => scene?.ready()
		};
		void refresh();
	});

	onDestroy(() => {
		delete (window as unknown as { __antiTiling?: unknown }).__antiTiling;
		scene?.dispose();
	});
</script>

<div class="test" data-testid="anti-tiling-test" data-ready={ready}>
	<div class="viewport" bind:this={viewport}></div>
	<nav class="bar">
		{#each ANTI_TILING_VIEWS as option (option)}
			<button type="button" class:active={view === option} onclick={() => (view = option)}>
				{option}
			</button>
		{/each}
		<button
			type="button"
			class="toggle"
			class:active={!antiTiling}
			onclick={() => (antiTiling = !antiTiling)}
			data-testid="anti-tiling-toggle"
		>
			{antiTiling ? 'New: world-scale' : 'Old: tiled textures'}
		</button>
		<select bind:value={quality}>
			{#each MATERIAL_QUALITIES as option (option)}
				<option value={option}>{option}</option>
			{/each}
		</select>
	</nav>
</div>

<style>
	.test {
		position: fixed;
		inset: 0;
		background: #111;
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
		left: 50%;
		bottom: 1rem;
		transform: translateX(-50%);
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem;
		max-width: calc(100vw - 2rem);
		padding: 0.5rem;
		border-radius: 10px;
		background: rgba(12, 18, 16, 0.8);
		font:
			0.8rem system-ui,
			sans-serif;
	}

	button,
	select {
		font: inherit;
		color: #e6ece8;
		background: #232b2e;
		border: 1px solid #3a4549;
		border-radius: 6px;
		padding: 0.3rem 0.55rem;
		cursor: pointer;
	}

	button.active {
		border-color: #9fd18b;
	}

	.toggle.active {
		border-color: #e0a85a;
	}
</style>
