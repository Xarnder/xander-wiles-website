/**
 * The procedural grass tuft atlas: 8 tuft variants in a 4 × 2 grid, generated once at startup from
 * deterministic blade strokes. Pure (typed arrays only, no canvas, no Three.js), so it runs in Node
 * tests and could move to a worker unchanged.
 *
 * Each tile is one TUFT — 6 to 16 blades — not one blade. Blades are quadratic curves with a
 * tapering width, rasterised with an analytic distance-to-segment coverage (smooth antialiasing)
 * and composited back to front. The tuft is anchored at the bottom centre of its tile and fills it
 * tightly, so alpha-tested cards waste little fill rate on empty texels.
 *
 * Colour: RGB is a MULTIPLIER around 1 (stored halved, so 128 ≈ ×1) applied to each instance's
 * terrain-matched grass colour — the atlas carries only per-blade light/dark and a few warmer or
 * seed-head strokes, never the green itself. That keeps one atlas valid for every biome palette.
 *
 * Mip chain (built here, not by the GPU), because alpha-tested foliage falls apart under plain box
 * filtering: averaged alpha drops below the cutoff and distant tufts thin out or vanish. Each level
 * is (1) alpha-weighted colour averaged, so transparent texels never darken blade edges, and
 * (2) alpha-rescaled per tile so the fraction of texels passing the alpha test matches level 0
 * ("coverage-preserving mipmaps"). Transparent texels carry dilated neighbour colour, so bilinear
 * filtering never pulls in a dark or white halo. Levels stop at 8 × 8 texels per tile so tiles never
 * bleed into each other.
 */

import {
	buildAtlasLevels,
	compositeOver,
	createAtlasTile,
	finishTile,
	rasterStroke,
	rng,
	type AtlasLevel,
	type AtlasTile,
	type Stroke as AtlasStroke
} from '../atlas/alphaAtlas';

export const GRASS_ATLAS_COLUMNS = 4;
export const GRASS_ATLAS_ROWS = 2;
export const GRASS_VARIANTS = GRASS_ATLAS_COLUMNS * GRASS_ATLAS_ROWS;
/** Alpha cutoff the coverage-preserving mips are tuned for (the material's default alpha test). */
export const GRASS_ATLAS_ALPHA_CUTOFF = 0.5;
/** Smallest tile edge kept in the mip chain. */
const MIN_TILE_TEXELS = 8;

export type GrassAtlasLevel = AtlasLevel;

export interface GrassAtlas {
	tileSize: number;
	levels: GrassAtlasLevel[];
	/** Fraction of each variant's level-0 texels that pass the alpha cutoff (tightness of the tuft). */
	coverage: number[];
}

interface VariantRecipe {
	name: string;
	blades: number;
	/** Height range, fraction of the tile. */
	height: [number, number];
	/** Base spread across the tile (fraction of tile width, centred). */
	spread: number;
	/** Blade width at the base, fraction of the tile. */
	width: [number, number];
	/** Tip lean range (fraction of tile, ±). */
	lean: number;
	/** Curvature of the stroke (control-point offset, fraction of tile). */
	curve: number;
	/** Lean all blades one way (a bent tuft) rather than fanning out. */
	bias?: number;
	seedHeads?: number;
}

/** Eight tuft silhouettes — short sparse, medium, tall, wide, thin, bent, seed heads, fine. */
const VARIANTS: readonly VariantRecipe[] = [
	{
		name: 'short',
		blades: 7,
		height: [0.5, 0.78],
		spread: 0.42,
		width: [0.06, 0.085],
		lean: 0.24,
		curve: 0.08
	},
	{
		name: 'medium',
		blades: 11,
		height: [0.62, 0.95],
		spread: 0.48,
		width: [0.055, 0.08],
		lean: 0.26,
		curve: 0.1
	},
	{
		name: 'tall',
		blades: 9,
		height: [0.78, 0.99],
		spread: 0.32,
		width: [0.05, 0.07],
		lean: 0.2,
		curve: 0.08
	},
	{
		name: 'wide',
		blades: 14,
		height: [0.5, 0.88],
		spread: 0.66,
		width: [0.05, 0.075],
		lean: 0.3,
		curve: 0.1
	},
	{
		name: 'thin',
		blades: 8,
		height: [0.62, 0.97],
		spread: 0.4,
		width: [0.035, 0.05],
		lean: 0.22,
		curve: 0.12
	},
	{
		name: 'bent',
		blades: 10,
		height: [0.55, 0.9],
		spread: 0.44,
		width: [0.05, 0.075],
		lean: 0.12,
		curve: 0.16,
		bias: 0.24
	},
	{
		name: 'seed',
		blades: 8,
		height: [0.48, 0.8],
		spread: 0.46,
		width: [0.05, 0.07],
		lean: 0.24,
		curve: 0.08,
		seedHeads: 3
	},
	{
		name: 'fine',
		blades: 16,
		height: [0.45, 0.92],
		spread: 0.56,
		width: [0.03, 0.045],
		lean: 0.3,
		curve: 0.12
	}
];

interface Stroke extends AtlasStroke {
	color: [number, number, number];
}

/** One blade (or seed stalk) as a polyline in tile texels, base at the bottom. */
function bladeStroke(
	recipe: VariantRecipe,
	random: () => number,
	size: number,
	margin: number
): Stroke {
	const span = size - margin * 2;
	const x0 = size / 2 + (random() - 0.5) * recipe.spread * span;
	const height =
		(recipe.height[0] + random() * (recipe.height[1] - recipe.height[0])) * (size - margin);
	// Blades fan away from the tuft centre, plus a random lean and an optional common bend.
	const fan = ((x0 - size / 2) / (span / 2)) * recipe.lean * 0.6;
	const lean = (fan + (random() - 0.5) * recipe.lean + (recipe.bias ?? 0)) * span;
	const curve = (random() - 0.3) * recipe.curve * span * Math.sign(lean || 1);
	const baseHalf = ((recipe.width[0] + random() * (recipe.width[1] - recipe.width[0])) * span) / 2;
	const tipX = Math.min(size - margin, Math.max(margin, x0 + lean));
	const cx = x0 + lean * 0.25 + curve;
	const cy = height * 0.55;
	const points: [number, number][] = [];
	const half: number[] = [];
	const segments = 10;
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		const u = 1 - t;
		points.push([u * u * x0 + 2 * u * t * cx + t * t * tipX, 2 * u * t * cy + t * t * height]);
		// Taper: full width at the base, a fine point at the tip.
		half.push(Math.max(0.35, baseHalf * Math.pow(1 - t, 0.85)));
	}
	const tone = 0.82 + random() * 0.34;
	const warm = random() < 0.25 ? 1 : 0;
	return {
		points,
		half,
		color: [tone * (1 + warm * 0.1), tone * (1 + warm * 0.03), tone * (1 - warm * 0.22)]
	};
}

/** A seed head: a short dense ellipse of tan "seeds" at the top of a thin stalk. */
function seedHeadStrokes(random: () => number, size: number, margin: number): Stroke[] {
	const span = size - margin * 2;
	const x0 = size / 2 + (random() - 0.5) * 0.3 * span;
	const top = (0.86 + random() * 0.12) * (size - margin);
	const tipX = x0 + (random() - 0.5) * 0.25 * span;
	const stalk: Stroke = {
		points: [],
		half: [],
		color: [1.05, 1.0, 0.8]
	};
	for (let i = 0; i <= 8; i++) {
		const t = i / 8;
		stalk.points.push([x0 + (tipX - x0) * t * t, top * t]);
		stalk.half.push(Math.max(0.35, span * 0.012 * (1 - t * 0.5)));
	}
	const head: Stroke = { points: [], half: [], color: [1.5, 1.28, 0.7] };
	const headLength = span * 0.17;
	for (let i = 0; i <= 6; i++) {
		const t = i / 6;
		head.points.push([tipX + (random() - 0.5) * 0.6, top - headLength * (1 - t)]);
		head.half.push(span * 0.03 * Math.sin(Math.PI * (0.15 + t * 0.7)) + 0.4);
	}
	return [stalk, head];
}

function renderTile(recipe: VariantRecipe, index: number, size: number): AtlasTile {
	const random = rng(0x9a55 + index * 7919);
	const margin = Math.max(2, Math.round(size / 32));
	const tile = createAtlasTile(size);
	const cover = new Float32Array(size * size);
	const strokes: Stroke[] = [];
	for (let i = 0; i < recipe.blades; i++) strokes.push(bladeStroke(recipe, random, size, margin));
	// Taller blades behind, short ones in front — reads as depth inside the tuft.
	strokes.sort((a, b) => b.points[b.points.length - 1][1] - a.points[a.points.length - 1][1]);
	for (let i = 0; i < (recipe.seedHeads ?? 0); i++)
		strokes.unshift(...seedHeadStrokes(random, size, margin));
	for (const stroke of strokes) {
		rasterStroke(stroke, size, cover);
		compositeOver(tile, cover, stroke.color);
	}
	return finishTile(tile);
}

/** Generates the atlas once. `tileSize` must be a power of two ≥ 16 (64 for LOW, 128 otherwise). */
export function generateGrassAtlas(tileSize = 128): GrassAtlas {
	const tiles = VARIANTS.map((recipe, index) => renderTile(recipe, index, tileSize));
	const { levels, coverage } = buildAtlasLevels(tiles, GRASS_ATLAS_COLUMNS, GRASS_ATLAS_ROWS, {
		cutoff: GRASS_ATLAS_ALPHA_CUTOFF,
		minTile: MIN_TILE_TEXELS,
		// Stored halved: 128 ≈ ×1.
		rgbScale: 0.5
	});
	return { tileSize, levels, coverage };
}

export function grassVariantName(variant: number): string {
	return VARIANTS[variant]?.name ?? 'unknown';
}

/** Wide meadow patch: many slender blades baked once, shared by all distant cards. */
export function generateGrassPatchAtlas(tileSize = 64): GrassAtlas {
	const tiles = VARIANTS.map((recipe, index) =>
		renderTile(
			{
				...recipe,
				blades: recipe.blades * 3,
				spread: 0.9,
				width: [recipe.width[0] / 3, recipe.width[1] / 3],
				lean: recipe.lean / 3
			},
			index,
			tileSize
		)
	);
	const { levels, coverage } = buildAtlasLevels(tiles, GRASS_ATLAS_COLUMNS, GRASS_ATLAS_ROWS, {
		cutoff: GRASS_ATLAS_ALPHA_CUTOFF,
		minTile: MIN_TILE_TEXELS,
		rgbScale: 0.5
	});
	return { tileSize, levels, coverage };
}
