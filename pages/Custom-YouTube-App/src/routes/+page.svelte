<script lang="ts">
	import FeaturedGrid from '$lib/components/FeaturedGrid.svelte';
	import PlaylistItems from '$lib/components/PlaylistItems.svelte';
	import PlaylistList from '$lib/components/PlaylistList.svelte';
	import SubscriptionsFeed from '$lib/components/SubscriptionsFeed.svelte';
	import { tabs } from '$lib/state/tabs.svelte';
	import type { YtPlaylist } from '$lib/types/youtube';
	import { onMount } from 'svelte';

	let selectedPlaylist = $state<YtPlaylist | null>(null);

	onMount(() => {
		tabs.markLoaded(tabs.current);
	});
</script>

{#if tabs.current === 'playlists'}
	{#if selectedPlaylist}
		{#key selectedPlaylist.id}
			<PlaylistItems playlist={selectedPlaylist} onBack={() => (selectedPlaylist = null)} />
		{/key}
	{:else}
		<PlaylistList onSelect={(playlist) => (selectedPlaylist = playlist)} />
	{/if}
{/if}

{#if tabs.current === 'subscriptions' || tabs.loaded.subscriptions}
	<div class={tabs.current === 'subscriptions' ? 'contents' : 'hidden'}>
		<SubscriptionsFeed />
	</div>
{/if}

{#if tabs.current === 'featured' || tabs.loaded.featured}
	<div class={tabs.current === 'featured' ? 'contents' : 'hidden'}>
		<FeaturedGrid />
	</div>
{/if}
