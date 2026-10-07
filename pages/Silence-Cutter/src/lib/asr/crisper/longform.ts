/**
 * Long-form helpers ported from CrisperWhisper 2.0 (MIT licensed software, Copyright (c) 2026
 * nyra health GmbH): overlapping window planning, the timestamp-aware boundary drop used by
 * conditional continuation, seam monotonisation, n-gram loop detection and the mel coverage gate.
 *
 * Conditional continuation: each 30 s window is decoded with `<ctx> last confirmed words <ectx>`
 * in its prompt, so the model outputs only what comes after those words. Trailing words of a
 * window are dropped only when they start inside the overlap that the next window re-hears, so
 * nothing is duplicated and nothing is lost at the seams.
 */

import type { TimedWord } from './wordTiming';

export const SAMPLE_RATE = 16000;

export interface LongformConfig {
	chunkDuration: number;
	stride: number;
	contextWords: number;
	dropWords: number;
	maxNewTokens: number;
}

export const DEFAULT_LONGFORM: LongformConfig = {
	chunkDuration: 30,
	stride: 26,
	contextWords: 12,
	dropWords: 2,
	maxNewTokens: 256
};

export interface ChunkPlan {
	index: number;
	startSample: number;
	endSample: number;
	isLast: boolean;
}

export function planChunks(
	totalSamples: number,
	cfg: LongformConfig = DEFAULT_LONGFORM
): ChunkPlan[] {
	const chunk = Math.round(cfg.chunkDuration * SAMPLE_RATE);
	const stride = Math.round(cfg.stride * SAMPLE_RATE);
	if (totalSamples <= chunk) {
		return [{ index: 0, startSample: 0, endSample: totalSamples, isLast: true }];
	}
	const plans: ChunkPlan[] = [];
	let start = 0;
	while (start < totalSamples) {
		const end = Math.min(start + chunk, totalSamples);
		plans.push({
			index: plans.length,
			startSample: start,
			endSample: end,
			isLast: end >= totalSamples
		});
		if (end >= totalSamples) break;
		start += stride;
	}
	return plans;
}

/**
 * Index up to which a window's words are confirmed (words[idx:] are re-transcribed by the next
 * window). A trailing word may be dropped only if it starts inside the overlap
 * [stride, chunkDuration]; at most `dropWords` are dropped.
 */
export function overlapDropIndex(
	words: readonly TimedWord[],
	strideSec: number,
	dropWords: number,
	isLast: boolean
): number {
	const n = words.length;
	if (isLast) return n;
	const legacy = Math.max(n - Math.max(dropWords, 0), 0);
	if (!words.some((w) => w.start !== null)) return legacy;
	let firstOverlap = n;
	for (let i = 0; i < n; i++) {
		const s = words[i].start;
		if (s !== null && s >= strideSec) {
			firstOverlap = i;
			break;
		}
	}
	return Math.max(legacy, firstOverlap);
}

/** Clamp each word's start so the global timeline never goes backwards at seams. */
export function monotonize<T extends { start: number; end: number }>(words: T[]): void {
	for (let j = 1; j < words.length; j++) {
		const prevEnd = words[j - 1].end;
		if (words[j].start < prevEnd) {
			words[j].start = prevEnd;
			words[j].end = Math.max(prevEnd, words[j].end);
		}
	}
}

/**
 * Per-ngram-size repetition thresholds (upstream DEFAULT_REPAIR_THRESHOLDS, extended from 24- to
 * 40-token units: a hallucinated two-sentence loop of ~25 tokens was observed in trailing applause).
 */
export const DEFAULT_REPAIR_THRESHOLDS: Record<number, number> = (() => {
	const t: Record<number, number> = { 1: 8, 2: 8, 3: 4, 4: 3, 5: 3 };
	for (let n = 6; n <= 40; n++) t[n] = 3;
	return t;
})();

/**
 * Earliest position where an n-gram repeats consecutively at least the threshold number of
 * times. Thresholds are high (8 repeats for 1–2 grams) so genuine stutters and repetitions
 * ("I I I", "we we") are never mistaken for decoder loops.
 */
export function findTokenLoop(
	ids: readonly number[],
	thresholds: Record<number, number> = DEFAULT_REPAIR_THRESHOLDS
): { start: number; gram: number[] } | null {
	const sizes = Object.keys(thresholds).map(Number);
	for (let i = 0; i < ids.length; i++) {
		for (const n of sizes) {
			const reps = thresholds[n];
			if (i + n * reps > ids.length) continue;
			let ok = true;
			for (let r = 1; r < reps && ok; r++) {
				for (let k = 0; k < n; k++) {
					if (ids[i + r * n + k] !== ids[i + k]) {
						ok = false;
						break;
					}
				}
			}
			if (ok) return { start: i, gram: ids.slice(i, i + n) as number[] };
		}
	}
	return null;
}

/**
 * Seconds of speech-active audio in a mel window: frames whose mean log-mel energy is 20 % of
 * the way from the 10th to the 95th percentile. Used to spot collapsed decodes.
 */
export function speechActiveSeconds(energy: Float32Array, fromFrame = 0): number {
	if (energy.length === 0) return 0;
	const sorted = Float32Array.from(energy).sort();
	const q = (p: number) =>
		sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1)))];
	const floor = q(10);
	const peak = q(95);
	if (peak - floor < 1e-3) return 0;
	const thr = floor + 0.2 * (peak - floor);
	let active = 0;
	for (let f = Math.max(0, fromFrame); f < energy.length; f++) if (energy[f] > thr) active++;
	return active * 0.01;
}

/** True when speech fills the window but the decode produced implausibly few words. */
export function isUndercovered(nWords: number, activeSeconds: number): boolean {
	if (activeSeconds < 5) return false;
	return nWords < 0.5 * activeSeconds;
}

/** Remove prompt artifacts that should never surface in a transcript. */
export function stripPromptArtifacts(text: string): string {
	return text
		.replace(/\[verbatim_\d+\]/g, '')
		.replace(/\[intended_\d+\]/g, '')
		.replace(/<htx>[\s\S]*?<ehtx>/g, '')
		.replace(/<vtx>[\s\S]*?<evtx>/g, '')
		.replace(/<ctx>[\s\S]*?<ectx>/g, '')
		.split(/\s+/)
		.filter(Boolean)
		.join(' ');
}

function activeThreshold(energy: Float32Array): number | null {
	if (energy.length === 0) return null;
	const sorted = Float32Array.from(energy).sort();
	const q = (p: number) =>
		sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1)))];
	const floor = q(10);
	const peak = q(95);
	if (peak - floor < 1e-3) return null;
	return floor + 0.2 * (peak - floor);
}

export interface UncoveredGap {
	start: number;
	end: number;
	/** Speech-active seconds inside the gap. */
	active: number;
}

/**
 * Stretches in [fromSec, toSec) that no word covers (±`padSec`) and that last at least
 * `minGapSec`, with the amount of speech-active audio (10 ms mel frames, same gate as
 * `speechActiveSeconds`) each contains. Detects decodes that skipped material anywhere in a
 * window — not just at the end.
 */
export function uncoveredGaps(
	words: readonly TimedWord[],
	energy: Float32Array,
	fromSec: number,
	toSec: number,
	minGapSec = 1.5,
	padSec = 0.3
): UncoveredGap[] {
	const thr = activeThreshold(energy);
	if (thr === null) return [];
	const n = energy.length;
	const covered = new Uint8Array(n);
	for (const w of words) {
		if (w.start === null || w.end === null) continue;
		const a = Math.max(0, Math.floor((w.start - padSec) * 100));
		const b = Math.min(n, Math.ceil((w.end + padSec) * 100));
		covered.fill(1, a, b);
	}
	const gaps: UncoveredGap[] = [];
	let runStart = -1;
	let runActive = 0;
	const lo = Math.max(0, Math.floor(fromSec * 100));
	const hi = Math.min(n, Math.ceil(toSec * 100));
	const flush = (end: number) => {
		if (runStart >= 0 && (end - runStart) / 100 >= minGapSec) {
			gaps.push({ start: runStart / 100, end: end / 100, active: runActive / 100 });
		}
		runStart = -1;
		runActive = 0;
	};
	for (let f = lo; f < hi; f++) {
		if (covered[f]) {
			flush(f);
			continue;
		}
		if (runStart < 0) runStart = f;
		if (energy[f] > thr) runActive++;
	}
	flush(hi);
	return gaps;
}

/** Total speech-active seconds left uncovered by `words` (see `uncoveredGaps`). */
export function uncoveredSpeechSeconds(
	words: readonly TimedWord[],
	energy: Float32Array,
	fromSec: number,
	toSec: number,
	minGapSec = 1.5,
	padSec = 0.3
): number {
	return uncoveredGaps(words, energy, fromSec, toSec, minGapSec, padSec).reduce(
		(a, g) => a + g.active,
		0
	);
}

/**
 * Insert `extra` words into `base` only where `base` has a gap of at least `minGapSec` and no
 * base word overlaps (±`padSec`). Keeps the continuation decode intact and fills the material it
 * skipped from an independent decode.
 */
export function fillGaps(
	base: readonly TimedWord[],
	extra: readonly TimedWord[],
	minGapSec = 1,
	padSec = 0.15
): TimedWord[] {
	const placed = base.filter((w) => w.start !== null && w.end !== null) as Array<
		TimedWord & { start: number; end: number }
	>;
	const out: TimedWord[] = [...base];
	for (const w of extra) {
		if (w.start === null || w.end === null) continue;
		let prevEnd = -Infinity;
		let nextStart = Infinity;
		let overlaps = false;
		for (const b of placed) {
			if (b.end + padSec > w.start && b.start - padSec < w.end) {
				overlaps = true;
				break;
			}
			if (b.end <= w.start) prevEnd = Math.max(prevEnd, b.end);
			if (b.start >= w.end) nextStart = Math.min(nextStart, b.start);
		}
		if (overlaps) continue;
		if (nextStart - prevEnd >= minGapSec) out.push(w);
	}
	// Keep unplaceable base words in order relative to their neighbours: sort placed words by start
	// and leave null-timed words directly after the word that preceded them in `base`.
	const keyed = out.map((w, i) => ({
		w,
		key: w.start ?? (i > 0 ? (out[i - 1].start ?? 0) + 1e-6 : 0)
	}));
	keyed.sort((a, b) => a.key - b.key);
	return keyed.map((k) => k.w);
}

/**
 * Each window is zero-padded to 30 s for the encoder. A word aligned into the padding (start at or
 * beyond the real audio) cannot have been spoken — it is a decoder hallucination — so it is
 * dropped, and word ends are clamped to the real audio length.
 */
export function clipToAudio(words: readonly TimedWord[], audioSeconds: number): TimedWord[] {
	const out: TimedWord[] = [];
	for (const w of words) {
		if (w.start !== null && w.start >= audioSeconds - 0.02) continue;
		out.push(w.end !== null && w.end > audioSeconds ? { ...w, end: audioSeconds } : w);
	}
	return out;
}
