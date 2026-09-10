<script lang="ts">
	import { fade } from 'svelte/transition';
	import { onDestroy } from 'svelte';

	let {
		cycles = 0,
		active = false,
		top = '81.25%',
		right = 'calc(50% + 36px)',
		left,
		text = 'Follow this point with your finger',
		autoDismissMs = 7000
	} = $props<{
		cycles?: number;
		active?: boolean;
		top?: string;
		right?: string;
		left?: string;
		text?: string;
		autoDismissMs?: number;
	}>();

	let hasAppeared = $state(false);
	let dismissed = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	function clearTimer() {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	// 1. Trigger appearance once when active (halfway up first stroke)
	$effect(() => {
		if (active && cycles < 2 && !hasAppeared && !dismissed) {
			hasAppeared = true;
		}
	});

	// 2. Once appeared, start the auto-dismiss timer so it cleanly goes away after some time
	$effect(() => {
		if (hasAppeared && !dismissed && timer === null) {
			timer = setTimeout(() => {
				dismissed = true;
				timer = null;
			}, autoDismissMs);
		}
	});

	// 3. When two cycles complete, dismiss immediately
	$effect(() => {
		if (cycles >= 2 && !dismissed) {
			dismissed = true;
			clearTimer();
		}
	});

	// 4. Reset when whole session restarts
	$effect(() => {
		if (!active && cycles === 0) {
			hasAppeared = false;
			dismissed = false;
			clearTimer();
		}
	});

	onDestroy(() => {
		clearTimer();
	});

	const visible = $derived(active && hasAppeared && !dismissed && cycles < 2);
</script>

{#if visible}
	<div
		class="guide-hint"
		transition:fade={{ duration: 300 }}
		style:top={top}
		style:right={right}
		style:left={left}
		role="note"
		aria-label={text}
	>
		<div class="guide-hint-content">
			<span class="guide-hint-label">{text}</span>
			<span class="guide-hint-icon" aria-hidden="true">
				<svg viewBox="0 0 20 20" class="guide-icon-svg" fill="none">
					<circle
						cx="10"
						cy="10"
						r="7.5"
						stroke="currentColor"
						stroke-width="1.8"
						class="guide-pulse-ring"
					/>
					<circle cx="10" cy="10" r="3.8" fill="currentColor" />
				</svg>
			</span>
		</div>
	</div>
{/if}

<style>
	.guide-hint {
		position: absolute;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		pointer-events: none;
		user-select: none;
		-webkit-user-select: none;
		z-index: 9;
	}

	.guide-hint-content {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 9px 6px 12px;
		border-radius: 999px;
		background: var(--guide-hint-bg, rgba(0, 18, 29, 0.88));
		border: 1px solid var(--guide-hint-border, rgba(79, 227, 255, 0.45));
		box-shadow: 0 4px 18px var(--guide-hint-shadow, rgba(0, 0, 0, 0.45)),
			0 0 16px var(--guide-hint-glow, rgba(79, 227, 255, 0.28));
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		white-space: nowrap;
	}

	/* Caret notch pointing right towards the guide target point */
	.guide-hint-content::after {
		content: '';
		position: absolute;
		right: -5px;
		top: 50%;
		transform: translateY(-50%) rotate(45deg);
		width: 8px;
		height: 8px;
		background: var(--guide-hint-bg, rgba(0, 18, 29, 0.88));
		border-top: 1px solid var(--guide-hint-border, rgba(79, 227, 255, 0.45));
		border-right: 1px solid var(--guide-hint-border, rgba(79, 227, 255, 0.45));
		pointer-events: none;
	}

	.guide-hint-label {
		font-family: 'Quicksand', 'Nunito', ui-rounded, sans-serif;
		font-size: 11.5px;
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.01em;
		color: var(--guide-hint-text, #ffffff);
		text-align: right;
		max-width: 115px;
		white-space: normal;
	}

	.guide-hint-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--guide-hint-icon, #4fe3ff);
	}

	.guide-icon-svg {
		width: 18px;
		height: 18px;
		overflow: visible;
	}

	.guide-pulse-ring {
		transform-origin: 10px 10px;
		animation: guideRingPulse 2.2s ease-in-out infinite;
	}

	@keyframes guideRingPulse {
		0%, 100% {
			transform: scale(0.92);
			opacity: 0.4;
		}
		50% {
			transform: scale(1.15);
			opacity: 0.9;
		}
	}

	@media (max-width: 480px) {
		.guide-hint {
			right: calc(50% + 30px) !important;
		}
		.guide-hint-content {
			max-width: calc(50vw - 32px);
			box-sizing: border-box;
			padding: 5px 8px 5px 10px;
			gap: 6px;
		}
		.guide-hint-label {
			font-size: 11px;
			max-width: 105px;
		}
	}

	@media (max-width: 360px) {
		.guide-hint {
			right: calc(50% + 26px) !important;
		}
		.guide-hint-content {
			max-width: calc(50vw - 28px);
			padding: 4px 6px 4px 8px;
			gap: 5px;
		}
		.guide-hint-label {
			font-size: 10px;
			max-width: 90px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.guide-pulse-ring {
			animation: none !important;
		}
		.guide-hint {
			transition: none !important;
		}
	}
</style>
