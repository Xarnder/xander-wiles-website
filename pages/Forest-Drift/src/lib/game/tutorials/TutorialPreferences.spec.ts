import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});
it('defaults existing profiles to a five-second pause and persists changes', async () => {
	let saved = JSON.stringify({ enabled: true });
	vi.stubGlobal('localStorage', {
		getItem: () => saved,
		setItem: (_key: string, value: string) => {
			saved = value;
		}
	});
	const preferences = await import('./TutorialPreferences');
	expect(preferences.getTutorialPreferences().autoPauseSeconds).toBe(5);
	preferences.setTutorialPreferences({ autoPauseSeconds: 12 });
	vi.resetModules();
	const restored = await import('./TutorialPreferences');
	expect(restored.getTutorialPreferences().autoPauseSeconds).toBe(12);
	restored.setTutorialPreferences({ autoPauseSeconds: 0 });
	expect(restored.getTutorialPreferences().autoPauseSeconds).toBe(0);
});
it('bounds and normalizes pause values', async () => {
	const { normalizeAutoPause } = await import('./TutorialPreferences');
	expect(normalizeAutoPause(-1)).toBe(0);
	expect(normalizeAutoPause(100)).toBe(30);
	expect(normalizeAutoPause(3.8)).toBe(4);
	for (const value of [undefined, NaN, Infinity, '5']) expect(normalizeAutoPause(value)).toBe(5);
});
