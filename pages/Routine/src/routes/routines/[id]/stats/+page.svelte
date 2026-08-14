<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import RoutineStats from '$lib/components/RoutineStats.svelte';
	import SetupRequired from '$lib/components/SetupRequired.svelte';
	import SignInGate from '$lib/components/SignInGate.svelte';
	import { getAuthStatus } from '$lib/stores/auth.svelte';
	import { getRoutineById } from '$lib/stores/routines.svelte';
	import type { Routine } from '$lib/types/routine';

	const status = $derived(getAuthStatus());
	const id = $derived(page.params.id ?? '');

	let routine = $state<Routine | null>(null);
	let loading = $state(true);
	let notFound = $state(false);

	$effect(() => {
		const routineId = id;
		let cancelled = false;
		loading = true;
		notFound = false;
		void getRoutineById(routineId).then((found) => {
			if (cancelled) return;
			routine = found;
			notFound = !found;
			loading = false;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:head>
	<title>{routine ? `${routine.name} stats` : 'Routine stats'}</title>
</svelte:head>

{#if status === 'loading'}
	<p class="muted">Loading…</p>
{:else if status === 'setup_required'}
	<SetupRequired />
{:else if status === 'signed_out'}
	<SignInGate />
{:else if loading}
	<p class="muted">Loading stats…</p>
{:else if notFound || !routine}
	<p class="error-banner" role="alert">Routine not found.</p>
	<a class="btn btn-secondary" href={resolve('/')}>Back home</a>
{:else}
	<header class="page-header">
		<div>
			<p class="eyebrow">{routine.name}</p>
			<h1>Stats</h1>
			<p>How often each task is done first time, left for later, or skipped today.</p>
		</div>
		<div class="header-actions">
			<a
				class="btn btn-ghost"
				href={resolve('/routines/[id]/edit', { id: routine.id })}
				data-testid="stats-back-edit">Back to edit</a
			>
		</div>
	</header>

	<RoutineStats {routine} />
{/if}

<style>
	.eyebrow {
		margin: 0 0 0.2rem;
		font-size: 0.82rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--accent-strong);
	}
</style>
