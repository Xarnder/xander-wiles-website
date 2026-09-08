/**
 * How an instrument responds to a requested sustain duration (`durationSteps`, converted to seconds
 * by the caller) — every species still shares the SAME `ringIndex`/`durationSteps` timing model (see
 * MusicModel.ts); only the audio envelope differs, never the underlying duration logic itself.
 *
 * - `'gated'` — holds a steady tone at `volume` for the full requested duration, then releases over
 *   `release` seconds. The natural choice for anything meant to "hold" (pad, flute, bass, glass).
 * - `'natural-decay'` — plays its own attack/decay curve up to `duration` seconds, same as before
 *   this system existed. A SHORTER requested duration gates it early (cuts the decay short); a LONGER
 *   one has no further effect — the instrument's own decay is what ends the note, not the sustain
 *   trail (see the README's "Species-specific sustain behaviour" section for why a bell doesn't hold).
 * - `'one-shot'` — always plays its fixed `duration` regardless of what's requested. For a future
 *   percussion/pluck instrument whose sound genuinely cannot be stretched or gated.
 */
export type SustainMode = 'gated' | 'one-shot' | 'natural-decay';
export interface InstrumentDefinition {
	id: string;
	name: string;
	type: 'synth' | 'sample';
	waveform?: OscillatorType;
	attack: number;
	duration: number;
	/** Release tail after a `'gated'` note's sustain ends — ignored by every other `sustainMode`. */
	release?: number;
	sustainMode: SustainMode;
	buffer?: AudioBuffer;
	rootMidi?: number;
	harmonics?: number[];
	percussion?: 'kick' | 'snare' | 'hat' | 'tom';
}
export const instruments: InstrumentDefinition[] = [
	...(['kick', 'snare', 'hat', 'tom'] as const).map((percussion) => ({
		id: `drum-${percussion}`,
		name: percussion,
		type: 'synth' as const,
		percussion,
		attack: 0.002,
		duration: percussion === 'hat' ? 0.14 : 0.3,
		sustainMode: 'one-shot' as const
	})),
	{
		id: 'bell',
		name: 'Bell',
		type: 'synth',
		waveform: 'sine',
		attack: 0.008,
		duration: 1.2,
		sustainMode: 'natural-decay',
		harmonics: [0, 1, 0.12, 0.3, 0.06]
	},
	{
		id: 'bass',
		name: 'Marimba',
		type: 'synth',
		waveform: 'triangle',
		attack: 0.012,
		duration: 1.5,
		release: 0.2,
		sustainMode: 'gated'
	},
	{
		id: 'pad',
		name: 'Warm pad',
		type: 'synth',
		waveform: 'triangle',
		attack: 0.15,
		duration: 2.4,
		release: 0.4,
		sustainMode: 'gated'
	},
	{
		id: 'flute',
		name: 'Flute',
		type: 'synth',
		waveform: 'sine',
		attack: 0.07,
		duration: 0.9,
		release: 0.25,
		sustainMode: 'gated'
	},
	{
		id: 'glass',
		name: 'Glass',
		type: 'synth',
		waveform: 'sine',
		attack: 0.003,
		duration: 1.8,
		release: 0.3,
		sustainMode: 'gated',
		harmonics: [0, 1, 0.4, 0.05, 0.22, 0.1]
	}
];
let sharedContext: AudioContext | undefined;
export function audioContext() {
	return (sharedContext ??= new AudioContext());
}
export class InstrumentLibrary {
	private noise?: AudioBuffer;
	private waves = new Map<string, PeriodicWave>();
	private voices = new Set<{ source: AudioScheduledSourceNode; gain: GainNode; plant: string }>();
	constructor(
		private context: AudioContext,
		private bus: AudioNode
	) {}
	/**
	 * `durationSeconds` is the SUSTAIN request (derived from `durationSteps` — see
	 * MusicModel.noteDurationSeconds); how much of it actually gets honoured depends on the
	 * instrument's own `sustainMode` (see its doc comment). Omitting it reproduces the exact
	 * pre-sustain-system behaviour (the instrument's own fixed `duration`), so every existing call
	 * site that doesn't yet know about sustain keeps working unchanged.
	 */
	play(
		id: string,
		midi: number,
		volume: number,
		time: number,
		plant: string,
		durationSeconds?: number
	) {
		if (this.voices.size >= 128) return;
		const instrument = instruments.find((i) => i.id === id)!;
		const gain = this.context.createGain();
		let source: OscillatorNode | AudioBufferSourceNode;
		if (instrument.percussion === 'hat' || instrument.percussion === 'snare') {
			if (!this.noise) {
				this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
				const samples = this.noise.getChannelData(0);
				let seed = 173;
				for (let i = 0; i < samples.length; i++) {
					seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
					samples[i] = (seed >>> 0) / 2147483648 - 1;
				}
			}
			const noise = this.context.createBufferSource();
			noise.buffer = this.noise;
			noise.playbackRate.value = instrument.percussion === 'hat' ? 2 : 1;
			source = noise;
		} else if (instrument.type === 'sample') {
			if (!instrument.buffer) return;
			const sample = this.context.createBufferSource();
			sample.buffer = instrument.buffer;
			sample.playbackRate.value = 2 ** ((midi - (instrument.rootMidi ?? 60)) / 12);
			source = sample;
		} else {
			const osc = this.context.createOscillator();
			osc.type = instrument.waveform ?? 'sine';
			if (instrument.harmonics) {
				let wave = this.waves.get(id);
				if (!wave) {
					wave = this.context.createPeriodicWave(
						new Float32Array(instrument.harmonics.length),
						new Float32Array(instrument.harmonics)
					);
					this.waves.set(id, wave);
				}
				osc.setPeriodicWave(wave);
			}
			osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
			if (instrument.percussion) {
				osc.frequency.setValueAtTime(instrument.percussion === 'kick' ? 140 : 210, time);
				osc.frequency.exponentialRampToValueAtTime(
					instrument.percussion === 'kick' ? 45 : 80,
					time + 0.15
				);
			}
			source = osc;
		}

		gain.gain.setValueAtTime(0, time);
		gain.gain.linearRampToValueAtTime(volume, time + instrument.attack);

		let stopAt: number;
		if (instrument.sustainMode === 'gated') {
			// Hold flat at `volume` (no further automation needed — the ramp above simply stays put
			// until the next scheduled event) through the full requested sustain, then release.
			const sustainEnd =
				time + Math.max(durationSeconds ?? instrument.duration, instrument.attack + 0.05);
			const release = instrument.release ?? 0.2;
			gain.gain.setValueAtTime(volume, sustainEnd);
			gain.gain.exponentialRampToValueAtTime(0.0001, sustainEnd + release);
			stopAt = sustainEnd + release;
		} else if (instrument.sustainMode === 'one-shot') {
			// Always the instrument's own fixed length — a requested sustain longer OR shorter than
			// that has no effect; some sounds genuinely can't be stretched or gated.
			gain.gain.exponentialRampToValueAtTime(0.0001, time + instrument.duration);
			stopAt = time + instrument.duration;
		} else {
			// 'natural-decay': plays its own decay curve, but a SHORTER requested duration cuts it off
			// early (a subtle gate) — a longer one has no effect, since the natural decay is what ends
			// the note either way.
			const decayEnd = Math.min(
				instrument.duration,
				Math.max(durationSeconds ?? instrument.duration, instrument.attack + 0.05)
			);
			gain.gain.exponentialRampToValueAtTime(0.0001, time + decayEnd);
			stopAt = time + decayEnd;
		}

		source.connect(gain);
		gain.connect(this.bus);
		const voice = { source, gain, plant };
		this.voices.add(voice);
		source.onended = () => {
			source.disconnect();
			gain.disconnect();
			this.voices.delete(voice);
		};
		source.start(time);
		source.stop(stopAt + 0.02);
	}
	/**
	 * Stops matching voices (all voices if `plant` is omitted — used for pause) with a short clean
	 * release rather than an instant jump to zero, which would otherwise produce an audible click —
	 * see the README's "Remove Mode integration" section: a removed sustained note should release
	 * cleanly, never hang or pop.
	 */
	stop(plant?: string) {
		const RELEASE = 0.03;
		for (const v of this.voices)
			if (!plant || v.plant === plant) {
				const now = this.context.currentTime;
				const current = v.gain.gain.value;
				v.gain.gain.cancelScheduledValues(now);
				v.gain.gain.setValueAtTime(Math.max(current, 0.0001), now);
				v.gain.gain.exponentialRampToValueAtTime(0.0001, now + RELEASE);
				v.source.stop(now + RELEASE + 0.01);
			}
	}
	get count() {
		return this.voices.size;
	}
}
