<script lang="ts">
	import {
		createDefaultBuildingSettings,
		type BuildingSettings
	} from '$lib/game/building/FoundationTypes';
	import { FurniturePresetStore } from '$lib/game/building/FurniturePresetStore';
	import type { FurnitureKind } from '$lib/game/building/FurnitureTypes';
	import {
		clampFurnitureToRules,
		FURNITURE_CATALOGUE,
		furnitureEntriesByCategory,
		getFurnitureCatalogueEntry
	} from '$lib/game/building/furnitureCatalogue';
	import FurniturePreviewPane from './FurniturePreviewPane.svelte';

	let {
		settings,
		onClose
	}: {
		settings: BuildingSettings;
		onClose: () => void;
	} = $props();

	const store = new FurniturePresetStore();
	const defaults = createDefaultBuildingSettings();
	const categories = furnitureEntriesByCategory();
	const names = Object.fromEntries(
		FURNITURE_CATALOGUE.map((item) => [item.kind, item.name])
	) as Record<FurnitureKind, string>;

	let revision = $state(0);
	let query = $state('');

	let selectedKind = $derived.by(() => {
		void revision;
		return settings.furnitureKind ?? defaults.furnitureKind;
	});
	let entry = $derived(getFurnitureCatalogueEntry(selectedKind));
	let recentKinds = $derived.by(() => {
		void revision;
		return store.getRecentKinds();
	});
	let filteredCategories = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return categories
			.map((group) => ({
				...group,
				entries: group.entries.filter((item) => {
					if (!needle) return true;
					return (
						item.name.toLowerCase().includes(needle) ||
						item.category.toLowerCase().includes(needle)
					);
				})
			}))
			.filter((group) => group.entries.length > 0);
	});
	let widthValue = $derived.by(() => {
		void revision;
		return settings.furnitureWidth;
	});
	let depthValue = $derived.by(() => {
		void revision;
		return settings.furnitureDepth;
	});
	let heightValue = $derived.by(() => {
		void revision;
		return settings.furnitureHeight;
	});
	let backrest = $derived.by(() => {
		void revision;
		return settings.furnitureBackrest;
	});
	let headboard = $derived.by(() => {
		void revision;
		return settings.furnitureHeadboard;
	});
	let shelfCount = $derived.by(() => {
		void revision;
		return settings.furnitureShelfCount;
	});
	let primaryColor = $derived.by(() => {
		void revision;
		return settings.furniturePrimaryColor;
	});
	let secondaryColor = $derived.by(() => {
		void revision;
		return settings.furnitureSecondaryColor;
	});
	let hasBackrest = $derived(entry.params.some((param) => param.key === 'backrest'));
	let hasHeadboard = $derived(entry.params.some((param) => param.key === 'headboard'));
	let shelfRules = $derived.by(() => {
		const param = entry.params.find((item) => item.key === 'shelfCount');
		if (!param || param.type !== 'integer') return null;
		return { min: param.min, max: param.max, label: param.label };
	});
	let showSize = $derived(selectedKind !== 'torch');
	let showDepth = $derived(showSize && !entry.syncDepthToWidth);
	let rules = $derived(entry.dimensions);

	function persistAndBump() {
		store.remember(settings.furnitureKind, store.captureFrom(settings));
		revision += 1;
	}

	function snapDimensions() {
		const next = clampFurnitureToRules(
			settings.furnitureKind,
			settings.furnitureWidth,
			settings.furnitureDepth,
			settings.furnitureHeight
		);
		settings.furnitureWidth = next.width;
		settings.furnitureDepth = next.depth;
		settings.furnitureHeight = next.height;
		persistAndBump();
	}

	function selectKind(kind: FurnitureKind) {
		store.applyTo(settings, kind);
		revision += 1;
	}

	function setWidth(raw: number) {
		settings.furnitureWidth = raw;
		if (getFurnitureCatalogueEntry(settings.furnitureKind).syncDepthToWidth) {
			settings.furnitureDepth = raw;
		}
		snapDimensions();
	}

	function setDepth(raw: number) {
		settings.furnitureDepth = raw;
		snapDimensions();
	}

	function setHeight(raw: number) {
		settings.furnitureHeight = raw;
		snapDimensions();
	}

	function applyPreset(width: number, depth: number, height: number) {
		settings.furnitureWidth = width;
		settings.furnitureDepth = depth;
		settings.furnitureHeight = height;
		snapDimensions();
	}

	function setBackrest(value: boolean) {
		settings.furnitureBackrest = value;
		persistAndBump();
	}

	function setHeadboard(value: boolean) {
		settings.furnitureHeadboard = value;
		persistAndBump();
	}

	function setShelfCount(raw: number) {
		const param = getFurnitureCatalogueEntry(settings.furnitureKind).params.find(
			(item) => item.key === 'shelfCount'
		);
		const min = param && param.type === 'integer' ? param.min : 2;
		const max = param && param.type === 'integer' ? param.max : 8;
		const value = Math.round(Number.isFinite(raw) ? raw : min);
		settings.furnitureShelfCount = Math.min(max, Math.max(min, value));
		persistAndBump();
	}

	function setPrimaryColor(value: string) {
		settings.furniturePrimaryColor = value;
		persistAndBump();
	}

	function setSecondaryColor(value: string) {
		settings.furnitureSecondaryColor = value;
		persistAndBump();
	}

	function onBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) onClose();
	}

	function onBackdropKey(event: KeyboardEvent) {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'Enter' || event.key === ' ') onClose();
	}
</script>

{#snippet dimRow(
	id: string,
	testId: string,
	label: string,
	min: number,
	max: number,
	step: number,
	value: number,
	onSlide: (next: number) => void
)}
	<div class="row">
		<label for={id}>{label}</label>
		<input
			{id}
			data-testid={testId}
			type="range"
			{min}
			{max}
			{step}
			{value}
			oninput={(event) => onSlide(Number(event.currentTarget.value))}
		/>
		<input
			type="number"
			data-testid="{testId}-number"
			{min}
			{max}
			{step}
			aria-label="{label} in metres"
			{value}
			onchange={(event) => onSlide(Number(event.currentTarget.value))}
		/>
	</div>
{/snippet}

<div
	class="placement-backdrop"
	role="presentation"
	data-testid="furniture-catalogue-modal"
	onclick={onBackdropClick}
	onkeydown={onBackdropKey}
>
	<div
		class="placement-panel"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-labelledby="furniture-catalogue-title"
	>
		<header>
			<div>
				<p class="eyebrow">PLACE OBJECT</p>
				<h2 id="furniture-catalogue-title">Objects</h2>
			</div>
			<button type="button" data-testid="furniture-modal-done" onclick={onClose}>Done</button>
		</header>

		<div class="toolbar">
			<input
				type="search"
				data-testid="furniture-search"
				placeholder="Search…"
				aria-label="Search"
				bind:value={query}
			/>
			{#if recentKinds.length > 0}
				<div class="recent" role="group" aria-label="Recently used">
					<p class="recent-label">Recently used</p>
					<div class="recent-row">
						{#each recentKinds as kind (kind)}
							<button
								type="button"
								data-testid="furniture-recent-{kind}"
								aria-pressed={selectedKind === kind}
								onclick={() => selectKind(kind)}>{names[kind]}</button
							>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<div class="catalogue-body">
			<div class="catalogue-list">
				{#each filteredCategories as group (group.category)}
					<section class="category">
						<h3>{group.label}</h3>
						<div class="card-grid">
							{#each group.entries as item (item.kind)}
								<button
									type="button"
									class="card"
									data-testid="furniture-card-{item.kind}"
									aria-pressed={selectedKind === item.kind}
									onclick={() => selectKind(item.kind)}
								>
									<span class="card-name">{item.name}</span>
								</button>
							{/each}
						</div>
					</section>
				{/each}
				{#if filteredCategories.length === 0}
					<p class="empty">No objects match that search.</p>
				{/if}
			</div>

			<div class="inspector">
				<FurniturePreviewPane {settings} {revision} />
				<p class="selected-name">{entry.name}</p>

				<div class="fields">
					{#if selectedKind === 'torch'}
						<p class="hint">Torch mounts on walls and floors</p>
					{:else}
						{@render dimRow(
							'furniture-width',
							'furniture-width',
							rules.widthLabel,
							rules.minWidth,
							rules.maxWidth,
							rules.widthStep,
							widthValue,
							setWidth
						)}
						{#if showDepth}
							{@render dimRow(
								'furniture-depth',
								'furniture-depth',
								rules.depthLabel,
								rules.minDepth,
								rules.maxDepth,
								rules.depthStep,
								depthValue,
								setDepth
							)}
						{/if}
						{@render dimRow(
							'furniture-height',
							'furniture-height',
							rules.heightLabel,
							rules.minHeight,
							rules.maxHeight,
							rules.heightStep,
							heightValue,
							setHeight
						)}
					{/if}

					{#if entry.presets.length > 0}
						<div class="row preset-row" role="group" aria-label="Size presets">
							<span>Presets</span>
							<div class="preset-buttons">
								{#each entry.presets as preset (preset.id)}
									<button
										type="button"
										data-testid="furniture-preset-{preset.id}"
										onclick={() => applyPreset(preset.width, preset.depth, preset.height)}
										>{preset.name}</button
									>
								{/each}
							</div>
						</div>
					{/if}

					{#if hasBackrest}
						<div class="row direction-row" role="group" aria-labelledby="furniture-backrest-label">
							<span id="furniture-backrest-label">Backrest</span>
							<button
								type="button"
								data-testid="furniture-backrest-on"
								aria-pressed={backrest}
								onclick={() => setBackrest(true)}>On</button
							>
							<button
								type="button"
								data-testid="furniture-backrest-off"
								aria-pressed={!backrest}
								onclick={() => setBackrest(false)}>Off</button
							>
						</div>
					{/if}

					{#if hasHeadboard}
						<div class="row direction-row" role="group" aria-labelledby="furniture-headboard-label">
							<span id="furniture-headboard-label">Headboard</span>
							<button
								type="button"
								data-testid="furniture-headboard-on"
								aria-pressed={headboard}
								onclick={() => setHeadboard(true)}>On</button
							>
							<button
								type="button"
								data-testid="furniture-headboard-off"
								aria-pressed={!headboard}
								onclick={() => setHeadboard(false)}>Off</button
							>
						</div>
					{/if}

					{#if shelfRules}
						<div class="row">
							<label for="furniture-shelf-count">{shelfRules.label}</label>
							<input
								id="furniture-shelf-count"
								data-testid="furniture-shelf-count"
								type="range"
								min={shelfRules.min}
								max={shelfRules.max}
								step="1"
								value={shelfCount}
								oninput={(event) => setShelfCount(Number(event.currentTarget.value))}
							/>
							<input
								type="number"
								data-testid="furniture-shelf-count-number"
								min={shelfRules.min}
								max={shelfRules.max}
								step="1"
								aria-label="{shelfRules.label} count"
								value={shelfCount}
								onchange={(event) => setShelfCount(Number(event.currentTarget.value))}
							/>
						</div>
					{/if}

					<div class="row color-row">
						<label for="furniture-primary-color">Primary</label>
						<input
							id="furniture-primary-color"
							data-testid="furniture-primary-color"
							type="color"
							value={primaryColor}
							oninput={(event) => setPrimaryColor(event.currentTarget.value)}
						/>
						<span class="hex">{primaryColor}</span>
					</div>
					<div class="row color-row">
						<label for="furniture-secondary-color">Secondary</label>
						<input
							id="furniture-secondary-color"
							data-testid="furniture-secondary-color"
							type="color"
							value={secondaryColor}
							oninput={(event) => setSecondaryColor(event.currentTarget.value)}
						/>
						<span class="hex">{secondaryColor}</span>
					</div>
				</div>
			</div>
		</div>
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
		width: min(1100px, 96vw);
		max-height: min(920px, 94vh);
		overflow: auto;
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
	button[aria-pressed='true'] {
		background: #2d5a40;
		border-color: #7ec89a;
	}
	.toolbar {
		display: grid;
		gap: 0.75rem;
		margin: 1rem 0 0.4rem;
	}
	.toolbar input[type='search'] {
		width: 100%;
		box-sizing: border-box;
	}
	.recent-label,
	.category h3 {
		margin: 0 0 0.4rem;
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #a0d9b7;
	}
	.recent-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.catalogue-body {
		display: grid;
		grid-template-columns: minmax(16rem, 1fr) minmax(16rem, 20rem);
		gap: 1rem;
		align-items: start;
		margin: 0.8rem 0 0;
	}
	@media (max-width: 900px) {
		.catalogue-body {
			grid-template-columns: 1fr;
		}
	}
	.catalogue-list {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}
	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(7.2rem, 1fr));
		gap: 0.45rem;
	}
	.card {
		min-height: 3.2rem;
		text-align: left;
	}
	.card-name {
		display: block;
		font-size: 13px;
		line-height: 1.3;
	}
	.inspector {
		display: grid;
		gap: 0.7rem;
		min-width: 0;
	}
	.selected-name {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
	}
	.fields {
		display: grid;
		gap: 0.7rem;
		min-width: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 5.6rem 1fr 4.4rem;
		align-items: center;
		gap: 0.45rem;
	}
	.row label,
	.direction-row span,
	.preset-row span {
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
	.direction-row {
		grid-template-columns: 5.6rem 1fr 1fr;
	}
	.preset-row {
		grid-template-columns: 5.6rem 1fr;
		align-items: start;
	}
	.preset-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.color-row {
		grid-template-columns: 5.6rem auto 1fr;
	}
	.color-row input[type='color'] {
		width: 2.4rem;
		height: 2rem;
		padding: 0.12rem;
		cursor: pointer;
	}
	.hex {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-variant-numeric: tabular-nums;
		font-size: 12px;
		color: #a0d9b7;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.hint,
	.empty {
		margin: 0;
		font-size: 12px;
		color: #a0d9b7;
	}
</style>
