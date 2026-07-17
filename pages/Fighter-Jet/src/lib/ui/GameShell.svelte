<script lang="ts">
	import { Game } from '$lib/game/Game';
	import { GAME_CONFIG } from '$lib/game/config/gameConfig';
	import { DEFAULT_SETTINGS } from '$lib/game/game/SettingsManager';
	import type {
		GameSettings,
		GameSnapshot,
		QualityLevel,
		TouchInput,
		ViperTestHooks
	} from '$lib/game/types';
	import DebugPanel from './DebugPanel.svelte';
	import Hud from './Hud.svelte';
	import LoadingScreen from './LoadingScreen.svelte';
	import MainMenu from './MainMenu.svelte';
	import MissionIntro from './MissionIntro.svelte';
	import MissionResults from './MissionResults.svelte';
	import PauseMenu from './PauseMenu.svelte';
	import RadioMessage from './RadioMessage.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import TacticalMap from './TacticalMap.svelte';
	import TouchControls from './TouchControls.svelte';
	import { FLIGHT_CONTROL_ROWS } from './flightControls';

	type DebugFlag = 'invincibility' | 'infiniteMissiles' | 'helpers' | 'ranges' | 'paths' | 'stats';
	type DebugFlags = Record<DebugFlag, boolean>;

	const INITIAL_SNAPSHOT: GameSnapshot = {
		state: 'loading',
		loading: { progress: 0, text: 'Preparing flight systems' },
		phase: 'approach',
		objective: 'Follow Viper flight to the combat zone',
		player: {
			speed: 0,
			altitude: 0,
			health: 100,
			afterburner: 0,
			ammo: 6,
			cooldown: 0,
			position: { x: 0, y: 0, z: 0 },
			heading: 0
		},
		target: null,
		squad: [],
		notifications: [],
		radio: null,
		tacticalEntities: [],
		score: {
			score: 0,
			hits: 0,
			shots: 0,
			accuracy: 0,
			combo: 0,
			maxCombo: 0,
			damageTaken: 0,
			timeBonus: 0,
			rating: 'D'
		},
		missionTime: 0,
		settings: { ...DEFAULT_SETTINGS },
		camera: {
			mode: 'chase',
			position: { x: 0, y: 0, z: 0 },
			lookAt: { x: 0, y: 0, z: -1 },
			shake: 0,
			fov: 63
		},
		missileWarning: { active: false, bearing: 0, distance: 0 },
		mapOpen: false,
		results: null,
		error: null
	};

	const testMode =
		typeof window !== 'undefined' &&
		['true', '1'].includes(new URLSearchParams(window.location.search).get('testMode') ?? '');
	const debugAllowed = import.meta.env.DEV || testMode;

	let game = $state.raw<Game | null>(null);
	let snapshot = $state.raw<GameSnapshot>(INITIAL_SNAPSHOT);
	let pendingMissionStart = false;
	let syntheticTestState = false;
	let settingsOpen = $state(false);
	let controlsOpen = $state(false);
	let debugOpen = $state(false);
	let timeScale = $state(1);
	let debugFlags = $state<DebugFlags>({
		invincibility: false,
		infiniteMissiles: false,
		helpers: false,
		ranges: false,
		paths: false,
		stats: false
	});

	const selectedTargetId = $derived(snapshot.target?.id ?? null);
	const showsFlightHud = $derived(
		snapshot.state === 'playing' || snapshot.state === 'intro' || snapshot.state === 'paused'
	);
	const initializationFailed = $derived(
		snapshot.state === 'failure' && snapshot.tacticalEntities.length === 0
	);

	function mountGame(canvas: HTMLCanvasElement) {
		let active = true;
		const instance = new Game(
			canvas,
			(next) => {
				if (!active) return;
				if (testMode && syntheticTestState && next.state === 'loading') {
					snapshot = { ...snapshot, settings: next.settings };
					return;
				}
				snapshot = next;
				if (next.state === 'menu' && pendingMissionStart) {
					pendingMissionStart = false;
					queueMicrotask(() => instance.startMission());
				}
			},
			{ testMode }
		);
		game = instance;
		if (testMode) {
			instance.updateSettings({});
			const hooks: ViperTestHooks = {
				start: startMission,
				pause: pauseMission,
				resume: resumeMission,
				restart: restartMission,
				success: completeTestMission,
				snapshot: () => snapshot
			};
			(window as Window & { __VIPER_TEST__?: ViperTestHooks }).__VIPER_TEST__ = hooks;
		}
		const resizeObserver = new ResizeObserver(() => instance.resize());
		resizeObserver.observe(canvas);
		if (!testMode) {
			void instance.initialize().catch((cause: unknown) => {
				if (!active) return;
				const message =
					cause instanceof Error ? cause.message : 'Unable to initialize the flight renderer';
				snapshot = {
					...snapshot,
					state: 'failure',
					error: message,
					loading: { ...snapshot.loading, text: 'Renderer unavailable' }
				};
			});
		}

		return () => {
			active = false;
			resizeObserver.disconnect();
			instance.dispose();
			if (testMode) {
				delete (window as Window & { __VIPER_TEST__?: ViperTestHooks }).__VIPER_TEST__;
			}
			if (game === instance) game = null;
		};
	}

	function startMission(): void {
		settingsOpen = false;
		controlsOpen = false;
		if (testMode) {
			syntheticTestState = true;
			snapshot = {
				...snapshot,
				state: 'playing',
				phase: 'approach',
				objective: 'Follow Viper flight to the combat zone',
				missionTime: 0,
				mapOpen: false,
				error: null,
				results: null
			};
			return;
		}
		if (snapshot.state === 'loading') {
			pendingMissionStart = true;
			return;
		}
		game?.startMission();
	}

	function pauseMission(): void {
		if (testMode && (snapshot.state === 'playing' || snapshot.state === 'intro')) {
			snapshot = { ...snapshot, state: 'paused' };
			return;
		}
		game?.pause();
	}

	function resumeMission(): void {
		if (testMode && snapshot.state === 'paused') {
			snapshot = { ...snapshot, state: 'playing' };
			return;
		}
		game?.resume();
	}

	function restartMission(): void {
		if (testMode) {
			startMission();
			return;
		}
		game?.restart();
	}

	function completeTestMission(): void {
		if (!testMode) {
			game?.debugSuccess();
			return;
		}
		syntheticTestState = true;
		snapshot = {
			...snapshot,
			state: 'success',
			results: {
				...snapshot.score,
				score: Math.max(12800, snapshot.score.score),
				accuracy: snapshot.score.shots > 0 ? snapshot.score.hits / snapshot.score.shots : 0.86,
				rating: 'A',
				missionTime: snapshot.missionTime,
				bestScore: Math.max(12800, snapshot.score.score),
				bestTime: snapshot.missionTime,
				newBestScore: true,
				newBestTime: true
			}
		};
	}

	function returnToMenu(): void {
		settingsOpen = false;
		controlsOpen = false;
		if (testMode) {
			syntheticTestState = true;
			snapshot = { ...snapshot, state: 'menu', results: null, mapOpen: false };
			return;
		}
		game?.returnToMenu();
	}

	function openSettings(): void {
		controlsOpen = false;
		settingsOpen = true;
	}

	function updateSettings(partial: Partial<GameSettings>): void {
		game?.updateSettings(partial);
	}

	function updateQuality(quality: QualityLevel): void {
		updateSettings({ quality });
	}

	function toggleSound(): void {
		updateSettings({ masterVolume: snapshot.settings.masterVolume > 0 ? 0 : 0.8 });
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.repeat) return;
		const target = event.target;
		const editing =
			target instanceof HTMLInputElement ||
			target instanceof HTMLSelectElement ||
			target instanceof HTMLTextAreaElement;

		if (event.code === 'F2' && debugAllowed) {
			event.preventDefault();
			debugOpen = !debugOpen;
			return;
		}

		if (event.code === 'Escape') {
			if (settingsOpen) {
				event.preventDefault();
				settingsOpen = false;
				return;
			}
			if (controlsOpen) {
				event.preventDefault();
				controlsOpen = false;
				return;
			}
			if (editing) return;
			if (snapshot.state === 'playing' || snapshot.state === 'intro') {
				event.preventDefault();
				pauseMission();
			} else if (snapshot.state === 'paused') {
				event.preventDefault();
				resumeMission();
			}
			return;
		}

		if (
			!editing &&
			event.code === 'KeyR' &&
			['paused', 'success', 'failure'].includes(snapshot.state)
		) {
			event.preventDefault();
			restartMission();
		}
	}

	function pauseOnBlur(): void {
		if (snapshot.state === 'playing' || snapshot.state === 'intro') pauseMission();
	}

	function handleVisibility(): void {
		if (document.hidden && (snapshot.state === 'playing' || snapshot.state === 'intro')) {
			pauseMission();
		}
	}

	function focusControls(node: HTMLElement) {
		requestAnimationFrame(() => node.querySelector<HTMLButtonElement>('button')?.focus());
	}

	function setDebugFlag(flag: DebugFlag, enabled: boolean): void {
		debugFlags[flag] = enabled;
		const methods: Record<DebugFlag, ((value: boolean) => void) | undefined> = {
			invincibility: game?.debugSetInvincibility.bind(game),
			infiniteMissiles: game?.debugSetInfiniteMissiles.bind(game),
			helpers: game?.debugSetHelpers.bind(game),
			ranges: game?.debugSetRanges.bind(game),
			paths: game?.debugSetPaths.bind(game),
			stats: game?.debugSetStats.bind(game)
		};
		methods[flag]?.(enabled);
	}

	function setTimeScale(value: number): void {
		timeScale = value;
		game?.debugSetTimeScale(value);
	}

	function debugAction(
		action: 'debugDestroyTarget' | 'debugSkipPhase' | 'debugSpawnExplosion' | 'debugReset'
	): void {
		game?.[action]();
	}
</script>

<svelte:window onkeydown={handleKeydown} onblur={pauseOnBlur} />
<svelte:document onvisibilitychange={handleVisibility} />

<main
	class="game-shell"
	class:is-paused={snapshot.state === 'paused'}
	class:menu-active={snapshot.state === 'menu' || initializationFailed}
	class:reduced-motion={snapshot.settings.reducedMotion}
	class:high-contrast={snapshot.settings.highContrast}
	data-state={snapshot.state}
	data-colour-blind-mode={snapshot.settings.colourBlindMode}
>
	<canvas
		class="game-canvas"
		data-testid="game-canvas"
		aria-label="Viper Strike three-dimensional combat flight view"
		{@attach mountGame}
	></canvas>

	<div class="sky-fallback" aria-hidden="true">
		<div class="sun"></div>
		<div class="mountains far"></div>
		<div class="mountains near"></div>
	</div>

	{#if snapshot.state === 'loading' && !testMode}
		<LoadingScreen
			progress={snapshot.loading.progress}
			asset={snapshot.loading.text}
			error={snapshot.error}
		/>
	{:else if snapshot.state === 'menu' || initializationFailed || (testMode && snapshot.state === 'loading')}
		<MainMenu
			settings={snapshot.settings}
			error={snapshot.error}
			onStart={startMission}
			onOpenSettings={openSettings}
			onQualityChange={updateQuality}
			onToggleSound={toggleSound}
		/>
	{/if}

	{#if showsFlightHud}
		<Hud
			{snapshot}
			onMap={() => game?.toggleMap()}
			onCamera={() => game?.cycleCamera()}
			onTarget={() => game?.cycleTarget()}
		/>
	{/if}

	{#if snapshot.state === 'intro'}
		<MissionIntro
			phaseLabel={snapshot.objective}
			durationSeconds={GAME_CONFIG.mission.introSeconds}
		/>
	{/if}

	{#if (snapshot.state === 'playing' || snapshot.state === 'intro') && snapshot.radio}
		<RadioMessage
			message={snapshot.radio}
			subtitles={snapshot.settings.subtitles}
			subtitleSize={snapshot.settings.subtitleSize}
		/>
	{/if}

	{#if showsFlightHud}
		<TouchControls
			settings={snapshot.settings}
			active={snapshot.state === 'playing' && !snapshot.mapOpen && !settingsOpen && !controlsOpen}
			onInput={(input: TouchInput) => game?.setTouchInput(input)}
			onSettings={updateSettings}
			onFire={() => game?.fire()}
			onTarget={() => game?.cycleTarget()}
			onCamera={() => game?.cycleCamera()}
			onMap={() => game?.toggleMap()}
			onPause={pauseMission}
		/>
	{/if}

	{#if snapshot.mapOpen && showsFlightHud}
		<TacticalMap
			entities={snapshot.tacticalEntities}
			{selectedTargetId}
			onClose={() => game?.toggleMap()}
		/>
	{/if}

	{#if snapshot.state === 'paused' && !settingsOpen && !controlsOpen}
		<PauseMenu
			onResume={resumeMission}
			onRestart={restartMission}
			onControls={() => (controlsOpen = true)}
			onSettings={openSettings}
			onReturnToMenu={returnToMenu}
		/>
	{/if}

	{#if controlsOpen}
		<div class="controls-scrim" aria-hidden="true"></div>
		<dialog
			open
			class="controls-panel"
			aria-modal="true"
			aria-labelledby="controls-title"
			{@attach focusControls}
		>
			<header>
				<div>
					<p>FLIGHT MANUAL // QUICK REFERENCE</p>
					<h2 id="controls-title">Controls</h2>
				</div>
				<button type="button" aria-label="Close controls" onclick={() => (controlsOpen = false)}
					>×</button
				>
			</header>
			<div class="control-grid">
				{#each FLIGHT_CONTROL_ROWS as row (row.keys)}
					<div><kbd>{row.keys}</kbd><span>{row.description}</span></div>
				{/each}
			</div>
			<p class="controller-note">
				Missiles fire only on a completed lock unless simplified firing is enabled in settings.
				Gamepad, keyboard, mouse, and touch are detected automatically.
			</p>
		</dialog>
	{/if}

	{#if settingsOpen}
		<SettingsPanel
			settings={snapshot.settings}
			onUpdate={updateSettings}
			onClose={() => (settingsOpen = false)}
		/>
	{/if}

	{#if (snapshot.state === 'success' || snapshot.state === 'failure') && !initializationFailed}
		<MissionResults
			success={snapshot.state === 'success'}
			results={snapshot.results}
			squad={snapshot.squad}
			onReplay={restartMission}
			onMenu={returnToMenu}
		/>
	{/if}

	{#if debugAllowed && debugOpen}
		<DebugPanel
			flags={debugFlags}
			{timeScale}
			onToggle={setDebugFlag}
			onTimeScale={setTimeScale}
			onDestroyTarget={() => debugAction('debugDestroyTarget')}
			onSkipPhase={() => debugAction('debugSkipPhase')}
			onSpawnExplosion={() => debugAction('debugSpawnExplosion')}
			onReset={() => debugAction('debugReset')}
			onClose={() => (debugOpen = false)}
		/>
	{/if}
</main>

<style>
	.game-shell {
		position: fixed;
		inset: 0;
		overflow: hidden;
		color: #eefbfe;
		background: #06121b;
		isolation: isolate;
		--canvas-colour-filter: saturate(1);
		--canvas-contrast-filter: contrast(1);
	}

	.game-shell.high-contrast {
		--canvas-contrast-filter: contrast(1.2) brightness(1.03);
	}

	.game-shell[data-colour-blind-mode='deuteranopia'] {
		--canvas-colour-filter: saturate(0.72) sepia(0.08);
	}

	.game-shell[data-colour-blind-mode='protanopia'] {
		--canvas-colour-filter: saturate(0.66) sepia(0.14);
	}

	.game-shell[data-colour-blind-mode='tritanopia'] {
		--canvas-colour-filter: saturate(0.74) hue-rotate(-12deg);
	}

	.game-canvas {
		position: absolute;
		z-index: 1;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		opacity: 1;
		filter: var(--canvas-colour-filter) var(--canvas-contrast-filter);
		background: transparent;
		transition:
			filter 600ms ease,
			opacity 500ms ease,
			transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
		touch-action: none;
	}

	.menu-active .game-canvas {
		filter: var(--canvas-colour-filter) var(--canvas-contrast-filter) saturate(1.12) contrast(1.04);
		transform: scale(1.015);
	}

	.is-paused .game-canvas {
		filter: var(--canvas-colour-filter) var(--canvas-contrast-filter) blur(2px) brightness(0.58)
			saturate(0.65);
	}

	.high-contrast :global(.hud),
	.game-shell:not([data-colour-blind-mode='off']) :global(.hud) {
		text-shadow:
			0 1px 2px #000,
			0 0 6px rgba(214, 249, 255, 0.45);
	}

	.game-shell:not([data-colour-blind-mode='off']) :global(.notice.warning) {
		border: 2px double currentColor;
		font-weight: 800;
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.sky-fallback {
		position: absolute;
		z-index: 0;
		inset: 0;
		overflow: hidden;
		background: linear-gradient(to bottom, #1c566b 0%, #ce7650 52%, #1b2229 53%, #071017 100%);
	}

	.sun {
		position: absolute;
		top: 24%;
		right: 18%;
		width: min(22rem, 30vw);
		aspect-ratio: 1;
		border-radius: 50%;
		background: radial-gradient(circle, #ffd99c, #ef8a54 46%, transparent 68%);
		filter: blur(4px);
	}

	.mountains {
		position: absolute;
		right: -10%;
		bottom: 18%;
		left: -10%;
		height: 34%;
		background: #162b32;
		clip-path: polygon(
			0 83%,
			9% 42%,
			17% 67%,
			27% 22%,
			38% 62%,
			48% 29%,
			57% 73%,
			68% 19%,
			79% 60%,
			90% 28%,
			100% 74%,
			100% 100%,
			0 100%
		);
	}

	.mountains.far {
		bottom: 26%;
		background: rgba(61, 69, 69, 0.62);
		filter: blur(2px);
	}

	.mountains.near {
		bottom: -2%;
		height: 44%;
		background: #08181f;
	}

	.controls-scrim {
		position: absolute;
		inset: 0;
		z-index: 46;
		background: rgba(1, 8, 13, 0.72);
		backdrop-filter: blur(8px);
	}

	.controls-panel {
		position: absolute;
		z-index: 47;
		top: 50%;
		left: 50%;
		width: min(40rem, calc(100vw - 2rem));
		margin: 0;
		padding: 1.1rem;
		color: #e7f7fa;
		border: 1px solid rgba(103, 212, 230, 0.34);
		background:
			linear-gradient(145deg, rgba(6, 28, 37, 0.97), rgba(2, 14, 21, 0.98)),
			repeating-linear-gradient(0deg, transparent 0 3px, rgba(107, 221, 239, 0.025) 3px 4px);
		box-shadow: 0 30px 100px rgba(0, 0, 0, 0.5);
		transform: translate(-50%, -50%);
		clip-path: polygon(
			0 0,
			calc(100% - 1rem) 0,
			100% 1rem,
			100% 100%,
			1rem 100%,
			0 calc(100% - 1rem)
		);
	}

	.controls-panel header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		padding-bottom: 0.9rem;
		border-bottom: 1px solid rgba(103, 211, 228, 0.15);
	}

	.controls-panel header p,
	.controls-panel header h2 {
		margin: 0;
	}

	.controls-panel header p {
		color: #ee9d63;
		font:
			650 0.51rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.14em;
	}

	.controls-panel header h2 {
		margin-top: 0.25rem;
		font-size: 1.4rem;
		text-transform: uppercase;
	}

	.controls-panel header button {
		display: grid;
		width: 2.4rem;
		aspect-ratio: 1;
		place-items: center;
		color: #afe7ef;
		border: 1px solid rgba(110, 216, 233, 0.3);
		background: rgba(7, 36, 46, 0.64);
		font-size: 1.2rem;
		cursor: pointer;
	}

	.control-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
		margin-top: 0.9rem;
	}

	.control-grid > div {
		display: grid;
		gap: 0.45rem;
		padding: 0.75rem;
		border: 1px solid rgba(104, 210, 228, 0.14);
		background: rgba(6, 30, 39, 0.46);
	}

	.control-grid kbd {
		color: #8de4f1;
		font:
			650 0.6rem/1 ui-monospace,
			monospace;
	}

	.control-grid span {
		color: rgba(193, 225, 230, 0.58);
		font-size: 0.58rem;
	}

	.controller-note {
		margin: 0.8rem 0 0;
		color: rgba(168, 211, 218, 0.43);
		font:
			550 0.51rem/1.4 ui-monospace,
			monospace;
		letter-spacing: 0.07em;
	}

	.reduced-motion *,
	.reduced-motion *::before,
	.reduced-motion *::after {
		scroll-behavior: auto !important;
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.01ms !important;
	}

	@media (max-width: 600px) {
		.control-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 380px) {
		.control-grid {
			grid-template-columns: 1fr;
			max-height: 65vh;
			overflow: auto;
		}
	}
</style>
