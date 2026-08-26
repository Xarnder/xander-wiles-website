<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';
	import VideoCard from '$lib/components/VideoCard.svelte';
	import { auth } from '$lib/state/auth.svelte';
	import { player } from '$lib/state/player.svelte';
	import type { FeedItem } from '$lib/types/youtube';
	import { errorMessage } from '$lib/utils/format';
	import { loadSubscriptionsFeed } from '$lib/youtube/subscriptions';
	import { onMount } from 'svelte';

	let items = $state.raw<FeedItem[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let loadedOnce = false;

	async function load() {
		if (loadedOnce) return;
		const token = auth.readyToken;
		if (!token) {
			loading = false;
			return;
		}
		loading = true;
		error = null;
		try {
			items = await loadSubscriptionsFeed(token);
			loadedOnce = true;
		} catch (err) {
			error = errorMessage(err, 'Could not load subscriptions.');
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void load();
	});
</script>

<div class="flex flex-col gap-3">
	<div>
		<h2 class="m-0 text-xl font-semibold">Subscriptions</h2>
		<p class="mt-1 mb-0 text-xs text-muted">YouTube relevance, first 15 channels.</p>
	</div>

	{#if loading}
		<p class="m-0 text-sm text-muted">Loading subscriptions…</p>
	{:else if error}
		<ErrorBanner message={error} />
	{:else if items.length === 0}
		<EmptyState
			title="No recent uploads"
			detail="Subscribe to channels on YouTube to fill this feed."
		/>
	{:else}
		<ul class="m-0 flex list-none flex-col gap-2 p-0">
			{#each items as item (item.videoId + item.publishedAt)}
				<li>
					<VideoCard
						title={item.title}
						channelTitle={item.channelTitle}
						thumbnailUrl={item.thumbnailUrl}
						publishedAt={item.publishedAt}
						onOpen={() => player.open(item.videoId, item.title)}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</div>
