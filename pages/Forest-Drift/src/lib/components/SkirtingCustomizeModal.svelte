<script lang="ts">
	import type { BuildingSettings } from '$lib/game/building/FoundationTypes';
	import {
		createDefaultSkirtingDraftSettings,
		SKIRTING_LIMITS
	} from '$lib/game/building/skirtingRunMath';
	import PlacementPreviewPane from './PlacementPreviewPane.svelte';

	let { settings, onClose }: { settings: BuildingSettings; onClose: () => void } = $props();

	/** Bumped on every edit: `settings` is a plain object, so this drives the displays and preview. */
	let revision = $state(0);
	const draft = () => settings.skirtingRun;
	const defaults = createDefaultSkirtingDraftSettings();
	const DEFAULT_SWATCH = '#C19A6B';

	function read<T>(get: () => T): T {
		void revision;
		return get();
	}

	function bump() {
		revision += 1;
	}

	function clampTo(value: number, limits: { min: number; max: number }): number {
		if (!Number.isFinite(value)) return limits.min;
		return Math.min(limits.max, Math.max(limits.min, value));
	}

	function onBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) onClose();
	}

	function onBackdropKey(event: KeyboardEvent) {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'Enter' || event.key === ' ') onClose();
	}
</script>

{#snippet slider(
	id: string,
	label: string,
	limits: { min: number; max: number; step: number },
	value: number,
	apply: (v: number) => void
)}
	<div class="row">
		<label for={id}>{label}</label>
		<input
			{id}
			data-testid={id}
			type="range"
			min={limits.min}
			max={limits.max}
			step={limits.step}
			{value}
			oninput={(event) => apply(Number(event.currentTarget.value))}
		/>
		<input
			type="number"
			data-testid={`${id}-number`}
			aria-label={`${label} in metres`}
			min={limits.min}
			max={limits.max}
			step={limits.step}
			{value}
			onchange={(event) => apply(clampTo(Number(event.currentTarget.value), limits))}
		/>
		<span class="metres">{(value * 100).toFixed(1)} cm</span>
	</div>
{/snippet}

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
		aria-labelledby="skirting-customize-title"
		data-testid="skirting-customize-modal"
	>
		<header>
			<div>
				<p class="eyebrow">BUILD MODE · SLOT 2</p>
				<h2 id="skirting-customize-title">Skirting</h2>
			</div>
			<button aria-label="Close customise" onclick={onClose}>✕</button>
		</header>

		<div class="placement-body">
			<div class="fields">
				<div class="row direction-row" role="group" aria-labelledby="skirting-offset-mode-label">
					<span id="skirting-offset-mode-label">Offset</span>
					<button
						type="button"
						data-testid="skirting-offset-auto"
						aria-pressed={read(() => draft().offsetMode === 'auto')}
						onclick={() => {
							draft().offsetMode = 'auto';
							bump();
						}}>Auto (from wall)</button
					>
					<button
						type="button"
						data-testid="skirting-offset-manual"
						aria-pressed={read(() => draft().offsetMode === 'manual')}
						onclick={() => {
							draft().offsetMode = 'manual';
							bump();
						}}>Manual</button
					>
				</div>
				{@render slider(
					'skirting-manual-offset',
					read(() => (draft().offsetMode === 'manual' ? 'Offset' : 'Offset if no wall')),
					SKIRTING_LIMITS.offset,
					read(() => draft().manualOffset),
					(v) => {
						draft().manualOffset = v;
						bump();
					}
				)}
				{@render slider(
					'skirting-height',
					'Height',
					SKIRTING_LIMITS.height,
					read(() => draft().height),
					(v) => {
						draft().height = v;
						bump();
					}
				)}
				{@render slider(
					'skirting-depth',
					'Depth',
					SKIRTING_LIMITS.depth,
					read(() => draft().depth),
					(v) => {
						draft().depth = v;
						bump();
					}
				)}
				<div class="row color-row">
					<label for="skirting-color">Colour</label>
					<input
						id="skirting-color"
						data-testid="skirting-color"
						type="color"
						value={read(() => draft().color ?? DEFAULT_SWATCH)}
						oninput={(event) => {
							draft().color = event.currentTarget.value.toUpperCase();
							bump();
						}}
					/>
					<span class="metres">{read(() => draft().color ?? 'Timber (default)')}</span>
					<button
						type="button"
						class="reset"
						data-testid="skirting-color-reset"
						disabled={read(() => draft().color === null)}
						onclick={() => {
							draft().color = null;
							bump();
						}}>Default</button
					>
				</div>
				<div class="row reset-row">
					<span></span>
					<button
						type="button"
						class="reset"
						data-testid="skirting-reset"
						onclick={() => {
							Object.assign(settings.skirtingRun, defaults);
							bump();
						}}>Reset all</button
					>
				</div>
			</div>

			<PlacementPreviewPane toolId="skirting" {settings} {revision} />
		</div>

		<p class="hint">
			E or Esc to close — applies to the next run you draw. Draw along a wall's centre line; each
			board goes on the wall face on the side you're standing. Auto uses half the thickness of the
			wall drawn on that line on this storey; where there is none (or in Manual, O toggles), the
			offset above is used.
		</p>
	</div>
</div>

<style>
	.placement-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: #07140dd9;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 0.75rem;
		box-sizing: border-box;
		overflow-y: auto;
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(5px);
	}
	.placement-panel {
		margin: auto;
		width: min(900px, 96vw);
		max-height: min(92vh, calc(100dvh - 1.5rem));
		overflow-y: auto;
		background: #142a20;
		color: #e3f5e8;
		border: 1px solid #446553;
		border-radius: 18px;
		padding: 1.4rem;
		font: 14px/1.5 system-ui;
		box-shadow: 0 20px 100px #0007;
		box-sizing: border-box;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.25rem 0 0.6rem;
		border-bottom: 1px solid rgba(68, 101, 83, 0.4);
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
	button[aria-pressed='true'] {
		background: #2d5a40;
		border-color: #7ec89a;
	}
	.reset {
		padding: 0.28rem 0.55rem;
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
		gap: 0.6rem;
		min-width: 0;
	}
	.placement-body {
		display: grid;
		grid-template-columns: minmax(18rem, 1fr) minmax(14rem, 20rem);
		gap: 1rem;
		align-items: start;
		margin: 1rem 0 0.8rem;
	}
	@media (max-width: 720px) {
		.placement-body {
			grid-template-columns: 1fr;
		}
	}
	.row {
		display: grid;
		grid-template-columns: 7.2rem 1fr 4.4rem 4.6rem;
		align-items: center;
		gap: 0.45rem;
	}
	.row > * {
		min-width: 0;
	}
	.row label,
	.direction-row span {
		font-size: 12px;
		color: #c5e6d2;
	}
	.row input[type='range'] {
		padding: 0;
	}
	.row input[type='number'] {
		padding: 0.3rem 0.35rem;
	}
	.direction-row {
		grid-template-columns: 7.2rem 1fr 1fr;
	}
	.color-row {
		grid-template-columns: 7.2rem auto 1fr auto;
	}
	.color-row input[type='color'] {
		width: 2.4rem;
		height: 2rem;
		padding: 0.12rem;
	}
	.reset-row {
		grid-template-columns: 1fr auto;
	}
	.metres {
		font-variant-numeric: tabular-nums;
		font-size: 12px;
		color: #a0d9b7;
		white-space: nowrap;
	}
	.hint {
		margin: 0.2rem 0 0;
		font-size: 12px;
		color: #a0d9b7;
	}
	@media (max-width: 480px) {
		.row {
			grid-template-columns: 5.6rem 1fr 3.6rem 4rem;
			gap: 0.25rem;
		}
		.direction-row {
			grid-template-columns: 5.6rem 1fr 1fr;
		}
	}
</style>
