import { formatSpeedFactor } from './format';
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

export function bounceLoopFilter(): string {
	return 'split[fwd][tmp];[tmp]reverse[rev];[fwd][rev]concat=n=2:v=1:a=0';
}

export function speedFilter(speed: number): string | null {
	if (!Number.isFinite(speed) || speed <= 1.001) return null;
	return `setpts=PTS/${formatSpeedFactor(speed)}`;
}

export function videoPrepFilter(settings: GifSettings, bounce = false, speed = 1): string {
	let prep = `${fpsFilter(settings)},${scaleFilter(settings)}`;
	if (bounce) {
		prep = `${prep},${bounceLoopFilter()}`;
	}
	const speedPart = speedFilter(speed);
	if (speedPart) {
		prep = `${prep},${speedPart},${fpsFilter(settings)}`;
	}
	return prep;
}

export function combinedPaletteFilter(settings: GifSettings, bounce = false, speed = 1): string {
	return `${videoPrepFilter(settings, bounce, speed)},split[s0][s1];[s0]${paletteGenFilter(settings)}[p];[s1][p]${paletteUseFilter(settings)}`;
}

export function paletteUseComplex(settings: GifSettings, bounce = false, speed = 1): string {
	return `[0:v]${videoPrepFilter(settings, bounce, speed)}[x];[x][1:v]${paletteUseFilter(settings)}`;
}
