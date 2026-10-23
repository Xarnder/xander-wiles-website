/**
 * The procedural surfaces a Mini Build material slot can use. These share the game's cached
 * material generators and shaders, including woven upholstery fabric — this
 * file only names a curated set of them for players and says how each goes onto Mini Build
 * geometry. Pure data, no Three.js.
 *
 * Colour stays the player's: a textured slot is tinted so the texture's average is the slot colour
 * (exactly how painting a wall works). Picking a texture in the editor sets the colour to the
 * texture's own `swatch`, so it starts out looking natural and can then be recoloured.
 *
 * Mapping: compiled Mini Build UVs are already in metres with the grain along U, so textures use
 * `native` mapping at one metre per UV unit. Wood uses the solid-wood shader with the per-block
 * `woodCoord` attribute the compiler emits (each block is one piece of timber, like a beam).
 */
import type { ProceduralBindingOptions } from '../materials/ProceduralMaterialLibrary';
import type { SurfaceStyle } from '../materials/ProceduralMaterialTypes';
import {
	MINI_BUILD_TEXTURE_IDS,
	type MiniBuildFinish,
	type MiniBuildMaterialSlot,
	type MiniBuildTextureId
} from './MiniBuildTypes';

export interface MiniBuildTextureEntry {
	label: string;
	group: 'Fabric' | 'Wood' | 'Metal' | 'Plaster' | 'Stone' | 'Ground' | 'Glass';
	style: SurfaceStyle;
	/** sRGB `#RRGGBB` close to the texture's natural average — the colour picking it suggests. */
	swatch: string;
}

const wood = (variant: string): SurfaceStyle => ({
	type: 'timber',
	options: { variant: variant as never },
	mapping: 'wood'
});
const textured = (
	type: SurfaceStyle['type'],
	options: SurfaceStyle['options'] = {}
): SurfaceStyle => ({ type, options, mapping: 'native' });

export const MINI_BUILD_TEXTURES: Readonly<
	Record<Exclude<MiniBuildTextureId, 'auto' | 'flat'>, MiniBuildTextureEntry>
> = {
	'woven-fabric': {
		label: 'Woven fabric',
		group: 'Fabric',
		style: textured('fabric', { variant: 'woven' }),
		swatch: '#D8CFBC'
	},
	'dark-oak': { label: 'Dark oak', group: 'Wood', style: wood('dark-oak'), swatch: '#3E2A1C' },
	'aged-oak': { label: 'Aged oak', group: 'Wood', style: wood('aged-brown'), swatch: '#6B4730' },
	'weathered-wood': {
		label: 'Weathered wood',
		group: 'Wood',
		style: wood('weathered'),
		swatch: '#7D7266'
	},
	pine: { label: 'Pine', group: 'Wood', style: wood('fresh'), swatch: '#C9A06A' },
	mahogany: {
		label: 'Stained mahogany',
		group: 'Wood',
		style: wood('dark-stained'),
		swatch: '#4F2B1A'
	},
	'oak-planks': {
		label: 'Oak planks',
		group: 'Wood',
		style: textured('timber', { variant: 'aged-brown', planks: true, weathering: 0.15 }),
		swatch: '#7A5134'
	},
	'forged-iron': {
		label: 'Forged iron',
		group: 'Metal',
		style: textured('metal', { variant: 'iron' }),
		swatch: '#45423F'
	},
	brass: {
		label: 'Brass',
		group: 'Metal',
		style: textured('metal', { variant: 'brass' }),
		swatch: '#B08A3E'
	},
	'lime-plaster': {
		label: 'Lime plaster',
		group: 'Plaster',
		style: textured('plaster', { variant: 'lime' }),
		swatch: '#D9D2C3'
	},
	'rough-plaster': {
		label: 'Rough plaster',
		group: 'Plaster',
		style: textured('plaster', { variant: 'rough' }),
		swatch: '#CFC6B3'
	},
	'dressed-stone': {
		label: 'Dressed stone',
		group: 'Stone',
		style: textured('masonry', { variant: 'dressed' }),
		swatch: '#9C958A'
	},
	'cut-stone': {
		label: 'Cut stone blocks',
		group: 'Stone',
		style: textured('masonry', { variant: 'cut-block' }),
		swatch: '#8A8578'
	},
	fieldstone: {
		label: 'Fieldstone',
		group: 'Stone',
		style: textured('masonry', { variant: 'fieldstone' }),
		swatch: '#8F887C'
	},
	'rough-stone': {
		label: 'Rough stone',
		group: 'Stone',
		style: textured('masonry', { variant: 'rough' }),
		swatch: '#7F7A70'
	},
	'smooth-stone': {
		label: 'Smooth stone',
		group: 'Stone',
		style: textured('paving', { variant: 'plain', moss: 0, dirt: 0, variation: 0.65 }),
		swatch: '#524E4A'
	},
	cobbles: {
		label: 'Cobbles',
		group: 'Stone',
		style: textured('paving', { variant: 'cobble' }),
		swatch: '#86807A'
	},
	setts: {
		label: 'Setts',
		group: 'Stone',
		style: textured('paving', { variant: 'setts' }),
		swatch: '#7C7770'
	},
	flagstones: {
		label: 'Flagstones',
		group: 'Stone',
		style: textured('paving', { variant: 'flagstone' }),
		swatch: '#958E82'
	},
	slate: {
		label: 'Slate',
		group: 'Stone',
		style: textured('slate', { variant: 'natural' }),
		swatch: '#4F555C'
	},
	soil: {
		label: 'Soil',
		group: 'Ground',
		style: textured('ground', { variant: 'soil' }),
		swatch: '#6B5340'
	},
	gravel: {
		label: 'Gravel',
		group: 'Ground',
		style: textured('ground', { variant: 'gravel' }),
		swatch: '#9A948A'
	},
	'earth-path': {
		label: 'Earth path',
		group: 'Ground',
		style: textured('ground', { variant: 'path' }),
		swatch: '#8C7A62'
	},
	'meadow-grass': {
		label: 'Meadow grass',
		group: 'Ground',
		style: textured('grass', { variant: 'meadow' }),
		swatch: '#5F8A3E'
	},
	'dry-grass': {
		label: 'Dry grass',
		group: 'Ground',
		style: textured('grass', { variant: 'dry' }),
		swatch: '#A89B5E'
	},
	'clear-glass': {
		label: 'Clear glass',
		group: 'Glass',
		style: textured('glass', { variant: 'clear' }),
		swatch: '#A8D0E0'
	},
	'old-glass': {
		label: 'Old glass',
		group: 'Glass',
		style: textured('glass', { variant: 'old' }),
		swatch: '#9FBFB0'
	}
};

/**
 * What `auto` means for each finish. Plain stays flat — it is the "just a colour" finish. Metal
 * textures carry their own metalness, so a metal slot stays metallic where it is worn bright.
 */
export const MINI_BUILD_AUTO_TEXTURE: Readonly<Record<MiniBuildFinish, MiniBuildTextureId>> = {
	wood: 'aged-oak',
	fabric: 'woven-fabric',
	stone: 'dressed-stone',
	glass: 'clear-glass',
	metal: 'forged-iron',
	plain: 'flat'
};

export function isMiniBuildTextureId(value: unknown): value is MiniBuildTextureId {
	return (MINI_BUILD_TEXTURE_IDS as readonly unknown[]).includes(value);
}

/** The concrete texture a slot uses (`auto` resolved through its finish). */
export function effectiveMiniBuildTexture(
	slot: Pick<MiniBuildMaterialSlot, 'finish' | 'texture'>
): Exclude<MiniBuildTextureId, 'auto'> {
	const id = slot.texture ?? 'auto';
	const resolved = id === 'auto' ? MINI_BUILD_AUTO_TEXTURE[slot.finish] : id;
	return resolved === 'auto' ? 'flat' : resolved;
}

/** The procedural style a slot is drawn with, or null for flat colour. */
export function miniBuildSurfaceStyle(
	slot: Pick<MiniBuildMaterialSlot, 'finish' | 'texture'>
): SurfaceStyle | null {
	const id = effectiveMiniBuildTexture(slot);
	return id === 'flat' ? null : MINI_BUILD_TEXTURES[id].style;
}

/**
 * How a slot's style goes onto compiled Mini Build geometry — shared by the world and the editor so
 * both draw a slot identically. Wood keeps the player's colour down to a near-black floor (a dark
 * oak stays darker than an oak); other textures read the metre UVs.
 */
export function miniBuildBindingOptions(
	style: SurfaceStyle
): Omit<ProceduralBindingOptions, 'tint'> {
	return style.mapping === 'wood'
		? { ownWoodCoords: true, woodMinLuma: 0.03 }
		: { uvUnitMeters: 1 };
}

/** Texture choices grouped for a picker, in catalogue order. */
export function miniBuildTextureGroups(): { group: string; ids: MiniBuildTextureId[] }[] {
	const groups: { group: string; ids: MiniBuildTextureId[] }[] = [];
	for (const [id, entry] of Object.entries(MINI_BUILD_TEXTURES) as [
		Exclude<MiniBuildTextureId, 'auto' | 'flat'>,
		MiniBuildTextureEntry
	][]) {
		let group = groups.find((g) => g.group === entry.group);
		if (!group) groups.push((group = { group: entry.group, ids: [] }));
		group.ids.push(id);
	}
	return groups;
}

export function miniBuildTextureLabel(id: MiniBuildTextureId): string {
	if (id === 'auto') return 'Auto';
	if (id === 'flat') return 'Flat colour';
	return MINI_BUILD_TEXTURES[id].label;
}
