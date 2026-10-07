import { describe, expect, it } from 'vitest';
import { cutColor, keptRuns, segmentDetail } from './agreement';
import { buildAutoEdl } from './edl';
import { buildSegments } from './selection';

describe('segment colour coding', () => {
	it('colours cuts by who removed them', () => {
		expect(cutColor({ manual: false, source: 'both' })).toBe('cut-both');
		expect(cutColor({ manual: false, source: 'audio' })).toBe('cut-audio');
		expect(cutColor({ manual: false, source: 'transcript' })).toBe('cut-transcript');
		expect(cutColor({ manual: true, source: 'manual' })).toBe('cut-manual');
	});

	it('splits kept material by detector agreement', () => {
		const audio = [{ start: 1, end: 4 }];
		const transcript = [{ start: 2, end: 5 }];
		expect(keptRuns({ start: 0, end: 6 }, audio, transcript)).toEqual([
			{ start: 0, end: 1, color: 'kept-pause' },
			{ start: 1, end: 2, color: 'kept-transcript-silent' },
			{ start: 2, end: 4, color: 'speech' },
			{ start: 4, end: 5, color: 'kept-audio-silent' },
			{ start: 5, end: 6, color: 'kept-pause' }
		]);
	});

	it('lets the noise level decide alone before transcription', () => {
		expect(keptRuns({ start: 0, end: 3 }, [{ start: 1, end: 2 }], null)).toEqual([
			{ start: 0, end: 1, color: 'kept-pause' },
			{ start: 1, end: 2, color: 'speech' },
			{ start: 2, end: 3, color: 'kept-pause' }
		]);
	});

	it('clips detector ranges to the kept range', () => {
		expect(
			keptRuns({ start: 2, end: 3 }, [{ start: 0, end: 10 }], [{ start: 0, end: 10 }])
		).toEqual([{ start: 2, end: 3, color: 'speech' }]);
	});

	it('splits an automatic cut into pieces by detector, and clips to a window', () => {
		const edl = buildAutoEdl(10, [
			{ start: 2, end: 3, source: 'audio', confidence: 0.5 },
			{ start: 3, end: 5, source: 'both', confidence: 1 }
		]);
		const [, cut] = buildSegments(edl, []);
		expect(segmentDetail(cut, edl, null, null)).toEqual([
			{ start: 2, end: 3, color: 'cut-audio' },
			{ start: 3, end: 5, color: 'cut-both' }
		]);
		expect(segmentDetail(cut, edl, null, null, { start: 4, end: 9 })).toEqual([
			{ start: 4, end: 5, color: 'cut-both' }
		]);
	});
});
