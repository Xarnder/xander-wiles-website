<script lang="ts">
	import type { BuildingLevelUiState } from '$lib/game/building/BuildingLevelTypes';
	import type { BuildingSettings, SlabHeightToolId } from '$lib/game/building/FoundationTypes';
	import {
		clampSlabPlacementHeight,
		resolveSlabPlacementHeightAboveFloor,
		SLAB_PLACEMENT_HEIGHT_MAX,
		SLAB_PLACEMENT_HEIGHT_MIN,
		SLAB_PLACEMENT_HEIGHT_STEP
	} from '$lib/game/building/slabPlacementMath';

	let {
		toolId,
		settings,
		level,
		onClose
	}: {
		toolId: SlabHeightToolId;
		settings: BuildingSettings;
		level?: BuildingLevelUiState;
		onClose: () => void;
	} = $props();

	const TITLES: Record<SlabHeightToolId, string> = {
		ceiling: 'Ceiling height',
		floor: 'Floor height',
		'flat-roof': 'Roof height'
	};

	let revision = $state(0);

	function bump() {
		revision += 1;
	}

	let title = $derived(TITLES[toolId]);
	let wallHeight = $derived(level?.wallHeight ?? settings.defaultStoreyHeight);
	let followWalls = $derived.by(() => {
		revision;
		return settings.slabPlacementFollowWalls;
	});
	let heightValue = $derived.by(() => {
		revision;
		return resolveSlabPlacementHeightAboveFloor(wallHeight, settings);
	});
	let heightDisplay = $derived(heightValue.toFixed(2));
	let absoluteElevation = $derived(
		level ? (level.baseY + heightValue).toFixed(2) : null
	);

	function applyHeight(raw: number) {
		settings.slabPlacementFollowWalls = false;
		settings.slabPlacementHeight = clampSlabPlacementHeight(raw);
		bump();
	}

	function followWallTop() {
		settings.slabPlacementFollowWalls = true;
		settings.slabPlacementHeight = clampSlabPlacementHeight(wallHeight);
		bump();
	}

	function setPreset(height: number) {
		applyHeight(height);
	}

	function onBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) onClose();
	}

	function onBackdropKey(event: KeyboardEvent) {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'Enter' || event.key === ' ') onClose();
	}
</script>

<div
	class="placement-backdrop"
	role="presentation"
	onclick={onBackdropClick}
	onkeydown={onBackdropKey}
>
	<div
		class="placement-panel"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-labelledby="placement-height-title"
		data-testid="placement-height-modal"
	>
		<header>
			<div>
				<p class="eyebrow">BUILD MODE</p>
				<h2 id="placement-height-title">{title}</h2>
			</div>
			<button aria-label="Close height" onclick={onClose}>✕</button>
		</header>

		<div class="fields">
			<p class="status" data-testid="placement-height-mode">
				{followWalls ? 'Following top of walls' : 'Custom height'}
			</p>

			<div class="row">
				<label for="placement-height">Height</label>
				<input
					id="placement-height"
					data-testid="placement-height"
					type="range"
					min={SLAB_PLACEMENT_HEIGHT_MIN}
					max={SLAB_PLACEMENT_HEIGHT_MAX}
					step={SLAB_PLACEMENT_HEIGHT_STEP}
					value={heightValue}
					oninput={(event) => applyHeight(Number(event.currentTarget.value))}
				/>
				<input
					type="number"
					min={SLAB_PLACEMENT_HEIGHT_MIN}
					max={SLAB_PLACEMENT_HEIGHT_MAX}
					step={SLAB_PLACEMENT_HEIGHT_STEP}
					aria-label="Height above this floor in metres"
					value={heightValue}
					onchange={(event) => applyHeight(Number(event.currentTarget.value))}
				/>
				<span class="metres">{heightDisplay} m</span>
				<button
					type="button"
					class="reset"
					data-testid="placement-height-reset"
					aria-label="Reset height to top of walls"
					disabled={followWalls}
					onclick={followWallTop}>Reset</button
				>
			</div>

			<div class="presets" role="group" aria-label="Height presets">
				<button
					type="button"
					data-testid="placement-height-floor"
					onclick={() => setPreset(0)}>This floor</button
				>
				<button
					type="button"
					data-testid="placement-height-half"
					onclick={() => setPreset(wallHeight * 0.5)}>Half walls</button
				>
				<button
					type="button"
					data-testid="placement-height-walls"
					aria-pressed={followWalls}
					onclick={followWallTop}>Top of walls</button
				>
			</div>

			{#if absoluteElevation}
				<p class="elevation" data-testid="placement-height-elevation">
					Elevation {absoluteElevation} m
				</p>
			{/if}
		</div>

		<p class="hint">
			C or Esc to close — metres above this storey's floor. Applies to the next piece, and to the
			live preview if you are already drawing.
		</p>
	</div>
</div>

<style>
	.placement-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: #07140dd9;
		display: grid;
		place-items: center;
		padding: 1rem;
		backdrop-filter: blur(5px);
	}
	.placement-panel {
		width: min(500px, 94vw);
		background: #142a20;
		color: #e3f5e8;
		border: 1px solid #446553;
		border-radius: 18px;
		padding: 1.4rem;
		font: 14px/1.5 system-ui;
		box-shadow: 0 20px 100px #0007;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	header h2 {
		margin: 0;
		font-size: 26px;
	}
	.eyebrow {
		font-size: 11px;
		letter-spacing: 0.18em;
		color: #a0d9b7;
		margin: 0 0 0.4rem;
	}
	button,
	input {
		font: inherit;
		border: 1px solid #52715d;
		border-radius: 7px;
		background: #203d2d;
		color: #f0fff3;
		padding: 0.45rem 0.65rem;
	}
	button {
		cursor: pointer;
	}
	.reset {
		padding: 0.28rem 0.45rem;
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.reset:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.fields {
		display: grid;
		gap: 0.7rem;
		margin: 1rem 0 0.8rem;
	}
	.status {
		margin: 0;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #a0d9b7;
	}
	.row {
		display: grid;
		grid-template-columns: 4.2rem 1fr 4.4rem 3.2rem auto;
		align-items: center;
		gap: 0.45rem;
	}
	.row label {
		font-size: 12px;
		color: #c5e6d2;
	}
	.row input[type='range'] {
		padding: 0;
		min-width: 0;
	}
	.row input[type='number'] {
		padding: 0.3rem 0.35rem;
		min-width: 0;
	}
	.metres {
		font-variant-numeric: tabular-nums;
		font-size: 12px;
		color: #a0d9b7;
		white-space: nowrap;
	}
	.presets {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.45rem;
	}
	.presets button[aria-pressed='true'] {
		background: #2d5a40;
		border-color: #7ec89a;
	}
	.elevation {
		margin: 0;
		font-variant-numeric: tabular-nums;
		font-size: 12px;
		color: #a0d9b7;
	}
	.hint {
		margin: 0.2rem 0 0;
		font-size: 12px;
		color: #a0d9b7;
	}
</style>
