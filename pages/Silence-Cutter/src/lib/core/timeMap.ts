import { keptRanges } from './edl';
import { EPSILON } from './ranges';
import type { EditRegion, Range } from './types';

/**
 * Maps between the source timeline and the virtual edited timeline (the source with removed
 * regions skipped). Built from the EDL; never mutates it.
 */
export class TimeMap {
	readonly keeps: Range[];
	/** offsets[i] = edited-time position where keeps[i] begins. */
	readonly offsets: number[];
	readonly editedDuration: number;

	constructor(keeps: readonly Range[]) {
		this.keeps = keeps.map((r) => ({ start: r.start, end: r.end }));
		this.offsets = [];
		let acc = 0;
		for (const r of this.keeps) {
			this.offsets.push(acc);
			acc += r.end - r.start;
		}
		this.editedDuration = acc;
	}

	static fromEdl(edl: readonly EditRegion[]): TimeMap {
		return new TimeMap(keptRanges(edl));
	}

	/** Index of the first keep whose end is after t. */
	private keepIndexAfter(t: number): number {
		let lo = 0;
		let hi = this.keeps.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (this.keeps[mid].end <= t + EPSILON) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	/** True when source time t is retained. */
	isKept(t: number): boolean {
		const i = this.keepIndexAfter(t);
		return i < this.keeps.length && t >= this.keeps[i].start - EPSILON;
	}

	/**
	 * Source → edited time. A source time inside a removed region maps to the edited position
	 * where playback resumes (the start of the next kept region).
	 */
	sourceToEdited(t: number): number {
		const i = this.keepIndexAfter(t);
		if (i >= this.keeps.length) return this.editedDuration;
		const r = this.keeps[i];
		if (t <= r.start) return this.offsets[i];
		return this.offsets[i] + (t - r.start);
	}

	/** Edited → source time. Positions at a join resolve to the start of the later region. */
	editedToSource(u: number): number {
		if (this.keeps.length === 0) return 0;
		if (u <= 0) return this.keeps[0].start;
		if (u >= this.editedDuration) return this.keeps[this.keeps.length - 1].end;
		let lo = 0;
		let hi = this.keeps.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (this.offsets[mid] <= u + EPSILON) lo = mid;
			else hi = mid - 1;
		}
		return this.keeps[lo].start + (u - this.offsets[lo]);
	}

	/**
	 * Where playback should be for source time t in Edited preview: t itself if retained,
	 * otherwise the start of the next kept region, or null if nothing is retained after t.
	 */
	nextKeptTime(t: number): number | null {
		const i = this.keepIndexAfter(t);
		if (i >= this.keeps.length) return null;
		return Math.max(t, this.keeps[i].start);
	}

	/** End of the kept region containing t, or null if t is not retained. */
	keptRegionEnd(t: number): number | null {
		const i = this.keepIndexAfter(t);
		if (i >= this.keeps.length || t < this.keeps[i].start - EPSILON) return null;
		return this.keeps[i].end;
	}
}

/**
 * Snap kept ranges to a frame grid for export so audio and video cut on exactly the same
 * instants (no cumulative drift). Ranges that collapse to zero frames are dropped.
 */
export function quantizeRanges(ranges: readonly Range[], fps: number, duration: number): Range[] {
	if (!(fps > 0)) return ranges.map((r) => ({ ...r }));
	const out: Range[] = [];
	for (const r of ranges) {
		const start = Math.round(r.start * fps) / fps;
		const end = Math.min(duration, Math.round(r.end * fps) / fps);
		if (end - start <= EPSILON) continue;
		const last = out[out.length - 1];
		if (last && start <= last.end + EPSILON) last.end = Math.max(last.end, end);
		else out.push({ start, end });
	}
	return out;
}
