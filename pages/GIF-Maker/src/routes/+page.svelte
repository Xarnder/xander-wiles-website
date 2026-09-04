<script lang="ts">
	import AdvancedSettings from '$lib/components/AdvancedSettings.svelte';
	import ClipSelector from '$lib/components/ClipSelector.svelte';
	import ConversionProgress from '$lib/components/ConversionProgress.svelte';
	import GifResult from '$lib/components/GifResult.svelte';
	import PlaybackSelector from '$lib/components/PlaybackSelector.svelte';
	import SizeSelector from '$lib/components/SizeSelector.svelte';
	import VideoDropzone from '$lib/components/VideoDropzone.svelte';
	import VideoPreview from '$lib/components/VideoPreview.svelte';
	import { defaultConstraints } from '$lib/gif/candidate-generator';
	import { DEFAULT_TARGET_BYTES } from '$lib/gif/constants';
	import {
		clipDuration,
		formatBytes,
		formatDuration,
		formatSpeed,
		gifFilename,
		outputDuration,
		resolvedPlaybackSpeed
	} from '$lib/gif/format';
	import { recommendSettings } from '$lib/gif/optimiser';
	import { colourEstimateLabel } from '$lib/gif/size-model';
	import { prefersNativeShareSave } from '$lib/gif/platform';
	import {
		THEME_LABEL,
		nextTheme,
		resolveStoredTheme,
		themeColor,
		type ThemeName
	} from '$lib/gif/theme';
	import { inputMemoryWarning, longVideoWarning, tightTargetWarning } from '$lib/gif/warnings';
	import { onMount, tick } from 'svelte';
	import type {
		AdvancedConstraints,
		OptimiserProgress,
		OptimiserResult,
		PlaybackMode,
		VideoAnalysis
	} from '$lib/gif/types';

	let file = $state<File | null>(null);
	let videoUrl = $state<string | null>(null);
	let videoEl = $state<HTMLVideoElement | undefined>();
	let analysis = $state<VideoAnalysis | null>(null);
	let analysing = $state(false);
	let targetBytes = $state(DEFAULT_TARGET_BYTES);
	let startSeconds = $state(0);
	let endSeconds = $state(0);
	let bounce = $state(false);
	let playbackMode = $state<PlaybackMode>('speed');
	let speed = $state(1);
	let targetSeconds = $state(1);
	let constraints = $state<AdvancedConstraints>(defaultConstraints());
	let converting = $state(false);
	let progress = $state<OptimiserProgress | null>(null);
	let result = $state<OptimiserResult | null>(null);
	let gifUrl = $state<string | null>(null);
	let gifFile = $state<File | null>(null);
	let errorMessage = $state<string | null>(null);
	let theme = $state<ThemeName>('navy');
	const upcomingTheme = $derived(nextTheme(theme));
	let abort: AbortController | undefined;

	const clip = $derived({ startSeconds, endSeconds });
	const selectedDuration = $derived(analysis ? clipDuration(clip, analysis.durationSeconds) : 0);
	const playbackRate = $derived(
		resolvedPlaybackSpeed({
			clipSeconds: selectedDuration,
			bounce,
			mode: playbackMode,
			speed,
			targetSeconds
		})
	);
	const gifDuration = $derived(outputDuration(selectedDuration, bounce, playbackRate));
	const recommendation = $derived.by(() => {
		if (!analysis) return null;
		return recommendSettings({
			analysis,
			targetBytes,
			clip,
			constraints,
			bounce,
			speed: playbackRate
		});
	});
	const memoryWarning = $derived(
		file ? inputMemoryWarning(file.size, deviceMemory(), prefersNativeShareSave()) : null
	);
	const durationWarning = $derived(analysis ? longVideoWarning(gifDuration) : null);
	const qualityWarning = $derived(
		analysis ? tightTargetWarning(gifDuration, targetBytes, analysis, constraints) : null
	);
	const downloadName = $derived(file ? gifFilename(file.name) : 'video.gif');

	$effect(() => {
		const url = videoUrl;
		return () => {
			if (url) URL.revokeObjectURL(url);
		};
	});

	$effect(() => {
		const url = gifUrl;
		return () => {
			if (url) URL.revokeObjectURL(url);
		};
	});

	function deviceMemory(): number | undefined {
		const nav = navigator as Navigator & { deviceMemory?: number };
		return nav.deviceMemory;
	}

	function readTheme(): ThemeName {
		let stored: string | null = null;
		try {
			stored = localStorage.getItem('svgif-theme');
		} catch {
			// Ignore blocked storage.
		}
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		return resolveStoredTheme(stored, prefersDark);
	}

	function applyTheme(next: ThemeName) {
		theme = next;
		document.documentElement.dataset.theme = next;
		const color = themeColor(next);
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
		try {
			localStorage.setItem('svgif-theme', next);
		} catch {
			// Ignore blocked storage.
		}
	}

	onMount(() => {
		applyTheme(readTheme());
	});

	async function onfile(next: File) {
		errorMessage = null;
		result = null;
		gifUrl = null;
		gifFile = null;
		file = next;
		videoUrl = URL.createObjectURL(next);
		analysis = null;
		analysing = true;
		startSeconds = 0;
		endSeconds = 0;
		bounce = false;
		playbackMode = 'speed';
		speed = 1;

		await tick();

		if (!videoEl) {
			analysing = false;
			errorMessage = 'The video preview could not be created.';
			return;
		}

		try {
			const { analyseLoadedVideo } = await import('$lib/gif/analyse-video');
			videoEl.src = videoUrl;
			const nextAnalysis = await analyseLoadedVideo(videoEl, next);
			analysis = nextAnalysis;
			startSeconds = 0;
			endSeconds = nextAnalysis.durationSeconds;
			targetSeconds = Math.max(0.05, nextAnalysis.durationSeconds / 2);
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'This video could not be analysed in the browser.';
		} finally {
			analysing = false;
		}
	}

	function resetResult() {
		result = null;
		gifUrl = null;
		gifFile = null;
		errorMessage = null;
	}

	async function createGif(forceSmallest = false) {
		if (!file || !videoEl || !analysis) return;
		converting = true;
		errorMessage = null;
		progress = {
			stage: 'loading',
			message: 'Preparing local encoder',
			percent: 4
		};
		abort?.abort();
		abort = new AbortController();

		try {
			const { convertVideoToGif, encodeSmallestGif } = await import('$lib/gif/convert');
			const options = {
				file,
				video: videoEl,
				analysis,
				targetBytes,
				clip,
				constraints,
				bounce,
				speed: playbackRate,
				onProgress: (next: OptimiserProgress) => {
					progress = next;
				},
				signal: abort.signal
			};
			const nextResult = forceSmallest
				? await encodeSmallestGif(options)
				: await convertVideoToGif(options);

			result = nextResult;
			if (nextResult.gifBytes) {
				const copy = new Uint8Array(nextResult.gifBytes.byteLength);
				copy.set(nextResult.gifBytes);
				gifFile = new File([copy], downloadName, { type: 'image/gif' });
				gifUrl = URL.createObjectURL(gifFile);
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				errorMessage = 'Conversion cancelled.';
			} else {
				errorMessage = error instanceof Error ? error.message : 'Conversion failed.';
			}
		} finally {
			converting = false;
			progress = null;
		}
	}

	function cancel() {
		abort?.abort();
	}

	function toggleTheme() {
		applyTheme(nextTheme(theme));
	}
</script>

<div class="app-shell">
	<main class="panel">
		<header class="panel-header">
			<div>
				<p class="eyebrow">Local converter</p>
				<h1>Smart Video to GIF</h1>
				<p class="lede">
					Choose a video, pick a maximum size, and the app finds the best GIF settings on this
					device.
				</p>
			</div>
			<button
				class="theme-toggle"
				type="button"
				aria-label="Theme {THEME_LABEL[theme]}. Switch to {THEME_LABEL[upcomingTheme]}"
				onclick={toggleTheme}
			>
				{THEME_LABEL[upcomingTheme]}
			</button>
		</header>

		<div class="stack">
			{#if !file}
				<VideoDropzone {onfile} disabled={converting} />
			{:else}
				<div class="row-end">
					<button
						class="ghost"
						type="button"
						onclick={() => {
							file = null;
							videoUrl = null;
							analysis = null;
							resetResult();
						}}
					>
						New video
					</button>
				</div>
			{/if}

			{#if videoUrl}
				<VideoPreview url={videoUrl} {analysis} bind:element={videoEl} />
			{/if}

			{#if analysing}
				<p class="hint">Analysing video…</p>
			{/if}

			{#if memoryWarning?.message}
				<p class={memoryWarning.level === 'huge' ? 'danger' : 'warn'}>{memoryWarning.message}</p>
			{/if}

			{#if analysis}
				<SizeSelector bind:bytes={targetBytes} />
				<ClipSelector
					duration={analysis.durationSeconds}
					bind:startSeconds
					bind:endSeconds
					bind:bounce
				/>
				<PlaybackSelector
					clipSeconds={selectedDuration}
					{bounce}
					bind:mode={playbackMode}
					bind:speed
					bind:targetSeconds
				/>
				<AdvancedSettings bind:constraints />

				{#if durationWarning}
					<p class="warn">{durationWarning}</p>
				{/if}
				{#if qualityWarning}
					<p class="warn">{qualityWarning}</p>
				{/if}

				{#if recommendation}
					<div class="rec">
						<span class="eyebrow">Recommended output</span>
						<strong>
							~{recommendation.settings.width} × {recommendation.settings.height}
						</strong>
						<span>
							~{recommendation.settings.fps} FPS · {colourEstimateLabel(
								recommendation.settings.colours
							)}
						</span>
						{#if bounce || playbackRate > 1.01}
							<span>
								{#if bounce}Bounce loop{/if}
								{#if bounce && playbackRate > 1.01}
									·
								{/if}
								{#if playbackRate > 1.01}{formatSpeed(playbackRate)}{/if}
								· {formatDuration(gifDuration)}
							</span>
						{/if}
						<span class="hint">
							About {formatBytes(recommendation.estimatedFileSizeBytes)} before test encodes. Actual settings
							may change slightly after testing.
						</span>
					</div>
				{/if}

				{#if result?.status === 'impossible'}
					<p class="warn">
						This video cannot reasonably fit within {formatBytes(targetBytes)} as a GIF. The smallest
						usable version is approximately {formatBytes(
							result.smallestPossibleBytes ?? result.fileSizeBytes ?? 0
						)}.
					</p>
					{#if !gifUrl}
						<button
							class="primary"
							type="button"
							disabled={converting}
							onclick={() => createGif(true)}
						>
							Create smallest possible GIF
						</button>
					{/if}
				{:else if !converting && !gifUrl}
					<button
						class="primary"
						type="button"
						disabled={analysing}
						onclick={() => createGif(false)}
					>
						Create GIF
					</button>
				{/if}
			{/if}

			{#if converting && progress}
				<ConversionProgress {progress} oncancel={cancel} />
			{/if}

			{#if errorMessage}
				<p class="danger">{errorMessage}</p>
			{/if}

			{#if result && gifUrl && gifFile && analysis}
				<GifResult
					{result}
					url={gifUrl}
					file={gifFile}
					filename={downloadName}
					durationSeconds={gifDuration}
					{bounce}
					speed={playbackRate}
					{targetBytes}
					originalBytes={analysis.fileSizeBytes}
					onagain={resetResult}
				/>
			{/if}

			{#if result}
				<details class="box">
					<summary>Technical details</summary>
					<pre class="tech">
{result.filterGraph}

Status: {result.status}
Full encodes: {result.fullEncodes}
Sample encodes: {result.sampleEncodes}
Calibration: {result.calibration.toFixed(2)}
Encoder: {result.usedMultiThread ? 'multi-thread FFmpeg' : 'single-thread FFmpeg'}

{result.tried
							.map(
								(item) =>
									`${item.kind} ${item.settings.width}x${item.settings.height} ${item.settings.fps}fps ${item.settings.colours}c → ${item.measuredFileSizeBytes ?? item.estimatedFileSizeBytes} bytes`
							)
							.join('\n')}
					</pre>
				</details>
			{/if}
		</div>
	</main>
</div>

<style>
	.row-end {
		display: flex;
		justify-content: flex-end;
	}
</style>
