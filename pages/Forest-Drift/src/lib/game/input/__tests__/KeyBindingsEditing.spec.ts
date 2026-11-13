import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	addProfiles,
	applyBindingChanges,
	canUndoKeyBindings,
	createProfile,
	DEFAULT_PROFILE_ID,
	deleteProfile,
	getActiveProfile,
	getBindings,
	getKeyBindingsState,
	KEY_BINDINGS_STORAGE_KEY,
	MAX_PROFILES,
	renameProfile,
	resetActions,
	resetActiveProfile,
	resetKeyBindingsForTests,
	setActiveProfile,
	subscribeKeyBindings,
	undoKeyBindings,
	UNDO_LIMIT,
	uniqueProfileName
} from '../KeyBindingsStore';
import {
	exportProfilesFile,
	parseProfilesFile,
	profilesFileName,
	MAX_KEY_BINDINGS_FILE_BYTES
} from '../keyBindingsFile';

let stored: Record<string, string>;

beforeEach(() => {
	stored = {};
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => stored[key] ?? null,
		setItem: (key: string, value: string) => (stored[key] = value)
	});
	resetKeyBindingsForTests();
});

afterEach(() => {
	vi.unstubAllGlobals();
	resetKeyBindingsForTests();
});

const saved = () => JSON.parse(stored[KEY_BINDINGS_STORAGE_KEY]);

describe('changing keys', () => {
	it('copies Default into "My controls" on the first change, and saves it', () => {
		const result = applyBindingChanges([
			{ id: 'move.forward', slot: 0, binding: { code: 'KeyI' } }
		]);
		expect(result).toEqual({ createdProfile: 'My controls', applied: true });
		expect(getActiveProfile()?.name).toBe('My controls');
		expect(getBindings('move.forward')).toEqual([{ code: 'KeyI' }, null]);
		expect(saved().profiles[0].overrides).toEqual({ 'move.forward': [{ code: 'KeyI' }, null] });
	});

	it('stores nothing for an action set back to its default', () => {
		applyBindingChanges([{ id: 'ui.help', slot: 1, binding: { code: 'F1' } }]);
		applyBindingChanges([{ id: 'ui.help', slot: 1, binding: null }]);
		expect(getActiveProfile()?.overrides).toEqual({});
	});

	it('keeps a cleared slot as cleared', () => {
		applyBindingChanges([{ id: 'build.undo', slot: 1, binding: null }]);
		expect(getBindings('build.undo')).toEqual([{ code: 'Minus' }, null]);
	});

	it('applies a swap as a single undoable step', () => {
		applyBindingChanges([
			{ id: 'move.jump', slot: 0, binding: { code: 'KeyE' } },
			{ id: 'build.customise', slot: 0, binding: { code: 'Space' } }
		]);
		expect(getBindings('build.customise')[0]).toEqual({ code: 'Space' });
		expect(undoKeyBindings()).toBe(true);
		expect(getActiveProfile()).toBeNull();
		expect(getBindings('move.jump')[0]).toEqual({ code: 'Space' });
	});

	it('never changes Esc', () => {
		const result = applyBindingChanges([{ id: 'ui.back', slot: 0, binding: { code: 'KeyQ' } }]);
		expect(result.applied).toBe(true);
		expect(getBindings('ui.back')[0]).toEqual({ code: 'Escape' });
	});

	it('tells listeners and keeps at most the last 20 undo steps', () => {
		const listener = vi.fn();
		subscribeKeyBindings(listener);
		for (let i = 0; i < UNDO_LIMIT + 5; i++)
			applyBindingChanges([{ id: 'ui.help', slot: 0, binding: { code: i % 2 ? 'KeyH' : 'KeyY' } }]);
		expect(listener).toHaveBeenCalledTimes(UNDO_LIMIT + 5);
		let undone = 0;
		while (undoKeyBindings()) undone++;
		expect(undone).toBe(UNDO_LIMIT);
		expect(canUndoKeyBindings()).toBe(false);
	});

	it('resets one action or the whole profile', () => {
		applyBindingChanges([
			{ id: 'ui.help', slot: 0, binding: { code: 'KeyY' } },
			{ id: 'ui.screenshot', slot: 0, binding: { code: 'KeyZ' } }
		]);
		resetActions(['ui.help']);
		expect(Object.keys(getActiveProfile()!.overrides)).toEqual(['ui.screenshot']);
		resetActiveProfile();
		expect(getActiveProfile()!.overrides).toEqual({});
	});

	it('survives storage that refuses to save', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => null,
			setItem: () => {
				throw new Error('QuotaExceededError');
			}
		});
		resetKeyBindingsForTests();
		applyBindingChanges([{ id: 'ui.help', slot: 0, binding: { code: 'KeyY' } }]);
		expect(getBindings('ui.help')[0]).toEqual({ code: 'KeyY' });
	});
});

describe('profiles', () => {
	it('creates, copies, renames, switches and deletes', () => {
		const first = createProfile('Left-handed')!;
		expect(getKeyBindingsState().activeProfileId).toBe(first);
		applyBindingChanges([{ id: 'move.forward', slot: 0, binding: { code: 'KeyI' } }]);
		const copy = createProfile('Left-handed', 'active')!;
		expect(getActiveProfile()?.name).toBe('Left-handed (2)');
		expect(getBindings('move.forward')[0]).toEqual({ code: 'KeyI' });
		renameProfile(copy, '  Arrows  ');
		expect(getActiveProfile()?.name).toBe('Arrows');
		setActiveProfile(DEFAULT_PROFILE_ID);
		expect(getBindings('move.forward')[0]).toEqual({ code: 'KeyW' });
		setActiveProfile(copy);
		deleteProfile(copy);
		expect(getKeyBindingsState().activeProfileId).toBe(DEFAULT_PROFILE_ID);
		expect(getKeyBindingsState().profiles.map((p) => p.name)).toEqual(['Left-handed']);
	});

	it('stops at the profile limit', () => {
		for (let i = 0; i < MAX_PROFILES; i++) expect(createProfile(`P${i}`)).not.toBeNull();
		expect(createProfile('One too many')).toBeNull();
		setActiveProfile(DEFAULT_PROFILE_ID);
		expect(
			applyBindingChanges([{ id: 'ui.help', slot: 0, binding: { code: 'KeyY' } }]).applied
		).toBe(false);
	});

	it('makes names unique, ignoring case, and never "Default"', () => {
		const profiles = [{ id: 'a', name: 'Mine' }];
		expect(uniqueProfileName('mine', profiles)).toBe('mine (2)');
		expect(uniqueProfileName('Default', [])).toBe('Default (2)');
		expect(uniqueProfileName('Mine', profiles, 'a')).toBe('Mine');
	});
});

describe('controls files', () => {
	it('round-trips a profile through a downloaded file', () => {
		createProfile('Left-handed');
		applyBindingChanges([
			{ id: 'move.forward', slot: 0, binding: { code: 'KeyI' } },
			{ id: 'tool.rotate', slot: 0, binding: { code: 'KeyR', shift: true } }
		]);
		const text = exportProfilesFile([getActiveProfile()!], new Date('2026-11-10T14:03:00Z'));
		expect(JSON.parse(text)).toMatchObject({
			format: 'forest-drift.keybindings',
			version: 1,
			exportedAt: '2026-11-10T14:03:00.000Z'
		});
		const loaded = parseProfilesFile(text);
		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		expect(loaded.profiles[0]).toMatchObject({
			name: 'Left-handed',
			changed: 2,
			skipped: 0,
			conflicts: 0
		});

		resetKeyBindingsForTests();
		stored = {};
		const [id] = addProfiles(loaded.profiles, true);
		expect(getKeyBindingsState().activeProfileId).toBe(id);
		expect(getBindings('move.forward')[0]).toEqual({ code: 'KeyI' });
		expect(getBindings('tool.rotate')[0]).toEqual({ code: 'KeyR', shift: true });
	});

	it('names the file after the profile and date', () => {
		expect(profilesFileName('Left handed!', new Date('2026-11-10T00:00:00Z'))).toBe(
			'forest-drift-controls-left-handed-2026-11-10.json'
		);
		expect(profilesFileName('???', new Date('2026-11-10T00:00:00Z'))).toBe(
			'forest-drift-controls-controls-2026-11-10.json'
		);
	});

	it('rejects files that are not controls files', () => {
		for (const text of ['', 'not json', '[]', '{"format":"other","version":1,"profiles":[]}'])
			expect(parseProfilesFile(text)).toEqual({
				ok: false,
				error: 'This isn’t a Forest Drift controls file.'
			});
		expect(
			parseProfilesFile('{"format":"forest-drift.keybindings","version":1,"profiles":[]}')
		).toEqual({ ok: false, error: 'This file has no controls profiles in it.' });
		expect(parseProfilesFile(' '.repeat(MAX_KEY_BINDINGS_FILE_BYTES + 1)).ok).toBe(false);
	});

	it('skips unknown actions, bad keys and refused keys, and counts conflicts', () => {
		const loaded = parseProfilesFile(
			JSON.stringify({
				format: 'forest-drift.keybindings',
				version: 3,
				profiles: [
					{
						name: 'From the future',
						overrides: {
							'move.jump': [{ code: 'KeyE' }, null],
							'a.newer.action': [{ code: 'KeyP' }, null],
							'move.back': [{ code: 'Nope' }, null],
							'ui.help': [{ code: 'KeyW', mod: true }, null]
						}
					}
				]
			})
		);
		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		expect(loaded.newerVersion).toBe(true);
		expect(loaded.profiles[0]).toMatchObject({ changed: 1, skipped: 3 });
		expect(loaded.profiles[0].conflicts).toBeGreaterThan(0);
	});

	it('can replace an existing profile’s keys when loading', () => {
		const id = createProfile('Mine')!;
		addProfiles(
			[{ name: 'Mine', overrides: { 'ui.help': [{ code: 'KeyY' }, null] }, replaceId: id }],
			true
		);
		expect(getKeyBindingsState().profiles).toHaveLength(1);
		expect(getBindings('ui.help')[0]).toEqual({ code: 'KeyY' });
	});
});
