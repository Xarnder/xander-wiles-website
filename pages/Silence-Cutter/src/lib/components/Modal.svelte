<script lang="ts">
	import type { Snippet } from 'svelte';
	interface Props {
		title: string;
		onclose: () => void;
		children: Snippet;
		wide?: boolean;
		testid?: string;
	}
	let { title, onclose, children, wide = false, testid }: Props = $props();
	let dialog: HTMLDialogElement;
	$effect(() => {
		dialog.showModal();
		return () => dialog.close();
	});
</script>

<!-- Backdrop click closes; Escape is handled natively by <dialog>. -->
<dialog
	bind:this={dialog}
	class:wide
	aria-label={title}
	data-testid={testid}
	{onclose}
	onclick={(e) => e.target === dialog && onclose()}
>
	<header>
		<h2>{title}</h2>
		<button class="ghost" onclick={onclose} aria-label="Close">✕</button>
	</header>
	<div class="content">{@render children()}</div>
</dialog>

<style>
	dialog {
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		background: var(--panel);
		color: var(--text);
		padding: 0;
		width: min(520px, 92vw);
		max-height: 86vh;
		box-shadow: var(--shadow);
	}
	dialog.wide {
		width: min(860px, 94vw);
	}
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.45);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
	}
	h2 {
		margin: 0;
		font-size: 15px;
	}
	.content {
		padding: 14px;
		overflow: auto;
		max-height: calc(86vh - 50px);
	}
</style>
