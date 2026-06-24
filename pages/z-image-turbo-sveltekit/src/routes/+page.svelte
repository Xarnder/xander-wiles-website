<script lang="ts">
  import { onMount } from 'svelte';
  import { pickAndLoadLocalAssets } from '$lib/fsLoader';
  import {
    createDownloadController,
    downloadModelPack,
    DOWNLOAD_CANCELLED_ERROR,
    getAutoDownloadFileList,
    type DownloadProgress
  } from '$lib/remoteDownloader';
  import {
    createSessionsFromBuffers,
    generateImage,
    verifyWebGpuSupport
  } from '$lib/zImagePipeline';
  import {
    clearRuntimeCache,
    getRuntimeAssets,
    getRuntimeSessions,
    releaseRuntimeSessions,
    setRuntimeAssets,
    setRuntimeSessions
  } from '$lib/runtimeCache';

  type LoadMethod = 'local' | 'download';
  type FileProgressPhase = DownloadProgress['phase'] | 'pending';
  type FileDownloadState = {
    name: string;
    received: number;
    total: number | null;
    phase: FileProgressPhase;
    done: boolean;
  };

  let prompt = '';
  let status = 'Pick your local model folder to begin.';
  let error = '';
  let loading = false;
  let downloading = false;
  let generating = false;
  let browserReady = false;
  let loadMethod: LoadMethod = 'local';
  let sessionsReady = false;
  let hasRuntimeData = false;
  let loadedSource = '';
  let loadedOnnxCount = 0;
  let loadedExternalCount = 0;
  let loadedTokenizerCount = 0;
  let canvasEl: HTMLCanvasElement | null = null;
  let debugLogs: string[] = [];

  let modelBaseUrl = 'https://huggingface.co/webnn/Z-Image-Turbo/resolve/main/onnx';
  let tokenizerBaseUrl = 'https://huggingface.co/webnn/Z-Image-Turbo/resolve/main';
  let includeSafetyChecker = false;
  let progress: DownloadProgress | null = null;
  let downloadFileList: string[] = getAutoDownloadFileList(includeSafetyChecker);
  let fileProgressByName: Record<string, FileDownloadState> = {};
  let downloadSpeedBps = 0;
  let etaSeconds: number | null = null;
  let lastSpeedSample: { timeMs: number; bytes: number } | null = null;
  let downloadController = createDownloadController();
  let isDownloadPaused = false;

  $: downloadFileList = getAutoDownloadFileList(includeSafetyChecker);

  onMount(async () => {
    logDebug('Booting app and checking WebGPU availability...');
    try {
      await verifyWebGpuSupport();
      browserReady = true;
      status = 'WebGPU ready. Select local folder or use Auto Download.';
      logDebug('WebGPU check passed.');
    } catch (err) {
      browserReady = false;
      error = normalizeError(err);
      status = 'WebGPU is unavailable. Use a compatible browser and GPU.';
      logDebug(`WebGPU check failed: ${error}`);
    }
  });

  async function handleSelectDirectory() {
    error = '';
    loading = true;
    sessionsReady = false;
    clearRuntimeCache();
    clearLoadedSummary();
    progress = null;

    logDebug('Starting local folder picker flow...');

    try {
      const loadedAssets = await pickAndLoadLocalAssets();
      status = `Loaded ${loadedAssets.onnxFiles.size} ONNX, ${loadedAssets.externalDataFiles.size} external data, ${loadedAssets.tokenizerFiles.size} tokenizer file(s). Initializing sessions...`;
      logDebug(
        `Local files loaded: onnx=${loadedAssets.onnxFiles.size}, external=${loadedAssets.externalDataFiles.size}, tokenizer=${loadedAssets.tokenizerFiles.size}`
      );
      const createdSessions = await createSessionsFromBuffers(loadedAssets);
      setRuntimeAssets(loadedAssets);
      setRuntimeSessions(createdSessions);
      setLoadedSummaryFromAssets(loadedAssets);
      sessionsReady = true;
      status = 'ONNX sessions initialized with WebGPU. Enter a prompt and generate.';
      logDebug('Session creation succeeded from local files.');
    } catch (err) {
      const message = normalizeError(err);
      error = message;
      status = 'Could not load models from local directory.';
      logDebug(`Local loading failed: ${message}`);
    } finally {
      loading = false;
    }
  }

  async function handleAutoDownload() {
    error = '';
    downloading = true;
    sessionsReady = false;
    clearRuntimeCache();
    clearLoadedSummary();
    progress = null;
    initializeFileProgress(downloadFileList);
    resetSpeedTracking();
    isDownloadPaused = false;
    downloadController = createDownloadController();

    logDebug('Starting auto-download flow...');
    logDebug(`Model base URL: ${modelBaseUrl}`);
    logDebug(`Tokenizer base URL: ${tokenizerBaseUrl}`);

    try {
      const loadedAssets = await downloadModelPack({
        modelBaseUrl,
        tokenizerBaseUrl,
        includeSafetyChecker,
        control: downloadController,
        onProgress: (next) => {
          progress = next;
          updateFileProgress(next);
          updateDownloadSpeed(next);
        },
        log: (message) => logDebug(message)
      });

      status = `Downloaded ${loadedAssets.onnxFiles.size} ONNX, ${loadedAssets.externalDataFiles.size} external data, ${loadedAssets.tokenizerFiles.size} tokenizer file(s). Initializing sessions...`;
      logDebug('All downloads completed. Starting session creation.');
      const createdSessions = await createSessionsFromBuffers(loadedAssets);
      setRuntimeAssets(loadedAssets);
      setRuntimeSessions(createdSessions);
      setLoadedSummaryFromAssets(loadedAssets);
      sessionsReady = true;
      status = 'Auto-download complete. Sessions are ready for generation.';
      logDebug('Session creation succeeded from downloaded files.');
    } catch (err) {
      const message = normalizeError(err);
      if (message === DOWNLOAD_CANCELLED_ERROR) {
        status = 'Download cancelled.';
        logDebug('Auto-download cancelled by user.');
      } else {
        error = message;
        status = 'Auto-download failed.';
        logDebug(`Auto-download failed: ${message}`);
      }
    } finally {
      downloading = false;
      isDownloadPaused = false;
    }
  }

  async function handleGenerate() {
    const runtimeAssets = getRuntimeAssets();
    const runtimeSessions = getRuntimeSessions();
    if (!runtimeAssets || !sessionsReady || !runtimeSessions) {
      error = 'Load model files first (local or auto-download).';
      return;
    }
    if (!prompt.trim()) {
      error = 'Prompt is required.';
      return;
    }
    if (!canvasEl) {
      error = 'Canvas is not available.';
      return;
    }

    generating = true;
    error = '';
    status = 'Running local inference with ONNX Runtime Web + WebGPU...';
    logDebug(`Generation started. Prompt="${prompt}"`);

    try {
      const imageData = await generateImage(prompt, runtimeSessions, runtimeAssets.tokenizerFiles);
      canvasEl.width = imageData.width;
      canvasEl.height = imageData.height;
      const ctx = canvasEl.getContext('2d');
      if (!ctx) {
        throw new Error('Could not acquire 2D canvas context.');
      }
      ctx.putImageData(imageData, 0, 0);
      status = `Done. Rendered ${imageData.width}x${imageData.height} image from local model output.`;
      logDebug(`Generation succeeded. Output size=${imageData.width}x${imageData.height}`);
    } catch (err) {
      error = normalizeError(err);
      status = 'Generation failed.';
      logDebug(`Generation failed: ${error}`);
    } finally {
      generating = false;
    }
  }

  async function releaseMemory(): Promise<void> {
    try {
      await releaseRuntimeSessions();
    } catch (err) {
      logDebug(`Session release warning: ${normalizeError(err)}`);
    }

    clearRuntimeCache();
    clearLoadedSummary();
    sessionsReady = false;
    progress = null;
    initializeFileProgress([]);
    resetSpeedTracking();
    prompt = '';

    if (canvasEl) {
      canvasEl.width = 512;
      canvasEl.height = 512;
      const ctx = canvasEl.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
      }
    }

    status = 'Model memory released. Load/download files again to generate.';
    logDebug('Released ONNX sessions and cleared model assets from memory.');
  }

  function pauseDownload(): void {
    if (!downloading || isDownloadPaused) return;
    downloadController.pause();
    isDownloadPaused = true;
    status = 'Download paused.';
    logDebug('Download paused by user.');
  }

  function resumeDownload(): void {
    if (!downloading || !isDownloadPaused) return;
    downloadController.resume();
    isDownloadPaused = false;
    status = 'Download resumed.';
    logDebug('Download resumed by user.');
  }

  function cancelDownload(): void {
    if (!downloading) return;
    downloadController.cancel();
    isDownloadPaused = false;
    logDebug('Cancelling download...');
  }

  function setMethod(next: LoadMethod): void {
    loadMethod = next;
    error = '';
    progress = null;
    status =
      next === 'local'
        ? 'Local folder mode selected. Pick your model directory.'
        : 'Auto-download mode selected. Configure URLs and start download.';
    logDebug(`Switched load method to: ${next}`);
  }

  function normalizeError(err: unknown): string {
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError') {
        return 'Permission denied while accessing local folder.';
      }
      if (err.name === 'AbortError') {
        return 'Directory selection was canceled.';
      }
      return `${err.name}: ${err.message}`;
    }

    if (err instanceof Error) {
      return err.message;
    }

    return String(err);
  }

  function logDebug(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    debugLogs = [...debugLogs, `[${timestamp}] ${message}`];
  }

  function clearDebugLogs(): void {
    debugLogs = [];
  }

  async function copyDebugLogs(): Promise<void> {
    if (debugLogs.length === 0) return;

    const text = debugLogs.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      logDebug('Debug log copied to clipboard.');
    } catch (err) {
      logDebug(`Clipboard copy failed: ${normalizeError(err)}`);
    }
  }

  function setLoadedSummaryFromAssets(loadedAssets: {
    directoryName: string;
    onnxFiles: Map<string, ArrayBuffer>;
    externalDataFiles: Map<string, ArrayBuffer>;
    tokenizerFiles: Map<string, ArrayBuffer>;
  }): void {
    loadedSource = loadedAssets.directoryName;
    loadedOnnxCount = loadedAssets.onnxFiles.size;
    loadedExternalCount = loadedAssets.externalDataFiles.size;
    loadedTokenizerCount = loadedAssets.tokenizerFiles.size;
    hasRuntimeData = true;
  }

  function clearLoadedSummary(): void {
    loadedSource = '';
    loadedOnnxCount = 0;
    loadedExternalCount = 0;
    loadedTokenizerCount = 0;
    hasRuntimeData = false;
  }

  function initializeFileProgress(files: string[]): void {
    const next: Record<string, FileDownloadState> = {};
    for (const name of files) {
      const key = normalizeFileKey(name);
      next[key] = {
        name,
        received: 0,
        total: null,
        phase: 'pending',
        done: false
      };
    }
    fileProgressByName = next;
  }

  function updateFileProgress(next: DownloadProgress): void {
    if (next.fileName === 'complete') {
      const updated: Record<string, FileDownloadState> = { ...fileProgressByName };
      for (const [name, state] of Object.entries(updated)) {
        updated[name] = { ...state, phase: 'done', done: true };
      }
      fileProgressByName = updated;
      etaSeconds = 0;
      return;
    }

    const key = resolveFileKey(next.fileName);
    const prev = fileProgressByName[key] ?? {
      name: next.fileName,
      received: 0,
      total: null,
      phase: 'pending',
      done: false
    };
    const done =
      next.phase === 'saving' ||
      next.phase === 'done' ||
      (next.fileBytesTotal != null && next.fileBytesTotal > 0 && next.fileBytesReceived >= next.fileBytesTotal);

    fileProgressByName = {
      ...fileProgressByName,
      [key]: {
        name: prev.name || next.fileName,
        received: next.fileBytesReceived,
        total: next.fileBytesTotal,
        phase: next.phase,
        done: prev.done || done
      }
    };
  }

  function resetSpeedTracking(): void {
    downloadSpeedBps = 0;
    etaSeconds = null;
    lastSpeedSample = null;
  }

  function updateDownloadSpeed(next: DownloadProgress): void {
    if (next.phase === 'starting' || next.phase === 'done') {
      return;
    }

    const now = performance.now();
    const bytes = next.overallBytesReceived;
    if (!lastSpeedSample) {
      lastSpeedSample = { timeMs: now, bytes };
      return;
    }

    const deltaBytes = bytes - lastSpeedSample.bytes;
    const deltaSeconds = (now - lastSpeedSample.timeMs) / 1000;
    if (deltaBytes > 0 && deltaSeconds > 0.05) {
      const instantaneous = deltaBytes / deltaSeconds;
      downloadSpeedBps = downloadSpeedBps === 0 ? instantaneous : downloadSpeedBps * 0.7 + instantaneous * 0.3;
      lastSpeedSample = { timeMs: now, bytes };
    }

    if (next.overallBytesTotal && downloadSpeedBps > 0) {
      const remaining = Math.max(0, next.overallBytesTotal - next.overallBytesReceived);
      etaSeconds = remaining / downloadSpeedBps;
    } else {
      etaSeconds = null;
    }
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

  function progressPercent(received: number, total: number | null): number {
    if (!total || total <= 0) return 0;
    return Math.max(0, Math.min(100, (received / total) * 100));
  }

  function formatSpeed(bytesPerSecond: number): string {
    if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
      return '--';
    }
    return `${formatBytes(bytesPerSecond)}/s`;
  }

  function formatEta(seconds: number | null): string {
    if (seconds == null || !Number.isFinite(seconds)) {
      return '--';
    }
    if (seconds <= 0) return '0s';
    const total = Math.ceil(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  function filePercent(state: FileDownloadState): number {
    if (state.done || state.phase === 'done' || state.phase === 'saving') return 100;
    if (state.total && state.total > 0) {
      return progressPercent(state.received, state.total);
    }
    if (state.phase === 'downloading' && state.received > 0) {
      return Math.min(95, 8 + Math.log10(state.received + 1) * 14);
    }
    if (state.phase === 'starting') return 4;
    return 0;
  }

  function getFileState(name: string): FileDownloadState {
    const key = normalizeFileKey(name);
    return (
      fileProgressByName[key] ?? {
        name,
        received: 0,
        total: null,
        phase: 'pending',
        done: false
      }
    );
  }

  function phaseLabel(phase: FileProgressPhase): string {
    if (phase === 'pending') return 'Pending';
    if (phase === 'starting') return 'Starting';
    if (phase === 'downloading') return 'Downloading';
    if (phase === 'saving') return 'Saving';
    return 'Done';
  }

  function normalizeFileKey(name: string): string {
    return name.trim().toLowerCase();
  }

  function resolveFileKey(progressName: string): string {
    const direct = normalizeFileKey(progressName);
    if (fileProgressByName[direct]) {
      return direct;
    }

    const entries = Object.keys(fileProgressByName);
    for (const key of entries) {
      if (direct.endsWith(key) || key.endsWith(direct)) {
        return key;
      }
    }

    return direct;
  }
</script>

<svelte:head>
  <title>Z-Image-Turbo Local ONNX</title>
  <meta
    name="description"
    content="On-device text-to-image generation using local ONNX files, ONNX Runtime Web, and WebGPU."
  />
</svelte:head>

<main>
  <h1>Z-Image-Turbo (Local ONNX + WebGPU)</h1>

  <p class="status">{status}</p>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="panel">
    <div class="method-switch">
      <button
        class:active={loadMethod === 'local'}
        on:click={() => setMethod('local')}
        disabled={!browserReady || loading || downloading || generating}>Local Folder</button
      >
      <button
        class:active={loadMethod === 'download'}
        on:click={() => setMethod('download')}
        disabled={!browserReady || loading || downloading || generating}>Auto Download</button
      >
    </div>

    {#if loadMethod === 'local'}
      <button on:click={handleSelectDirectory} disabled={loading || !browserReady}>
        {#if loading}
          Loading local folder...
        {:else}
          Select Local Model Folder
        {/if}
      </button>
    {:else}
      <label for="model-url">Model files base URL</label>
      <input id="model-url" type="text" bind:value={modelBaseUrl} disabled={downloading || generating} />

      <label for="tokenizer-url">Tokenizer files base URL</label>
      <input
        id="tokenizer-url"
        type="text"
        bind:value={tokenizerBaseUrl}
        disabled={downloading || generating}
      />

      <label class="checkbox-row">
        <input type="checkbox" bind:checked={includeSafetyChecker} disabled={downloading || generating} />
        Include safety checker download
      </label>

      <button on:click={handleAutoDownload} disabled={downloading || !browserReady}>
        {#if downloading}
          Downloading model files...
        {:else}
          Download and Prepare Model
        {/if}
      </button>

      <div class="download-controls">
        <button class="small" on:click={pauseDownload} disabled={!downloading || isDownloadPaused}>
          Pause
        </button>
        <button class="small" on:click={resumeDownload} disabled={!downloading || !isDownloadPaused}>
          Resume
        </button>
        <button class="small danger" on:click={cancelDownload} disabled={!downloading}>
          Cancel
        </button>
      </div>
    {/if}

    {#if hasRuntimeData}
      <div class="details">
        <p><strong>Source:</strong> {loadedSource}</p>
        <p><strong>ONNX files:</strong> {loadedOnnxCount}</p>
        <p><strong>External data:</strong> {loadedExternalCount}</p>
        <p><strong>Tokenizer files:</strong> {loadedTokenizerCount}</p>
      </div>
    {/if}
  </div>

  {#if progress && loadMethod === 'download'}
    <div class="panel">
      <p class="progress-label">
        File {progress.fileIndex}/{progress.fileCount}: {progress.fileName}
      </p>
      <p class="progress-meta">
        Speed: {formatSpeed(downloadSpeedBps)} | ETA: {formatEta(etaSeconds)}
      </p>
      <div class="progress-track">
        <div
          class="progress-fill"
          style={`width: ${progressPercent(progress.fileBytesReceived, progress.fileBytesTotal)}%`}
        ></div>
      </div>
      <p class="progress-meta">
        File: {formatBytes(progress.fileBytesReceived)} / {progress.fileBytesTotal
          ? formatBytes(progress.fileBytesTotal)
          : 'unknown'}
      </p>

      <div class="progress-track">
        <div
          class="progress-fill overall"
          style={`width: ${progressPercent(progress.overallBytesReceived, progress.overallBytesTotal)}%`}
        ></div>
      </div>
      <p class="progress-meta">
        Total: {formatBytes(progress.overallBytesReceived)} / {progress.overallBytesTotal
          ? formatBytes(progress.overallBytesTotal)
          : 'unknown'}
      </p>

      <div class="file-progress-list">
        {#each downloadFileList as name}
          {@const state = getFileState(name)}
          <div class="file-progress-row">
            <div class="file-progress-head">
              <span class="file-name">{name}</span>
              <span class="file-state">{phaseLabel(state.phase)}</span>
            </div>
            <div class="progress-track thin">
              <div
                class={`progress-fill ${state.done ? 'overall' : ''}`}
                style={`width: ${filePercent(state)}%`}
              ></div>
            </div>
            <p class="progress-meta file-meta">
              {formatBytes(state.received)} / {state.total ? formatBytes(state.total) : 'unknown'}
            </p>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="panel">
    <label for="prompt">Prompt</label>
    <input
      id="prompt"
      type="text"
      bind:value={prompt}
      placeholder="A cinematic robot in a rainy neon city"
      disabled={!sessionsReady || generating}
    />

    <button on:click={handleGenerate} disabled={!sessionsReady || generating || !prompt.trim()}>
      {#if generating}
        Generating...
      {:else}
        Generate
      {/if}
    </button>

    <button
      class="danger"
      on:click={releaseMemory}
      disabled={loading || downloading || generating || !hasRuntimeData}>
      Release Memory
    </button>
  </div>

  <div class="canvas-wrap">
    <canvas bind:this={canvasEl} width="512" height="512" />
  </div>

  <div class="panel">
    <div class="debug-header">
      <p class="debug-title">Debug Terminal</p>
      <div class="debug-actions">
        <button class="small" on:click={copyDebugLogs} disabled={debugLogs.length === 0}>Copy</button>
        <button class="small" on:click={clearDebugLogs} disabled={debugLogs.length === 0}>Clear</button>
      </div>
    </div>
    <pre class="debug-console">{debugLogs.length > 0
        ? debugLogs.join('\n')
        : 'Debug output will appear here for downloads and generation.'}</pre>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: Inter, system-ui, -apple-system, sans-serif;
    background: #0a0a0a;
    color: #f3f3f3;
  }

  main {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem 1rem 3rem;
    display: grid;
    gap: 1rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .status {
    margin: 0;
    color: #93c5fd;
  }

  .error {
    margin: 0;
    color: #fda4af;
    border: 1px solid rgba(244, 63, 94, 0.4);
    background: rgba(244, 63, 94, 0.12);
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
  }

  .panel {
    display: grid;
    gap: 0.65rem;
    border: 1px solid #2f2f2f;
    background: #161616;
    border-radius: 10px;
    padding: 1rem;
  }

  label {
    font-size: 0.9rem;
    color: #d4d4d4;
  }

  input {
    padding: 0.7rem 0.8rem;
    border-radius: 8px;
    border: 1px solid #404040;
    background: #101010;
    color: #f5f5f5;
  }

  button {
    padding: 0.68rem 0.95rem;
    border: 0;
    border-radius: 8px;
    font-weight: 600;
    background: #2563eb;
    color: white;
    cursor: pointer;
  }

  button.active {
    background: #1d4ed8;
    outline: 1px solid #3b82f6;
  }

  button.danger {
    background: #b91c1c;
  }

  button[disabled] {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .details p {
    margin: 0.2rem 0;
    font-size: 0.92rem;
    color: #d4d4d4;
  }

  .method-switch {
    display: flex;
    gap: 0.6rem;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-size: 0.9rem;
    color: #d4d4d4;
  }

  .checkbox-row input {
    width: 16px;
    height: 16px;
    margin: 0;
  }

  .download-controls {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .progress-label,
  .progress-meta {
    margin: 0;
    font-size: 0.86rem;
    color: #cbd5e1;
  }

  .progress-track {
    width: 100%;
    height: 9px;
    border-radius: 999px;
    background: #1f2937;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #3b82f6;
    transition: width 120ms linear;
  }

  .progress-fill.overall {
    background: #22c55e;
  }

  .progress-track.thin {
    height: 7px;
  }

  .file-progress-list {
    display: grid;
    gap: 0.55rem;
    border-top: 1px solid #2c2c2c;
    padding-top: 0.7rem;
    margin-top: 0.2rem;
    max-height: 320px;
    overflow: auto;
  }

  .file-progress-row {
    display: grid;
    gap: 0.28rem;
  }

  .file-progress-head {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    align-items: baseline;
  }

  .file-name {
    font-size: 0.8rem;
    color: #e5e7eb;
    overflow-wrap: anywhere;
  }

  .file-state {
    font-size: 0.74rem;
    color: #93c5fd;
    white-space: nowrap;
  }

  .file-meta {
    font-size: 0.74rem;
    color: #9ca3af;
  }

  .canvas-wrap {
    display: flex;
    justify-content: center;
    border: 1px solid #2f2f2f;
    background: #111;
    border-radius: 10px;
    padding: 1rem;
  }

  canvas {
    width: min(100%, 512px);
    height: auto;
    border-radius: 8px;
    border: 1px solid #3b3b3b;
    background: #000;
    image-rendering: auto;
  }

  .debug-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .debug-actions {
    display: flex;
    gap: 0.45rem;
  }

  .debug-title {
    margin: 0;
    font-size: 0.9rem;
    color: #d4d4d4;
  }

  .small {
    width: auto;
    padding: 0.4rem 0.65rem;
    font-size: 0.8rem;
  }

  .debug-console {
    margin: 0;
    border-radius: 8px;
    border: 1px solid #2f2f2f;
    background: #0b1220;
    color: #93c5fd;
    min-height: 200px;
    max-height: 280px;
    overflow: auto;
    padding: 0.8rem;
    font-size: 0.78rem;
    line-height: 1.45;
    white-space: pre-wrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
  }
</style>
