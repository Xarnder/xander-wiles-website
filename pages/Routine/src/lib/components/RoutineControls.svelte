<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { hapticComplete, hapticLater, hapticNotToday } from '$lib/utils/haptics';

	let {
		canBack = false,
		canLater = true,
		showHints = false,
		lead,
		oncomplete,
		onlater,
		onnottoday,
		onback
	}: {
		canBack?: boolean;
		canLater?: boolean;
		/** Keyboard shortcut tips — caller should only enable on the first task. */
		showHints?: boolean;
		/** Optional content above the action corners (usually the current task). */
		lead?: Snippet;
		oncomplete: () => void;
		onlater: () => void;
		onnottoday: () => void;
		onback: () => void;
	} = $props();

	let flash = $state(false);
	let flashTimer: number | undefined;
	let isTouch = $state(false);

	onMount(() => {
		const mq = window.matchMedia('(pointer: coarse)');
		const sync = () => {
			isTouch = mq.matches;
		};
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	const hintsVisible = $derived(showHints && !isTouch);

	function complete() {
		flash = true;
		window.clearTimeout(flashTimer);
		flashTimer = window.setTimeout(() => {
			flash = false;
		}, 220);
		hapticComplete();
		oncomplete();
	}

	function later() {
		if (!canLater) return;
		hapticLater();
		onlater();
	}

	function notToday() {
		hapticNotToday();
		onnottoday();
	}
</script>

<div class={['controls', lead && 'with-lead']}>
	{#if lead}
		<div class="lead">
			{@render lead()}
		</div>
	{/if}

	<div class="secondary">
		<button
			type="button"
			class="btn later"
			onclick={later}
			disabled={!canLater}
			title="Come back to this after the other remaining tasks"
			data-testid="later-task"
		>
			Later
		</button>
		<button
			type="button"
			class="btn not-today"
			onclick={notToday}
			title="Remove this from today's list"
			data-testid="not-today-task"
		>
			Not Today
		</button>
		<button
			type="button"
			class="btn back"
			onclick={onback}
			disabled={!canBack}
			data-testid="back-task">Back</button
		>
		{#if hintsVisible}
			<p class="hint" data-testid="keyboard-hints" aria-hidden="true">
				Space complete · L later · N not today · ← back · Esc exit
			</p>
		{/if}
	</div>

	<button
		type="button"
		class={['btn', 'complete', flash && 'flash']}
		onclick={complete}
		data-testid="complete-task"
	>
		Complete
	</button>
</div>

<style>
	.controls {
		display: grid;
		grid-template-columns: 1fr 1fr;
		/* Top: roomy task title. Bottom: shorter action corners. */
		grid-template-rows: minmax(0, 1fr) minmax(7.25rem, 28dvh);
		gap: 0.5rem;
		flex: 1;
		min-height: 0;
		height: 100%;
		width: 100%;
	}

	.lead {
		grid-column: 1 / -1;
		grid-row: 1;
		min-width: 0;
		min-height: 0;
		overflow: auto;
	}

	.secondary {
		grid-column: 1;
		grid-row: 2;
		position: relative;
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
		gap: 0.5rem;
		min-width: 0;
		min-height: 0;
		height: 100%;
	}

	.complete {
		grid-column: 2;
		grid-row: 2;
		width: 100%;
		height: 100%;
		min-height: 0;
		border-radius: 1.35rem;
		background: var(--accent);
		color: var(--on-accent);
		font-size: clamp(1.15rem, 4vw, 1.55rem);
		font-weight: 800;
		letter-spacing: 0.01em;
		border: none;
		cursor: pointer;
		touch-action: manipulation;
		box-shadow: var(--accent-glow);
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 0.75rem;
		transition:
			transform 120ms ease,
			box-shadow 160ms ease,
			filter 160ms ease;
	}

	.complete.flash {
		filter: brightness(1.12);
		box-shadow:
			var(--accent-glow),
			0 0 0 4px color-mix(in srgb, var(--accent) 35%, transparent);
	}

	:global(html[data-theme='oled']) .complete {
		background: linear-gradient(180deg, var(--accent-strong), var(--accent));
		box-shadow: var(--accent-glow);
	}

	:global(html[data-theme='oled']) .complete.flash {
		filter: brightness(1.18);
		box-shadow:
			0 0 14px color-mix(in srgb, var(--accent-strong) 95%, transparent),
			0 0 32px color-mix(in srgb, var(--accent) 70%, transparent),
			0 0 64px color-mix(in srgb, var(--accent-strong) 50%, transparent),
			0 0 0 5px color-mix(in srgb, var(--accent) 45%, transparent);
	}

	.later,
	.not-today,
	.back {
		width: 100%;
		height: 100%;
		min-height: 0;
		border-radius: 1.1rem;
		font-weight: 700;
		cursor: pointer;
		touch-action: manipulation;
		font-size: clamp(0.82rem, 2.2vw, 1.02rem);
		line-height: 1.2;
		text-align: center;
		padding: 0.35rem 0.4rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.later {
		grid-column: 1 / -1;
		grid-row: 1;
		background: var(--later);
		color: var(--on-later);
		border: none;
		font-size: clamp(0.9rem, 2.4vw, 1.1rem);
	}

	.not-today {
		grid-column: 1;
		grid-row: 2;
		background: var(--not-today);
		color: var(--on-not-today);
		border: none;
		font-weight: 700;
		font-size: clamp(0.9rem, 2.4vw, 1.1rem);
	}

	.back {
		grid-column: 2;
		grid-row: 2;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink-soft);
		font-weight: 600;
	}

	.later:disabled,
	.back:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.complete:active,
	.later:active,
	.not-today:active,
	.back:active {
		transform: scale(0.985);
	}

	.hint {
		position: absolute;
		left: 0;
		right: 0;
		bottom: calc(100% + 0.3rem);
		margin: 0;
		text-align: left;
		color: var(--muted);
		font-size: 0.72rem;
		letter-spacing: 0.01em;
		pointer-events: none;
		line-height: 1.35;
	}

	@media (pointer: coarse), (hover: none) {
		.hint {
			display: none;
		}
	}
</style>
