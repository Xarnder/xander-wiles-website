<script lang="ts">
	import ForestDriftLogo from './ForestDriftLogo.svelte';
	import type { SaveStatus } from '#lib/game/world/WorldTypes';
	import type { WaypointView, WaypointVisibility } from '#lib/game/waypoints/WaypointSystem';
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
		/** An online world: waypoints can be made public. */
		waypointsOnline?: boolean;
		/** The last waypoint change that didn't work, or null. */
		waypointNotice?: string | null;
		onRenameWaypoint?: (id: string, name: string) => void;
		onSetWaypointVisibility?: (id: string, visibility: WaypointVisibility) => void;
		onSetWaypointControl?: (id: string, allowed: boolean) => void;
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
		onToggleCarryHints,
		waypointsOnline = false,
		waypointNotice = null,
		onRenameWaypoint,
		onSetWaypointVisibility,
		onSetWaypointControl
	}: Props = $props();

	type Panel = 'root' | 'world' | 'rename' | 'waypoints';
	let newWaypointName = $state('');
	const personalCount = $derived(
		waypoints.filter((w) => !w.dynamic && w.visibility === 'private').length
	);
	/** The waypoint being renamed, and the name typed so far. */
	let renaming = $state<string | null>(null);
	let renameDraft = $state('');

	function startRename(w: WaypointView) {
		renaming = w.id;
		renameDraft = w.name;
	}

	function submitWaypointRename(event: SubmitEvent, id: string) {
		event.preventDefault();
		onRenameWaypoint?.(id, renameDraft);
		renaming = null;
	}

	/** Who can see and change a waypoint, in a few words. */
	function sharingText(w: WaypointView): string {
		if (w.visibility === 'private')
			return waypointsOnline
				? 'Only you can see it'
				: 'Only you can see it · public waypoints are for online worlds';
		if (w.mine)
			return w.othersCanControl
				? 'Everyone in this world sees it and can change it'
				: 'Everyone in this world sees it; only you can change it';
		return w.othersCanControl
			? `${w.ownerName}'s · anyone can change it`
			: `${w.ownerName}'s · only they can change it`;
	}

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
		const off = w.enabled ? '' : w.visibility === 'public' ? ' · off for everyone' : ' · hidden';
		const changed = w.changedBy ? ` · changed by ${w.changedBy}` : '';
		return `${metres(w.distance)} away${off}${changed}`;
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

<!-- An on/off switch: a pill track with a knob, padded inside the panel's wooden button frame. -->
{#snippet toggle(
	checked: boolean,
	label: string,
	testid: string,
	disabled: boolean,
	onclick: () => void,
	small = false
)}
	<button
		class="switch"
		class:small
		role="switch"
		aria-checked={checked}
		aria-label={label}
		data-testid={testid}
		{disabled}
		{onclick}
	>
		<span class="track"><span class="knob"></span></span>
	</button>
{/snippet}

<div data-ui-backdrop data-pause-backdrop class="pause-overlay" data-testid="pause-menu">
	<div data-ui-surface="panel" data-pause-panel class="pause-panel">
		{#if panel === 'root'}
			<div class="pause-logo"><ForestDriftLogo /></div>
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
				{#if waypointsOnline}
					Switch <strong>Public</strong> on to let everyone in this world see a waypoint;
					<strong>Others can control</strong> lets them turn it on or off and rename it too.
				{:else}
					In an online world, switch <strong>Public</strong> on to let everyone there see a waypoint.
				{/if}
			</p>
			{#if waypointNotice}
				<p class="waypoint-notice" role="status" data-testid="waypoint-notice">{waypointNotice}</p>
			{/if}
			<ul class="waypoint-list">
				{#each waypoints as w (w.id)}
					<li
						class="waypoint-row"
						data-testid="waypoint-row"
						data-id={w.id}
						data-status={w.status}
						data-visibility={w.visibility}
						data-mine={w.mine}
					>
						<div class="waypoint-main">
							<span class="waypoint-icon" style:--waypoint-colour={w.colour} aria-hidden="true"
								>{w.icon}</span
							>
							{#if renaming === w.id}
								<form
									class="waypoint-rename"
									onsubmit={(event) => submitWaypointRename(event, w.id)}
								>
									<!-- svelte-ignore a11y_autofocus -->
									<input
										aria-label={`New name for ${w.name}`}
										maxlength={MAX_WAYPOINT_NAME}
										bind:value={renameDraft}
										autofocus
										data-testid="waypoint-rename-input"
										onkeydown={(event) => {
											if (event.key === 'Escape') {
												event.stopPropagation();
												renaming = null;
											}
										}}
									/>
									<button type="submit" data-testid="waypoint-rename-save">Save</button>
								</form>
							{:else}
								<span class="waypoint-text">
									<span class="waypoint-name">{w.name}</span>
									<span class="waypoint-detail" data-testid="waypoint-detail">{detailText(w)}</span>
								</span>
							{/if}
							<span class="show-switch">
								<span class="switch-caption" aria-hidden="true"
									>{w.visibility === 'public' ? 'Show for all' : 'Show'}</span
								>
								{@render toggle(
									w.enabled,
									w.canToggle
										? `Show ${w.name}${w.visibility === 'public' ? ' for everyone' : ''}`
										: `${w.name}: only ${w.ownerName} can show or hide it`,
									'waypoint-toggle',
									!w.canToggle || w.pending,
									() => onToggleWaypoint?.(w.id, !w.enabled)
								)}
							</span>
						</div>
						{#if w.dynamic}
							{#if waypointsOnline}
								<p class="waypoint-options-note">
									Always private: creatures wander differently for each player.
								</p>
							{/if}
						{:else}
							<div class="waypoint-options">
								<div class="option-line">
									{#if w.mine}
										<!-- Who can see it: a switch on every one of this player's own waypoints. -->
										<label class="option" class:unavailable={!w.canShare}>
											{@render toggle(
												w.visibility === 'public',
												`Public: everyone in this world can see ${w.name}`,
												'waypoint-visibility',
												!w.canShare || w.pending,
												() =>
													onSetWaypointVisibility?.(
														w.id,
														w.visibility === 'public' ? 'private' : 'public'
													),
												true
											)}
											<span class="option-text">
												<span class="option-title">Public</span>
												<span class="option-hint" data-testid="waypoint-sharing"
													>{sharingText(w)}</span
												>
											</span>
										</label>
									{:else}
										<p class="option-hint other-owner" data-testid="waypoint-sharing">
											{sharingText(w)}
										</p>
									{/if}
									<span class="option-actions">
										{#if w.canRename && renaming !== w.id}
											<button
												class="icon-button"
												aria-label={`Rename ${w.name}`}
												data-testid="waypoint-rename"
												disabled={w.pending}
												onclick={() => startRename(w)}>✎</button
											>
										{/if}
										{#if w.canRemove}
											<button
												class="icon-button"
												aria-label={`Remove ${w.name}`}
												data-testid="waypoint-remove"
												disabled={w.pending}
												onclick={() => onRemoveWaypoint?.(w.id)}>×</button
											>
										{/if}
									</span>
								</div>
								{#if w.canSetControl}
									<div class="option-line">
										<label class="option">
											{@render toggle(
												w.othersCanControl,
												`Others can show, hide and rename ${w.name}`,
												'waypoint-control',
												w.pending,
												() => onSetWaypointControl?.(w.id, !w.othersCanControl),
												true
											)}
											<span class="option-text">
												<span class="option-title">Others can control</span>
												<span class="option-hint">Show or hide it for everyone, and rename it</span>
											</span>
										</label>
									</div>
								{/if}
							</div>
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
		width: 230px;
		max-width: 100%;
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
		padding: 0.6rem 0.7rem;
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

	/*
	 * The switch sits in the panel's wooden button frame; the padding keeps the track clear of the
	 * frame on every side.
	 */
	button.switch {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0.45rem 0.7rem;
	}

	button.switch .track {
		position: relative;
		display: block;
		width: 2.6rem;
		height: 1.45rem;
		border-radius: 999px;
		background: rgba(234, 246, 255, 0.14);
		border: 1px solid rgba(234, 246, 255, 0.4);
		box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
		transition: background-color 0.15s ease;
	}

	button.switch[aria-checked='true'] .track {
		background: rgba(57, 211, 83, 0.9);
		border-color: #6ee787;
	}

	button.switch .knob {
		position: absolute;
		top: 50%;
		left: 0.17rem;
		width: 1.1rem;
		height: 1.1rem;
		transform: translateY(-50%);
		border-radius: 50%;
		background: #f4fbff;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
		transition: left 0.15s ease;
	}

	button.switch[aria-checked='true'] .knob {
		left: calc(100% - 1.27rem);
	}

	button.switch.small {
		min-height: 40px;
		padding: 0.35rem 0.55rem;
	}

	button.switch.small .track {
		width: 2.15rem;
		height: 1.2rem;
	}

	button.switch.small .knob {
		width: 0.9rem;
		height: 0.9rem;
	}

	button.switch.small[aria-checked='true'] .knob {
		left: calc(100% - 1.07rem);
	}

	button.switch:focus-visible {
		outline: 2px solid #edcf85;
		outline-offset: 2px;
	}

	.waypoint-main {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}

	.waypoint-options {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(234, 246, 255, 0.1);
	}

	.option-line {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.option {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.55rem;
		cursor: pointer;
	}

	.option.unavailable {
		cursor: default;
	}

	.option-text {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.option-title {
		font-size: 0.82rem;
		font-weight: 700;
	}

	.option-hint {
		font-size: 0.7rem;
		opacity: 0.75;
	}

	.option-hint.other-owner {
		flex: 1 1 auto;
		margin: 0;
	}

	.show-switch {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
	}

	.switch-caption {
		font-size: 0.72rem;
		font-weight: 650;
		opacity: 0.8;
		white-space: nowrap;
	}

	.waypoint-options-note {
		flex-basis: 100%;
		margin: 0;
		font-size: 0.7rem;
		opacity: 0.7;
	}

	.waypoint-row > .waypoint-options-note {
		margin-top: 0.4rem;
		padding-left: 2.25rem;
	}

	.option-actions {
		flex: none;
		display: inline-flex;
		gap: 0.35rem;
		margin-left: auto;
	}

	button.icon-button {
		width: 2.6rem;
		min-height: 40px;
		padding: 0;
		font-size: 1.05rem;
		line-height: 1;
	}

	.waypoint-rename {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		gap: 0.4rem;
	}

	.waypoint-rename input {
		flex: 1 1 auto;
		min-width: 0;
	}

	.waypoint-notice {
		margin: 0;
		padding: 0.5rem 0.7rem;
		border-radius: 8px;
		background: rgba(255, 179, 92, 0.16);
		border: 1px solid rgba(255, 179, 92, 0.45);
		font-size: 0.78rem;
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
		button.switch .knob,
		button.switch .track {
			transition: none;
		}
	}

	button.danger {
		color: #ffb4b4;
		border-color: rgba(255, 122, 122, 0.45);
	}
</style>
