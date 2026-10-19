<script lang="ts">
	import { onMount } from 'svelte';
	import { touchButton } from '$lib/components/touchButton';
	import type { HotbarSlot } from '$lib/game/building/FoundationTypes';

	interface Props {
		slots: readonly HotbarSlot[];
		activeSlot: number;
		removeModeActive?: boolean;
		paintModeActive?: boolean;
		moveModeActive?: boolean;
		musicModeActive?: boolean;
		showGlobalModes?: boolean;
		onCycleVariant?: (direction: -1 | 1) => void;
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
		musicModeActive = false,
		showGlobalModes = true,
		onCycleVariant,
		onSelectSlot,
		onToggleRemoveMode,
		onTogglePaintMode,
		onToggleMoveMode
	}: Props = $props();

	let tray: HTMLDivElement;
	let panel = $state<HTMLDivElement>();
	let panelAbove = $state(true);

	onMount(() => {
		const updateLayout = () => {
			if (!tray || !panel) return;
			const bounds = tray.getBoundingClientRect();
			panelAbove = bounds.right + 12 + panel.offsetWidth + 16 > window.innerWidth;
		};
		const observer = new ResizeObserver(updateLayout);
		observer.observe(tray);
		// The selector can appear after mounting when build state arrives.
		const mutations = new MutationObserver(() => {
			if (panel) observer.observe(panel);
			updateLayout();
		});
		mutations.observe(tray.parentElement!, { childList: true });
		window.addEventListener('resize', updateLayout);
		updateLayout();
		return () => {
			observer.disconnect();
			mutations.disconnect();
			window.removeEventListener('resize', updateLayout);
		};
	});

	const icons: Record<number, string> = {
		1: 'foundation',
		2: 'wall',
		3: 'door',
		4: 'roof',
		5: 'stairs',
		6: 'carpet',
		8: 'chair'
	};
	const iconFiles = import.meta.glob('/src/lib/assets/build-icons/*.svg', {
		eager: true,
		query: '?url',
		import: 'default'
	}) as Record<string, string>;
	function icon(name: string) {
		return iconFiles[`/src/lib/assets/build-icons/${name}.svg`];
	}
	let selected = $derived(slots.find((slot) => slot.slot === activeSlot));
	let overlay = $derived(
		removeModeActive ? 'Remove' : paintModeActive ? 'Paint' : moveModeActive ? 'Move' : ''
	);
</script>

<div class="hotbar" class:build={showGlobalModes} data-testid="hotbar">
	<div class="tool-tray" bind:this={tray}>
		{#each slots as slot (slot.slot)}
			<button
				type="button"
				class="slot"
				class:active={slot.slot === activeSlot && !overlay && !musicModeActive}
				data-testid={`hotbar-slot-${slot.hotbarId ?? slot.toolId}`}
				use:touchButton={() => onSelectSlot?.(slot.slot)}
				title={`${slot.label} · ${slot.slot}`}
				aria-label={`${slot.label} (slot ${slot.slot})`}
				aria-pressed={slot.slot === activeSlot && !overlay}
			>
				<span class="slot-number">{slot.slot}</span>
				{#if showGlobalModes && icons[slot.slot]}
					<img class="tool-icon" src={icon(icons[slot.slot])} alt="" />
				{:else}<span class="slot-label">{slot.label}</span>{/if}
			</button>
		{/each}
		{#if showGlobalModes}
			<span class="divider" aria-hidden="true"></span>
			<button
				type="button"
				class="slot remove-slot"
				class:active={removeModeActive}
				data-testid="hotbar-remove-toggle"
				use:touchButton={() => onToggleRemoveMode?.()}
				title="Remove · 9 / X"
				aria-label="Toggle Remove Mode"
				aria-pressed={removeModeActive}
			>
				<span class="slot-number">9</span><span class="remove-icon" aria-hidden="true">×</span>
			</button>
			<button
				type="button"
				class="slot paint-slot"
				class:active={paintModeActive}
				data-testid="hotbar-paint-toggle"
				use:touchButton={() => onTogglePaintMode?.()}
				title="Paint · P"
				aria-label="Toggle Paint Mode"
				aria-pressed={paintModeActive}
			>
				<span class="slot-number">P</span><img class="tool-icon" src={icon('paint')} alt="" />
			</button>
			<button
				type="button"
				class="slot move-slot"
				class:active={moveModeActive}
				data-testid="hotbar-move-toggle"
				use:touchButton={() => onToggleMoveMode?.()}
				title="Move · M"
				aria-label="Toggle Move Mode"
				aria-pressed={moveModeActive}
			>
				<span class="slot-number">M</span><img class="tool-icon" src={icon('move')} alt="" />
			</button>
		{/if}
	</div>
	{#if showGlobalModes && selected}
		<div
			class="subtool-panel"
			class:above={panelAbove}
			bind:this={panel}
			aria-live="polite"
			aria-atomic="true"
		>
			<span class="eyebrow">{overlay ? 'EDIT MODE' : 'BUILD MODE'}</span>
			<strong>{overlay || selected.label}</strong>
			{#if !overlay && selected.variantCount > 1}
				<div class="carousel">
					<button
						class="cycle"
						aria-label="Previous build subtool"
						use:touchButton={() => onCycleVariant?.(-1)}>‹</button
					>
					<div
						class="dots"
						aria-label={`${selected.variantIndex + 1} of ${selected.variantCount} tools`}
					>
						{#each { length: selected.variantCount }, i}<span
								class="dot"
								class:current={i === selected.variantIndex}
							></span>{/each}
					</div>
					<button
						class="cycle"
						aria-label="Next build subtool"
						use:touchButton={() => onCycleVariant?.(1)}>›</button
					>
					<span class="count">{selected.variantIndex + 1}/{selected.variantCount}</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.hotbar {
		position: fixed;
		bottom: max(8px, env(safe-area-inset-bottom));
		left: 50%;
		transform: translateX(-50%);
		z-index: 35;
		pointer-events: auto;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		max-width: calc(100vw - 1.5rem);
		font-family: system-ui, sans-serif;
		color: #edf5e9;
	}
	.tool-tray {
		display: flex;
		gap: 5px;
		padding: 7px;
		border: 1px solid #d9ebc52b;
		border-radius: 18px;
		background: linear-gradient(150deg, #24352bf2, #101c18f2);
		box-shadow:
			0 12px 35px #0005,
			inset 0 1px #ffffff0d;
		backdrop-filter: blur(18px);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tool-tray::-webkit-scrollbar {
		display: none;
	}
	.slot {
		position: relative;
		flex: 0 0 50px;
		width: 50px;
		height: 52px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 10px;
		border: 1px solid transparent;
		border-radius: 11px;
		background: #ffffff05;
		color: inherit;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			transform 0.15s;
	}
	.slot:hover {
		background: #ffffff14;
		transform: translateY(-2px);
	}
	.slot:focus-visible,
	.cycle:focus-visible {
		outline: 2px solid #e3d79c;
		outline-offset: 2px;
	}
	.slot.active {
		background: linear-gradient(140deg, #cbd49d30, #9ea87d19);
		border-color: #d6dfadad;
		box-shadow: inset 0 0 15px #d5e3a50a;
	}
	.slot.active::after {
		content: '';
		position: absolute;
		bottom: 4px;
		width: 13px;
		height: 2px;
		border-radius: 2px;
		background: #dce8b6;
	}
	.slot-number {
		position: absolute;
		top: 5px;
		left: 6px;
		font-size: 9px;
		line-height: 1;
		font-weight: 600;
		color: #c5d1bd99;
	}
	.active .slot-number {
		color: #edf2d2;
	}
	.tool-icon {
		width: 28px;
		height: 28px;
		object-fit: contain;
		filter: brightness(0) invert(1);
		opacity: 0.82;
		pointer-events: none;
	}
	.active .tool-icon {
		opacity: 1;
	}
	.slot-label {
		font-size: 10px;
		text-align: center;
	}
	.divider {
		width: 1px;
		flex-shrink: 0;
		margin: 8px 3px;
		background: #d4e3c52b;
	}
	.remove-icon {
		font-size: 38px;
		font-weight: 200;
		line-height: 1;
	}
	.remove-slot.active {
		border-color: #e9a191;
		background: #a6493938;
	}
	.paint-slot.active {
		border-color: #91cbe9;
		background: #397aa638;
	}
	.move-slot.active {
		border-color: #9dd5ad;
		background: #45875838;
	}
	.subtool-panel {
		position: absolute;
		left: calc(100% + 12px);
		bottom: 0;
		width: 240px;
		max-width: calc(100vw - 2rem);
		min-height: 68px;
		box-sizing: border-box;
		padding: 12px 15px;
		border: 1px solid #d9ebc52b;
		border-radius: 14px;
		background: linear-gradient(140deg, #24352bf5, #101c18f5);
		box-shadow: 0 8px 25px #0003;
		backdrop-filter: blur(18px);
	}
	.eyebrow {
		display: block;
		font-size: 8px;
		font-weight: 600;
		letter-spacing: 0.16em;
		color: #b3c5a7;
		margin-bottom: 4px;
	}
	strong {
		display: block;
		font-size: 13px;
		font-weight: 550;
	}
	.carousel {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-top: 6px;
	}
	.dots {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.dot {
		width: 4px;
		height: 4px;
		border-radius: 10px;
		background: #b8c9ad55;
	}
	.dot.current {
		width: 12px;
		background: #dce8b6;
	}
	.cycle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 44px;
		width: 44px;
		height: 44px;
		border: 1px solid #d9ebc566;
		border-radius: 10px;
		background: linear-gradient(145deg, #52634b, #2a3d30);
		box-shadow:
			0 2px 5px #0005,
			inset 0 1px #ffffff20;
		color: #edf5e9;
		cursor: pointer;
		padding: 0 4px;
		font: 30px/1 system-ui;
		touch-action: manipulation;
	}
	.count {
		margin-left: auto;
		font-size: 9px;
		color: #b3c5a7;
		font-variant-numeric: tabular-nums;
	}
	.cycle:hover {
		background: #52694b;
		border-color: #dce8b6;
	}
	.cycle:active {
		background: #203326;
		box-shadow: inset 0 2px 4px #0005;
	}
	.subtool-panel.above {
		left: 50%;
		bottom: calc(100% + 10px);
		transform: translateX(-50%);
		text-align: center;
	}
	@media (max-width: 650px) {
		.slot {
			flex-basis: 40px;
			width: 40px;
			height: 44px;
			padding: 8px;
		}
		.tool-icon {
			width: 24px;
			height: 24px;
		}
		.tool-tray {
			gap: 3px;
			padding: 5px;
			border-radius: 14px;
		}
		.divider {
			margin-inline: 1px;
		}
	}
	@media (max-height: 500px) and (orientation: landscape) {
		.hotbar {
			bottom: max(6px, env(safe-area-inset-bottom));
			max-width: calc(100vw - 320px);
		}
		.slot {
			flex-basis: 36px;
			width: 36px;
			height: 38px;
		}
		.subtool-panel {
			padding: 6px 12px;
			min-height: 0;
		}
	}
	@media (pointer: coarse) {
		.slot {
			flex-basis: 44px;
			width: 44px;
			min-height: 44px;
			touch-action: manipulation;
		}
		.cycle {
			min-width: 44px;
			min-height: 44px;
			touch-action: manipulation;
		}
		.subtool-panel {
			width: 240px;
		}
		.tool-tray {
			touch-action: pan-x;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.slot {
			transition: none;
		}
	}
</style>
