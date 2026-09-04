<script lang="ts">
	import { FILE_PICKER_ACCEPT } from '$lib/gif/constants';
	import { isProbablyVideo } from '$lib/gif/format';

	let { disabled = false, onfile }: { disabled?: boolean; onfile: (file: File) => void } = $props();

	let dragging = $state(false);
	let rejectMessage = $state<string | null>(null);

	function takeFile(file: File | undefined, input?: HTMLInputElement) {
		rejectMessage = null;
		if (input) input.value = '';
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
	<div class="target">
		<input
			class="file-input"
			type="file"
			accept={FILE_PICKER_ACCEPT}
			{disabled}
			aria-label="Choose a video"
			onchange={(event) => takeFile(event.currentTarget.files?.[0], event.currentTarget)}
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
		/>
		<div class="copy" aria-hidden="true">
			<span class="glyph">↓</span>
			<strong class="desktop-copy">Drop a video here</strong>
			<strong class="mobile-copy">Choose a video</strong>
			<span class="desktop-copy">or choose a file</span>
			<span class="mobile-copy">Photos, Files, or Camera Roll</span>
		</div>
	</div>
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
		position: relative;
		display: grid;
		justify-items: center;
		min-height: 168px;
		border: 1.5px dashed color-mix(in srgb, var(--accent) 40%, var(--line));
		border-radius: 18px;
		background: color-mix(in srgb, var(--accent-soft) 35%, transparent);
		color: var(--ink);
		transition:
			border-color 0.2s ease,
			background 0.2s ease,
			transform 0.2s ease;
	}

	.file-input {
		position: absolute;
		inset: 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
		font-size: 16px;
	}

	.file-input:disabled {
		cursor: default;
	}

	.copy {
		pointer-events: none;
		display: grid;
		justify-items: center;
		gap: 6px;
		padding: 28px 16px;
	}

	.dragging .target {
		border-color: var(--accent);
		background: var(--accent-soft);
		transform: scale(1.01);
	}

	.disabled .target {
		opacity: 0.55;
	}

	.glyph {
		font-size: 1.4rem;
		color: var(--accent);
	}

	.copy span:not(.glyph) {
		color: var(--muted);
		font-size: 0.9rem;
	}

	.mobile-copy {
		display: none;
	}

	@media (hover: none), (pointer: coarse) {
		.desktop-copy {
			display: none;
		}

		.mobile-copy {
			display: block;
		}
	}
</style>
