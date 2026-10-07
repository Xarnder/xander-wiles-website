import { describe, expect, it } from 'vitest';
import { proposeCuts, type DetectionInput } from './combine';
import { detectTranscriptSpeech, classifyWord } from './transcriptDetector';
import { round, wordsFrom } from './testUtils';
import type { CutParams } from './types';

const noPad: CutParams = { mode: 'audio', leadMs: 0, trailMs: 0, minSilenceMs: 0 };

describe('transcript gap detection', () => {
	it('treats every spoken token — including repeats, stutters and fillers — as speech', () => {
		// "I think we... I think we should... [UM] we should probably launch on Thursday."
		const words = wordsFrom([
			['I', 0.0, 0.15],
			['think', 0.15, 0.4],
			['we...', 0.4, 0.6],
			['I', 1.2, 1.3],
			['think', 1.3, 1.55],
			['we', 1.55, 1.7],
			['should...', 1.7, 2.0],
			['[UM]', 2.6, 3.0],
			['we', 3.4, 3.55],
			['should', 3.55, 3.8],
			['th-', 3.9, 4.0],
			['probably', 4.1, 4.5],
			['launch', 4.5, 4.8],
			['on', 4.8, 4.9],
			['Thursday.', 4.9, 5.4]
		]);
		const speech = detectTranscriptSpeech(words, {
			eventsAreSpeech: true,
			breathsAreSpeech: false
		});
		expect(round(speech)).toEqual([
			{ start: 0, end: 0.6 },
			{ start: 1.2, end: 2.0 },
			{ start: 2.6, end: 3.0 },
			{ start: 3.4, end: 3.8 },
			{ start: 3.9, end: 4.0 },
			{ start: 4.1, end: 5.4 }
		]);
		// The repeated "I think we" and the filler are not discarded.
		const covered = (t: number) => speech.some((r) => t >= r.start && t < r.end);
		expect(covered(1.25)).toBe(true);
		expect(covered(2.8)).toBe(true);
		expect(covered(3.95)).toBe(true);
	});

	it('classifies verbatim token kinds', () => {
		expect(classifyWord('[UM]')).toBe('filler');
		expect(classifyWord('[uh]')).toBe('filler');
		expect(classifyWord('[laughter]')).toBe('event');
		expect(classifyWord('th-')).toBe('partial');
		expect(classifyWord('um,')).toBe('filler');
		expect(classifyWord('Thursday.')).toBe('word');
		expect(classifyWord('mother-in-law')).toBe('word');
	});

	it('can optionally exclude vocal events from speech', () => {
		const words = wordsFrom([
			['hello', 0, 0.5],
			['[laughter]', 1, 2]
		]);
		expect(
			detectTranscriptSpeech(words, { eventsAreSpeech: false, breathsAreSpeech: false })
		).toHaveLength(1);
		expect(
			detectTranscriptSpeech(words, { eventsAreSpeech: true, breathsAreSpeech: false })
		).toHaveLength(2);
	});

	it('treats breaths as non-speech unless asked', () => {
		const words = wordsFrom([
			['hello', 0, 0.5],
			['[breath]', 1, 1.4]
		]);
		expect(words[1].kind).toBe('breath');
		expect(
			detectTranscriptSpeech(words, { eventsAreSpeech: true, breathsAreSpeech: false })
		).toHaveLength(1);
		expect(
			detectTranscriptSpeech(words, { eventsAreSpeech: true, breathsAreSpeech: true })
		).toHaveLength(2);
	});
});

describe('minimum silence and padding', () => {
	const base: DetectionInput = {
		duration: 10,
		audioSpeech: [
			{ start: 1, end: 3 },
			{ start: 3.1, end: 5 }, // 100 ms natural pause
			{ start: 6.8, end: 9 } // 1.8 s pause before this
		],
		transcriptSpeech: null
	};

	it('never cuts a 100 ms pause but does cut a 1.8 s pause', () => {
		const { cuts } = proposeCuts(base, {
			mode: 'audio',
			leadMs: 150,
			trailMs: 250,
			minSilenceMs: 500
		});
		const inner = cuts.filter((c) => c.start > 0 && c.end < 10);
		expect(inner).toHaveLength(1);
		expect(inner[0].start).toBeCloseTo(5.25, 6); // trail after speech
		expect(inner[0].end).toBeCloseTo(6.65, 6); // lead before speech
		// The 100 ms pause at 3.0–3.1 is untouched.
		expect(cuts.some((c) => c.start < 3.1 && c.end > 3.0)).toBe(false);
	});

	it('does not pad the outer edges of the media', () => {
		const { cuts } = proposeCuts(base, {
			mode: 'audio',
			leadMs: 150,
			trailMs: 250,
			minSilenceMs: 500
		});
		expect(cuts[0].start).toBe(0);
		expect(cuts[0].end).toBeCloseTo(0.85, 6);
		expect(cuts[cuts.length - 1].end).toBe(10);
		expect(cuts[cuts.length - 1].start).toBeCloseTo(9.25, 6);
	});

	it('drops a cut entirely when padding consumes the silence', () => {
		const { cuts } = proposeCuts(
			{
				duration: 4,
				audioSpeech: [
					{ start: 0, end: 1 },
					{ start: 1.6, end: 4 }
				],
				transcriptSpeech: null
			},
			{ mode: 'audio', leadMs: 300, trailMs: 300, minSilenceMs: 500 }
		);
		expect(cuts).toEqual([]);
	});

	it('merges neighbouring speech regions when the gap is below minimum silence', () => {
		const { eligibleSilence } = proposeCuts(
			{
				duration: 6,
				audioSpeech: [
					{ start: 0, end: 1 },
					{ start: 1.3, end: 2 },
					{ start: 2.2, end: 3 },
					{ start: 4, end: 6 }
				],
				transcriptSpeech: null
			},
			{ ...noPad, minSilenceMs: 500 }
		);
		expect(round(eligibleSilence)).toEqual([{ start: 3, end: 4 }]);
	});
});

describe('combining detectors', () => {
	// Audio thinks 2–5 s is silent. ASR heard a quiet "um" at 3.0–3.4 (below the audio threshold),
	// and the transcript has a gap at 6–8 s where the audio hears a cough/noise.
	const input: DetectionInput = {
		duration: 10,
		audioSpeech: [
			{ start: 0, end: 2 },
			{ start: 5, end: 10 }
		],
		transcriptSpeech: [
			{ start: 0, end: 2 },
			{ start: 3, end: 3.4 },
			{ start: 5, end: 6 },
			{ start: 8, end: 10 }
		]
	};

	it('Conservative cuts only where BOTH agree (the quiet "um" survives)', () => {
		const { cuts, combinedSilence } = proposeCuts(input, { ...noPad, mode: 'conservative' });
		expect(round(combinedSilence)).toEqual([
			{ start: 2, end: 3 },
			{ start: 3.4, end: 5 }
		]);
		expect(cuts.every((c) => c.source === 'both')).toBe(true);
		expect(cuts.some((c) => c.start < 3.4 && c.end > 3)).toBe(false);
	});

	it('Aggressive cuts where EITHER thinks it is silent', () => {
		const { combinedSilence, cuts } = proposeCuts(input, { ...noPad, mode: 'aggressive' });
		expect(round(combinedSilence)).toEqual([
			{ start: 2, end: 5 },
			{ start: 6, end: 8 }
		]);
		const sources = cuts.map((c) => [round([c])[0].start, round([c])[0].end, c.source]);
		expect(sources).toEqual([
			[2, 3, 'both'],
			[3, 3.4, 'audio'],
			[3.4, 5, 'both'],
			[6, 8, 'transcript']
		]);
	});

	it('Audio and Transcript modes use a single detector', () => {
		expect(round(proposeCuts(input, { ...noPad, mode: 'audio' }).combinedSilence)).toEqual([
			{ start: 2, end: 5 }
		]);
		expect(round(proposeCuts(input, { ...noPad, mode: 'transcript' }).combinedSilence)).toEqual([
			{ start: 2, end: 3 },
			{ start: 3.4, end: 5 },
			{ start: 6, end: 8 }
		]);
	});

	it('keeps both analyses available separately after combination', () => {
		const p = proposeCuts(input, { ...noPad, mode: 'conservative' });
		expect(round(p.audioSilence!)).toEqual([{ start: 2, end: 5 }]);
		expect(round(p.transcriptSilence!)).toEqual([
			{ start: 2, end: 3 },
			{ start: 3.4, end: 5 },
			{ start: 6, end: 8 }
		]);
	});

	it('falls back to audio-only when no transcript exists', () => {
		const p = proposeCuts({ ...input, transcriptSpeech: null }, { ...noPad, mode: 'conservative' });
		expect(p.effectiveMode).toBe('audio');
		expect(round(p.combinedSilence)).toEqual([{ start: 2, end: 5 }]);
	});
});
