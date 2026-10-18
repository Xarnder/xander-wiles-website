<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import {
		CreatureLab,
		DEFAULT_LAB_TUNING,
		type CreatureLabMode,
		type CreatureLabSurface,
		type CreatureLabTuning,
		type CreatureSurfaceDebugView
	} from '../game/creatures/CreatureLab';
	import {
		ACCENT_REGIONS,
		PATTERN_TYPES
	} from '../game/creatures/surface/CreaturePatternGenerator';
	import type {
		BodyPlanId,
		CreatureDefinition,
		CreatureLod
	} from '../game/creatures/CreatureTypes';
	import {
		DEFAULT_GROUNDING_DEBUG,
		DEFAULT_LAB_TERRAIN,
		type GroundingDebugFlags,
		type LabTerrainSettings
	} from '../game/creatures/CreatureLabTerrain';
	let {
		onClose,
		onPlace,
		expose = false
	}: {
		onClose: () => void;
		onPlace?: (definition: CreatureDefinition) => void;
		/** Publish the lab as `window.creatureLab` for tests and dev tooling. */
		expose?: boolean;
	} = $props();
	// Generator tuning, CURRENT/IMPROVED comparison and attachment debugging are developer tools.
	const developer = $derived(dev || expose || new URLSearchParams(location.search).has('dev'));
	let viewport: HTMLDivElement;
	let lab: CreatureLab;
	let speciesSeed = $state(42),
		individualSeed = $state(7),
		plan = $state<BodyPlanId>('quadruped'),
		scale = $state(1),
		lod = $state<CreatureLod>(0),
		gait = $state<'idle' | 'walk' | 'run'>('walk'),
		mode = $state<CreatureLabMode>('improved');
	const toggleKeys = [
		'wireframe',
		'skeleton',
		'collision',
		'chains',
		'crossSections',
		'anchors',
		'weights'
	] as const;
	const debugKeys = ['limbRoots', 'attachmentVolumes', 'jointFrames'] as const;
	const toggles = $state<Record<string, boolean>>({});
	const terrain = $state<LabTerrainSettings>({ ...DEFAULT_LAB_TERRAIN });
	const groundDebug = $state<GroundingDebugFlags>({ ...DEFAULT_GROUNDING_DEBUG });
	let groundingEnabled = $state(true);
	function applyTerrain() {
		lab.groundingEnabled = groundingEnabled;
		lab.setTerrain({ ...terrain });
	}
	const tuning = $state<CreatureLabTuning>({ ...DEFAULT_LAB_TUNING });
	const tuningLabels: Record<keyof CreatureLabTuning, string> = {
		limbRootPenetration: 'Limb root penetration',
		shoulderMass: 'Shoulder mass',
		hipMass: 'Hip mass',
		limbTaper: 'Limb taper',
		jointScale: 'Joint scale',
		headScale: 'Head scale',
		eyeScale: 'Eye scale',
		muzzleScale: 'Muzzle scale'
	};
	let error = $state(''),
		report = $state(''),
		busy = $state(false),
		name = $state(''),
		stats = $state('');
	// SURFACE panel: unset values keep the generated recipe; a slider only overrides once moved.
	const surface = $state<CreatureLabSurface>({});
	let surfaceDebug = $state<CreatureSurfaceDebugView>('none');
	const surfaceSliders: {
		key:
			| 'spotDensity'
			| 'spotScale'
			| 'stripeFrequency'
			| 'mottleScale'
			| 'underbellyWidth'
			| 'underbellyBrightness'
			| 'roughness';
		label: string;
		min: number;
		max: number;
		step: number;
		fallback: number;
	}[] = [
		{ key: 'spotDensity', label: 'Spot density', min: 0.05, max: 0.6, step: 0.01, fallback: 0.3 },
		{ key: 'spotScale', label: 'Spot scale', min: 1, max: 6, step: 0.1, fallback: 3 },
		{ key: 'stripeFrequency', label: 'Stripe frequency', min: 1, max: 16, step: 0.5, fallback: 6 },
		{ key: 'mottleScale', label: 'Mottle scale', min: 0.5, max: 3, step: 0.1, fallback: 1.6 },
		{
			key: 'underbellyWidth',
			label: 'Underbelly width',
			min: 0,
			max: 0.6,
			step: 0.01,
			fallback: 0.28
		},
		{
			key: 'underbellyBrightness',
			label: 'Underbelly brightness',
			min: 0,
			max: 0.2,
			step: 0.01,
			fallback: 0.04
		},
		{ key: 'roughness', label: 'Roughness', min: 0.3, max: 1, step: 0.01, fallback: 0.8 }
	];
	const surfaceDebugViews: CreatureSurfaceDebugView[] = [
		'none',
		'regionIds',
		'longitudinal',
		'radial',
		'underbelly',
		'primaryMask',
		'secondaryMask',
		'accent'
	];
	function applySurface() {
		lab.surfaceOverride = $state.snapshot(surface) as CreatureLabSurface;
		lab.surfaceDebug = surfaceDebug;
		generate();
	}
	function generate() {
		try {
			lab.tuning = { ...tuning };
			lab.surfaceOverride = $state.snapshot(surface) as CreatureLabSurface;
			lab.surfaceDebug = surfaceDebug;
			const d = lab.generate(speciesSeed, individualSeed, plan, scale, lod);
			name = `${d.species.name} · ${d.species.anatomy.signatureTraits.slice(1, -1).join(' · ')}`;
			error = '';
		} catch (e) {
			error = String(e);
		}
	}
	async function changeMode() {
		busy = true;
		try {
			await lab.setMode(mode);
			generate();
		} finally {
			busy = false;
		}
	}
	function overlays() {
		Object.assign(lab, toggles);
		lab.updateHelpers();
	}
	async function sample() {
		busy = true;
		try {
			report = JSON.stringify(await lab.sample(100, plan), null, 2);
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		lab = new CreatureLab(viewport);
		const testWindow = window as unknown as { creatureLab?: CreatureLab };
		if (expose || new URLSearchParams(location.search).has('musicTest'))
			testWindow.creatureLab = lab;
		generate();
		const timer = setInterval(() => {
			const t = lab.telemetry;
			stats = `${t.vertices.toLocaleString()} vertices · ${t.triangles.toLocaleString()} triangles · ${t.bones} bones · ${t.compileMs.toFixed(1)} ms compile · ${t.animationMs.toFixed(2)} ms animation · ${t.fps.toFixed(0)} FPS${developer && lab.mode === 'improved' ? ` · ${t.issues} anatomy issues` : ''}${developer && lab.groundingEnabled ? ` · slope ${t.slope.toFixed(1)}° pitch ${t.pitch.toFixed(1)}° roll ${t.roll.toFixed(1)}° · ${t.supportLegs} support (${t.support})${t.canStand ? '' : ' · TOO STEEP'} · ${t.surfaceSamples} samples` : ''}`;
		}, 500);
		return () => {
			clearInterval(timer);
			lab.dispose();
			delete testWindow.creatureLab;
		};
	});
</script>

<div data-ui-backdrop class="backdrop">
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Creature Lab"
		tabindex="-1"
		data-ui-surface="panel"
		class="lab"
		data-testid="creature-lab"
	>
		<header>
			<div>
				<small>FIELD RESEARCH / GENERATOR V1</small>
				<h2>Creature Lab</h2>
				<p>{name || 'An original species, grown from a seed.'}</p>
			</div>
			<button onclick={onClose} aria-label="Close Creature Lab">Close</button>
		</header>
		<div class="content">
			<aside>
				<label
					>Species seed<input
						data-testid="species-seed"
						type="number"
						bind:value={speciesSeed}
					/></label
				><button onclick={generate}>Regenerate Species</button>
				<label
					>Individual seed<input
						data-testid="individual-seed"
						type="number"
						bind:value={individualSeed}
					/></label
				><button onclick={generate}>Regenerate Individual</button>
				<div class="pair">
					<button
						onclick={() => {
							speciesSeed = (speciesSeed + 2654435761) >>> 0;
							generate();
						}}>Random Species</button
					><button
						onclick={() => {
							individualSeed = (individualSeed + 2246822519) >>> 0;
							generate();
						}}>Random Individual</button
					>
				</div>
				<label
					>Body Plan<select data-testid="creature-plan" bind:value={plan} onchange={generate}
						><option value="quadruped">Quadruped</option><option value="biped">Biped</option><option
							value="hexapod">Hexapod</option
						><option value="serpentine">Serpentine</option></select
					></label
				>
				<label
					>Scale<input
						type="range"
						min="0.2"
						max="4"
						step="0.1"
						bind:value={scale}
						onchange={generate}
					/></label
				>
				<label
					>Geometry<select data-testid="creature-lod" bind:value={lod} onchange={generate}
						><option value={0}>LOD0 / near</option><option value={1}>LOD1 / medium</option><option
							value={2}>LOD2 / far</option
						></select
					></label
				>
				<label
					>Movement<select bind:value={gait} onchange={() => (lab.gait = gait)}
						><option value="idle">Idle / look</option><option value="walk">Walk</option><option
							value="run">Run / flee</option
						></select
					></label
				>
				<div class="toggles">
					{#each toggleKeys as key (key)}<label
							><input type="checkbox" bind:checked={toggles[key]} onchange={overlays} />{key}</label
						>{/each}
				</div>
				{#if developer}
					<fieldset data-testid="creature-developer">
						<legend>Generator (developer)</legend>
						<label
							>Generator<select
								data-testid="creature-mode"
								bind:value={mode}
								onchange={changeMode}
								disabled={busy}
								><option value="improved">IMPROVED</option><option value="current"
									>CURRENT (pre-rewrite)</option
								></select
							></label
						>
						<div class="toggles">
							{#each debugKeys as key (key)}<label
									><input
										type="checkbox"
										data-testid={`creature-debug-${key}`}
										bind:checked={toggles[key]}
										onchange={overlays}
									/>{key}</label
								>{/each}
						</div>
						{#each Object.keys(tuningLabels) as key (key)}
							{@const k = key as keyof CreatureLabTuning}
							<label
								>{tuningLabels[k]} ×{tuning[k].toFixed(2)}<input
									type="range"
									min={k === 'limbRootPenetration' ? 0 : 0.4}
									max="2"
									step="0.05"
									bind:value={tuning[k]}
									onchange={generate}
								/></label
							>
						{/each}
						<label
							>Test ground<select
								data-testid="creature-terrain"
								bind:value={terrain.kind}
								onchange={applyTerrain}
								><option value="flat">Flat</option><option value="ramp">Ramp</option><option
									value="uneven">Uneven</option
								><option value="platform">Ramp + foundation slab</option></select
							></label
						>
						<label
							>Slope {terrain.angle}°<input
								data-testid="creature-slope"
								type="range"
								min="0"
								max="40"
								step="5"
								bind:value={terrain.angle}
								onchange={applyTerrain}
							/></label
						>
						<label
							>Walk direction<select
								data-testid="creature-direction"
								bind:value={terrain.direction}
								onchange={applyTerrain}
								><option value="uphill">Uphill</option><option value="downhill">Downhill</option
								><option value="across">Across slope</option></select
							></label
						>
						<label class="inline"
							><input
								type="checkbox"
								data-testid="creature-grounding"
								bind:checked={groundingEnabled}
								onchange={applyTerrain}
							/>Terrain conformation</label
						>
						<div class="toggles">
							{#each Object.keys(DEFAULT_GROUNDING_DEBUG) as key (key)}<label
									><input
										type="checkbox"
										data-testid={`creature-ground-${key}`}
										bind:checked={groundDebug[key as keyof GroundingDebugFlags]}
										onchange={() => Object.assign(lab.groundDebug, groundDebug)}
									/>{key}</label
								>{/each}
						</div>
						<button
							onclick={() => {
								Object.assign(tuning, DEFAULT_LAB_TUNING);
								generate();
							}}>Reset tuning</button
						>
						<button
							onclick={() => {
								lab.gait = gait;
								lab.showGallery(plan, speciesSeed, 12, 4, lod);
							}}>Gallery: 12 species</button
						>
					</fieldset>
					<fieldset data-testid="creature-surface">
						<legend>Surface (developer)</legend>
						<label
							>Pattern<select
								data-testid="creature-surface-pattern"
								bind:value={surface.primary}
								onchange={applySurface}
								><option value={undefined}>Generated</option
								>{#each PATTERN_TYPES as type (type)}<option value={type}>{type}</option
									>{/each}</select
							></label
						>
						<label
							>Secondary pattern<select bind:value={surface.secondary} onchange={applySurface}
								><option value={undefined}>Generated</option
								>{#each PATTERN_TYPES as type (type)}<option value={type}>{type}</option
									>{/each}</select
							></label
						>
						{#each surfaceSliders as slider (slider.key)}
							<label
								>{slider.label}
								{surface[slider.key] === undefined
									? '(generated)'
									: surface[slider.key]?.toFixed(2)}<input
									type="range"
									min={slider.min}
									max={slider.max}
									step={slider.step}
									value={surface[slider.key] ?? slider.fallback}
									onchange={(e) => {
										surface[slider.key] = Number(e.currentTarget.value);
										applySurface();
									}}
								/></label
							>
						{/each}
						<div class="toggles">
							{#each ACCENT_REGIONS as region (region)}<label
									><input
										type="checkbox"
										checked={surface.accents ? surface.accents.includes(region) : true}
										onchange={(e) => {
											const current = surface.accents ?? [...ACCENT_REGIONS];
											surface.accents = e.currentTarget.checked
												? [...current, region]
												: current.filter((r) => r !== region);
											applySurface();
										}}
									/>{region}</label
								>{/each}
						</div>
						<label
							>Surface debug<select
								data-testid="creature-surface-debug"
								bind:value={surfaceDebug}
								onchange={applySurface}
								>{#each surfaceDebugViews as view (view)}<option value={view}>{view}</option
									>{/each}</select
							></label
						>
						<div class="pair">
							<button
								onclick={() => {
									surface.surfaceSalt = (surface.surfaceSalt ?? 0) + 1;
									applySurface();
								}}>Randomise Surface</button
							><button
								onclick={() => {
									surface.paletteSeed = ((surface.paletteSeed ?? 0) + 2654435761) >>> 0 || 1;
									applySurface();
								}}>Randomise Palette</button
							>
						</div>
						<button
							onclick={() => {
								for (const key of Object.keys(surface))
									delete surface[key as keyof CreatureLabSurface];
								surfaceDebug = 'none';
								applySurface();
							}}>Reset surface</button
						>
					</fieldset>
				{/if}
				<button disabled={busy} onclick={sample}>GENERATE 100</button>
				{#if onPlace}<button
						class="primary"
						onclick={() => {
							try {
								if (lab.definition) onPlace(lab.definition);
							} catch (e) {
								error = String(e);
							}
						}}>Place in world</button
					>{/if}
			</aside>
			<main>
				<div class="views">
					{#each ['front', 'side', 'top'] as view (view)}<button
							onclick={() => {
								lab.clearGallery();
								lab.view(view as 'front' | 'side' | 'top');
							}}>{view}</button
						>{/each}<span>Drag to orbit · Scroll to zoom</span>
				</div>
				<div class="viewport" bind:this={viewport} data-testid="creature-viewport"></div>
				<p class="stats" data-testid="creature-stats">{stats}</p>
				{#if error}<p role="alert">{error}</p>{/if}{#if report}<pre
						data-testid="creature-sample-report">{report}</pre>{/if}
			</main>
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: #081910dc;
		z-index: 100;
		display: grid;
		place-items: center;
		padding: 1rem;
	}
	.lab {
		width: min(1240px, 98vw);
		height: min(850px, 95vh);
		background: #edf0e7;
		border: 1px solid #a7b79d;
		border-radius: 18px;
		color: #233d30;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 24px 100px #0008;
		font-family: system-ui;
	}
	header {
		padding: 20px 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid #c9d4c2;
	}
	h2 {
		margin: 4px 0;
		font-size: 30px;
		font-weight: 500;
	}
	header p {
		margin: 0;
		font-size: 13px;
	}
	small {
		letter-spacing: 2px;
		font-size: 10px;
	}
	.content {
		display: grid;
		grid-template-columns: 225px 1fr;
		min-height: 0;
		flex: 1;
	}
	aside {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		overflow: auto;
		border-right: 1px solid #c9d4c2;
	}
	label {
		font-size: 12px;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	input,
	select,
	button {
		font: inherit;
		padding: 8px;
		border: 1px solid #b6c6b0;
		border-radius: 6px;
		color: inherit;
		background: #f8faf4;
	}
	button {
		cursor: pointer;
		font-size: 12px;
	}
	button:hover {
		background: #dde7d6;
	}
	.primary {
		background: #315d44;
		color: white;
	}
	.pair {
		display: flex;
		gap: 4px;
	}
	.toggles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 7px;
	}
	.toggles label {
		flex-direction: row;
		align-items: center;
	}
	fieldset {
		min-width: 0;
		border: 1px solid #c3d0bc;
		border-radius: 8px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	fieldset .toggles {
		grid-template-columns: 1fr;
	}
	label.inline {
		flex-direction: row;
		align-items: center;
	}
	fieldset input[type='range'] {
		width: 100%;
		padding: 0;
	}
	legend {
		font-size: 11px;
		letter-spacing: 1px;
		text-transform: uppercase;
	}
	main {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}
	.viewport {
		flex: 1;
		min-height: 180px;
	}
	.views {
		padding: 10px;
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.views span {
		font-size: 11px;
		opacity: 0.6;
		margin-left: auto;
	}
	.stats {
		font-size: 11px;
		padding: 10px;
		margin: 0;
		background: #dfe6d7;
	}
	pre {
		font-size: 11px;
		max-height: 160px;
		overflow: auto;
		margin: 0;
		padding: 10px;
	}
	main > p[role='alert'] {
		color: #9d312e;
		padding: 8px;
	}
	@media (max-width: 650px) {
		.content {
			grid-template-columns: 170px 1fr;
		}
		header {
			padding: 12px;
		}
		aside {
			padding: 8px;
		}
		.views span {
			display: none;
		}
	}
</style>
