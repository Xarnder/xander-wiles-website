<script lang="ts">
	import type { MinimapElements } from '#lib/game/map/BiomeMapSystem';

	/**
	 * The corner biome minimap (biome minimap Phase 1). This component only lays out the frame; the
	 * scene's `BiomeMapSystem` paints the canvas, turns the arrow and writes the coordinates every
	 * frame, outside Svelte. North is always up. Decorative for screen readers: the current biome is
	 * already announced by the biome card.
	 */
	let {
		size,
		biomes,
		biomeName,
		onElements,
		onZoom,
		onOpen
	}: {
		/** CSS pixels across. */
		size: number;
		/** False in worlds with biomes off: a terrain map with a note (Q8). */
		biomes: boolean;
		biomeName: string | null;
		onElements: (elements: MinimapElements | null) => void;
		onZoom: (delta: number) => void;
		/** Tap or click the map: open the full map (Phase 2, Q14). */
		onOpen: () => void;
	} = $props();

	let canvas = $state<HTMLCanvasElement>();
	let arrow = $state<HTMLElement>();
	let coordinates = $state<HTMLElement>();
	let scaleLabel = $state<HTMLElement>();

	$effect(() => {
		if (!canvas || !arrow || !coordinates || !scaleLabel) return;
		onElements({ canvas, arrow, coordinates, scaleLabel });
		return () => onElements(null);
	});
</script>

<div class="minimap" data-testid="biome-minimap" style:--map-size="{size}px">
	<div class="frame" aria-hidden="true" onclick={onOpen} data-testid="biome-minimap-open">
		<canvas bind:this={canvas} data-testid="biome-minimap-canvas"></canvas>
		<span class="north">N</span>
		<span class="arrow" bind:this={arrow} data-testid="biome-minimap-arrow"></span>
	</div>
	<div class="caption">
		<strong data-testid="biome-minimap-name"
			>{biomes ? (biomeName ?? '') : 'Biomes are off in this world'}</strong
		>
		<span
			><span bind:this={scaleLabel} data-testid="biome-minimap-scale"></span> ·
			<span bind:this={coordinates} data-testid="biome-minimap-coordinates"></span></span
		>
	</div>
	<div class="zoom" role="group" aria-label="Map zoom">
		<button
			type="button"
			aria-label="Zoom map in"
			data-testid="biome-minimap-zoom-in"
			onclick={() => onZoom(-1)}>+</button
		>
		<button
			type="button"
			aria-label="Zoom map out"
			data-testid="biome-minimap-zoom-out"
			onclick={() => onZoom(1)}>−</button
		>
	</div>
</div>

<style>
	.minimap {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		z-index: 12;
		width: var(--map-size);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		pointer-events: none;
		color: #eaf6ff;
		font-size: 0.72rem;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
	}
	.frame {
		position: relative;
		pointer-events: auto;
		cursor: pointer;
		width: var(--map-size);
		height: var(--map-size);
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		background: #26302a;
		box-shadow:
			0 0 0 2px rgba(234, 246, 255, 0.55),
			0 2px 10px rgba(0, 0, 0, 0.45);
	}
	.north {
		position: absolute;
		top: -0.15rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0 0.3rem;
		border-radius: 999px;
		background: rgba(10, 20, 15, 0.75);
		font-weight: 700;
		font-size: 0.68rem;
		line-height: 1.2rem;
	}
	/* The player's arrow: a white chevron with a dark edge, turned by BiomeMapSystem. */
	.arrow {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 0;
		height: 0;
		border-left: 6px solid transparent;
		border-right: 6px solid transparent;
		border-bottom: 15px solid #fff;
		filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.9));
		transform-origin: 50% 60%;
	}
	.zoom {
		display: none;
		gap: 0.6rem;
		pointer-events: auto;
	}
	/* Touch devices (and any screen without a hover pointer) get buttons; keys zoom elsewhere. */
	@media (hover: none) {
		.zoom {
			display: flex;
		}
	}
	.zoom button {
		width: 1.9rem;
		height: 1.9rem;
		border-radius: 50%;
		border: 1px solid rgba(234, 246, 255, 0.35);
		background: rgba(10, 20, 15, 0.75);
		color: #eaf6ff;
		font-size: 1.05rem;
		line-height: 1;
		touch-action: manipulation;
	}
	.caption {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.05rem;
		max-width: calc(var(--map-size) + 3rem);
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.caption strong {
		font-size: 0.8rem;
		min-height: 1em;
	}
</style>
