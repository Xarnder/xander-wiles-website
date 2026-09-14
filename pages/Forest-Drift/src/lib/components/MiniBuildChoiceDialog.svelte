<script module lang="ts">
	export interface ChoiceOption {
		label: string;
		testId: string;
		tone?: 'primary' | 'danger' | 'plain';
		onSelect: () => void;
	}
</script>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	let {
		title,
		lines,
		options,
		onCancel,
		testId = 'mini-build-choice-dialog'
	}: {
		title: string;
		lines: string[];
		options: ChoiceOption[];
		onCancel: () => void;
		testId?: string;
	} = $props();

	function onKeyDown(event: KeyboardEvent) {
		event.stopPropagation();
		if (event.code === 'Escape') {
			event.preventDefault();
			onCancel();
		}
	}

	onMount(() => {
		document.exitPointerLock?.();
		window.addEventListener('keydown', onKeyDown, true);
	});
	onDestroy(() => window.removeEventListener('keydown', onKeyDown, true));
</script>

<div class="backdrop" role="presentation">
	<div
		class="dialog"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="{testId}-title"
		data-testid={testId}
	>
		<h3 id="{testId}-title">{title}</h3>
		{#each lines as line, index (index)}
			<p>{line}</p>
		{/each}
		<div class="actions">
			{#each options as option (option.testId)}
				<button
					type="button"
					class={option.tone ?? 'plain'}
					data-testid={option.testId}
					onclick={option.onSelect}>{option.label}</button
				>
			{/each}
			<button type="button" class="plain" data-testid="{testId}-cancel" onclick={onCancel}
				>Cancel</button
			>
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: grid;
		place-items: center;
		background: #07140dcc;
		backdrop-filter: blur(3px);
	}
	.dialog {
		width: min(28rem, 92vw);
		display: grid;
		gap: 0.55rem;
		padding: 1.2rem;
		background: #142a20;
		color: #e3f5e8;
		border: 1px solid #446553;
		border-radius: 14px;
		font:
			14px/1.5 system-ui,
			sans-serif;
		box-shadow: 0 20px 80px #0008;
	}
	h3 {
		margin: 0;
		font-size: 18px;
	}
	p {
		margin: 0;
		color: #c5e6d2;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.4rem;
	}
	button {
		font: inherit;
		color: #f0fff3;
		padding: 0.55rem 0.8rem;
		border-radius: 8px;
		border: 1px solid #52715d;
		background: #203d2d;
		cursor: pointer;
	}
	button.primary {
		background: #2d6a4f;
		border-color: #7ec89a;
	}
	button.danger {
		background: #5a1e1b;
		border-color: #c1443c;
	}
</style>
