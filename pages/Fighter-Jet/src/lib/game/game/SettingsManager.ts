import type {
	CameraMode,
	ColourBlindMode,
	GameSettings,
	InputMethod,
	QualityLevel,
	SubtitleSize,
	TouchControlMode
} from '../types';
import { clamp } from '../utils/math';

const STORAGE_KEY = 'viper-strike-settings-v1';
const QUALITY_LEVELS = new Set<QualityLevel>(['low', 'medium', 'high']);
const COLOUR_BLIND_MODES = new Set<ColourBlindMode>([
	'off',
	'deuteranopia',
	'protanopia',
	'tritanopia'
]);
const SUBTITLE_SIZES = new Set<SubtitleSize>(['small', 'medium', 'large']);
const TOUCH_CONTROL_MODES = new Set<TouchControlMode>(['stick', 'tilt']);
const INPUT_METHODS = new Set<InputMethod>(['keyboard-mouse', 'gamepad', 'touch']);
const CAMERA_MODES = new Set<CameraMode>(['chase', 'wide', 'cockpit']);

export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze({
	quality: 'high',
	masterVolume: 0.8,
	musicVolume: 0.35,
	effectsVolume: 0.85,
	engineVolume: 0.85,
	radioVolume: 0.9,
	mouseSensitivity: 1,
	gamepadSensitivity: 1,
	invertPitch: false,
	reducedMotion: false,
	missileCamera: true,
	highContrast: false,
	screenShake: 0.8,
	colourBlindMode: 'off',
	simplifiedFlight: false,
	autoLevel: true,
	aimAssist: 0.75,
	simplifiedFiring: false,
	subtitles: true,
	subtitleSize: 'medium',
	touchControlMode: 'stick',
	tiltSensitivity: 0.75,
	preferredControls: 'keyboard-mouse',
	lastCamera: 'chase'
});

function numberSetting(value: unknown, fallback: number, minimum: number, maximum: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? clamp(value, minimum, maximum)
		: fallback;
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function enumSetting<T extends string>(value: unknown, values: ReadonlySet<T>, fallback: T): T {
	return typeof value === 'string' && values.has(value as T) ? (value as T) : fallback;
}

export function recommendedQuality(): QualityLevel {
	if (typeof navigator === 'undefined') return DEFAULT_SETTINGS.quality;
	const hardwareThreads = navigator.hardwareConcurrency || 4;
	const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
	if (hardwareThreads <= 4 || deviceMemory <= 4) return 'low';
	if (hardwareThreads <= 8 || deviceMemory <= 8) return 'medium';
	return 'high';
}

export function validateSettings(
	value: unknown,
	defaults: Readonly<GameSettings> = DEFAULT_SETTINGS
): GameSettings {
	const source =
		typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
	return {
		quality: enumSetting(source.quality, QUALITY_LEVELS, defaults.quality),
		masterVolume: numberSetting(source.masterVolume, defaults.masterVolume, 0, 1),
		musicVolume: numberSetting(source.musicVolume, defaults.musicVolume, 0, 1),
		effectsVolume: numberSetting(source.effectsVolume, defaults.effectsVolume, 0, 1),
		engineVolume: numberSetting(source.engineVolume, defaults.engineVolume, 0, 1),
		radioVolume: numberSetting(source.radioVolume, defaults.radioVolume, 0, 1),
		mouseSensitivity: numberSetting(source.mouseSensitivity, defaults.mouseSensitivity, 0.2, 2.5),
		gamepadSensitivity: numberSetting(
			source.gamepadSensitivity,
			defaults.gamepadSensitivity,
			0.2,
			2.5
		),
		invertPitch: booleanSetting(source.invertPitch, defaults.invertPitch),
		reducedMotion: booleanSetting(source.reducedMotion, defaults.reducedMotion),
		missileCamera: booleanSetting(source.missileCamera, defaults.missileCamera),
		highContrast: booleanSetting(source.highContrast, defaults.highContrast),
		screenShake: numberSetting(source.screenShake, defaults.screenShake, 0, 1),
		colourBlindMode: enumSetting(
			source.colourBlindMode,
			COLOUR_BLIND_MODES,
			defaults.colourBlindMode
		),
		simplifiedFlight: booleanSetting(source.simplifiedFlight, defaults.simplifiedFlight),
		autoLevel: booleanSetting(source.autoLevel, defaults.autoLevel),
		aimAssist: numberSetting(source.aimAssist, defaults.aimAssist, 0, 1),
		simplifiedFiring: booleanSetting(source.simplifiedFiring, defaults.simplifiedFiring),
		subtitles: booleanSetting(source.subtitles, defaults.subtitles),
		subtitleSize: enumSetting(source.subtitleSize, SUBTITLE_SIZES, defaults.subtitleSize),
		touchControlMode: enumSetting(
			source.touchControlMode,
			TOUCH_CONTROL_MODES,
			defaults.touchControlMode
		),
		tiltSensitivity: numberSetting(source.tiltSensitivity, defaults.tiltSensitivity, 0.25, 1.5),
		preferredControls: enumSetting(
			source.preferredControls,
			INPUT_METHODS,
			defaults.preferredControls
		),
		lastCamera: enumSetting(source.lastCamera, CAMERA_MODES, defaults.lastCamera)
	};
}

export class SettingsManager {
	private settings: GameSettings;

	constructor() {
		this.settings = this.load();
	}

	get current(): Readonly<GameSettings> {
		return this.settings;
	}

	update(partial: Partial<GameSettings>): GameSettings {
		this.settings = validateSettings({ ...this.settings, ...partial });
		this.persist();
		return { ...this.settings };
	}

	reset(): GameSettings {
		this.settings = this.deviceDefaults();
		this.persist();
		return { ...this.settings };
	}

	private load(): GameSettings {
		const defaults = this.deviceDefaults();
		if (typeof localStorage === 'undefined') return defaults;
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			return stored === null ? defaults : validateSettings(JSON.parse(stored), defaults);
		} catch {
			try {
				localStorage.removeItem(STORAGE_KEY);
			} catch {
				// Storage may be blocked; defaults remain safe.
			}
			return defaults;
		}
	}

	private deviceDefaults(): GameSettings {
		return { ...DEFAULT_SETTINGS, quality: recommendedQuality() };
	}

	private persist(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
		} catch {
			// Quota/privacy errors should never prevent play.
		}
	}
}
