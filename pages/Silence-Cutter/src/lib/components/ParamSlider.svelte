<script lang="ts">
	interface Props {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		unit: string;
		hint?: string;
		testid?: string;
		onchange: (v: number) => void;
	}
	let { label, value, min, max, step = 1, unit, hint, testid, onchange }: Props = $props();
	const id = `p-${Math.random().toString(36).slice(2, 9)}`;

	function commit(raw: string) {
		const v = Number(raw);
		if (Number.isFinite(v)) onchange(Math.min(max, Math.max(min, v)));
	}
</script>

<div class="param" title={hint}>
	<div class="row">
		<label for={id}>{label}</label>
		<span class="value">
			<input
				type="number"
				{min}
				{max}
				{step}
				{value}
				aria-label="{label} ({unit})"
				data-testid={testid ? `${testid}-input` : undefined}
				onchange={(e) => commit(e.currentTarget.value)}
			/>
			<span class="unit">{unit}</span>
		</span>
	</div>
	<input
		{id}
		type="range"
		{min}
		{max}
		{step}
		{value}
		data-testid={testid}
		oninput={(e) => commit(e.currentTarget.value)}
	/>
	{#if hint}<p class="hint">{hint}</p>{/if}
</div>

<style>
	.param {
		margin: 8px 0 10px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	label {
		font-size: 12px;
		color: var(--text);
	}
	.value {
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.value input {
		width: 62px;
		text-align: right;
		padding: 2px 4px;
		font-family: var(--mono);
		font-size: 12px;
	}
	.unit {
		font-size: 11px;
		color: var(--text-faint);
		width: 18px;
	}
	.hint {
		margin: 0;
		font-size: 10.5px;
		color: var(--text-faint);
		line-height: 1.35;
	}
</style>
