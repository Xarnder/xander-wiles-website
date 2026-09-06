import type { BuildingMaterialDefinition, MaterialPreset } from './MaterialTypes';
import { normalizeColorHex } from './MaterialTypes';

const STORAGE_KEY = 'forest-drift.paint.v1';

interface PersistedState {
	savedPresets: MaterialPreset[];
	lastSelected: BuildingMaterialDefinition | null;
}

function emptyState(): PersistedState {
	return { savedPresets: [], lastSelected: null };
}

/** `typeof localStorage` never throws even when the identifier doesn't exist at all — the safe way to detect it from a plain non-browser environment (this project's own Vitest suite runs in vitest's `node` environment, which has no `localStorage` global at all — see BuildingLevelManager.spec.ts's own FakeWindow for the established "stand in for a browser API" pattern this store's tests reuse via `vi.stubGlobal`). */
function getStorage(): Storage | null {
	return typeof localStorage === 'undefined' ? null : localStorage;
}

/** Loosely validates that parsed JSON actually has the shape we expect — a corrupted or hand-edited localStorage value degrades to an empty store rather than throwing. */
function isValidPreset(value: unknown): value is MaterialPreset {
	if (!value || typeof value !== 'object') return false;
	const preset = value as Partial<MaterialPreset>;
	return (
		typeof preset.id === 'string' &&
		typeof preset.name === 'string' &&
		!!preset.definition &&
		typeof preset.definition === 'object' &&
		(preset.definition as Partial<BuildingMaterialDefinition>).type === 'color' &&
		typeof (preset.definition as Partial<BuildingMaterialDefinition>).color === 'string'
	);
}

function isValidDefinition(value: unknown): value is BuildingMaterialDefinition {
	if (!value || typeof value !== 'object') return false;
	const def = value as Partial<BuildingMaterialDefinition>;
	return def.type === 'color' && typeof def.color === 'string';
}

function parseState(raw: string): PersistedState {
	try {
		const parsed = JSON.parse(raw) as Partial<PersistedState>;
		const savedPresets = Array.isArray(parsed.savedPresets)
			? parsed.savedPresets.filter(isValidPreset)
			: [];
		const lastSelected = isValidDefinition(parsed.lastSelected) ? parsed.lastSelected : null;
		return { savedPresets, lastSelected };
	} catch {
		return emptyState();
	}
}

/**
 * Local, per-browser persistence for the player's own paint preferences — saved colour presets and
 * the most recently selected paint colour. Deliberately `localStorage`, not the authoritative
 * building-state serialization `BuildingManager`/`ThreeScene` handle: a saved-colours palette is UI
 * preference data the player curated for themselves, not multiplayer building data (see the
 * README's "Paint Tool" section for why this stays entirely separate from `WallDefinition.material`
 * etc, which DO round-trip through the real save/load path).
 *
 * All reads/writes are wrapped so a missing/throwing `localStorage` (a non-browser test
 * environment, a private-browsing edge case, storage quota) degrades to an in-memory-only session
 * rather than crashing Paint Mode.
 */
export class MaterialPresetStore {
	private state: PersistedState;

	constructor() {
		this.state = this.load();
	}

	private load(): PersistedState {
		const storage = getStorage();
		if (!storage) return emptyState();
		try {
			const raw = storage.getItem(STORAGE_KEY);
			return raw ? parseState(raw) : emptyState();
		} catch {
			return emptyState();
		}
	}

	private persist(): void {
		const storage = getStorage();
		if (!storage) return;
		try {
			storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
		} catch {
			// Storage full/unavailable mid-session — the in-memory state (and this session's UI) stays
			// correct either way; only cross-session persistence silently fails.
		}
	}

	getSavedPresets(): MaterialPreset[] {
		return [...this.state.savedPresets];
	}

	/** Saves `definition` as a reusable preset — a no-op returning the existing preset if this exact colour is already saved, so repeatedly saving the same colour never piles up duplicate swatches. */
	savePreset(definition: BuildingMaterialDefinition, name?: string): MaterialPreset {
		const normalized: BuildingMaterialDefinition = {
			type: 'color',
			color: normalizeColorHex(definition.color)
		};
		const existing = this.state.savedPresets.find(
			(preset) => preset.definition.type === 'color' && preset.definition.color === normalized.color
		);
		if (existing) return existing;

		const preset: MaterialPreset = {
			id: crypto.randomUUID(),
			name: name ?? normalized.color,
			definition: normalized
		};
		this.state.savedPresets = [...this.state.savedPresets, preset];
		this.persist();
		return preset;
	}

	removePreset(id: string): boolean {
		const before = this.state.savedPresets.length;
		this.state.savedPresets = this.state.savedPresets.filter((preset) => preset.id !== id);
		const removed = this.state.savedPresets.length !== before;
		if (removed) this.persist();
		return removed;
	}

	getLastSelected(): BuildingMaterialDefinition | null {
		return this.state.lastSelected;
	}

	/** `null` means the player last had "Default" (no override) selected — a real, persisted choice, not "nothing recorded yet". */
	setLastSelected(definition: BuildingMaterialDefinition | null): void {
		this.state.lastSelected = definition
			? { type: 'color', color: normalizeColorHex(definition.color) }
			: null;
		this.persist();
	}
}
