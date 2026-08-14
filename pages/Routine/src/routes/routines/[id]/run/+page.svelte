<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import RoutineControls from '$lib/components/RoutineControls.svelte';
	import RoutineSummary from '$lib/components/RoutineSummary.svelte';
	import RoutineTaskSlide from '$lib/components/RoutineTaskSlide.svelte';
	import SetupRequired from '$lib/components/SetupRequired.svelte';
	import SignInGate from '$lib/components/SignInGate.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { getAuthStatus } from '$lib/stores/auth.svelte';
	import { getRoutineById } from '$lib/stores/routines.svelte';
	import {
		backOne,
		clearRun,
		completeAndNext,
		getActiveTask,
		getRunSession,
		getRunSummary,
		restartRun,
		laterAndNext,
		notTodayAndNext,
		restoreRunFromStorage,
		runCanDefer,
		runCanGoBack,
		runHasProgress,
		startRun
	} from '$lib/stores/run.svelte';
	import { getProgressSegments } from '$lib/run/run-session';
	import type { Routine } from '$lib/types/routine';
	import { hapticCelebrate } from '$lib/utils/haptics';
	import { lockLandscape, unlockOrientation } from '$lib/utils/orientation';
	import { releaseWakeLock, requestWakeLock } from '$lib/utils/wake-lock';
	import { isForceLandscape } from '$lib/stores/preferences.svelte';

	const status = $derived(getAuthStatus());
	const id = $derived(page.params.id ?? '');
	const session = $derived(getRunSession());
	const summary = $derived(getRunSummary());
	const activeTask = $derived(getActiveTask());
	const canBack = $derived(runCanGoBack());
	const canLater = $derived(runCanDefer());
	const priorStatus = $derived(
		session && activeTask ? (session.statuses[activeTask.id] ?? 'pending') : 'pending'
	);

	let routine = $state<Routine | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let confirmExit = $state(false);

	$effect(() => {
		const routineId = id;
		let cancelled = false;
		loading = true;
		error = null;
		void getRoutineById(routineId).then((found) => {
			if (cancelled) return;
			routine = found;
			if (!found) {
				error = 'Routine not found.';
				loading = false;
				return;
			}
			if (found.tasks.length === 0) {
				error = 'This routine has no tasks.';
				loading = false;
				return;
			}
			const current = getRunSession();
			if (!current || current.routineId !== found.id) {
				const restored = restoreRunFromStorage(found.id);
				if (!restored) startRun(found);
			}
			loading = false;
		});
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		const running = session?.phase === 'running';
		if (!running) {
			void releaseWakeLock();
			return;
		}
		void requestWakeLock();
		const onVisibility = () => {
			if (document.visibilityState === 'visible' && getRunSession()?.phase === 'running') {
				void requestWakeLock();
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			void releaseWakeLock();
		};
	});

	$effect(() => {
		const force = isForceLandscape();
		const running = session?.phase === 'running';
		if (!force || !running) {
			unlockOrientation();
			document.documentElement.classList.remove('routine-force-landscape');
			return;
		}

		document.documentElement.classList.add('routine-force-landscape');
		void lockLandscape();

		const reacquire = () => {
			if (document.visibilityState === 'visible' && getRunSession()?.phase === 'running') {
				void lockLandscape();
			}
		};
		document.addEventListener('visibilitychange', reacquire);

		return () => {
			document.removeEventListener('visibilitychange', reacquire);
			unlockOrientation();
			document.documentElement.classList.remove('routine-force-landscape');
		};
	});

	const forceLandscapeRun = $derived(
		isForceLandscape() && session?.phase === 'running'
	);
	const progress = $derived(session ? getProgressSegments(session) : null);

	function maybeCelebrate() {
		if (getRunSession()?.phase === 'summary') hapticCelebrate();
	}

	function complete() {
		completeAndNext();
		maybeCelebrate();
	}

	function later() {
		laterAndNext();
	}

	function notToday() {
		notTodayAndNext();
		maybeCelebrate();
	}

	function back() {
		backOne();
	}

	function requestExit() {
		if (runHasProgress()) {
			confirmExit = true;
			return;
		}
		exitNow();
	}

	function exitNow() {
		confirmExit = false;
		clearRun();
		void goto(resolve('/'));
	}

	function finishHome() {
		clearRun();
		void goto(resolve('/'));
	}

	function runAgain() {
		if (!routine) return;
		restartRun(routine);
	}

	function onKeydown(event: KeyboardEvent) {
		if (confirmExit || session?.phase !== 'running' || !activeTask) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

		const key = event.key;
		if (key === ' ' || key === 'Enter') {
			event.preventDefault();
			complete();
			return;
		}
		if (key === 'l' || key === 'L') {
			event.preventDefault();
			if (canLater) later();
			return;
		}
		if (key === 'n' || key === 'N') {
			event.preventDefault();
			notToday();
			return;
		}
		if (key === 'Backspace' || key === 'ArrowLeft') {
			event.preventDefault();
			if (canBack) back();
			return;
		}
		if (key === 'Escape') {
			event.preventDefault();
			requestExit();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if status === 'loading'}
	<p class="muted pad">Loading…</p>
{:else if status === 'setup_required'}
	<div class="pad"><SetupRequired /></div>
{:else if status === 'signed_out'}
	<div class="pad"><SignInGate /></div>
{:else if loading}
	<p class="muted pad">Starting routine…</p>
{:else if error}
	<div class="pad">
		<p class="error-banner" role="alert">{error}</p>
		<a class="btn btn-secondary" href={resolve('/')}>Back home</a>
	</div>
{:else if session?.phase === 'summary' && summary}
	<RoutineSummary
		routineName={session.routineName}
		{summary}
		onfinish={finishHome}
		onagain={runAgain}
	/>
{:else if session && activeTask}
	<section
		class={['run', forceLandscapeRun && 'force-landscape']}
		data-testid="run-screen"
		data-force-landscape={forceLandscapeRun ? 'true' : 'false'}
	>
		<header class="chrome">
			<div class="chrome-left">
				<button type="button" class="exit-link" onclick={requestExit}>Exit</button>
				<ThemeToggle />
			</div>
			<p class="routine-name">{session.routineName}</p>
		</header>

		<div class="progress-wrap">
			{#if progress}
				<ProgressBar
					segments={progress}
					label="Routine progress"
					detail={`Task ${session.currentIndex + 1} of ${session.tasks.length}`}
				/>
			{/if}
		</div>

		<div class="stage">
			<RoutineControls
				{canBack}
				{canLater}
				showHints={session.currentIndex === 0}
				oncomplete={complete}
				onlater={later}
				onnottoday={notToday}
				onback={back}
				onexit={requestExit}
			>
				{#snippet lead()}
					<RoutineTaskSlide task={activeTask} {priorStatus} />
				{/snippet}
			</RoutineControls>
		</div>

		<ConfirmDialog
			open={confirmExit}
			title="Exit routine?"
			message="This clears your current run progress."
			confirmLabel="Exit"
			danger
			onconfirm={exitNow}
			oncancel={() => (confirmExit = false)}
		/>
	</section>
{/if}

<style>
	.pad {
		padding: 1rem;
	}

	.run {
		height: 100dvh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		padding: calc(0.55rem + var(--safe-top)) calc(0.85rem + var(--safe-right))
			calc(0.75rem + var(--safe-bottom)) calc(0.85rem + var(--safe-left));
		width: 100%;
		max-width: none;
		margin: 0 auto;
		box-sizing: border-box;
	}

	.run.force-landscape {
		/* Paired with app.css rotate fallback — never keep portrait dvh min-height. */
		min-height: 0;
	}

	.chrome {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.chrome-left {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
	}

	.exit-link {
		border: 1px solid var(--line);
		background: var(--surface);
		border-radius: 999px;
		min-height: 2.4rem;
		padding: 0 0.9rem;
		color: var(--ink-soft);
		font-weight: 600;
		cursor: pointer;
	}

	.routine-name {
		margin: 0;
		text-align: right;
		font-weight: 700;
		color: var(--ink);
		font-size: 0.95rem;
		line-height: 1.25;
		max-width: 45%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress-wrap {
		flex: 0 0 auto;
	}

	.stage {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	@media (orientation: landscape) and (max-height: 520px) {
		.run {
			gap: 0.45rem;
			padding-left: calc(1rem + var(--safe-left));
			padding-right: calc(1rem + var(--safe-right));
		}

		.progress-wrap {
			width: 100%;
			min-width: 0;
		}
	}
</style>
