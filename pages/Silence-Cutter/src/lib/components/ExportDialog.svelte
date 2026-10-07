<script lang="ts">
	import { formatBytes } from '../asr/models';
	import { formatDuration } from '../core/stats';
	import type { EditorStore } from '../state/editor.svelte';
	import Modal from './Modal.svelte';

	let { store, onclose }: { store: EditorStore; onclose: () => void } = $props();
	const e = $derived(store.exportState);
</script>

<Modal title="Export edited video" {onclose} testid="export-dialog">
	{#if e.status === 'running'}
		<p>
			Encoding on this device — <strong>{Math.round(e.progress * 100)}%</strong>
			<span class="dim">({e.phase})</span>
		</p>
		<progress value={e.progress} max="1" data-testid="export-progress"></progress>
		<p class="dim small">
			Nothing is uploaded. Large videos may take a while; you can keep editing.
		</p>
		<button class="danger" onclick={() => store.cancelExport()}>Cancel export</button>
	{:else if e.status === 'done' && e.summary}
		<p class="ok" data-testid="export-done">✓ Export complete</p>
		<dl>
			<dt>File</dt>
			<dd>{e.fileName}</dd>
			<dt>Duration</dt>
			<dd>{formatDuration(e.summary.editedSeconds)}</dd>
			<dt>Size</dt>
			<dd>{formatBytes(e.summary.bytes)}</dd>
			<dt>Video</dt>
			<dd>
				{e.summary.videoCodec?.toUpperCase()}
				{e.summary.width}×{e.summary.height} · {(e.summary.videoBitrate / 1e6).toFixed(1)} Mbit/s
			</dd>
			<dt>Audio</dt>
			<dd>
				{e.summary.audioCodec?.toUpperCase()} · {Math.round(e.summary.audioBitrate / 1000)} kbit/s{e
					.summary.usedAacPolyfill
					? ' (software AAC encoder)'
					: ''}
			</dd>
			<dt>Time</dt>
			<dd>
				{(e.summary.wallMs / 1000).toFixed(1)} s ({(
					e.summary.editedSeconds /
					(e.summary.wallMs / 1000)
				).toFixed(1)}× real time)
			</dd>
		</dl>
		{#if e.savedToDisk}
			<p>Saved directly to the file you chose.</p>
		{:else if e.url}
			<a class="button primary" href={e.url} download={e.fileName} data-testid="export-link"
				>Download {e.fileName}</a
			>
			<!-- svelte-ignore a11y_media_has_caption -->
			<video src={e.url} controls class="result" data-testid="export-result"></video>
		{/if}
	{:else if e.status === 'error'}
		<p class="error" role="alert">Export failed: {e.error}</p>
		<p class="dim small">
			If your browser cannot encode this resolution with H.264, try a Chromium-based browser
			(Chrome/Edge) or the "Smaller file" preset.
		</p>
	{:else if e.status === 'cancelled'}
		<p>Export cancelled.</p>
	{/if}
</Modal>

<style>
	progress {
		width: 100%;
	}
	.dim {
		color: var(--text-faint);
	}
	.small {
		font-size: 12px;
	}
	.ok {
		color: var(--keep);
		font-weight: 600;
	}
	.error {
		color: var(--remove);
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 3px 12px;
		font-size: 12px;
	}
	dt {
		color: var(--text-faint);
	}
	dd {
		margin: 0;
	}
	.button {
		display: inline-block;
		text-decoration: none;
		padding: 6px 12px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: #fff;
		font-weight: 600;
	}
	.result {
		width: 100%;
		margin-top: 10px;
		border-radius: var(--radius-sm);
		background: #000;
	}
</style>
