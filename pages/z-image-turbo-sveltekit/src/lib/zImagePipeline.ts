import * as ort from 'onnxruntime-web/webgpu';
import type { LoadedLocalAssets } from './fsLoader';

export type SessionBundle = {
  ordered: ort.InferenceSession[];
  named: Record<string, ort.InferenceSession>;
};

const WEBGPU_PROVIDER: ort.InferenceSession.SessionOptions['executionProviders'] = ['webgpu'];
let wasmPathsConfigured = false;

export async function verifyWebGpuSupport(): Promise<void> {
  configureOrtWasmPaths();

  const nav = navigator as Navigator & {
    gpu?: {
      requestAdapter: () => Promise<
        | {
            requestDevice: () => Promise<unknown>;
          }
        | null
      >;
    };
  };

  if (!nav.gpu) {
    throw new Error('WebGPU is not available in this browser.');
  }

  const adapter = await nav.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('WebGPU adapter initialization failed.');
  }

  try {
    await adapter.requestDevice();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`WebGPU device initialization failed: ${message}`);
  }
}

export async function createSessionsFromBuffers(
  assets: LoadedLocalAssets
): Promise<SessionBundle> {
  configureOrtWasmPaths();
  await verifyWebGpuSupport();

  const orderedEntries = [...assets.onnxFiles.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const named: Record<string, ort.InferenceSession> = {};
  const ordered: ort.InferenceSession[] = [];

  for (const [path, bytes] of orderedEntries) {
    const externalData = findExternalDataForModel(path, assets.externalDataFiles);
    const session = await ort.InferenceSession.create(ownArrayBuffer(bytes), {
      executionProviders: WEBGPU_PROVIDER,
      ...(externalData.length > 0 ? { externalData } : {})
    });
    ordered.push(session);
    named[path] = session;
  }

  return { ordered, named };
}

export async function generateImage(
  prompt: string,
  sessions: SessionBundle,
  tokenizerFiles: Map<string, ArrayBuffer>
): Promise<ImageData> {
  if (!prompt.trim()) {
    throw new Error('Prompt cannot be empty.');
  }

  const primarySession = findPrimarySession(sessions);
  const feeds = buildFeeds(primarySession, prompt, tokenizerFiles);
  const primaryOutput = await primarySession.run(feeds);
  const firstTensor = getFirstTensor(primaryOutput);

  let imageTensor = firstTensor;
  const vaeDecoder = findVaeDecoderSession(sessions);

  if (vaeDecoder) {
    imageTensor = await decodeLatentsWithVae(vaeDecoder, imageTensor);
  }

  return tensorToImageData(imageTensor);
}

function findPrimarySession(sessions: SessionBundle): ort.InferenceSession {
  const entry = Object.entries(sessions.named).find(([path]) => /z[-_]?image[-_]?turbo/i.test(path));
  if (entry) {
    return entry[1];
  }
  return sessions.ordered[0];
}

function findVaeDecoderSession(sessions: SessionBundle): ort.InferenceSession | null {
  const entry = Object.entries(sessions.named).find(([path]) => /vae.*decoder|decoder.*vae/i.test(path));
  return entry ? entry[1] : null;
}

function buildFeeds(
  session: ort.InferenceSession,
  prompt: string,
  tokenizerFiles: Map<string, ArrayBuffer>
): Record<string, ort.Tensor> {
  const feeds: Record<string, ort.Tensor> = {};
  const inputNames = session.inputNames;
  const inputMetadata = session.inputMetadata;

  for (const [index, inputName] of inputNames.entries()) {
    const meta = inputMetadata[index];
    const normalizedType = getInputType(meta);
    const dims = normalizeDims(getInputDimensions(meta));

    if (isPromptInput(inputName)) {
      const tokenized = tokenizePrompt(prompt, tokenizerFiles);
      const seqLen = dims[1] > 0 ? dims[1] : tokenized.length;
      const ids = new BigInt64Array(seqLen);
      for (let i = 0; i < seqLen; i += 1) {
        ids[i] = BigInt(tokenized[i] ?? 0);
      }
      feeds[inputName] = new ort.Tensor('int64', ids, [1, seqLen]);
      continue;
    }

    if (normalizedType.includes('int64') || normalizedType.includes('int32')) {
      const flattened = flattenDims(dims, 1);
      const length = flattened.reduce((acc, dim) => acc * dim, 1);

      if (normalizedType.includes('int64')) {
        const ints = new BigInt64Array(length);
        ints.fill(0n);
        feeds[inputName] = new ort.Tensor('int64', ints, flattened);
      } else {
        const ints = new Int32Array(length);
        ints.fill(0);
        feeds[inputName] = new ort.Tensor('int32', ints, flattened);
      }
      continue;
    }

    const shape = flattenDims(dims, 4);
    const length = shape.reduce((acc, dim) => acc * dim, 1);
    const floats = makePromptConditionedNoise(length, prompt);
    feeds[inputName] = new ort.Tensor('float32', floats, shape);
  }

  return feeds;
}

function tokenizePrompt(prompt: string, tokenizerFiles: Map<string, ArrayBuffer>): number[] {
  const maybeTokenizer = [...tokenizerFiles.entries()].find(([name]) => name.endsWith('tokenizer.json'));
  if (!maybeTokenizer) {
    return encodeUtf8Fallback(prompt);
  }

  try {
    const json = new TextDecoder().decode(new Uint8Array(ownArrayBuffer(maybeTokenizer[1])));
    const parsed = JSON.parse(json) as { model?: { vocab?: Record<string, number> } };
    const vocab = parsed.model?.vocab;
    if (!vocab) {
      return encodeUtf8Fallback(prompt);
    }

    const words = prompt.toLowerCase().split(/\s+/).filter(Boolean);
    const unk = vocab['<unk>'] ?? 0;
    return words.map((word) => vocab[word] ?? unk);
  } catch {
    return encodeUtf8Fallback(prompt);
  }
}

function encodeUtf8Fallback(prompt: string): number[] {
  const bytes = new TextEncoder().encode(prompt);
  return Array.from(bytes.slice(0, 128), (byte) => byte);
}

function makePromptConditionedNoise(length: number, prompt: string): Float32Array {
  const seed = hashPrompt(prompt);
  const out = new Float32Array(length);
  let x = seed || 123456789;
  for (let i = 0; i < length; i += 1) {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    out[i] = ((x % 1000) / 500) - 1;
  }
  return out;
}

function hashPrompt(prompt: string): number {
  let hash = 0;
  for (let i = 0; i < prompt.length; i += 1) {
    hash = ((hash << 5) - hash + prompt.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

async function decodeLatentsWithVae(
  vae: ort.InferenceSession,
  latentTensor: ort.Tensor
): Promise<ort.Tensor> {
  const inputName = vae.inputNames[0];
  const output = await vae.run({
    [inputName]: latentTensor
  });
  return getFirstTensor(output);
}

function getFirstTensor(output: ort.InferenceSession.ReturnType): ort.Tensor {
  const first = Object.values(output)[0];
  if (!first) {
    throw new Error('Model returned no output tensors.');
  }
  return first;
}

function tensorToImageData(tensor: ort.Tensor): ImageData {
  if (tensor.type !== 'float32' && tensor.type !== 'uint8') {
    throw new Error(`Unsupported output tensor type: ${tensor.type}`);
  }

  const dims = tensor.dims;
  const data = tensor.data;

  let width = 0;
  let height = 0;
  let channels = 0;
  let source: Float32Array | Uint8Array;

  if (dims.length === 4) {
    const [batch, a, b, c] = dims;
    if (batch !== 1) {
      throw new Error('Only batch size 1 output is supported.');
    }

    if (a <= 4 && c > 4) {
      channels = a;
      height = b;
      width = c;
      source = reorderNchwToHwc(toTypedNumericData(data), width, height, channels);
    } else {
      height = a;
      width = b;
      channels = c;
      source = toTypedNumericData(data);
    }
  } else if (dims.length === 3) {
    [height, width, channels] = dims;
    source = toTypedNumericData(data);
  } else {
    throw new Error(`Unsupported output shape: [${dims.join(', ')}]`);
  }

  if (channels < 1) {
    throw new Error('Output tensor has no channels.');
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const srcOffset = i * channels;
    const r = source[srcOffset];
    const g = source[srcOffset + Math.min(1, channels - 1)];
    const b = source[srcOffset + Math.min(2, channels - 1)];
    const a = channels > 3 ? source[srcOffset + 3] : 1;

    rgba[i * 4] = normalizeChannel(r);
    rgba[i * 4 + 1] = normalizeChannel(g);
    rgba[i * 4 + 2] = normalizeChannel(b);
    rgba[i * 4 + 3] = normalizeAlpha(a);
  }

  return new ImageData(rgba, width, height);
}

function reorderNchwToHwc(
  source: Float32Array | Uint8Array,
  width: number,
  height: number,
  channels: number
): Float32Array {
  const out = new Float32Array(width * height * channels);

  for (let c = 0; c < channels; c += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const chwIndex = c * width * height + y * width + x;
        const hwcIndex = (y * width + x) * channels + c;
        out[hwcIndex] = Number(source[chwIndex]);
      }
    }
  }

  return out;
}

function toTypedNumericData(
  source: unknown
): Float32Array | Uint8Array {
  if (source instanceof Float32Array || source instanceof Uint8Array) {
    return source;
  }

  throw new Error('Output tensor data is not Float32Array or Uint8Array.');
}

function normalizeChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 1 && value >= -1) return Math.max(0, Math.min(255, Math.round((value + 1) * 127.5)));
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeAlpha(value: number): number {
  if (!Number.isFinite(value)) return 255;
  if (value <= 1 && value >= 0) return Math.max(0, Math.min(255, Math.round(value * 255)));
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeDims(dimensions: readonly (number | string | null)[] | undefined): number[] {
  if (!dimensions) return [1, 4, 64, 64];
  return dimensions.map((dim) => {
    if (typeof dim === 'number' && Number.isFinite(dim) && dim > 0) return dim;
    return -1;
  });
}

function getInputType(meta: ort.InferenceSession.ValueMetadata | undefined): string {
  if (meta && 'type' in meta && typeof meta.type === 'string') {
    return meta.type.toLowerCase();
  }
  return 'float32';
}

function getInputDimensions(
  meta: ort.InferenceSession.ValueMetadata | undefined
): readonly (number | string | null)[] | undefined {
  if (meta && 'shape' in meta && Array.isArray(meta.shape)) {
    return meta.shape;
  }
  return undefined;
}

function findExternalDataForModel(
  modelPath: string,
  externalDataFiles: Map<string, ArrayBuffer>
): Array<{ path: string; data: Uint8Array }> {
  const modelName = modelPath.split('/').pop() || modelPath;
  const candidates = [
    `${modelName}_data`,
    modelName.replace(/\.onnx$/i, '.onnx_data')
  ];

  const matched: Array<{ path: string; data: Uint8Array }> = [];
  for (const [path, buffer] of externalDataFiles.entries()) {
    const fileName = path.split('/').pop() || path;
    if (!candidates.includes(fileName)) {
      continue;
    }
    matched.push({
      path: fileName,
      data: new Uint8Array(ownArrayBuffer(buffer))
    });
  }

  return matched;
}

function flattenDims(dims: number[], fallbackRank: number): number[] {
  const output = dims.length === 0 ? Array.from({ length: fallbackRank }, () => 1) : [...dims];
  return output.map((value) => (value > 0 ? value : 1));
}

function isPromptInput(name: string): boolean {
  return /(prompt|text|token|input[_-]?ids)/i.test(name);
}

function ownArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  const view = new Uint8Array(buffer);
  return view.slice().buffer;
}

function configureOrtWasmPaths(): void {
  if (wasmPathsConfigured) return;
  if (typeof window === 'undefined') return;

  // Keep WASM files in static/onnx and resolve relative to current app URL.
  const wasmBaseUrl = new URL('./onnx/', window.location.href).toString();
  ort.env.wasm.wasmPaths = wasmBaseUrl;
  wasmPathsConfigured = true;
}
