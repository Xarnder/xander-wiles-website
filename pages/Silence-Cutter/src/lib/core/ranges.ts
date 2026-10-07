import type { Range } from './types';

/** Durations below this are treated as empty (1 µs avoids float noise without losing samples). */
export const EPSILON = 1e-6;

export function duration(r: Range): number {
	return r.end - r.start;
}

export function totalDuration(ranges: readonly Range[]): number {
	let sum = 0;
	for (const r of ranges) sum += r.end - r.start;
	return sum;
}

/** Sort and merge overlapping/touching ranges. Gaps up to `joinGap` seconds are bridged. */
export function normalize(ranges: readonly Range[], joinGap = 0): Range[] {
	const sorted = ranges
		.filter((r) => r.end - r.start > EPSILON)
		.map((r) => ({ start: r.start, end: r.end }))
		.sort((a, b) => a.start - b.start || a.end - b.end);
	const out: Range[] = [];
	for (const r of sorted) {
		const last = out[out.length - 1];
		if (last && r.start <= last.end + joinGap + EPSILON) {
			last.end = Math.max(last.end, r.end);
		} else {
			out.push(r);
		}
	}
	return out;
}

/** Clamp ranges into [lo, hi], dropping empty results. Input must be normalized. */
export function clampRanges(ranges: readonly Range[], lo: number, hi: number): Range[] {
	const out: Range[] = [];
	for (const r of ranges) {
		const start = Math.max(lo, r.start);
		const end = Math.min(hi, r.end);
		if (end - start > EPSILON) out.push({ start, end });
	}
	return out;
}

/** Complement of normalized `ranges` within [lo, hi]. */
export function invert(ranges: readonly Range[], lo: number, hi: number): Range[] {
	const out: Range[] = [];
	let cursor = lo;
	for (const r of ranges) {
		if (r.end <= lo) continue;
		if (r.start >= hi) break;
		if (r.start - cursor > EPSILON) out.push({ start: cursor, end: Math.min(r.start, hi) });
		cursor = Math.max(cursor, r.end);
	}
	if (hi - cursor > EPSILON) out.push({ start: cursor, end: hi });
	return out;
}

/** Intersection of two normalized range lists. */
export function intersect(a: readonly Range[], b: readonly Range[]): Range[] {
	const out: Range[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		const start = Math.max(a[i].start, b[j].start);
		const end = Math.min(a[i].end, b[j].end);
		if (end - start > EPSILON) out.push({ start, end });
		if (a[i].end < b[j].end) i++;
		else j++;
	}
	return out;
}

/** Union of two normalized range lists. */
export function union(a: readonly Range[], b: readonly Range[]): Range[] {
	return normalize([...a, ...b]);
}

/** `a` minus `b`, both normalized. */
export function subtract(a: readonly Range[], b: readonly Range[]): Range[] {
	if (b.length === 0) return a.map((r) => ({ ...r }));
	const out: Range[] = [];
	for (const r of a) {
		let pieces: Range[] = [{ start: r.start, end: r.end }];
		for (const s of b) {
			if (s.end <= r.start) continue;
			if (s.start >= r.end) break;
			const next: Range[] = [];
			for (const p of pieces) {
				if (s.end <= p.start || s.start >= p.end) {
					next.push(p);
					continue;
				}
				if (s.start - p.start > EPSILON) next.push({ start: p.start, end: s.start });
				if (p.end - s.end > EPSILON) next.push({ start: s.end, end: p.end });
			}
			pieces = next;
		}
		out.push(...pieces);
	}
	return out;
}

/** Index of the range containing `t` (start inclusive, end exclusive) via binary search, or -1. */
export function findRangeIndex(ranges: readonly Range[], t: number): number {
	let lo = 0;
	let hi = ranges.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const r = ranges[mid];
		if (t < r.start) hi = mid - 1;
		else if (t >= r.end) lo = mid + 1;
		else return mid;
	}
	return -1;
}

/** Index of the first range whose end is after `t` (useful for viewport culling). */
export function firstEndingAfter(ranges: readonly Range[], t: number): number {
	let lo = 0;
	let hi = ranges.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (ranges[mid].end <= t) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}
