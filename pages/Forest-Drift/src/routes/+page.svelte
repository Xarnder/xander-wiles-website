<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import titleMark from '$lib/assets/forest-drift-title.svg';
	import Hotbar from '$lib/components/Hotbar.svelte';
	import type { BuildUiState, HotbarUiState } from '$lib/game/building/FoundationTypes';
	import { createDefaultBuildingSettings } from '$lib/game/building/FoundationTypes';
	import { ThreeScene, type SceneStats } from '$lib/game/ThreeScene';
	import { createDefaultSkySettings } from '$lib/game/sky/SkyTypes';
	import { createDefaultTerrainSettings } from '$lib/game/terrain/TerrainSettings';
	import { createDefaultVegetationSettings } from '$lib/game/vegetation/VegetationTypes';

	let container = $state<HTMLDivElement | undefined>(undefined);
	let pointerLocked = $state(false);
	let stats = $state<SceneStats | null>(null);
	let hotbar = $state<HotbarUiState | null>(null);
	let buildHud = $state<BuildUiState | null>(null);

	let scene: ThreeScene | undefined;

	onMount(() => {
		if (!container) return;

		const settings = createDefaultTerrainSettings();
		const buildingSettings = createDefaultBuildingSettings();
		const vegetationSettings = createDefaultVegetationSettings();
		const skySettings = createDefaultSkySettings();
		scene = new ThreeScene({
			container,
			settings,
			buildingSettings,
			vegetationSettings,
			skySettings,
			onStatsUpdate: (next) => {
				stats = next;
			},
			onPointerLockChange: (locked) => {
				pointerLocked = locked;
			},
			onHotbarChange: (next) => {
				hotbar = next;
			},
			onBuildHudChange: (next) => {
				buildHud = next;
			}
		});
	});

	onDestroy(() => {
		scene?.dispose();
	});
</script>

<div class="game-shell">
	<div class="canvas-container" data-testid="canvas-container" bind:this={container}></div>

	<div
		class="crosshair"
		class:valid={buildHud?.crosshair === 'valid'}
		class:invalid={buildHud?.crosshair === 'invalid'}
	></div>

	{#if !pointerLocked}
		<div class="instructions" class:fading={pointerLocked}>
			<img class="title-mark" src={titleMark} alt="Forest Drift" width="614" height="350" />
			<p class="headline">Click to explore</p>
			<p>WASD to move &middot; Shift to run &middot; Mouse to look &middot; Esc to release mouse</p>
		</div>
	{/if}

	{#if buildHud}
		<div class="build-hud" data-testid="build-hud">
			{#each buildHud.hintLines as line, index (index)}
				{#if line === ''}
					<div class="build-hud-spacer"></div>
				{:else}
					<div>{line}</div>
				{/if}
			{/each}
		</div>
	{/if}

	{#if stats}
		<div class="stats-overlay" data-testid="stats-overlay">
			<div>{stats.fps} FPS</div>
			<div>
				Pos {stats.playerX.toFixed(1)}, {stats.playerY.toFixed(1)}, {stats.playerZ.toFixed(1)}
			</div>
			<div>Chunk {stats.chunkX}, {stats.chunkZ}</div>
			<div data-testid="loaded-chunks">
				Loaded {stats.loadedChunks} &middot; Queued {stats.queuedChunks}
			</div>
			<div>Terrain rev {stats.revision}</div>
			<div>Triangles {stats.triangles.toLocaleString()}</div>
			<div>
				Trees {stats.loadedVegetationChunks}/{stats.queuedVegetationChunks} chunks &middot; {stats.treeInstances.toLocaleString()}
				trees
			</div>
			<div>Vegetation rev {stats.vegetationRevision}</div>
		</div>
	{/if}

	{#if hotbar}
		<Hotbar
			slots={hotbar.slots}
			activeSlot={hotbar.activeSlot}
			onSelectSlot={(slot) => scene?.selectHotbarSlot(slot)}
		/>
	{/if}
</div>

<style>
	.game-shell {
		position: fixed;
		inset: 0;
		overflow: hidden;
	}

	.canvas-container {
		position: absolute;
		inset: 0;
	}

	.canvas-container :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
		outline: none;
	}

	.crosshair {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 8px;
		height: 8px;
		transform: translate(-50%, -50%);
		border: 1.5px solid rgba(255, 255, 255, 0.85);
		border-radius: 50%;
		pointer-events: none;
		box-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
	}

	.crosshair.valid {
		border-color: #39d353;
		background: rgba(57, 211, 83, 0.25);
	}

	.crosshair.invalid {
		border-color: #ff4d4d;
		background: rgba(255, 77, 77, 0.25);
	}

	.instructions {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		color: #ffffff;
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.65);
		pointer-events: none;
		transition: opacity 0.3s ease;
	}

	.instructions.fading {
		opacity: 0;
	}

	.title-mark {
		display: block;
		width: min(22rem, 72vw);
		height: auto;
		margin: 0 auto 0.85rem;
		filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.35))
			drop-shadow(0 4px 16px rgba(0, 0, 0, 0.55));
		pointer-events: none;
	}

	.instructions .headline {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 0.4rem;
	}

	.instructions p {
		margin: 0.2rem 0;
	}

	.stats-overlay {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: rgba(10, 20, 15, 0.5);
		color: #eaf6ff;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.75rem;
		line-height: 1.5;
		border-radius: 8px;
		pointer-events: none;
		backdrop-filter: blur(2px);
	}

	.build-hud {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		padding: 0.6rem 0.85rem;
		background: rgba(10, 20, 15, 0.5);
		color: #eaf6ff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 0.8rem;
		font-weight: 600;
		line-height: 1.5;
		border-radius: 8px;
		pointer-events: none;
		backdrop-filter: blur(2px);
		min-width: 11rem;
		text-align: left;
	}

	.build-hud-spacer {
		height: 0.35rem;
	}
</style>
