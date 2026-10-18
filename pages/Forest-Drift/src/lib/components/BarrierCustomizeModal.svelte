<script lang="ts">
	import {
		applyBarrierPreset,
		BARRIER_BALUSTER_STYLES,
		BARRIER_LIMITS,
		BARRIER_POST_CAPS,
		BARRIER_POST_PROFILES,
		BARRIER_PRESETS,
		BARRIER_RAIL_PROFILES,
		BARRIER_WOOD_IDS,
		BARRIER_WOODS,
		getBarrierPreset,
		type BarrierBaseModeSetting,
		type BarrierPresetId
	} from '$lib/game/building/BarrierTypes';
	import type { BuildingSettings } from '$lib/game/building/FoundationTypes';
	import PlacementPreviewPane from './PlacementPreviewPane.svelte';

	let { settings, onClose }: { settings: BuildingSettings; onClose: () => void } = $props();

	/** Bumped on every edit: `settings` is a plain object, so this drives the displays and preview. */
	let revision = $state(0);
	const draft = () => settings.barrier;
	const style = () => settings.barrier.style;

	const LABELS: Record<string, string> = {
		square: 'Square',
		chamfered: 'Chamfered',
		tapered: 'Tapered',
		turned: 'Turned',
		'classic-newel': 'Classic newel',
		flat: 'Flat',
		pyramid: 'Pyramid',
		bevelled: 'Bevelled',
		ball: 'Ball',
		slender: 'Slender',
		none: 'None (rails only)',
		rectangular: 'Rectangular',
		rounded: 'Rounded'
	};
	const BASE_MODES: { id: BarrierBaseModeSetting; label: string }[] = [
		{ id: 'auto', label: 'Auto' },
		{ id: 'flat', label: 'Level' },
		{ id: 'follow-surface', label: 'Follow ground' },
		{ id: 'linear-slope', label: 'Straight slope' }
	];

	function bump() {
		revision += 1;
	}

	function read<T>(get: () => T): T {
		void revision;
		return get();
	}

	function clampTo(value: number, limits: { min: number; max: number }): number {
		if (!Number.isFinite(value)) return limits.min;
		return Math.min(limits.max, Math.max(limits.min, value));
	}

	function choosePreset(id: BarrierPresetId) {
		applyBarrierPreset(settings.barrier, id);
		bump();
	}

	function resetToPreset() {
		applyBarrierPreset(settings.barrier, style().presetId);
		bump();
	}

	/** Posts move together: the end/corner posts keep their size relative to the run posts. */
	function setPostWidth(width: number) {
		const s = style();
		const ratio = s.structuralPost.width > 0 ? s.endPost.width / s.structuralPost.width : 1;
		s.structuralPost.width = clampTo(width, BARRIER_LIMITS.postWidth);
		s.endPost.width = clampTo(width * ratio, BARRIER_LIMITS.postWidth);
		bump();
	}

	function setPostsAbove(value: number) {
		const s = style();
		const v = clampTo(value, BARRIER_LIMITS.postExtendAbove);
		s.endPost.extendAbove = v;
		if (s.structuralPost.extendAbove > 0 || v === 0)
			s.structuralPost.extendAbove = Math.min(v, 0.12);
		bump();
	}

	let presetName = $derived(read(() => getBarrierPreset(style().presetId).name));

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
	apply: (v: number) => void,
	unit = 'm'
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
			aria-label={`${label}${unit ? ` in ${unit === 'm' ? 'metres' : unit}` : ''}`}
			min={limits.min}
			max={limits.max}
			step={limits.step}
			{value}
			onchange={(event) => apply(clampTo(Number(event.currentTarget.value), limits))}
		/>
		<span class="metres">{unit === 'm' ? `${value.toFixed(2)} m` : value}</span>
	</div>
{/snippet}

{#snippet picker(
	id: string,
	label: string,
	options: readonly string[],
	value: string,
	apply: (v: string) => void,
	labelFor: (v: string) => string = (v) => LABELS[v] ?? v
)}
	<div class="row select-row">
		<label for={id}>{label}</label>
		<select {id} data-testid={id} {value} onchange={(event) => apply(event.currentTarget.value)}>
			{#each options as option (option)}
				<option value={option}>{labelFor(option)}</option>
			{/each}
		</select>
	</div>
{/snippet}

{#snippet toggle(id: string, label: string, on: boolean, apply: (v: boolean) => void)}
	<div class="row direction-row" role="group" aria-labelledby={`${id}-label`}>
		<span id={`${id}-label`}>{label}</span>
		<button type="button" data-testid={`${id}-on`} aria-pressed={on} onclick={() => apply(true)}
			>On</button
		>
		<button type="button" data-testid={`${id}-off`} aria-pressed={!on} onclick={() => apply(false)}
			>Off</button
		>
	</div>
{/snippet}

<div
	data-ui-backdrop
	class="placement-backdrop"
	role="presentation"
	onclick={onBackdropClick}
	onkeydown={onBackdropKey}
>
	<div
		data-ui-surface="panel"
		class="placement-panel"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-labelledby="barrier-customize-title"
		data-testid="barrier-customize-modal"
	>
		<header>
			<div>
				<p class="eyebrow">BUILD MODE · SLOT 2</p>
				<h2 id="barrier-customize-title">Fence / Railing</h2>
			</div>
			<button aria-label="Close customise" onclick={onClose}>✕</button>
		</header>

		<div class="placement-body">
			<div class="fields">
				<div class="row select-row">
					<label for="barrier-preset">Style</label>
					<select
						id="barrier-preset"
						data-testid="barrier-preset"
						value={read(() => style().presetId)}
						onchange={(event) => choosePreset(event.currentTarget.value as BarrierPresetId)}
					>
						{#each ['Interior', 'Outdoor'] as group (group)}
							<optgroup label={group}>
								{#each BARRIER_PRESETS.filter((p) => p.group === group) as preset (preset.id)}
									<option value={preset.id}>{preset.name}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</div>
				<div class="row direction-row" role="group" aria-labelledby="barrier-type-label">
					<span id="barrier-type-label">Draw as</span>
					<button
						type="button"
						data-testid="barrier-type-fence"
						aria-pressed={read(() => draft().type === 'fence')}
						onclick={() => {
							draft().type = 'fence';
							bump();
						}}>Fence</button
					>
					<button
						type="button"
						data-testid="barrier-type-railing"
						aria-pressed={read(() => draft().type === 'railing')}
						onclick={() => {
							draft().type = 'railing';
							bump();
						}}>Railing</button
					>
				</div>

				<h3>Size</h3>
				{@render slider(
					'barrier-height',
					'Height',
					BARRIER_LIMITS.height,
					read(() => style().height),
					(v) => {
						style().height = v;
						bump();
					}
				)}
				{@render slider(
					'barrier-baluster-spacing',
					'Baluster spacing',
					BARRIER_LIMITS.balusterSpacing,
					read(() => style().balusterSpacing),
					(v) => {
						style().balusterSpacing = v;
						bump();
					}
				)}
				{@render slider(
					'barrier-baluster-width',
					'Baluster thickness',
					BARRIER_LIMITS.balusterWidth,
					read(() => style().baluster.width),
					(v) => {
						const b = style().baluster;
						const ratio = b.width > 0 ? b.depth / b.width : 1;
						b.width = v;
						b.depth = clampTo(v * ratio, BARRIER_LIMITS.balusterWidth);
						bump();
					}
				)}
				{@render slider(
					'barrier-post-spacing',
					'Post spacing',
					BARRIER_LIMITS.postSpacing,
					read(() => style().structuralPostSpacing),
					(v) => {
						style().structuralPostSpacing = v;
						bump();
					}
				)}
				{@render slider(
					'barrier-post-width',
					'Post thickness',
					BARRIER_LIMITS.postWidth,
					read(() => style().structuralPost.width),
					setPostWidth
				)}
				{@render slider(
					'barrier-post-above',
					'Posts above rail',
					BARRIER_LIMITS.postExtendAbove,
					read(() => style().endPost.extendAbove),
					setPostsAbove
				)}
				{@render toggle(
					'barrier-structural',
					'Run posts',
					read(() => style().structuralPost.enabled),
					(on) => {
						style().structuralPost.enabled = on;
						bump();
					}
				)}

				<h3>Parts</h3>
				{@render picker(
					'barrier-end-post',
					'End posts',
					BARRIER_POST_PROFILES,
					read(() => style().endPost.profile),
					(v) => {
						style().endPost.profile = v as (typeof BARRIER_POST_PROFILES)[number];
						bump();
					}
				)}
				{@render picker(
					'barrier-cap',
					'Post caps',
					BARRIER_POST_CAPS,
					read(() => style().endPost.cap),
					(v) => {
						style().endPost.cap = v as (typeof BARRIER_POST_CAPS)[number];
						bump();
					}
				)}
				{@render picker(
					'barrier-baluster',
					'Balusters',
					BARRIER_BALUSTER_STYLES,
					read(() => style().baluster.style),
					(v) => {
						style().baluster.style = v as (typeof BARRIER_BALUSTER_STYLES)[number];
						bump();
					}
				)}
				{@render picker(
					'barrier-top-rail',
					'Top rail',
					BARRIER_RAIL_PROFILES,
					read(() => style().topRail.profile),
					(v) => {
						style().topRail.profile = v as (typeof BARRIER_RAIL_PROFILES)[number];
						bump();
					}
				)}
				{@render slider(
					'barrier-top-rail-width',
					'Top rail width',
					BARRIER_LIMITS.topRailWidth,
					read(() => style().topRail.width),
					(v) => {
						style().topRail.width = v;
						bump();
					}
				)}
				{@render slider(
					'barrier-top-rail-height',
					'Top rail depth',
					BARRIER_LIMITS.topRailHeight,
					read(() => style().topRail.height),
					(v) => {
						style().topRail.height = v;
						bump();
					}
				)}
				{@render toggle(
					'barrier-bottom-rail',
					'Bottom rail',
					read(() => style().bottomRail.enabled),
					(on) => {
						style().bottomRail.enabled = on;
						bump();
					}
				)}
				{#if read(() => style().bottomRail.enabled)}
					{@render slider(
						'barrier-bottom-rail-height',
						'Bottom rail height',
						BARRIER_LIMITS.bottomRailHeight,
						read(() => style().bottomRail.height),
						(v) => {
							style().bottomRail.height = v;
							bump();
						}
					)}
				{/if}
				{@render slider(
					'barrier-mid-rails',
					'Middle rails',
					BARRIER_LIMITS.midRails,
					read(() => style().midRails),
					(v) => {
						style().midRails = Math.round(v);
						bump();
					},
					''
				)}

				<h3>Materials and ground</h3>
				{@render picker(
					'barrier-wood',
					'Wood',
					BARRIER_WOOD_IDS,
					read(() => style().wood),
					(v) => {
						style().wood = v as (typeof BARRIER_WOOD_IDS)[number];
						bump();
					},
					(v) => BARRIER_WOODS[v as (typeof BARRIER_WOOD_IDS)[number]].label
				)}
				{@render picker(
					'barrier-accent-wood',
					'Caps in',
					['same', ...BARRIER_WOOD_IDS],
					read(() => style().accentWood ?? 'same'),
					(v) => {
						style().accentWood = v === 'same' ? null : (v as (typeof BARRIER_WOOD_IDS)[number]);
						bump();
					},
					(v) =>
						v === 'same' ? 'Same wood' : BARRIER_WOODS[v as (typeof BARRIER_WOOD_IDS)[number]].label
				)}
				{@render picker(
					'barrier-base-mode',
					'Base',
					BASE_MODES.map((m) => m.id),
					read(() => draft().baseMode),
					(v) => {
						draft().baseMode = v as BarrierBaseModeSetting;
						bump();
					},
					(v) => BASE_MODES.find((m) => m.id === v)?.label ?? v
				)}

				<div class="row reset-row">
					<span>{presetName}</span>
					<button type="button" class="reset" data-testid="barrier-reset" onclick={resetToPreset}
						>Reset to style</button
					>
				</div>
			</div>

			<PlacementPreviewPane toolId="barrier" {settings} {revision} />
		</div>

		<p class="hint">
			E or Esc to close — applies to the next fence you draw. Aim at an existing fence with the tool
			and press R to apply these settings to it (Q copies its style here). Base “Auto” follows the
			ground outdoors, stays level on a floor, and slopes between points on a stair.
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
		overflow-x: hidden;
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(5px);
	}
	.placement-panel {
		margin: auto;
		width: min(980px, 96vw);
		max-height: min(92vh, calc(100dvh - 1.5rem));
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior: contain;
		scrollbar-width: thin;
		scrollbar-color: rgba(126, 200, 154, 0.4) transparent;
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
		position: sticky;
		top: -1.4rem;
		z-index: 5;
		background: #142a20;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.25rem 0 0.6rem;
		margin-top: -0.25rem;
		border-bottom: 1px solid rgba(68, 101, 83, 0.4);
	}
	header h2 {
		margin: 0;
		font-size: 26px;
	}
	h3 {
		margin: 0.4rem 0 0;
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #a0d9b7;
	}
	.eyebrow {
		font-size: 11px;
		letter-spacing: 0.18em;
		color: #a0d9b7;
		margin: 0 0 0.4rem;
	}
	button,
	input,
	select {
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
	.fields {
		display: grid;
		gap: 0.55rem;
		min-width: 0;
	}
	.placement-body {
		display: grid;
		grid-template-columns: minmax(18rem, 1fr) minmax(14rem, 20rem);
		gap: 1rem;
		align-items: start;
		margin: 1rem 0 0.8rem;
	}
	.placement-body :global(.preview) {
		position: sticky;
		top: 3.5rem;
		min-height: 20rem;
	}
	@media (max-width: 720px) {
		.placement-body {
			grid-template-columns: 1fr;
		}
		.placement-body :global(.preview) {
			position: relative;
			top: 0;
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
	.direction-row span,
	.reset-row span {
		font-size: 12px;
		color: #c5e6d2;
	}
	.row input[type='range'] {
		padding: 0;
	}
	.row input[type='number'] {
		padding: 0.3rem 0.35rem;
	}
	.select-row {
		grid-template-columns: 7.2rem 1fr;
	}
	.direction-row {
		grid-template-columns: 7.2rem 1fr 1fr;
	}
	.reset-row {
		grid-template-columns: 1fr auto;
		margin-top: 0.3rem;
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
	@media (max-width: 600px), (max-height: 560px) {
		.placement-panel {
			padding: 0.75rem 0.85rem;
			border-radius: 14px;
		}
		header {
			top: -0.75rem;
		}
		header h2 {
			font-size: 1.2rem;
		}
	}
	@media (max-width: 480px) {
		.row {
			grid-template-columns: 5.6rem 1fr 3.6rem 4rem;
			gap: 0.25rem;
		}
		.select-row {
			grid-template-columns: 5.6rem 1fr;
		}
		.direction-row {
			grid-template-columns: 5.6rem 1fr 1fr;
		}
	}
</style>
