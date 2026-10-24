<script lang="ts">
	import type { PlayerInfo, PlayerRole } from '$lib/game/net/protocol';
	let {
		players,
		selfSlot,
		trackedPlayerId,
		onTrack
	}: {
		players: PlayerInfo[];
		selfSlot: number | null;
		trackedPlayerId: string | null;
		onTrack: (id: string | null) => void;
	} = $props();
	const roles: Record<PlayerRole, string> = {
		owner: 'Owner',
		editor: 'Builder',
		viewer: 'Visitor'
	};
	const permissions: Record<PlayerRole, string> = {
		owner: 'Can build, edit and remove anyone’s objects, and change sky, weather and time.',
		editor:
			'Can build and edit shared objects. Can remove their own objects; shared deletions may need confirmation.',
		viewer: 'Can explore and watch shared changes. Cannot build or change the environment.'
	};
</script>

<section aria-label="People in this world">
	<p class="intro">Find your people</p>
	<p class="description">Track someone to keep their direction and distance on your compass.</p>
	<ul>
		{#each players as player (player.playerId)}
			{@const self = player.slot === selfSlot}
			{@const tracked = player.playerId === trackedPlayerId}
			<li data-testid="multiplayer-member" class:tracked>
				<div class="identity">
					<span class="avatar" style:--player-colour={player.colour} aria-hidden="true">
						{player.name.slice(0, 1).toUpperCase()}
					</span>
					<div class="name-block">
						<h3>
							{player.name}{#if self}<span class="you">you</span>{/if}
						</h3>
						<p class="presence">
							<span class="role">{roles[player.role]}</span><span aria-hidden="true">·</span
							>{player.offline ? 'Reconnecting' : player.away ? 'Away' : 'Online'}
						</p>
					</div>
					{#if !self}
						<button
							type="button"
							class="track-button"
							class:active={tracked}
							aria-pressed={tracked}
							aria-label={tracked ? `Stop tracking ${player.name}` : `Track ${player.name}`}
							disabled={player.offline && !tracked}
							onclick={() => onTrack(tracked ? null : player.playerId)}
						>
							<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"
								><circle cx="10" cy="10" r="5.5" /><circle cx="10" cy="10" r="1.5" /><path
									d="M10 1v3m0 12v3M1 10h3m12 0h3"
								/></svg
							>
							{tracked ? 'Tracking' : 'Track'}
						</button>
					{/if}
				</div>
				<details>
					<summary>Permissions</summary>
					<p>{permissions[player.role]}</p>
				</details>
			</li>
		{/each}
	</ul>
	{#if players.length === 1}<p class="empty">
			A little quiet here. Share an invite link to bring someone along.
		</p>{/if}
</section>

<style>
	.intro {
		margin: 1.2rem 0 0.2rem;
		font-size: 1rem;
		font-weight: 700;
		color: #f4e4ba;
	}
	.description,
	.empty {
		margin: 0 0 1rem;
		color: #bbc9c1;
		font-size: 0.8rem;
		line-height: 1.5;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.55rem;
	}
	li {
		padding: 0.75rem;
		border: 1px solid #ffffff18;
		border-radius: 12px;
		background: #09171070;
	}
	li.tracked {
		border-color: #d7b76c90;
		background: #4c412130;
	}
	.identity {
		display: flex;
		gap: 0.7rem;
		align-items: center;
	}
	.avatar {
		display: grid;
		place-items: center;
		flex: 0 0 34px;
		height: 34px;
		border-radius: 10px;
		border: 2px solid var(--player-colour);
		color: #fff;
		background: #14261d;
		font-size: 0.85rem;
		font-weight: 700;
		box-shadow: inset 0 -3px 0 #0003;
	}
	.name-block {
		flex: 1;
		min-width: 0;
	}
	h3 {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.4;
		overflow-wrap: anywhere;
		color: #f3f5ed;
	}
	.you {
		margin-left: 0.45rem;
		color: #b8c7be;
		font-size: 0.68rem;
		font-weight: 400;
	}
	.presence {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0.15rem 0 0;
		color: #b8c7be;
		font-size: 0.7rem;
	}
	.role {
		color: #dfd7bf;
	}
	.track-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		flex-shrink: 0;
		min-height: 36px;
		padding: 0.4rem 0.65rem;
		border: 1px solid #90ae9c66;
		border-radius: 8px;
		background: #243d30;
		color: #eaf2e9;
		font: 600 0.75rem system-ui;
		cursor: pointer;
	}
	.track-button:hover {
		background: #34533f;
	}
	.track-button.active {
		background: #d8ba76;
		border-color: #e5cc96;
		color: #262a1e;
	}
	.track-button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	svg {
		width: 15px;
		height: 15px;
		stroke: currentColor;
		stroke-width: 1.5;
	}
	details {
		margin: 0.5rem 0 0 46px;
		color: #b7c6bd;
		font-size: 0.72rem;
	}
	summary {
		cursor: pointer;
		width: fit-content;
		padding: 0.15rem 0;
	}
	details p {
		margin: 0.35rem 0 0;
		line-height: 1.5;
	}
	button:focus-visible,
	summary:focus-visible {
		outline: 2px solid #edcf85;
		outline-offset: 3px;
	}
	.empty {
		margin-top: 0.8rem;
	}
	@media (max-width: 30rem) {
		li {
			padding: 0.6rem;
		}
		.identity {
			gap: 0.5rem;
		}
		.track-button {
			min-height: 44px;
		}
	}
</style>
