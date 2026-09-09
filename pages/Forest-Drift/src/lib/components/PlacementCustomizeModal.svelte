<script lang="ts">
	import {
		createDefaultBuildingSettings,
		isFloorDetailTool,
		PLACEMENT_CUSTOMIZE_LIMITS,
		type BuildingSettings,
		type CustomizablePlacementToolId
	} from '$lib/game/building/FoundationTypes';
	import {
		defaultFloorDetailColors,
		type FloorDetailKind
	} from '$lib/game/building/FloorDetailTypes';
	import PlacementPreviewPane from './PlacementPreviewPane.svelte';

	let {
		toolId,
		settings,
		onClose
	}: {
		toolId: CustomizablePlacementToolId;
		settings: BuildingSettings;
		onClose: () => void;
	} = $props();

	type SizeKey = keyof typeof PLACEMENT_CUSTOMIZE_LIMITS;
	type ColorKey = 'windowColor' | 'doorColor' | 'beamColor' | 'stairColor';

	const defaults = createDefaultBuildingSettings();
	const FLOOR_DETAIL_TITLES: Record<FloorDetailKind, string> = {
		carpet: 'Customise Carpet',
		path: 'Customise Path',
		planks: 'Customise Planks',
		tiles: 'Customise Tiles'
	};

	let revision = $state(0);
	let resetEpoch = $state(0);
	let isWall = $derived(toolId === 'wall' || toolId === 'polygon-wall');
	let isOpening = $derived(toolId === 'window' || toolId === 'door');
	let isFloorDetail = $derived(isFloorDetailTool(toolId));
	let isStairs = $derived(toolId === 'stairs');
	let floorKind: FloorDetailKind | null = $derived(
		toolId === 'floor-carpet'
			? 'carpet'
			: toolId === 'floor-path'
				? 'path'
				: toolId === 'floor-planks'
					? 'planks'
					: toolId === 'floor-tiles'
						? 'tiles'
						: null
	);
	let orientation = $derived.by(() => {
		void revision;
		return settings.beamOrientation === 'horizontal' ? 'horizontal' : 'vertical';
	});
	let title = $derived(
		floorKind
			? FLOOR_DETAIL_TITLES[floorKind]
			: toolId === 'window'
				? 'Customise Window'
				: toolId === 'door'
					? 'Customise Door'
					: isWall
						? 'Customise Wall'
						: isStairs
							? 'Customise Stairs'
							: 'Customise Beam'
	);
	let widthKey: SizeKey = $derived(
		toolId === 'door'
			? 'doorWidth'
			: toolId === 'beam'
				? orientation === 'horizontal'
					? 'beamWidth'
					: 'beamHeight'
				: isWall
					? 'wallThickness'
					: 'windowWidth'
	);
	let heightKey: SizeKey = $derived(
		toolId === 'beam'
			? 'beamHeight'
			: toolId === 'door'
				? 'doorHeight'
				: isWall
					? 'wallHeight'
					: 'windowHeight'
	);
	let sillKey: SizeKey = $derived(toolId === 'door' ? 'doorSillHeight' : 'windowSillHeight');
	let sillLabel = $derived(toolId === 'door' ? 'From floor' : 'Sill');
	let colorKey: ColorKey = $derived(
		toolId === 'door'
			? 'doorColor'
			: toolId === 'beam'
				? 'beamColor'
				: isStairs
					? 'stairColor'
					: 'windowColor'
	);
	let showHeight = $derived(toolId !== 'beam' || orientation === 'horizontal');
	let hint = $derived(
		isFloorDetail
			? 'E or Esc to close — applies to the next piece you place.'
			: isStairs
				? 'E or Esc to close — colour, framing, railings, hole, and hole framing apply to the next stair you place.'
				: isWall
					? 'E or Esc to close — height and width apply to the next wall you place. Length still comes from your clicks.'
					: toolId === 'beam' && orientation === 'vertical'
						? 'E or Esc to close — a vertical beam spans the wall. R flips to horizontal.'
						: isOpening
							? 'E or Esc to close — width, height, and sill apply to the next piece you place.'
							: 'E or Esc to close — sizes apply to the next piece you place.'
	);
	let widthDisplay = $derived.by(() => {
		void revision;
		return Number(settings[widthKey]).toFixed(2);
	});
	let heightDisplay = $derived.by(() => {
		void revision;
		return Number(settings[heightKey]).toFixed(2);
	});
	let colorDisplay = $derived.by(() => {
		void revision;
		return settings[colorKey];
	});
	let widthAtDefault = $derived.by(() => {
		void revision;
		return nearlyEqual(settings[widthKey], defaults[widthKey]);
	});
	let heightAtDefault = $derived.by(() => {
		void revision;
		return nearlyEqual(settings[heightKey], defaults[heightKey]);
	});
	let sillDisplay = $derived.by(() => {
		void revision;
		return Number(settings[sillKey]).toFixed(2);
	});
	let sillAtDefault = $derived.by(() => {
		void revision;
		return nearlyEqual(settings[sillKey], defaults[sillKey]);
	});
	let colorAtDefault = $derived.by(() => {
		void revision;
		return settings[colorKey].toUpperCase() === defaults[colorKey].toUpperCase();
	});
	let orientationAtDefault = $derived.by(() => {
		void revision;
		return orientation === defaults.beamOrientation;
	});
	let renderMode = $derived.by(() => {
		void revision;
		return settings.floorDetailRenderMode === '2d' ? '2d' : '3d';
	});
	let renderModeAtDefault = $derived.by(() => {
		void revision;
		return renderMode === '3d';
	});
	let colorADisplay = $derived.by(() => {
		void revision;
		return settings.floorDetailColorA;
	});
	let colorBDisplay = $derived.by(() => {
		void revision;
		return settings.floorDetailColorB;
	});
	let colorAAtDefault = $derived.by(() => {
		void revision;
		if (!floorKind) return true;
		return (
			settings.floorDetailColorA.toUpperCase() ===
			defaultFloorDetailColors(floorKind)[0].toUpperCase()
		);
	});
	let colorBAtDefault = $derived.by(() => {
		void revision;
		if (!floorKind) return true;
		return (
			settings.floorDetailColorB.toUpperCase() ===
			defaultFloorDetailColors(floorKind)[1].toUpperCase()
		);
	});
	let plankWidthDisplay = $derived.by(() => {
		void revision;
		return Number(settings.floorDetailPlankWidth).toFixed(2);
	});
	let plankWidthAtDefault = $derived.by(() => {
		void revision;
		return nearlyEqual(settings.floorDetailPlankWidth, defaults.floorDetailPlankWidth);
	});
	let plankDirection = $derived.by(() => {
		void revision;
		return settings.floorDetailPlankDirection === 'z' ? 'z' : 'x';
	});
	let plankDirectionAtDefault = $derived.by(() => {
		void revision;
		return plankDirection === defaults.floorDetailPlankDirection;
	});
	let tileSizeDisplay = $derived.by(() => {
		void revision;
		return Number(settings.floorDetailTileSize).toFixed(2);
	});
	let tileSizeAtDefault = $derived.by(() => {
		void revision;
		return nearlyEqual(settings.floorDetailTileSize, defaults.floorDetailTileSize);
	});
	let tilePattern = $derived.by(() => {
		void revision;
		return settings.floorDetailTilePattern;
	});
	let tilePatternAtDefault = $derived.by(() => {
		void revision;
		return tilePattern === 'checker';
	});
	let pathWidthDisplay = $derived.by(() => {
		void revision;
		return Number(settings.floorDetailPathWidth).toFixed(2);
	});
	let pathWidthAtDefault = $derived.by(() => {
		void revision;
		return nearlyEqual(settings.floorDetailPathWidth, defaults.floorDetailPathWidth);
	});
	let pathFraming = $derived.by(() => {
		void revision;
		return settings.floorDetailPathFraming;
	});
	let pathFramingAtDefault = $derived.by(() => {
		void revision;
		return pathFraming === true;
	});
	let stairFrameEnabled = $derived.by(() => {
		void revision;
		return settings.stairFrameEnabled;
	});
	let stairFrameAtDefault = $derived.by(() => {
		void revision;
		return stairFrameEnabled === true;
	});
	let stairRailingsEnabled = $derived.by(() => {
		void revision;
		return settings.stairRailingsEnabled;
	});
	let stairRailingsAtDefault = $derived.by(() => {
		void revision;
		return stairRailingsEnabled === true;
	});
	let stairOpeningEnabled = $derived.by(() => {
		void revision;
		return settings.stairOpeningEnabled;
	});
	let stairOpeningAtDefault = $derived.by(() => {
		void revision;
		return stairOpeningEnabled === true;
	});
	let slabOpeningFrameEnabled = $derived.by(() => {
		void revision;
		return settings.slabOpeningFrameEnabled;
	});
	let slabOpeningFrameAtDefault = $derived.by(() => {
		void revision;
		return slabOpeningFrameEnabled === true;
	});

	function bump() {
		revision += 1;
	}

	function nearlyEqual(value: number, expected: number): boolean {
		return Math.abs(value - expected) < 1e-6;
	}

	function clampField(value: number, limits: { min: number; max: number }): number {
		if (typeof value !== 'number' || !Number.isFinite(value)) return limits.min;
		return Math.min(limits.max, Math.max(limits.min, value));
	}

	function applySize(key: SizeKey) {
		settings[key] = clampField(settings[key], PLACEMENT_CUSTOMIZE_LIMITS[key]);
		bump();
	}

	function resetSize(key: SizeKey) {
		settings[key] = defaults[key];
		resetEpoch += 1;
		bump();
	}

	function resetColor() {
		settings[colorKey] = defaults[colorKey];
		resetEpoch += 1;
		bump();
	}

	function resetOrientation() {
		settings.beamOrientation = defaults.beamOrientation;
		bump();
	}

	function resetRenderMode() {
		settings.floorDetailRenderMode = '3d';
		bump();
	}

	function resetFloorColorA() {
		if (!floorKind) return;
		settings.floorDetailColorA = defaultFloorDetailColors(floorKind)[0];
		resetEpoch += 1;
		bump();
	}

	function resetFloorColorB() {
		if (!floorKind) return;
		settings.floorDetailColorB = defaultFloorDetailColors(floorKind)[1];
		resetEpoch += 1;
		bump();
	}

	function resetPlankDirection() {
		settings.floorDetailPlankDirection = defaults.floorDetailPlankDirection;
		bump();
	}

	function resetTilePattern() {
		settings.floorDetailTilePattern = 'checker';
		bump();
	}

	function resetPathFraming() {
		settings.floorDetailPathFraming = true;
		bump();
	}

	function resetStairFrame() {
		settings.stairFrameEnabled = defaults.stairFrameEnabled;
		bump();
	}

	function resetStairRailings() {
		settings.stairRailingsEnabled = defaults.stairRailingsEnabled;
		bump();
	}

	function resetStairOpening() {
		settings.stairOpeningEnabled = defaults.stairOpeningEnabled;
		bump();
	}

	function resetStairOpeningFrame() {
		settings.slabOpeningFrameEnabled = defaults.slabOpeningFrameEnabled;
		bump();
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
		aria-labelledby="placement-customize-title"
		data-testid="placement-customize-modal"
	>
		<header>
			<div>
				<p class="eyebrow">BUILD MODE</p>
				<h2 id="placement-customize-title">{title}</h2>
			</div>
			<button aria-label="Close customise" onclick={onClose}>✕</button>
		</header>

		<div class="placement-body">
			{#key `${toolId}-${orientation}`}
				<div class="fields">
					{#snippet resetControl(
						testId: string,
						fieldLabel: string,
						atDefault: boolean,
						onReset: () => void
					)}
						<button
							type="button"
							class="reset"
							data-testid={testId}
							aria-label={`Reset ${fieldLabel} to default`}
							disabled={atDefault}
							onclick={onReset}>Reset</button
						>
					{/snippet}

					{#snippet sizeRow(
						inputId: string,
						testId: string,
						label: string,
						key: SizeKey,
						atDefault: boolean,
						display: string
					)}
						{@const limits = PLACEMENT_CUSTOMIZE_LIMITS[key]}
						{@const numericValue = Number(display)}
						<div class="row">
							<label for={inputId}>{label}</label>
							{#key `${key}-${resetEpoch}`}
								<input
									id={inputId}
									data-testid={testId}
									type="range"
									min={limits.min}
									max={limits.max}
									step={limits.step}
									value={numericValue}
									oninput={(event) => {
										settings[key] = Number(event.currentTarget.value);
										bump();
									}}
								/>
								<input
									type="number"
									data-testid={`${testId}-number`}
									min={limits.min}
									max={limits.max}
									step={limits.step}
									aria-label={`${label} in metres`}
									value={numericValue}
									onchange={(event) => {
										settings[key] = Number(event.currentTarget.value);
										applySize(key);
									}}
								/>
							{/key}
							<span class="metres">{display} m</span>
							{@render resetControl(`${testId}-reset`, label, atDefault, () => resetSize(key))}
						</div>
					{/snippet}

					{#snippet colorField(
						inputId: string,
						testId: string,
						label: string,
						key: ColorKey | 'floorDetailColorA' | 'floorDetailColorB',
						display: string,
						atDefault: boolean,
						onReset: () => void
					)}
						<div class="row color-row">
							<label for={inputId}>{label}</label>
							{#key `${key}-${resetEpoch}`}
								<input
									id={inputId}
									data-testid={testId}
									type="color"
									bind:value={settings[key]}
									oninput={bump}
								/>
							{/key}
							<span class="hex">{display}</span>
							{@render resetControl(`${testId}-reset`, label, atDefault, onReset)}
						</div>
					{/snippet}

					{#if isFloorDetail}
						<div class="row direction-row" role="group" aria-labelledby="floor-render-label">
							<span id="floor-render-label">Render</span>
							<button
								type="button"
								data-testid="placement-render-3d"
								aria-pressed={renderMode === '3d'}
								onclick={() => {
									settings.floorDetailRenderMode = '3d';
									bump();
								}}>3D</button
							>
							<button
								type="button"
								data-testid="placement-render-2d"
								aria-pressed={renderMode === '2d'}
								onclick={() => {
									settings.floorDetailRenderMode = '2d';
									bump();
								}}>2D</button
							>
							{@render resetControl(
								'placement-reset-render',
								'Render',
								renderModeAtDefault,
								resetRenderMode
							)}
						</div>

						{@render colorField(
							'placement-color-a',
							'placement-color-a',
							'Colour 1',
							'floorDetailColorA',
							colorADisplay,
							colorAAtDefault,
							resetFloorColorA
						)}
						{@render colorField(
							'placement-color-b',
							'placement-color-b',
							'Colour 2',
							'floorDetailColorB',
							colorBDisplay,
							colorBAtDefault,
							resetFloorColorB
						)}

						{#if floorKind === 'planks'}
							{@render sizeRow(
								'placement-plank-width',
								'placement-plank-width',
								'Width',
								'floorDetailPlankWidth',
								plankWidthAtDefault,
								plankWidthDisplay
							)}
							<div class="row direction-row" role="group" aria-labelledby="plank-direction-label">
								<span id="plank-direction-label">Direction</span>
								<button
									type="button"
									data-testid="placement-plank-dir-x"
									aria-pressed={plankDirection === 'x'}
									onclick={() => {
										settings.floorDetailPlankDirection = 'x';
										bump();
									}}>X</button
								>
								<button
									type="button"
									data-testid="placement-plank-dir-z"
									aria-pressed={plankDirection === 'z'}
									onclick={() => {
										settings.floorDetailPlankDirection = 'z';
										bump();
									}}>Z</button
								>
								{@render resetControl(
									'placement-reset-plank-direction',
									'Direction',
									plankDirectionAtDefault,
									resetPlankDirection
								)}
							</div>
						{/if}

						{#if floorKind === 'tiles'}
							{@render sizeRow(
								'placement-tile-size',
								'placement-tile-size',
								'Size',
								'floorDetailTileSize',
								tileSizeAtDefault,
								tileSizeDisplay
							)}
							<div class="row pattern-row" role="group" aria-labelledby="tile-pattern-label">
								<span id="tile-pattern-label">Pattern</span>
								<button
									type="button"
									data-testid="placement-pattern-solid"
									aria-pressed={tilePattern === 'solid'}
									onclick={() => {
										settings.floorDetailTilePattern = 'solid';
										bump();
									}}>Solid</button
								>
								<button
									type="button"
									data-testid="placement-pattern-checker"
									aria-pressed={tilePattern === 'checker'}
									onclick={() => {
										settings.floorDetailTilePattern = 'checker';
										bump();
									}}>Checker</button
								>
								<button
									type="button"
									data-testid="placement-pattern-diamond"
									aria-pressed={tilePattern === 'diamond'}
									onclick={() => {
										settings.floorDetailTilePattern = 'diamond';
										bump();
									}}>Diamond</button
								>
								<button
									type="button"
									data-testid="placement-pattern-running-bond"
									aria-pressed={tilePattern === 'running-bond'}
									onclick={() => {
										settings.floorDetailTilePattern = 'running-bond';
										bump();
									}}>Running bond</button
								>
								{@render resetControl(
									'placement-reset-pattern',
									'Pattern',
									tilePatternAtDefault,
									resetTilePattern
								)}
							</div>
						{/if}

						{#if floorKind === 'path'}
							{@render sizeRow(
								'placement-path-width',
								'placement-path-width',
								'Width',
								'floorDetailPathWidth',
								pathWidthAtDefault,
								pathWidthDisplay
							)}
							<div class="row direction-row" role="group" aria-labelledby="path-framing-label">
								<span id="path-framing-label">Framing</span>
								<button
									type="button"
									data-testid="placement-framing-on"
									aria-pressed={pathFraming}
									onclick={() => {
										settings.floorDetailPathFraming = true;
										bump();
									}}>On</button
								>
								<button
									type="button"
									data-testid="placement-framing-off"
									aria-pressed={!pathFraming}
									onclick={() => {
										settings.floorDetailPathFraming = false;
										bump();
									}}>Off</button
								>
								{@render resetControl(
									'placement-reset-framing',
									'Framing',
									pathFramingAtDefault,
									resetPathFraming
								)}
							</div>
						{/if}
					{:else if isStairs}
						{@render colorField(
							'placement-color',
							'placement-color',
							'Colour',
							'stairColor',
							colorDisplay,
							colorAtDefault,
							resetColor
						)}
						<div class="row direction-row" role="group" aria-labelledby="stair-frame-label">
							<span id="stair-frame-label">Framing</span>
							<button
								type="button"
								data-testid="placement-stair-frame-on"
								aria-pressed={stairFrameEnabled}
								onclick={() => {
									settings.stairFrameEnabled = true;
									bump();
								}}>On</button
							>
							<button
								type="button"
								data-testid="placement-stair-frame-off"
								aria-pressed={!stairFrameEnabled}
								onclick={() => {
									settings.stairFrameEnabled = false;
									bump();
								}}>Off</button
							>
							{@render resetControl(
								'placement-reset-stair-frame',
								'Framing',
								stairFrameAtDefault,
								resetStairFrame
							)}
						</div>
						<div class="row direction-row" role="group" aria-labelledby="stair-railings-label">
							<span id="stair-railings-label">Railings</span>
							<button
								type="button"
								data-testid="placement-stair-railings-on"
								aria-pressed={stairRailingsEnabled}
								onclick={() => {
									settings.stairRailingsEnabled = true;
									bump();
								}}>On</button
							>
							<button
								type="button"
								data-testid="placement-stair-railings-off"
								aria-pressed={!stairRailingsEnabled}
								onclick={() => {
									settings.stairRailingsEnabled = false;
									bump();
								}}>Off</button
							>
							{@render resetControl(
								'placement-reset-stair-railings',
								'Railings',
								stairRailingsAtDefault,
								resetStairRailings
							)}
						</div>
						<div class="row direction-row" role="group" aria-labelledby="stair-opening-label">
							<span id="stair-opening-label">Hole</span>
							<button
								type="button"
								data-testid="placement-stair-opening-on"
								aria-pressed={stairOpeningEnabled}
								onclick={() => {
									settings.stairOpeningEnabled = true;
									bump();
								}}>On</button
							>
							<button
								type="button"
								data-testid="placement-stair-opening-off"
								aria-pressed={!stairOpeningEnabled}
								onclick={() => {
									settings.stairOpeningEnabled = false;
									bump();
								}}>Off</button
							>
							{@render resetControl(
								'placement-reset-stair-opening',
								'Hole',
								stairOpeningAtDefault,
								resetStairOpening
							)}
						</div>
						<div class="row direction-row" role="group" aria-labelledby="stair-opening-frame-label">
							<span id="stair-opening-frame-label">Hole framing</span>
							<button
								type="button"
								data-testid="placement-stair-opening-frame-on"
								aria-pressed={slabOpeningFrameEnabled}
								onclick={() => {
									settings.slabOpeningFrameEnabled = true;
									bump();
								}}>On</button
							>
							<button
								type="button"
								data-testid="placement-stair-opening-frame-off"
								aria-pressed={!slabOpeningFrameEnabled}
								onclick={() => {
									settings.slabOpeningFrameEnabled = false;
									bump();
								}}>Off</button
							>
							{@render resetControl(
								'placement-reset-stair-opening-frame',
								'Hole framing',
								slabOpeningFrameAtDefault,
								resetStairOpeningFrame
							)}
						</div>
					{:else}
						{#if toolId === 'beam'}
							<div class="row direction-row" role="group" aria-labelledby="beam-orientation-label">
								<span id="beam-orientation-label">Direction</span>
								<button
									type="button"
									data-testid="beam-orientation-vertical"
									aria-pressed={orientation === 'vertical'}
									onclick={() => {
										settings.beamOrientation = 'vertical';
										bump();
									}}>Vertical</button
								>
								<button
									type="button"
									data-testid="beam-orientation-horizontal"
									aria-pressed={orientation === 'horizontal'}
									onclick={() => {
										settings.beamOrientation = 'horizontal';
										bump();
									}}>Horizontal</button
								>
								{@render resetControl(
									'placement-reset-direction',
									'Direction',
									orientationAtDefault,
									resetOrientation
								)}
							</div>
						{/if}

						{@render sizeRow(
							'placement-width',
							'placement-width',
							'Width',
							widthKey,
							widthAtDefault,
							widthDisplay
						)}
						{#if showHeight}
							{@render sizeRow(
								'placement-height',
								'placement-height',
								'Height',
								heightKey,
								heightAtDefault,
								heightDisplay
							)}
						{/if}
						{#if isOpening}
							{@render sizeRow(
								'placement-sill',
								'placement-sill',
								sillLabel,
								sillKey,
								sillAtDefault,
								sillDisplay
							)}
						{/if}

						{#if !isWall}
							{@render colorField(
								'placement-color',
								'placement-color',
								'Colour',
								colorKey,
								colorDisplay,
								colorAtDefault,
								resetColor
							)}
						{/if}
					{/if}
				</div>
			{/key}

			<PlacementPreviewPane {toolId} {settings} {revision} />
		</div>

		<p class="hint">{hint}</p>
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
		width: min(920px, 96vw);
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
		min-width: 0;
	}
	.placement-body {
		display: grid;
		grid-template-columns: minmax(16rem, 1fr) minmax(14rem, 18rem);
		gap: 1rem;
		align-items: stretch;
		margin: 1rem 0 0.8rem;
	}
	@media (max-width: 720px) {
		.placement-body {
			grid-template-columns: 1fr;
		}
	}
	.row {
		display: grid;
		grid-template-columns: 5.2rem 1fr 4.4rem 3.2rem auto;
		align-items: center;
		gap: 0.45rem;
	}
	.row label,
	.direction-row span,
	.pattern-row span {
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
	.metres,
	.hex {
		font-variant-numeric: tabular-nums;
		font-size: 12px;
		color: #a0d9b7;
		white-space: nowrap;
	}
	.color-row {
		grid-template-columns: 5.2rem auto 1fr auto;
	}
	.direction-row {
		grid-template-columns: 5.2rem 1fr 1fr auto;
	}
	.pattern-row {
		grid-template-columns: 5.2rem 1fr 1fr 1fr 1fr auto;
	}
	.color-row input[type='color'] {
		width: 2.4rem;
		height: 2rem;
		padding: 0.12rem;
		cursor: pointer;
	}
	.hex {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.hint {
		margin: 0.2rem 0 0;
		font-size: 12px;
		color: #a0d9b7;
	}
</style>
