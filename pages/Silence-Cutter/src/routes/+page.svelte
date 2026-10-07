<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import DiagnosticsPanel from '#lib/components/DiagnosticsPanel.svelte';
	import DropZone from '#lib/components/DropZone.svelte';
	import EditToolbar from '#lib/components/EditToolbar.svelte';
	import ExportDialog from '#lib/components/ExportDialog.svelte';
	import Inspector from '#lib/components/Inspector.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import StatsBar from '#lib/components/StatsBar.svelte';
	import Timeline, { type TimelineActions } from '#lib/components/Timeline.svelte';
	import ToastHost from '#lib/components/ToastHost.svelte';
	import TranscriptPanel from '#lib/components/TranscriptPanel.svelte';
	import VideoPreview from '#lib/components/VideoPreview.svelte';
	import { MIN_SELECTION } from '#lib/core/selection.ts';
	import { Player } from '#lib/playback/player.svelte.ts';
	import { SHORTCUTS } from '#lib/shortcuts.ts';
	import { EditorStore } from '#lib/state/editor.svelte.ts';
	import { saveUserDefaults } from '#lib/state/settings.ts';

	const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
	const store = new EditorStore({
		mockAsr: params.get('asr') === 'mock',
		crisperWhisperEnabled: __CRISPERWHISPER_ENABLED__
	});
	const player = new Player({
		get timeMap() {
			return store.timeMap;
		},
		get previewMode() {
			return store.previewMode;
		},
		get transitions() {
			return store.settings.transitions;
		},
		get frameRate() {
			return store.info?.video?.frameRate ?? 30;
		}
	});

	let timeline = $state<ReturnType<typeof Timeline> | null>(null);
	let showExport = $state(false);
	let showDiagnostics = $state(false);
	let showShortcuts = $state(false);

	onMount(() => {
		void store.init();
		(window as unknown as { __editor: unknown }).__editor = { store, player };
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			void store.saveNow();
			// Transcription/export progress would be lost: ask the browser to confirm.
			if (store.isBusy) {
				e.preventDefault();
				e.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});

	// Keep the store's playhead in sync with the video.
	$effect(() => {
		store.playhead = player.currentTime;
	});

	// Autosave settings (edits and transcripts save themselves), and remember them as the
	// starting point for the next new project.
	$effect(() => {
		const snapshot = $state.snapshot(store.settings);
		untrack(() => {
			store.scheduleSave();
			if (store.info) saveUserDefaults(snapshot);
		});
	});

	const timelineActions: TimelineActions = {
		seek: (t) => seek(t),
		select: (r) => (store.selection = r),
		clickSegment: (t, extend) => store.clickSegment(t, extend),
		selectSegmentAt: (t, extend) => void store.selectSegmentAt(t, extend),
		removeSelection: () => void store.removeSelection(),
		restoreSelection: () => void store.restoreSelection(),
		split: (t) => void store.split(t),
		playSelection: () => playSelection(),
		dragBoundary: (i, from, to) => void store.dragBoundary(i, from, to),
		selectWord: (i, extend) => store.selectWord(i, extend),
		selectWordRange: (a, b) => store.selectWordRange(a, b),
		threshold: (db) => (store.settings.audio.thresholdDb = db)
	};

	function playSelection() {
		const sel = store.selection;
		if (sel && sel.end - sel.start >= MIN_SELECTION) void player.playRange(sel.start, sel.end);
		else void player.playRange(Math.max(0, store.playhead - 2), store.playhead + 2);
	}

	function goToSelection(r: { start: number; end: number } | null) {
		if (!r) return;
		seek(r.start);
		timeline?.reveal(r.start);
	}

	function seek(t: number) {
		player.seek(t);
		store.playhead = t;
	}

	/** Transcript word click: select it (shift extends) and move the playhead there. */
	function onWordSelect(i: number, extend: boolean) {
		const w = store.words[i];
		if (!w) return;
		store.selectWord(i, extend);
		if (!extend) seek(w.start);
		timeline?.reveal(w.start);
	}

	function onWordRange(a: number, b: number) {
		store.selectWordRange(a, b);
		const w = store.words[b];
		if (w) timeline?.reveal(w.start);
	}

	/** Play ~2 s either side of the selected (or next) cut in Edited mode, to hear the join. */
	function previewCut() {
		const sel = store.selection;
		let cut =
			sel && sel.end - sel.start >= MIN_SELECTION && store.removedFraction(sel) > 0.5 ? sel : null;
		if (!cut) cut = store.selectAdjacentCut(1);
		if (!cut) return;
		store.previewMode = 'edited';
		timeline?.reveal(cut.start);
		void player.playRange(Math.max(0, cut.start - 2), Math.min(store.duration, cut.end + 2));
	}

	function navCut(dir: 1 | -1) {
		goToSelection(store.selectAdjacentCut(dir));
	}

	function cutBoundaries(): number[] {
		const out: number[] = [];
		for (const r of store.edl) if (r.action === 'remove') out.push(r.start, r.end);
		return out;
	}

	function nudgeSelection(delta: number) {
		const s = store.selection;
		if (!s) return;
		store.selection = {
			start: Math.max(0, s.start + delta),
			end: Math.min(store.duration, s.end + delta)
		};
	}

	function onkeydown(e: KeyboardEvent) {
		// Dialogs handle their own keys (Escape closes them natively).
		if (document.querySelector('dialog[open]')) return;
		const target = e.target instanceof Element ? e.target : null;
		if (target?.closest('input, select, textarea, [contenteditable]') && e.key !== 'Escape') return;
		if (!store.info) return;
		const mod = e.metaKey || e.ctrlKey;
		const key = e.key;
		let handled = true;
		if (mod && key.toLowerCase() === 'z') {
			if (e.shiftKey) store.redo();
			else store.undo();
		} else if (mod && key.toLowerCase() === 'y') store.redo();
		else if (mod && key.toLowerCase() === 'a') store.selectAll();
		else if (mod) handled = false;
		else if (key === ' ' && e.shiftKey) playSelection();
		else if (key === ' ') player.toggle();
		else if (key === 'i' || key === 'I') store.setIn(store.playhead);
		else if (key === 'o' || key === 'O') store.setOut(store.playhead);
		else if (key === 'u' || key === 'U') store.restoreSelection();
		else if (key === 'x' || key === 'X') store.removeSelection();
		else if (key === 'c' || key === 'C') store.split();
		else if (key === ']') navCut(1);
		else if (key === '[') navCut(-1);
		else if (key === '}') goToSelection(store.selectAdjacentSegment(1));
		else if (key === '{') goToSelection(store.selectAdjacentSegment(-1));
		else if (key === 'z' || key === 'Z') {
			if (store.selection) timeline?.zoomTo(store.selection);
		} else if (key === 'p' || key === 'P') previewCut();
		else if (key === 'n' || key === 'N') store.snapping = !store.snapping;
		else if (key === 'v' || key === 'V') store.setTool('select', true);
		else if (key === 'b' || key === 'B') store.setTool('trim', true);
		else if (key === 'Home') seek(0);
		else if (key === 'End') seek(store.duration);
		else if (key === 'j' || key === 'J') player.shuttleBack();
		else if (key === 'K' && e.shiftKey) store.mark('keep');
		else if (key === 'k') player.shuttleStop();
		else if (key === 'l' || key === 'L') player.shuttleForward();
		else if (key === 'e' || key === 'E')
			store.previewMode = store.previewMode === 'edited' ? 'original' : 'edited';
		else if (key === 'Delete' || key === 'Backspace' || key === 'r' || key === 'R')
			store.mark('remove');
		else if (key === 't' || key === 'T') store.toggleAt(store.playhead);
		else if (key === 's' || key === 'S') store.split();
		else if (key === 'm' || key === 'M') store.merge();
		else if (key === 'Escape') store.clearSelection();
		else if (key === '+' || key === '=') timeline?.zoomBy(1.6);
		else if (key === '-' || key === '_') timeline?.zoomBy(1 / 1.6);
		else if (key === '0') timeline?.fit();
		else if (key === '?') showShortcuts = true;
		else if (key === 'ArrowLeft' || key === 'ArrowRight') {
			const dir = key === 'ArrowLeft' ? -1 : 1;
			if (e.altKey) nudgeSelection(dir * (e.shiftKey ? 0.1 : 0.01));
			else if (e.shiftKey) player.nudge(dir);
			else player.stepFrames(dir);
			timeline?.reveal(player.currentTime);
		} else if (key === 'ArrowUp' || key === 'ArrowDown') {
			const b = cutBoundaries();
			const t = player.currentTime;
			const next =
				key === 'ArrowDown'
					? b.find((x) => x > t + 1e-3)
					: [...b].reverse().find((x) => x < t - 1e-3);
			if (next !== undefined) {
				seek(next);
				timeline?.reveal(next);
			}
		} else handled = false;
		if (handled) e.preventDefault();
	}

	async function onexport(mode: 'save' | 'download') {
		showExport = true;
		await store.startExport(mode);
		if (store.exportState.status === 'idle') showExport = false;
	}
</script>

<svelte:window {onkeydown} />
<svelte:head><title>Silence Cutter — remove silence locally, keep every word</title></svelte:head>

<div class="app">
	<AppHeader
		caps={store.caps}
		fileName={store.file?.name ?? null}
		onclose={() => store.closeFile()}
		ondiagnostics={() => (showDiagnostics = true)}
		onshortcuts={() => (showShortcuts = true)}
	/>

	{#if !store.file}
		<DropZone onfile={(f, h) => store.openFile(f, h)} error={store.analysis.error} />
	{:else}
		<main class="workspace">
			<div class="video-area">
				{#if store.mediaUrl}
					<VideoPreview
						src={store.mediaUrl}
						{player}
						timeMap={store.timeMap}
						duration={store.duration}
						mode={store.previewMode}
						onmode={(m) => (store.previewMode = m)}
					/>
				{/if}
			</div>

			<div class="transcript-area">
				<TranscriptPanel
					words={store.words}
					edl={store.edl}
					playhead={store.playhead}
					focusedWord={store.focusedWord}
					mode={store.transcript?.mode ?? null}
					selection={store.selection}
					partial={store.asr.status === 'transcribing'}
					onwordselect={onWordSelect}
					onwordrange={onWordRange}
				/>
			</div>

			<div class="inspector-area">
				<Inspector {store} {onexport} />
			</div>

			<div class="timeline-area">
				<EditToolbar
					{store}
					onzoom={(f) => timeline?.zoomBy(f)}
					onfit={() => timeline?.fit()}
					onzoomselection={() => store.selection && timeline?.zoomTo(store.selection)}
					onplayselection={playSelection}
					onpreviewcut={previewCut}
					onnavcut={navCut}
				/>
				<div class="timeline-wrap">
					{#if store.analysis.status === 'running' && !store.envelope}
						<div class="analysing" data-testid="analysing">
							<p>Analysing audio on this device… {Math.round(store.analysis.progress * 100)}%</p>
							<progress value={store.analysis.progress} max="1"></progress>
						</div>
					{:else if store.analysis.status === 'error'}
						<div class="analysing error" role="alert" data-testid="analysis-error">
							<p>{store.analysis.error}</p>
						</div>
					{:else}
						<Timeline
							bind:this={timeline}
							duration={store.duration}
							peaks={store.peaks}
							envelope={store.envelope}
							thresholdDb={store.settings.audio.thresholdDb}
							audioSpeech={store.audioSpeech}
							transcriptSpeech={store.transcriptSpeech}
							combinedSilence={store.proposal?.combinedSilence ?? []}
							edl={store.edl}
							segments={store.segments}
							words={store.words}
							playhead={store.playhead}
							selection={store.selection}
							focusedWord={store.focusedWord}
							following={player.playing}
							snapping={store.snapping}
							tool={store.tool}
							actions={timelineActions}
						/>
					{/if}
				</div>
				<div class="footer">
					<StatsBar stats={store.stats} />
					{#if store.manualEditCount > 0}
						<div class="manual" data-testid="manual-count">
							{store.manualEditCount} manual edit{store.manualEditCount === 1 ? '' : 's'} preserved
							<button
								class="small"
								onclick={() => store.resetToAutomatic()}
								data-testid="reset-auto">Reset to automatic</button
							>
						</div>
					{/if}
					{#if store.analysis.restored}
						<span class="restored">Restored your previous session for this file.</span>
					{/if}
				</div>
			</div>
		</main>
	{/if}
</div>

<ToastHost toasts={store.toasts} />

{#if showExport}
	<ExportDialog {store} onclose={() => (showExport = false)} />
{/if}
{#if showDiagnostics}
	<DiagnosticsPanel {store} onclose={() => (showDiagnostics = false)} />
{/if}
{#if showShortcuts}
	<Modal title="Keyboard shortcuts" onclose={() => (showShortcuts = false)} testid="shortcuts">
		{#each SHORTCUTS as g (g.group)}
			<h3 class="sc-group">{g.group}</h3>
			<table class="sc">
				<tbody>
					{#each g.items as s, idx (idx)}
						<tr>
							<td
								>{#each s.keys as k, i (i)}{#if i > 0}+{/if}<kbd>{k}</kbd>{/each}</td
							>
							<td>{s.action}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/each}
	</Modal>
{/if}

<style>
	.app {
		height: 100vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.workspace {
		flex: 1;
		min-height: 0;
		display: grid;
		gap: 8px;
		padding: 8px;
		grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.9fr) 320px;
		grid-template-rows: minmax(220px, 38vh) minmax(0, 1fr);
		grid-template-areas:
			'video transcript inspector'
			'timeline timeline inspector';
	}
	.video-area {
		grid-area: video;
		min-height: 0;
	}
	.transcript-area {
		grid-area: transcript;
		min-height: 0;
	}
	.inspector-area {
		grid-area: inspector;
		min-height: 0;
	}
	.timeline-area {
		grid-area: timeline;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-height: 0;
	}
	.timeline-wrap {
		flex: 1;
		min-height: 220px;
		position: relative;
	}
	.analysing {
		height: 100%;
		display: grid;
		place-content: center;
		text-align: center;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--panel);
		color: var(--text-dim);
	}
	.analysing progress {
		width: 320px;
	}
	.analysing.error {
		color: var(--remove);
		padding: 20px;
	}
	.footer {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.manual {
		font-size: 12px;
		color: var(--manual);
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.manual .small {
		font-size: 11px;
		padding: 2px 6px;
	}
	.restored {
		font-size: 11px;
		color: var(--text-faint);
	}
	.sc-group {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dim);
		margin: 12px 0 4px;
	}
	.sc {
		width: 100%;
		font-size: 12px;
		border-collapse: collapse;
	}
	.sc td {
		padding: 3px 0;
	}
	.sc td:first-child {
		width: 42%;
		white-space: nowrap;
	}
	@media (max-width: 1180px) {
		.workspace {
			grid-template-columns: minmax(0, 1fr) 300px;
			grid-template-rows: minmax(200px, 34vh) minmax(160px, 22vh) minmax(0, 1fr);
			grid-template-areas:
				'video inspector'
				'transcript inspector'
				'timeline timeline';
		}
	}
</style>
