<script lang="ts">
	import type { HotbarSlot } from '$lib/game/building/FoundationTypes';

	interface Props {
		slots: readonly HotbarSlot[];
		activeSlot: number;
		removeModeActive?: boolean;
		paintModeActive?: boolean;
		moveModeActive?: boolean;
		onSelectSlot?: (slot: number) => void;
		onToggleRemoveMode?: () => void;
		onTogglePaintMode?: () => void;
		onToggleMoveMode?: () => void;
	}

	let {
		slots,
		activeSlot,
		removeModeActive = false,
		paintModeActive = false,
		moveModeActive = false,
		onSelectSlot,
		onToggleRemoveMode,
		onTogglePaintMode,
		onToggleMoveMode
	}: Props = $props();

	function reservedBetween(previous: number, next: number): number[] {
		const numbers: number[] = [];
		for (let slot = previous + 1; slot < next; slot++) numbers.push(slot);
		return numbers;
	}

	function autoScale(node: HTMLElement, _text?: string) {
		function fit() {
			node.style.transform = 'none';
			const parent = node.parentElement;
			if (!parent) return;

			// Inside width of parent slot with small margin
			const availableWidth = Math.max(10, parent.clientWidth - 4);
			const scrollWidth = node.scrollWidth;

			if (scrollWidth > availableWidth && availableWidth > 0) {
				const scale = availableWidth / scrollWidth;
				node.style.transform = `scale(${scale.toFixed(4)})`;
				node.style.transformOrigin = 'center center';
			} else {
				node.style.transform = 'none';
			}
		}

		fit();
		if (typeof requestAnimationFrame !== 'undefined') {
			requestAnimationFrame(fit);
		}
		if (typeof document !== 'undefined' && document.fonts) {
			document.fonts.ready.then(fit);
		}

		let observer: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined') {
			observer = new ResizeObserver(() => fit());
			if (node.parentElement) observer.observe(node.parentElement);
			observer.observe(node);
		}

		return {
			update(_newText?: string) {
				fit();
				if (typeof requestAnimationFrame !== 'undefined') {
					requestAnimationFrame(fit);
				}
			},
			destroy() {
				observer?.disconnect();
			}
		};
	}
</script>

<div class="hotbar" data-testid="hotbar">
	{#each slots as slot, index (slot.slot)}
		{#if index > 0}
			{#each reservedBetween(slots[index - 1].slot, slot.slot) as reserved (reserved)}
				<div class="slot reserved" title="Reserved" aria-hidden="true">
					<span class="slot-number">{reserved}</span>
					<span class="slot-label">—</span>
				</div>
			{/each}
		{/if}
		<button
			type="button"
			class="slot"
			class:active={slot.slot === activeSlot &&
				!removeModeActive &&
				!paintModeActive &&
				!moveModeActive}
			data-testid={slot.toolId !== 'none' ? `hotbar-slot-${slot.toolId}` : undefined}
			onclick={() => onSelectSlot?.(slot.slot)}
			aria-label={slot.variantCount > 1
				? `${slot.label} (slot ${slot.slot}, ${slot.variantIndex + 1} of ${slot.variantCount} — up/down to switch)`
				: undefined}
		>
			<span class="slot-number">{slot.slot}</span>
			{#if slot.label}
				<span class="slot-label" use:autoScale={slot.label}>{slot.label}</span>
			{/if}
			{#if slot.variantCount > 1}
				{#if slot.variantCount <= 5}
					<span class="slot-variants" aria-hidden="true">
						{#each { length: slot.variantCount }, i}
							<span class="slot-pip" class:current={i === slot.variantIndex}></span>
						{/each}
					</span>
				{:else}
					<span class="slot-variant-counter" aria-hidden="true">
						<span class="slot-pip current"></span>
						<span class="counter-text">{slot.variantIndex + 1}/{slot.variantCount}</span>
					</span>
				{/if}
			{/if}
		</button>
	{/each}

	<!-- Deliberately outside the numbered-slot loop above — Remove Mode and Paint Mode are global
	     overlays, not hotbar selections, so neither ever takes a slot number (see
	     BuildToolManager's class doc comment). -->
	<button
		type="button"
		class="slot remove-slot"
		class:active={removeModeActive}
		data-testid="hotbar-remove-toggle"
		onclick={() => onToggleRemoveMode?.()}
		aria-label="Toggle Remove Mode"
		aria-pressed={removeModeActive}
	>
		<span class="slot-number">X</span>
		<span class="slot-label" use:autoScale={'Remove'}>Remove</span>
	</button>

	<button
		type="button"
		class="slot paint-slot"
		class:active={paintModeActive}
		data-testid="hotbar-paint-toggle"
		onclick={() => onTogglePaintMode?.()}
		aria-label="Toggle Paint Mode"
		aria-pressed={paintModeActive}
	>
		<span class="slot-number">P</span>
		<span class="slot-label" use:autoScale={'Paint'}>Paint</span>
	</button>

	<button
		type="button"
		class="slot move-slot"
		class:active={moveModeActive}
		data-testid="hotbar-move-toggle"
		onclick={() => onToggleMoveMode?.()}
		aria-label="Toggle Move Mode"
		aria-pressed={moveModeActive}
	>
		<span class="slot-number">M</span>
		<span class="slot-label" use:autoScale={'Move'}>Move</span>
	</button>
</div>

<style>
	.hotbar {
		position: absolute;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 0.4rem;
		pointer-events: auto;
		z-index: 35;
	}

	.slot {
		width: 3.4rem;
		height: 3.4rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.04rem;
		padding: 0.08rem 0.08rem;
		box-sizing: border-box;
		background: rgba(10, 20, 15, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 8px;
		color: #eaf6ff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		cursor: pointer;
		backdrop-filter: blur(2px);
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
		overflow: hidden;
	}

	.slot:hover {
		background: rgba(20, 35, 28, 0.6);
	}

	.slot.active {
		border-color: #ffcc33;
		background: rgba(60, 50, 15, 0.6);
		box-shadow: 0 0 0 1px rgba(255, 204, 51, 0.5);
	}

	.slot.reserved {
		cursor: default;
		opacity: 0.38;
		pointer-events: none;
	}

	/* A visual gap plus a distinct (red, not yellow) active color — Remove Mode isn't "another tool
	   in the row", it's a different kind of thing, and its highlight shouldn't look like a normal
	   hotbar selection. */
	.remove-slot {
		margin-left: 0.5rem;
	}

	.remove-slot.active {
		border-color: #ff5c4d;
		background: rgba(60, 15, 15, 0.6);
		box-shadow: 0 0 0 1px rgba(255, 92, 77, 0.5);
	}

	/* No extra left margin — sits right next to Remove, both being global-mode toggles rather than
	   numbered hotbar slots; a distinct (blue, not red or yellow) active colour keeps it visually
	   separate from both. */
	.paint-slot.active {
		border-color: #4da6ff;
		background: rgba(15, 35, 60, 0.6);
		box-shadow: 0 0 0 1px rgba(77, 166, 255, 0.5);
	}

	.move-slot.active {
		border-color: #39d353;
		background: rgba(15, 60, 25, 0.6);
		box-shadow: 0 0 0 1px rgba(57, 211, 83, 0.5);
	}

	.slot-number {
		font-size: 0.62rem;
		line-height: 1;
		opacity: 0.7;
		padding: 0;
		margin: 0;
	}

	.slot-label {
		font-size: 0.58rem;
		line-height: 1;
		text-align: center;
		padding: 0;
		margin: 0;
		white-space: nowrap !important;
		overflow-wrap: normal !important;
		word-break: keep-all !important;
		display: inline-block;
		max-width: 100%;
		box-sizing: border-box;
	}

	.slot-variants {
		display: flex;
		gap: 0.12rem;
		margin-top: 0.05rem;
		justify-content: center;
	}

	.slot-variant-counter {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.15rem;
		font-size: 0.5rem;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		margin-top: 0.04rem;
		padding: 0.04rem 0.18rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.78);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.slot.active .slot-variant-counter {
		background: rgba(255, 204, 51, 0.18);
		color: #ffe066;
		border-color: rgba(255, 204, 51, 0.35);
	}

	.slot-variant-counter .slot-pip {
		width: 0.22rem;
		height: 0.22rem;
	}

	.counter-text {
		font-weight: 500;
		letter-spacing: 0.02em;
	}

	.slot-pip {
		width: 0.28rem;
		height: 0.28rem;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.28);
	}

	.slot-pip.current {
		background: #ffcc33;
	}

	/* Responsive scaling for mobile / small screens */
	@media (max-width: 850px) {
		.hotbar {
			gap: 0.25rem;
			max-width: calc(100vw - 12px);
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: none;
			padding: 2px 4px;
		}

		.hotbar::-webkit-scrollbar {
			display: none;
		}

		.slot {
			width: 2.6rem;
			height: 2.6rem;
			min-width: 2.6rem;
			flex-shrink: 0;
			border-radius: 6px;
			padding: 0.06rem 0.06rem;
		}

		.slot-number {
			font-size: 0.52rem;
		}

		.slot-label {
			font-size: 0.46rem;
			padding: 0;
		}

		.remove-slot {
			margin-left: 0.25rem;
		}
	}

	@media (max-width: 500px) {
		.hotbar {
			gap: 0.18rem;
		}

		.slot {
			width: 2.2rem;
			height: 2.2rem;
			min-width: 2.2rem;
			border-radius: 6px;
			padding: 0.05rem 0.05rem;
		}

		.slot-number {
			font-size: 0.46rem;
		}

		.slot-label {
			font-size: 0.4rem;
			padding: 0;
		}

		.remove-slot {
			margin-left: 0.18rem;
		}
	}

	@media (max-height: 500px) and (orientation: landscape) {
		.hotbar {
			bottom: max(6px, env(safe-area-inset-bottom));
			gap: 0.18rem;
			max-width: calc(100vw - 320px);
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: none;
			padding: 2px 4px;
		}

		.hotbar::-webkit-scrollbar {
			display: none;
		}

		.slot {
			width: 2.15rem;
			height: 2.15rem;
			min-width: 2.15rem;
			flex-shrink: 0;
			border-radius: 6px;
			padding: 0.05rem 0.05rem;
		}

		.slot-number {
			font-size: 0.46rem;
		}

		.slot-label {
			font-size: 0.4rem;
			padding: 0;
		}

		.remove-slot {
			margin-left: 0.18rem;
		}
	}
</style>
