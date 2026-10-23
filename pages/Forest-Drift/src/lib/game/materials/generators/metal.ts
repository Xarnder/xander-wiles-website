import {
	cellular,
	createCellularSample,
	fbm,
	fbm01,
	hash01,
	smoothstep
} from '../noise/tileableNoise';
import type { ResolvedMaterialRecipe } from '../ProceduralMaterialTypes';
import type { SurfaceCanvas } from '../SurfaceCanvas';
import { layerSeeds, paletteColor, periodFor } from './generatorUtils';

const LAYER = {
	facets: 1,
	draw: 2,
	mottle: 3,
	patina: 4,
	patinaDetail: 5,
	pits: 6
};

/**
 * Hand-worked metal for hinges, handles, hoops and stove plates. Small hammer facets (≈1.5 cm, the
 * forged look) under fine draw-file streaks along U, broad tone mottling, and patches of rust (iron)
 * or verdigris (brass) that grow with `weathering`. It is the only generator that writes
 * metalness: bare metal is metallic and fairly glossy, patina is a rough non-metal crust, so a
 * weathered piece reads as metal where it is worn bright and as oxide in its corners.
 */
export function paintMetal(canvas: SurfaceCanvas, recipe: ResolvedMaterialRecipe): void {
	const { size, tileWidth, tileHeight } = canvas;
	const brass = recipe.variant === 'brass';
	const base = paletteColor(recipe, 'base');
	const dark = paletteColor(recipe, 'dark');
	const light = paletteColor(recipe, 'light');
	const patinaColor = paletteColor(recipe, 'patina');
	const seeds = layerSeeds(recipe.seed, LAYER);

	const facetX = periodFor(tileWidth, brass ? 0.022 : 0.015);
	const facetY = periodFor(tileHeight, brass ? 0.022 : 0.015);
	const drawX = periodFor(tileWidth, 0.12);
	const drawY = periodFor(tileHeight, 0.0025);
	const mottleX = periodFor(tileWidth, 0.09);
	const mottleY = periodFor(tileHeight, 0.09);
	const patinaX = periodFor(tileWidth, 0.07);
	const patinaY = periodFor(tileHeight, 0.07);
	const pitP = Math.max(8, Math.round(size / 3));
	const bareMetalness = brass ? 0.9 : 0.75;
	// More weathering → more of the surface crusted over.
	const patinaThreshold = 0.78 - recipe.weathering * 0.32;
	const sample = createCellularSample();

	for (let y = 0; y < size; y++) {
		const t = (y + 0.5) / size;
		for (let x = 0; x < size; x++) {
			const s = (x + 0.5) / size;
			const i = y * size + x;

			cellular(s * facetX, t * facetY, facetX, facetY, seeds.facets, 0.85, sample);
			// Shallow dish per hammer blow, with a soft ridge where two blows meet.
			const dish = Math.min(1, sample.f1 * sample.f1 * 1.6);
			const facetTone = hash01(sample.cellId & 0xffff, sample.cellId >>> 16, seeds.facets) - 0.5;
			const draw = fbm(s, t, drawX, drawY, 2, seeds.draw);
			const mottle = fbm01(s, t, mottleX, mottleY, 3, seeds.mottle);

			const patinaField =
				fbm01(s, t, patinaX, patinaY, 4, seeds.patina) * 0.8 +
				fbm01(s, t, patinaX * 4, patinaY * 4, 2, seeds.patinaDetail) * 0.2;
			const patina = smoothstep(patinaThreshold, patinaThreshold + 0.14, patinaField);
			const pit = hash01(Math.floor(s * pitP), Math.floor(t * pitP), seeds.pits);
			const pitted = pit > 0.985 ? 1 : 0;

			canvas.setColor(i, base);
			if (mottle < 0.5) canvas.mixColor(i, dark, (0.5 - mottle) * 1.1 * recipe.variation);
			else canvas.mixColor(i, light, (mottle - 0.5) * 0.9 * recipe.variation);
			canvas.scaleColor(i, 1 + facetTone * 0.09 * recipe.variation + draw * 0.04 - dish * 0.05);
			canvas.mixColor(i, patinaColor, patina * 0.85);
			if (pitted) canvas.mixColor(i, dark, 0.5);

			canvas.height[i] = -dish * 0.00035 + draw * 0.00002 + patina * 0.00012 - pitted * 0.0002;
			canvas.roughness[i] = Math.min(
				1,
				recipe.roughness + draw * 0.06 + Math.abs(facetTone) * 0.08 + patina * 0.4
			);
			canvas.metalness[i] = bareMetalness * (1 - patina * 0.85) * (1 - pitted * 0.5);
		}
	}
}
