/**
 * Every game control goes through the player's bindings (`matchesAction` / `KeyInput.isHeld`).
 * This fails if code anywhere outside `game/input` starts checking a raw key again, which would
 * quietly ignore a rebinding.
 *
 * Allowed: Esc and Tab (Esc is locked; Tab moves focus in dialogs), and `event.key` checks for
 * Enter / Space / Home / End / arrows that drive buttons and tab lists inside dialogs (plan, Q6).
 * Touch buttons may name default keys as plain strings; they're sent as default-key presses.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SCANNED = ['lib', 'routes'].map((dir) => join(ROOT, dir));

const FORBIDDEN: readonly { pattern: RegExp; why: string }[] = [
	{
		pattern: /\.code\s*[!=]==?\s*['"`](?!Escape['"`]|Tab['"`])/,
		why: 'compares event.code to a key; use matchesAction'
	},
	{
		pattern:
			/['"`](?!Escape['"`]|Tab['"`])[A-Za-z0-9]+['"`]\s*[!=]==?\s*(?:event|e|ev|evt)\.code\b/,
		why: 'compares a key to event.code; use matchesAction'
	},
	{ pattern: /\.includes\(\s*(?:event|e|ev|evt)\.code\s*\)/, why: 'looks event.code up in a list' },
	{ pattern: /switch\s*\(\s*(?:event|e|ev|evt)\.code\s*\)/, why: 'switches on event.code' },
	{ pattern: /\[\s*(?:event|e|ev|evt)\.code\s*\]/, why: 'indexes a table by event.code' },
	{ pattern: /\.key\s*[!=]==?\s*['"`]Shift['"`]/, why: 'checks the Shift key directly' },
	{ pattern: /keys\.has\(\s*['"`]/, why: 'reads a held key by code; use KeyInput.isHeld' }
];

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

describe('no raw key codes outside game/input', () => {
	it('routes every game key through the bindings', () => {
		const offences: string[] = [];
		for (const file of SCANNED.flatMap(sourceFiles)) {
			readFileSync(file, 'utf8')
				.split('\n')
				.forEach((line, index) => {
					for (const { pattern, why } of FORBIDDEN)
						if (pattern.test(line))
							offences.push(`${relative(ROOT, file)}:${index + 1} ${why}: ${line.trim()}`);
				});
		}
		expect(offences).toEqual([]);
	});
});
