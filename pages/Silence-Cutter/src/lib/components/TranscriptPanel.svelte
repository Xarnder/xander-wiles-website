<script lang="ts">
	/**
	 * Verbatim transcript, and a second way to edit: click a word to select it (and seek), shift-
	 * click or drag to select a run of words, then Delete / U like on the timeline. Words are
	 * rendered once; the "current word" highlight during playback is applied imperatively (one
	 * class toggle per change) so long transcripts stay cheap.
	 */
	import { regionIndexAt } from '../core/edl';
	import { formatSpan, MIN_SELECTION, wordsInRange } from '../core/selection';
	import { formatTimecode } from '../core/stats';
	import type { EditRegion, Range, TranscriptionMode, TranscriptWord } from '../core/types';

	interface Props {
		words: TranscriptWord[];
		edl: EditRegion[];
		playhead: number;
		focusedWord: number | null;
		selection: Range | null;
		mode: TranscriptionMode | null;
		partial: boolean;
		/** Select word i (extend: from the anchor word) and seek to it. */
		onwordselect: (index: number, extend: boolean) => void;
		onwordrange: (a: number, b: number) => void;
	}

	let {
		words,
		edl,
		playhead,
		focusedWord,
		selection,
		mode,
		partial,
		onwordselect,
		onwordrange
	}: Props = $props();

	let dragAnchor: number | null = null;

	/** [first, last] word indices inside the current selection. */
	const selected = $derived(
		selection && selection.end - selection.start >= MIN_SELECTION
			? wordsInRange(words, selection)
			: null
	);

	let container: HTMLDivElement;
	let follow = $state(true);
	let lastCurrent: HTMLElement | null = null;

	/** Paragraphs split at pauses > 1.2 s, for readability. */
	const paragraphs = $derived.by(() => {
		const out: TranscriptWord[][] = [];
		let cur: TranscriptWord[] = [];
		for (let i = 0; i < words.length; i++) {
			const w = words[i];
			if (cur.length && w.start - cur[cur.length - 1].end > 1.2) {
				out.push(cur);
				cur = [];
			}
			cur.push(w);
		}
		if (cur.length) out.push(cur);
		return out;
	});

	/** Words whose time span is (mostly) inside removed material. */
	const removed = $derived.by(() => {
		const flags = new Uint8Array(words.length);
		if (!edl.length) return flags;
		for (let i = 0; i < words.length; i++) {
			const w = words[i];
			const mid = (w.start + w.end) / 2;
			const r = edl[regionIndexAt(edl, mid)];
			if (r?.action === 'remove') flags[i] = 1;
		}
		return flags;
	});

	const counts = $derived.by(() => {
		const c = { filler: 0, partial: 0, event: 0, breath: 0 };
		for (const w of words) if (w.kind !== 'word') c[w.kind]++;
		return c;
	});

	function currentIndex(t: number): number {
		let lo = 0;
		let hi = words.length - 1;
		let ans = -1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (words[mid].start <= t) {
				ans = mid;
				lo = mid + 1;
			} else hi = mid - 1;
		}
		return ans >= 0 && t <= words[ans].end + 0.15 ? ans : -1;
	}

	$effect(() => {
		const i = currentIndex(playhead);
		const el = i >= 0 ? (container?.querySelector(`[data-i="${i}"]`) as HTMLElement | null) : null;
		if (el === lastCurrent) return;
		lastCurrent?.classList.remove('current');
		el?.classList.add('current');
		lastCurrent = el;
		if (el && follow) {
			const box = container.getBoundingClientRect();
			const r = el.getBoundingClientRect();
			if (r.top < box.top + 30 || r.bottom > box.bottom - 30) {
				el.scrollIntoView({ block: 'center', behavior: 'smooth' });
			}
		}
	});

	$effect(() => {
		if (focusedWord === null || !container) return;
		const el = container.querySelector(`[data-i="${focusedWord}"]`);
		el?.scrollIntoView({ block: 'nearest' });
	});

	function wordIndexAt(e: PointerEvent): number | null {
		const el = (e.target as HTMLElement).closest?.('[data-i]') as HTMLElement | null;
		return el ? Number(el.dataset.i) : null;
	}

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0) return;
		const i = wordIndexAt(e);
		if (i === null) return;
		e.preventDefault(); // no native text selection while selecting words
		onwordselect(i, e.shiftKey);
		dragAnchor = e.shiftKey && selected ? selected[0] : i;
	}

	function onpointerover(e: PointerEvent) {
		if (dragAnchor === null || !(e.buttons & 1)) return;
		const i = wordIndexAt(e);
		if (i !== null) onwordrange(dragAnchor, i);
	}

	function onpointerup() {
		dragAnchor = null;
	}
</script>

<section class="transcript" aria-label="Verbatim transcript">
	<header>
		<h2>Transcript</h2>
		{#if mode}
			<span class="badge" class:warn={mode !== 'verbatim'}
				>{mode === 'verbatim' ? 'Verbatim' : 'Not verbatim'}</span
			>
		{/if}
		<label class="follow"><input type="checkbox" bind:checked={follow} /> Follow</label>
	</header>
	{#if selected && selection}
		<div class="selhint" data-testid="transcript-selection">
			{selected[1] - selected[0] + 1} word{selected[1] === selected[0] ? '' : 's'} selected ·
			{formatSpan(selection.end - selection.start)} — <kbd>Delete</kbd> remove · <kbd>U</kbd> keep ·
			<kbd>Esc</kbd> clear
		</div>
	{/if}
	{#if words.length}
		<div class="legend">
			<span class="k filler">[UM] fillers {counts.filler}</span>
			<span class="k partial">cut-off {counts.partial}</span>
			<span class="k event">events {counts.event}</span>
			<span class="k breath">breaths {counts.breath}</span>
			<span class="k removed">removed</span>
		</div>
	{/if}
	<!-- Words are selected with the pointer; keyboard users edit with the timeline shortcuts. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="body"
		bind:this={container}
		{onpointerdown}
		{onpointerover}
		{onpointerup}
		data-testid="transcript"
	>
		{#if !words.length}
			<p class="empty">
				{partial
					? 'Transcribing…'
					: 'No transcript yet. Transcribe to see every word — including um, uh, repeats and false starts — aligned to the timeline.'}
			</p>
		{:else}
			{#each paragraphs as para (para[0].index)}
				<p>
					<span class="ts mono">{formatTimecode(para[0].start).replace(/\.\d+$/, '')}</span>
					<!-- Explicit spaces keep copy/paste of the transcript readable. -->
					<!-- eslint-disable svelte/no-useless-mustaches -->
					{#each para as w (w.index)}
						<span
							class="w {w.kind}"
							class:removed={removed[w.index] === 1}
							class:focused={focusedWord === w.index}
							class:selected={selected !== null && w.index >= selected[0] && w.index <= selected[1]}
							data-i={w.index}
							title="{formatTimecode(w.start)} – {formatTimecode(w.end)}">{w.text}</span
						>{' '}
					{/each}
				</p>
			{/each}
			{#if partial}<p class="empty">Transcribing…</p>{/if}
		{/if}
	</div>
</section>

<style>
	.transcript {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-bottom: 1px solid var(--border);
	}
	h2 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dim);
		margin: 0;
	}
	.badge {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 10px;
		background: var(--keep-soft);
		color: var(--keep);
		font-weight: 600;
	}
	.badge.warn {
		background: var(--remove-soft);
		color: var(--remove);
	}
	.follow {
		margin-left: auto;
		font-size: 11px;
		color: var(--text-dim);
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		padding: 6px 10px;
		font-size: 10px;
		color: var(--text-dim);
		border-bottom: 1px solid var(--border);
	}
	.k::before {
		content: '';
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		margin-right: 4px;
		vertical-align: -1px;
	}
	.k.filler::before {
		background: var(--filler);
	}
	.k.partial::before {
		background: var(--partial);
	}
	.k.event::before {
		background: var(--event);
	}
	.k.breath::before {
		background: var(--breath);
	}
	.k.removed::before {
		background: var(--remove);
	}
	.body {
		overflow-y: auto;
		padding: 6px 12px 16px;
		flex: 1;
		min-height: 0;
		font-size: 14px;
		line-height: 1.75;
	}
	p {
		margin: 0 0 10px;
	}
	.ts {
		font-size: 10px;
		color: var(--text-faint);
		margin-right: 6px;
	}
	.empty {
		color: var(--text-faint);
		font-size: 12px;
		line-height: 1.5;
	}
	.w {
		cursor: pointer;
		border-radius: 3px;
		padding: 0 1px;
	}
	.w:hover {
		background: var(--panel-3);
	}
	.w.filler {
		color: var(--filler);
		font-weight: 600;
	}
	.w.partial {
		color: var(--partial);
		font-style: italic;
	}
	.w.event {
		color: var(--event);
		font-style: italic;
	}
	.w.breath {
		color: var(--breath);
		font-style: italic;
	}
	.w.removed {
		text-decoration: line-through;
		text-decoration-color: var(--remove);
		opacity: 0.55;
	}
	.selhint {
		font-size: 11px;
		color: var(--text-dim);
		padding: 5px 10px;
		background: var(--accent-soft);
		border-bottom: 1px solid var(--border);
	}
	.selhint kbd {
		font-size: 10px;
	}
	.w.selected {
		background: var(--accent-soft);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.w.focused {
		outline: 1.5px solid var(--accent);
	}
	.w:global(.current) {
		background: var(--accent);
		color: #fff;
		opacity: 1;
	}
</style>
