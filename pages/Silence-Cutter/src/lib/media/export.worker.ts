/// <reference lib="webworker" />
/**
 * Local export: EDL kept ranges → MP4 (H.264 + AAC where available), entirely in the browser.
 *
 * Video frames are decoded with WebCodecs (Mediabunny VideoSampleSink), re-timestamped onto the
 * edited timeline and re-encoded (hardware encoder preferred). Re-encoding is required for
 * frame-accurate cuts that do not fall on keyframes. Audio is decoded, faded/crossfaded at each
 * join (see exportPlan.ts) and re-encoded. Both pipelines run concurrently so the muxer can
 * interleave without buffering a whole track.
 *
 * Output streams straight to disk via the File System Access API when a handle is supplied, to
 * the Origin Private File System otherwise, and only as a last resort to an in-memory buffer.
 */
import {
	ALL_FORMATS,
	AudioSample,
	AudioSampleSink,
	AudioSampleSource,
	BlobSource,
	BufferTarget,
	Input,
	Mp4OutputFormat,
	Output,
	Quality,
	StreamTarget,
	VideoSampleSink,
	VideoSampleSource,
	canEncodeAudio,
	getFirstEncodableAudioCodec,
	getFirstEncodableVideoCodec,
	type AudioCodec,
	type StreamTargetChunk,
	type Target,
	type VideoCodec
} from 'mediabunny';
import type { Range, TransitionParams } from '../core/types';
import {
	exportBitrates,
	JoinMixer,
	planAudioSegments,
	segmentGain,
	type ExportQuality
} from './exportPlan';

declare const self: DedicatedWorkerGlobalScope;

export type ExportTarget =
	| { kind: 'handle'; handle: FileSystemFileHandle }
	| { kind: 'opfs'; name: string }
	| { kind: 'buffer' };

export type ExportRequest =
	| {
			type: 'export';
			file: File;
			keeps: Range[];
			duration: number;
			frameRate: number;
			transitions: TransitionParams;
			quality: ExportQuality;
			target: ExportTarget;
	  }
	| { type: 'cancel' };

export interface ExportSummary {
	bytes: number;
	wallMs: number;
	editedSeconds: number;
	videoCodec: string | null;
	audioCodec: string | null;
	videoBitrate: number;
	audioBitrate: number;
	width: number;
	height: number;
	usedAacPolyfill: boolean;
	target: ExportTarget['kind'];
}

export type ExportResponse =
	| { type: 'progress'; seconds: number; total: number; phase: 'video' | 'audio' | 'finalizing' }
	| { type: 'done'; summary: ExportSummary; buffer?: ArrayBuffer; opfsName?: string }
	| { type: 'cancelled' }
	| { type: 'error'; message: string };

let cancelled = false;
let activeOutput: Output | null = null;

function post(msg: ExportResponse, transfer: Transferable[] = []) {
	self.postMessage(msg, transfer);
}

/** Adapts a positioned-write stream (FS Access / OPFS) to Mediabunny's StreamTarget. */
function positionedStream(writable: FileSystemWritableFileStream, counter: { bytes: number }) {
	return new WritableStream<StreamTargetChunk>({
		async write(chunk) {
			await writable.write({ type: 'write', position: chunk.position, data: chunk.data });
			counter.bytes = Math.max(counter.bytes, chunk.position + chunk.data.byteLength);
		},
		async close() {
			await writable.close();
		},
		async abort() {
			await writable.abort();
		}
	});
}

async function openTarget(target: ExportTarget, counter: { bytes: number }) {
	if (target.kind === 'buffer') {
		const t = new BufferTarget();
		return { target: t as Target, buffer: t };
	}
	let handle: FileSystemFileHandle;
	if (target.kind === 'handle') {
		handle = target.handle;
	} else {
		const root = await navigator.storage.getDirectory();
		handle = await root.getFileHandle(target.name, { create: true });
	}
	const writable = await handle.createWritable();
	return { target: new StreamTarget(positionedStream(writable, counter)) as Target, buffer: null };
}

async function runExport(req: Extract<ExportRequest, { type: 'export' }>) {
	const started = performance.now();
	const input = new Input({ source: new BlobSource(req.file), formats: ALL_FORMATS });
	const counter = { bytes: 0 };
	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		const audioTrack = await input.getPrimaryAudioTrack();
		const editedSeconds = req.keeps.reduce((a, k) => a + (k.end - k.start), 0);
		if (editedSeconds <= 0) throw new Error('Nothing to export: every region is removed.');

		const width = videoTrack ? await videoTrack.getDisplayWidth() : 0;
		const height = videoTrack ? await videoTrack.getDisplayHeight() : 0;
		const codedWidth = videoTrack ? await videoTrack.getCodedWidth() : 0;
		const codedHeight = videoTrack ? await videoTrack.getCodedHeight() : 0;
		const fps = req.frameRate > 0 ? req.frameRate : 30;
		const videoStats = videoTrack
			? await videoTrack.computePacketStats(300).catch(() => null)
			: null;
		const audioStats = audioTrack
			? await audioTrack.computePacketStats(300).catch(() => null)
			: null;
		const rates = exportBitrates(req.quality, {
			videoBitrate: videoStats?.averageBitrate ?? null,
			audioBitrate: audioStats?.averageBitrate ?? null,
			width,
			height,
			fps
		});

		let videoCodec: VideoCodec | null = null;
		if (videoTrack) {
			videoCodec = await getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], {
				width: codedWidth,
				height: codedHeight,
				bitrate: rates.video
			});
			if (!videoCodec) throw new Error('This browser cannot encode video at this resolution.');
		}

		let audioCodec: AudioCodec | null = null;
		let usedAacPolyfill = false;
		let sampleRate = 48000;
		let channels = 2;
		if (audioTrack) {
			sampleRate = await audioTrack.getSampleRate();
			channels = Math.min(2, await audioTrack.getNumberOfChannels());
			const opts = { numberOfChannels: channels, sampleRate, bitrate: rates.audio };
			if (!(await canEncodeAudio('aac', opts))) {
				const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
				registerAacEncoder();
				usedAacPolyfill = true;
			}
			audioCodec = await getFirstEncodableAudioCodec(['aac', 'opus'], opts);
			if (!audioCodec) throw new Error('This browser cannot encode audio.');
		}

		const { target, buffer } = await openTarget(req.target, counter);
		const maxVideoPackets = Math.ceil(editedSeconds * fps * 1.5) + 120;
		const maxAudioPackets = Math.ceil(((editedSeconds * sampleRate) / 1024) * 1.5) + 120;
		const output = new Output({
			format: new Mp4OutputFormat({ fastStart: buffer ? 'in-memory' : 'reserve' }),
			target
		});
		activeOutput = output;

		let videoSource: VideoSampleSource | null = null;
		if (videoTrack && videoCodec) {
			videoSource = new VideoSampleSource({
				codec: videoCodec,
				quality: new Quality({ bitrate: rates.video }),
				keyFrameInterval: 2,
				hardwareAcceleration: 'prefer-hardware',
				sizeChangeBehavior: 'contain'
			});
			output.addVideoTrack(videoSource, {
				rotation: await videoTrack.getRotation(),
				frameRate: fps,
				maximumPacketCount: maxVideoPackets
			});
		}
		let audioSource: AudioSampleSource | null = null;
		if (audioTrack && audioCodec) {
			audioSource = new AudioSampleSource({
				codec: audioCodec,
				quality: new Quality({ bitrate: rates.audio })
			});
			output.addAudioTrack(audioSource, { maximumPacketCount: maxAudioPackets });
		}
		await output.start();

		let videoDone = 0;
		let audioDone = 0;
		let lastPost = 0;
		const report = (phase: 'video' | 'audio') => {
			const now = performance.now();
			if (now - lastPost < 150) return;
			lastPost = now;
			const seconds = Math.min(
				videoSource ? videoDone : editedSeconds,
				audioSource ? audioDone : editedSeconds
			);
			post({ type: 'progress', seconds, total: editedSeconds, phase });
		};

		const videoLoop = async () => {
			if (!videoTrack || !videoSource) return;
			const sink = new VideoSampleSink(videoTrack);
			let out = 0;
			const frameDur = 1 / fps;
			for (const k of req.keeps) {
				for await (const sample of sink.samples(k.start, k.end)) {
					if (cancelled) {
						sample.close();
						return;
					}
					const ts = sample.timestamp;
					const end = ts + (sample.duration || frameDur);
					if (end <= k.start + 1e-6 || ts >= k.end - 1e-6) {
						sample.close();
						continue;
					}
					const newStart = out + Math.max(0, ts - k.start);
					const newEnd = out + Math.min(k.end, end) - k.start;
					sample.setTimestamp(newStart);
					sample.setDuration(Math.max(1e-4, newEnd - newStart));
					await videoSource.add(sample);
					sample.close();
					videoDone = newEnd;
					report('video');
				}
				out += k.end - k.start;
			}
			videoSource.close();
		};

		const audioLoop = async () => {
			if (!audioTrack || !audioSource) return;
			const sink = new AudioSampleSink(audioTrack);
			const plans = planAudioSegments(req.keeps, req.duration, req.transitions);
			const mixer = new JoinMixer(channels);
			const toFrame = (t: number) => Math.round(t * sampleRate);
			const emit = async (chunk: ReturnType<JoinMixer['flushUntil']>) => {
				if (!chunk) return;
				const data = new Float32Array(chunk.frames * channels);
				for (let c = 0; c < channels; c++) data.set(chunk.planes[c], c * chunk.frames);
				const sample = new AudioSample({
					data,
					format: 'f32-planar',
					numberOfChannels: channels,
					sampleRate,
					timestamp: chunk.startFrame / sampleRate
				});
				await audioSource.add(sample);
				sample.close();
				audioDone = (chunk.startFrame + chunk.frames) / sampleRate;
				report('audio');
			};
			for (let i = 0; i < plans.length; i++) {
				const p = plans[i];
				const spanStart = Math.max(0, p.start - p.handleBefore);
				const spanEnd = Math.min(req.duration, p.end + p.handleAfter);
				// Output frame of source frame f: f - toFrame(p.start) + toFrame(p.outStart)
				const shift = toFrame(p.outStart) - toFrame(p.start);
				const spanStartFrame = toFrame(spanStart);
				const spanEndFrame = toFrame(spanEnd);
				for await (const sample of sink.samples(spanStart, spanEnd)) {
					if (cancelled) {
						sample.close();
						return;
					}
					const sFrame = Math.round(sample.timestamp * sampleRate);
					const from = Math.max(spanStartFrame, sFrame);
					const to = Math.min(spanEndFrame, sFrame + sample.numberOfFrames);
					if (to <= from) {
						sample.close();
						continue;
					}
					const n = to - from;
					const planes: Float32Array[] = [];
					const srcChannels = sample.numberOfChannels;
					for (let c = 0; c < channels; c++) {
						const plane = new Float32Array(n);
						sample.copyTo(plane, {
							planeIndex: Math.min(c, srcChannels - 1),
							format: 'f32-planar',
							frameOffset: from - sFrame,
							frameCount: n
						});
						planes.push(plane);
					}
					sample.close();
					for (let j = 0; j < n; j++) {
						const g = segmentGain(p, (from + j) / sampleRate);
						if (g !== 1) for (let c = 0; c < channels; c++) planes[c][j] *= g;
					}
					mixer.add(from + shift, planes, n);
					// Everything before the next segment's first output frame is final.
					const next = plans[i + 1];
					const safe = next
						? toFrame(next.outStart) - toFrame(next.handleBefore)
						: Number.POSITIVE_INFINITY;
					await emit(mixer.flushUntil(Math.min(safe, from + shift + n)));
				}
			}
			await emit(mixer.flushAll());
			audioSource.close();
		};

		await Promise.all([videoLoop(), audioLoop()]);
		if (cancelled) {
			await output.cancel();
			post({ type: 'cancelled' });
			return;
		}
		post({ type: 'progress', seconds: editedSeconds, total: editedSeconds, phase: 'finalizing' });
		await output.finalize();

		const summary: ExportSummary = {
			bytes: buffer?.buffer?.byteLength ?? counter.bytes,
			wallMs: performance.now() - started,
			editedSeconds,
			videoCodec,
			audioCodec,
			videoBitrate: rates.video,
			audioBitrate: rates.audio,
			width,
			height,
			usedAacPolyfill,
			target: req.target.kind
		};
		if (buffer?.buffer) {
			post({ type: 'done', summary, buffer: buffer.buffer }, [buffer.buffer]);
		} else {
			post({
				type: 'done',
				summary,
				opfsName: req.target.kind === 'opfs' ? req.target.name : undefined
			});
		}
	} finally {
		activeOutput = null;
		input.dispose();
	}
}

self.onmessage = async (event: MessageEvent<ExportRequest>) => {
	const msg = event.data;
	if (msg.type === 'cancel') {
		cancelled = true;
		return;
	}
	cancelled = false;
	try {
		await runExport(msg);
	} catch (err) {
		try {
			await activeOutput?.cancel();
		} catch {
			/* ignore */
		}
		if (cancelled) post({ type: 'cancelled' });
		else post({ type: 'error', message: (err as Error)?.message ?? String(err) });
	}
};
