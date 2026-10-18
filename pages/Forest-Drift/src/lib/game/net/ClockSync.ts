interface ClockSample {
	/** server − local, ms. */
	offset: number;
	rtt: number;
}

const MAX_SAMPLES = 8;
/** Larger disagreements than this jump straight to the new estimate instead of slewing. */
const JUMP_THRESHOLD_MS = 1000;
/** The offset may move by at most this fraction of elapsed time (5% playback stretch). */
const SLEW_RATE = 0.05;

/**
 * Estimates the room's clock from the client's monotonic clock.
 *
 * Each ping/pong gives one estimate, `server + rtt/2 − localReceive`; the one with the smallest round
 * trip among the last few is the least distorted by queueing, so that's the target. The offset in use
 * then *slews* towards the target rather than jumping, so the shared timeline other players are
 * interpolated on never lurches when a new estimate arrives — a jump there would show up as every
 * remote avatar stuttering at once.
 */
export class ClockSync {
	private readonly samples: ClockSample[] = [];
	private offset: number | null = null;
	private target: number | null = null;
	private lastSlewLocal: number | null = null;
	private bestRtt = Number.POSITIVE_INFINITY;

	constructor(private readonly localNow: () => number = () => performance.now()) {}

	get ready(): boolean {
		return this.offset !== null;
	}

	/** Most recent smallest round trip, ms (Infinity until the first pong). */
	get rttMs(): number {
		return this.bestRtt;
	}

	/** Rough first estimate from the `welcome` message, before any pong has come back. */
	seed(serverTime: number, localReceive: number = this.localNow()): void {
		if (this.offset !== null) return;
		this.offset = serverTime - localReceive;
		this.target = this.offset;
		this.lastSlewLocal = localReceive;
	}

	addSample(clientSend: number, serverTime: number, localReceive: number = this.localNow()): void {
		const rtt = Math.max(0, localReceive - clientSend);
		const offset = serverTime + rtt / 2 - localReceive;
		this.samples.push({ offset, rtt });
		if (this.samples.length > MAX_SAMPLES) this.samples.shift();

		let best = this.samples[0]!;
		for (const sample of this.samples) if (sample.rtt < best.rtt) best = sample;
		this.bestRtt = best.rtt;
		this.target = best.offset;
		if (this.offset === null || Math.abs(this.target - this.offset) > JUMP_THRESHOLD_MS) {
			this.offset = this.target;
		}
		this.lastSlewLocal ??= localReceive;
	}

	/** Current estimate of the room clock, ms. NaN until seeded. */
	serverNow(local: number = this.localNow()): number {
		if (this.offset === null || this.target === null) return Number.NaN;
		const last = this.lastSlewLocal ?? local;
		const elapsed = Math.max(0, local - last);
		this.lastSlewLocal = Math.max(last, local);
		const maxStep = elapsed * SLEW_RATE;
		const diff = this.target - this.offset;
		this.offset += Math.max(-maxStep, Math.min(maxStep, diff));
		return local + this.offset;
	}
}
