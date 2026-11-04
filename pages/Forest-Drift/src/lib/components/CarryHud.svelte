<script lang="ts">
	/**
	 * The creature being carried and its seed-pellet charges (ranged weapons). Sits above the right
	 * end of the health row. Pips use shape and fill, not colour alone; screen readers get the
	 * label, and pick-up / put-down are announced by the page.
	 */
	interface Props {
		species: string;
		colour: string;
		charges: number;
		max: number;
		stowed: boolean;
	}
	let { species, colour, charges, max, stowed }: Props = $props();
	const label = $derived(
		`Carrying ${species}: ${charges} of ${max} shots ready${stowed ? ', firing paused' : ''}`
	);
</script>

<div
	class="carry-hud"
	class:stowed
	role="img"
	aria-label={label}
	data-testid="carry-hud"
	data-charges={charges}
>
	<span class="dot" style:background={colour} aria-hidden="true"></span>
	<span class="name" aria-hidden="true">{species}</span>
	<span class="pips" aria-hidden="true">
		{#each { length: max }, i (i)}
			<span class="pip" class:full={i < charges}></span>
		{/each}
	</span>
</div>

<style>
	.carry-hud {
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
	.carry-hud.stowed {
		opacity: 0.55;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.85);
	}
	.name {
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pips {
		display: inline-flex;
		gap: 4px;
	}
	.pip {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 1.5px solid var(--fd-ammo-pip, #f6e7a8);
		box-sizing: border-box;
	}
	.pip.full {
		background: var(--fd-ammo-pip, #f6e7a8);
	}
	@media (max-width: 600px) {
		.name {
			max-width: 96px;
		}
	}
</style>
