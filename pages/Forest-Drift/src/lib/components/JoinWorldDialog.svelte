<script lang="ts">
	import { untrack } from 'svelte';
	import OnlineOwnerPanel from './OnlineOwnerPanel.svelte';
	import type { TransferResult } from '$lib/game/net/worldTransfer';
	import type { WorldMetadata } from '$lib/game/world/WorldTypes';
	import {
		AVATAR_COLOURS,
		parseWorldReference,
		type OnlineWorldEntry,
		type WorldReference
	} from '$lib/game/net/mpConfig';
	import { sanitizeDisplayName } from '$lib/game/net/protocol';
	import { relativeTime } from '$lib/ui/relativeTime';

	interface Props {
		/** Known from the invite link; null asks for the link. */
		target: WorldReference | null;
		initialName: string;
		initialColour: string;
		busy: boolean;
		error: string | null;
		/** Online worlds saved or joined in this browser, offered in place of a link. */
		recentWorlds?: OnlineWorldEntry[];
		onJoin: (reference: WorldReference, name: string, colour: string) => void;
		onForget?: (worldId: string) => void;
		onSave?: (reference: WorldReference, name: string) => string | null;
		localWorlds?: Pick<WorldMetadata, 'id' | 'name'>[];
		onCreateInvites?: (
			worldId: string,
			password: string
		) => Promise<TransferResult<OnlineWorldEntry>>;
		onChooseWorld?: (reference: WorldReference) => void;
		onManageWorlds?: () => void;
		onCancel: () => void;
	}

	const {
		target,
		initialName,
		initialColour,
		busy,
		error,
		recentWorlds = [],
		onJoin,
		onForget,
		onSave,
		localWorlds = [],
		onCreateInvites,
		onChooseWorld,
		onManageWorlds,
		onCancel
	}: Props = $props();

	const TABS = ['join', 'help', 'owner'] as const;
	let tab = $state<(typeof TABS)[number]>('join');
	function tabKey(event: KeyboardEvent) {
		const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!direction && event.key !== 'Home' && event.key !== 'End') return;
		event.preventDefault();
		tab =
			event.key === 'Home'
				? 'join'
				: event.key === 'End'
					? 'owner'
					: TABS[(TABS.indexOf(tab) + direction + TABS.length) % TABS.length];
		document.getElementById(`online-tab-${tab}`)?.focus();
	}

	const ROLE_LABEL = { owner: 'Owner', editor: 'Builder', viewer: 'Visitor' } as const;

	let reference = $state('');
	let linkName = $state('');
	let savedMessage = $state<string | null>(null);
	// Editable copies: the props only seed the fields.
	let name = $state(untrack(() => initialName));
	let colour = $state(untrack(() => initialColour));
	let localError = $state<string | null>(null);

	const cleanName = $derived(sanitizeDisplayName(name));

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		const world = target ?? parseWorldReference(reference);
		if (!world) {
			localError = 'Paste the whole invite link you were sent.';
			return;
		}
		if (!cleanName) {
			localError = 'Choose a name of 2–20 characters.';
			return;
		}
		localError = null;
		onJoin(world, cleanName, colour);
	}

	function saveInvite() {
		if (busy || !onSave) return;
		savedMessage = null;
		const world = target ?? parseWorldReference(reference);
		if (!world?.invite) {
			localError = 'Paste the whole invite link, including its invite code, to save it.';
			return;
		}
		localError = onSave(world, linkName);
		if (!localError) {
			savedMessage = 'Invite link saved on this device. Choose it from Saved worlds to join later.';
			reference = '';
			linkName = '';
		}
	}

	function joinRecent(entry: OnlineWorldEntry) {
		if (busy) return;
		if (!cleanName) {
			localError = 'Choose a name of 2–20 characters.';
			return;
		}
		localError = null;
		onJoin({ worldId: entry.worldId, invite: entry.invite }, cleanName, colour);
	}

	function recentMeta(entry: OnlineWorldEntry): string {
		const parts: string[] = [];
		if (entry.role) parts.push(ROLE_LABEL[entry.role]);
		if (entry.lastJoinedAt) parts.push(`Played ${relativeTime(entry.lastJoinedAt)}`);
		return parts.join(' · ');
	}
</script>

<div data-ui-backdrop class="modal-backdrop" role="presentation">
	<div
		data-ui-surface="panel"
		class="modal"
		data-testid="join-world-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="online-dialog-title"
	>
		<h3 id="online-dialog-title">Online worlds</h3>
		<div class="online-tabs" role="tablist" aria-label="Online worlds">
			{#each TABS as item}
				<button
					type="button"
					role="tab"
					disabled={busy}
					id={`online-tab-${item}`}
					aria-controls={`online-panel-${item}`}
					aria-selected={tab === item}
					tabindex={tab === item ? 0 : -1}
					onclick={() => (tab = item)}
					onkeydown={tabKey}
				>
					{item === 'join' ? 'Join' : item === 'help' ? 'How it works' : 'Owner'}
				</button>
			{/each}
		</div>
		<div
			id="online-panel-join"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="online-tab-join"
			hidden={tab !== 'join'}
		>
			<form class="join-form" onsubmit={submit}>
				<p class="modal-hint">
					Have an invite from Xander? Paste it below to join, or save it for later. Open How it
					works for the steps.
				</p>
				{#if !target && recentWorlds.length > 0}
					<section class="recent" aria-labelledby="recent-worlds-heading">
						<h4 id="recent-worlds-heading">Saved worlds</h4>
						<ul data-testid="recent-worlds">
							{#each recentWorlds as entry (entry.worldId)}
								<li data-testid="recent-world-{entry.worldId}">
									<button
										type="button"
										class="recent-join"
										data-testid="recent-world-join"
										title="Join {entry.name}"
										onclick={() => joinRecent(entry)}
										disabled={busy}
									>
										<span class="recent-name">{entry.name}</span>
										{#if recentMeta(entry)}<span class="recent-meta">{recentMeta(entry)}</span>{/if}
									</button>
									{#if onForget}
										<button
											type="button"
											class="recent-forget"
											aria-label="Forget {entry.name}"
											title="Remove from this list (the world itself stays online)"
											onclick={() => onForget(entry.worldId)}
											disabled={busy}
										>
											×
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/if}
				{#if !target}
					<label>
						{recentWorlds.length > 0 ? 'Or paste another invite link' : 'Invite link'}
						<input
							data-testid="join-world-reference"
							bind:value={reference}
							placeholder="https://…?mp=…#invite=…"
							autocomplete="off"
						/>
					</label>
				{/if}
				{#if onSave}
					<label>
						Saved link name (optional)
						<input
							data-testid="save-invite-name"
							bind:value={linkName}
							maxlength="80"
							placeholder="e.g. Friday building world"
						/>
					</label>
					<div class="modal-buttons save-invite">
						<button
							type="button"
							data-testid="save-invite-link"
							onclick={saveInvite}
							disabled={busy}>Save invite link</button
						>
					</div>
					<p class="modal-hint">
						Save on this device without joining. Your name and colour are only needed when you join.
					</p>
				{/if}
				{#if savedMessage}
					<p class="modal-hint" role="status" data-testid="save-invite-success">{savedMessage}</p>
				{/if}
				<label>
					Your name
					<!-- svelte-ignore a11y_autofocus -->
					<input
						data-testid="join-world-name"
						bind:value={name}
						maxlength="20"
						autofocus
						placeholder="Sam"
						autocomplete="nickname"
					/>
				</label>
				<fieldset>
					<legend>Your colour</legend>
					<div class="swatches">
						{#each AVATAR_COLOURS as option (option)}
							<button
								type="button"
								class="swatch"
								class:selected={option === colour}
								style={`--swatch: ${option}`}
								aria-label={`Colour ${option}`}
								aria-pressed={option === colour}
								onclick={() => (colour = option)}
							></button>
						{/each}
					</div>
				</fieldset>
				<p class="modal-hint">
					You'll see each other move, and what you build is shared and saved online.
				</p>
				{#if localError ?? error}
					<p class="modal-error" role="alert">{localError ?? error}</p>
				{/if}
				<div class="modal-buttons">
					<button type="button" onclick={onCancel} disabled={busy}>Cancel</button>
					<button
						type="submit"
						class="primary"
						data-testid="join-world-confirm"
						disabled={busy || !cleanName}
					>
						{busy ? 'Joining…' : 'Join'}
					</button>
				</div>
			</form>
		</div>
		<div
			id="online-panel-help"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="online-tab-help"
			hidden={tab !== 'help'}
			class="online-help"
		>
			<h4>How online worlds work</h4>
			<p>
				An online world is a shared copy stored on the server. You can see other players move and
				build together, and online changes save automatically. Your offline world stays separate.
			</p>
			<h4>Join with an invite</h4>
			<ol>
				<li>Ask Xander for a Builder or Visitor invite link.</li>
				<li>
					Open the link, or paste the complete link in the Join tab, including the invite code after <strong
						>#invite=</strong
					>.
				</li>
				<li>
					Choose a name (2–20 characters) and colour, then select <strong>Join</strong>. Guests do
					not need the owner password.
				</li>
			</ol>
			<h4>Save a link for later</h4>
			<p>
				In Join, paste the link, add an optional saved name and select <strong
					>Save invite link</strong
				>. It appears in Saved worlds on this browser. Saving a link does not join the world;
				clearing browser data removes saved links.
			</p>
			<h4>Create invites · Xander only</h4>
			<ol>
				<li>Open <strong>Owner</strong> and select a local world.</li>
				<li>Enter the owner password and choose the invite’s permissions.</li>
				<li>
					Select <strong>Create online world &amp; invite links</strong>. This publishes a separate
					online copy.
				</li>
				<li>
					Copy the Builder or Visitor link and send it to your guests. Keep the private Owner link
					for yourself.
				</li>
			</ol>
			<h4>Roles and permissions</h4>
			<dl>
				<dt>Visitor</dt>
				<dd>Explore and see live changes. Cannot build or change world settings.</dd>
				<dt>Builder</dt>
				<dd>
					Explore, place, edit and remove building pieces. Cannot change the shared sky, weather or
					time.
				</dd>
				<dt>Owner</dt>
				<dd>Build, manage the world and change sky, weather and time. Keep this link private.</dd>
			</dl>
			<p>
				The invite link sets the guest’s role. Choosing a different role shows a different link; it
				does not change the permissions of links already sent.
			</p>
			<button type="button" class="help-action" onclick={() => (tab = 'join')}>Go to Join</button>
			<button type="button" class="help-action" onclick={onCancel}>Close</button>
		</div>
		<div
			id="online-panel-owner"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="online-tab-owner"
			hidden={tab !== 'owner'}
		>
			{#if onCreateInvites && onChooseWorld}
				<OnlineOwnerPanel
					worlds={localWorlds}
					onCreate={onCreateInvites}
					{onManageWorlds}
					onChooseWorld={(entry) => {
						tab = 'join';
						onChooseWorld({ worldId: entry.worldId, invite: entry.invite });
					}}
				/>
			{:else}<p>Owner publishing is unavailable right now.</p>{/if}
			<div class="modal-buttons"><button type="button" onclick={onCancel}>Close</button></div>
		</div>
	</div>
</div>

<style>
	.join-form,
	.online-help {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	[hidden] {
		display: none;
	}
	.online-tabs {
		display: flex;
		gap: 0.35rem;
	}
	.online-tabs button,
	.help-action {
		flex: 1;
		padding: 0.6rem 0.4rem;
		border: 1px solid rgba(234, 246, 255, 0.25);
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.3);
		color: inherit;
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.online-tabs button[aria-selected='true'] {
		background: #6f8844;
		border-color: #c4c47b;
		font-weight: 700;
	}
	.online-help {
		font-size: 0.82rem;
		line-height: 1.55;
	}
	.online-help h4,
	.online-help p,
	.online-help dl,
	.online-help ol {
		margin: 0;
	}
	.online-help ol {
		padding-left: 1.2rem;
	}
	.online-help li + li {
		margin-top: 0.35rem;
	}
	.online-help dt {
		font-weight: 700;
	}
	.online-help dd {
		margin: 0.15rem 0 0.5rem;
	}

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
		width: min(26rem, 92vw);
		box-sizing: border-box;
		max-height: 92dvh;
		overflow-y: auto;
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

	.recent {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.recent h4 {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 600;
		opacity: 0.85;
	}

	.recent ul {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: 14rem;
		overflow-y: auto;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.recent li {
		display: flex;
		gap: 0.35rem;
	}

	.recent button {
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.18);
		background: rgba(0, 0, 0, 0.3);
		color: #eaf6ff;
		font-family: inherit;
		cursor: pointer;
	}

	.recent button:hover:not(:disabled) {
		background: rgba(30, 55, 42, 0.85);
		border-color: rgba(57, 211, 83, 0.7);
	}

	.recent button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.recent-join {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		padding: 0.5rem 0.7rem;
		text-align: left;
	}

	.recent-name {
		max-width: 100%;
		font-size: 0.9rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.recent-meta {
		font-size: 0.72rem;
		opacity: 0.7;
	}

	.recent-forget {
		flex: none;
		width: 2.25rem;
		font-size: 1.1rem;
		line-height: 1;
		opacity: 0.75;
	}

	label,
	legend {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		font-weight: 600;
		opacity: 0.85;
	}

	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}

	legend {
		margin-bottom: 0.4rem;
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

	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.swatch {
		width: 2rem;
		height: 2rem;
		padding: 0;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.15);
		background: var(--swatch);
		cursor: pointer;
	}

	.swatch.selected {
		border-color: #ffffff;
		box-shadow: 0 0 0 2px rgba(57, 211, 83, 0.9);
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

	.save-invite {
		justify-content: flex-start;
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

	.modal-buttons button:hover:not(:disabled) {
		background: rgba(30, 55, 42, 0.85);
		border-color: rgba(159, 232, 255, 0.55);
	}

	.modal-buttons button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.modal-buttons button.primary {
		background: rgba(57, 211, 83, 0.85);
		border-color: rgba(57, 211, 83, 0.9);
		color: #04121f;
	}
</style>
