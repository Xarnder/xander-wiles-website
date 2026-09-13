<script lang="ts">
	import CreatureLabModal from '$lib/components/CreatureLabModal.svelte';
	let creatureLabOpen = $state(false);
	function openCreatureLab() {
		session?.scene.closePlacementCustomize();
		session?.scene.closePlacementHeight();
		document.exitPointerLock?.();
		if (session) session.scene.devPanelOpen = true;
		settingsOpen = false;
		creatureLabOpen = true;
	}
	function closeCreatureLab() {
		creatureLabOpen = false;
		if (session) session.scene.devPanelOpen = false;
	}
	onMount(() => {
		window.addEventListener('forest:creature-lab', openCreatureLab);
		return () => window.removeEventListener('forest:creature-lab', openCreatureLab);
	});

	import MidiImportModal from '$lib/components/MidiImportModal.svelte';
	let midiOpen = $state(false);
	function openMidi() {
		if (!session) return;
		session.scene.closePlacementCustomize();
		session.scene.closePlacementHeight();
		document.exitPointerLock?.();
		session.scene.music.importPanelOpen = true;
		midiOpen = true;
	}
	function closeMidi() {
		midiOpen = false;
		if (session) session.scene.music.importPanelOpen = false;
	}
	import { onDestroy, onMount, tick } from 'svelte';
	import titleMark from '$lib/assets/forest-drift-title.svg';
	import Hotbar from '$lib/components/Hotbar.svelte';
	import MaterialPalette from '$lib/components/MaterialPalette.svelte';
	import PauseMenu from '$lib/components/PauseMenu.svelte';
	import FurnitureCatalogueModal from '$lib/components/FurnitureCatalogueModal.svelte';
	import PlacementCustomizeModal from '$lib/components/PlacementCustomizeModal.svelte';
	import PlacementHeightModal from '$lib/components/PlacementHeightModal.svelte';
	import SettingsMenu from '$lib/components/SettingsMenu.svelte';
	import WorldsScreen from '$lib/components/WorldsScreen.svelte';
	import type { BuildUiState, HotbarUiState } from '$lib/game/building/FoundationTypes';
	import {
		isCustomizablePlacementTool,
		isSlabHeightTool
	} from '$lib/game/building/FoundationTypes';
	import type { PaintUiState } from '$lib/game/building/PaintTool';
	import { graphicsQualityLabel } from '$lib/game/graphics/GraphicsTypes';
	import type { SceneStats } from '$lib/game/ThreeScene';
	import { formatDayClock } from '$lib/game/sky/dayNightMath';
	import { createDefaultSkySettings } from '$lib/game/sky/SkyTypes';
	import { createDefaultTerrainSettings } from '$lib/game/terrain/TerrainSettings';
	import { createDefaultVegetationSettings } from '$lib/game/vegetation/VegetationTypes';
	import {
		IndexedDbWorldRepository,
		isIndexedDbAvailable,
		requestPersistentStorage
	} from '$lib/game/world/IndexedDbWorldRepository';
	import {
	DEFAULT_WORLD_ID,
	DEFAULT_WORLD_THUMBNAIL_DATA_URL
} from '$lib/game/world/DefaultWorld';
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
	let settingsOpen = $state(false);
	let paintPaletteOpen = $state(false);
	let placementCustomizeOpen = $state(false);
	let placementHeightOpen = $state(false);
	let paintState = $state<PaintUiState | null>(null);
	let graphicsNotice = $state<string | null>(null);

	/** Which top-level screen is showing. The game's Three.js scene only exists while this is `game`. */
	let screen = $state<'worlds' | 'loading' | 'game'>('worlds');
	let loadingLabel = $state('Loading world…');
	let worlds = $state<WorldMetadata[]>([]);
	let defaultWorld = $state<WorldMetadata | null>(null);
	let defaultThumbnail = $state<string>(DEFAULT_WORLD_THUMBNAIL_DATA_URL);
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
	let lookedAtDoorId = $state<string | null>(null);

	let session = $state.raw<WorldSession>();

	function clockBlocked(): boolean {
		return (
			paused ||
			settingsOpen ||
			creatureLabOpen ||
			midiOpen ||
			paintPaletteOpen ||
			placementCustomizeOpen ||
			placementHeightOpen
		);
	}

	$effect(() => {
		if (session) session.scene.simulationPaused = clockBlocked();
	});
	let worldManager: WorldManager | undefined;
	let graphicsNoticeTimeout: ReturnType<typeof setTimeout> | undefined;
	let saveToastTimeout: ReturnType<typeof setTimeout> | undefined;
	/** Object URLs created for thumbnail blobs, revoked when the list is rebuilt or the page unmounts. */
	let thumbnailUrls: string[] = [];

	const customizeToolId = $derived.by(() => {
		const current = hotbar;
		if (!current) return undefined;
		if (current.globalMode === 'move') return 'torch';
		const id = current.slots.find((slot) => slot.slot === current.activeSlot)?.toolId;
		return id && isCustomizablePlacementTool(id) ? id : undefined;
	});

	const heightToolId = $derived.by(() => {
		const current = hotbar;
		if (!current) return undefined;
		const id = current.slots.find((slot) => slot.slot === current.activeSlot)?.toolId;
		return id && isSlabHeightTool(id) ? id : undefined;
	});

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
	let lastPauseToggleTime = 0;

	function togglePause() {
		lastPauseToggleTime = performance.now();
		if (!paused) {
			session?.scene.closePlacementCustomize();
			session?.scene.closePlacementHeight();
			document.exitPointerLock?.();
		}
		paused = !paused;
		if (session) session.scene.simulationPaused = clockBlocked();
		if (paused && session?.hasUnsavedChanges()) void session.saveNow('lifecycle');
	}

	function openPause() {
		if (paused) return;
		lastPauseToggleTime = performance.now();
		session?.scene.closePlacementCustomize();
		session?.scene.closePlacementHeight();
		document.exitPointerLock?.();
		showHelp = false;
		togglePause();
	}

	function openSettings() {
		session?.scene.closePlacementCustomize();
		session?.scene.closePlacementHeight();
		document.exitPointerLock?.();
		showHelp = false;
		settingsOpen = true;
	}

	function closeSettings() {
		settingsOpen = false;
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

		if (placementCustomizeOpen && event.code === 'Escape') {
			session?.scene.closePlacementCustomize();
			return;
		}
		if (placementHeightOpen && event.code === 'Escape') {
			session?.scene.closePlacementHeight();
			return;
		}
		if (screen !== 'game' || typing) return;
		if (placementCustomizeOpen || placementHeightOpen) return;
		if (settingsOpen) {
			if (event.code === 'Escape') closeSettings();
			return;
		}
		if (creatureLabOpen) {
			if (event.code === 'Escape') closeCreatureLab();
			return;
		}
		if (midiOpen) {
			if (event.code === 'Escape') closeMidi();
			return;
		}

		if (event.code === 'Escape') {
			if (showHelp) {
				showHelp = false;
			} else if (performance.now() - lastPauseToggleTime > 150) {
				togglePause();
			}
			return;
		}
		if (event.code === 'KeyH') {
			showHelp = !showHelp;
			return;
		}
		if (event.code === 'F3') {
			event.preventDefault();
			if (!session) return;
			const on = session.scene.toggleRenderStats();
			showSaveToast(on ? 'Render stats on' : 'Render stats off');
			return;
		}
		if (paused) return;

		if (event.code === 'KeyL') session?.scene.cycleGraphicsQuality();
	}

	async function refreshWorlds() {
		if (!worldManager) return;
		const [list, estimate, defMeta] = await Promise.all([
			worldManager.listWorlds(),
			worldManager.estimateStorage(),
			worldManager.getDefaultWorldMetadata()
		]);
		worlds = list;
		storage = estimate;
		defaultWorld = defMeta;

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

		const defBlob = await worldManager.getThumbnail(DEFAULT_WORLD_ID);
		if (defBlob) {
			const defUrl = URL.createObjectURL(defBlob);
			thumbnailUrls.push(defUrl);
			defaultThumbnail = defUrl;
		} else {
			defaultThumbnail = DEFAULT_WORLD_THUMBNAIL_DATA_URL;
		}
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

	async function playDefaultWorld() {
		await openWorld(DEFAULT_WORLD_ID);
	}

	async function resetDefaultWorld() {
		await withBusy(async () => {
			const result = await worldManager!.resetDefaultWorld();
			if (!result.ok) {
				worldsError = result.error;
				return;
			}
			await refreshWorlds();
			showSaveToast('Reset Main World to default');
		});
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
			onPointerLockChange: (locked) => {
				const wasLocked = pointerLocked;
				pointerLocked = locked;
				if (wasLocked && !locked) {
					if (showHelp) {
						showHelp = false;
					} else if (!paused && !clockBlocked()) {
						// Escape while pointer-locked is consumed natively by the browser to exit lock.
						// Catching that transition here brings up the pause menu on the very first Escape press.
						if (performance.now() - lastPauseToggleTime > 150) {
							openPause();
						}
					}
				}
			},
			onHotbarChange: (next) => (hotbar = next),
			onBuildHudChange: (next) => (buildHud = next),
			onLookedAtDoorChange: (id) => (lookedAtDoorId = id),
			onPaintPaletteChange: (open) => (paintPaletteOpen = open),
			onPaintStateChange: (next) => (paintState = next),
			onGraphicsQualityChange: (quality) => showGraphicsNotice(quality),
			onPlacementCustomizeChange: (open) => {
				placementCustomizeOpen = open;
				if (open) showHelp = false;
			},
			onPlacementHeightChange: (open) => {
				placementHeightOpen = open;
				if (open) showHelp = false;
			}
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
			lookedAtDoorId = null;
			if (!result.ok) worldsError = result.error ?? 'Unable to save world before quitting.';
			worldManager?.closeWorld();

			// Reset every piece of in-game UI state, so returning to a world later never inherits the
			// previous session's HUD.
			paused = false;
			showHelp = false;
			settingsOpen = false;
			midiOpen = false;
			paintPaletteOpen = false;
			placementCustomizeOpen = false;
			placementHeightOpen = false;
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
				worldsError = null;
				await refreshWorlds();
				showSaveToast(`Imported ${result.value.name}`);
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
		{defaultWorld}
		{defaultThumbnail}
		{storage}
		busy={worldsBusy}
		error={worldsError}
		onPlay={(id) => void openWorld(id)}
		onPlayDefault={() => void playDefaultWorld()}
		onResetDefault={() => void resetDefaultWorld()}
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

		{#if buildHud?.snapBadge}
			<div class={['snap-badge', 'snap-badge-division']} data-testid="snap-badge">
				{buildHud.snapBadge}
			</div>
		{:else if buildHud?.snapMode === 'axis' || buildHud?.snapMode === 'axis-inline' || buildHud?.snapMode === 'wall-corners'}
			<div
				class={[
					'snap-badge',
					{
						'snap-badge-inline': buildHud.snapMode === 'axis-inline',
						'snap-badge-corners': buildHud.snapMode === 'wall-corners'
					}
				]}
				data-testid="snap-badge"
			>
				{SNAP_MODE_TEXT[buildHud.snapMode]}
			</div>
		{/if}

		{#if !pointerLocked && !clockBlocked() && !showHelp}
			<div class="instructions" class:fading={pointerLocked}>
				<img class="title-mark" src={titleMark} alt="Forest Drift" width="614" height="350" />
				<p class="headline">Click to explore</p>
				<p>
					WASD to move &middot; Shift to run &middot; Mouse to look &middot; Esc for menu
				</p>
				<p>
					G to build &middot; 1&ndash;6 and 8 for tools &middot; Pause or Esc for the menu
					(Settings, Help, Creature Lab) &middot; H for help
				</p>
			</div>
		{/if}

		<div class="utility-buttons">
			<button class="help-toggle" data-testid="pause-toggle" onclick={openPause} aria-label="Pause">
				Pause
			</button>
		</div>

		{#if showHelp}
			<div class={['help-overlay', { 'over-menus': paused }]} data-testid="help-overlay">
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
						<dd>
							Release the mouse, then press again for the pause menu. Also closes Help, Settings,
							and Creature Lab. Cancels the current placement once the mouse is free.
						</dd>
					</dl>

					<h3>Building — general</h3>
					<dl>
						<dt>G</dt>
						<dd>
							Toggle Build Mode and the hotbar. Independent from M, which toggles Compose Mode.
							Tools and placement sleep while Build Mode is off; the selected slot is remembered.
						</dd>
						<dt>1&ndash;6, 8</dt>
						<dd>
							Select hotbar slot — 1 Foundation, 2 Walls, 3 Openings, 4 Slabs, 5 Stairs, 6 Floor
							Detailing, 8 Place Object. Slot 7 is reserved.
						</dd>
						<dt>↑ / ↓</dt>
						<dd>
							Cycle tools inside the selected slot — Poly Wall / Wall, Door / Window / Beam, Ceiling
							/ Floor / Roof, Carpet / Path / Planks / Tiles, and Furniture objects. The last choice
							is remembered. While a roof is being adjusted, ↑/↓ still change rise instead.
						</dd>
						<dt>Left click</dt>
						<dd>Place / confirm</dd>
						<dt>Right click</dt>
						<dd>Cancel / deselect</dd>
						<dt>−</dt>
						<dd>
							Undo the last placement (wall, continuous wall, window, door, beam, ceiling, floor,
							roof, or floor detailing). Keeps the last five actions.
						</dd>
						<dt>] / [</dt>
						<dd>
							Change current building level (] up, [ down) — Page Up / Page Down still work, or
							click the ▲ / ▼ floor selector on the left edge of the screen whenever a level-aware
							tool is active
						</dd>
						<dt>C</dt>
						<dd>
							Cycle draw-snap mode (Off &rarr; Axis &rarr; Axis + Inline &rarr; Wall Corners) —
							Wall, Continuous Wall, Ceiling, Floor, Roof. Wall Corners (Ceiling/Floor/Roof only)
							snaps to the room's wall corners below. On Path, C cycles Axis snap &rarr; Free &rarr;
							Bezier.
						</dd>
						<dt>E</dt>
						<dd>
							Customise the selected wall, window, door, beam, stairs, or floor detailing (carpets,
							paths, planks, tiles) before placing. On Ceiling, Floor, or Roof, set how high the
							next piece sits above this storey's floor. Esc or E again closes the panel. Settings
							apply to the next piece, not ones already built.
						</dd>
					</dl>

					<h3>Continuous Wall / Ceiling / Floor</h3>
					<dl>
						<dt>E</dt>
						<dd>
							On Wall or Continuous Wall — set the next wall's height and width (thickness). On
							Ceiling or Floor — set how high the next slab sits above this storey's floor. Length
							still comes from the points you click.
						</dd>
						<dt>Backspace</dt>
						<dd>Undo last point</dd>
						<dt>Enter</dt>
						<dd>Finish an open wall path (Continuous Wall only)</dd>
						<dt>Click first point again</dt>
						<dd>Close the loop / shape</dd>
					</dl>

					<h3>Roof</h3>
					<dl>
						<dt>Left click</dt>
						<dd>Trace the roof footprint, then click the first point again to close it</dd>
						<dt>V</dt>
						<dd>
							After the footprint is closed, cycle roof type (Flat, Shed, Gable, Hip, Gambrel,
							Mansard, Butterfly, M-Shaped, Dutch Gable)
						</dd>
						<dt>R</dt>
						<dd>Rotate a sloped roof (ridge / high edge)</dd>
						<dt>↑ / ↓</dt>
						<dd>
							Adjust rise (hold Shift for a finer step). These keys do not change hotbar variant
							while you are adjusting a roof
						</dd>
						<dt>C</dt>
						<dd>Cycle draw-snap, including Wall Corners onto the room below</dd>
						<dt>E</dt>
						<dd>
							Set how high the roof eaves sit above this storey's floor. Reset follows the top of
							the walls
						</dd>
						<dt>Click / Right click</dt>
						<dd>Place the roof, or cancel</dd>
					</dl>

					<h3>Windows / Doors / Beams</h3>
					<dl>
						<dt>K</dt>
						<dd>Open or close the door under the crosshair</dd>
						<dt>Left click</dt>
						<dd>Place a window/door hole or a timber beam on the wall</dd>
						<dt>E</dt>
						<dd>
							Customise the next window, door, or beam — width, height (windows, doors, and
							horizontal beams), sill / from-floor height (windows and doors), and colour. Applies
							to the next piece you place, not ones already built.
						</dd>
						<dt>C</dt>
						<dd>
							Cycle wall-division snap (Grid &rarr; Half &rarr; Thirds &hellip; Sixteenths) — snaps
							the window, door, or beam centre to even splits of this wall's length, up to 16. A
							horizontal beam's height follows the look point; a vertical beam spans the wall.
						</dd>
						<dt>R</dt>
						<dd>
							Flip the next beam between vertical (default, floor to top of the wall) and horizontal
						</dd>
						<dt>Floor</dt>
						<dd>Only walls on the selected floor can be used — use ] / [ to match storey</dd>
					</dl>

					<h3>Stairs</h3>
					<dl>
						<dt>Left click</dt>
						<dd>
							Two-click rectangle on the current floor or foundation, then confirm the footprint
						</dd>
						<dt>Left / Right Arrow</dt>
						<dd>Change stair direction</dd>
						<dt>Enter / Left click</dt>
						<dd>Confirm stairs</dd>
						<dt>] / [</dt>
						<dd>
							Build on the selected storey. Stairs connect that floor to the one their rise reaches
						</dd>
						<dt>E</dt>
						<dd>
							Customise the next stair's colour, framing, railings, hole, and hole framing before
							placing. Esc or E again closes. Applies to the next stair, not ones already built.
						</dd>
					</dl>

					<h3>Floor Detailing</h3>
					<dl>
						<dt>6 / ↑ / ↓</dt>
						<dd>
							Slot 6 — ↑/↓ cycles Carpet / Path / Planks / Tiles. The last choice is remembered.
						</dd>
						<dt>Left click</dt>
						<dd>
							Two-click rectangle for carpet, planks, and tiles. Paths: two-click start &rarr; end
							in Axis or Free mode; Bezier adds a third click that pulls the bend. Sits on the
							current floor or foundation plane, just above it. Visual only — no collision.
						</dd>
						<dt>E</dt>
						<dd>
							Customise the next piece — 3D/2D (3D boards and tiles by default; 2D is a thin plane),
							Colour 1 / Colour 2, plank width and direction, tile size and pattern (Solid / Checker
							/ Diamond / Running bond), path width and timber framing. Reset on each field restores
							that variant's default. Applies to the next piece you place.
						</dd>
						<dt>C</dt>
						<dd>
							On Path — cycle Axis snap (horizontal/vertical), Free (any heading), and Bezier
							(start, end, then pull the curve)
						</dd>
						<dt>R</dt>
						<dd>Cycle plank direction (X/Z), tile pattern, or path framing on/off</dd>
						<dt>X</dt>
						<dd>Remove Mode works on placed detailing</dd>
						<dt>−</dt>
						<dd>Undo the last detailing placement</dd>
					</dl>

					<h3>Remove Mode</h3>
					<dl>
						<dt>X</dt>
						<dd>
							Toggle Remove Mode — a global overlay independent of the hotbar; the tool you had
							selected is remembered and restored when you exit
						</dd>
						<dt>Left click</dt>
						<dd>
							Remove the highlighted wall, wall segment, window, door, beam, ceiling, floor, roof,
							staircase, floor detailing, or music plant
						</dd>
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
						<dd>Paint the highlighted wall, wall segment, ceiling, floor, roof, or foundation</dd>
						<dt>P / Right click / Esc</dt>
						<dd>Exit Paint Mode</dd>
					</dl>

					<h3>Move Mode</h3>
					<dl>
						<dt>M</dt>
						<dd>
							Toggle Move Mode — pick up existing objects, drag them around, rotate, and edit them
						</dd>
						<dt>Aim + Left click</dt>
						<dd>
							Pick up the highlighted object (or drag it). Click again to place it at the new
							location
						</dd>
						<dt>R</dt>
						<dd>Rotate the held object in 90° increments</dd>
						<dt>E</dt>
						<dd>Edit the object's dimensions, colors, and parameters in the catalogue modal</dd>
						<dt>Right click / Esc</dt>
						<dd>
							Cancel the move and restore the object to its original position (or exit Move Mode)
						</dd>
					</dl>

					<h3>Music Garden</h3>
					<p>
						Every world starts with a glowing Music Tree nearby (a tree with a soft teal-green
						glow). Walk up to it and press <strong>N</strong> &mdash; faint rings appear on the ground
						around the tree. Aim at the ground inside the rings and a ghost flower shows where it will
						land; left click to plant it. Your aim angle is completely free, but the distance from the
						tree always snaps to the nearest ring &mdash; each ring is a moment in the music's loop, so
						flowers close to the tree play early and flowers further out play later.
					</p>
					<dl>
						<dt>N</dt>
						<dd>Enter / exit Compose Mode. The nearest Music Tree becomes active.</dd>
						<dt>Aim + Left click</dt>
						<dd>
							Plant the ghost preview at the snapped ring under your crosshair. Right click / Esc
							cancels the current preview
						</dd>
						<dt>Q / E</dt>
						<dd>
							Choose the species before placing &mdash; flower, mushroom, fern, reed, or crystal
							&mdash; each one is a different instrument
						</dd>
						<dt>&uarr; / &darr;</dt>
						<dd>
							Grow the plant taller or shorter before placing &mdash; this sets its pitch (short =
							low note, tall = high note)
						</dd>
						<dt>&larr; / &rarr;</dt>
						<dd>
							Make the plant paler or more vivid before placing &mdash; this sets its volume (pale =
							quiet, vivid = loud)
						</dd>
						<dt>, / .</dt>
						<dd>Shorten or lengthen the note (duration in steps)</dd>
						<dt>F</dt>
						<dd>
							Select the plant under the crosshair to move it or edit its pitch / volume / duration.
							Click again to place it on the same timing ring
						</dd>
						<dt>J</dt>
						<dd>Play / pause the tree's music loop</dd>
						<dt>Import MIDI</dt>
						<dd>
							Button on the music HUD. Preview a file, then click open ground to grow the imported
							garden (right click cancels)
						</dd>
						<dt>X</dt>
						<dd>Switch to Remove Mode to delete a planted flower &mdash; aim at it and click</dd>
					</dl>

					<h3>Other</h3>
					<dl>
						<dt>H</dt>
						<dd>
							Toggle this help · G toggles Build Mode · N opens Music Garden · M toggles Move Mode
						</dd>
						<dt>Day / night</dt>
						<dd>
							The sun moves through a full day every 20 minutes of play. Pause, Settings, and other
							menus freeze the clock. The current hour is at the top-right. Sky &rarr; Day &amp;
							night sets the hour or turns the cycle off.
						</dd>
						<dt>Settings</dt>
						<dd>Pause &rarr; Settings — world, terrain, building, music, sky, and graphics</dd>
						<dt>Creature Lab</dt>
						<dd>Pause &rarr; Creature Lab — design a creature, then place it in the world</dd>
						<dt>F3</dt>
						<dd>Show or hide render stats (also Graphics &rarr; Show render stats)</dd>
						<dt>L</dt>
						<dd>
							Cycle graphics quality (Low &rarr; Medium &rarr; High &rarr; Ultra) — applies
							instantly and is remembered next time you visit
						</dd>
						<dt>Esc</dt>
						<dd>
							Release the mouse, then press again for the pause menu — Save, World (rename / export
							/ duplicate), Settings, Help, Creature Lab, and Quit to Worlds
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

		{#if creatureLabOpen && session}<CreatureLabModal
				onClose={closeCreatureLab}
				onPlace={(definition) => {
					session?.scene.placeCreature(definition);
					closeCreatureLab();
					paused = false;
				}}
			/>{/if}
		{#if buildHud}
			<div class="build-hud" data-testid="build-hud">
				{#if buildHud.toolId === 'music'}<button
						class="midi-import-button"
						data-testid="import-midi"
						onclick={openMidi}>Import MIDI</button
					>{/if}
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
			<div class="sr-only" data-testid="world-load-status">
				Loaded {stats.loadedChunks} &middot; Queued {stats.queuedChunks}
			</div>
		{/if}

		{#if stats?.dayCycleEnabled}
			<div class="day-clock" data-testid="day-clock">{formatDayClock(stats.timeOfDay)}</div>
		{/if}

		{#if stats?.showRenderStats}
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
				<div>
					Creatures {stats.creatures.rendered}/{stats.creatures.active} active · {stats.creatures
						.sleeping} sleeping · LOD {stats.creatures.lod0}/{stats.creatures.lod1}
				</div>
				<div>
					Fauna {stats.creatures.triangles.toLocaleString()} tris · {stats.creatures.animationMs.toFixed(
						2
					)} ms bones · {stats.creatures.behaviourMs.toFixed(2)} ms behaviour
				</div>
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

		{#if hotbar?.buildModeActive}
			<Hotbar
				slots={hotbar.slots}
				activeSlot={hotbar.activeSlot}
				removeModeActive={hotbar.globalMode === 'remove'}
				paintModeActive={hotbar.globalMode === 'paint'}
				moveModeActive={hotbar.globalMode === 'move'}
				onSelectSlot={(slot) => session?.scene.selectHotbarSlot(slot)}
				onToggleRemoveMode={() => session?.scene.toggleRemoveMode()}
				onTogglePaintMode={() => session?.scene.togglePaintMode()}
				onToggleMoveMode={() => session?.scene.toggleMoveMode()}
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
			{#if saveStatus === 'error'}
				<div class="save-error-chip" data-testid="save-error-chip">
					<p>{saveError ?? 'Unable to save world locally.'}</p>
					<button type="button" onclick={() => void manualSave()}>Retry</button>
				</div>
			{/if}
		{/if}

		{#if lookedAtDoorId && pointerLocked && !paused && !showHelp && !settingsOpen && !creatureLabOpen && !midiOpen && !paintPaletteOpen && !placementCustomizeOpen && !placementHeightOpen}
			<div class="door-toast" data-testid="door-toast">Press K to open the door</div>
		{/if}

		{#if placementCustomizeOpen && session && customizeToolId}
			{#if customizeToolId === 'torch'}
				<FurnitureCatalogueModal
					settings={session.scene.buildingSettings}
					onClose={() => session?.scene.closePlacementCustomize()}
				/>
			{:else}
				<PlacementCustomizeModal
					toolId={customizeToolId}
					settings={session.scene.buildingSettings}
					onClose={() => session?.scene.closePlacementCustomize()}
				/>
			{/if}
		{/if}
		{#if placementHeightOpen && session && heightToolId}
			<PlacementHeightModal
				toolId={heightToolId}
				settings={session.scene.buildingSettings}
				level={buildHud?.level}
				onClose={() => session?.scene.closePlacementHeight()}
			/>
		{/if}
		{#if midiOpen && session}<MidiImportModal
				music={session.scene.music}
				onClose={closeMidi}
			/>{/if}
		{#if paused}
			<PauseMenu
				worldName={currentWorldName}
				seed={currentWorldSeed}
				{saveStatus}
				{saveError}
				busy={worldsBusy}
				onResume={() => (paused = false)}
				onRespawn={() => {
					session?.scene.respawn();
					paused = false;
				}}
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
				onOpenSettings={openSettings}
				onOpenControls={() => (showHelp = true)}
				onOpenCreatureLab={openCreatureLab}
			/>
		{/if}
		{#if settingsOpen && session}
			<SettingsMenu host={session.scene.settingsHost} onClose={closeSettings} />
		{/if}
	</div>
{/if}

{#if saveToast}
	<div class="app-toast" data-testid="save-toast">{saveToast}</div>
{/if}

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.day-clock {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		z-index: 12;
		padding: 0.35rem 0.7rem;
		border-radius: 999px;
		background: rgba(10, 20, 15, 0.55);
		border: 1px solid rgba(234, 246, 255, 0.2);
		color: #eaf6ff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 0.75rem;
		font-weight: 650;
		letter-spacing: 0.02em;
		font-variant-numeric: tabular-nums;
		backdrop-filter: blur(2px);
		pointer-events: none;
	}

	.save-error-chip {
		position: absolute;
		right: 0.75rem;
		bottom: 2.6rem;
		z-index: 16;
		width: min(18rem, calc(100vw - 1.5rem));
		padding: 0.55rem 0.7rem;
		border-radius: 10px;
		background: rgba(90, 20, 20, 0.88);
		border: 1px solid rgba(255, 122, 122, 0.55);
		color: #ffe8e8;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 0.75rem;
		line-height: 1.35;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.save-error-chip p {
		margin: 0;
	}

	.save-error-chip button {
		align-self: flex-start;
		padding: 0.3rem 0.6rem;
		border-radius: 7px;
		border: 1px solid rgba(255, 200, 200, 0.45);
		background: rgba(20, 8, 8, 0.55);
		color: #ffe8e8;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.app-toast {
		position: fixed;
		top: 1.1rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.35rem 0.85rem;
		background: rgba(10, 20, 15, 0.86);
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
		z-index: 60;
		animation: snap-badge-in 0.15s ease;
	}
	.midi-import-button {
		pointer-events: auto;
		display: block;
		margin-bottom: 0.6rem;
		padding: 0.45rem 0.9rem;
		border: 1px solid #8ab899;
		border-radius: 8px;
		background: #214a34;
		color: #e8ffe9;
		font: inherit;
		cursor: pointer;
	}
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

	/* Bottom-right stays clear of the pause button (bottom-left) and the hotbar. */
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

	.door-toast {
		position: absolute;
		top: calc(50% + 28px);
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
		white-space: nowrap;
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

	/* Bottom-left, above the pause button; stats stay top-left and the hotbar is centred. */
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

	.snap-badge-division {
		background: rgba(120, 210, 200, 0.92);
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

	.utility-buttons {
		position: absolute;
		bottom: 0.75rem;
		left: 0.75rem;
		z-index: 11;
		display: flex;
		gap: 0.4rem;
	}

	.help-toggle {
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

	.help-overlay.over-menus {
		z-index: 45;
	}

	.help-panel {
		max-width: min(40rem, 92vw);
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

	.help-panel p {
		margin: 0 0 0.6rem;
		font-size: 0.85rem;
		line-height: 1.5;
		color: #cfe8dc;
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
