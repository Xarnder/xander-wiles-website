/**
 * Word-level timing from cross-attention — a TypeScript port of CrisperWhisper 2.0's
 * `word_timing.py` (MIT licensed software, Copyright (c) 2026 nyra health GmbH).
 *
 * Pipeline: tokens → words (explicit space token 220 / leading-space boundaries), attention rows
 * → sharpened per-word log-probabilities over encoder frames, mel energy → per-frame "blank"
 * (pause) log-probability, then a word-level Viterbi with virtual blank states between words.
 */

export const FRAME_DURATION_S = 0.02;
export const SPACE_TOKEN_ID = 220;

export interface TimedWord {
	text: string;
	start: number | null;
	end: number | null;
}

const PROMPT_TAG_PREFIXES = ['[verbatim_', '[intended_'];
const MARKERS = new Set([
	'<ctx>',
	'<ectx>',
	'<htx>',
	'<ehtx>',
	'<vtx>',
	'<evtx>',
	'<sot>',
	'<eot>'
]);

export function isSpecialPiece(piece: string): boolean {
	if (piece.startsWith('<|') && piece.endsWith('|>')) return true;
	if (PROMPT_TAG_PREFIXES.some((p) => piece.startsWith(p))) return true;
	return MARKERS.has(piece);
}

function isSpaceToken(id: number, piece: string): boolean {
	return id === SPACE_TOKEN_ID || piece === ' ';
}

/** Group token indices into words; returns contiguous token-index spans (no specials/spaces). */
export function groupTokensIntoWords(
	ids: readonly number[],
	pieces: readonly string[]
): number[][] {
	const groups: number[][] = [];
	let cur: number[] = [];
	let curText = '';
	const flush = () => {
		if (cur.length > 0 && curText.trim() !== '') groups.push(cur);
		cur = [];
		curText = '';
	};
	for (let i = 0; i < ids.length; i++) {
		const piece = pieces[i];
		if (isSpecialPiece(piece) || isSpaceToken(ids[i], piece)) {
			flush();
			continue;
		}
		if (piece.startsWith(' ') && curText !== '') flush();
		cur.push(i);
		curText += piece;
	}
	flush();
	return groups;
}

/** Sharpened, row-normalised log-probabilities over frames. Rows: tokens; cols: frames. */
export function tokenLogpFromAttention(
	attention: readonly Float32Array[],
	frames: number,
	sharpen = 5
): Float32Array[] {
	const eps = 1e-8;
	return attention.map((row) => {
		const out = new Float32Array(frames);
		let sum = 0;
		for (let f = 0; f < frames; f++) {
			const v = Math.max(0, row[f] ?? 0);
			const p = sharpen !== 1 ? Math.pow(v, sharpen) : v;
			out[f] = p;
			sum += p;
		}
		const denom = Math.max(sum, eps);
		for (let f = 0; f < frames; f++) out[f] = Math.log(out[f] / denom + eps);
		return out;
	});
}

function percentile(sorted: Float32Array, q: number): number {
	// numpy-style linear interpolation percentile on a sorted array.
	if (sorted.length === 0) return 0;
	const pos = (q / 100) * (sorted.length - 1);
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Per-frame meanmel energy (mel is [nMels][nMelFrames] at 10 ms hop, flattened row-major).
 */
export function melFrameEnergy(mel: Float32Array, nMels: number, nFrames: number): Float32Array {
	const energy = new Float32Array(nFrames);
	for (let m = 0; m < nMels; m++) {
		const base = m * nFrames;
		for (let f = 0; f < nFrames; f++) energy[f] += mel[base + f];
	}
	for (let f = 0; f < nFrames; f++) energy[f] /= nMels;
	return energy;
}

function resampleLinear(x: Float32Array, targetLen: number): Float32Array {
	const out = new Float32Array(targetLen);
	if (targetLen === 0) return out;
	if (x.length === targetLen) return Float32Array.from(x);
	if (x.length <= 1) return out.fill(x[0] ?? 0);
	for (let i = 0; i < targetLen; i++) {
		const pos = targetLen === 1 ? 0 : (i * (x.length - 1)) / (targetLen - 1);
		const lo = Math.floor(pos);
		const hi = Math.min(x.length - 1, lo + 1);
		out[i] = x[lo] + (x[hi] - x[lo]) * (pos - lo);
	}
	return out;
}

/** Blank (pause) log-probability per encoder frame from mel energy, shaped by gamma/penalty. */
export function blankLogpFromMelEnergy(
	energy: Float32Array,
	targetFrames: number,
	gamma = 3,
	penalty = 3
): Float32Array {
	const sorted = Float32Array.from(energy).sort();
	const p10 = percentile(sorted, 10);
	const p90 = percentile(sorted, 90);
	const denom = Math.max(1e-6, p90 - p10);
	const norm = new Float32Array(energy.length);
	for (let i = 0; i < energy.length; i++) {
		norm[i] = Math.min(1, Math.max(0, (energy[i] - p10) / denom));
	}
	const resampled = resampleLinear(norm, targetFrames);
	const out = new Float32Array(targetFrames);
	for (let i = 0; i < targetFrames; i++) {
		let p = Math.min(1 - 1e-4, Math.max(1e-4, 1 - resampled[i]));
		if (gamma !== 1) p = Math.min(1, Math.max(1e-4, Math.pow(p, gamma)));
		out[i] = Math.log(p + 1e-6) - penalty;
	}
	return out;
}

/**
 * Viterbi with virtual blanks [blank0, tok0, blank1, …, tokT-1, blankT]. Returns per-row
 * (startFrame, endFrame) or null when the row could not be placed.
 */
export function viterbiWithBlanks(
	rowLogp: readonly Float32Array[],
	blankLogp: Float32Array
): Array<[number, number] | null> {
	const T = rowLogp.length;
	const F = blankLogp.length;
	if (T === 0 || F === 0) return [];
	const S = 2 * T + 1;
	const NEG = -1e9;
	let prev = new Float64Array(S).fill(NEG);
	let cur = new Float64Array(S);
	const back = new Uint8Array(S * F);
	const emit = (s: number, f: number) => ((s & 1) === 0 ? blankLogp[f] : rowLogp[s >> 1][f]);
	prev[0] = emit(0, 0);
	for (let f = 1; f < F; f++) {
		for (let s = 0; s < S; s++) {
			const stay = prev[s];
			const adv = s > 0 ? prev[s - 1] : NEG;
			if (adv > stay) {
				cur[s] = adv + emit(s, f);
				back[s * F + f] = 1;
			} else {
				cur[s] = stay + emit(s, f);
				back[s * F + f] = 0;
			}
		}
		const tmp = prev;
		prev = cur;
		cur = tmp;
	}
	let endState = 0;
	let best = -Infinity;
	for (let s = 0; s < S; s++) {
		const v = prev[s] + s * 1e-4;
		if (v > best) {
			best = v;
			endState = s;
		}
	}
	const first = new Int32Array(T).fill(-1);
	const last = new Int32Array(T).fill(-1);
	let s = endState;
	for (let f = F - 1; f >= 0; f--) {
		if (s & 1) {
			const t = s >> 1;
			if (last[t] < 0) last[t] = f;
			first[t] = f;
		}
		if (f === 0) break;
		if (back[s * F + f] === 1) s -= 1;
	}
	const out: Array<[number, number] | null> = [];
	for (let t = 0; t < T; t++) out.push(first[t] < 0 ? null : [first[t], last[t]]);
	return out;
}

/** Make tight inter-word boundaries contiguous by splitting short gaps at their midpoint. */
export function splitInterwordGaps(words: TimedWord[], maxGap = 0.1): void {
	if (maxGap <= 0) return;
	for (let i = 0; i + 1 < words.length; i++) {
		const a = words[i];
		const b = words[i + 1];
		if (a.end === null || b.start === null) continue;
		const gap = b.start - a.end;
		if (gap > 0 && gap <= maxGap) {
			const mid = a.end + gap / 2;
			a.end = mid;
			b.start = mid;
		}
	}
}

export interface WordTimingInput {
	genIds: readonly number[];
	/** Decoded piece per token (tokenizer.decode([id])). */
	pieces: readonly string[];
	/** Text per word group (decode of the whole group, so multibyte words are intact). */
	decodeGroup: (ids: number[]) => string;
	/** Head-averaged post-softmax cross-attention, one row per generated token. */
	attention: readonly Float32Array[];
	/** Number of encoder frames (1500 for a 30 s window). */
	encoderFrames: number;
	/** Log-mel features [nMels][nMelFrames], flattened. */
	mel: Float32Array;
	nMels: number;
	nMelFrames: number;
	sharpen?: number;
	blankGamma?: number;
	blankPenalty?: number;
	splitGapMax?: number;
}

/**
 * Words with chunk-local timings, 1-to-1 with the word segmentation (unplaceable words carry
 * null timings, as in upstream `keep_unplaceable=True`).
 */
export function extractWordTimings(input: WordTimingInput): TimedWord[] {
	const { genIds, pieces, attention, encoderFrames } = input;
	if (genIds.length === 0 || attention.length === 0) return [];
	const groups = groupTokensIntoWords(genIds, pieces);
	if (groups.length === 0) return [];
	const texts = groups.map((g) => input.decodeGroup(g.map((i) => genIds[i])).trim());

	const tokLogp = tokenLogpFromAttention(attention, encoderFrames, input.sharpen ?? 5);
	const energy = melFrameEnergy(input.mel, input.nMels, input.nMelFrames);
	const blank = blankLogpFromMelEnergy(
		energy,
		encoderFrames,
		input.blankGamma ?? 3,
		input.blankPenalty ?? 3
	);

	// Collapse each word's token rows with logsumexp into one emission row.
	const wordRows = groups.map((g) => {
		const row = new Float32Array(encoderFrames).fill(-1e9);
		const valid = g.filter((i) => i < tokLogp.length);
		if (valid.length === 0) return row;
		for (let f = 0; f < encoderFrames; f++) {
			let max = -Infinity;
			for (const i of valid) max = Math.max(max, tokLogp[i][f]);
			let sum = 0;
			for (const i of valid) sum += Math.exp(tokLogp[i][f] - max);
			row[f] = max + Math.log(sum);
		}
		return row;
	});

	const spans = viterbiWithBlanks(wordRows, blank);
	const words: TimedWord[] = texts.map((text, i) => {
		const span = spans[i];
		return span
			? { text, start: span[0] * FRAME_DURATION_S, end: span[1] * FRAME_DURATION_S }
			: { text, start: null, end: null };
	});
	const placed = words.filter((w) => w.start !== null);
	splitInterwordGaps(placed, input.splitGapMax ?? 0.1);
	return words;
}
