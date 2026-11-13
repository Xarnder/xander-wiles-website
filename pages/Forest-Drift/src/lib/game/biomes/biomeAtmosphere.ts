import type { EffectiveSkyLook } from '../sky/dayNightMath';
import type { LocalClimateState } from './LocalClimate';

function parse(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	const v = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h.slice(0, 6), 16);
	return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function toHex(r: number, g: number, b: number): string {
	const c = (v: number) =>
		Math.round(Math.min(1, Math.max(0, v)) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${c(r)}${c(g)}${c(b)}`;
}

/** `hex` leaned toward the biome tint by `amount`, keeping its brightness (day/night still leads). */
function tint(hex: string, state: LocalClimateState): string {
	const [r, g, b] = parse(hex);
	const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	const tl = 0.2126 * state.fogR + 0.7152 * state.fogG + 0.0722 * state.fogB || 1;
	// The tint's hue at this colour's brightness: a dust tint at dusk stays dusky.
	const k = lum / tl;
	const a = state.fogAmount;
	return toHex(
		r + (state.fogR * k - r) * a,
		g + (state.fogG * k - g) * a,
		b + (state.fogB * k - b) * a
	);
}

/**
 * Layers the local biome's air on the day/night + weather look (decision Q26): horizon, ground haze
 * and fog colour lean toward the biome's tint (≤ 30%, brightness kept), and fog closes in by its
 * density (≤ 1.7×). Neutral air (most temperate biomes) returns the look unchanged.
 */
export function applyBiomeAtmosphere(
	look: EffectiveSkyLook,
	state: LocalClimateState
): EffectiveSkyLook {
	if (state.fogAmount < 0.002 && Math.abs(state.fogDensity - 1) < 0.002) return look;
	const density = Math.max(1, state.fogDensity);
	return {
		...look,
		sky: {
			...look.sky,
			horizonColor: tint(look.sky.horizonColor, state),
			groundHazeColor: tint(look.sky.groundHazeColor, state)
		},
		atmosphere: {
			...look.atmosphere,
			fogColor: tint(look.atmosphere.fogColor, state),
			fogNear: look.atmosphere.fogNear / Math.pow(density, 0.8),
			fogFar: look.atmosphere.fogFar / Math.pow(density, 0.85)
		}
	};
}
