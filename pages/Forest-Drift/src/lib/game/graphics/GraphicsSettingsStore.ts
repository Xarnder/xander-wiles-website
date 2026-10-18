import type { GraphicsQuality } from './GraphicsTypes';

const STORAGE_KEY = 'forest-drift.graphics.v1';
const FOV_STORAGE_KEY = 'forest-drift.fov.v1';
const FPS_COUNTER_STORAGE_KEY = 'forest-drift.fps-counter.v1';
const LOCATOR_BAR_STORAGE_KEY = 'forest-drift.locator-bar.v1';

const VALID_QUALITIES: readonly GraphicsQuality[] = ['low', 'medium', 'high', 'ultra'];

function isValidQuality(value: unknown): value is GraphicsQuality {
	return typeof value === 'string' && (VALID_QUALITIES as readonly string[]).includes(value);
}

/** Same "never throw even in a non-browser environment" guard as MaterialPresetStore.getStorage. */
function getStorage(): Storage | null {
	return typeof localStorage === 'undefined' ? null : localStorage;
}

/**
 * Local, per-browser persistence for the player's chosen graphics quality (see GraphicsTypes.ts) —
 * pressing `L` mid-session should still show the same quality after a reload. Deliberately just the
 * quality level, not every advanced/debug override: those are development-time GUI knobs, not a
 * player-facing preference worth surviving a reload (they reset to the preset's own values, exactly
 * like reselecting the quality would).
 */
export class GraphicsSettingsStore {
	getQuality(): GraphicsQuality | null {
		const storage = getStorage();
		if (!storage) return null;
		try {
			const raw = storage.getItem(STORAGE_KEY);
			return isValidQuality(raw) ? raw : null;
		} catch {
			return null;
		}
	}

	/** The player's saved field of view (degrees), or null when never set / unreadable. */
	getFieldOfView(): number | null {
		const storage = getStorage();
		if (!storage) return null;
		try {
			const raw = storage.getItem(FOV_STORAGE_KEY);
			const value = raw === null ? Number.NaN : Number(raw);
			return Number.isFinite(value) ? value : null;
		} catch {
			return null;
		}
	}

	setFieldOfView(degrees: number): void {
		const storage = getStorage();
		if (!storage) return;
		try {
			storage.setItem(FOV_STORAGE_KEY, String(degrees));
		} catch {
			// Same as setQuality: only cross-session persistence is lost.
		}
	}

	/**
	 * Whether the FPS counter is shown. Missing or unreadable storage means on — the counter is the
	 * default, and only an explicit "off" should hide it.
	 */
	getShowFpsCounter(): boolean {
		const storage = getStorage();
		if (!storage) return true;
		try {
			return storage.getItem(FPS_COUNTER_STORAGE_KEY) !== '0';
		} catch {
			return true;
		}
	}

	/** Whether the locator bar is shown (online worlds). Same "only an explicit off hides it" rule. */
	getShowLocatorBar(): boolean {
		const storage = getStorage();
		if (!storage) return true;
		try {
			return storage.getItem(LOCATOR_BAR_STORAGE_KEY) !== '0';
		} catch {
			return true;
		}
	}

	setShowLocatorBar(show: boolean): void {
		const storage = getStorage();
		if (!storage) return;
		try {
			storage.setItem(LOCATOR_BAR_STORAGE_KEY, show ? '1' : '0');
		} catch {
			// Only cross-session persistence is lost.
		}
	}

	setShowFpsCounter(show: boolean): void {
		const storage = getStorage();
		if (!storage) return;
		try {
			storage.setItem(FPS_COUNTER_STORAGE_KEY, show ? '1' : '0');
		} catch {
			// Same as setQuality: only cross-session persistence is lost.
		}
	}

	setQuality(quality: GraphicsQuality): void {
		const storage = getStorage();
		if (!storage) return;
		try {
			storage.setItem(STORAGE_KEY, quality);
		} catch {
			// Storage full/unavailable mid-session — the in-memory quality (and this session's
			// rendering) stays correct either way; only cross-session persistence silently fails.
		}
	}
}
