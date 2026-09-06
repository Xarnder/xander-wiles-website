import type { GraphicsQuality } from './GraphicsTypes';

const STORAGE_KEY = 'forest-drift.graphics.v1';

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
