import { describe, expect, it } from 'vitest';
import { nextTheme, resolveStoredTheme, themeColor } from './theme';

describe('theme', () => {
	it('migrates the old green dark theme to navy', () => {
		expect(resolveStoredTheme('dark', true)).toBe('navy');
		expect(resolveStoredTheme(null, true)).toBe('navy');
		expect(resolveStoredTheme(null, false)).toBe('light');
		expect(resolveStoredTheme('oled')).toBe('oled');
	});

	it('cycles navy, OLED, then light', () => {
		expect(nextTheme('navy')).toBe('oled');
		expect(nextTheme('oled')).toBe('light');
		expect(nextTheme('light')).toBe('navy');
	});

	it('uses true black for OLED chrome', () => {
		expect(themeColor('oled')).toBe('#000000');
		expect(themeColor('navy')).toBe('#0a1220');
	});
});
