<script lang="ts">
	import { untrack } from 'svelte';
	import type { PlayerRole } from '$lib/game/net/protocol';
	import InviteLinks from './InviteLinks.svelte';

	interface Props {
		worldName: string;
		initialAdminKey: string;
		busy: boolean;
		error: string | null;
		/** Set once the world is published: one link per role (Q3-A). */
		links: { role: PlayerRole; url: string }[] | null;
		onPublish: (adminKey: string, remember: boolean) => void;
		onJoin: () => void;
		onClose: () => void;
	}

	const { worldName, initialAdminKey, busy, error, links, onPublish, onJoin, onClose }: Props =
		$props();

	// Editable copy: the prop only seeds the field.
	let adminKey = $state(untrack(() => initialAdminKey));
	let remember = $state(untrack(() => initialAdminKey.length > 0));

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (adminKey.trim().length === 0 || busy) return;
		onPublish(adminKey.trim(), remember);
	}
</script>

<div data-ui-backdrop class="modal-backdrop" role="presentation">
	{#if links}
		<div
			data-ui-surface="panel"
			class="modal"
			data-testid="publish-world-done"
			role="dialog"
			aria-labelledby="publish-done-title"
		>
			<h3 id="publish-done-title">&ldquo;{worldName}&rdquo; is online</h3>
			<p class="modal-hint">
				Only people with a link can join. Your local world is unchanged: this is a separate online
				copy. The links stay in this browser, under Worlds → Online worlds.
			</p>
			<InviteLinks {links} />
			<p class="modal-hint">
				Everything built in the online copy is shared live and saved on the server.
			</p>
			<div class="modal-buttons">
				<button type="button" onclick={onClose}>Close</button>
				<button type="button" class="primary" data-testid="publish-join-now" onclick={onJoin}>
					Join now
				</button>
			</div>
		</div>
	{:else}
		<form
			data-ui-surface="panel"
			class="modal"
			data-testid="publish-world-dialog"
			onsubmit={submit}
		>
			<h3>Publish &ldquo;{worldName}&rdquo; online</h3>
			<p class="modal-hint">
				Creates a separate online copy that friends can join with a link. Your local world stays as
				it is.
			</p>
			<label>
				Owner password
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="password"
					autocomplete="off"
					data-testid="publish-admin-key"
					autofocus
					bind:value={adminKey}
					placeholder="Your private owner password"
				/>
			</label>
			<label class="checkbox">
				<input type="checkbox" bind:checked={remember} />
				Remember the owner password on this device
			</label>
			{#if error}
				<p class="modal-error" role="alert">{error}</p>
			{/if}
			<div class="modal-buttons">
				<button type="button" onclick={onClose} disabled={busy}>Cancel</button>
				<button
					type="submit"
					class="primary"
					data-testid="publish-world-confirm"
					disabled={busy || adminKey.trim().length === 0}
				>
					{busy ? 'Publishing…' : 'Publish'}
				</button>
			</div>
		</form>
	{/if}
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(4, 10, 8, 0.72);
		backdrop-filter: blur(3px);
		z-index: 40;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: #eaf6ff;
	}

	.modal {
		width: min(28rem, 92vw);
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 1.25rem;
		border-radius: 14px;
		background: rgba(14, 28, 22, 0.98);
		border: 1px solid rgba(234, 246, 255, 0.18);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
	}

	h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		font-weight: 600;
		opacity: 0.85;
	}

	label.checkbox {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		font-weight: 500;
	}

	input:not([type='checkbox']) {
		padding: 0.5rem 0.6rem;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.25);
		background: rgba(0, 0, 0, 0.35);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.9rem;
	}

	.modal-hint {
		margin: 0;
		font-size: 0.78rem;
		opacity: 0.75;
		line-height: 1.4;
	}

	.modal-error {
		margin: 0;
		font-size: 0.8rem;
		color: #ffb4b4;
	}

	.modal-buttons {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
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

	button:hover:not(:disabled) {
		background: rgba(30, 55, 42, 0.85);
		border-color: rgba(159, 232, 255, 0.55);
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	button.primary {
		background: rgba(57, 211, 83, 0.85);
		border-color: rgba(57, 211, 83, 0.9);
		color: #04121f;
	}

	button.primary:hover:not(:disabled) {
		background: rgba(87, 226, 111, 0.95);
	}
</style>
