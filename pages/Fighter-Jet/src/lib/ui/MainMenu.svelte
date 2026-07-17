<script lang="ts">
	import type { GameSettings, QualityLevel } from '$lib/game/types';

	interface Props {
		settings: Readonly<GameSettings>;
		error?: string | null;
		onStart: () => void;
		onOpenSettings: () => void;
		onQualityChange: (quality: QualityLevel) => void;
		onToggleSound: () => void;
	}

	let {
		settings,
		error = null,
		onStart,
		onOpenSettings,
		onQualityChange,
		onToggleSound
	}: Props = $props();

	const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];
	let fullscreenSupported = $state(false);
	let isFullscreen = $state(false);

	function detectFullscreen(node: HTMLElement) {
		fullscreenSupported = node.ownerDocument.fullscreenEnabled;
		isFullscreen = node.ownerDocument.fullscreenElement !== null;
	}

	function syncFullscreen(): void {
		isFullscreen = document.fullscreenElement !== null;
	}

	async function toggleFullscreen(): Promise<void> {
		try {
			if (document.fullscreenElement) {
				await document.exitFullscreen();
			} else {
				await document.documentElement.requestFullscreen();
			}
		} catch {
			// Fullscreen can be denied by the browser or embedding context.
		}
	}
</script>

<svelte:document onfullscreenchange={syncFullscreen} />

<section class="menu" aria-labelledby="viper-title" {@attach detectFullscreen}>
	<div class="sun-glow" aria-hidden="true"></div>
	<div class="horizon-grid" aria-hidden="true"></div>
	<div class="frame" aria-hidden="true">
		<span class="corner top-left"></span>
		<span class="corner top-right"></span>
		<span class="corner bottom-left"></span>
		<span class="corner bottom-right"></span>
	</div>

	<div class="masthead">
		<p class="eyebrow"><span>VIPER OPERATIONS // FLIGHT 01</span><b>MISSION 01</b></p>
		<div class="title-lockup">
			<span class="ghost" aria-hidden="true">VS</span>
			<p class="operation">Operation Ember Lance</p>
			<h1 id="viper-title">Viper Strike</h1>
			<p class="tagline">Fly low. Lock fast. Leave nothing standing.</p>
		</div>

		<div class="briefing">
			<div class="briefing-line">
				<span>01</span>
				<p>
					Enemy air defences have gone active along the Ember corridor. Lead Viper Flight below
					radar, dismantle the launch network, and strike the command centre before reinforcements
					arrive.
				</p>
			</div>
			<div class="intel">
				<span><b>AO</b> KESTREL VALLEY</span>
				<span><b>LOCAL</b> 18:42</span>
				<span><b>WEATHER</b> CLEAR / HAZE</span>
			</div>
		</div>

		{#if error}
			<p class="fallback" role="status">
				<span>SIMULATION FALLBACK</span>
				{error} You can still access menus and retry the mission.
			</p>
		{/if}

		<div class="actions">
			<button class="start-button" type="button" onclick={onStart}>
				<span class="button-kicker">READY AIRCRAFT</span>
				<span class="button-label">Start Mission</span>
				<span class="arrow" aria-hidden="true">→</span>
			</button>

			<div class="secondary-actions">
				<button type="button" onclick={onOpenSettings}>Settings</button>
				<button
					type="button"
					class:muted={settings.masterVolume === 0}
					aria-pressed={settings.masterVolume > 0}
					onclick={onToggleSound}
				>
					Sound {settings.masterVolume > 0 ? 'On' : 'Off'}
				</button>
				{#if fullscreenSupported}
					<button type="button" aria-pressed={isFullscreen} onclick={toggleFullscreen}>
						{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
					</button>
				{/if}
			</div>
		</div>
	</div>

	<aside class="launch-console" aria-label="Mission quick settings">
		<div class="console-heading">
			<span>FLIGHT SYSTEMS</span>
			<i aria-hidden="true"></i>
			<b>ONLINE</b>
		</div>

		<div class="quality">
			<span>RENDER QUALITY</span>
			<div class="quality-options">
				{#each QUALITY_LEVELS as level (level)}
					<button
						type="button"
						class:active={settings.quality === level}
						aria-pressed={settings.quality === level}
						onclick={() => onQualityChange(level)}
					>
						{level}
					</button>
				{/each}
			</div>
		</div>

		<div class="controls-summary">
			<p>PRIMARY FLIGHT CONTROL</p>
			<strong>Mouse / Arrows</strong>
			<span><kbd>A / D</kbd> ROLL</span>
			<span><kbd>W / S</kbd> THROTTLE</span>
			<span><kbd>Shift</kbd> AFTERBURNER</span>
			<span><kbd>Space</kbd> FIRE</span>
			<span><kbd>Tab</kbd> TARGET</span>
			<span><kbd>C</kbd> CAMERA</span>
			<span><kbd>M</kbd> TACTICAL</span>
			<span><kbd>Esc</kbd> PAUSE</span>
		</div>

		<div class="status-line">
			<span aria-hidden="true"></span>
			<p>LIVE TRAINING LINK ESTABLISHED</p>
		</div>
	</aside>

	<p class="version">VIPER OPS // BUILD 02.17</p>
</section>

<style>
	.menu {
		position: absolute;
		inset: 0;
		z-index: 20;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
		gap: clamp(2rem, 7vw, 8rem);
		align-items: end;
		padding: clamp(2rem, 5vw, 5.5rem);
		overflow: hidden;
		color: #f4fbff;
		background:
			linear-gradient(
				90deg,
				rgba(2, 8, 16, 0.88) 0%,
				rgba(3, 10, 18, 0.52) 52%,
				rgba(3, 9, 16, 0.68) 100%
			),
			linear-gradient(0deg, rgba(1, 7, 13, 0.94) 0%, transparent 54%);
		isolation: isolate;
	}

	.sun-glow {
		position: absolute;
		z-index: -2;
		top: 10%;
		right: 11%;
		width: min(32rem, 48vw);
		aspect-ratio: 1;
		border-radius: 50%;
		background: radial-gradient(
			circle,
			rgba(255, 202, 112, 0.33),
			rgba(255, 93, 34, 0.08) 42%,
			transparent 70%
		);
		filter: blur(10px);
		animation: breathe 7s ease-in-out infinite;
	}

	.horizon-grid {
		position: absolute;
		z-index: -1;
		right: -10%;
		bottom: -17%;
		width: 80%;
		height: 56%;
		opacity: 0.2;
		transform: perspective(400px) rotateX(62deg);
		transform-origin: bottom;
		background-image:
			linear-gradient(rgba(95, 225, 255, 0.38) 1px, transparent 1px),
			linear-gradient(90deg, rgba(95, 225, 255, 0.28) 1px, transparent 1px);
		background-size: 54px 38px;
		mask-image: linear-gradient(to top, #000, transparent 82%);
	}

	.frame {
		position: absolute;
		inset: clamp(0.9rem, 2vw, 1.7rem);
		pointer-events: none;
	}

	.corner {
		position: absolute;
		width: 2.5rem;
		height: 2.5rem;
		border-color: rgba(122, 224, 246, 0.55);
	}

	.top-left {
		top: 0;
		left: 0;
		border-top: 1px solid;
		border-left: 1px solid;
	}

	.top-right {
		top: 0;
		right: 0;
		border-top: 1px solid;
		border-right: 1px solid;
	}

	.bottom-left {
		bottom: 0;
		left: 0;
		border-bottom: 1px solid;
		border-left: 1px solid;
	}

	.bottom-right {
		right: 0;
		bottom: 0;
		border-right: 1px solid;
		border-bottom: 1px solid;
	}

	.masthead {
		width: min(56rem, 100%);
		animation: reveal 900ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.eyebrow {
		display: flex;
		gap: 0.8rem;
		align-items: center;
		margin: 0 0 clamp(1.4rem, 3vh, 2.8rem);
		color: #83dbeb;
		font:
			600 0.68rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.eyebrow::before {
		width: 2.5rem;
		height: 1px;
		content: '';
		background: currentColor;
	}

	.eyebrow b {
		padding: 0.3rem 0.5rem;
		color: #ffb46b;
		border: 1px solid rgba(255, 176, 96, 0.45);
		font-weight: 600;
	}

	.title-lockup {
		position: relative;
	}

	.ghost {
		position: absolute;
		z-index: -1;
		top: -3.6rem;
		left: -1.4rem;
		color: transparent;
		opacity: 0.25;
		font-size: clamp(8rem, 20vw, 19rem);
		font-weight: 900;
		line-height: 0.8;
		letter-spacing: -0.12em;
		-webkit-text-stroke: 1px rgba(95, 222, 245, 0.24);
	}

	.operation {
		margin: 0 0 0.4rem;
		color: #ff9b54;
		font-size: clamp(0.7rem, 1vw, 0.88rem);
		font-weight: 700;
		letter-spacing: 0.32em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-size: clamp(4rem, 10.4vw, 10.5rem);
		font-weight: 850;
		line-height: 0.78;
		letter-spacing: -0.075em;
		text-transform: uppercase;
		text-shadow: 0 0 36px rgba(109, 224, 246, 0.16);
	}

	.tagline {
		margin: 1.2rem 0 0;
		color: rgba(226, 242, 247, 0.74);
		font-size: clamp(0.72rem, 1vw, 0.88rem);
		letter-spacing: 0.17em;
		text-transform: uppercase;
	}

	.briefing {
		width: min(46rem, 100%);
		margin-top: clamp(1.6rem, 3vh, 2.8rem);
	}

	.briefing-line {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 1rem;
		padding-left: 0.85rem;
		border-left: 2px solid #ed7a3b;
	}

	.briefing-line > span {
		color: #ed8d55;
		font:
			700 0.7rem/1.5 ui-monospace,
			monospace;
	}

	.briefing-line p {
		margin: 0;
		max-width: 41rem;
		color: rgba(226, 239, 244, 0.72);
		font-size: clamp(0.78rem, 1vw, 0.93rem);
		line-height: 1.65;
	}

	.intel {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem 1.5rem;
		margin-top: 1rem;
		color: rgba(190, 218, 226, 0.58);
		font:
			500 0.59rem/1.4 ui-monospace,
			monospace;
		letter-spacing: 0.1em;
	}

	.intel b {
		margin-right: 0.35rem;
		color: #76d4e7;
	}

	.fallback {
		max-width: 44rem;
		margin: 1rem 0 0;
		padding: 0.7rem 0.9rem;
		color: #ffd6b4;
		border: 1px solid rgba(255, 152, 82, 0.45);
		background: rgba(45, 15, 8, 0.55);
		font-size: 0.75rem;
		line-height: 1.5;
	}

	.fallback span {
		display: block;
		font:
			700 0.59rem/1.4 ui-monospace,
			monospace;
		letter-spacing: 0.16em;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.85rem;
		align-items: stretch;
		margin-top: clamp(1.4rem, 3vh, 2.6rem);
	}

	button {
		color: inherit;
		border: 0;
		font: inherit;
		cursor: pointer;
	}

	.start-button {
		position: relative;
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0 2rem;
		min-width: min(22rem, 100%);
		padding: 0.85rem 1rem 0.85rem 1.25rem;
		color: #07121a;
		background: linear-gradient(105deg, #f8a154, #ffc680);
		box-shadow: 0 14px 42px rgba(231, 103, 39, 0.2);
		text-align: left;
		clip-path: polygon(0 0, calc(100% - 1rem) 0, 100% 1rem, 100% 100%, 0 100%);
		transition:
			transform 180ms ease,
			filter 180ms ease;
	}

	.start-button:hover {
		filter: brightness(1.1);
		transform: translateY(-2px);
	}

	.button-kicker {
		grid-column: 1;
		font:
			700 0.57rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.18em;
	}

	.button-label {
		grid-column: 1;
		margin-top: 0.15rem;
		font-size: 1.2rem;
		font-weight: 800;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.arrow {
		grid-row: 1 / 3;
		grid-column: 2;
		align-self: center;
		font-size: 1.8rem;
	}

	.secondary-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.secondary-actions button {
		padding: 0.7rem 0.9rem;
		color: #aee8f1;
		border: 1px solid rgba(96, 212, 232, 0.3);
		background: rgba(4, 20, 29, 0.68);
		font:
			650 0.62rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		transition:
			border-color 150ms ease,
			background 150ms ease;
	}

	.secondary-actions button:hover {
		border-color: rgba(130, 231, 248, 0.7);
		background: rgba(10, 42, 54, 0.74);
	}

	.secondary-actions button.muted {
		color: #aab4b8;
	}

	.launch-console {
		width: 100%;
		max-width: 23rem;
		justify-self: end;
		padding: 1rem;
		border: 1px solid rgba(103, 211, 231, 0.27);
		background:
			linear-gradient(135deg, rgba(9, 32, 42, 0.82), rgba(3, 13, 21, 0.82)),
			repeating-linear-gradient(0deg, transparent 0 3px, rgba(255, 255, 255, 0.02) 3px 4px);
		box-shadow: 0 20px 80px rgba(0, 0, 0, 0.28);
		backdrop-filter: blur(13px);
		clip-path: polygon(
			0 0,
			calc(100% - 1.2rem) 0,
			100% 1.2rem,
			100% 100%,
			1.2rem 100%,
			0 calc(100% - 1.2rem)
		);
		animation: reveal 900ms 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.console-heading {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.7rem;
		align-items: center;
		padding-bottom: 0.8rem;
		color: #9ee5f2;
		font:
			700 0.59rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
	}

	.console-heading i {
		height: 1px;
		background: rgba(107, 212, 231, 0.24);
	}

	.console-heading b {
		color: #86e6bd;
	}

	.quality {
		padding: 1rem 0;
		border-block: 1px solid rgba(111, 210, 228, 0.15);
	}

	.quality > span,
	.controls-summary p {
		display: block;
		margin: 0 0 0.65rem;
		color: rgba(174, 221, 231, 0.58);
		font:
			600 0.57rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
	}

	.quality-options {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.35rem;
	}

	.quality-options button {
		padding: 0.6rem 0.2rem;
		color: rgba(194, 226, 233, 0.62);
		border: 1px solid rgba(102, 194, 211, 0.18);
		background: rgba(2, 13, 20, 0.5);
		font:
			700 0.58rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.quality-options button.active {
		color: #07141b;
		border-color: #77ddef;
		background: #77ddef;
	}

	.controls-summary {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem 1rem;
		padding: 1rem 0;
		color: #b2dce4;
		font:
			600 0.61rem/1.3 ui-monospace,
			monospace;
	}

	.controls-summary p,
	.controls-summary strong {
		grid-column: 1 / -1;
	}

	.controls-summary strong {
		color: #fff5e8;
		font-size: 1rem;
		letter-spacing: 0.04em;
	}

	kbd {
		display: inline-grid;
		min-width: 2.4rem;
		margin-right: 0.25rem;
		padding: 0.22rem;
		place-items: center;
		color: #ffb879;
		border: 1px solid rgba(255, 168, 98, 0.35);
		background: rgba(54, 22, 7, 0.45);
		font: inherit;
	}

	.status-line {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		padding-top: 0.75rem;
		color: #76dcb4;
		font:
			600 0.53rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.1em;
	}

	.status-line span {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		background: currentColor;
		box-shadow: 0 0 10px currentColor;
		animation: pulse 1.8s ease-in-out infinite;
	}

	.status-line p {
		margin: 0;
	}

	.version {
		position: absolute;
		right: clamp(1.8rem, 3vw, 3rem);
		bottom: 0.6rem;
		margin: 0;
		color: rgba(164, 207, 217, 0.34);
		font:
			500 0.5rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.13em;
	}

	@keyframes reveal {
		from {
			opacity: 0;
			transform: translateY(1.5rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes breathe {
		50% {
			opacity: 0.7;
			transform: scale(1.06);
		}
	}

	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}

	@media (max-width: 850px) {
		.menu {
			grid-template-columns: 1fr;
			align-content: end;
			align-items: end;
			gap: 1.2rem;
			padding: 4.5rem 1.5rem 2rem;
		}

		.launch-console {
			display: none;
		}

		.briefing-line p {
			display: -webkit-box;
			overflow: hidden;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 3;
			line-clamp: 3;
		}

		h1 {
			font-size: clamp(4rem, 18vw, 7rem);
		}
	}

	@media (max-height: 670px) and (min-width: 851px) {
		.menu {
			padding-block: 2rem;
		}

		.briefing {
			margin-top: 1.3rem;
		}

		.title-lockup h1 {
			font-size: clamp(4rem, 8.5vw, 8rem);
		}
	}

	@media (max-width: 520px) {
		.menu {
			padding-inline: 1rem;
		}

		.eyebrow b,
		.intel {
			display: none;
		}

		.briefing-line {
			display: block;
		}

		.briefing-line > span {
			display: none;
		}

		.actions,
		.start-button {
			width: 100%;
		}

		.secondary-actions {
			width: 100%;
		}

		.secondary-actions button {
			flex: 1;
		}
	}
</style>
