<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { BuildingSettings } from '$lib/game/building/FoundationTypes';
	import { FurniturePreviewRenderer } from '$lib/game/building/FurniturePreviewRenderer';

	let {
		settings,
		revision
	}: {
		settings: BuildingSettings;
		revision: number;
	} = $props();

	const attachPreview: Attachment<HTMLCanvasElement> = (canvas) => {
		const preview = new FurniturePreviewRenderer(canvas);
		$effect(() => {
			void revision;
			preview.setContent(settings);
		});
		return () => preview.dispose();
	};
</script>

<section class="preview" aria-label="Object preview">
	<p class="preview-label">Preview</p>
	<canvas
		class="preview-canvas"
		data-testid="furniture-preview-canvas"
		aria-hidden="true"
		{@attach attachPreview}
	></canvas>
</section>

<style>
	.preview {
		position: relative;
		min-height: 16rem;
		background: #0c1c14;
		border: 1px solid #446553;
		border-radius: 14px;
		overflow: hidden;
	}
	.preview-label {
		position: absolute;
		top: 0.7rem;
		left: 0.85rem;
		z-index: 1;
		margin: 0;
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #a0d9b7;
		pointer-events: none;
	}
	.preview-canvas {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 16rem;
		cursor: grab;
		touch-action: none;
	}
	.preview-canvas:active {
		cursor: grabbing;
	}
</style>
