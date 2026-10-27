import type { SpeechProgress } from './progress';
import { audioOutput, releaseAudioOutputs } from '../audio/AudioPreferences';
import { audibleTime } from './playbackClock';
import { LocalVoice } from './LocalVoice';
import { SpeechCache } from './SpeechCache';
import {
	clipKey,
	phrases,
	LIMITS,
	type Caption,
	type Clip,
	type SpeechRequest,
	type SpeechResult,
	type VoiceProfile
} from './types';
/** Shared playback with explicitly gated, serial preparation in a single worker. */
export class SpeechService {
	readonly cache = new SpeechCache();
	private local = new LocalVoice();
	private worker?: Worker;
	private preparation = 0;
	private request = 0;
	private playback = 0;
	private pending?: (error: Error) => void;
	private source?: AudioBufferSourceNode;
	private context?: AudioContext;
	private stopPlayback?: () => void;
	private disposed = false;
	constructor(
		private readonly caption: (value: Caption | null) => void,
		private readonly preparationSafe: () => boolean = () => false,
		private readonly backgroundSafe: () => boolean = () => false
	) {}
	unlock() {
		if (this.disposed) return Promise.reject(new Error('Speech service is closed.'));
		this.context ??= new AudioContext();
		return this.context.resume();
	}
	cancel() {
		this.playback++;
		this.local.cancel();
		this.stopPlayback?.();
		this.stopPlayback = undefined;
		this.source?.stop();
		this.source = undefined;
		this.caption(null);
	}
	stopPreparation() {
		this.preparation++;
		this.worker?.terminate();
		this.worker = undefined;
		this.pending?.(new Error('Preparation cancelled.'));
		this.pending = undefined;
	}
	private generate(
		text: string,
		profile: VoiceProfile,
		progress: (message: string, detail?: SpeechProgress) => void
	): Promise<Clip> {
		this.worker ??= new Worker(new URL('./synthesis.worker.ts', import.meta.url), {
			type: 'module'
		});
		const worker = this.worker,
			id = ++this.request;
		return new Promise((resolve, reject) => {
			let timeout: ReturnType<typeof setTimeout>;
			const armTimeout = () => {
				clearTimeout(timeout);
				timeout = setTimeout(() => {
					fail(new Error('Voice preparation timed out. Continue with text or retry.'));
					this.stopPreparation();
				}, 180_000);
			};
			armTimeout();
			const fail = (error: Error) => {
				clearTimeout(timeout);
				worker.terminate();
				if (this.worker === worker) this.worker = undefined;
				this.pending = undefined;
				reject(error);
			};
			this.pending = fail;
			worker.onerror = () => fail(new Error('Local speech could not start on this device.'));
			worker.onmessage = ({ data }) => {
				if (data.id !== id) return;
				if (data.progress) {
					armTimeout();
					progress(data.progress, data.detail);
					return;
				}
				if (data.error) {
					fail(new Error(data.error));
					return;
				}
				clearTimeout(timeout);
				this.pending = undefined;
				resolve({
					key: clipKey(text, profile),
					text,
					pcm: data.pcm,
					sampleRate: data.sampleRate,
					duration: data.pcm.length / data.sampleRate,
					bytes: data.pcm.byteLength,
					usedAt: Date.now(),
					schema: 1
				});
			};
			worker.postMessage({ id, text, profile });
		});
	}
	/** Initial setup suspends rendering. Background callers require a separate scheduling gate. */
	async prepare(
		requests: SpeechRequest[],
		progress: (message: string, detail?: SpeechProgress) => void,
		options: { background?: boolean; keepWorker?: boolean } = {}
	) {
		const allowed = options.background ? this.backgroundSafe : this.preparationSafe;
		if (this.disposed || !allowed())
			throw new Error('Speech preparation requires the world to be suspended.');
		const tasks = requests
			.map((r) => ({ ...r, speaker: { ...r.speaker, profile: { ...r.speaker.profile } } }))
			.flatMap((r) => phrases(r.text).map((text) => ({ r, text })));
		if (tasks.length > LIMITS.preparationPhrases) throw new Error('Preparation set is too large.');
		if (this.pending) throw new Error('Speech preparation is already running.');
		const generation = ++this.preparation;
		if (!navigator.locks)
			throw new Error('Safe voice preparation is unavailable here. Use text tutorials.');
		await navigator.locks.request(
			'forest-drift-speech-preparation',
			{ ifAvailable: true },
			async (lock) => {
				if (!lock) throw new Error('Voice preparation is already running in another tab.');
				let reused = 0;
				try {
					for (let i = 0; i < tasks.length; i++) {
						if (this.disposed || !allowed() || generation !== this.preparation || document.hidden)
							throw new Error('Preparation cancelled.');
						const { r, text } = tasks[i];
						const report = (message: string, detail?: SpeechProgress) =>
							progress(message, {
								stage: 'checking',
								...detail,
								completed: i,
								count: tasks.length,
								reused
							});
						report(`Checking saved clip ${i + 1} of ${tasks.length}…`);
						const cached = await this.cache.get(clipKey(text, r.speaker.profile));
						if (!allowed() || generation !== this.preparation)
							throw new Error('Preparation cancelled.');
						if (!cached) {
							const clip = await this.generate(text, r.speaker.profile, report);
							if (!allowed() || generation !== this.preparation)
								throw new Error('Preparation cancelled.');
							report('Saving the generated speech clip…', { stage: 'saving' });
							await this.cache.put(clip, r.mode === 'scripted');
						} else reused++;
						progress('Speech clip ready.', {
							stage: 'checking',
							completed: i + 1,
							count: tasks.length,
							reused
						});
					}
				} finally {
					if (generation === this.preparation && !options.keepWorker) this.stopPreparation();
				}
			}
		);
	}
	async speak(request: SpeechRequest, voice: boolean, deviceVoice = false): Promise<SpeechResult> {
		const r = {
			...request,
			speaker: { ...request.speaker, profile: { ...request.speaker.profile } }
		};
		this.cancel();
		const token = this.playback;
		const ownsPlayback = () => !this.disposed && token === this.playback;
		const current = () =>
			!this.disposed &&
			token === this.playback &&
			(r.mode !== 'dynamic' || Date.now() < r.expiresAt);
		for (const text of phrases(r.text)) {
			if (!current()) {
				if (ownsPlayback()) this.caption(null);
				return 'cancelled';
			}
			const clip =
				voice && !deviceVoice ? await this.cache.get(clipKey(text, r.speaker.profile)) : undefined;
			if (!current()) {
				if (ownsPlayback()) this.caption(null);
				return 'cancelled';
			}
			const caption = {
				requestId: r.id,
				speakerId: r.speaker.id,
				label: r.speaker.showLabel ? r.speaker.name : '',
				text
			};
			if (voice && deviceVoice) {
				const result = await this.local.say(
					text,
					r.speaker.profile.language,
					() => {
						if (current()) this.caption(caption);
					},
					r.mode === 'dynamic' ? r.expiresAt : undefined
				);
				if (!current() || result === 'cancelled') {
					if (ownsPlayback()) this.caption(null);
					return 'cancelled';
				}
				if (result === 'text') {
					this.caption({ ...caption, text: r.text });
					return 'text';
				}
				this.caption(null);
				continue;
			}
			// Live inference is deliberately unqualified. Missing audio never starts the worker.
			if (!clip || !this.context || this.context.state !== 'running') {
				this.caption({ ...caption, text: r.text });
				return 'text';
			}
			const result = await this.play(clip, caption, current);
			if (!current()) {
				if (ownsPlayback()) this.caption(null);
				return 'cancelled';
			}
			if (result === 'text') {
				this.caption({ ...caption, text: r.text });
				return 'text';
			}
			this.caption(null);
		}
		this.caption(null);
		return 'ended';
	}
	private play(clip: Clip, caption: Caption, current: () => boolean): Promise<SpeechResult> {
		const context = this.context!;
		const buffer = context.createBuffer(1, clip.pcm.length, clip.sampleRate);
		buffer.getChannelData(0).set(clip.pcm);
		const source = context.createBufferSource();
		this.source = source;
		source.buffer = buffer;
		source.connect(audioOutput(context, 'narration'));
		const starts = context.currentTime + 0.04;
		return new Promise((resolve) => {
			let frame = 0,
				shown = false,
				ended = false;
			const watchdog = setTimeout(
				() => {
					source.stop();
					finish('text');
				},
				(clip.duration + 5) * 1000
			);
			const finish = (result: SpeechResult = 'ended') => {
				if (ended) return;
				ended = true;
				clearTimeout(watchdog);
				cancelAnimationFrame(frame);
				source.onended = null;
				source.disconnect();
				if (this.source === source) this.source = undefined;
				if (this.stopPlayback === stop) this.stopPlayback = undefined;
				resolve(result);
			};
			const stop = () => {
				if (ended) return;
				source.stop();
				finish('cancelled');
			};
			this.stopPlayback = stop;
			source.onended = () => {
				/* The audible output timeline may lag the source end. */
			};
			const tick = () => {
				if (ended) return;
				if (!current()) {
					source.stop();
					finish('cancelled');
					return;
				}
				if (context.state !== 'running') {
					source.stop();
					finish('text');
					return;
				}
				const timestamp = context.getOutputTimestamp?.();
				const audible = audibleTime(
					context.currentTime,
					performance.now(),
					timestamp,
					context.outputLatency || 0
				);
				if (!shown && audible >= starts) {
					this.caption(caption);
					shown = true;
				}
				if (audible >= starts + clip.duration) {
					finish();
					return;
				}
				if (!ended) frame = requestAnimationFrame(tick);
			};
			try {
				source.start(starts);
				frame = requestAnimationFrame(tick);
			} catch {
				finish('text');
			}
		});
	}
	async clear() {
		this.cancel();
		this.stopPreparation();
		const clear = async () => {
			await this.cache.clear();
			if (typeof caches !== 'undefined')
				await Promise.all(
					(await caches.keys())
						.filter(
							(name) =>
								name.startsWith('forest-drift.speech.assets.') ||
								name.startsWith('forest-drift.speech.voices.')
						)
						.map((name) => caches.delete(name))
				);
		};
		if (navigator.locks) await navigator.locks.request('forest-drift-speech-preparation', clear);
		else await clear();
	}
	dispose() {
		this.disposed = true;
		this.cancel();
		this.stopPreparation();
		this.cache.release();
		if (this.context) {
			releaseAudioOutputs(this.context);
			void this.context.close();
		}
	}
}
