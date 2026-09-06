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
	<div class="palette-header">
		<h2>Materials</h2>
		<button class="palette-close" onclick={onClose} aria-label="Close palette">×</button>
	</div>

	<div class="palette-body">
		<section class="palette-section">
			<h3>Default</h3>
			<div class="swatch-grid">
				<button
					type="button"
					class="swatch swatch-default"
					class:active={!selected}
					onclick={() => selectAndClose(undefined)}
					title="Use this object's normal default material"
					aria-label="Default material"
				>
					{#if !selected}<span class="swatch-check">✓</span>{/if}
				</button>
			</div>
		</section>

		{#each DEFAULT_MATERIAL_PALETTE as group (group.group)}
			<section class="palette-section">
				<h3>{group.group}</h3>
				<div class="swatch-grid">
					{#each group.presets as preset (preset.id)}
						<button
							type="button"
							class="swatch"
							class:active={isSelected(preset.definition)}
							style="background-color: {preset.definition.type === 'color'
								? preset.definition.color
								: 'transparent'}"
							onclick={() => selectAndClose(preset.definition)}
							title={preset.name}
							aria-label={preset.name}
						>
							{#if isSelected(preset.definition)}<span class="swatch-check">✓</span>{/if}
						</button>
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
							<button
								type="button"
								class="swatch"
								class:active={isSelected(preset.definition)}
								style="background-color: {preset.definition.type === 'color'
									? preset.definition.color
									: 'transparent'}"
								onclick={() => selectAndClose(preset.definition)}
								title={preset.name}
								aria-label={preset.name}
							>
								{#if isSelected(preset.definition)}<span class="swatch-check">✓</span>{/if}
							</button>
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
		width: 19rem;
		max-height: min(32rem, 70vh);
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
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.swatch {
		width: 2rem;
		height: 2rem;
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
