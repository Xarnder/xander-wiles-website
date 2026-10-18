<script lang="ts">
	interface Props {
		/** The bar's element, for `LocatorBar` (game/hud) to place markers in. */
		element?: HTMLDivElement | null;
	}

	let { element = $bindable(null) }: Props = $props();
</script>

<!--
	The locator bar: other players' directions relative to where you're looking. The markers are
	created and moved by `LocatorBar.ts` every frame, outside Svelte, so a moving crowd never
	re-renders this component.
-->
<div class="locator-bar" data-testid="locator-bar" aria-hidden="true" bind:this={element}>
	<span class="centre-tick"></span>
</div>

<style>
	.locator-bar {
		position: fixed;
		top: 2.85rem;
		left: 50%;
		transform: translateX(-50%);
		/* Between the corner HUD (FPS on the left; clock and Mini Build usage on the right). */
		width: clamp(14rem, calc(100vw - 32rem), 34rem);
		height: 1.1rem;
		z-index: 12;
		pointer-events: none;
		visibility: hidden;
		border-bottom: 1px solid rgba(234, 246, 255, 0.28);
		background: linear-gradient(
			90deg,
			transparent,
			rgba(8, 16, 12, 0.28) 15%,
			rgba(8, 16, 12, 0.28) 85%,
			transparent
		);
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}

	/* Too narrow to fit between the corners (phones, small windows): drop below them instead. */
	@media (max-width: 46rem) {
		.locator-bar {
			top: 7.4rem;
			width: 84vw;
		}
	}

	.centre-tick {
		position: absolute;
		left: 50%;
		bottom: 0;
		width: 1px;
		height: 0.45rem;
		background: rgba(234, 246, 255, 0.55);
	}

	/* Markers are added by LocatorBar.ts, so their styles reach out of this component's scope. */
	.locator-bar :global(.locator-marker) {
		position: absolute;
		left: 0;
		top: 0.55rem;
		width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		transform-origin: 0 0;
		will-change: transform;
	}

	/* Each player's own colour fills the dot; a thin dark rim keeps pale colours visible on the sky. */
	.locator-bar :global(.locator-dot) {
		width: 0.72rem;
		height: 0.72rem;
		margin-top: -0.36rem;
		flex: none;
		border-radius: 50%;
		background: var(--locator-colour, #eaf6ff);
		border: 1.5px solid rgba(4, 18, 31, 0.75);
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.55),
			0 0 6px rgba(0, 0, 0, 0.5);
	}

	.locator-bar :global(.locator-arrow) {
		position: absolute;
		bottom: 0.42rem;
		font-size: 0.55rem;
		line-height: 1;
		color: var(--locator-colour, #eaf6ff);
		text-shadow: 0 0 3px rgba(0, 0, 0, 0.85);
		white-space: nowrap;
	}

	.locator-bar :global(.locator-label) {
		margin-top: 0.3rem;
		font-size: 0.68rem;
		font-weight: 600;
		color: #eaf6ff;
		white-space: nowrap;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
	}

	.locator-bar :global(.locator-label:empty) {
		display: none;
	}

	/* The closest player: a bigger dot with a glow, and a pill in their colour with the distance. */
	.locator-bar :global(.locator-marker.closest) {
		z-index: 1;
	}

	.locator-bar :global(.locator-marker.closest .locator-dot) {
		box-shadow:
			0 0 0 2px rgba(255, 255, 255, 0.9),
			0 0 10px var(--locator-colour, #eaf6ff);
	}

	.locator-bar :global(.locator-marker.closest .locator-label) {
		margin-top: 0.32rem;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: var(--locator-colour, #eaf6ff);
		color: var(--locator-ink, #04121f);
		text-shadow: none;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
	}

	/* Out of view: the pill hangs inwards from the end of the bar instead of off the edge. */
	.locator-bar :global(.locator-marker.edge-left .locator-label) {
		align-self: flex-start;
		transform: translateX(-0.35rem);
	}

	.locator-bar :global(.locator-marker.edge-right .locator-label) {
		align-self: flex-end;
		transform: translateX(0.35rem);
	}

	.locator-bar :global(.locator-marker.dim) {
		opacity: 0.45;
	}
</style>
