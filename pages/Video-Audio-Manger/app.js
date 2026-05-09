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
    modeInputs: document.getElementsByName("toolMode"),
    renameOptionsGroup: document.getElementById("renameOptionsGroup"),
    folderOptionsGroup: document.getElementById("folderOptionsGroup"),
    pickFileBtn: document.getElementById("pickFileBtn")
};

let selectedItems = [];
let rootDirectoryHandle = null;
let transcriber = null;
let transcriberKey = "";

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
}

function updateModeUI() {
    const mode = getSelectedMode();
    console.log("[ui] Mode changed to:", mode);

    if (mode === "extract") {
        els.renameOptionsGroup.classList.add("hidden");
        els.folderOptionsGroup.classList.add("hidden");
    } else {
        els.renameOptionsGroup.classList.remove("hidden");
        els.folderOptionsGroup.classList.remove("hidden");
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
        const outputFolderName = mode === "rename" ? "renamed-output" : "transcriptions";

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
                const result = await transcribeFile(asr, item.file);
                const text = normalizeTranscript(result.text || "");

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

async function transcribeFile(asr, file) {
    console.log("[transcribe] Creating blob URL for:", file.name, file.type, file.size);

    const url = URL.createObjectURL(file);

    try {
        const modelId = els.modelSelect.value;
        const englishOnly = isEnglishOnlyWhisperModel(modelId);

        console.log("[transcribe] Selected model:", modelId);
        console.log("[transcribe] English-only Whisper model:", englishOnly);

        let options;

        if (englishOnly) {
            options = {
                chunk_length_s: 30,
                stride_length_s: 5
            };

            console.log("[transcribe] Using English-only options. Not passing task/language.");
        } else {
            options = {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: "english",
                task: "transcribe"
            };

            console.log("[transcribe] Using multilingual options with task/language.");
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
}

function clearAll() {
    console.log("[clear] Clearing selection and results.");

    selectedItems = [];
    rootDirectoryHandle = null;
    els.fileInput.value = "";
    els.selectionSummary.textContent = "No folder selected yet.";
    els.currentTask.textContent = "Idle.";
    els.startBtn.disabled = true;

    updateProgress(0, 0);
    clearResults();
}

function updateProgress(done, total) {
    const percent = total ? Math.round((done / total) * 100) : 0;

    els.progressText.textContent = `${done} / ${total}`;
    els.progressBar.style.width = `${percent}%`;

    console.log("[progress]", { done, total, percent });
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}