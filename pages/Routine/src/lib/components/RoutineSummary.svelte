<script lang="ts">
	import { scale } from 'svelte/transition';
	import ThemeToggle from './ThemeToggle.svelte';
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
</script>

<section class="summary" data-testid="routine-summary">
	<div class="top-bar">
		<ThemeToggle />
	</div>
	<div class="celebrate" in:scale={{ duration: 280, start: 0.86 }}>
		<div class="badge" aria-hidden="true">✓</div>
	</div>
	<p class="eyebrow">Routine complete</p>
	<h1>{routineName}</h1>
	<p class="stats" data-testid="summary-stats">
		<strong>{summary.completed}</strong> completed ·
		<strong>{summary.skipped}</strong> skipped ·
		<strong>{summary.percentComplete}%</strong>
	</p>

	<ul class="results">
		{#each summary.results as result (result.taskId)}
			<li class={result.status}>
				<span class="mark" aria-hidden="true">
					{result.status === 'completed' ? '✓' : '–'}
				</span>
				<span>
					<strong>{result.title}</strong>
					<small>
						{result.status === 'completed' ? 'Completed' : 'Skipped'}
					</small>
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
		min-height: 100dvh;
		padding: calc(1.2rem + var(--safe-top)) calc(1rem + var(--safe-right))
			calc(1.2rem + var(--safe-bottom)) calc(1rem + var(--safe-left));
		display: flex;
		flex-direction: column;
		width: min(720px, 100%);
		margin: 0 auto;
	}

	.top-bar {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.5rem;
	}

	.celebrate {
		display: grid;
		place-items: center;
		margin-bottom: 0.6rem;
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
	}

	h1 {
		margin: 0.35rem 0 0.55rem;
		font-family: var(--font-display);
		font-size: clamp(1.9rem, 6vw, 2.5rem);
	}

	.stats {
		margin: 0 0 1rem;
		color: var(--ink-soft);
	}

	.results {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		flex: 1;
	}

	.results li {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.7rem;
		align-items: center;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 0.85rem 0.95rem;
		color: var(--ink);
	}

	.results li.skipped,
	.results li.pending {
		background: var(--danger-soft);
		border: 1.5px solid var(--danger);
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
		background: var(--accent-soft);
		color: var(--accent-strong);
	}

	.skipped .mark,
	.pending .mark {
		background: color-mix(in srgb, #fff 18%, transparent);
		color: #fff;
	}

	li strong {
		display: block;
		color: var(--ink);
	}

	li.skipped strong,
	li.pending strong {
		color: #fff;
	}

	li small {
		color: var(--muted);
	}

	li.skipped small,
	li.pending small {
		color: color-mix(in srgb, #fff 78%, transparent);
		font-weight: 600;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin-top: 1rem;
	}
</style>
