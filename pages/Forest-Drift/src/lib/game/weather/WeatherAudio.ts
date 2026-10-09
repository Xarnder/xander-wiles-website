import { audioContext } from '../music/InstrumentLibrary';
import type {
	ThunderVoice,
	ThunderVoiceBackend,
	ThunderVoiceHandle
} from './ThunderAudioController';

/**
 * Weather sound, synthesised with Web Audio — no audio files exist yet. Hooks:
 *   rain ambience  looped noise, high-passed; level follows rainfall; muffled under a roof
 *   wind ambience  looped brown noise, low-passed, with slow gusts; level follows wind strength
 *   thunder        a `ThunderVoiceBackend` for ThunderAudioController: a crack for near strikes
 *                  and a filtered, wobbling rumble whose length and brightness follow distance
 *
 * Shares the game's one AudioContext (music uses it too) and does nothing until the player has
 * interacted with the page (browsers block audio before that) or when Web Audio is unavailable.
 * Levels glide (`setTargetAtTime`), so weather changes never click.
 */
export class WeatherAudio implements ThunderVoiceBackend {
	private context: AudioContext | null = null;
	private master: GainNode | null = null;
	private rainGain: GainNode | null = null;
	private rainMuffle: BiquadFilterNode | null = null;
	private windGain: GainNode | null = null;
	private thunderBus: GainNode | null = null;
	private whiteNoise: AudioBuffer | null = null;
	private brownNoise: AudioBuffer | null = null;
	private gustPhase = Math.random() * 100;
	private disposed = false;

	/** Whether the audio graph exists (after the first user interaction with weather playing). */
	get ready(): boolean {
		return this.context !== null;
	}

	now(): number {
		return this.context?.currentTime ?? 0;
	}

	/**
	 * Per frame: rain 0..1, wind m/s, `sheltered` muffles the rain, `volume` 0..1. Cheap — a few
	 * parameter glides, nothing allocated.
	 */
	update(deltaSeconds: number, rain: number, wind: number, sheltered: boolean, volume: number): void {
		if (this.disposed) return;
		const wanted = rain > 0.01 || wind > 5;
		if (!this.context) {
			if (!wanted || !this.canStart()) return;
			this.build();
			if (!this.context) return;
		}
		const context = this.context;
		if (context.state === 'suspended' && this.canStart()) void context.resume();
		const t = context.currentTime;
		this.gustPhase += deltaSeconds;
		const gust =
			0.75 +
			0.25 * Math.sin(this.gustPhase * 0.37) * Math.sin(this.gustPhase * 0.11 + 1.3) +
			0.12 * Math.sin(this.gustPhase * 1.7);
		const windLevel = smoothstep(2, 16, wind) * gust;
		this.master!.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), t, 0.2);
		this.rainGain!.gain.setTargetAtTime(Math.pow(Math.max(0, rain), 0.8) * 0.32, t, 0.6);
		this.rainMuffle!.frequency.setTargetAtTime(sheltered ? 900 : 9000, t, 0.35);
		this.windGain!.gain.setTargetAtTime(windLevel * 0.28, t, 0.8);
	}

	play(voice: ThunderVoice): ThunderVoiceHandle {
		const context = this.context;
		if (!context || !this.thunderBus || !this.brownNoise || !this.whiteNoise) {
			return { end: this.now() + voice.duration, stop: () => {} };
		}
		const t = context.currentTime + 0.01;
		const random = seeded(voice.seed);
		const output = context.createGain();
		output.gain.value = 1;
		output.connect(this.thunderBus);
		const sources: AudioBufferSourceNode[] = [];

		// Rumble: brown noise, low-passed by distance, with a lumpy, rolling envelope.
		const rumble = context.createBufferSource();
		rumble.buffer = this.brownNoise;
		rumble.loop = true;
		const lowpass = context.createBiquadFilter();
		lowpass.type = 'lowpass';
		lowpass.frequency.value = voice.brightness;
		lowpass.Q.value = 0.4;
		const rumbleGain = context.createGain();
		rumbleGain.gain.setValueAtTime(0, t);
		rumbleGain.gain.linearRampToValueAtTime(voice.gain * 0.9, t + 0.08 + (1 - voice.crack) * 0.35);
		let at = t + 0.4;
		while (at < t + voice.duration * 0.85) {
			const fade = 1 - (at - t) / voice.duration;
			rumbleGain.gain.linearRampToValueAtTime(voice.gain * fade * (0.35 + 0.65 * random()), at);
			at += 0.12 + random() * 0.45;
		}
		rumbleGain.gain.linearRampToValueAtTime(0, t + voice.duration);
		rumble.connect(lowpass).connect(rumbleGain).connect(output);
		rumble.start(t, random() * 3);
		rumble.stop(t + voice.duration + 0.05);
		sources.push(rumble);

		// Crack: a short bright burst for near strikes.
		if (voice.crack > 0.05) {
			const crack = context.createBufferSource();
			crack.buffer = this.whiteNoise;
			const highpass = context.createBiquadFilter();
			highpass.type = 'highpass';
			highpass.frequency.value = 900;
			const crackGain = context.createGain();
			crackGain.gain.setValueAtTime(0, t);
			crackGain.gain.linearRampToValueAtTime(voice.crack * voice.gain * 0.8, t + 0.006);
			crackGain.gain.exponentialRampToValueAtTime(0.0005, t + 0.35);
			crack.connect(highpass).connect(crackGain).connect(output);
			crack.start(t, random() * 2);
			crack.stop(t + 0.4);
			sources.push(crack);
		}

		const end = t + voice.duration + 0.1;
		const cleanup = () => output.disconnect();
		rumble.onended = cleanup;
		return {
			end,
			stop: () => {
				const now = context.currentTime;
				output.gain.cancelScheduledValues(now);
				output.gain.setTargetAtTime(0, now, 0.08);
				for (const source of sources) {
					try {
						source.stop(now + 0.5);
					} catch {
						// already stopped
					}
				}
			}
		};
	}

	dispose(): void {
		this.disposed = true;
		this.master?.disconnect();
		this.context = null;
	}

	private canStart(): boolean {
		if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return false;
		const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
			.userActivation;
		return activation ? activation.hasBeenActive : true;
	}

	private build(): void {
		let context: AudioContext;
		try {
			context = audioContext();
		} catch {
			return;
		}
		this.context = context;
		this.whiteNoise = noiseBuffer(context, 4, false);
		this.brownNoise = noiseBuffer(context, 6, true);

		this.master = context.createGain();
		this.master.gain.value = 0;
		this.master.connect(context.destination);

		// Rain: white noise, high-passed (patter, not hiss), then a low-pass that drops when sheltered.
		const rain = context.createBufferSource();
		rain.buffer = this.whiteNoise;
		rain.loop = true;
		const rainHigh = context.createBiquadFilter();
		rainHigh.type = 'highpass';
		rainHigh.frequency.value = 700;
		this.rainMuffle = context.createBiquadFilter();
		this.rainMuffle.type = 'lowpass';
		this.rainMuffle.frequency.value = 9000;
		this.rainGain = context.createGain();
		this.rainGain.gain.value = 0;
		rain.connect(rainHigh).connect(this.rainMuffle).connect(this.rainGain).connect(this.master);
		rain.start();

		// Wind: brown noise, low-passed.
		const wind = context.createBufferSource();
		wind.buffer = this.brownNoise;
		wind.loop = true;
		const windLow = context.createBiquadFilter();
		windLow.type = 'lowpass';
		windLow.frequency.value = 480;
		this.windGain = context.createGain();
		this.windGain.gain.value = 0;
		wind.connect(windLow).connect(this.windGain).connect(this.master);
		wind.start();

		this.thunderBus = context.createGain();
		this.thunderBus.gain.value = 0.9;
		this.thunderBus.connect(this.master);
	}
}

function noiseBuffer(context: AudioContext, seconds: number, brown: boolean): AudioBuffer {
	const length = Math.floor(context.sampleRate * seconds);
	const buffer = context.createBuffer(1, length, context.sampleRate);
	const data = buffer.getChannelData(0);
	const random = seeded(brown ? 0xb10f : 0x5eed);
	let last = 0;
	for (let i = 0; i < length; i++) {
		const white = random() * 2 - 1;
		if (brown) {
			last = (last + 0.02 * white) / 1.02;
			data[i] = last * 3.5;
		} else {
			data[i] = white * 0.6;
		}
	}
	return buffer;
}

function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}
