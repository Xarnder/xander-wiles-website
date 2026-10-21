import { afterEach, beforeEach, expect, it, vi } from 'vitest';
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
	vi.resetModules();
	vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
});
it('restores preferences, clamps values, and persists changes', async () => {
	vi.mocked(localStorage.getItem).mockReturnValue(
		'{"master":2,"music":-1,"ambience":0.4,"muted":true}'
	);
	const audio = await import('./AudioPreferences');
	expect(audio.getAudioPreferences()).toEqual({ master: 1, music: 0, ambience: 0.4, muted: true });
	audio.setAudioPreferences({ muted: false, master: 0.5 });
	expect(audio.audioLevel('ambience')).toBe(0.2);
	expect(localStorage.setItem).toHaveBeenCalled();
});
it('updates both live output buses and restores their levels after unmuting', async () => {
	const audio = await import('./AudioPreferences');
	const context = {
		state: 'running',
		currentTime: 12,
		destination: {},
		createGain: () => ({ gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn() })
	};
	const music = audio.audioOutput(context as unknown as AudioContext, 'music');
	const weather = audio.audioOutput(context as unknown as AudioContext, 'ambience');
	expect(audio.audioOutput(context as unknown as AudioContext, 'music')).toBe(music);
	audio.setAudioPreferences({ master: 0.5, music: 0.8, ambience: 0.2 });
	expect(music.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.4, 12, 0.03);
	expect(weather.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.1, 12, 0.03);
	audio.setAudioPreferences({ muted: true });
	expect(music.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 12, 0.03);
	expect(weather.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 12, 0.03);
	audio.setAudioPreferences({ muted: false });
	expect(weather.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.1, 12, 0.03);
});
it('continues working when storage is unavailable', async () => {
	vi.mocked(localStorage.getItem).mockImplementation(() => {
		throw new Error('blocked');
	});
	vi.mocked(localStorage.setItem).mockImplementation(() => {
		throw new Error('blocked');
	});
	const audio = await import('./AudioPreferences');
	audio.setAudioPreferences({ master: 0.25 });
	expect(audio.audioLevel('music')).toBe(0.25);
});
