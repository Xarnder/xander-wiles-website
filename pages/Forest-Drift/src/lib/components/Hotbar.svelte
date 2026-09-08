<script lang="ts">
	import type { HotbarSlot } from '$lib/game/building/FoundationTypes';

	interface Props {
		slots: readonly HotbarSlot[];
		activeSlot: number;
		removeModeActive?: boolean;
		paintModeActive?: boolean;
		onSelectSlot?: (slot: number) => void;
		onToggleRemoveMode?: () => void;
		onTogglePaintMode?: () => void;
	}

	let {
		slots,
		activeSlot,
		removeModeActive = false,
		paintModeActive = false,
		onSelectSlot,
		onToggleRemoveMode,
		onTogglePaintMode
	}: Props = $props();

	function reservedBetween(previous: number, next: number): number[] {
		const numbers: number[] = [];
		for (let slot = previous + 1; slot < next; slot++) numbers.push(slot);
		return numbers;
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
			class:active={slot.slot === activeSlot && !removeModeActive && !paintModeActive}
			data-testid={slot.toolId !== 'none' ? `hotbar-slot-${slot.toolId}` : undefined}
			onclick={() => onSelectSlot?.(slot.slot)}
			aria-label={slot.variantCount > 1
				? `${slot.label} (slot ${slot.slot}, ${slot.variantIndex + 1} of ${slot.variantCount} — up/down to switch)`
				: undefined}
		>
			<span class="slot-number">{slot.slot}</span>
			{#if slot.label}
				<span class="slot-label">{slot.label}</span>
			{/if}
			{#if slot.variantCount > 1}
				<span class="slot-variants" aria-hidden="true">
					{#each { length: slot.variantCount }, i}
						<span class="slot-pip" class:current={i === slot.variantIndex}></span>
					{/each}
				</span>
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
		<span class="slot-label">Remove</span>
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
		<span class="slot-label">Paint</span>
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
	}

	.slot {
		width: 3.4rem;
		height: 3.4rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.1rem;
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

	.slot-number {
		font-size: 0.65rem;
		opacity: 0.7;
	}

	.slot-label {
		font-size: 0.6rem;
		line-height: 1.1;
		text-align: center;
	}

	.slot-variants {
		display: flex;
		gap: 0.15rem;
		margin-top: 0.12rem;
		justify-content: center;
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
</style>
