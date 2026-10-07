/// <reference lib="webworker" />
/**
 * On-device speech recognition worker (Transformers.js + ONNX Runtime Web, WebGPU → WASM).
 *
 * Runs the CrisperWhisper 2.0 verbatim decoding procedure (ported from the MIT-licensed upstream
 * inference code) on any Whisper-architecture ONNX export with cross-attention outputs:
 *
 *   prompt  = [verbatim_1..5] (<ctx> last confirmed words <ectx>)? <|sot|> <|lang|> <|transcribe|> <|notimestamps|>
 *   decode  = greedy, with cross-attention captured inline per token (alignment heads averaged)
 *   repair  = n-gram loop rewind + one-step ban (thresholds high enough to keep real stutters)
 *   timing  = mel-blank Viterbi over attention (wordTiming.ts)
 *   longform= 30 s windows / 26 s stride, conditional continuation, overlap-aware word drop
 *
 * Standard Whisper models use the same machinery with a plain Whisper prompt and timestamp-based
 * seam de-duplication (they were not trained for <ctx> continuation).
 *
 * Audio arrives as 16 kHz mono PCM and never leaves this worker except to be handed back.
 */
import {
	AutoProcessor,
	AutoTokenizer,
	LogitsProcessor,
	LogitsProcessorList,
	StoppingCriteria,
	StoppingCriteriaList,
	Tensor,
	WhisperForConditionalGeneration,
	env
} from '@huggingface/transformers';
import { classifyWord } from '../core/transcriptDetector';
import type { TranscriptWord } from '../core/types';
import {
	DEFAULT_LONGFORM,
	SAMPLE_RATE,
	clipToAudio,
	fillGaps,
	findTokenLoop,
	isUndercovered,
	monotonize,
	overlapDropIndex,
	planChunks,
	speechActiveSeconds,
	uncoveredGaps,
	uncoveredSpeechSeconds
} from './crisper/longform';
import {
	extractWordTimings,
	isSpecialPiece,
	melFrameEnergy,
	type TimedWord
} from './crisper/wordTiming';
// ONNX Runtime's WASM loader and binary, emitted by Vite as hashed same-origin assets (no CDN).
// These must be the files of the onnxruntime-web copy that Transformers.js imports.
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { OpfsModelCache } from './modelCache';
import type { AsrRequest, AsrResponse } from './protocol';
import type { ModelSpec, ModelVariant, RuntimeInfo } from './types';

declare const self: DedicatedWorkerGlobalScope;

/* eslint-disable @typescript-eslint/no-explicit-any -- Transformers.js internals are loosely typed */

interface LoadedModel {
	spec: ModelSpec;
	variant: ModelVariant;
	model: any;
	tokenizer: any;
	processor: any;
	runtime: RuntimeInfo;
	ids: {
		sot: number;
		eot: number;
		transcribe: number;
		noTimestamps: number;
		startOfPrev: number | null;
		lang: Record<string, number>;
	};
	alignmentHeads: Array<[number, number]>;
	suppressTokens: number[];
	pieceCache: Map<number, string>;
}

let loaded: LoadedModel | null = null;
let cancelled = false;
let busy = false;

function post(msg: AsrResponse, transfer: Transferable[] = []) {
	self.postMessage(msg, transfer);
}

class CancelCriteria extends StoppingCriteria {
	_call(inputIds: number[][]): boolean[] {
		return inputIds.map(() => cancelled);
	}
}

/** Bans the given tokens only on the first generated step (upstream `_FirstStepBan`). */
class FirstStepBan extends LogitsProcessor {
	constructor(
		private readonly prefixLen: number,
		private readonly banned: number[]
	) {
		super();
	}
	_call(inputIds: bigint[][], logits: any) {
		for (let b = 0; b < inputIds.length; b++) {
			if (inputIds[b].length !== this.prefixLen) continue;
			const data = logits[b].data as Float32Array;
			for (const t of this.banned) data[t] = -Infinity;
		}
		return logits;
	}
}

async function detectRuntime(backend: 'webgpu' | 'wasm'): Promise<RuntimeInfo> {
	let adapterDescription: string | null = null;
	let f16 = false;
	if (backend === 'webgpu' && 'gpu' in navigator) {
		try {
			const adapter = await (navigator as any).gpu.requestAdapter({
				powerPreference: 'high-performance'
			});
			if (adapter) {
				const info = adapter.info ?? {};
				adapterDescription =
					[info.vendor, info.architecture, info.description].filter(Boolean).join(' ') || null;
				f16 = adapter.features.has('shader-f16');
			}
		} catch {
			/* adapter info is optional */
		}
	}
	return {
		backend,
		adapterDescription,
		f16,
		threads: (env.backends.onnx as any)?.wasm?.numThreads ?? 1,
		crossOriginIsolated: self.crossOriginIsolated
	};
}

async function load(spec: ModelSpec, variant: ModelVariant) {
	const started = performance.now();
	const onnx = env.backends.onnx as any;
	onnx.wasm.wasmPaths = {
		mjs: new URL(ortMjsUrl, self.location.href).href,
		wasm: new URL(ortWasmUrl, self.location.href).href
	};
	onnx.wasm.numThreads = self.crossOriginIsolated
		? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1))
		: 1;
	env.allowLocalModels = false;
	// Model weights are cached in OPFS (see modelCache.ts); the Cache API is unreliable for
	// entries of several hundred MB.
	const cache = new OpfsModelCache();
	const canUseOpfs = typeof navigator.storage?.getDirectory === 'function';
	env.useBrowserCache = !canUseOpfs;
	(env as any).useCustomCache = canUseOpfs;
	(env as any).customCache = canUseOpfs ? cache : null;

	const expected = new Map(variant.files.map((f) => [f.path, f.bytes]));
	const overallTotal = variant.files.reduce((a, f) => a + f.bytes, 0);
	const loadedBytes = new Map<string, number>();
	const fileUrl = (file: string) => `https://huggingface.co/${spec.repo}/resolve/main/${file}`;
	const isCached = (file: string) => cache.hits.has(fileUrl(file));
	let windowStart = performance.now();
	let windowBytes = 0;
	let speed: number | null = null;
	let lastPost = 0;

	let lastFileReady = performance.now();
	const progress = (p: any) => {
		if (!p?.file) return;
		if (p.status === 'done') lastFileReady = performance.now();
		if (p.status !== 'progress' && p.status !== 'done') return;
		const total = p.total || expected.get(p.file) || 0;
		const prev = loadedBytes.get(p.file) ?? 0;
		const now = p.status === 'done' ? Math.max(prev, total) : (p.loaded ?? prev);
		loadedBytes.set(p.file, now);
		windowBytes += Math.max(0, now - prev);
		const t = performance.now();
		if (t - windowStart > 500) {
			speed = (windowBytes / (t - windowStart)) * 1000;
			windowStart = t;
			windowBytes = 0;
		}
		if (t - lastPost < 100 && p.status !== 'done') return;
		lastPost = t;
		let overallLoaded = 0;
		for (const v of loadedBytes.values()) overallLoaded += v;
		post({
			type: 'download',
			progress: {
				file: p.file,
				loadedBytes: now,
				totalBytes: total,
				overallLoaded: Math.min(overallLoaded, overallTotal),
				overallTotal,
				bytesPerSecond: speed,
				fromCache: isCached(p.file)
			}
		});
	};

	const [model, tokenizer, processor] = await Promise.all([
		WhisperForConditionalGeneration.from_pretrained(spec.repo, {
			dtype: variant.dtype as any,
			device: variant.backend,
			progress_callback: progress
		}),
		AutoTokenizer.from_pretrained(spec.repo, { progress_callback: progress }),
		AutoProcessor.from_pretrained(spec.repo, { progress_callback: progress })
	]);

	// Reuse the encoder output when a window is decoded more than once (loop repair, early-EOT
	// recovery, context reset): the encoder is the most expensive part of each window.
	let encoderCache: { features: unknown; out: unknown } | null = null;
	const m = model as any;
	const prepareEncoder = m._prepare_encoder_decoder_kwargs_for_generation.bind(m);
	m._prepare_encoder_decoder_kwargs_for_generation = async (args: any) => {
		if (encoderCache && encoderCache.features === args.inputs_tensor) {
			args.model_inputs.encoder_outputs = encoderCache.out;
			return args.model_inputs;
		}
		const res = await prepareEncoder(args);
		encoderCache = { features: args.inputs_tensor, out: res.encoder_outputs };
		return res;
	};

	const filesMs = lastFileReady - started;
	const sessionMs = performance.now() - lastFileReady;
	const gc = (model as any).generation_config ?? {};
	const vocab: Map<string, number> | Record<string, number> =
		(tokenizer as any).get_vocab?.() ?? {};
	const lookup = (tok: string): number | undefined =>
		vocab instanceof Map ? vocab.get(tok) : (vocab as Record<string, number>)[tok];
	const lang: Record<string, number> = {};
	for (const [tok, id] of Object.entries((gc.lang_to_id ?? {}) as Record<string, number>)) {
		lang[tok.slice(2, -2)] = id;
	}
	// We always force the exact decoder prompt; disable model-default forced/begin tokens so
	// first-step behaviour matches upstream (EOT allowed as the first token).
	gc.forced_decoder_ids = null;
	gc.begin_suppress_tokens = null;

	loaded = {
		spec,
		variant,
		model,
		tokenizer,
		processor,
		runtime: await detectRuntime(variant.backend),
		ids: {
			sot: gc.decoder_start_token_id ?? lookup('<|startoftranscript|>')!,
			eot: Array.isArray(gc.eos_token_id) ? gc.eos_token_id[0] : (gc.eos_token_id ?? 50257),
			transcribe: gc.task_to_id?.transcribe ?? lookup('<|transcribe|>')!,
			noTimestamps: gc.no_timestamps_token_id ?? lookup('<|notimestamps|>')!,
			startOfPrev: gc.prev_sot_token_id ?? lookup('<|startofprev|>') ?? null,
			lang
		},
		alignmentHeads: (gc.alignment_heads ?? []).map(
			(h: number[]) => [h[0], h[1]] as [number, number]
		),
		suppressTokens: (gc.suppress_tokens ?? []).filter((t: number) => t >= 0),
		pieceCache: new Map()
	};
	if (loaded.alignmentHeads.length === 0) {
		throw new Error('Model has no alignment heads; word timestamps are unavailable.');
	}
	const downloadedBytes = variant.files
		.filter((f) => !isCached(f.path))
		.reduce((a, f) => a + f.bytes, 0);
	post({
		type: 'loaded',
		runtime: loaded.runtime,
		loadMs: performance.now() - started,
		filesMs,
		sessionMs,
		downloadedBytes
	});
}

function encodeText(text: string): number[] {
	const ids = loaded!.tokenizer.encode(text, { add_special_tokens: false });
	return Array.from(ids as ArrayLike<number>, Number);
}

function piece(id: number): string {
	const cache = loaded!.pieceCache;
	let p = cache.get(id);
	if (p === undefined) {
		p = loaded!.tokenizer.decode([id], { skip_special_tokens: false }) as string;
		cache.set(id, p);
	}
	return p;
}

function decodeGroup(ids: number[]): string {
	const filtered = ids.filter((id) => !isSpecialPiece(piece(id)));
	return loaded!.tokenizer.decode(filtered, { skip_special_tokens: true }) as string;
}

function buildPrompt(
	language: string,
	mode: 'verbatim' | 'intended',
	context: string | null
): number[] {
	const { ids, spec } = loaded!;
	const langId = ids.lang[language] ?? ids.lang.en;
	const prefix = [ids.sot, langId, ids.transcribe, ids.noTimestamps].filter((x) => x != null);
	if (spec.family === 'crisperwhisper') {
		const tag = mode === 'verbatim' ? 'verbatim' : 'intended';
		let text = [1, 2, 3, 4, 5].map((i) => `[${tag}_${i}]`).join('');
		if (context) text += ` <ctx> ${context} <ectx>`;
		return [...encodeText(text), ...prefix];
	}
	if (context && ids.startOfPrev != null) {
		return [ids.startOfPrev, ...encodeText(` ${context}`).slice(-200), ...prefix];
	}
	return prefix;
}

interface Decode {
	ids: number[];
	attention: Float32Array[];
	/** P(EOT) at the step where greedy decoding stopped; null if it ran out of tokens. */
	stopProb: number | null;
	timing: { encoderMs: number; steps: number; stepMs: number };
}

/**
 * Bans EOT for the first `minNew` generated steps and records the soft-max probability of EOT
 * at the step where it becomes the argmax (upstream `_EotGate`). Runs after the built-in
 * suppression processors, so the probability is measured over the same masked distribution.
 */
class EotGate extends LogitsProcessor {
	stopProb: number | null = null;
	constructor(
		private readonly prefixLen: number,
		private readonly eot: number,
		private readonly minNew: number
	) {
		super();
	}
	_call(inputIds: bigint[][], logits: any) {
		const step = inputIds[0].length - this.prefixLen;
		const data = logits[0].data as Float32Array;
		if (step < this.minNew) data[this.eot] = -Infinity;
		let max = -Infinity;
		let arg = 0;
		for (let i = 0; i < data.length; i++) {
			if (data[i] > max) {
				max = data[i];
				arg = i;
			}
		}
		if (arg === this.eot) {
			let sum = 0;
			for (let i = 0; i < data.length; i++) sum += Math.exp(data[i] - max);
			this.stopProb = 1 / sum;
		}
		return logits;
	}
}

/**
 * Greedy (or sampled) decode forcing `prompt`, capturing per-token cross-attention inline by
 * wrapping the model's forward pass. Only the alignment-head average of the last query row is
 * kept per step (a few KB per token), so memory stays flat on long recordings.
 */
async function generate(
	features: any,
	prompt: number[],
	maxNew: number,
	opts: { banFirst?: number[]; temperature?: number; minNew?: number } = {}
): Promise<Decode> {
	const { model, alignmentHeads, ids } = loaded!;
	const rows: Float32Array[] = [];
	const originalForward = model.forward;
	const started = performance.now();
	let firstForward = 0;
	let stepTotal = 0;
	let steps = 0;
	model.forward = async (inputs: any) => {
		const t = performance.now();
		if (!firstForward) firstForward = t;
		const out = await originalForward.call(model, inputs);
		let acc: Float32Array | null = null;
		for (const [layer, head] of alignmentHeads) {
			const tensor = out[`cross_attentions.${layer}`];
			if (!tensor) continue;
			const [, heads, q, frames] = tensor.dims as number[];
			if (head >= heads) continue;
			const data: Float32Array =
				tensor.location && tensor.location !== 'cpu'
					? await tensor.getData?.()
					: (tensor.data as Float32Array);
			if (!acc) acc = new Float32Array(frames);
			const off = (head * q + (q - 1)) * frames;
			for (let f = 0; f < frames; f++) acc[f] += data[off + f];
		}
		if (acc) {
			for (let f = 0; f < acc.length; f++) acc[f] /= alignmentHeads.length;
			rows.push(acc);
		}
		stepTotal += performance.now() - t;
		steps++;
		return out;
	};
	const gate = new EotGate(prompt.length, ids.eot, opts.minNew ?? 0);
	const logitsProcessor = new LogitsProcessorList();
	if (opts.banFirst?.length) logitsProcessor.push(new FirstStepBan(prompt.length, opts.banFirst));
	logitsProcessor.push(gate);
	const stopping = new StoppingCriteriaList();
	stopping.push(new CancelCriteria());
	let sequence: number[];
	try {
		const out = await model.generate({
			inputs: features,
			decoder_input_ids: prompt,
			max_new_tokens: maxNew,
			suppress_tokens: loaded!.suppressTokens,
			begin_suppress_tokens: null,
			forced_decoder_ids: null,
			return_timestamps: false,
			do_sample: !!opts.temperature,
			temperature: opts.temperature ?? 1,
			top_k: 0,
			logits_processor: logitsProcessor,
			stopping_criteria: stopping
		});
		const seq = (out.sequences ?? out) as Tensor;
		sequence = Array.from(seq.tolist()[0] as Array<bigint | number>, Number);
	} finally {
		model.forward = originalForward;
	}
	let gen = sequence.slice(prompt.length);
	let attention = rows.slice(0, gen.length);
	const stoppedOnEot = gen.length > 0 && gen[gen.length - 1] === ids.eot;
	while (gen.length && gen[gen.length - 1] === ids.eot) {
		gen = gen.slice(0, -1);
		attention = attention.slice(0, gen.length);
	}
	return {
		ids: gen,
		attention,
		stopProb: stoppedOnEot ? gate.stopProb : null,
		timing: {
			encoderMs: firstForward ? firstForward - started : 0,
			steps,
			stepMs: steps ? stepTotal / steps : 0
		}
	};
}

/** Greedy decode with upstream's rewind/escape loop repair. */
async function generateWithRepair(features: any, prompt: number[], maxNew: number) {
	const first = await generate(features, prompt, maxNew);
	let { ids: gen, attention, stopProb } = first;
	let repairs = 0;
	for (let attempt = 0; attempt < 3; attempt++) {
		const hit = findTokenLoop(gen);
		if (!hit || cancelled) break;
		repairs++;
		const keepEnd = hit.start + hit.gram.length;
		const trimmed = gen.slice(0, keepEnd);
		const keptAttn = attention.slice(0, keepEnd);
		const remaining = maxNew - trimmed.length;
		if (remaining <= 0) {
			gen = trimmed;
			attention = keptAttn;
			break;
		}
		const tail = await generate(features, [...prompt, ...trimmed], remaining, {
			banFirst: [hit.gram[0]]
		});
		gen = [...trimmed, ...tail.ids];
		attention = [...keptAttn, ...tail.attention];
		stopProb = tail.stopProb;
	}
	const final = findTokenLoop(gen);
	if (final) {
		const keepEnd = final.start + final.gram.length;
		gen = gen.slice(0, keepEnd);
		attention = attention.slice(0, keepEnd);
	}
	return { ids: gen, attention, repairs, stopProb, timing: first.timing };
}

/**
 * Early-EOT recovery (upstream `recover_early_eot`): context-conditioned decodes can stop
 * over-confidently at a sentence-final pause and silently drop the rest of a window. Only when
 * (1) at least `tailMin` seconds of speech-active audio follow the last word and (2) the stop was
 * not confident (P(EOT) < 0.7) do we force decoding past the stop — and the extension is kept
 * only if it ends on a confident EOT (≥ 0.9), which a hallucination into noise never does.
 */
async function recoverEarlyEot(
	features: any,
	prompt: number[],
	decode: { ids: number[]; attention: Float32Array[]; stopProb: number | null },
	lastWordEnd: number | null,
	energy: Float32Array,
	isLast: boolean,
	maxNew: number
): Promise<{ ids: number[]; attention: Float32Array[]; recovered: boolean }> {
	const unchanged = { ids: decode.ids, attention: decode.attention, recovered: false };
	if (lastWordEnd === null || decode.stopProb === null || decode.ids.length >= maxNew)
		return unchanged;
	const tailMin = isLast ? 2 : 4;
	if (speechActiveSeconds(energy, Math.round(lastWordEnd * 100)) < tailMin) return unchanged;
	if (decode.stopProb >= 0.7) return unchanged;
	const ext = await generate(features, [...prompt, ...decode.ids], maxNew - decode.ids.length, {
		minNew: 1
	});
	if (ext.stopProb === null || ext.stopProb < 0.9 || ext.ids.length === 0) return unchanged;
	return {
		ids: [...decode.ids, ...ext.ids],
		attention: [...decode.attention, ...ext.attention],
		recovered: true
	};
}

function wordCount(gen: number[]): number {
	return decodeGroup(gen).split(/\s+/).filter(Boolean).length;
}

/** Fill unplaceable words between their placed neighbours so no spoken word lacks a time. */
function interpolateTimes(
	words: TimedWord[],
	chunkDuration: number
): Array<{ text: string; start: number; end: number }> {
	const out: Array<{ text: string; start: number; end: number }> = [];
	let i = 0;
	while (i < words.length) {
		const w = words[i];
		if (w.start !== null && w.end !== null) {
			out.push({ text: w.text, start: w.start, end: w.end });
			i++;
			continue;
		}
		let j = i;
		while (j < words.length && words[j].start === null) j++;
		const lo = out.length ? out[out.length - 1].end : 0;
		const hi = j < words.length ? (words[j].start as number) : chunkDuration;
		const n = j - i;
		const step = Math.max(0, hi - lo) / n;
		for (let k = 0; k < n; k++) {
			out.push({ text: words[i + k].text, start: lo + k * step, end: lo + (k + 1) * step });
		}
		i = j;
	}
	return out;
}

async function transcribe(audio: Float32Array, language: string, mode: 'verbatim' | 'intended') {
	if (!loaded) throw new Error('Model not loaded');
	const started = performance.now();
	const cfg = DEFAULT_LONGFORM;
	const plans = planChunks(audio.length, cfg);
	const totalSeconds = audio.length / SAMPLE_RATE;
	const isCrisper = loaded.spec.family === 'crisperwhisper';
	const confirmedTexts: string[] = [];
	const all: TranscriptWord[] = [];
	let lastConfirmedEnd = 0;

	for (const plan of plans) {
		if (cancelled) throw new DOMException('cancelled', 'AbortError');
		const chunkStarted = performance.now();
		const chunkStartSec = plan.startSample / SAMPLE_RATE;
		const chunk = audio.subarray(plan.startSample, plan.endSample);
		const chunkDuration = chunk.length / SAMPLE_RATE;
		const inputs = await loaded.processor(chunk);
		const features = inputs.input_features as Tensor;
		const [, nMels, nMelFrames] = features.dims as number[];
		const mel = features.data as Float32Array;

		const context = confirmedTexts.length
			? confirmedTexts.slice(-cfg.contextWords).join(' ')
			: null;
		const prompt = buildPrompt(language, mode, context);
		const decoded = await generateWithRepair(features, prompt, cfg.maxNewTokens);
		let { ids: gen, attention } = decoded;
		const { repairs, timing } = decoded;
		if (cancelled) throw new DOMException('cancelled', 'AbortError');

		// Coverage-gated temperature fallback for collapsed decodes (speech fills the window but
		// almost no words came out). Prefers whichever decode covers more words.
		let fallback = false;
		const energy = melFrameEnergy(mel, nMels, nMelFrames);
		const activeSec = speechActiveSeconds(energy.subarray(0, Math.round(chunkDuration * 100)));
		// (Windows decoded with continuation context use the context-reset fallback below, which
		// recovers context-induced collapses far more reliably than sampling.)
		if (!context && isUndercovered(wordCount(gen), activeSec)) {
			for (const temperature of [0.4, 0.8]) {
				const sampled = await generate(features, prompt, cfg.maxNewTokens, { temperature });
				if (findTokenLoop(sampled.ids)) continue;
				if (wordCount(sampled.ids) > wordCount(gen)) {
					gen = sampled.ids;
					attention = sampled.attention;
					fallback = true;
				}
				if (!isUndercovered(wordCount(gen), activeSec)) break;
			}
		}

		const timeWords = () =>
			extractWordTimings({
				genIds: gen,
				pieces: gen.map(piece),
				decodeGroup,
				attention,
				encoderFrames: attention[0]?.length ?? 1500,
				mel,
				nMels,
				nMelFrames
			});
		let local = timeWords();
		let recovered = false;
		if (isCrisper && !fallback) {
			const ends = local.map((w) => w.end).filter((e): e is number => e !== null);
			const r = await recoverEarlyEot(
				features,
				prompt,
				{ ids: gen, attention, stopProb: decoded.stopProb },
				ends.length ? Math.max(...ends) : null,
				energy.subarray(0, Math.round(chunkDuration * 100)),
				plan.isLast,
				cfg.maxNewTokens
			);
			if (r.recovered) {
				gen = r.ids;
				attention = r.attention;
				recovered = true;
				local = timeWords();
			}
		}
		// Context-collapse fallback. With continuation context the model sometimes skips material
		// — after a confident EOT at a pause (observed: a 13 s question lost after "[laughter]") or
		// mid-window, resuming later. If speech-active audio anywhere after the confirmed words is
		// left uncovered, decode the window again without <ctx> and fill only the gaps of the
		// continuation decode with those words, keeping whichever result covers more speech.
		let contextReset = false;
		const boundary = Math.max(0, lastConfirmedEnd - chunkStartSec) - 0.05;
		const chunkEnergy = energy.subarray(0, Math.round(chunkDuration * 100));
		const coverageEnd = plan.isLast ? chunkDuration : Math.min(chunkDuration, cfg.stride + 1);
		const uncovered = uncoveredSpeechSeconds(
			local,
			chunkEnergy,
			Math.max(0, boundary),
			coverageEnd
		);
		if (isCrisper && context && uncovered >= (plan.isLast ? 2 : 4)) {
			const fresh = await generateWithRepair(
				features,
				buildPrompt(language, mode, null),
				cfg.maxNewTokens
			);
			const freshLocal = extractWordTimings({
				genIds: fresh.ids,
				pieces: fresh.ids.map(piece),
				decodeGroup,
				attention: fresh.attention,
				encoderFrames: fresh.attention[0]?.length ?? 1500,
				mel,
				nMels,
				nMelFrames
			});
			const candidate = freshLocal.filter((w) => w.start === null || w.start >= boundary);
			const merged = fillGaps(local, candidate);
			const after = uncoveredSpeechSeconds(merged, chunkEnergy, Math.max(0, boundary), coverageEnd);
			if (after < uncovered - 0.5) {
				local = merged;
				contextReset = true;
			}
		}

		// Shifted-window retry: the model reliably transcribes speech near the start of a window,
		// so if a substantial stretch is still uncovered, decode a fresh window that starts just
		// before it and fill the gaps from that decode.
		let shifted = false;
		if (isCrisper && !cancelled) {
			const minActive = plan.isLast ? 2 : 4;
			const gaps = uncoveredGaps(local, chunkEnergy, Math.max(0, boundary), coverageEnd);
			const gap = gaps.find((g) => g.active >= 1.5);
			const remaining = gaps.reduce((a, g) => a + g.active, 0);
			if (gap && remaining >= minActive && gap.start >= 1) {
				const offset = gap.start - 0.3;
				const s0 = plan.startSample + Math.round(offset * SAMPLE_RATE);
				const sub = audio.subarray(
					s0,
					Math.min(audio.length, s0 + Math.round(cfg.chunkDuration * SAMPLE_RATE))
				);
				const subInputs = await loaded.processor(sub);
				const subFeatures = subInputs.input_features as Tensor;
				const [, subMels, subFrames] = subFeatures.dims as number[];
				const sd = await generateWithRepair(
					subFeatures,
					buildPrompt(language, mode, null),
					cfg.maxNewTokens
				);
				const subWords = extractWordTimings({
					genIds: sd.ids,
					pieces: sd.ids.map(piece),
					decodeGroup,
					attention: sd.attention,
					encoderFrames: sd.attention[0]?.length ?? 1500,
					mel: subFeatures.data as Float32Array,
					nMels: subMels,
					nMelFrames: subFrames
				})
					.map((w) => ({
						text: w.text,
						start: w.start === null ? null : w.start + offset,
						end: w.end === null ? null : w.end + offset
					}))
					.filter((w) => w.start !== null && w.start >= boundary && w.start < coverageEnd);
				const merged = fillGaps(local, subWords);
				if (
					uncoveredSpeechSeconds(merged, chunkEnergy, Math.max(0, boundary), coverageEnd) <
					remaining - 0.5
				) {
					local = merged;
					shifted = true;
				}
			}
		}

		local = clipToAudio(local, chunkDuration);
		const keep = overlapDropIndex(local, cfg.stride, cfg.dropWords, plan.isLast);
		const confirmed = interpolateTimes(local.slice(0, keep), Math.min(chunkDuration, 30));

		const fresh: TranscriptWord[] = [];
		for (const w of confirmed) {
			const start = w.start + chunkStartSec;
			const end = Math.max(start, w.end + chunkStartSec);
			// Standard Whisper re-transcribes the overlap; drop words already covered.
			if ((!isCrisper || contextReset || shifted) && start < lastConfirmedEnd - 0.05) continue;
			fresh.push({
				index: all.length + fresh.length,
				text: w.text,
				start,
				end,
				kind: classifyWord(w.text)
			});
		}
		monotonize(fresh);
		if (all.length && fresh.length && fresh[0].start < all[all.length - 1].end) {
			fresh[0].start = all[all.length - 1].end;
			fresh[0].end = Math.max(fresh[0].end, fresh[0].start);
		}
		all.push(...fresh);
		confirmedTexts.push(...confirmed.map((w) => w.text));
		if (fresh.length) lastConfirmedEnd = fresh[fresh.length - 1].end;

		post({ type: 'words', words: fresh });
		post({
			type: 'chunk',
			diagnostics: {
				index: plan.index,
				tokens: gen.length,
				words: fresh.length,
				decodeMs: performance.now() - chunkStarted,
				repairs,
				fallback,
				recovered,
				contextReset,
				shifted,
				uncoveredSeconds: uncovered,
				encoderMs: timing.encoderMs,
				stepMs: timing.stepMs
			}
		});
		const processedSeconds = plan.isLast
			? totalSeconds
			: plan.startSample / SAMPLE_RATE + cfg.stride;
		const elapsed = (performance.now() - started) / 1000;
		post({
			type: 'progress',
			progress: {
				processedSeconds: Math.min(totalSeconds, processedSeconds),
				totalSeconds,
				chunkIndex: plan.index + 1,
				chunkCount: plans.length,
				speedFactor: elapsed > 0 ? processedSeconds / elapsed : null
			}
		});
	}
	return { words: all, wallMs: performance.now() - started, audioSeconds: totalSeconds };
}

self.onmessage = async (event: MessageEvent<AsrRequest>) => {
	const msg = event.data;
	if (msg.type === 'cancel') {
		cancelled = true;
		return;
	}
	if (msg.type === 'unload') {
		try {
			await loaded?.model?.dispose?.();
		} catch {
			/* ignore */
		}
		loaded = null;
		post({ type: 'unloaded' });
		return;
	}
	if (busy) {
		post({
			type: 'error',
			message: 'Engine busy',
			audio: msg.type === 'transcribe' ? msg.audio : null
		});
		return;
	}
	busy = true;
	cancelled = false;
	try {
		if (msg.type === 'load') {
			await load(msg.model, msg.variant);
		} else if (msg.type === 'transcribe') {
			try {
				const result = await transcribe(msg.audio, msg.language, msg.mode);
				post({ type: 'done', ...result, audio: msg.audio }, [msg.audio.buffer]);
			} catch (err) {
				if (cancelled) post({ type: 'cancelled', audio: msg.audio }, [msg.audio.buffer]);
				else throw Object.assign(err as Error, { audio: msg.audio });
			}
		}
	} catch (err) {
		const audio = (err as { audio?: Float32Array }).audio ?? null;
		post(
			{ type: 'error', message: (err as Error)?.message ?? String(err), audio },
			audio ? [audio.buffer] : []
		);
	} finally {
		busy = false;
		cancelled = false;
	}
};
