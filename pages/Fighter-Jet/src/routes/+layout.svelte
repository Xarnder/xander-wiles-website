<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		width: 100%;
		height: 100%;
		height: 100dvh;
		overflow: hidden;
		color-scheme: dark;
		background: #06121b;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		font-synthesis: none;
		text-rendering: optimizeLegibility;
		-webkit-font-smoothing: antialiased;
	}

	:global(body) {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		height: 100dvh;
		margin: 0;
		overflow: hidden;
		color: #eefbfe;
		background: #06121b;
		overscroll-behavior: none;
	}

	:global(body > div) {
		width: 100%;
		height: 100%;
		height: 100dvh;
		overflow: hidden;
	}

	:global(.game-shell) {
		width: 100%;
		height: 100%;
		height: 100dvh;
		overscroll-behavior: none;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}

	:global(.game-shell:has(dialog[open])) {
		touch-action: auto;
	}

	:global(dialog),
	:global(dialog button),
	:global(dialog input),
	:global(dialog select),
	:global(dialog textarea) {
		touch-action: auto;
		-webkit-touch-callout: default;
	}

	:global(dialog input),
	:global(dialog select),
	:global(dialog textarea) {
		user-select: auto;
		-webkit-user-select: auto;
	}

	:global(button),
	:global(input),
	:global(select),
	:global(textarea) {
		font-family: inherit;
	}

	:global(button) {
		-webkit-tap-highlight-color: transparent;
	}

	:global(::selection) {
		color: #061319;
		background: #83e3f1;
	}

	:global(:focus-visible) {
		outline: 2px solid #fff4df;
		outline-offset: 3px;
	}

	:global(.sr-only) {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(*),
		:global(*::before),
		:global(*::after) {
			scroll-behavior: auto !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
