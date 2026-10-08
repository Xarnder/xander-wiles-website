import { hashStringToUint32 } from '../terrain/seededRandom';
import { DEFAULT_MATERIAL_PALETTE_ID, resolvePaletteColors } from './materialPalettes';
import {
	PROCEDURAL_VARIANTS,
	type MaterialQuality,
	type ProceduralMaterialOptions,
	type ProceduralMaterialType,
	type ResolvedMaterialRecipe
} from './ProceduralMaterialTypes';

/**
 * Per-material defaults. Tile sizes are REAL-WORLD metres: a slate course or a paving stone is the
 * same physical size on every surface, because geometry is mapped in metres (see
 * `surfaceMapping.ts`) and the texture repeat is `1 / tileSize`. Nothing here depends on how big
 * any particular mesh is.
 */
export interface MaterialPreset {
	variant: string;
	seed: number;
	tileWidth: number;
	tileHeight: number;
	roughness: number;
	weathering: number;
	dirt: number;
	moss: number;
	variation: number;
	normalStrength: number;
}

export const MATERIAL_PRESETS: Readonly<Record<ProceduralMaterialType, MaterialPreset>> = {
	plaster: {
		variant: 'lime',
		seed: 0x51a7,
		tileWidth: 2.4,
		tileHeight: 2.4,
		roughness: 0.9,
		weathering: 0.35,
		dirt: 0.25,
		moss: 0.05,
		variation: 0.5,
		normalStrength: 1.6
	},
	timber: {
		variant: 'dark-oak',
		seed: 0x7148,
		// Grain runs along U, so a tile is long and narrow: 2 m of beam length × 0.5 m across.
		tileWidth: 2,
		tileHeight: 0.5,
		roughness: 0.78,
		weathering: 0.4,
		dirt: 0.2,
		moss: 0,
		variation: 0.5,
		normalStrength: 1.4
	},
	slate: {
		variant: 'natural',
		seed: 0x5a7e,
		tileWidth: 2.4,
		tileHeight: 2.4,
		roughness: 0.68,
		weathering: 0.3,
		dirt: 0.15,
		moss: 0.15,
		variation: 0.6,
		normalStrength: 1.2
	},
	masonry: {
		variant: 'cut-block',
		seed: 0x3a50,
		tileWidth: 2.4,
		tileHeight: 2.4,
		roughness: 0.9,
		weathering: 0.4,
		dirt: 0.3,
		moss: 0.25,
		variation: 0.75,
		normalStrength: 1.3
	},
	paving: {
		variant: 'cobble',
		seed: 0x9a71,
		tileWidth: 3,
		tileHeight: 3,
		roughness: 0.88,
		weathering: 0.4,
		dirt: 0.4,
		moss: 0.2,
		variation: 0.55,
		normalStrength: 1.3
	},
	ground: {
		variant: 'path',
		seed: 0x6e0d,
		tileWidth: 3,
		tileHeight: 3,
		roughness: 0.95,
		weathering: 0.3,
		dirt: 0.5,
		moss: 0,
		variation: 0.5,
		normalStrength: 1.2
	},
	grass: {
		variant: 'meadow',
		seed: 0x96a5,
		tileWidth: 4,
		tileHeight: 4,
		roughness: 0.95,
		weathering: 0.2,
		dirt: 0.2,
		moss: 0,
		variation: 0.5,
		// Real blades are near-vertical; as a terrain detail map a gentle relief reads better.
		normalStrength: 0.3
	},
	glass: {
		variant: 'clear',
		seed: 0x61a5,
		tileWidth: 1,
		tileHeight: 1,
		roughness: 0.04,
		weathering: 0.15,
		dirt: 0.15,
		moss: 0,
		variation: 0.3,
		normalStrength: 0.15
	}
};

/** Boards for floors and door leaves: a wider tile so several boards and staggered end joints fit. */
const PLANK_TILE = { tileWidth: 2.4, tileHeight: 1.2 } as const;

function clampUnit(value: number | undefined, fallback: number): number {
	const v = value ?? fallback;
	return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function resolveSeed(seed: number | string | undefined, fallback: number): number {
	if (seed === undefined) return fallback;
	if (typeof seed === 'string') return hashStringToUint32(seed);
	return Number.isFinite(seed) ? Math.floor(seed) >>> 0 : fallback;
}

/** Rounds to 4 decimals so float noise in caller-supplied options can't fragment the cache. */
function quantize(value: number): number {
	return Math.round(value * 10000) / 10000;
}

/**
 * Resolves caller options against the type's preset and the palette into a complete, plain-data
 * recipe. Invalid inputs (unknown variant, NaN, out-of-range sliders) fall back to the preset rather
 * than throwing — options can come from a debug UI or saved preferences.
 */
export function resolveMaterialRecipe<T extends ProceduralMaterialType>(
	type: T,
	options: ProceduralMaterialOptions<T> = {},
	defaultQuality: MaterialQuality = 'medium'
): ResolvedMaterialRecipe {
	const preset = MATERIAL_PRESETS[type];
	const variants = PROCEDURAL_VARIANTS[type] as readonly string[];
	const variant =
		options.variant && variants.includes(options.variant) ? options.variant : preset.variant;
	const planks = type === 'timber' && options.planks === true;
	const scale =
		options.scale !== undefined && Number.isFinite(options.scale) && options.scale > 0
			? Math.min(8, Math.max(0.125, options.scale))
			: 1;
	const baseTile = planks ? PLANK_TILE : preset;
	const palette = options.palette ?? DEFAULT_MATERIAL_PALETTE_ID;

	return {
		type,
		variant,
		seed: resolveSeed(options.seed, preset.seed),
		palette,
		tileWidth: quantize(baseTile.tileWidth * scale),
		tileHeight: quantize(baseTile.tileHeight * scale),
		roughness: quantize(clampUnit(options.roughness, preset.roughness)),
		weathering: quantize(clampUnit(options.weathering, preset.weathering)),
		dirt: quantize(clampUnit(options.dirt, preset.dirt)),
		moss: quantize(clampUnit(options.moss, preset.moss)),
		variation: quantize(clampUnit(options.variation, preset.variation)),
		planks,
		quality: options.quality ?? defaultQuality,
		normalStrength: preset.normalStrength,
		colors: resolvePaletteColors(palette, type, variant)
	};
}

/**
 * Stable cache key for a recipe: every field that affects generated texels, in a fixed order.
 * Equal keys ⇔ byte-identical textures, so the texture cache can share maps between any number of
 * materials that resolve to the same recipe.
 */
export function recipeCacheKey(recipe: ResolvedMaterialRecipe): string {
	const colors = Object.keys(recipe.colors)
		.sort()
		.map((name) => `${name}=${recipe.colors[name].map((c) => c.toFixed(4)).join(',')}`)
		.join(';');
	return [
		recipe.type,
		recipe.variant,
		recipe.seed,
		recipe.palette,
		recipe.tileWidth,
		recipe.tileHeight,
		recipe.roughness,
		recipe.weathering,
		recipe.dirt,
		recipe.moss,
		recipe.variation,
		recipe.planks ? 'planks' : 'solid',
		recipe.quality,
		recipe.normalStrength,
		colors
	].join('|');
}
