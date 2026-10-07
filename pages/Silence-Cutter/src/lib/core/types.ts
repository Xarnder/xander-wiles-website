/**
 * Core data model. All times are in seconds on the ORIGINAL (source) media timeline. Nothing in
 * the editor ever rewrites source timestamps; edited-timeline positions are derived on demand via
 * the time map (see timeMap.ts).
 */

/** Half-open interval [start, end) in source seconds. */
export interface Range {
	start: number;
	end: number;
}

export type DetectorId = 'audio' | 'transcript';

/** Where an edit decision came from. */
export type DecisionSource = 'audio' | 'transcript' | 'both' | 'manual' | 'none';

export type EditAction = 'keep' | 'remove';

/**
 * One region of the Edit Decision List. A valid EDL is sorted, non-overlapping and contiguous
 * from 0 to the media duration.
 */
export interface EditRegion extends Range {
	action: EditAction;
	source: DecisionSource;
	/** 0..1, how strongly the automatic detectors agree that this region is silent. */
	confidence: number;
	/** True when a manual override decided this region. */
	manual: boolean;
}

export type CutMode = 'audio' | 'transcript' | 'conservative' | 'aggressive';

/** Parameters for the classic amplitude/envelope detector (Analysis A). */
export interface AudioDetectorParams {
	/** Level (dBFS) at or above which a frame is considered loud enough to open the gate. */
	thresholdDb: number;
	/** The gate closes only when the level drops below `thresholdDb - hysteresisDb`. */
	hysteresisDb: number;
	/** The level must stay above threshold this long before speech is recognised (debounce). */
	attackMs: number;
	/** Hangover: dips shorter than this inside speech never split the speech region. */
	releaseMs: number;
	/** Speech blips shorter than this are discarded (clicks, bumps). */
	minSpeechMs: number;
}

/** Parameters for the transcript/word-gap detector (Analysis B). */
export interface TranscriptDetectorParams {
	/** Treat bracketed vocal events ([laughter], [cough], [sigh], …) as speech. */
	eventsAreSpeech: boolean;
	/** Treat breaths and incidental noises ([breath], [noise], [lipsmack], [sniff]) as speech. */
	breathsAreSpeech: boolean;
}

/** Parameters that turn detected silence into proposed cuts. Live-editable without re-running ASR. */
export interface CutParams {
	mode: CutMode;
	/** Material retained BEFORE speech begins (pre-roll). */
	leadMs: number;
	/** Material retained AFTER speech finishes (post-roll). */
	trailMs: number;
	/** Detected silences shorter than this are never cut. */
	minSilenceMs: number;
}

/** Audio transitions applied at every join of the exported/previewed edit. */
export interface TransitionParams {
	fadeInMs: number;
	fadeOutMs: number;
	/** Centred equal-power crossfade at each join; 0 disables it. Keeps A/V sync. */
	crossfadeMs: number;
}

/**
 * - word: ordinary word (including repeats and restarts)
 * - filler: [UM], [UH], um, uh …
 * - partial: cut-off word (`th-`)
 * - event: vocal event ([laughter], [cough], [sigh] …)
 * - breath: breaths and incidental noise ([breath], [noise], [lipsmack], [sniff])
 */
export type WordKind = 'word' | 'filler' | 'event' | 'partial' | 'breath';

export interface TranscriptWord {
	/** Stable index within the transcript. */
	index: number;
	text: string;
	start: number;
	end: number;
	kind: WordKind;
}

export type TranscriptionMode = 'verbatim' | 'intended' | 'standard';

export interface Transcript {
	engineId: string;
	modelId: string;
	language: string;
	/** `verbatim` only when the model is a genuine verbatim model running in verbatim mode. */
	mode: TranscriptionMode;
	words: TranscriptWord[];
	/** Duration of audio that was transcribed. */
	duration: number;
	createdAt: number;
}

/** Envelope: RMS level in dBFS sampled every `hopSeconds`. */
export interface Envelope {
	hopSeconds: number;
	db: Float32Array;
}

/**
 * A manual override, applied in order on top of the automatic EDL (later overrides win).
 * Overrides live in source time, so they survive any change to the automatic parameters.
 */
export type ManualOverride =
	| { kind: 'paint'; id: number; start: number; end: number; action: EditAction }
	| { kind: 'split'; id: number; at: number };

/** Timeline mouse tool: select segments and ranges, or trim (move cut edges). Never both at once. */
export type EditTool = 'select' | 'trim';
