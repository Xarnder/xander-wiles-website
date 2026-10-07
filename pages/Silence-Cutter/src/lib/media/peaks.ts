/**
 * Waveform peak pyramid. Level 0 stores min/max (int8) for every `baseBucket` samples; each
 * higher level halves the resolution. Rendering picks the coarsest level that still has at
 * least one bucket per pixel, so drawing cost depends on the viewport width, not media length.
 */
export interface PeakLevel {
	/** Seconds covered by one bucket. */
	bucketSeconds: number;
	/** Interleaved [min, max] pairs, scaled to -127..127. */
	data: Int8Array;
}

export class PeakBuilder {
	private readonly values: number[] = [];
	private count = 0;
	private min = Infinity;
	private max = -Infinity;

	constructor(
		readonly sampleRate: number,
		readonly baseBucket = 32
	) {}

	push(samples: Float32Array): void {
		let { count, min, max } = this;
		for (let i = 0; i < samples.length; i++) {
			const v = samples[i];
			if (v < min) min = v;
			if (v > max) max = v;
			if (++count === this.baseBucket) {
				this.values.push(quantize(min), quantize(max));
				count = 0;
				min = Infinity;
				max = -Infinity;
			}
		}
		this.count = count;
		this.min = min;
		this.max = max;
	}

	finish(): Int8Array {
		if (this.count > 0) this.values.push(quantize(this.min), quantize(this.max));
		this.count = 0;
		return Int8Array.from(this.values);
	}
}

function quantize(v: number): number {
	return Math.max(-127, Math.min(127, Math.round(v * 127)));
}

/** Build the full pyramid from level-0 data. */
export function buildPyramid(base: Int8Array, baseBucketSeconds: number): PeakLevel[] {
	const levels: PeakLevel[] = [{ bucketSeconds: baseBucketSeconds, data: base }];
	let prev = base;
	let seconds = baseBucketSeconds;
	while (prev.length > 2 * 2) {
		const n = Math.ceil(prev.length / 4);
		const next = new Int8Array(n * 2);
		for (let i = 0; i < n; i++) {
			const a = i * 4;
			const hasB = a + 2 < prev.length;
			next[i * 2] = hasB ? Math.min(prev[a], prev[a + 2]) : prev[a];
			next[i * 2 + 1] = hasB ? Math.max(prev[a + 1], prev[a + 3]) : prev[a + 1];
		}
		seconds *= 2;
		levels.push({ bucketSeconds: seconds, data: next });
		prev = next;
	}
	return levels;
}

/** Coarsest level whose bucket is no wider than `secondsPerPixel`. */
export function pickLevel(levels: readonly PeakLevel[], secondsPerPixel: number): PeakLevel {
	let best = levels[0];
	for (const l of levels) {
		if (l.bucketSeconds <= secondsPerPixel) best = l;
		else break;
	}
	return best;
}
