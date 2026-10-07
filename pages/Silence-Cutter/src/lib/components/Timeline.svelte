<script lang="ts" module>
	import type { Range } from '../core/types';

	/** Everything the timeline can ask the editor to do. */
	export interface TimelineActions {
		seek(t: number): void;
		select(r: Range | null): void;
		clickSegment(t: number, extend: boolean): 'restored' | 'selected' | null;
		selectSegmentAt(t: number, extend: boolean): void;
		removeSelection(): void;
		restoreSelection(): void;
		split(t: number): void;
		playSelection(): void;
		dragBoundary(leftIndex: number, from: number, to: number): void;
		selectWord(i: number, extend: boolean): void;
		selectWordRange(a: number, b: number): void;
		threshold(db: number): void;
	}
</script>

<script lang="ts">
	/**
	 * Zoomable timeline editor. Everything is drawn on canvas and only for the visible time range,
	 * so the cost depends on the viewport, not on the recording length. A second canvas holds the
	 * playhead and drag feedback so 60 fps playhead updates never redraw the waveform.
	 *
	 * Lanes (top → bottom): ruler · segment strip · waveform + envelope · audio detector ·
	 * transcript detector · words; the zoom scrollbar (navigator) sits underneath.
	 *
	 * Viewport state is exactly one thing: the visible source range [viewStart, viewEnd] in seconds.
	 * Pixels-per-second is derived from it and the canvas width, every viewport change goes through
	 * setView(), and the scrollbar is a controlled view of the same range.
	 */
	import { onMount, untrack } from 'svelte';
	import { boundaryNear } from '../core/editOps';
	import { firstEndingAfter } from '../core/ranges';
	import {
		extendSelection,
		formatSpan,
		MIN_SELECTION,
		snapCandidates,
		snapTime
	} from '../core/selection';
	import { formatTimecode } from '../core/stats';
	import type { EditRegion, EditTool, Envelope, TranscriptWord } from '../core/types';
	import { pickLevel, type PeakLevel } from '../media/peaks';
	import ZoomScrollbar from './ZoomScrollbar.svelte';
	import {
		cutColor,
		DETAIL_TEXT,
		LEGEND,
		segmentDetail,
		type ColoredRun,
		type SegmentColor
	} from '../core/agreement';

	interface Props {
		duration: number;
		peaks: PeakLevel[] | null;
		envelope: Envelope | null;
		thresholdDb: number;
		audioSpeech: Range[] | null;
		transcriptSpeech: Range[] | null;
		combinedSilence: Range[];
		edl: EditRegion[];
		/** User-visible segments (see buildSegments): what the strip draws and clicks act on. */
		segments: EditRegion[];
		words: TranscriptWord[];
		playhead: number;
		selection: Range | null;
		focusedWord: number | null;
		following: boolean;
		snapping: boolean;
		/** Mouse tool: 'select' picks segments and ranges; 'trim' only moves cut edges. */
		tool: EditTool;
		actions: TimelineActions;
	}

	let {
		duration,
		peaks,
		envelope,
		thresholdDb,
		audioSpeech,
		transcriptSpeech,
		combinedSilence,
		edl,
		segments,
		words,
		playhead,
		selection,
		focusedWord,
		following,
		snapping,
		tool,
		actions
	}: Props = $props();

	const RULER = 22;
	/** Large segments (what a click selects as a whole). */
	const STRIP = 26;
	/** Detail track: the same timeline split by detector agreement; each piece is selectable. */
	const DETAIL = 18;
	const LANE = 14;
	const WORDS = 30;
	const DB_MIN = -80;
	const EDGE_PX = 6;
	/** Segments narrower than this on screen also catch clicks up to PICK_PX either side. */
	const NARROW_PX = 14;
	const PICK_PX = 6;
	/** In trim mode the nearest cut edge within this distance is grabbed. */
	const TRIM_PX = 24;

	let host: HTMLDivElement;
	let base: HTMLCanvasElement;
	let overlay: HTMLCanvasElement;
	let width = $state(800);
	let height = $state(260);
	let wrap: HTMLDivElement;
	let viewStart = $state(0);
	let viewEnd = $state(1);
	let hover = $state<{ x: number; y: number; t: number } | null>(null);
	let snapLine = $state<number | null>(null);
	let menu = $state<{ x: number; y: number; t: number } | null>(null);
	let drag = $state<
		| {
				kind: 'boundary';
				leftIndex: number;
				from: number;
				to: number;
				/** Where the pointer went down, so a click without movement just moves the playhead. */
				x0: number;
		  }
		| { kind: 'select'; anchor: number; current: number; moved: boolean }
		| { kind: 'edge'; fixed: number; current: number }
		| { kind: 'words'; anchor: number }
		| { kind: 'scrub' }
		| { kind: 'threshold' }
		| null
	>(null);
	let lastStripClick = { at: 0, start: -1, result: '' as string | null };

	const stripTop = RULER;
	const detailTop = RULER + STRIP;
	const waveTop = RULER + STRIP + DETAIL;
	const waveHeight = $derived(Math.max(60, height - waveTop - 2 * LANE - WORDS));
	const audioTop = $derived(waveTop + waveHeight);
	const txTop = $derived(audioTop + LANE);
	const wordsTop = $derived(txTop + LANE);
	/** Bottom of the content lanes. */
	const overviewTop = $derived(wordsTop + WORDS);

	const maxPxPerSec = 4000;
	const viewSpan = $derived(Math.max(1e-9, viewEnd - viewStart));
	const pxPerSec = $derived(width / viewSpan);
	/** Narrowest visible span (maximum zoom), and widest (the whole recording). */
	const minSpan = $derived(duration > 0 ? Math.min(duration, width / maxPxPerSec) : 1);

	/** The only way the viewport changes: clamp the span, then slide it inside [0, duration]. */
	function setView(start: number, end: number) {
		if (!(duration > 0) || !Number.isFinite(start) || !Number.isFinite(end)) return;
		const span = Math.min(duration, Math.max(minSpan, end - start));
		const s0 = Math.max(0, Math.min(start, duration - span));
		viewStart = s0;
		viewEnd = s0 + span;
	}

	export function fit() {
		setView(0, duration);
	}

	export function zoomBy(factor: number, anchorTime = playhead) {
		const span = viewSpan / factor;
		const s0 = anchorTime - ((anchorTime - viewStart) / viewSpan) * span;
		setView(s0, s0 + span);
	}

	/** Zoom so `r` fills most of the view (with a little context either side). */
	export function zoomTo(r: Range) {
		const len = Math.max(0.05, r.end - r.start);
		const span = len / 0.8;
		const s0 = r.start - (span - len) / 2;
		setView(s0, s0 + span);
	}

	export function reveal(t: number, page = false) {
		const margin = 20 / pxPerSec;
		if (t < viewStart + margin || t > viewEnd - margin) {
			const s0 = page ? t - viewSpan * 0.1 : t - viewSpan / 2;
			setView(s0, s0 + viewSpan);
		}
	}

	function panBy(seconds: number) {
		setView(viewStart + seconds, viewEnd + seconds);
	}

	const xOf = (t: number) => (t - viewStart) * pxPerSec;
	const tOf = (x: number) => viewStart + x / pxPerSec;
	const clampT = (t: number) => Math.max(0, Math.min(duration, t));
	const dbToY = (db: number) =>
		waveTop + waveHeight - ((Math.max(DB_MIN, Math.min(0, db)) - DB_MIN) / -DB_MIN) * waveHeight;
	const yToDb = (y: number) => DB_MIN + ((waveTop + waveHeight - y) / waveHeight) * -DB_MIN;

	onMount(() => {
		// Resizing changes only the pixel scale; the visible time range stays the same.
		const ro = new ResizeObserver(() => {
			const r = wrap.getBoundingClientRect();
			width = Math.max(100, r.width);
			height = Math.max(180, r.height);
		});
		ro.observe(wrap);
		const closeMenu = (e: Event) => {
			if (menu && !(e.target as Element)?.closest?.('.menu')) menu = null;
		};
		const escMenu = (e: KeyboardEvent) => {
			if (menu && e.key === 'Escape') {
				menu = null;
				e.stopPropagation();
			}
		};
		window.addEventListener('pointerdown', closeMenu, true);
		window.addEventListener('keydown', escMenu, true);
		return () => {
			ro.disconnect();
			window.removeEventListener('pointerdown', closeMenu, true);
			window.removeEventListener('keydown', escMenu, true);
		};
	});

	// Fit the whole recording whenever a new one is loaded.
	$effect(() => {
		if (duration > 0) untrack(() => setView(0, duration));
	});

	// Follow the playhead while playing (page-flip style, so the view does not jitter).
	$effect(() => {
		if (following && (playhead < viewStart || playhead > viewEnd - 4 / pxPerSec)) {
			const s0 = playhead - viewSpan * 0.05;
			untrack(() => setView(s0, s0 + viewSpan));
		}
	});

	function css(name: string) {
		return getComputedStyle(host).getPropertyValue(name).trim() || '#888';
	}

	/** Hatch patterns by colour (a plain cache; drawing is not reactive to it). */
	const hatches: Record<string, CanvasPattern | null> = {};
	function hatchOf(ctx: CanvasRenderingContext2D, color: string) {
		if (!(color in hatches)) hatches[color] = makeHatch(ctx, color);
		return hatches[color] ?? color;
	}
	function makeHatch(ctx: CanvasRenderingContext2D, color: string) {
		const c = document.createElement('canvas');
		c.width = c.height = 8 * devicePixelRatio;
		const g = c.getContext('2d')!;
		g.scale(devicePixelRatio, devicePixelRatio);
		g.strokeStyle = color;
		g.lineWidth = 2;
		g.beginPath();
		g.moveTo(-2, 10);
		g.lineTo(10, -2);
		g.moveTo(-2, 2);
		g.lineTo(2, -2);
		g.moveTo(6, 10);
		g.lineTo(10, 6);
		g.stroke();
		const p = ctx.createPattern(c, 'repeat');
		p?.setTransform(new DOMMatrix().scale(1 / devicePixelRatio));
		return p;
	}

	function niceStep(minSeconds: number): number {
		const steps = [
			0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600
		];
		return steps.find((s) => s >= minSeconds) ?? 3600;
	}

	function roundRect(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		r: number
	) {
		const rr = Math.max(0, Math.min(r, w / 2, h / 2));
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, rr);
	}

	function drawBase() {
		if (!base) return;
		const dpr = devicePixelRatio;
		base.width = Math.round(width * dpr);
		base.height = Math.round(height * dpr);
		const ctx = base.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		// Colour coding (see core/agreement.ts and the legend under the timeline).
		const pal: Record<SegmentColor, string> = {
			speech: css('--keep'),
			'kept-audio-silent': css('--keep'),
			'kept-transcript-silent': css('--keep'),
			'kept-pause': css('--seg-pause'),
			'cut-both': css('--remove'),
			'cut-audio': css('--seg-cut-audio'),
			'cut-transcript': css('--seg-cut-transcript'),
			'cut-manual': css('--manual')
		};

		const panel = css('--panel');
		const panel2 = css('--panel-2');
		const border = css('--border');
		const dim = css('--text-dim');
		const faint = css('--text-faint');
		const accent = css('--accent');

		// Lane backgrounds
		ctx.fillStyle = panel2;
		ctx.fillRect(0, 0, width, RULER);
		ctx.fillStyle = panel;
		ctx.fillRect(0, RULER, width, height - RULER);
		ctx.strokeStyle = border;
		ctx.lineWidth = 1;
		for (const y of [RULER, waveTop, audioTop, txTop, wordsTop]) {
			ctx.beginPath();
			ctx.moveTo(0, y + 0.5);
			ctx.lineTo(width, y + 0.5);
			ctx.stroke();
		}

		// Ruler
		const step = niceStep(80 / pxPerSec);
		ctx.fillStyle = dim;
		ctx.strokeStyle = border;
		ctx.font = '10px ui-monospace, monospace';
		for (let t = Math.floor(viewStart / step) * step; t <= viewEnd; t += step) {
			const x = Math.round(xOf(t)) + 0.5;
			ctx.beginPath();
			ctx.moveTo(x, RULER - 8);
			ctx.lineTo(x, RULER);
			ctx.stroke();
			const label =
				step < 1 ? formatTimecode(t).replace(/^00:/, '') : formatTimecode(t).replace(/\.\d+$/, '');
			ctx.fillText(label, x + 3, 12);
		}

		// Waveform
		if (peaks && peaks.length) {
			const level = pickLevel(peaks, 1 / pxPerSec);
			const data = level.data;
			const buckets = data.length / 2;
			const mid = waveTop + waveHeight / 2;
			const amp = waveHeight / 2 - 2;
			ctx.fillStyle = css('--wave');
			for (let px = 0; px < width; px++) {
				const a = Math.floor(tOf(px) / level.bucketSeconds);
				const b = Math.max(a + 1, Math.floor(tOf(px + 1) / level.bucketSeconds));
				if (a >= buckets) break;
				if (b <= 0) continue;
				let lo = 0;
				let hi = 0;
				for (let i = Math.max(0, a); i < Math.min(buckets, b); i++) {
					if (data[i * 2] < lo) lo = data[i * 2];
					if (data[i * 2 + 1] > hi) hi = data[i * 2 + 1];
				}
				const y0 = mid - (hi / 127) * amp;
				const y1 = mid - (lo / 127) * amp;
				ctx.fillRect(px, y0, 1, Math.max(1, y1 - y0));
			}
		}

		// Envelope (dBFS) and threshold
		if (envelope) {
			const { db, hopSeconds } = envelope;
			ctx.strokeStyle = css('--envelope');
			ctx.lineWidth = 1.25;
			ctx.beginPath();
			const framesPerPx = 1 / (pxPerSec * hopSeconds);
			if (framesPerPx <= 1) {
				const i0 = Math.max(0, Math.floor(viewStart / hopSeconds));
				const i1 = Math.min(db.length - 1, Math.ceil(viewEnd / hopSeconds));
				for (let i = i0; i <= i1; i++) {
					const x = xOf((i + 0.5) * hopSeconds);
					const y = dbToY(db[i]);
					if (i === i0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
			} else {
				for (let px = 0; px < width; px++) {
					const a = Math.floor(tOf(px) / hopSeconds);
					const b = Math.min(db.length, Math.max(a + 1, Math.floor(tOf(px + 1) / hopSeconds)));
					if (a >= db.length) break;
					let max = -Infinity;
					for (let i = Math.max(0, a); i < b; i++) if (db[i] > max) max = db[i];
					const y = dbToY(max);
					if (px === 0) ctx.moveTo(px, y);
					else ctx.lineTo(px, y);
				}
			}
			ctx.stroke();
			ctx.lineWidth = 1;
			const ty = Math.round(dbToY(thresholdDb)) + 0.5;
			ctx.strokeStyle = css('--threshold');
			ctx.setLineDash([6, 4]);
			ctx.beginPath();
			ctx.moveTo(0, ty);
			ctx.lineTo(width, ty);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = css('--threshold');
			ctx.font = '10px ui-monospace, monospace';
			ctx.fillText(`${thresholdDb} dB`, 6, ty - 4);
		}

		// Detector lanes (kept separate even after combination)
		const lane = (ranges: Range[] | null, top: number, color: string) => {
			if (!ranges) return;
			ctx.fillStyle = color;
			for (let i = firstEndingAfter(ranges, viewStart); i < ranges.length; i++) {
				const r = ranges[i];
				if (r.start > viewEnd) break;
				const x0 = xOf(r.start);
				ctx.fillRect(x0, top + 4, Math.max(1, xOf(r.end) - x0), LANE - 8);
			}
		};
		// Each detector in its own colour: blue = noise level, purple = transcript.
		lane(audioSpeech, audioTop, pal['cut-audio']);
		lane(transcriptSpeech, txTop, pal['cut-transcript']);

		// Words
		if (words.length) {
			const kindColor: Record<string, string> = {
				word: css('--panel-3'),
				filler: css('--filler'),
				partial: css('--partial'),
				event: css('--event'),
				breath: css('--breath')
			};
			ctx.font = '11px ui-sans-serif, system-ui';
			ctx.textBaseline = 'middle';
			for (let i = lowerBoundWords(viewStart); i < words.length; i++) {
				const w = words[i];
				if (w.start > viewEnd) break;
				const x0 = xOf(w.start);
				const bw = Math.max(1, xOf(w.end) - x0 - 1);
				ctx.globalAlpha = w.kind === 'word' ? 1 : 0.85;
				ctx.fillStyle = kindColor[w.kind] ?? kindColor.word;
				roundRect(ctx, x0, wordsTop + 4, bw, WORDS - 8, 3);
				ctx.fill();
				ctx.globalAlpha = 1;
				if (bw > 18) {
					ctx.save();
					ctx.beginPath();
					ctx.rect(x0 + 2, wordsTop, bw - 4, WORDS);
					ctx.clip();
					ctx.fillStyle = w.kind === 'word' ? css('--text') : '#111';
					ctx.fillText(w.text, x0 + 3, wordsTop + WORDS / 2);
					ctx.restore();
				}
			}
			ctx.textBaseline = 'alphabetic';
		}

		// Removed material: hatched across every content lane.
		for (let i = firstEndingAfter(edl, viewStart); i < edl.length; i++) {
			const r = edl[i];
			if (r.start > viewEnd) break;
			if (r.action !== 'remove') continue;
			const x0 = xOf(r.start);
			const w = Math.max(1, xOf(r.end) - x0);
			const color = pal[cutColor(r)];
			ctx.globalAlpha = 0.16;
			ctx.fillStyle = color;
			ctx.fillRect(x0, waveTop, w, overviewTop - waveTop);
			ctx.globalAlpha = 1;
			ctx.fillStyle = hatchOf(ctx, color);
			ctx.fillRect(x0, waveTop, w, overviewTop - waveTop);
		}

		// Segment strip: every segment is a block you can click, coloured by who wants what:
		// green = both detectors hear speech, red = both say silence, blue (striped) = only the
		// noise level, purple = only the transcript, yellow = your edits.
		ctx.font = '600 10px ui-sans-serif, system-ui';
		ctx.textBaseline = 'middle';
		const fillRun = (color: SegmentColor, a: number, b: number, y: number, h: number) => {
			const rx0 = xOf(a);
			const rw = Math.max(0.5, xOf(b) - rx0);
			const c = pal[color];
			if (color === 'cut-audio') {
				ctx.globalAlpha = 0.35;
				ctx.fillStyle = c;
				ctx.fillRect(rx0, y, rw, h);
				ctx.globalAlpha = 1;
				ctx.fillStyle = hatchOf(ctx, c);
				ctx.fillRect(rx0, y, rw, h);
			} else if (color === 'kept-audio-silent' || color === 'kept-transcript-silent') {
				// Kept, detectors disagree: pale green with a bar in the colour of the dissenter.
				ctx.globalAlpha = 0.35;
				ctx.fillStyle = c;
				ctx.fillRect(rx0, y, rw, h);
				ctx.globalAlpha = 1;
				ctx.fillStyle = pal[color === 'kept-audio-silent' ? 'cut-audio' : 'cut-transcript'];
				ctx.fillRect(rx0, y + h - 4, rw, 4);
			} else {
				ctx.globalAlpha = color === 'kept-pause' ? 0.55 : color === 'speech' ? 0.85 : 1;
				ctx.fillStyle = c;
				ctx.fillRect(rx0, y, rw, h);
				ctx.globalAlpha = 1;
			}
		};
		const labelChip = (text: string, lx: number, y: number, h: number, maxW: number) => {
			const tw = Math.min(maxW, ctx.measureText(text).width);
			ctx.globalAlpha = 0.82;
			ctx.fillStyle = panel;
			roundRect(ctx, lx - 3, y + h / 2 - 7, tw + 6, 14, 3);
			ctx.fill();
			ctx.globalAlpha = 1;
			ctx.fillStyle = css('--text');
			ctx.fillText(text, lx, y + h / 2 + 0.5, maxW);
		};
		const CUT_LABEL: Record<string, string> = {
			'cut-both': 'both',
			'cut-audio': 'noise level',
			'cut-transcript': 'transcript',
			'cut-manual': 'yours'
		};
		for (let i = firstEndingAfter(segments, viewStart); i < segments.length; i++) {
			const r = segments[i];
			if (r.start > viewEnd) break;
			const x0 = Math.max(-2, xOf(r.start));
			const x1 = Math.min(width + 2, xOf(r.end));
			const w = Math.max(1, x1 - x0 - 1);
			const y = stripTop + 4;
			const h = STRIP - 8;
			const isCut = r.action === 'remove';
			if (x1 - x0 < 4) {
				// Too narrow for a block: a solid 3 px tick keeps it visible (and it stays clickable).
				ctx.fillStyle = isCut ? pal[cutColor(r)] : r.manual ? pal['cut-manual'] : pal.speech;
				ctx.fillRect((x0 + x1) / 2 - 1.5, y, 3, h);
				ctx.fillRect((x0 + x1) / 2 - 1.5, detailTop + 3, 3, DETAIL - 6);
				continue;
			}
			const vs = Math.max(r.start, viewStart);
			const ve = Math.min(r.end, viewEnd);
			// Large segments stay simple: green kept, cuts in the colour of their main detector.
			ctx.save();
			roundRect(ctx, x0, y, w, h, 4);
			ctx.clip();
			fillRun(isCut ? cutColor(r) : 'speech', vs, ve, y, h);
			ctx.restore();
			// Detail track: the fine pieces, each its own block.
			const dy = detailTop + 3;
			const dh = DETAIL - 6;
			ctx.save();
			ctx.beginPath();
			ctx.rect(x0, dy, w, dh);
			ctx.clip();
			for (const run of segmentDetail(r, edl, audioSpeech, transcriptSpeech, {
				start: vs,
				end: ve
			})) {
				fillRun(run.color, run.start, run.end, dy, dh);
				// Hairline between pieces so neighbours of similar colour stay distinguishable.
				if (run.end < r.end) {
					ctx.fillStyle = panel;
					ctx.fillRect(xOf(run.end) - 0.5, dy, 1, dh);
				}
			}
			ctx.restore();
			if (!isCut && r.manual) {
				// Kept by you: yellow dashed outline.
				ctx.strokeStyle = pal['cut-manual'];
				ctx.lineWidth = 1.5;
				ctx.setLineDash([4, 3]);
				roundRect(ctx, x0 + 0.75, y + 0.75, w - 1.5, h - 1.5, 4);
				ctx.stroke();
				ctx.setLineDash([]);
				ctx.lineWidth = 1;
			}
			if (w > 54) {
				const text = isCut
					? `CUT · ${CUT_LABEL[cutColor(r)]} · ${formatSpan(r.end - r.start)}`
					: `${r.manual ? 'KEPT · yours · ' : ''}${formatSpan(r.end - r.start)}`;
				labelChip(text, Math.max(x0, 0) + 6, y, h, w - 12);
			}
		}
		ctx.textBaseline = 'alphabetic';

		// Lane labels last, on a backing chip so cuts never hide them.
		ctx.font = '600 9px ui-sans-serif, system-ui';
		for (const [label, top, h] of [
			['SEGMENTS', stripTop, STRIP],
			['DETAIL', detailTop, DETAIL],
			['NOISE LEVEL · speech', audioTop, LANE],
			['TRANSCRIPT · speech', txTop, LANE],
			['WORDS', wordsTop, WORDS]
		] as Array<[string, number, number]>) {
			const w = ctx.measureText(label).width + 8;
			ctx.fillStyle = panel;
			ctx.globalAlpha = 0.85;
			ctx.fillRect(width - w - 2, top + h / 2 - 6, w, 12);
			ctx.globalAlpha = 1;
			ctx.fillStyle = faint;
			ctx.fillText(label, width - w + 2, top + h / 2 + 3);
		}

		// Selection (an in-point alone is drawn as a flagged line)
		if (selection) {
			const x0 = xOf(Math.min(selection.start, selection.end));
			const x1 = xOf(Math.max(selection.start, selection.end));
			ctx.strokeStyle = accent;
			if (Math.abs(selection.end - selection.start) < MIN_SELECTION) {
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(x0, RULER);
				ctx.lineTo(x0, overviewTop);
				ctx.stroke();
				ctx.lineWidth = 1;
				ctx.fillStyle = accent;
				ctx.fillRect(x0, RULER, 18, 12);
				ctx.fillStyle = '#fff';
				ctx.font = '700 9px ui-sans-serif, system-ui';
				ctx.fillText('IN', x0 + 3, RULER + 9);
			} else {
				// A very short selection is drawn at least 3 px wide so it can be seen.
				const sw = Math.max(3, x1 - x0);
				const sx = x1 - x0 < 3 ? (x0 + x1) / 2 - 1.5 : x0;
				ctx.fillStyle = css('--accent-soft');
				ctx.fillRect(sx, RULER, sw, overviewTop - RULER);
				ctx.lineWidth = 2;
				ctx.strokeRect(sx, RULER + 1, sw, overviewTop - RULER - 2);
				ctx.lineWidth = 1;
				// edge grips
				ctx.fillStyle = accent;
				for (const x of [x0, x1]) ctx.fillRect(x - 2, waveTop + waveHeight / 2 - 10, 4, 20);
			}
		}
	}

	function lowerBoundWords(t: number) {
		let lo = 0;
		let hi = words.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (words[mid].end <= t) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	function drawOverlay() {
		if (!overlay) return;
		const dpr = devicePixelRatio;
		overlay.width = Math.round(width * dpr);
		overlay.height = Math.round(height * dpr);
		const ctx = overlay.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		const accent = css('--accent');
		if (focusedWord !== null && words[focusedWord]) {
			const w = words[focusedWord];
			ctx.strokeStyle = accent;
			ctx.lineWidth = 2;
			ctx.strokeRect(xOf(w.start), wordsTop + 3, Math.max(2, xOf(w.end) - xOf(w.start)), WORDS - 6);
			ctx.lineWidth = 1;
		}
		// Trim mode: every cut edge gets a grip; the one a drag would move is highlighted.
		if (tool === 'trim' && !drag) {
			const near = hover && hover.y > RULER && hover.y < overviewTop ? trimTarget(hover.x) : null;
			const manual = css('--manual');
			const dimGrip = css('--text-dim');
			for (let i = firstEndingAfter(segments, viewStart); i + 1 < segments.length; i++) {
				const a = segments[i];
				if (a.end > viewEnd) break;
				if (a.action === segments[i + 1].action) continue;
				const gx = Math.round(xOf(a.end));
				ctx.fillStyle = near && Math.abs(near.time - a.end) < 1e-6 ? manual : dimGrip;
				ctx.fillRect(gx - 2, stripTop + 3, 4, STRIP - 6);
			}
			if (near) {
				const nx = Math.round(xOf(near.time)) + 0.5;
				ctx.strokeStyle = manual;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(nx, RULER);
				ctx.lineTo(nx, overviewTop);
				ctx.stroke();
				ctx.lineWidth = 1;
			}
		}
		// Select mode: outline what a click in the segment or detail track would select.
		if (tool === 'select' && hover && !drag && hover.y > stripTop && hover.y < waveTop) {
			const inDetail = hover.y >= detailTop;
			const seg = inDetail ? pickDetail(hover.x) : pickSegment(hover.x);
			const top = inDetail ? detailTop + 1.5 : stripTop + 3.5;
			const hh = inDetail ? DETAIL - 3 : STRIP - 7;
			if (seg) {
				// Outline at least 8 px wide so the target of a click on a sliver is obvious.
				const sx0 = xOf(seg.start);
				const sw = Math.max(8, xOf(seg.end) - sx0 - 1);
				const sx = sw === 8 ? (sx0 + xOf(seg.end)) / 2 - 4 : sx0 + 0.5;
				ctx.strokeStyle = css('--text');
				ctx.lineWidth = 1.5;
				roundRect(ctx, sx, top, sw, hh, 4);
				ctx.stroke();
				ctx.lineWidth = 1;
			}
		}
		if (drag?.kind === 'boundary') {
			const x = Math.round(xOf(drag.to)) + 0.5;
			ctx.strokeStyle = css('--manual');
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(x, RULER);
			ctx.lineTo(x, overviewTop);
			ctx.stroke();
			ctx.lineWidth = 1;
			ctx.fillStyle = css('--manual');
			ctx.font = '10px ui-monospace, monospace';
			ctx.fillText(formatTimecode(drag.to), x + 4, waveTop + 14);
		}
		if (snapLine !== null && drag) {
			const x = Math.round(xOf(snapLine)) + 0.5;
			ctx.strokeStyle = accent;
			ctx.setLineDash([3, 2]);
			ctx.beginPath();
			ctx.moveTo(x, RULER);
			ctx.lineTo(x, overviewTop);
			ctx.stroke();
			ctx.setLineDash([]);
		}
		if (hover && !drag && hover.y > RULER && hover.y < overviewTop) {
			const x = Math.round(xOf(hover.t)) + 0.5;
			ctx.strokeStyle = css('--text-faint');
			ctx.setLineDash([2, 3]);
			ctx.beginPath();
			ctx.moveTo(x, RULER);
			ctx.lineTo(x, overviewTop);
			ctx.stroke();
			ctx.setLineDash([]);
		}
		// playhead
		const px = Math.round(xOf(playhead)) + 0.5;
		if (px >= -1 && px <= width + 1) {
			ctx.strokeStyle = css('--text');
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(px, 0);
			ctx.lineTo(px, overviewTop);
			ctx.stroke();
			ctx.fillStyle = css('--text');
			ctx.beginPath();
			ctx.moveTo(px - 5, 0);
			ctx.lineTo(px + 5, 0);
			ctx.lineTo(px, 7);
			ctx.fill();
		}
	}

	let baseFrame = 0;
	$effect(() => {
		void [
			width,
			height,
			viewStart,
			pxPerSec,
			peaks,
			envelope,
			thresholdDb,
			audioSpeech,
			transcriptSpeech,
			combinedSilence,
			edl,
			segments,
			words,
			selection
		];
		cancelAnimationFrame(baseFrame);
		baseFrame = requestAnimationFrame(drawBase);
	});
	$effect(() => {
		void [
			width,
			height,
			viewStart,
			pxPerSec,
			playhead,
			drag,
			hover,
			focusedWord,
			words,
			snapLine,
			segments,
			tool
		];
		drawOverlay();
	});

	// ───────────── interaction ─────────────
	function localPoint(e: PointerEvent | WheelEvent | MouseEvent) {
		const r = base.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}

	function wordAt(x: number): number | null {
		const t = tOf(x);
		const i = lowerBoundWords(t - 2 / pxPerSec);
		for (let j = i; j < Math.min(words.length, i + 3); j++) {
			if (t >= words[j].start - 1 / pxPerSec && t <= words[j].end + 1 / pxPerSec) return j;
		}
		return null;
	}

	/** Nearest word to `t` (for dragging across gaps between words). */
	function nearestWord(t: number): number | null {
		if (!words.length) return null;
		const i = Math.min(words.length - 1, lowerBoundWords(t));
		const prev = Math.max(0, i - 1);
		const d = (k: number) => Math.min(Math.abs(words[k].start - t), Math.abs(words[k].end - t));
		return d(prev) < d(i) ? prev : i;
	}

	function nearThreshold(y: number) {
		return !!envelope && Math.abs(y - dbToY(thresholdDb)) <= 4 && y > waveTop && y < audioTop;
	}

	function selectionEdgeNear(t: number): { fixed: number } | null {
		if (!selection || selection.end - selection.start < 0.001) return null;
		const tol = EDGE_PX / pxPerSec;
		if (Math.abs(t - selection.start) <= tol) return { fixed: selection.end };
		if (Math.abs(t - selection.end) <= tol) return { fixed: selection.start };
		return null;
	}

	const widthPx = (r: Range | null | undefined) => (r ? (r.end - r.start) * pxPerSec : Infinity);

	/**
	 * The segment a strip click at `x` refers to. Wide segments are hit exactly; a narrow one (a
	 * few frames when zoomed out) also catches clicks a few pixels either side, so every segment can
	 * be clicked however small it is drawn.
	 */
	function pickSegment(x: number): EditRegion | null {
		return pickIn(segments, x);
	}

	/** The detail-track piece at `x` (same narrow-piece picking as segments). */
	function pickDetail(x: number): ColoredRun | null {
		const lo = clampT(tOf(x - PICK_PX - 1));
		const hi = clampT(tOf(x + PICK_PX + 1));
		const near: ColoredRun[] = [];
		for (let i = firstEndingAfter(segments, lo); i < segments.length; i++) {
			if (segments[i].start > hi) break;
			near.push(...segmentDetail(segments[i], edl, audioSpeech, transcriptSpeech));
		}
		return pickIn(near, x);
	}

	function pickIn<T extends Range>(list: readonly T[], x: number): T | null {
		const t = clampT(tOf(x));
		const cand = list[Math.min(firstEndingAfter(list, t), list.length - 1)];
		const under = cand && cand.start <= t + 1e-9 && t <= cand.end + 1e-9 ? cand : null;
		if (under && widthPx(under) < NARROW_PX) return under;
		let best: T | null = null;
		let bestD = PICK_PX;
		for (let i = firstEndingAfter(list, tOf(x - PICK_PX)); i < list.length; i++) {
			const r = list[i];
			if (xOf(r.start) > x + PICK_PX) break;
			if (widthPx(r) >= NARROW_PX) continue;
			const d = Math.max(0, xOf(r.start) - x, x - xOf(r.end));
			if (d <= bestD) {
				bestD = d;
				best = r;
			}
		}
		return best ?? under;
	}

	/** A time inside `seg` for a click at `x` (the pointer time when it is inside). */
	function timeIn(seg: Range, x: number) {
		const t = clampT(tOf(x));
		return t >= seg.start && t < seg.end ? t : (seg.start + seg.end) / 2;
	}

	/**
	 * Trim mode: the cut edge (keep/remove border) nearest `x`. The grab zone is generous because
	 * nothing else competes for the pointer in this mode.
	 */
	function trimTarget(x: number) {
		return boundaryNear(edl, clampT(tOf(x)), TRIM_PX / pxPerSec);
	}

	/** Click on the detail track: select just that piece (shift extends the selection). */
	function detailClick(x: number, extend: boolean) {
		const run = pickDetail(x);
		if (!run) return;
		const range = { start: run.start, end: run.end };
		actions.select(extend ? extendSelection(selection, range) : range);
	}

	/** Click on the segment strip (select, or restore a cut; double-click removes speech). */
	function stripClick(x: number, extend: boolean) {
		const seg = pickSegment(x);
		if (!seg) return;
		const now = performance.now();
		const isDouble =
			now - lastStripClick.at < 400 &&
			Math.abs(seg.start - lastStripClick.start) < 1e-6 &&
			lastStripClick.result === 'selected';
		if (isDouble && seg.action === 'keep') {
			// Double-click on speech: remove the segment that the first click selected.
			actions.removeSelection();
			lastStripClick = { at: 0, start: -1, result: null };
			return;
		}
		const result = actions.clickSegment(timeIn(seg, x), extend);
		lastStripClick = { at: now, start: seg.start, result };
	}

	function snap(t: number, e: PointerEvent): number {
		if (!snapping || e.altKey) {
			snapLine = null;
			return t;
		}
		const tol = 8 / pxPerSec;
		const res = snapTime(t, snapCandidates(t, tol * 1.5, edl, words, [playhead]), tol);
		snapLine = res.snapped ? res.t : null;
		return res.t;
	}

	type Target = 'ruler' | 'strip' | 'detail' | 'content' | 'words';
	function targetOf(y: number): Target {
		if (y <= RULER) return 'ruler';
		if (y < detailTop) return 'strip';
		if (y < waveTop) return 'detail';
		if (y >= wordsTop) return 'words';
		return 'content';
	}

	/** Contextual hint for what a click/drag will do at the pointer. */
	const hint = $derived.by((): string | null => {
		if (!hover || drag || menu) return null;
		const { y, t, x } = hover;
		const target = targetOf(y);
		if (target === 'ruler') return 'Click or drag to move the playhead';
		if (tool === 'trim') {
			const b = trimTarget(x);
			return b
				? `Drag to move this cut edge (${formatTimecode(b.time)})`
				: 'Trim mode: drag a cut edge · click moves the playhead · V to select';
		}
		if (target === 'strip') {
			const seg = pickSegment(x);
			if (!seg) return null;
			if (seg.action === 'remove')
				return `Cut · ${formatSpan(seg.end - seg.start)} — click to restore`;
			return `Segment · ${formatSpan(seg.end - seg.start)} — click to select · double-click to remove`;
		}
		if (target === 'detail') {
			const run = pickDetail(x);
			return run
				? `${DETAIL_TEXT[run.color]} · ${formatSpan(run.end - run.start)} — click to select just this`
				: null;
		}
		if (target === 'words') {
			const wi = wordAt(x);
			return wi !== null ? `“${words[wi].text}” — click to select · drag across words` : null;
		}
		if (selectionEdgeNear(t)) return 'Drag to adjust the selection';
		if (nearThreshold(y)) return `Drag to change the silence threshold (${thresholdDb} dB)`;
		return null;
	});

	const cursor = $derived.by(() => {
		if (drag) {
			if (drag.kind === 'boundary' || drag.kind === 'edge') return 'ew-resize';
			if (drag.kind === 'threshold') return 'ns-resize';
			if (drag.kind === 'scrub') return 'grabbing';
			return 'text';
		}
		if (!hover) return 'default';
		const { y, t, x } = hover;
		const target = targetOf(y);
		if (target === 'ruler') return 'col-resize';
		if (tool === 'trim') return trimTarget(x) ? 'ew-resize' : 'default';
		if (target === 'strip' || target === 'detail') return 'pointer';
		if (target === 'words') return wordAt(x) !== null ? 'pointer' : 'text';
		if (selectionEdgeNear(t)) return 'ew-resize';
		if (nearThreshold(y)) return 'ns-resize';
		return 'text';
	});

	function onpointermove(e: PointerEvent) {
		const { x, y } = localPoint(e);
		const raw = clampT(tOf(x));
		hover = { x, y, t: raw };
		if (!drag) return;
		switch (drag.kind) {
			case 'boundary':
				drag = { ...drag, to: snap(raw, e) };
				break;
			case 'select': {
				const t = snap(raw, e);
				const moved = drag.moved || Math.abs(xOf(raw) - xOf(drag.anchor)) > 3;
				drag = { ...drag, current: t, moved };
				if (moved)
					actions.select({ start: Math.min(drag.anchor, t), end: Math.max(drag.anchor, t) });
				break;
			}
			case 'edge': {
				const t = snap(raw, e);
				actions.select({ start: Math.min(drag.fixed, t), end: Math.max(drag.fixed, t) });
				break;
			}
			case 'words': {
				const j = nearestWord(raw);
				if (j !== null) actions.selectWordRange(drag.anchor, j);
				break;
			}
			case 'scrub':
				actions.seek(raw);
				break;
			case 'threshold':
				actions.threshold(Math.round(Math.max(-80, Math.min(-5, yToDb(y)))));
				break;
		}
	}

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0) return;
		menu = null;
		try {
			base.setPointerCapture(e.pointerId);
		} catch {
			/* synthetic or already-released pointer */
		}
		const { x, y } = localPoint(e);
		const t = clampT(tOf(x));
		const target = targetOf(y);
		if (target === 'ruler') {
			drag = { kind: 'scrub' };
			actions.seek(t);
			return;
		}
		if (tool === 'trim') {
			// Trim mode only moves cut edges; anywhere else a click/drag moves the playhead.
			const b = trimTarget(x);
			if (b) {
				drag = { kind: 'boundary', leftIndex: b.leftIndex, from: b.time, to: b.time, x0: x };
			} else {
				drag = { kind: 'scrub' };
				actions.seek(t);
			}
			return;
		}
		if (target === 'strip') {
			stripClick(x, e.shiftKey);
			return;
		}
		if (target === 'detail') {
			detailClick(x, e.shiftKey);
			return;
		}
		if (target === 'words') {
			const wi = wordAt(x);
			if (wi !== null) {
				actions.selectWord(wi, e.shiftKey);
				actions.seek(words[wi].start);
				drag = {
					kind: 'words',
					anchor: e.shiftKey && selection ? (nearestWord(selection.start) ?? wi) : wi
				};
				return;
			}
		}
		// Waveform and detector lanes
		const edge = selectionEdgeNear(t);
		if (edge && !e.shiftKey) {
			drag = { kind: 'edge', fixed: edge.fixed, current: t };
			return;
		}
		if (nearThreshold(y) && !e.shiftKey) {
			drag = { kind: 'threshold' };
			return;
		}
		const st = snap(t, e);
		if (e.shiftKey && selection) {
			const anchor =
				Math.abs(st - selection.start) > Math.abs(st - selection.end)
					? selection.start
					: selection.end;
			drag = { kind: 'select', anchor, current: st, moved: true };
			actions.select({ start: Math.min(anchor, st), end: Math.max(anchor, st) });
			return;
		}
		drag = { kind: 'select', anchor: st, current: st, moved: false };
	}

	function onpointerup(e: PointerEvent) {
		if (!drag) return;
		try {
			base.releasePointerCapture(e.pointerId);
		} catch {
			/* not captured */
		}
		const d = drag;
		drag = null;
		snapLine = null;
		if (d.kind === 'boundary') {
			const x = localPoint(e).x;
			if (Math.abs(x - d.x0) >= 3 && Math.abs(d.to - d.from) > 1e-6) {
				actions.dragBoundary(d.leftIndex, d.from, d.to);
			} else {
				actions.seek(clampT(tOf(d.x0))); // pressed on an edge without dragging
			}
		} else if (d.kind === 'select' && !d.moved) {
			actions.select(null);
			actions.seek(d.anchor);
		}
	}

	function oncontextmenu(e: MouseEvent) {
		e.preventDefault();
		const { x, y } = localPoint(e);
		const target = targetOf(y);
		const picked = target === 'strip' ? pickSegment(x) : target === 'detail' ? pickDetail(x) : null;
		const t = picked ? timeIn(picked, x) : clampT(tOf(x));
		// Right-click outside the current selection selects what is under the pointer first.
		if (!selection || t < selection.start || t > selection.end) {
			const wi = target === 'words' ? wordAt(x) : null;
			if (wi !== null) actions.selectWord(wi, false);
			else if (target === 'detail' && picked)
				actions.select({ start: picked.start, end: picked.end });
			else actions.selectSegmentAt(t, false);
		}
		const hostRect = wrap.getBoundingClientRect();
		menu = {
			x: Math.min(x, hostRect.width - 210),
			y: Math.min(y, hostRect.height - 230),
			t
		};
	}

	function onwheel(e: WheelEvent) {
		e.preventDefault();
		const { x } = localPoint(e);
		if (e.ctrlKey || e.metaKey) {
			const factor = Math.exp(-e.deltaY * 0.01);
			zoomBy(factor, tOf(x));
			return;
		}
		const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
		panBy(delta / pxPerSec);
	}

	function run(fn: () => void) {
		menu = null;
		fn();
	}

	/** Contiguous cuts for the navigator's track markers. */
	const navCuts = $derived.by(() => {
		const out: Range[] = [];
		for (const r of edl) {
			if (r.action !== 'remove') continue;
			const last = out[out.length - 1];
			if (last && Math.abs(last.end - r.start) < 1e-6) last.end = r.end;
			else out.push({ start: r.start, end: r.end });
		}
		return out;
	});

	const selLen = $derived(selection ? selection.end - selection.start : 0);
	const barX = $derived.by(() => {
		if (!selection || selLen < MIN_SELECTION) return null;
		const x0 = xOf(selection.start);
		const x1 = xOf(selection.end);
		if (x1 < 0 || x0 > width) return null;
		const mid = (Math.max(0, x0) + Math.min(width, x1)) / 2;
		return Math.max(150, Math.min(width - 150, mid));
	});
</script>

<div class="timeline" class:trim={tool === 'trim'} bind:this={host} data-testid="timeline">
	<div class="canvas-wrap" bind:this={wrap} id="timeline-canvas">
		<canvas
			bind:this={base}
			class="base"
			style:cursor
			{onpointermove}
			{onpointerdown}
			{onpointerup}
			{oncontextmenu}
			onpointerleave={() => (hover = null)}
			{onwheel}
			aria-label="Timeline: segments, waveform, audio envelope, detected speech, transcript words and cuts. Use the keyboard shortcuts to edit."
		></canvas>
		<canvas bind:this={overlay} class="overlay" aria-hidden="true"></canvas>

		<div class="zoom-info mono">
			{formatTimecode(viewStart)} – {formatTimecode(Math.min(duration, viewEnd))}
			· {pxPerSec >= 100 ? `${Math.round(pxPerSec)} px/s` : `${(1 / pxPerSec).toFixed(2)} s/px`}
		</div>

		{#if tool === 'trim'}
			<div class="mode-badge" data-testid="trim-badge">
				Trim mode — drag cut edges · <kbd>V</kbd> to select
			</div>
		{/if}

		{#if hint && hover}
			<div
				class="hint"
				style:left="{Math.min(Math.max(8, hover.x + 12), width - 300)}px"
				style:top="{hover.y < waveTop ? waveTop + 4 : Math.max(RULER + 2, hover.y - 30)}px"
				data-testid="timeline-hint"
			>
				{hint}
			</div>
		{/if}

		{#if barX !== null && selection && !drag && !menu}
			<div
				class="selbar"
				style:left="{barX}px"
				style:top="{waveTop + 6}px"
				data-testid="selection-bar"
			>
				<span class="mono len">{formatSpan(selLen)}</span>
				<button
					class="danger"
					onclick={() => actions.removeSelection()}
					title="Remove selection (Delete)"
					data-testid="selbar-remove">✂ Remove</button
				>
				<button
					onclick={() => actions.restoreSelection()}
					title="Keep / restore selection (U)"
					data-testid="selbar-keep">Keep</button
				>
				<button onclick={() => actions.playSelection()} title="Play selection (Shift+Space)"
					>▶</button
				>
				<button onclick={() => zoomTo(selection!)} title="Zoom to selection (Z)">⤢</button>
				<button
					class="ghost"
					onclick={() => actions.select(null)}
					title="Clear selection (Esc)"
					aria-label="Clear selection">✕</button
				>
			</div>
		{/if}

		{#if menu}
			<div
				class="menu"
				role="menu"
				style:left="{menu.x}px"
				style:top="{menu.y}px"
				data-testid="timeline-menu"
			>
				{#if selection && selLen >= MIN_SELECTION}
					<button role="menuitem" onclick={() => run(() => actions.removeSelection())}>
						<span>Remove selection</span><kbd>⌫</kbd>
					</button>
					<button role="menuitem" onclick={() => run(() => actions.restoreSelection())}>
						<span>Keep / restore selection</span><kbd>U</kbd>
					</button>
					<button role="menuitem" onclick={() => run(() => actions.playSelection())}>
						<span>Play selection</span><kbd>⇧Space</kbd>
					</button>
					<button role="menuitem" onclick={() => run(() => zoomTo(selection!))}>
						<span>Zoom to selection</span><kbd>Z</kbd>
					</button>
					<hr />
				{/if}
				<button role="menuitem" onclick={() => run(() => actions.split(menu?.t ?? playhead))}>
					<span>Split here</span><kbd>S</kbd>
				</button>
				<button role="menuitem" onclick={() => run(() => actions.seek(menu?.t ?? playhead))}>
					<span>Move playhead here</span>
				</button>
				<button
					role="menuitem"
					onclick={() => run(() => actions.selectSegmentAt(menu?.t ?? playhead, false))}
				>
					<span>Select segment</span>
				</button>
				{#if selection}
					<button role="menuitem" onclick={() => run(() => actions.select(null))}>
						<span>Clear selection</span><kbd>Esc</kbd>
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="navigator">
		<ZoomScrollbar
			start={duration > 0 ? viewStart / duration : 0}
			end={duration > 0 ? viewEnd / duration : 1}
			minRange={duration > 0 ? minSpan / duration : 1}
			disabled={!(duration > 0)}
			onchange={(r) => setView(r.start * duration, r.end * duration)}
			formatValue={(v) => formatTimecode(v * duration)}
			label="Timeline navigator: drag the middle to scroll, drag either end to zoom"
			controls="timeline-canvas"
		>
			{#if duration > 0}
				<svg viewBox="0 0 1000 10" preserveAspectRatio="none" class="nav-markers">
					{#each navCuts as c (c.start)}
						<rect
							x={(c.start / duration) * 1000}
							y="2"
							width={Math.max(0.6, ((c.end - c.start) / duration) * 1000)}
							height="6"
							class="cut"
						/>
					{/each}
					{#if selection && selection.end > selection.start}
						<rect
							x={(selection.start / duration) * 1000}
							y="0"
							width={Math.max(0.6, ((selection.end - selection.start) / duration) * 1000)}
							height="10"
							class="sel"
						/>
					{/if}
					<line
						x1={(playhead / duration) * 1000}
						x2={(playhead / duration) * 1000}
						y1="0"
						y2="10"
						class="ph"
						vector-effect="non-scaling-stroke"
					/>
				</svg>
			{/if}
		</ZoomScrollbar>
	</div>
	<div class="legend" data-testid="timeline-legend" aria-label="Segment colour key">
		{#each LEGEND as item (item.color)}
			<span class="key" title={item.title}><i class="sw {item.color}"></i>{item.label}</span>
		{/each}
	</div>
</div>

<style>
	.timeline {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 240px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--panel);
		user-select: none;
		touch-action: none;
	}
	.canvas-wrap {
		position: relative;
		flex: 1;
		min-height: 0;
	}
	.navigator {
		flex: none;
		padding: 5px 9px 6px;
		border-top: 1px solid var(--border);
		background: var(--panel);
	}
	.legend {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		gap: 3px 12px;
		padding: 0 10px 6px;
		font-size: 10.5px;
		color: var(--text-dim);
		background: var(--panel);
	}
	.key {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		white-space: nowrap;
		cursor: help;
	}
	.sw {
		width: 16px;
		height: 10px;
		border-radius: 2px;
		box-sizing: border-box;
	}
	.sw.speech {
		background: color-mix(in srgb, var(--keep) 85%, transparent);
	}
	.sw.kept-transcript-silent {
		background:
			linear-gradient(to right, var(--seg-cut-audio) 50%, var(--seg-cut-transcript) 50%) bottom /
				100% 3px no-repeat,
			color-mix(in srgb, var(--keep) 35%, transparent);
	}
	.sw.kept-pause {
		background: color-mix(in srgb, var(--seg-pause) 55%, transparent);
	}
	.sw.kept-manual {
		background: color-mix(in srgb, var(--keep) 85%, transparent);
		border: 1.5px dashed var(--manual);
	}
	.sw.cut-both {
		background: var(--remove);
	}
	.sw.cut-audio {
		background: repeating-linear-gradient(
			135deg,
			var(--seg-cut-audio) 0 2px,
			color-mix(in srgb, var(--seg-cut-audio) 35%, transparent) 2px 4px
		);
	}
	.sw.cut-transcript {
		background: var(--seg-cut-transcript);
	}
	.sw.cut-manual {
		background: var(--manual);
	}
	.nav-markers {
		display: block;
		width: 100%;
		height: 100%;
	}
	.nav-markers .cut {
		fill: var(--remove);
		opacity: 0.75;
	}
	.nav-markers .sel {
		fill: var(--accent);
		opacity: 0.3;
	}
	.nav-markers .ph {
		stroke: var(--text);
		stroke-width: 1.5;
	}
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.overlay {
		pointer-events: none;
	}
	.zoom-info {
		position: absolute;
		right: 8px;
		top: 4px;
		font-size: 10px;
		color: var(--text-faint);
		pointer-events: none;
		background: color-mix(in srgb, var(--panel) 80%, transparent);
		padding: 0 4px;
		border-radius: 3px;
	}
	.mode-badge {
		position: absolute;
		left: 50%;
		top: 2px;
		transform: translateX(-50%);
		pointer-events: none;
		font-size: 11px;
		font-weight: 600;
		color: #fff;
		background: color-mix(in srgb, var(--manual) 85%, transparent);
		padding: 2px 9px;
		border-radius: 10px;
		z-index: 2;
	}
	.mode-badge kbd {
		font-size: 10px;
		padding: 0 4px;
		color: inherit;
		background: rgba(0, 0, 0, 0.2);
		border-color: rgba(255, 255, 255, 0.4);
	}
	.timeline.trim .canvas-wrap {
		box-shadow: inset 0 0 0 1.5px var(--manual);
	}
	.hint {
		position: absolute;
		pointer-events: none;
		font-size: 11px;
		background: var(--panel-3);
		border: 1px solid var(--border-strong);
		color: var(--text);
		padding: 2px 7px;
		border-radius: 4px;
		white-space: nowrap;
		box-shadow: var(--shadow);
		z-index: 3;
	}
	.selbar {
		position: absolute;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 3px;
		padding: 3px;
		background: var(--panel-3);
		border: 1px solid var(--accent);
		border-radius: 7px;
		box-shadow: var(--shadow);
		z-index: 4;
	}
	.selbar button {
		font-size: 12px;
		padding: 2px 8px;
	}
	.selbar .danger {
		font-weight: 600;
	}
	.len {
		font-size: 11px;
		color: var(--accent-strong);
		padding: 0 6px;
	}
	.menu {
		position: absolute;
		z-index: 5;
		min-width: 200px;
		background: var(--panel);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		box-shadow: var(--shadow);
		padding: 4px;
		display: flex;
		flex-direction: column;
	}
	.menu button {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		border: none;
		background: transparent;
		text-align: left;
		padding: 5px 8px;
		font-size: 12.5px;
		border-radius: 5px;
	}
	.menu button:hover {
		background: var(--accent);
		color: #fff;
	}
	.menu hr {
		border: none;
		border-top: 1px solid var(--border);
		margin: 3px 0;
	}
</style>
