import type { FurnitureKind } from './FurnitureTypes';

export type FurnitureCategory =
	| 'sleeping'
	| 'seating'
	| 'tables'
	| 'kitchen'
	| 'storage'
	| 'lighting';

export interface FurnitureDimensionRules {
	minWidth: number;
	maxWidth: number;
	minDepth: number;
	maxDepth: number;
	minHeight: number;
	maxHeight: number;
	defaultWidth: number;
	defaultDepth: number;
	defaultHeight: number;
	widthStep: number;
	depthStep: number;
	heightStep: number;
	widthLabel: string;
	depthLabel: string;
	heightLabel: string;
}

export type FurnitureParamField =
	| { key: string; label: string; type: 'boolean'; defaultValue: boolean }
	| { key: string; label: string; type: 'integer'; defaultValue: number; min: number; max: number };

export interface FurnitureSizePreset {
	id: string;
	name: string;
	width: number;
	depth: number;
	height: number;
}

export type FurniturePlacementRule = 'any' | 'surface';
export type FurnitureCollisionType = 'box' | 'cylinder' | 'none';

export interface FurnitureCatalogueEntry {
	kind: FurnitureKind;
	name: string;
	category: FurnitureCategory;
	placement: FurniturePlacementRule;
	collision: FurnitureCollisionType;
	dimensions: FurnitureDimensionRules;
	params: readonly FurnitureParamField[];
	presets: readonly FurnitureSizePreset[];
	defaultPrimary: string;
	defaultSecondary: string;
	/** Barrel diameter is stored as width; depth always tracks width. */
	syncDepthToWidth?: boolean;
}

export const FURNITURE_WOOD = '#8B5A2B';
export const FURNITURE_DARK_WOOD = '#5C3A22';
export const FURNITURE_FABRIC = '#E8DCC8';
export const FURNITURE_STONE = '#8A8578';
export const FURNITURE_METAL = '#4A4A4A';
export const FURNITURE_CREAM = '#F1E7D0';

export const DEFAULT_FURNITURE_KIND: FurnitureKind = 'chair';

const CATEGORY_ORDER: FurnitureCategory[] = [
	'sleeping',
	'seating',
	'tables',
	'kitchen',
	'storage',
	'lighting'
];

export const FURNITURE_CATEGORY_LABELS: Record<FurnitureCategory, string> = {
	sleeping: 'Sleeping',
	seating: 'Seating',
	tables: 'Tables',
	kitchen: 'Kitchen',
	storage: 'Storage',
	lighting: 'Lighting'
};

function dims(
	partial: Omit<FurnitureDimensionRules, 'widthLabel' | 'depthLabel' | 'heightLabel'> & {
		widthLabel?: string;
		depthLabel?: string;
		heightLabel?: string;
	}
): FurnitureDimensionRules {
	return {
		widthLabel: 'Width',
		depthLabel: 'Depth',
		heightLabel: 'Height',
		...partial
	};
}

const CATALOGUE: Record<FurnitureKind, FurnitureCatalogueEntry> = {
	bed: {
		kind: 'bed',
		name: 'Bed',
		category: 'sleeping',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.8,
			maxWidth: 2.2,
			minDepth: 1.6,
			maxDepth: 2.4,
			minHeight: 0.4,
			maxHeight: 1.1,
			defaultWidth: 1.4,
			defaultDepth: 2,
			defaultHeight: 0.55,
			widthStep: 0.1,
			depthStep: 0.1,
			heightStep: 0.05,
			depthLabel: 'Length'
		}),
		params: [{ key: 'headboard', label: 'Headboard', type: 'boolean', defaultValue: true }],
		presets: [
			{ id: 'single', name: 'Single', width: 0.9, depth: 2, height: 0.55 },
			{ id: 'double', name: 'Double', width: 1.4, depth: 2, height: 0.55 },
			{ id: 'large', name: 'Large', width: 1.8, depth: 2.1, height: 0.6 }
		],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_FABRIC
	},
	'small-table': {
		kind: 'small-table',
		name: 'Bedside Table',
		category: 'sleeping',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.3,
			maxWidth: 0.8,
			minDepth: 0.3,
			maxDepth: 0.8,
			minHeight: 0.35,
			maxHeight: 0.8,
			defaultWidth: 0.45,
			defaultDepth: 0.4,
			defaultHeight: 0.55,
			widthStep: 0.05,
			depthStep: 0.05,
			heightStep: 0.05
		}),
		params: [],
		presets: [],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_DARK_WOOD
	},
	wardrobe: {
		kind: 'wardrobe',
		name: 'Wardrobe',
		category: 'sleeping',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.8,
			maxWidth: 2.4,
			minDepth: 0.4,
			maxDepth: 0.8,
			minHeight: 1.4,
			maxHeight: 2.6,
			defaultWidth: 1.2,
			defaultDepth: 0.55,
			defaultHeight: 2,
			widthStep: 0.1,
			depthStep: 0.05,
			heightStep: 0.1
		}),
		params: [],
		presets: [],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_DARK_WOOD
	},
	chair: {
		kind: 'chair',
		name: 'Chair',
		category: 'seating',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.35,
			maxWidth: 0.7,
			minDepth: 0.35,
			maxDepth: 0.7,
			minHeight: 0.7,
			maxHeight: 1.2,
			defaultWidth: 0.5,
			defaultDepth: 0.5,
			defaultHeight: 0.9,
			widthStep: 0.05,
			depthStep: 0.05,
			heightStep: 0.05
		}),
		params: [{ key: 'backrest', label: 'Backrest', type: 'boolean', defaultValue: true }],
		presets: [],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_FABRIC
	},
	stool: {
		kind: 'stool',
		name: 'Stool',
		category: 'seating',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.28,
			maxWidth: 0.55,
			minDepth: 0.28,
			maxDepth: 0.55,
			minHeight: 0.35,
			maxHeight: 0.7,
			defaultWidth: 0.38,
			defaultDepth: 0.38,
			defaultHeight: 0.45,
			widthStep: 0.05,
			depthStep: 0.05,
			heightStep: 0.05
		}),
		params: [],
		presets: [],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_DARK_WOOD
	},
	bench: {
		kind: 'bench',
		name: 'Bench',
		category: 'seating',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.8,
			maxWidth: 5,
			minDepth: 0.32,
			maxDepth: 0.7,
			minHeight: 0.4,
			maxHeight: 1.1,
			defaultWidth: 1.6,
			defaultDepth: 0.42,
			defaultHeight: 0.85,
			widthStep: 0.25,
			depthStep: 0.05,
			heightStep: 0.05
		}),
		params: [{ key: 'backrest', label: 'Backrest', type: 'boolean', defaultValue: false }],
		presets: [
			{ id: '1m', name: '1m', width: 1, depth: 0.42, height: 0.85 },
			{ id: '2m', name: '2m', width: 2, depth: 0.42, height: 0.85 },
			{ id: '3m', name: '3m', width: 3, depth: 0.42, height: 0.85 },
			{ id: '5m', name: '5m', width: 5, depth: 0.42, height: 0.85 }
		],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_DARK_WOOD
	},
	table: {
		kind: 'table',
		name: 'Table',
		category: 'tables',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.7,
			maxWidth: 4,
			minDepth: 0.5,
			maxDepth: 1.6,
			minHeight: 0.55,
			maxHeight: 0.9,
			defaultWidth: 1.4,
			defaultDepth: 0.8,
			defaultHeight: 0.75,
			widthStep: 0.25,
			depthStep: 0.1,
			heightStep: 0.05
		}),
		params: [],
		presets: [
			{ id: 'small', name: 'Small', width: 0.9, depth: 0.7, height: 0.75 },
			{ id: 'dining', name: 'Dining', width: 1.6, depth: 0.9, height: 0.75 },
			{ id: 'large', name: 'Large', width: 2.4, depth: 1.1, height: 0.76 }
		],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_DARK_WOOD
	},
	workbench: {
		kind: 'workbench',
		name: 'Work Bench',
		category: 'tables',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 1,
			maxWidth: 3.5,
			minDepth: 0.5,
			maxDepth: 1,
			minHeight: 0.7,
			maxHeight: 1,
			defaultWidth: 1.6,
			defaultDepth: 0.7,
			defaultHeight: 0.85,
			widthStep: 0.25,
			depthStep: 0.05,
			heightStep: 0.05
		}),
		params: [],
		presets: [],
		defaultPrimary: FURNITURE_DARK_WOOD,
		defaultSecondary: FURNITURE_WOOD
	},
	'kitchen-counter': {
		kind: 'kitchen-counter',
		name: 'Kitchen Counter',
		category: 'kitchen',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.6,
			maxWidth: 4,
			minDepth: 0.45,
			maxDepth: 0.75,
			minHeight: 0.8,
			maxHeight: 1.05,
			defaultWidth: 1.5,
			defaultDepth: 0.6,
			defaultHeight: 0.9,
			widthStep: 0.25,
			depthStep: 0.05,
			heightStep: 0.05
		}),
		params: [],
		presets: [
			{ id: '1m', name: '1m', width: 1, depth: 0.6, height: 0.9 },
			{ id: '2m', name: '2m', width: 2, depth: 0.6, height: 0.9 },
			{ id: '3m', name: '3m', width: 3, depth: 0.6, height: 0.9 }
		],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_CREAM
	},
	'kitchen-counter-sink': {
		kind: 'kitchen-counter-sink',
		name: 'Kitchen Counter with Sink',
		category: 'kitchen',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.8,
			maxWidth: 4,
			minDepth: 0.45,
			maxDepth: 0.75,
			minHeight: 0.8,
			maxHeight: 1.05,
			defaultWidth: 1.5,
			defaultDepth: 0.6,
			defaultHeight: 0.9,
			widthStep: 0.25,
			depthStep: 0.05,
			heightStep: 0.05
		}),
		params: [],
		presets: [
			{ id: '1m', name: '1m', width: 1, depth: 0.6, height: 0.9 },
			{ id: '2m', name: '2m', width: 2, depth: 0.6, height: 0.9 },
			{ id: '3m', name: '3m', width: 3, depth: 0.6, height: 0.9 }
		],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_METAL
	},
	furnace: {
		kind: 'furnace',
		name: 'Furnace',
		category: 'kitchen',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.5,
			maxWidth: 1.1,
			minDepth: 0.45,
			maxDepth: 0.85,
			minHeight: 0.7,
			maxHeight: 1.4,
			defaultWidth: 0.7,
			defaultDepth: 0.6,
			defaultHeight: 0.95,
			widthStep: 0.05,
			depthStep: 0.05,
			heightStep: 0.05
		}),
		params: [],
		presets: [],
		defaultPrimary: FURNITURE_METAL,
		defaultSecondary: FURNITURE_STONE
	},
	cupboard: {
		kind: 'cupboard',
		name: 'Cupboard',
		category: 'kitchen',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.5,
			maxWidth: 1.8,
			minDepth: 0.32,
			maxDepth: 0.65,
			minHeight: 0.7,
			maxHeight: 1.4,
			defaultWidth: 0.9,
			defaultDepth: 0.4,
			defaultHeight: 1,
			widthStep: 0.1,
			depthStep: 0.05,
			heightStep: 0.05
		}),
		params: [],
		presets: [],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_DARK_WOOD
	},
	chest: {
		kind: 'chest',
		name: 'Chest',
		category: 'storage',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.5,
			maxWidth: 1.4,
			minDepth: 0.35,
			maxDepth: 0.7,
			minHeight: 0.35,
			maxHeight: 0.75,
			defaultWidth: 0.8,
			defaultDepth: 0.45,
			defaultHeight: 0.5,
			widthStep: 0.05,
			depthStep: 0.05,
			heightStep: 0.05
		}),
		params: [],
		presets: [],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_METAL
	},
	barrel: {
		kind: 'barrel',
		name: 'Barrel',
		category: 'storage',
		placement: 'surface',
		collision: 'cylinder',
		dimensions: dims({
			minWidth: 0.35,
			maxWidth: 1,
			minDepth: 0.35,
			maxDepth: 1,
			minHeight: 0.4,
			maxHeight: 1.2,
			defaultWidth: 0.55,
			defaultDepth: 0.55,
			defaultHeight: 0.75,
			widthStep: 0.05,
			depthStep: 0.05,
			heightStep: 0.05,
			widthLabel: 'Diameter'
		}),
		params: [],
		presets: [
			{ id: 'small', name: 'Small', width: 0.4, depth: 0.4, height: 0.5 },
			{ id: 'standard', name: 'Standard', width: 0.55, depth: 0.55, height: 0.75 },
			{ id: 'large', name: 'Large', width: 0.8, depth: 0.8, height: 1 }
		],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_METAL,
		syncDepthToWidth: true
	},
	shelf: {
		kind: 'shelf',
		name: 'Shelf',
		category: 'storage',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.5,
			maxWidth: 2.5,
			minDepth: 0.2,
			maxDepth: 0.5,
			minHeight: 0.8,
			maxHeight: 2.4,
			defaultWidth: 1.2,
			defaultDepth: 0.3,
			defaultHeight: 1.6,
			widthStep: 0.1,
			depthStep: 0.05,
			heightStep: 0.1
		}),
		params: [{ key: 'shelfCount', label: 'Shelves', type: 'integer', defaultValue: 4, min: 2, max: 8 }],
		presets: [],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_DARK_WOOD
	},
	bookcase: {
		kind: 'bookcase',
		name: 'Bookcase',
		category: 'storage',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.6,
			maxWidth: 2.2,
			minDepth: 0.22,
			maxDepth: 0.5,
			minHeight: 1,
			maxHeight: 2.5,
			defaultWidth: 1,
			defaultDepth: 0.32,
			defaultHeight: 1.8,
			widthStep: 0.1,
			depthStep: 0.05,
			heightStep: 0.1
		}),
		params: [{ key: 'shelfCount', label: 'Shelves', type: 'integer', defaultValue: 5, min: 2, max: 8 }],
		presets: [],
		defaultPrimary: FURNITURE_WOOD,
		defaultSecondary: FURNITURE_DARK_WOOD
	},
	fireplace: {
		kind: 'fireplace',
		name: 'Fireplace',
		category: 'lighting',
		placement: 'surface',
		collision: 'box',
		dimensions: dims({
			minWidth: 0.8,
			maxWidth: 2,
			minDepth: 0.4,
			maxDepth: 0.8,
			minHeight: 0.8,
			maxHeight: 1.6,
			defaultWidth: 1.2,
			defaultDepth: 0.55,
			defaultHeight: 1.15,
			widthStep: 0.1,
			depthStep: 0.05,
			heightStep: 0.05
		}),
		params: [],
		presets: [],
		defaultPrimary: FURNITURE_STONE,
		defaultSecondary: FURNITURE_DARK_WOOD
	},
	lantern: {
		kind: 'lantern',
		name: 'Lantern',
		category: 'lighting',
		placement: 'surface',
		collision: 'none',
		dimensions: dims({
			minWidth: 0.12,
			maxWidth: 0.35,
			minDepth: 0.12,
			maxDepth: 0.35,
			minHeight: 0.25,
			maxHeight: 0.6,
			defaultWidth: 0.18,
			defaultDepth: 0.18,
			defaultHeight: 0.38,
			widthStep: 0.02,
			depthStep: 0.02,
			heightStep: 0.02
		}),
		params: [],
		presets: [],
		defaultPrimary: FURNITURE_METAL,
		defaultSecondary: FURNITURE_CREAM
	},
	torch: {
		kind: 'torch',
		name: 'Torch',
		category: 'lighting',
		placement: 'any',
		collision: 'none',
		dimensions: dims({
			minWidth: 0.08,
			maxWidth: 0.2,
			minDepth: 0.08,
			maxDepth: 0.2,
			minHeight: 0.3,
			maxHeight: 0.7,
			defaultWidth: 0.12,
			defaultDepth: 0.12,
			defaultHeight: 0.5,
			widthStep: 0.02,
			depthStep: 0.02,
			heightStep: 0.02
		}),
		params: [],
		presets: [],
		defaultPrimary: FURNITURE_DARK_WOOD,
		defaultSecondary: '#FFB347'
	}
};

export const FURNITURE_CATALOGUE: readonly FurnitureCatalogueEntry[] = Object.freeze(
	(Object.keys(CATALOGUE) as FurnitureKind[]).map((kind) => CATALOGUE[kind])
);

export function getFurnitureCatalogueEntry(kind: FurnitureKind): FurnitureCatalogueEntry {
	return CATALOGUE[kind];
}

export function furnitureCategoryOrder(): readonly FurnitureCategory[] {
	return CATEGORY_ORDER;
}

export function furnitureEntriesByCategory(): {
	category: FurnitureCategory;
	label: string;
	entries: FurnitureCatalogueEntry[];
}[] {
	return CATEGORY_ORDER.map((category) => ({
		category,
		label: FURNITURE_CATEGORY_LABELS[category],
		entries: FURNITURE_CATALOGUE.filter((entry) => entry.category === category)
	}));
}

export interface FurnitureBuildInput {
	kind: FurnitureKind;
	width: number;
	depth: number;
	height: number;
	backrest: boolean;
	headboard: boolean;
	shelfCount: number;
}

export function clampFurnitureDimension(
	value: number,
	min: number,
	max: number,
	step: number
): number {
	if (!Number.isFinite(value)) return min;
	const clamped = Math.min(max, Math.max(min, value));
	if (step <= 0) return clamped;
	const snapped = Math.round(clamped / step) * step;
	return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
}

export function clampFurnitureToRules(
	kind: FurnitureKind,
	width: number,
	depth: number,
	height: number
): { width: number; depth: number; height: number } {
	const rules = CATALOGUE[kind].dimensions;
	const nextWidth = clampFurnitureDimension(width, rules.minWidth, rules.maxWidth, rules.widthStep);
	let nextDepth = clampFurnitureDimension(depth, rules.minDepth, rules.maxDepth, rules.depthStep);
	const nextHeight = clampFurnitureDimension(
		height,
		rules.minHeight,
		rules.maxHeight,
		rules.heightStep
	);
	if (CATALOGUE[kind].syncDepthToWidth) nextDepth = nextWidth;
	return { width: nextWidth, depth: nextDepth, height: nextHeight };
}

function booleanParam(
	parameters: Record<string, unknown> | undefined,
	key: string,
	fallback: boolean
): boolean {
	const value = parameters?.[key];
	return typeof value === 'boolean' ? value : fallback;
}

function integerParam(
	parameters: Record<string, unknown> | undefined,
	field: Extract<FurnitureParamField, { type: 'integer' }>,
	fallback: number
): number {
	const raw = parameters?.[field.key];
	const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
	return Math.round(Math.min(field.max, Math.max(field.min, value)));
}

export function resolveFurnitureBuildInput(args: {
	kind: FurnitureKind;
	dimensions?: { width: number; depth: number; height: number };
	parameters?: Record<string, unknown>;
}): FurnitureBuildInput {
	const entry = CATALOGUE[args.kind];
	const dims = clampFurnitureToRules(
		args.kind,
		args.dimensions?.width ?? entry.dimensions.defaultWidth,
		args.dimensions?.depth ?? entry.dimensions.defaultDepth,
		args.dimensions?.height ?? entry.dimensions.defaultHeight
	);
	const backrestField = entry.params.find((param) => param.key === 'backrest');
	const headboardField = entry.params.find((param) => param.key === 'headboard');
	const shelfField = entry.params.find((param) => param.key === 'shelfCount');
	return {
		kind: args.kind,
		width: dims.width,
		depth: dims.depth,
		height: dims.height,
		backrest: booleanParam(
			args.parameters,
			'backrest',
			backrestField?.type === 'boolean' ? backrestField.defaultValue : true
		),
		headboard: booleanParam(
			args.parameters,
			'headboard',
			headboardField?.type === 'boolean' ? headboardField.defaultValue : true
		),
		shelfCount:
			shelfField?.type === 'integer'
				? integerParam(args.parameters, shelfField, shelfField.defaultValue)
				: 4
	};
}
