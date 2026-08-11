<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import LandscapeToggle from '$lib/components/LandscapeToggle.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { getAuthStatus, getAuthUser, startAuthListener, stopAuthListener } from '$lib/stores/auth.svelte';
	import { initPreferences } from '$lib/stores/preferences.svelte';
	import { syncRoutinesForCurrentUser, stopRoutinesSync } from '$lib/stores/routines.svelte';
	import { initTheme } from '$lib/stores/theme.svelte';

	let { children } = $props();

	const runMode = $derived(page.url.pathname.includes('/run'));
	const status = $derived(getAuthStatus());
	const user = $derived(getAuthUser());
	const userLabel = $derived(user?.displayName?.trim() || user?.email || null);

	onMount(() => {
		initTheme();
		initPreferences();
		startAuthListener();
		syncRoutinesForCurrentUser();
		return () => {
			stopRoutinesSync();
			stopAuthListener();
		};
	});

	$effect(() => {
		void getAuthStatus();
		syncRoutinesForCurrentUser();
	});
</script>

<svelte:head>
	<title>Routine Manager</title>
</svelte:head>

<div class={['app-shell', runMode && 'run-mode']}>
	{#if !runMode}
		<div class="theme-chrome">
			{#if status === 'signed_in' && userLabel}
				<p class="user-chip">{userLabel}</p>
			{:else}
				<span class="user-chip-spacer" aria-hidden="true"></span>
			{/if}
			<div class="theme-chrome-actions">
				<LandscapeToggle />
				<ThemeToggle />
			</div>
		</div>
		<OfflineBanner />
	{/if}
	{@render children()}
</div>
