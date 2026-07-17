import {
	ACESFilmicToneMapping,
	PCFShadowMap,
	PerspectiveCamera,
	Scene,
	SRGBColorSpace,
	Vector2,
	Vector3,
	WebGLRenderer
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FlightController } from './aircraft/FlightController';
import { PlayerJet } from './aircraft/PlayerJet';
import { SquadronController } from './aircraft/SquadronController';
import type { SquadronJet } from './aircraft/SquadronJet';
import { CameraController } from './camera/CameraController';
import { DamageSystem } from './combat/DamageSystem';
import { ExplosionSystem, type ExplosionKind } from './combat/ExplosionSystem';
import { Missile, type MissileEndReason } from './combat/Missile';
import { MissileManager } from './combat/MissileManager';
import { ProjectileManager } from './combat/ProjectileManager';
import type { Target } from './combat/Target';
import { TargetManager } from './combat/TargetManager';
import { TargetingSystem } from './combat/TargetingSystem';
import { BALANCE } from './config/balance';
import { GAME_CONFIG } from './config/gameConfig';
import { AudioManager } from './game/AudioManager';
import { InputManager } from './game/InputManager';
import { MissionManager, type MissionEvent } from './game/MissionManager';
import { ScoreManager } from './game/ScoreManager';
import { SettingsManager } from './game/SettingsManager';
import type {
	GameOptions,
	GameSettings,
	GameSnapshot,
	GameState,
	MissionResults,
	NotificationSnapshot,
	TacticalEntitySnapshot,
	TouchInput,
	ViperTestHooks
} from './types';
import { clamp } from './utils/math';
import { World } from './world/World';

const INTRO_INPUT = {
	pitch: 0,
	roll: 0,
	yaw: 0,
	throttle: 0.62,
	afterburner: false,
	fire: false,
	cycleTarget: false,
	cycleCamera: false,
	pause: false,
	map: false,
	method: 'keyboard-mouse'
} as const;

const _impactPosition = new Vector3();
const _debugPosition = new Vector3();
const _debugDirection = new Vector3();

export class Game {
	private readonly scene = new Scene();
	private readonly camera = new PerspectiveCamera(
		GAME_CONFIG.camera.baseFov,
		1,
		GAME_CONFIG.camera.near,
		GAME_CONFIG.camera.far
	);
	private readonly settingsManager = new SettingsManager();
	private readonly audio = new AudioManager(this.settingsManager.current);
	private readonly input = new InputManager(this.settingsManager.current);
	private readonly mission: MissionManager;
	private readonly score = new ScoreManager();
	private readonly testMode: boolean;
	private readonly queryTestMode: boolean;
	private stateValue: GameState = 'loading';
	private renderer: WebGLRenderer | null = null;
	private composer: EffectComposer | null = null;
	private bloom: UnrealBloomPass | null = null;
	private world: World | null = null;
	private player: PlayerJet | null = null;
	private flight: FlightController | null = null;
	private squadron: SquadronController | null = null;
	private targetManager: TargetManager | null = null;
	private targeting: TargetingSystem | null = null;
	private missiles: MissileManager | null = null;
	private projectiles: ProjectileManager | null = null;
	private damage: DamageSystem | null = null;
	private explosions: ExplosionSystem | null = null;
	private cameraController: CameraController | null = null;
	private animationFrame = 0;
	private lastFrameTime = 0;
	private accumulator = 0;
	private snapshotAccumulator = 0;
	private elapsed = 0;
	private introElapsed = 0;
	private launchCount = 0;
	private notificationId = 0;
	private readonly notifications: NotificationSnapshot[] = [];
	private loadingProgress = 0;
	private loadingText = 'Preparing flight systems';
	private error: string | null = null;
	private results: MissionResults | null = null;
	private mapOpen = false;
	private disposed = false;
	private initialized = false;
	private pausedByVisibility = false;
	private invincible = false;
	private crashed = false;
	private crashElapsed = 0;
	private timeScale = 1;
	private lastSnapshot: GameSnapshot;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly onSnapshot: (snapshot: GameSnapshot) => void,
		options: GameOptions = {}
	) {
		const query =
			typeof location !== 'undefined' ? new URLSearchParams(location.search).get('testMode') : null;
		this.queryTestMode = query === 'true' || query === '1';
		this.testMode = options.testMode ?? this.queryTestMode;
		this.mission = new MissionManager(this.testMode);
		this.lastSnapshot = this.createSnapshot();
	}

	get state(): GameState {
		return this.stateValue;
	}

	async initialize(): Promise<void> {
		if (this.initialized || this.disposed) return;
		this.initialized = true;
		try {
			this.setLoading(0.06, 'Starting renderer');
			this.renderer = new WebGLRenderer({
				canvas: this.canvas,
				antialias: this.settingsManager.current.quality !== 'low',
				alpha: false,
				powerPreference: 'high-performance'
			});
			this.renderer.outputColorSpace = SRGBColorSpace;
			this.renderer.toneMapping = ACESFilmicToneMapping;
			this.renderer.toneMappingExposure = GAME_CONFIG.renderer.exposure;
			this.renderer.shadowMap.enabled = this.settingsManager.current.quality !== 'low';
			this.renderer.shadowMap.type = PCFShadowMap;
			const renderPass = new RenderPass(this.scene, this.camera);
			this.bloom = new UnrealBloomPass(
				new Vector2(1, 1),
				this.settingsManager.current.quality === 'low'
					? GAME_CONFIG.renderer.bloomStrength * 0.5
					: GAME_CONFIG.renderer.bloomStrength,
				GAME_CONFIG.renderer.bloomRadius,
				GAME_CONFIG.renderer.bloomThreshold
			);
			this.composer = new EffectComposer(this.renderer);
			this.composer.addPass(renderPass);
			this.composer.addPass(this.bloom);

			this.setLoading(0.18, 'Generating combat zone');
			this.world = new World(this.settingsManager.current.quality);
			this.world.configureScene(this.scene, this.settingsManager.current.highContrast);
			this.scene.add(this.world);
			this.targetManager = new TargetManager(this.world.enemyBase, this.world.terrain);

			this.setLoading(0.42, 'Loading aircraft');
			this.player = new PlayerJet();
			this.scene.add(this.player);
			const aircraftLoaded = await this.player.initialize();
			this.flight = new FlightController(this.player);
			this.flight.reset(new Vector3(0, 300, 1050), 0);
			this.squadron = new SquadronController();
			this.scene.add(this.squadron);
			this.squadron.reset(this.player);

			this.setLoading(0.65, aircraftLoaded ? 'Arming weapons' : 'Using backup aircraft');
			this.missiles = new MissileManager(this.onMissileEnd);
			this.scene.add(this.missiles);
			const missileLoaded = await this.missiles.initialize();
			this.damage = new DamageSystem(this.onPlayerDamage);
			this.projectiles = new ProjectileManager(this.targetManager.targets, (amount) =>
				this.damagePlayer(amount)
			);
			this.explosions = new ExplosionSystem((intensity) => {
				this.cameraController?.addShake(intensity * 0.46);
				this.audio.playExplosion(intensity);
			});
			this.scene.add(this.projectiles, this.explosions);

			this.setLoading(0.84, missileLoaded ? 'Calibrating targeting' : 'Using backup missiles');
			this.cameraController = new CameraController(this.camera, this.settingsManager.current);
			this.cameraController.reset(this.player);
			this.targeting = new TargetingSystem(
				this.camera,
				this.targetManager.targets,
				(from, to) => this.world?.terrain.hasLineOfSight(from, to, 3) ?? true,
				this.testMode
			);
			this.targeting.setAimAssist(this.settingsManager.current.aimAssist);
			this.input.attach(this.canvas);
			this.resize();
			if (typeof window !== 'undefined') window.addEventListener('resize', this.resize);
			if (typeof document !== 'undefined') {
				document.addEventListener('visibilitychange', this.onVisibilityChange);
			}
			this.installTestHooks();
			this.setLoading(1, 'Viper flight ready');
			this.stateValue = 'menu';
			this.emitSnapshot();
			this.lastFrameTime = performance.now();
			this.animationFrame = requestAnimationFrame(this.frame);
		} catch (cause) {
			this.error = cause instanceof Error ? cause.message : 'WebGL could not be initialized';
			this.loadingText = 'Unable to start renderer';
			this.stateValue = 'failure';
			this.emitSnapshot();
			this.renderer?.dispose();
			this.renderer = null;
		}
	}

	startMission(): void {
		if (!this.initialized || this.disposed || !this.player || !this.flight) return;
		void this.audio.startAfterGesture();
		this.resetMissionSystems();
		this.stateValue = 'intro';
		this.introElapsed = 0;
		this.results = null;
		this.error = null;
		this.notify('VIPER STRIKE — OPERATION EMBER LANCE', 'info', 3.2);
		this.emitSnapshot();
	}

	pause(): void {
		if (this.stateValue !== 'playing' && this.stateValue !== 'intro') return;
		this.stateValue = 'paused';
		this.audio.playUi(false);
		this.emitSnapshot();
	}

	resume(): void {
		if (this.stateValue !== 'paused') return;
		this.stateValue = this.introElapsed > 0 && this.mission.elapsed === 0 ? 'intro' : 'playing';
		this.lastFrameTime = performance.now();
		this.audio.playUi(true);
		this.emitSnapshot();
	}

	restart(): void {
		this.startMission();
	}

	returnToMenu(): void {
		if (!this.initialized || this.disposed) return;
		this.stateValue = 'menu';
		this.mapOpen = false;
		this.results = null;
		this.missiles?.reset();
		this.projectiles?.reset();
		this.explosions?.reset();
		this.emitSnapshot();
	}

	fire(): void {
		if (this.stateValue !== 'playing') return;
		const target = this.targeting?.target;
		const simplifiedLock =
			this.settingsManager.current.simplifiedFiring && Boolean(this.targeting?.visible);
		if (!target || (!this.targeting?.locked && !simplifiedLock)) {
			this.notify('Hold target in the lock circle', 'warning', 1.2);
			return;
		}
		if (!this.player || !this.flight || !this.missiles) return;
		const missile = this.missiles.launchFromPlayer(this.player, this.flight, target);
		if (!missile) {
			this.notify(this.missiles.ammo <= 0 ? 'MISSILES DEPLETED' : 'WEAPON COOLING', 'warning', 1);
			return;
		}
		this.launchCount += 1;
		this.score.recordShot();
		this.audio.playLaunch();
		this.cameraController?.onMissileLaunch(missile, this.launchCount);
	}

	cycleTarget(): void {
		if (this.stateValue !== 'playing') return;
		const target = this.targeting?.cycle();
		if (target) {
			this.notify(target.name, 'info', 1);
			this.audio.playUi(true);
		}
	}

	cycleCamera(): void {
		const mode = this.cameraController?.cycleMode();
		if (mode) {
			this.settingsManager.update({ lastCamera: mode });
			this.notify(`${mode.toUpperCase()} CAMERA`, 'info', 1);
			this.audio.playUi(true);
		}
	}

	toggleMap(): void {
		this.mapOpen = !this.mapOpen;
		this.audio.playUi(true);
		this.emitSnapshot();
	}

	updateSettings(partial: Partial<GameSettings>): void {
		const settings = this.settingsManager.update(partial);
		this.audio.updateSettings(settings);
		this.input.updateSettings(settings);
		this.cameraController?.updateSettings(settings);
		this.targeting?.setAimAssist(settings.aimAssist);
		this.world?.configureScene(this.scene, settings.highContrast);
		if (this.renderer) {
			this.applyPixelRatio();
			this.renderer.shadowMap.enabled = settings.quality !== 'low';
		}
		if (this.bloom) {
			this.bloom.strength =
				settings.quality === 'low'
					? GAME_CONFIG.renderer.bloomStrength * 0.5
					: GAME_CONFIG.renderer.bloomStrength;
		}
		this.emitSnapshot();
	}

	setTouchInput(input: TouchInput): void {
		this.input.setTouchInput(input);
	}

	debugDamage(amount = 25): void {
		if (!import.meta.env.DEV) return;
		this.damagePlayer(amount);
	}

	debugRefill(): void {
		if (!import.meta.env.DEV) return;
		this.missiles?.reset();
		this.damage?.reset();
		this.notify('DEBUG: AIRCRAFT REFILLED', 'info', 1.2);
	}

	debugSuccess(): void {
		if (!import.meta.env.DEV) return;
		this.forceSuccess();
	}

	debugSetInvincibility(enabled: boolean): void {
		if (!import.meta.env.DEV) return;
		this.invincible = enabled;
		this.notify(`DEBUG: INVINCIBILITY ${enabled ? 'ON' : 'OFF'}`, 'info', 1.2);
	}

	debugSetInfiniteMissiles(enabled: boolean): void {
		if (!import.meta.env.DEV) return;
		this.missiles?.setInfiniteAmmo(enabled);
		this.notify(`DEBUG: INFINITE MISSILES ${enabled ? 'ON' : 'OFF'}`, 'info', 1.2);
	}

	debugDestroyTarget(): void {
		if (!import.meta.env.DEV || !this.targetManager) return;
		const target =
			this.targeting?.target ??
			this.targetManager.targets.find((candidate) => candidate.enabled && !candidate.destroyed);
		if (!target) return;
		const result = this.targetManager.applyDamage(target, target.maxHealth, 'player');
		if (result.destroyed) {
			this.score.recordTargetDestroyed(target.type);
			this.explosions?.spawn(
				target.position,
				target.type === 'fuel'
					? 'fuel'
					: target.type === 'command' || target.type === 'weak-point'
						? 'final'
						: 'normal'
			);
			this.notify(`DEBUG: DESTROYED ${target.name}`, 'success', 1.5);
		}
	}

	debugSkipPhase(): void {
		if (!import.meta.env.DEV) return;
		this.handleMissionEvents(this.mission.skipPhase());
	}

	debugSpawnExplosion(): void {
		if (!import.meta.env.DEV) return;
		const target = this.targeting?.target;
		if (target) {
			_debugPosition.copy(target.position);
		} else if (this.player) {
			this.player.getForward(_debugDirection);
			_debugPosition.copy(this.player.position).addScaledVector(_debugDirection, 120);
		} else {
			return;
		}
		this.explosions?.spawn(_debugPosition, 'fuel');
	}

	debugReset(): void {
		if (!import.meta.env.DEV) return;
		this.startMission();
	}

	debugSetTimeScale(scale: number): void {
		if (!import.meta.env.DEV) return;
		this.timeScale = clamp(scale, 0.1, 4);
	}

	debugSetHelpers(enabled: boolean): void {
		if (!import.meta.env.DEV) return;
		this.notify(`DEBUG: HELPERS ${enabled ? 'ON' : 'OFF'}`, 'info', 0.9);
	}

	debugSetRanges(enabled: boolean): void {
		if (!import.meta.env.DEV) return;
		this.notify(`DEBUG: RANGES ${enabled ? 'ON' : 'OFF'}`, 'info', 0.9);
	}

	debugSetPaths(enabled: boolean): void {
		if (!import.meta.env.DEV) return;
		this.notify(`DEBUG: PATHS ${enabled ? 'ON' : 'OFF'}`, 'info', 0.9);
	}

	debugSetStats(enabled: boolean): void {
		if (!import.meta.env.DEV) return;
		this.notify(`DEBUG: STATS ${enabled ? 'ON' : 'OFF'}`, 'info', 0.9);
	}

	resize = (): void => {
		if (!this.renderer || !this.composer) return;
		const width = Math.max(1, this.canvas.clientWidth || this.canvas.width || 1);
		const height = Math.max(1, this.canvas.clientHeight || this.canvas.height || 1);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.applyPixelRatio();
		this.renderer.setSize(width, height, false);
		this.composer.setSize(width, height);
	};

	snapshot(): GameSnapshot {
		this.lastSnapshot = this.createSnapshot();
		return this.lastSnapshot;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		cancelAnimationFrame(this.animationFrame);
		this.input.detach();
		this.audio.dispose();
		if (typeof window !== 'undefined') window.removeEventListener('resize', this.resize);
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.onVisibilityChange);
		}
		this.removeTestHooks();
		this.world?.dispose();
		this.player?.dispose();
		this.composer?.dispose();
		this.renderer?.dispose();
		this.scene.clear();
		this.renderer = null;
		this.composer = null;
	}

	private readonly frame = (time: number): void => {
		if (this.disposed) return;
		const delta =
			clamp((time - this.lastFrameTime) / 1000, 0, GAME_CONFIG.maxDeltaSeconds) * this.timeScale;
		this.lastFrameTime = time;
		this.elapsed += delta;
		if (this.stateValue === 'playing' || this.stateValue === 'intro') {
			this.accumulator = Math.min(
				this.accumulator + delta,
				GAME_CONFIG.fixedStepSeconds * GAME_CONFIG.maxFixedSteps
			);
			let steps = 0;
			while (
				this.accumulator >= GAME_CONFIG.fixedStepSeconds &&
				steps < GAME_CONFIG.maxFixedSteps
			) {
				this.fixedUpdate(GAME_CONFIG.fixedStepSeconds);
				this.accumulator -= GAME_CONFIG.fixedStepSeconds;
				steps += 1;
			}
		} else {
			this.world?.update(this.elapsed);
		}
		this.cleanupNotifications();
		this.snapshotAccumulator += delta;
		if (this.snapshotAccumulator >= GAME_CONFIG.snapshotIntervalSeconds) {
			this.snapshotAccumulator = 0;
			this.emitSnapshot();
		}
		this.composer?.render(delta);
		this.animationFrame = requestAnimationFrame(this.frame);
	};

	private fixedUpdate(delta: number): void {
		if (
			!this.player ||
			!this.flight ||
			!this.world ||
			!this.squadron ||
			!this.targetManager ||
			!this.targeting ||
			!this.missiles ||
			!this.projectiles ||
			!this.damage ||
			!this.explosions ||
			!this.cameraController
		) {
			return;
		}
		if (this.stateValue === 'intro') {
			this.introElapsed += delta;
			const terrainHeight = this.world.terrain.terrainHeightAt(
				this.player.position.x,
				this.player.position.z
			);
			this.flight.update(delta, INTRO_INPUT, terrainHeight, true, false);
			this.squadron.update(
				delta,
				'approach',
				this.player,
				this.targetManager.targets,
				this.onSquadronAttack
			);
			this.player.updateEffects(0, this.damage.healthRatio, this.elapsed);
			this.cameraController.update(delta, this.player, this.flight, this.world.terrain, 0);
			this.world.update(this.elapsed);
			const introDuration = this.testMode
				? GAME_CONFIG.mission.testIntroSeconds
				: GAME_CONFIG.mission.introSeconds;
			if (this.introElapsed >= introDuration) {
				this.stateValue = 'playing';
				this.handleMissionEvents(this.mission.start());
			}
			return;
		}

		if (this.crashed) {
			this.crashElapsed += delta;
			this.explosions.update(delta);
			this.player.updateEffects(0, 0, this.elapsed);
			this.cameraController.update(delta, this.player, this.flight, this.world.terrain, 0);
			this.world.update(this.elapsed);
			if (this.crashElapsed >= 1.45) {
				this.completeMission(false, 'Aircraft impacted terrain');
			}
			return;
		}

		const controls = this.input.update(delta);
		if (controls.method !== this.settingsManager.current.preferredControls) {
			this.settingsManager.update({ preferredControls: controls.method });
		}
		if (this.input.consume('pause')) {
			this.pause();
			return;
		}
		if (this.input.consume('cycleTarget')) this.cycleTarget();
		if (this.input.consume('cycleCamera')) this.cycleCamera();
		if (this.input.consume('map')) this.toggleMap();
		if (controls.fire || this.input.consume('fire')) this.fire();

		const terrainHeight = this.world.terrain.terrainHeightAt(
			this.player.position.x,
			this.player.position.z
		);
		const hitGround = this.flight.update(
			delta,
			controls,
			terrainHeight,
			this.settingsManager.current.autoLevel,
			!this.invincible
		);
		if (hitGround) {
			this.crashed = true;
			this.crashElapsed = 0;
			_impactPosition.set(this.player.position.x, terrainHeight + 1.2, this.player.position.z);
			this.explosions.spawn(_impactPosition, 'fuel');
			this.cameraController.addShake(2.6);
			this.damage.applyDamage(BALANCE.player.collisionDamage);
			this.notify('TERRAIN IMPACT', 'warning', 2);
			return;
		}
		this.targeting.update(delta);
		const toneStep = this.targeting.acquisitionToneStep();
		if (toneStep >= 0) this.audio.playLockTone(this.targeting.locked);
		if (this.mission.phase === 'final-target') this.targetManager.unlockFinalTargets();

		this.squadron.update(
			delta,
			this.mission.phase,
			this.player,
			this.targetManager.targets,
			this.onSquadronAttack
		);
		this.missiles.update(delta);
		this.projectiles.update(delta, this.player.position, this.flight.velocity);
		this.damage.update(delta);
		this.damage.setIncomingThreat(this.projectiles.closestDistance, 0);
		this.explosions.update(delta);
		this.player.updateEffects(
			this.flight.afterburnerActive ? 1 : 0,
			this.damage.healthRatio,
			this.elapsed
		);
		this.cameraController.update(
			delta,
			this.player,
			this.flight,
			this.world.terrain,
			this.targeting.progress
		);
		this.audio.updateEngine(
			this.flight.speed / BALANCE.flight.maxSpeed,
			this.flight.afterburnerActive ? 1 : 0,
			delta
		);
		this.world.update(this.elapsed);
		this.handleMissionEvents(
			this.mission.update(delta, {
				hasTarget: this.targeting.target !== null,
				hasLock: this.targeting.locked,
				regularTargetsDestroyed: this.targetManager.regularTargetsDestroyed,
				finalTargetDestroyed: this.targetManager.finalTargetDestroyed,
				playerHealth: this.damage.health
			})
		);
	}

	private readonly onMissileEnd = (
		missile: Missile,
		reason: MissileEndReason,
		target: Target | null
	): void => {
		if (reason === 'expired' || !target) {
			if (missile.source === 'player') this.score.recordMiss();
			return;
		}
		_impactPosition.copy(missile.position);
		const damage = missile.canDamage ? BALANCE.missile.damage : 0;
		const result = this.targetManager?.applyDamage(target, damage, missile.source);
		const kind: ExplosionKind =
			target.type === 'fuel'
				? 'fuel'
				: target.type === 'weak-point' || target.type === 'command'
					? 'final'
					: 'normal';
		this.explosions?.spawn(_impactPosition, result?.destroyed ? kind : 'normal');
		if (missile.source === 'player') {
			if (result?.hit) {
				this.score.recordHit();
				if (result.destroyed) {
					const points = this.score.recordTargetDestroyed(target.type);
					this.notify(`TARGET DESTROYED  +${points}`, 'success', 2.2);
				}
			} else {
				this.score.recordMiss();
			}
		} else if (result?.destroyed) {
			this.squadron?.registerAssistedKill();
			this.notify(`${target.name} destroyed by squadron`, 'info', 1.8);
		}
	};

	private readonly onSquadronAttack = (
		jet: SquadronJet,
		target: Target,
		canDamage: boolean
	): void => {
		this.missiles?.launchFromSquadron(jet, target, canDamage);
	};

	private readonly onPlayerDamage = (event: {
		amount: number;
		health: number;
		critical: boolean;
		destroyed: boolean;
	}): void => {
		this.score.recordDamage(event.amount);
		this.cameraController?.addShake(event.amount * 0.035);
		if (event.destroyed) {
			this.notify('AIRCRAFT LOST', 'warning', 3);
		} else if (event.critical) {
			this.notify('WARNING — AIRFRAME CRITICAL', 'warning', 2);
			this.audio.playWarning();
		}
	};

	private damagePlayer(amount: number): void {
		if (this.invincible) return;
		this.damage?.applyDamage(amount);
	}

	private handleMissionEvents(events: readonly MissionEvent[]): void {
		for (const event of events) {
			if (event.type === 'notification' || event.type === 'phase') {
				this.notify(event.text, event.type === 'phase' ? 'success' : 'info', 2);
			} else if (event.type === 'radio') {
				this.audio.playRadioCue();
			} else if (event.type === 'success') {
				this.completeMission(true);
			} else if (event.type === 'failure') {
				this.completeMission(false, event.text);
			}
		}
	}

	private completeMission(success: boolean, reason?: string): void {
		if (this.stateValue === 'success' || this.stateValue === 'failure') return;
		if (success) {
			this.stateValue = 'success';
			this.results = this.score.finalize(this.mission.elapsed);
			this.audio.playSuccess();
			this.notify('MISSION ACCOMPLISHED', 'success', 5);
		} else {
			this.stateValue = 'failure';
			this.error = reason ?? 'Mission failed';
			this.results = null;
			this.audio.playFailure();
		}
		this.emitSnapshot();
	}

	private forceSuccess(): void {
		if (!this.testMode && !import.meta.env.DEV) return;
		this.handleMissionEvents(this.mission.forceSuccess());
	}

	private resetMissionSystems(): void {
		if (!this.player || !this.flight) return;
		this.crashed = false;
		this.crashElapsed = 0;
		this.flight.reset(new Vector3(0, 300, 1050), 0);
		this.damage?.reset();
		this.targetManager?.reset();
		this.targeting?.select(null);
		this.missiles?.reset();
		this.projectiles?.reset();
		this.explosions?.reset();
		this.squadron?.reset(this.player);
		this.cameraController?.reset(this.player);
		this.mission.reset();
		this.score.reset();
		this.notifications.length = 0;
		this.mapOpen = false;
		this.launchCount = 0;
		this.accumulator = 0;
	}

	private notify(text: string, tone: NotificationSnapshot['tone'], duration: number): void {
		const recent = this.notifications[this.notifications.length - 1];
		if (recent?.text === text && recent.expiresAt - this.elapsed > duration * 0.5) return;
		this.notificationId += 1;
		this.notifications.push({
			id: this.notificationId,
			text,
			tone,
			expiresAt: this.elapsed + duration
		});
		if (this.notifications.length > 5) this.notifications.shift();
	}

	private cleanupNotifications(): void {
		for (let index = this.notifications.length - 1; index >= 0; index -= 1) {
			if (this.notifications[index].expiresAt <= this.elapsed) this.notifications.splice(index, 1);
		}
	}

	private createSnapshot(): GameSnapshot {
		const playerPosition = this.player?.position ?? _impactPosition.set(0, 0, 0);
		const tactical: TacticalEntitySnapshot[] = [];
		if (this.player) {
			tactical.push({
				id: 'player',
				kind: 'player',
				position: {
					x: playerPosition.x,
					y: playerPosition.y,
					z: playerPosition.z
				},
				heading: this.flight?.heading ?? 0,
				hostile: false,
				active: true
			});
		}
		for (const jet of this.squadron?.jets ?? []) {
			tactical.push({
				id: jet.callsign,
				kind: 'squadron',
				position: { x: jet.position.x, y: jet.position.y, z: jet.position.z },
				heading: Math.atan2(jet.velocity.x, -jet.velocity.z),
				hostile: false,
				active: jet.active
			});
		}
		for (const target of this.targetManager?.targets ?? []) {
			tactical.push({
				id: target.id,
				kind: 'target',
				position: { x: target.position.x, y: target.position.y, z: target.position.z },
				heading: 0,
				hostile: true,
				active: target.enabled && !target.destroyed
			});
		}
		tactical.push(...(this.missiles?.tacticalSnapshot() ?? []));
		tactical.push(...(this.projectiles?.tacticalSnapshot() ?? []));
		const missionTime = this.mission.elapsed;
		return {
			state: this.stateValue,
			loading: { progress: this.loadingProgress, text: this.loadingText },
			phase: this.mission.phase,
			objective: this.mission.objective,
			player: {
				speed: this.flight?.speed ?? 0,
				altitude: this.flight?.altitude ?? 0,
				health: this.damage?.health ?? BALANCE.player.maxHealth,
				afterburner: this.flight?.afterburnerRatio ?? 1,
				ammo: this.missiles?.ammo ?? BALANCE.missile.capacity,
				cooldown: (this.missiles?.cooldown ?? 0) / BALANCE.missile.cooldownSeconds,
				position: { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z },
				heading: this.flight?.heading ?? 0
			},
			target:
				this.targeting?.snapshot(
					Math.max(1, this.canvas.clientWidth || this.canvas.width),
					Math.max(1, this.canvas.clientHeight || this.canvas.height)
				) ?? null,
			squad: this.squadron?.snapshot(playerPosition) ?? [],
			notifications: this.notifications.map((notification) => ({ ...notification })),
			radio: this.mission.radio ? { ...this.mission.radio } : null,
			tacticalEntities: tactical,
			score: this.score.snapshot(missionTime),
			missionTime,
			settings: { ...this.settingsManager.current },
			camera: this.cameraController?.snapshot() ?? {
				mode: 'chase',
				position: { x: 0, y: 0, z: 0 },
				lookAt: { x: 0, y: 0, z: -1 },
				shake: 0,
				fov: GAME_CONFIG.camera.baseFov
			},
			missileWarning: this.damage?.missileWarning() ?? {
				active: false,
				bearing: 0,
				distance: 0
			},
			mapOpen: this.mapOpen,
			results: this.results ? { ...this.results } : null,
			error: this.error
		};
	}

	private emitSnapshot(): void {
		this.lastSnapshot = this.createSnapshot();
		this.onSnapshot(this.lastSnapshot);
	}

	private setLoading(progress: number, text: string): void {
		this.loadingProgress = clamp(progress, 0, 1);
		this.loadingText = text;
		this.emitSnapshot();
	}

	private applyPixelRatio(): void {
		if (!this.renderer) return;
		const quality = this.settingsManager.current.quality;
		const ratio =
			quality === 'low'
				? GAME_CONFIG.renderer.lowPixelRatio
				: quality === 'medium'
					? GAME_CONFIG.renderer.mediumPixelRatio
					: GAME_CONFIG.renderer.highPixelRatio;
		const deviceRatio = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
		this.renderer.setPixelRatio(Math.min(deviceRatio, ratio));
	}

	private readonly onVisibilityChange = (): void => {
		if (document.hidden && (this.stateValue === 'playing' || this.stateValue === 'intro')) {
			this.pausedByVisibility = true;
			this.pause();
		} else if (!document.hidden && this.pausedByVisibility && this.stateValue === 'paused') {
			this.pausedByVisibility = false;
			this.resume();
		}
	};

	private installTestHooks(): void {
		if (!this.queryTestMode || typeof window === 'undefined') return;
		const hooks: ViperTestHooks = {
			start: () => this.startMission(),
			pause: () => this.pause(),
			resume: () => this.resume(),
			restart: () => this.restart(),
			success: () => this.forceSuccess(),
			snapshot: () => this.snapshot()
		};
		(window as Window & { __VIPER_TEST__?: ViperTestHooks }).__VIPER_TEST__ = hooks;
	}

	private removeTestHooks(): void {
		if (typeof window === 'undefined') return;
		delete (window as Window & { __VIPER_TEST__?: ViperTestHooks }).__VIPER_TEST__;
	}
}
