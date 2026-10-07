import { describe, expect, it } from 'vitest';
import { buildPyramid, PeakBuilder, pickLevel } from './peaks';
import { StreamingResampler } from './resampler';

function sine(freq: number, rate: number, seconds: number, amp = 0.5) {
	const out = new Float32Array(Math.round(rate * seconds));
	for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
	return out;
}

function rms(x: Float32Array, from = 0, to = x.length) {
	let acc = 0;
	for (let i = from; i < to; i++) acc += x[i] * x[i];
	return Math.sqrt(acc / Math.max(1, to - from));
}

function resampleAll(r: StreamingResampler, input: Float32Array, chunk: number) {
	const parts: Float32Array[] = [];
	for (let i = 0; i < input.length; i += chunk) parts.push(r.push(input.subarray(i, i + chunk)));
	parts.push(r.flush());
	const total = parts.reduce((a, p) => a + p.length, 0);
	const out = new Float32Array(total);
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

describe('StreamingResampler', () => {
	it('48 kHz → 16 kHz preserves duration and in-band level', () => {
		const out = resampleAll(new StreamingResampler(48000, 16000), sine(440, 48000, 1), 1000);
		expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(2);
		expect(rms(out, 200, 15800)).toBeCloseTo(0.5 / Math.SQRT2, 2);
	});

	it('44.1 kHz → 16 kHz (non-integer ratio) works in uneven chunks', () => {
		const out = resampleAll(new StreamingResampler(44100, 16000), sine(1000, 44100, 1), 777);
		expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(2);
		expect(rms(out, 200, 15800)).toBeCloseTo(0.5 / Math.SQRT2, 2);
	});

	it('attenuates content above the output Nyquist (anti-aliasing)', () => {
		const out = resampleAll(new StreamingResampler(48000, 16000), sine(12000, 48000, 1), 4096);
		expect(rms(out, 200, 15800)).toBeLessThan(0.01);
	});

	it('is chunk-size independent', () => {
		const input = sine(300, 48000, 0.5);
		const a = resampleAll(new StreamingResampler(48000, 16000), input, 100);
		const b = resampleAll(new StreamingResampler(48000, 16000), input, 10000);
		expect(a.length).toBe(b.length);
		for (let i = 0; i < a.length; i += 97) expect(a[i]).toBeCloseTo(b[i], 5);
	});
});

describe('waveform peaks', () => {
	it('builds min/max buckets and a halving pyramid', () => {
		const pb = new PeakBuilder(16000, 32);
		pb.push(sine(100, 16000, 1, 1));
		const base = pb.finish();
		expect(base.length).toBe(1000);
		const levels = buildPyramid(base, 32 / 16000);
		expect(levels[1].data.length).toBe(500);
		expect(levels[1].bucketSeconds).toBeCloseTo(0.004, 9);
		expect(Math.max(...levels[0].data)).toBeGreaterThan(120);
		expect(pickLevel(levels, 0.01).bucketSeconds).toBeLessThanOrEqual(0.01);
		expect(pickLevel(levels, 0.0001)).toBe(levels[0]);
	});
});
