import type { AsrBackend, ModelSpec, ModelVariant } from './types';

const CW_LICENCE = {
	name: 'nyra health Non-Commercial Research License',
	url: 'https://huggingface.co/nyralabs/CrisperWhisper2.0_turbo/blob/main/LICENSE.md',
	commercialUse: false,
	outputsRestricted: true
};

const MIT = {
	name: 'MIT (OpenAI Whisper weights)',
	url: 'https://huggingface.co/openai/whisper-small/blob/main/README.md',
	commercialUse: true,
	outputsRestricted: false
};

const COMMON = (repo: string, sizes: Record<string, number>) =>
	Object.entries(sizes).map(([path, bytes]) => ({ path: `${path}`, bytes, repo }));

function variant(
	backend: AsrBackend,
	requiresF16: boolean,
	encoder: [string, number],
	decoder: [string, number],
	common: Array<{ path: string; bytes: number }>
): ModelVariant {
	const suffix = (d: string) => (d === 'fp32' ? '' : `_${d}`);
	return {
		backend,
		requiresF16,
		dtype: { encoder_model: encoder[0], decoder_model_merged: decoder[0] },
		files: [
			...common.map(({ path, bytes }) => ({ path, bytes })),
			{ path: `onnx/encoder_model${suffix(encoder[0])}.onnx`, bytes: encoder[1] },
			{ path: `onnx/decoder_model_merged${suffix(decoder[0])}.onnx`, bytes: decoder[1] }
		]
	};
}

// Sizes verified against the Hugging Face API (October 2026).
const CW_TURBO_REPO = 'Masterx/CrisperWhisper2.0-turbo-ONNX';
const CW_TURBO_COMMON = COMMON(CW_TURBO_REPO, {
	'config.json': 1258,
	'generation_config.json': 4144,
	'preprocessor_config.json': 372,
	'tokenizer.json': 3937105,
	'tokenizer_config.json': 301532
});
const CW_LARGE_REPO = 'Masterx/CrisperWhisper2.0-large-ONNX';
const CW_LARGE_COMMON = COMMON(CW_LARGE_REPO, {
	'config.json': 1404,
	'generation_config.json': 4129,
	'preprocessor_config.json': 371,
	'tokenizer.json': 3936954,
	'tokenizer_config.json': 301365
});
const WHISPER_COMMON = (repo: string) =>
	COMMON(repo, {
		'config.json': 2243,
		'generation_config.json': 3893,
		'preprocessor_config.json': 339,
		'tokenizer.json': 2480466,
		'tokenizer_config.json': 282683
	});

export const CRISPERWHISPER_MODELS: ModelSpec[] = [
	{
		id: 'crisperwhisper-2-turbo',
		family: 'crisperwhisper',
		label: 'CrisperWhisper 2.0 Turbo',
		tier: 'Balanced',
		repo: CW_TURBO_REPO,
		verbatim: true,
		licence: CW_LICENCE,
		variants: [
			variant('webgpu', true, ['q4', 424909729], ['fp16', 476990011], CW_TURBO_COMMON),
			variant('webgpu', false, ['q4', 424909729], ['q4', 599851139], CW_TURBO_COMMON),
			variant('wasm', false, ['q4', 424909729], ['q4', 599851139], CW_TURBO_COMMON)
		],
		estimatedMemoryBytes: 1.6e9,
		notes:
			'Verbatim: keeps [UM]/[UH], repetitions, stutters, false starts, cut-off words and vocal events. 4-bit encoder, fp16 decoder on WebGPU.'
	},
	{
		id: 'crisperwhisper-2-turbo-hq',
		family: 'crisperwhisper',
		label: 'CrisperWhisper 2.0 Turbo (fp16)',
		tier: 'Best accuracy',
		repo: CW_TURBO_REPO,
		verbatim: true,
		licence: CW_LICENCE,
		variants: [variant('webgpu', true, ['fp16', 1274309829], ['fp16', 476990011], CW_TURBO_COMMON)],
		estimatedMemoryBytes: 2.6e9,
		notes:
			'Unquantised fp16 encoder for the best timing/recognition quality. WebGPU with fp16 only.'
	},
	{
		id: 'crisperwhisper-2-large',
		family: 'crisperwhisper',
		label: 'CrisperWhisper 2.0 Large',
		tier: 'Best accuracy',
		repo: CW_LARGE_REPO,
		verbatim: true,
		licence: CW_LICENCE,
		variants: [
			variant('webgpu', false, ['q4', 424172447], ['q4', 1062707781], CW_LARGE_COMMON),
			variant('wasm', false, ['q4', 424172447], ['q4', 1062707781], CW_LARGE_COMMON)
		],
		estimatedMemoryBytes: 2.4e9,
		notes:
			'Highest-quality open CrisperWhisper 2.0 checkpoint; 32-layer decoder is several times slower than Turbo.'
	}
];

export const WHISPER_MODELS: ModelSpec[] = [
	{
		id: 'whisper-base',
		family: 'whisper',
		label: 'Whisper Base (not verbatim)',
		tier: 'Fast',
		repo: 'onnx-community/whisper-base_timestamped',
		verbatim: false,
		licence: MIT,
		variants: [
			variant(
				'webgpu',
				true,
				['fp16', 41270731],
				['fp16', 104701989],
				WHISPER_COMMON('onnx-community/whisper-base_timestamped')
			),
			variant(
				'webgpu',
				false,
				['fp32', 82451730],
				['q4', 123738327],
				WHISPER_COMMON('onnx-community/whisper-base_timestamped')
			),
			variant(
				'wasm',
				false,
				['fp32', 82451730],
				['q4', 123738327],
				WHISPER_COMMON('onnx-community/whisper-base_timestamped')
			)
		],
		estimatedMemoryBytes: 0.5e9,
		notes:
			'Commercially usable, but standard Whisper produces "intended" text: it often omits fillers, repetitions and false starts. Rely on the audio detector (Conservative mode) to protect that speech.'
	},
	{
		id: 'whisper-small',
		family: 'whisper',
		label: 'Whisper Small (not verbatim)',
		tier: 'Balanced',
		repo: 'onnx-community/whisper-small_timestamped',
		verbatim: false,
		licence: MIT,
		variants: [
			variant(
				'webgpu',
				true,
				['fp16', 176483570],
				['fp16', 308537915],
				WHISPER_COMMON('onnx-community/whisper-small_timestamped')
			),
			variant(
				'webgpu',
				false,
				['q4', 66178491],
				['q4', 233421212],
				WHISPER_COMMON('onnx-community/whisper-small_timestamped')
			),
			variant(
				'wasm',
				false,
				['q4', 66178491],
				['q4', 233421212],
				WHISPER_COMMON('onnx-community/whisper-small_timestamped')
			)
		],
		estimatedMemoryBytes: 0.9e9,
		notes:
			'Commercially usable, NOT verbatim. Word timestamps from cross-attention alignment heads.'
	}
];

export function availableModels(crisperWhisperEnabled: boolean): ModelSpec[] {
	return crisperWhisperEnabled
		? [...CRISPERWHISPER_MODELS, ...WHISPER_MODELS]
		: [...WHISPER_MODELS];
}

export function findModel(id: string): ModelSpec | undefined {
	return [...CRISPERWHISPER_MODELS, ...WHISPER_MODELS].find((m) => m.id === id);
}

export function variantBytes(v: ModelVariant): number {
	return v.files.reduce((a, f) => a + f.bytes, 0);
}

/** Pick the best variant for the detected runtime. */
export function chooseVariant(
	model: ModelSpec,
	caps: { webgpu: boolean; f16: boolean },
	prefer?: AsrBackend
): ModelVariant | null {
	const usable = model.variants.filter((v) => {
		if (v.backend === 'webgpu' && !caps.webgpu) return false;
		if (v.requiresF16 && !caps.f16) return false;
		return true;
	});
	if (prefer) {
		const preferred = usable.find((v) => v.backend === prefer);
		if (preferred) return preferred;
	}
	return usable[0] ?? null;
}

export function formatBytes(bytes: number): string {
	if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
	if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
	if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} kB`;
	return `${bytes} B`;
}
