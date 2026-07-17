<script lang="ts">
	import type { TacticalEntitySnapshot } from '$lib/game/types';

	interface Props {
		entities: readonly TacticalEntitySnapshot[];
		selectedTargetId?: string | null;
		onClose: () => void;
	}

	let { entities, selectedTargetId = null, onClose }: Props = $props();
	const WORLD_SIZE = 12000;
	const BOUNDARY_RADIUS = 47;

	function point(value: number): number {
		return Math.max(3, Math.min(97, 50 + (value / WORLD_SIZE) * 100));
	}

	function rotation(heading: number): string {
		return `rotate(${(heading * 180) / Math.PI}deg)`;
	}

	const activeTargets = $derived(
		entities.filter((entity) => entity.kind === 'target' && entity.active).length
	);
	const destroyedTargets = $derived(
		entities.filter((entity) => entity.kind === 'target' && !entity.active).length
	);
</script>

<aside class="map-panel" aria-label="Tactical map">
	<div class="map-header">
		<div>
			<span>LIVE BATTLESPACE</span>
			<h2>Tactical Map</h2>
		</div>
		<button type="button" onclick={onClose}>Close map <kbd>M</kbd></button>
	</div>

	<div class="map-stage">
		<svg viewBox="0 0 100 100" role="img" aria-label="Top-down tactical map of the mission area">
			<defs>
				<pattern id="minorGrid" width="5" height="5" patternUnits="userSpaceOnUse">
					<path d="M 5 0 L 0 0 0 5" fill="none" stroke="currentColor" stroke-width=".1" />
				</pattern>
				<pattern id="majorGrid" width="20" height="20" patternUnits="userSpaceOnUse">
					<rect width="20" height="20" fill="url(#minorGrid)" />
					<path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" stroke-width=".2" />
				</pattern>
				<radialGradient id="mapShade">
					<stop offset="0" stop-color="#143b45" stop-opacity=".5" />
					<stop offset="1" stop-color="#020d14" stop-opacity=".9" />
				</radialGradient>
				<filter id="mapGlow" x="-100%" y="-100%" width="300%" height="300%">
					<feGaussianBlur stdDeviation=".7" result="blur" />
					<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
				</filter>
			</defs>

			<rect width="100" height="100" fill="url(#mapShade)" />
			<rect width="100" height="100" fill="url(#majorGrid)" class="grid" />
			<circle cx="50" cy="50" r={BOUNDARY_RADIUS} class="boundary" />
			<circle cx="50" cy="50" r="31" class="range-ring" />
			<circle cx="50" cy="50" r="15" class="range-ring" />
			<path d="M50 3V97M3 50H97" class="crosshair" />
			<path d="M50 5l-1.5 3h3z" class="north" />

			<g class="terrain" aria-hidden="true">
				<path d="M5 73 Q18 60 28 69 T49 63 T72 68 T95 58" />
				<path d="M8 81 Q21 69 33 77 T58 73 T90 76" />
				<path d="M12 33 Q28 22 42 29 T70 24 T92 31" />
			</g>

			{#each entities as entity (entity.id)}
				{@const x = point(entity.position.x)}
				{@const y = point(entity.position.z)}
				{#if entity.kind === 'player'}
					<g
						class="entity player"
						transform={`translate(${x} ${y}) ${rotation(entity.heading)}`}
						filter="url(#mapGlow)"
					>
						<path d="M0 -2.4L1.5 2.1 0 .9 -1.5 2.1Z" />
						<circle r="3.5" />
					</g>
				{:else if entity.kind === 'squadron'}
					<g
						class="entity ally"
						class:inactive={!entity.active}
						transform={`translate(${x} ${y}) ${rotation(entity.heading)}`}
					>
						<path d="M0 -1.6L1.2 1.3 0 .5 -1.2 1.3Z" />
					</g>
				{:else if entity.kind === 'target'}
					<g
						class="entity target"
						class:destroyed={!entity.active}
						class:selected={entity.id === selectedTargetId}
						transform={`translate(${x} ${y})`}
					>
						{#if entity.active}
							<rect x="-1.5" y="-1.5" width="3" height="3" />
							{#if entity.id === selectedTargetId}<circle r="3.4" />{/if}
						{:else}
							<path d="M-1.6-1.6L1.6 1.6M1.6-1.6L-1.6 1.6" />
						{/if}
					</g>
				{:else}
					<g class="entity threat" transform={`translate(${x} ${y})`}>
						<circle r="1.2" />
						<circle r="3.8" />
					</g>
				{/if}
			{/each}
		</svg>

		<div class="sector-label sector-n">N // RIDGELINE</div>
		<div class="sector-label sector-e">E // TARGET AO</div>
		<div class="sector-label sector-s">S // EGRESS</div>
	</div>

	<div class="map-footer">
		<div class="legend">
			<span><i class="player-key"></i> VIPER 1</span>
			<span><i class="ally-key"></i> SQUAD</span>
			<span><i class="target-key"></i> TARGET</span>
			<span><i class="threat-key"></i> THREAT</span>
		</div>
		<div class="counts">
			<span><b>{activeTargets.toString().padStart(2, '0')}</b> REMAINING</span>
			<span><b>{destroyedTargets.toString().padStart(2, '0')}</b> DESTROYED</span>
		</div>
	</div>
</aside>

<style>
	.map-panel {
		position: absolute;
		z-index: 18;
		inset: clamp(1rem, 4vw, 3.5rem);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		width: min(58rem, calc(100% - 2rem));
		height: min(48rem, calc(100% - 2rem));
		margin: auto;
		color: #bdebf2;
		border: 1px solid rgba(101, 213, 231, 0.38);
		background:
			linear-gradient(rgba(3, 18, 27, 0.94), rgba(2, 12, 20, 0.97)),
			repeating-linear-gradient(0deg, transparent 0 3px, rgba(115, 226, 243, 0.025) 3px 4px);
		box-shadow: 0 30px 100px rgba(0, 0, 0, 0.52);
		pointer-events: auto;
		backdrop-filter: blur(14px);
		clip-path: polygon(
			0 0,
			calc(100% - 1.4rem) 0,
			100% 1.4rem,
			100% 100%,
			1.4rem 100%,
			0 calc(100% - 1.4rem)
		);
		animation: deploy 250ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.map-header,
	.map-footer {
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.2rem;
	}

	.map-header {
		border-bottom: 1px solid rgba(105, 211, 229, 0.18);
	}

	.map-header span {
		color: #ed9d62;
		font:
			650 0.5rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.17em;
	}

	.map-header h2 {
		margin: 0.22rem 0 0;
		color: #f0fafc;
		font-size: 1.1rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.map-header button {
		padding: 0.6rem 0.7rem;
		color: #a9e5ef;
		border: 1px solid rgba(103, 216, 234, 0.32);
		background: rgba(7, 34, 43, 0.6);
		font:
			600 0.58rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		cursor: pointer;
	}

	kbd {
		margin-left: 0.35rem;
		padding: 0.15rem 0.3rem;
		color: #ffc18f;
		border: 1px solid rgba(240, 161, 99, 0.4);
		font: inherit;
	}

	.map-stage {
		position: relative;
		display: grid;
		min-height: 0;
		padding: 1rem;
		place-items: center;
		overflow: hidden;
	}

	svg {
		display: block;
		width: min(100%, 65vh);
		max-height: 100%;
		aspect-ratio: 1;
		color: rgba(115, 212, 229, 0.22);
		border: 1px solid rgba(102, 209, 227, 0.2);
	}

	.grid {
		color: rgba(112, 215, 232, 0.17);
	}

	.boundary {
		fill: none;
		stroke: rgba(234, 154, 95, 0.65);
		stroke-width: 0.35;
		stroke-dasharray: 1.6 1.2;
	}

	.range-ring {
		fill: none;
		stroke: rgba(111, 215, 232, 0.2);
		stroke-width: 0.18;
	}

	.crosshair {
		fill: none;
		stroke: rgba(111, 215, 232, 0.13);
		stroke-width: 0.14;
		stroke-dasharray: 0.8 1.4;
	}

	.north {
		fill: #eaa064;
	}

	.terrain path {
		fill: none;
		stroke: rgba(126, 194, 167, 0.22);
		stroke-width: 0.28;
	}

	.entity path,
	.entity rect,
	.entity circle {
		vector-effect: non-scaling-stroke;
	}

	.player path {
		fill: #ebfaff;
		stroke: #73e1f0;
		stroke-width: 0.25;
	}

	.player circle {
		fill: none;
		stroke: rgba(117, 225, 241, 0.35);
		stroke-width: 0.2;
		stroke-dasharray: 0.5 0.5;
	}

	.ally path {
		fill: #71dcaa;
		stroke: #c8ffe8;
		stroke-width: 0.18;
	}

	.ally.inactive {
		opacity: 0.3;
	}

	.target rect {
		fill: rgba(246, 149, 85, 0.25);
		stroke: #ff9c59;
		stroke-width: 0.3;
	}

	.target circle {
		fill: none;
		stroke: #ffe4c8;
		stroke-width: 0.28;
		stroke-dasharray: 0.7 0.45;
		animation: selected 1.4s linear infinite;
	}

	.target.destroyed path {
		fill: none;
		stroke: rgba(202, 211, 211, 0.42);
		stroke-width: 0.35;
	}

	.threat circle:first-child {
		fill: #ff5d59;
	}

	.threat circle:last-child {
		fill: none;
		stroke: rgba(255, 84, 79, 0.5);
		stroke-width: 0.25;
		animation: threat 1.7s ease-out infinite;
	}

	.sector-label {
		position: absolute;
		color: rgba(166, 214, 223, 0.35);
		font:
			500 0.48rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.11em;
	}

	.sector-n {
		top: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
	}

	.sector-e {
		top: 50%;
		right: 1.5rem;
		transform: rotate(90deg) translateX(50%);
		transform-origin: right;
	}

	.sector-s {
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
	}

	.map-footer {
		border-top: 1px solid rgba(105, 211, 229, 0.18);
	}

	.legend,
	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem 1rem;
	}

	.legend span,
	.counts span {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		color: rgba(177, 219, 226, 0.58);
		font:
			550 0.5rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.08em;
	}

	.legend i {
		display: block;
		width: 0.5rem;
		height: 0.5rem;
		border: 1px solid;
	}

	.player-key {
		color: #79dfef;
		transform: rotate(45deg);
	}

	.ally-key {
		color: #72dbaa;
		border-radius: 50%;
	}

	.target-key {
		color: #fa9b5d;
	}

	.threat-key {
		color: #ff5d59;
		border-radius: 50%;
	}

	.counts {
		justify-content: flex-end;
	}

	.counts b {
		color: #f7a364;
		font-size: 0.85rem;
	}

	@keyframes deploy {
		from {
			opacity: 0;
			transform: scale(0.97);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	@keyframes selected {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes threat {
		to {
			opacity: 0;
			transform: scale(1.6);
		}
	}

	@media (max-width: 600px) {
		.map-panel {
			inset: 0.5rem;
			width: calc(100% - 1rem);
			height: calc(100% - 1rem);
		}

		.map-header,
		.map-footer {
			padding: 0.75rem;
		}

		.legend {
			display: none;
		}

		.counts {
			width: 100%;
			justify-content: space-between;
		}

		.sector-label {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.map-panel,
		.target circle,
		.threat circle:last-child {
			animation: none;
		}
	}
</style>
