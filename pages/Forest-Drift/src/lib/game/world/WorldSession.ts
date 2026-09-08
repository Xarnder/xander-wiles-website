import { createDefaultBuildingSettings } from '../building/FoundationTypes';
import type { BuildUiState, HotbarUiState } from '../building/FoundationTypes';
import type { PaintUiState } from '../building/PaintTool';
import type { GraphicsQuality } from '../graphics/GraphicsTypes';
import { createDefaultSkySettings } from '../sky/SkyTypes';
import { createDefaultTerrainSettings } from '../terrain/TerrainSettings';
import { ThreeScene, type SceneStats } from '../ThreeScene';
import { createDefaultVegetationSettings } from '../vegetation/VegetationTypes';
import { WorldAutosaveManager, type SaveTrigger } from './WorldAutosaveManager';
import type { WorldManager } from './WorldManager';
import type { SaveStatus, WorldDefinition } from './WorldTypes';

/** Thumbnails are captured at milestones, never on the autosave cadence — a screenshot every two seconds would be a lot of GPU readback for a picture nobody is looking at. */
const THUMBNAIL_MIN_INTERVAL_MS = 5 * 60 * 1000;

export interface WorldSessionOptions {
	container: HTMLElement;
	world: WorldDefinition;
	worldManager: WorldManager;
	onSaveStatusChange?: (status: SaveStatus, error: string | null) => void;
	onStatsUpdate?: (stats: SceneStats) => void;
	onPointerLockChange?: (locked: boolean) => void;
	onHotbarChange?: (state: HotbarUiState) => void;
	onBuildHudChange?: (hud: BuildUiState | null) => void;
	onLookedAtDoorChange?: (openingId: string | null) => void;
	onPaintPaletteChange?: (open: boolean) => void;
	onPaintStateChange?: (state: PaintUiState) => void;
	onGraphicsQualityChange?: (quality: GraphicsQuality) => void;
	onPlacementCustomizeChange?: (open: boolean) => void;
}

/**
 * One open world: the running scene, its autosave loop, and the browser lifecycle hooks that make
 * sure work isn't lost when a tab is hidden or closed.
 *
 * This exists so the Svelte page doesn't have to coordinate three long-lived objects by hand, and so
 * "open a world" and "close a world" are each a single call with a well-defined order — closing in
 * particular must flush before disposing, and disposing must happen even if the flush fails.
 */
export class WorldSession {
	readonly scene: ThreeScene;
	private readonly autosave: WorldAutosaveManager;
	private readonly worldManager: WorldManager;
	private readonly worldId: string;
	private lastThumbnailAt = 0;
	private disposed = false;

	constructor(options: WorldSessionOptions) {
		this.worldManager = options.worldManager;
		this.worldId = options.world.id;

		// Fresh default settings objects, immediately overwritten in place by the world's own saved
		// environment (see ThreeScene.loadWorld). Starting from defaults rather than from the world's
		// object means the world record can never be mutated by live GUI edits.
		this.scene = new ThreeScene({
			container: options.container,
			settings: createDefaultTerrainSettings(),
			buildingSettings: createDefaultBuildingSettings(),
			vegetationSettings: createDefaultVegetationSettings(),
			skySettings: createDefaultSkySettings(),
			world: options.world,
			onStatsUpdate: options.onStatsUpdate,
			onPointerLockChange: options.onPointerLockChange,
			onHotbarChange: options.onHotbarChange,
			onBuildHudChange: options.onBuildHudChange,
			onLookedAtDoorChange: options.onLookedAtDoorChange,
			onPaintPaletteChange: options.onPaintPaletteChange,
			onPaintStateChange: options.onPaintStateChange,
			onGraphicsQualityChange: options.onGraphicsQualityChange,
			onPlacementCustomizeChange: options.onPlacementCustomizeChange
		});

		this.autosave = new WorldAutosaveManager({
			runtime: this.scene,
			onStatusChange: options.onSaveStatusChange,
			persist: async (content, trigger) => {
				const result = await this.worldManager.saveCurrentWorld(content);
				if (!result.ok) throw new Error(result.error);
				if (this.shouldCaptureThumbnail(trigger)) await this.captureThumbnail();
			}
		});
		this.autosave.start();

		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', this.handleVisibilityChange);
		}
		if (typeof window !== 'undefined') {
			window.addEventListener('pagehide', this.handlePageHide);
		}
	}

	hasUnsavedChanges(): boolean {
		return this.autosave.hasUnsavedChanges();
	}

	/** Flushes and resolves once the world is actually written. Used by manual save, Cmd/Ctrl+S, the pause menu, and quitting. */
	async saveNow(trigger: SaveTrigger = 'manual'): Promise<{ ok: boolean; error?: string }> {
		this.scene.markClockDirtyIfNeeded();
		return this.autosave.saveNow(trigger);
	}

	/**
	 * Grabs a fresh thumbnail and stores it. Kept separate from saving so a failed or slow screenshot
	 * can never hold up (or fail) a world write — thumbnails are optional metadata.
	 */
	async captureThumbnail(): Promise<void> {
		const blob = await this.scene.captureThumbnail();
		if (!blob) return;
		this.lastThumbnailAt = Date.now();
		await this.worldManager.saveThumbnail(this.worldId, blob);
	}

	private shouldCaptureThumbnail(trigger: SaveTrigger): boolean {
		if (trigger === 'manual' || trigger === 'lifecycle') return true;
		return Date.now() - this.lastThumbnailAt > THUMBNAIL_MIN_INTERVAL_MS;
	}

	/**
	 * `visibilitychange` (rather than `beforeunload`) is the reliable moment to flush: it fires when a
	 * tab is backgrounded or the app is being closed on mobile, and — critically — it fires early
	 * enough that an asynchronous IndexedDB write can still complete. `beforeunload` frequently
	 * cannot, which is why the autosave cadence is designed to keep storage nearly current at all
	 * times rather than relying on a last-gasp save.
	 */
	private readonly handleVisibilityChange = (): void => {
		if (document.visibilityState !== 'hidden') return;
		this.scene.markClockDirtyIfNeeded();
		if (!this.autosave.hasUnsavedChanges()) return;
		void this.autosave.saveNow('lifecycle');
	};

	private readonly handlePageHide = (): void => {
		this.scene.markClockDirtyIfNeeded();
		if (!this.autosave.hasUnsavedChanges()) return;
		void this.autosave.saveNow('lifecycle');
	};

	/**
	 * Flush, then tear down. The flush is awaited and its failure surfaced to the caller (quitting to
	 * the Worlds screen should be able to warn "we couldn't save"), but disposal happens either way —
	 * leaking a WebGL context and a running render loop because a write failed would turn a bad save
	 * into a broken app.
	 */
	async dispose(): Promise<{ ok: boolean; error?: string }> {
		if (this.disposed) return { ok: true };
		this.disposed = true;

		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.handleVisibilityChange);
		}
		if (typeof window !== 'undefined') {
			window.removeEventListener('pagehide', this.handlePageHide);
		}

		try {
			await this.captureThumbnail();
		} catch {
			// Optional metadata; never block quitting on it.
		}

		let result: { ok: boolean; error?: string };
		try {
			result = await this.autosave.saveNow('lifecycle');
		} catch (error) {
			result = { ok: false, error: error instanceof Error ? error.message : String(error) };
		}

		this.autosave.dispose();
		this.scene.dispose();
		return result;
	}
}
