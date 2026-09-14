import { STARTER_MINI_BUILD_ID } from './defaultMiniBuilds';
import type { PlaceObjectSelection } from './MiniBuildTypes';

const STORAGE_KEY = 'forest-drift.mini-builds.prefs.v1';
const MAX_RECENT = 8;

export type LibrarySort = 'recent' | 'name' | 'created';

/** On-screen Mini Build readouts. Mutated in place by the settings menu, then `saveDisplay()`. */
export interface MiniBuildDisplayPreferences {
	/** Chunk primitive counter in normal view (and the placement target while building). */
	showChunkUsage: boolean;
	/** 16m Mini Build chunk grid drawn on the ground around the player, with per-chunk usage. */
	showChunkBoundaries: boolean;
}

interface PersistedPreferences {
	lastSelection: PlaceObjectSelection;
	recent: PlaceObjectSelection[];
	sort: LibrarySort;
	display: MiniBuildDisplayPreferences;
}

export function selectionKey(selection: PlaceObjectSelection): string {
	switch (selection.type) {
		case 'mini-build':
		case 'personal-design':
			return `design:${selection.designId}`;
		case 'default-design':
			return `default:${selection.defaultId}`;
		case 'light':
			return `light:${selection.kind}`;
	}
}

function isSelection(value: unknown): value is PlaceObjectSelection {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	if ((v.type === 'mini-build' || v.type === 'personal-design') && typeof v.designId === 'string')
		return true;
	if (v.type === 'default-design' && typeof v.defaultId === 'string') return true;
	return (
		v.type === 'light' && (v.kind === 'torch' || v.kind === 'lantern' || v.kind === 'fireplace')
	);
}

function defaults(): PersistedPreferences {
	return {
		lastSelection: { type: 'default-design', defaultId: STARTER_MINI_BUILD_ID },
		recent: [],
		sort: 'recent',
		display: { showChunkUsage: true, showChunkBoundaries: false }
	};
}

/**
 * Local player preferences for the Place Object tool: last selection, recently used objects and the
 * library sort. Never world state — a world opened on another machine shouldn't inherit them.
 */
export class MiniBuildPreferences {
	private state: PersistedPreferences;

	constructor() {
		this.state = this.load();
	}

	get lastSelection(): PlaceObjectSelection {
		return this.state.lastSelection;
	}

	get recent(): PlaceObjectSelection[] {
		return [...this.state.recent];
	}

	get sort(): LibrarySort {
		return this.state.sort;
	}

	/** Live object — settings fields bind to it directly; call `saveDisplay()` after a change. */
	get display(): MiniBuildDisplayPreferences {
		return this.state.display;
	}

	saveDisplay(): void {
		this.persist();
	}

	/** Most-recent-first index of a design (for "Recently Used" sort); Infinity when never used. */
	recentRank(selection: PlaceObjectSelection): number {
		const key = selectionKey(selection);
		const index = this.state.recent.findIndex((entry) => selectionKey(entry) === key);
		return index < 0 ? Infinity : index;
	}

	remember(selection: PlaceObjectSelection): void {
		const key = selectionKey(selection);
		this.state.lastSelection = selection;
		this.state.recent = [
			selection,
			...this.state.recent.filter((entry) => selectionKey(entry) !== key)
		].slice(0, MAX_RECENT);
		this.persist();
	}

	forget(predicate: (selection: PlaceObjectSelection) => boolean): void {
		this.state.recent = this.state.recent.filter((entry) => !predicate(entry));
		if (predicate(this.state.lastSelection)) this.state.lastSelection = defaults().lastSelection;
		this.persist();
	}

	setSort(sort: LibrarySort): void {
		this.state.sort = sort;
		this.persist();
	}

	private load(): PersistedPreferences {
		try {
			const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
			if (!raw) return defaults();
			const parsed = JSON.parse(raw) as Partial<PersistedPreferences>;
			return {
				lastSelection: isSelection(parsed.lastSelection)
					? parsed.lastSelection
					: defaults().lastSelection,
				recent: Array.isArray(parsed.recent)
					? parsed.recent.filter(isSelection).slice(0, MAX_RECENT)
					: [],
				sort: parsed.sort === 'name' || parsed.sort === 'created' ? parsed.sort : 'recent',
				display: {
					showChunkUsage:
						typeof parsed.display?.showChunkUsage === 'boolean'
							? parsed.display.showChunkUsage
							: true,
					showChunkBoundaries: parsed.display?.showChunkBoundaries === true
				}
			};
		} catch {
			return defaults();
		}
	}

	private persist(): void {
		try {
			if (typeof localStorage !== 'undefined')
				localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
		} catch {
			// Private mode / quota — keep the in-memory preferences.
		}
	}
}
