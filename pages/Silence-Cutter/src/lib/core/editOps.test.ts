import { describe, expect, it } from 'vitest';
import { applyOverrides, buildAutoEdl, removedRanges } from './edl';
import { boundaryNear, dragBoundary, markRange, mergeRange, splitAt, toggleAt } from './editOps';
import type { ManualOverride } from './types';

const duration = 10;
const auto = buildAutoEdl(duration, [{ start: 2, end: 4, source: 'both', confidence: 1 }]);
const silence = [
	{ start: 1.75, end: 4.15 }, // padded into the cut [2,4]
	{ start: 6, end: 6.3 } // 300 ms pause: too short to cut automatically
];
const pad = { leadMs: 150, trailMs: 250 };

function apply(...ops: Array<Omit<ManualOverride, 'id'> | null>) {
	const overrides = ops.filter(Boolean).map((o, id) => ({ ...o!, id }) as ManualOverride);
	return applyOverrides(auto, overrides, duration);
}

describe('manual edit operations', () => {
	it('clicking a proposed cut keeps it', () => {
		const op = toggleAt(auto, 3, silence, pad, duration);
		expect(op).toEqual({ kind: 'paint', start: 2, end: 4, action: 'keep' });
		expect(removedRanges(apply(op))).toEqual([]);
	});

	it('clicking a retained pause removes it (whole pause when padding would consume it)', () => {
		const op = toggleAt(auto, 6.1, silence, pad, duration);
		expect(op).toEqual({ kind: 'paint', start: 6, end: 6.3, action: 'remove' });
	});

	it('clicking retained speech does nothing', () => {
		expect(toggleAt(auto, 8, silence, pad, duration)).toBeNull();
	});

	it('finds draggable boundaries near the pointer', () => {
		expect(boundaryNear(auto, 2.03, 0.05)).toEqual({ time: 2, leftIndex: 0 });
		expect(boundaryNear(auto, 3, 0.05)).toBeNull();
	});

	it('dragging a cut start earlier extends the cut; later shrinks it', () => {
		expect(removedRanges(apply(dragBoundary(auto, 0, 2, 1.5)))).toEqual([{ start: 1.5, end: 4 }]);
		expect(removedRanges(apply(dragBoundary(auto, 0, 2, 2.5)))).toEqual([{ start: 2.5, end: 4 }]);
	});

	it('dragging a cut end', () => {
		expect(removedRanges(apply(dragBoundary(auto, 1, 4, 4.6)))).toEqual([{ start: 2, end: 4.6 }]);
		expect(removedRanges(apply(dragBoundary(auto, 1, 4, 3.2)))).toEqual([{ start: 2, end: 3.2 }]);
	});

	it('drags are clamped to the neighbouring regions', () => {
		expect(dragBoundary(auto, 0, 2, -5)).toEqual({
			kind: 'paint',
			start: 0,
			end: 2,
			action: 'remove'
		});
	});

	it('marks ranges keep/remove', () => {
		expect(removedRanges(apply(markRange({ start: 7, end: 8 }, 'remove')))).toEqual([
			{ start: 2, end: 4 },
			{ start: 7, end: 8 }
		]);
		expect(removedRanges(apply(markRange({ start: 3.5, end: 2.5 }, 'keep')))).toEqual([
			{ start: 2, end: 2.5 },
			{ start: 3.5, end: 4 }
		]);
	});

	it('splits and merges', () => {
		const split = splitAt(auto, 3);
		expect(split).toEqual({ kind: 'split', at: 3 });
		const edl = apply(split);
		expect(edl.filter((r) => r.action === 'remove')).toHaveLength(2);
		const merged = mergeRange(edl, { start: 1, end: 3.5 });
		expect(merged).toEqual({ kind: 'paint', start: 0, end: 4, action: 'keep' });
		expect(splitAt(auto, 2.001)).toBeNull();
	});
});
