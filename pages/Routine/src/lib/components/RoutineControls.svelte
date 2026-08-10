<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { hapticComplete, hapticSkip } from '$lib/utils/haptics';

	let {
		canBack = false,
		revisiting = false,
		showHints = false,
		lead,
		oncomplete,
		onskip,
		onback,
		onexit
	}: {
		canBack?: boolean;
		revisiting?: boolean;
		/** Keyboard shortcut tips — caller should only enable on the first task. */
		showHints?: boolean;
		/** Optional content above the action corners (usually the current task). */
		lead?: Snippet;
		oncomplete: () => void;
		onskip: () => void;
		onback: () => void;
		onexit: () => void;
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

	function skip() {
		hapticSkip();
		onskip();
	}
</script>

<div class={['controls', lead && 'with-lead']}>
	{#if lead}
		<div class="lead">
			{@render lead()}
		</div>
	{/if}

	<div class="secondary">
		<button type="button" class="btn skip" onclick={skip} data-testid="skip-task">
			{revisiting ? 'Skip instead' : 'Skip'}
		</button>
		<button
			type="button"
			class="btn back"
			onclick={onback}
			disabled={!canBack}
			data-testid="back-task">Back</button
		>
		<button type="button" class="btn exit" onclick={onexit} data-testid="exit-run">Exit</button>
		{#if hintsVisible}
			<p class="hint" data-testid="keyboard-hints" aria-hidden="true">
				Space complete · S skip · ← back · Esc exit
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

	.skip,
	.back,
	.exit {
		width: 100%;
		height: 100%;
		min-height: 0;
		border-radius: 1.1rem;
		font-weight: 700;
		cursor: pointer;
		touch-action: manipulation;
		font-size: clamp(0.88rem, 2.3vw, 1.05rem);
	}

	.skip {
		grid-column: 1 / -1;
		grid-row: 1;
		background: var(--accent-soft);
		color: var(--accent-strong);
		border: none;
		font-size: clamp(0.95rem, 2.6vw, 1.15rem);
	}

	.back {
		grid-column: 1;
		grid-row: 2;
	}

	.exit {
		grid-column: 2;
		grid-row: 2;
	}

	.back,
	.exit {
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink-soft);
		font-weight: 600;
	}

	.back:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.complete:active,
	.skip:active,
	.back:active,
	.exit:active {
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
		font-size: 0.75rem;
		letter-spacing: 0.01em;
		pointer-events: none;
		white-space: nowrap;
	}

	@media (pointer: coarse), (hover: none) {
		.hint {
			display: none;
		}
	}
</style>
