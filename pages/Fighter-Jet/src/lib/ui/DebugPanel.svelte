<script lang="ts">
	export interface DebugFlags {
		invincibility: boolean;
		infiniteMissiles: boolean;
		helpers: boolean;
		ranges: boolean;
		paths: boolean;
		stats: boolean;
	}

	interface Props {
		flags: DebugFlags;
		timeScale: number;
		fps?: number;
		drawCalls?: number;
		triangles?: number;
		onToggle: (flag: keyof DebugFlags, value: boolean) => void;
		onTimeScale: (value: number) => void;
		onDestroyTarget: () => void;
		onSkipPhase: () => void;
		onSpawnExplosion: () => void;
		onReset: () => void;
		onClose: () => void;
	}

	let {
		flags,
		timeScale,
		fps = 0,
		drawCalls = 0,
		triangles = 0,
		onToggle,
		onTimeScale,
		onDestroyTarget,
		onSkipPhase,
		onSpawnExplosion,
		onReset,
		onClose
	}: Props = $props();

	function bool(event: Event): boolean {
		return (event.currentTarget as HTMLInputElement).checked;
	}
</script>

<aside class="debug" aria-labelledby="debug-title">
	<header>
		<div>
			<span>DEVELOPER OVERLAY</span>
			<h2 id="debug-title">Viper Debug</h2>
		</div>
		<button type="button" aria-label="Close debug panel" onclick={onClose}>F2</button>
	</header>

	<div class="stats">
		<span><b>{Math.round(fps)}</b> FPS</span>
		<span><b>{drawCalls}</b> DRAWS</span>
		<span><b>{Math.round(triangles / 1000)}K</b> TRIS</span>
	</div>

	<fieldset>
		<legend>Player</legend>
		<label>
			<input
				type="checkbox"
				checked={flags.invincibility}
				onchange={(event) => onToggle('invincibility', bool(event))}
			/>
			Invincibility
		</label>
		<label>
			<input
				type="checkbox"
				checked={flags.infiniteMissiles}
				onchange={(event) => onToggle('infiniteMissiles', bool(event))}
			/>
			Infinite missiles
		</label>
	</fieldset>

	<fieldset>
		<legend>World helpers</legend>
		<label>
			<input
				type="checkbox"
				checked={flags.helpers}
				onchange={(event) => onToggle('helpers', bool(event))}
			/>
			Helpers
		</label>
		<label>
			<input
				type="checkbox"
				checked={flags.ranges}
				onchange={(event) => onToggle('ranges', bool(event))}
			/>
			Ranges
		</label>
		<label>
			<input
				type="checkbox"
				checked={flags.paths}
				onchange={(event) => onToggle('paths', bool(event))}
			/>
			Paths
		</label>
		<label>
			<input
				type="checkbox"
				checked={flags.stats}
				onchange={(event) => onToggle('stats', bool(event))}
			/>
			Stats
		</label>
	</fieldset>

	<label class="time-scale">
		<span>Time scale <output>{timeScale.toFixed(2)}×</output></span>
		<input
			type="range"
			min="0.1"
			max="3"
			step="0.1"
			value={timeScale}
			oninput={(event) => onTimeScale(Number(event.currentTarget.value))}
		/>
	</label>

	<div class="actions">
		<button type="button" onclick={onDestroyTarget}>Destroy target</button>
		<button type="button" onclick={onSkipPhase}>Skip phase</button>
		<button type="button" onclick={onSpawnExplosion}>Spawn explosion</button>
		<button class="danger" type="button" onclick={onReset}>Reset simulation</button>
	</div>

	<p>TEST/DEV ONLY · F2 TO TOGGLE</p>
</aside>

<style>
	.debug {
		position: absolute;
		z-index: 80;
		top: 1rem;
		right: 1rem;
		width: min(19rem, calc(100vw - 2rem));
		padding: 0.8rem;
		color: #d7f4f8;
		border: 1px solid rgba(103, 218, 235, 0.52);
		background: rgba(2, 15, 22, 0.95);
		box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
		font:
			550 0.61rem/1.25 ui-monospace,
			monospace;
		pointer-events: auto;
		backdrop-filter: blur(10px);
	}

	.debug::before {
		position: absolute;
		inset: 0;
		content: '';
		pointer-events: none;
		background: repeating-linear-gradient(
			0deg,
			transparent 0 2px,
			rgba(106, 218, 235, 0.025) 2px 3px
		);
	}

	header {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 0.7rem;
		border-bottom: 1px solid rgba(106, 215, 232, 0.18);
	}

	header span {
		color: #f0a268;
		font-size: 0.47rem;
		letter-spacing: 0.14em;
	}

	h2 {
		margin: 0.18rem 0 0;
		font-size: 0.8rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	button {
		color: #bdeaf1;
		border: 1px solid rgba(108, 215, 233, 0.28);
		background: rgba(7, 40, 50, 0.68);
		font: inherit;
		text-transform: uppercase;
		cursor: pointer;
	}

	header button {
		padding: 0.35rem 0.45rem;
	}

	.stats {
		position: relative;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.35rem;
		margin-block: 0.7rem;
	}

	.stats span {
		display: grid;
		gap: 0.2rem;
		padding: 0.45rem;
		color: rgba(169, 216, 223, 0.52);
		border: 1px solid rgba(105, 211, 228, 0.14);
		background: rgba(6, 29, 38, 0.56);
		font-size: 0.46rem;
	}

	.stats b {
		color: #79dfed;
		font-size: 0.75rem;
	}

	fieldset {
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
		margin: 0.55rem 0 0;
		padding: 0.7rem;
		border: 1px solid rgba(105, 211, 228, 0.15);
	}

	legend {
		padding-inline: 0.25rem;
		color: #efa168;
		font-size: 0.48rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	fieldset label {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		color: rgba(206, 235, 239, 0.72);
		cursor: pointer;
	}

	input {
		accent-color: #69d6e7;
	}

	.time-scale {
		position: relative;
		display: grid;
		gap: 0.35rem;
		margin-top: 0.75rem;
	}

	.time-scale span {
		display: flex;
		justify-content: space-between;
		color: rgba(196, 230, 235, 0.68);
		text-transform: uppercase;
	}

	output {
		color: #f1a46b;
	}

	.time-scale input {
		width: 100%;
	}

	.actions {
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.35rem;
		margin-top: 0.8rem;
	}

	.actions button {
		padding: 0.55rem 0.35rem;
		font-size: 0.5rem;
	}

	.actions button:hover {
		border-color: #74dce9;
		background: rgba(16, 67, 78, 0.75);
	}

	.actions .danger {
		color: #f7b09a;
		border-color: rgba(235, 104, 73, 0.3);
		background: rgba(65, 19, 12, 0.55);
	}

	.debug > p {
		position: relative;
		margin: 0.65rem 0 0;
		color: rgba(153, 201, 209, 0.32);
		font-size: 0.43rem;
		letter-spacing: 0.1em;
		text-align: center;
	}

	@media (max-width: 500px) {
		.debug {
			top: 0.5rem;
			right: 0.5rem;
			width: calc(100vw - 1rem);
			max-height: calc(100vh - 1rem);
			overflow: auto;
		}
	}
</style>
