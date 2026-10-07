<script lang="ts">
	/**
	 * Technical spike / benchmark harness. Proves, entirely in-browser:
	 *  1. local MP4/MOV load + audio extraction/decoding
	 *  2. waveform + silence envelope
	 *  3. verbatim ASR with word timestamps
	 *  4. cutting several sections and exporting a playable MP4
	 * and records the metrics that PERF.md asks for. Kept in the app as a developer tool.
	 */
	import { onMount } from 'svelte';
	import {
		DEFAULT_AUDIO_PARAMS,
		detectAudioSpeech,
		suggestThreshold
	} from '#lib/core/audioDetector.ts';
	import { proposeCuts } from '#lib/core/combine.ts';
	import { buildAutoEdl, keptRanges } from '#lib/core/edl.ts';
	import { quantizeRanges } from '#lib/core/timeMap.ts';
	import { formatTimecode } from '#lib/core/stats.ts';
	import {
		detectTranscriptSpeech,
		DEFAULT_TRANSCRIPT_PARAMS
	} from '#lib/core/transcriptDetector.ts';
	import type { Range, TranscriptWord } from '#lib/core/types.ts';
	import { availableModels, chooseVariant, formatBytes, variantBytes } from '#lib/asr/models.ts';
	import { WorkerTranscriptionEngine } from '#lib/asr/workerEngine.ts';
	import type { DownloadProgress, TranscribeProgress } from '#lib/asr/types.ts';
	import { analyseFile, exportVideo } from '#lib/media/client.ts';
	import { DEFAULT_TRANSITIONS } from '#lib/media/exportPlan.ts';
	import type { AnalysisResult } from '#lib/media/types.ts';
	import {
		accelerationLabel,
		detectCapabilities,
		type Capabilities
	} from '#lib/runtime/capabilities.ts';

	type Metrics = Record<string, unknown>;

	let caps = $state<Capabilities | null>(null);
	let file = $state<File | null>(null);
	let analysis = $state.raw<AnalysisResult | null>(null);
	let analysing = $state(false);
	let analyseProgress = $state(0);
	let threshold = $state(DEFAULT_AUDIO_PARAMS.thresholdDb);
	let modelId = $state('');
	let backend = $state<'auto' | 'webgpu' | 'wasm'>('auto');
	let engine = $state.raw<WorkerTranscriptionEngine | null>(null);
	let download = $state<DownloadProgress | null>(null);
	let transcribeProgress = $state<TranscribeProgress | null>(null);
	let words = $state.raw<TranscriptWord[]>([]);
	let exportProgress = $state(0);
	let exportUrl = $state<string | null>(null);
	let status = $state('Idle');
	let error = $state<string | null>(null);
	let metrics = $state<Metrics>({});
	let canvas = $state<HTMLCanvasElement | null>(null);

	const models = availableModels(__CRISPERWHISPER_ENABLED__);
	modelId = models[0]?.id ?? '';
	const model = $derived(models.find((m) => m.id === modelId) ?? null);
	const variant = $derived(
		caps && model ? chooseVariant(model, caps, backend === 'auto' ? undefined : backend) : null
	);
	const speech = $derived.by(() =>
		analysis
			? detectAudioSpeech(
					{ hopSeconds: analysis.envelopeHop, db: analysis.envelopeDb },
					{ ...DEFAULT_AUDIO_PARAMS, thresholdDb: threshold }
				)
			: []
	);

	onMount(() => {
		void detectCapabilities().then((c) => {
			caps = c;
			metrics = { ...metrics, capabilities: c };
		});
		(window as unknown as { __spike: unknown }).__spike = {
			get metrics() {
				return $state.snapshot(metrics);
			},
			get words() {
				return words;
			},
			setModel: (id: string) => (modelId = id),
			setBackend: (b: 'auto' | 'webgpu' | 'wasm') => (backend = b),
			analyse: () => runAnalyse(),
			load: () => runLoad(),
			transcribe: (seconds?: number) => runTranscribe(seconds),
			exportTest: () => runExport()
		};
	});

	function record(key: string, value: unknown) {
		metrics = { ...metrics, [key]: value };
	}

	function memory(): Record<string, number> | null {
		const m = (
			performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }
		).memory;
		return m
			? { usedJSHeapMB: m.usedJSHeapSize / 1e6, totalJSHeapMB: m.totalJSHeapSize / 1e6 }
			: null;
	}

	async function runAnalyse() {
		if (!file) return;
		error = null;
		analysing = true;
		status = 'Decoding audio locally…';
		const started = performance.now();
		try {
			const result = await analyseFile(file, {
				onProgress: (s, total) => (analyseProgress = total ? s / total : 0)
			}).promise;
			analysis = result;
			threshold = suggestThreshold({ hopSeconds: result.envelopeHop, db: result.envelopeDb });
			record('analysis', {
				file: { sizeMB: file.size / 1e6, type: file.type },
				info: result.info,
				decodeMs: result.timings.decodeMs,
				totalMs: performance.now() - started,
				decodeSpeedX: result.info.durationSeconds / (result.timings.decodeMs / 1000),
				pcm16kMB: result.pcm16k.byteLength / 1e6,
				suggestedThresholdDb: threshold,
				memory: memory()
			});
			status = 'Analysis complete';
		} catch (e) {
			error = (e as Error).message;
		} finally {
			analysing = false;
		}
	}

	async function runLoad() {
		if (!model || !caps) return;
		error = null;
		await engine?.unload();
		const e = new WorkerTranscriptionEngine(model, caps);
		engine = e;
		status = 'Downloading speech recognition model to this device…';
		try {
			const res = await e.load({
				preferBackend: backend === 'auto' ? undefined : backend,
				onDownload: (p) => (download = p)
			});
			record('modelLoad', {
				model: model.id,
				variant: res.variant.dtype,
				backend: res.runtime.backend,
				adapter: res.runtime.adapterDescription,
				f16: res.runtime.f16,
				threads: res.runtime.threads,
				downloadBytes: variantBytes(res.variant),
				downloadedThisSession: res.downloadedBytes,
				loadMs: res.loadMs,
				filesMs: res.filesMs,
				sessionMs: res.sessionMs,
				memory: memory()
			});
			status = res.downloadedBytes > 0 ? 'Model cached locally.' : 'Model loaded from local cache.';
		} catch (err) {
			error = (err as Error).message;
		}
	}

	async function runTranscribe(maxSeconds?: number) {
		if (!engine || !analysis) return;
		error = null;
		words = [];
		const limit = maxSeconds
			? Math.min(analysis.pcm16k.length, Math.round(maxSeconds * 16000))
			: analysis.pcm16k.length;
		// Transfer a copy so the spike can re-run; the editor transfers ownership instead.
		const audio = analysis.pcm16k.slice(0, limit);
		status = 'Transcribing…';
		try {
			const res = await engine.transcribe(audio, {
				language: 'en',
				mode: 'verbatim',
				onProgress: (p) => (transcribeProgress = p),
				onWords: (w) => (words = [...words, ...w])
			});
			words = res.transcript.words;
			record('transcription', {
				model: engine.model.id,
				backend: engine.runtime()?.backend,
				audioSeconds: limit / 16000,
				wallMs: res.wallMs,
				realTimeFactor: res.realTimeFactor,
				words: res.transcript.words.length,
				fillers: res.transcript.words.filter((w) => w.kind === 'filler').length,
				partials: res.transcript.words.filter((w) => w.kind === 'partial').length,
				events: res.transcript.words.filter((w) => w.kind === 'event' || w.kind === 'breath')
					.length,
				chunks: engine.chunkDiagnostics,
				memory: memory()
			});
			status = 'Transcription complete';
		} catch (err) {
			error = (err as Error).message;
		}
	}

	async function runExport() {
		if (!file || !analysis) return;
		error = null;
		const duration = analysis.info.durationSeconds;
		const transcriptSpeech = words.length
			? detectTranscriptSpeech(words, DEFAULT_TRANSCRIPT_PARAMS)
			: null;
		const proposal = proposeCuts(
			{ duration, audioSpeech: speech, transcriptSpeech },
			{ mode: 'conservative', leadMs: 150, trailMs: 250, minSilenceMs: 500 }
		);
		const edl = buildAutoEdl(duration, proposal.cuts);
		const fps = analysis.info.video?.frameRate ?? 30;
		const keeps: Range[] = quantizeRanges(keptRanges(edl), fps, duration);
		status = `Exporting ${proposal.cuts.length} cuts…`;
		const started = performance.now();
		try {
			const { summary, blob } = await exportVideo({
				file,
				keeps,
				duration,
				frameRate: fps,
				transitions: DEFAULT_TRANSITIONS,
				quality: 'source',
				target:
					typeof navigator.storage?.getDirectory === 'function'
						? { kind: 'opfs', name: `spike-export-${Date.now()}.mp4` }
						: { kind: 'buffer' },
				onProgress: (s, total) => (exportProgress = total ? s / total : 0)
			}).promise;
			if (exportUrl) URL.revokeObjectURL(exportUrl);
			exportUrl = blob ? URL.createObjectURL(blob) : null;
			record('export', {
				...summary,
				cuts: proposal.cuts.length,
				sourceSeconds: duration,
				speedX: summary.editedSeconds / (summary.wallMs / 1000),
				totalMs: performance.now() - started,
				memory: memory()
			});
			status = 'Export complete — playable MP4 below';
		} catch (err) {
			error = (err as Error).message;
		}
	}

	// Simple overview render: peaks, envelope, threshold line, detected speech.
	$effect(() => {
		if (!canvas || !analysis) return;
		const ctx = canvas.getContext('2d')!;
		const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
		const h = (canvas.height = 160 * devicePixelRatio);
		ctx.clearRect(0, 0, w, h);
		const duration = analysis.info.durationSeconds;
		const peaks = analysis.peaks;
		const buckets = peaks.length / 2;
		const mid = h / 2;
		ctx.fillStyle = '#5b8def';
		for (let x = 0; x < w; x++) {
			const a = Math.floor((x / w) * buckets);
			const b = Math.max(a + 1, Math.floor(((x + 1) / w) * buckets));
			let lo = 0;
			let hi = 0;
			for (let i = a; i < b; i++) {
				lo = Math.min(lo, peaks[i * 2]);
				hi = Math.max(hi, peaks[i * 2 + 1]);
			}
			ctx.fillRect(x, mid - (hi / 127) * mid, 1, Math.max(1, ((hi - lo) / 127) * mid));
		}
		ctx.fillStyle = 'rgba(46, 204, 113, 0.18)';
		for (const r of speech)
			ctx.fillRect((r.start / duration) * w, 0, ((r.end - r.start) / duration) * w, h);
		const dbToY = (db: number) => h - ((db + 80) / 80) * h;
		ctx.strokeStyle = '#f5a623';
		ctx.beginPath();
		const env = analysis.envelopeDb;
		for (let x = 0; x < w; x++) {
			const i = Math.floor((x / w) * env.length);
			const y = dbToY(Math.max(-80, env[i]));
			if (x === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
		ctx.strokeStyle = '#e74c3c';
		ctx.setLineDash([6, 4]);
		ctx.beginPath();
		ctx.moveTo(0, dbToY(threshold));
		ctx.lineTo(w, dbToY(threshold));
		ctx.stroke();
		ctx.setLineDash([]);
	});
</script>

<svelte:head><title>Technical spike — Silence Cutter</title></svelte:head>

<main class="spike">
	<header>
		<h1>Technical spike</h1>
		<p class="privacy">🔒 Private — this video never leaves your device.</p>
		<p>
			{accelerationLabel(caps)} · cross-origin isolated: {caps?.crossOriginIsolated ? 'yes' : 'no'}
		</p>
	</header>

	<section>
		<h2>1. Load an MP4/MOV locally &amp; decode its audio</h2>
		<input
			type="file"
			accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
			data-testid="spike-file"
			onchange={(e) => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
		/>
		<button disabled={!file || analysing} onclick={runAnalyse} data-testid="spike-analyse"
			>Analyse</button
		>
		{#if analysing}<progress value={analyseProgress}></progress>{/if}
		{#if analysis}
			<p data-testid="spike-analysis">
				{analysis.info.container} · {formatTimecode(analysis.info.durationSeconds)} · video {analysis
					.info.video?.codec}
				{analysis.info.video?.width}×{analysis.info.video?.height}
				@ {analysis.info.video?.frameRate?.toFixed(2)} fps · audio {analysis.info.audio?.codec}
				{analysis.info.audio?.sampleRate} Hz × {analysis.info.audio?.channels} · decoded in
				{(analysis.timings.decodeMs / 1000).toFixed(2)} s
			</p>
		{/if}
	</section>

	<section>
		<h2>2. Waveform + silence envelope</h2>
		<label>
			Threshold {threshold} dB
			<input type="range" min="-80" max="-10" bind:value={threshold} />
		</label>
		<canvas bind:this={canvas} class="overview"></canvas>
		<p>{speech.length} speech regions detected by the audio gate.</p>
	</section>

	<section>
		<h2>3. Verbatim ASR with word timestamps</h2>
		<select bind:value={modelId} data-testid="spike-model">
			{#each models as m (m.id)}
				<option value={m.id}>{m.label} — {m.tier}{m.verbatim ? '' : ' (NOT verbatim)'}</option>
			{/each}
		</select>
		<select bind:value={backend}>
			<option value="auto">auto</option>
			<option value="webgpu">webgpu</option>
			<option value="wasm">wasm</option>
		</select>
		{#if variant}
			<span
				>Download: {formatBytes(variantBytes(variant))} ({variant.backend}, {variant.dtype
					.encoder_model}/{variant.dtype.decoder_model_merged})</span
			>
		{/if}
		<button disabled={!model || !caps} onclick={runLoad} data-testid="spike-load">Load model</button
		>
		<button
			disabled={!engine || !analysis}
			onclick={() => runTranscribe()}
			data-testid="spike-transcribe">Transcribe</button
		>
		{#if download}
			<p>
				{download.overallLoaded < download.overallTotal
					? 'Downloading speech recognition model to this device'
					: 'Model cached locally.'}
				{formatBytes(download.overallLoaded)} / {formatBytes(download.overallTotal)}
				{download.bytesPerSecond ? `· ${formatBytes(download.bytesPerSecond)}/s` : ''}
			</p>
		{/if}
		{#if transcribeProgress}
			<p>
				Transcribing — {formatTimecode(transcribeProgress.processedSeconds)} / {formatTimecode(
					transcribeProgress.totalSeconds
				)}
				{transcribeProgress.speedFactor
					? `· ${transcribeProgress.speedFactor.toFixed(1)}× real time`
					: ''}
			</p>
		{/if}
		<div class="words" data-testid="spike-words">
			<!-- eslint-disable svelte/no-useless-mustaches -->
			{#each words as w (w.index)}
				<span class="w {w.kind}" title="{w.start.toFixed(2)}–{w.end.toFixed(2)}">{w.text}</span
				>{' '}
			{/each}
		</div>
	</section>

	<section>
		<h2>4. Cut sections &amp; export MP4 locally</h2>
		<button disabled={!analysis} onclick={runExport} data-testid="spike-export"
			>Export edited MP4</button
		>
		{#if exportProgress > 0 && exportProgress < 1}<progress value={exportProgress}></progress>{/if}
		{#if exportUrl}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video src={exportUrl} controls class="result" data-testid="spike-result"></video>
		{/if}
	</section>

	<p class="status" data-testid="spike-status">{status}</p>
	{#if error}<p class="error" data-testid="spike-error">{error}</p>{/if}

	<section>
		<h2>Benchmark record</h2>
		<button onclick={() => navigator.clipboard.writeText(JSON.stringify(metrics, null, 2))}
			>Copy JSON</button
		>
		<pre data-testid="spike-metrics">{JSON.stringify(metrics, null, 2)}</pre>
	</section>
</main>

<style>
	.spike {
		max-width: 1100px;
		margin: 0 auto;
		padding: 24px;
		font:
			14px/1.5 system-ui,
			sans-serif;
		color: var(--text, #e8e8ea);
	}
	section {
		margin: 20px 0;
		padding: 16px;
		border: 1px solid var(--border, #333);
		border-radius: 8px;
	}
	.overview {
		width: 100%;
		height: 160px;
		background: #111;
		display: block;
		margin-top: 8px;
	}
	.words {
		max-height: 260px;
		overflow: auto;
		margin-top: 8px;
	}
	.w.filler {
		color: #f5a623;
		font-weight: 600;
	}
	.w.partial {
		color: #e67e22;
		font-style: italic;
	}
	.w.event,
	.w.breath {
		color: #9b59b6;
	}
	.result {
		max-width: 100%;
		margin-top: 8px;
	}
	.privacy {
		color: #2ecc71;
	}
	.error {
		color: #e74c3c;
	}
	pre {
		max-height: 360px;
		overflow: auto;
		background: #111;
		padding: 8px;
		font-size: 12px;
	}
</style>
