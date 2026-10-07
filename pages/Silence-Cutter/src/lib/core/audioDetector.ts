import type { AudioDetectorParams, Envelope, Range } from './types';

export const SILENCE_FLOOR_DB = -100;

export const DEFAULT_AUDIO_PARAMS: AudioDetectorParams = {
	thresholdDb: -42,
	hysteresisDb: 4,
	attackMs: 10,
	releaseMs: 180,
	minSpeechMs: 40
};

export function amplitudeToDb(rms: number): number {
	return rms > 1e-5 ? 20 * Math.log10(rms) : SILENCE_FLOOR_DB;
}

/**
 * Streaming RMS envelope builder. Feed it mono PCM in arbitrary chunk sizes; it emits one dBFS
 * value per `hopSeconds`. A gentle 2nd-order high-pass (default 70 Hz) removes rumble/HVAC so it
 * does not hold the gate open, without touching the voice band.
 */
export class EnvelopeBuilder {
	readonly hopSeconds: number;
	private readonly hopSamples: number;
	private acc = 0;
	private count = 0;
	private values: number[] = [];
	// Biquad high-pass state (RBJ cookbook).
	private readonly b0: number;
	private readonly b1: number;
	private readonly b2: number;
	private readonly a1: number;
	private readonly a2: number;
	private x1 = 0;
	private x2 = 0;
	private y1 = 0;
	private y2 = 0;

	constructor(sampleRate: number, hopSeconds = 0.01, highPassHz = 70) {
		this.hopSeconds = hopSeconds;
		this.hopSamples = Math.max(1, Math.round(sampleRate * hopSeconds));
		const w0 = (2 * Math.PI * highPassHz) / sampleRate;
		const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
		const cos = Math.cos(w0);
		const a0 = 1 + alpha;
		this.b0 = (1 + cos) / 2 / a0;
		this.b1 = -(1 + cos) / a0;
		this.b2 = (1 + cos) / 2 / a0;
		this.a1 = (-2 * cos) / a0;
		this.a2 = (1 - alpha) / a0;
	}

	push(samples: Float32Array): void {
		const { b0, b1, b2, a1, a2, hopSamples } = this;
		let { x1, x2, y1, y2, acc, count } = this;
		for (let i = 0; i < samples.length; i++) {
			const x = samples[i];
			const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
			x2 = x1;
			x1 = x;
			y2 = y1;
			y1 = y;
			acc += y * y;
			count++;
			if (count === hopSamples) {
				this.values.push(amplitudeToDb(Math.sqrt(acc / count)));
				acc = 0;
				count = 0;
			}
		}
		this.x1 = x1;
		this.x2 = x2;
		this.y1 = y1;
		this.y2 = y2;
		this.acc = acc;
		this.count = count;
	}

	finish(): Envelope {
		if (this.count > 0) {
			this.values.push(amplitudeToDb(Math.sqrt(this.acc / this.count)));
			this.acc = 0;
			this.count = 0;
		}
		return { hopSeconds: this.hopSeconds, db: Float32Array.from(this.values) };
	}
}

/**
 * Analysis A: classic amplitude gate over the envelope.
 *
 * Not a per-sample classifier: the gate needs `attackMs` of sustained level to open, stays open
 * through dips shorter than `releaseMs` (so the pauses inside and between syllables never create
 * edits), and closes only below `thresholdDb - hysteresisDb`.
 *
 * Returns speech ranges in seconds. Region ends are at the last loud frame (not extended by the
 * hangover) — retained padding is applied later by the cut stage, never twice.
 */
export function detectAudioSpeech(env: Envelope, params: AudioDetectorParams): Range[] {
	const { db, hopSeconds } = env;
	const hopMs = hopSeconds * 1000;
	const openDb = params.thresholdDb;
	const closeDb = params.thresholdDb - Math.max(0, params.hysteresisDb);
	const attackFrames = Math.max(1, Math.round(params.attackMs / hopMs));
	const releaseFrames = Math.max(0, Math.round(params.releaseMs / hopMs));

	const frames: Array<[number, number]> = [];
	let open = false;
	let run = 0;
	let start = 0;
	let lastLoud = -1;

	for (let i = 0; i < db.length; i++) {
		const level = db[i];
		if (!open) {
			if (level >= openDb) {
				run++;
				if (run >= attackFrames) {
					open = true;
					start = i - run + 1;
					lastLoud = i;
				}
			} else {
				run = 0;
			}
		} else if (level >= closeDb) {
			lastLoud = i;
		} else if (i - lastLoud > releaseFrames) {
			frames.push([start, lastLoud + 1]);
			open = false;
			run = 0;
		}
	}
	if (open) frames.push([start, lastLoud + 1]);

	const minSpeech = params.minSpeechMs / 1000;
	const out: Range[] = [];
	for (const [a, b] of frames) {
		const r = { start: a * hopSeconds, end: Math.min(b, db.length) * hopSeconds };
		if (r.end - r.start >= minSpeech - 1e-9) out.push(r);
	}
	return out;
}

/**
 * Suggest a threshold from the level distribution: a fraction of the way from the noise floor
 * (10th percentile) to the speech level (95th percentile). Biased low, i.e. towards calling more
 * material speech, in keeping with "never delete actual speech".
 */
export function suggestThreshold(env: Envelope): number {
	const values = Array.from(env.db).filter((v) => v > SILENCE_FLOOR_DB + 1);
	if (values.length < 10) return DEFAULT_AUDIO_PARAMS.thresholdDb;
	values.sort((a, b) => a - b);
	const pick = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
	const floor = pick(0.1);
	const speech = pick(0.95);
	if (speech - floor < 6) return Math.max(-70, floor - 3);
	const t = floor + 0.3 * (speech - floor);
	return Math.round(Math.min(-15, Math.max(-70, t)));
}
