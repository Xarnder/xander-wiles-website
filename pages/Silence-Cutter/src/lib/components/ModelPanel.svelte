<script lang="ts">
	import { formatBytes } from '../asr/models';
	import { formatTimecode } from '../core/stats';
	import type { EditorStore } from '../state/editor.svelte';
	import { LANGUAGES } from '../state/settings';

	let { store }: { store: EditorStore } = $props();

	const model = $derived(store.selectedModel);
	const variant = $derived(model ? store.variantFor(model) : null);
	const size = $derived(model ? store.downloadSizeFor(model) : null);
	const cached = $derived(model ? store.asr.cached[model.id] : false);
	const busy = $derived(['downloading', 'loading', 'transcribing'].includes(store.asr.status));
	const needsAck = $derived(
		model?.family === 'crisperwhisper' && !store.licenceAcknowledged && !store.useMockAsr
	);
	const download = $derived(store.asr.download);
	const progress = $derived(store.asr.progress);
	const storage = $derived(store.asr.storage);
	const free = $derived(storage ? Math.max(0, storage.quota - storage.usage) : null);
	const tooBig = $derived(!cached && size !== null && free !== null && size > free);
</script>

<div class="model-panel">
	<label class="field">
		<span>Speech recognition model</span>
		<select bind:value={store.settings.modelId} disabled={busy} data-testid="model-select">
			{#each store.models as m (m.id)}
				<option value={m.id}>{m.tier} — {m.label}</option>
			{/each}
		</select>
	</label>

	{#if model}
		<dl class="facts">
			<dt>Download</dt>
			<dd>
				{size ? formatBytes(size) : 'not supported on this device'}
				{#if cached}<span class="cached">✓ cached on this device</span>{/if}
			</dd>
			<dt>Runs on</dt>
			<dd>
				{variant
					? variant.backend === 'webgpu'
						? `WebGPU (${variant.dtype.encoder_model}/${variant.dtype.decoder_model_merged})`
						: 'CPU (WebAssembly) — slower'
					: '—'}
			</dd>
			<dt>Memory</dt>
			<dd>≈ {formatBytes(model.estimatedMemoryBytes)}</dd>
			{#if free !== null}
				<dt>Storage</dt>
				<dd class:warn={tooBig}>
					{formatBytes(free)} free in this browser{storage?.persisted ? ' (persistent)' : ''}
				</dd>
			{/if}
			<dt>Output</dt>
			<dd class:warn={!model.verbatim}>
				{model.verbatim
					? 'Verbatim (keeps um, uh, repeats, false starts)'
					: 'NOT verbatim — may drop fillers, repeats and false starts'}
			</dd>
			<dt>Licence</dt>
			<dd>
				<a href={model.licence.url} target="_blank" rel="noreferrer">{model.licence.name}</a>
				{#if !model.licence.commercialUse}<span class="warn"> — non-commercial only</span>{/if}
			</dd>
		</dl>
		{#if tooBig}
			<p class="note warn-box">
				Not enough browser storage to keep this model ({formatBytes(size ?? 0)} needed). It will still
				work, but will be downloaded again next time. Free space or delete another cached model.
			</p>
		{/if}
		{#if !model.verbatim}
			<p class="note warn-box">
				Standard Whisper often "cleans up" speech. Its transcript can omit fillers and repetitions,
				so keep the detection mode on <strong>Conservative</strong>: the audio detector still
				protects anything audible.
			</p>
		{/if}
		{#if model.family === 'crisperwhisper' && !store.useMockAsr}
			<label class="ack">
				<input
					type="checkbox"
					checked={store.licenceAcknowledged}
					onchange={(e) => store.acknowledgeLicence(e.currentTarget.checked)}
					data-testid="licence-ack"
				/>
				I will use CrisperWhisper weights and their transcripts for non-commercial research only (or I
				hold a commercial licence from nyra health).
			</label>
		{/if}
	{/if}

	<label class="field">
		<span>Language</span>
		<select bind:value={store.settings.language} disabled={busy}>
			{#each LANGUAGES as [code, name] (code)}
				<option value={code}>{name}</option>
			{/each}
		</select>
	</label>

	<div class="actions">
		{#if store.asr.status === 'transcribing'}
			<button
				class="danger"
				onclick={() => store.cancelTranscription()}
				data-testid="cancel-transcribe">Cancel</button
			>
		{:else}
			<button
				class="primary"
				disabled={!store.info || busy || needsAck || !variant}
				onclick={() => store.transcribe()}
				data-testid="transcribe"
			>
				{store.transcript
					? 'Re-transcribe'
					: cached || store.useMockAsr
						? 'Transcribe'
						: 'Download model & transcribe'}
			</button>
		{/if}
		{#if model && cached && !busy}
			<button class="ghost" onclick={() => store.deleteCachedModel(model)} title="Free disk space"
				>Delete model</button
			>
		{/if}
	</div>

	<div class="status" aria-live="polite" data-testid="asr-status">
		{#if store.asr.status === 'downloading' && download}
			<p>
				<strong>
					{download.fromCache
						? 'Loading speech recognition model from this device…'
						: 'Downloading speech recognition model to this device.'}
				</strong>
			</p>
			<progress value={download.overallLoaded} max={download.overallTotal}></progress>
			<p class="mono small">
				{formatBytes(download.overallLoaded)} / {formatBytes(download.overallTotal)}
				{download.bytesPerSecond && !download.fromCache && download.overallLoaded > 10e6
					? ` · ${formatBytes(download.bytesPerSecond)}/s`
					: ''}
			</p>
			<p class="small dim">This downloads the AI model only. Your video is not uploaded.</p>
		{:else if store.asr.status === 'loading'}
			<p>
				<strong>Model cached locally.</strong> Preparing it on {variant?.backend === 'webgpu'
					? 'the GPU'
					: 'the CPU'}…
			</p>
		{:else if store.asr.status === 'transcribing'}
			<p>
				<strong>Transcribing</strong>
				{#if progress}— <span class="mono"
						>{formatTimecode(progress.processedSeconds).replace(/\.\d+$/, '')} / {formatTimecode(
							progress.totalSeconds
						).replace(/\.\d+$/, '')}</span
					>{/if}
			</p>
			<progress value={progress?.processedSeconds ?? 0} max={progress?.totalSeconds ?? 1}
			></progress>
			{#if progress?.speedFactor}<p class="small dim">
					{progress.speedFactor.toFixed(1)}× real time
				</p>{/if}
		{:else if store.asr.error}
			<p class="error">{store.asr.error}</p>
		{:else if store.transcript}
			<p class="small dim">
				{store.transcript.words.length.toLocaleString()} words · {store.transcript.mode} ·
				{store.asr.runtime?.backend ?? 'cached result'}
			</p>
		{/if}
	</div>
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 8px;
		font-size: 12px;
	}
	.field select {
		width: 100%;
	}
	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px 8px;
		margin: 6px 0 8px;
		font-size: 11px;
	}
	dt {
		color: var(--text-faint);
	}
	dd {
		margin: 0;
		color: var(--text-dim);
	}
	.cached {
		color: var(--keep);
		margin-left: 6px;
	}
	.warn {
		color: var(--remove);
	}
	.warn-box {
		border-left: 3px solid var(--manual);
		padding: 4px 8px;
		background: var(--panel-2);
		font-size: 11px;
		color: var(--text-dim);
	}
	.ack {
		display: flex;
		gap: 6px;
		font-size: 11px;
		color: var(--text-dim);
		margin: 6px 0;
		align-items: flex-start;
	}
	.actions {
		display: flex;
		gap: 6px;
		margin: 8px 0;
	}
	.status p {
		margin: 4px 0;
		font-size: 12px;
	}
	progress {
		width: 100%;
	}
	.small {
		font-size: 11px;
	}
	.dim {
		color: var(--text-faint);
	}
	.error {
		color: var(--remove);
	}
	a {
		color: var(--accent);
	}
	.note {
		margin: 6px 0;
	}
</style>
