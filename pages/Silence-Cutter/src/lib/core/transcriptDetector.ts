import { normalize } from './ranges';
import type { Range, TranscriptDetectorParams, TranscriptWord, WordKind } from './types';

export const DEFAULT_TRANSCRIPT_PARAMS: TranscriptDetectorParams = {
	eventsAreSpeech: true,
	breathsAreSpeech: false
};

const BREATHS = new Set(['breath', 'breathing', 'inhale', 'exhale', 'noise', 'lipsmack', 'sniff']);

const FILLERS = new Set([
	'um',
	'uh',
	'umm',
	'uhm',
	'erm',
	'er',
	'ah',
	'eh',
	'hm',
	'hmm',
	'mm',
	'mhm',
	'mm-hmm',
	'uh-huh'
]);

/**
 * Classify a verbatim token. CrisperWhisper emits fillers and vocal events in brackets
 * (`[UM]`, `[uh]`, `[laughter]`) and cut-off words with a trailing hyphen (`th-`).
 */
export function classifyWord(text: string): WordKind {
	const t = text.trim();
	const bracket = /^\[([^\]]+)\]([.,!?;:]*)$/.exec(t);
	if (bracket) {
		const tag = bracket[1].toLowerCase();
		if (FILLERS.has(tag)) return 'filler';
		return BREATHS.has(tag) ? 'breath' : 'event';
	}
	const bare = t.toLowerCase().replace(/[.,!?;:"“”]+$/g, '');
	if (FILLERS.has(bare)) return 'filler';
	if (/[\p{L}\p{N}]-$/u.test(bare) || /[\p{L}]—$/u.test(bare)) return 'partial';
	return 'word';
}

/**
 * Analysis B: every spoken token is speech. Repetitions, stutters, false starts, fillers and
 * abandoned sentences are deliberately NOT treated differently from any other word — if it was
 * said, its time span is speech. Only the gaps between tokens are candidate silence. Breaths and
 * incidental noises are not speech by default (in Conservative mode the audio detector still
 * protects anything loud enough to matter).
 */
export function detectTranscriptSpeech(
	words: readonly TranscriptWord[],
	params: TranscriptDetectorParams
): Range[] {
	const spans: Range[] = [];
	for (const w of words) {
		if (w.kind === 'event' && !params.eventsAreSpeech) continue;
		if (w.kind === 'breath' && !params.breathsAreSpeech) continue;
		if (!(w.end > w.start)) continue;
		spans.push({ start: w.start, end: w.end });
	}
	return normalize(spans);
}
