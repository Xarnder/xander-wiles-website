<script lang="ts">
	import { onDestroy } from 'svelte';
	import preview from '$lib/assets/menu/countryside-preview.webp';
	import fullImage from '$lib/assets/menu/countryside.png';
	let ready = $state(false);
	let started = false;
	let disposed = false;
	async function upgrade() {
		if (started || disposed) return;
		started = true;
		const image = new Image();
		image.src = fullImage;
		try {
			await image.decode();
			if (!disposed) ready = true;
		} catch {
			/* Keep the preview. */
		}
	}
	onDestroy(() => {
		disposed = true;
	});
</script>

<div class="countryside" aria-hidden="true">
	<img src={preview} alt="" fetchpriority="high" onload={upgrade} onerror={upgrade} />
	{#if ready}<img class="full" src={fullImage} alt="" />{/if}
</div>

<style>
	.countryside {
		position: fixed;
		inset: 0;
		z-index: -1;
		pointer-events: none;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 57% center;
		position: absolute;
		inset: 0;
	}
	.full {
		animation: reveal 0.6s ease both;
	}
	@keyframes reveal {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.full {
			animation: none;
		}
	}
</style>
