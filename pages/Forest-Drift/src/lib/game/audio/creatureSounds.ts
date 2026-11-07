import { audioContext } from '../music/InstrumentLibrary';
import { audioOutput } from './AudioPreferences';

/**
 * Small synthesised cues for carrying a creature and firing seed pellets (ranged weapons Q24 C), and
 * for climbing on and off a ridden one. No assets to download; they follow the player's ambience
 * volume. Player hits reuse the punch sound (`soundEffects.ts`).
 */
export type CreatureSound =
	'fire' | 'dryFire' | 'impact' | 'pickUp' | 'putDown' | 'mount' | 'dismount' | 'rideBlocked';

function context(): AudioContext | null {
	try {
		const ctx = audioContext();
		// Every cue follows a key press, click or tap, so the context can resume.
		if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
		return ctx;
	} catch {
		return null;
	}
}

function noise(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
	const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	return source;
}

/** A soft "pff": band-passed noise with a fast decay. */
function puff(ctx: AudioContext, frequency: number, peak: number, seconds: number): void {
	const now = ctx.currentTime;
	const source = noise(ctx, seconds);
	const filter = ctx.createBiquadFilter();
	filter.type = 'bandpass';
	filter.frequency.setValueAtTime(frequency, now);
	filter.frequency.exponentialRampToValueAtTime(frequency * 0.45, now + seconds);
	filter.Q.value = 1.4;
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(peak, now);
	gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
	source.connect(filter).connect(gain).connect(audioOutput(ctx, 'ambience'));
	source.onended = () => gain.disconnect();
	source.start(now);
	source.stop(now + seconds);
}

/** A short pitched chirp (pick up rises, put down falls). */
function chirp(ctx: AudioContext, from: number, to: number, peak: number, seconds: number): void {
	const now = ctx.currentTime;
	const osc = ctx.createOscillator();
	osc.type = 'triangle';
	osc.frequency.setValueAtTime(from, now);
	osc.frequency.exponentialRampToValueAtTime(to, now + seconds);
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.0001, now);
	gain.gain.exponentialRampToValueAtTime(peak, now + 0.015);
	gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
	osc.connect(gain).connect(audioOutput(ctx, 'ambience'));
	osc.onended = () => gain.disconnect();
	osc.start(now);
	osc.stop(now + seconds);
}

export function playCreatureSound(sound: CreatureSound): void {
	const ctx = context();
	if (!ctx) return;
	switch (sound) {
		case 'fire':
			puff(ctx, 1800, 0.35, 0.12);
			break;
		case 'dryFire':
			chirp(ctx, 520, 380, 0.08, 0.08);
			break;
		case 'impact':
			puff(ctx, 900, 0.18, 0.18);
			break;
		case 'pickUp':
			chirp(ctx, 620, 980, 0.12, 0.14);
			break;
		case 'putDown':
			chirp(ctx, 900, 560, 0.1, 0.14);
			break;
		case 'mount':
			// A rustle of fur, then settling onto the shoulders.
			puff(ctx, 1200, 0.16, 0.22);
			thump(ctx, 140, 0.22, 0.18);
			break;
		case 'dismount':
			puff(ctx, 1000, 0.12, 0.18);
			thump(ctx, 110, 0.25, 0.16);
			break;
		case 'rideBlocked':
			chirp(ctx, 300, 240, 0.07, 0.12);
			break;
	}
}

/** A soft low thump: a sine dropping in pitch. */
function thump(ctx: AudioContext, frequency: number, peak: number, seconds: number): void {
	const now = ctx.currentTime;
	const osc = ctx.createOscillator();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(frequency, now);
	osc.frequency.exponentialRampToValueAtTime(frequency * 0.5, now + seconds);
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.0001, now);
	gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
	osc.connect(gain).connect(audioOutput(ctx, 'ambience'));
	osc.onended = () => gain.disconnect();
	osc.start(now);
	osc.stop(now + seconds);
}
