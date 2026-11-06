<script lang="ts">
	import emblemWebp from '#lib/assets/forest-drift-emblem.webp';
	import emblemPng from '#lib/assets/forest-drift-emblem.png';

	interface Props {
		/** First thing on screen (landing, loading): fetch it straight away. */
		eager?: boolean;
	}

	const { eager = false }: Props = $props();
</script>

<!--
	The Forest Drift woodland emblem, the game's only logo. WebP for every current browser, the PNG
	for any that can't show WebP. It fills the width of whatever holds it, keeping its shape.
-->
<picture class="forest-drift-logo">
	<source srcset={emblemWebp} type="image/webp" />
	<img
		src={emblemPng}
		alt="Forest Drift"
		width="1618"
		height="972"
		loading={eager ? 'eager' : 'lazy'}
		fetchpriority={eager ? 'high' : 'auto'}
		decoding="async"
		draggable="false"
		data-testid="forest-drift-logo"
	/>
</picture>

<style>
	picture {
		display: block;
		width: 100%;
	}

	img {
		display: block;
		width: 100%;
		height: auto;
		filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.45));
		user-select: none;
		-webkit-user-drag: none;
	}
</style>
