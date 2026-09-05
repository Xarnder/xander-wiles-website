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
	let showHelp = $state(false);

	let scene: ThreeScene | undefined;

	const SNAP_MODE_TEXT: Record<'axis' | 'axis-inline' | 'wall-corners', string> = {
		axis: 'AXIS SNAP',
		'axis-inline': 'AXIS + INLINE SNAP',
		'wall-corners': 'WALL CORNER SNAP'
	};

	function handleHelpKey(event: KeyboardEvent) {
		if (event.code === 'KeyH') showHelp = !showHelp;
		else if (event.code === 'Escape' && showHelp) showHelp = false;
	}

	onMount(() => {
		window.addEventListener('keydown', handleHelpKey);

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
		window.removeEventListener('keydown', handleHelpKey);
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

	{#if buildHud?.snapMode === 'axis' || buildHud?.snapMode === 'axis-inline' || buildHud?.snapMode === 'wall-corners'}
		<div
			class="snap-badge"
			class:snap-badge-inline={buildHud.snapMode === 'axis-inline'}
			class:snap-badge-corners={buildHud.snapMode === 'wall-corners'}
			data-testid="snap-badge"
		>
			{SNAP_MODE_TEXT[buildHud.snapMode]}
		</div>
	{/if}

	{#if !pointerLocked}
		<div class="instructions" class:fading={pointerLocked}>
			<img class="title-mark" src={titleMark} alt="Forest Drift" width="614" height="350" />
			<p class="headline">Click to explore</p>
			<p>WASD to move &middot; Shift to run &middot; Mouse to look &middot; Esc to release mouse</p>
			<p>Press H for controls</p>
		</div>
	{/if}

	<button
		class="help-toggle"
		data-testid="help-toggle"
		onclick={() => (showHelp = !showHelp)}
		aria-label="Toggle controls help"
	>
		? Help (H)
	</button>

	{#if showHelp}
		<div class="help-overlay" data-testid="help-overlay">
			<div class="help-panel">
				<h2>Controls</h2>

				<h3>Movement</h3>
				<dl>
					<dt>WASD</dt>
					<dd>Move</dd>
					<dt>Shift</dt>
					<dd>Run</dd>
					<dt>Space</dt>
					<dd>Jump</dd>
					<dt>Mouse</dt>
					<dd>Look around</dd>
					<dt>Esc</dt>
					<dd>Release mouse / cancel current placement</dd>
				</dl>

				<h3>Building — general</h3>
				<dl>
					<dt>1&ndash;9</dt>
					<dd>Select hotbar tool</dd>
					<dt>Left click</dt>
					<dd>Place / confirm</dd>
					<dt>Right click</dt>
					<dd>Cancel / deselect</dd>
					<dt>Page Up / Page Down</dt>
					<dd>Change current building level</dd>
					<dt>C</dt>
					<dd>
						Cycle draw-snap mode (Off &rarr; Axis &rarr; Axis + Inline &rarr; Wall Corners) — Wall,
						Continuous Wall, Ceiling, Floor, Roof. Wall Corners (Ceiling/Floor/Roof only) snaps to
						the room's wall corners below
					</dd>
				</dl>

				<h3>Continuous Wall / Ceiling / Floor / Roof</h3>
				<dl>
					<dt>Backspace</dt>
					<dd>Undo last point</dd>
					<dt>Enter</dt>
					<dd>Finish an open wall path (Continuous Wall only)</dd>
					<dt>Click first point again</dt>
					<dd>Close the loop / shape</dd>
				</dl>

				<h3>Stairs</h3>
				<dl>
					<dt>Left / Right Arrow</dt>
					<dd>Change stair direction</dd>
					<dt>Enter</dt>
					<dd>Confirm stairs</dd>
				</dl>

				<h3>Other</h3>
				<dl>
					<dt>H</dt>
					<dd>Toggle this help</dd>
				</dl>

				<button class="help-close" onclick={() => (showHelp = false)}>Close</button>
			</div>
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

	.snap-badge {
		position: absolute;
		top: calc(50% + 22px);
		left: 50%;
		transform: translateX(-50%);
		padding: 0.3rem 0.7rem;
		background: rgba(77, 166, 255, 0.9);
		color: #04121f;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		border-radius: 999px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
		pointer-events: none;
		white-space: nowrap;
		animation: snap-badge-in 0.15s ease;
	}

	.snap-badge-inline {
		background: rgba(57, 211, 83, 0.9);
	}

	.snap-badge-corners {
		background: rgba(255, 166, 77, 0.9);
	}

	@keyframes snap-badge-in {
		from {
			opacity: 0;
			transform: translateX(-50%) scale(0.85);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) scale(1);
		}
	}

	.help-toggle {
		position: absolute;
		bottom: 0.75rem;
		left: 0.75rem;
		z-index: 11;
		padding: 0.4rem 0.75rem;
		background: rgba(10, 20, 15, 0.5);
		color: #eaf6ff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 0.75rem;
		font-weight: 600;
		border: 1px solid rgba(234, 246, 255, 0.25);
		border-radius: 8px;
		backdrop-filter: blur(2px);
		cursor: pointer;
	}

	.help-toggle:hover {
		background: rgba(10, 20, 15, 0.75);
	}

	.help-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(4, 8, 6, 0.65);
		backdrop-filter: blur(3px);
		z-index: 10;
	}

	.help-panel {
		max-width: min(32rem, 90vw);
		max-height: 80vh;
		overflow-y: auto;
		padding: 1.5rem 1.75rem;
		background: rgba(14, 26, 20, 0.95);
		color: #eaf6ff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
	}

	.help-panel h2 {
		margin: 0 0 0.75rem;
		font-size: 1.3rem;
	}

	.help-panel h3 {
		margin: 1.1rem 0 0.4rem;
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #9fd8b8;
	}

	.help-panel dl {
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: 0.9rem;
		row-gap: 0.35rem;
		margin: 0;
		font-size: 0.85rem;
	}

	.help-panel dt {
		font-weight: 700;
		white-space: nowrap;
		color: #ffffff;
	}

	.help-panel dd {
		margin: 0;
		color: #cfe8dc;
	}

	.help-close {
		margin-top: 1.25rem;
		padding: 0.45rem 1rem;
		background: rgba(57, 211, 83, 0.85);
		color: #04120a;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-weight: 700;
		font-size: 0.85rem;
		border: none;
		border-radius: 8px;
		cursor: pointer;
	}

	.help-close:hover {
		background: rgba(57, 211, 83, 1);
	}
</style>
