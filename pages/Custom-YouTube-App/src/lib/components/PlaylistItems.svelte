<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';
	import { auth } from '$lib/state/auth.svelte';
	import { player } from '$lib/state/player.svelte';
	import { YouTubeApiError, type YtPlaylist, type YtPlaylistItem } from '$lib/types/youtube';
	import { errorMessage } from '$lib/utils/format';
	import { movedItemAfterReorder, moveItem } from '$lib/youtube/playlist-reorder';
	import { listPlaylistItems, updatePlaylistItemPosition } from '$lib/youtube/playlists';
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import { dragHandle, dragHandleZone, type DndEvent } from 'svelte-dnd-action';

	let { playlist, onBack }: { playlist: YtPlaylist; onBack: () => void } = $props();

	let items = $state.raw<YtPlaylistItem[]>([]);
	let committed = $state.raw<YtPlaylistItem[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let nextPageToken = $state<string | undefined>();
	let total = $state<number | undefined>();
	let reorderBlocked = $state(false);
	let liveMessage = $state('');

	const canReorder = $derived(playlist.reorderable && !reorderBlocked);
	const flipDurationMs = $derived(
		typeof matchMedia === 'undefined' || !matchMedia('(prefers-reduced-motion: reduce)').matches
			? 200
			: 0
	);
	const truncated = $derived(total != null && total > items.length);

	function cloneItems(list: YtPlaylistItem[]): YtPlaylistItem[] {
		return list.map((item) => ({ ...item }));
	}

	async function loadInitial() {
		const token = auth.readyToken;
		if (!token) {
			loading = false;
			return;
		}
		loading = true;
		error = null;
		try {
			const page = await listPlaylistItems(token, playlist.id, undefined, 2);
			items = page.items;
			committed = cloneItems(page.items);
			nextPageToken = page.nextPageToken;
			total = page.total;
		} catch (err) {
			error = errorMessage(err, 'Could not load playlist items.');
		} finally {
			loading = false;
		}
	}

	async function loadMore() {
		const token = auth.readyToken;
		if (!token || !nextPageToken || loadingMore) return;
		loadingMore = true;
		error = null;
		try {
			const page = await listPlaylistItems(token, playlist.id, nextPageToken, 1);
			items = [...items, ...page.items];
			committed = cloneItems(items);
			nextPageToken = page.nextPageToken;
			total = page.total ?? total;
		} catch (err) {
			error = errorMessage(err, 'Could not load more videos.');
		} finally {
			loadingMore = false;
		}
	}

	function handleConsider(event: CustomEvent<DndEvent<YtPlaylistItem>>) {
		items = event.detail.items;
	}

	async function persistMove(
		previous: YtPlaylistItem[],
		next: YtPlaylistItem[],
		draggedId: string
	) {
		const moved = movedItemAfterReorder(previous, next, draggedId);
		items = next;
		if (!moved) {
			committed = cloneItems(next);
			return;
		}

		const token = auth.readyToken;
		if (!token) {
			items = cloneItems(committed);
			error = 'YouTube sign-in expired. Sign in again.';
			return;
		}

		saving = true;
		error = null;
		try {
			await updatePlaylistItemPosition(token, moved.item, playlist.id, moved.to);
			committed = cloneItems(items);
			liveMessage = `Moved ${moved.item.title} to position ${moved.to + 1}.`;
		} catch (err) {
			items = cloneItems(committed);
			if (err instanceof YouTubeApiError && (err.status === 403 || err.reason === 'forbidden')) {
				reorderBlocked = true;
			}
			error = errorMessage(err, 'Could not save the new order.');
			liveMessage = 'Reorder failed.';
		} finally {
			saving = false;
		}
	}

	async function handleFinalize(event: CustomEvent<DndEvent<YtPlaylistItem>>) {
		await persistMove(cloneItems(committed), event.detail.items, String(event.detail.info.id));
	}

	async function moveBy(from: number, to: number) {
		if (!canReorder || saving) return;
		const next = moveItem(items, from, to);
		if (next === items) return;
		await persistMove(cloneItems(items), next, items[from].id);
	}

	function openVideo(item: YtPlaylistItem) {
		player.open(item.videoId, item.title);
	}

	onMount(() => {
		void loadInitial();
	});
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center gap-3">
		<button
			type="button"
			class="min-h-11 touch-manipulation rounded-xl border border-line px-3 text-sm font-medium"
			onclick={onBack}
		>
			Back
		</button>
		<div class="min-w-0">
			<h2 class="m-0 truncate text-xl font-semibold">{playlist.title}</h2>
			{#if total != null}
				<p class="m-0 text-xs text-muted">{total} videos</p>
			{/if}
		</div>
	</div>

	<p class="sr-only" aria-live="polite">{liveMessage}</p>

	{#if loading}
		<p class="m-0 text-sm text-muted">Loading videos…</p>
	{:else if error && items.length === 0}
		<ErrorBanner message={error} />
	{:else if items.length === 0}
		<EmptyState title="This playlist is empty" detail="Add videos on YouTube, then come back." />
	{:else}
		{#if error}
			<ErrorBanner message={error} />
		{/if}

		{#if !canReorder}
			<p class="m-0 text-xs text-muted">
				Reordering is off for this playlist. You can still play videos.
			</p>
		{/if}

		{#if truncated}
			<p class="m-0 text-xs text-muted">
				Showing {items.length} of {total}. Load more to see the rest. Drag only works among loaded
				videos.
			</p>
		{/if}

		<div
			class="flex flex-col gap-2"
			use:dragHandleZone={{
				items,
				flipDurationMs,
				dragDisabled: !canReorder || saving,
				delayTouchStart: 80,
				useCursorForDetection: true
			}}
			onconsider={handleConsider}
			onfinalize={handleFinalize}
		>
			{#each items as item, index (item.id)}
				<article
					class="relative flex min-h-11 items-stretch overflow-hidden rounded-2xl border border-line bg-panel"
					animate:flip={{ duration: flipDurationMs }}
				>
					<div
						use:dragHandle
						class={['absolute inset-y-0 left-0 z-10 w-1/2', !canReorder && 'pointer-events-none']}
						aria-label="Reorder"
					></div>
					<div
						class="pointer-events-none relative z-0 flex w-8 shrink-0 items-center justify-center text-muted"
						aria-hidden="true"
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
							<circle cx="5" cy="3" r="1.3" />
							<circle cx="11" cy="3" r="1.3" />
							<circle cx="5" cy="8" r="1.3" />
							<circle cx="11" cy="8" r="1.3" />
							<circle cx="5" cy="13" r="1.3" />
							<circle cx="11" cy="13" r="1.3" />
						</svg>
					</div>
					<button
						type="button"
						class="relative z-20 shrink-0 touch-manipulation py-2 pl-0"
						aria-label="Play {item.title}"
						onclick={() => openVideo(item)}
					>
						{#if item.thumbnailUrl}
							<img
								src={item.thumbnailUrl}
								alt=""
								class="h-14 w-24 rounded-lg object-cover"
								width="96"
								height="56"
							/>
						{:else}
							<span
								class="flex h-14 w-24 items-center justify-center rounded-lg bg-raised text-[10px] text-muted"
								>Video</span
							>
						{/if}
					</button>
					<button
						type="button"
						class="relative z-0 flex min-h-11 min-w-0 flex-1 touch-manipulation items-center py-2 pr-2 text-left"
						onclick={() => openVideo(item)}
					>
						<span class="min-w-0 pl-3">
							<span class="block text-sm leading-snug font-semibold">{item.title}</span>
							{#if item.channelTitle}
								<span class="mt-1 block text-xs text-muted">{item.channelTitle}</span>
							{/if}
						</span>
					</button>
					<div class="relative z-20 flex shrink-0 flex-col justify-center gap-1 pr-2">
						<button
							type="button"
							class="min-h-11 touch-manipulation rounded-lg border border-line px-2 text-xs text-ink disabled:opacity-40"
							aria-label="Move up"
							disabled={!canReorder || saving || index === 0}
							onclick={() => moveBy(index, index - 1)}
						>
							Up
						</button>
						<button
							type="button"
							class="min-h-11 touch-manipulation rounded-lg border border-line px-2 text-xs text-ink disabled:opacity-40"
							aria-label="Move down"
							disabled={!canReorder || saving || index === items.length - 1}
							onclick={() => moveBy(index, index + 1)}
						>
							Down
						</button>
					</div>
				</article>
			{/each}
		</div>

		{#if nextPageToken}
			<button
				type="button"
				class="min-h-11 touch-manipulation rounded-xl border border-line bg-raised px-4 text-sm font-medium disabled:opacity-50"
				disabled={loadingMore}
				onclick={() => loadMore()}
			>
				{loadingMore ? 'Loading…' : 'Load more'}
			</button>
		{/if}
	{/if}
</div>
