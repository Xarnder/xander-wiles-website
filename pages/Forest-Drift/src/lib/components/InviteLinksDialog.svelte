<script lang="ts">
	import type { PlayerRole } from '$lib/game/net/protocol';
	import InviteLinks from './InviteLinks.svelte';

	interface Props {
		worldName: string;
		links: { role: PlayerRole; url: string }[];
		onClose: () => void;
	}

	const { worldName, links, onClose }: Props = $props();
</script>

<div class="modal-backdrop" role="presentation">
	<div
		class="modal"
		data-testid="invite-links-dialog"
		role="dialog"
		aria-labelledby="invite-links-title"
	>
		<h3 id="invite-links-title">Invite links for &ldquo;{worldName}&rdquo;</h3>
		<p class="modal-hint">Only people with a link can join. Send each person the one they need.</p>
		<InviteLinks {links} />
		<div class="modal-buttons">
			<button type="button" onclick={onClose}>Close</button>
		</div>
	</div>
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
		width: min(30rem, 92vw);
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

	.modal-hint {
		margin: 0;
		font-size: 0.78rem;
		opacity: 0.75;
		line-height: 1.4;
	}

	.modal-buttons {
		display: flex;
		justify-content: flex-end;
	}

	.modal-buttons button {
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
</style>
