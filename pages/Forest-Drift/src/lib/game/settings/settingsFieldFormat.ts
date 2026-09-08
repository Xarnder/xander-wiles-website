/** How many decimal places a settings slider should show for a given step. */
export function decimalsForStep(step: number): number {
	if (!Number.isFinite(step) || step <= 0 || step >= 1) return 0;
	return Math.min(6, Math.max(1, Math.ceil(-Math.log10(step) - 1e-10)));
}

export function formatSettingsNumber(value: number, step: number): string {
	if (!Number.isFinite(value)) return '';
	return value.toFixed(decimalsForStep(step));
}

export function snapSettingsNumber(value: number, min: number, max: number, step: number): number {
	const clamped = Math.min(max, Math.max(min, value));
	if (!Number.isFinite(step) || step <= 0) return clamped;
	const snapped = min + Math.round((clamped - min) / step) * step;
	return Number(Math.min(max, Math.max(min, snapped)).toFixed(decimalsForStep(step)));
}
