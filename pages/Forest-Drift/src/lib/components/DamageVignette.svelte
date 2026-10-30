<script lang="ts">
	interface Props {
		/** Bumped on every hit so the flash replays. */
		hit: number;
		/** Points taken by that hit; bigger hits flash stronger. */
		amount: number;
	}

	let { hit, amount }: Props = $props();
	let strength = $derived(Math.min(0.35, 0.08 + amount * 0.02));
</script>

{#key hit}
	{#if hit > 0}
		<div
			class="damage-vignette"
			style:--strength={strength}
			aria-hidden="true"
			data-testid="damage-vignette"
		></div>
	{/if}
{/key}

<style>
	.damage-vignette {
		position: fixed;
		inset: 0;
		z-index: 30;
		pointer-events: none;
		background: radial-gradient(ellipse at center, transparent 55%, rgba(176, 28, 24, 0.9) 100%);
		opacity: 0;
		animation: flash 0.4s ease-out forwards;
	}
	@keyframes flash {
		from {
			opacity: var(--strength);
		}
		to {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		/* A brief static tint instead of a fade. */
		.damage-vignette {
			animation: flash 0.3s steps(1, end) forwards;
		}
	}
</style>
