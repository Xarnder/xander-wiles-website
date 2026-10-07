/**
 * Streaming band-limited resampler (windowed sinc, polyphase table). Arbitrary ratios, constant
 * memory: only the filter history is retained between pushes, so an hour of audio can be
 * streamed through without materialising the source-rate signal.
 */
export class StreamingResampler {
	private readonly step: number; // input samples per output sample
	private readonly halfTaps: number;
	private readonly phases: number;
	private readonly table: Float32Array; // [phase][tap] for taps -halfTaps+1 .. halfTaps
	private buf: Float32Array = new Float32Array(0);
	private bufStart = 0; // absolute input index of buf[0]
	private nextOut = 0; // absolute output index
	private readonly identity: boolean;

	constructor(
		readonly inRate: number,
		readonly outRate: number,
		zeroCrossings = 10,
		phases = 512
	) {
		this.identity = inRate === outRate;
		this.step = inRate / outRate;
		const cutoff = Math.min(1, outRate / inRate) * 0.475; // cycles per input sample
		this.halfTaps = Math.ceil(zeroCrossings / (2 * cutoff));
		this.phases = phases;
		const taps = this.halfTaps * 2;
		this.table = new Float32Array(phases * taps);
		for (let p = 0; p < phases; p++) {
			const frac = p / phases;
			let sum = 0;
			for (let k = 0; k < taps; k++) {
				// tap index k corresponds to input offset (k - halfTaps + 1) relative to floor(x)
				const t = k - this.halfTaps + 1 - frac;
				const x = 2 * cutoff * t;
				const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
				const w = t / this.halfTaps;
				// Blackman window over [-halfTaps, halfTaps]
				const win =
					Math.abs(w) >= 1
						? 0
						: 0.42 + 0.5 * Math.cos(Math.PI * w) + 0.08 * Math.cos(2 * Math.PI * w);
				const v = 2 * cutoff * sinc * win;
				this.table[p * taps + k] = v;
				sum += v;
			}
			// Normalise DC gain per phase.
			for (let k = 0; k < taps; k++) this.table[p * taps + k] /= sum;
		}
	}

	/** Push input samples, returning all output samples that can be produced so far. */
	push(input: Float32Array): Float32Array {
		if (this.identity) return input.slice();
		const merged = new Float32Array(this.buf.length + input.length);
		merged.set(this.buf, 0);
		merged.set(input, this.buf.length);
		this.buf = merged;
		return this.drain(false);
	}

	/** Flush remaining output (pads the tail with zeros). */
	flush(): Float32Array {
		if (this.identity) return new Float32Array(0);
		const padded = new Float32Array(this.buf.length + this.halfTaps);
		padded.set(this.buf, 0);
		this.buf = padded;
		return this.drain(true);
	}

	private drain(final: boolean): Float32Array {
		const { step, halfTaps, phases, table } = this;
		const taps = halfTaps * 2;
		const bufEnd = this.bufStart + this.buf.length;
		const realEnd = final ? bufEnd - halfTaps : bufEnd;
		const out: number[] = [];
		for (;;) {
			const x = this.nextOut * step;
			const base = Math.floor(x);
			if (final ? x >= realEnd : base + halfTaps >= bufEnd) break;
			const phase = Math.min(phases - 1, Math.round((x - base) * phases));
			const row = phase * taps;
			let acc = 0;
			const first = base - halfTaps + 1 - this.bufStart;
			for (let k = 0; k < taps; k++) {
				const idx = first + k;
				if (idx >= 0 && idx < this.buf.length) acc += this.buf[idx] * table[row + k];
			}
			out.push(acc);
			this.nextOut++;
		}
		// Drop history no longer needed.
		const keepFrom = Math.floor(this.nextOut * step) - halfTaps;
		const drop = Math.max(0, keepFrom - this.bufStart);
		if (drop > 0) {
			this.buf = this.buf.slice(drop);
			this.bufStart += drop;
		}
		return Float32Array.from(out);
	}
}
