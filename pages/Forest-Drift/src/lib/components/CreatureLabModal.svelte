<script lang="ts">
	import { onMount } from 'svelte';
	import { CreatureLab } from '../game/creatures/CreatureLab';
	import type { BodyPlanId, CreatureDefinition } from '../game/creatures/CreatureTypes';
	let {
		onClose,
		onPlace
	}: { onClose: () => void; onPlace: (definition: CreatureDefinition) => void } = $props();
	let viewport: HTMLDivElement;
	let lab: CreatureLab;
	let speciesSeed = $state(42),
		individualSeed = $state(7),
		plan = $state<BodyPlanId>('quadruped'),
		scale = $state(1),
		lod = $state<0 | 1>(0),
		gait = $state<'idle' | 'walk' | 'run'>('walk');
	let wireframe = $state(false),
		skeleton = $state(false),
		collision = $state(false),
		chains = $state(false),
		anchors = $state(false),
		weights = $state(false);
	let error = $state(''),
		report = $state(''),
		busy = $state(false),
		name = $state(''),
		stats = $state('');
	function generate() {
		try {
			const d = lab.generate(speciesSeed, individualSeed, plan, scale, lod);
			name = d.species.name;
			error = '';
		} catch (e) {
			error = String(e);
		}
	}
	function overlays() {
		Object.assign(lab, { wireframe, skeleton, collision, chains, anchors, weights });
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
		generate();
		const timer = setInterval(() => {
			const t = lab.telemetry;
			stats = `${t.vertices.toLocaleString()} vertices · ${t.triangles.toLocaleString()} triangles · ${t.bones} bones · ${t.compileMs.toFixed(1)} ms compile · ${t.animationMs.toFixed(2)} ms animation · ${t.fps.toFixed(0)} FPS`;
		}, 500);
		return () => {
			clearInterval(timer);
			lab.dispose();
		};
	});
</script>

<div class="backdrop">
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Creature Lab"
		tabindex="-1"
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
					>Geometry<select bind:value={lod} onchange={generate}
						><option value={0}>LOD0 / full</option><option value={1}>LOD1 / reduced</option></select
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
					{#each ['wireframe', 'skeleton', 'collision', 'chains', 'anchors', 'weights'] as key}<label
							><input
								type="checkbox"
								onchange={(e) => {
									const v = e.currentTarget.checked;
									if (key === 'wireframe') wireframe = v;
									else if (key === 'skeleton') skeleton = v;
									else if (key === 'collision') collision = v;
									else if (key === 'chains') chains = v;
									else if (key === 'anchors') anchors = v;
									else weights = v;
									overlays();
								}}
							/>{key}</label
						>{/each}
				</div>
				<button disabled={busy} onclick={sample}>GENERATE 100</button><button
					class="primary"
					onclick={() => {
						try {
							if (lab.definition) onPlace(lab.definition);
						} catch (e) {
							error = String(e);
						}
					}}>Place in world</button
				>
			</aside>
			<main>
				<div class="views">
					{#each ['front', 'side', 'top'] as view}<button
							onclick={() => lab.view(view as 'front' | 'side' | 'top')}>{view}</button
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
