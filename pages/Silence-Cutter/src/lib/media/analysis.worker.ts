/// <reference lib="webworker" />
/**
 * Local media analysis: demux with Mediabunny (MP4/MOV/…), decode audio with WebCodecs,
 * downmix to mono and stream through:
 *   - a band-limited resampler → 16 kHz PCM for ASR (the only uncompressed copy kept)
 *   - an RMS envelope (10 ms hop) for the silence detector
 *   - a min/max peak builder for the waveform display
 * The source file is read in place from the user's disk (BlobSource); nothing is uploaded.
 */
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { EnvelopeBuilder } from '../core/audioDetector';
import { PeakBuilder } from './peaks';
import { StreamingResampler } from './resampler';
import type { AnalysisRequest, AnalysisResponse, MediaInfo } from './types';

declare const self: DedicatedWorkerGlobalScope;

const TARGET_RATE = 16000;

function post(msg: AnalysisResponse, transfer: Transferable[] = []) {
	self.postMessage(msg, transfer);
}

/** Growable Float32 buffer with a capacity hint to avoid repeated copies. */
class PcmAccumulator {
	private data: Float32Array;
	length = 0;
	constructor(capacity: number) {
		this.data = new Float32Array(Math.max(1024, capacity));
	}
	push(x: Float32Array) {
		if (this.length + x.length > this.data.length) {
			const next = new Float32Array(Math.max(this.data.length * 1.5, this.length + x.length));
			next.set(this.data.subarray(0, this.length));
			this.data = next;
		}
		this.data.set(x, this.length);
		this.length += x.length;
	}
	finish(): Float32Array {
		return this.length === this.data.length ? this.data : this.data.slice(0, this.length);
	}
}

export async function probe(input: Input): Promise<MediaInfo> {
	const format = await input.getFormat();
	const [video, audio] = await Promise.all([
		input.getPrimaryVideoTrack(),
		input.getPrimaryAudioTrack()
	]);
	const durationSeconds = await input.computeDuration();
	let videoInfo: MediaInfo['video'] = null;
	if (video) {
		const [codec, width, height, rotation, canDecode] = await Promise.all([
			video.getCodec(),
			video.getDisplayWidth(),
			video.getDisplayHeight(),
			video.getRotation(),
			video.canDecode()
		]);
		let frameRate: number | null = null;
		let bitrate: number | null = null;
		try {
			const stats = await video.computePacketStats(300);
			frameRate = stats.averagePacketRate || null;
			bitrate = stats.averageBitrate || null;
		} catch {
			/* optional */
		}
		videoInfo = { codec, width, height, rotation, frameRate, bitrate, canDecode };
	}
	let audioInfo: MediaInfo['audio'] = null;
	if (audio) {
		const [codec, sampleRate, channels, canDecode] = await Promise.all([
			audio.getCodec(),
			audio.getSampleRate(),
			audio.getNumberOfChannels(),
			audio.canDecode()
		]);
		let bitrate: number | null = null;
		try {
			bitrate = (await audio.computePacketStats(300)).averageBitrate || null;
		} catch {
			/* optional */
		}
		audioInfo = { codec, sampleRate, channels, bitrate, canDecode };
	}
	return {
		durationSeconds,
		container: format.name,
		mimeType: await input.getMimeType().catch(() => format.mimeType),
		video: videoInfo,
		audio: audioInfo
	};
}

async function analyse(file: File) {
	const started = performance.now();
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		if (!(await input.canRead())) {
			post({ type: 'error', code: 'unreadable', message: 'This file format could not be read.' });
			return;
		}
		const info = await probe(input);
		post({ type: 'info', info });
		const track = await input.getPrimaryAudioTrack();
		if (!track || !info.audio) {
			post({ type: 'error', code: 'no-audio', message: 'This video has no audio track.' });
			return;
		}
		if (!info.audio.canDecode) {
			post({
				type: 'error',
				code: 'unsupported-audio',
				message: `This browser cannot decode the "${info.audio.codec ?? 'unknown'}" audio codec.`
			});
			return;
		}

		const resampler = new StreamingResampler(info.audio.sampleRate, TARGET_RATE);
		const envelope = new EnvelopeBuilder(TARGET_RATE, 0.01);
		const peaks = new PeakBuilder(TARGET_RATE, 32);
		const pcm = new PcmAccumulator(Math.ceil(info.durationSeconds * TARGET_RATE) + TARGET_RATE);
		const sink = new AudioSampleSink(track);
		const decodeStarted = performance.now();
		let lastProgress = 0;
		let mono = new Float32Array(0);
		let plane = new Float32Array(0);

		const consume = (x: Float32Array) => {
			if (x.length === 0) return;
			pcm.push(x);
			envelope.push(x);
			peaks.push(x);
		};

		let first = true;
		for await (const sample of sink.samples()) {
			const frames = sample.numberOfFrames;
			const channels = sample.numberOfChannels;
			if (mono.length < frames) mono = new Float32Array(frames);
			if (plane.length < frames) plane = new Float32Array(frames);
			let m = mono.subarray(0, frames);
			m.fill(0);
			for (let c = 0; c < channels; c++) {
				const p = plane.subarray(0, frames);
				sample.copyTo(p, { planeIndex: c, format: 'f32-planar' });
				for (let i = 0; i < frames; i++) m[i] += p[i];
			}
			if (channels > 1) for (let i = 0; i < frames; i++) m[i] /= channels;
			const t = sample.timestamp + sample.duration;
			if (first) {
				// Index the PCM from presentation time 0 so it lines up with the video timeline:
				// pad a late-starting track with silence, drop pre-roll before 0.
				first = false;
				if (sample.timestamp > 0) {
					consume(new Float32Array(Math.round(sample.timestamp * TARGET_RATE)));
				} else if (sample.timestamp < 0) {
					m = m.subarray(Math.min(frames, Math.round(-sample.timestamp * sample.sampleRate)));
				}
			}
			sample.close();
			consume(resampler.push(m));
			if (t - lastProgress > 2) {
				lastProgress = t;
				post({ type: 'progress', seconds: t, total: info.durationSeconds });
			}
		}
		consume(resampler.flush());
		const decodeMs = performance.now() - decodeStarted;

		const env = envelope.finish();
		const pcm16k = pcm.finish();
		const peakData = peaks.finish();
		post(
			{
				type: 'done',
				result: {
					info,
					pcm16k,
					envelopeDb: env.db,
					envelopeHop: env.hopSeconds,
					peaks: peakData,
					peakBucketSeconds: 32 / TARGET_RATE,
					timings: { decodeMs, totalMs: performance.now() - started }
				}
			},
			[pcm16k.buffer, env.db.buffer, peakData.buffer]
		);
	} finally {
		input.dispose();
	}
}

self.onmessage = async (event: MessageEvent<AnalysisRequest>) => {
	try {
		await analyse(event.data.file);
	} catch (err) {
		post({ type: 'error', message: (err as Error)?.message ?? String(err) });
	}
};
