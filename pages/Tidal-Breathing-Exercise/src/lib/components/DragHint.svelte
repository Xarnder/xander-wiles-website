<script lang="ts">
	import { onMount } from 'svelte';

	let {
		left = 'calc(50% + 36px)',
		top = '81.25%',
		dragging = false,
		hasDragged = false,
		mode = 'line',
		onpointerdown,
		onpointermove,
		onpointerup,
		onpointercancel
	} = $props<{
		left?: string;
		top?: string;
		dragging?: boolean;
		hasDragged?: boolean;
		mode?: 'line' | 'square';
		onpointerdown?: (e: PointerEvent) => void;
		onpointermove?: (e: PointerEvent) => void;
		onpointerup?: (e: PointerEvent) => void;
		onpointercancel?: (e: PointerEvent) => void;
	}>();

	let showText = $state(false);
	let fading = $state(false);
	let visible = $state(true);
	let hintType = $state<'up' | 'up-down'>('up');

	let initialTimer: ReturnType<typeof setTimeout> | null = null;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let fadeTimer: ReturnType<typeof setTimeout> | null = null;

	const labelText = $derived(
		hintType === 'up'
			? 'Drag Up to get started'
			: mode === 'square'
				? 'Drag clockwise to get started'
				: 'Drag up and down to get started'
	);

	onMount(() => {
		// Initial 2 second delay for text on page open
		initialTimer = setTimeout(() => {
			if (!dragging && !hasDragged) {
				showText = true;
			}
		}, 2000);

		return () => {
			if (initialTimer) clearTimeout(initialTimer);
			if (idleTimer) clearTimeout(idleTimer);
			if (fadeTimer) clearTimeout(fadeTimer);
		};
	});

	// React to dragging changes
	$effect(() => {
		if (fadeTimer) clearTimeout(fadeTimer);
		if (idleTimer) clearTimeout(idleTimer);

		if (dragging) {
			// Actively dragging: fade out and hide
			fading = true;
			fadeTimer = setTimeout(() => {
				visible = false;
				fading = false;
			}, 240);
		} else {
			// Stopped dragging (or idle)
			if (hasDragged) {
				// User previously dragged and now stopped:
				// Wait 1.5s idle, then show "Drag up and down to get started"
				idleTimer = setTimeout(() => {
					if (!dragging) {
						hintType = 'up-down';
						showText = true;
						visible = true;
						fading = false;
					}
				}, 1500);
			} else {
				// Hasn't dragged yet: reset to 'up'
				hintType = 'up';
				visible = true;
				fading = false;
			}
		}
	});

	// React to reset (when hasDragged turns false)
	$effect(() => {
		if (!hasDragged && !dragging) {
			hintType = 'up';
			showText = false;
			visible = true;
			fading = false;
			if (initialTimer) clearTimeout(initialTimer);
			initialTimer = setTimeout(() => {
				if (!dragging && !hasDragged) {
					showText = true;
				}
			}, 2000);
		}
	});
</script>

{#if visible}
	<div
		class="drag-hint"
		class:up-down={hintType === 'up-down'}
		class:show-text={showText}
		class:fading
		style:left={left}
		style:top={top}
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		{onpointercancel}
		role="note"
		aria-label={showText ? labelText : hintType === 'up' ? 'Drag up' : 'Drag up and down'}
	>
		<div class="drag-hint-content">
			<span class="drag-hint-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" class="drag-svg" fill="none">
					<path
						d="M13,22.5,7.82,17.36a2,2,0,0,1-.59-1.43,2,2,0,0,1,2-2,2,2,0,0,1,1.43.59L12,15.82V6.38a2,2,0,0,1,1.74-2,1.87,1.87,0,0,1,1.51.56,1.83,1.83,0,0,1,.57,1.34V12l5,.72a1.91,1.91,0,0,1,1.64,1.89h0a17.18,17.18,0,0,1-1.82,7.71l-.09.18"
					/>
					<path
						d="M15.82,10.64a4.54,4.54,0,0,0,1.47-1,4.78,4.78,0,1,0-6.76,0,4.54,4.54,0,0,0,1.47,1"
					/>
					{#if hintType === 'up'}
						<polyline points="1.5 5.32 4.36 2.45 7.23 5.32" />
						<line x1="4.36" y1="12" x2="4.36" y2="2.45" />
					{:else}
						<polyline points="1.5 5.32 4.36 2.45 7.23 5.32" />
						<line x1="4.36" y1="15.55" x2="4.36" y2="2.45" />
						<polyline points="1.5 12.68 4.36 15.55 7.23 12.68" />
					{/if}
				</svg>
			</span>
			{#if showText}
				<span class="drag-hint-label">
					{#if hintType === 'up'}
						<span class="drag-hint-lead">Drag Up</span>
						<span class="drag-hint-sub">to get started</span>
					{:else if mode === 'square'}
						<span class="drag-hint-lead">Drag clockwise</span>
						<span class="drag-hint-sub">to get started</span>
					{:else}
						<span class="drag-hint-lead">Drag up and down</span>
						<span class="drag-hint-sub">to get started</span>
					{/if}
				</span>
			{/if}
		</div>
	</div>
{/if}

<style>
	.drag-hint {
		position: absolute;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		pointer-events: auto;
		cursor: grab;
		user-select: none;
		-webkit-user-select: none;
		touch-action: none;
		z-index: 10;
		animation: dragHintFloat 2.2s ease-in-out infinite;
		transition: opacity 0.24s ease, transform 0.24s ease;
	}

	.drag-hint.up-down {
		animation: dragHintUpDownFloat 2.5s ease-in-out infinite;
	}

	.drag-hint.fading {
		opacity: 0;
		transform: translateY(-50%) scale(0.92);
		pointer-events: none;
	}

	.drag-hint-content {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 7px 9px;
		border-radius: 999px;
		background: var(--hint-bg, rgba(0, 18, 29, 0.88));
		border: 1px solid var(--hint-border, rgba(56, 200, 255, 0.45));
		box-shadow: 0 4px 18px var(--hint-shadow, rgba(0, 0, 0, 0.45)),
			0 0 16px var(--hint-glow, rgba(56, 200, 255, 0.28));
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		transition: padding 0.3s cubic-bezier(0.16, 1, 0.3, 1),
			border-radius 0.3s ease,
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.show-text .drag-hint-content {
		padding: 7px 14px 7px 10px;
		border-radius: 18px;
	}

	/* Caret notch pointing left towards the touch target */
	.drag-hint-content::before {
		content: '';
		position: absolute;
		left: -5px;
		top: 50%;
		transform: translateY(-50%) rotate(45deg);
		width: 8px;
		height: 8px;
		background: var(--hint-bg, rgba(0, 18, 29, 0.88));
		border-left: 1px solid var(--hint-border, rgba(56, 200, 255, 0.45));
		border-bottom: 1px solid var(--hint-border, rgba(56, 200, 255, 0.45));
		pointer-events: none;
	}

	.drag-hint-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		color: var(--hint-icon, #38c8ff);
	}

	.drag-svg {
		width: 28px;
		height: 28px;
		overflow: visible;
	}

	.drag-svg path,
	.drag-svg polyline,
	.drag-svg line {
		fill: none;
		stroke: currentColor;
		stroke-miterlimit: 10;
		stroke-width: 2.1px;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.drag-hint-label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: 'Quicksand', 'Nunito', ui-rounded, sans-serif;
		font-size: 12.5px;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--hint-text, #ffffff);
		line-height: 1.2;
		white-space: nowrap;
		animation: hintTextFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	.drag-hint-lead {
		font-weight: 700;
	}

	.drag-hint-sub {
		font-weight: 500;
		opacity: 0.95;
	}

	@keyframes dragHintFloat {
		0%, 100% {
			transform: translateY(-50%);
		}
		50% {
			transform: translateY(calc(-50% - 6px));
		}
	}

	@keyframes dragHintUpDownFloat {
		0%, 100% {
			transform: translateY(-50%);
		}
		25% {
			transform: translateY(calc(-50% - 6px));
		}
		75% {
			transform: translateY(calc(-50% + 6px));
		}
	}

	@keyframes hintTextFadeIn {
		from {
			opacity: 0;
			transform: translateX(-4px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	/* Responsive multi-line wrapping on mobile screens */
	@media (max-width: 480px) {
		.drag-hint {
			left: calc(50% + 30px) !important;
		}

		.drag-hint-content {
			max-width: calc(50vw - 32px);
			box-sizing: border-box;
		}

		.show-text .drag-hint-content {
			padding: 6px 11px 6px 8px;
			gap: 7px;
			border-radius: 16px;
		}

		.drag-hint-label {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: 1px;
			font-size: 11px;
			letter-spacing: -0.02em;
			line-height: 1.15;
			white-space: normal;
			max-width: 108px;
			overflow-wrap: break-word;
		}

		.drag-hint-lead {
			font-size: 11.5px;
			font-weight: 700;
			white-space: nowrap;
		}

		.drag-hint-sub {
			font-size: 10.5px;
			font-weight: 500;
			white-space: nowrap;
		}

		.drag-hint-icon {
			width: 26px;
			height: 26px;
		}

		.drag-svg {
			width: 26px;
			height: 26px;
		}
	}

	/* Extra slim mobile viewports (<= 360px) */
	@media (max-width: 360px) {
		.drag-hint {
			left: calc(50% + 26px) !important;
		}

		.drag-hint-content {
			max-width: calc(50vw - 28px);
		}

		.show-text .drag-hint-content {
			padding: 5px 8px 5px 6px;
			gap: 5px;
			border-radius: 14px;
		}

		.drag-hint-label {
			font-size: 10px;
			max-width: 95px;
		}

		.drag-hint-lead {
			font-size: 10.5px;
		}

		.drag-hint-sub {
			font-size: 9.5px;
		}

		.drag-hint-icon {
			width: 24px;
			height: 24px;
		}

		.drag-svg {
			width: 24px;
			height: 24px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.drag-hint {
			animation: none !important;
		}
		.drag-hint.up-down {
			animation: none !important;
		}
		.drag-hint-label {
			animation: none !important;
		}
	}
</style>

