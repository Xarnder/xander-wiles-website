<script lang="ts">
	import { FILE_PICKER_ACCEPT } from '$lib/gif/constants';
	import { isProbablyVideo } from '$lib/gif/format';

	let { disabled = false, onfile }: { disabled?: boolean; onfile: (file: File) => void } = $props();

	let inputEl: HTMLInputElement | undefined = $state();
	let dragging = $state(false);
	let rejectMessage = $state<string | null>(null);

	function takeFile(file: File | undefined) {
		rejectMessage = null;
		if (!file) return;
		if (!isProbablyVideo(file) && !file.type.startsWith('video/')) {
			rejectMessage = 'That does not look like a video. You can still try another file.';
		}
		onfile(file);
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (disabled) return;
		takeFile(event.dataTransfer?.files[0]);
	}
</script>

<div class="drop" class:dragging class:disabled>
	<input
		bind:this={inputEl}
		class="sr"
		type="file"
		accept={FILE_PICKER_ACCEPT}
		{disabled}
		onchange={(event) => takeFile(event.currentTarget.files?.[0])}
	/>
	<button
		class="target"
		type="button"
		{disabled}
		ondragenter={(event) => {
			event.preventDefault();
			if (!disabled) dragging = true;
		}}
		ondragover={(event) => {
			event.preventDefault();
			if (!disabled) dragging = true;
		}}
		ondragleave={() => {
			dragging = false;
		}}
		ondrop={onDrop}
		onclick={() => inputEl?.click()}
	>
		<span class="glyph" aria-hidden="true">↓</span>
		<strong>Drop a video here</strong>
		<span>or choose a file</span>
	</button>
	<p class="privacy">Your video stays on this device. Nothing is uploaded.</p>
	{#if rejectMessage}
		<p class="hint">{rejectMessage}</p>
	{/if}
</div>

<style>
	.drop {
		position: relative;
		display: grid;
		gap: 8px;
	}

	.target {
		display: grid;
		justify-items: center;
		gap: 6px;
		width: 100%;
		min-height: 168px;
		padding: 28px 16px;
		border: 1.5px dashed color-mix(in srgb, var(--accent) 40%, var(--line));
		border-radius: 18px;
		background: color-mix(in srgb, var(--accent-soft) 35%, transparent);
		color: var(--ink);
		transition:
			border-color 0.2s ease,
			background 0.2s ease,
			transform 0.2s ease;
	}

	.dragging .target {
		border-color: var(--accent);
		background: var(--accent-soft);
		transform: scale(1.01);
	}

	.target:disabled,
	.disabled .target {
		opacity: 0.55;
	}

	.glyph {
		font-size: 1.4rem;
		color: var(--accent);
	}

	.target span {
		color: var(--muted);
		font-size: 0.9rem;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
