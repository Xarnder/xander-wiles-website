<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import VideoCard from '$lib/components/VideoCard.svelte';
	import { auth } from '$lib/state/auth.svelte';
	import { player } from '$lib/state/player.svelte';
	import type { FeaturedVideo } from '$lib/types/youtube';
	import { errorMessage } from '$lib/utils/format';
	import { readStoredRegion, writeStoredRegion } from '$lib/youtube/featured';
	import { listFeaturedVideos } from '$lib/youtube/trending';
	import { onMount } from 'svelte';

	let region = $state(readStoredRegion());
	let videos = $state.raw<FeaturedVideo[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function load(code = region) {
		const token = auth.readyToken;
		if (!token) {
			loading = false;
			return;
		}
		loading = true;
		error = null;
		try {
			videos = await listFeaturedVideos(token, code);
		} catch (err) {
			error = errorMessage(err, 'Could not load featured videos.');
		} finally {
			loading = false;
		}
	}

	function onChange(code: string) {
		region = code;
		writeStoredRegion(code);
		void load(code);
	}

	onMount(() => {
		void load();
	});
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="m-0 text-xl font-semibold">Featured</h2>
		<RegionPicker bind:value={region} {onChange} />
	</div>

	{#if loading}
		<p class="m-0 text-sm text-muted">Loading featured videos…</p>
	{:else if error}
		<ErrorBanner message={error} />
	{:else if videos.length === 0}
		<EmptyState title="Nothing trending here" detail="Try another region." />
	{:else}
		<ul class="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
			{#each videos as video (video.videoId)}
				<li>
					<VideoCard
						title={video.title}
						channelTitle={video.channelTitle}
						thumbnailUrl={video.thumbnailUrl}
						viewCount={video.viewCount}
						onOpen={() => player.open(video.videoId, video.title)}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</div>
