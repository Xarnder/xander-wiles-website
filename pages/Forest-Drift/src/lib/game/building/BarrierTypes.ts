/**
 * Fences and railings ("barriers", hotbar slot 2 → Fence / Railing). Framework- and Three.js-free,
 * same rule as every other *Types.ts file: this is the serializable, authoritative record, and the
 * only thing a world save ever contains for a barrier.
 *
 * A barrier is PATH + STYLE. Posts, balusters and rails are derived from it every time it is built
 * (barrierLayout.ts → BarrierGeometryCompiler.ts) and are never stored: a 40 m fence with 300
 * pickets is one small record. Fences and railings share one generator — `type` only records what
 * the player drew it as; the style decides what it looks like.
 *
 * Coordinates: when `foundationId` is set, `points` are foundation-local metres (the same space
 * walls use: origin at the footprint's min corner, Y=0 at the foundation top), so a balcony railing
 * stays exactly where it was drawn on its storey. Terrain fences (`foundationId: null`) store stable
 * world metres. `y` is each point's BASE elevation in that space, captured when it was clicked —
 * the level's floor, a stair tread, or the ground.
 */

import type { BuildingMaterialDefinition } from './MaterialTypes';

export const BARRIER_TYPES = ['fence', 'railing'] as const;
export type BarrierType = (typeof BARRIER_TYPES)[number];

/**
 * How post and baluster bases are found:
 * - `flat` — every base at the first point's elevation; the top rail is level (balconies, landings).
 * - `linear-slope` — bases and rail run in a straight line between each segment's end points
 *   (stairs, ramps, deliberately sloped railings).
 * - `follow-surface` — every post and baluster stands on the surface under it; the top rail runs in
 *   straight lines between post tops (fences over rolling terrain).
 * Posts stay vertical in every mode. A stepped mode can be added here later without touching saves.
 */
export const BARRIER_BASE_MODES = ['flat', 'linear-slope', 'follow-surface'] as const;
export type BarrierBaseMode = (typeof BARRIER_BASE_MODES)[number];
/** The tool setting: `auto` picks follow-surface on terrain, flat or linear-slope on a building. */
export type BarrierBaseModeSetting = BarrierBaseMode | 'auto';

export const BARRIER_POST_PROFILES = [
	'square',
	'chamfered',
	'tapered',
	'turned',
	'classic-newel'
] as const;
export type BarrierPostProfile = (typeof BARRIER_POST_PROFILES)[number];

export const BARRIER_POST_CAPS = ['flat', 'pyramid', 'bevelled', 'ball', 'turned'] as const;
export type BarrierPostCap = (typeof BARRIER_POST_CAPS)[number];

export const BARRIER_BALUSTER_STYLES = [
	'square',
	'tapered',
	'chamfered',
	'turned',
	'slender',
	'none'
] as const;
export type BarrierBalusterStyle = (typeof BARRIER_BALUSTER_STYLES)[number];

export const BARRIER_RAIL_PROFILES = ['flat', 'rectangular', 'chamfered', 'rounded'] as const;
export type BarrierRailProfile = (typeof BARRIER_RAIL_PROFILES)[number];

export const BARRIER_WOOD_IDS = [
	'oak',
	'dark-oak',
	'walnut',
	'pine',
	'painted',
	'weathered'
] as const;
export type BarrierWoodId = (typeof BARRIER_WOOD_IDS)[number];

/**
 * Wood choices: a solid-wood shader preset (`timber` variant, see `materials/shader/woodShader.ts`)
 * and the average colour it is tinted to. Painting a barrier replaces the colour, never the grain.
 */
export const BARRIER_WOODS: Readonly<
	Record<
		BarrierWoodId,
		{
			label: string;
			variant: 'dark-oak' | 'aged-brown' | 'weathered' | 'fresh' | 'dark-stained';
			color: string;
		}
	>
> = {
	oak: { label: 'Oak', variant: 'aged-brown', color: '#A27A4E' },
	'dark-oak': { label: 'Dark Oak', variant: 'dark-oak', color: '#5E4630' },
	walnut: { label: 'Walnut', variant: 'dark-stained', color: '#4D2F1E' },
	pine: { label: 'Pine', variant: 'fresh', color: '#C9A46E' },
	painted: { label: 'Painted White', variant: 'fresh', color: '#E6E1D6' },
	weathered: { label: 'Weathered', variant: 'weathered', color: '#8A7B66' }
};

export interface BarrierPostStyle {
	profile: BarrierPostProfile;
	cap: BarrierPostCap;
	/** Square footprint side (or turned diameter), metres. */
	width: number;
	/**
	 * How far the post body rises above the top of the top rail. `0` means the rail runs over the
	 * post (deck railings: the rail sits on the posts and is mitred at corners); above `0` the rails
	 * die into the post (newels, fence posts) and the cap sits on top.
	 */
	extendAbove: number;
}

export interface BarrierStyleDefinition {
	/** Which preset these values started from — only used to label the customise panel. */
	presetId: BarrierPresetId;
	/** Top of the top rail above the base, metres. */
	height: number;
	topRail: {
		profile: BarrierRailProfile;
		width: number;
		height: number;
		/** Past an open end whose post sits under the rail. */
		overhang: number;
	};
	bottomRail: {
		enabled: boolean;
		/** Top of the bottom rail above the base. */
		height: number;
		width: number;
		thickness: number;
	};
	/** Extra horizontal rails spaced evenly between the bottom and top rail (post-and-rail fences). */
	midRails: number;
	/** Open ends and turning corners. */
	endPost: BarrierPostStyle;
	/** Intermediate posts along a long run (and straight-through vertices). */
	structuralPost: BarrierPostStyle & { enabled: boolean };
	baluster: {
		style: BarrierBalusterStyle;
		width: number;
		depth: number;
		/** Gap under a baluster with no bottom rail. */
		clearance: number;
	};
	/** Target centre-to-centre spacing; the real spacing is balanced per bay (see barrierLayout.ts). */
	balusterSpacing: number;
	structuralPostSpacing: number;
	wood: BarrierWoodId;
	/** Caps and newel tops in a second wood; `null` keeps them in `wood` (one draw call). */
	accentWood: BarrierWoodId | null;
}

/** One authored path point. See the module doc comment for which space these are in. */
export interface BarrierPathPoint {
	x: number;
	y: number;
	z: number;
}

export interface BarrierDefinition {
	id: string;
	type: BarrierType;
	/** `null` for a terrain fence (world-space points). */
	foundationId: string | null;
	/** The storey it was drawn on (informational; elevation lives in `points[].y`). */
	levelIndex?: number;
	points: BarrierPathPoint[];
	closed: boolean;
	baseMode: BarrierBaseMode;
	style: BarrierStyleDefinition;
	/** Paint override of the main wood colour (`undefined` = the wood's own colour). */
	material?: BuildingMaterialDefinition;
}

/** The Fence / Railing tool's next-placement settings (`E` panel). Per session, never saved. */
export interface BarrierDraftSettings {
	type: BarrierType;
	baseMode: BarrierBaseModeSetting;
	style: BarrierStyleDefinition;
}

/** Central limits: sliders, validation and the drawing tool all read these. */
export const BARRIER_LIMITS = {
	height: { min: 0.4, max: 2.2, step: 0.05 },
	balusterSpacing: { min: 0.06, max: 0.6, step: 0.01 },
	balusterWidth: { min: 0.015, max: 0.12, step: 0.005 },
	postSpacing: { min: 0.8, max: 4, step: 0.1 },
	postWidth: { min: 0.04, max: 0.25, step: 0.005 },
	postExtendAbove: { min: 0, max: 0.4, step: 0.01 },
	topRailWidth: { min: 0.03, max: 0.2, step: 0.005 },
	topRailHeight: { min: 0.025, max: 0.15, step: 0.005 },
	bottomRailHeight: { min: 0.03, max: 0.5, step: 0.01 },
	midRails: { min: 0, max: 3, step: 1 }
} as const;

/** Longest single click-to-click segment; longer runs are drawn as several connected segments. */
export const BARRIER_MAX_SEGMENT_LENGTH = 40;
export const BARRIER_MIN_SEGMENT_LENGTH = 0.25;
export const BARRIER_MAX_POINTS = 128;
export const MAX_BARRIERS = 4_000;
/** Baluster spacing never tighter than the baluster plus this gap (or `balusterSpacing.min`). */
export const BARRIER_MIN_BALUSTER_GAP = 0.025;
/** Hard ceiling on balusters per bay, whatever the settings say. */
export const BARRIER_MAX_BALUSTERS_PER_BAY = 400;

export const BARRIER_PRESET_IDS = [
	'classic-interior',
	'turned-baluster',
	'simple-interior',
	'fancy-newel',
	'modern-wood',
	'simple-wood-fence',
	'garden-fence',
	'rustic-railing',
	'deck-railing',
	'country-fence'
] as const;
export type BarrierPresetId = (typeof BARRIER_PRESET_IDS)[number];

export interface BarrierPreset {
	id: BarrierPresetId;
	name: string;
	group: 'Interior' | 'Outdoor';
	type: BarrierType;
	style: BarrierStyleDefinition;
}

function post(
	profile: BarrierPostProfile,
	cap: BarrierPostCap,
	width: number,
	extendAbove: number
): BarrierPostStyle {
	return { profile, cap, width, extendAbove };
}

/**
 * Starting points, not fixed models — every value can be changed in the customise panel. Interior
 * styles are taller-detailed (turned balusters, newels, bottom rails); outdoor styles are simpler,
 * cheaper and sturdier.
 */
export const BARRIER_PRESETS: readonly BarrierPreset[] = [
	{
		id: 'classic-interior',
		name: 'Classic Interior Wood',
		group: 'Interior',
		type: 'railing',
		style: {
			presetId: 'classic-interior',
			height: 1,
			topRail: { profile: 'rounded', width: 0.075, height: 0.06, overhang: 0.03 },
			bottomRail: { enabled: true, height: 0.09, width: 0.055, thickness: 0.045 },
			midRails: 0,
			endPost: post('classic-newel', 'ball', 0.11, 0.17),
			structuralPost: { ...post('turned', 'flat', 0.085, 0), enabled: true },
			baluster: { style: 'turned', width: 0.04, depth: 0.04, clearance: 0.05 },
			balusterSpacing: 0.12,
			structuralPostSpacing: 2.4,
			wood: 'oak',
			accentWood: null
		}
	},
	{
		id: 'turned-baluster',
		name: 'Turned Baluster',
		group: 'Interior',
		type: 'railing',
		style: {
			presetId: 'turned-baluster',
			height: 0.95,
			topRail: { profile: 'chamfered', width: 0.07, height: 0.055, overhang: 0.02 },
			bottomRail: { enabled: true, height: 0.08, width: 0.05, thickness: 0.04 },
			midRails: 0,
			endPost: post('turned', 'turned', 0.1, 0.12),
			structuralPost: { ...post('turned', 'flat', 0.085, 0), enabled: true },
			baluster: { style: 'turned', width: 0.045, depth: 0.045, clearance: 0.05 },
			balusterSpacing: 0.13,
			structuralPostSpacing: 2.2,
			wood: 'walnut',
			accentWood: null
		}
	},
	{
		id: 'simple-interior',
		name: 'Simple Interior Railing',
		group: 'Interior',
		type: 'railing',
		style: {
			presetId: 'simple-interior',
			height: 0.95,
			topRail: { profile: 'chamfered', width: 0.06, height: 0.05, overhang: 0.02 },
			bottomRail: { enabled: true, height: 0.08, width: 0.045, thickness: 0.04 },
			midRails: 0,
			endPost: post('square', 'bevelled', 0.08, 0.04),
			structuralPost: { ...post('square', 'flat', 0.07, 0), enabled: true },
			baluster: { style: 'square', width: 0.03, depth: 0.03, clearance: 0.05 },
			balusterSpacing: 0.12,
			structuralPostSpacing: 2.4,
			wood: 'pine',
			accentWood: null
		}
	},
	{
		id: 'fancy-newel',
		name: 'Fancy Newel Railing',
		group: 'Interior',
		type: 'railing',
		style: {
			presetId: 'fancy-newel',
			height: 1.02,
			topRail: { profile: 'rounded', width: 0.085, height: 0.07, overhang: 0.03 },
			bottomRail: { enabled: true, height: 0.1, width: 0.06, thickness: 0.05 },
			midRails: 0,
			endPost: post('classic-newel', 'ball', 0.13, 0.22),
			structuralPost: { ...post('chamfered', 'flat', 0.09, 0), enabled: true },
			baluster: { style: 'turned', width: 0.045, depth: 0.045, clearance: 0.05 },
			balusterSpacing: 0.12,
			structuralPostSpacing: 2.6,
			wood: 'dark-oak',
			accentWood: 'walnut'
		}
	},
	{
		id: 'modern-wood',
		name: 'Modern Wood',
		group: 'Interior',
		type: 'railing',
		style: {
			presetId: 'modern-wood',
			height: 1,
			topRail: { profile: 'rectangular', width: 0.05, height: 0.045, overhang: 0 },
			bottomRail: { enabled: false, height: 0.06, width: 0.04, thickness: 0.035 },
			midRails: 0,
			endPost: post('square', 'flat', 0.07, 0),
			structuralPost: { ...post('square', 'flat', 0.06, 0), enabled: true },
			baluster: { style: 'slender', width: 0.022, depth: 0.03, clearance: 0.04 },
			balusterSpacing: 0.1,
			structuralPostSpacing: 2,
			wood: 'oak',
			accentWood: null
		}
	},
	{
		id: 'simple-wood-fence',
		name: 'Simple Wood Fence',
		group: 'Outdoor',
		type: 'fence',
		style: {
			presetId: 'simple-wood-fence',
			height: 1,
			topRail: { profile: 'rectangular', width: 0.045, height: 0.08, overhang: 0 },
			bottomRail: { enabled: true, height: 0.2, width: 0.045, thickness: 0.08 },
			midRails: 0,
			endPost: post('square', 'pyramid', 0.1, 0.06),
			structuralPost: { ...post('square', 'pyramid', 0.1, 0.06), enabled: true },
			baluster: { style: 'square', width: 0.075, depth: 0.02, clearance: 0.06 },
			balusterSpacing: 0.13,
			structuralPostSpacing: 2,
			wood: 'weathered',
			accentWood: null
		}
	},
	{
		id: 'garden-fence',
		name: 'Garden Fence',
		group: 'Outdoor',
		type: 'fence',
		style: {
			presetId: 'garden-fence',
			height: 0.85,
			topRail: { profile: 'chamfered', width: 0.045, height: 0.06, overhang: 0 },
			bottomRail: { enabled: true, height: 0.16, width: 0.045, thickness: 0.06 },
			midRails: 0,
			endPost: post('square', 'ball', 0.085, 0.08),
			structuralPost: { ...post('square', 'pyramid', 0.08, 0.06), enabled: true },
			baluster: { style: 'tapered', width: 0.06, depth: 0.02, clearance: 0.05 },
			balusterSpacing: 0.12,
			structuralPostSpacing: 1.8,
			wood: 'painted',
			accentWood: null
		}
	},
	{
		id: 'rustic-railing',
		name: 'Rustic Railing',
		group: 'Outdoor',
		type: 'fence',
		style: {
			presetId: 'rustic-railing',
			height: 0.95,
			topRail: { profile: 'chamfered', width: 0.09, height: 0.08, overhang: 0.04 },
			bottomRail: { enabled: true, height: 0.18, width: 0.07, thickness: 0.07 },
			midRails: 0,
			endPost: post('chamfered', 'bevelled', 0.13, 0.05),
			structuralPost: { ...post('chamfered', 'bevelled', 0.12, 0.05), enabled: true },
			baluster: { style: 'chamfered', width: 0.05, depth: 0.05, clearance: 0.06 },
			balusterSpacing: 0.22,
			structuralPostSpacing: 2.2,
			wood: 'weathered',
			accentWood: null
		}
	},
	{
		id: 'deck-railing',
		name: 'Deck Railing',
		group: 'Outdoor',
		type: 'railing',
		style: {
			presetId: 'deck-railing',
			height: 1,
			topRail: { profile: 'flat', width: 0.14, height: 0.04, overhang: 0.03 },
			bottomRail: { enabled: true, height: 0.1, width: 0.04, thickness: 0.07 },
			midRails: 0,
			endPost: post('square', 'flat', 0.1, 0),
			structuralPost: { ...post('square', 'flat', 0.1, 0), enabled: true },
			baluster: { style: 'square', width: 0.04, depth: 0.04, clearance: 0.05 },
			balusterSpacing: 0.11,
			structuralPostSpacing: 1.8,
			wood: 'pine',
			accentWood: null
		}
	},
	{
		id: 'country-fence',
		name: 'Country Fence',
		group: 'Outdoor',
		type: 'fence',
		style: {
			presetId: 'country-fence',
			height: 1.1,
			topRail: { profile: 'rectangular', width: 0.05, height: 0.11, overhang: 0 },
			bottomRail: { enabled: true, height: 0.32, width: 0.05, thickness: 0.11 },
			midRails: 1,
			endPost: post('square', 'flat', 0.13, 0.08),
			structuralPost: { ...post('square', 'flat', 0.12, 0.08), enabled: true },
			baluster: { style: 'none', width: 0.05, depth: 0.05, clearance: 0.05 },
			balusterSpacing: 0.3,
			structuralPostSpacing: 2.4,
			wood: 'dark-oak',
			accentWood: null
		}
	}
];

export const DEFAULT_BARRIER_PRESET_ID: BarrierPresetId = 'classic-interior';

export function getBarrierPreset(id: BarrierPresetId): BarrierPreset {
	return BARRIER_PRESETS.find((preset) => preset.id === id) ?? BARRIER_PRESETS[0];
}

export function cloneBarrierStyle(style: BarrierStyleDefinition): BarrierStyleDefinition {
	return {
		...style,
		topRail: { ...style.topRail },
		bottomRail: { ...style.bottomRail },
		endPost: { ...style.endPost },
		structuralPost: { ...style.structuralPost },
		baluster: { ...style.baluster }
	};
}

export function createDefaultBarrierDraftSettings(): BarrierDraftSettings {
	const preset = getBarrierPreset(DEFAULT_BARRIER_PRESET_ID);
	return { type: preset.type, baseMode: 'auto', style: cloneBarrierStyle(preset.style) };
}

/** Replaces the draft's style with a preset's values (the panel's style dropdown). */
export function applyBarrierPreset(draft: BarrierDraftSettings, id: BarrierPresetId): void {
	const preset = getBarrierPreset(id);
	draft.type = preset.type;
	draft.style = cloneBarrierStyle(preset.style);
}

/** The colour a barrier's main wood actually renders with — paint wins over the wood's own tint. */
export function barrierMainColor(
	definition: Pick<BarrierDefinition, 'style' | 'material'>
): string {
	return definition.material?.type === 'color'
		? definition.material.color
		: BARRIER_WOODS[definition.style.wood].color;
}

function clamp(value: number, range: { min: number; max: number }): number {
	return Math.min(range.max, Math.max(range.min, value));
}

/**
 * Brings every number into its sane range — run on everything a build reads, so a hand-edited or
 * imported save can never ask for 500 balusters on a 2 m railing.
 */
export function sanitizeBarrierStyle(style: BarrierStyleDefinition): BarrierStyleDefinition {
	const s = cloneBarrierStyle(style);
	s.height = clamp(s.height, BARRIER_LIMITS.height);
	s.topRail.width = clamp(s.topRail.width, BARRIER_LIMITS.topRailWidth);
	s.topRail.height = Math.min(
		clamp(s.topRail.height, BARRIER_LIMITS.topRailHeight),
		s.height * 0.4
	);
	s.topRail.overhang = Math.min(0.15, Math.max(0, s.topRail.overhang));
	s.bottomRail.height = Math.min(
		clamp(s.bottomRail.height, BARRIER_LIMITS.bottomRailHeight),
		s.height - s.topRail.height - 0.1
	);
	s.bottomRail.width = clamp(s.bottomRail.width, BARRIER_LIMITS.topRailWidth);
	s.bottomRail.thickness = Math.min(
		clamp(s.bottomRail.thickness, BARRIER_LIMITS.topRailHeight),
		Math.max(0.02, s.bottomRail.height)
	);
	s.midRails = Math.round(clamp(s.midRails, BARRIER_LIMITS.midRails));
	for (const p of [s.endPost, s.structuralPost]) {
		p.width = clamp(p.width, BARRIER_LIMITS.postWidth);
		p.extendAbove = clamp(p.extendAbove, BARRIER_LIMITS.postExtendAbove);
	}
	s.baluster.width = clamp(s.baluster.width, BARRIER_LIMITS.balusterWidth);
	s.baluster.depth = clamp(s.baluster.depth, BARRIER_LIMITS.balusterWidth);
	s.baluster.clearance = Math.min(0.3, Math.max(0, s.baluster.clearance));
	s.balusterSpacing = clamp(s.balusterSpacing, BARRIER_LIMITS.balusterSpacing);
	s.structuralPostSpacing = clamp(s.structuralPostSpacing, BARRIER_LIMITS.postSpacing);
	return s;
}

// --------------------------------------------------------------------------------- validation

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
	return typeof value === 'string' && (options as readonly string[]).includes(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validatePost(value: unknown, label: string): string | null {
	if (!isObject(value)) return `${label} must be an object`;
	if (!isOneOf(value.profile, BARRIER_POST_PROFILES)) return `${label} has an unknown profile`;
	if (!isOneOf(value.cap, BARRIER_POST_CAPS)) return `${label} has an unknown cap`;
	if (!isFiniteNumber(value.width) || !isFiniteNumber(value.extendAbove))
		return `${label} has invalid dimensions`;
	return null;
}

/** Shape check for one style (numbers are clamped at build time, so only types are checked here). */
export function validateBarrierStyle(value: unknown): string | null {
	if (!isObject(value)) return 'style must be an object';
	if (!isOneOf(value.presetId, BARRIER_PRESET_IDS)) return 'style has an unknown preset';
	if (!isFiniteNumber(value.height)) return 'style height must be a number';
	const top = value.topRail;
	if (
		!isObject(top) ||
		!isOneOf(top.profile, BARRIER_RAIL_PROFILES) ||
		![top.width, top.height, top.overhang].every(isFiniteNumber)
	)
		return 'style topRail is invalid';
	const bottom = value.bottomRail;
	if (
		!isObject(bottom) ||
		typeof bottom.enabled !== 'boolean' ||
		![bottom.height, bottom.width, bottom.thickness].every(isFiniteNumber)
	)
		return 'style bottomRail is invalid';
	if (!isFiniteNumber(value.midRails)) return 'style midRails must be a number';
	const endPost = validatePost(value.endPost, 'style endPost');
	if (endPost) return endPost;
	const structural = validatePost(value.structuralPost, 'style structuralPost');
	if (structural) return structural;
	if (typeof (value.structuralPost as Record<string, unknown>).enabled !== 'boolean')
		return 'style structuralPost.enabled must be a boolean';
	const baluster = value.baluster;
	if (
		!isObject(baluster) ||
		!isOneOf(baluster.style, BARRIER_BALUSTER_STYLES) ||
		![baluster.width, baluster.depth, baluster.clearance].every(isFiniteNumber)
	)
		return 'style baluster is invalid';
	if (!isFiniteNumber(value.balusterSpacing) || !isFiniteNumber(value.structuralPostSpacing))
		return 'style spacing must be numbers';
	if (!isOneOf(value.wood, BARRIER_WOOD_IDS)) return 'style has an unknown wood';
	if (value.accentWood !== null && !isOneOf(value.accentWood, BARRIER_WOOD_IDS))
		return 'style has an unknown accent wood';
	return null;
}

/**
 * Validates a world's `barriers` list. A non-null `foundationId` must name a foundation in the same
 * save. Returns the first problem found, or `null`.
 */
export function validateBarriers(
	value: unknown,
	foundationIds: ReadonlySet<string>
): string | null {
	if (!Array.isArray(value)) return 'barriers must be an array';
	if (value.length > MAX_BARRIERS) return `Too many barriers (${value.length})`;
	const ids = new Set<string>();
	for (const item of value) {
		if (!isObject(item)) return 'Every barrier must be an object';
		const id = item.id;
		if (typeof id !== 'string' || id.length === 0) return 'Barrier id must be a non-empty string';
		if (ids.has(id)) return `Duplicate barrier id: ${id}`;
		ids.add(id);
		if (!isOneOf(item.type, BARRIER_TYPES)) return `Barrier ${id} has an unknown type`;
		if (item.foundationId !== null) {
			if (typeof item.foundationId !== 'string') return `Barrier ${id} foundationId is invalid`;
			if (!foundationIds.has(item.foundationId))
				return `Barrier ${id} references unknown foundation: ${item.foundationId}`;
		}
		if (item.levelIndex !== undefined && !isFiniteNumber(item.levelIndex))
			return `Barrier ${id} levelIndex must be a number`;
		if (typeof item.closed !== 'boolean') return `Barrier ${id} closed must be a boolean`;
		if (!isOneOf(item.baseMode, BARRIER_BASE_MODES)) return `Barrier ${id} has an unknown baseMode`;
		const points = item.points;
		if (!Array.isArray(points) || points.length < 2 || points.length > BARRIER_MAX_POINTS)
			return `Barrier ${id} needs 2–${BARRIER_MAX_POINTS} points`;
		if (item.closed && points.length < 3) return `Closed barrier ${id} needs at least 3 points`;
		for (const point of points) {
			if (!isObject(point) || ![point.x, point.y, point.z].every(isFiniteNumber))
				return `Barrier ${id} has an invalid point`;
		}
		const styleError = validateBarrierStyle(item.style);
		if (styleError) return `Barrier ${id} ${styleError}`;
		const material = item.material;
		if (material !== undefined) {
			if (
				!isObject(material) ||
				material.type !== 'color' ||
				typeof material.color !== 'string' ||
				!/^#[0-9a-fA-F]{6}$/.test(material.color)
			)
				return `Barrier ${id} has an invalid material`;
		}
	}
	return null;
}
