import type { BuildingSettings } from './FoundationTypes';
import type { FurnitureKind } from './FurnitureTypes';
import { isFurnitureKind } from './FurnitureTypes';
import {
	DEFAULT_FURNITURE_KIND,
	getFurnitureCatalogueEntry,
	type FurnitureCatalogueEntry
} from './furnitureCatalogue';

const STORAGE_KEY = 'forest-drift.furniture.v1';

export interface FurnitureKindSettings {
	width: number;
	depth: number;
	height: number;
	backrest: boolean;
	headboard: boolean;
	shelfCount: number;
	primaryColor: string;
	secondaryColor: string;
}

interface PersistedState {
	lastKind: FurnitureKind;
	recentKinds: FurnitureKind[];
	byKind: Partial<Record<FurnitureKind, FurnitureKindSettings>>;
}

function emptyState(): PersistedState {
	return { lastKind: DEFAULT_FURNITURE_KIND, recentKinds: [], byKind: {} };
}

function getStorage(): Storage | null {
	return typeof localStorage === 'undefined' ? null : localStorage;
}

function isKindSettings(value: unknown): value is FurnitureKindSettings {
	if (!value || typeof value !== 'object') return false;
	const settings = value as Partial<FurnitureKindSettings>;
	return (
		typeof settings.width === 'number' &&
		typeof settings.depth === 'number' &&
		typeof settings.height === 'number' &&
		typeof settings.primaryColor === 'string' &&
		typeof settings.secondaryColor === 'string'
	);
}

function parseState(raw: string): PersistedState {
	try {
		const parsed = JSON.parse(raw) as Partial<PersistedState>;
		const lastKind = isFurnitureKind(parsed.lastKind) ? parsed.lastKind : DEFAULT_FURNITURE_KIND;
		const recentKinds = Array.isArray(parsed.recentKinds)
			? parsed.recentKinds.filter(isFurnitureKind)
			: [];
		const byKind: PersistedState['byKind'] = {};
		if (parsed.byKind && typeof parsed.byKind === 'object') {
			for (const [kind, settings] of Object.entries(parsed.byKind)) {
				if (isFurnitureKind(kind) && isKindSettings(settings)) byKind[kind] = settings;
			}
		}
		return { lastKind, recentKinds, byKind };
	} catch {
		return emptyState();
	}
}

export function defaultKindSettings(entry: FurnitureCatalogueEntry): FurnitureKindSettings {
	const backrest = entry.params.find((param) => param.key === 'backrest');
	const headboard = entry.params.find((param) => param.key === 'headboard');
	const shelfCount = entry.params.find((param) => param.key === 'shelfCount');
	return {
		width: entry.dimensions.defaultWidth,
		depth: entry.dimensions.defaultDepth,
		height: entry.dimensions.defaultHeight,
		backrest: backrest?.type === 'boolean' ? backrest.defaultValue : true,
		headboard: headboard?.type === 'boolean' ? headboard.defaultValue : true,
		shelfCount: shelfCount?.type === 'integer' ? shelfCount.defaultValue : 4,
		primaryColor: entry.defaultPrimary,
		secondaryColor: entry.defaultSecondary
	};
}

/**
 * Last-used Place Object catalogue choice and per-type dimensions. localStorage preference data,
 * never world save state.
 */
export class FurniturePresetStore {
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
			// Quota / private mode — keep the in-memory session.
		}
	}

	getLastKind(): FurnitureKind {
		return this.state.lastKind;
	}

	getRecentKinds(): FurnitureKind[] {
		return [...this.state.recentKinds];
	}

	getKindSettings(kind: FurnitureKind): FurnitureKindSettings {
		return this.state.byKind[kind] ?? defaultKindSettings(getFurnitureCatalogueEntry(kind));
	}

	remember(kind: FurnitureKind, settings: FurnitureKindSettings): void {
		this.state.lastKind = kind;
		this.state.byKind[kind] = { ...settings };
		this.state.recentKinds = [kind, ...this.state.recentKinds.filter((entry) => entry !== kind)].slice(
			0,
			8
		);
		this.persist();
	}

	captureFrom(settings: BuildingSettings): FurnitureKindSettings {
		return {
			width: settings.furnitureWidth,
			depth: settings.furnitureDepth,
			height: settings.furnitureHeight,
			backrest: settings.furnitureBackrest,
			headboard: settings.furnitureHeadboard,
			shelfCount: settings.furnitureShelfCount,
			primaryColor: settings.furniturePrimaryColor,
			secondaryColor: settings.furnitureSecondaryColor
		};
	}

	applyTo(settings: BuildingSettings, kind: FurnitureKind): void {
		this.remember(settings.furnitureKind, this.captureFrom(settings));
		const stored = this.getKindSettings(kind);
		settings.furnitureKind = kind;
		settings.furnitureWidth = stored.width;
		settings.furnitureDepth = stored.depth;
		settings.furnitureHeight = stored.height;
		settings.furnitureBackrest = stored.backrest;
		settings.furnitureHeadboard = stored.headboard;
		settings.furnitureShelfCount = stored.shelfCount;
		settings.furniturePrimaryColor = stored.primaryColor;
		settings.furnitureSecondaryColor = stored.secondaryColor;
		this.remember(kind, stored);
	}

	hydrate(settings: BuildingSettings): void {
		const kind = this.getLastKind();
		const stored = this.getKindSettings(kind);
		settings.furnitureKind = kind;
		settings.furnitureWidth = stored.width;
		settings.furnitureDepth = stored.depth;
		settings.furnitureHeight = stored.height;
		settings.furnitureBackrest = stored.backrest;
		settings.furnitureHeadboard = stored.headboard;
		settings.furnitureShelfCount = stored.shelfCount;
		settings.furniturePrimaryColor = stored.primaryColor;
		settings.furnitureSecondaryColor = stored.secondaryColor;
	}
}
