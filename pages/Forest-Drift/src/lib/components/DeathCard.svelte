<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		/** What happened: "You fell too far", "You were knocked out". */
		title: string;
		/** How far, or who did it, when known. */
		detail: string | null;
		onRespawn: () => void;
	}

	let { title, detail, onRespawn }: Props = $props();
	let button: HTMLButtonElement;

	onMount(() => button.focus());

	// Focus stays on the only control: Tab cannot wander into the game HUD behind the card.
	function keepFocus(event: KeyboardEvent) {
		if (event.key === 'Tab') {
			event.preventDefault();
			button.focus();
		}
	}
</script>

<div data-ui-backdrop class="death-backdrop" role="presentation">
	<div
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
		<button type="button" bind:this={button} onclick={onRespawn} data-testid="death-respawn">
			Respawn
		</button>
	</div>
</div>

<style>
	.death-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: grid;
		place-items: center;
		animation: fade-in 0.6s ease-out;
	}
	.death-card {
		min-width: 15rem;
		padding: 1.4rem 1.8rem 1.5rem;
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
