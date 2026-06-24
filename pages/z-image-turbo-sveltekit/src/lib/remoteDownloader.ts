import type { LoadedLocalAssets } from './fsLoader';

export type DownloadProgress = {
  phase: 'starting' | 'downloading' | 'saving' | 'done';
  fileName: string;
  fileIndex: number;
  fileCount: number;
  fileBytesReceived: number;
  fileBytesTotal: number | null;
  overallBytesReceived: number;
  overallBytesTotal: number | null;
};

type ManifestFile = {
  name: string;
  required: boolean;
  kind: 'onnx' | 'external' | 'tokenizer';
};

type DownloadOptions = {
  modelBaseUrl: string;
  tokenizerBaseUrl: string;
  includeSafetyChecker: boolean;
  onProgress: (progress: DownloadProgress) => void;
  log: (message: string) => void;
  control?: DownloadController;
};

export const DOWNLOAD_CANCELLED_ERROR = 'DOWNLOAD_CANCELLED';

export type DownloadController = {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  isPaused: () => boolean;
  isCancelled: () => boolean;
  waitIfPaused: () => Promise<void>;
  signal: () => AbortSignal;
};

const MODEL_FILES: ManifestFile[] = [
  { name: 'transformer_model_q4f16.onnx', required: true, kind: 'onnx' },
  { name: 'transformer_model_q4f16.onnx_data', required: true, kind: 'external' },
  { name: 'text_encoder_model_q4f16.onnx', required: true, kind: 'onnx' },
  { name: 'text_encoder_model_q4f16.onnx_data', required: true, kind: 'external' },
  { name: 'vae_decoder_model_f16.onnx', required: true, kind: 'onnx' },
  { name: 'scheduler_step_model_f16.onnx', required: true, kind: 'onnx' },
  { name: 'sc_prep_model_f16.onnx', required: true, kind: 'onnx' },
  { name: 'vae_pre_process_model_f16.onnx', required: false, kind: 'onnx' },
  { name: 'safety_checker_model_f16.onnx', required: false, kind: 'onnx' }
];

const TOKENIZER_FILES: ManifestFile[] = [
  { name: 'tokenizer.json', required: false, kind: 'tokenizer' },
  { name: 'tokenizer_config.json', required: false, kind: 'tokenizer' },
  { name: 'special_tokens_map.json', required: false, kind: 'tokenizer' },
  { name: 'vocab.json', required: false, kind: 'tokenizer' },
  { name: 'merges.txt', required: false, kind: 'tokenizer' }
];

export function getAutoDownloadFileList(includeSafetyChecker: boolean): string[] {
  const modelFiles = MODEL_FILES.filter((file) =>
    includeSafetyChecker ? true : file.name !== 'safety_checker_model_f16.onnx'
  );
  return [...modelFiles, ...TOKENIZER_FILES].map((file) => file.name);
}

export function createDownloadController(): DownloadController {
  let paused = false;
  let cancelled = false;
  const waiters: Array<() => void> = [];
  const abortController = new AbortController();

  const resolveWaiters = () => {
    while (waiters.length > 0) {
      const resolve = waiters.shift();
      resolve?.();
    }
  };

  return {
    pause: () => {
      if (cancelled) return;
      paused = true;
    },
    resume: () => {
      if (cancelled) return;
      paused = false;
      resolveWaiters();
    },
    cancel: () => {
      cancelled = true;
      paused = false;
      abortController.abort();
      resolveWaiters();
    },
    isPaused: () => paused,
    isCancelled: () => cancelled,
    waitIfPaused: async () => {
      if (!paused || cancelled) return;
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
    },
    signal: () => abortController.signal
  };
}

export async function downloadModelPack(options: DownloadOptions): Promise<LoadedLocalAssets> {
  const modelBaseUrl = sanitizeBaseUrl(options.modelBaseUrl);
  const tokenizerBaseUrl = sanitizeBaseUrl(options.tokenizerBaseUrl || options.modelBaseUrl);
  await logStorageEstimate(options.log);

  const fileList = getAutoDownloadFileList(options.includeSafetyChecker);
  const allFiles = fileList
    .map((name) => MODEL_FILES.find((f) => f.name === name) ?? TOKENIZER_FILES.find((f) => f.name === name))
    .filter((file): file is ManifestFile => Boolean(file));
  const onnxFiles = new Map<string, ArrayBuffer>();
  const externalDataFiles = new Map<string, ArrayBuffer>();
  const tokenizerFiles = new Map<string, ArrayBuffer>();
  const control = options.control;

  let overallBytesReceived = 0;
  let overallBytesTotal: number | null = null;
  const totalsByFile = new Map<string, number | null>();
  const receivedByFile = new Map<string, number>();

  for (const [index, file] of allFiles.entries()) {
    if (control?.isCancelled()) {
      throw new Error(DOWNLOAD_CANCELLED_ERROR);
    }
    await control?.waitIfPaused();
    if (control?.isCancelled()) {
      throw new Error(DOWNLOAD_CANCELLED_ERROR);
    }

    const base = file.kind === 'tokenizer' ? tokenizerBaseUrl : modelBaseUrl;
    const url = `${base}/${file.name}`;
    options.log(`Downloading ${file.name} from ${url}`);

    options.onProgress({
      phase: 'starting',
      fileName: file.name,
      fileIndex: index + 1,
      fileCount: allFiles.length,
      fileBytesReceived: 0,
      fileBytesTotal: null,
      overallBytesReceived,
      overallBytesTotal
    });

    try {
      const fileData = await fetchFileWithProgress(url, (chunkReceived, chunkTotal) => {
        receivedByFile.set(file.name, chunkReceived);
        totalsByFile.set(file.name, chunkTotal);
        overallBytesReceived = sumValues(receivedByFile);
        overallBytesTotal = sumKnownValues(totalsByFile);

        options.onProgress({
          phase: 'downloading',
          fileName: file.name,
          fileIndex: index + 1,
          fileCount: allFiles.length,
          fileBytesReceived: chunkReceived,
          fileBytesTotal: chunkTotal,
          overallBytesReceived,
          overallBytesTotal
        });
      }, control);

      await persistToOpfs(`z-image-turbo/${file.name}`, fileData);
      options.onProgress({
        phase: 'saving',
        fileName: file.name,
        fileIndex: index + 1,
        fileCount: allFiles.length,
        fileBytesReceived: receivedByFile.get(file.name) ?? fileData.length,
        fileBytesTotal: totalsByFile.get(file.name) ?? fileData.length,
        overallBytesReceived,
        overallBytesTotal
      });

      if (file.kind === 'onnx') {
        onnxFiles.set(file.name, toArrayBuffer(fileData));
      } else if (file.kind === 'external') {
        externalDataFiles.set(file.name, toArrayBuffer(fileData));
      } else {
        tokenizerFiles.set(file.name, toArrayBuffer(fileData));
      }

      options.log(`Saved ${file.name} (${formatBytes(fileData.byteLength)})`);
    } catch (err) {
      const message = normalizeError(err);
      if (message === DOWNLOAD_CANCELLED_ERROR) {
        throw new Error(DOWNLOAD_CANCELLED_ERROR);
      }
      if (file.required) {
        throw new Error(`Failed to download required file "${file.name}": ${message}`);
      }
      options.log(`Skipping optional file ${file.name}: ${message}`);
    }
  }

  options.onProgress({
    phase: 'done',
    fileName: 'complete',
    fileIndex: allFiles.length,
    fileCount: allFiles.length,
    fileBytesReceived: 0,
    fileBytesTotal: 0,
    overallBytesReceived,
    overallBytesTotal
  });

  return {
    directoryName: 'z-image-turbo (downloaded)',
    onnxFiles,
    externalDataFiles,
    tokenizerFiles
  };
}

async function fetchFileWithProgress(
  url: string,
  onProgress: (received: number, total: number | null) => void,
  control?: DownloadController
): Promise<Uint8Array> {
  if (control?.isCancelled()) {
    throw new Error(DOWNLOAD_CANCELLED_ERROR);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      signal: control?.signal()
    });
  } catch (err) {
    if (control?.isCancelled() || (err instanceof DOMException && err.name === 'AbortError')) {
      throw new Error(DOWNLOAD_CANCELLED_ERROR);
    }
    throw err;
  }
  if (!response.ok) {
    throw new Error(formatHttpError(response.status));
  }

  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    onProgress(bytes.length, bytes.length);
    return bytes;
  }

  const totalHeader = response.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : null;
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let received = 0;

  while (true) {
    if (control?.isCancelled()) {
      throw new Error(DOWNLOAD_CANCELLED_ERROR);
    }
    await control?.waitIfPaused();
    if (control?.isCancelled()) {
      throw new Error(DOWNLOAD_CANCELLED_ERROR);
    }

    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.length;
    onProgress(received, total);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  onProgress(received, total ?? received);
  return merged;
}

async function persistToOpfs(path: string, bytes: Uint8Array): Promise<void> {
  const storageHost = navigator.storage as StorageManager & {
    getDirectory?: () => Promise<unknown>;
  };

  if (!storageHost.getDirectory) {
    return;
  }

  const root = (await storageHost.getDirectory()) as OpfsDirectoryHandle;
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return;

  let dir: OpfsDirectoryHandle = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }

  const fileName = parts[parts.length - 1];
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

type OpfsDirectoryHandle = {
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<OpfsDirectoryHandle>;
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<OpfsFileHandle>;
};

type OpfsFileHandle = {
  createWritable: () => Promise<OpfsWritableFile>;
};

type OpfsWritableFile = {
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
};

function sanitizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

async function logStorageEstimate(log: (message: string) => void): Promise<void> {
  const storage = navigator.storage;
  if (!storage?.estimate) {
    return;
  }

  try {
    const estimate = await storage.estimate();
    if (!estimate.quota || !estimate.usage) {
      return;
    }
    const free = Math.max(0, estimate.quota - estimate.usage);
    log(`Browser storage free: ${formatBytes(free)} of ${formatBytes(estimate.quota)}.`);
  } catch {
    // Ignore storage estimate errors.
  }
}

function normalizeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function sumValues(map: Map<string, number>): number {
  let total = 0;
  for (const value of map.values()) {
    total += value;
  }
  return total;
}

function sumKnownValues(map: Map<string, number | null>): number | null {
  let total = 0;
  let hasUnknown = false;
  for (const value of map.values()) {
    if (value == null) {
      hasUnknown = true;
      continue;
    }
    total += value;
  }
  return hasUnknown ? null : total;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const cloned = bytes.slice();
  return cloned.buffer as ArrayBuffer;
}

function formatHttpError(status: number): string {
  if (status === 401 || status === 403) {
    return `HTTP ${status} (repository requires authentication or access is restricted)`;
  }
  if (status === 404) {
    return 'HTTP 404 (file not found at this URL)';
  }
  return `HTTP ${status}`;
}
