<script lang="ts">
	import { formatViews, relativeTime } from '$lib/utils/format';

	let {
		title,
		channelTitle,
		thumbnailUrl,
		publishedAt,
		viewCount,
		onOpen
	}: {
		title: string;
		channelTitle: string;
		thumbnailUrl?: string;
		publishedAt?: string;
		viewCount?: string;
		onOpen: () => void;
	} = $props();

	const meta = $derived(
		[relativeTime(publishedAt), formatViews(viewCount)].filter(Boolean).join(' · ')
	);
</script>

<button
	type="button"
	class="flex min-h-11 w-full touch-manipulation items-center gap-3 rounded-2xl border border-line bg-panel p-2 text-left text-ink"
	onclick={onOpen}
>
	{#if thumbnailUrl}
		<img
			src={thumbnailUrl}
			alt=""
			class="h-16 w-28 shrink-0 rounded-xl object-cover"
			width="112"
			height="64"
		/>
	{:else}
		<span
			class="flex h-16 w-28 shrink-0 items-center justify-center rounded-xl bg-raised text-xs text-muted"
			>No thumb</span
		>
	{/if}
	<span class="min-w-0 flex-1">
		<span class="block text-sm leading-snug font-semibold">{title}</span>
		<span class="mt-1 block text-xs text-muted">{channelTitle}</span>
		{#if meta}
			<span class="mt-0.5 block text-xs text-muted">{meta}</span>
		{/if}
	</span>
</button>
