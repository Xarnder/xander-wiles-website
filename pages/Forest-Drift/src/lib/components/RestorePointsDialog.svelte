<script lang="ts">
	import type { RestorePoint } from '$lib/game/net/worldTransfer';

	interface Props {
		worldName: string;
		/** Null while loading. */
		points: RestorePoint[] | null;
		busy: boolean;
		error: string | null;
		onRestore: (pointId: number) => void;
		onClose: () => void;
	}

	const { worldName, points, busy, error, onRestore, onClose }: Props = $props();

	let chosen = $state<number | null>(null);

	function when(iso: string): string {
		return new Date(iso).toLocaleString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div data-ui-backdrop class="modal-backdrop" role="presentation">
	<div data-ui-surface="panel" class="modal" data-testid="restore-dialog" role="dialog" aria-labelledby="restore-title">
		<h3 id="restore-title">Restore &ldquo;{worldName}&rdquo;</h3>
		<p class="hint">
			Puts the online world back the way it was. Everything built since is undone for everyone, and
			anyone in the world reconnects. Earlier versions are kept for 30 days.
		</p>
		{#if points === null}
			<p class="hint">Loading…</p>
		{:else if points.length === 0}
			<p class="hint">No earlier versions yet.</p>
		{:else}
			<ul>
				{#each points as point (point.id)}
					<li>
						<label>
							<input type="radio" name="restore-point" value={point.id} bind:group={chosen} />
							{when(point.createdAt)}
							<span class="muted">· change {point.seq}</span>
						</label>
					</li>
				{/each}
			</ul>
		{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="buttons">
			<button type="button" onclick={onClose} disabled={busy}>Cancel</button>
			<button
				type="button"
				class="danger"
				data-testid="restore-confirm"
				disabled={busy || chosen === null}
				onclick={() => chosen !== null && onRestore(chosen)}
			>
				{busy ? 'Restoring…' : 'Restore this version'}
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
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
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

	.hint,
	.muted {
		margin: 0;
		font-size: 0.8rem;
		opacity: 0.75;
		line-height: 1.4;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.85rem;
	}

	label {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		cursor: pointer;
	}

	.error {
		margin: 0;
		font-size: 0.8rem;
		color: #ffb4b4;
	}

	.buttons {
		display: flex;
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

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	button.danger {
		background: rgba(214, 69, 65, 0.85);
		border-color: rgba(214, 69, 65, 0.95);
	}
</style>
