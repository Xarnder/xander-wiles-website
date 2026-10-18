/// <reference lib="webworker" />
import { paintTimber } from '$lib/game/materials/generators/timber';
import { resolveMaterialRecipe } from '$lib/game/materials/materialPresets';
import { SurfaceCanvas } from '$lib/game/materials/SurfaceCanvas';

// Reuse the game's timber grain, knots and checks. UI only needs colour: no normal/ORM
// maps, Three.js renderer, WebGL context, or ongoing shader work.
self.onmessage = () => {
	const started = performance.now();
	const size = 512;
	const recipe = resolveMaterialRecipe('timber', {
		seed: 'forest-drift-ui',
		variant: 'aged-brown',
		weathering: 0.18,
		dirt: 0,
		variation: 0.22,
		planks: false,
		quality: 'low'
	});
	recipe.tileWidth = 1.2;
	recipe.tileHeight = 0.24;
	recipe.colors = {
		base: [100 / 255, 83 / 255, 63 / 255],
		dark: [0.2, 0.17, 0.13],
		light: [0.48, 0.4, 0.3],
		weathered: [0.36, 0.32, 0.26],
		knot: [0.15, 0.125, 0.1]
	};
	const surface = new SurfaceCanvas(size, recipe.tileWidth, recipe.tileHeight);
	paintTimber(surface, recipe);
	const pixels = new Uint8ClampedArray(size * size * 4);
	// The game material is tileable and its growth rings are evenly spaced. Bake a
	// single non-wrapping, irregular crop for UI so broad cards don't look striped.
	const channels = [surface.red, surface.green, surface.blue];
	for (let y = 0; y < size; y++) {
		const v = y / (size - 1);
		for (let x = 0; x < size; x++) {
			const u = x / (size - 1);
			const sx = (0.07 + u * 0.86) * (size - 1);
			const drift =
				0.035 * Math.sin(u * 5.3 + v * 7.1) +
				0.018 * Math.sin(u * 11.7 - v * 13.3) +
				0.012 * Math.sin(v * 31.1 + u * 2.8);
			const sy = (0.09 + v * 0.8 + drift) * (size - 1);
			const x0 = Math.floor(sx);
			const y0 = Math.floor(sy);
			const fx = sx - x0;
			const fy = sy - y0;
			const i = y * size + x;
			for (let c = 0; c < 3; c++) {
				const channel = channels[c];
				const top = channel[y0 * size + x0] * (1 - fx) + channel[y0 * size + x0 + 1] * fx;
				const bottom =
					channel[(y0 + 1) * size + x0] * (1 - fx) + channel[(y0 + 1) * size + x0 + 1] * fx;
				pixels[i * 4 + c] = Math.round((top * (1 - fy) + bottom * fy) * 255);
			}
			pixels[i * 4 + 3] = 255;
		}
	}
	self.postMessage(
		{ size, pixels, bakeMs: performance.now() - started },
		{ transfer: [pixels.buffer] }
	);
};
