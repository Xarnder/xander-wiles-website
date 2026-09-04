<script lang="ts">
	import type { HotbarSlot } from '$lib/game/building/FoundationTypes';

	interface Props {
		slots: readonly HotbarSlot[];
		activeSlot: number;
		onSelectSlot?: (slot: number) => void;
	}

	let { slots, activeSlot, onSelectSlot }: Props = $props();
</script>

<div class="hotbar" data-testid="hotbar">
	{#each slots as slot (slot.slot)}
		<button
			type="button"
			class="slot"
			class:active={slot.slot === activeSlot}
			data-testid={slot.toolId === 'foundation' ? 'hotbar-slot-foundation' : undefined}
			onclick={() => onSelectSlot?.(slot.slot)}
		>
			<span class="slot-number">{slot.slot}</span>
			{#if slot.label}
				<span class="slot-label">{slot.label}</span>
			{/if}
		</button>
	{/each}
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
