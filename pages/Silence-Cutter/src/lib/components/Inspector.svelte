<script lang="ts">
	import { suggestThreshold } from '../core/audioDetector';
	import { CUT_MODE_INFO } from '../core/combine';
	import type { CutMode } from '../core/types';
	import { EXPORT_QUALITY_INFO, type ExportQuality } from '../media/exportPlan';
	import type { EditorStore } from '../state/editor.svelte';
	import { CUT_PRESETS, matchingPreset, type CutPreset } from '../state/settings';
	import ModelPanel from './ModelPanel.svelte';
	import ParamSlider from './ParamSlider.svelte';

	let { store, onexport }: { store: EditorStore; onexport: (mode: 'save' | 'download') => void } =
		$props();

	const s = $derived(store.settings);
	const modes: CutMode[] = ['conservative', 'audio', 'transcript', 'aggressive'];
	const qualities: ExportQuality[] = ['source', 'smaller', 'high'];
	const effective = $derived(store.proposal?.effectiveMode);
	const presets = Object.entries(CUT_PRESETS) as Array<
		[CutPreset, (typeof CUT_PRESETS)[CutPreset]]
	>;
	const activePreset = $derived(matchingPreset(store.settings));
	const hasTranscript = $derived(!!store.transcript);
	const canSave =
		typeof (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
</script>

<aside class="inspector" aria-label="Detection and export settings">
	<details open>
		<summary>Detection mode</summary>
		<div class="modes" role="radiogroup" aria-label="Cut mode">
			{#each modes as m (m)}
				<label class="mode" class:active={s.cut.mode === m}>
					<input
						type="radio"
						name="mode"
						value={m}
						bind:group={store.settings.cut.mode}
						data-testid="mode-{m}"
					/>
					<span class="name"
						>{CUT_MODE_INFO[m].label}{m === 'conservative' ? ' (default)' : ''}</span
					>
					<span class="desc">{CUT_MODE_INFO[m].description}</span>
				</label>
			{/each}
		</div>
		{#if effective && effective !== s.cut.mode}
			<p class="note">No transcript yet — using the <strong>Audio</strong> detector only.</p>
		{/if}
	</details>

	<details open>
		<summary>Cut padding</summary>
		<div class="presets" role="radiogroup" aria-label="Padding preset">
			{#each presets as [key, p] (key)}
				<button
					role="radio"
					aria-checked={activePreset === key}
					class:on={activePreset === key}
					title="{p.hint} Lead {p.leadMs} ms · trail {p.trailMs} ms · min silence {p.minSilenceMs} ms"
					onclick={() => store.applyPreset(key)}
					data-testid="preset-{key}">{p.label}</button
				>
			{/each}
		</div>
		<ParamSlider
			label="Lead (pre-roll)"
			unit="ms"
			min={0}
			max={1000}
			step={10}
			value={s.cut.leadMs}
			hint="Kept before speech begins."
			testid="lead"
			onchange={(v) => (store.settings.cut.leadMs = v)}
		/>
		<ParamSlider
			label="Trail (post-roll)"
			unit="ms"
			min={0}
			max={1500}
			step={10}
			value={s.cut.trailMs}
			hint="Kept after speech finishes."
			testid="trail"
			onchange={(v) => (store.settings.cut.trailMs = v)}
		/>
		<ParamSlider
			label="Minimum silence to cut"
			unit="ms"
			min={100}
			max={5000}
			step={50}
			value={s.cut.minSilenceMs}
			hint="Shorter pauses are natural and always kept."
			testid="min-silence"
			onchange={(v) => (store.settings.cut.minSilenceMs = v)}
		/>
	</details>

	<details open>
		<summary>Audio level detector</summary>
		<ParamSlider
			label="Silence threshold"
			unit="dB"
			min={-80}
			max={-5}
			value={s.audio.thresholdDb}
			hint="Below this level counts as silence. Drag the red line on the timeline too."
			testid="threshold"
			onchange={(v) => (store.settings.audio.thresholdDb = v)}
		/>
		<button
			class="ghost small"
			disabled={!store.envelope}
			onclick={() =>
				store.envelope && (store.settings.audio.thresholdDb = suggestThreshold(store.envelope))}
			>Auto threshold</button
		>
		<ParamSlider
			label="Hysteresis"
			unit="dB"
			min={0}
			max={20}
			value={s.audio.hysteresisDb}
			hint="Speech ends only below threshold minus this."
			onchange={(v) => (store.settings.audio.hysteresisDb = v)}
		/>
		<ParamSlider
			label="Attack"
			unit="ms"
			min={0}
			max={200}
			step={5}
			value={s.audio.attackMs}
			hint="Level must stay above threshold this long to count as speech."
			onchange={(v) => (store.settings.audio.attackMs = v)}
		/>
		<ParamSlider
			label="Release / hangover"
			unit="ms"
			min={0}
			max={1000}
			step={10}
			value={s.audio.releaseMs}
			hint="Dips shorter than this never split speech."
			onchange={(v) => (store.settings.audio.releaseMs = v)}
		/>
		<ParamSlider
			label="Minimum speech"
			unit="ms"
			min={0}
			max={500}
			step={10}
			value={s.audio.minSpeechMs}
			hint="Shorter blips (clicks, bumps) are ignored."
			onchange={(v) => (store.settings.audio.minSpeechMs = v)}
		/>
	</details>

	<details open>
		<summary>Transcript detector</summary>
		<label class="check">
			<input type="checkbox" bind:checked={store.settings.transcript.eventsAreSpeech} />
			Vocal events ([laughter], [cough]…) count as speech
		</label>
		<label class="check">
			<input type="checkbox" bind:checked={store.settings.transcript.breathsAreSpeech} />
			Breaths and noises count as speech
		</label>
		<ModelPanel {store} />
	</details>

	<details>
		<summary>Audio transitions</summary>
		<ParamSlider
			label="Fade-in"
			unit="ms"
			min={0}
			max={200}
			value={s.transitions.fadeInMs}
			hint="After each cut. Prevents clicks."
			onchange={(v) => (store.settings.transitions.fadeInMs = v)}
		/>
		<ParamSlider
			label="Fade-out"
			unit="ms"
			min={0}
			max={200}
			value={s.transitions.fadeOutMs}
			hint="Before each cut."
			onchange={(v) => (store.settings.transitions.fadeOutMs = v)}
		/>
		<ParamSlider
			label="Crossfade"
			unit="ms"
			min={0}
			max={300}
			step={5}
			value={s.transitions.crossfadeMs}
			hint="Optional equal-power crossfade centred on each join (replaces the fades). Video stays a jump cut."
			onchange={(v) => (store.settings.transitions.crossfadeMs = v)}
		/>
	</details>

	<details open>
		<summary>Export</summary>
		<div class="qualities" role="radiogroup" aria-label="Export quality">
			{#each qualities as q (q)}
				<label class="quality">
					<input type="radio" name="quality" value={q} bind:group={store.settings.exportQuality} />
					<span>{EXPORT_QUALITY_INFO[q].label}</span>
				</label>
			{/each}
		</div>
		<p class="note">MP4 (H.264 + AAC where available), encoded on this device.</p>
		<div class="export-actions">
			{#if canSave}
				<button
					class="primary"
					disabled={!store.info || store.exportState.status === 'running'}
					onclick={() => onexport('save')}
					data-testid="export-save"
				>
					Save edited video…
				</button>
			{/if}
			<button
				class={canSave ? '' : 'primary'}
				disabled={!store.info || store.exportState.status === 'running'}
				onclick={() => onexport('download')}
				data-testid="export-download"
			>
				{canSave ? 'Export & download' : 'Export video'}
			</button>
		</div>
		<p class="note sub">Also export for the edited video:</p>
		<div class="sidecars">
			<button
				disabled={!hasTranscript}
				onclick={() => store.exportSubtitles('srt')}
				title="Captions timed to the edited video (removed words dropped)"
				data-testid="export-srt">Subtitles .srt</button
			>
			<button
				disabled={!hasTranscript}
				onclick={() => store.exportSubtitles('vtt')}
				title="WebVTT captions timed to the edited video"
				data-testid="export-vtt">.vtt</button
			>
			<button
				disabled={!hasTranscript}
				onclick={() => store.exportTranscript()}
				title="Plain-text transcript of what remains in the edit"
				data-testid="export-txt">Transcript .txt</button
			>
			<button
				disabled={!store.info}
				onclick={() => store.exportEdl('cmx')}
				title="CMX 3600 edit list to rebuild this edit in Premiere Pro / DaVinci Resolve"
				data-testid="export-cmx">EDL (Premiere/Resolve)</button
			>
			<button
				disabled={!store.info}
				onclick={() => store.exportEdl('json')}
				title="Machine-readable edit decision list (source times in seconds)"
				data-testid="export-json">EDL .json</button
			>
		</div>
		{#if !hasTranscript}
			<p class="note">Subtitles and transcript need a transcript first.</p>
		{/if}
	</details>

	<div class="reset-row">
		<button class="ghost small" onclick={() => store.resetSettings()} data-testid="reset-settings"
			>Reset all settings to defaults</button
		>
		<span class="note">Your last settings are used for new projects.</span>
	</div>
</aside>

<style>
	.inspector {
		overflow-y: auto;
		height: 100%;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 2px 12px 16px;
	}
	details {
		border-bottom: 1px solid var(--border);
		padding: 8px 0;
	}
	details:last-child {
		border-bottom: none;
	}
	summary {
		cursor: pointer;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dim);
		font-weight: 600;
		padding: 2px 0;
	}
	.modes {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 6px;
	}
	.mode {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0 6px;
		padding: 6px 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.mode.active {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.mode input {
		grid-row: span 2;
		margin-top: 2px;
	}
	.name {
		font-weight: 600;
		font-size: 12px;
	}
	.desc {
		font-size: 10.5px;
		color: var(--text-dim);
		line-height: 1.35;
	}
	.note {
		font-size: 11px;
		color: var(--text-faint);
		margin: 6px 0;
	}
	.check {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 12px;
		margin: 6px 0;
	}
	.small {
		font-size: 11px;
		padding: 2px 6px;
	}
	.qualities {
		display: flex;
		flex-direction: column;
		gap: 3px;
		margin-top: 6px;
		font-size: 12px;
	}
	.quality {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.presets {
		display: flex;
		gap: 4px;
		margin: 8px 0 2px;
	}
	.presets button {
		flex: 1;
		font-size: 12px;
		padding: 4px 6px;
	}
	.presets button.on {
		border-color: var(--accent);
		background: var(--accent-soft);
		font-weight: 600;
	}
	.sidecars {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.sidecars button {
		font-size: 11.5px;
		padding: 3px 7px;
	}
	.note.sub {
		margin-top: 12px;
		margin-bottom: 4px;
	}
	.reset-row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 10px 0 0;
	}
	.export-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
</style>
