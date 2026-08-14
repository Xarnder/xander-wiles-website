<script lang="ts">
	import type { ProgressSegments } from '$lib/types/run';

	let {
		segments,
		label = 'Progress',
		detail = '',
		compact = false,
		showPercent = true
	}: {
		segments: ProgressSegments;
		label?: string;
		/** Optional label above the bar, e.g. "Task 2 of 8" */
		detail?: string;
		compact?: boolean;
		showPercent?: boolean;
	} = $props();

	const resolved = $derived(Math.max(0, Math.min(100, segments.resolvedPercent)));
	const description = $derived(
		`${segments.completed} complete, ${segments.later} later, ${segments.skipped} not today, ${segments.pending} remaining`
	);
	const bands = $derived([
		{
			key: 'completed',
			percent: segments.percents.completed,
			title: `Complete ${segments.completed}`
		},
		{
			key: 'later',
			percent: segments.percents.later,
			title: `Later ${segments.later}`
		},
		{
			key: 'skipped',
			percent: segments.percents.skipped,
			title: `Not today ${segments.skipped}`
		},
		{
			key: 'pending',
			percent: segments.percents.pending,
			title: `Remaining ${segments.pending}`
		}
	]);
	const marks = $derived(compact ? [] : [25, 50, 75]);
</script>

<div class={['progress', compact && 'compact']}>
	{#if detail}
		<span class="detail" data-testid="progress-text">{detail}</span>
	{/if}
	<div class="row">
		<div
			class="bar"
			role="progressbar"
			aria-label={`${label}. ${description}`}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={resolved}
		>
			<div class="track">
				{#each bands as band (band.key)}
					<span
						class={['seg', band.key]}
						style:width={`${band.percent}%`}
						title={band.title}
						data-testid={`progress-seg-${band.key}`}
					></span>
				{/each}
			</div>
			<div class="marks" aria-hidden="true">
				{#each marks as mark (mark)}
					<span class="mark" style:left={`${mark}%`}></span>
				{/each}
			</div>
		</div>
		{#if showPercent}
			<span class="percent" data-testid="progress-percent">{resolved}%</span>
		{/if}
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
		display: flex;
		flex-direction: row;
		align-items: stretch;
		width: 100%;
		height: 0.7rem;
		border-radius: 999px;
		background: var(--track);
		overflow: hidden;
	}

	.seg {
		display: block;
		height: 100%;
		flex: 0 0 auto;
		min-width: 0;
		transition: width 180ms ease;
	}

	.seg.completed {
		background: linear-gradient(90deg, var(--accent), var(--accent-strong));
	}

	.seg.later {
		background: var(--later);
	}

	.seg.skipped {
		background: var(--not-today);
	}

	.seg.pending {
		background: var(--track);
	}

	:global(html[data-theme='oled']) .seg.completed {
		background: linear-gradient(90deg, var(--accent), var(--accent-strong));
		box-shadow:
			0 0 8px color-mix(in srgb, var(--accent) 90%, transparent),
			0 0 18px color-mix(in srgb, var(--accent) 55%, transparent);
	}

	@media (prefers-reduced-motion: reduce) {
		.seg {
			transition: none;
		}
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

	.compact {
		gap: 0.2rem;
	}

	.compact .row {
		gap: 0.45rem;
	}

	.compact .bar {
		padding: 0.12rem 0;
	}

	.compact .track {
		height: 0.5rem;
	}
</style>
