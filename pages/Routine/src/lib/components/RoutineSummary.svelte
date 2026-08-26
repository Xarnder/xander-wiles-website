<script lang="ts">
	import { scale } from 'svelte/transition';
	import ConfettiBurst from './ConfettiBurst.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import { statusCaption } from '$lib/run/summary';
	import type { RoutineSummaryStats } from '$lib/types/run';

	let {
		routineName,
		summary,
		onfinish,
		onagain
	}: {
		routineName: string;
		summary: RoutineSummaryStats;
		onfinish: () => void;
		onagain: () => void;
	} = $props();

	function resultClass(status: RoutineSummaryStats['results'][number]['status']): string {
		if (status === 'pending') return 'later';
		return status;
	}

	function resultMark(status: RoutineSummaryStats['results'][number]['status']): string {
		if (status === 'completed') return '✓';
		if (status === 'later' || status === 'pending') return '→';
		return '–';
	}
</script>

<section class="summary" data-testid="routine-summary">
	<ConfettiBurst />
	<div class="top-bar">
		<ThemeToggle />
	</div>
	<div class="intro">
		<div class="celebrate" in:scale={{ duration: 280, start: 0.86 }}>
			<div class="badge" aria-hidden="true">✓</div>
		</div>
		<p class="eyebrow">Routine complete</p>
		<h1>{routineName}</h1>
		<p class="stats" data-testid="summary-stats">
			<span class="stat completed" data-testid="summary-complete">
				<strong>{summary.completed}</strong> Complete
			</span>
			<span class="stat later" data-testid="summary-later">
				<strong>{summary.later}</strong> Later
			</span>
			<span class="stat skipped" data-testid="summary-not-today">
				<strong>{summary.skipped}</strong> Not Today
			</span>
		</p>
		<p class="percent">{summary.percentComplete}%</p>
	</div>

	<ul class="results">
		{#each summary.results as result (result.taskId)}
			<li class={resultClass(result.status)}>
				<span class="mark" aria-hidden="true">{resultMark(result.status)}</span>
				<span>
					<strong>{result.title}</strong>
					<small>{statusCaption(result.status)}</small>
				</span>
			</li>
		{/each}
	</ul>

	<div class="actions">
		<button
			type="button"
			class="btn btn-primary btn-block"
			onclick={onfinish}
			data-testid="finish-home"
		>
			Finish / Return Home
		</button>
		<button
			type="button"
			class="btn btn-secondary btn-block"
			onclick={onagain}
			data-testid="run-again"
		>
			Run Again
		</button>
	</div>
</section>

<style>
	.summary {
		position: relative;
		height: 100dvh;
		max-height: 100dvh;
		height: 100svh;
		max-height: 100svh;
		padding: calc(1.2rem + var(--safe-top)) calc(1rem + var(--safe-right)) 0
			calc(1rem + var(--safe-left));
		display: flex;
		flex-direction: column;
		width: min(720px, 100%);
		margin: 0 auto;
		box-sizing: border-box;
		overflow: hidden;
	}

	.intro {
		flex-shrink: 0;
	}

	.top-bar {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.5rem;
		flex-shrink: 0;
	}

	.celebrate {
		display: grid;
		place-items: center;
		margin-bottom: 0.6rem;
		flex-shrink: 0;
	}

	.badge {
		width: 4rem;
		height: 4rem;
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 1.8rem;
		font-weight: 700;
		box-shadow: 0 12px 30px color-mix(in srgb, var(--accent) 30%, transparent);
		animation: pulse 900ms ease;
	}

	@keyframes pulse {
		0% {
			transform: scale(0.92);
		}
		60% {
			transform: scale(1.06);
		}
		100% {
			transform: scale(1);
		}
	}

	.eyebrow {
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--accent-strong);
		flex-shrink: 0;
	}

	h1 {
		margin: 0.35rem 0 0.55rem;
		font-family: var(--font-display);
		font-size: clamp(1.9rem, 6vw, 2.5rem);
		flex-shrink: 0;
	}

	.stats {
		margin: 0 0 0.45rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		flex-shrink: 0;
	}

	.stat {
		display: inline-flex;
		align-items: baseline;
		gap: 0.3rem;
		padding: 0.32rem 0.7rem;
		border-radius: 999px;
		font-size: 0.82rem;
		font-weight: 700;
	}

	.stat strong {
		font-size: 1rem;
	}

	.stat.completed {
		background: var(--accent);
		color: var(--on-accent);
	}

	.stat.later {
		background: var(--later);
		color: var(--on-later);
	}

	.stat.skipped {
		background: var(--not-today);
		color: var(--on-not-today);
	}

	.percent {
		margin: 0 0 0.85rem;
		color: var(--muted);
		font-size: 0.88rem;
		font-weight: 600;
		flex-shrink: 0;
	}

	.results {
		list-style: none;
		margin: 0;
		padding: 0 0 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		touch-action: pan-y;
	}

	.results li {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.7rem;
		align-items: center;
		border-radius: var(--radius-md);
		padding: 0.85rem 0.95rem;
	}

	.results li.completed {
		background: var(--accent-soft);
		border: 1.5px solid var(--accent);
		color: var(--ink);
	}

	.results li.later {
		background: var(--later);
		border: 1.5px solid color-mix(in srgb, var(--later) 70%, #fff);
		color: var(--on-later);
	}

	.results li.skipped {
		background: var(--not-today);
		border: 1.5px solid color-mix(in srgb, var(--not-today) 70%, #fff);
		color: var(--on-not-today);
	}

	.mark {
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 999px;
		display: grid;
		place-items: center;
		font-weight: 700;
	}

	.completed .mark {
		background: var(--accent);
		color: var(--on-accent);
	}

	.later .mark,
	.skipped .mark {
		background: color-mix(in srgb, #fff 18%, transparent);
		color: #fff;
	}

	li strong {
		display: block;
	}

	li.completed strong {
		color: var(--ink);
	}

	li.later strong,
	li.skipped strong {
		color: #fff;
	}

	li small {
		font-weight: 600;
	}

	li.completed small {
		color: var(--accent-strong);
	}

	li.later small,
	li.skipped small {
		color: color-mix(in srgb, #fff 78%, transparent);
	}

	.actions {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 0.85rem 0 calc(1.1rem + var(--safe-bottom));
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--bg-end) 0%, transparent),
			var(--bg-end) 0.65rem,
			var(--bg-end)
		);
	}

	@media (orientation: landscape) and (max-height: 640px) {
		.summary {
			display: grid;
			grid-template-columns: minmax(13.5rem, 36%) minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr) auto;
			grid-template-areas:
				'top top'
				'intro results'
				'actions results';
			align-content: stretch;
			width: 100%;
			max-width: none;
			column-gap: 0.85rem;
			row-gap: 0.4rem;
			padding: calc(0.4rem + var(--safe-top)) calc(0.75rem + var(--safe-right))
				calc(0.45rem + var(--safe-bottom)) calc(0.75rem + var(--safe-left));
		}

		.top-bar {
			grid-area: top;
			margin-bottom: 0;
		}

		.intro {
			grid-area: intro;
			min-height: 0;
			overflow: auto;
			display: flex;
			flex-direction: column;
			justify-content: center;
		}

		.celebrate {
			display: none;
		}

		.eyebrow {
			font-size: 0.7rem;
		}

		h1 {
			margin: 0.15rem 0 0.4rem;
			font-size: clamp(1.2rem, 3.6vw, 1.8rem);
		}

		.stats {
			margin-bottom: 0.3rem;
		}

		.stat {
			padding: 0.22rem 0.55rem;
			font-size: 0.75rem;
		}

		.stat strong {
			font-size: 0.88rem;
		}

		.percent {
			margin: 0;
			font-size: 0.8rem;
		}

		.results {
			grid-area: results;
			min-height: 0;
			height: 100%;
			overflow-y: auto;
			padding: 0;
			gap: 0.4rem;
		}

		.results li {
			padding: 0.5rem 0.7rem;
			gap: 0.5rem;
		}

		.actions {
			grid-area: actions;
			flex-direction: row;
			align-items: stretch;
			gap: 0.45rem;
			padding: 0.2rem 0 0;
			background: none;
		}

		.actions .btn {
			width: auto;
			flex: 1 1 0;
			min-height: 2.55rem;
			font-size: 0.86rem;
			padding: 0.4rem 0.55rem;
		}
	}
</style>
