<script lang="ts">
	import { drawMemeText } from '#lib/gif/meme-text';
	import { motionLabel } from '#lib/gif/analyse-frames';
	import { prepareVideoElement } from '#lib/gif/analyse-video';
	import { formatBytes, formatDuration } from '#lib/gif/format';
	import type { VideoAnalysis } from '#lib/gif/types';

	let {
		url,
		memeText = '',
		analysis,
		element = $bindable()
	}: {
		url: string;
		memeText?: string;
		analysis: VideoAnalysis | null;
		element?: HTMLVideoElement;
	} = $props();
	let captionCanvas = $state<HTMLCanvasElement>();
	$effect(() => {
		if (captionCanvas && analysis)
			drawMemeText(captionCanvas, memeText, 1000, Math.round(1000 / analysis.aspectRatio));
	});
</script>

<section class="stack">
	<div class="preview-frame">
		<div
			class="video-stage"
			style:width={analysis ? `min(100%, ${320 * analysis.aspectRatio}px)` : '100%'}
		>
			<video
				bind:this={element}
				{@attach prepareVideoElement}
				src={url}
				controls
				muted
				playsinline
				preload="metadata"
			></video>
			<canvas bind:this={captionCanvas} aria-label={memeText ? `Meme text: ${memeText}` : undefined}
			></canvas>
		</div>
	</div>

	{#if analysis}
		<dl class="meta-grid">
			<div>
				<dt>File</dt>
				<dd>{analysis.filename}</dd>
			</div>
			<div>
				<dt>Duration</dt>
				<dd>{formatDuration(analysis.durationSeconds)}</dd>
			</div>
			<div>
				<dt>Resolution</dt>
				<dd>{analysis.width} × {analysis.height}</dd>
			</div>
			<div>
				<dt>Original size</dt>
				<dd>{formatBytes(analysis.fileSizeBytes)}</dd>
			</div>
			<div>
				<dt>Aspect ratio</dt>
				<dd>{analysis.aspectRatioLabel}</dd>
			</div>
			<div>
				<dt>Motion</dt>
				<dd>{motionLabel(analysis.motionComplexity)}</dd>
			</div>
		</dl>
	{/if}
</section>

<style>
	.video-stage {
		position: relative;
		margin: auto;
	}
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
</style>
