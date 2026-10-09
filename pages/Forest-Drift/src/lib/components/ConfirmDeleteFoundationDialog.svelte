<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import {
		FOUNDATION_DELETE_CONFIRMATION,
		isFoundationDeleteConfirmed
	} from '$lib/game/building/foundationDeletion';

	let {
		onCancel,
		onConfirm
	}: {
		onCancel: () => void;
		/** Returns false when the foundation is already gone. The phrase check happens before this runs. */
		onConfirm: (typed: string) => boolean;
	} = $props();

	let typed = $state('');
	let error = $state<string | null>(null);
	const confirmed = $derived(isFoundationDeleteConfirmed(typed));

	const focusInput: Attachment<HTMLInputElement> = (node) => {
		node.focus();
	};

	function onWindowKeyDown(event: KeyboardEvent) {
		if (event.code === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onCancel();
			return;
		}
		const target = event.target;
		const inDialog =
			target instanceof HTMLElement &&
			Boolean(target.closest('[data-testid="confirm-delete-foundation"]'));
		if (!inDialog) {
			event.stopPropagation();
			if (event.code !== 'Tab') event.preventDefault();
		}
	}

	function onDialogKeyDown(event: KeyboardEvent) {
		event.stopPropagation();
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!confirmed) return;
		error = null;
		if (!onConfirm(typed)) error = 'That foundation is no longer there.';
	}
</script>

<svelte:window onkeydowncapture={onWindowKeyDown} />

<div class="backdrop" role="presentation" onclick={onCancel}>
	<div
		class="dialog"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="confirm-delete-foundation-title"
		aria-describedby="confirm-delete-foundation-copy"
		data-testid="confirm-delete-foundation"
		tabindex="-1"
		onclick={(event) => event.stopPropagation()}
		onkeydown={onDialogKeyDown}
	>
		<h3 id="confirm-delete-foundation-title">Delete this foundation?</h3>
		<p id="confirm-delete-foundation-copy">
			This removes the foundation and everything built on it — walls, floors, ceilings, roofs,
			stairs, detailing, furniture, and placed objects. The ground is then clear to build on again.
		</p>
		<form onsubmit={submit}>
			<label for="confirm-delete-input">
				Type <strong>{FOUNDATION_DELETE_CONFIRMATION}</strong> to delete
			</label>
			<input
				id="confirm-delete-input"
				{@attach focusInput}
				bind:value={typed}
				type="text"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				data-testid="confirm-delete-input"
				aria-invalid={typed.length > 0 && !confirmed}
			/>
			{#if error}
				<p class="error" data-testid="confirm-delete-error">{error}</p>
			{/if}
			<div class="actions">
				<button type="button" class="plain" data-testid="confirm-delete-cancel" onclick={onCancel}>
					Cancel
				</button>
				<button
					type="submit"
					class="danger"
					data-testid="confirm-delete-submit"
					disabled={!confirmed}
				>
					Delete foundation
				</button>
			</div>
		</form>
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
	form {
		display: grid;
		gap: 0.45rem;
	}
	label {
		font-weight: 650;
	}
	strong {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}
	input {
		font: inherit;
		color: #f0fff3;
		background: #0c1c15;
		border: 1px solid #52715d;
		border-radius: 8px;
		padding: 0.55rem 0.7rem;
	}
	input[aria-invalid='true'] {
		border-color: #c1443c;
	}
	.error {
		color: #ffb4ae;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.45rem;
		margin-top: 0.35rem;
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
	button.danger {
		background: #5a1e1b;
		border-color: #c1443c;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
</style>
