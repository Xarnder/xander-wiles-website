<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import TaskEditorRow from './TaskEditorRow.svelte';
	import { isTaskDisabled, enabledTasks, type Routine, type RoutineTask } from '$lib/types/routine';
	import { createId } from '$lib/utils/id';
	import { moveItem, normalizeOrders } from '$lib/utils/order';
	import { parseTaskListText } from '$lib/utils/parse-task-list';

	let {
		routine = $bindable(),
		saving = false,
		error = null,
		autofocusName = false,
		onsave,
		oncancel
	}: {
		routine: Routine;
		saving?: boolean;
		error?: string | null;
		autofocusName?: boolean;
		onsave: () => void;
		oncancel: () => void;
	} = $props();

	let dragIndex = $state<number | null>(null);
	let activePointerId: number | null = null;
	let taskListEl = $state<HTMLDivElement | null>(null);
	let showBatchPaste = $state(false);
	let batchText = $state('');
	let batchMessage = $state<string | null>(null);
	let compactOverview = $state(false);
	let focusTaskId = $state<string | null>(null);
	let nameInput = $state<HTMLInputElement | null>(null);
	let baseline = $state('');
	let confirmDiscard = $state(false);
	let confirmDeleteIndex = $state<number | null>(null);

	const batchPlaceholder = '1. Turn Off PC\n2. Unplugged Speakers\n3. Put left over food in fridge';

	const dirty = $derived(serializeRoutine(routine) !== baseline);
	const pendingDeleteTask = $derived(
		confirmDeleteIndex === null ? null : (routine.tasks[confirmDeleteIndex] ?? null)
	);
	const pendingDeleteMessage = $derived.by(() => {
		const title = pendingDeleteTask?.title.trim();
		if (!title) return 'This untitled task will be removed from the routine.';
		return `"${title}" will be removed from the routine.`;
	});

	onMount(() => {
		baseline = serializeRoutine(routine);
		if (autofocusName) {
			nameInput?.focus();
			nameInput?.select();
		}
		return () => {
			teardownDragListeners();
		};
	});

	function serializeRoutine(value: Routine): string {
		return JSON.stringify({
			name: value.name,
			icon: value.icon ?? '',
			description: value.description ?? '',
			tasks: value.tasks.map((task) => ({
				id: task.id,
				title: task.title,
				description: task.description ?? '',
				order: task.order,
				disabled: task.disabled === true
			}))
		});
	}

	async function addTask() {
		compactOverview = false;
		const next: RoutineTask = {
			id: createId(),
			title: '',
			description: '',
			order: routine.tasks.length
		};
		routine = {
			...routine,
			tasks: normalizeOrders([...routine.tasks, next])
		};
		focusTaskId = next.id;
		await tick();
	}

	function updateTask(index: number, patch: Partial<RoutineTask>) {
		routine = {
			...routine,
			tasks: routine.tasks.map((task, i) => (i === index ? { ...task, ...patch } : task))
		};
	}

	function requestDeleteTask(index: number) {
		confirmDiscard = false;
		confirmDeleteIndex = index;
	}

	function confirmDeleteTask() {
		if (confirmDeleteIndex === null) return;
		const index = confirmDeleteIndex;
		confirmDeleteIndex = null;
		deleteTask(index);
	}

	function deleteTask(index: number) {
		routine = {
			...routine,
			tasks: normalizeOrders(routine.tasks.filter((_, i) => i !== index))
		};
	}

	function moveTask(from: number, to: number) {
		routine = {
			...routine,
			tasks: normalizeOrders(moveItem(routine.tasks, from, to))
		};
	}

	function captureTarget(): Element {
		return taskListEl ?? document.documentElement;
	}

	function teardownDragListeners(): void {
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', endDrag);
		window.removeEventListener('pointercancel', endDrag);
		window.removeEventListener('touchmove', onTouchMoveBlock);
	}

	function onTouchMoveBlock(event: TouchEvent): void {
		if (dragIndex === null) return;
		event.preventDefault();
	}

	function onDragStart(index: number, event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();

		dragIndex = index;
		activePointerId = event.pointerId;

		try {
			captureTarget().setPointerCapture(event.pointerId);
		} catch {
			/* unsupported */
		}

		// Non-passive so we can cancel page scroll while dragging on touch devices.
		window.addEventListener('pointermove', onPointerMove, { passive: false });
		window.addEventListener('pointerup', endDrag);
		window.addEventListener('pointercancel', endDrag);
		window.addEventListener('touchmove', onTouchMoveBlock, { passive: false });
	}

	function onPointerMove(event: PointerEvent) {
		if (dragIndex === null) return;
		if (activePointerId !== null && event.pointerId !== activePointerId) return;
		event.preventDefault();

		const el = document.elementFromPoint(event.clientX, event.clientY);
		const row = el?.closest('[data-task-index]') as HTMLElement | null;
		if (!row) return;
		const to = Number(row.dataset.taskIndex);
		if (Number.isNaN(to) || to === dragIndex) return;
		moveTask(dragIndex, to);
		dragIndex = to;
	}

	function endDrag(event?: Event): void {
		if (
			event instanceof PointerEvent &&
			activePointerId !== null &&
			event.pointerId !== activePointerId
		) {
			return;
		}

		if (activePointerId !== null) {
			try {
				if (captureTarget().hasPointerCapture?.(activePointerId)) {
					captureTarget().releasePointerCapture(activePointerId);
				}
			} catch {
				/* ignore */
			}
		}

		dragIndex = null;
		activePointerId = null;
		teardownDragListeners();
	}

	function openBatchPaste() {
		showBatchPaste = true;
		batchMessage = null;
	}

	function cancelBatchPaste() {
		showBatchPaste = false;
		batchText = '';
		batchMessage = null;
	}

	async function importBatchTasks() {
		const titles = parseTaskListText(batchText);
		if (titles.length === 0) {
			batchMessage = 'Paste at least one task line first.';
			return;
		}

		const imported: RoutineTask[] = titles.map((title, index) => ({
			id: createId(),
			title,
			description: '',
			order: routine.tasks.length + index
		}));

		routine = {
			...routine,
			tasks: normalizeOrders([...routine.tasks, ...imported])
		};

		batchMessage = `Added ${imported.length} task${imported.length === 1 ? '' : 's'}.`;
		batchText = '';
		showBatchPaste = false;
		compactOverview = false;
		focusTaskId = imported[imported.length - 1]?.id ?? null;
		await tick();
	}

	function requestCancel() {
		confirmDeleteIndex = null;
		if (dirty && !saving) {
			confirmDiscard = true;
			return;
		}
		oncancel();
	}

	function onBeforeUnload(event: BeforeUnloadEvent) {
		if (!dirty || saving) return;
		event.preventDefault();
		event.returnValue = '';
	}
</script>

<svelte:window onbeforeunload={onBeforeUnload} />

<form
	class="stack editor"
	onsubmit={(event) => {
		event.preventDefault();
		onsave();
	}}
>
	<div class="field">
		<label for="routine-name">Routine name</label>
		<input
			id="routine-name"
			bind:this={nameInput}
			required
			bind:value={routine.name}
			placeholder="Morning routine"
			data-testid="routine-name"
		/>
	</div>

	<div class="field">
		<label for="routine-icon">Icon / emoji (optional)</label>
		<input id="routine-icon" bind:value={routine.icon} placeholder="☀️" maxlength="8" />
	</div>

	<div class="field">
		<label for="routine-description">Description (optional)</label>
		<textarea
			id="routine-description"
			bind:value={routine.description}
			placeholder="A short note about this routine"></textarea>
	</div>

	<div class="tasks-header">
		<div class="tasks-heading">
			<h2>Tasks</h2>
			<button
				type="button"
				class={['overview-toggle', compactOverview && 'is-on']}
				onclick={() => (compactOverview = !compactOverview)}
				aria-pressed={compactOverview}
				title={compactOverview ? 'Show full task editor' : 'Show compact numbered list'}
				data-testid="task-overview-toggle"
			>
				Overview
			</button>
		</div>
		<div class="task-actions">
			<button type="button" class="btn btn-ghost" onclick={openBatchPaste} data-testid="batch-paste"
				>Paste list</button
			>
			<button type="button" class="btn btn-secondary" onclick={addTask} data-testid="add-task"
				>Add task</button
			>
		</div>
	</div>

	{#if showBatchPaste}
		<div class="batch card" data-testid="batch-paste-panel">
			<label for="batch-tasks">Paste a numbered or plain list</label>
			<p class="hint">
				One task per line. Numbers like <code>1.</code> or bullets like <code>-</code> are stripped automatically.
			</p>
			<textarea
				id="batch-tasks"
				bind:value={batchText}
				rows="10"
				placeholder={batchPlaceholder}
				data-testid="batch-paste-input"></textarea>
			<div class="batch-actions">
				<button type="button" class="btn btn-ghost" onclick={cancelBatchPaste}>Cancel</button>
				<button
					type="button"
					class="btn btn-primary"
					onclick={importBatchTasks}
					data-testid="batch-paste-import"
				>
					Add tasks from list
				</button>
			</div>
		</div>
	{/if}

	{#if batchMessage}
		<p class="muted" data-testid="batch-paste-message">{batchMessage}</p>
	{/if}

	{#if routine.tasks.length === 0}
		<p class="muted">Add at least one task before you can run this routine.</p>
	{:else if enabledTasks(routine.tasks).length === 0}
		<p class="muted">All tasks are off. Enable one before you can run this routine.</p>
	{/if}

	{#if compactOverview && routine.tasks.length > 0}
		<ol class="overview-list" data-testid="task-overview">
			{#each routine.tasks as task, index (task.id)}
				<li class={[isTaskDisabled(task) && 'is-off']}>
					<span class="overview-num">{index + 1}.</span>
					<span class={['overview-title', !task.title.trim() && 'untitled']}>
						{task.title.trim() || 'Untitled task'}
					</span>
					{#if isTaskDisabled(task)}
						<span class="overview-off">off</span>
					{/if}
				</li>
			{/each}
		</ol>
	{:else}
		<div
			class={['stack', 'task-list', dragIndex !== null && 'is-dragging']}
			data-testid="task-list"
			bind:this={taskListEl}
		>
			{#each routine.tasks as task, index (task.id)}
				<div data-task-index={index}>
					<TaskEditorRow
						{task}
						{index}
						autofocus={focusTaskId === task.id}
						dragging={dragIndex === index}
						isFirst={index === 0}
						isLast={index === routine.tasks.length - 1}
						ondragstart={(event) => onDragStart(index, event)}
						onmoveup={() => moveTask(index, index - 1)}
						onmovedown={() => moveTask(index, index + 1)}
						ondelete={() => requestDeleteTask(index)}
						onupdate={(patch) => updateTask(index, patch)}
					/>
				</div>
			{/each}
		</div>
	{/if}

	{#if error}
		<p class="error-banner" role="alert">{error}</p>
	{/if}

	<div class="footer-actions" data-testid="editor-footer">
		<button type="button" class="btn btn-ghost" onclick={requestCancel}>Cancel</button>
		<button type="submit" class="btn btn-primary" disabled={saving} data-testid="save-routine">
			{saving ? 'Saving…' : 'Save routine'}
		</button>
	</div>
</form>

<ConfirmDialog
	open={confirmDiscard}
	title="Discard changes?"
	message="You have unsaved edits. Leave without saving?"
	confirmLabel="Discard"
	danger
	onconfirm={() => {
		confirmDiscard = false;
		oncancel();
	}}
	oncancel={() => (confirmDiscard = false)}
/>

<ConfirmDialog
	open={confirmDeleteIndex !== null}
	title="Delete task?"
	message={pendingDeleteMessage}
	confirmLabel="Delete"
	danger
	onconfirm={confirmDeleteTask}
	oncancel={() => (confirmDeleteIndex = null)}
/>

<style>
	.editor {
		padding-bottom: 0;
	}

	.tasks-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.tasks-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		color: var(--ink);
	}

	.tasks-heading {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-width: 0;
	}

	.overview-toggle {
		appearance: none;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink-soft);
		border-radius: 999px;
		min-height: 2.1rem;
		padding: 0 0.75rem;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		touch-action: manipulation;
	}

	.overview-toggle.is-on {
		border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
		background: var(--accent-soft);
		color: var(--accent-strong);
	}

	.overview-list {
		list-style: none;
		margin: 0;
		padding: 0.45rem 0.85rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
	}

	.overview-list li {
		display: grid;
		grid-template-columns: 1.85rem minmax(0, 1fr) auto;
		gap: 0.35rem;
		align-items: baseline;
		padding: 0.28rem 0;
		border-bottom: 1px solid var(--line);
		font-size: 0.95rem;
		line-height: 1.35;
	}

	.overview-list li.is-off .overview-title {
		color: var(--muted);
		text-decoration: line-through;
		text-decoration-thickness: 2px;
	}

	.overview-off {
		justify-self: end;
		padding: 0.08rem 0.45rem;
		border-radius: 999px;
		background: var(--mark-muted);
		color: var(--muted);
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.overview-list li:last-child {
		border-bottom: none;
	}

	.overview-num {
		color: var(--muted);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.overview-title {
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.overview-title.untitled {
		color: var(--muted);
		font-style: italic;
	}

	.task-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.batch {
		padding: 0.95rem;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.batch label {
		font-weight: 600;
		color: var(--ink-soft);
	}

	.hint {
		margin: 0;
		color: var(--muted);
		font-size: 0.92rem;
		line-height: 1.4;
	}

	.batch textarea {
		width: 100%;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		padding: 0.85rem 0.95rem;
		background: var(--surface);
		color: var(--ink);
		resize: vertical;
		min-height: 12rem;
	}

	.batch-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.footer-actions {
		display: flex;
		gap: 0.6rem;
		justify-content: flex-end;
		position: sticky;
		bottom: 0;
		z-index: 6;
		margin-left: calc(-1 * (var(--shell-pad-x) + var(--safe-left)));
		margin-right: calc(-1 * (var(--shell-pad-x) + var(--safe-right)));
		margin-bottom: calc(-1 * (var(--shell-pad-bottom) + var(--safe-bottom)));
		padding: 0.75rem calc(var(--shell-pad-x) + var(--safe-right)) calc(0.85rem + var(--safe-bottom))
			calc(var(--shell-pad-x) + var(--safe-left));
		background: color-mix(in srgb, var(--bg-1) 92%, transparent);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
		box-shadow: 0 -0.75rem 1.25rem color-mix(in srgb, var(--bg-1) 55%, transparent);
	}

	.task-list {
		gap: 0.35rem;
	}

	.task-list.is-dragging {
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.task-list.is-dragging :global(.row) {
		touch-action: none;
	}
</style>
