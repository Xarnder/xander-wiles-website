import type { AutoCut } from './combine';
import { EPSILON } from './ranges';
import type { EditAction, EditRegion, ManualOverride, Range } from './types';

/** Build the automatic EDL: contiguous keep/remove regions covering [0, duration]. */
export function buildAutoEdl(duration: number, cuts: readonly AutoCut[]): EditRegion[] {
	const regions: EditRegion[] = [];
	let cursor = 0;
	const sorted = [...cuts].sort((a, b) => a.start - b.start);
	for (const cut of sorted) {
		const start = Math.max(cursor, Math.max(0, cut.start));
		const end = Math.min(duration, cut.end);
		if (end - start <= EPSILON) continue;
		if (start - cursor > EPSILON) {
			regions.push({
				start: cursor,
				end: start,
				action: 'keep',
				source: 'none',
				confidence: 0,
				manual: false
			});
		}
		regions.push({
			start,
			end,
			action: 'remove',
			source: cut.source,
			confidence: cut.confidence,
			manual: false
		});
		cursor = end;
	}
	if (duration - cursor > EPSILON || regions.length === 0) {
		regions.push({
			start: cursor,
			end: Math.max(cursor, duration),
			action: 'keep',
			source: 'none',
			confidence: 0,
			manual: false
		});
	}
	return regions;
}

/** Split the region list so that `t` is a region boundary. Returns the index of the region starting at t. */
function splitAt(regions: EditRegion[], t: number): number {
	for (let i = 0; i < regions.length; i++) {
		const r = regions[i];
		if (Math.abs(r.start - t) <= EPSILON) return i;
		if (t > r.start && t < r.end) {
			if (r.end - t <= EPSILON) return i + 1;
			regions.splice(i, 1, { ...r, end: t }, { ...r, start: t });
			return i + 1;
		}
	}
	return regions.length;
}

function paint(regions: EditRegion[], start: number, end: number, action: EditAction): void {
	const from = splitAt(regions, start);
	const to = splitAt(regions, end);
	for (let i = from; i < to; i++) {
		regions[i] = {
			...regions[i],
			action,
			source: 'manual',
			confidence: 1,
			manual: true
		};
	}
}

function sameDecision(a: EditRegion, b: EditRegion): boolean {
	return a.action === b.action && a.source === b.source && a.manual === b.manual;
}

/**
 * Apply manual overrides (in order — later wins) to the automatic EDL.
 *
 * Manual decisions are stored independently in source time, so they survive any change to the
 * automatic detection parameters: the automatic EDL is recomputed and the same overrides are
 * replayed on top of it. Split markers create hard region boundaries.
 */
export function applyOverrides(
	auto: readonly EditRegion[],
	overrides: readonly ManualOverride[],
	duration: number
): EditRegion[] {
	const regions = auto.map((r) => ({ ...r }));
	const hardBoundaries: number[] = [];
	for (const o of overrides) {
		if (o.kind === 'paint') {
			const start = Math.max(0, Math.min(o.start, o.end));
			const end = Math.min(duration, Math.max(o.start, o.end));
			if (end - start <= EPSILON) continue;
			paint(regions, start, end, o.action);
		} else {
			if (o.at <= EPSILON || o.at >= duration - EPSILON) continue;
			splitAt(regions, o.at);
			hardBoundaries.push(o.at);
		}
	}
	return mergeAdjacent(regions, hardBoundaries);
}

export function mergeAdjacent(
	regions: EditRegion[],
	hardBoundaries: readonly number[] = []
): EditRegion[] {
	const isHard = (t: number) => hardBoundaries.some((b) => Math.abs(b - t) <= EPSILON);
	const out: EditRegion[] = [];
	for (const r of regions) {
		if (r.end - r.start <= EPSILON) continue;
		const last = out[out.length - 1];
		if (last && sameDecision(last, r) && !isHard(r.start)) {
			last.end = r.end;
			last.confidence = Math.min(last.confidence, r.confidence);
		} else {
			out.push({ ...r });
		}
	}
	return out;
}

/** Kept source ranges, merged across region boundaries. */
export function keptRanges(edl: readonly EditRegion[]): Range[] {
	const out: Range[] = [];
	for (const r of edl) {
		if (r.action !== 'keep') continue;
		const last = out[out.length - 1];
		if (last && Math.abs(last.end - r.start) <= EPSILON) last.end = r.end;
		else out.push({ start: r.start, end: r.end });
	}
	return out;
}

/** Removed source ranges (each contiguous run is one "cut"). */
export function removedRanges(edl: readonly EditRegion[]): Range[] {
	const out: Range[] = [];
	for (const r of edl) {
		if (r.action !== 'remove') continue;
		const last = out[out.length - 1];
		if (last && Math.abs(last.end - r.start) <= EPSILON) last.end = r.end;
		else out.push({ start: r.start, end: r.end });
	}
	return out;
}

/** Index of the EDL region containing t. */
export function regionIndexAt(edl: readonly EditRegion[], t: number): number {
	let lo = 0;
	let hi = edl.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (t < edl[mid].start) hi = mid - 1;
		else if (t >= edl[mid].end) lo = mid + 1;
		else return mid;
	}
	return t >= (edl[edl.length - 1]?.end ?? 0) ? edl.length - 1 : -1;
}

/** Throws if the EDL is not sorted, contiguous and covering [0, duration]. Used by tests/debug. */
export function assertValidEdl(edl: readonly EditRegion[], duration: number): void {
	if (edl.length === 0) throw new Error('EDL is empty');
	if (Math.abs(edl[0].start) > EPSILON) throw new Error('EDL does not start at 0');
	for (let i = 1; i < edl.length; i++) {
		if (Math.abs(edl[i].start - edl[i - 1].end) > EPSILON) {
			throw new Error(`EDL gap/overlap at ${edl[i].start}`);
		}
	}
	if (Math.abs(edl[edl.length - 1].end - duration) > EPSILON) {
		throw new Error('EDL does not end at duration');
	}
}
