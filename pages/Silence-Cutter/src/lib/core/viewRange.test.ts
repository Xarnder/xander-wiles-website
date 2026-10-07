import { describe, expect, it } from 'vitest';
import { centerRangeAt, dragHandle, panRange, sanitizeRange, zoomOf } from './viewRange';

describe('zoom scrollbar range math', () => {
	it('derives zoom from the visible fraction', () => {
		expect(zoomOf({ start: 0, end: 1 })).toBe(1);
		expect(zoomOf({ start: 0, end: 0.5 })).toBe(2);
		expect(zoomOf({ start: 0.25, end: 0.5 })).toBe(4);
	});

	it('left handle changes only the start; moving right zooms in, left zooms out', () => {
		const r = { start: 0.2, end: 0.6 };
		expect(dragHandle(r, 'start', 0.1, 0.01)).toEqual({ start: 0.30000000000000004, end: 0.6 });
		expect(dragHandle(r, 'start', -0.1, 0.01).end).toBe(0.6);
		expect(dragHandle(r, 'start', -0.1, 0.01).start).toBeCloseTo(0.1, 12);
	});

	it('right handle changes only the end', () => {
		const r = { start: 0.2, end: 0.6 };
		expect(dragHandle(r, 'end', -0.1, 0.01)).toEqual({ start: 0.2, end: 0.5 });
		expect(dragHandle(r, 'end', 0.1, 0.01).start).toBe(0.2);
	});

	it('handles clamp at 0/1 and never cross or get closer than minRange', () => {
		const r = { start: 0.2, end: 0.6 };
		expect(dragHandle(r, 'start', -5, 0.01)).toEqual({ start: 0, end: 0.6 });
		expect(dragHandle(r, 'end', 5, 0.01)).toEqual({ start: 0.2, end: 1 });
		const crossed = dragHandle(r, 'start', 5, 0.05);
		expect(crossed.end).toBe(0.6);
		expect(crossed.end - crossed.start).toBeCloseTo(0.05, 12);
		const crossed2 = dragHandle(r, 'end', -5, 0.05);
		expect(crossed2.end - crossed2.start).toBeCloseTo(0.05, 12);
	});

	it('a zero-delta drag returns the initial range exactly (no jump on drag start)', () => {
		const r = { start: 0.123456789, end: 0.987654321 };
		expect(dragHandle(r, 'start', 0, 0.01)).toEqual(r);
		expect(dragHandle(r, 'end', 0, 0.01)).toEqual(r);
		expect(panRange(r, 0)).toEqual(r);
	});

	it('panning preserves the width and clamps inside the track', () => {
		const r = { start: 0.25, end: 0.5 };
		const right = panRange(r, 10);
		expect(right).toEqual({ start: 0.75, end: 1 });
		const left = panRange(r, -10);
		expect(left).toEqual({ start: 0, end: 0.25 });
		const mid = panRange(r, 0.1);
		expect(mid.end - mid.start).toBeCloseTo(0.25, 12);
	});

	it('repeated pans from the drag origin do not accumulate error', () => {
		const r = { start: 0.1, end: 0.1 + 1 / 3 };
		let last = r;
		for (let i = 0; i < 10_000; i++) last = panRange(r, ((i % 200) - 100) / 1000);
		expect(last.end - last.start).toBeCloseTo(1 / 3, 14);
	});

	it('clicking the track centres the range there without changing zoom', () => {
		const r = { start: 0, end: 0.2 };
		expect(centerRangeAt(r, 0.5).start).toBeCloseTo(0.4, 12);
		expect(centerRangeAt(r, 0.5).end).toBeCloseTo(0.6, 12);
		expect(centerRangeAt(r, 0.99)).toEqual({ start: 0.8, end: 1 });
		expect(centerRangeAt(r, 0.01)).toEqual({ start: 0, end: 0.2 });
	});

	it('sanitises invalid controlled values', () => {
		expect(sanitizeRange({ start: 0.6, end: 0.2 }, 0.01)).toEqual({ start: 0.2, end: 0.6 });
		expect(sanitizeRange({ start: -1, end: 2 }, 0.01)).toEqual({ start: 0, end: 1 });
		const tiny = sanitizeRange({ start: 0.5, end: 0.5 }, 0.1);
		expect(tiny.end - tiny.start).toBeCloseTo(0.1, 12);
		expect(sanitizeRange({ start: 1, end: 1 }, 0.1)).toEqual({ start: 0.9, end: 1 });
		expect(sanitizeRange({ start: NaN, end: NaN }, 0.1)).toEqual({ start: 0, end: 1 });
	});
});
