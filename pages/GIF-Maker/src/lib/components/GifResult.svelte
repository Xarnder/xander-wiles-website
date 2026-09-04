<script lang="ts">
	import {
		compressionLabel,
		formatBytes,
		formatDuration,
		formatSpeed,
		percentOfLimit
	} from '$lib/gif/format';
	import { prefersNativeShareSave } from '$lib/gif/platform';
	import { openInNewTab, saveGifOnIos, triggerDownload } from '$lib/gif/save-file';
	import type { OptimiserResult } from '$lib/gif/types';
	import { onMount } from 'svelte';

	let {
		result,
		url,
		file,
		filename,
		durationSeconds,
		bounce = false,
		speed = 1,
		targetBytes,
		originalBytes,
		onagain
	}: {
		result: OptimiserResult;
		url: string;
		file: File;
		filename: string;
		durationSeconds: number;
		bounce?: boolean;
		speed?: number;
		targetBytes: number;
		originalBytes: number;
		onagain: () => void;
	} = $props();

	let ios = $state(false);
	let hint = $state<string | null>(null);
	let saving = $state(false);

	const settings = $derived(result.candidate.settings);
	const size = $derived(result.fileSizeBytes ?? 0);
	const used = $derived(percentOfLimit(size, targetBytes));

	onMount(() => {
		ios = prefersNativeShareSave();
	});

	async function onSave() {
		if (saving) return;
		if (!ios) {
			triggerDownload(url, filename);
			return;
		}
		saving = true;
		hint = null;
		try {
			const outcome = await saveGifOnIos(file, url);
			if (outcome === 'opened') {
				hint = 'The GIF opened in a new tab. Tap and hold it, then choose Save Image.';
			} else if (outcome === 'failed') {
				hint = 'Use Open GIF, then tap and hold the image and choose Save Image or Save to Files.';
			}
		} finally {
			saving = false;
		}
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
			<dd>
				{formatDuration(durationSeconds)}{bounce ? ' · bounce loop' : ''}{speed > 1.01
					? ` · ${formatSpeed(speed)}`
					: ''}
			</dd>
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

	<div class="actions">
		<button class="primary" type="button" disabled={saving} onclick={onSave}>
			{ios ? 'Save GIF' : 'Download GIF'}
		</button>
		{#if ios}
			<button class="ghost" type="button" onclick={() => openInNewTab(url)}>Open GIF</button>
			<p class="hint">
				{hint ?? 'Save GIF opens the iOS share sheet so you can add it to Photos or Files.'}
			</p>
		{/if}
		<button class="ghost" type="button" onclick={onagain}>Create another</button>
	</div>
</section>

<style>
	.actions {
		display: grid;
		gap: 10px;
	}

	.actions .ghost {
		width: 100%;
	}
</style>
