import punchHitUrl from '../../../../assets/Audio/punch-hit-sound.mp3?url';
import knockedOutUrl from '../../../../assets/Audio/knocked-out.mp3?url';
import { audioContext } from '../music/InstrumentLibrary';
import { audioOutput } from './AudioPreferences';

/** Short one-shot sounds (well under a second each): decoded once, then played from memory. */
export const SOUND_EFFECTS = {
	/** A punch landing: the puncher's hit and the player who took it. */
	punchHit: { url: punchHitUrl, gain: 0.9 },
	/** Health reaching zero, from a punch or a fall. */
	knockedOut: { url: knockedOutUrl, gain: 0.9 }
} as const;

export type SoundEffect = keyof typeof SOUND_EFFECTS;

const decoded = new Map<string, Promise<AudioBuffer | null>>();

function context(): AudioContext | null {
	try {
		return audioContext();
	} catch {
		return null;
	}
}

function load(url: string): Promise<AudioBuffer | null> {
	let pending = decoded.get(url);
	if (!pending) {
		const ctx = context();
		pending = ctx
			? fetch(url)
					.then((response) =>
						response.ok ? response.arrayBuffer() : Promise.reject(response.status)
					)
					.then((data) => ctx.decodeAudioData(data))
					.catch(() => {
						decoded.delete(url);
						return null;
					})
			: Promise.resolve(null);
		decoded.set(url, pending);
	}
	return pending;
}

/** Fetches and decodes every effect ahead of time, so the first punch isn't silent or late. */
export function preloadSoundEffects(): void {
	for (const effect of Object.values(SOUND_EFFECTS)) void load(effect.url);
}

/** Plays an effect through the ambience channel (it follows the player's volume settings). */
export function playSoundEffect(name: SoundEffect): void {
	const ctx = context();
	if (!ctx) return;
	// Effects always follow a key press, click or tap, so the context can resume.
	if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
	const { url, gain } = SOUND_EFFECTS[name];
	void load(url).then((buffer) => {
		if (!buffer) return;
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		const level = ctx.createGain();
		level.gain.value = gain;
		source.connect(level).connect(audioOutput(ctx, 'ambience'));
		source.onended = () => level.disconnect();
		source.start();
	});
}
