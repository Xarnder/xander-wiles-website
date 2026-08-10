<script lang="ts">
	import type { RoutineTask } from '$lib/types/routine';

	let {
		task,
		index,
		ondragstart,
		onmoveup,
		onmovedown,
		ondelete,
		onupdate,
		isFirst = false,
		isLast = false,
		autofocus = false,
		dragging = false
	}: {
		task: RoutineTask;
		index: number;
		ondragstart: (event: PointerEvent) => void;
		onmoveup: () => void;
		onmovedown: () => void;
		ondelete: () => void;
		onupdate: (patch: Partial<RoutineTask>) => void;
		isFirst?: boolean;
		isLast?: boolean;
		autofocus?: boolean;
		dragging?: boolean;
	} = $props();

	let titleInput = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (!autofocus) return;
		const frame = requestAnimationFrame(() => {
			titleInput?.focus();
		});
		return () => cancelAnimationFrame(frame);
	});
</script>

<div class={['row', 'card', dragging && 'dragging']}>
	<button
		type="button"
		class="handle"
		aria-label={`Drag to reorder task ${index + 1}`}
		onpointerdown={ondragstart}
	>
		<span class="grip" aria-hidden="true">
			<span></span>
			<span></span>
			<span></span>
			<span></span>
			<span></span>
			<span></span>
		</span>
	</button>

	<div class="fields">
		<label class="sr-only" for={`task-title-${task.id}`}>Task title</label>
		<input
			id={`task-title-${task.id}`}
			bind:this={titleInput}
			value={task.title}
			placeholder="Task title"
			oninput={(event) => onupdate({ title: event.currentTarget.value })}
		/>
		<label class="sr-only" for={`task-desc-${task.id}`}>Task description</label>
		<textarea
			id={`task-desc-${task.id}`}
			value={task.description ?? ''}
			placeholder="Optional short description"
			rows="2"
			oninput={(event) => onupdate({ description: event.currentTarget.value })}></textarea>
		<div class="row-actions">
			<button type="button" class="btn btn-ghost" onclick={onmoveup} disabled={isFirst}>Up</button>
			<button type="button" class="btn btn-ghost" onclick={onmovedown} disabled={isLast}
				>Down</button
			>
			<button type="button" class="btn btn-danger" onclick={ondelete}>Delete</button>
		</div>
	</div>
</div>

<style>
	.row {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.65rem;
		padding: 0.7rem;
		align-items: center;
	}

	.row.dragging {
		opacity: 0.72;
		transform: scale(0.995);
	}

	.handle {
		appearance: none;
		border: 1px solid var(--line);
		background: var(--surface-strong);
		color: var(--ink-soft);
		cursor: grab;
		width: 3rem;
		min-width: 3rem;
		min-height: 3.4rem;
		height: 3.4rem;
		border-radius: 1rem;
		align-self: center;
		display: grid;
		place-items: center;
		padding: 0;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		-webkit-user-drag: none;
	}

	.handle:active {
		cursor: grabbing;
		background: var(--accent-soft);
		border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
	}

	.grip {
		display: grid;
		grid-template-columns: repeat(2, 0.35rem);
		grid-template-rows: repeat(3, 0.35rem);
		gap: 0.28rem;
		pointer-events: none;
	}

	.grip span {
		display: block;
		width: 0.35rem;
		height: 0.35rem;
		border-radius: 999px;
		background: currentColor;
		opacity: 0.75;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		min-width: 0;
	}

	input,
	textarea {
		width: 100%;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		padding: 0.7rem 0.8rem;
		background: var(--surface);
		color: var(--ink);
	}

	.row-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.row-actions .btn {
		min-height: 2.4rem;
		padding: 0.45rem 0.8rem;
	}
</style>
