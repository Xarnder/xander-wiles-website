<script lang="ts">
	import { tabs, type AppTab } from '$lib/state/tabs.svelte';

	const items: { id: AppTab; label: string }[] = [
		{ id: 'playlists', label: 'Playlists' },
		{ id: 'subscriptions', label: 'Subscriptions' },
		{ id: 'featured', label: 'Featured' }
	];

	function choose(tab: AppTab) {
		tabs.select(tab);
		tabs.markLoaded(tab);
	}

	function onKeydown(event: KeyboardEvent, index: number) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		event.preventDefault();
		const next =
			event.key === 'ArrowRight'
				? (index + 1) % items.length
				: (index + items.length - 1) % items.length;
		choose(items[next].id);
		const target = event.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		const button = target.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
		button?.focus();
	}
</script>

<nav
	class="border-t border-line bg-panel px-2 pt-1"
	style="padding-bottom: max(0.35rem, env(safe-area-inset-bottom))"
	aria-label="App sections"
>
	<div class="grid grid-cols-3 gap-1" role="tablist">
		{#each items as item, index (item.id)}
			<button
				type="button"
				class={[
					'min-h-11 touch-manipulation rounded-xl px-2 text-sm font-semibold',
					tabs.current === item.id ? 'bg-raised text-accent' : 'text-muted'
				]}
				role="tab"
				aria-selected={tabs.current === item.id}
				id={`tab-${item.id}`}
				tabindex={tabs.current === item.id ? 0 : -1}
				onclick={() => choose(item.id)}
				onkeydown={(event) => onKeydown(event, index)}
			>
				{item.label}
			</button>
		{/each}
	</div>
</nav>
