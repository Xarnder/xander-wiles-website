export type LoadedLocalAssets = {
  directoryName: string;
  onnxFiles: Map<string, ArrayBuffer>;
  externalDataFiles: Map<string, ArrayBuffer>;
  tokenizerFiles: Map<string, ArrayBuffer>;
};

type LocalPermissionState = 'granted' | 'denied' | 'prompt';

type LocalFileHandle = {
  kind: 'file';
  getFile: () => Promise<File>;
};

type LocalDirectoryHandle = {
  kind: 'directory';
  name: string;
  entries: () => AsyncIterable<[string, LocalDirectoryEntry]>;
  queryPermission: (opts: { mode: 'read' | 'readwrite' }) => Promise<LocalPermissionState>;
  requestPermission: (opts: { mode: 'read' | 'readwrite' }) => Promise<LocalPermissionState>;
};

type LocalDirectoryEntry = LocalDirectoryHandle | LocalFileHandle;

const TOKENIZER_FILE_PATTERN = /(tokenizer|vocab|merges|special_tokens|spiece|sentencepiece)/i;
const EXTERNAL_DATA_PATTERN = /\.onnx_data(?:$|\.)/i;

export async function pickAndLoadLocalAssets(): Promise<LoadedLocalAssets> {
  const directoryHandle = await ensureDirectoryWithReadPermission();
  const onnxFiles = new Map<string, ArrayBuffer>();
  const externalDataFiles = new Map<string, ArrayBuffer>();
  const tokenizerFiles = new Map<string, ArrayBuffer>();

  await scanDirectory(directoryHandle, '', onnxFiles, externalDataFiles, tokenizerFiles);

  if (onnxFiles.size === 0) {
    throw new Error('No .onnx files were found in the selected folder.');
  }

  return {
    directoryName: directoryHandle.name,
    onnxFiles,
    externalDataFiles,
    tokenizerFiles
  };
}

async function ensureDirectoryWithReadPermission(): Promise<LocalDirectoryHandle> {
  const pickerHost = window as Window & {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<unknown>;
  };

  if (!pickerHost.showDirectoryPicker) {
    throw new Error('File System Access API is not supported in this browser.');
  }

  const directoryHandle = (await pickerHost.showDirectoryPicker({
    mode: 'read'
  })) as LocalDirectoryHandle;

  let permission = await directoryHandle.queryPermission({ mode: 'read' });
  if (permission !== 'granted') {
    permission = await directoryHandle.requestPermission({ mode: 'read' });
  }

  if (permission !== 'granted') {
    throw new Error('Read permission was denied for the selected folder.');
  }

  return directoryHandle;
}

async function scanDirectory(
  handle: LocalDirectoryHandle,
  prefix: string,
  onnxFiles: Map<string, ArrayBuffer>,
  externalDataFiles: Map<string, ArrayBuffer>,
  tokenizerFiles: Map<string, ArrayBuffer>
): Promise<void> {
  for await (const [entryName, entryHandle] of handle.entries()) {
    const relativePath = prefix ? `${prefix}/${entryName}` : entryName;

    if (entryHandle.kind === 'directory') {
      await scanDirectory(
        entryHandle as LocalDirectoryHandle,
        relativePath,
        onnxFiles,
        externalDataFiles,
        tokenizerFiles
      );
      continue;
    }

    const lower = entryName.toLowerCase();
    if (!lower.endsWith('.onnx') && !EXTERNAL_DATA_PATTERN.test(lower) && !TOKENIZER_FILE_PATTERN.test(lower)) {
      continue;
    }

    const file = await (entryHandle as LocalFileHandle).getFile();
    const bytes = await file.arrayBuffer();

    if (lower.endsWith('.onnx')) {
      onnxFiles.set(relativePath, bytes);
    } else if (EXTERNAL_DATA_PATTERN.test(lower)) {
      externalDataFiles.set(relativePath, bytes);
    } else {
      tokenizerFiles.set(relativePath, bytes);
    }
  }
}
