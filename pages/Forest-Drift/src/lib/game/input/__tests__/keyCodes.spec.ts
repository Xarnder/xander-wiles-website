import { afterEach, describe, expect, it } from 'vitest';
import {
	bindingsCollide,
	codeLabel,
	formatBinding,
	normalizeBinding,
	refusalReason,
	setKeyboardLayoutLabelsForTests,
	warningReason
} from '../keyCodes';

afterEach(() => setKeyboardLayoutLabelsForTests(null));

describe('formatBinding', () => {
	it('names keys the way players read them', () => {
		expect(formatBinding({ code: 'KeyW' }, { apple: false })).toBe('W');
		expect(formatBinding({ code: 'Digit9' }, { apple: false })).toBe('9');
		expect(formatBinding({ code: 'ArrowUp' }, { apple: false })).toBe('↑');
		expect(formatBinding({ code: 'Backslash' }, { apple: false })).toBe('\\');
		expect(formatBinding({ code: 'Shift' }, { apple: false })).toBe('Shift');
		expect(formatBinding({ code: 'Numpad4' }, { apple: false })).toBe('Numpad 4');
	});

	it('uses each platform’s modifier names', () => {
		const chord = { code: 'KeyR', mod: true, alt: true, shift: true };
		expect(formatBinding(chord, { apple: false })).toBe('Ctrl + Alt + Shift + R');
		expect(formatBinding(chord, { apple: true })).toBe('Cmd + Option + Shift + R');
	});

	it('uses the player’s keyboard layout when the browser reports it', () => {
		setKeyboardLayoutLabelsForTests(
			new Map([
				['KeyQ', 'a'],
				['Semicolon', 'm']
			])
		);
		expect(codeLabel('KeyQ', false)).toBe('A');
		expect(codeLabel('Semicolon', false)).toBe('M');
		// Keys that print the same everywhere still use the built-in name.
		expect(codeLabel('ArrowLeft', false)).toBe('←');
	});
});

describe('normalizeBinding', () => {
	it('keeps only known codes and true modifiers', () => {
		expect(normalizeBinding({ code: 'KeyR', shift: true, mod: false, alt: 1 })).toEqual({
			code: 'KeyR',
			shift: true
		});
		expect(normalizeBinding({ code: 'Hyper' })).toBeNull();
		expect(normalizeBinding('KeyR')).toBeNull();
	});
});

describe('bindingsCollide', () => {
	it('compares key and modifiers', () => {
		expect(bindingsCollide({ code: 'KeyR' }, { code: 'KeyR' })).toBe(true);
		expect(bindingsCollide({ code: 'KeyR' }, { code: 'KeyR', shift: true })).toBe(false);
		expect(bindingsCollide({ code: 'Shift' }, { code: 'ShiftRight' })).toBe(true);
		expect(bindingsCollide({ code: 'ShiftLeft' }, { code: 'ShiftRight' })).toBe(false);
	});
});

describe('refusalReason and warningReason', () => {
	it('refuses keys the browser or system always takes', () => {
		for (const binding of [
			{ code: 'Escape' },
			{ code: 'F11' },
			{ code: 'F12' },
			{ code: 'MetaLeft' },
			{ code: 'KeyW', mod: true },
			{ code: 'KeyT', mod: true },
			{ code: 'Tab', alt: true },
			{ code: 'F4', alt: true }
		])
			expect(refusalReason(binding, false), binding.code).not.toBeNull();
		expect(refusalReason({ code: 'KeyW', mod: true }, false)).toContain('Ctrl + W');
		expect(refusalReason({ code: 'KeyW', mod: true }, true)).toContain('Cmd + W');
	});

	it('allows ordinary keys and the game’s own shortcuts', () => {
		for (const binding of [
			{ code: 'KeyW' },
			{ code: 'KeyS', mod: true },
			{ code: 'F5' },
			{ code: 'Tab' }
		])
			expect(refusalReason(binding, false), binding.code).toBeNull();
	});

	it('warns about keys that only work while the mouse is captured', () => {
		expect(warningReason({ code: 'F5' }, false)).toContain('reloads');
		expect(warningReason({ code: 'KeyF', mod: true }, false)).not.toBeNull();
		expect(warningReason({ code: 'Alt' }, true)).toContain('Option');
		expect(warningReason({ code: 'KeyW' }, false)).toBeNull();
	});
});
