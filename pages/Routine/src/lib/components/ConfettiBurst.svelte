<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { prefersReducedMotion } from 'svelte/motion';
	import {
		confettiColorsFrom,
		createConfettiBurst,
		drawConfetti,
		stepConfetti,
		type ConfettiPiece
	} from '$lib/utils/confetti';

	const playConfetti: Attachment = (node) => {
		if (!(node instanceof HTMLCanvasElement)) return;
		const canvas = node;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		let frame = 0;
		let pieces: ConfettiPiece[] = [];
		let last = 0;
		let cssW = 0;
		let cssH = 0;
		let started = false;
		let attempts = 0;

		const resize = () => {
			const host = canvas.parentElement;
			const dpr = Math.min(2, window.devicePixelRatio || 1);
			cssW = Math.max(1, host?.clientWidth || canvas.clientWidth);
			cssH = Math.max(1, host?.clientHeight || canvas.clientHeight);
			canvas.width = Math.floor(cssW * dpr);
			canvas.height = Math.floor(cssH * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};

		const tick = (now: number) => {
			const dt = Math.min(0.033, (now - last) / 1000);
			last = now;
			pieces = stepConfetti(pieces, dt, now, cssH);
			ctx.clearRect(0, 0, cssW, cssH);
			drawConfetti(ctx, pieces, now);
			if (pieces.length > 0) frame = requestAnimationFrame(tick);
		};

		const begin = () => {
			resize();
			if (!started && (cssW < 8 || cssH < 8) && attempts < 10) {
				attempts += 1;
				frame = requestAnimationFrame(begin);
				return;
			}
			if (started) return;
			started = true;
			const start = performance.now();
			last = start;
			pieces = createConfettiBurst({
				width: cssW,
				height: cssH,
				colors: confettiColorsFrom(canvas),
				now: start
			});
			frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(begin);

		return () => {
			cancelAnimationFrame(frame);
			ctx.clearRect(0, 0, cssW, cssH);
		};
	};
</script>

{#if !prefersReducedMotion.current}
	<canvas class="layer" {@attach playConfetti} data-testid="summary-confetti" aria-hidden="true"
	></canvas>
{/if}

<style>
	.layer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 8;
	}
</style>
