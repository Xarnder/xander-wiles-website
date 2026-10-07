import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LONGFORM,
	clipToAudio,
	fillGaps,
	findTokenLoop,
	isUndercovered,
	monotonize,
	overlapDropIndex,
	planChunks,
	SAMPLE_RATE,
	stripPromptArtifacts,
	uncoveredGaps,
	uncoveredSpeechSeconds
} from './longform';
import {
	blankLogpFromMelEnergy,
	extractWordTimings,
	groupTokensIntoWords,
	splitInterwordGaps,
	viterbiWithBlanks
} from './wordTiming';

describe('token → word grouping', () => {
	it('splits on the explicit space token and drops specials', () => {
		const ids = [50258, 40, 220, 1223, 220, 321, 220, 321, 50257];
		const pieces = [
			'<|startoftranscript|>',
			'I',
			' ',
			'think',
			' ',
			'we',
			' ',
			'we',
			'<|endoftext|>'
		];
		expect(groupTokensIntoWords(ids, pieces)).toEqual([[1], [3], [5], [7]]);
	});

	it('also splits on leading-space pieces and keeps multi-token words together', () => {
		const ids = [1, 2, 3, 4];
		const pieces = [' Thurs', 'day', ' [', 'UM]'];
		expect(groupTokensIntoWords(ids, pieces)).toEqual([
			[0, 1],
			[2, 3]
		]);
	});
});

describe('Viterbi aligner', () => {
	it('places two words at their attention peaks with a pause between them', () => {
		const F = 100;
		const row = (centre: number) => {
			const r = new Float32Array(F);
			for (let f = 0; f < F; f++) r[f] = Math.log(Math.exp(-((f - centre) ** 2) / 20) + 1e-8);
			return r;
		};
		const blank = new Float32Array(F).fill(-1);
		for (let f = 20; f < 30; f++) blank[f] = -20; // speech region A
		for (let f = 60; f < 70; f++) blank[f] = -20; // speech region B
		const spans = viterbiWithBlanks([row(25), row(65)], blank);
		expect(spans[0]![0]).toBeGreaterThanOrEqual(18);
		expect(spans[0]![1]).toBeLessThanOrEqual(32);
		expect(spans[1]![0]).toBeGreaterThanOrEqual(58);
		expect(spans[1]![1]).toBeLessThanOrEqual(72);
	});

	it('shapes mel energy into a blank log-probability (quiet frames → likely blank)', () => {
		const energy = new Float32Array(200);
		for (let i = 0; i < 200; i++) energy[i] = i >= 50 && i < 150 ? 1 : -1;
		const blank = blankLogpFromMelEnergy(energy, 100);
		expect(blank[5]).toBeGreaterThan(blank[50]);
	});

	it('extracts word timings end to end from synthetic attention', () => {
		const F = 1500;
		const ids = [10, 220, 11];
		const pieces = ['hello', ' ', 'world'];
		const peak = (c: number) => {
			const r = new Float32Array(F);
			for (let f = c - 10; f < c + 10; f++) r[f] = 1;
			return r;
		};
		const nMels = 4;
		const nMelFrames = 3000;
		const mel = new Float32Array(nMels * nMelFrames).fill(-1);
		for (let m = 0; m < nMels; m++) {
			for (let f = 180; f < 240; f++) mel[m * nMelFrames + f] = 1; // 1.8–2.4 s
			for (let f = 480; f < 560; f++) mel[m * nMelFrames + f] = 1; // 4.8–5.6 s
		}
		const words = extractWordTimings({
			genIds: ids,
			pieces,
			decodeGroup: (g) => g.map((id) => (id === 10 ? 'hello' : 'world')).join(''),
			attention: [peak(105), peak(105), peak(260)],
			encoderFrames: F,
			mel,
			nMels,
			nMelFrames
		});
		expect(words.map((w) => w.text)).toEqual(['hello', 'world']);
		expect(words[0].start!).toBeGreaterThan(1.7);
		expect(words[0].end!).toBeLessThan(2.5);
		expect(words[1].start!).toBeGreaterThan(4.7);
		expect(words[1].end!).toBeLessThan(5.7);
	});

	it('splits short inter-word gaps but leaves genuine pauses', () => {
		const words = [
			{ text: 'a', start: 0, end: 1 },
			{ text: 'b', start: 1.06, end: 2 },
			{ text: 'c', start: 2.5, end: 3 }
		];
		splitInterwordGaps(words, 0.1);
		expect(words[0].end).toBeCloseTo(1.03, 6);
		expect(words[1].start).toBeCloseTo(1.03, 6);
		expect(words[1].end).toBe(2);
		expect(words[2].start).toBe(2.5);
	});
});

describe('long-form continuation', () => {
	it('plans 30 s windows with a 26 s stride (4 s overlap)', () => {
		const plans = planChunks(70 * SAMPLE_RATE);
		expect(plans.map((p) => [p.startSample / SAMPLE_RATE, p.endSample / SAMPLE_RATE])).toEqual([
			[0, 30],
			[26, 56],
			[52, 70]
		]);
		expect(plans.at(-1)!.isLast).toBe(true);
		expect(planChunks(10 * SAMPLE_RATE)).toHaveLength(1);
	});

	it('drops only trailing words that the next window re-hears', () => {
		const w = (start: number | null) => ({
			text: 'x',
			start,
			end: start === null ? null : start + 0.2
		});
		// Last two words start inside the overlap (>= 26 s) → dropped.
		expect(overlapDropIndex([w(10), w(20), w(26.5), w(28)], 26, 2, false)).toBe(2);
		// Last words start before the overlap → never dropped (would be lost otherwise).
		expect(overlapDropIndex([w(10), w(20), w(24), w(25)], 26, 2, false)).toBe(4);
		// Final window keeps everything.
		expect(overlapDropIndex([w(10), w(28)], 26, 2, true)).toBe(2);
		// Cap: at most dropWords are dropped.
		expect(overlapDropIndex([w(26.1), w(26.5), w(27), w(28)], 26, 2, false)).toBe(2);
		// No timings → legacy fixed drop.
		expect(overlapDropIndex([w(null), w(null), w(null)], 26, 2, false)).toBe(1);
		expect(DEFAULT_LONGFORM.stride).toBe(26);
	});

	it('monotonizes seams', () => {
		const words = [
			{ start: 0, end: 1 },
			{ start: 0.9, end: 1.5 },
			{ start: 1.2, end: 1.3 }
		];
		monotonize(words);
		expect(words).toEqual([
			{ start: 0, end: 1 },
			{ start: 1, end: 1.5 },
			{ start: 1.5, end: 1.5 }
		]);
	});
});

describe('loop detection never flags genuine repetition', () => {
	it('ignores ordinary stutters and repeated words', () => {
		// "I I I think we we" with explicit space tokens.
		const I = 40;
		const SP = 220;
		const ids = [I, SP, I, SP, I, SP, 1223, SP, 321, SP, 321];
		expect(findTokenLoop(ids)).toBeNull();
	});

	it('detects a degenerate decoder loop', () => {
		const ids: number[] = [];
		for (let i = 0; i < 10; i++) ids.push(5, 6, 7);
		expect(findTokenLoop(ids)).toEqual({ start: 0, gram: [5, 6, 7] });
	});

	it('flags under-covered windows only when speech clearly fills them', () => {
		expect(isUndercovered(2, 20)).toBe(true);
		expect(isUndercovered(30, 20)).toBe(false);
		expect(isUndercovered(0, 3)).toBe(false);
	});

	it('strips prompt artifacts', () => {
		expect(stripPromptArtifacts('[verbatim_1] <ctx> a b <ectx> hello  world')).toBe('hello world');
	});
});

describe('skipped-speech detection and gap filling', () => {
	// 30 s window of 10 ms frames: speech everywhere except 12–14 s.
	const energy = new Float32Array(3000);
	for (let f = 0; f < 3000; f++)
		energy[f] = f >= 1200 && f < 1400 ? -1 : 0.6 + 0.4 * Math.sin(f / 7);
	const w = (text: string, start: number, end: number) => ({ text, start, end });

	it('counts speech that no word covers, anywhere in the window', () => {
		const full = [w('a', 0, 12), w('b', 14, 30)];
		expect(uncoveredSpeechSeconds(full, energy, 0, 30)).toBe(0);
		// Decode skipped 3–10 s in the middle (resumed afterwards).
		const skipped = [w('a', 0, 3), w('b', 10, 12), w('c', 14, 30)];
		const missed = uncoveredSpeechSeconds(skipped, energy, 0, 30);
		expect(missed).toBeGreaterThan(4);
		expect(missed).toBeLessThan(6.5);
		const gaps = uncoveredGaps(skipped, energy, 0, 30);
		expect(gaps).toHaveLength(1);
		expect(gaps[0].start).toBeCloseTo(3.3, 1);
		expect(gaps[0].end).toBeCloseTo(9.7, 1);
		// Short slop between words is ignored.
		expect(uncoveredSpeechSeconds([w('a', 0, 5), w('b', 6, 30)], energy, 0, 30)).toBe(0);
	});

	it('fills only the gaps of the base decode', () => {
		const base = [w('a', 0, 3), w('z', 10, 12)];
		const extra = [w('a2', 0.1, 2.9), w('x', 4, 5), w('y', 6, 9), w('z2', 10.2, 11)];
		expect(fillGaps(base, extra).map((x) => x.text)).toEqual(['a', 'x', 'y', 'z']);
	});
});

describe('clipToAudio', () => {
	it('drops words aligned into the zero padding and clamps ends', () => {
		const words = [
			{ text: 'real', start: 10, end: 18.5 },
			{ text: 'unplaced', start: null, end: null },
			{ text: 'ghost', start: 29.1, end: 29.1 }
		];
		expect(clipToAudio(words, 18.2)).toEqual([
			{ text: 'real', start: 10, end: 18.2 },
			{ text: 'unplaced', start: null, end: null }
		]);
	});
});
