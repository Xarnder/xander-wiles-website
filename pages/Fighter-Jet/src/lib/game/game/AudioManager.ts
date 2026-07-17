import type { GameSettings } from '../types';
import { AUDIO_PATHS, type AudioSampleKey } from '../config/assetPaths';
import { clamp, damp } from '../utils/math';

type AudioBus = 'music' | 'effects' | 'engine' | 'radio';

export class AudioManager {
	private context: AudioContext | null = null;
	private master: GainNode | null = null;
	private musicBus: GainNode | null = null;
	private effectsBus: GainNode | null = null;
	private engineBus: GainNode | null = null;
	private radioBus: GainNode | null = null;
	private engineOscillator: OscillatorNode | null = null;
	private engineGain: GainNode | null = null;
	private windSource: AudioBufferSourceNode | null = null;
	private windGain: GainNode | null = null;
	private currentEngine = 0;
	private currentWind = 0;
	private settings: Readonly<GameSettings>;
	private readonly sampleBuffers = new Map<AudioSampleKey, AudioBuffer>();
	private samplesLoaded = false;
	private engineLoopSource: AudioBufferSourceNode | null = null;

	constructor(settings: Readonly<GameSettings>) {
		this.settings = settings;
	}

	async startAfterGesture(): Promise<boolean> {
		if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return false;
		if (!this.context) this.createGraph();
		if (!this.context) return false;
		try {
			await this.context.resume();
			await this.loadSamples();
			this.startAmbience();
			return true;
		} catch {
			return false;
		}
	}

	updateSettings(settings: Readonly<GameSettings>): void {
		this.settings = settings;
		const now = this.context?.currentTime ?? 0;
		this.master?.gain.setTargetAtTime(settings.masterVolume, now, 0.03);
		this.musicBus?.gain.setTargetAtTime(settings.musicVolume, now, 0.03);
		this.effectsBus?.gain.setTargetAtTime(settings.effectsVolume, now, 0.03);
		this.engineBus?.gain.setTargetAtTime(settings.engineVolume, now, 0.03);
		this.radioBus?.gain.setTargetAtTime(settings.radioVolume, now, 0.03);
	}

	updateEngine(speedRatio: number, afterburner: number, delta: number): void {
		if (!this.context || !this.engineGain || !this.windGain) return;
		this.currentEngine = damp(
			this.currentEngine,
			clamp(speedRatio + afterburner * 0.35, 0, 1.35),
			5,
			delta
		);
		this.currentWind = damp(this.currentWind, clamp(speedRatio * 0.75, 0, 1), 3, delta);
		const now = this.context.currentTime;
		if (this.engineOscillator) {
			this.engineOscillator.frequency.setTargetAtTime(58 + this.currentEngine * 94, now, 0.025);
		}
		this.engineGain.gain.setTargetAtTime(0.055 + this.currentEngine * 0.1, now, 0.04);
		this.windGain.gain.setTargetAtTime(this.currentWind * 0.045, now, 0.05);
	}

	playLaunch(): void {
		if (!this.playSample('missileLaunch', 'effects', 0.9)) {
			this.playSweep(120, 46, 0.32, 0.2, 'effects', 'sawtooth');
			this.playNoise(0.22, 0.16, 'effects');
		}
	}

	playExplosion(intensity = 1): void {
		if (!this.playSample('explosion', 'effects', clamp(0.55 * intensity, 0.2, 1))) {
			this.playNoise(0.65, clamp(0.28 * intensity, 0, 0.5), 'effects');
			this.playSweep(72, 28, 0.7, clamp(0.2 * intensity, 0, 0.45), 'effects', 'sine');
		}
	}

	playLockTone(locked: boolean): void {
		if (locked) {
			if (!this.playSample('lockConfirmed', 'effects', 0.85)) {
				this.playTone(980, 0.16, 0.13, 'effects');
				this.playTone(1320, 0.18, 0.1, 'effects', 0.12);
			}
		} else if (!this.playSample('lockTone', 'effects', 0.7)) {
			this.playTone(720, 0.055, 0.055, 'effects');
		}
	}

	playWarning(): void {
		if (!this.playSample('warning', 'effects', 0.85)) {
			this.playTone(430, 0.16, 0.12, 'effects');
			this.playTone(430, 0.16, 0.12, 'effects', 0.24);
		}
	}

	playRadioCue(): void {
		if (!this.playSample('radioStatic', 'radio', 0.75)) {
			this.playNoise(0.08, 0.035, 'radio');
			this.playTone(1060, 0.06, 0.035, 'radio');
		}
	}

	playUi(confirm = true): void {
		if (!this.playSample('uiClick', 'effects', confirm ? 0.65 : 0.45)) {
			this.playTone(confirm ? 880 : 330, 0.045, 0.035, 'effects');
		}
	}

	playSuccess(): void {
		if (!this.playSample('missionSuccess', 'music', 0.95)) {
			for (let index = 0; index < 4; index += 1) {
				this.playTone(523.25 * Math.pow(1.26, index), 0.28, 0.09, 'music', index * 0.13);
			}
		}
	}

	playFailure(): void {
		if (!this.playSample('missionFailure', 'music', 0.9)) {
			this.playSweep(260, 88, 0.85, 0.12, 'music', 'triangle');
		}
	}

	dispose(): void {
		this.engineLoopSource?.stop();
		this.engineOscillator?.stop();
		this.windSource?.stop();
		this.context?.close().catch(() => undefined);
		this.context = null;
		this.engineOscillator = null;
		this.engineLoopSource = null;
		this.windSource = null;
	}

	private async loadSamples(): Promise<void> {
		if (!this.context || this.samplesLoaded) return;
		this.samplesLoaded = true;
		const entries = Object.entries(AUDIO_PATHS) as [AudioSampleKey, string][];
		await Promise.all(
			entries.map(async ([key, url]) => {
				try {
					const response = await fetch(url);
					if (!response.ok) return;
					const data = await response.arrayBuffer();
					const buffer = await this.context!.decodeAudioData(data);
					this.sampleBuffers.set(key, buffer);
				} catch {
					// Keep procedural fallback for this cue.
				}
			})
		);
	}

	private playSample(key: AudioSampleKey, bus: AudioBus, gain: number): boolean {
		const buffer = this.sampleBuffers.get(key);
		if (!buffer || !this.context) return false;
		const destination = this.bus(bus);
		if (!destination) return false;
		const source = this.context.createBufferSource();
		const envelope = this.context.createGain();
		source.buffer = buffer;
		envelope.gain.value = gain;
		source.connect(envelope).connect(destination);
		source.start();
		return true;
	}

	private createGraph(): void {
		this.context = new AudioContext();
		this.master = this.context.createGain();
		this.musicBus = this.context.createGain();
		this.effectsBus = this.context.createGain();
		this.engineBus = this.context.createGain();
		this.radioBus = this.context.createGain();
		this.musicBus.connect(this.master);
		this.effectsBus.connect(this.master);
		this.engineBus.connect(this.master);
		this.radioBus.connect(this.master);
		this.master.connect(this.context.destination);
		this.updateSettings(this.settings);
	}

	private startAmbience(): void {
		if (!this.context || !this.engineBus || this.engineGain) return;

		const engineLoop = this.sampleBuffers.get('engineLoop');
		if (engineLoop) {
			this.engineLoopSource = this.context.createBufferSource();
			this.engineLoopSource.buffer = engineLoop;
			this.engineLoopSource.loop = true;
			this.engineGain = this.context.createGain();
			this.engineGain.gain.value = 0.12;
			this.engineLoopSource.connect(this.engineGain).connect(this.engineBus);
			this.engineLoopSource.start();
		} else {
			this.engineOscillator = this.context.createOscillator();
			this.engineOscillator.type = 'sawtooth';
			this.engineGain = this.context.createGain();
			this.engineGain.gain.value = 0;
			const filter = this.context.createBiquadFilter();
			filter.type = 'lowpass';
			filter.frequency.value = 480;
			this.engineOscillator.connect(filter).connect(this.engineGain).connect(this.engineBus);
			this.engineOscillator.start();
		}

		this.windSource = this.context.createBufferSource();
		this.windSource.buffer = this.createNoiseBuffer(2);
		this.windSource.loop = true;
		const windFilter = this.context.createBiquadFilter();
		windFilter.type = 'bandpass';
		windFilter.frequency.value = 900;
		windFilter.Q.value = 0.6;
		this.windGain = this.context.createGain();
		this.windGain.gain.value = 0;
		this.windSource.connect(windFilter).connect(this.windGain).connect(this.engineBus);
		this.windSource.start();
	}

	private bus(bus: AudioBus): GainNode | null {
		if (bus === 'music') return this.musicBus;
		if (bus === 'engine') return this.engineBus;
		if (bus === 'radio') return this.radioBus;
		return this.effectsBus;
	}

	private playTone(
		frequency: number,
		duration: number,
		gain: number,
		bus: AudioBus,
		delay = 0
	): void {
		if (!this.context) return;
		const destination = this.bus(bus);
		if (!destination) return;
		const oscillator = this.context.createOscillator();
		const envelope = this.context.createGain();
		const start = this.context.currentTime + delay;
		oscillator.frequency.value = frequency;
		oscillator.type = 'sine';
		envelope.gain.setValueAtTime(0.0001, start);
		envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
		envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		oscillator.connect(envelope).connect(destination);
		oscillator.start(start);
		oscillator.stop(start + duration + 0.02);
	}

	private playSweep(
		from: number,
		to: number,
		duration: number,
		gain: number,
		bus: AudioBus,
		type: OscillatorType
	): void {
		if (!this.context) return;
		const destination = this.bus(bus);
		if (!destination) return;
		const oscillator = this.context.createOscillator();
		const envelope = this.context.createGain();
		const now = this.context.currentTime;
		oscillator.type = type;
		oscillator.frequency.setValueAtTime(from, now);
		oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
		envelope.gain.setValueAtTime(gain, now);
		envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
		oscillator.connect(envelope).connect(destination);
		oscillator.start(now);
		oscillator.stop(now + duration + 0.02);
	}

	private playNoise(duration: number, gain: number, bus: AudioBus): void {
		if (!this.context) return;
		const destination = this.bus(bus);
		if (!destination) return;
		const source = this.context.createBufferSource();
		const envelope = this.context.createGain();
		const now = this.context.currentTime;
		source.buffer = this.createNoiseBuffer(duration);
		envelope.gain.setValueAtTime(gain, now);
		envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
		source.connect(envelope).connect(destination);
		source.start(now);
	}

	private createNoiseBuffer(seconds: number): AudioBuffer {
		if (!this.context) throw new Error('Audio context unavailable');
		const length = Math.max(1, Math.floor(this.context.sampleRate * seconds));
		const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
		const data = buffer.getChannelData(0);
		let state = 0x6d2b79f5;
		for (let index = 0; index < length; index += 1) {
			state = Math.imul(state ^ (state >>> 15), state | 1);
			data[index] = ((state >>> 0) / 0xffffffff) * 2 - 1;
		}
		return buffer;
	}
}
