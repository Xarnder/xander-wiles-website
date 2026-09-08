import { describe, expect, it } from 'vitest';
import {
	decimalsForStep,
	formatSettingsNumber,
	snapSettingsNumber
} from '../settingsFieldFormat';

describe('formatSettingsNumber', () => {
	it('shows integers for whole-number steps', () => {
		expect(decimalsForStep(1)).toBe(0);
		expect(formatSettingsNumber(20.4, 1)).toBe('20');
	});

	it('matches slider step precision instead of raw floats', () => {
		expect(formatSettingsNumber(0.3400000000000001, 0.01)).toBe('0.34');
		expect(formatSettingsNumber(8.197559999999998, 0.05)).toBe('8.20');
	});
});

describe('snapSettingsNumber', () => {
	it('clamps and snaps to the field step', () => {
		expect(snapSettingsNumber(8.19755, 0, 24, 0.05)).toBe(8.2);
		expect(snapSettingsNumber(-2, 0, 10, 1)).toBe(0);
	});
});
