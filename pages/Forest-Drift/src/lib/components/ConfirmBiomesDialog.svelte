<script lang="ts">
	/**
	 * Confirms switching a world's biomes on or off (decision Q9). Says plainly what changes and
	 * what doesn't: the land, rivers and buildings stay put; the ground, grass (and, later, trees
	 * and plants) are regenerated. Escape or the backdrop cancels; focus starts on Cancel.
	 */
	interface Props {
		enable: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}

	const { enable, onConfirm, onCancel }: Props = $props();

	let cancelButton = $state<HTMLButtonElement | undefined>(undefined);

	$effect(() => {
		cancelButton?.focus();
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onCancel();
		}
	}
</script>

<div
	class="modal-backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget) onCancel();
	}}
>
	<div
		data-ui-surface="panel"
		class="modal"
		data-testid="confirm-biomes"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="confirm-biomes-title"
		aria-describedby="confirm-biomes-detail"
		tabindex="-1"
		onkeydown={onKeydown}
	>
		<h3 id="confirm-biomes-title">{enable ? 'Turn biomes on?' : 'Turn biomes off?'}</h3>
		<div id="confirm-biomes-detail">
			{#if enable}
				<p>
					This world gets snowfields, deserts, jungles, swamps and more. The ground and grass change
					to match each biome, and trees and plants will follow in later updates.
				</p>
			{:else}
				<p>The whole world goes back to the original green countryside.</p>
			{/if}
			<p class="hint">
				The land, rivers, lakes and everything you've built stay exactly where they are. You can
				change this again at any time.
			</p>
		</div>
		<div class="buttons">
			<button
				type="button"
				bind:this={cancelButton}
				data-testid="confirm-biomes-cancel"
				onclick={onCancel}
			>
				Cancel
			</button>
			<button type="button" class="primary" data-testid="confirm-biomes-yes" onclick={onConfirm}>
				{enable ? 'Turn biomes on' : 'Turn biomes off'}
			</button>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 16px;
		background: rgba(4, 10, 8, 0.6);
		backdrop-filter: blur(3px);
		z-index: 80;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: #eaf6ff;
	}

	.modal {
		width: min(28rem, 100%);
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 1.2rem;
		border-radius: 14px;
		background: rgba(14, 28, 22, 0.98);
		border: 1px solid rgba(234, 246, 255, 0.18);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
	}

	h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	p {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
		line-height: 1.45;
	}

	.hint {
		font-size: 0.82rem;
		opacity: 0.85;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	button {
		padding: 0.5rem 0.9rem;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.25);
		background: rgba(10, 20, 15, 0.55);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	button.primary {
		background: #3f7d4f;
		border-color: #6fbf86;
	}

	button:focus-visible {
		outline: 2px solid #ffd54f;
		outline-offset: 2px;
	}
</style>
