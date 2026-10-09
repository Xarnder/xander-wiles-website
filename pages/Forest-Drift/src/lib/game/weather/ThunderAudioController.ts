import { thunderDelaySeconds, type LightningEvent } from './LightningController';

/**
 * Thunder: each strike's sound is scheduled `distance / 343 m/s` after its flash, and its
 * character comes from distance, storm intensity and the strike seed — near strikes are loud with
 * a sharp crack, far ones quiet, low and long. At most `maxVoices` play at once; when a new one
 * would exceed that, the quietest is skipped rather than piling up.
 *
 * The sound itself is produced by a `ThunderVoiceBackend` (Web Audio in the game, a recorder in
 * tests); no audio assets exist yet, so the game backend synthesises thunder procedurally.
 */

export interface ThunderVoice {
	/** 0..1 loudness. */
	gain: number;
	/** 0..1 how much sharp crack leads the rumble (near strikes). */
	crack: number;
	/** Seconds of rumble. */
	duration: number;
	/** Low-pass cutoff (Hz): far thunder loses its highs. */
	brightness: number;
	seed: number;
	distance: number;
}

export interface ThunderVoiceHandle {
	/** When the voice will have finished (backend clock, s). */
	end: number;
	/** Fades the voice out quickly (another, louder strike needs its slot). */
	stop(): void;
}

export interface ThunderVoiceBackend {
	/** Starts a voice now. */
	play(voice: ThunderVoice): ThunderVoiceHandle;
	/** Backend clock (s). */
	now(): number;
}

/** Thunder parameters for a strike at `distance` (m) with strike `intensity` (0..1). */
export function thunderVoiceFor(distance: number, intensity: number, seed: number): ThunderVoice {
	const d = Math.max(0, distance);
	const near = 1 / (1 + Math.pow(d / 700, 1.4));
	const r = ((seed >>> 8) % 1000) / 1000;
	return {
		gain: Math.min(1, (0.25 + 0.75 * intensity) * (0.2 + 0.8 * near)),
		crack: d < 900 ? (1 - d / 900) * (0.6 + 0.4 * intensity) : 0,
		duration: 2.5 + Math.min(1, d / 2500) * 5 + r * 2,
		brightness: 180 + 1600 * near,
		seed,
		distance: d
	};
}

interface PendingThunder {
	at: number;
	voice: ThunderVoice;
}

export class ThunderAudioController {
	private readonly pending: PendingThunder[] = [];
	private readonly playing: { handle: ThunderVoiceHandle | null; end: number; gain: number }[] = [];
	private clock = 0;
	private played = 0;
	private skipped = 0;

	constructor(
		private backend: ThunderVoiceBackend | null,
		readonly maxVoices = 3
	) {}

	setBackend(backend: ThunderVoiceBackend | null): void {
		this.backend = backend;
	}

	get stats(): { pending: number; playing: number; played: number; skipped: number } {
		return {
			pending: this.pending.length,
			playing: this.playing.length,
			played: this.played,
			skipped: this.skipped
		};
	}

	/** Queues the thunder of `event`, heard after the sound has travelled `event.distance`. */
	schedule(event: LightningEvent): number {
		const delay = thunderDelaySeconds(event.distance);
		const at = this.clock + delay;
		this.pending.push({ at, voice: thunderVoiceFor(event.distance, event.intensity, event.seed) });
		// Keep the queue bounded: a storm cannot build an unbounded backlog of rumbles.
		if (this.pending.length > 12) {
			this.pending.sort((a, b) => b.voice.gain - a.voice.gain);
			this.skipped += this.pending.length - 12;
			this.pending.length = 12;
		}
		return delay;
	}

	update(deltaSeconds: number): void {
		this.clock += Math.max(0, deltaSeconds);
		const now = this.backend?.now() ?? this.clock;
		for (let i = this.playing.length - 1; i >= 0; i--) {
			if (this.playing[i].end <= now) this.playing.splice(i, 1);
		}
		for (let i = this.pending.length - 1; i >= 0; i--) {
			const item = this.pending[i];
			if (item.at > this.clock) continue;
			this.pending.splice(i, 1);
			this.start(item.voice, now);
		}
	}

	clear(): void {
		this.pending.length = 0;
	}

	private start(voice: ThunderVoice, now: number): void {
		if (this.playing.length >= this.maxVoices) {
			// Make room only for something louder than the quietest voice still sounding.
			let quietest = 0;
			for (let i = 1; i < this.playing.length; i++) {
				if (this.playing[i].gain < this.playing[quietest].gain) quietest = i;
			}
			if (this.playing[quietest].gain >= voice.gain) {
				this.skipped++;
				return;
			}
			this.playing[quietest].handle?.stop();
			this.playing.splice(quietest, 1);
			this.skipped++;
		}
		const handle = this.backend ? this.backend.play(voice) : null;
		this.playing.push({ handle, end: handle ? handle.end : now + voice.duration, gain: voice.gain });
		this.played++;
	}
}
