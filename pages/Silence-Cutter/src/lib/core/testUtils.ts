import { classifyWord } from './transcriptDetector';
import type { Envelope, TranscriptWord } from './types';

export const SPEECH_DB = -18;
export const SILENCE_DB = -70;

/** Build a 10 ms-hop envelope from [durationMs, levelDb] segments. */
export function envelopeFrom(segments: Array<[number, number]>, hopMs = 10): Envelope {
	const values: number[] = [];
	for (const [ms, db] of segments) {
		const n = Math.round(ms / hopMs);
		for (let i = 0; i < n; i++) values.push(db);
	}
	return { hopSeconds: hopMs / 1000, db: Float32Array.from(values) };
}

/** Build transcript words from [text, start, end] tuples (seconds). */
export function wordsFrom(items: Array<[string, number, number]>): TranscriptWord[] {
	return items.map(([text, start, end], index) => ({
		index,
		text,
		start,
		end,
		kind: classifyWord(text)
	}));
}

export function round(ranges: Array<{ start: number; end: number }>, digits = 3) {
	const f = 10 ** digits;
	return ranges.map((r) => ({
		start: Math.round(r.start * f) / f,
		end: Math.round(r.end * f) / f
	}));
}
