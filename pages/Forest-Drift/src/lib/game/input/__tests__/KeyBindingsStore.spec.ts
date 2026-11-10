import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_PROFILE_ID,
	getActiveProfile,
	getBindings,
	KEY_BINDINGS_STORAGE_KEY,
	MAX_PROFILES,
	normalizeKeyBindingsState,
	reloadKeyBindings,
	resetKeyBindingsForTests,
	resolveBindings,
	subscribeKeyBindings
} from '../KeyBindingsStore';

const profile = (id: string, overrides: Record<string, unknown> = {}, extra: object = {}) => ({
	id,
	name: `Profile ${id}`,
	createdAt: '2026-11-10T10:00:00.000Z',
	updatedAt: '2026-11-10T10:00:00.000Z',
	overrides,
	...extra
});

describe('normalizeKeyBindingsState', () => {
	it('falls back to Default for anything that is not a state', () => {
		for (const value of [null, undefined, 42, 'x', [], {}, { version: 2, profiles: [] }]) {
			expect(normalizeKeyBindingsState(value)).toEqual({
				version: 1,
				activeProfileId: DEFAULT_PROFILE_ID,
				profiles: []
			});
		}
	});

	it('keeps valid overrides, including slots cleared on purpose', () => {
		const state = normalizeKeyBindingsState({
			version: 1,
			activeProfileId: 'mine',
			profiles: [profile('mine', { 'move.forward': [{ code: 'KeyI' }, null] })]
		});
		expect(state.activeProfileId).toBe('mine');
		expect(state.profiles[0].overrides).toEqual({ 'move.forward': [{ code: 'KeyI' }, null] });
	});

	it('drops unknown actions, locked actions and broken entries', () => {
		const state = normalizeKeyBindingsState({
			version: 1,
			activeProfileId: 'mine',
			profiles: [
				profile('mine', {
					'from.a.newer.version': [{ code: 'KeyI' }, null],
					'ui.back': [{ code: 'KeyQ' }, null],
					'move.back': [{ code: 'NotAKey' }, null],
					'move.left': [{ code: 'KeyJ' }],
					'move.right': 'KeyL',
					'move.jump': [{ code: 'KeyB', shift: true, mod: 'yes' }, null]
				})
			]
		});
		expect(state.profiles[0].overrides).toEqual({
			'move.jump': [{ code: 'KeyB', shift: true }, null]
		});
	});

	it('strips modifiers from a lone modifier key', () => {
		const state = normalizeKeyBindingsState({
			version: 1,
			activeProfileId: 'mine',
			profiles: [profile('mine', { 'move.run': [{ code: 'Shift', shift: true }, null] })]
		});
		expect(state.profiles[0].overrides['move.run']).toEqual([{ code: 'Shift' }, null]);
	});

	it('rejects bad, duplicate and reserved profile ids, and caps the profile count', () => {
		const state = normalizeKeyBindingsState({
			version: 1,
			activeProfileId: 'missing',
			profiles: [
				profile('a'),
				profile('a'),
				profile(DEFAULT_PROFILE_ID),
				profile('has spaces'),
				'not a profile',
				...Array.from({ length: MAX_PROFILES + 5 }, (_, i) => profile(`p${i}`))
			]
		});
		expect(state.profiles.map((p) => p.id).slice(0, 2)).toEqual(['a', 'p0']);
		expect(state.profiles).toHaveLength(MAX_PROFILES);
		expect(state.activeProfileId).toBe(DEFAULT_PROFILE_ID);
	});

	it('tidies names and timestamps', () => {
		const state = normalizeKeyBindingsState({
			version: 1,
			activeProfileId: 'a',
			profiles: [
				profile('a', {}, { name: '   Left   handed  ', createdAt: 'yesterday' }),
				profile('b', {}, { name: 'x'.repeat(100) }),
				profile('c', {}, { name: '   ' })
			]
		});
		expect(state.profiles.map((p) => p.name)).toEqual(['Left handed', 'x'.repeat(40), 'Untitled']);
		expect(state.profiles[0].createdAt).toBe(new Date(0).toISOString());
	});
});

describe('resolveBindings', () => {
	it('uses the default when a profile leaves an action alone', () => {
		expect(resolveBindings('move.forward', null)).toEqual([{ code: 'KeyW' }, null]);
		expect(resolveBindings('build.undo', null)).toEqual([
			{ code: 'Minus' },
			{ code: 'NumpadSubtract' }
		]);
	});

	it('keeps Esc whatever the profile says', () => {
		const sneaky = { ...profile('x'), overrides: { 'ui.back': [{ code: 'KeyQ' }, null] } } as never;
		expect(resolveBindings('ui.back', sneaky)).toEqual([{ code: 'Escape' }, null]);
	});
});

describe('live store', () => {
	let stored: string | null;
	let getItem: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		stored = null;
		getItem = vi.fn(() => stored);
		vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() });
		resetKeyBindingsForTests();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		resetKeyBindingsForTests();
	});

	it('plays with Default when nothing is saved', () => {
		expect(getActiveProfile()).toBeNull();
		expect(getBindings('build.toggle')).toEqual([{ code: 'KeyG' }, null]);
	});

	it('reads the active profile once and caches it', () => {
		stored = JSON.stringify({
			version: 1,
			activeProfileId: 'mine',
			profiles: [profile('mine', { 'build.toggle': [{ code: 'KeyB' }, null] })]
		});
		expect(getBindings('build.toggle')).toEqual([{ code: 'KeyB' }, null]);
		expect(getBindings('move.forward')).toEqual([{ code: 'KeyW' }, null]);
		expect(getItem).toHaveBeenCalledTimes(1);
		expect(getItem).toHaveBeenCalledWith(KEY_BINDINGS_STORAGE_KEY);
	});

	it('survives blocked storage and broken JSON', () => {
		getItem.mockImplementation(() => {
			throw new Error('SecurityError');
		});
		expect(getBindings('move.forward')).toEqual([{ code: 'KeyW' }, null]);
		resetKeyBindingsForTests();
		getItem.mockImplementation(() => '{not json');
		expect(getBindings('move.forward')).toEqual([{ code: 'KeyW' }, null]);
	});

	it('re-reads storage and tells listeners on reload', () => {
		expect(getBindings('ui.help')).toEqual([{ code: 'KeyH' }, null]);
		const listener = vi.fn();
		subscribeKeyBindings(listener);
		stored = JSON.stringify({
			version: 1,
			activeProfileId: 'mine',
			profiles: [profile('mine', { 'ui.help': [{ code: 'F1' }, null] })]
		});
		reloadKeyBindings();
		expect(listener).toHaveBeenCalledTimes(1);
		expect(getBindings('ui.help')).toEqual([{ code: 'F1' }, null]);
	});
});
