import { describe, expect, it } from 'vitest';
import {
	ALL_CONTEXTS,
	contextsOverlap,
	findKeyAction,
	KEY_ACTIONS,
	KEY_CATEGORIES,
	MODE_CONTEXTS,
	STATE_CONTEXTS,
	TOOL_CONTEXTS,
	type KeyActionDef
} from '../keyActions';
import { bindingsCollide, normalizeBinding, refusalReason } from '../keyCodes';

const actions: readonly KeyActionDef[] = KEY_ACTIONS;

describe('key action list', () => {
	it('has unique ids', () => {
		const ids = actions.map((action) => action.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('uses only valid, clean default bindings', () => {
		for (const action of actions) {
			for (const binding of action.defaults) {
				if (!binding) continue;
				expect(normalizeBinding(binding), action.id).toEqual(binding);
			}
		}
	});

	it('gives every action a default key', () => {
		for (const action of actions) expect(action.defaults[0], action.id).not.toBeNull();
	});

	it('never defaults to a key the browser or system keeps (Esc is the one locked action)', () => {
		for (const action of actions) {
			if (action.locked) continue;
			for (const binding of action.defaults) {
				if (binding) expect(refusalReason(binding, false), action.id).toBeNull();
				if (binding) expect(refusalReason(binding, true), action.id).toBeNull();
			}
		}
		expect(actions.filter((action) => action.locked).map((action) => action.id)).toEqual([
			'ui.back'
		]);
		expect(findKeyAction('ui.back')?.defaults[0]?.code).toBe('Escape');
	});

	it('puts every action in a known category, and every category has actions', () => {
		const categories = new Set<string>(KEY_CATEGORIES.map((category) => category.id));
		for (const action of actions) expect(categories.has(action.category), action.id).toBe(true);
		for (const category of categories)
			expect(
				actions.some((action) => action.category === category),
				category
			).toBe(true);
	});

	it('only lists real, needed key sharing', () => {
		for (const action of actions) {
			for (const otherId of action.sharesKeyWith ?? []) {
				const other = findKeyAction(otherId);
				expect(other, `${action.id} → ${otherId}`).toBeDefined();
				// A stale entry would hide a real conflict later, so each one must still be needed.
				const share = action.defaults.some(
					(a) => a && other!.defaults.some((b) => b && bindingsCollide(a, b))
				);
				expect(share, `${action.id} and ${otherId} no longer share a default key`).toBe(true);
			}
		}
	});

	it('uses only known contexts', () => {
		for (const action of actions) {
			expect(action.contexts.length, action.id).toBeGreaterThan(0);
			for (const context of action.contexts) expect(ALL_CONTEXTS).toContain(context);
		}
	});
});

describe('contextsOverlap', () => {
	it('is reflexive and symmetric', () => {
		for (const a of ALL_CONTEXTS) {
			expect(contextsOverlap(a, a)).toBe(true);
			for (const b of ALL_CONTEXTS)
				expect(contextsOverlap(a, b), `${a}/${b}`).toBe(contextsOverlap(b, a));
		}
	});

	it('keeps the Mini Build editor apart from everything else', () => {
		for (const context of ALL_CONTEXTS) {
			if (context === 'miniBuildEditor') continue;
			expect(contextsOverlap('miniBuildEditor', context), context).toBe(false);
		}
	});

	it('lets global overlap everything in a world', () => {
		for (const context of ALL_CONTEXTS) {
			if (context === 'miniBuildEditor') continue;
			expect(contextsOverlap('global', context), context).toBe(true);
		}
	});

	it('treats movement states, tools and modes as one-at-a-time', () => {
		for (const group of [STATE_CONTEXTS, TOOL_CONTEXTS, MODE_CONTEXTS]) {
			for (const a of group)
				for (const b of group) if (a !== b) expect(contextsOverlap(a, b), `${a}/${b}`).toBe(false);
		}
		for (const tool of TOOL_CONTEXTS)
			for (const mode of MODE_CONTEXTS) expect(contextsOverlap(tool, mode)).toBe(false);
	});

	it('puts tools inside Build Mode, and modes outside it', () => {
		for (const tool of TOOL_CONTEXTS) expect(contextsOverlap('build', tool)).toBe(true);
		for (const mode of MODE_CONTEXTS) expect(contextsOverlap('build', mode)).toBe(false);
	});

	it('lets you build while walking, flying or riding, but not while resting', () => {
		for (const state of ['onFoot', 'flying', 'riding'] as const) {
			expect(contextsOverlap(state, 'build')).toBe(true);
			expect(contextsOverlap(state, 'tool:roof')).toBe(true);
			expect(contextsOverlap(state, 'mode:music')).toBe(true);
		}
		expect(contextsOverlap('resting', 'build')).toBe(false);
		expect(contextsOverlap('resting', 'tool:roof')).toBe(false);
	});
});
