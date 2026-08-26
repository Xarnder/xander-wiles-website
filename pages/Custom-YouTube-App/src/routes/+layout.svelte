<script lang="ts">
	import '../app.css';
	import AccessDenied from '$lib/components/AccessDenied.svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import PlayerModal from '$lib/components/PlayerModal.svelte';
	import SignInGate from '$lib/components/SignInGate.svelte';
	import { auth } from '$lib/state/auth.svelte';
	import { player } from '$lib/state/player.svelte';
	import { tabs } from '$lib/state/tabs.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		auth.hydrate();
		tabs.hydrate();
	});

	$effect(() => {
		void page.url.href;
		player.syncFromUrl();
	});
</script>

<svelte:head>
	<title>Playlist Deck</title>
</svelte:head>

{#if auth.status === 'setup' || auth.status === 'signed-out'}
	<SignInGate />
{:else if auth.status === 'denied'}
	<AccessDenied />
{:else if auth.status === 'signed-in'}
	<AppShell>
		{@render children()}
	</AppShell>
	<PlayerModal />
{:else}
	<div class="min-h-dvh bg-canvas" aria-busy="true"></div>
{/if}
