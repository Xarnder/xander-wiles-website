<script lang="ts">
	import { HEALTH_MAX } from '$lib/game/player/PlayerHealth';

	interface Props {
		current: number;
		max?: number;
		low?: boolean;
		/** Width of the whole row (bar + number), in px: the hotbar's, so they line up. */
		width?: number;
	}

	let { current, max = HEALTH_MAX, low = false, width }: Props = $props();

	/** How long the pale "just lost" segments linger before draining (Q17). */
	const GHOST_MS = 600;
	const segments = Array.from({ length: HEALTH_MAX }, (_, index) => index);

	// Segments between `current` and `ghost` were just lost; they fade out after GHOST_MS.
	let ghost = $state(0);
	let previous: number | null = null;
	$effect(() => {
		const value = current;
		if (previous !== null && value < previous) {
			ghost = Math.max(ghost, previous);
			const timer = setTimeout(() => (ghost = value), GHOST_MS);
			previous = value;
			return () => clearTimeout(timer);
		}
		previous = value;
		ghost = value;
	});

	function stateOf(index: number): 'full' | 'ghost' | 'empty' {
		if (index < current) return 'full';
		return index < ghost ? 'ghost' : 'empty';
	}
</script>

<div
	class="health-hud"
	class:low
	style:width={width ? `${width}px` : undefined}
	data-testid="health-hud"
>
	<div
		class="health-bar"
		class:low
		role="meter"
		aria-label="Health"
		aria-valuemin={0}
		aria-valuemax={max}
		aria-valuenow={current}
		aria-valuetext={`${current} of ${max}`}
		title={`Health ${current} / ${max}`}
		data-testid="health-bar"
	>
		{#each segments as index (index)}
			<span class="seg" data-state={stateOf(index)} data-testid="health-seg"></span>
		{/each}
	</div>
	<!-- The meter already tells screen readers the value; this is the visible readout. -->
	<span class="health-count" aria-hidden="true" data-testid="health-count">{current}/{max}</span>
</div>

<style>
	.health-hud {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 260px;
		max-width: 100%;
		box-sizing: border-box;
		/* Line the bar up with the tray's rounded edge rather than its outer border. */
		padding-inline: 6px;
	}
	.health-count {
		flex: 0 0 auto;
		min-width: 4.2ch;
		text-align: right;
		font:
			600 11px/1 system-ui,
			-apple-system,
			sans-serif;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
		color: #f7edd9e6;
		text-shadow: 0 1px 3px #000c;
		user-select: none;
		-webkit-user-select: none;
	}
	.low .health-count {
		color: var(--fd-health-low);
	}
	.health-bar {
		display: flex;
		flex: 1 1 auto;
		min-width: 0;
		gap: 1px;
		height: 6px;
		padding: 2px;
		box-sizing: content-box;
		border-radius: 4px;
		background: var(--fd-health-backing);
		box-shadow: 0 2px 8px #0005;
		user-select: none;
		-webkit-user-select: none;
		/* Hover shows the exact value (Q18); the stack around the bar ignores the pointer. */
		pointer-events: auto;
	}
	.seg {
		flex: 1 1 0;
		min-width: 0;
		background: var(--fd-health-empty);
		box-shadow: inset 0 0 0 1px var(--fd-health-empty-edge);
		transition: background-color 0.25s ease-out;
	}
	.seg:first-child {
		border-radius: 2px 0 0 2px;
	}
	.seg:last-child {
		border-radius: 0 2px 2px 0;
	}
	.seg[data-state='full'] {
		background: linear-gradient(180deg, var(--fd-health-top), var(--fd-health) 45%);
		box-shadow: none;
	}
	.seg[data-state='ghost'] {
		background: var(--fd-health-ghost);
		box-shadow: none;
		transition: none;
	}
	.low .seg[data-state='full'] {
		background: linear-gradient(180deg, #fff1e6, var(--fd-health-low) 45%);
		animation: low-pulse 1.4s ease-in-out infinite;
	}
	@keyframes low-pulse {
		50% {
			opacity: 0.55;
		}
	}
	@media (max-width: 650px), (max-height: 500px) and (orientation: landscape) {
		.health-hud {
			width: 200px;
		}
		.health-bar {
			height: 5px;
		}
	}
	/* The bar never takes a touch from the joystick, look zone or hotbar (Q25). */
	@media (pointer: coarse) {
		.health-bar {
			pointer-events: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.seg {
			transition: none;
		}
		/* Low health stays distinct without motion: a bright outline instead of a pulse. */
		.low .seg[data-state='full'] {
			animation: none;
			box-shadow: inset 0 0 0 1px #fff6;
		}
	}
</style>
