<script lang="ts">
	import { compressionLabel, formatBytes, formatDuration, percentOfLimit } from '$lib/gif/format';
	import type { OptimiserResult } from '$lib/gif/types';

	let {
		result,
		url,
		filename,
		durationSeconds,
		targetBytes,
		originalBytes,
		onagain
	}: {
		result: OptimiserResult;
		url: string;
		filename: string;
		durationSeconds: number;
		targetBytes: number;
		originalBytes: number;
		onagain: () => void;
	} = $props();

	const settings = $derived(result.candidate.settings);
	const size = $derived(result.fileSizeBytes ?? 0);
	const used = $derived(percentOfLimit(size, targetBytes));

	function download() {
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
	}
</script>

<section class="stack">
	<div>
		<p class="eyebrow">Optimised GIF</p>
		<strong>{settings.width} × {settings.height}</strong>
		<p class="hint">
			{settings.fps} FPS · {settings.colours} colours · {formatBytes(size)} / {formatBytes(
				targetBytes
			)} maximum
		</p>
	</div>

	<div class="preview-frame">
		<img src={url} alt="Generated GIF preview" />
	</div>

	<dl class="meta-grid">
		<div>
			<dt>Used of maximum</dt>
			<dd>{used.toFixed(1)}%</dd>
		</div>
		<div>
			<dt>Compared with video</dt>
			<dd>{compressionLabel(originalBytes, size)}</dd>
		</div>
		<div>
			<dt>Duration</dt>
			<dd>{formatDuration(durationSeconds)}</dd>
		</div>
		<div>
			<dt>Palette</dt>
			<dd>
				{settings.colours} colours · {settings.dither === 'sierra2_4a'
					? 'Sierra'
					: settings.dither === 'floyd_steinberg'
						? 'Floyd–Steinberg'
						: settings.dither}
			</dd>
		</div>
	</dl>

	<button class="primary" type="button" onclick={download}>Download GIF</button>
	<button class="ghost" type="button" onclick={onagain}>Create another</button>
</section>
