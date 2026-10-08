import { paintGlass, paintGrass, paintGround } from './generators/ground';
import { paintPlaster } from './generators/plaster';
import { paintSlate } from './generators/slate';
import { paintMasonry, paintPaving } from './generators/stone';
import { paintTimber } from './generators/timber';
import {
	MATERIAL_QUALITY_SETTINGS,
	type MaterialMapData,
	type ProceduralMaterialType,
	type ResolvedMaterialRecipe
} from './ProceduralMaterialTypes';
import { finalizeSurface, SurfaceCanvas } from './SurfaceCanvas';

interface GeneratorEntry {
	paint: (canvas: SurfaceCanvas, recipe: ResolvedMaterialRecipe) => void;
	/** Fraction of the quality tier's resolution this material needs. Timber is narrow on screen and its tile is short across the grain; glass carries almost no detail. */
	resolutionScale: number;
	/** How strongly cavities (joints, gaps, cracks) darken ambient occlusion. */
	cavityAo: number;
	/** Radius (metres) of the neighbourhood a cavity is measured against. */
	cavityRadius: number;
}

/**
 * The one table mapping a material type to its generator. Adding a material type means adding a
 * generator and one entry here — no Three.js, cache or world-generation code changes.
 */
const GENERATORS: Readonly<Record<ProceduralMaterialType, GeneratorEntry>> = {
	plaster: { paint: paintPlaster, resolutionScale: 1, cavityAo: 120, cavityRadius: 0.01 },
	timber: { paint: paintTimber, resolutionScale: 0.5, cavityAo: 150, cavityRadius: 0.006 },
	slate: { paint: paintSlate, resolutionScale: 1, cavityAo: 60, cavityRadius: 0.025 },
	masonry: { paint: paintMasonry, resolutionScale: 1, cavityAo: 45, cavityRadius: 0.03 },
	paving: { paint: paintPaving, resolutionScale: 1, cavityAo: 45, cavityRadius: 0.03 },
	ground: { paint: paintGround, resolutionScale: 1, cavityAo: 60, cavityRadius: 0.015 },
	grass: { paint: paintGrass, resolutionScale: 1, cavityAo: 50, cavityRadius: 0.012 },
	glass: { paint: paintGlass, resolutionScale: 0.25, cavityAo: 0, cavityRadius: 0.01 }
};

/** Albedo/normal resolution for a recipe — exposed so caches and tests agree on it. */
export function mapResolutionFor(recipe: Pick<ResolvedMaterialRecipe, 'type' | 'quality'>): number {
	const tier = MATERIAL_QUALITY_SETTINGS[recipe.quality];
	return Math.max(64, tier.resolution * GENERATORS[recipe.type].resolutionScale);
}

/**
 * Generates every map for a resolved recipe. Pure and deterministic: no Three.js, no DOM, no global
 * state — the same recipe produces byte-identical output in the main thread, a worker, or Node.
 */
export function generateMaterialMaps(recipe: ResolvedMaterialRecipe): MaterialMapData {
	const generator = GENERATORS[recipe.type];
	const size = mapResolutionFor(recipe);
	const ormSize = Math.max(32, size * MATERIAL_QUALITY_SETTINGS[recipe.quality].ormScale);
	const canvas = new SurfaceCanvas(size, recipe.tileWidth, recipe.tileHeight);
	generator.paint(canvas, recipe);
	return finalizeSurface(canvas, {
		normalStrength: recipe.normalStrength,
		ormSize,
		cavityAo: generator.cavityAo,
		cavityRadius: generator.cavityRadius
	});
}
