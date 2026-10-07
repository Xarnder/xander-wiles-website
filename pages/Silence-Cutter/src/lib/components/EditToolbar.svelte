<script lang="ts">
	import { regionIndexAt } from '../core/edl';
	import { MIN_SELECTION } from '../core/selection';
	import { formatSpan } from '../core/selection';
	import { formatTimecode } from '../core/stats';
	import type { EditorStore } from '../state/editor.svelte';

	interface Props {
		store: EditorStore;
		onzoom: (factor: number) => void;
		onfit: () => void;
		onzoomselection: () => void;
		onplayselection: () => void;
		onpreviewcut: () => void;
		onnavcut: (dir: 1 | -1) => void;
	}
	let { store, onzoom, onfit, onzoomselection, onplayselection, onpreviewcut, onnavcut }: Props =
		$props();

	const sel = $derived(store.selection);
	const hasRange = $derived(!!sel && sel.end - sel.start >= MIN_SELECTION);
	const removedFrac = $derived(sel && hasRange ? store.removedFraction(sel) : 0);
	const region = $derived.by(() => {
		if (!store.edl.length) return null;
		const t = sel ? (sel.start + sel.end) / 2 : store.playhead;
		return store.segments[regionIndexAt(store.segments, t)] ?? null;
	});
</script>

<div class="toolbar" role="toolbar" aria-label="Edit tools">
	<div class="group tools" role="radiogroup" aria-label="Timeline tool">
		<button
			role="radio"
			aria-checked={store.tool === 'select'}
			class:on={store.tool === 'select'}
			onclick={() => store.setTool('select')}
			title="Select tool (V): click segments, drag to select ranges. Cut edges stay put."
			data-testid="tool-select">⬚ Select <kbd>V</kbd></button
		>
		<button
			role="radio"
			aria-checked={store.tool === 'trim'}
			class:on={store.tool === 'trim'}
			class:trim={store.tool === 'trim'}
			onclick={() => store.setTool('trim')}
			title="Trim tool (B): drag cut edges to move them. Clicks don't select."
			data-testid="tool-trim">⟷ Trim <kbd>B</kbd></button
		>
	</div>
	<div class="group">
		<button
			onclick={() => store.undo()}
			disabled={!store.canUndo}
			title={store.undoLabel ? `Undo: ${store.undoLabel} (⌘/Ctrl+Z)` : 'Undo (⌘/Ctrl+Z)'}
			data-testid="undo">↶ Undo</button
		>
		<button
			onclick={() => store.redo()}
			disabled={!store.canRedo}
			title={store.redoLabel
				? `Redo: ${store.redoLabel} (⌘/Ctrl+Shift+Z)`
				: 'Redo (⌘/Ctrl+Shift+Z)'}
			data-testid="redo">↷ Redo</button
		>
	</div>
	<div class="group">
		<button
			onclick={() => store.split()}
			disabled={!store.edl.length}
			title="Cut (split) the segment at the playhead (S or C)"
			data-testid="split">✂ Split <kbd>S</kbd></button
		>
		<button
			class="danger"
			onclick={() => store.removeSelection()}
			disabled={!hasRange || removedFrac > 0.999}
			title="Remove the selection (Delete)"
			data-testid="mark-remove">Remove <kbd>⌫</kbd></button
		>
		<button
			onclick={() => store.restoreSelection()}
			disabled={!store.edl.length}
			title="Keep / restore the selection, or the cut under the playhead (U)"
			data-testid="mark-keep">Keep <kbd>U</kbd></button
		>
		<button
			onclick={() => store.merge()}
			disabled={!hasRange}
			title="Merge the segments in the selection (M)"
			data-testid="merge">Merge</button
		>
	</div>
	<div class="group">
		<button
			onclick={() => onnavcut(-1)}
			disabled={!store.edl.length}
			title="Select previous cut ([)"
			data-testid="prev-cut"
			aria-label="Previous cut">⟨</button
		>
		<button
			onclick={onpreviewcut}
			disabled={!store.edl.length}
			title="Hear the nearest cut: plays 2 s either side in Edited mode (P)"
			data-testid="preview-cut">▶ Preview cut <kbd>P</kbd></button
		>
		<button
			onclick={() => onnavcut(1)}
			disabled={!store.edl.length}
			title="Select next cut (])"
			data-testid="next-cut"
			aria-label="Next cut">⟩</button
		>
	</div>

	<div class="info" data-testid="selection-info">
		{#if sel && hasRange}
			<span class="dot sel"></span>
			Selection <span class="mono">{formatTimecode(sel.start)} – {formatTimecode(sel.end)}</span>
			· {formatSpan(sel.end - sel.start)}
			{#if removedFrac > 0.999}· removed{:else if removedFrac > 0.001}· partly removed{/if}
			<button class="link" onclick={onplayselection} title="Play selection (Shift+Space)"
				>play</button
			>
		{:else if sel}
			<span class="dot sel"></span>
			In point <span class="mono">{formatTimecode(sel.start)}</span> — move the playhead and press
			<kbd>O</kbd> to set the out point
		{:else if region}
			<span class="dot" class:remove={region.action === 'remove'}></span>
			{region.action === 'remove' ? 'Cut' : 'Kept'}
			<span class="mono">{formatTimecode(region.start)} – {formatTimecode(region.end)}</span>
			· {region.manual
				? 'manual'
				: region.source === 'none'
					? 'speech'
					: `${region.source} silence`}
		{:else}
			Click a segment or drag on the timeline to select.
		{/if}
	</div>

	<div class="group zoom">
		<button
			class:on={store.snapping}
			onclick={() => (store.snapping = !store.snapping)}
			aria-pressed={store.snapping}
			title="Snap to words, cut edges and the playhead (N). Hold Alt while dragging to bypass."
			data-testid="snap">🧲 Snap</button
		>
		<button onclick={() => onzoom(1 / 1.6)} title="Zoom out (−)" aria-label="Zoom out">−</button>
		<button onclick={onfit} title="Fit whole recording (0)">Fit</button>
		<button onclick={onzoomselection} disabled={!hasRange} title="Zoom to selection (Z)">Sel</button
		>
		<button onclick={() => onzoom(1.6)} title="Zoom in (+)" aria-label="Zoom in">+</button>
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 2px;
		/* One line, always: the timeline below must never jump when the info text changes. */
		flex-wrap: nowrap;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.group {
		flex-shrink: 0;
	}
	.group {
		display: flex;
		gap: 4px;
	}
	.group button {
		font-size: 12px;
		padding: 3px 8px;
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.group button kbd {
		font-size: 10px;
		padding: 0 4px;
	}
	.group button.on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.tools {
		padding: 2px;
		border: 1px solid var(--border);
		border-radius: 7px;
		gap: 2px;
	}
	.tools button {
		border-color: transparent;
	}
	.group button.on.trim {
		border-color: var(--manual);
		background: color-mix(in srgb, var(--manual) 22%, transparent);
	}
	.danger:not(:disabled) {
		color: var(--remove);
		font-weight: 600;
	}
	.info {
		font-size: 12px;
		color: var(--text-dim);
		display: flex;
		align-items: center;
		gap: 5px;
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--keep);
	}
	.dot.remove {
		background: var(--remove);
	}
	.dot.sel {
		background: var(--accent);
	}
	.link {
		border: none;
		background: none;
		color: var(--accent);
		padding: 0 2px;
		font-size: 12px;
		text-decoration: underline;
	}
	.zoom {
		margin-left: auto;
	}
</style>
