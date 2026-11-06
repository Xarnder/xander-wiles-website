<script lang="ts">
	import titleMark from '#lib/assets/forest-drift-title.svg';
	import type { SaveStatus } from '#lib/game/world/WorldTypes';
	import type { WaypointView } from '#lib/game/waypoints/WaypointSystem';
	import { MAX_PERSONAL_WAYPOINTS, MAX_WAYPOINT_NAME } from '#lib/game/waypoints/WaypointSystem';

	interface Props {
		worldName: string;
		seed: string;
		saveStatus: SaveStatus;
		saveError: string | null;
		busy: boolean;
		onResume: () => void;
		onRespawn: () => void;
		onSave: () => void;
		onRename: (name: string) => void;
		onExport: () => void;
		onDuplicate: () => void;
		onQuit: () => void;
		onOpenSettings: () => void;
		onOpenControls: () => void;
		onOpenCreatureLab: () => void;
		onOpenDebug: () => void;
		onOpenMultiplayer: () => void;
		/** Waypoints: the creature waypoint first, then the player's own. */
		waypoints?: WaypointView[];
		/** Paw badges over creatures that can be carried. */
		carryHints?: boolean;
		onToggleWaypoint?: (id: string, on: boolean) => void;
		onAddWaypoint?: (name: string) => void;
		onRemoveWaypoint?: (id: string) => void;
		onToggleCarryHints?: (on: boolean) => void;
	}

	const {
		worldName,
		seed,
		saveStatus,
		saveError,
		busy,
		onResume,
		onRespawn,
		onSave,
		onRename,
		onExport,
		onDuplicate,
		onQuit,
		onOpenSettings,
		onOpenControls,
		onOpenCreatureLab,
		onOpenDebug,
		onOpenMultiplayer,
		waypoints = [],
		carryHints = true,
		onToggleWaypoint,
		onAddWaypoint,
		onRemoveWaypoint,
		onToggleCarryHints
	}: Props = $props();

	type Panel = 'root' | 'world' | 'rename' | 'waypoints';
	let newWaypointName = $state('');
	const personalCount = $derived(waypoints.filter((w) => !w.dynamic).length);

	function metres(distance: number | null): string {
		return distance === null ? '' : `${Math.max(1, Math.round(distance))} m`;
	}

	/** The second line of a waypoint row: what it points at and how far. */
	function detailText(w: WaypointView): string {
		if (w.dynamic) {
			if (w.status === 'off') return 'Follows the closest small creature you can pick up';
			if (w.status === 'carrying') return "You're carrying one: put it down to look for another";
			if (w.status === 'none') return 'None nearby: explore and it will find one';
			return `${w.detail ?? 'Creature'} · ${metres(w.distance)}`;
		}
		return `${metres(w.distance)} away${w.enabled ? '' : ' · hidden'}`;
	}

	function submitWaypoint(event: SubmitEvent) {
		event.preventDefault();
		onAddWaypoint?.(newWaypointName);
		newWaypointName = '';
	}
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

<div data-ui-backdrop data-pause-backdrop class="pause-overlay" data-testid="pause-menu">
	<div data-ui-surface="panel" data-pause-panel class="pause-panel">
		{#if panel === 'root'}
			<img class="pause-logo" src={titleMark} alt="Forest Drift" width="625" height="362" />
			<p class="pause-eyebrow">TAKE A BREATHER</p>
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

			<button class="primary" data-testid="pause-resume" onclick={onResume}>Resume</button>

			<div class="section">
				<p class="section-label">Explore</p>
				<div class="tool-grid">
					<button data-testid="pause-settings" onclick={onOpenSettings}>Settings</button>
					<button data-testid="pause-controls" onclick={onOpenControls}>Help</button>
					<button data-testid="pause-creature-lab" onclick={onOpenCreatureLab}>Creature Lab</button>
					<button data-testid="pause-waypoints" onclick={() => (panel = 'waypoints')}>
						Waypoints
					</button>
				</div>
			</div>

			<div class="section">
				<p class="section-label">Session</p>
				<button data-testid="pause-multiplayer" onclick={onOpenMultiplayer}>Multiplayer</button>
				<button data-testid="pause-debug" onclick={onOpenDebug}>Dev &amp; Debug controls</button>
				<p class="section-label">World</p>
				<button
					data-testid="pause-respawn"
					onclick={onRespawn}
					disabled={busy}
					title="Respawn at start location"
				>
					Respawn
				</button>
				<button data-testid="pause-save" onclick={onSave} disabled={busy}>Save</button>
				<button data-testid="pause-world" onclick={() => (panel = 'world')}>World</button>
				<button class="danger" data-testid="pause-quit" onclick={onQuit} disabled={busy}>
					Quit to Worlds
				</button>
			</div>

			<p class="menu-hint">Esc to resume · H for help</p>
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
		{:else if panel === 'waypoints'}
			<h2 data-testid="pause-waypoints-panel">Waypoints</h2>
			<p class="panel-note">
				Turn a waypoint on to show a beacon in the world and a marker on the locator bar at the top
				of the screen. The creature waypoint moves with the creature.
			</p>
			<ul class="waypoint-list">
				{#each waypoints as w (w.id)}
					<li class="waypoint-row" data-testid="waypoint-row" data-id={w.id} data-status={w.status}>
						<span class="waypoint-icon" style:--waypoint-colour={w.colour} aria-hidden="true"
							>{w.icon}</span
						>
						<span class="waypoint-text">
							<span class="waypoint-name">{w.name}</span>
							<span class="waypoint-detail" data-testid="waypoint-detail">{detailText(w)}</span>
						</span>
						<button
							class="switch"
							role="switch"
							aria-checked={w.enabled}
							aria-label={w.name}
							data-testid="waypoint-toggle"
							onclick={() => onToggleWaypoint?.(w.id, !w.enabled)}
						>
							<span class="knob"></span>
						</button>
						{#if !w.dynamic}
							<button
								class="remove"
								aria-label={`Remove ${w.name}`}
								data-testid="waypoint-remove"
								onclick={() => onRemoveWaypoint?.(w.id)}>×</button
							>
						{/if}
					</li>
				{/each}
			</ul>
			<form class="add-waypoint" onsubmit={submitWaypoint}>
				<input
					aria-label="New waypoint name"
					placeholder="Name (optional)"
					maxlength={MAX_WAYPOINT_NAME}
					bind:value={newWaypointName}
					data-testid="waypoint-name-input"
				/>
				<button
					type="submit"
					data-testid="waypoint-add"
					disabled={personalCount >= MAX_PERSONAL_WAYPOINTS}
				>
					Add here
				</button>
			</form>
			<label class="hint-toggle">
				<input
					type="checkbox"
					checked={carryHints}
					data-testid="carry-hints-toggle"
					onchange={(event) => onToggleCarryHints?.(event.currentTarget.checked)}
				/>
				Show a paw badge over creatures you can pick up
			</label>
			<button data-testid="pause-waypoints-back" onclick={() => (panel = 'root')}>Back</button>
		{:else}
			<h2>Rename World</h2>
			<form onsubmit={submitRename}>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					aria-label="World name"
					data-testid="pause-rename-input"
					autofocus
					bind:value={renameValue}
					maxlength="80"
				/>
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
	.pause-logo {
		width: 132px;
		height: auto;
		margin: 0 auto;
	}
	.pause-eyebrow {
		text-align: center;
		margin: 0;
		color: var(--fd-gold);
		font-size: 0.62rem;
		letter-spacing: 0.18em;
	}
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
		width: min(24rem, 92vw);
		max-height: 90vh;
		overflow-y: auto;
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

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.section-label {
		margin: 0;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #9fd8b8;
	}

	.tool-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.tool-grid button {
		padding: 0.5rem 0.35rem;
		font-size: 0.75rem;
		white-space: normal;
	}

	.menu-hint {
		margin: 0.15rem 0 0;
		text-align: center;
		font-size: 0.7rem;
		opacity: 0.55;
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

	.panel-note {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.4;
		opacity: 0.75;
		text-align: center;
	}

	.waypoint-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.waypoint-row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.45rem 0.5rem;
		border-radius: 9px;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(234, 246, 255, 0.12);
	}

	/* The same pin-head shape as on the locator bar, in the waypoint's colour. */
	.waypoint-icon {
		flex: none;
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 0.45rem 0.45rem 0.45rem 0.1rem;
		background: var(--waypoint-colour);
		border: 1.5px solid rgba(4, 18, 31, 0.75);
		color: #04121f;
		font-size: 0.85rem;
	}

	.waypoint-text {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.waypoint-name {
		font-size: 0.85rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.waypoint-detail {
		font-size: 0.7rem;
		opacity: 0.7;
	}

	button.switch {
		flex: none;
		position: relative;
		width: 2.6rem;
		height: 1.5rem;
		min-height: 44px;
		padding: 0;
		border: none;
		background: transparent;
	}

	button.switch::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 1.5rem;
		transform: translateY(-50%);
		border-radius: 999px;
		background: rgba(234, 246, 255, 0.18);
		border: 1px solid rgba(234, 246, 255, 0.3);
	}

	button.switch[aria-checked='true']::before {
		background: rgba(57, 211, 83, 0.85);
		border-color: rgba(57, 211, 83, 0.95);
	}

	button.switch .knob {
		position: absolute;
		top: 50%;
		left: 0.2rem;
		width: 1.1rem;
		height: 1.1rem;
		transform: translateY(-50%);
		border-radius: 50%;
		background: #eaf6ff;
		transition: left 0.15s ease;
	}

	button.switch[aria-checked='true'] .knob {
		left: 1.3rem;
	}

	button.switch:hover:not(:disabled) {
		background: transparent;
	}

	button.switch:focus-visible {
		outline: 2px solid #edcf85;
		outline-offset: 2px;
		border-radius: 999px;
	}

	button.remove {
		flex: none;
		width: 2rem;
		min-height: 44px;
		padding: 0;
		font-size: 1.1rem;
		line-height: 1;
	}

	.add-waypoint {
		flex-direction: row;
	}

	.add-waypoint input {
		flex: 1 1 auto;
		min-width: 0;
	}

	.hint-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.hint-toggle input {
		width: 1.1rem;
		height: 1.1rem;
		padding: 0;
		accent-color: #39d353;
	}

	@media (prefers-reduced-motion: reduce) {
		button.switch .knob {
			transition: none;
		}
	}

	button.danger {
		color: #ffb4b4;
		border-color: rgba(255, 122, 122, 0.45);
	}
</style>
