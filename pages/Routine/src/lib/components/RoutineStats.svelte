<script lang="ts">
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import type { Routine } from '$lib/types/routine';
	import {
		getRoutineTaskStats,
		observationTotal,
		outcomePercents,
		outcomeSegments,
		sumOutcomeCounts
	} from '$lib/run/task-stats';

	let { routine }: { routine: Routine } = $props();

	const record = $derived(getRoutineTaskStats(routine.id));
	const rows = $derived(
		[...routine.tasks]
			.sort((a, b) => a.order - b.order)
			.map((task) => {
				const counts = record?.tasks[task.id] ?? { firstTime: 0, later: 0, notToday: 0 };
				return {
					task,
					counts,
					total: observationTotal(counts),
					percents: outcomePercents(counts),
					segments: outcomeSegments(counts)
				};
			})
	);
	const overall = $derived.by(() => {
		const counts = sumOutcomeCounts(rows.map((row) => row.counts));
		return {
			counts,
			total: observationTotal(counts),
			percents: outcomePercents(counts),
			segments: outcomeSegments(counts)
		};
	});
	const cycleCount = $derived(record?.cycleCount ?? 0);
	const hasData = $derived(overall.total > 0);

	function timesLabel(n: number): string {
		return n === 1 ? '1 time' : `${n} times`;
	}
</script>

<section class="stats" data-testid="routine-stats">
	<p class="lede">
		First-pass choices from <strong>Start fresh</strong> cycles on this device. Complete, Later, or
		Not Today — whichever you picked the first time through. <em>From last</em> runs are leftover
		work, so they are not counted.
	</p>

	{#if !hasData}
		<div class="card empty">
			<h2>No stats yet</h2>
			<p>Finish a full run with Start fresh and this page will fill in.</p>
		</div>
	{:else}
		<article class="card overall">
			<div class="overall-head">
				<h2>All tasks</h2>
				<p class="meta">
					{cycleCount}
					{cycleCount === 1 ? 'cycle' : 'cycles'} · {timesLabel(overall.total)}
				</p>
			</div>
			<ProgressBar
				segments={overall.segments}
				label="Overall first-pass mix"
				showPercent={false}
			/>
			<div class="ratios" aria-label="Overall ratios">
				<span class="ratio first">
					<strong>{overall.percents.firstTime}%</strong>
					First time
					<small>{timesLabel(overall.counts.firstTime)}</small>
				</span>
				<span class="ratio later">
					<strong>{overall.percents.later}%</strong>
					Later
					<small>{timesLabel(overall.counts.later)}</small>
				</span>
				<span class="ratio skipped">
					<strong>{overall.percents.notToday}%</strong>
					Not today
					<small>{timesLabel(overall.counts.notToday)}</small>
				</span>
			</div>
		</article>

		<ul class="legend" aria-hidden="true">
			<li><span class="swatch first"></span> First time</li>
			<li><span class="swatch later"></span> Later</li>
			<li><span class="swatch skipped"></span> Not today</li>
		</ul>

		<div class="task-stack">
			{#each rows as row, index (row.task.id)}
				<article class="card task" data-testid={`stats-task-${row.task.id}`}>
					<div class="task-head">
						<p class="num">{index + 1}</p>
						<div class="task-copy">
							<h3>{row.task.title.trim() || 'Untitled task'}</h3>
							<p class="meta">
								{#if row.total === 0}
									No first-pass data yet
								{:else}
									{timesLabel(row.total)}
								{/if}
							</p>
						</div>
					</div>
					{#if row.total > 0}
						<ProgressBar
							segments={row.segments}
							label={`${row.task.title} first-pass mix`}
							compact
							showPercent={false}
						/>
						<div class="ratios compact" aria-label={`${row.task.title} ratios`}>
							<span class="ratio first">
								<strong>{row.percents.firstTime}%</strong>
								First time
							</span>
							<span class="ratio later">
								<strong>{row.percents.later}%</strong>
								Later
							</span>
							<span class="ratio skipped">
								<strong>{row.percents.notToday}%</strong>
								Not today
							</span>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</section>

<style>
	.stats {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding-bottom: 1.5rem;
	}

	.lede {
		margin: 0;
		color: var(--ink-soft);
		line-height: 1.5;
		font-size: 0.95rem;
	}

	.lede strong,
	.lede em {
		color: var(--ink);
		font-style: normal;
		font-weight: 700;
	}

	.empty {
		padding: 1.4rem 1.15rem;
		text-align: center;
	}

	.empty h2 {
		margin: 0 0 0.35rem;
		font-family: var(--font-display);
		font-size: 1.35rem;
	}

	.empty p {
		margin: 0;
		color: var(--ink-soft);
		line-height: 1.45;
	}

	.overall,
	.task {
		padding: 1rem 1.05rem 1.05rem;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.overall-head,
	.task-head {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		min-width: 0;
	}

	.overall-head {
		flex-direction: column;
		gap: 0.15rem;
	}

	h2,
	h3 {
		margin: 0;
		font-family: var(--font-display);
		color: var(--ink);
		line-height: 1.2;
	}

	.overall h2 {
		font-size: 1.45rem;
	}

	.task h3 {
		font-size: 1.12rem;
		overflow-wrap: anywhere;
	}

	.meta {
		margin: 0;
		color: var(--muted);
		font-size: 0.82rem;
		font-weight: 600;
	}

	.num {
		margin: 0;
		flex-shrink: 0;
		width: 1.7rem;
		color: var(--muted);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		padding-top: 0.12rem;
	}

	.task-copy {
		min-width: 0;
		flex: 1;
	}

	.legend {
		list-style: none;
		margin: 0.15rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem 1rem;
		color: var(--muted);
		font-size: 0.8rem;
		font-weight: 600;
	}

	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.swatch {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 999px;
	}

	.swatch.first {
		background: var(--accent);
	}

	.swatch.later {
		background: var(--later);
	}

	.swatch.skipped {
		background: var(--not-today);
	}

	.task-stack {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.ratios {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.ratio {
		display: flex;
		flex-direction: column;
		gap: 0.08rem;
		padding: 0.55rem 0.5rem 0.6rem;
		border-radius: 0.85rem;
		font-size: 0.72rem;
		font-weight: 700;
		line-height: 1.25;
		text-align: center;
	}

	.ratio strong {
		font-size: 1.05rem;
		font-variant-numeric: tabular-nums;
		font-weight: 800;
	}

	.ratio small {
		font-size: 0.68rem;
		font-weight: 600;
		opacity: 0.85;
	}

	.ratio.first {
		background: var(--accent-soft);
		color: var(--accent-strong);
	}

	.ratio.later {
		background: var(--later);
		color: var(--on-later);
	}

	.ratio.skipped {
		background: var(--not-today);
		color: var(--on-not-today);
	}

	.ratios.compact .ratio {
		padding: 0.4rem 0.3rem 0.45rem;
	}

	.ratios.compact .ratio strong {
		font-size: 0.95rem;
	}

	@media (max-width: 420px) {
		.ratio {
			font-size: 0.66rem;
		}

		.ratio strong {
			font-size: 0.95rem;
		}
	}
</style>
