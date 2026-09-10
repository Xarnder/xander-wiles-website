<script lang="ts">
	let { running, started, target, ontoggle, onreset, onchange } = $props<{
		running: boolean;
		started: boolean;
		target: number;
		ontoggle: () => void;
		onreset: () => void;
		onchange: (v: number) => void;
	}>();
</script>

<div class="controls">
	<div class="buttons">
		<button class="start" type="button" onclick={ontoggle}>
			<span aria-hidden="true">{running ? 'Ⅱ' : '▷'}</span>
			{running ? 'Pause' : started ? 'Continue' : 'Begin'}
		</button>
		<button
			class="reset"
			type="button"
			onclick={onreset}
			aria-label="Reset and recalibrate"
			title="Reset and recalibrate"
		>↺</button>
	</div>
	<div class="target">
		<label for="target">Target rhythm</label>
		<output for="target">{target.toFixed(1)} <span>breaths/min</span></output>
		<input
			id="target"
			type="range"
			min="4"
			max="10"
			step="0.5"
			value={target}
			oninput={(e) => onchange(Number(e.currentTarget.value))}
			aria-valuetext={`${target} breaths per minute`}
		/>
	</div>
</div>

<style>
	.controls {
		width: 100%;
		max-width: 320px;
		margin: 0 auto;
	}
	.buttons {
		display: flex;
		gap: 10px;
		justify-content: center;
	}
	.start {
		background: var(--ink-d9e3c2, #d9e3c2);
		color: var(--ink-202d25, #202d25);
		border: 1px solid var(--ink-e2e9d0, #e2e9d0);
		border-radius: 100px;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0.02em;
		padding: 0 28px;
		height: 44px;
		min-width: 170px;
		box-shadow: 0 4px 20px var(--ink-cce3bc09, rgba(0, 0, 0, 0.1));
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		transition: filter 0.2s ease, transform 0.1s ease;
	}
	.start:hover {
		filter: brightness(1.06);
	}
	.start:active {
		transform: scale(0.98);
	}
	.start span {
		font-size: 15px;
	}
	.reset {
		height: 44px;
		width: 44px;
		border: 1px solid var(--ink-a6c0a62e, #a6c0a62e);
		border-radius: 50%;
		color: var(--ink-c4ceb9, #c4ceb9);
		background: var(--ink-bed4b505, #bed4b505);
		font-size: 20px;
		cursor: pointer;
		display: grid;
		place-items: center;
		transition: filter 0.2s ease;
	}
	.reset:hover {
		filter: brightness(1.1);
	}
	.target {
		display: grid;
		grid-template-columns: 1fr 1fr;
		margin-top: 14px;
		align-items: center;
		font-size: 12px;
		color: var(--ink-b5bead, #b5bead);
	}
	.target output {
		text-align: right;
		color: var(--ink-d9dfca, #d9dfca);
		font-weight: 600;
		font-size: 13px;
	}
	.target output span {
		color: var(--ink-879580, #879580);
		font-size: 11px;
		font-weight: 500;
		margin-left: 3px;
	}
	input {
		grid-column: 1 / -1;
		width: 100%;
		height: 36px;
		appearance: none;
		background: transparent;
		accent-color: var(--ink-cdd9b6, #cdd9b6);
		cursor: pointer;
		margin: 2px 0 0;
	}
	input::-webkit-slider-runnable-track {
		height: 3px;
		background: var(--ink-aab99c50, rgba(255, 255, 255, 0.15));
		border-radius: 3px;
	}
	input::-webkit-slider-thumb {
		appearance: none;
		width: 16px;
		height: 16px;
		margin-top: -6.5px;
		border-radius: 50%;
		background: var(--ink-d4dfbd, #d4dfbd);
		box-shadow: 0 0 0 4px var(--ink-cbdcba08, rgba(0, 0, 0, 0.1));
	}
	input::-moz-range-track {
		height: 3px;
		background: var(--ink-aab99c50, rgba(255, 255, 255, 0.15));
		border-radius: 3px;
	}
	input::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border: 0;
		border-radius: 50%;
		background: var(--ink-d4dfbd, #d4dfbd);
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--ink-e9c995, #e9c995);
		outline-offset: 3px;
	}
</style>
