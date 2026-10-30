<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { RESPAWN_DELAY_MS } from '$lib/game/player/PlayerHealth';

	interface Props {
		/** What happened: "You fell too far", "You were knocked out". */
		title: string;
		/** How far, or who did it, when known. */
		detail: string | null;
		onRespawn: () => void;
	}

	let { title, detail, onRespawn }: Props = $props();
	let card: HTMLDivElement;
	let button = $state<HTMLButtonElement>();
	/** Whole seconds left before Respawn works; the player lies on the floor meanwhile. */
	let secondsLeft = $state(Math.ceil(RESPAWN_DELAY_MS / 1000));

	onMount(() => {
		card.focus();
		const readyAt = performance.now() + RESPAWN_DELAY_MS;
		const timer = setInterval(() => {
			secondsLeft = Math.max(0, Math.ceil((readyAt - performance.now()) / 1000));
			if (secondsLeft === 0) {
				clearInterval(timer);
				// Enter or Space now respawns: the button takes focus the moment it works.
				void tick().then(() => button?.focus());
			}
		}, 100);
		return () => clearInterval(timer);
	});

	// Focus stays on the card: Tab cannot wander into the game HUD behind it.
	function keepFocus(event: KeyboardEvent) {
		if (event.key === 'Tab') {
			event.preventDefault();
			(secondsLeft === 0 ? button : card)?.focus();
		}
	}
</script>

<div class="death-backdrop" role="presentation">
	<div
		bind:this={card}
		data-ui-surface="panel"
		class="death-card"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="death-title"
		aria-describedby={detail !== null ? 'death-detail' : undefined}
		data-testid="death-card"
		tabindex="-1"
		onkeydown={keepFocus}
	>
		<h3 id="death-title">{title}</h3>
		{#if detail !== null}
			<p id="death-detail">{detail}</p>
		{/if}
		<button
			type="button"
			bind:this={button}
			onclick={onRespawn}
			disabled={secondsLeft > 0}
			data-testid="death-respawn"
		>
			{secondsLeft > 0 ? `Respawn in ${secondsLeft}` : 'Respawn'}
		</button>
	</div>
</div>

<style>
	/* Light enough to see yourself lying on the floor behind it (third-person view). */
	.death-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: grid;
		place-items: end center;
		padding-bottom: max(14vh, 6rem);
		background: radial-gradient(ellipse at center, transparent 45%, #0c0302b3 100%);
		animation: fade-in 0.6s ease-out;
	}
	.death-card {
		min-width: 15rem;
		padding: 1.2rem 1.8rem 1.3rem;
		text-align: center;
		outline: none;
	}
	h3 {
		margin: 0 0 0.3rem;
		font-size: 1.25rem;
	}
	p {
		margin: 0 0 1rem;
		opacity: 0.75;
	}
	button {
		min-width: 9rem;
		min-height: 44px;
		margin-top: 0.4rem;
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
	}
	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.death-backdrop {
			animation: none;
		}
	}
</style>
