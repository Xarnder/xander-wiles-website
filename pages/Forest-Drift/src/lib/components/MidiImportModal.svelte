<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { MusicPlantPlacementTool } from '../game/music/MusicPlantPlacementTool';
	import { species } from '../game/music/MusicModel';
	import { MidiWorkerClient } from '../game/music/midi/MidiWorkerClient';
	import { defaultImportOptions, programFamily } from '../game/music/midi/MidiPlanner';
	import type { MidiAnalysis } from '../game/music/midi/MidiParser';
	import type { MidiImportOptions, MidiImportPlan } from '../game/music/midi/MidiImportPlan';
	let { music, onClose }: { music: MusicPlantPlacementTool; onClose: () => void } = $props();
	let analysis = $state.raw<MidiAnalysis>();
	let options = $state<MidiImportOptions>();
	let plan = $state.raw<MidiImportPlan>();
	let busy = $state(false);
	let stage = $state('Choose a MIDI to grow');
	let error = $state('');
	let replaceConfirmed = $state(false);
	let worker: MidiWorkerClient | undefined;
	let generation = 0;
	let timeout: ReturnType<typeof setTimeout>;
	const metres = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} km` : `${n.toFixed(1)} m`);
	onDestroy(() => {
		generation++;
		clearTimeout(timeout);
		worker?.dispose();
		music.importPanelOpen = false;
	});
	async function choose(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const token = ++generation;
		worker?.dispose();
		worker = new MidiWorkerClient();
		error = '';
		plan = undefined;
		analysis = undefined;
		busy = true;
		try {
			if (!/\.midi?$/i.test(file.name)) throw Error('Choose a .mid or .midi file.');
			if (file.size > 16 * 1024 * 1024) throw Error('MIDI files must be no larger than 16 MB.');
			stage = 'Reading local file';
			const a = await worker.parse(await file.arrayBuffer(), file.name, (s) => (stage = s));
			if (token !== generation) return;
			analysis = a;
			options = defaultImportOptions(a);
			busy = false;
			await replan();
		} catch (e) {
			if (token === generation) {
				error = e instanceof Error ? e.message : String(e);
				busy = false;
			}
		}
	}
	function changed() {
		clearTimeout(timeout);
		plan = undefined;
		busy = true;
		timeout = setTimeout(() => void replan(), 180);
	}
	async function replan() {
		if (!worker || !options) return;
		const token = ++generation;
		busy = true;
		error = '';
		plan = undefined;
		try {
			const o = $state.snapshot(options);
			if (o.target !== 'new') {
				o.existingTree = structuredClone(music.activeTree);
				o.existingPlants = structuredClone(
					music.plants.definitions.filter((p) => p.musicTreeId === music.activeTree?.id)
				);
			}
			const result = await worker.plan(o, (s) => (stage = s));
			if (token !== generation) return;
			plan = result;
			stage = 'Ready to grow';
		} catch (e) {
			if (token === generation) error = e instanceof Error ? e.message : String(e);
		} finally {
			if (token === generation) busy = false;
		}
	}
	async function confirm() {
		if (!plan || busy) return;
		busy = true;
		stage = 'Creating garden';
		try {
			await music.beginImport(plan);
			onClose();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="midi-backdrop" role="presentation">
	<div
		class="midi-panel"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-labelledby="midi-title"
		data-testid="midi-modal"
	>
		<header>
			<div>
				<p class="eyebrow">MUSIC GARDEN</p>
				<h2 id="midi-title">Grow a MIDI garden</h2>
			</div>
			<button
				aria-label="Close MIDI import"
				disabled={busy && stage === 'Creating garden'}
				onclick={onClose}>✕</button
			>
		</header>
		<p>
			Your file stays on this device. Preview a section, then turn its notes into editable plants.
		</p>
		<label class="file"
			>Choose MIDI <input
				data-testid="midi-file"
				type="file"
				accept=".mid,.midi,audio/midi,audio/x-midi"
				onchange={choose}
			/></label
		>
		{#if analysis && options}
			<div class="analysis" data-testid="midi-analysis">
				<strong>{analysis.fileName}</strong><span
					>{analysis.barStarts.length - 1} bars · {analysis.tracks.length} tracks · {analysis.tracks
						.reduce((n, t) => n + t.noteCount, 0)
						.toLocaleString()} notes</span
				><span
					>Tempo: {Math.min(...analysis.tempos.map((t) => t.bpm)).toFixed(0)}–{Math.max(
						...analysis.tempos.map((t) => t.bpm)
					).toFixed(0)} BPM · {analysis.tempos.length - 1} changes</span
				><span
					>Meter: {analysis.meters.map((m) => `${m.numerator}/${m.denominator}`).join(' → ')} · Maximum
					simultaneous notes: {analysis.maxSimultaneous}</span
				>
			</div>
			<div class="settings">
				<label
					>From bar<input
						data-testid="midi-start"
						type="number"
						min="1"
						max={analysis.barStarts.length - 1}
						bind:value={options.startBar}
						onchange={changed}
					/></label
				>
				<label
					>To bar<input
						data-testid="midi-end"
						type="number"
						min={options.startBar}
						max={analysis.barStarts.length - 1}
						bind:value={options.endBar}
						onchange={changed}
					/></label
				>
				<label
					>Timing resolution<select
						data-testid="midi-resolution"
						bind:value={options.resolution}
						onchange={changed}
						><option value="auto">Auto — coarsest accurate grid</option><option value="eighth"
							>1/8</option
						><option value="sixteenth">1/16</option><option value="thirtysecond">1/32</option
						><option value="triplet">Triplet-aware</option></select
					></label
				>
				<label
					>Garden spacing<select
						data-testid="midi-spacing"
						bind:value={options.spacing}
						onchange={changed}
						><option value="tight">Tight</option><option value="compact">Compact</option><option
							value="balanced">Balanced</option
						><option value="epic">Epic</option></select
					></label
				>
				<label
					>Import as<select
						data-testid="midi-target"
						bind:value={options.target}
						onchange={() => {
							replaceConfirmed = false;
							changed();
						}}
						><option value="new">Create New Music Tree</option><option
							value="replace"
							disabled={!music.activeTree}>Replace This Music Tree</option
						><option value="add" disabled={!music.activeTree}>Add To This Music Tree</option
						></select
					></label
				>
				<label class="confirm cluster"
					><input
						data-testid="midi-cluster"
						type="checkbox"
						bind:checked={options.cluster}
						onchange={changed}
					/>Cluster notes in one area</label
				>
			</div>
			<table>
				<thead
					><tr
						><th>Include / track</th><th>MIDI instrument</th><th>Plant / sound</th><th>Notes</th
						></tr
					></thead
				><tbody
					>{#each analysis.tracks as track (track.id)}<tr
							><td
								><label class="track"
									><input
										type="checkbox"
										aria-label={`Include ${track.name}`}
										bind:checked={options.tracks[track.id].enabled}
										onchange={changed}
									/>{track.name}</label
								></td
							><td>{programFamily(track.program, track.percussion)} · Ch {track.channel + 1}</td><td
								><select
									aria-label={`Plant for ${track.name}`}
									data-testid="midi-track-mapping"
									bind:value={options.tracks[track.id].speciesId}
									onchange={changed}
									>{#each species as sp (sp.id)}<option value={sp.id}>{sp.name}</option
										>{/each}</select
								></td
							><td>{track.noteCount}</td></tr
						>{/each}</tbody
				>
			</table>
		{/if}
		<p role="status" aria-live="polite">{busy ? 'Working locally — ' : ''}{stage}</p>
		{#if error}<p role="alert" class="error">{error}</p>{/if}
		{#if plan}<div class="summary" data-testid="midi-summary">
				<p class="eyebrow">READY TO GROW</p>
				<strong
					>{plan.statistics.plants.toLocaleString()} plants · {plan.statistics.tracks} tracks</strong
				><span
					>{plan.timeline.totalSteps.toLocaleString()} timing positions · {plan.timeline.grid
						.stepsPerQuarter} steps per quarter</span
				><span
					>Timing adjustment: average {plan.statistics.averageAdjustmentMs.toFixed(1)} ms · maximum {plan.statistics.maxAdjustmentMs.toFixed(
						1
					)} ms</span
				><span
					>Ring spacing {metres(plan.layout.ringSpacing)} · Inner radius {metres(
						plan.layout.firstRingRadius
					)}</span
				><strong data-testid="midi-size"
					>Garden radius {metres(plan.layout.outerRadius)} · Diameter {metres(
						plan.layout.outerRadius * 2
					)}</strong
				><span
					>Plants from {metres(plan.statistics.smallestPlant)} to {metres(
						plan.statistics.largestPlant
					)} tall</span
				>
			</div>
			{#if plan.warnings.length}<ul class="warnings">
					{#each plan.warnings as warning (warning)}<li>{warning}</li>{/each}
				</ul>{/if}{/if}
		{#if options?.target === 'replace'}<label class="confirm"
				><input
					data-testid="midi-replace-confirm"
					type="checkbox"
					bind:checked={replaceConfirmed}
				/>Replace this composition? Existing musical plants around this tree will be removed.</label
			>{/if}
		<footer>
			<button disabled={busy && stage === 'Creating garden'} onclick={onClose}>Cancel</button
			><button
				class="primary"
				data-testid="midi-confirm"
				disabled={!plan || busy || (options?.target === 'replace' && !replaceConfirmed)}
				onclick={confirm}
				>{options?.target === 'new' ? 'Choose tree location' : 'Import garden'}</button
			>
		</footer>
	</div>
</div>

<style>
	.midi-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: #07140dd9;
		display: grid;
		place-items: center;
		padding: 1rem;
		backdrop-filter: blur(5px);
	}
	.midi-panel {
		width: min(880px, 95vw);
		max-height: 90vh;
		overflow: auto;
		background: #142a20;
		color: #e3f5e8;
		border: 1px solid #446553;
		border-radius: 18px;
		padding: 1.4rem;
		font: 14px/1.5 system-ui;
		box-shadow: 0 20px 100px #0007;
	}
	header,
	footer {
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
	button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.primary {
		background: #b4e7bb;
		color: #173222;
		font-weight: 700;
	}
	.analysis,
	.summary {
		display: grid;
		gap: 0.35rem;
		background: #203a2c;
		padding: 1rem;
		border-radius: 10px;
		margin: 1rem 0;
	}
	.summary {
		border: 1px solid #709678;
	}
	.settings {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.8rem;
		margin: 1rem 0;
	}
	.settings .cluster {
		grid-column: 1 / -1;
	}
	label {
		display: grid;
		gap: 0.35rem;
	}
	.file input {
		display: block;
		max-width: 100%;
	}
	.track,
	.confirm {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 12px;
	}
	td,
	th {
		text-align: left;
		padding: 0.65rem 0.4rem;
		border-bottom: 1px solid #35523e;
	}
	td select {
		max-width: 180px;
	}
	.warnings {
		color: #e8d4a4;
	}
	.error {
		color: #ffc0b6;
	}
	footer {
		margin-top: 1rem;
		justify-content: flex-end;
	}
	@media (max-width: 600px) {
		.midi-panel {
			padding: 0.8rem;
		}
		table {
			display: block;
			overflow: auto;
		}
	}
</style>
