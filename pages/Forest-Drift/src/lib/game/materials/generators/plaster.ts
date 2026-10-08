import { fbm, fbm01, gradientNoise, hash01, ridged, smoothstep } from '../noise/tileableNoise';
import type { ResolvedMaterialRecipe } from '../ProceduralMaterialTypes';
import type { SurfaceCanvas } from '../SurfaceCanvas';
import { layerSeeds, paletteColor, periodFor } from './generatorUtils';

const LAYER = {
	warp: 1,
	mottle: 2,
	trowel: 3,
	grain: 4,
	crack: 5,
	crackMask: 6,
	streak: 7,
	dirt: 8,
	pits: 9,
	speck: 10
};

/**
 * Aged lime plaster / stucco. Built from several independent scales so it reads as plaster rather
 * than noisy concrete: broad, soft colour mottling (≈0.8 m), trowel-stroke undulation (≈0.25 m),
 * fine sand grain (a few texels), occasional hairline cracks in patches, small pits, and faint
 * vertical rain streaks (V is up on walls — see `surfaceMapping.ts`). From a distance only the
 * mottling survives mip-mapping, which keeps far walls calm; up close the grain and cracks appear.
 */
export function paintPlaster(canvas: SurfaceCanvas, recipe: ResolvedMaterialRecipe): void {
	const { size, tileWidth, tileHeight } = canvas;
	const seed = recipe.seed;
	const rough = recipe.variant === 'rough';

	const base = paletteColor(recipe, 'base');
	const light = paletteColor(recipe, 'light');
	const dark = paletteColor(recipe, 'dark');
	const dirtColor = paletteColor(recipe, 'dirt');
	const stain = paletteColor(recipe, 'stain');
	const moss = paletteColor(recipe, 'moss');

	const warpP = periodFor(tileWidth, 1.2);
	const mottleP = periodFor(tileWidth, 0.8);
	const trowelPx = periodFor(tileWidth, rough ? 0.12 : 0.22);
	const trowelPy = periodFor(tileHeight, rough ? 0.1 : 0.18);
	const grainP = Math.max(8, Math.round(size / 2.5));
	const crackP = periodFor(tileWidth, 0.35);
	const crackMaskP = periodFor(tileWidth, 1.1);
	const streakPx = periodFor(tileWidth, 0.06);
	const streakPy = periodFor(tileHeight, 1.2);
	const dirtP = periodFor(tileWidth, 0.6);
	const pitP = Math.max(8, Math.round(size / 6));

	const seeds = layerSeeds(seed, LAYER);

	const variation = recipe.variation;
	const weathering = recipe.weathering;
	const dirtAmount = recipe.dirt;

	for (let y = 0; y < size; y++) {
		const t = (y + 0.5) / size;
		for (let x = 0; x < size; x++) {
			const s = (x + 0.5) / size;
			const i = y * size + x;

			const warp = fbm(s, t, warpP, warpP, 3, seeds.warp) * 0.06;
			const mottle = fbm01(s + warp, t - warp, mottleP, mottleP, 4, seeds.mottle);
			const trowel = fbm(s + warp * 0.5, t, trowelPx, trowelPy, 3, seeds.trowel);
			const grain = gradientNoise(s * grainP, t * grainP, grainP, grainP, seeds.grain);
			const speck = hash01(x, y, seeds.speck);

			// Base colour: mottle between the palette's dark and light plaster tones around `base`.
			canvas.setColor(i, base);
			const m = (mottle - 0.5) * 2;
			if (m > 0) canvas.mixColor(i, light, m * (0.35 + variation * 0.5));
			else canvas.mixColor(i, dark, -m * (0.35 + variation * 0.5));
			canvas.scaleColor(i, 1 + grain * 0.03 + trowel * 0.015);
			if (speck < 0.006) canvas.scaleColor(i, 0.86);
			else if (speck > 0.996) canvas.scaleColor(i, 1.06);

			// Faint vertical rain streaks, stronger with age.
			const streak = fbm01(s, t, streakPx, streakPy, 2, seeds.streak);
			const streakAmount = smoothstep(0.58, 0.85, streak) * weathering * 0.22;
			canvas.mixColor(i, stain, streakAmount);

			// Broad, soft dirt blotches.
			const dirtField = fbm01(s, t, dirtP, dirtP, 3, seeds.dirt);
			canvas.mixColor(i, dirtColor, smoothstep(0.55, 0.9, dirtField) * dirtAmount * 0.18);
			canvas.mixColor(i, moss, smoothstep(0.7, 0.95, dirtField) * recipe.moss * 0.25);

			// Hairline cracks, only inside sparse patches so walls aren't uniformly crazed.
			const crackMask = smoothstep(
				0.58,
				0.78,
				fbm01(s, t, crackMaskP, crackMaskP, 2, seeds.crackMask)
			);
			let crack = 0;
			if (crackMask > 0) {
				const ridge = ridged(s + warp, t - warp, crackP, crackP, 2, seeds.crack);
				crack = smoothstep(0.93, 0.985, ridge) * crackMask * (0.35 + weathering * 0.65);
				canvas.mixColor(i, dirtColor, crack * 0.55);
			}

			// Small pits from air bubbles in the render.
			const pitNoise = gradientNoise(s * pitP, t * pitP, pitP, pitP, seeds.pits);
			const pit = smoothstep(0.62, 0.8, pitNoise) * (rough ? 1 : 0.6);
			if (pit > 0) canvas.scaleColor(i, 1 - pit * 0.08);

			canvas.height[i] =
				trowel * (rough ? 0.0025 : 0.0014) +
				(mottle - 0.5) * 0.0012 +
				grain * (rough ? 0.00045 : 0.00028) -
				crack * 0.0012 -
				pit * 0.0006;
			canvas.roughness[i] = Math.min(
				1,
				recipe.roughness + grain * 0.03 - (mottle - 0.5) * 0.05 + crack * 0.06 + streakAmount * 0.1
			);
		}
	}
}
