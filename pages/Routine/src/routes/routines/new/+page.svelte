<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RoutineEditor from '$lib/components/RoutineEditor.svelte';
	import SetupRequired from '$lib/components/SetupRequired.svelte';
	import SignInGate from '$lib/components/SignInGate.svelte';
	import { getAuthStatus } from '$lib/stores/auth.svelte';
	import { getRoutines, saveRoutine } from '$lib/stores/routines.svelte';
	import type { Routine } from '$lib/types/routine';
	import { createId } from '$lib/utils/id';
	import { normalizeOrders } from '$lib/utils/order';

	const status = $derived(getAuthStatus());

	let saving = $state(false);
	let error = $state<string | null>(null);
	let routine = $state<Routine>({
		id: createId(),
		name: '',
		description: '',
		icon: '',
		tasks: [],
		sortOrder: getRoutines().length,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	});

	async function save() {
		const name = routine.name.trim();
		if (!name) {
			error = 'Give this routine a name.';
			return;
		}
		saving = true;
		error = null;
		const now = new Date().toISOString();
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
			sortOrder: routine.sortOrder,
			createdAt: routine.createdAt || now,
			updatedAt: now
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
</script>

{#if status === 'loading'}
	<p class="muted">Loading…</p>
{:else if status === 'setup_required'}
	<SetupRequired />
{:else if status === 'signed_out'}
	<SignInGate />
{:else}
	<header class="page-header">
		<div>
			<h1>Create routine</h1>
			<p>Add ordered tasks, then save.</p>
		</div>
	</header>

	<RoutineEditor
		bind:routine
		{saving}
		{error}
		autofocusName
		onsave={save}
		oncancel={() => goto(resolve('/'))}
	/>
{/if}
