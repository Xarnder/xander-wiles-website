<script lang="ts">
	import MultiplayerUsage from './MultiplayerUsage.svelte';
	import type { UsageAccess } from '$lib/game/net/CloudflareUsage';
	import type { PlayerInfo, PlayerRole } from '$lib/game/net/protocol';
	interface Props {
		debugOpen: boolean;
		usageAccess: UsageAccess | null;
		multiplayerOpen: boolean;
		exampleMovement: boolean;
		players: PlayerInfo[];
		selfSlot: number | null;
		online: boolean;
		status: string;
		onCloseDebug: () => void;
		onCloseMultiplayer: () => void;
	}
	let {
		debugOpen,
		usageAccess,
		multiplayerOpen,
		exampleMovement = $bindable(false),
		players,
		selfSlot,
		online,
		status,
		onCloseDebug,
		onCloseMultiplayer
	}: Props = $props();
	let dialog = $state<HTMLDialogElement>();
	let closeDebugButton = $state<HTMLButtonElement>();
	$effect(() => {
		if (multiplayerOpen) dialog?.showModal();
		else dialog?.close();
	});
	$effect(() => {
		if (debugOpen) closeDebugButton?.focus();
	});
	const permissions: Record<PlayerRole, string> = {
		owner:
			'Explore, add and edit builds, delete anyone’s objects, and change sky, weather and time.',
		editor:
			'Explore, add and edit anyone’s builds. Delete own objects only; shared deletions may need confirmation.',
		viewer:
			'Explore and watch shared changes. Cannot build, delete objects or change the environment.'
	};
	const roles: Record<PlayerRole, string> = {
		owner: 'Owner',
		editor: 'Editor / Builder',
		viewer: 'Viewer / Visitor'
	};
</script>

{#if debugOpen}
	<aside data-ui-surface="panel" class="debug-panel" aria-label="Dev and Debug controls" data-testid="debug-panel">
		<header>
			<h2>Dev &amp; Debug</h2>
			<button
				bind:this={closeDebugButton}
				onclick={onCloseDebug}
				aria-label="Close Dev and Debug controls">Close</button
			>
		</header>
		<p>
			Test your player’s movement while watching the game. Other connected players see the same
			movement.
		</p>
		<label class="toggle"
			><input type="checkbox" bind:checked={exampleMovement} data-testid="example-movement" /> Example
			movement</label
		>
		<p class="status" role="status">
			{exampleMovement
				? 'Running · manual controls disabled'
				: 'Stopped · game controls held while this panel is open'}
		</p>
		<p>
			Walks a figure of eight around your starting position and jumps about every four seconds.
			Start in an open area: normal terrain, walls and ceilings still apply.
		</p>
		<p>
			Turn off the toggle to stop. Closing this panel also stops the test and restores manual
			controls. Click the game to resume.
		</p>
		<dl>
			<dt>Session</dt>
			<dd>{online ? status : 'Local world'}</dd>
			<dt>Players</dt>
			<dd>{online ? players.length : 1}</dd>
		</dl>
		<p class="hint">
			Keep this tab visible for reliable movement updates. Escape returns to Pause.
		</p>
	</aside>
{/if}

<dialog data-ui-surface="panel"
	bind:this={dialog}
	oncancel={(event) => {
		event.preventDefault();
		onCloseMultiplayer();
	}}
	aria-labelledby="multiplayer-title"
	data-testid="multiplayer-menu"
>
	<header>
		<h2 id="multiplayer-title">Multiplayer</h2>
		<button onclick={onCloseMultiplayer}>Back</button>
	</header>
	{#if online}
		<p>{status} · {players.length} / 20 players</p>
		{#if multiplayerOpen}<MultiplayerUsage access={usageAccess} />{/if}
		<ul>
			{#each players as player (player.playerId)}
				<li data-testid="multiplayer-member">
					<h3>
						<span class="dot" style:background={player.colour}></span>{player.name}{player.slot ===
						selfSlot
							? ' (you)'
							: ''}
					</h3>
					<strong>{roles[player.role]}</strong> · {player.offline
						? 'Reconnecting'
						: player.away
							? 'Away'
							: 'Online'}
					<p>{permissions[player.role]}</p>
				</li>
			{/each}
		</ul>
		<p class="hint">
			Roles come from invite links. This list updates as people join or leave; it does not grant or
			change permissions.
		</p>
	{:else}
		<p>
			You are playing a local world. To see other players, return to Worlds and use Join Online with
			a complete invite link.
		</p>
	{/if}
</dialog>

<style>
	.debug-panel,
	dialog {
		box-sizing: border-box;
		color: #eaf6ff;
		background: #101f1b;
		font:
			0.9rem/1.5 system-ui,
			sans-serif;
		padding: 1.25rem;
		border: 1px solid #3c594e;
	}
	.debug-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 22rem;
		overflow: auto;
		z-index: 60;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	h2 {
		margin: 0;
		font-size: 1.15rem;
	}
	h3 {
		margin: 0 0 0.3rem;
		font-size: 1rem;
	}
	button {
		border: 1px solid #709383;
		border-radius: 7px;
		background: #203d30;
		color: inherit;
		padding: 0.5rem 0.8rem;
		cursor: pointer;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid #a3f0c7;
		outline-offset: 3px;
	}
	.toggle {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		padding: 1rem 0;
		font-weight: 700;
	}
	input {
		width: 1.25rem;
		height: 1.25rem;
		accent-color: #5bdb95;
	}
	.status {
		background: #254534;
		padding: 0.7rem;
		border-radius: 7px;
	}
	.hint {
		color: #b4c6bd;
		font-size: 0.8rem;
	}
	dialog {
		width: min(38rem, 92vw);
		max-height: 85vh;
		border-radius: 14px;
		overflow: auto;
	}
	dialog::backdrop {
		background: #020a08b8;
	}
	ul {
		padding: 0;
		list-style: none;
	}
	li {
		padding: 1rem 0;
		border-bottom: 1px solid #3c594e;
	}
	li p {
		margin-bottom: 0;
	}
	.dot {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		margin-right: 0.5rem;
	}
	dl {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	dd {
		margin: 0;
		text-align: right;
	}
	@media (max-width: 799px) {
		.debug-panel {
			top: auto;
			left: 0;
			width: 100%;
			height: 15rem;
		}
	}
</style>
