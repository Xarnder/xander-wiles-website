export type GameState = 'loading' | 'menu' | 'intro' | 'playing' | 'paused' | 'success' | 'failure';

export type MissionPhase =
	'approach' | 'combat-zone' | 'first-lock' | 'strikes' | 'final-target' | 'egress' | 'complete';

export type CameraMode = 'chase' | 'wide' | 'cockpit';
export type InputMethod = 'keyboard-mouse' | 'gamepad' | 'touch';
export type QualityLevel = 'low' | 'medium' | 'high';
export type TouchControlMode = 'stick' | 'tilt';
export type SubtitleSize = 'small' | 'medium' | 'large';
export type ColourBlindMode = 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia';
export type TargetType = 'radar' | 'sam' | 'fuel' | 'hangar' | 'command' | 'weak-point';
export type TargetLockState = 'none' | 'acquiring' | 'locked' | 'retaining';
export type SquadronState =
	'formation' | 'approach' | 'break' | 'attack-run' | 'egress' | 'regroup' | 'victory-flyover';

export interface Vec2State {
	x: number;
	y: number;
}

export interface Vec3State {
	x: number;
	y: number;
	z: number;
}

export interface CameraState {
	mode: CameraMode;
	position: Vec3State;
	lookAt: Vec3State;
	shake: number;
	fov: number;
}

export interface InputState {
	pitch: number;
	roll: number;
	yaw: number;
	throttle: number;
	afterburner: boolean;
	fire: boolean;
	cycleTarget: boolean;
	cycleCamera: boolean;
	pause: boolean;
	map: boolean;
	method: InputMethod;
}

export interface PlayerSnapshot {
	speed: number;
	altitude: number;
	health: number;
	afterburner: number;
	ammo: number;
	cooldown: number;
	position: Vec3State;
	heading: number;
}

export interface TargetMarkerSnapshot {
	id: string;
	name: string;
	type: TargetType;
	screen: Vec2State;
	edge: Vec2State;
	onScreen: boolean;
	behindCamera: boolean;
	distance: number;
	health: number;
	lockState: TargetLockState;
	lockProgress: number;
	visible: boolean;
	isFinal: boolean;
}

export interface SquadronMemberSnapshot {
	callsign: string;
	state: SquadronState;
	health: number;
	position: Vec3State;
	distance: number;
	active: boolean;
}

export interface NotificationSnapshot {
	id: number;
	text: string;
	tone: 'info' | 'warning' | 'success';
	expiresAt: number;
}

export interface RadioSnapshot {
	speaker: string;
	text: string;
	active: boolean;
	startedAt: number;
	duration: number;
}

export interface TacticalEntitySnapshot {
	id: string;
	kind: 'player' | 'squadron' | 'target' | 'missile' | 'projectile';
	position: Vec3State;
	heading: number;
	hostile: boolean;
	active: boolean;
}

export interface ScoreSnapshot {
	score: number;
	hits: number;
	shots: number;
	accuracy: number;
	combo: number;
	maxCombo: number;
	damageTaken: number;
	timeBonus: number;
	rating: MissionRating;
}

export type MissionRating = 'D' | 'C' | 'B' | 'A' | 'S';

export interface MissionResults extends ScoreSnapshot {
	missionTime: number;
	bestScore: number;
	bestTime: number | null;
	newBestScore: boolean;
	newBestTime: boolean;
}

export interface GameSettings {
	quality: QualityLevel;
	masterVolume: number;
	musicVolume: number;
	effectsVolume: number;
	engineVolume: number;
	radioVolume: number;
	mouseSensitivity: number;
	gamepadSensitivity: number;
	invertPitch: boolean;
	reducedMotion: boolean;
	missileCamera: boolean;
	highContrast: boolean;
	screenShake: number;
	colourBlindMode: ColourBlindMode;
	simplifiedFlight: boolean;
	autoLevel: boolean;
	aimAssist: number;
	simplifiedFiring: boolean;
	subtitles: boolean;
	subtitleSize: SubtitleSize;
	touchControlMode: TouchControlMode;
	tiltSensitivity: number;
	preferredControls: InputMethod;
	lastCamera: CameraMode;
}

export interface GameSnapshot {
	state: GameState;
	loading: {
		progress: number;
		text: string;
	};
	phase: MissionPhase;
	objective: string;
	player: PlayerSnapshot;
	target: TargetMarkerSnapshot | null;
	squad: readonly SquadronMemberSnapshot[];
	notifications: readonly NotificationSnapshot[];
	radio: RadioSnapshot | null;
	tacticalEntities: readonly TacticalEntitySnapshot[];
	score: ScoreSnapshot;
	missionTime: number;
	settings: GameSettings;
	camera: CameraState;
	missileWarning: {
		active: boolean;
		bearing: number;
		distance: number;
	};
	mapOpen: boolean;
	results: MissionResults | null;
	error: string | null;
}

export interface TouchInput {
	pitch?: number;
	roll?: number;
	yaw?: number;
	throttle?: number;
	afterburner?: boolean;
	fire?: boolean;
}

export interface GameOptions {
	testMode?: boolean;
}

export interface GameCommands {
	startMission(): void;
	pause(): void;
	resume(): void;
	restart(): void;
	returnToMenu(): void;
	fire(): void;
	cycleTarget(): void;
	cycleCamera(): void;
	toggleMap(): void;
	updateSettings(partial: Partial<GameSettings>): void;
	setTouchInput(input: TouchInput): void;
	resize(): void;
	dispose(): void;
}

export interface ViperTestHooks {
	start(): void;
	pause(): void;
	resume(): void;
	restart(): void;
	success(): void;
	snapshot(): GameSnapshot;
}
