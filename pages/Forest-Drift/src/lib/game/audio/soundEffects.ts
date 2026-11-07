import punchHitUrl from '../../../../assets/Audio/punch-hit-sound.mp3?url';
import knockedOutUrl from '../../../../assets/Audio/knocked-out.mp3?url';
import projectileHitUrl from '../../../../assets/Audio/Projectile-Hit.mp3?url';
import swishUrl from '../../../../assets/Audio/Swish.mp3?url';
import { audioContext } from '../music/InstrumentLibrary';
import { audioOutput } from './AudioPreferences';

interface SoundEffectSpec {
	url: string;
	gain: number;
	/** Fades out and stops after this many seconds (a long tail would pile up on rapid repeats). */
	maxSeconds?: number;
}

/** How long the fade at `maxSeconds` takes, seconds. */
const FADE_SECONDS = 0.15;

/** Short one-shot sounds: decoded once, then played from memory. */
export const SOUND_EFFECTS = {
	/** A punch landing: the puncher's hit and the player who took it. */
	punchHit: { url: punchHitUrl, gain: 0.9 },
	/** Health reaching zero, from a punch or a fall. */
	knockedOut: { url: knockedOutUrl, gain: 0.9 },
	/** A seed pellet leaving the carried creature's mouth (up to three a second: tail trimmed). */
	projectileFire: { url: swishUrl, gain: 0.75, maxSeconds: 0.9 },
	/** This player's pellet hurt another player online. Only the shooter hears it. */
	projectileHit: { url: projectileHitUrl, gain: 0.9 }
} as const satisfies Record<string, SoundEffectSpec>;

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
	const { url, gain, maxSeconds }: SoundEffectSpec = SOUND_EFFECTS[name];
	void load(url).then((buffer) => {
		if (!buffer) return;
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		const level = ctx.createGain();
		level.gain.value = gain;
		source.connect(level).connect(audioOutput(ctx, 'ambience'));
		source.onended = () => level.disconnect();
		const now = ctx.currentTime;
		source.start(now);
		if (maxSeconds !== undefined && buffer.duration > maxSeconds) {
			const fadeFrom = now + Math.max(0, maxSeconds - FADE_SECONDS);
			level.gain.setValueAtTime(gain, fadeFrom);
			level.gain.linearRampToValueAtTime(0, now + maxSeconds);
			source.stop(now + maxSeconds);
		}
	});
}
