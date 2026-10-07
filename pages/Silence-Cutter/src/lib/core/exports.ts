/**
 * Side-car exports for the edited video: subtitles (SRT/WebVTT) timed to the EDITED timeline, a
 * plain-text transcript, a JSON edit decision list, and a CMX 3600 EDL for other editors.
 * Words inside removed material are omitted; timings are mapped through the time map so captions
 * line up with the exported video.
 */
import { keptRanges, regionIndexAt } from './edl';
import type { TimeMap } from './timeMap';
import type { EditRegion, Range, TranscriptWord } from './types';

export interface Cue {
	start: number;
	end: number;
	text: string;
}

export interface CueOptions {
	maxChars: number;
	maxDuration: number;
	/** Start a new cue after a pause this long (seconds, source time). */
	breakOnPause: number;
}

const DEFAULT_CUES: CueOptions = { maxChars: 84, maxDuration: 6, breakOnPause: 0.8 };

function isKept(edl: readonly EditRegion[], w: TranscriptWord): boolean {
	const mid = (w.start + w.end) / 2;
	const r = edl[regionIndexAt(edl, mid)];
	return !r || r.action === 'keep';
}

/**
 * Group retained words into caption cues on the edited timeline. A cue never spans a cut, so
 * captions never show words from both sides of a jump.
 */
export function buildCues(
	words: readonly TranscriptWord[],
	edl: readonly EditRegion[],
	map: TimeMap,
	opts: Partial<CueOptions> = {}
): Cue[] {
	const o = { ...DEFAULT_CUES, ...opts };
	const cues: Cue[] = [];
	let cur: { words: TranscriptWord[]; start: number; end: number } | null = null;
	let prev: TranscriptWord | null = null;
	const flush = () => {
		if (cur && cur.words.length) {
			cues.push({
				start: cur.start,
				end: Math.max(cur.end, cur.start + 0.2),
				text: cur.words.map((w) => w.text).join(' ')
			});
		}
		cur = null;
	};
	for (const w of words) {
		if (w.kind === 'breath') continue;
		if (!isKept(edl, w)) {
			flush();
			prev = null;
			continue;
		}
		const start = map.sourceToEdited(w.start);
		const end = map.sourceToEdited(w.end);
		// Removed material between two words shrinks their gap on the edited timeline.
		const crossesCut =
			prev !== null && start - map.sourceToEdited(prev.end) < w.start - prev.end - 0.01;
		const pause = prev !== null && w.start - prev.end >= o.breakOnPause;
		const text = cur ? `${cur.words.map((x) => x.text).join(' ')} ${w.text}` : w.text;
		if (cur && (crossesCut || pause || text.length > o.maxChars || end - cur.start > o.maxDuration))
			flush();
		if (!cur) cur = { words: [], start, end };
		cur.words.push(w);
		cur.end = end;
		prev = w;
	}
	flush();
	return cues;
}

function stamp(seconds: number, sep: ',' | '.'): string {
	const ms = Math.max(0, Math.round(seconds * 1000));
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	const s = Math.floor((ms % 60_000) / 1000);
	const r = ms % 1000;
	const p = (n: number, w = 2) => String(n).padStart(w, '0');
	return `${p(h)}:${p(m)}:${p(s)}${sep}${p(r, 3)}`;
}

export function toSrt(cues: readonly Cue[]): string {
	return cues
		.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`)
		.join('\n');
}

export function toVtt(cues: readonly Cue[]): string {
	return `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n')}`;
}

/** Plain transcript of what remains in the edit, one paragraph per pause > 1.2 s. */
export function toTranscriptText(
	words: readonly TranscriptWord[],
	edl: readonly EditRegion[]
): string {
	const paras: string[][] = [];
	let cur: string[] = [];
	let prevEnd = -Infinity;
	for (const w of words) {
		if (!isKept(edl, w)) continue;
		if (cur.length && w.start - prevEnd > 1.2) {
			paras.push(cur);
			cur = [];
		}
		cur.push(w.text);
		prevEnd = w.end;
	}
	if (cur.length) paras.push(cur);
	return paras.map((p) => p.join(' ')).join('\n\n') + '\n';
}

/** Machine-readable edit decision list (source times in seconds). */
export function toEdlJson(
	edl: readonly EditRegion[],
	meta: { file: string; duration: number; frameRate: number | null }
): string {
	const keeps = keptRanges(edl);
	return JSON.stringify(
		{
			generator: 'Silence Cutter',
			source: meta.file,
			durationSeconds: meta.duration,
			frameRate: meta.frameRate,
			editedSeconds: keeps.reduce((a, k) => a + k.end - k.start, 0),
			keep: keeps,
			regions: edl.map((r) => ({
				start: r.start,
				end: r.end,
				action: r.action,
				source: r.source,
				manual: r.manual
			}))
		},
		null,
		2
	);
}

/** Non-drop-frame SMPTE timecode at an integer timebase. */
function timecode(frames: number, fps: number): string {
	const p = (n: number) => String(n).padStart(2, '0');
	const f = frames % fps;
	const totalSeconds = Math.floor(frames / fps);
	return `${p(Math.floor(totalSeconds / 3600))}:${p(Math.floor(totalSeconds / 60) % 60)}:${p(totalSeconds % 60)}:${p(f)}`;
}

/**
 * CMX 3600 EDL: one cut event per kept range, so the edit can be rebuilt (and refined) in
 * Premiere Pro, DaVinci Resolve, Final Cut (via conversion) etc. Uses non-drop-frame timecode at
 * the rounded frame rate; frame counts are exact, so NLEs line events up frame-accurately.
 */
export function toCmx3600(
	keeps: readonly Range[],
	frameRate: number,
	clipName: string,
	title = 'SILENCE CUTTER'
): string {
	const fps = Math.max(1, Math.round(frameRate || 30));
	const toFrames = (t: number) => Math.round(t * (frameRate || fps));
	const lines = [`TITLE: ${title}`, 'FCM: NON-DROP FRAME', ''];
	let rec = 0;
	keeps.forEach((k, i) => {
		const a = toFrames(k.start);
		const b = toFrames(k.end);
		if (b <= a) return;
		const n = String(i + 1).padStart(3, '0');
		lines.push(
			`${n}  AX       AA/V  C        ${timecode(a, fps)} ${timecode(b, fps)} ${timecode(rec, fps)} ${timecode(rec + b - a, fps)}`,
			`* FROM CLIP NAME: ${clipName}`,
			''
		);
		rec += b - a;
	});
	return lines.join('\n');
}

/** Download text as a file (UTF-8). */
export function downloadText(text: string, filename: string, type = 'text/plain') {
	const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
