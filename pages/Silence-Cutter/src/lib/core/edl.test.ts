import { describe, expect, it } from 'vitest';
import { proposeCuts } from './combine';
import { applyOverrides, assertValidEdl, buildAutoEdl, keptRanges, removedRanges } from './edl';
import { History } from './history';
import { computeStats } from './stats';
import { quantizeRanges, TimeMap } from './timeMap';
import type { ManualOverride } from './types';

const cuts = [
	{ start: 2, end: 4, source: 'both' as const, confidence: 1 },
	{ start: 6, end: 7, source: 'audio' as const, confidence: 0.5 }
];

describe('EDL construction', () => {
	it('builds a contiguous EDL covering the whole duration', () => {
		const edl = buildAutoEdl(10, cuts);
		assertValidEdl(edl, 10);
		expect(edl.map((r) => [r.start, r.end, r.action, r.source])).toEqual([
			[0, 2, 'keep', 'none'],
			[2, 4, 'remove', 'both'],
			[4, 6, 'keep', 'none'],
			[6, 7, 'remove', 'audio'],
			[7, 10, 'keep', 'none']
		]);
	});

	it('handles cuts at the very start and end', () => {
		const edl = buildAutoEdl(10, [
			{ start: 0, end: 1, source: 'both', confidence: 1 },
			{ start: 9, end: 10, source: 'both', confidence: 1 }
		]);
		assertValidEdl(edl, 10);
		expect(keptRanges(edl)).toEqual([{ start: 1, end: 9 }]);
	});

	it('produces a single keep region with no cuts', () => {
		const edl = buildAutoEdl(5, []);
		expect(edl).toHaveLength(1);
		expect(edl[0].action).toBe('keep');
	});
});

describe('manual override precedence', () => {
	const auto = buildAutoEdl(10, cuts);

	it('keeping a proposed cut restores it', () => {
		const edl = applyOverrides(
			auto,
			[{ kind: 'paint', id: 1, start: 2, end: 4, action: 'keep' }],
			10
		);
		assertValidEdl(edl, 10);
		expect(removedRanges(edl)).toEqual([{ start: 6, end: 7 }]);
		expect(edl.find((r) => r.start === 2)?.manual).toBe(true);
	});

	it('removing retained material adds a manual cut', () => {
		const edl = applyOverrides(
			auto,
			[{ kind: 'paint', id: 1, start: 8, end: 9, action: 'remove' }],
			10
		);
		expect(removedRanges(edl)).toEqual([
			{ start: 2, end: 4 },
			{ start: 6, end: 7 },
			{ start: 8, end: 9 }
		]);
	});

	it('later overrides win over earlier ones', () => {
		const overrides: ManualOverride[] = [
			{ kind: 'paint', id: 1, start: 1, end: 5, action: 'remove' },
			{ kind: 'paint', id: 2, start: 3, end: 3.5, action: 'keep' }
		];
		const edl = applyOverrides(auto, overrides, 10);
		assertValidEdl(edl, 10);
		expect(removedRanges(edl)).toEqual([
			{ start: 1, end: 3 },
			{ start: 3.5, end: 5 },
			{ start: 6, end: 7 }
		]);
	});

	it('dragging a cut boundary is expressed as overrides on the delta', () => {
		// Extend the cut start from 2 → 1.5 and shrink the end from 4 → 3.8.
		const edl = applyOverrides(
			auto,
			[
				{ kind: 'paint', id: 1, start: 1.5, end: 2, action: 'remove' },
				{ kind: 'paint', id: 2, start: 3.8, end: 4, action: 'keep' }
			],
			10
		);
		expect(removedRanges(edl)[0]).toEqual({ start: 1.5, end: 3.8 });
	});

	it('split markers create independent regions', () => {
		const edl = applyOverrides(auto, [{ kind: 'split', id: 1, at: 3 }], 10);
		const removes = edl.filter((r) => r.action === 'remove');
		expect(removes.map((r) => [r.start, r.end])).toEqual([
			[2, 3],
			[3, 4],
			[6, 7]
		]);
		// Toggling one half keeps the other.
		const edl2 = applyOverrides(
			auto,
			[
				{ kind: 'split', id: 1, at: 3 },
				{ kind: 'paint', id: 2, start: 3, end: 4, action: 'keep' }
			],
			10
		);
		expect(removedRanges(edl2)).toEqual([
			{ start: 2, end: 3 },
			{ start: 6, end: 7 }
		]);
	});

	it('manual overrides survive a change of automatic parameters', () => {
		const overrides: ManualOverride[] = [
			{ kind: 'paint', id: 1, start: 2.5, end: 3, action: 'keep' }
		];
		const input = {
			duration: 10,
			audioSpeech: [
				{ start: 0, end: 2 },
				{ start: 4, end: 10 }
			],
			transcriptSpeech: null
		};
		const a = proposeCuts(input, { mode: 'audio', leadMs: 0, trailMs: 0, minSilenceMs: 0 });
		const b = proposeCuts(input, { mode: 'audio', leadMs: 200, trailMs: 300, minSilenceMs: 0 });
		const edlA = applyOverrides(buildAutoEdl(10, a.cuts), overrides, 10);
		const edlB = applyOverrides(buildAutoEdl(10, b.cuts), overrides, 10);
		expect(removedRanges(edlA)).toEqual([
			{ start: 2, end: 2.5 },
			{ start: 3, end: 4 }
		]);
		const removedB = removedRanges(edlB);
		expect(removedB[0].start).toBeCloseTo(2.3, 9);
		expect(removedB[0].end).toBe(2.5);
		expect(removedB[1].start).toBe(3);
		expect(removedB[1].end).toBeCloseTo(3.8, 9);
	});

	it('overrides outside the media are clamped', () => {
		const edl = applyOverrides(
			auto,
			[{ kind: 'paint', id: 1, start: -5, end: 1, action: 'remove' }],
			10
		);
		assertValidEdl(edl, 10);
		expect(removedRanges(edl)[0]).toEqual({ start: 0, end: 1 });
	});
});

describe('time mapping', () => {
	const edl = buildAutoEdl(10, cuts); // keeps: [0,2] [4,6] [7,10]
	const map = TimeMap.fromEdl(edl);

	it('computes the edited duration', () => {
		expect(map.editedDuration).toBe(7);
	});

	it('maps source → edited time', () => {
		expect(map.sourceToEdited(0)).toBe(0);
		expect(map.sourceToEdited(1.5)).toBe(1.5);
		expect(map.sourceToEdited(4)).toBe(2);
		expect(map.sourceToEdited(5)).toBe(3);
		expect(map.sourceToEdited(8)).toBe(5);
		expect(map.sourceToEdited(10)).toBe(7);
		// Inside a removed region → the join where playback resumes.
		expect(map.sourceToEdited(3)).toBe(2);
		expect(map.sourceToEdited(6.5)).toBe(4);
	});

	it('maps edited → source time', () => {
		expect(map.editedToSource(0)).toBe(0);
		expect(map.editedToSource(1.999)).toBeCloseTo(1.999, 9);
		expect(map.editedToSource(2)).toBe(4);
		expect(map.editedToSource(3.5)).toBe(5.5);
		expect(map.editedToSource(4)).toBe(7);
		expect(map.editedToSource(7)).toBe(10);
	});

	it('round-trips for every retained source time', () => {
		for (let t = 0; t < 10; t += 0.137) {
			if (!map.isKept(t)) continue;
			expect(map.editedToSource(map.sourceToEdited(t))).toBeCloseTo(t, 9);
		}
	});

	it('finds where Edited playback continues after a removed region', () => {
		expect(map.nextKeptTime(1)).toBe(1);
		expect(map.nextKeptTime(2.5)).toBe(4);
		expect(map.nextKeptTime(6)).toBe(7);
		expect(map.keptRegionEnd(5)).toBe(6);
		expect(map.keptRegionEnd(6.5)).toBeNull();
	});

	it('quantizes kept ranges to the frame grid', () => {
		const q = quantizeRanges(
			[
				{ start: 0.011, end: 1.02 },
				{ start: 2.003, end: 2.004 }
			],
			25,
			10
		);
		expect(q).toEqual([{ start: 0, end: 1.04 }]);
	});
});

describe('stats and history', () => {
	it('computes edit statistics', () => {
		const edl = buildAutoEdl(10, cuts);
		const stats = computeStats(
			10,
			[
				{ start: 0, end: 2 },
				{ start: 4, end: 6 },
				{ start: 7, end: 10 }
			],
			edl,
			42
		);
		expect(stats.cuts).toBe(2);
		expect(stats.silenceRemoved).toBe(3);
		expect(stats.editedDuration).toBe(7);
		expect(stats.timeSaved).toBe(3);
		expect(stats.speechDetected).toBe(7);
		expect(stats.transcriptWords).toBe(42);
	});

	it('supports undo and redo', () => {
		const h = new History<number[]>([]);
		h.push([1]);
		h.push([1, 2]);
		expect(h.undo()).toEqual([1]);
		expect(h.undo()).toEqual([]);
		expect(h.canUndo).toBe(false);
		expect(h.redo()).toEqual([1]);
		h.push([9]);
		expect(h.canRedo).toBe(false);
	});
});
