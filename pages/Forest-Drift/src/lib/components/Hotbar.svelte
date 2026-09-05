<script lang="ts">
	import type { HotbarSlot } from '$lib/game/building/FoundationTypes';

	interface Props {
		slots: readonly HotbarSlot[];
		activeSlot: number;
		removeModeActive?: boolean;
		onSelectSlot?: (slot: number) => void;
		onToggleRemoveMode?: () => void;
	}

	let {
		slots,
		activeSlot,
		removeModeActive = false,
		onSelectSlot,
		onToggleRemoveMode
	}: Props = $props();
</script>

<div class="hotbar" data-testid="hotbar">
	{#each slots as slot (slot.slot)}
		<button
			type="button"
			class="slot"
			class:active={slot.slot === activeSlot && !removeModeActive}
			data-testid={slot.toolId !== 'none' ? `hotbar-slot-${slot.toolId}` : undefined}
			onclick={() => onSelectSlot?.(slot.slot)}
		>
			<span class="slot-number">{slot.slot}</span>
			{#if slot.label}
				<span class="slot-label">{slot.label}</span>
			{/if}
		</button>
	{/each}

	<!-- Deliberately outside the numbered-slot loop above — Remove Mode is a global overlay, not a
	     hotbar selection, so it never takes a slot number (see BuildToolManager's class doc comment). -->
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

	.slot-number {
		font-size: 0.65rem;
		opacity: 0.7;
	}

	.slot-label {
		font-size: 0.6rem;
		line-height: 1.1;
		text-align: center;
	}
</style>
