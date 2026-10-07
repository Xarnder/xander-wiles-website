import { intersect, invert, normalize, subtract, union } from './ranges';
import type { CutMode, CutParams, Range } from './types';

/** Inputs to the cut proposal. Both analyses stay separate; this module only combines them. */
export interface DetectionInput {
	duration: number;
	/** Analysis A speech regions, or null if audio analysis has not run. */
	audioSpeech: readonly Range[] | null;
	/** Analysis B speech regions, or null if no transcript exists yet. */
	transcriptSpeech: readonly Range[] | null;
}

export interface AutoCut extends Range {
	/** Which detectors consider this span silent. */
	source: 'audio' | 'transcript' | 'both';
	confidence: number;
}

export interface CutProposal {
	/** The mode actually used (falls back to `audio` when no transcript is available). */
	effectiveMode: CutMode;
	audioSilence: Range[] | null;
	transcriptSilence: Range[] | null;
	/** Silence according to the effective mode, before min-duration filtering and padding. */
	combinedSilence: Range[];
	/** Silence long enough to cut, before padding. */
	eligibleSilence: Range[];
	/** Final automatic cuts after lead/trail padding, split by detector agreement. */
	cuts: AutoCut[];
}

export const DEFAULT_CUT_PARAMS: CutParams = {
	mode: 'conservative',
	leadMs: 150,
	trailMs: 250,
	minSilenceMs: 500
};

/** Cuts shorter than this after padding are not worth a jump cut. */
export const MIN_CUT_SECONDS = 0.02;

export const CUT_MODE_INFO: Record<CutMode, { label: string; description: string }> = {
	conservative: {
		label: 'Conservative',
		description:
			'Cut only where BOTH the audio level and the transcript agree there is silence. Safest: speech that either detector hears is kept.'
	},
	audio: {
		label: 'Audio',
		description:
			'Cut based on the audio level alone. Ignores the transcript; quiet speech below the threshold can be cut.'
	},
	transcript: {
		label: 'Transcript',
		description:
			'Cut the gaps between spoken words. Ignores the audio level; breaths, noises and anything the model missed can be cut.'
	},
	aggressive: {
		label: 'Aggressive',
		description:
			'Cut where EITHER detector thinks it is silent. Removes the most, with the highest risk of clipping speech.'
	}
};

export function resolveMode(mode: CutMode, hasTranscript: boolean, hasAudio: boolean): CutMode {
	if (!hasTranscript) return 'audio';
	if (!hasAudio) return 'transcript';
	return mode;
}

/**
 * raw analysis → combined silence → eligible silence (min duration) → padded cuts.
 *
 * Padding shrinks each silence: `trail` is kept after the speech that precedes it and `lead`
 * before the speech that follows. Silence at the very start/end of the media has no speech on
 * that side, so it is not padded there.
 */
export function proposeCuts(input: DetectionInput, params: CutParams): CutProposal {
	const { duration } = input;
	const audioSilence = input.audioSpeech ? invert(normalize(input.audioSpeech), 0, duration) : null;
	const transcriptSilence = input.transcriptSpeech
		? invert(normalize(input.transcriptSpeech), 0, duration)
		: null;
	const effectiveMode = resolveMode(params.mode, !!transcriptSilence, !!audioSilence);

	let combinedSilence: Range[];
	switch (effectiveMode) {
		case 'audio':
			combinedSilence = audioSilence ?? [];
			break;
		case 'transcript':
			combinedSilence = transcriptSilence ?? [];
			break;
		case 'conservative':
			combinedSilence = intersect(audioSilence ?? [], transcriptSilence ?? []);
			break;
		case 'aggressive':
			combinedSilence = union(audioSilence ?? [], transcriptSilence ?? []);
			break;
	}

	const minSilence = params.minSilenceMs / 1000;
	const eligibleSilence = combinedSilence.filter((s) => s.end - s.start >= minSilence - 1e-9);

	const lead = Math.max(0, params.leadMs / 1000);
	const trail = Math.max(0, params.trailMs / 1000);
	const padded: Range[] = [];
	for (const s of eligibleSilence) {
		const start = s.start <= 1e-9 ? 0 : s.start + trail;
		const end = s.end >= duration - 1e-9 ? duration : s.end - lead;
		if (end - start >= MIN_CUT_SECONDS) padded.push({ start, end });
	}

	const cuts: AutoCut[] = [];
	for (const cut of padded) {
		cuts.push(...attributeSources(cut, audioSilence, transcriptSilence));
	}

	return {
		effectiveMode,
		audioSilence,
		transcriptSilence,
		combinedSilence,
		eligibleSilence,
		cuts
	};
}

/** Split a cut into pieces labelled by which detectors consider each piece silent. */
function attributeSources(
	cut: Range,
	audioSilence: Range[] | null,
	transcriptSilence: Range[] | null
): AutoCut[] {
	const piece = [cut];
	const a = audioSilence ? intersect(piece, audioSilence) : [];
	const t = transcriptSilence ? intersect(piece, transcriptSilence) : [];
	const both = intersect(a, t);
	const labelled: AutoCut[] = [
		...both.map((r) => ({ ...r, source: 'both' as const, confidence: 1 })),
		...subtract(a, both).map((r) => ({ ...r, source: 'audio' as const, confidence: 0.5 })),
		...subtract(t, both).map((r) => ({ ...r, source: 'transcript' as const, confidence: 0.5 }))
	];
	// Padding never extends a cut beyond detected silence, so the pieces cover the cut. Guard
	// against float dust by falling back to a single piece.
	if (labelled.length === 0) {
		return [{ ...cut, source: audioSilence ? 'audio' : 'transcript', confidence: 0.5 }];
	}
	labelled.sort((x, y) => x.start - y.start);
	return labelled;
}
