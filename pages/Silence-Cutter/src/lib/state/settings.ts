import { DEFAULT_AUDIO_PARAMS } from '../core/audioDetector';
import { DEFAULT_CUT_PARAMS } from '../core/combine';
import { DEFAULT_TRANSCRIPT_PARAMS } from '../core/transcriptDetector';
import type {
	AudioDetectorParams,
	CutParams,
	TranscriptDetectorParams,
	TransitionParams
} from '../core/types';
import { DEFAULT_TRANSITIONS, type ExportQuality } from '../media/exportPlan';

export interface ProjectSettings {
	audio: AudioDetectorParams;
	transcript: TranscriptDetectorParams;
	cut: CutParams;
	transitions: TransitionParams;
	exportQuality: ExportQuality;
	modelId: string;
	language: string;
}

export function defaultSettings(modelId: string): ProjectSettings {
	return {
		audio: { ...DEFAULT_AUDIO_PARAMS },
		transcript: { ...DEFAULT_TRANSCRIPT_PARAMS },
		cut: { ...DEFAULT_CUT_PARAMS },
		transitions: { ...DEFAULT_TRANSITIONS },
		exportQuality: 'source',
		modelId,
		language: 'en'
	};
}

/** Languages offered in the UI (Whisper language codes). */
export const LANGUAGES: Array<[string, string]> = [
	['en', 'English'],
	['de', 'German'],
	['es', 'Spanish'],
	['fr', 'French'],
	['it', 'Italian'],
	['pt', 'Portuguese'],
	['nl', 'Dutch'],
	['pl', 'Polish'],
	['sv', 'Swedish'],
	['da', 'Danish'],
	['no', 'Norwegian'],
	['fi', 'Finnish'],
	['cs', 'Czech'],
	['tr', 'Turkish'],
	['ru', 'Russian'],
	['uk', 'Ukrainian'],
	['ar', 'Arabic'],
	['hi', 'Hindi'],
	['ja', 'Japanese'],
	['ko', 'Korean'],
	['zh', 'Chinese']
];

/** One-click starting points for the cut padding. Detection is unaffected. */
export const CUT_PRESETS: Record<
	'natural' | 'balanced' | 'tight',
	{ label: string; hint: string; leadMs: number; trailMs: number; minSilenceMs: number }
> = {
	natural: {
		label: 'Natural',
		hint: 'Generous breathing room; only long pauses are cut.',
		leadMs: 220,
		trailMs: 350,
		minSilenceMs: 900
	},
	balanced: {
		label: 'Balanced',
		hint: 'Default. Removes dead air while keeping a natural rhythm.',
		leadMs: 150,
		trailMs: 250,
		minSilenceMs: 500
	},
	tight: {
		label: 'Tight',
		hint: 'Fast-paced. Short padding, shorter pauses are cut.',
		leadMs: 90,
		trailMs: 140,
		minSilenceMs: 350
	}
};

export type CutPreset = keyof typeof CUT_PRESETS;

export function matchingPreset(s: ProjectSettings): CutPreset | null {
	for (const [k, p] of Object.entries(CUT_PRESETS) as Array<
		[CutPreset, (typeof CUT_PRESETS)[CutPreset]]
	>) {
		if (
			s.cut.leadMs === p.leadMs &&
			s.cut.trailMs === p.trailMs &&
			s.cut.minSilenceMs === p.minSilenceMs
		) {
			return k;
		}
	}
	return null;
}

const DEFAULTS_KEY = 'silence-cutter:default-settings';

/**
 * The settings a new project starts with: the last settings the user worked with (minus
 * per-recording values like the silence threshold, which is auto-suggested per file).
 */
export function loadUserDefaults(modelId: string, available: readonly string[]): ProjectSettings {
	const base = defaultSettings(modelId);
	try {
		const raw = localStorage.getItem(DEFAULTS_KEY);
		if (!raw) return base;
		const saved = JSON.parse(raw) as Partial<ProjectSettings>;
		const merged: ProjectSettings = {
			audio: { ...base.audio, ...saved.audio, thresholdDb: base.audio.thresholdDb },
			transcript: { ...base.transcript, ...saved.transcript },
			cut: { ...base.cut, ...saved.cut },
			transitions: { ...base.transitions, ...saved.transitions },
			exportQuality: saved.exportQuality ?? base.exportQuality,
			modelId: saved.modelId && available.includes(saved.modelId) ? saved.modelId : base.modelId,
			language: saved.language ?? base.language
		};
		return merged;
	} catch {
		return base;
	}
}

export function saveUserDefaults(s: ProjectSettings) {
	try {
		localStorage.setItem(DEFAULTS_KEY, JSON.stringify(s));
	} catch {
		/* storage unavailable */
	}
}

export function clearUserDefaults() {
	try {
		localStorage.removeItem(DEFAULTS_KEY);
	} catch {
		/* ignore */
	}
}
