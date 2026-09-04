import type { GifSettings } from './types';

export function scaleFilter(settings: GifSettings): string {
	return `scale=${settings.width}:${settings.height}:flags=${settings.scaleFlags}`;
}

export function fpsFilter(settings: GifSettings): string {
	return `fps=${settings.fps}:round=near`;
}

export function paletteGenFilter(settings: GifSettings): string {
	return `palettegen=max_colors=${settings.colours}:stats_mode=${settings.statsMode}:reserve_transparent=0`;
}

export function paletteUseFilter(settings: GifSettings): string {
	if (settings.dither === 'bayer') {
		const scale = settings.bayerScale ?? 3;
		return `paletteuse=dither=bayer:bayer_scale=${scale}`;
	}
	if (settings.dither === 'none') {
		return 'paletteuse=dither=none';
	}
	return `paletteuse=dither=${settings.dither}`;
}

export function palettePassFilter(settings: GifSettings): string {
	return `${fpsFilter(settings)},${scaleFilter(settings)},${paletteGenFilter(settings)}`;
}

export function videoPrepFilter(settings: GifSettings): string {
	return `${fpsFilter(settings)},${scaleFilter(settings)}`;
}

export function combinedPaletteFilter(settings: GifSettings): string {
	return `${fpsFilter(settings)},${scaleFilter(settings)},split[s0][s1];[s0]${paletteGenFilter(settings)}[p];[s1][p]${paletteUseFilter(settings)}`;
}

export function paletteUseComplex(settings: GifSettings): string {
	return `[0:v]${videoPrepFilter(settings)}[x];[x][1:v]${paletteUseFilter(settings)}`;
}
