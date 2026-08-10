<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Routine } from '$lib/types/routine';

	let {
		routine,
		onstart,
		ondragstart,
		dragging = false
	}: {
		routine: Routine;
		onstart: () => void;
		ondragstart?: (event: PointerEvent) => void;
		dragging?: boolean;
	} = $props();

	const taskCount = $derived(routine.tasks.length);
	const canStart = $derived(taskCount > 0);
	const editHref = $derived(resolve('/routines/[id]/edit', { id: routine.id }));
</script>

<article class={['card', 'routine-card', dragging && 'dragging', !ondragstart && 'no-drag']}>
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

	<div class="copy">
		{#if canStart}
			<button
				type="button"
				class="title-hit"
				onclick={onstart}
				aria-label={`Start ${routine.name}`}
			>
				<h2>{routine.name}</h2>
				<p>
					{taskCount}
					{taskCount === 1 ? 'task' : 'tasks'}
				</p>
			</button>
		{:else}
			<a class="title-hit" href={editHref} aria-label={`Add tasks to ${routine.name}`}>
				<h2>{routine.name}</h2>
				<p>0 tasks · add tasks to start</p>
			</a>
		{/if}
	</div>

	<div class="actions">
		{#if canStart}
			<button type="button" class="start-btn" onclick={onstart} data-testid={`start-${routine.id}`}>
				Start
			</button>
		{:else}
			<a class="start-btn add-tasks" href={editHref} data-testid={`start-${routine.id}`}
				>Add tasks</a
			>
		{/if}
		<a class="edit-btn" href={editHref}>Edit</a>
	</div>
</article>

<style>
	.routine-card {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr) auto;
		gap: 0;
		padding: 0;
		align-items: stretch;
		overflow: hidden;
		min-height: 5.5rem;
	}

	.routine-card.no-drag {
		grid-template-columns: auto minmax(0, 1fr) auto;
	}

	.routine-card.dragging {
		opacity: 0.7;
		transform: scale(0.99);
	}

	.drag-handle {
		border: none;
		background: transparent;
		color: var(--muted);
		min-width: 1.85rem;
		padding: 0;
		cursor: grab;
		font-size: 0.95rem;
		letter-spacing: -0.12em;
		align-self: stretch;
	}

	.icon {
		box-sizing: border-box;
		width: 4.35rem;
		min-height: calc(100% - 1.1rem);
		align-self: center;
		margin: 0.55rem 0 0.55rem 0.35rem;
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		font-size: 2.75rem;
		line-height: 1;
		padding: 0.15rem;
		border-radius: 1rem;
		border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--line));
	}

	.routine-card.no-drag .icon {
		margin-left: 0.55rem;
	}

	.copy {
		min-width: 0;
		display: flex;
		align-items: center;
		padding: 0.7rem 0.7rem 0.7rem 0.65rem;
	}

	.title-hit {
		border: none;
		background: transparent;
		text-align: left;
		padding: 0;
		cursor: pointer;
		color: inherit;
		text-decoration: none;
		width: 100%;
	}

	.copy h2 {
		margin: 0;
		font-size: 1.25rem;
		font-family: var(--font-display);
		color: var(--ink);
	}

	.copy p {
		margin: 0.2rem 0 0;
		color: var(--muted);
	}

	.actions {
		display: grid;
		grid-template-columns: 1.65fr 1fr;
		align-items: stretch;
		justify-self: end;
		height: 100%;
		min-width: 10rem;
		gap: 0.4rem;
		padding: 0.55rem 0.6rem 0.55rem 0.35rem;
		box-sizing: border-box;
	}

	.start-btn,
	.edit-btn {
		height: 100%;
		min-height: 100%;
		border-radius: 1rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		touch-action: manipulation;
		white-space: nowrap;
	}

	.start-btn {
		appearance: none;
		border: none;
		width: 100%;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 1.05rem;
		font-weight: 700;
		cursor: pointer;
		padding: 0 0.9rem;
		box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 26%, transparent);
	}

	.start-btn.add-tasks {
		background: var(--accent-soft);
		color: var(--accent-strong);
		box-shadow: none;
	}

	.start-btn:active,
	.edit-btn:active {
		transform: scale(0.985);
	}

	.edit-btn {
		border: 1px solid var(--line);
		background: var(--surface-strong);
		color: var(--ink-soft);
		font-weight: 600;
		font-size: 0.92rem;
		padding: 0 0.75rem;
	}
</style>
