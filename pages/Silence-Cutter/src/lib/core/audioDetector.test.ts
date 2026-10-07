import { describe, expect, it } from 'vitest';
import {
	DEFAULT_AUDIO_PARAMS,
	EnvelopeBuilder,
	amplitudeToDb,
	detectAudioSpeech,
	suggestThreshold
} from './audioDetector';
import { SILENCE_DB, SPEECH_DB, envelopeFrom, round } from './testUtils';

const params = { ...DEFAULT_AUDIO_PARAMS, thresholdDb: -40, releaseMs: 150, attackMs: 10 };

describe('detectAudioSpeech', () => {
	it('finds a single speech region against silence', () => {
		const env = envelopeFrom([
			[500, SILENCE_DB],
			[1000, SPEECH_DB],
			[500, SILENCE_DB]
		]);
		expect(round(detectAudioSpeech(env, params))).toEqual([{ start: 0.5, end: 1.5 }]);
	});

	it('bridges a 100 ms pause (shorter than release) into one region', () => {
		const env = envelopeFrom([
			[300, SILENCE_DB],
			[800, SPEECH_DB],
			[100, SILENCE_DB],
			[800, SPEECH_DB],
			[300, SILENCE_DB]
		]);
		expect(round(detectAudioSpeech(env, params))).toEqual([{ start: 0.3, end: 2.0 }]);
	});

	it('splits on a 1.8 s pause', () => {
		const env = envelopeFrom([
			[300, SILENCE_DB],
			[800, SPEECH_DB],
			[1800, SILENCE_DB],
			[800, SPEECH_DB],
			[300, SILENCE_DB]
		]);
		expect(round(detectAudioSpeech(env, params))).toEqual([
			{ start: 0.3, end: 1.1 },
			{ start: 2.9, end: 3.7 }
		]);
	});

	it('does not classify frames independently: tiny intra-word dips never split speech', () => {
		const segments: Array<[number, number]> = [[200, SILENCE_DB]];
		for (let i = 0; i < 20; i++) {
			segments.push([60, SPEECH_DB], [20, -60]);
		}
		segments.push([200, SILENCE_DB]);
		const regions = detectAudioSpeech(envelopeFrom(segments), params);
		expect(regions).toHaveLength(1);
	});

	it('requires sustained level for attack (ignores a single-frame click)', () => {
		const env = envelopeFrom([
			[500, SILENCE_DB],
			[10, SPEECH_DB],
			[500, SILENCE_DB]
		]);
		expect(detectAudioSpeech(env, { ...params, attackMs: 30 })).toEqual([]);
	});

	it('drops speech shorter than the minimum speech duration', () => {
		const env = envelopeFrom([
			[500, SILENCE_DB],
			[30, SPEECH_DB],
			[500, SILENCE_DB]
		]);
		expect(detectAudioSpeech(env, { ...params, minSpeechMs: 50 })).toEqual([]);
		expect(detectAudioSpeech(env, { ...params, minSpeechMs: 20 })).toHaveLength(1);
	});

	it('applies hysteresis: a level between close and open thresholds keeps the gate open', () => {
		const env = envelopeFrom([
			[200, SILENCE_DB],
			[300, SPEECH_DB],
			[600, -42], // below -40 open threshold, above -44 close threshold
			[300, SPEECH_DB],
			[200, SILENCE_DB]
		]);
		expect(detectAudioSpeech(env, { ...params, hysteresisDb: 4 })).toHaveLength(1);
		expect(detectAudioSpeech(env, { ...params, hysteresisDb: 0 })).toHaveLength(2);
	});

	it('moving the threshold changes what counts as speech', () => {
		const env = envelopeFrom([
			[500, SILENCE_DB],
			[500, -45], // quiet speech
			[500, SILENCE_DB]
		]);
		expect(detectAudioSpeech(env, { ...params, thresholdDb: -40 })).toEqual([]);
		expect(detectAudioSpeech(env, { ...params, thresholdDb: -50 })).toHaveLength(1);
	});
});

describe('EnvelopeBuilder', () => {
	it('produces one value per hop and measures RMS level', () => {
		const sr = 16000;
		const builder = new EnvelopeBuilder(sr, 0.01, 20);
		const tone = new Float32Array(sr);
		for (let i = 0; i < tone.length; i++) tone[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr);
		// Feed in uneven chunks to exercise streaming.
		builder.push(tone.subarray(0, 1234));
		builder.push(tone.subarray(1234));
		const env = builder.finish();
		expect(env.db.length).toBe(100);
		// RMS of a 0.5 amplitude sine = 0.354 → about -9 dBFS.
		expect(env.db[50]).toBeCloseTo(amplitudeToDb(0.5 / Math.SQRT2), 0);
	});

	it('reports digital silence at the floor', () => {
		const builder = new EnvelopeBuilder(16000);
		builder.push(new Float32Array(1600));
		expect(Array.from(builder.finish().db).every((v) => v === -100)).toBe(true);
	});
});

describe('suggestThreshold', () => {
	it('lands between the noise floor and the speech level', () => {
		const env = envelopeFrom([
			[3000, -65],
			[3000, -20],
			[3000, -65]
		]);
		const t = suggestThreshold(env);
		expect(t).toBeGreaterThan(-65);
		expect(t).toBeLessThan(-20);
	});
});
