<script lang="ts">
	import { resolve } from '$app/paths';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import { enabledTasks, type Routine } from '$lib/types/routine';
	import type { ProgressSegments } from '$lib/types/run';

	let {
		routine,
		canContinue = false,
		lastPercent = null,
		lastSegments = null,
		onstartFresh,
		onstartFromLast,
		ondragstart,
		dragging = false
	}: {
		routine: Routine;
		canContinue?: boolean;
		lastPercent?: number | null;
		lastSegments?: ProgressSegments | null;
		onstartFresh: () => void;
		onstartFromLast: () => void;
		ondragstart?: (event: PointerEvent) => void;
		dragging?: boolean;
	} = $props();

	const taskCount = $derived(routine.tasks.length);
	const enabledCount = $derived(enabledTasks(routine.tasks).length);
	const offCount = $derived(taskCount - enabledCount);
	const canStart = $derived(enabledCount > 0);
	const editHref = $derived(resolve('/routines/[id]/edit', { id: routine.id }));
</script>

<article class={['card', 'routine-card', dragging && 'dragging', !ondragstart && 'no-drag']}>
	<div class="title-row">
		{#if canStart}
			<button
				type="button"
				class="title-hit"
				onclick={onstartFresh}
				aria-label={`Start ${routine.name} fresh`}
			>
				<h2>{routine.name}</h2>
			</button>
		{:else}
			<a
				class="title-hit"
				href={editHref}
				aria-label={taskCount > 0
					? `Enable tasks in ${routine.name}`
					: `Add tasks to ${routine.name}`}
			>
				<h2>{routine.name}</h2>
			</a>
		{/if}
		{#if lastPercent !== null}
			<p
				class="last-percent"
				data-testid={`last-percent-${routine.id}`}
				aria-label={`Last run ${lastPercent}% complete`}
			>
				{lastPercent}%
			</p>
		{/if}
	</div>

	<div class="body-row">
		{#if ondragstart}
			<button
				type="button"
				class="drag-handle"
				aria-label={`Reorder ${routine.name}`}
				onpointerdown={ondragstart}
			>
				⋮⋮
			</button>
		{/if}

		<div class="icon" aria-hidden="true">{routine.icon || '✓'}</div>

		<p class="meta">
			{#if canStart}
				{enabledCount}
				{enabledCount === 1 ? 'task' : 'tasks'}
				{#if offCount > 0}
					· {offCount} off
				{/if}
			{:else if taskCount > 0}
				0 tasks · {offCount} off
			{:else}
				0 tasks · add tasks to start
			{/if}
		</p>

		<div class="actions">
			{#if canStart}
				<div class="start-stack">
					<button
						type="button"
						class="start-btn"
						onclick={onstartFresh}
						data-testid={`start-fresh-${routine.id}`}
						aria-label="Start fresh"
					>
						<span class="label-full">Start fresh</span>
						<span class="label-short">Fresh</span>
					</button>
					<button
						type="button"
						class="start-btn start-from-last"
						onclick={onstartFromLast}
						disabled={!canContinue}
						data-testid={`start-from-last-${routine.id}`}
						aria-label="Start from last completion"
						title={canContinue
							? 'Run leftover tasks — completed and not today are left out'
							: 'Finish a cycle first to unlock'}
					>
						<span class="label-full">From last</span>
						<span class="label-short">Last</span>
					</button>
				</div>
			{:else}
				<a class="start-btn add-tasks" href={editHref} data-testid={`start-fresh-${routine.id}`}>
					{taskCount > 0 ? 'Enable' : 'Add tasks'}
				</a>
			{/if}
			<a class="edit-btn" href={editHref}>Edit</a>
		</div>
	</div>

	{#if lastSegments}
		<div class="last-cycle" data-testid={`last-cycle-bar-${routine.id}`}>
			<ProgressBar segments={lastSegments} label="Last cycle" compact showPercent={false} />
		</div>
	{/if}
</article>

<style>
	.routine-card {
		container-type: inline-size;
		container-name: routine-card;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.55rem 0.55rem 0.5rem;
		align-items: stretch;
		overflow: visible;
		min-height: 0;
	}

	.routine-card.dragging {
		opacity: 0.7;
		transform: scale(0.99);
	}

	.title-row {
		width: 100%;
		min-width: 0;
		display: flex;
		align-items: flex-start;
		gap: 0.55rem;
	}

	.title-hit {
		border: none;
		background: transparent;
		text-align: left;
		padding: 0;
		cursor: pointer;
		color: inherit;
		text-decoration: none;
		display: block;
		min-width: 0;
		flex: 1 1 auto;
	}

	.last-percent {
		margin: 0;
		flex-shrink: 0;
		padding-top: 0.18rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		color: var(--muted);
		line-height: 1.2;
	}

	.title-row h2 {
		margin: 0;
		font-size: clamp(1.15rem, 2.8cqi + 0.65rem, 1.45rem);
		font-family: var(--font-display);
		color: var(--ink);
		line-height: 1.25;
		overflow-wrap: anywhere;
		word-break: break-word;
		white-space: normal;
	}

	.body-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		width: 100%;
	}

	.last-cycle {
		width: 100%;
		min-width: 0;
		padding: 0.05rem 0.1rem 0.1rem;
	}

	.drag-handle {
		border: none;
		background: transparent;
		color: var(--muted);
		min-width: 1.65rem;
		flex-shrink: 0;
		padding: 0;
		align-self: stretch;
		cursor: grab;
		font-size: 0.95rem;
		letter-spacing: -0.12em;
	}

	.icon {
		box-sizing: border-box;
		width: clamp(2.6rem, 10cqi, 3.5rem);
		aspect-ratio: 1;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		font-size: clamp(1.25rem, 5cqi, 1.85rem);
		line-height: 1;
		padding: 0.1rem;
		border-radius: 0.9rem;
		border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--line));
	}

	.meta {
		margin: 0;
		color: var(--muted);
		font-size: clamp(0.78rem, 1.5cqi + 0.45rem, 1rem);
		line-height: 1.3;
		min-width: 0;
		flex: 1 1 auto;
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	.actions {
		display: grid;
		grid-template-columns: auto auto;
		align-items: stretch;
		flex-shrink: 0;
		margin-left: auto;
		gap: 0.35rem;
		box-sizing: border-box;
	}

	.start-stack {
		display: grid;
		grid-template-columns: 1fr 1fr;
		align-items: stretch;
		gap: 0.35rem;
		width: 11.25rem;
	}

	.start-btn,
	.edit-btn {
		min-height: 2.75rem;
		border-radius: 0.95rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		touch-action: manipulation;
		text-align: center;
		line-height: 1.15;
	}

	.start-btn {
		appearance: none;
		border: none;
		width: 100%;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 0.86rem;
		font-weight: 700;
		cursor: pointer;
		padding: 0.35rem 0.5rem;
		box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 26%, transparent);
		white-space: normal;
	}

	.label-short {
		display: none;
	}

	.start-btn.start-from-last {
		background: var(--surface-strong);
		color: var(--accent-strong);
		border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line));
		box-shadow: none;
		font-weight: 600;
	}

	.start-btn.start-from-last:disabled {
		opacity: 0.45;
		cursor: not-allowed;
		color: var(--muted);
		border-color: var(--line);
	}

	.start-btn.add-tasks {
		background: var(--accent-soft);
		color: var(--accent-strong);
		box-shadow: none;
		font-size: 1.05rem;
		min-width: 5.75rem;
	}

	.start-btn:not(:disabled):active,
	.edit-btn:active {
		transform: scale(0.985);
	}

	.edit-btn {
		border: 1px solid var(--line);
		background: var(--surface-strong);
		color: var(--ink-soft);
		font-weight: 600;
		font-size: 0.9rem;
		padding: 0 0.7rem;
		white-space: nowrap;
		min-width: 3.75rem;
	}

	/* Slim phones: shrink icon / meta first, keep start buttons chunky. */
	@container routine-card (max-width: 440px) {
		.icon {
			width: 2.55rem;
			font-size: 1.45rem;
		}

		.label-full {
			display: none;
		}

		.label-short {
			display: inline;
		}

		.start-stack {
			width: 9.5rem;
		}

		.start-btn {
			font-size: 0.84rem;
			box-shadow: none;
			padding: 0.4rem 0.45rem;
		}

		.edit-btn {
			min-width: 3.35rem;
			padding: 0 0.55rem;
		}
	}

	@container routine-card (max-width: 360px) {
		.icon {
			width: 2.25rem;
			font-size: 1.25rem;
		}

		.drag-handle {
			min-width: 1.2rem;
		}

		.start-stack {
			width: 8.5rem;
		}

		.start-btn {
			font-size: 0.8rem;
		}

		.edit-btn {
			min-width: 3.1rem;
			padding: 0 0.45rem;
			font-size: 0.82rem;
		}
	}
</style>
