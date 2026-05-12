import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

const SUPPORTED_EXTENSIONS = new Set([
    "mp4", "m4a", "mp3", "wav", "webm", "ogg", "aac", "flac"
]);

const els = {
    browserStatus: document.getElementById("browserStatus"),
    pickFolderBtn: document.getElementById("pickFolderBtn"),
    fileInput: document.getElementById("fileInput"),
    includeSubfolders: document.getElementById("includeSubfolders"),
    deleteOriginals: document.getElementById("deleteOriginals"),
    useWebGPU: document.getElementById("useWebGPU"),
    modelSelect: document.getElementById("modelSelect"),
    wordCount: document.getElementById("wordCount"),
    selectionSummary: document.getElementById("selectionSummary"),
    startBtn: document.getElementById("startBtn"),
    clearBtn: document.getElementById("clearBtn"),
    currentTask: document.getElementById("currentTask"),
    progressText: document.getElementById("progressText"),
    progressBar: document.getElementById("progressBar"),
    resultsBody: document.getElementById("resultsBody"),
    resultsPanel: document.getElementById("resultsPanel"),
    modeInputs: document.getElementsByName("toolMode"),
    renameOptionsGroup: document.getElementById("renameOptionsGroup"),
    folderOptionsGroup: document.getElementById("folderOptionsGroup"),
    pickFileBtn: document.getElementById("pickFileBtn"),
    // Transcript panel
    transcriptPanel: document.getElementById("transcriptPanel"),
    transcriptSegments: document.getElementById("transcriptSegments"),
    transcriptMeta: document.getElementById("transcriptMeta"),
    copyAllTranscriptBtn: document.getElementById("copyAllTranscriptBtn"),
    downloadTranscriptBtn: document.getElementById("downloadTranscriptBtn")
};

let selectedItems = [];
let rootDirectoryHandle = null;
let transcriber = null;
let transcriberKey = "";
let _transcriptAllChunks = [];   // accumulates chunks across files for Copy All / Download
let _transcriptBlobUrls = [];    // object URLs created for audio playback - revoked on clear
let _activeAudioElements = [];   // all Audio instances - used to pause others on seek

console.log("[startup] Local Speech File Renamer loaded.");
console.log("[startup] User agent:", navigator.userAgent);

init();

function init() {
    checkBrowserSupport();

    els.pickFolderBtn.addEventListener("click", chooseFolder);
    els.pickFileBtn.addEventListener("click", chooseFile);
    els.fileInput.addEventListener("change", chooseFilesFallback);
    els.startBtn.addEventListener("click", runBatch);
    els.clearBtn.addEventListener("click", clearAll);

    els.modelSelect.addEventListener("change", resetModel);
    els.useWebGPU.addEventListener("change", resetModel);

    els.modeInputs.forEach(input => {
        input.addEventListener("change", updateModeUI);
    });

    els.copyAllTranscriptBtn.addEventListener("click", copyAllTranscript);
    els.downloadTranscriptBtn.addEventListener("click", downloadTranscript);

    // Sync panel visibility to the initially-checked radio on page load
    updateModeUI();
}

function updateModeUI() {
    const mode = getSelectedMode();
    console.log("[ui] Mode changed to:", mode);

    const isTranscribe = mode === "transcribe";
    const isExtractOrTranscribe = mode === "extract" || isTranscribe;

    if (isExtractOrTranscribe) {
        els.renameOptionsGroup.classList.add("hidden");
        els.folderOptionsGroup.classList.add("hidden");
    } else {
        els.renameOptionsGroup.classList.remove("hidden");
        els.folderOptionsGroup.classList.remove("hidden");
    }

    // Show the dedicated transcript panel only in transcribe mode
    if (isTranscribe) {
        els.resultsPanel.classList.add("hidden");
        els.transcriptPanel.classList.remove("hidden");
    } else {
        els.resultsPanel.classList.remove("hidden");
        els.transcriptPanel.classList.add("hidden");
    }
}

function getSelectedMode() {
    return Array.from(els.modeInputs).find(i => i.checked)?.value || "rename";
}

function checkBrowserSupport() {
    const hasDirectoryPicker = "showDirectoryPicker" in window;

    if (hasDirectoryPicker) {
        els.browserStatus.textContent = "Folder write supported in this browser";
        els.browserStatus.classList.add("ok");
        console.log("[support] showDirectoryPicker is available.");
    } else {
        els.browserStatus.textContent = "Folder write not supported - use Chrome/Edge";
        els.browserStatus.classList.add("warn");
        console.warn("[support] showDirectoryPicker is not available. Automatic renamed output files may not work.");
    }

    if (!window.isSecureContext) {
        console.warn("[support] This page is not in a secure context. Use VS Code Live Server / localhost.");
    }
}

async function chooseFolder() {
    try {
        if (!("showDirectoryPicker" in window)) {
            throw new Error("showDirectoryPicker is not supported. Use Chrome or Edge on desktop.");
        }

        console.log("[folder] Opening directory picker…");

        rootDirectoryHandle = await window.showDirectoryPicker({
            mode: "readwrite"
        });

        console.log("[folder] Selected directory:", rootDirectoryHandle.name);

        const permission = await verifyPermission(rootDirectoryHandle, true);
        if (!permission) {
            throw new Error("Read/write permission was not granted for the selected folder.");
        }

        selectedItems = [];
        const includeSubfolders = els.includeSubfolders.checked;

        await walkDirectory(rootDirectoryHandle, "", includeSubfolders, selectedItems);

        console.log("[folder] Supported media files found:", selectedItems.length, selectedItems);

        updateSelectionUI();
        clearResults();
    } catch (error) {
        console.error("[folder] Failed to choose folder:", error);
        alert(`Could not choose folder: ${error.message}`);
    }
}

async function chooseFile() {
    try {
        if (!("showOpenFilePicker" in window)) {
            alert("Single file picker is not supported in this browser. Use the fallback picker.");
            return;
        }

        console.log("[file] Opening file picker…");

        const [handle] = await window.showOpenFilePicker({
            types: [
                {
                    description: "Media files",
                    accept: {
                        "audio/*": [".mp3", ".wav", ".ogg", ".aac", ".m4a", ".flac"],
                        "video/*": [".mp4", ".webm"]
                    }
                }
            ],
            multiple: false
        });

        console.log("[file] Selected file:", handle.name);

        const file = await handle.getFile();
        rootDirectoryHandle = null;

        selectedItems = [{
            file,
            fileHandle: handle,
            directoryHandle: null,
            relativePath: file.name
        }];

        updateSelectionUI();
        clearResults();
    } catch (error) {
        if (error.name === "AbortError") return;
        console.error("[file] Failed to choose file:", error);
        alert(`Could not choose file: ${error.message}`);
    }
}

async function chooseFilesFallback(event) {
    try {
        const files = Array.from(event.target.files || []);
        console.log("[fallback] Files selected:", files.length);

        rootDirectoryHandle = null;

        selectedItems = files
            .filter(file => isSupportedFile(file.name))
            .map(file => ({
                file,
                fileHandle: null,
                directoryHandle: null,
                relativePath: file.webkitRelativePath || file.name
            }));

        console.log("[fallback] Supported media files:", selectedItems.length, selectedItems);

        updateSelectionUI();
        clearResults();
    } catch (error) {
        console.error("[fallback] Failed to read selected files:", error);
        alert(`Could not read files: ${error.message}`);
    }
}

async function walkDirectory(directoryHandle, relativePath, includeSubfolders, output) {
    console.log("[walk] Reading directory:", relativePath || directoryHandle.name);

    for await (const [name, handle] of directoryHandle.entries()) {
        const childPath = relativePath ? `${relativePath}/${name}` : name;

        if (handle.kind === "file") {
            if (!isSupportedFile(name)) {
                console.log("[walk] Skipping unsupported file:", childPath);
                continue;
            }

            const file = await handle.getFile();

            output.push({
                file,
                fileHandle: handle,
                directoryHandle,
                relativePath: childPath
            });

            console.log("[walk] Added media file:", childPath);
        }

        if (handle.kind === "directory" && includeSubfolders) {
            if (name === "renamed-output") {
                console.log("[walk] Skipping output folder:", childPath);
                continue;
            }

            await walkDirectory(handle, childPath, includeSubfolders, output);
        }
    }
}

async function verifyPermission(fileHandle, withWrite) {
    const options = withWrite ? { mode: "readwrite" } : { mode: "read" };

    if ((await fileHandle.queryPermission(options)) === "granted") {
        return true;
    }

    if ((await fileHandle.requestPermission(options)) === "granted") {
        return true;
    }

    return false;
}

function isSupportedFile(filename) {
    const ext = getExtension(filename);
    return SUPPORTED_EXTENSIONS.has(ext);
}

function getExtension(filename) {
    const dotIndex = filename.lastIndexOf(".");
    if (dotIndex === -1) return "";
    return filename.slice(dotIndex + 1).toLowerCase();
}

function getBaseName(filename) {
    const dotIndex = filename.lastIndexOf(".");
    if (dotIndex === -1) return filename;
    return filename.slice(0, dotIndex);
}

function updateSelectionUI() {
    const count = selectedItems.length;

    els.selectionSummary.textContent = count === 1
        ? "1 supported media file selected."
        : `${count} supported media files selected.`;

    els.startBtn.disabled = count === 0;
    updateProgress(0, count);

    console.log("[ui] Selection updated:", count);
}

function resetModel() {
    console.log("[model] Model/device settings changed. Resetting cached transcriber.");
    transcriber = null;
    transcriberKey = "";
}

async function getTranscriber() {
    const modelId = els.modelSelect.value;
    const device = els.useWebGPU.checked ? "webgpu" : "wasm";
    const key = `${modelId}|${device}`;

    if (transcriber && transcriberKey === key) {
        console.log("[model] Reusing existing transcriber:", key);
        return transcriber;
    }

    console.log("[model] Loading model:", modelId);
    console.log("[model] Device requested:", device);

    els.currentTask.textContent = `Loading ${modelId}. First load can take a while…`;

    env.allowLocalModels = false;
    env.useBrowserCache = true;

    try {
        transcriber = await pipeline("automatic-speech-recognition", modelId, {
            device,
            dtype: "q8",
            progress_callback: progress => {
                console.log("[model-progress]", progress);

                if (progress.status === "progress") {
                    const percent = progress.progress ? Math.round(progress.progress) : 0;
                    els.currentTask.textContent = `Downloading/loading model… ${percent}%`;
                }

                if (progress.status === "ready") {
                    els.currentTask.textContent = "Model ready.";
                }
            }
        });

        transcriberKey = key;
        console.log("[model] Model loaded successfully:", key);
        return transcriber;
    } catch (error) {
        console.error("[model] Failed to load requested device/model:", error);

        if (device === "webgpu") {
            console.warn("[model] WebGPU failed. Falling back to WASM.");
            els.useWebGPU.checked = false;
            transcriber = null;
            transcriberKey = "";
            return getTranscriber();
        }

        throw error;
    }
}

async function runBatch() {
    if (!selectedItems.length) {
        alert("Choose a folder or files first.");
        return;
    }

    els.startBtn.disabled = true;
    els.pickFolderBtn.disabled = true;
    els.fileInput.disabled = true;

    clearResults();

    console.log("[batch] Starting batch:", selectedItems.length);

    let outputDirectoryHandle = null;

    try {
        const mode = getSelectedMode();
        const outputFolderName = mode === "rename" ? "renamed-output" :
                               mode === "transcribe" ? "transcriptions-with-timestamps" : "transcriptions";

        if (rootDirectoryHandle) {
            outputDirectoryHandle = await rootDirectoryHandle.getDirectoryHandle(outputFolderName, {
                create: true
            });
            console.log(`[output] Output folder ready: ${outputFolderName}`);
        } else {
            console.warn("[output] No writable folder handle. Fallback mode will only show proposed names.");
        }

        const asr = await getTranscriber();

        for (let i = 0; i < selectedItems.length; i++) {
            const item = selectedItems[i];
            updateProgress(i, selectedItems.length);

            els.currentTask.textContent = `Transcribing ${item.relativePath}`;
            console.log(`[batch] Processing ${i + 1}/${selectedItems.length}: ${item.relativePath} (Mode: ${mode})`);

            try {
                const returnTimestamps = mode === "transcribe";
                const result = await transcribeFile(asr, item.file, returnTimestamps, (p) => {
                    // p is 0-100
                    const subPercent = p / 100;
                    updateProgress(i, selectedItems.length, subPercent);
                    els.currentTask.textContent = `Transcribing ${item.relativePath} (${Math.round(p)}%)`;
                });
                
                let text = "";
                let displaySpeech = "";

                if (mode === "transcribe" && result.chunks) {
                    text = formatChunks(result.chunks);
                    displaySpeech = normalizeTranscript(result.text || "");
                } else {
                    text = normalizeTranscript(result.text || "");
                    displaySpeech = text;
                }

                if (mode === "rename") {
                    const newFilename = await createUniqueFilename(outputDirectoryHandle, item.file.name, text);

                    console.log("[transcript]", {
                        file: item.relativePath,
                        text,
                        newFilename
                    });

                    if (outputDirectoryHandle) {
                        await writeCopiedFile(outputDirectoryHandle, newFilename, item.file);
                        console.log("[write] Created renamed copy:", newFilename);

                        if (els.deleteOriginals.checked && item.directoryHandle) {
                            await item.directoryHandle.removeEntry(item.file.name);
                            console.log("[delete] Deleted original:", item.relativePath);
                        }

                        addResultRow({
                            original: item.relativePath,
                            speech: text || "(No speech detected)",
                            newFilename,
                            status: els.deleteOriginals.checked ? "Copied + original deleted" : "Copied"
                        }, "ok");
                    } else {
                        addResultRow({
                            original: item.relativePath,
                            speech: text || "(No speech detected)",
                            newFilename,
                            status: "Preview only - browser cannot write files from fallback picker"
                        }, "warn");
                    }
                } else if (mode === "transcribe") {
                    const txtFilename = `${getBaseName(item.file.name)}.txt`;
                    console.log("[transcript-timestamped]", {
                        file: item.relativePath,
                        txtFilename
                    });

                    const savedOk = outputDirectoryHandle
                        ? (await writeTextFile(outputDirectoryHandle, txtFilename, text), true)
                        : false;

                    if (savedOk) {
                        console.log("[write] Saved timestamped transcription:", txtFilename);
                    }

                    addTranscriptFileBlock({
                        filename: item.relativePath,
                        chunks: result.chunks || [],
                        saved: savedOk,
                        txtFilename,
                        file: item.file
                    });
                } else {
                    // Extract mode
                    const txtFilename = `${getBaseName(item.file.name)}.txt`;
                    console.log("[transcript]", {
                        file: item.relativePath,
                        text,
                        txtFilename
                    });

                    if (outputDirectoryHandle) {
                        await writeTextFile(outputDirectoryHandle, txtFilename, text);
                        console.log("[write] Saved transcription:", txtFilename);

                        addResultRow({
                            original: item.relativePath,
                            speech: text || "(No speech detected)",
                            newFilename: "-",
                            status: "Transcript saved"
                        }, "ok");
                    } else {
                        addResultRow({
                            original: item.relativePath,
                            speech: text || "(No speech detected)",
                            newFilename: "-",
                            status: "Preview only - transcription not saved"
                        }, "warn");
                    }
                }
            } catch (error) {
                console.error("[file-error] Failed processing file:", item.relativePath, error);

                addResultRow({
                    original: item.relativePath,
                    speech: "",
                    newFilename: "",
                    status: `Error: ${error.message}`
                }, "error");
            }
        }

        updateProgress(selectedItems.length, selectedItems.length);
        els.currentTask.textContent = "Finished.";
        console.log("[batch] Finished.");
    } catch (error) {
        console.error("[batch] Fatal batch error:", error);
        els.currentTask.textContent = `Stopped: ${error.message}`;
        alert(`Batch failed: ${error.message}`);
    } finally {
        els.startBtn.disabled = selectedItems.length === 0;
        els.pickFolderBtn.disabled = false;
        els.fileInput.disabled = false;
    }
}

async function transcribeFile(asr, file, returnTimestamps = false, onProgress = null) {
    console.log("[transcribe] Creating blob URL for:", file.name, file.type, file.size, "Timestamps:", returnTimestamps);

    const url = URL.createObjectURL(file);

    try {
        const modelId = els.modelSelect.value;
        const englishOnly = isEnglishOnlyWhisperModel(modelId);

        console.log("[transcribe] Selected model:", modelId);
        console.log("[transcribe] English-only Whisper model:", englishOnly);

        let options = {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: returnTimestamps,
            progress_callback: (info) => {
                if (info.status === "progress" && onProgress) {
                    onProgress(info.progress);
                }
            }
        };

        if (!englishOnly) {
            options.language = "english";
            options.task = "transcribe";
            console.log("[transcribe] Using multilingual options with task/language.");
        } else {
            console.log("[transcribe] Using English-only options.");
        }

        const result = await asr(url, options);

        console.log("[transcribe] Completed:", file.name, result);
        return result;
    } catch (error) {
        console.error("[transcribe] Failed:", file.name, error);
        throw new Error(`Transcription failed. Browser may not decode this file/codec or model options may be invalid. ${error.message}`);
    } finally {
        URL.revokeObjectURL(url);
    }
}

function isEnglishOnlyWhisperModel(modelId) {
    const normalized = String(modelId || "").toLowerCase();

    return (
        normalized.includes("whisper-tiny.en") ||
        normalized.includes("whisper-base.en") ||
        normalized.includes("whisper-small.en") ||
        normalized.includes("whisper-medium.en")
    );
}

function normalizeTranscript(text) {
    return String(text || "")
        .replace(/\s+/g, " ")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .trim();
}

async function createUniqueFilename(outputDirectoryHandle, originalName, transcript) {
    const ext = getExtension(originalName);
    const wordCount = clamp(parseInt(els.wordCount.value, 10) || 4, 1, 10);

    const words = transcript
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/gi, " ")
        .split(/\s+/)
        .map(word => word.replace(/^[-']+|[-']+$/g, ""))
        .filter(Boolean)
        .slice(0, wordCount);

    let base = words.join("-");

    if (!base) {
        base = `no-speech-${getBaseName(originalName).slice(0, 24)}`;
    }

    base = sanitizeFilename(base).slice(0, 80) || "untitled-speech";

    let candidate = `${base}.${ext}`;
    let counter = 2;

    if (!outputDirectoryHandle) {
        return candidate;
    }

    while (await fileExists(outputDirectoryHandle, candidate)) {
        candidate = `${base}-${counter}.${ext}`;
        counter++;
    }

    return candidate;
}

function sanitizeFilename(name) {
    return name
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\.+$/g, "")
        .replace(/^-+|-+$/g, "")
        .replace(/--+/g, "-")
        .trim();
}

async function fileExists(directoryHandle, filename) {
    try {
        await directoryHandle.getFileHandle(filename);
        return true;
    } catch (error) {
        return false;
    }
}

async function writeCopiedFile(directoryHandle, filename, file) {
    console.log("[write] Writing file:", filename);

    const newFileHandle = await directoryHandle.getFileHandle(filename, {
        create: true
    });

    const writable = await newFileHandle.createWritable();
    await writable.write(file);
    await writable.close();
}

async function writeTextFile(directoryHandle, filename, content) {
    console.log("[write] Writing text file:", filename);

    const newFileHandle = await directoryHandle.getFileHandle(filename, {
        create: true
    });

    const writable = await newFileHandle.createWritable();
    await writable.write(content);
    await writable.close();
}

function addResultRow(result, statusType) {
    if (els.resultsBody.querySelector(".empty-cell")) {
        els.resultsBody.innerHTML = "";
    }

    const row = document.createElement("tr");

    const originalCell = document.createElement("td");
    originalCell.textContent = result.original;

    const speechCell = document.createElement("td");
    speechCell.className = "speech-cell";

    const speechText = document.createElement("div");
    speechText.className = "speech-text";
    speechText.textContent = result.speech;

    if (result.speech && result.speech !== "(No speech detected)") {
        const copyBtn = document.createElement("button");
        copyBtn.className = "copy-mini-btn";
        copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
        `;
        copyBtn.title = "Copy to clipboard";
        copyBtn.onclick = () => copyToClipboard(result.speech, copyBtn);
        speechCell.appendChild(copyBtn);
    }
    speechCell.appendChild(speechText);

    const newNameCell = document.createElement("td");
    newNameCell.textContent = result.newFilename;

    const statusCell = document.createElement("td");
    statusCell.textContent = result.status;

    if (statusType === "ok") statusCell.className = "status-ok";
    if (statusType === "error") statusCell.className = "status-error";
    if (statusType === "warn") statusCell.className = "status-warn";

    row.append(originalCell, speechCell, newNameCell, statusCell);
    els.resultsBody.appendChild(row);
}

async function copyToClipboard(text, btn) {
    try {
        await navigator.clipboard.writeText(text);
        const originalIcon = btn.innerHTML;

        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
        btn.classList.add("copied");

        setTimeout(() => {
            btn.innerHTML = originalIcon;
            btn.classList.remove("copied");
        }, 2000);
    } catch (err) {
        console.error("Failed to copy text: ", err);
    }
}

function clearResults() {
    els.resultsBody.innerHTML = `
    <tr>
      <td colspan="4" class="empty-cell">Results will appear here.</td>
    </tr>
  `;

    // Pause and revoke all audio
    _activeAudioElements.forEach(a => { try { a.pause(); } catch (_) {} });
    _activeAudioElements = [];
    _transcriptBlobUrls.forEach(url => URL.revokeObjectURL(url));
    _transcriptBlobUrls = [];

    // Reset the transcript panel
    els.transcriptSegments.innerHTML = `<div class="transcript-empty">Run the Transcribe mode to see segments here.</div>`;
    els.transcriptMeta.textContent = "Segments will appear here.";
}

function clearAll() {
    console.log("[clear] Clearing selection and results.");

    selectedItems = [];
    rootDirectoryHandle = null;
    _transcriptAllChunks = [];
    _activeAudioElements = [];
    _transcriptBlobUrls = [];
    els.fileInput.value = "";
    els.selectionSummary.textContent = "No folder selected yet.";
    els.currentTask.textContent = "Idle.";
    els.startBtn.disabled = true;

    updateProgress(0, 0);
    clearResults();
}

function updateProgress(done, total, subProgress = 0) {
    const totalDone = done + subProgress;
    const percent = total ? Math.min(100, Math.round((totalDone / total) * 100)) : 0;

    els.progressText.textContent = `${done} / ${total}`;
    els.progressBar.style.width = `${percent}%`;

    if (percent > 0 && percent < 100) {
        els.progressBar.classList.add("processing");
    } else {
        els.progressBar.classList.remove("processing");
    }

    console.log("[progress]", { done, total, subProgress, percent });
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function formatTimestamp(seconds) {
    if (seconds === null || seconds === undefined) return "??:??";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");

    if (h > 0) {
        const hh = String(h).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
    }
    return `${mm}:${ss}`;
}

function formatChunks(chunks) {
    if (!chunks || !chunks.length) return "";

    return chunks.map(chunk => {
        const start = formatTimestamp(chunk.timestamp[0]);
        const end = formatTimestamp(chunk.timestamp[1]);
        const text = chunk.text.trim();
        return `[${start} -> ${end}] ${text}`;
    }).join("\n");
}

// =========================================================
// Transcript Panel UI
// =========================================================

function addTranscriptFileBlock({ filename, chunks, saved, txtFilename, file }) {
    // Remove the empty placeholder if present
    const empty = els.transcriptSegments.querySelector(".transcript-empty");
    if (empty) empty.remove();

    // Divider between files
    if (els.transcriptSegments.children.length > 0) {
        const divider = document.createElement("div");
        divider.className = "transcript-file-divider";
        els.transcriptSegments.appendChild(divider);
    }

    // Accumulate for copy-all / download
    _transcriptAllChunks.push({ filename, chunks });
    updateTranscriptMeta();

    // ---- Create Audio element for playback
    const blobUrl = URL.createObjectURL(file);
    _transcriptBlobUrls.push(blobUrl);
    const audio = new Audio(blobUrl);
    audio.preload = "metadata";
    _activeAudioElements.push(audio);

    // ---- File block wrapper
    const block = document.createElement("div");
    block.className = "transcript-file-block";

    // ---- File header
    const header = document.createElement("div");
    header.className = "transcript-file-header";

    const icon = document.createElement("div");
    icon.className = "transcript-file-icon";
    icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>`;

    const name = document.createElement("span");
    name.className = "transcript-file-name";
    name.textContent = filename;

    const statusBadge = document.createElement("span");
    statusBadge.className = `transcript-file-status ${saved ? "ok" : "warn"}`;
    statusBadge.textContent = saved ? `Saved as ${txtFilename}` : "Preview only";

    header.append(icon, name, statusBadge);
    block.appendChild(header);

    // ---- Mini audio player
    block.appendChild(buildMiniPlayer(audio));

    // ---- Segment list
    if (!chunks || chunks.length === 0) {
        const noSpeech = document.createElement("div");
        noSpeech.className = "transcript-no-speech";
        noSpeech.textContent = "No speech detected in this file.";
        block.appendChild(noSpeech);
    } else {
        const { listEl, segmentEls } = buildSegmentList(chunks, audio);
        block.appendChild(listEl);

        // Highlight the active segment as audio plays
        audio.addEventListener("timeupdate", () => {
            const t = audio.currentTime;
            segmentEls.forEach(({ el, start, end }) => {
                const active = t >= start && (end === null || t < end);
                el.classList.toggle("transcript-segment--active", active);
            });
        });
    }

    els.transcriptSegments.appendChild(block);
}

function buildMiniPlayer(audio) {
    const PLAY_SVG  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const PAUSE_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

    const player = document.createElement("div");
    player.className = "transcript-mini-player";

    const playBtn = document.createElement("button");
    playBtn.className = "mini-player-btn";
    playBtn.type = "button";
    playBtn.title = "Play / Pause";
    playBtn.innerHTML = PLAY_SVG;

    const track = document.createElement("div");
    track.className = "mini-player-track";

    const fill = document.createElement("div");
    fill.className = "mini-player-fill";
    track.appendChild(fill);

    const timeEl = document.createElement("span");
    timeEl.className = "mini-player-time";
    timeEl.textContent = "0:00";

    const durEl = document.createElement("span");
    durEl.className = "mini-player-duration";
    durEl.textContent = "/ --:--";

    player.append(playBtn, track, timeEl, durEl);

    // Play / Pause toggle
    playBtn.addEventListener("click", () => {
        if (audio.paused) {
            _activeAudioElements.forEach(a => { if (a !== audio) a.pause(); });
            audio.play();
        } else {
            audio.pause();
        }
    });

    audio.addEventListener("play",  () => { playBtn.innerHTML = PAUSE_SVG; });
    audio.addEventListener("pause", () => { playBtn.innerHTML = PLAY_SVG; });
    audio.addEventListener("ended", () => { playBtn.innerHTML = PLAY_SVG; });

    audio.addEventListener("loadedmetadata", () => {
        durEl.textContent = `/ ${formatTimestamp(audio.duration)}`;
    });

    audio.addEventListener("timeupdate", () => {
        const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
        fill.style.width = pct + "%";
        timeEl.textContent = formatTimestamp(audio.currentTime);
    });

    // Scrub by clicking the track
    track.addEventListener("click", e => {
        if (!audio.duration) return;
        const rect  = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * audio.duration;
        if (audio.paused) audio.play();
    });

    return player;
}

function buildSegmentList(chunks, audio) {
    const list = document.createElement("div");
    list.className = "transcript-segment-list";
    const segmentEls = [];

    for (const chunk of chunks) {
        const seg = document.createElement("div");
        seg.className = "transcript-segment";

        const startTime = chunk.timestamp[0] ?? 0;
        const endTime   = chunk.timestamp[1];
        const startTs   = formatTimestamp(startTime);
        const endTs     = formatTimestamp(endTime);

        // Timestamp badge — now a <button> so it's keyboard-accessible
        const tsBadge = document.createElement("button");
        tsBadge.type = "button";
        tsBadge.className = "segment-timestamp";
        tsBadge.title = `Play from ${startTs}`;
        tsBadge.innerHTML = `
            <svg class="ts-play-icon" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            ${startTs}<span class="segment-timestamp-arrow">→</span>${endTs}`;

        tsBadge.addEventListener("click", () => {
            // Pause every other file's audio first
            _activeAudioElements.forEach(a => { if (a !== audio) a.pause(); });
            audio.currentTime = startTime;
            audio.play();
        });

        const textEl = document.createElement("span");
        textEl.className = "segment-text";
        textEl.textContent = chunk.text.trim();

        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "segment-copy-btn";
        copyBtn.title = "Copy segment";
        copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        copyBtn.addEventListener("click", () => copyToClipboard(chunk.text.trim(), copyBtn));

        seg.append(tsBadge, textEl, copyBtn);
        list.appendChild(seg);
        segmentEls.push({ el: seg, start: startTime, end: endTime });
    }

    return { listEl: list, segmentEls };
}

function updateTranscriptMeta() {
    const fileCount = _transcriptAllChunks.length;
    const segCount  = _transcriptAllChunks.reduce((n, f) => n + (f.chunks?.length || 0), 0);
    els.transcriptMeta.textContent = `${fileCount} file${fileCount !== 1 ? "s" : ""} · ${segCount} segment${segCount !== 1 ? "s" : ""}`;
}

function buildFullTranscriptText() {
    return _transcriptAllChunks.map(({ filename, chunks }) => {
        const header = `=== ${filename} ===`;
        const body   = (chunks || []).map(c => {
            const start = formatTimestamp(c.timestamp[0]);
            const end   = formatTimestamp(c.timestamp[1]);
            return `[${start} -> ${end}]  ${c.text.trim()}`;
        }).join("\n");
        return `${header}\n${body}`;
    }).join("\n\n");
}

function copyAllTranscript() {
    const text = buildFullTranscriptText();
    if (!text) return;
    copyToClipboard(text, els.copyAllTranscriptBtn);
}

function downloadTranscript() {
    const text = buildFullTranscriptText();
    if (!text) return;

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "transcript.txt";
    a.click();
    URL.revokeObjectURL(url);
}