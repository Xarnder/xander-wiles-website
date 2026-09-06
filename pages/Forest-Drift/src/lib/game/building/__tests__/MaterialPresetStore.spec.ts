import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialPresetStore } from '../MaterialPresetStore';

/** Minimal in-memory `Storage` stand-in — this suite runs in vitest's `node` environment, which has no real `localStorage` global at all. */
class FakeStorage {
	private readonly data = new Map<string, string>();

	getItem(key: string): string | null {
		return this.data.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.data.set(key, value);
	}

	removeItem(key: string): void {
		this.data.delete(key);
	}

	clear(): void {
		this.data.clear();
	}
}

let fakeStorage: FakeStorage;

beforeEach(() => {
	fakeStorage = new FakeStorage();
	vi.stubGlobal('localStorage', fakeStorage);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('MaterialPresetStore — saved colours', () => {
	it('starts with no saved presets', () => {
		const store = new MaterialPresetStore();
		expect(store.getSavedPresets()).toEqual([]);
	});

	it('saves a colour and returns it in getSavedPresets', () => {
		const store = new MaterialPresetStore();
		const preset = store.savePreset({ type: 'color', color: '#D9D1C3' });
		expect(store.getSavedPresets()).toEqual([preset]);
		expect(preset.definition).toEqual({ type: 'color', color: '#D9D1C3' });
	});

	it('normalizes the colour before saving', () => {
		const store = new MaterialPresetStore();
		const preset = store.savePreset({ type: 'color', color: '#d9d1c3' });
		expect(preset.definition.color).toBe('#D9D1C3');
	});

	it('saving the same colour twice does not create a duplicate preset', () => {
		const store = new MaterialPresetStore();
		const first = store.savePreset({ type: 'color', color: '#D9D1C3' });
		const second = store.savePreset({ type: 'color', color: '#d9d1c3' }); // same colour, different case
		expect(second.id).toBe(first.id);
		expect(store.getSavedPresets()).toHaveLength(1);
	});

	it('removes a saved preset by id', () => {
		const store = new MaterialPresetStore();
		const preset = store.savePreset({ type: 'color', color: '#D9D1C3' });
		expect(store.removePreset(preset.id)).toBe(true);
		expect(store.getSavedPresets()).toEqual([]);
	});

	it('removePreset returns false for an unknown id', () => {
		const store = new MaterialPresetStore();
		expect(store.removePreset('missing')).toBe(false);
	});

	it('persists saved presets across a new MaterialPresetStore instance (simulating a page reload)', () => {
		const store = new MaterialPresetStore();
		store.savePreset({ type: 'color', color: '#D9D1C3' });

		const reloaded = new MaterialPresetStore();
		expect(reloaded.getSavedPresets()).toHaveLength(1);
		expect(reloaded.getSavedPresets()[0].definition.color).toBe('#D9D1C3');
	});

	it('a removed preset stays removed across a reload', () => {
		const store = new MaterialPresetStore();
		const preset = store.savePreset({ type: 'color', color: '#D9D1C3' });
		store.removePreset(preset.id);

		const reloaded = new MaterialPresetStore();
		expect(reloaded.getSavedPresets()).toEqual([]);
	});
});

describe('MaterialPresetStore — last selected colour', () => {
	it('starts with no last-selected colour', () => {
		const store = new MaterialPresetStore();
		expect(store.getLastSelected()).toBeNull();
	});

	it('remembers the last selected colour', () => {
		const store = new MaterialPresetStore();
		store.setLastSelected({ type: 'color', color: '#3E6FA6' });
		expect(store.getLastSelected()).toEqual({ type: 'color', color: '#3E6FA6' });
	});

	it('remembers "Default" (null) as a real, persisted choice', () => {
		const store = new MaterialPresetStore();
		store.setLastSelected({ type: 'color', color: '#3E6FA6' });
		store.setLastSelected(null);
		expect(store.getLastSelected()).toBeNull();
	});

	it('persists the last selected colour across a new instance', () => {
		const store = new MaterialPresetStore();
		store.setLastSelected({ type: 'color', color: '#3E6FA6' });

		const reloaded = new MaterialPresetStore();
		expect(reloaded.getLastSelected()).toEqual({ type: 'color', color: '#3E6FA6' });
	});
});

describe('MaterialPresetStore — resilience', () => {
	it('degrades to an empty, in-memory-only store when localStorage holds corrupted JSON', () => {
		fakeStorage.setItem('forest-drift.paint.v1', '{not valid json');
		const store = new MaterialPresetStore();
		expect(store.getSavedPresets()).toEqual([]);
		expect(store.getLastSelected()).toBeNull();
	});

	it('filters out malformed entries in an otherwise-valid saved-presets array', () => {
		fakeStorage.setItem(
			'forest-drift.paint.v1',
			JSON.stringify({
				savedPresets: [
					{ id: 'ok', name: 'Ok', definition: { type: 'color', color: '#D9D1C3' } },
					{ id: 'bad' }, // missing name/definition
					'not-an-object'
				],
				lastSelected: null
			})
		);
		const store = new MaterialPresetStore();
		expect(store.getSavedPresets()).toEqual([
			{ id: 'ok', name: 'Ok', definition: { type: 'color', color: '#D9D1C3' } }
		]);
	});

	it('still works (in-memory only) when localStorage is unavailable', () => {
		vi.stubGlobal('localStorage', undefined);
		const store = new MaterialPresetStore();
		expect(() => store.savePreset({ type: 'color', color: '#D9D1C3' })).not.toThrow();
		expect(store.getSavedPresets()).toHaveLength(1);
	});
});
