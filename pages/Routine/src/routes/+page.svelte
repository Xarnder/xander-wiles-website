<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ResumeRunBanner from '$lib/components/ResumeRunBanner.svelte';
	import RoutineCard from '$lib/components/RoutineCard.svelte';
	import SetupRequired from '$lib/components/SetupRequired.svelte';
	import SignInGate from '$lib/components/SignInGate.svelte';
	import { signOutUser } from '$lib/firebase/auth';
	import { getAuthStatus } from '$lib/stores/auth.svelte';
	import { getRoutines, getRoutinesLoading, reorderRoutines } from '$lib/stores/routines.svelte';
	import {
		discardStoredRun,
		peekStoredRun,
		routineCanContinueFromLast,
		routineLastCyclePercent,
		startRun
	} from '$lib/stores/run.svelte';
	import type { StartMode } from '$lib/run/run-session';
	import { moveItem } from '$lib/utils/order';

	let dragIndex = $state<number | null>(null);
	let error = $state<string | null>(null);

	const status = $derived(getAuthStatus());
	const routines = $derived(getRoutines());
	const loading = $derived(getRoutinesLoading());
	const storedRun = $derived(peekStoredRun());

	function startRoutine(id: string, mode: StartMode = 'fresh') {
		const routine = routines.find((item) => item.id === id);
		if (!routine) return;
		if (routine.tasks.length === 0) {
			error = 'Add at least one task before starting this routine.';
			return;
		}
		if (mode === 'continue' && !routineCanContinueFromLast(routine)) {
			error = 'No previous cycle to continue from yet.';
			return;
		}
		error = null;
		startRun(routine, mode);
		void goto(resolve('/routines/[id]/run', { id: routine.id }));
	}

	function continueStoredRun() {
		const current = peekStoredRun();
		if (!current) return;
		void goto(resolve('/routines/[id]/run', { id: current.routineId }));
	}

	function discardRun() {
		discardStoredRun();
	}

	function onDragStart(index: number, event: PointerEvent) {
		dragIndex = index;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	async function onPointerMove(event: PointerEvent) {
		if (dragIndex === null) return;
		const el = document.elementFromPoint(event.clientX, event.clientY);
		const row = el?.closest('[data-routine-index]') as HTMLElement | null;
		if (!row) return;
		const to = Number(row.dataset.routineIndex);
		if (Number.isNaN(to) || to === dragIndex) return;
		const ordered = moveItem(routines, dragIndex, to).map((routine) => routine.id);
		dragIndex = to;
		try {
			await reorderRoutines(ordered);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not reorder routines.';
		}
	}

	function onPointerUp() {
		dragIndex = null;
	}
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

{#if status === 'loading'}
	<p class="muted">Loading…</p>
{:else if status === 'setup_required'}
	<SetupRequired />
{:else if status === 'signed_out'}
	<SignInGate />
{:else}
	<header class="page-header">
		<div>
			<p class="brand">Routine Manager</p>
			<h1>Your routines</h1>
			<p>Start fresh, or continue leftover tasks from last time.</p>
		</div>
		<button type="button" class="btn btn-ghost sign-out-btn" onclick={() => signOutUser()}
			>Sign Out</button
		>
	</header>

	{#if storedRun}
		<ResumeRunBanner
			routineName={storedRun.routineName}
			taskIndex={storedRun.currentIndex}
			taskTotal={storedRun.tasks.length}
			oncontinue={continueStoredRun}
			ondiscard={discardRun}
		/>
	{/if}

	{#if error}
		<p class="error-banner" role="alert">{error}</p>
	{/if}

	<div class="toolbar">
		<a class="btn btn-primary" href={resolve('/routines/new')} data-testid="create-routine"
			>Create New Routine</a
		>
	</div>

	{#if loading && routines.length === 0}
		<p class="muted">Loading routines…</p>
	{:else if routines.length === 0}
		<EmptyState
			title="No routines yet"
			message="Create your first morning, gym, or leaving-the-house checklist."
			actionLabel="Create New Routine"
			onaction={() => goto(resolve('/routines/new'))}
		/>
	{:else}
		<div class="stack" data-testid="routine-list">
			{#each routines as routine, index (routine.id)}
				<div data-routine-index={index}>
					<RoutineCard
						{routine}
						canContinue={routineCanContinueFromLast(routine)}
						lastPercent={routineLastCyclePercent(routine)}
						dragging={dragIndex === index}
						ondragstart={(event) => onDragStart(index, event)}
						onstartFresh={() => startRoutine(routine.id, 'fresh')}
						onstartFromLast={() => startRoutine(routine.id, 'continue')}
					/>
				</div>
			{/each}
		</div>
	{/if}
{/if}

<style>
	.brand {
		margin: 0;
		font-weight: 700;
		color: var(--accent-strong);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		font-size: 0.78rem;
	}

	.sign-out-btn {
		flex-shrink: 0;
		align-self: flex-start;
	}

	.toolbar {
		margin-bottom: 1rem;
	}

	.toolbar a {
		text-decoration: none;
		display: inline-flex;
	}

	@media (max-width: 640px) {
		.sign-out-btn {
			min-height: 2rem;
			padding: 0.28rem 0.65rem;
			font-size: 0.72rem;
			font-weight: 600;
			border-radius: 999px;
		}
	}
</style>
