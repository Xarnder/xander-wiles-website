/**
 * Logical description of a procedural material — framework- and Three.js-free, like every other
 * `*Types.ts` file in this project. A recipe here is plain data: it can be hashed into a cache key,
 * posted to a texture worker, or unit-tested without a WebGL context. `ProceduralMaterialLibrary`
 * is the only place that turns a resolved recipe into Three.js textures and materials.
 *
 * See the README's "Procedural materials" section for the design rationale.
 */

export type ProceduralMaterialType =
	'plaster' | 'timber' | 'slate' | 'masonry' | 'paving' | 'ground' | 'grass' | 'glass';

export const PROCEDURAL_MATERIAL_TYPES: readonly ProceduralMaterialType[] = [
	'plaster',
	'timber',
	'slate',
	'masonry',
	'paving',
	'ground',
	'grass',
	'glass'
];

export type PlasterVariant = 'lime' | 'rough';
export type TimberVariant = 'dark-oak' | 'aged-brown' | 'weathered' | 'fresh' | 'dark-stained';
export type SlateVariant = 'natural' | 'irregular';
export type MasonryVariant = 'dressed' | 'cut-block' | 'fieldstone' | 'rough';
/** `setts` is the rectangular laid paving; `flagstone` large irregular slabs. */
export type PavingVariant = 'cobble' | 'setts' | 'flagstone';
/** Bare ground for paths and exposed earth: `soil` → `path` (soil + gravel) → `gravel`. */
export type GroundVariant = 'soil' | 'path' | 'gravel';
/** `detail` is a near-neutral variant for multiplying over terrain vertex colours (the colour comes from the terrain, the texture adds structure). */
export type GrassVariant = 'meadow' | 'dry' | 'detail';
export type GlassVariant = 'clear' | 'old';

export interface ProceduralVariantMap {
	plaster: PlasterVariant;
	timber: TimberVariant;
	slate: SlateVariant;
	masonry: MasonryVariant;
	paving: PavingVariant;
	ground: GroundVariant;
	grass: GrassVariant;
	glass: GlassVariant;
}

export const PROCEDURAL_VARIANTS: {
	readonly [T in ProceduralMaterialType]: readonly ProceduralVariantMap[T][];
} = {
	plaster: ['lime', 'rough'],
	timber: ['dark-oak', 'aged-brown', 'weathered', 'fresh', 'dark-stained'],
	slate: ['natural', 'irregular'],
	masonry: ['dressed', 'cut-block', 'fieldstone', 'rough'],
	paving: ['cobble', 'setts', 'flagstone'],
	ground: ['soil', 'path', 'gravel'],
	grass: ['meadow', 'dry', 'detail'],
	glass: ['clear', 'old']
};

/**
 * Texture resolution tier. `low` keeps memory and generation time small for weak devices, `high`
 * adds finer surface detail — see `MATERIAL_QUALITY_SETTINGS`. Mapped from the game's own
 * `GraphicsQuality` by `materialQualityForGraphics`, so there is still one quality switch.
 */
export type MaterialQuality = 'low' | 'medium' | 'high';

export const MATERIAL_QUALITIES: readonly MaterialQuality[] = ['low', 'medium', 'high'];

export interface MaterialQualitySettings {
	/** Albedo + normal map resolution for full-size surfaces (texels per side, power of two). */
	resolution: number;
	/** Roughness/AO map is generated at this fraction of `resolution` — it carries much lower-frequency information. */
	ormScale: number;
}

export const MATERIAL_QUALITY_SETTINGS: Readonly<Record<MaterialQuality, MaterialQualitySettings>> =
	{
		low: { resolution: 256, ormScale: 0.5 },
		medium: { resolution: 512, ormScale: 0.5 },
		high: { resolution: 1024, ormScale: 0.5 }
	};

export function materialQualityForGraphics(
	quality: 'low' | 'medium' | 'high' | 'ultra'
): MaterialQuality {
	return quality === 'ultra' ? 'high' : quality;
}

export type MaterialPaletteId =
	'alpine' | 'medieval-village' | 'english-countryside' | 'mountain-lodge' | 'old-european-town';

/**
 * What a caller may ask for. Every field is optional — anything omitted falls back to the type's
 * preset (see `materialPresets.ts`) — and `variant` is typed per material, so
 * `getProceduralMaterial('timber', { variant: 'cobble' })` is a compile error.
 */
export interface ProceduralMaterialOptions<
	T extends ProceduralMaterialType = ProceduralMaterialType
> {
	variant?: ProceduralVariantMap[T];
	/** Deterministic material seed. Strings are hashed; the same seed always yields the same texture. */
	seed?: number | string;
	palette?: MaterialPaletteId;
	/** Multiplier on the preset's real-world tile size (1 = preset size). Changes feature size, never per-object mapping. */
	scale?: number;
	/** Base surface roughness, 0..1. */
	roughness?: number;
	/** Overall age and wear, 0..1. */
	weathering?: number;
	/** Accumulated dirt, 0..1. */
	dirt?: number;
	/** Organic growth (moss/lichen) in sheltered areas, 0..1. */
	moss?: number;
	/** Strength of per-element colour/shape variation (between stones, slates, boards), 0..1. */
	variation?: number;
	quality?: MaterialQuality;
	/** Timber only: lay the texture out as separate boards with seams (floors, door leaves). */
	planks?: boolean;
}

/** An sRGB colour as `[r, g, b]` in 0..1 — plain data so recipes survive `postMessage` and JSON hashing. */
export type RgbColor = readonly [number, number, number];

/**
 * A fully-resolved recipe: every number concrete, every colour looked up from the palette. Two
 * recipes that compare equal (via `recipeCacheKey`) always generate byte-identical textures, which
 * is what makes the texture cache and the worker safe.
 */
export interface ResolvedMaterialRecipe {
	type: ProceduralMaterialType;
	variant: string;
	seed: number;
	palette: MaterialPaletteId;
	/** Real-world size of one texture tile along U and V, in metres. */
	tileWidth: number;
	tileHeight: number;
	roughness: number;
	weathering: number;
	dirt: number;
	moss: number;
	variation: number;
	planks: boolean;
	quality: MaterialQuality;
	/** Multiplier applied to height-derived normals. */
	normalStrength: number;
	/** Named colours the generator reads, already resolved from the palette. */
	colors: Readonly<Record<string, RgbColor>>;
}

/**
 * Raw texel data for one material. Plain typed arrays (no Three.js), so it can be produced in a
 * worker and transferred, and unit-tested in Node.
 */
export interface MaterialMapData {
	/** Albedo and normal map side length. */
	size: number;
	/** Roughness/AO map side length. */
	ormSize: number;
	/** RGBA8, sRGB-encoded base colour. */
	albedo: Uint8Array;
	/** RGBA8 tangent-space normal (+X along U, +Y along V). */
	normal: Uint8Array;
	/** RGBA8: R = ambient occlusion, G = roughness, B = metalness (glTF ORM layout, read directly by MeshStandardMaterial). */
	orm: Uint8Array;
	/** Mean albedo in linear space — used to tint the texture to a painted colour or a vertex-coloured base without changing its average brightness. */
	meanLinear: RgbColor;
	tileWidth: number;
	tileHeight: number;
}

/**
 * How texture coordinates are generated on building geometry (see `surfaceMapping.ts`):
 * - `planar`: per-face planar projection in foundation-local metres — X/Z on floors, along-wall/Y
 *   on walls, along-contour/up-slope on slopes. For isotropic surfaces (plaster, stone, paving).
 * - `grain`: like `planar`, but U follows each timber piece's long axis so wood grain runs along
 *   beams, posts and braces whatever their orientation.
 * - `roof`: like `planar`, with V measured up the slope from each roof plane's lowest edge, so slate
 *   courses start at the eave and stay parallel to it.
 */
export type SurfaceMappingMode = 'planar' | 'grain' | 'roof';

/** Everything the scene needs to put a procedural look on a surface. */
export interface SurfaceStyle {
	type: ProceduralMaterialType;
	options?: ProceduralMaterialOptions;
	/** `native` keeps the mesh's own UVs (terrain's world-space UVs) instead of the binder's mapping. */
	mapping: SurfaceMappingMode | 'native';
}
