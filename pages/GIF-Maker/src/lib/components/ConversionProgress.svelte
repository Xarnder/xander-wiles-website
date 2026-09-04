<script lang="ts">
	import { formatBytes } from '$lib/gif/format';
	import type { OptimiserProgress } from '$lib/gif/types';

	let { progress, oncancel }: { progress: OptimiserProgress; oncancel: () => void } = $props();

	const percent = $derived(Math.max(4, Math.min(100, progress.percent)));
</script>

<section class="stack" aria-live="polite">
	<div>
		<strong>{progress.message}</strong>
		<p class="hint">
			{#if progress.currentWidth && progress.currentHeight && progress.currentFps}
				{progress.currentWidth} × {progress.currentHeight} · {progress.currentFps} FPS
				{#if progress.currentColours}
					· {progress.currentColours} colours
				{/if}
			{:else}
				Keeping the interface responsive while the encoder works.
			{/if}
		</p>
	</div>
	<div
		class="progress-track pulse"
		role="progressbar"
		aria-valuemin="0"
		aria-valuemax="100"
		aria-valuenow={Math.round(percent)}
	>
		<div class="progress-fill" style:width={`${percent}%`}></div>
	</div>
	{#if progress.estimatedOutputBytes}
		<p class="hint">Estimated output {formatBytes(progress.estimatedOutputBytes)}</p>
	{/if}
	{#if progress.ffmpegProgress !== undefined}
		<p class="hint">Encoder {Math.round(progress.ffmpegProgress * 100)}%</p>
	{/if}
	<button class="ghost" type="button" onclick={oncancel}>Cancel</button>
</section>
