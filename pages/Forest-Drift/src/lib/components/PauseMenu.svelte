<script lang="ts">
	import type { SaveStatus } from '$lib/game/world/WorldTypes';

	interface Props {
		worldName: string;
		seed: string;
		saveStatus: SaveStatus;
		saveError: string | null;
		busy: boolean;
		onResume: () => void;
		onSave: () => void;
		onRename: (name: string) => void;
		onExport: () => void;
		onDuplicate: () => void;
		onQuit: () => void;
		onOpenSettings: () => void;
	}

	const {
		worldName,
		seed,
		saveStatus,
		saveError,
		busy,
		onResume,
		onSave,
		onRename,
		onExport,
		onDuplicate,
		onQuit,
		onOpenSettings
	}: Props = $props();

	type Panel = 'root' | 'world' | 'rename';
	let panel = $state<Panel>('root');
	/** Seeded from `worldName` when the rename panel opens, not at construction, so it always reflects the world's current name. */
	let renameValue = $state('');

	const STATUS_TEXT: Record<SaveStatus, string> = {
		saved: 'Saved',
		dirty: 'Unsaved changes',
		saving: 'Saving…',
		error: 'Save failed'
	};

	function submitRename(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = renameValue.trim();
		if (trimmed.length === 0) return;
		onRename(trimmed);
		panel = 'world';
	}
</script>

<div class="pause-overlay" data-testid="pause-menu">
	<div class="pause-panel">
		{#if panel === 'root'}
			<h2>Paused</h2>
			<p class="world-line" data-testid="pause-world-name">{worldName}</p>
			<div class="status-line" data-testid="save-status" data-status={saveStatus}>
				<span class="dot" data-status={saveStatus}></span>
				{STATUS_TEXT[saveStatus]}
			</div>
			{#if saveStatus === 'error'}
				<p class="save-error" data-testid="save-error">
					{saveError ?? 'Unable to save world locally.'}
				</p>
				<div class="error-actions">
					<button data-testid="save-retry" onclick={onSave} disabled={busy}>Retry Save</button>
					<button data-testid="save-export-backup" onclick={onExport} disabled={busy}>
						Export Backup
					</button>
				</div>
			{/if}

			<div class="menu-buttons">
				<button class="primary" data-testid="pause-resume" onclick={onResume}>Resume</button>
				<button data-testid="pause-save" onclick={onSave} disabled={busy}>Save</button>
				<button data-testid="pause-world" onclick={() => (panel = 'world')}>World</button>
				<button data-testid="pause-settings" onclick={onOpenSettings}>Settings</button>
				<button class="danger" data-testid="pause-quit" onclick={onQuit} disabled={busy}>
					Quit to Worlds
				</button>
			</div>
		{:else if panel === 'world'}
			<h2 data-testid="pause-world-panel">{worldName}</h2>
			<div class="status-line">
				<span class="dot" data-status={saveStatus}></span>{STATUS_TEXT[saveStatus]}
			</div>
			<p class="seed-line">seed <code>{seed}</code></p>

			<div class="menu-buttons">
				<button
					data-testid="pause-world-rename"
					onclick={() => {
						renameValue = worldName;
						panel = 'rename';
					}}
				>
					Rename
				</button>
				<button data-testid="pause-world-export" onclick={onExport} disabled={busy}>
					Export World
				</button>
				<button data-testid="pause-world-duplicate" onclick={onDuplicate} disabled={busy}>
					Duplicate World
				</button>
				<button onclick={() => (panel = 'root')}>Back</button>
			</div>
		{:else}
			<h2>Rename World</h2>
			<form onsubmit={submitRename}>
				<!-- svelte-ignore a11y_autofocus -->
				<input data-testid="pause-rename-input" autofocus bind:value={renameValue} maxlength="80" />
				<div class="menu-buttons">
					<button type="button" onclick={() => (panel = 'world')}>Cancel</button>
					<button
						type="submit"
						class="primary"
						data-testid="pause-rename-confirm"
						disabled={renameValue.trim().length === 0}
					>
						Rename
					</button>
				</div>
			</form>
		{/if}
	</div>
</div>

<style>
	.pause-overlay {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(4, 10, 8, 0.6);
		backdrop-filter: blur(4px);
		z-index: 30;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: #eaf6ff;
	}

	.pause-panel {
		width: min(20rem, 90vw);
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 1.4rem;
		border-radius: 14px;
		background: rgba(12, 24, 19, 0.95);
		border: 1px solid rgba(234, 246, 255, 0.18);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
	}

	h2 {
		margin: 0;
		font-size: 1.1rem;
		text-align: center;
	}

	.world-line {
		margin: 0;
		text-align: center;
		font-size: 0.85rem;
		opacity: 0.75;
	}

	.seed-line {
		margin: 0;
		text-align: center;
		font-size: 0.75rem;
		opacity: 0.6;
	}

	.status-line {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		opacity: 0.85;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #39d353;
	}

	.dot[data-status='dirty'] {
		background: #ffc857;
	}

	.dot[data-status='saving'] {
		background: #9fe8ff;
	}

	.dot[data-status='error'] {
		background: #ff6b6b;
	}

	.save-error {
		margin: 0;
		padding: 0.5rem 0.6rem;
		border-radius: 8px;
		background: rgba(90, 20, 20, 0.7);
		border: 1px solid rgba(255, 122, 122, 0.5);
		font-size: 0.75rem;
		line-height: 1.35;
	}

	.error-actions {
		display: flex;
		gap: 0.4rem;
	}

	.error-actions button {
		flex: 1 1 0;
	}

	.menu-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.25rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	input {
		padding: 0.5rem 0.6rem;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.25);
		background: rgba(0, 0, 0, 0.35);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.9rem;
	}

	button {
		padding: 0.55rem 0.9rem;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.25);
		background: rgba(10, 20, 15, 0.6);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: rgba(30, 55, 42, 0.9);
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

	button.danger {
		color: #ffb4b4;
		border-color: rgba(255, 122, 122, 0.45);
	}
</style>
