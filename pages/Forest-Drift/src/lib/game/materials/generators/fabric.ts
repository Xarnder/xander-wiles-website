import type { ResolvedMaterialRecipe } from '../ProceduralMaterialTypes';
import type { SurfaceCanvas } from '../SurfaceCanvas';
import { hash01 } from '../noise/tileableNoise';
import { paletteColor } from './generatorUtils';

/**
 * Seamless plain weave, baked once into cached maps: no added geometry, shader loops or per-frame
 * work. Sixteen threads across a 12.5cm tile give even the 64px low tier four samples per thread.
 * The alternating warp/weft, yarn crowns and small seeded dye variation soften naturally in mips.
 */
export function paintFabric(canvas: SurfaceCanvas, recipe: ResolvedMaterialRecipe): void {
	const base = paletteColor(recipe, 'base');
	const threads = 16;
	for (let y = 0; y < canvas.size; y++) {
		const v = ((y + 0.5) / canvas.size) * threads,
			row = Math.floor(v);
		const weft = Math.sin(Math.PI * (v - row));
		for (let x = 0; x < canvas.size; x++) {
			const u = ((x + 0.5) / canvas.size) * threads,
				col = Math.floor(u),
				i = y * canvas.size + x;
			const warp = Math.sin(Math.PI * (u - col));
			const vertical = (row + col) % 2 === 0;
			const crown = vertical ? warp : weft,
				under = vertical ? weft : warp;
			const yarn = hash01(vertical ? col : row, vertical ? 0 : 1, recipe.seed) - 0.5;
			const relief = crown * (0.72 + 0.28 * under);
			canvas.setColor(i, base);
			canvas.scaleColor(i, 0.87 + 0.17 * relief + yarn * 0.1 * recipe.variation);
			canvas.height[i] = relief * 0.00025;
			canvas.roughness[i] = Math.min(1, recipe.roughness + 0.025 * (1 - relief));
		}
	}
}
