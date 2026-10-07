<script lang="ts">
	/**
	 * ZoomScrollbar / timeline navigator.
	 *
	 * The track is the whole timeline; the highlighted region is the visible range. Drag the middle
	 * to scroll, drag either handle to zoom (the opposite edge stays put), click the empty track to
	 * centre the view there. Works with mouse, trackpad, touch and stylus (Pointer Events with
	 * pointer capture), and from the keyboard.
	 *
	 * Controlled: `start`/`end` (normalised 0..1) are the single source of truth. Bind them, or pass
	 * them and handle `onchange` — the component never keeps its own copy of the range, so it can't
	 * drift from the parent's viewport. All maths is done on normalised values (see
	 * core/viewRange.ts); pixels are only used for rendering, so resizing never changes the range.
	 */
	import type { Snippet } from 'svelte';
	import {
		centerRangeAt,
		dragHandle,
		panRange,
		sanitizeRange,
		zoomOf,
		type ViewRange
	} from '../core/viewRange';

	interface Props {
		/** Visible start, 0..1. */
		start: number;
		/** Visible end, 0..1. */
		end: number;
		/** Smallest allowed visible fraction (maximum zoom). */
		minRange?: number;
		disabled?: boolean;
		/** Called with the new range on every change (continuously while dragging). */
		onchange?: (range: ViewRange) => void;
		/** Human-readable value for assistive tech, e.g. a timecode. */
		formatValue?: (normalized: number) => string;
		label?: string;
		/** id of the element whose viewport this controls (aria-controls). */
		controls?: string;
		/** Decorations drawn on the track behind the range (markers, minimap…). */
		children?: Snippet;
	}

	let {
		start = $bindable(0),
		end = $bindable(1),
		minRange = 0.01,
		disabled = false,
		onchange,
		formatValue = (v) => `${(v * 100).toFixed(1)}%`,
		label = 'Timeline navigator',
		controls,
		children
	}: Props = $props();

	/** Below this many pixels the region is drawn wider (centred) so it stays grabbable. */
	const MIN_VISUAL_PX = 34;

	let track: HTMLDivElement;
	let trackWidth = $state(0);
	let drag = $state<{
		part: 'start' | 'end' | 'pan';
		pointerId: number;
		x0: number;
		widthPx: number;
		initial: ViewRange;
	} | null>(null);

	const range = $derived(sanitizeRange({ start, end }, minRange));
	const zoom = $derived(zoomOf(range));

	// Pixel geometry for rendering only.
	const geometry = $derived.by(() => {
		const w = trackWidth;
		let left = range.start * w;
		let width = (range.end - range.start) * w;
		if (width < MIN_VISUAL_PX && w > MIN_VISUAL_PX) {
			const mid = left + width / 2;
			width = MIN_VISUAL_PX;
			left = Math.min(Math.max(0, mid - width / 2), w - width);
		}
		return { left, width };
	});

	$effect(() => {
		const ro = new ResizeObserver(() => (trackWidth = track.clientWidth));
		ro.observe(track);
		trackWidth = track.clientWidth;
		return () => ro.disconnect();
	});

	function emit(next: ViewRange) {
		if (next.start === range.start && next.end === range.end) return;
		start = next.start;
		end = next.end;
		onchange?.(next);
	}

	function partOf(target: EventTarget | null): 'start' | 'end' | 'pan' | 'track' {
		const el = (target as Element | null)?.closest?.('[data-part]') as HTMLElement | null;
		return (el?.dataset.part as 'start' | 'end' | 'pan' | undefined) ?? 'track';
	}

	function onpointerdown(e: PointerEvent) {
		if (disabled || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
		e.preventDefault(); // no text selection / native drag
		const rect = track.getBoundingClientRect();
		if (rect.width <= 0) return;
		let part = partOf(e.target);
		let initial = range;
		if (part === 'track') {
			// Jump: centre the current range on the click (zoom unchanged), then keep dragging it.
			initial = centerRangeAt(range, (e.clientX - rect.left) / rect.width);
			emit(initial);
			part = 'pan';
		}
		(track.querySelector(`[data-part="${part}"]`) as HTMLElement | null)?.focus({
			preventScroll: true
		});
		try {
			track.setPointerCapture(e.pointerId);
		} catch {
			/* synthetic pointer */
		}
		drag = { part, pointerId: e.pointerId, x0: e.clientX, widthPx: rect.width, initial };
	}

	function onpointermove(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		// Always from the drag's initial range + total delta: no accumulation, no jump.
		const delta = (e.clientX - drag.x0) / drag.widthPx;
		emit(
			drag.part === 'pan'
				? panRange(drag.initial, delta)
				: dragHandle(drag.initial, drag.part, delta, minRange)
		);
	}

	function endDrag(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		try {
			track.releasePointerCapture(e.pointerId);
		} catch {
			/* not captured */
		}
		drag = null;
	}

	function onkeydown(e: KeyboardEvent, part: 'start' | 'end' | 'pan') {
		if (disabled) return;
		const width = range.end - range.start;
		const step = width * (e.shiftKey ? 0.5 : 0.1);
		let next: ViewRange | null = null;
		const dir =
			e.key === 'ArrowLeft' || e.key === 'ArrowDown'
				? -1
				: e.key === 'ArrowRight' || e.key === 'ArrowUp'
					? 1
					: 0;
		if (dir !== 0) {
			next =
				part === 'pan'
					? panRange(range, dir * step)
					: dragHandle(range, part, dir * step, minRange);
		} else if (e.key === 'Home') {
			next =
				part === 'end'
					? dragHandle(range, 'end', -1, minRange)
					: part === 'pan'
						? panRange(range, -1)
						: dragHandle(range, 'start', -1, minRange);
		} else if (e.key === 'End') {
			next =
				part === 'start'
					? dragHandle(range, 'start', 1, minRange)
					: part === 'pan'
						? panRange(range, 1)
						: dragHandle(range, 'end', 1, minRange);
		}
		if (!next) return;
		e.preventDefault();
		e.stopPropagation(); // keep the editor's global arrow-key shortcuts out of it
		emit(next);
	}

	const pct = (v: number) => Math.round(v * 1000) / 10;
	// Scroll position (0–100) for the region's scrollbar semantics.
	const scrollPct = $derived(
		range.end - range.start >= 1 ? 0 : pct(range.start / (1 - (range.end - range.start)))
	);
</script>

<div
	class="zsb"
	class:disabled
	class:dragging={drag !== null}
	class:panning={drag?.part === 'pan'}
	bind:this={track}
	{onpointerdown}
	{onpointermove}
	onpointerup={endDrag}
	onpointercancel={endDrag}
	onlostpointercapture={endDrag}
	role="group"
	aria-label={label}
	data-testid="zoom-scrollbar"
>
	<div class="markers" aria-hidden="true">{@render children?.()}</div>

	<div
		class="region"
		class:active={drag?.part === 'pan'}
		style:left="{geometry.left}px"
		style:width="{geometry.width}px"
		data-part="pan"
		role="scrollbar"
		tabindex={disabled ? -1 : 0}
		aria-orientation="horizontal"
		aria-controls={controls}
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={scrollPct}
		aria-valuetext="Showing {formatValue(range.start)} to {formatValue(
			range.end
		)}, zoom {zoom.toFixed(zoom < 10 ? 1 : 0)}×"
		aria-disabled={disabled}
		onkeydown={(e) => onkeydown(e, 'pan')}
		data-testid="zsb-region"
	>
		{#if geometry.width > 70}
			<span class="zoom-label" aria-hidden="true">{zoom.toFixed(zoom < 10 ? 1 : 0)}×</span>
		{/if}
		<div
			class="handle left"
			class:active={drag?.part === 'start'}
			data-part="start"
			role="slider"
			tabindex={disabled ? -1 : 0}
			aria-label="Start of visible range (drag to zoom)"
			aria-orientation="horizontal"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={pct(range.start)}
			aria-valuetext={formatValue(range.start)}
			aria-disabled={disabled}
			onkeydown={(e) => onkeydown(e, 'start')}
			data-testid="zsb-start"
		>
			<span class="bar"></span>
		</div>
		<div
			class="handle right"
			class:active={drag?.part === 'end'}
			data-part="end"
			role="slider"
			tabindex={disabled ? -1 : 0}
			aria-label="End of visible range (drag to zoom)"
			aria-orientation="horizontal"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={pct(range.end)}
			aria-valuetext={formatValue(range.end)}
			aria-disabled={disabled}
			onkeydown={(e) => onkeydown(e, 'end')}
			data-testid="zsb-end"
		>
			<span class="bar"></span>
		</div>
	</div>
</div>

<style>
	.zsb {
		position: relative;
		height: 20px;
		border-radius: 6px;
		background: var(--panel-2, #1c2029);
		border: 1px solid var(--border, #2a2f3b);
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		touch-action: none;
		overflow: visible;
	}
	.zsb.disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.markers {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		overflow: hidden;
		pointer-events: none;
	}
	.region {
		position: absolute;
		top: 1px;
		bottom: 1px;
		border-radius: 5px;
		background: color-mix(in srgb, var(--accent, #5b8def) 22%, transparent);
		border: 1.5px solid var(--accent, #5b8def);
		box-sizing: border-box;
		cursor: grab;
		outline-offset: 2px;
	}
	.zsb.panning,
	.zsb.panning .region {
		cursor: grabbing;
	}
	.region.active {
		background: color-mix(in srgb, var(--accent, #5b8def) 34%, transparent);
	}
	.zoom-label {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		font: 600 10px/1 var(--mono, ui-monospace, monospace);
		color: var(--text, #e7e9ee);
		opacity: 0.75;
		pointer-events: none;
	}
	/* 14 px invisible hit target centred on each edge; 5 px visible bar inside it. */
	.handle {
		position: absolute;
		top: -2px;
		bottom: -2px;
		width: 14px;
		cursor: ew-resize;
		display: grid;
		place-items: center;
		z-index: 1;
		outline: none;
	}
	.handle.left {
		left: -8px;
	}
	.handle.right {
		right: -8px;
	}
	.bar {
		width: 5px;
		height: 100%;
		border-radius: 3px;
		background: var(--accent, #5b8def);
		/* Grip texture so the handles are identifiable without colour. */
		background-image: repeating-linear-gradient(
			to bottom,
			transparent 0 3px,
			rgba(255, 255, 255, 0.55) 3px 4px
		);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--panel, #161920) 70%, transparent);
		transition:
			width 0.1s,
			background-color 0.1s;
	}
	.handle:hover .bar,
	.handle.active .bar {
		width: 7px;
		background-color: var(--accent-strong, #7aa4ff);
	}
	.handle:focus-visible .bar,
	.region:focus-visible {
		outline: 2px solid var(--accent-strong, #7aa4ff);
		outline-offset: 1px;
	}
	.zsb.disabled .region,
	.zsb.disabled .handle {
		cursor: not-allowed;
	}
</style>
