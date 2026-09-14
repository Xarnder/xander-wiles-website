import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniBuildPreferences } from '../MiniBuildPreferences';

function stubStorage(): Map<string, string> {
	const store = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => store.set(key, value),
		removeItem: (key: string) => store.delete(key)
	});
	return store;
}

describe('MiniBuildPreferences display', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('shows the chunk counter and hides boundaries by default', () => {
		stubStorage();
		expect(new MiniBuildPreferences().display).toEqual({
			showChunkUsage: true,
			showChunkBoundaries: false
		});
	});

	it('persists display toggles across sessions', () => {
		stubStorage();
		const first = new MiniBuildPreferences();
		first.display.showChunkBoundaries = true;
		first.display.showChunkUsage = false;
		first.saveDisplay();
		expect(new MiniBuildPreferences().display).toEqual({
			showChunkUsage: false,
			showChunkBoundaries: true
		});
	});

	it('falls back to defaults for malformed stored display data', () => {
		const store = stubStorage();
		store.set(
			'forest-drift.mini-builds.prefs.v1',
			JSON.stringify({ display: { showChunkUsage: 'yes' } })
		);
		expect(new MiniBuildPreferences().display).toEqual({
			showChunkUsage: true,
			showChunkBoundaries: false
		});
	});
});
