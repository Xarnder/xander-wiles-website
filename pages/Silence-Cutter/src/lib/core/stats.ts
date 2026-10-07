import { removedRanges, keptRanges } from './edl';
import { invert, normalize, totalDuration } from './ranges';
import type { EditRegion, Range } from './types';

export interface EditStats {
	originalDuration: number;
	speechDetected: number;
	silenceDetected: number;
	silenceRemoved: number;
	editedDuration: number;
	timeSaved: number;
	cuts: number;
	manualRegions: number;
	transcriptWords: number;
}

/**
 * @param speech Speech regions according to the active detection mode (before padding).
 */
export function computeStats(
	duration: number,
	speech: readonly Range[],
	edl: readonly EditRegion[],
	transcriptWords: number
): EditStats {
	const speechDetected = totalDuration(normalize(speech));
	const removed = removedRanges(edl);
	const silenceRemoved = totalDuration(removed);
	const editedDuration = totalDuration(keptRanges(edl));
	return {
		originalDuration: duration,
		speechDetected,
		silenceDetected: Math.max(0, duration - speechDetected),
		silenceRemoved,
		editedDuration,
		timeSaved: duration - editedDuration,
		cuts: removed.length,
		manualRegions: edl.filter((r) => r.manual).length,
		transcriptWords
	};
}

/** Speech according to a combined silence set. */
export function speechFromSilence(silence: readonly Range[], duration: number): Range[] {
	return invert(normalize(silence), 0, duration);
}

/** m:ss or h:mm:ss */
export function formatDuration(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** m:ss.mmm for precise displays (playhead, boundaries). */
export function formatTimecode(seconds: number): string {
	const sign = seconds < 0 ? '-' : '';
	const t = Math.abs(seconds);
	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	const s = t - h * 3600 - m * 60;
	const ss = s.toFixed(3).padStart(6, '0');
	return h > 0
		? `${sign}${h}:${String(m).padStart(2, '0')}:${ss}`
		: `${sign}${String(m).padStart(2, '0')}:${ss}`;
}
