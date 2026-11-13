/**
 * Guards Phase 1's promise: the default profile covers every key the game uses today.
 *
 * It scans the source for key codes (`'KeyR'`, `Digit1:` …). Each one must be some action's
 * default, or one of the dialog-only keys that are deliberately not game controls (plan, Q6).
 * Once phases 2–3 move the game onto `matchesAction`, this scan finds almost nothing, and a
 * stricter "no raw key codes outside game/input" test replaces it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KEY_ACTIONS, type KeyActionDef } from '../keyActions';
import { physicalCodes } from '../keyCodes';

const LIB = fileURLToPath(new URL('../../../', import.meta.url));

/** Keys used only for dialog and tab-list navigation, which stay fixed. */
const DIALOG_ONLY = new Set(['Home', 'End']);

const CODE = String.raw`(?:Key[A-Z]|Digit\d|Numpad(?:\d|Add|Subtract|Multiply|Divide|Decimal|Enter)|F\d{1,2}|Arrow(?:Up|Down|Left|Right)|Shift(?:Left|Right)|Space|Enter|Tab|Backspace|Delete|Escape|Home|End|Page(?:Up|Down)|Minus|Equal|Bracket(?:Left|Right)|Backslash|Comma|Period|Slash|Semicolon|Quote|Backquote)`;
/** A quoted code (`'KeyR'`), or a code used as an object key (`Digit1: 1`). */
const PATTERN = new RegExp(String.raw`['"\`](${CODE})['"\`]|\b(${CODE})\s*:\s*\d`, 'g');

/** The Controls screen captures raw keys on purpose: that's how players choose new ones. */
const EXEMPT = new Set(['KeyBindingsScreen.svelte']);

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory())
			return name === '__tests__' || path.endsWith(join('game', 'input')) ? [] : sourceFiles(path);
		return /\.(ts|svelte)$/.test(name) && !/\.(spec|test)\.ts$/.test(name) && !EXEMPT.has(name)
			? [path]
			: [];
	});
}

function codesInSource(): Map<string, Set<string>> {
	const found = new Map<string, Set<string>>();
	for (const file of sourceFiles(LIB)) {
		const text = readFileSync(file, 'utf8');
		for (const match of text.matchAll(PATTERN)) {
			const code = match[1] ?? match[2];
			if (!found.has(code)) found.set(code, new Set());
			found.get(code)!.add(relative(LIB, file));
		}
	}
	return found;
}

describe('default key coverage', () => {
	const defaultCodes = new Set(
		(KEY_ACTIONS as readonly KeyActionDef[]).flatMap((action) =>
			action.defaults.flatMap((binding) => (binding ? physicalCodes(binding.code) : []))
		)
	);

	it('finds the key handlers it is meant to check', () => {
		const found = codesInSource();
		// A sanity check that the scan still sees key names at all: touch buttons and dialogs still
		// name these as plain strings.
		for (const code of ['KeyB', 'KeyR', 'ArrowUp', 'Minus', 'Escape'])
			expect(found.has(code), code).toBe(true);
	});

	it('has a default for every key the game listens for', () => {
		const missing = [...codesInSource()]
			.filter(([code]) => !defaultCodes.has(code) && !DIALOG_ONLY.has(code))
			.map(([code, files]) => `${code} (${[...files].join(', ')})`);
		expect(missing).toEqual([]);
	});
});
