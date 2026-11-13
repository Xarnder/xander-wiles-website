<script lang="ts">
	import { keyLabel } from '#lib/game/input/keyLabels.svelte';
	/**
	 * The creature being ridden (riding plan §11), in the bottom HUD next to the carry chip. Text and
	 * a seat icon, not colour alone; climbing on and off is announced by the page.
	 */
	interface Props {
		species: string;
		/** `neck`: astride the neck; `right-shoulder`: on the right shoulder. */
		seat: 'neck' | 'right-shoulder' | null;
		/** Touch screens have no K key. */
		touch: boolean;
	}
	let { species, seat, touch }: Props = $props();
	const where = $derived(seat === 'right-shoulder' ? 'on its shoulder' : 'on its shoulders');
	const hint = $derived(
		touch ? 'Get off with the button' : `${keyLabel('interact.use')} to get off`
	);
</script>

<div class="ride-hud" role="img" aria-label={`Riding ${species} ${where}`} data-testid="ride-hud">
	<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
		<!-- A seat: a curved saddle over a stirrup. -->
		<path d="M2 7c2-3 10-3 12 0l-2 2H4z" />
		<path d="M8 9v3m-2 1h4" fill="none" stroke="currentColor" stroke-width="1.5" />
	</svg>
	<span class="name" aria-hidden="true">{species}</span>
	<span class="hint" aria-hidden="true">{hint}</span>
</div>

<style>
	.ride-hud {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--fd-ammo-bg, rgba(16, 28, 22, 0.72));
		color: var(--fd-ammo-text, #f1f7ec);
		font-size: 12px;
		line-height: 1;
		pointer-events: none;
		backdrop-filter: blur(4px);
	}
	.icon {
		width: 14px;
		height: 14px;
		fill: currentColor;
	}
	.name {
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hint {
		opacity: 0.75;
	}
	@media (max-width: 600px) {
		.name {
			max-width: 96px;
		}
	}
</style>
