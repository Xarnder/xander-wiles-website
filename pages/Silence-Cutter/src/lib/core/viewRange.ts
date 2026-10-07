/**
 * Normalised visible-range math for the zoom scrollbar / timeline navigator.
 *
 * A range is `{ start, end }` with `0 <= start < end <= 1` and `end - start >= minRange`. All drag
 * operations are computed from the range captured when the drag began plus the total pointer
 * delta (never incrementally), so floating-point error cannot accumulate and nothing jumps when a
 * drag starts (delta 0 returns the initial range exactly).
 */

export interface ViewRange {
	start: number;
	end: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A usable minimum width: positive and at most the whole track. */
export function effectiveMinRange(minRange: number): number {
	return Number.isFinite(minRange) && minRange > 0 ? Math.min(1, minRange) : 1e-6;
}

/** Repair an arbitrary range into a valid one (used for incoming controlled values). */
export function sanitizeRange(r: ViewRange, minRange: number): ViewRange {
	const min = effectiveMinRange(minRange);
	let start = Number.isFinite(r.start) ? r.start : 0;
	let end = Number.isFinite(r.end) ? r.end : 1;
	if (end < start) [start, end] = [end, start];
	start = clamp(start, 0, 1);
	end = clamp(end, 0, 1);
	if (end - start < min) {
		// Grow around the centre, then slide back inside the track.
		const mid = (start + end) / 2;
		start = mid - min / 2;
		end = mid + min / 2;
		if (start < 0) [start, end] = [0, min];
		if (end > 1) [start, end] = [1 - min, 1];
	}
	return { start, end };
}

/**
 * Move one handle by `delta` (normalised) from the drag's initial range. The other edge stays
 * exactly where it was; handles can never cross or come closer than `minRange`.
 */
export function dragHandle(
	initial: ViewRange,
	handle: 'start' | 'end',
	delta: number,
	minRange: number
): ViewRange {
	const min = effectiveMinRange(minRange);
	if (handle === 'start') {
		return { start: clamp(initial.start + delta, 0, initial.end - min), end: initial.end };
	}
	return { start: initial.start, end: clamp(initial.end + delta, initial.start + min, 1) };
}

/** Pan the whole range by `delta`, preserving its width exactly and clamping at both ends. */
export function panRange(initial: ViewRange, delta: number): ViewRange {
	const width = initial.end - initial.start;
	const start = clamp(initial.start + delta, 0, 1 - width);
	// Derive `end` from the clamped start; snap to the edge when floating point overshoots.
	return start + width > 1 ? { start: 1 - width, end: 1 } : { start, end: start + width };
}

/** Centre the range on `at` (normalised), preserving its width — used for clicks on the track. */
export function centerRangeAt(current: ViewRange, at: number): ViewRange {
	const width = current.end - current.start;
	return panRange(current, at - width / 2 - current.start);
}

/** Zoom factor shown to users: 1 = whole timeline visible. */
export function zoomOf(r: ViewRange): number {
	return 1 / Math.max(1e-12, r.end - r.start);
}
