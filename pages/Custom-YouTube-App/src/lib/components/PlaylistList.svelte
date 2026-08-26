<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';
	import { auth } from '$lib/state/auth.svelte';
	import type { YtPlaylist } from '$lib/types/youtube';
	import { errorMessage } from '$lib/utils/format';
	import { listMyPlaylists } from '$lib/youtube/playlists';
	import { onMount } from 'svelte';

	let { onSelect }: { onSelect: (playlist: YtPlaylist) => void } = $props();

	let playlists = $state.raw<YtPlaylist[]>([]);
	let nextPageToken = $state<string | undefined>();
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);

	async function load(pageToken?: string) {
		const token = auth.readyToken;
		if (!token) {
			loading = false;
			return;
		}
		if (pageToken) loadingMore = true;
		else loading = true;
		error = null;
		try {
			const page = await listMyPlaylists(token, pageToken);
			playlists = pageToken ? [...playlists, ...page.items] : page.items;
			nextPageToken = page.nextPageToken;
		} catch (err) {
			error = errorMessage(err, 'Could not load playlists.');
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	onMount(() => {
		void load();
	});
</script>

<div class="flex flex-col gap-3">
	<h2 class="m-0 text-xl font-semibold">Playlists</h2>

	{#if loading}
		<p class="m-0 text-sm text-muted">Loading playlists…</p>
	{:else if error && playlists.length === 0}
		<ErrorBanner message={error} />
	{:else if playlists.length === 0}
		<EmptyState
			title="No playlists yet"
			detail="Playlists from this YouTube account will show up here."
		/>
	{:else}
		{#if error}
			<ErrorBanner message={error} />
		{/if}

		<ul class="m-0 flex list-none flex-col gap-2 p-0">
			{#each playlists as playlist (playlist.id)}
				<li>
					<button
						type="button"
						class="flex min-h-11 w-full touch-manipulation items-center gap-3 rounded-2xl border border-line bg-panel p-2 text-left"
						onclick={() => onSelect(playlist)}
					>
						{#if playlist.thumbnailUrl}
							<img
								src={playlist.thumbnailUrl}
								alt=""
								class="h-14 w-14 shrink-0 rounded-xl object-cover"
								width="56"
								height="56"
							/>
						{:else}
							<span
								class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-raised text-[10px] text-muted"
								>List</span
							>
						{/if}
						<span class="min-w-0 flex-1">
							<span class="block font-semibold">{playlist.title}</span>
							<span class="mt-1 block text-xs text-muted">
								{playlist.itemCount == null
									? 'Playlist'
									: `${playlist.itemCount} video${playlist.itemCount === 1 ? '' : 's'}`}
								{#if !playlist.reorderable}
									· reorder locked
								{/if}
							</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>

		{#if nextPageToken}
			<button
				type="button"
				class="min-h-11 touch-manipulation rounded-xl border border-line bg-raised px-4 text-sm font-medium disabled:opacity-50"
				disabled={loadingMore}
				onclick={() => load(nextPageToken)}
			>
				{loadingMore ? 'Loading…' : 'Load more'}
			</button>
		{/if}
	{/if}
</div>
