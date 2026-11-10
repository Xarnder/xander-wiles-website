/**
 * Physical key codes (`KeyboardEvent.code`), how to name them, and which ones can't be bound.
 *
 * Bindings store the physical key, not the character, so W/A/S/D stay in the same place on an
 * AZERTY keyboard. Names use the player's layout when the browser can tell us
 * (`navigator.keyboard.getLayoutMap()`, Chromium only), and a built-in table otherwise.
 */

/** One key, plus the modifiers that must be held with it. */
export interface Binding {
	readonly code: string;
	readonly shift?: boolean;
	/** Ctrl on Windows/Linux or Cmd on a Mac. Either one matches, on every platform. */
	readonly mod?: boolean;
	/** Alt, or Option on a Mac. */
	readonly alt?: boolean;
}

/**
 * Codes that stand for "either side". A lone Shift binding is stored as `Shift`, so Run works with
 * both Shift keys and leaves the secondary slot free.
 */
const SIDED_CODES: Record<string, readonly string[]> = {
	Shift: ['ShiftLeft', 'ShiftRight'],
	Control: ['ControlLeft', 'ControlRight'],
	Alt: ['AltLeft', 'AltRight']
};

/** Physical codes a binding may name. Anything else in storage or a loaded file is ignored. */
export const KNOWN_CODES: ReadonlySet<string> = new Set([
	...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
	...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
	...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
	...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
	'NumpadAdd',
	'NumpadSubtract',
	'NumpadMultiply',
	'NumpadDivide',
	'NumpadDecimal',
	'NumpadEnter',
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'Space',
	'Enter',
	'Tab',
	'Backspace',
	'Delete',
	'Insert',
	'Home',
	'End',
	'PageUp',
	'PageDown',
	'Escape',
	'Minus',
	'Equal',
	'BracketLeft',
	'BracketRight',
	'Backslash',
	'IntlBackslash',
	'Semicolon',
	'Quote',
	'Backquote',
	'Comma',
	'Period',
	'Slash',
	'CapsLock',
	'ContextMenu',
	'ShiftLeft',
	'ShiftRight',
	'ControlLeft',
	'ControlRight',
	'AltLeft',
	'AltRight',
	'MetaLeft',
	'MetaRight',
	...Object.keys(SIDED_CODES)
]);

/** True when `code` is a modifier key on its own (a lone Shift, Ctrl, Alt or Cmd). */
export function isModifierCode(code: string): boolean {
	return (
		code in SIDED_CODES ||
		/^(Shift|Control|Alt|Meta)(Left|Right)$/.test(code) ||
		code === 'OSLeft' ||
		code === 'OSRight'
	);
}

/** The physical codes a binding code covers: `Shift` → both Shift keys, `KeyW` → itself. */
export function physicalCodes(code: string): readonly string[] {
	return SIDED_CODES[code] ?? [code];
}

/** Does pressing the physical key `eventCode` count as the binding code `bindingCode`? */
export function codeMatches(bindingCode: string, eventCode: string): boolean {
	return physicalCodes(bindingCode).includes(eventCode);
}

/** Do two binding codes share a physical key (`Shift` and `ShiftLeft` do)? */
export function codesOverlap(a: string, b: string): boolean {
	const right = physicalCodes(b);
	return physicalCodes(a).some((code) => right.includes(code));
}

/** Same key and the same modifiers. Modifiers are ignored when the key is itself a modifier. */
export function bindingsCollide(a: Binding, b: Binding): boolean {
	if (!codesOverlap(a.code, b.code)) return false;
	if (isModifierCode(a.code) || isModifierCode(b.code)) return true;
	return !!a.shift === !!b.shift && !!a.mod === !!b.mod && !!a.alt === !!b.alt;
}

/** A clean copy with only `true` modifiers kept, or null if it can't be a binding. */
export function normalizeBinding(value: unknown): Binding | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	if (typeof raw.code !== 'string' || !KNOWN_CODES.has(raw.code)) return null;
	const binding: { code: string; shift?: true; mod?: true; alt?: true } = { code: raw.code };
	// Modifiers mean nothing on a key that is itself a modifier.
	if (!isModifierCode(raw.code)) {
		if (raw.shift === true) binding.shift = true;
		if (raw.mod === true) binding.mod = true;
		if (raw.alt === true) binding.alt = true;
	}
	return binding;
}

// ------------------------------------------------------------------ keys that can't be used

const BROWSER_MOD_KEYS = new Set(['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'KeyR', 'KeyL', 'KeyH', 'KeyM']);

/**
 * Why this binding can never work, or null if it can. The browser or OS takes these keys before
 * the page sees them (or the game needs them, as with Esc).
 */
export function refusalReason(binding: Binding, apple = isApplePlatform()): string | null {
	const { code } = binding;
	if (code === 'Escape')
		return 'Esc always releases the mouse and closes menus, so it is kept for Pause and Back.';
	if (/^(Meta|OS)(Left|Right)$/.test(code))
		return `${apple ? 'Cmd' : 'The Windows key'} on its own is kept by the system.`;
	if (code === 'F11') return 'F11 switches the browser to full screen.';
	if (code === 'F12') return 'F12 opens the browser’s developer tools.';
	if (binding.mod && BROWSER_MOD_KEYS.has(code))
		return `${formatBinding(binding, { apple })} is a browser or system shortcut, so it can’t be used.`;
	if (binding.mod && code === 'Tab')
		return `${formatBinding(binding, { apple })} switches tabs or apps, so it can’t be used.`;
	if (binding.alt && (code === 'Tab' || code === 'F4'))
		return `${formatBinding(binding, { apple })} is a system shortcut, so it can’t be used.`;
	return null;
}

/**
 * A caution for keys that work, but only while the mouse is captured, or that can surprise
 * players. Shown in amber; not a conflict.
 */
export function warningReason(binding: Binding, apple = isApplePlatform()): string | null {
	const { code } = binding;
	if (code === 'F1' && !binding.mod && !binding.alt)
		return 'F1 opens browser help when the mouse isn’t captured.';
	if (code === 'F5' && !binding.mod && !binding.alt)
		return 'F5 reloads the page when the mouse isn’t captured.';
	if (binding.mod && (code === 'KeyF' || code === 'KeyP'))
		return `${formatBinding(binding, { apple })} is also a browser shortcut when the mouse isn’t captured.`;
	if (code === 'Alt' || code === 'AltLeft' || code === 'AltRight')
		return `${apple ? 'Option' : 'Alt'} on its own can open the browser menu on some systems.`;
	return null;
}

// ------------------------------------------------------------------ names

const CODE_LABELS: Record<string, string> = {
	Space: 'Space',
	Enter: 'Enter',
	Tab: 'Tab',
	Backspace: 'Backspace',
	Delete: 'Delete',
	Insert: 'Insert',
	Home: 'Home',
	End: 'End',
	PageUp: 'Page Up',
	PageDown: 'Page Down',
	Escape: 'Esc',
	ArrowUp: '↑',
	ArrowDown: '↓',
	ArrowLeft: '←',
	ArrowRight: '→',
	Minus: '-',
	Equal: '=',
	BracketLeft: '[',
	BracketRight: ']',
	Backslash: '\\',
	IntlBackslash: '§',
	Semicolon: ';',
	Quote: "'",
	Backquote: '`',
	Comma: ',',
	Period: '.',
	Slash: '/',
	CapsLock: 'Caps Lock',
	ContextMenu: 'Menu',
	NumpadAdd: 'Numpad +',
	NumpadSubtract: 'Numpad −',
	NumpadMultiply: 'Numpad *',
	NumpadDivide: 'Numpad /',
	NumpadDecimal: 'Numpad .',
	NumpadEnter: 'Numpad Enter',
	Shift: 'Shift',
	ShiftLeft: 'Left Shift',
	ShiftRight: 'Right Shift'
};

/** Codes whose printed character depends on the keyboard layout. */
function isLayoutDependent(code: string): boolean {
	return (
		/^(Key[A-Z]|Digit\d)$/.test(code) ||
		[
			'Minus',
			'Equal',
			'BracketLeft',
			'BracketRight',
			'Backslash',
			'IntlBackslash',
			'Semicolon',
			'Quote',
			'Backquote',
			'Comma',
			'Period',
			'Slash'
		].includes(code)
	);
}

let layoutLabels: ReadonlyMap<string, string> | null = null;

/**
 * Ask the browser what each physical key prints on this player's layout. Chromium only; elsewhere
 * the built-in names are used. Safe to call more than once.
 */
export async function loadKeyboardLayoutLabels(): Promise<void> {
	try {
		const keyboard = (
			globalThis.navigator as
				{ keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } } | undefined
		)?.keyboard;
		if (!keyboard?.getLayoutMap) return;
		layoutLabels = await keyboard.getLayoutMap();
	} catch {
		// Blocked in some frames and permission policies; the built-in names still work.
	}
}

/** For tests: pretend the browser reported this layout (or none). */
export function setKeyboardLayoutLabelsForTests(map: ReadonlyMap<string, string> | null): void {
	layoutLabels = map;
}

/** True on macOS and iOS, where the platform modifier is Cmd and Alt is called Option. */
export function isApplePlatform(): boolean {
	const nav = globalThis.navigator as
		(Navigator & { userAgentData?: { platform?: string } }) | undefined;
	if (!nav) return false;
	const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
	return /mac|iphone|ipad|ipod/i.test(platform);
}

/** The name of one key, with no modifiers: `KeyW` → "W", `ArrowUp` → "↑". */
export function codeLabel(code: string, apple = isApplePlatform()): string {
	if (isLayoutDependent(code)) {
		const printed = layoutLabels?.get(code);
		if (printed && printed.trim()) return printed.length === 1 ? printed.toUpperCase() : printed;
	}
	if (code === 'Control' || code === 'ControlLeft' || code === 'ControlRight') {
		const side = code === 'Control' ? '' : code.endsWith('Left') ? 'Left ' : 'Right ';
		return `${side}Ctrl`;
	}
	if (code === 'Alt' || code === 'AltLeft' || code === 'AltRight') {
		const side = code === 'Alt' ? '' : code.endsWith('Left') ? 'Left ' : 'Right ';
		return `${side}${apple ? 'Option' : 'Alt'}`;
	}
	if (code === 'MetaLeft' || code === 'MetaRight') return apple ? 'Cmd' : 'Win';
	if (CODE_LABELS[code]) return CODE_LABELS[code];
	if (/^Key[A-Z]$/.test(code)) return code.slice(3);
	if (/^Digit\d$/.test(code)) return code.slice(5);
	if (/^Numpad\d$/.test(code)) return `Numpad ${code.slice(6)}`;
	return code;
}

/** A binding as players read it: "W", "Shift + R", "Cmd + S" (Mac) or "Ctrl + S". */
export function formatBinding(binding: Binding, options: { apple?: boolean } = {}): string {
	const apple = options.apple ?? isApplePlatform();
	const parts: string[] = [];
	if (binding.mod) parts.push(apple ? 'Cmd' : 'Ctrl');
	if (binding.alt) parts.push(apple ? 'Option' : 'Alt');
	if (binding.shift) parts.push('Shift');
	parts.push(codeLabel(binding.code, apple));
	return parts.join(' + ');
}
