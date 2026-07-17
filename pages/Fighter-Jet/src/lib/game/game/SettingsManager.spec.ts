import { afterEach, describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	recommendedQuality,
	SettingsManager,
	validateSettings
} from './SettingsManager';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

afterEach(() => {
	if (originalStorage) {
		Object.defineProperty(globalThis, 'localStorage', originalStorage);
	} else {
		delete (globalThis as { localStorage?: Storage }).localStorage;
	}
});

describe('settings validation', () => {
	it('clamps numeric values and rejects invalid enums and types', () => {
		const settings = validateSettings({
			quality: 'ultra',
			masterVolume: 9,
			effectsVolume: -2,
			mouseSensitivity: Number.NaN,
			touchControlMode: 'accelerometer',
			tiltSensitivity: 9,
			reducedMotion: 'yes'
		});

		expect(settings.quality).toBe(DEFAULT_SETTINGS.quality);
		expect(settings.masterVolume).toBe(1);
		expect(settings.effectsVolume).toBe(0);
		expect(settings.mouseSensitivity).toBe(DEFAULT_SETTINGS.mouseSensitivity);
		expect(settings.touchControlMode).toBe(DEFAULT_SETTINGS.touchControlMode);
		expect(settings.tiltSensitivity).toBe(1.5);
		expect(settings.reducedMotion).toBe(DEFAULT_SETTINGS.reducedMotion);
	});

	it('recovers from corrupted persistent JSON', () => {
		let removedKey = '';
		const storage: Storage = {
			length: 1,
			clear: () => undefined,
			getItem: () => '{not-json',
			key: () => null,
			removeItem: (key) => {
				removedKey = key;
			},
			setItem: () => undefined
		};
		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true
		});

		const manager = new SettingsManager();

		expect(manager.current).toEqual({
			...DEFAULT_SETTINGS,
			quality: recommendedQuality()
		});
		expect(removedKey).toContain('viper-strike-settings');
	});
});
