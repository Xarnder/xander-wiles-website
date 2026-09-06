<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import titleMark from '$lib/assets/forest-drift-title.svg';
	import Hotbar from '$lib/components/Hotbar.svelte';
	import MaterialPalette from '$lib/components/MaterialPalette.svelte';
	import PauseMenu from '$lib/components/PauseMenu.svelte';
	import WorldsScreen from '$lib/components/WorldsScreen.svelte';
	import type { BuildUiState, HotbarUiState } from '$lib/game/building/FoundationTypes';
	import type { PaintUiState } from '$lib/game/building/PaintTool';
	import { graphicsQualityLabel } from '$lib/game/graphics/GraphicsTypes';
	import type { SceneStats } from '$lib/game/ThreeScene';
	import { createDefaultSkySettings } from '$lib/game/sky/SkyTypes';
	import { createDefaultTerrainSettings } from '$lib/game/terrain/TerrainSettings';
	import { createDefaultVegetationSettings } from '$lib/game/vegetation/VegetationTypes';
	import {
		IndexedDbWorldRepository,
		isIndexedDbAvailable,
		requestPersistentStorage
	} from '$lib/game/world/IndexedDbWorldRepository';
	import {
		createWorldPackage,
		downloadWorldPackage,
		worldFileName
	} from '$lib/game/world/WorldImportExport';
	import { WorldManager } from '$lib/game/world/WorldManager';
	import { InMemoryWorldRepository } from '$lib/game/world/WorldRepository';
	import { WorldSession } from '$lib/game/world/WorldSession';
	import type { SaveStatus, WorldMetadata } from '$lib/game/world/WorldTypes';

	let container = $state<HTMLDivElement | undefined>(undefined);
	let pointerLocked = $state(false);
	let stats = $state<SceneStats | null>(null);
	let hotbar = $state<HotbarUiState | null>(null);
	let buildHud = $state<BuildUiState | null>(null);
	let showHelp = $state(false);
	let paintPaletteOpen = $state(false);
	let paintState = $state<PaintUiState | null>(null);
	let graphicsNotice = $state<string | null>(null);

	/** Which top-level screen is showing. The game's Three.js scene only exists while this is `game`. */
	let screen = $state<'worlds' | 'loading' | 'game'>('worlds');
	let loadingLabel = $state('Loading world…');
	let worlds = $state<WorldMetadata[]>([]);
	let thumbnails = $state<Record<string, string>>({});
	let storage = $state<{ usage?: number; quota?: number }>({});
	let worldsBusy = $state(false);
	let worldsError = $state<string | null>(null);
	let currentWorldName = $state('');
	let currentWorldSeed = $state('');
	let saveStatus = $state<SaveStatus>('saved');
	let saveError = $state<string | null>(null);
	let paused = $state(false);
	let saveToast = $state<string | null>(null);

	let session: WorldSession | undefined;
	let worldManager: WorldManager | undefined;
	let graphicsNoticeTimeout: ReturnType<typeof setTimeout> | undefined;
	let saveToastTimeout: ReturnType<typeof setTimeout> | undefined;
	/** Object URLs created for thumbnail blobs, revoked when the list is rebuilt or the page unmounts. */
	let thumbnailUrls: string[] = [];

	const SNAP_MODE_TEXT: Record<'axis' | 'axis-inline' | 'wall-corners', string> = {
		axis: 'AXIS SNAP',
		'axis-inline': 'AXIS + INLINE SNAP',
		'wall-corners': 'WALL CORNER SNAP'
	};

	/** Game shortcuts must not fire while the player is typing — into a world-name field, the paint palette's colour input, or anything else focusable. */
	function isTypingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
		return target.isContentEditable;
	}

	function showGraphicsNotice(quality: Parameters<typeof graphicsQualityLabel>[0]) {
		graphicsNotice = `Graphics: ${graphicsQualityLabel(quality).toUpperCase()}`;
		clearTimeout(graphicsNoticeTimeout);
		graphicsNoticeTimeout = setTimeout(() => {
			graphicsNotice = null;
		}, 2000);
	}

	function showSaveToast(message: string) {
		saveToast = message;
		clearTimeout(saveToastTimeout);
		saveToastTimeout = setTimeout(() => {
			saveToast = null;
		}, 1800);
	}

	/**
	 * Opening the pause menu flushes any pending edits.
	 *
	 * It's the natural moment: the player has stopped building, and it means the menu's own save
	 * status is telling the truth about what's actually stored rather than about what's queued. The
	 * flush is fire-and-forget — the menu opens immediately either way, and a failure surfaces in the
	 * status indicator the menu is already showing.
	 */
	function togglePause() {
		paused = !paused;
		if (paused && session?.hasUnsavedChanges()) void session.saveNow('lifecycle');
	}

	function handleKeyDown(event: KeyboardEvent) {
		const typing = isTypingTarget(event.target);

		// Cmd/Ctrl+S is the desktop-editor convention for "save now", and must beat the browser's own
		// save-page action — but only while a world is actually open and the player isn't typing.
		if ((event.metaKey || event.ctrlKey) && event.code === 'KeyS') {
			if (screen === 'game' && !typing) {
				event.preventDefault();
				void manualSave();
			}
			return;
		}

		if (screen !== 'game' || typing) return;

		if (event.code === 'Escape') {
			// Escape while pointer-locked is consumed by the browser to release the pointer; the menu
			// opens on the next press, which is the moment the player can actually click it.
			if (showHelp) showHelp = false;
			else if (!pointerLocked) togglePause();
			return;
		}
		if (paused) return;

		if (event.code === 'KeyH') showHelp = !showHelp;
		else if (event.code === 'KeyL') session?.scene.cycleGraphicsQuality();
	}

	async function refreshWorlds() {
		if (!worldManager) return;
		const [list, estimate] = await Promise.all([
			worldManager.listWorlds(),
			worldManager.estimateStorage()
		]);
		worlds = list;
		storage = estimate;

		for (const url of thumbnailUrls) URL.revokeObjectURL(url);
		thumbnailUrls = [];
		const next: Record<string, string> = {};
		for (const world of list) {
			const blob = await worldManager.getThumbnail(world.id);
			if (!blob) continue;
			const url = URL.createObjectURL(blob);
			thumbnailUrls.push(url);
			next[world.id] = url;
		}
		thumbnails = next;
	}

	async function withBusy<T>(work: () => Promise<T>): Promise<T | undefined> {
		if (worldsBusy) return undefined;
		worldsBusy = true;
		try {
			return await work();
		} finally {
			worldsBusy = false;
		}
	}

	async function createWorld(name: string, seed: string) {
		await withBusy(async () => {
			const result = await worldManager!.createWorld({
				name,
				seed,
				// A fresh snapshot of today's defaults, stored *into* the world so it keeps this look
				// even after the application's own defaults change in a later release.
				environment: {
					terrain: createDefaultTerrainSettings(),
					vegetation: createDefaultVegetationSettings(),
					sky: createDefaultSkySettings()
				}
			});
			if (!result.ok) {
				worldsError = result.error;
				return;
			}
			// Only now that there is real world data worth protecting is persistent storage worth
			// asking for — prompting on first load, before anything exists to lose, is how you train
			// people to decline.
			void requestPersistentStorage();
			await refreshWorlds();
			await openWorld(result.value.id);
		});
	}

	async function openWorld(worldId: string) {
		if (!worldManager || screen !== 'worlds') return;
		screen = 'loading';
		loadingLabel = 'Loading world…';

		const opened = await worldManager.openWorld(worldId);
		if (!opened.ok) {
			worldsError = opened.error;
			screen = 'worlds';
			return;
		}

		loadingLabel = `Loading ${opened.value.name}…`;
		screen = 'game';
		// The canvas container only exists once the game screen has rendered.
		await tick();
		if (!container) {
			screen = 'worlds';
			worldsError = 'Unable to start the world renderer.';
			return;
		}

		currentWorldName = opened.value.name;
		currentWorldSeed = opened.value.seed;
		saveStatus = 'saved';
		saveError = null;
		paused = false;

		session = new WorldSession({
			container,
			world: opened.value,
			worldManager,
			onSaveStatusChange: (status, error) => {
				saveStatus = status;
				saveError = error;
			},
			onStatsUpdate: (next) => (stats = next),
			onPointerLockChange: (locked) => (pointerLocked = locked),
			onHotbarChange: (next) => (hotbar = next),
			onBuildHudChange: (next) => (buildHud = next),
			onPaintPaletteChange: (open) => (paintPaletteOpen = open),
			onPaintStateChange: (next) => (paintState = next),
			onGraphicsQualityChange: (quality) => showGraphicsNotice(quality)
		});
	}

	async function manualSave() {
		if (!session) return;
		const result = await session.saveNow('manual');
		showSaveToast(result.ok ? 'World Saved' : 'Unable to save world locally.');
		if (!result.ok) saveError = result.error ?? null;
		await refreshWorlds();
	}

	async function quitToWorlds() {
		if (!session) return;
		await withBusy(async () => {
			const result = await session!.dispose();
			session = undefined;
			if (!result.ok) worldsError = result.error ?? 'Unable to save world before quitting.';
			worldManager?.closeWorld();

			// Reset every piece of in-game UI state, so returning to a world later never inherits the
			// previous session's HUD.
			paused = false;
			showHelp = false;
			paintPaletteOpen = false;
			stats = null;
			hotbar = null;
			buildHud = null;
			paintState = null;
			pointerLocked = false;
			screen = 'worlds';
			await refreshWorlds();
		});
	}

	async function exportWorld(worldId: string) {
		await withBusy(async () => {
			// Flush first: exporting a world that's open must include the edits made a second ago.
			if (session && worldManager?.getCurrentWorldId() === worldId) await session.saveNow('manual');
			const result = await worldManager!.exportWorld(worldId);
			if (!result.ok) {
				worldsError = result.error;
				return;
			}
			const bytes = await createWorldPackage(result.value.world, result.value.thumbnail);
			downloadWorldPackage(bytes, worldFileName(result.value.world.name));
		});
	}

	async function importWorld(file: File) {
		await withBusy(async () => {
			try {
				const bytes = new Uint8Array(await file.arrayBuffer());
				const result = await worldManager!.importWorld(bytes);
				if (!result.ok) {
					worldsError = result.error;
					return;
				}
				await refreshWorlds();
			} catch (error) {
				worldsError = error instanceof Error ? error.message : 'Unable to read that file.';
			}
		});
	}

	async function renameWorld(worldId: string, name: string) {
		await withBusy(async () => {
			const result = await worldManager!.renameWorld(worldId, name);
			if (!result.ok) {
				worldsError = result.error;
				return;
			}
			if (worldManager!.getCurrentWorldId() === worldId) currentWorldName = result.value.name;
			await refreshWorlds();
		});
	}

	async function duplicateWorld(worldId: string) {
		await withBusy(async () => {
			if (session && worldManager?.getCurrentWorldId() === worldId) await session.saveNow('manual');
			const result = await worldManager!.duplicateWorld(worldId);
			if (!result.ok) worldsError = result.error;
			await refreshWorlds();
		});
	}

	async function deleteWorld(worldId: string) {
		await withBusy(async () => {
			const result = await worldManager!.deleteWorld(worldId);
			if (!result.ok) worldsError = result.error;
			await refreshWorlds();
		});
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeyDown);

		// IndexedDB is the real backend; the in-memory one keeps the game playable (for this session
		// only) in a browser that refuses storage, rather than failing to start.
		worldManager = new WorldManager(
			isIndexedDbAvailable() ? new IndexedDbWorldRepository() : new InMemoryWorldRepository()
		);
		if (!isIndexedDbAvailable()) {
			worldsError = 'Local storage is unavailable in this browser, so worlds cannot be saved.';
		}
		void refreshWorlds();
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeyDown);
		clearTimeout(graphicsNoticeTimeout);
		clearTimeout(saveToastTimeout);
		for (const url of thumbnailUrls) URL.revokeObjectURL(url);
		void session?.dispose();
	});
</script>

{#if screen === 'worlds'}
	<WorldsScreen
		{worlds}
		{thumbnails}
		{storage}
		busy={worldsBusy}
		error={worldsError}
		onPlay={(id) => void openWorld(id)}
		onCreate={(name, seed) => void createWorld(name, seed)}
		onRename={(id, name) => void renameWorld(id, name)}
		onDuplicate={(id) => void duplicateWorld(id)}
		onExport={(id) => void exportWorld(id)}
		onDelete={(id) => void deleteWorld(id)}
		onImport={(file) => void importWorld(file)}
		onDismissError={() => (worldsError = null)}
	/>
{/if}

{#if screen === 'loading'}
	<div class="loading-screen" data-testid="loading-screen">
		<img class="title-mark" src={titleMark} alt="Forest Drift" width="614" height="350" />
		<p class="loading-label">{loadingLabel}</p>
		<div class="loading-bar"><span></span></div>
	</div>
{/if}

{#if screen === 'game'}
	<!-- The renderer only exists while a world is open: quitting to the Worlds screen unmounts
	     this entirely, so no WebGL context, render loop or canvas is kept alive in the background. -->
	<div class="game-shell">
		<div class="canvas-container" data-testid="canvas-container" bind:this={container}></div>

		<div
			class="crosshair"
			class:valid={buildHud?.crosshair === 'valid'}
			class:invalid={buildHud?.crosshair === 'invalid'}
		></div>

		{#if buildHud?.level}
			<div class="floor-selector" data-testid="floor-selector">
				<button
					class="floor-arrow"
					data-testid="floor-up"
					disabled={!buildHud.level.canMoveUp}
					onclick={() => session?.scene.moveLevelUp()}
					aria-label="Move up one building level"
				>
					▲
				</button>
				<div class="floor-label">
					<div class="floor-name" data-testid="floor-name">{buildHud.level.displayName}</div>
					<div class="floor-elevation">{buildHud.level.baseY.toFixed(2)}m</div>
				</div>
				<button
					class="floor-arrow"
					data-testid="floor-down"
					disabled={!buildHud.level.canMoveDown}
					onclick={() => session?.scene.moveLevelDown()}
					aria-label="Move down one building level"
				>
					▼
				</button>
			</div>
		{/if}

		{#if buildHud?.notice}
			<div class="crosshair-notice" data-testid="crosshair-notice">{buildHud.notice}</div>
		{/if}

		{#if graphicsNotice}
			<div class="graphics-notice" data-testid="graphics-notice">{graphicsNotice}</div>
		{/if}

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
				<p>
					WASD to move &middot; Shift to run &middot; Mouse to look &middot; Esc to release mouse
				</p>
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
						<dd>
							Change current building level — or click the ▲ / ▼ floor selector on the left edge of
							the screen, shown whenever a level-aware tool is active
						</dd>
						<dt>C</dt>
						<dd>
							Cycle draw-snap mode (Off &rarr; Axis &rarr; Axis + Inline &rarr; Wall Corners) —
							Wall, Continuous Wall, Ceiling, Floor, Roof. Wall Corners (Ceiling/Floor/Roof only)
							snaps to the room's wall corners below
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

					<h3>Windows / Doors</h3>
					<dl>
						<dt>Left click</dt>
						<dd>Cut the opening into the wall you're looking at</dd>
						<dt>Floor</dt>
						<dd>
							Only walls on the selected floor can be cut — if the crosshair finds a wall on another
							storey it says so; use Page Up / Page Down to match it
						</dd>
					</dl>

					<h3>Stairs</h3>
					<dl>
						<dt>Left / Right Arrow</dt>
						<dd>Change stair direction</dd>
						<dt>Enter</dt>
						<dd>Confirm stairs</dd>
					</dl>

					<h3>Remove Mode</h3>
					<dl>
						<dt>X</dt>
						<dd>
							Toggle Remove Mode — a global overlay independent of the hotbar; the tool you had
							selected is remembered and restored when you exit
						</dd>
						<dt>Left click</dt>
						<dd>Remove the highlighted wall, wall segment, window, door, or staircase</dd>
						<dt>X / Right click / Esc</dt>
						<dd>Exit Remove Mode</dd>
					</dl>

					<h3>Paint Mode</h3>
					<dl>
						<dt>P</dt>
						<dd>
							Toggle Paint Mode — another global overlay, mutually exclusive with Remove Mode
							(pressing the other key switches straight over); the tool you had selected is
							remembered and restored when you exit
						</dd>
						<dt>C</dt>
						<dd>Open the colour palette — releases the mouse so you can click a swatch</dd>
						<dt>Left click</dt>
						<dd>Paint the highlighted wall, wall segment, slab, or foundation</dd>
						<dt>P / Right click / Esc</dt>
						<dd>Exit Paint Mode</dd>
					</dl>

					<h3>Other</h3>
					<dl>
						<dt>H</dt>
						<dd>Toggle this help</dd>
						<dt>L</dt>
						<dd>
							Cycle graphics quality (Low &rarr; Medium &rarr; High &rarr; Ultra) — applies
							instantly and is remembered next time you visit
						</dd>
						<dt>Esc</dt>
						<dd>
							Release the mouse, then press again for the pause menu — Save, World (rename / export
							/ duplicate), and Quit to Worlds
						</dd>
						<dt>Cmd / Ctrl + S</dt>
						<dd>
							Save the world now. Worlds also autosave a couple of seconds after you stop building
						</dd>
					</dl>

					<button class="help-close" onclick={() => (showHelp = false)}>Close</button>
				</div>
			</div>
		{/if}

		{#if buildHud}
			<div class="build-hud" data-testid="build-hud">
				{#if buildHud.toolId === 'paint'}
					<div class="paint-color-row" data-testid="paint-color-row">
						Current Colour:
						{#if buildHud.paintColor}
							<span
								class="paint-color-swatch"
								style="background-color: {buildHud.paintColor}"
								data-testid="paint-color-swatch"
							></span>
						{:else}
							<span class="paint-color-default">Default</span>
						{/if}
					</div>
				{/if}
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
				<div>{stats.fps} FPS &middot; {stats.frameTimeMs.toFixed(1)} ms</div>
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
				<div data-testid="graphics-stats">
					Graphics {stats.graphicsQuality.toUpperCase()} &middot; scale {stats.renderScale.toFixed(
						2
					)} &middot; dpr {stats.pixelRatio.toFixed(2)}
				</div>
				<div>
					Draws {stats.drawCalls} &middot; Geo {stats.geometries} &middot; Tex {stats.textures}
				</div>
				<div>
					{#if stats.shadowsEnabled}
						Shadows {stats.shadowCascades} cascades &middot; {stats.shadowDistance}m
					{:else}
						Shadows off
					{/if}
					&middot; AO {stats.aoEnabled ? stats.aoQuality : 'off'} &middot; AA {stats.antialiasing.toUpperCase()}
				</div>
			</div>
		{/if}

		{#if hotbar}
			<Hotbar
				slots={hotbar.slots}
				activeSlot={hotbar.activeSlot}
				removeModeActive={hotbar.globalMode === 'remove'}
				paintModeActive={hotbar.globalMode === 'paint'}
				onSelectSlot={(slot) => session?.scene.selectHotbarSlot(slot)}
				onToggleRemoveMode={() => session?.scene.toggleRemoveMode()}
				onTogglePaintMode={() => session?.scene.togglePaintMode()}
			/>
		{/if}

		{#if paintPaletteOpen && paintState}
			<!-- Clicking the backdrop (outside the panel) closes the palette — the panel's own root div
		     stops propagation so a click inside it never reaches this handler. -->
			<div
				class="palette-overlay"
				data-testid="palette-overlay"
				role="presentation"
				onclick={() => session?.scene.closePaintPalette()}
			>
				<MaterialPalette
					selected={paintState.selected}
					savedPresets={paintState.savedPresets}
					onSelect={(material) => session?.scene.selectPaintMaterial(material)}
					onSave={() => session?.scene.savePaintPreset()}
					onRemoveSaved={(id) => session?.scene.removePaintPreset(id)}
					onClose={() => session?.scene.closePaintPalette()}
				/>
			</div>
		{/if}

		{#if screen === 'game'}
			<!-- Small, always-present save state. Deliberately understated: autosave is meant to be
		     something the player never has to think about, so this only becomes prominent (colour +
		     wording) when something actually needs attention. -->
			<div class="save-indicator" data-testid="save-indicator" data-status={saveStatus}>
				<span class="save-dot" data-status={saveStatus}></span>
				{#if saveStatus === 'saving'}Saving…{:else if saveStatus === 'dirty'}Unsaved{:else if saveStatus === 'error'}Save
					failed{:else}Saved{/if}
			</div>
		{/if}

		{#if saveToast}
			<div class="save-toast" data-testid="save-toast">{saveToast}</div>
		{/if}

		{#if paused}
			<PauseMenu
				worldName={currentWorldName}
				seed={currentWorldSeed}
				{saveStatus}
				{saveError}
				busy={worldsBusy}
				onResume={() => (paused = false)}
				onSave={() => void manualSave()}
				onRename={(name) => {
					const id = worldManager?.getCurrentWorldId();
					if (id) void renameWorld(id, name);
				}}
				onExport={() => {
					const id = worldManager?.getCurrentWorldId();
					if (id) void exportWorld(id);
				}}
				onDuplicate={() => {
					const id = worldManager?.getCurrentWorldId();
					if (id) void duplicateWorld(id);
				}}
				onQuit={() => void quitToWorlds()}
				onOpenSettings={() => {
					paused = false;
					showHelp = true;
				}}
			/>
		{/if}
	</div>
{/if}

<style>
	.loading-screen {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		background: radial-gradient(circle at 50% 30%, #2c4b39 0%, #16241d 60%, #0d1512 100%);
		color: #eaf6ff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		z-index: 40;
	}

	.loading-screen .title-mark {
		width: min(16rem, 55vw);
		height: auto;
		filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.55));
	}

	.loading-label {
		margin: 0;
		font-size: 0.9rem;
		opacity: 0.85;
	}

	/* An indeterminate sweep rather than a fake percentage: chunk generation has no meaningful
	   total to divide by, and inventing one would just be a lie with a number on it. */
	.loading-bar {
		width: min(18rem, 70vw);
		height: 3px;
		border-radius: 999px;
		background: rgba(234, 246, 255, 0.15);
		overflow: hidden;
	}

	.loading-bar span {
		display: block;
		width: 40%;
		height: 100%;
		border-radius: 999px;
		background: #39d353;
		animation: loading-sweep 1.1s ease-in-out infinite;
	}

	@keyframes loading-sweep {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(250%);
		}
	}

	/* Bottom-right, not top-right: the lil-gui debug panel occupies the whole top-right corner and
	   would sit on top of this (the same collision the build HUD already has a test for). Bottom-left
	   is the help toggle and bottom-centre is the hotbar, so bottom-right is the free corner. */
	.save-indicator {
		position: absolute;
		bottom: 0.75rem;
		right: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0.6rem;
		border-radius: 999px;
		background: rgba(10, 20, 15, 0.5);
		color: #eaf6ff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 0.7rem;
		letter-spacing: 0.02em;
		pointer-events: none;
		opacity: 0.55;
		transition: opacity 0.2s ease;
	}

	.save-indicator[data-status='saving'],
	.save-indicator[data-status='error'] {
		opacity: 1;
	}

	.save-indicator[data-status='error'] {
		background: rgba(90, 20, 20, 0.8);
		border: 1px solid rgba(255, 122, 122, 0.5);
	}

	.save-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #39d353;
	}

	.save-dot[data-status='dirty'] {
		background: #ffc857;
	}

	.save-dot[data-status='saving'] {
		background: #9fe8ff;
	}

	.save-dot[data-status='error'] {
		background: #ff6b6b;
	}

	.save-toast {
		position: absolute;
		top: 3rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.35rem 0.85rem;
		background: rgba(10, 20, 15, 0.78);
		border: 1px solid rgba(159, 232, 255, 0.5);
		border-radius: 999px;
		color: #eaf6ff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.03em;
		pointer-events: none;
		z-index: 35;
		animation: snap-badge-in 0.15s ease;
	}

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

	/*
	 * Bottom-left, not top-right: the dev GUI (lil-gui) auto-places itself top-right at full viewport
	 * height, and covered this panel completely — every hint and blocking reason the build tools
	 * emit was being drawn underneath it, invisible. Bottom-left clears the GUI, the stats overlay
	 * (top-left), the floor selector (mid-left) and the hotbar (bottom-centre).
	 */
	.build-hud {
		position: absolute;
		bottom: 3.25rem;
		left: 0.75rem;
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

	.paint-color-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.3rem;
	}

	.paint-color-swatch {
		display: inline-block;
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 4px;
		border: 1px solid rgba(234, 246, 255, 0.5);
	}

	.paint-color-default {
		opacity: 0.75;
		font-style: italic;
	}

	.palette-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(4, 8, 6, 0.55);
		backdrop-filter: blur(2px);
		z-index: 12;
		pointer-events: auto;
	}

	/* Sits just above the crosshair — the one place a player is guaranteed to be looking when they're wondering why a click did nothing. */
	.crosshair-notice {
		position: absolute;
		top: calc(50% - 34px);
		left: 50%;
		transform: translateX(-50%);
		padding: 0.25rem 0.65rem;
		background: rgba(10, 20, 15, 0.72);
		border: 1px solid rgba(255, 122, 122, 0.55);
		color: #ffd9d9;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		border-radius: 999px;
		white-space: nowrap;
		pointer-events: none;
		backdrop-filter: blur(2px);
	}

	.graphics-notice {
		position: absolute;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.35rem 0.85rem;
		background: rgba(10, 20, 15, 0.72);
		border: 1px solid rgba(159, 232, 255, 0.55);
		color: #eaf6ff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		border-radius: 999px;
		white-space: nowrap;
		pointer-events: none;
		backdrop-filter: blur(2px);
		animation: snap-badge-in 0.15s ease;
	}

	.floor-selector {
		position: absolute;
		top: 50%;
		left: 0.75rem;
		transform: translateY(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 0.6rem 0.5rem;
		background: rgba(10, 20, 15, 0.55);
		border-radius: 10px;
		backdrop-filter: blur(2px);
	}

	.floor-arrow {
		width: 2rem;
		height: 2rem;
		border: 1px solid rgba(234, 246, 255, 0.25);
		border-radius: 8px;
		background: rgba(234, 246, 255, 0.1);
		color: #eaf6ff;
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
	}

	.floor-arrow:hover:not(:disabled) {
		background: rgba(234, 246, 255, 0.22);
	}

	.floor-arrow:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.floor-label {
		text-align: center;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: #eaf6ff;
		line-height: 1.3;
		padding: 0.15rem 0.1rem;
	}

	.floor-name {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		white-space: nowrap;
	}

	.floor-elevation {
		font-size: 0.7rem;
		opacity: 0.75;
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
