<script lang="ts">
	let { current, guide, target } = $props<{
		current: number | null;
		guide: number | null;
		target: number;
	}>();
</script>

<div class="stats" role="group" aria-label="Breathing rates">
	<div><span>Current</span><strong>{current?.toFixed(1) ?? '—'}</strong></div>
	<div class="guide">
		<span><i></i> Guide</span><strong>{guide?.toFixed(1) ?? '—'}</strong>
	</div>
	<div><span>Target</span><strong>{target.toFixed(1)}</strong></div>
</div>
<p>breaths / minute</p>

<style>
	.stats {
		display: flex;
		justify-content: center;
		gap: 0;
		margin: 8px auto 0;
		max-width: 390px;
	}
	.stats > div {
		flex: 1;
		text-align: center;
		border-right: 1px solid var(--ink-c0d9bd18, #c0d9bd18);
	}
	.stats > div:last-child {
		border: 0;
	}
	span {
		font-size: 10px;
		color: var(--ink-9fab9e, #9fab9e);
		letter-spacing: 0.08em;
	}
	strong {
		display: block;
		font-family: 'Quicksand', 'Nunito', ui-rounded, sans-serif;
		font-size: 34px;
		line-height: 1.3;
		font-weight: 600;
		color: var(--ink-e8e8d9, #e8e8d9);
		margin-top: 9px;
		font-variant-numeric: tabular-nums;
	}
	.guide strong {
		color: var(--ink-bcddbf, #bcddbf);
	}
	i {
		display: inline-block;
		width: 4px;
		height: 4px;
		background: var(--ink-b8ebc6, #b8ebc6);
		border-radius: 50%;
		vertical-align: middle;
		margin-right: 3px;
	}
	p {
		text-align: center;
		color: var(--ink-a0ad9f, #a0ad9f);
		font-size: 9px;
		letter-spacing: 0.15em;
		margin: 15px 0 0;
	}
</style>
