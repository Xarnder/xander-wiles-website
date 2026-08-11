<script lang="ts">
	let {
		value,
		label = 'Progress',
		detail = ''
	}: {
		value: number;
		label?: string;
		/** Optional label above the bar, e.g. "Task 2 of 8" */
		detail?: string;
	} = $props();

	const clamped = $derived(Math.max(0, Math.min(100, value)));
	const marks = [25, 50, 75];
</script>

<div class="progress">
	{#if detail}
		<span class="detail" data-testid="progress-text">{detail}</span>
	{/if}
	<div class="row">
		<div
			class="bar"
			role="progressbar"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={clamped}
		>
			<div class="track">
				<div class="fill" style={`width: ${clamped}%`}></div>
			</div>
			<div class="marks" aria-hidden="true">
				{#each marks as mark (mark)}
					<span class="mark" style:left={`${mark}%`}></span>
				{/each}
			</div>
		</div>
		<span class="percent" data-testid="progress-percent">{clamped}%</span>
	</div>
</div>

<style>
	.progress {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		width: 100%;
	}

	.detail {
		color: var(--muted);
		font-size: 0.95rem;
		font-weight: 600;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		width: 100%;
	}

	.percent {
		flex: 0 0 auto;
		min-width: 4.5ch;
		text-align: right;
		color: var(--ink);
		font-size: 0.95rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.bar {
		position: relative;
		flex: 1 1 auto;
		min-width: 0;
		width: 100%;
		padding: 0.35rem 0;
	}

	.track {
		width: 100%;
		height: 0.7rem;
		border-radius: 999px;
		background: var(--track);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--accent), var(--accent-strong));
		transition: width 160ms ease;
	}

	:global(html[data-theme='oled']) .track {
		overflow: visible;
	}

	:global(html[data-theme='oled']) .fill {
		background: linear-gradient(90deg, var(--accent), var(--accent-strong));
		box-shadow:
			0 0 8px color-mix(in srgb, var(--accent) 90%, transparent),
			0 0 18px color-mix(in srgb, var(--accent) 55%, transparent),
			0 0 32px color-mix(in srgb, var(--accent-strong) 40%, transparent);
	}

	.marks {
		pointer-events: none;
		position: absolute;
		inset: 0;
	}

	.mark {
		position: absolute;
		top: 50%;
		width: 2px;
		height: 0.95rem;
		transform: translate(-50%, -50%);
		border-radius: 999px;
		background: color-mix(in srgb, var(--ink) 42%, transparent);
	}
</style>
