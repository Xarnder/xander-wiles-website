import { describe, expect, it } from 'vitest';
import { applyOverrides, buildAutoEdl } from './edl';
import { buildCues, toCmx3600, toSrt, toTranscriptText, toVtt } from './exports';
import { History } from './history';
import {
	adjacentCut,
	adjacentSegment,
	buildSegments,
	cutRuns,
	extendSelection,
	formatSpan,
	segmentAt,
	snapCandidates,
	snapTime,
	wordsInRange,
	wordsRange
} from './selection';
import { wordsFrom } from './testUtils';
import { TimeMap } from './timeMap';

const edl = buildAutoEdl(10, [
	{ start: 2, end: 4, source: 'both', confidence: 1 },
	{ start: 6, end: 7, source: 'audio', confidence: 0.5 },
	{ start: 7, end: 7.5, source: 'both', confidence: 1 }
]);

describe('segment selection and navigation', () => {
	it('finds the segment under a time', () => {
		expect(segmentAt(edl, 3)).toMatchObject({ start: 2, end: 4, action: 'remove' });
		expect(segmentAt(edl, 5)).toMatchObject({ start: 4, end: 6, action: 'keep' });
	});

	it('extends a selection', () => {
		expect(extendSelection({ start: 2, end: 3 }, { start: 5, end: 6 })).toEqual({
			start: 2,
			end: 6
		});
		expect(extendSelection(null, { start: 1, end: 2 })).toEqual({ start: 1, end: 2 });
	});

	it('treats adjacent removed regions as one cut', () => {
		expect(cutRuns(edl)).toEqual([
			{ start: 2, end: 4 },
			{ start: 6, end: 7.5 }
		]);
	});

	it('steps through cuts in both directions and wraps around', () => {
		const segs = buildSegments(edl, []);
		expect(adjacentCut(segs, 0, 1)).toEqual({ start: 2, end: 4 });
		expect(adjacentCut(segs, 2, 1)).toEqual({ start: 6, end: 7.5 });
		expect(adjacentCut(segs, 6, 1)).toEqual({ start: 2, end: 4 });
		expect(adjacentCut(segs, 6, -1)).toEqual({ start: 2, end: 4 });
		expect(adjacentCut(segs, 2, -1)).toEqual({ start: 6, end: 7.5 });
		expect(adjacentCut(buildSegments(buildAutoEdl(5, []), []), 0, 1)).toBeNull();
	});

	it('steps through segments of any kind', () => {
		expect(adjacentSegment(buildSegments(edl, []), 0, 1)).toMatchObject({ start: 2, end: 4 });
		expect(adjacentSegment(buildSegments(edl, []), 4, -1)).toMatchObject({ start: 2, end: 4 });
		expect(adjacentSegment(buildSegments(edl, []), 0, -1)).toBeNull();
	});
});

describe('user-visible segments', () => {
	it('merges automatic cut pieces that differ only by detector', () => {
		const segs = buildSegments(edl, []);
		expect(segs.map((r) => [r.start, r.end, r.action])).toEqual([
			[0, 2, 'keep'],
			[2, 4, 'remove'],
			[4, 6, 'keep'],
			[6, 7.5, 'remove'],
			[7.5, 10, 'keep']
		]);
		expect(segs[3].source).toBe('audio'); // longest piece
	});

	it('keeps pieces apart where the user split', () => {
		const split = applyOverrides(edl, [{ kind: 'split', id: 1, at: 3 }], 10);
		const segs = buildSegments(split, [3]);
		expect(segs.filter((r) => r.action === 'remove').map((r) => [r.start, r.end])).toEqual([
			[2, 3],
			[3, 4],
			[6, 7.5]
		]);
		expect(segmentAt(segs, 3.5)).toMatchObject({ start: 3, end: 4 });
		// Stepping visits each piece on its own.
		expect(adjacentCut(segs, 2, 1)).toMatchObject({ start: 3, end: 4 });
	});

	it('keeps manual and automatic decisions apart', () => {
		const painted = applyOverrides(
			edl,
			[{ kind: 'paint', id: 1, start: 4, end: 5, action: 'remove' }],
			10
		);
		const segs = buildSegments(painted, []);
		expect(
			segs.filter((r) => r.action === 'remove').map((r) => [r.start, r.end, r.manual])
		).toEqual([
			[2, 4, false],
			[4, 5, true],
			[6, 7.5, false]
		]);
	});
});

describe('word selection', () => {
	const words = wordsFrom([
		['I', 0, 0.2],
		['think', 0.25, 0.5],
		['[UM]', 1.0, 1.4],
		['we', 2, 2.2]
	]);

	it('spans word ranges in either order', () => {
		expect(wordsRange(words, 3, 1)).toEqual({ start: 0.25, end: 2.2 });
		expect(wordsRange(words, 9, 1)).toBeNull();
	});

	it('finds the words inside a time range', () => {
		expect(wordsInRange(words, { start: 0.3, end: 1.3 })).toEqual([1, 2]);
		expect(wordsInRange(words, { start: 5, end: 6 })).toBeNull();
	});
});

describe('snapping', () => {
	it('snaps to the nearest candidate within tolerance', () => {
		expect(snapTime(1.03, [1, 2], 0.05)).toEqual({ t: 1, snapped: true });
		expect(snapTime(1.2, [1, 2], 0.05)).toEqual({ t: 1.2, snapped: false });
	});

	it('collects word edges, boundaries and extra points near a time', () => {
		const words = wordsFrom([
			['a', 1.9, 2.05],
			['b', 8, 9]
		]);
		const c = snapCandidates(2, 0.2, edl, words, [2.1, 5]);
		expect(c).toEqual(expect.arrayContaining([2, 1.9, 2.05, 2.1]));
		expect(c).not.toContain(8);
		expect(c).not.toContain(5);
	});

	it('formats spans', () => {
		expect(formatSpan(0.25)).toBe('250 ms');
		expect(formatSpan(1.234)).toBe('1.23 s');
		expect(formatSpan(12.34)).toBe('12.3 s');
	});
});

describe('labelled history', () => {
	it('reports what undo and redo will do', () => {
		const h = new History<number>(0);
		h.push(1, 'Remove 1 s');
		h.push(2, 'Keep cut');
		expect(h.undoLabel).toBe('Keep cut');
		h.undo();
		expect(h.undoLabel).toBe('Remove 1 s');
		expect(h.redoLabel).toBe('Keep cut');
		h.redo();
		expect(h.redoLabel).toBeNull();
	});
});

describe('side-car exports', () => {
	const words = wordsFrom([
		['Hello', 0.5, 0.9],
		['there.', 1.0, 1.5],
		['[UM]', 2.5, 3.0], // inside the cut 2–4
		['Next', 4.2, 4.6],
		['bit', 4.7, 5.0],
		['[breath]', 5.2, 5.4],
		['end.', 8, 8.5]
	]);
	const map = TimeMap.fromEdl(edl);

	it('builds cues on the edited timeline, never spanning a cut', () => {
		const cues = buildCues(words, edl, map);
		expect(cues.map((c) => c.text)).toEqual(['Hello there.', 'Next bit', 'end.']);
		expect(cues[1].start).toBeCloseTo(2.2, 6); // 4.2 s source − 2 s cut
		expect(cues[2].start).toBeCloseTo(8 - 2 - 1.5, 6);
	});

	it('formats SRT and WebVTT', () => {
		const cues = buildCues(words, edl, map);
		expect(toSrt(cues)).toContain('1\n00:00:00,500 --> 00:00:01,500\nHello there.');
		expect(toVtt(cues)).toMatch(/^WEBVTT\n\n00:00:00\.500 --> 00:00:01\.500\nHello there\./);
	});

	it('writes the retained transcript', () => {
		expect(toTranscriptText(words, edl)).toBe('Hello there.\n\nNext bit [breath]\n\nend.\n');
	});

	it('writes a CMX 3600 EDL with contiguous record timecode', () => {
		const cmx = toCmx3600(
			[
				{ start: 0, end: 2 },
				{ start: 4, end: 6 }
			],
			25,
			'talk.mp4'
		);
		expect(cmx).toContain('FCM: NON-DROP FRAME');
		expect(cmx).toContain(
			'001  AX       AA/V  C        00:00:00:00 00:00:02:00 00:00:00:00 00:00:02:00'
		);
		expect(cmx).toContain(
			'002  AX       AA/V  C        00:00:04:00 00:00:06:00 00:00:02:00 00:00:04:00'
		);
		expect(cmx).toContain('* FROM CLIP NAME: talk.mp4');
	});
});
