/**
 * Preview playback on the original <video> element.
 *
 * Original mode plays the file unchanged. Edited mode plays a *virtual* edited timeline: when
 * playback reaches the end of a kept region it jumps to the start of the next one. Audio is
 * routed through Web Audio so the same short fade-out/fade-in used by the export is applied
 * around each jump, avoiding clicks. Nothing is re-encoded to preview.
 */
import type { TimeMap } from '../core/timeMap';
import type { TransitionParams } from '../core/types';

export interface PlayerSource {
	readonly timeMap: TimeMap;
	readonly previewMode: 'original' | 'edited';
	readonly transitions: TransitionParams;
	readonly frameRate: number;
}

/** Seconds before the end of a kept region at which the jump is issued (seek latency budget). */
const JUMP_LOOKAHEAD = 0.025;

export class Player {
	currentTime = $state(0);
	playing = $state(false);
	rate = $state(1);
	ready = $state(false);

	private video: HTMLVideoElement | null = null;
	private ctx: AudioContext | null = null;
	private gain: GainNode | null = null;
	private raf = 0;
	private jumping = false;
	private shuttle = 0; // J/L shuttle speed index
	/** Pause automatically when playback reaches this source time (range playback). */
	private stopAt: number | null = null;

	constructor(private readonly source: PlayerSource) {}

	attach(video: HTMLVideoElement) {
		this.video = video;
		video.addEventListener('loadedmetadata', this.onLoaded);
		video.addEventListener('play', this.onPlay);
		video.addEventListener('pause', this.onPause);
		video.addEventListener('ended', this.onPause);
		video.addEventListener('seeked', this.onSeeked);
		return () => {
			video.removeEventListener('loadedmetadata', this.onLoaded);
			video.removeEventListener('play', this.onPlay);
			video.removeEventListener('pause', this.onPause);
			video.removeEventListener('ended', this.onPause);
			video.removeEventListener('seeked', this.onSeeked);
			cancelAnimationFrame(this.raf);
			void this.ctx?.close();
			this.ctx = null;
			this.gain = null;
			this.video = null;
		};
	}

	private onLoaded = () => {
		this.ready = true;
		this.currentTime = this.video?.currentTime ?? 0;
	};

	private onPlay = () => {
		this.playing = true;
		this.loop();
	};

	private onPause = () => {
		this.playing = false;
		this.shuttle = 0;
		this.stopAt = null;
		cancelAnimationFrame(this.raf);
		if (this.video) this.currentTime = this.video.currentTime;
	};

	private onSeeked = () => {
		if (this.video) this.currentTime = this.video.currentTime;
	};

	/** Web Audio graph is created lazily on the first user-initiated play (autoplay policy). */
	private ensureAudioGraph() {
		if (this.ctx || !this.video) return;
		try {
			this.ctx = new AudioContext();
			const src = this.ctx.createMediaElementSource(this.video);
			this.gain = this.ctx.createGain();
			src.connect(this.gain).connect(this.ctx.destination);
		} catch {
			this.ctx = null;
			this.gain = null;
		}
	}

	private loop = () => {
		const v = this.video;
		if (!v || v.paused) return;
		const t = v.currentTime;
		this.currentTime = t;
		if (this.stopAt !== null && t >= this.stopAt) {
			v.pause();
			return;
		}
		if (this.source.previewMode === 'edited' && !this.jumping) {
			const map = this.source.timeMap;
			if (!map.isKept(t)) {
				const next = map.nextKeptTime(t);
				if (next === null) {
					v.pause();
				} else {
					void this.jumpTo(next, false);
				}
			} else {
				const end = map.keptRegionEnd(t);
				if (end !== null && end < v.duration - 0.01 && end - t <= JUMP_LOOKAHEAD * v.playbackRate) {
					const next = map.nextKeptTime(end + 1e-4);
					if (next === null) v.pause();
					else void this.jumpTo(next, true);
				} else if (end !== null && this.gain && this.ctx) {
					// Start the fade-out so it completes as playback reaches the cut.
					const fadeOut = this.source.transitions.fadeOutMs / 1000;
					if (fadeOut > 0 && end - t <= fadeOut + JUMP_LOOKAHEAD && end - t > JUMP_LOOKAHEAD) {
						const g = this.gain.gain;
						if (g.value > 0.99) {
							g.cancelScheduledValues(this.ctx.currentTime);
							g.setValueAtTime(1, this.ctx.currentTime);
							g.linearRampToValueAtTime(
								0.0001,
								this.ctx.currentTime + Math.max(0.005, end - t - JUMP_LOOKAHEAD)
							);
						}
					}
				}
			}
		}
		this.raf = requestAnimationFrame(this.loop);
	};

	private async jumpTo(t: number, fadedOut: boolean) {
		const v = this.video;
		if (!v) return;
		this.jumping = true;
		if (this.gain && this.ctx && !fadedOut) {
			this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
			this.gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
		}
		v.currentTime = t;
		this.currentTime = t;
		await new Promise<void>((resolve) => {
			const done = () => {
				v.removeEventListener('seeked', done);
				resolve();
			};
			v.addEventListener('seeked', done);
			setTimeout(done, 250);
		});
		if (this.gain && this.ctx) {
			const fadeIn = Math.max(0.003, this.source.transitions.fadeInMs / 1000);
			const now = this.ctx.currentTime;
			this.gain.gain.cancelScheduledValues(now);
			this.gain.gain.setValueAtTime(0.0001, now);
			this.gain.gain.linearRampToValueAtTime(1, now + fadeIn);
		}
		this.jumping = false;
	}

	async play() {
		const v = this.video;
		if (!v) return;
		this.ensureAudioGraph();
		void this.ctx?.resume();
		if (this.gain && this.ctx) this.gain.gain.setValueAtTime(1, this.ctx.currentTime);
		if (this.source.previewMode === 'edited') {
			const map = this.source.timeMap;
			if (v.currentTime >= v.duration - 0.05 || map.nextKeptTime(v.currentTime) === null) {
				v.currentTime = map.keeps[0]?.start ?? 0;
			} else if (!map.isKept(v.currentTime)) {
				v.currentTime = map.nextKeptTime(v.currentTime) ?? v.currentTime;
			}
		}
		v.playbackRate = this.rate;
		try {
			await v.play();
		} catch {
			/* play() interrupted by pause() — fine */
		}
	}

	pause() {
		this.video?.pause();
	}

	/** Play [start, end) once, in the current preview mode, then stop. */
	async playRange(start: number, end: number) {
		this.seek(start);
		await this.play();
		this.stopAt = end;
	}

	toggle() {
		if (this.playing) this.pause();
		else void this.play();
	}

	seek(t: number) {
		const v = this.video;
		if (!v) return;
		const clamped = Math.max(0, Math.min(t, Number.isFinite(v.duration) ? v.duration : t));
		v.currentTime = clamped;
		this.currentTime = clamped;
	}

	nudge(seconds: number) {
		this.seek((this.video?.currentTime ?? this.currentTime) + seconds);
	}

	stepFrames(frames: number) {
		this.pause();
		this.nudge(frames / (this.source.frameRate || 30));
	}

	/** J/K/L shuttle. Browsers cannot play backwards, so J steps back in growing jumps. */
	shuttleBack() {
		this.shuttle = Math.min(0, this.shuttle) - 1;
		this.nudge(-2 * Math.abs(this.shuttle));
	}

	shuttleStop() {
		this.shuttle = 0;
		this.rate = 1;
		if (this.video) this.video.playbackRate = 1;
		this.pause();
	}

	shuttleForward() {
		this.shuttle = Math.max(0, this.shuttle) + 1;
		const rates = [1, 1, 1.5, 2, 3];
		this.rate = rates[Math.min(rates.length - 1, this.shuttle)];
		if (this.video) this.video.playbackRate = this.rate;
		if (!this.playing) void this.play();
	}

	setRate(rate: number) {
		this.rate = rate;
		if (this.video) this.video.playbackRate = rate;
	}
}
