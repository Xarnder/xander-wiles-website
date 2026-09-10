import { clamp, wrap } from './breathing';

/** Height from bottom (0) to top (1); holds occupy time without movement. */
export function lineHeight(progress: number): number {
	const p = wrap(progress);
	if (p < 0.25) return p * 4;
	if (p < 0.5) return 1;
	if (p < 0.75) return 3 - p * 4;
	return 0;
}
/** Direction changes at endpoints advance the user's self-reported hold. */
export function lineProgress(current: number, height: number): number {
	let h = clamp(height, 0, 1);
	if (h > 0.98) h = 1;
	if (h < 0.02) h = 0;
	const p = wrap(current);
	if (p < 0.25) return h / 4;
	if (p < 0.5) return h >= 0.98 ? 0.25 : 0.5 + (1 - h) / 4;
	if (p < 0.75) return 0.5 + (1 - h) / 4;
	return h <= 0.02 ? 0.75 : h / 4;
}
