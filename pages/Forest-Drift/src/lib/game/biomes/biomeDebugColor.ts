import { BIOME_DEFINITIONS } from './biomeDefinitions';
import { BIOME_COUNT, type BiomeWeightVector } from './BiomeTypes';

/** sRGB hex → linear 0..1 (vertex colours are linear, like the rest of the terrain palette). */
function srgbToLinear(channel: number): number {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Each biome's debug colour as linear RGB, index-aligned with BIOME_IDS. */
export const BIOME_DEBUG_RGB: Float32Array = (() => {
	const out = new Float32Array(BIOME_COUNT * 3);
	BIOME_DEFINITIONS.forEach((def, i) => {
		const hex = def.debugColor.replace('#', '');
		out[i * 3] = srgbToLinear(parseInt(hex.slice(0, 2), 16));
		out[i * 3 + 1] = srgbToLinear(parseInt(hex.slice(2, 4), 16));
		out[i * 3 + 2] = srgbToLinear(parseInt(hex.slice(4, 6), 16));
	});
	return out;
})();

/** "Biome map" debug view: every biome's flat colour, blended by weight (borders show as blends). */
export function writeBiomeMapColor(
	weights: BiomeWeightVector,
	out: Float32Array,
	offset: number
): void {
	let r = 0;
	let g = 0;
	let b = 0;
	for (let k = 0; k < BIOME_COUNT; k++) {
		const w = weights[k];
		if (w === 0) continue;
		r += BIOME_DEBUG_RGB[k * 3] * w;
		g += BIOME_DEBUG_RGB[k * 3 + 1] * w;
		b += BIOME_DEBUG_RGB[k * 3 + 2] * w;
	}
	out[offset] = r;
	out[offset + 1] = g;
	out[offset + 2] = b;
}

/**
 * "Climate" debug view: temperature runs blue (cold) → red (hot); moisture adds green, so wet
 * ground is greener and dry ground greyer. Includes the elevation lapse, so mountains read blue.
 */
export function writeClimateColor(
	temperature: number,
	moisture: number,
	out: Float32Array,
	offset: number
): void {
	const t = temperature < 0 ? 0 : temperature > 1 ? 1 : temperature;
	const m = moisture < 0 ? 0 : moisture > 1 ? 1 : moisture;
	out[offset] = t * t * 0.9 + 0.05;
	out[offset + 1] = m * m * 0.75 + 0.05;
	out[offset + 2] = (1 - t) * (1 - t) * 0.9 + 0.05;
}
