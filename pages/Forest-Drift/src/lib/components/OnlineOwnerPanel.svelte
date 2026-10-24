<script lang="ts">
	import type { OnlineWorldEntry } from '$lib/game/net/mpConfig';
	import { inviteLink } from '$lib/game/net/mpConfig';
	import type { TransferResult } from '$lib/game/net/worldTransfer';
	import type { WorldMetadata } from '$lib/game/world/WorldTypes';
	import InviteLinks from './InviteLinks.svelte';

	let {
		worlds,
		onCreate,
		onChooseWorld,
		onManageWorlds
	}: {
		worlds: Pick<WorldMetadata, 'id' | 'name'>[];
		onCreate: (worldId: string, password: string) => Promise<TransferResult<OnlineWorldEntry>>;
		onChooseWorld: (entry: OnlineWorldEntry) => void;
		onManageWorlds?: () => void;
	} = $props();
	let selected = $state('');
	const worldId = $derived(
		worlds.find((world) => world.id === selected)?.id ?? worlds[0]?.id ?? ''
	);
	let password = $state('');
	let role = $state<'editor' | 'viewer'>('viewer');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let published = $state<OnlineWorldEntry | null>(null);

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !worldId || !password) return;
		busy = true;
		error = null;
		try {
			const result = await onCreate(worldId, password);
			if (result.ok) {
				published = result.value;
				password = '';
			} else error = result.error;
		} catch {
			error = 'Unable to create the online world. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="owner-panel" data-testid="online-owner-panel">
	<h4>Create invite links · owner only</h4>
	<p>
		Publish a local world as a separate online copy. Only Xander’s owner password can create it;
		guests join with an invite and never need the password.
	</p>
	{#if onManageWorlds && !published}
		<button type="button" data-testid="owner-manage-worlds" onclick={onManageWorlds}
			>Create / manage local worlds</button
		>
	{/if}
	{#if !published}
		<form onsubmit={create}>
			<label
				>World to share
				<select
					data-testid="owner-world"
					value={worldId}
					onchange={(event) => (selected = event.currentTarget.value)}
					disabled={busy || !worlds.length}
				>
					{#each worlds as world (world.id)}<option value={world.id}>{world.name}</option>{/each}
				</select>
			</label>
			{#if !worlds.length}<p>Create or import a world from the Worlds screen first.</p>{/if}
			<label
				>Owner password
				<input
					data-testid="owner-password"
					type="password"
					bind:value={password}
					autocomplete="current-password"
					disabled={busy}
					required
				/>
			</label>
			<label
				>Invite permissions
				<select data-testid="owner-invite-role" bind:value={role} disabled={busy}>
					<option value="viewer">Visitor · explore only</option>
					<option value="editor">Builder · explore and build</option>
				</select>
			</label>
			<p>
				{role === 'editor'
					? 'Builders can place, edit and remove building pieces. They cannot change the shared sky, weather or time.'
					: 'Visitors can explore and see everyone’s changes, but cannot build or change world settings.'}
			</p>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<button
				class="primary"
				data-testid="owner-create-invites"
				disabled={busy || !worldId || !password}
				type="submit">{busy ? 'Creating…' : 'Create online world & invite links'}</button
			>
			<p>Your local world stays unchanged. Each publication creates a new online world.</p>
		</form>
	{:else if published.invites}
		<p role="status" data-testid="owner-publish-success">
			<strong>{published.name}</strong> is online. Choose the access you want to share, then copy that
			link.
		</p>
		<label
			>Invite permissions
			<select data-testid="owner-invite-role" bind:value={role}>
				<option value="viewer">Visitor · explore only</option>
				<option value="editor">Builder · explore and build</option>
			</select>
		</label>
		<InviteLinks links={[{ role, url: inviteLink(published.worldId, published.invites[role]) }]} />
		<p>
			The link determines the guest’s role. Changing this selection shows the other role’s link; it
			does not change links you have already shared.
		</p>
		<details>
			<summary>Private owner link · keep for yourself</summary>
			<InviteLinks
				links={[{ role: 'owner', url: inviteLink(published.worldId, published.invites.owner) }]}
			/>
		</details>
		<button type="button" class="primary" onclick={() => onChooseWorld(published!)}
			>Join as owner</button
		>
		{#if onManageWorlds}
			<button type="button" data-testid="owner-manage-worlds" onclick={onManageWorlds}
				>Manage this online world</button
			>
			<p>
				Manage worlds lets you reopen invite links, save an offline copy and restore earlier online
				versions.
			</p>
		{/if}
		<button
			type="button"
			onclick={() => {
				published = null;
				error = null;
			}}>Publish another world</button
		>
	{/if}
</div>

<style>
	.owner-panel,
	form,
	label {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	h4,
	p {
		margin: 0;
	}
	p {
		font-size: 0.8rem;
		line-height: 1.55;
	}
	label,
	summary {
		font-size: 0.82rem;
		font-weight: 600;
	}
	input,
	select,
	button {
		box-sizing: border-box;
		min-width: 0;
		width: 100%;
		padding: 0.65rem;
		border: 1px solid rgba(234, 246, 255, 0.25);
		border-radius: 8px;
		color: inherit;
		background: rgba(0, 0, 0, 0.35);
		font: inherit;
		font-size: 0.85rem;
	}
	select option {
		color: #eaf6ff;
		background: #16251d;
	}
	button,
	summary {
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.primary {
		background: #6f8844;
		font-weight: 650;
	}
	.error {
		color: #ffb4b4;
	}
	details {
		display: grid;
		gap: 0.6rem;
	}
	summary {
		margin-bottom: 0.6rem;
	}
</style>
