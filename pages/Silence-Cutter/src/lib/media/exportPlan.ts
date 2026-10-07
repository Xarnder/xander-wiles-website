import type { Range, TransitionParams } from '../core/types';

export const DEFAULT_TRANSITIONS: TransitionParams = {
	fadeInMs: 12,
	fadeOutMs: 20,
	crossfadeMs: 0
};

/** One kept source range and how its audio is rendered into the output timeline. */
export interface AudioSegmentPlan {
	/** Kept source range (frame-quantised). */
	start: number;
	end: number;
	/** Edited-timeline position of `start`. */
	outStart: number;
	/** Crossfade handle (seconds) borrowed before `start` / after `end`. */
	handleBefore: number;
	handleAfter: number;
	/** Fade (seconds) at the hard edges; 0 where a crossfade is used or at untouched media edges. */
	fadeIn: number;
	fadeOut: number;
}

/**
 * Plan audio rendering for the export / preview.
 *
 * Every join between two kept ranges is an edit boundary. With a crossfade, each side borrows a
 * handle of half the crossfade from the removed material (capped so the handles never reach
 * into the other kept range), and the two overlap symmetrically around the join — so the output
 * duration, and therefore A/V sync, is unchanged. Without a crossfade, a short fade-out/fade-in
 * at the join removes clicks. Kept ranges that touch the media start/end are not faded there.
 */
export function planAudioSegments(
	keeps: readonly Range[],
	duration: number,
	t: TransitionParams
): AudioSegmentPlan[] {
	const plans: AudioSegmentPlan[] = [];
	const half = Math.max(0, t.crossfadeMs) / 2000;
	let out = 0;
	for (let i = 0; i < keeps.length; i++) {
		const k = keeps[i];
		const len = k.end - k.start;
		const prev = keeps[i - 1];
		const next = keeps[i + 1];
		const isCutBefore = k.start > 1e-6;
		const isCutAfter = k.end < duration - 1e-6;
		const gapBefore = prev ? k.start - prev.end : k.start;
		const gapAfter = next ? next.start - k.end : duration - k.end;
		// Crossfades only happen between two kept segments; outer edges get plain fades.
		const handleBefore = prev && half > 0 ? Math.min(half, gapBefore / 2, len / 2) : 0;
		const handleAfter = next && half > 0 ? Math.min(half, gapAfter / 2, len / 2) : 0;
		plans.push({
			start: k.start,
			end: k.end,
			outStart: out,
			handleBefore,
			handleAfter,
			fadeIn: isCutBefore && handleBefore === 0 ? Math.min(t.fadeInMs / 1000, len / 2) : 0,
			fadeOut: isCutAfter && handleAfter === 0 ? Math.min(t.fadeOutMs / 1000, len / 2) : 0
		});
		out += len;
	}
	// Make crossfade handles symmetric at each join.
	for (let i = 0; i + 1 < plans.length; i++) {
		const h = Math.min(plans[i].handleAfter, plans[i + 1].handleBefore);
		plans[i].handleAfter = h;
		plans[i + 1].handleBefore = h;
	}
	return plans;
}

/**
 * Gain for a segment at source time `t`. Crossfades are equal-power (sin/cos) so loudness is
 * constant through the join; edge fades are raised-cosine.
 */
export function segmentGain(p: AudioSegmentPlan, t: number): number {
	let g = 1;
	if (p.handleBefore > 0) {
		const a = p.start - p.handleBefore;
		const x = (t - a) / (2 * p.handleBefore);
		if (x < 1) g *= Math.sin((Math.PI / 2) * Math.max(0, x));
	} else if (p.fadeIn > 0) {
		const x = (t - p.start) / p.fadeIn;
		if (x < 1) g *= 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, x));
	}
	if (p.handleAfter > 0) {
		const b = p.end + p.handleAfter;
		const x = (b - t) / (2 * p.handleAfter);
		if (x < 1) g *= Math.sin((Math.PI / 2) * Math.max(0, x));
	} else if (p.fadeOut > 0) {
		const x = (p.end - t) / p.fadeOut;
		if (x < 1) g *= 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, x));
	}
	return g;
}

/**
 * Overlap-add mixer on an integer output-frame timeline. Segments add planar blocks at absolute
 * output frames (overlapping only inside crossfades); `flushUntil` releases finished frames in
 * order. Memory is bounded by the crossfade length plus one block.
 */
export class JoinMixer {
	private planes: Float32Array[];
	private start = 0; // output frame of planes[*][0]
	private length = 0;

	constructor(readonly channels: number) {
		this.planes = Array.from({ length: channels }, () => new Float32Array(8192));
	}

	get pendingFrom(): number {
		return this.start;
	}

	add(outFrame: number, block: Float32Array[], frames: number): void {
		if (frames <= 0) return;
		let offset = outFrame - this.start;
		let srcOffset = 0;
		if (offset < 0) {
			// Frames before the flushed boundary can no longer be mixed; drop them (never happens
			// when callers flush only up to the next segment's start).
			srcOffset = -offset;
			offset = 0;
			if (srcOffset >= frames) return;
		}
		const needed = offset + frames - srcOffset;
		if (needed > this.planes[0].length) {
			this.planes = this.planes.map((p) => {
				const next = new Float32Array(Math.max(needed, p.length * 2));
				next.set(p.subarray(0, this.length));
				return next;
			});
		}
		if (offset > this.length) {
			for (const p of this.planes) p.fill(0, this.length, offset);
		}
		for (let c = 0; c < this.channels; c++) {
			const dst = this.planes[c];
			const src = block[Math.min(c, block.length - 1)];
			const overlapEnd = Math.min(this.length, needed);
			for (let i = offset; i < needed; i++) {
				const v = src[srcOffset + i - offset];
				dst[i] = i < overlapEnd ? dst[i] + v : v;
			}
		}
		this.length = Math.max(this.length, needed);
	}

	/** Remove and return frames before `frame` as planar copies. */
	flushUntil(frame: number): { startFrame: number; planes: Float32Array[]; frames: number } | null {
		const n = Math.min(this.length, Math.max(0, frame - this.start));
		if (n <= 0) return null;
		const out = this.planes.map((p) => p.slice(0, n));
		for (const p of this.planes) p.copyWithin(0, n, this.length);
		const startFrame = this.start;
		this.start += n;
		this.length -= n;
		return { startFrame, planes: out, frames: n };
	}

	flushAll() {
		return this.flushUntil(this.start + this.length);
	}
}

export type ExportQuality = 'source' | 'smaller' | 'high';

export const EXPORT_QUALITY_INFO: Record<ExportQuality, { label: string; description: string }> = {
	source: { label: 'Match source (recommended)', description: 'Similar bitrate to the original.' },
	smaller: { label: 'Smaller file', description: 'About 60% of the source bitrate.' },
	high: { label: 'High quality', description: 'About 150% of the source bitrate.' }
};

/** Pick encoder bitrates for a quality preset. */
export function exportBitrates(
	quality: ExportQuality,
	source: {
		videoBitrate: number | null;
		audioBitrate: number | null;
		width: number;
		height: number;
		fps: number;
	}
): { video: number; audio: number } {
	const pixels = Math.max(1, source.width * source.height);
	// Fallback heuristic when the source bitrate is unknown: ~0.1 bits per pixel per frame.
	const estimated = pixels * Math.max(24, source.fps || 30) * 0.1;
	const base = source.videoBitrate && source.videoBitrate > 0 ? source.videoBitrate : estimated;
	const factor = quality === 'smaller' ? 0.6 : quality === 'high' ? 1.5 : 1;
	const video = Math.round(Math.min(80e6, Math.max(500e3, base * factor)));
	const srcAudio = source.audioBitrate && source.audioBitrate > 0 ? source.audioBitrate : 160e3;
	const audio =
		quality === 'smaller'
			? 96e3
			: quality === 'high'
				? Math.max(256e3, Math.min(320e3, srcAudio))
				: Math.min(320e3, Math.max(128e3, srcAudio));
	// WebCodecs requires integer bitrates; measured source bitrates are fractional.
	return { video, audio: Math.round(audio) };
}
