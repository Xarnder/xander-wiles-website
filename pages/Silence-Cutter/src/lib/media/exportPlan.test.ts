import { describe, expect, it } from 'vitest';
import { exportBitrates, JoinMixer, planAudioSegments, segmentGain } from './exportPlan';

const keeps = [
	{ start: 0, end: 2 },
	{ start: 4, end: 6 },
	{ start: 6.02, end: 9 }
];

describe('audio segment planning', () => {
	it('places segments back to back on the edited timeline', () => {
		const p = planAudioSegments(keeps, 10, { fadeInMs: 10, fadeOutMs: 20, crossfadeMs: 0 });
		expect(p.map((s) => s.outStart)).toEqual([0, 2, 4]);
	});

	it('fades only at edit boundaries, never at untouched media edges', () => {
		const p = planAudioSegments(keeps, 10, { fadeInMs: 10, fadeOutMs: 20, crossfadeMs: 0 });
		expect(p[0].fadeIn).toBe(0); // starts at media start
		expect(p[0].fadeOut).toBeCloseTo(0.02, 9);
		expect(p[1].fadeIn).toBeCloseTo(0.01, 9);
		expect(p[2].fadeOut).toBeCloseTo(0.02, 9); // end 9 < duration 10 → it is a cut
	});

	it('caps crossfade handles to half the removed gap and keeps them symmetric', () => {
		const p = planAudioSegments(keeps, 10, { fadeInMs: 10, fadeOutMs: 20, crossfadeMs: 100 });
		expect(p[0].handleAfter).toBeCloseTo(0.05, 9);
		expect(p[1].handleBefore).toBeCloseTo(0.05, 9);
		// Only a 20 ms gap between segments 2 and 3 → 10 ms handles.
		expect(p[1].handleAfter).toBeCloseTo(0.01, 9);
		expect(p[2].handleBefore).toBeCloseTo(0.01, 9);
		// Crossfaded joins do not also get fades.
		expect(p[1].fadeIn).toBe(0);
	});

	it('equal-power crossfade keeps constant power through the join', () => {
		const p = planAudioSegments(keeps, 10, { fadeInMs: 0, fadeOutMs: 0, crossfadeMs: 100 });
		// Join between segment 0 (ends at 2, out 2) and segment 1 (starts at 4, out 2).
		for (let x = -0.05; x <= 0.05; x += 0.01) {
			const a = segmentGain(p[0], 2 + x);
			const b = segmentGain(p[1], 4 + x);
			expect(a * a + b * b).toBeCloseTo(1, 6);
		}
		expect(segmentGain(p[0], 1)).toBe(1);
	});

	it('raised-cosine fades start from silence', () => {
		const p = planAudioSegments(keeps, 10, { fadeInMs: 10, fadeOutMs: 20, crossfadeMs: 0 });
		expect(segmentGain(p[1], 4)).toBeCloseTo(0, 9);
		expect(segmentGain(p[1], 4.005)).toBeCloseTo(0.5, 6);
		expect(segmentGain(p[1], 4.5)).toBe(1);
		expect(segmentGain(p[0], 2)).toBeCloseTo(0, 9);
	});
});

describe('JoinMixer', () => {
	it('emits frames in order and sums overlaps', () => {
		const m = new JoinMixer(1);
		m.add(0, [new Float32Array([1, 1, 1, 1])], 4);
		m.add(3, [new Float32Array([2, 2, 2])], 3);
		const a = m.flushUntil(2)!;
		expect(Array.from(a.planes[0])).toEqual([1, 1]);
		const b = m.flushAll()!;
		expect(b.startFrame).toBe(2);
		expect(Array.from(b.planes[0])).toEqual([1, 3, 2, 2]);
	});

	it('fills gaps with silence', () => {
		const m = new JoinMixer(2);
		m.add(0, [new Float32Array([1]), new Float32Array([1])], 1);
		m.add(3, [new Float32Array([5]), new Float32Array([6])], 1);
		const out = m.flushAll()!;
		expect(Array.from(out.planes[0])).toEqual([1, 0, 0, 5]);
		expect(Array.from(out.planes[1])).toEqual([1, 0, 0, 6]);
	});
});

describe('export bitrates', () => {
	it('scales with the preset and the source bitrate', () => {
		const src = { videoBitrate: 8e6, audioBitrate: 192e3, width: 1920, height: 1080, fps: 30 };
		expect(exportBitrates('source', src).video).toBe(8e6);
		expect(exportBitrates('smaller', src).video).toBe(4.8e6);
		expect(exportBitrates('high', src).video).toBe(12e6);
		expect(exportBitrates('source', src).audio).toBe(192e3);
		expect(exportBitrates('smaller', src).audio).toBe(96e3);
	});

	it('always returns integer bitrates (WebCodecs rejects fractional ones)', () => {
		const r = exportBitrates('source', {
			videoBitrate: 3_141_592.65,
			audioBitrate: 131_072.5,
			width: 1920,
			height: 1080,
			fps: 30
		});
		expect(Number.isInteger(r.video)).toBe(true);
		expect(Number.isInteger(r.audio)).toBe(true);
	});

	it('estimates a bitrate when the source does not report one', () => {
		const v = exportBitrates('source', {
			videoBitrate: null,
			audioBitrate: null,
			width: 1280,
			height: 720,
			fps: 30
		}).video;
		expect(v).toBeGreaterThan(1e6);
		expect(v).toBeLessThan(10e6);
	});
});
