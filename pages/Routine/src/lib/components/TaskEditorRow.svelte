<script lang="ts">
	import { tick } from 'svelte';
	import { isTaskDisabled, type RoutineTask } from '$lib/types/routine';

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
	let descriptionInput = $state<HTMLTextAreaElement | null>(null);
	let menuBtn = $state<HTMLButtonElement | null>(null);
	let menuEl = $state<HTMLDivElement | null>(null);
	let menuOpen = $state(false);
	let addingDescription = $state(false);

	const isOff = $derived(isTaskDisabled(task));
	const hasDescription = $derived(Boolean(task.description?.trim()));
	const showDescription = $derived(addingDescription || hasDescription);

	$effect(() => {
		if (!autofocus) return;
		const frame = requestAnimationFrame(() => {
			titleInput?.focus();
		});
		return () => cancelAnimationFrame(frame);
	});

	function closeMenu() {
		menuOpen = false;
	}

	function toggleMenu(event: MouseEvent) {
		event.stopPropagation();
		menuOpen = !menuOpen;
	}

	function onWindowPointerDown(event: PointerEvent) {
		if (!menuOpen) return;
		const target = event.target as Node | null;
		if (!target) return;
		if (menuEl?.contains(target) || menuBtn?.contains(target)) return;
		closeMenu();
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (!menuOpen) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			closeMenu();
			menuBtn?.focus();
		}
	}

	function runAndClose(action: () => void) {
		closeMenu();
		action();
	}

	async function addDescription() {
		closeMenu();
		addingDescription = true;
		await tick();
		descriptionInput?.focus();
	}

	function removeDescription() {
		closeMenu();
		addingDescription = false;
		onupdate({ description: '' });
	}

	function onDescriptionBlur() {
		if (task.description?.trim()) return;
		addingDescription = false;
		if (task.description) onupdate({ description: '' });
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} />

<div
	class={['row', 'card', dragging && 'dragging', isOff && 'is-off', menuOpen && 'menu-open']}
	data-testid={`task-row-${index}`}
>
	<div class="main">
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

		<div class="title-wrap">
			<label class="sr-only" for={`task-title-${task.id}`}>Task title</label>
			<input
				id={`task-title-${task.id}`}
				class={[isOff && 'is-off', isOff && 'has-chip']}
				bind:this={titleInput}
				value={task.title}
				placeholder="Task title"
				oninput={(event) => onupdate({ title: event.currentTarget.value })}
			/>
			{#if isOff}
				<span
					class="off-chip"
					data-testid={`task-off-banner-${task.id}`}
					title="Skipped when this routine runs"
				>
					Off
				</span>
			{/if}
		</div>

		<div class="menu-wrap">
			<button
				type="button"
				class="menu-btn"
				bind:this={menuBtn}
				onclick={toggleMenu}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				aria-label={`Edit task ${index + 1}`}
				data-testid={`task-menu-${index}`}
			>
				<span class="dots" aria-hidden="true">
					<span></span>
					<span></span>
					<span></span>
				</span>
			</button>

			{#if menuOpen}
				<div
					class={['menu', isLast && 'opens-up']}
					bind:this={menuEl}
					role="menu"
					aria-label={`Task ${index + 1} actions`}
					data-testid={`task-menu-panel-${index}`}
				>
					<button
						type="button"
						class="menu-item"
						role="menuitem"
						onclick={() => runAndClose(onmoveup)}
						disabled={isFirst}
					>
						Move up
					</button>
					<button
						type="button"
						class="menu-item"
						role="menuitem"
						onclick={() => runAndClose(onmovedown)}
						disabled={isLast}
					>
						Move down
					</button>
					<button
						type="button"
						class="menu-item"
						role="menuitem"
						onclick={() => runAndClose(() => onupdate({ disabled: !isOff }))}
						data-testid={`toggle-task-disabled-${index}`}
					>
						{isOff ? 'Enable task' : 'Disable task'}
					</button>
					{#if hasDescription}
						<button type="button" class="menu-item" role="menuitem" onclick={removeDescription}>
							Remove description
						</button>
					{:else}
						<button
							type="button"
							class="menu-item"
							role="menuitem"
							onclick={addDescription}
							data-testid={`add-task-description-${index}`}
						>
							Add optional description
						</button>
					{/if}
					<button
						type="button"
						class="menu-item danger"
						role="menuitem"
						onclick={() => runAndClose(ondelete)}
						data-testid={`delete-task-${index}`}
					>
						Delete
					</button>
				</div>
			{/if}
		</div>
	</div>

	{#if showDescription}
		<div class="description">
			<label class="sr-only" for={`task-desc-${task.id}`}>Task description</label>
			<textarea
				id={`task-desc-${task.id}`}
				class={[isOff && 'is-off']}
				bind:this={descriptionInput}
				value={task.description ?? ''}
				placeholder="Optional short description"
				rows="2"
				oninput={(event) => onupdate({ description: event.currentTarget.value })}
				onblur={onDescriptionBlur}></textarea>
		</div>
	{/if}
</div>

<style>
	.row {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.28rem 0.32rem;
		border-radius: var(--radius-md);
		position: relative;
		overflow: visible;
		box-shadow: var(--shadow-soft);
	}

	.row.menu-open {
		z-index: 24;
	}

	.row.dragging {
		opacity: 0.72;
		transform: scale(0.995);
	}

	.row.is-off {
		border-style: dashed;
		border-color: color-mix(in srgb, var(--muted) 55%, var(--line));
		background: color-mix(in srgb, var(--surface) 72%, var(--bg-1));
		box-shadow: none;
		opacity: 0.86;
	}

	.main {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.35rem;
		align-items: center;
	}

	.title-wrap {
		position: relative;
		min-width: 0;
	}

	.off-chip {
		position: absolute;
		right: 0.4rem;
		top: 50%;
		transform: translateY(-50%);
		padding: 0.08rem 0.4rem;
		border-radius: 999px;
		background: var(--mark-muted);
		color: var(--muted);
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		pointer-events: none;
	}

	.handle,
	.menu-btn {
		appearance: none;
		border: 1px solid var(--line);
		background: var(--surface-strong);
		color: var(--ink-soft);
		width: 2.35rem;
		min-width: 2.35rem;
		height: 2.35rem;
		border-radius: 0.75rem;
		display: grid;
		place-items: center;
		padding: 0;
		flex-shrink: 0;
	}

	.handle {
		cursor: grab;
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

	.menu-btn {
		cursor: pointer;
	}

	.menu-btn[aria-expanded='true'] {
		background: var(--accent-soft);
		border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
		color: var(--accent-strong);
	}

	.grip {
		display: grid;
		grid-template-columns: repeat(2, 0.28rem);
		grid-template-rows: repeat(3, 0.28rem);
		gap: 0.2rem;
		pointer-events: none;
	}

	.grip span,
	.dots span {
		display: block;
		width: 0.28rem;
		height: 0.28rem;
		border-radius: 999px;
		background: currentColor;
		opacity: 0.75;
	}

	.dots {
		display: flex;
		flex-direction: column;
		gap: 0.18rem;
		pointer-events: none;
	}

	input,
	textarea {
		width: 100%;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		padding: 0.42rem 0.6rem;
		background: var(--surface);
		color: var(--ink);
	}

	.title-wrap input {
		min-height: 2.35rem;
	}

	.title-wrap input.has-chip {
		padding-right: 2.6rem;
	}

	input.is-off,
	textarea.is-off {
		text-decoration: line-through;
		text-decoration-thickness: 2px;
		color: var(--muted);
		background: color-mix(in srgb, var(--surface) 70%, var(--bg-1));
	}

	.description textarea {
		min-height: 3.1rem;
		resize: vertical;
	}

	.menu-wrap {
		position: relative;
	}

	.menu {
		position: absolute;
		top: calc(100% + 0.28rem);
		right: 0;
		z-index: 20;
		min-width: 11.5rem;
		display: flex;
		flex-direction: column;
		padding: 0.28rem;
		background: var(--surface-strong);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow);
	}

	.menu.opens-up {
		top: auto;
		bottom: calc(100% + 0.28rem);
	}

	.menu-item {
		appearance: none;
		border: none;
		background: transparent;
		color: var(--ink);
		text-align: left;
		border-radius: 0.65rem;
		padding: 0.55rem 0.7rem;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		min-height: 2.35rem;
	}

	.menu-item:hover:not(:disabled) {
		background: var(--accent-soft);
		color: var(--accent-strong);
	}

	.menu-item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.menu-item.danger {
		color: var(--danger);
	}

	.menu-item.danger:hover:not(:disabled) {
		background: var(--danger-soft);
		color: var(--danger);
	}
</style>
