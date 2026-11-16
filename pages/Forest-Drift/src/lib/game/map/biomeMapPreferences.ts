import { clampZoom, DEFAULT_MINIMAP_ZOOM, MINIMAP_SIZES, type MinimapSize } from './BiomeMapSystem';

/**
 * The minimap's settings, remembered per browser (biome minimap Q6, Q10). `show` is what the
 * settings menu and the `;` key change. Until the player has chosen (`chosen` false), it follows
 * the world: on with biomes, off without (Q6).
 */
export interface BiomeMapPreferences {
	show: boolean;
	chosen: boolean;
	size: MinimapSize;
	zoom: number;
	grid: boolean;
}

const STORAGE_KEY = 'forest-drift.biome-map.v1';

export function defaultBiomeMapPreferences(): BiomeMapPreferences {
	return { show: true, chosen: false, size: 'medium', zoom: DEFAULT_MINIMAP_ZOOM, grid: true };
}

function storage(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

export function loadBiomeMapPreferences(): BiomeMapPreferences {
	const prefs = defaultBiomeMapPreferences();
	try {
		const raw = storage()?.getItem(STORAGE_KEY);
		if (!raw) return prefs;
		const value = JSON.parse(raw) as Partial<Record<keyof BiomeMapPreferences, unknown>>;
		if (typeof value.show === 'boolean' && value.chosen === true) {
			prefs.show = value.show;
			prefs.chosen = true;
		}
		if (typeof value.size === 'string' && value.size in MINIMAP_SIZES)
			prefs.size = value.size as MinimapSize;
		if (typeof value.zoom === 'number' && Number.isFinite(value.zoom))
			prefs.zoom = clampZoom(value.zoom);
		if (typeof value.grid === 'boolean') prefs.grid = value.grid;
	} catch {
		// A blocked or corrupt store: defaults.
	}
	return prefs;
}

export function saveBiomeMapPreferences(prefs: BiomeMapPreferences): void {
	try {
		storage()?.setItem(STORAGE_KEY, JSON.stringify(prefs));
	} catch {
		// Only cross-session memory is lost.
	}
}
