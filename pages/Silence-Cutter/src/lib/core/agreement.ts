/**
 * Colour coding for the segment strip: what each detector thinks about every part of the edit.
 *
 * Kept material is split by detector agreement (both hear speech / they disagree / both hear
 * silence); removed material by who removed it (both detectors, one of them, or the user).
 */
import { EPSILON, findRangeIndex, firstEndingAfter } from './ranges';
import type { EditRegion, Range } from './types';

export type SegmentColor =
	/** Kept: both detectors hear speech. */
	| 'speech'
	/** Kept, but the noise-level detector hears silence (only the transcript hears speech). */
	| 'kept-audio-silent'
	/** Kept, but the transcript hears silence (only the noise level hears speech). */
	| 'kept-transcript-silent'
	/** Kept although both detectors hear silence: padding around speech, or a short pause. */
	| 'kept-pause'
	/** Cut: both detectors agree it is silence. */
	| 'cut-both'
	/** Cut: only the noise-level detector says silence. */
	| 'cut-audio'
	/** Cut: only the transcript says silence. */
	| 'cut-transcript'
	/** Cut by the user. */
	| 'cut-manual';

export interface ColoredRun extends Range {
	color: SegmentColor;
}

/** Colour of an EDL region that is removed. */
export function cutColor(region: Pick<EditRegion, 'manual' | 'source'>): SegmentColor {
	if (region.manual) return 'cut-manual';
	if (region.source === 'audio') return 'cut-audio';
	if (region.source === 'transcript') return 'cut-transcript';
	return 'cut-both';
}

const inside = (ranges: readonly Range[], t: number) => findRangeIndex(ranges, t) >= 0;

/**
 * Split kept `range` into runs coloured by detector agreement. A detector that has not run
 * (null — e.g. before transcription) has no vote, so the other detector decides alone.
 */
export function keptRuns(
	range: Range,
	audioSpeech: readonly Range[] | null,
	transcriptSpeech: readonly Range[] | null
): ColoredRun[] {
	const points = [range.start, range.end];
	for (const ranges of [audioSpeech, transcriptSpeech]) {
		if (!ranges) continue;
		for (let i = firstEndingAfter(ranges, range.start); i < ranges.length; i++) {
			const r = ranges[i];
			if (r.start >= range.end) break;
			if (r.start > range.start) points.push(r.start);
			if (r.end < range.end) points.push(r.end);
		}
	}
	points.sort((a, b) => a - b);
	const out: ColoredRun[] = [];
	for (let i = 0; i + 1 < points.length; i++) {
		const start = points[i];
		const end = points[i + 1];
		if (end - start <= EPSILON) continue;
		const mid = (start + end) / 2;
		const a = audioSpeech ? inside(audioSpeech, mid) : null;
		const t = transcriptSpeech ? inside(transcriptSpeech, mid) : null;
		const audio = a ?? t ?? true;
		const transcript = t ?? a ?? true;
		const color: SegmentColor =
			audio && transcript
				? 'speech'
				: !audio && !transcript
					? 'kept-pause'
					: audio
						? 'kept-transcript-silent'
						: 'kept-audio-silent';
		const last = out[out.length - 1];
		if (last && last.color === color && Math.abs(last.end - start) <= EPSILON) last.end = end;
		else out.push({ start, end, color });
	}
	return out;
}

/**
 * The detail-track pieces of one segment: a cut split by which detector(s) removed each part, or
 * kept material split by detector agreement. Pass `clip` to compute only a visible window.
 */
export function segmentDetail(
	segment: EditRegion,
	edl: readonly EditRegion[],
	audioSpeech: readonly Range[] | null,
	transcriptSpeech: readonly Range[] | null,
	clip: Range = segment
): ColoredRun[] {
	const start = Math.max(segment.start, clip.start);
	const end = Math.min(segment.end, clip.end);
	if (end - start <= EPSILON) return [];
	if (segment.action === 'keep') return keptRuns({ start, end }, audioSpeech, transcriptSpeech);
	if (segment.manual) return [{ start, end, color: 'cut-manual' }];
	const out: ColoredRun[] = [];
	for (let i = firstEndingAfter(edl, start); i < edl.length; i++) {
		const r = edl[i];
		if (r.start >= end) break;
		const a = Math.max(r.start, start);
		const b = Math.min(r.end, end);
		if (b - a <= EPSILON) continue;
		const color = cutColor(r);
		const last = out[out.length - 1];
		if (last && last.color === color && Math.abs(last.end - a) <= EPSILON) last.end = b;
		else out.push({ start: a, end: b, color });
	}
	return out;
}

/** Hover text for a detail-track piece. */
export const DETAIL_TEXT: Record<SegmentColor, string> = {
	speech: 'Speech · both detectors agree',
	'kept-audio-silent': 'Kept · transcript hears speech, noise level hears silence',
	'kept-transcript-silent': 'Kept · noise level hears speech, transcript hears silence',
	'kept-pause': 'Kept pause / padding',
	'cut-both': 'Cut · both detectors agree',
	'cut-audio': 'Cut · noise level only',
	'cut-transcript': 'Cut · transcript only',
	'cut-manual': 'Cut by you'
};

/** Legend entries, in display order. */
export const LEGEND: Array<{ color: SegmentColor | 'kept-manual'; label: string; title: string }> =
	[
		{
			color: 'speech',
			label: 'Kept · both hear speech',
			title: 'Noise level and transcript agree: speech'
		},
		{
			color: 'kept-transcript-silent',
			label: 'Kept · detectors disagree',
			title:
				'Kept because one detector still hears speech. The coloured bar shows which detector heard silence (blue: noise level, purple: transcript).'
		},
		{
			color: 'kept-pause',
			label: 'Kept pause / padding',
			title: 'Both hear silence, but it is padding around speech or too short to cut'
		},
		{ color: 'kept-manual', label: 'Kept by you', title: 'You restored or kept this' },
		{
			color: 'cut-both',
			label: 'Cut · both agree',
			title: 'Noise level and transcript agree: silence'
		},
		{
			color: 'cut-audio',
			label: 'Cut · noise level only',
			title: 'Only the noise-level detector says silence'
		},
		{
			color: 'cut-transcript',
			label: 'Cut · transcript only',
			title: 'Only the transcript says silence'
		},
		{ color: 'cut-manual', label: 'Cut by you', title: 'You removed this' }
	];
