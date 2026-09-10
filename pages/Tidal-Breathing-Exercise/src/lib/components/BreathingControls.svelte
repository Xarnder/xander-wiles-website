<script lang="ts">
	let { running, started, target, currentRate = null, atTarget = false, ontoggle, onreset, onchange } = $props<{
		running: boolean;
		started: boolean;
		target: number;
		currentRate?: number | null;
		atTarget?: boolean;
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
		<div class="rates-bar" class:at-target={atTarget}>
			<div class="rate-stat">
				<span class="rate-label" title="Current breathing speed based on last 3 cycles">Current</span>
				<strong class="rate-value current-val">
					{currentRate != null ? currentRate.toFixed(1) : '—'}
					<span class="rate-unit">bpm</span>
				</strong>
			</div>
			<div class="rate-divider" aria-hidden="true"></div>
			<div class="rate-stat target-stat">
				<label for="target" class="rate-label">Target</label>
				<output for="target" class="rate-value target-val">
					{target.toFixed(1)}
					<span class="rate-unit">bpm</span>
				</output>
			</div>
		</div>
		<input
			id="target"
			type="range"
			min="2"
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
		display: flex;
		flex-direction: column;
		margin-top: 14px;
	}
	.rates-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 2px;
	}
	.rate-stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rate-stat.target-stat {
		align-items: flex-end;
		text-align: right;
	}
	.rate-label {
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-a0ad9f, #a0ad9f);
		font-weight: 500;
	}
	.rate-value {
		font-family: 'Quicksand', 'Nunito', ui-rounded, sans-serif;
		font-size: 17px;
		font-weight: 700;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
		display: inline-flex;
		align-items: baseline;
	}
	.current-val {
		color: var(--theme-user, #f5b958);
	}
	.rates-bar.at-target .current-val {
		color: var(--theme-guide, #6efac0);
		text-shadow: 0 0 12px var(--track-target-glow, rgba(56, 200, 255, 0.45));
		transition: color 0.5s ease, text-shadow 0.5s ease;
	}
	.target-val {
		color: var(--theme-guide, #6efac0);
	}
	.rate-divider {
		height: 18px;
		width: 1px;
		background: var(--ink-b8c4a925, rgba(255, 255, 255, 0.12));
		opacity: 0.6;
	}
	.rate-unit {
		font-size: 11px;
		font-weight: 500;
		color: var(--ink-a0ad9f, #a0ad9f);
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

	:global(:root[data-theme='oled']) .start {
		box-shadow: 0 0 24px rgba(56, 200, 255, 0.38);
	}
	:global(:root[data-theme='oled']) .start:hover {
		box-shadow: 0 0 32px rgba(56, 200, 255, 0.6);
	}
	:global(:root[data-theme='oled']) .reset {
		border-color: rgba(56, 200, 255, 0.3);
		color: #88d4f5;
	}
	:global(:root[data-theme='oled']) .reset:hover {
		border-color: rgba(56, 200, 255, 0.65);
		color: #ffffff;
		box-shadow: 0 0 16px rgba(56, 200, 255, 0.3);
	}
	:global(:root[data-theme='oled']) input::-webkit-slider-runnable-track {
		background: rgba(56, 200, 255, 0.25);
	}
	:global(:root[data-theme='oled']) input::-webkit-slider-thumb {
		background: #38c8ff;
		box-shadow: 0 0 14px rgba(56, 200, 255, 0.5);
	}
	:global(:root[data-theme='oled']) input::-moz-range-track {
		background: rgba(56, 200, 255, 0.25);
	}
	:global(:root[data-theme='oled']) input::-moz-range-thumb {
		background: #38c8ff;
		box-shadow: 0 0 14px rgba(56, 200, 255, 0.5);
	}
</style>
