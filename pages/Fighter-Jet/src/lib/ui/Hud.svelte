<script lang="ts">
	import type { GameSnapshot, NotificationSnapshot, TargetMarkerSnapshot } from '$lib/game/types';

	interface Props {
		snapshot: Readonly<GameSnapshot>;
		onMap: () => void;
		onCamera: () => void;
		onTarget: () => void;
	}

	const LOCK_SEGMENT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
	const MISSILE_ICON_INDICES = [0, 1, 2, 3, 4, 5] as const;

	let { snapshot, onMap, onCamera, onTarget }: Props = $props();

	const speed = $derived(Math.max(0, Math.round(snapshot.player.speed)));
	const altitude = $derived(Math.max(0, Math.round(snapshot.player.altitude)));
	const health = $derived(Math.max(0, Math.min(100, snapshot.player.health)));
	const afterburner = $derived(Math.max(0, Math.min(1, snapshot.player.afterburner)));
	const cooldown = $derived(Math.max(0, Math.min(1, snapshot.player.cooldown)));
	const missionTimer = $derived(formatTime(snapshot.missionTime));
	const heading = $derived(
		Math.round(((((snapshot.player.heading * 180) / Math.PI) % 360) + 360) % 360)
	);
	const target = $derived(snapshot.target);
	const recentNotifications = $derived(snapshot.notifications.slice(-3));

	function formatTime(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remainder = Math.floor(seconds % 60);
		return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
	}

	function edgeStyle(marker: TargetMarkerSnapshot): string {
		const angle =
			Math.atan2(marker.edge.y - window.innerHeight / 2, marker.edge.x - window.innerWidth / 2) *
				(180 / Math.PI) +
			90;
		return `left:${marker.edge.x}px;top:${marker.edge.y}px;--angle:${angle}deg`;
	}

	function targetStyle(marker: TargetMarkerSnapshot): string {
		return `left:${marker.screen.x}px;top:${marker.screen.y}px`;
	}

	function toneClass(notification: NotificationSnapshot): string {
		return `notice ${notification.tone}`;
	}
</script>

<div
	class="hud"
	class:warning={snapshot.missileWarning.active}
	class:high-contrast={snapshot.settings.highContrast}
	data-testid="game-hud"
>
	<div class="vignette" aria-hidden="true"></div>
	<div class="scanlines" aria-hidden="true"></div>

	<header class="mission-strip">
		<div class="mission-id">
			<span>OPERATION</span>
			<strong>EMBER LANCE</strong>
		</div>
		<div class="objective" data-testid="current-objective">
			<span>CURRENT OBJECTIVE // {snapshot.phase.replace('-', ' ')}</span>
			<strong>{snapshot.objective}</strong>
			<i aria-hidden="true"></i>
		</div>
		<div class="timer" data-testid="mission-timer">
			<span>MISSION TIME</span>
			<strong>{missionTimer}</strong>
		</div>
	</header>

	<div class="heading-tape" aria-hidden="true">
		<span>{((heading + 340) % 360).toString().padStart(3, '0')}</span>
		<i></i>
		<span>{((heading + 350) % 360).toString().padStart(3, '0')}</span>
		<i></i>
		<strong>{heading.toString().padStart(3, '0')}</strong>
		<i></i>
		<span>{((heading + 10) % 360).toString().padStart(3, '0')}</span>
		<i></i>
		<span>{((heading + 20) % 360).toString().padStart(3, '0')}</span>
	</div>

	<div class="reticle" aria-label="Aircraft targeting reticle">
		<svg viewBox="0 0 240 240" aria-hidden="true">
			<circle cx="120" cy="120" r="76" class="reticle-ring outer" />
			<circle cx="120" cy="120" r="48" class="reticle-ring inner" />
			<path d="M120 27v22M120 191v22M27 120h22M191 120h22" class="ticks major" />
			<path d="M57 57l15 15M168 168l15 15M183 57l-15 15M72 168l-15 15" class="ticks" />
			<path d="M95 120h18l7-7 7 7h18M120 95v10M120 135v10" class="pipper" />
			<path d="M82 153Q120 176 158 153" class="flight-cone" />
		</svg>
		<span class="flight-vector" aria-hidden="true"><i></i></span>
		<small>GUN / MSL DATUM</small>
	</div>

	{#if target?.visible && target.onScreen}
		<div class="target-marker" style={targetStyle(target)}>
			<div
				class="target-box"
				class:locked={target.lockState === 'locked'}
				class:acquiring={target.lockState === 'acquiring' || target.lockState === 'retaining'}
			>
				<i class="corner one"></i>
				<i class="corner two"></i>
				<i class="corner three"></i>
				<i class="corner four"></i>
				<div class="lock-ring">
					<svg viewBox="0 0 100 100" aria-hidden="true">
						{#each LOCK_SEGMENT_INDICES as index (index)}
							<path
								d="M50 7 A43 43 0 0 1 70.5 12.2"
								transform={`rotate(${index * 30} 50 50)`}
								class:active={index / 12 < target.lockProgress}
							/>
						{/each}
					</svg>
					<span
						>{target.lockState === 'locked'
							? 'LOCK'
							: `${Math.round(target.lockProgress * 100)}`}</span
					>
				</div>
			</div>
			<div class="target-data">
				<span>{target.isFinal ? 'PRIMARY' : target.type.replace('-', ' ')}</span>
				<strong>{target.name}</strong>
				<p>
					{Math.round(target.distance).toLocaleString()} M
					<i aria-hidden="true"></i>
					{Math.round(target.health * 100)}%
				</p>
			</div>
		</div>
	{:else if target?.visible}
		<div class="edge-arrow" style={edgeStyle(target)}>
			<svg viewBox="0 0 38 42" aria-hidden="true">
				<path d="M19 2L35 36 19 29 3 36Z" />
			</svg>
			<span>{Math.round(target.distance).toLocaleString()} M</span>
		</div>
	{/if}

	{#if snapshot.missileWarning.active}
		<div class="incoming" role="alert">
			<div class="warning-icon" aria-hidden="true">!</div>
			<div>
				<span>MISSILE THREAT</span>
				<strong>INCOMING</strong>
				<small>{Math.round(snapshot.missileWarning.distance)} M // BREAK NOW</small>
			</div>
		</div>
		<div
			class="hit-direction"
			style:--bearing={`${snapshot.missileWarning.bearing}rad`}
			aria-label="Incoming threat direction"
		>
			<i></i>
		</div>
	{/if}

	<aside class="left-stack">
		<div class="speed instrument">
			<div class="instrument-label"><span>SPD</span><small>KTS</small></div>
			<strong>{speed.toString().padStart(3, '0')}</strong>
			<div class="vertical-bar">
				<i style:--level={`${Math.min(100, (speed / 900) * 100)}%`}></i>
				<span></span><span></span><span></span><span></span>
			</div>
		</div>

		<div class="afterburner instrument small-instrument">
			<div class="instrument-label">
				<span>THRUST</span><small>{afterburner > 0.85 ? 'A/B' : 'MIL'}</small>
			</div>
			<div class="meter">
				<i style:--level={`${afterburner * 100}%`}></i>
			</div>
			<strong>{Math.round(afterburner * 100)}%</strong>
		</div>

		<div class="health instrument small-instrument" class:critical={health < 30}>
			<div class="instrument-label">
				<span>AIRFRAME</span><small>{health < 30 ? 'CRITICAL' : 'NOMINAL'}</small>
			</div>
			<div class="meter health-meter">
				<i style:--level={`${health}%`}></i>
			</div>
			<strong>{Math.round(health)}%</strong>
		</div>
	</aside>

	<aside class="right-stack">
		<div class="altitude instrument">
			<div class="instrument-label"><span>ALT</span><small>FT</small></div>
			<strong>{altitude.toLocaleString()}</strong>
			<div class="vertical-bar reverse">
				<i style:--level={`${Math.min(100, (altitude / 5000) * 100)}%`}></i>
				<span></span><span></span><span></span><span></span>
			</div>
		</div>

		<div class="weapons instrument">
			<div class="weapon-top">
				<div>
					<span>MISSILES</span>
					<small>AIM-9X</small>
				</div>
				<strong>{snapshot.player.ammo.toString().padStart(2, '0')}</strong>
			</div>
			<div class="missile-row" aria-hidden="true">
				{#each MISSILE_ICON_INDICES as index (index)}
					<svg viewBox="0 0 12 30" class:spent={index >= snapshot.player.ammo}>
						<path d="M6 1L9 6v13l2 6-5-2-5 2 2-6V6Z" />
					</svg>
				{/each}
			</div>
			<div class="cooldown">
				<span>WEAPON READY</span>
				<i><b style:--level={`${(1 - cooldown) * 100}%`}></b></i>
			</div>
		</div>
	</aside>

	<aside class="squad">
		<div class="squad-title"><span>VIPER FLIGHT</span><i></i><b>LINKED</b></div>
		{#each snapshot.squad as member (member.callsign)}
			<div class="wingman" class:inactive={!member.active}>
				<span aria-hidden="true">◇</span>
				<div>
					<strong>{member.callsign}</strong>
					<small>{member.active ? member.state.replace('-', ' ') : 'OFFLINE'}</small>
				</div>
				<i><b style:--level={`${Math.max(0, member.health)}%`}></b></i>
			</div>
		{/each}
	</aside>

	<div class="score">
		<span>SCORE</span>
		<strong>{snapshot.score.score.toLocaleString()}</strong>
		{#if snapshot.score.combo > 1}<b>×{snapshot.score.combo} COMBO</b>{/if}
	</div>

	<div class="notifications" aria-live="polite">
		{#each recentNotifications as notification (notification.id)}
			<p class={toneClass(notification)}>
				<span aria-hidden="true"></span>
				{notification.text}
			</p>
		{/each}
	</div>

	<div class="hud-controls">
		<button type="button" onclick={onTarget}><kbd>TAB</kbd> TARGET</button>
		<button type="button" onclick={onCamera}><kbd>C</kbd> {snapshot.camera.mode}</button>
		<button type="button" onclick={onMap}><kbd>M</kbd> MAP</button>
	</div>
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		z-index: 10;
		overflow: hidden;
		color: #9feafa;
		font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
		pointer-events: none;
		text-shadow: 0 0 7px rgba(77, 207, 231, 0.36);
		animation: hud-online 500ms ease both;
		--hud: #94eafa;
		--hud-muted: rgba(144, 223, 236, 0.48);
		--alert: #ff8c55;
	}

	.hud.high-contrast {
		--hud: #d8fbff;
		--hud-muted: rgba(216, 251, 255, 0.72);
	}

	.vignette {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, rgba(0, 10, 17, 0.32), transparent 16% 84%, rgba(0, 10, 17, 0.32)),
			linear-gradient(0deg, rgba(0, 8, 14, 0.33), transparent 15% 88%, rgba(0, 8, 14, 0.27));
	}

	.scanlines {
		position: absolute;
		inset: 0;
		opacity: 0.45;
		background: repeating-linear-gradient(
			0deg,
			transparent 0 3px,
			rgba(130, 233, 249, 0.018) 3px 4px
		);
	}

	.mission-strip {
		position: absolute;
		top: max(0.8rem, env(safe-area-inset-top));
		left: 50%;
		display: grid;
		grid-template-columns: auto minmax(15rem, 29rem) auto;
		align-items: stretch;
		transform: translateX(-50%);
	}

	.mission-id,
	.timer,
	.objective {
		padding: 0.55rem 0.75rem;
		border: 1px solid rgba(115, 222, 238, 0.22);
		background: linear-gradient(100deg, rgba(3, 22, 31, 0.62), rgba(3, 18, 26, 0.38));
		backdrop-filter: blur(5px);
	}

	.mission-id,
	.timer {
		display: grid;
		align-content: center;
	}

	.mission-id span,
	.timer span,
	.objective span {
		color: var(--hud-muted);
		font-size: 0.45rem;
		letter-spacing: 0.13em;
	}

	.mission-id strong,
	.timer strong {
		margin-top: 0.2rem;
		color: var(--hud);
		font-size: 0.61rem;
		letter-spacing: 0.08em;
	}

	.objective {
		position: relative;
		border-inline: 0;
		text-align: center;
	}

	.objective strong {
		display: block;
		margin-top: 0.25rem;
		overflow: hidden;
		color: #f2fbfc;
		font:
			650 0.68rem/1.2 ui-sans-serif,
			system-ui,
			sans-serif;
		letter-spacing: 0.04em;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.objective i {
		position: absolute;
		right: 0;
		bottom: -1px;
		left: 0;
		height: 1px;
		background: linear-gradient(90deg, transparent, #ed9a61, transparent);
	}

	.timer {
		text-align: right;
	}

	.timer strong {
		color: #f1aa76;
		font-size: 0.75rem;
	}

	.heading-tape {
		position: absolute;
		top: 5.2rem;
		left: 50%;
		display: flex;
		gap: 0.72rem;
		align-items: end;
		color: rgba(157, 229, 240, 0.38);
		font-size: 0.47rem;
		transform: translateX(-50%);
	}

	.heading-tape i {
		width: 1px;
		height: 0.25rem;
		background: currentColor;
	}

	.heading-tape strong {
		position: relative;
		color: #d4f8fc;
		font-size: 0.62rem;
	}

	.heading-tape strong::after {
		position: absolute;
		top: 1rem;
		left: 50%;
		width: 0;
		height: 0;
		content: '';
		border-top: 0.35rem solid var(--hud);
		border-right: 0.24rem solid transparent;
		border-left: 0.24rem solid transparent;
		transform: translateX(-50%);
	}

	.reticle {
		position: absolute;
		top: 50%;
		left: 50%;
		width: clamp(13rem, 24vw, 20rem);
		aspect-ratio: 1;
		transform: translate(-50%, -50%);
	}

	.reticle svg {
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.reticle-ring,
	.ticks,
	.pipper,
	.flight-cone {
		fill: none;
		stroke: var(--hud);
		stroke-linecap: square;
		vector-effect: non-scaling-stroke;
	}

	.reticle-ring.outer {
		opacity: 0.44;
		stroke-width: 0.65;
		stroke-dasharray: 7 12 2 12;
		animation: reticle-spin 24s linear infinite;
		transform-origin: center;
	}

	.reticle-ring.inner {
		opacity: 0.7;
		stroke-width: 0.7;
		stroke-dasharray: 17 7;
	}

	.ticks {
		opacity: 0.55;
		stroke-width: 0.8;
	}

	.ticks.major {
		opacity: 0.85;
	}

	.pipper {
		stroke-width: 1.1;
	}

	.flight-cone {
		opacity: 0.38;
		stroke-width: 0.65;
		stroke-dasharray: 2 5;
	}

	.flight-vector {
		position: absolute;
		top: 53%;
		left: 50%;
		display: grid;
		width: 1.2rem;
		aspect-ratio: 1;
		place-items: center;
		border: 1px solid var(--hud);
		border-radius: 50%;
		transform: translate(-50%, -50%);
	}

	.flight-vector::before,
	.flight-vector::after {
		position: absolute;
		top: 50%;
		width: 0.7rem;
		height: 1px;
		content: '';
		background: var(--hud);
	}

	.flight-vector::before {
		right: 100%;
	}

	.flight-vector::after {
		left: 100%;
	}

	.flight-vector i {
		width: 0.2rem;
		height: 0.2rem;
		background: var(--hud);
	}

	.reticle small {
		position: absolute;
		top: 82%;
		left: 50%;
		color: var(--hud-muted);
		font-size: 0.42rem;
		letter-spacing: 0.12em;
		transform: translateX(-50%);
		white-space: nowrap;
	}

	.target-marker {
		position: absolute;
		width: clamp(7rem, 11vw, 10rem);
		aspect-ratio: 1;
		transform: translate(-50%, -50%);
	}

	.target-box {
		position: absolute;
		inset: 0;
		color: #f2a26c;
	}

	.target-box.acquiring {
		animation: acquire 700ms ease-in-out infinite alternate;
	}

	.target-box.locked {
		color: #ff684e;
		filter: drop-shadow(0 0 5px rgba(255, 75, 59, 0.5));
	}

	.target-box .corner {
		position: absolute;
		width: 22%;
		height: 22%;
		border-color: currentColor;
	}

	.corner.one {
		top: 0;
		left: 0;
		border-top: 1px solid;
		border-left: 1px solid;
	}

	.corner.two {
		top: 0;
		right: 0;
		border-top: 1px solid;
		border-right: 1px solid;
	}

	.corner.three {
		right: 0;
		bottom: 0;
		border-right: 1px solid;
		border-bottom: 1px solid;
	}

	.corner.four {
		bottom: 0;
		left: 0;
		border-bottom: 1px solid;
		border-left: 1px solid;
	}

	.lock-ring {
		position: absolute;
		inset: 12%;
		display: grid;
		place-items: center;
	}

	.lock-ring svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.lock-ring path {
		fill: none;
		stroke: rgba(247, 157, 101, 0.15);
		stroke-width: 3;
	}

	.lock-ring path.active {
		stroke: currentColor;
	}

	.lock-ring span {
		color: currentColor;
		font-size: 0.52rem;
		font-weight: 750;
	}

	.target-data {
		position: absolute;
		top: 102%;
		left: 50%;
		width: max-content;
		max-width: 12rem;
		padding: 0.35rem 0.5rem;
		border-left: 1px solid #f19b63;
		background: rgba(3, 16, 23, 0.55);
		transform: translateX(-50%);
	}

	.target-data span {
		color: #f19e67;
		font-size: 0.42rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.target-data strong {
		display: block;
		margin-top: 0.16rem;
		overflow: hidden;
		color: #fff3eb;
		font-size: 0.58rem;
		letter-spacing: 0.06em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.target-data p {
		display: flex;
		gap: 0.42rem;
		align-items: center;
		margin: 0.25rem 0 0;
		color: rgba(255, 200, 165, 0.72);
		font-size: 0.46rem;
	}

	.target-data p i {
		width: 1px;
		height: 0.5rem;
		background: currentColor;
	}

	.edge-arrow {
		position: absolute;
		display: grid;
		justify-items: center;
		color: #f5a065;
		transform: translate(-50%, -50%) rotate(var(--angle));
	}

	.edge-arrow svg {
		width: 1.7rem;
		fill: rgba(244, 151, 91, 0.28);
		stroke: currentColor;
		stroke-width: 1;
	}

	.edge-arrow span {
		font-size: 0.46rem;
		transform: rotate(calc(var(--angle) * -1));
	}

	.left-stack,
	.right-stack {
		position: absolute;
		top: 50%;
		display: grid;
		gap: 0.65rem;
		width: clamp(8.5rem, 12vw, 11rem);
		transform: translateY(-44%);
	}

	.left-stack {
		left: clamp(0.75rem, 3vw, 3rem);
	}

	.right-stack {
		right: clamp(0.75rem, 3vw, 3rem);
	}

	.instrument {
		position: relative;
		min-height: 5.3rem;
		padding: 0.65rem 0.7rem;
		border: 1px solid rgba(109, 213, 231, 0.18);
		background: linear-gradient(110deg, rgba(3, 23, 31, 0.46), rgba(3, 15, 23, 0.2));
		backdrop-filter: blur(3px);
		clip-path: polygon(0 0, calc(100% - 0.45rem) 0, 100% 0.45rem, 100% 100%, 0 100%);
	}

	.instrument-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: var(--hud-muted);
		font-size: 0.45rem;
		letter-spacing: 0.11em;
	}

	.instrument-label span {
		color: var(--hud);
	}

	.instrument > strong {
		display: block;
		margin-top: 0.45rem;
		color: #dbf8fb;
		font-size: clamp(1.3rem, 2.6vw, 2rem);
		font-weight: 450;
		letter-spacing: -0.08em;
	}

	.vertical-bar {
		position: absolute;
		top: 2rem;
		right: 0.6rem;
		bottom: 0.65rem;
		width: 0.25rem;
		background: rgba(115, 217, 234, 0.12);
	}

	.vertical-bar i {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		height: var(--level);
		background: var(--hud);
		box-shadow: 0 0 8px rgba(99, 218, 237, 0.5);
	}

	.vertical-bar span {
		position: relative;
		display: block;
		width: 0.55rem;
		height: 25%;
		border-top: 1px solid rgba(149, 225, 237, 0.25);
	}

	.small-instrument {
		min-height: auto;
	}

	.meter {
		height: 0.22rem;
		margin-top: 0.55rem;
		background: rgba(107, 207, 224, 0.13);
	}

	.meter i {
		display: block;
		width: var(--level);
		height: 100%;
		background: linear-gradient(90deg, #70d8e7, #ef9b62);
	}

	.small-instrument > strong {
		margin-top: 0.35rem;
		font-size: 0.7rem;
		letter-spacing: 0;
	}

	.health.critical {
		color: #ff7a5b;
		border-color: rgba(255, 102, 72, 0.45);
		animation: critical 800ms ease-in-out infinite alternate;
	}

	.health.critical .health-meter i {
		background: #ff6c4f;
	}

	.weapons {
		min-height: auto;
	}

	.weapon-top {
		display: flex;
		align-items: start;
		justify-content: space-between;
	}

	.weapon-top span {
		color: var(--hud);
		font-size: 0.5rem;
		letter-spacing: 0.12em;
	}

	.weapon-top small {
		display: block;
		margin-top: 0.2rem;
		color: var(--hud-muted);
		font-size: 0.43rem;
	}

	.weapon-top strong {
		color: #f4a06a;
		font-size: 1.5rem;
		font-weight: 500;
	}

	.missile-row {
		display: flex;
		gap: 0.18rem;
		margin: 0.55rem 0;
	}

	.missile-row svg {
		width: 0.55rem;
		fill: rgba(134, 226, 240, 0.55);
		stroke: var(--hud);
		stroke-width: 0.8;
	}

	.missile-row svg.spent {
		opacity: 0.13;
	}

	.cooldown {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.55rem;
		align-items: center;
		color: var(--hud-muted);
		font-size: 0.41rem;
	}

	.cooldown > i {
		height: 0.18rem;
		background: rgba(106, 207, 224, 0.14);
	}

	.cooldown b {
		display: block;
		width: var(--level);
		height: 100%;
		background: #f19e68;
	}

	.squad {
		position: absolute;
		bottom: clamp(2.6rem, 6vh, 5rem);
		left: clamp(0.75rem, 3vw, 3rem);
		width: clamp(9rem, 15vw, 13rem);
		padding: 0.55rem;
		border: 1px solid rgba(108, 213, 230, 0.17);
		background: rgba(3, 20, 28, 0.35);
	}

	.squad-title {
		display: flex;
		gap: 0.35rem;
		align-items: center;
		margin-bottom: 0.45rem;
		color: var(--hud-muted);
		font-size: 0.43rem;
		letter-spacing: 0.1em;
	}

	.squad-title i {
		flex: 1;
		height: 1px;
		background: rgba(109, 211, 228, 0.16);
	}

	.squad-title b {
		color: #79dbae;
		font-size: 0.4rem;
	}

	.wingman {
		display: grid;
		grid-template-columns: auto 1fr 2rem;
		gap: 0.4rem;
		align-items: center;
		padding: 0.3rem 0;
		border-top: 1px solid rgba(107, 211, 228, 0.08);
	}

	.wingman > span {
		color: #7cd9a9;
		font-size: 0.8rem;
	}

	.wingman strong,
	.wingman small {
		display: block;
	}

	.wingman strong {
		color: #cceef2;
		font-size: 0.49rem;
		font-weight: 650;
	}

	.wingman small {
		margin-top: 0.15rem;
		color: var(--hud-muted);
		font-size: 0.38rem;
		text-transform: uppercase;
	}

	.wingman > i {
		height: 0.15rem;
		background: rgba(106, 208, 224, 0.13);
	}

	.wingman > i b {
		display: block;
		width: var(--level);
		height: 100%;
		background: #72d7a4;
	}

	.wingman.inactive {
		opacity: 0.35;
	}

	.score {
		position: absolute;
		right: clamp(0.75rem, 3vw, 3rem);
		bottom: clamp(3rem, 7vh, 5.5rem);
		display: grid;
		justify-items: end;
	}

	.score span {
		color: var(--hud-muted);
		font-size: 0.45rem;
		letter-spacing: 0.13em;
	}

	.score strong {
		margin-top: 0.2rem;
		color: #e8f9fb;
		font-size: 1.2rem;
		font-weight: 480;
	}

	.score b {
		margin-top: 0.2rem;
		color: #f2a06a;
		font-size: 0.55rem;
	}

	.notifications {
		position: absolute;
		top: 24%;
		right: 4%;
		display: grid;
		gap: 0.3rem;
		justify-items: end;
	}

	.notice {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		margin: 0;
		padding: 0.3rem 0.45rem;
		color: #c8f1f5;
		border-right: 1px solid #79dce9;
		background: linear-gradient(90deg, transparent, rgba(3, 21, 28, 0.65));
		font-size: 0.5rem;
		letter-spacing: 0.08em;
		animation: notice-in 240ms ease both;
	}

	.notice span {
		width: 0.3rem;
		height: 0.3rem;
		background: currentColor;
	}

	.notice.warning {
		color: #ffad7b;
		border-color: #f58954;
	}

	.notice.success {
		color: #8fe4bb;
		border-color: #77d9aa;
	}

	.incoming {
		position: absolute;
		top: 15%;
		left: 50%;
		display: flex;
		gap: 0.6rem;
		align-items: center;
		padding: 0.55rem 1rem;
		color: #fff1e9;
		border: 1px solid rgba(255, 103, 69, 0.7);
		background: rgba(72, 17, 9, 0.68);
		transform: translateX(-50%);
		animation: threat-warning 450ms ease-in-out infinite alternate;
	}

	.warning-icon {
		display: grid;
		width: 1.8rem;
		aspect-ratio: 1;
		place-items: center;
		border: 1px solid #ff7a55;
		clip-path: polygon(50% 0, 100% 100%, 0 100%);
		font-size: 0.8rem;
		font-weight: 900;
	}

	.incoming span,
	.incoming small {
		display: block;
		color: rgba(255, 175, 134, 0.72);
		font-size: 0.42rem;
		letter-spacing: 0.12em;
	}

	.incoming strong {
		display: block;
		margin-block: 0.1rem;
		color: #fff;
		font-size: 0.8rem;
		letter-spacing: 0.15em;
	}

	.hit-direction {
		position: absolute;
		top: 50%;
		left: 50%;
		width: min(52vw, 30rem);
		aspect-ratio: 1;
		border: 1px solid transparent;
		border-top-color: rgba(255, 91, 62, 0.75);
		border-radius: 50%;
		transform: translate(-50%, -50%) rotate(var(--bearing));
	}

	.hit-direction i {
		position: absolute;
		top: -0.2rem;
		left: 50%;
		width: 0.45rem;
		height: 0.45rem;
		border-top: 2px solid #ff6849;
		border-left: 2px solid #ff6849;
		transform: translateX(-50%) rotate(45deg);
	}

	.hud-controls {
		position: absolute;
		right: clamp(0.75rem, 3vw, 3rem);
		bottom: max(0.75rem, env(safe-area-inset-bottom));
		display: flex;
		gap: 0.35rem;
		pointer-events: auto;
	}

	.hud-controls button {
		padding: 0.35rem 0.5rem;
		color: var(--hud-muted);
		border: 1px solid rgba(107, 211, 228, 0.18);
		background: rgba(2, 16, 23, 0.46);
		font:
			550 0.43rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}

	kbd {
		margin-right: 0.25rem;
		color: #f2a06a;
		font: inherit;
	}

	@keyframes hud-online {
		from {
			opacity: 0;
			filter: brightness(2);
		}
	}

	@keyframes reticle-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes acquire {
		to {
			opacity: 0.55;
			transform: scale(0.94);
		}
	}

	@keyframes critical {
		to {
			border-color: rgba(255, 91, 57, 0.85);
		}
	}

	@keyframes notice-in {
		from {
			opacity: 0;
			transform: translateX(1rem);
		}
	}

	@keyframes threat-warning {
		to {
			filter: brightness(1.25);
			transform: translateX(-50%) scale(1.02);
		}
	}

	@media (max-width: 800px) {
		.mission-strip {
			top: max(0.4rem, env(safe-area-inset-top));
			grid-template-columns: minmax(12rem, 1fr) auto;
			width: calc(100% - 1rem);
		}

		.mission-id {
			display: none;
		}

		.objective {
			border-left: 1px solid rgba(115, 222, 238, 0.22);
		}

		.heading-tape {
			top: 4.6rem;
		}

		.left-stack,
		.right-stack {
			top: auto;
			bottom: 8.2rem;
			width: 7.3rem;
			transform: none;
		}

		.small-instrument,
		.weapons {
			display: none;
		}

		.instrument {
			min-height: 4.1rem;
			padding: 0.5rem;
		}

		.squad,
		.score,
		.hud-controls {
			display: none;
		}

		.reticle {
			top: 43%;
		}

		.notifications {
			top: 18%;
		}
	}

	@media (max-width: 480px) {
		.heading-tape span:nth-of-type(1),
		.heading-tape span:nth-of-type(4) {
			display: none;
		}

		.incoming {
			top: 5rem;
			padding: 0.4rem 0.6rem;
		}

		.reticle {
			width: 12rem;
		}

		.target-marker {
			width: 6rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hud,
		.reticle-ring.outer,
		.target-box.acquiring,
		.health.critical,
		.notice,
		.incoming {
			animation: none;
		}
	}
</style>
