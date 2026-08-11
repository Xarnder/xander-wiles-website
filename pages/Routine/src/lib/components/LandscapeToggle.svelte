<script lang="ts">
	import { base } from '$app/paths';
	import { isForceLandscape, toggleForceLandscape } from '$lib/stores/preferences.svelte';

	const on = $derived(isForceLandscape());

	const horizontalIcon = `${base}/icons/rotate-horizontal.svg`;
	const verticalIcon = `${base}/icons/rotate-vertical.svg`;
</script>

<button
	type="button"
	class={['landscape-toggle', on && 'is-on']}
	onclick={toggleForceLandscape}
	aria-pressed={on}
	aria-label={on
		? 'Force landscape during runs is on. Tap to allow any orientation.'
		: 'Force landscape during runs is off. Tap to turn on.'}
	title={on
		? 'Runs force landscape (tap to disable)'
		: 'Runs allow any orientation (tap to force landscape)'}
	data-testid="landscape-toggle"
>
	<span
		class="icon"
		aria-hidden="true"
		style:--icon-url={on ? `url('${horizontalIcon}')` : `url('${verticalIcon}')`}
	></span>
	<span class="text">{on ? 'Landscape' : 'Any rotate'}</span>
</button>

<style>
	.landscape-toggle {
		appearance: none;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		border-radius: 999px;
		min-height: 2.5rem;
		padding: 0 0.9rem;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 600;
		cursor: pointer;
		touch-action: manipulation;
		box-shadow: var(--shadow-soft);
	}

	.landscape-toggle.is-on {
		border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
		background: var(--accent-soft);
		color: var(--accent-strong);
	}

	.landscape-toggle:active {
		transform: scale(0.98);
	}

	.icon {
		width: 1.15rem;
		height: 1.15rem;
		flex: 0 0 auto;
		background-color: currentColor;
		-webkit-mask: var(--icon-url) center / contain no-repeat;
		mask: var(--icon-url) center / contain no-repeat;
	}

	.text {
		font-size: 0.9rem;
		color: inherit;
	}
</style>
