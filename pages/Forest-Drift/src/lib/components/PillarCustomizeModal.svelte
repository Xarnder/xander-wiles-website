<script lang="ts">
	import type { BuildingSettings } from '$lib/game/building/FoundationTypes';
	import {
		createDefaultPillarSettings,
		normalizePillarSettings,
		type PillarSettings
	} from '$lib/game/building/PillarTypes';
	import PlacementPreviewPane from './PlacementPreviewPane.svelte';
	let { settings, onClose }: { settings: BuildingSettings; onClose: () => void } = $props();
	let revision = $state(0);
	let draft = $derived.by(() => {
		void revision;
		return settings.pillar;
	});
	type NumericKey = 'height' | 'width' | 'topWidth' | 'topHeight' | 'bottomWidth' | 'bottomHeight';
	function set(key: keyof PillarSettings, value: number | string | boolean) {
		settings.pillar = normalizePillarSettings({ ...settings.pillar, [key]: value });
		revision++;
	}
</script>

{#snippet size(key: NumericKey, label: string, min: number, max: number)}
	<div class="size-row">
		<label for={`pillar-${key}`}>{label}</label>
		<input
			id={`pillar-${key}`}
			data-testid={`pillar-${key}`}
			type="range"
			{min}
			{max}
			step="0.01"
			value={draft[key]}
			oninput={(event) => set(key, Number(event.currentTarget.value))}
		/>
		<input
			data-testid={`pillar-${key}-number`}
			aria-label={`${label} in metres`}
			type="number"
			{min}
			{max}
			step="0.01"
			value={draft[key]}
			onchange={(event) => set(key, Number(event.currentTarget.value))}
		/>
		<span>m</span>
	</div>
{/snippet}

<div
	data-ui-backdrop
	class="backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget) onClose();
	}}
	onkeydown={(event) => {
		if (event.target === event.currentTarget && event.key === 'Escape') onClose();
	}}
>
	<div
		data-ui-surface="panel"
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby="pillar-title"
		tabindex="-1"
		data-testid="pillar-customize-modal"
	>
		<header>
			<div>
				<p>BUILD MODE · SLOT 2</p>
				<h2 id="pillar-title">Wooden Pillars</h2>
			</div>
			<button aria-label="Close customise" onclick={onClose}>✕</button>
		</header>
		<div class="body">
			<div class="fields">
				<div class="buttons" role="group" aria-label="Pillar shape">
					<button
						type="button"
						data-testid="pillar-square"
						aria-pressed={draft.shape === 'square'}
						onclick={() => set('shape', 'square')}>Square</button
					>
					<button
						type="button"
						data-testid="pillar-circular"
						aria-pressed={draft.shape === 'circular'}
						onclick={() => set('shape', 'circular')}>Circular</button
					>
				</div>
				{@render size('height', 'Height', 0.3, 10)}
				{@render size('width', draft.shape === 'circular' ? 'Diameter' : 'Thickness', 0.05, 1.5)}
				{#each ['top', 'bottom'] as end (end)}
					{@const enabledKey = `${end}Enabled` as 'topEnabled' | 'bottomEnabled'}
					<fieldset>
						<legend>{end === 'top' ? 'Top base' : 'Bottom base'}</legend>
						<div class="buttons" role="group" aria-label={`${end} base enabled`}>
							<button
								type="button"
								data-testid={`pillar-${end}-on`}
								aria-pressed={draft[enabledKey]}
								onclick={() => set(enabledKey, true)}>On</button
							>
							<button
								type="button"
								data-testid={`pillar-${end}-off`}
								aria-pressed={!draft[enabledKey]}
								onclick={() => set(enabledKey, false)}>Off</button
							>
						</div>
						{#if draft[enabledKey]}
							{@render size(
								`${end}Width` as NumericKey,
								draft.shape === 'circular' ? 'Diameter' : 'Width',
								0.05,
								2
							)}
							{@render size(`${end}Height` as NumericKey, 'Height', 0.02, draft.height / 3)}
						{/if}
					</fieldset>
				{/each}
				<button
					type="button"
					data-testid="pillar-reset"
					onclick={() => {
						settings.pillar = createDefaultPillarSettings();
						revision++;
					}}>Reset pillar</button
				>
				<p class="hint">
					Applies to the next pillar. Placement snaps to the building grid on your selected floor. E
					or Esc to close.
				</p>
			</div>
			<PlacementPreviewPane toolId="pillar" {settings} {revision} />
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: #0009;
	}
	.panel {
		width: min(58rem, 100%);
		max-height: calc(100dvh - 2rem);
		overflow: auto;
		padding: 1.2rem;
		border-radius: 18px;
		background: #132319;
		border: 1px solid #53735d;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	header p {
		font-size: 0.65rem;
		letter-spacing: 0.16em;
		margin: 0;
	}
	h2 {
		margin: 0.25rem 0;
	}
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(12rem, 1fr);
		gap: 1rem;
		margin-top: 1rem;
	}
	.fields {
		display: grid;
		gap: 0.7rem;
		min-width: 0;
	}
	.size-row {
		display: grid;
		grid-template-columns: 5rem minmax(0, 1fr) 4rem 1rem;
		align-items: center;
		gap: 0.4rem;
	}
	.size-row input {
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
	}
	label,
	legend,
	.hint {
		font-size: 0.8rem;
	}
	.buttons {
		display: flex;
		gap: 0.5rem;
	}
	button {
		min-height: 44px;
		cursor: pointer;
	}
	.buttons button {
		flex: 1;
	}
	button[aria-pressed='true'] {
		background: #507a52;
		border-color: #a8e2ae;
	}
	fieldset {
		display: grid;
		gap: 0.6rem;
		min-width: 0;
		border: 1px solid #53735d;
		border-radius: 8px;
		padding: 0.7rem;
	}
	.hint {
		margin: 0;
	}
	@media (max-width: 720px) {
		.body {
			grid-template-columns: minmax(0, 1fr);
		}
		.panel {
			padding: 0.8rem;
		}
	}
	@media (max-width: 420px) {
		.backdrop {
			padding: 0.4rem;
		}
		.size-row {
			grid-template-columns: 4rem minmax(0, 1fr) 3.5rem 0.7rem;
			gap: 0.25rem;
		}
	}
</style>
