<script lang="ts">
	import type { Toasts } from '../state/toasts.svelte';
	let { toasts }: { toasts: Toasts } = $props();
</script>

<div class="toasts" role="status" aria-live="polite" data-testid="toasts">
	{#each toasts.items as t (t.id)}
		<div class="toast {t.tone}">
			<span>{t.message}</span>
			{#if t.action}
				<button
					class="small"
					onclick={() => {
						t.action?.run();
						toasts.dismiss(t.id);
					}}>{t.action.label}</button
				>
			{/if}
			<button class="ghost x" aria-label="Dismiss" onclick={() => toasts.dismiss(t.id)}>✕</button>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		left: 50%;
		bottom: 72px;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		gap: 6px;
		z-index: 50;
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--panel-3);
		border: 1px solid var(--border-strong);
		border-left: 3px solid var(--accent);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 6px 8px 6px 12px;
		font-size: 12.5px;
		animation: in 0.15s ease-out;
	}
	.toast.success {
		border-left-color: var(--keep);
	}
	.toast.warn {
		border-left-color: var(--manual);
	}
	.small {
		font-size: 12px;
		padding: 2px 8px;
		font-weight: 600;
	}
	.x {
		padding: 1px 6px;
		font-size: 11px;
		color: var(--text-faint);
	}
	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
</style>
