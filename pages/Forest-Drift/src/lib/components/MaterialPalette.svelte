<script lang="ts">
	import { DEFAULT_MATERIAL_PALETTE, normalizeColorHex } from '$lib/game/building/MaterialTypes';
	import type {
		BuildingMaterialDefinition,
		MaterialPreset
	} from '$lib/game/building/MaterialTypes';

	interface Props {
		selected: BuildingMaterialDefinition | undefined;
		savedPresets: MaterialPreset[];
		onSelect: (material: BuildingMaterialDefinition | undefined) => void;
		onSave: () => void;
		onRemoveSaved: (id: string) => void;
		onClose: () => void;
	}

	let { selected, savedPresets, onSelect, onSave, onRemoveSaved, onClose }: Props = $props();

	// The colour picker always needs a starting value even when "Default" (no override) is selected —
	// falls back to a neutral mid-tone rather than leaving the native picker on its own black default.
	// Set from `selected` by the effect below (runs immediately on mount, then again on every change —
	// e.g. clicking a preset swatch updates the picker too), never just seeded once at init.
	let customColorDraft = $state('#9A9A9A');

	// Default 'all' keeps every group heading (including Neutrals) in the DOM for first-open browse.
	let activeGroupFilter = $state('all');
	let hoveredSwatch = $state<{ name: string; hex: string } | null>(null);

	let visibleGroups = $derived(
		activeGroupFilter === 'all'
			? DEFAULT_MATERIAL_PALETTE
			: DEFAULT_MATERIAL_PALETTE.filter((group) => group.group === activeGroupFilter)
	);

	$effect(() => {
		if (selected?.type === 'color') customColorDraft = selected.color;
	});

	function isSelected(definition: BuildingMaterialDefinition): boolean {
		return (
			!!selected &&
			selected.type === definition.type &&
			selected.type === 'color' &&
			definition.type === 'color' &&
			selected.color === definition.color
		);
	}

	/** Picking a preset/saved/Default swatch closes the palette (a quick "pick and go" action) — only the custom picker stays open, since dragging it is a more deliberate, multi-step interaction and the Save Colour button needs to still be reachable afterward. */
	function selectAndClose(material: BuildingMaterialDefinition | undefined): void {
		onSelect(material);
		onClose();
	}

	function selectColor(color: string): void {
		onSelect({ type: 'color', color: normalizeColorHex(color) });
	}

	function handleCustomColorInput(event: Event): void {
		const value = (event.currentTarget as HTMLInputElement).value;
		customColorDraft = value;
		selectColor(value);
	}

	function hoverSwatch(name: string, definition?: BuildingMaterialDefinition): void {
		hoveredSwatch = {
			name,
			hex: definition?.type === 'color' ? definition.color : ''
		};
	}

	function clearHover(): void {
		hoveredSwatch = null;
	}
</script>

<!--
	A future texture system slots in as a sibling `.palette-section` here (see the README's "Paint
	Tool" section) — "Materials" is the deliberately generic title, "Colours" the only populated
	category today; nothing about this markup assumes a swatch can only ever be a flat colour.
-->
<!-- role="presentation": this click handler exists only to stop a click on the panel from bubbling
     to the full-screen backdrop's own "click outside to close" handler (see +page.svelte's
     `.palette-overlay`) — the panel itself has no interactive semantics of its own to expose. -->
<div
	class="palette"
	data-testid="material-palette"
	role="presentation"
	onclick={(e) => e.stopPropagation()}
>
	{#snippet colorSwatch(preset: MaterialPreset)}
		<button
			type="button"
			class="swatch"
			class:active={isSelected(preset.definition)}
			style="background-color: {preset.definition.type === 'color'
				? preset.definition.color
				: 'transparent'}"
			onclick={() => selectAndClose(preset.definition)}
			onpointerenter={() => hoverSwatch(preset.name, preset.definition)}
			onpointerleave={clearHover}
			title={preset.name}
			aria-label={preset.name}
		>
			{#if isSelected(preset.definition)}<span class="swatch-check">✓</span>{/if}
		</button>
	{/snippet}

	<div class="palette-header">
		<h2>Materials</h2>
		<button class="palette-close" onclick={onClose} aria-label="Close palette">×</button>
	</div>

	<div class="palette-body">
		<div class="palette-browse">
			<div class="group-filters" role="group" aria-label="Colour groups">
				<button
					type="button"
					class="group-chip"
					class:active={activeGroupFilter === 'all'}
					aria-pressed={activeGroupFilter === 'all'}
					onclick={() => (activeGroupFilter = 'all')}
				>
					All
				</button>
				{#each DEFAULT_MATERIAL_PALETTE as group (group.group)}
					<button
						type="button"
						class="group-chip"
						class:active={activeGroupFilter === group.group}
						aria-pressed={activeGroupFilter === group.group}
						onclick={() => (activeGroupFilter = group.group)}
					>
						{group.group}
					</button>
				{/each}
			</div>
			<p class="swatch-status">
				{#if hoveredSwatch}
					<span class="swatch-status-name">{hoveredSwatch.name}</span>
					{#if hoveredSwatch.hex}
						<span class="swatch-status-hex">{hoveredSwatch.hex}</span>
					{/if}
				{/if}
			</p>
		</div>

		<section class="palette-section">
			<h3>Default</h3>
			<div class="swatch-grid">
				<button
					type="button"
					class="swatch swatch-default"
					class:active={!selected}
					onclick={() => selectAndClose(undefined)}
					onpointerenter={() => hoverSwatch('Default')}
					onpointerleave={clearHover}
					title="Use this object's normal default material"
					aria-label="Default material"
				>
					{#if !selected}<span class="swatch-check">✓</span>{/if}
				</button>
			</div>
		</section>

		{#each visibleGroups as group (group.group)}
			<section class="palette-section">
				<h3>{group.group}</h3>
				<div class="swatch-grid">
					{#each group.presets as preset (preset.id)}
						{@render colorSwatch(preset)}
					{/each}
				</div>
			</section>
		{/each}

		<section class="palette-section">
			<h3>Custom Colour</h3>
			<div class="custom-row">
				<input
					type="color"
					class="custom-picker"
					value={customColorDraft}
					oninput={handleCustomColorInput}
					aria-label="Custom colour picker"
				/>
				<span class="custom-hex">{normalizeColorHex(customColorDraft)}</span>
				<button type="button" class="save-button" onclick={onSave}>Save Colour</button>
			</div>
		</section>

		<section class="palette-section">
			<h3>Saved Colours</h3>
			{#if savedPresets.length === 0}
				<p class="empty-hint">No saved colours yet — pick a custom colour and save it.</p>
			{:else}
				<div class="swatch-grid">
					{#each savedPresets as preset (preset.id)}
						<div class="saved-swatch-wrap">
							{@render colorSwatch(preset)}
							<button
								type="button"
								class="remove-saved"
								onclick={() => onRemoveSaved(preset.id)}
								aria-label={`Remove ${preset.name}`}
								title="Remove saved colour"
							>
								×
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</div>

	<button class="palette-close-full" onclick={onClose}>Close</button>
</div>

<style>
	.palette {
		width: min(25rem, 94vw);
		max-height: min(40rem, 82vh);
		display: flex;
		flex-direction: column;
		background: rgba(14, 26, 20, 0.97);
		color: #eaf6ff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
		pointer-events: auto;
		overflow: hidden;
	}

	.palette-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(234, 246, 255, 0.12);
	}

	.palette-header h2 {
		margin: 0;
		font-size: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.palette-close {
		background: none;
		border: none;
		color: #eaf6ff;
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
		padding: 0.1rem 0.4rem;
	}

	.palette-close:hover {
		color: #ff9d9d;
	}

	.palette-body {
		overflow-y: auto;
		padding: 0.85rem 1rem;
	}

	/* Stays put so group chips and the hover name stay usable while scrolling ~70 swatches. */
	.palette-browse {
		position: sticky;
		top: -0.85rem;
		z-index: 1;
		margin: -0.85rem -0.15rem 0.7rem;
		padding: 0.85rem 0.15rem 0.5rem;
		background: rgba(14, 26, 20, 0.98);
	}

	.group-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.28rem;
	}

	.group-chip {
		padding: 0.18rem 0.42rem;
		background: rgba(234, 246, 255, 0.08);
		color: #9fd8b8;
		border: 1px solid rgba(234, 246, 255, 0.18);
		border-radius: 6px;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		line-height: 1.2;
		cursor: pointer;
	}

	.group-chip:hover {
		background: rgba(234, 246, 255, 0.16);
	}

	.group-chip.active {
		background: rgba(57, 211, 83, 0.28);
		color: #eaf6ff;
		border-color: rgba(159, 216, 184, 0.55);
	}

	.swatch-status {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		min-height: 1.05rem;
		margin: 0.45rem 0 0;
		font-size: 0.72rem;
	}

	.swatch-status-hex {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.68rem;
		opacity: 0.7;
	}

	.palette-section {
		margin-bottom: 1rem;
	}

	.palette-section h3 {
		margin: 0 0 0.4rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #9fd8b8;
	}

	.swatch-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(1.85rem, 1fr));
		gap: 0.4rem;
	}

	.swatch {
		width: 100%;
		aspect-ratio: 1;
		min-width: 1.85rem;
		min-height: 1.85rem;
		border-radius: 6px;
		border: 2px solid rgba(234, 246, 255, 0.25);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.swatch.active {
		border-color: #ffcc33;
		box-shadow: 0 0 0 2px rgba(255, 204, 51, 0.4);
	}

	.swatch-check {
		color: #04120a;
		text-shadow: 0 0 3px rgba(255, 255, 255, 0.9);
		font-weight: 700;
		font-size: 0.9rem;
	}

	.swatch-default {
		background: repeating-conic-gradient(#999 0% 25%, #666 0% 50%) 0 0 / 10px 10px;
	}

	.custom-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.custom-picker {
		width: 2.4rem;
		height: 2.4rem;
		padding: 0;
		border: 2px solid rgba(234, 246, 255, 0.25);
		border-radius: 6px;
		background: none;
		cursor: pointer;
	}

	.custom-hex {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.75rem;
		opacity: 0.85;
		flex: 1;
	}

	.save-button {
		padding: 0.35rem 0.6rem;
		background: rgba(57, 211, 83, 0.85);
		color: #04120a;
		font-weight: 700;
		font-size: 0.75rem;
		border: none;
		border-radius: 6px;
		cursor: pointer;
	}

	.save-button:hover {
		background: rgba(57, 211, 83, 1);
	}

	.empty-hint {
		margin: 0;
		font-size: 0.75rem;
		opacity: 0.6;
	}

	.saved-swatch-wrap {
		position: relative;
	}

	.remove-saved {
		position: absolute;
		top: -0.4rem;
		right: -0.4rem;
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 50%;
		border: none;
		background: rgba(255, 77, 77, 0.9);
		color: white;
		font-size: 0.7rem;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.remove-saved:hover {
		background: rgba(255, 77, 77, 1);
	}

	.palette-close-full {
		margin: 0 1rem 0.85rem;
		padding: 0.5rem;
		background: rgba(234, 246, 255, 0.1);
		color: #eaf6ff;
		border: 1px solid rgba(234, 246, 255, 0.25);
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.palette-close-full:hover {
		background: rgba(234, 246, 255, 0.2);
	}
</style>
