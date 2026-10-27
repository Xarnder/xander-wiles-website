import type { SpeechService } from './SpeechService';
import { clipKey, phrases, type SpeechRequest } from './types';
import type { SpeechProgress } from './progress';

/** One serial producer. Retarget at phrase boundaries; never generate an entire script ahead. */
export class SpeechWindow {
	private requests: SpeechRequest[] = [];
	private ready = new Set<string>();
	private working = false;
	private disposed = false;
	private epoch = 0;
	private waiters = new Set<() => void>();
	private error?: Error;
	private failures = 0;
	private cancelReads = new Set<() => void>();
	constructor(
		private service: SpeechService,
		private allowed: () => boolean,
		private progress: (message: string, detail?: SpeechProgress) => void,
		private yieldWork: () => Promise<void> = () =>
			new Promise((resolve) => setTimeout(resolve, 100))
	) {}
	setWindow(requests: SpeechRequest[]) {
		if (this.disposed) return;
		this.requests = requests.slice(0, 3).map((request) => ({
			...request,
			speaker: { ...request.speaker, profile: { ...request.speaker.profile } }
		}));
		this.failures = 0;
		// Revalidate after navigation: another tab may have cleared persistent speech.
		this.ready.clear();
		this.error = undefined;
		this.epoch++;
		for (const cancel of this.cancelReads) cancel();
		this.wake();
		void this.pump();
	}
	private keys(request: SpeechRequest) {
		return phrases(request.text).map((text) => clipKey(text, request.speaker.profile));
	}
	private wake() {
		for (const wake of this.waiters) wake();
		this.waiters.clear();
	}
	async ensure(request: SpeechRequest, current: () => boolean): Promise<boolean> {
		const keys = this.keys(request);
		const epoch = this.epoch;
		while (!this.disposed && epoch === this.epoch && current()) {
			if (keys.every((key) => this.ready.has(key))) return true;
			if (this.error) throw this.error;
			await new Promise<void>((resolve) => {
				const wake = () => {
					clearTimeout(timer);
					this.waiters.delete(wake);
					resolve();
				};
				const timer = setTimeout(wake, 100);
				this.waiters.add(wake);
			});
		}
		return false;
	}
	private async readCache(key: string) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let cancel: (() => void) | undefined;
		try {
			return await Promise.race([
				this.service.cache.get(key),
				new Promise<never>((_resolve, reject) => {
					cancel = () => reject(new Error('Speech cache read superseded.'));
					this.cancelReads.add(cancel);
					timer = setTimeout(
						() =>
							reject(new Error('Speech storage is not responding. Retry or continue with text.')),
						15_000
					);
				})
			]);
		} finally {
			clearTimeout(timer);
			if (cancel) this.cancelReads.delete(cancel);
		}
	}
	private async pump() {
		if (this.working || this.disposed) return;
		this.working = true;
		try {
			work: while (!this.disposed && this.requests.length) {
				const epoch = this.epoch;
				try {
					let missing: SpeechRequest | undefined;
					const wanted = new Set<string>();
					for (const request of this.requests) {
						for (const text of phrases(request.text)) {
							const key = clipKey(text, request.speaker.profile);
							wanted.add(key);
							if (this.ready.has(key)) continue;
							const cached = await this.readCache(key);
							if (this.disposed) return;
							if (epoch !== this.epoch) continue work;
							if (cached) this.ready.add(key);
							else if (!missing) missing = { ...request, text };
						}
						// Current audio can start before slower lookahead cache reads finish.
						this.wake();
						if (missing) break;
					}
					if (!missing) {
						for (const key of this.ready) if (!wanted.has(key)) this.ready.delete(key);
						this.progress('Next instructions ready.');
						break;
					}
					if (!this.allowed()) {
						this.progress('Background preparation paused to give gameplay priority.');
						await this.yieldWork();
						continue;
					}
					await this.service.prepare(
						[missing],
						(message, detail) => {
							if (!this.disposed && epoch === this.epoch) this.progress(message, detail);
						},
						{ background: true, keepWorker: true }
					);
					if (this.disposed) return;
					if (epoch !== this.epoch) continue;
					this.failures = 0;
					this.ready.add(clipKey(missing.text, missing.speaker.profile));
					this.wake();
					await this.yieldWork();
				} catch (error) {
					if (this.disposed) return;
					// A failed obsolete request must never poison the newly selected instruction.
					if (epoch !== this.epoch) continue;
					const failure = error instanceof Error ? error : new Error('Background speech failed.');
					if (
						/network|fetch|download|another tab|already running/i.test(failure.message) &&
						++this.failures <= 2
					) {
						this.progress(`Speech preparation interrupted. Retrying (${this.failures}/2)…`);
						for (let i = 0; i < 5 && !this.disposed && epoch === this.epoch; i++)
							await this.yieldWork();
						continue;
					}
					this.error = failure;
					this.progress(failure.message);
					this.wake();
					break;
				}
			}
		} finally {
			this.working = false;
		}
	}
	dispose() {
		this.disposed = true;
		for (const cancel of this.cancelReads) cancel();
		this.requests = [];
		this.wake();
		this.service.stopPreparation();
	}
}
