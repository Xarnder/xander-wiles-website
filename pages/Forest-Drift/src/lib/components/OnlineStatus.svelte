<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { NetDiagnosticsReport } from '$lib/game/net/NetDiagnostics';
	import type { NetStatus } from '$lib/game/net/NetSession';
	import type { PlayerInfo, PlayerRole } from '$lib/game/net/protocol';
	import InviteLinks from './InviteLinks.svelte';

	interface Props {
		worldName: string;
		status: NetStatus;
		detail: string | null;
		players: PlayerInfo[];
		selfSlot: number | null;
		role: PlayerRole | null;
		/** Links this player can share (all three for the owner). */
		links: { role: PlayerRole; url: string }[];
		/** Connection details for the diagnostics panel (plan §8.11). */
		diagnostics: () => NetDiagnosticsReport | null;
	}

	const { worldName, status, detail, players, selfSlot, role, links, diagnostics }: Props =
		$props();

	const ROLE_LABEL: Record<PlayerRole, string> = {
		owner: 'owner',
		editor: 'builder',
		viewer: 'visitor'
	};

	let expanded = $state(false);
	let showDetails = $state(false);
	let report = $state<NetDiagnosticsReport | null>(null);
	let detailsTimer: ReturnType<typeof setInterval> | null = null;

	const label = $derived(
		status === 'connected'
			? `${players.length} ${players.length === 1 ? 'player' : 'players'}`
			: status === 'connecting'
				? 'Connecting…'
				: status === 'reconnecting'
					? 'Reconnecting…'
					: status === 'failed'
						? 'Disconnected'
						: 'Offline'
	);

	function toggleDetails() {
		showDetails = !showDetails;
		if (detailsTimer) clearInterval(detailsTimer);
		detailsTimer = null;
		if (!showDetails) return;
		report = diagnostics();
		detailsTimer = setInterval(() => (report = diagnostics()), 1000);
	}

	onDestroy(() => {
		if (detailsTimer) clearInterval(detailsTimer);
	});

	function formatBytes(perSecond: number): string {
		return perSecond >= 1024 ? `${(perSecond / 1024).toFixed(1)} KB/s` : `${perSecond} B/s`;
	}
</script>

<div class="online-status" data-testid="online-status" data-status={status} data-role={role}>
	<button
		type="button"
		class="pill"
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
		onpointerdown={(event) => event.stopPropagation()}
	>
		<span class="dot" aria-hidden="true"></span>
		<span class="world">{worldName}</span>
		<span class="count" data-testid="online-player-count">{label}</span>
	</button>
	{#if status === 'failed' && detail}
		<p class="detail" role="alert">{detail}</p>
	{/if}
	{#if expanded}
		<div class="panel" role="region" aria-label="Players online">
			<ul class="players" data-testid="online-player-list">
				{#each players as player (player.playerId)}
					<li
						class={{ away: player.away, offline: player.offline }}
						data-testid="online-player"
						data-slot={player.slot}
					>
						<span class="swatch" style={`background: ${player.colour}`} aria-hidden="true"></span>
						<span class="name">
							{player.name}{#if player.slot === selfSlot}<span class="muted"> (you)</span>{/if}
						</span>
						<span class="tags">
							{#if player.offline}<span class="tag warn">reconnecting</span>
							{:else if player.away}<span class="tag">away</span>{/if}
							<span class="tag role">{ROLE_LABEL[player.role]}</span>
						</span>
					</li>
				{/each}
			</ul>
			{#if links.length > 0}
				<div class="section">
					<InviteLinks {links} compact />
				</div>
			{/if}
			<button
				type="button"
				class="details-toggle"
				data-testid="online-details-toggle"
				onclick={toggleDetails}
				onpointerdown={(event) => event.stopPropagation()}
			>
				{showDetails ? 'Hide connection details' : 'Connection details'}
			</button>
			{#if showDetails && report}
				<dl class="details" data-testid="online-diagnostics">
					<dt>Status</dt>
					<dd>{report.status}{report.role ? ` · ${ROLE_LABEL[report.role]}` : ''}</dd>
					<dt>Round trip</dt>
					<dd>{report.rttMs === null ? '—' : `${report.rttMs} ms`}</dd>
					<dt>Smoothing delay</dt>
					<dd>
						{report.interpolationDelayMs === null ? '—' : `${report.interpolationDelayMs} ms`}
					</dd>
					<dt>Updates in</dt>
					<dd>{report.snapshotsPerSecond}/s · {formatBytes(report.downloadBytesPerSecond)}</dd>
					<dt>Updates out</dt>
					<dd>{report.posesPerSecond}/s · {formatBytes(report.uploadBytesPerSecond)}</dd>
					<dt>Last heard</dt>
					<dd>
						{report.lastMessageAgoMs === null
							? '—'
							: `${(report.lastMessageAgoMs / 1000).toFixed(1)} s ago`}
					</dd>
					<dt>Reconnects</dt>
					<dd>{report.reconnects}{report.lastClose ? ` (last: ${report.lastClose})` : ''}</dd>
					<dt>World clock</dt>
					<dd>{report.roomClock ?? '—'}</dd>
					<dt>Version</dt>
					<dd>protocol {report.protocol} · {report.build}</dd>
				</dl>
			{/if}
		</div>
	{/if}
</div>

<style>
	.online-status {
		position: fixed;
		top: 0.75rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 15;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: #eaf6ff;
		pointer-events: auto;
	}

	.pill {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.8rem;
		border-radius: 999px;
		border: 1px solid rgba(234, 246, 255, 0.2);
		background: rgba(8, 16, 12, 0.62);
		backdrop-filter: blur(4px);
		color: inherit;
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}

	.dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: #8a9a92;
	}

	[data-status='connected'] .dot {
		background: #39d353;
		box-shadow: 0 0 6px rgba(57, 211, 83, 0.8);
	}

	[data-status='connecting'] .dot,
	[data-status='reconnecting'] .dot {
		background: #f3a712;
	}

	[data-status='failed'] .dot {
		background: #ff6b6b;
	}

	.world {
		font-weight: 600;
		max-width: 14rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.count {
		opacity: 0.8;
	}

	.detail {
		margin: 0;
		max-width: 22rem;
		padding: 0.4rem 0.7rem;
		border-radius: 8px;
		background: rgba(60, 12, 12, 0.8);
		font-size: 0.78rem;
		text-align: center;
	}

	.panel {
		min-width: 12rem;
		width: min(24rem, 90vw);
		max-height: 70vh;
		overflow: auto;
		padding: 0.6rem 0.75rem;
		border-radius: 10px;
		border: 1px solid rgba(234, 246, 255, 0.15);
		background: rgba(8, 16, 12, 0.82);
		backdrop-filter: blur(4px);
		font-size: 0.8rem;
	}

	.players {
		list-style: none;
		margin: 0 0 0.5rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.players li {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.players li.away .name,
	.players li.offline .name {
		opacity: 0.55;
	}

	.name {
		flex: 1 1 auto;
	}

	.tags {
		display: flex;
		gap: 0.25rem;
	}

	.tag {
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		background: rgba(234, 246, 255, 0.1);
		font-size: 0.68rem;
		opacity: 0.85;
	}

	.tag.warn {
		background: rgba(243, 167, 18, 0.25);
	}

	.section {
		margin: 0.4rem 0 0.55rem;
		padding-top: 0.55rem;
		border-top: 1px solid rgba(234, 246, 255, 0.1);
	}

	.details {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.15rem 0.7rem;
		margin: 0.55rem 0 0;
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
	}

	.details dt {
		opacity: 0.65;
	}

	.details dd {
		margin: 0;
	}

	.swatch {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
	}

	.muted {
		opacity: 0.6;
	}

	.details-toggle {
		width: 100%;
		padding: 0.35rem 0.6rem;
		border-radius: 7px;
		border: 1px solid rgba(234, 246, 255, 0.22);
		background: rgba(30, 55, 42, 0.7);
		color: inherit;
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}
</style>
