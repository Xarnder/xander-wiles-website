/**
 * Selection, navigation and snapping helpers for manual editing. Pure functions over the EDL and
 * transcript so the timeline, transcript panel and keyboard all behave identically.
 */
import { regionIndexAt } from './edl';
import { EPSILON } from './ranges';
import type { EditRegion, Range, TranscriptWord } from './types';

/**
 * The segments the user sees and edits: EDL regions merged across boundaries that only reflect
 * which detector produced an automatic cut (both / audio / transcript). A boundary is kept when the
 * action changes, when manual and automatic decisions meet, or where the user split.
 *
 * Everything the user clicks, selects, restores or steps through uses these segments, so a piece
 * created with Split is always selectable on its own.
 */
export function buildSegments(
	edl: readonly EditRegion[],
	splitPoints: readonly number[]
): EditRegion[] {
	const isSplit = (t: number) => splitPoints.some((p) => Math.abs(p - t) <= EPSILON);
	const out: EditRegion[] = [];
	const longest: number[] = []; // length of the piece that labels each merged segment
	for (const r of edl) {
		const last = out[out.length - 1];
		if (
			last &&
			last.action === r.action &&
			last.manual === r.manual &&
			Math.abs(last.end - r.start) <= EPSILON &&
			!isSplit(r.start)
		) {
			// Label a merged automatic cut by its longest piece; keep the weakest confidence.
			if (r.end - r.start > longest[longest.length - 1]) {
				longest[longest.length - 1] = r.end - r.start;
				last.source = r.source;
			}
			last.end = r.end;
			last.confidence = Math.min(last.confidence, r.confidence);
		} else {
			out.push({ ...r });
			longest.push(r.end - r.start);
		}
	}
	return out;
}

/**
 * Shortest selection that counts as a range rather than a single point (an in-point alone). Small
 * enough that any segment, however short, can be selected, removed or kept.
 */
export const MIN_SELECTION = 1e-4;

/** The segment under `t` (pass segments from `buildSegments`, or raw EDL regions). */
export function segmentAt(segments: readonly EditRegion[], t: number): EditRegion | null {
	const i = regionIndexAt(segments, t);
	return i >= 0 ? segments[i] : null;
}

/** Merge the selection with another range (shift-click / shift-drag extension). */
export function extendSelection(selection: Range | null, range: Range): Range {
	if (!selection) return { start: range.start, end: range.end };
	return {
		start: Math.min(selection.start, range.start),
		end: Math.max(selection.end, range.end)
	};
}

/** Contiguous removed runs ("cuts"), as the user perceives them. */
export function cutRuns(edl: readonly EditRegion[]): Range[] {
	const out: Range[] = [];
	for (const r of edl) {
		if (r.action !== 'remove') continue;
		const last = out[out.length - 1];
		if (last && Math.abs(last.end - r.start) <= EPSILON) last.end = r.end;
		else out.push({ start: r.start, end: r.end });
	}
	return out;
}

/**
 * The next (dir = 1) or previous (dir = -1) removed segment relative to `from`. Starting inside a
 * cut moves to its neighbour. Wraps around so repeated presses cycle through every cut.
 */
export function adjacentCut(
	segments: readonly EditRegion[],
	from: number,
	dir: 1 | -1
): Range | null {
	const cuts = segments
		.filter((r) => r.action === 'remove')
		.map((r) => ({ start: r.start, end: r.end }));
	if (!cuts.length) return null;
	if (dir === 1) return cuts.find((c) => c.start > from + EPSILON) ?? cuts[0];
	for (let i = cuts.length - 1; i >= 0; i--) if (cuts[i].start < from - EPSILON) return cuts[i];
	return cuts[cuts.length - 1];
}

/** The next/previous segment of any kind (keep or remove), relative to `from`. */
export function adjacentSegment(
	segments: readonly EditRegion[],
	from: number,
	dir: 1 | -1
): EditRegion | null {
	if (!segments.length) return null;
	if (dir === 1) return segments.find((r) => r.start > from + EPSILON) ?? null;
	for (let i = segments.length - 1; i >= 0; i--) {
		if (segments[i].start < from - EPSILON) return segments[i];
	}
	return null;
}

/** Time range spanning words i..j (inclusive, any order). */
export function wordsRange(words: readonly TranscriptWord[], i: number, j: number): Range | null {
	const a = words[Math.min(i, j)];
	const b = words[Math.max(i, j)];
	if (!a || !b) return null;
	return { start: a.start, end: b.end };
}

/** Indices of the words whose midpoint falls inside `range`. */
export function wordsInRange(
	words: readonly TranscriptWord[],
	range: Range
): [number, number] | null {
	let first = -1;
	let last = -1;
	for (let i = 0; i < words.length; i++) {
		const mid = (words[i].start + words[i].end) / 2;
		if (mid < range.start) continue;
		if (mid > range.end) break;
		if (first < 0) first = i;
		last = i;
	}
	return first < 0 ? null : [first, last];
}

/**
 * Snap `t` to the nearest candidate within `tolerance` seconds. Candidates are typically word
 * edges, segment boundaries and the playhead. Returns the original time when nothing is close.
 */
export function snapTime(
	t: number,
	candidates: readonly number[],
	tolerance: number
): { t: number; snapped: boolean } {
	let best = t;
	let bestDist = tolerance;
	for (const c of candidates) {
		const d = Math.abs(c - t);
		if (d <= bestDist) {
			bestDist = d;
			best = c;
		}
	}
	return { t: best, snapped: best !== t };
}

/** Snap candidates near `t`: word edges, EDL boundaries and extra points (e.g. the playhead). */
export function snapCandidates(
	t: number,
	window: number,
	edl: readonly EditRegion[],
	words: readonly TranscriptWord[],
	extra: readonly number[] = []
): number[] {
	const out: number[] = [];
	const lo = t - window;
	const hi = t + window;
	for (const r of edl) {
		if (r.end < lo) continue;
		if (r.start > hi) break;
		out.push(r.start, r.end);
	}
	// Binary search for the first word ending after lo.
	let a = 0;
	let b = words.length;
	while (a < b) {
		const m = (a + b) >> 1;
		if (words[m].end < lo) a = m + 1;
		else b = m;
	}
	for (let i = a; i < words.length && words[i].start <= hi; i++)
		out.push(words[i].start, words[i].end);
	for (const x of extra) if (x >= lo && x <= hi) out.push(x);
	return out;
}

/** "1.24 s", "820 ms" */
export function formatSpan(seconds: number): string {
	return seconds < 1
		? `${Math.round(seconds * 1000)} ms`
		: `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
}
