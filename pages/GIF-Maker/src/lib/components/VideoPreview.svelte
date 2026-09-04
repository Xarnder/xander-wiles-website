<script lang="ts">
	import { motionLabel } from '$lib/gif/analyse-frames';
	import { prepareVideoElement } from '$lib/gif/analyse-video';
	import { formatBytes, formatDuration } from '$lib/gif/format';
	import type { VideoAnalysis } from '$lib/gif/types';

	let {
		url,
		analysis,
		element = $bindable()
	}: {
		url: string;
		analysis: VideoAnalysis | null;
		element?: HTMLVideoElement;
	} = $props();
</script>

<section class="stack">
	<div class="preview-frame">
		<video
			bind:this={element}
			{@attach prepareVideoElement}
			src={url}
			controls
			muted
			playsinline
			preload="metadata"
		></video>
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
