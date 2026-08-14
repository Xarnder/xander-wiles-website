<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import PromptDialog from '$lib/components/PromptDialog.svelte';
	import RoutineEditor from '$lib/components/RoutineEditor.svelte';
	import SetupRequired from '$lib/components/SetupRequired.svelte';
	import SignInGate from '$lib/components/SignInGate.svelte';
	import { getAuthStatus } from '$lib/stores/auth.svelte';
	import {
		deleteRoutine,
		getRoutineById,
		getRoutines,
		saveRoutine
	} from '$lib/stores/routines.svelte';
	import type { Routine } from '$lib/types/routine';
	import { createId } from '$lib/utils/id';
	import { normalizeOrders } from '$lib/utils/order';

	const status = $derived(getAuthStatus());
	const id = $derived(page.params.id ?? '');

	let routine = $state<Routine | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let deleting = $state(false);
	let duplicating = $state(false);
	let error = $state<string | null>(null);
	let notFound = $state(false);
	let confirmDelete = $state(false);
	let confirmDuplicate = $state(false);
	let duplicateName = $state('');
	let duplicateError = $state<string | null>(null);

	$effect(() => {
		const routineId = id;
		let cancelled = false;
		loading = true;
		notFound = false;
		void getRoutineById(routineId).then((found) => {
			if (cancelled) return;
			if (!found) {
				notFound = true;
				routine = null;
			} else {
				routine = {
					...found,
					description: found.description ?? '',
					icon: found.icon ?? '',
					tasks: found.tasks.map((task) => ({
						...task,
						description: task.description ?? ''
					}))
				};
			}
			loading = false;
		});
		return () => {
			cancelled = true;
		};
	});

	async function save() {
		if (!routine) return;
		const name = routine.name.trim();
		if (!name) {
			error = 'Give this routine a name.';
			return;
		}
		saving = true;
		error = null;
		const payload: Routine = {
			...routine,
			name,
			description: routine.description?.trim() || undefined,
			icon: routine.icon?.trim() || undefined,
			tasks: normalizeOrders(
				routine.tasks
					.map((task) => ({
						...task,
						title: task.title.trim(),
						description: task.description?.trim() || undefined
					}))
					.filter((task) => task.title.length > 0)
			),
			updatedAt: new Date().toISOString()
		};
		try {
			await saveRoutine(payload);
			await goto(resolve('/'));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save routine.';
		} finally {
			saving = false;
		}
	}

	async function removeRoutine() {
		if (!routine) return;
		deleting = true;
		error = null;
		try {
			await deleteRoutine(routine.id);
			confirmDelete = false;
			await goto(resolve('/'));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not delete routine.';
			confirmDelete = false;
		} finally {
			deleting = false;
		}
	}

	function openDuplicateDialog() {
		if (!routine) return;
		const trimmed = routine.name.trim();
		duplicateName = `${trimmed || 'Routine'} (copy)`;
		duplicateError = null;
		confirmDuplicate = true;
	}

	async function duplicateRoutine() {
		if (!routine || duplicating) return;
		const name = duplicateName.trim();
		if (!name) {
			duplicateError = 'Give the copy a name.';
			return;
		}
		duplicating = true;
		duplicateError = null;
		error = null;
		const now = new Date().toISOString();
		const copy: Routine = {
			id: createId(),
			name,
			description: routine.description?.trim() || undefined,
			icon: routine.icon?.trim() || undefined,
			tasks: normalizeOrders(
				routine.tasks
					.map((task) => ({
						...task,
						id: createId(),
						title: task.title.trim(),
						description: task.description?.trim() || undefined
					}))
					.filter((task) => task.title.length > 0)
			),
			sortOrder: getRoutines().length,
			createdAt: now,
			updatedAt: now
		};
		try {
			await saveRoutine(copy);
			confirmDuplicate = false;
			await goto(resolve('/routines/[id]/edit', { id: copy.id }));
		} catch (err) {
			duplicateError = err instanceof Error ? err.message : 'Could not duplicate routine.';
		} finally {
			duplicating = false;
		}
	}
</script>

{#if status === 'loading'}
	<p class="muted">Loading…</p>
{:else if status === 'setup_required'}
	<SetupRequired />
{:else if status === 'signed_out'}
	<SignInGate />
{:else if loading}
	<p class="muted">Loading routine…</p>
{:else if notFound || !routine}
	<p class="error-banner" role="alert">Routine not found.</p>
	<a class="btn btn-secondary" href={resolve('/')}>Back home</a>
{:else}
	<header class="page-header">
		<div>
			<h1>Edit routine</h1>
			<p>Update tasks and order, then save.</p>
		</div>
		<div class="header-actions">
			<a
				class="btn btn-secondary"
				href={resolve('/routines/[id]/stats', { id: routine.id })}
				data-testid="routine-stats"
			>
				Stats
			</a>
			<button
				type="button"
				class="btn btn-secondary"
				onclick={openDuplicateDialog}
				disabled={duplicating}
				data-testid="duplicate-routine"
			>
				Duplicate
			</button>
			<button
				type="button"
				class="btn btn-danger"
				onclick={() => (confirmDelete = true)}
				disabled={deleting}
				data-testid="delete-routine"
			>
				Delete routine
			</button>
		</div>
	</header>

	<RoutineEditor bind:routine {saving} {error} onsave={save} oncancel={() => goto(resolve('/'))} />
{/if}

<ConfirmDialog
	open={confirmDelete}
	title="Delete routine?"
	message="This permanently removes the routine and its tasks."
	confirmLabel={deleting ? 'Deleting…' : 'Delete'}
	danger
	onconfirm={removeRoutine}
	oncancel={() => (confirmDelete = false)}
/>

<PromptDialog
	open={confirmDuplicate}
	title="Duplicate routine"
	message="Create a copy of this routine with a new name. Unsaved edits are included."
	label="New routine name"
	bind:value={duplicateName}
	error={duplicateError}
	confirmLabel={duplicating ? 'Duplicating…' : 'Duplicate'}
	confirmDisabled={duplicating}
	inputTestId="duplicate-name"
	onconfirm={duplicateRoutine}
	oncancel={() => {
		if (duplicating) return;
		confirmDuplicate = false;
		duplicateError = null;
	}}
/>
