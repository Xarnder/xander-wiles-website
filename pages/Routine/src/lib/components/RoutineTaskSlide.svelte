<script lang="ts">
	import type { RoutineTask } from '$lib/types/routine';
	import type { TaskStatus } from '$lib/types/run';
	import { fly } from 'svelte/transition';

	let {
		task,
		direction = 1,
		priorStatus = 'pending'
	}: {
		task: RoutineTask;
		direction?: number;
		priorStatus?: TaskStatus;
	} = $props();

	const statusLabel = $derived(
		priorStatus === 'completed'
			? 'Previously completed'
			: priorStatus === 'skipped'
				? 'Previously skipped'
				: null
	);
</script>

{#key task.id}
	<section
		class="slide"
		in:fly={{ x: direction * 28, duration: 160 }}
		out:fly={{ x: direction * -22, duration: 120 }}
		aria-live="polite"
	>
		<p class="eyebrow">Current task</p>
		{#if statusLabel}
			<p
				class={['status-chip', priorStatus === 'completed' ? 'done' : 'skipped']}
				data-testid="prior-status"
			>
				{statusLabel}
			</p>
		{/if}
		<h1>{task.title}</h1>
		{#if task.description}
			<p class="desc">{task.description}</p>
		{/if}
	</section>
{/key}

<style>
	.slide {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		padding: 0.35rem 0.15rem 0.5rem;
		min-height: 0;
		height: 100%;
	}

	.eyebrow {
		margin: 0 0 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--accent-strong);
	}

	.status-chip {
		margin: 0 0 0.65rem;
		align-self: flex-start;
		padding: 0.28rem 0.7rem;
		border-radius: 999px;
		font-size: 0.82rem;
		font-weight: 700;
		border: 1px solid var(--line);
	}

	.status-chip.done {
		background: var(--accent-soft);
		color: var(--accent-strong);
	}

	.status-chip.skipped {
		background: var(--mark-muted);
		color: var(--muted);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2.45rem, 11vw, 4.1rem);
		line-height: 1.08;
		letter-spacing: -0.035em;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.desc {
		margin: 0.85rem 0 0;
		color: var(--ink-soft);
		font-size: clamp(1.05rem, 3.2vw, 1.25rem);
		line-height: 1.45;
		max-width: 36rem;
	}
</style>
