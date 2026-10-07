/**
 * Manual edit operations. Each returns the override(s) to append — the override list is the only
 * thing that changes — so every operation is undoable and survives detector parameter changes.
 */
import { regionIndexAt } from './edl';
import { EPSILON, findRangeIndex } from './ranges';
import type { CutParams, EditAction, EditRegion, ManualOverride, Range } from './types';

type NewOverride = ManualOverride extends infer O
	? O extends { id: number }
		? Omit<O, 'id'>
		: never
	: never;

/**
 * Toggle the region under `t`:
 * - a removed region → keep it;
 * - retained material that the detectors consider silent (a pause too short to cut, or the
 *   padding around a cut) → remove that silence, leaving lead/trail around the neighbouring speech.
 * Returns null when `t` is on retained speech (nothing sensible to toggle).
 */
export function toggleAt(
	edl: readonly EditRegion[],
	t: number,
	combinedSilence: readonly Range[],
	cut: Pick<CutParams, 'leadMs' | 'trailMs'>,
	duration: number
): NewOverride | null {
	const i = regionIndexAt(edl, t);
	if (i < 0) return null;
	const region = edl[i];
	if (region.action === 'remove') {
		return { kind: 'paint', start: region.start, end: region.end, action: 'keep' };
	}
	const si = findRangeIndex(combinedSilence, t);
	if (si < 0) return null;
	const s = combinedSilence[si];
	const start = s.start <= EPSILON ? 0 : s.start + cut.trailMs / 1000;
	const end = s.end >= duration - EPSILON ? duration : s.end - cut.leadMs / 1000;
	// When padding would consume the whole pause, the user explicitly asked: remove the pause.
	const range = end - start > 0.01 ? { start, end } : { start: s.start, end: s.end };
	if (t < range.start || t > range.end) {
		// Clicked on padding next to an existing cut: extend over the whole retained part.
		return {
			kind: 'paint',
			start: Math.min(range.start, t),
			end: Math.max(range.end, t),
			action: 'remove'
		};
	}
	return { kind: 'paint', ...range, action: 'remove' };
}

/** Which region boundary (if any) lies within `tolerance` seconds of `t`. */
export function boundaryNear(
	edl: readonly EditRegion[],
	t: number,
	tolerance: number
): { time: number; leftIndex: number } | null {
	let best: { time: number; leftIndex: number } | null = null;
	let bestDist = tolerance;
	for (let i = 0; i + 1 < edl.length; i++) {
		const b = edl[i].end;
		if (edl[i].action === edl[i + 1].action) continue; // only keep/remove borders are draggable
		const d = Math.abs(b - t);
		if (d <= bestDist) {
			bestDist = d;
			best = { time: b, leftIndex: i };
		}
	}
	return best;
}

/**
 * Dragging the border between region `leftIndex` and the next from `from` to `to`. The swept
 * span takes the action of the region that grows.
 */
export function dragBoundary(
	edl: readonly EditRegion[],
	leftIndex: number,
	from: number,
	to: number
): NewOverride | null {
	const left = edl[leftIndex];
	const right = edl[leftIndex + 1];
	if (!left || !right || Math.abs(to - from) <= EPSILON) return null;
	// Clamp so a drag never crosses the far edge of either neighbour.
	const clamped = Math.min(Math.max(to, left.start), right.end);
	if (clamped > from) {
		return { kind: 'paint', start: from, end: clamped, action: left.action };
	}
	return { kind: 'paint', start: clamped, end: from, action: right.action };
}

export function markRange(range: Range, action: EditAction): NewOverride | null {
	const start = Math.min(range.start, range.end);
	const end = Math.max(range.start, range.end);
	if (end - start <= EPSILON) return null;
	return { kind: 'paint', start, end, action };
}

export function splitAt(edl: readonly EditRegion[], t: number): NewOverride | null {
	const i = regionIndexAt(edl, t);
	if (i < 0) return null;
	const r = edl[i];
	if (t - r.start < 0.005 || r.end - t < 0.005) return null;
	return { kind: 'split', at: t };
}

/**
 * Merge every region overlapping `range` into one region with the action of the region where the
 * range starts.
 */
export function mergeRange(edl: readonly EditRegion[], range: Range): NewOverride | null {
	const first = regionIndexAt(edl, range.start);
	const last = regionIndexAt(edl, Math.max(range.start, range.end - EPSILON));
	if (first < 0 || last < 0 || last <= first) return null;
	return {
		kind: 'paint',
		start: edl[first].start,
		end: edl[last].end,
		action: edl[first].action
	};
}

/** Remove split markers inside a range (used alongside merge). */
export function dropSplitsIn(overrides: readonly ManualOverride[], range: Range): ManualOverride[] {
	return overrides.filter(
		(o) => o.kind !== 'split' || o.at <= range.start + EPSILON || o.at >= range.end - EPSILON
	);
}
