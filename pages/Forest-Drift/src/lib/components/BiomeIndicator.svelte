<script lang="ts">
	/**
	 * A brief card naming the biome the player has entered (decision Q28). The scene decides WHEN
	 * (after a few seconds in the new biome, at most once per 20 s, and only if "Show biome names"
	 * is on); this shows it for a moment and fades. Screen readers hear it once through a polite
	 * live region; the card itself is decorative. Reduced motion: a plain fade, no slide.
	 */
	let { name, token }: { name: string | null; token: number } = $props();

	const VISIBLE_MS = 3800;

	let shown = $state<string | null>(null);
	let visible = $state(false);
	let announcement = $state('');

	$effect(() => {
		// Re-run for every new announcement, even of the same biome.
		void token;
		if (!name) return;
		shown = name;
		visible = true;
		announcement = `Entered ${name}`;
		const timer = window.setTimeout(() => (visible = false), VISIBLE_MS);
		return () => window.clearTimeout(timer);
	});
</script>

<div class="visually-hidden" role="status" aria-live="polite" data-testid="biome-announcement">
	{announcement}
</div>
{#if shown}
	<div
		class="biome-card"
		class:visible
		data-ui-surface="panel"
		aria-hidden="true"
		data-testid="biome-card"
		data-visible={visible}
	>
		<span class="eyebrow">Entering</span>
		<span class="name">{shown}</span>
	</div>
{/if}

<style>
	.biome-card {
		position: fixed;
		top: max(72px, 11vh);
		left: 50%;
		z-index: 20;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		max-width: min(420px, calc(100vw - 32px));
		padding: 10px 22px 12px;
		border-radius: 12px;
		text-align: center;
		pointer-events: none;
		opacity: 0;
		transform: translate(-50%, -6px);
		transition:
			opacity 600ms ease,
			transform 600ms ease;
	}

	.biome-card.visible {
		opacity: 1;
		transform: translate(-50%, 0);
	}

	.eyebrow {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.8;
	}

	.name {
		font-size: clamp(1.15rem, 2.6vw, 1.6rem);
		font-weight: 700;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	@media (prefers-reduced-motion: reduce) {
		.biome-card,
		.biome-card.visible {
			transform: translate(-50%, 0);
			transition: opacity 300ms linear;
		}
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
