import { FFmpeg } from "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
import { fetchFile, toBlobURL } from "https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js";

const IOS_RINGTONE_SECONDS = 30;
const MIN_GAP = 0.25;
const ACCEPTED_EXTENSIONS = new Set(["mp3", "mp4", "m4a", "m4r", "wav"]);

const els = {
    fileInput: document.getElementById("fileInput"),
    dropZone: document.getElementById("dropZone"),
    fileName: document.getElementById("fileName"),
    audioPreview: document.getElementById("audioPreview"),
    waveCanvas: document.getElementById("waveCanvas"),
    waveMaskStart: document.getElementById("waveMaskStart"),
    waveMaskEnd: document.getElementById("waveMaskEnd"),
    waveTimestamps: document.getElementById("waveTimestamps"),
    emptyWave: document.getElementById("emptyWave"),
    durationTitle: document.getElementById("durationTitle"),
    trimLength: document.getElementById("trimLength"),
    startRange: document.getElementById("startRange"),
    endRange: document.getElementById("endRange"),
    rangeFill: document.getElementById("rangeFill"),
    startTime: document.getElementById("startTime"),
    endTime: document.getElementById("endTime"),
    maxLength: document.getElementById("maxLength"),
    previewBtn: document.getElementById("previewBtn"),
    convertBtn: document.getElementById("convertBtn"),
    formatSelect: document.getElementById("formatSelect"),
    outputName: document.getElementById("outputName"),
    fadeInEnabled: document.getElementById("fadeInEnabled"),
    fadeInSlider: document.getElementById("fadeInSlider"),
    fadeInDuration: document.getElementById("fadeInDuration"),
    fadeOutEnabled: document.getElementById("fadeOutEnabled"),
    fadeOutSlider: document.getElementById("fadeOutSlider"),
    fadeOutDuration: document.getElementById("fadeOutDuration"),
    progressLabel: document.getElementById("progressLabel"),
    progressPercent: document.getElementById("progressPercent"),
    progressBar: document.getElementById("progressBar"),
    downloadLink: document.getElementById("downloadLink"),
    message: document.getElementById("message"),
    debugPanel: document.querySelector(".debug-panel"),
    debugBody: document.getElementById("debugBody"),
    debugLog: document.getElementById("debugLog"),
    toggleDebugBtn: document.getElementById("toggleDebugBtn"),
    copyDebugBtn: document.getElementById("copyDebugBtn"),
    clearDebugBtn: document.getElementById("clearDebugBtn"),
    resetBtn: document.getElementById("resetBtn")
};

let sourceFile = null;
let mediaUrl = "";
let duration = IOS_RINGTONE_SECONDS;
let ffmpeg = null;
let ffmpegReady = false;
let activePreviewStop = null;
let activePreviewFrame = null;
let debugLines = [];

init();

function init() {
    els.fileInput.addEventListener("change", event => {
        loadFile(event.target.files?.[0]);
    });

    ["dragenter", "dragover"].forEach(type => {
        els.dropZone.addEventListener(type, event => {
            event.preventDefault();
            els.dropZone.classList.add("dragging");
        });
    });

    ["dragleave", "drop"].forEach(type => {
        els.dropZone.addEventListener(type, event => {
            event.preventDefault();
            els.dropZone.classList.remove("dragging");
        });
    });

    els.dropZone.addEventListener("drop", event => {
        loadFile(event.dataTransfer?.files?.[0]);
    });

    els.startRange.addEventListener("input", () => updateFromRanges("start"));
    els.endRange.addEventListener("input", () => updateFromRanges("end"));
    els.startTime.addEventListener("change", () => updateFromNumbers("start"));
    els.endTime.addEventListener("change", () => updateFromNumbers("end"));
    els.maxLength.addEventListener("change", enforceMaxLength);
    els.previewBtn.addEventListener("click", previewTrim);
    els.convertBtn.addEventListener("click", convertTrim);
    els.resetBtn.addEventListener("click", resetTool);
    els.fadeInEnabled.addEventListener("change", updateFadeControls);
    els.fadeOutEnabled.addEventListener("change", updateFadeControls);
    els.fadeInSlider.addEventListener("input", () => syncFadeInput("in", "slider"));
    els.fadeInDuration.addEventListener("input", () => syncFadeInput("in", "number"));
    els.fadeOutSlider.addEventListener("input", () => syncFadeInput("out", "slider"));
    els.fadeOutDuration.addEventListener("input", () => syncFadeInput("out", "number"));
    els.outputName.addEventListener("input", () => {
        hideDownload();
        logDebug(`Output filename changed to "${getOutputBaseName()}".`);
    });
    els.downloadLink.addEventListener("click", event => {
        if (els.downloadLink.getAttribute("aria-disabled") === "true") {
            event.preventDefault();
        }
    });
    els.toggleDebugBtn.addEventListener("click", toggleDebugPanel);
    els.copyDebugBtn.addEventListener("click", copyDebugLog);
    els.clearDebugBtn.addEventListener("click", clearDebugLog);

    els.formatSelect.addEventListener("change", () => {
        els.convertBtn.textContent = `Convert to ${els.formatSelect.value.toUpperCase()}`;
        hideDownload();
        logDebug(`Output format changed to ${els.formatSelect.value.toUpperCase()}.`);
    });

    logDebug("App initialized.");
    updateFadeControls();
    resetTimeline(IOS_RINGTONE_SECONDS);
}

async function loadFile(file) {
    if (!file) return;

    const extension = getExtension(file.name);
    logDebug(`Selected file: ${file.name} (${file.type || "unknown type"}, ${formatBytes(file.size)}).`);

    if (!ACCEPTED_EXTENSIONS.has(extension)) {
        logDebug(`Rejected file extension: .${extension}.`);
        setMessage("Choose an MP3, MP4, M4A, M4R, or WAV file.", true);
        return;
    }

    sourceFile = file;
    hideDownload();
    revokeMediaUrl();
    mediaUrl = URL.createObjectURL(file);
    els.audioPreview.src = mediaUrl;
    els.fileName.textContent = `${file.name} · ${formatBytes(file.size)}`;
    els.outputName.value = sanitizeName(file.name.replace(/\.[^.]+$/, "")) || "ringtone";
    els.previewBtn.disabled = false;
    els.convertBtn.disabled = false;
    setProgress(0, "Ready");
    setMessage("File loaded. The trim window has been set to the first 30 seconds.");

    els.audioPreview.onloadedmetadata = async () => {
        duration = Number.isFinite(els.audioPreview.duration) ? els.audioPreview.duration : IOS_RINGTONE_SECONDS;
        logDebug(`Browser decoded duration: ${duration.toFixed(3)} seconds.`);
        resetTimeline(duration);
        await drawWaveform(file);
    };

    els.audioPreview.load();
}

function resetTimeline(totalSeconds) {
    const safeDuration = Math.max(MIN_GAP, totalSeconds || IOS_RINGTONE_SECONDS);
    const end = Math.min(IOS_RINGTONE_SECONDS, safeDuration);

    duration = safeDuration;
    [els.startRange, els.endRange].forEach(input => {
        input.max = String(safeDuration);
        input.step = "0.01";
    });
    [els.startTime, els.endTime].forEach(input => {
        input.max = String(safeDuration);
        input.step = "0.01";
    });

    els.startRange.value = "0";
    els.endRange.value = String(end);
    syncNumberInputs();
    updateFill();
    renderWaveTimestamps(safeDuration);
    els.durationTitle.textContent = `Loaded duration: ${formatTime(safeDuration)}`;
}

function updateFromRanges(changed) {
    let start = Number(els.startRange.value);
    let end = Number(els.endRange.value);
    const maxLength = getMaxLength();

    if (changed === "start") {
        start = Math.min(start, duration - MIN_GAP);
        end = Math.max(end, start + MIN_GAP);
        if (end - start > maxLength) end = Math.min(duration, start + maxLength);
    } else {
        end = Math.max(end, MIN_GAP);
        start = Math.min(start, end - MIN_GAP);
        if (end - start > maxLength) start = Math.max(0, end - maxLength);
    }

    setTrim(start, end);
}

function updateFromNumbers(changed) {
    let start = clamp(Number(els.startTime.value), 0, duration - MIN_GAP);
    let end = clamp(Number(els.endTime.value), MIN_GAP, duration);
    const maxLength = getMaxLength();

    if (changed === "start") {
        end = Math.max(end, start + MIN_GAP);
        if (end - start > maxLength) end = Math.min(duration, start + maxLength);
    } else {
        start = Math.min(start, end - MIN_GAP);
        if (end - start > maxLength) start = Math.max(0, end - maxLength);
    }

    setTrim(start, end);
}

function enforceMaxLength() {
    const start = Number(els.startRange.value);
    const maxLength = getMaxLength();
    const end = Math.min(duration, start + maxLength);
    setTrim(start, Math.max(start + MIN_GAP, end));
}

function setTrim(start, end) {
    const roundedStart = clamp(start, 0, duration - MIN_GAP);
    const roundedEnd = clamp(end, roundedStart + MIN_GAP, duration);

    els.startRange.value = roundedStart.toFixed(2);
    els.endRange.value = roundedEnd.toFixed(2);
    syncNumberInputs();
    updateFill();
    hideDownload();
}

function syncNumberInputs() {
    const start = Number(els.startRange.value);
    const end = Number(els.endRange.value);
    els.startTime.value = start.toFixed(2);
    els.endTime.value = end.toFixed(2);
    els.trimLength.textContent = formatTime(end - start);
}

function updateFill() {
    const start = Number(els.startRange.value);
    const end = Number(els.endRange.value);
    const startPct = (start / duration) * 100;
    const endPct = (end / duration) * 100;
    els.rangeFill.style.left = `${startPct}%`;
    els.rangeFill.style.width = `${Math.max(0, endPct - startPct)}%`;
    els.waveMaskStart.style.width = `${startPct}%`;
    els.waveMaskEnd.style.width = `${Math.max(0, 100 - endPct)}%`;
}

function previewTrim() {
    const start = Number(els.startRange.value);
    const end = Number(els.endRange.value);
    const trimDuration = end - start;
    const fadeSettings = getFadeSettings(trimDuration);

    stopPreview();

    els.audioPreview.currentTime = start;
    els.audioPreview.volume = getPreviewVolume(0, trimDuration, fadeSettings);
    logDebug(`Preview started with fade in ${fadeSettings.fadeIn.enabled ? `${fadeSettings.fadeIn.duration.toFixed(2)}s` : "off"} and fade out ${fadeSettings.fadeOut.enabled ? `${fadeSettings.fadeOut.duration.toFixed(2)}s` : "off"}.`);

    const updatePreviewVolume = () => {
        const elapsed = Math.max(0, els.audioPreview.currentTime - start);
        els.audioPreview.volume = getPreviewVolume(elapsed, trimDuration, fadeSettings);
        activePreviewFrame = requestAnimationFrame(updatePreviewVolume);
    };

    activePreviewStop = () => {
        if (els.audioPreview.currentTime >= end) {
            stopPreview();
        }
    };

    els.audioPreview.addEventListener("timeupdate", activePreviewStop);
    activePreviewFrame = requestAnimationFrame(updatePreviewVolume);
    els.audioPreview.play();
}

function stopPreview() {
    if (activePreviewStop) {
        els.audioPreview.removeEventListener("timeupdate", activePreviewStop);
        activePreviewStop = null;
    }

    if (activePreviewFrame) {
        cancelAnimationFrame(activePreviewFrame);
        activePreviewFrame = null;
    }

    els.audioPreview.pause();
    els.audioPreview.volume = 1;
}

function getPreviewVolume(elapsed, trimDuration, fadeSettings) {
    let volume = 1;

    if (fadeSettings.fadeIn.enabled) {
        volume = Math.min(volume, clamp(elapsed / fadeSettings.fadeIn.duration, 0, 1));
    }

    if (fadeSettings.fadeOut.enabled) {
        const remaining = Math.max(0, trimDuration - elapsed);
        volume = Math.min(volume, clamp(remaining / fadeSettings.fadeOut.duration, 0, 1));
    }

    return clamp(volume, 0, 1);
}

async function convertTrim() {
    if (!sourceFile) return;

    try {
        els.convertBtn.disabled = true;
        els.previewBtn.disabled = true;
        hideDownload();
        clearDebugLog(false);
        logDebug("Starting conversion.");
        logDebug(`Browser: ${navigator.userAgent}`);
        logDebug(`Source: ${sourceFile.name} (${sourceFile.type || "unknown type"}, ${formatBytes(sourceFile.size)}).`);
        await ensureFfmpeg();

        const extension = getExtension(sourceFile.name);
        const inputName = `input.${extension}`;
        const outputFormat = els.formatSelect.value;
        const outputName = `${getOutputBaseName()}.${outputFormat}`;
        const start = Number(els.startRange.value);
        const trimDuration = Number(els.endRange.value) - start;
        const fadeSettings = getFadeSettings(trimDuration);
        const command = buildCommand(inputName, outputName, start, trimDuration, outputFormat, fadeSettings);

        logDebug(`Trim start: ${start.toFixed(3)}s.`);
        logDebug(`Trim duration: ${trimDuration.toFixed(3)}s.`);
        logDebug(`Fade in: ${fadeSettings.fadeIn.enabled ? `${fadeSettings.fadeIn.duration.toFixed(2)}s` : "off"}.`);
        logDebug(`Fade out: ${fadeSettings.fadeOut.enabled ? `${fadeSettings.fadeOut.duration.toFixed(2)}s` : "off"}.`);
        logDebug(`Virtual input file: ${inputName}.`);
        logDebug(`Virtual output file: ${outputName}.`);
        logDebug(`FFmpeg command: ffmpeg ${command.join(" ")}`);

        setProgress(18, "Preparing");
        await safeDelete(inputName);
        await safeDelete(outputName);
        const inputData = await fetchFile(sourceFile);
        logDebug(`Read source into memory: ${inputData.byteLength} bytes.`);
        await ffmpeg.writeFile(inputName, inputData);
        logDebug("Wrote source into FFmpeg filesystem.");
        await logFfmpegDirectory("after write");

        setProgress(30, "Converting");
        const exitCode = await ffmpeg.exec(command);
        logDebug(`FFmpeg exited with code ${exitCode}.`);
        await logFfmpegDirectory("after exec");
        if (exitCode !== 0) {
            throw new Error(`FFmpeg exited with code ${exitCode}. Check the debug terminal for FFmpeg output.`);
        }

        setProgress(92, "Packaging");
        const data = await ffmpeg.readFile(outputName);
        logDebug(`Read output from FFmpeg filesystem: ${data.byteLength} bytes.`);
        const blob = new Blob([data.buffer], { type: mimeFor(outputFormat) });
        const url = URL.createObjectURL(blob);

        els.downloadLink.href = url;
        els.downloadLink.download = outputName;
        els.downloadLink.innerHTML = '<span class="download-icon">↓</span><span>Download ringtone</span>';
        els.downloadLink.removeAttribute("hidden");
        els.downloadLink.setAttribute("aria-disabled", "false");
        els.downloadLink.classList.add("is-ready");
        setProgress(100, "Complete");
        setMessage("Done. Your trimmed file is ready to download.");
        logDebug(`Download link enabled for ${outputName}.`);
        logDebug("Conversion complete.");
        await safeDelete(inputName);
        await safeDelete(outputName);
    } catch (error) {
        console.error(error);
        const errorText = errorToText(error);
        logDebug(`ERROR: ${errorText}`);
        setMessage(`Conversion failed: ${errorText}`, true);
        setProgress(0, "Error");
    } finally {
        els.convertBtn.disabled = false;
        els.previewBtn.disabled = false;
    }
}

function buildCommand(inputName, outputName, start, trimDuration, outputFormat, fadeSettings) {
    const base = [
        "-ss", start.toFixed(3),
        "-t", trimDuration.toFixed(3),
        "-i", inputName,
        "-vn"
    ];
    const filters = buildFadeFilters(trimDuration, fadeSettings);
    const audioFilters = filters.length ? ["-af", filters.join(",")] : [];

    if (outputFormat === "wav") {
        return [...base, ...audioFilters, "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", outputName];
    }

    return [...base, ...audioFilters, "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2", "-f", "ipod", "-movflags", "+faststart", outputName];
}

function buildFadeFilters(trimDuration, fadeSettings) {
    const filters = [];

    if (fadeSettings.fadeIn.enabled) {
        filters.push(`afade=t=in:st=0:d=${fadeSettings.fadeIn.duration.toFixed(3)}`);
    }

    if (fadeSettings.fadeOut.enabled) {
        const fadeOutStart = Math.max(0, trimDuration - fadeSettings.fadeOut.duration);
        filters.push(`afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeSettings.fadeOut.duration.toFixed(3)}`);
    }

    return filters;
}

async function ensureFfmpeg() {
    if (ffmpegReady) return;

    ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
        const percent = 30 + Math.round((progress || 0) * 60);
        setProgress(clamp(percent, 30, 90), "Converting");
    });
    ffmpeg.on("log", ({ type, message }) => {
        logDebug(`[ffmpeg ${type}] ${message}`);
    });

    setProgress(6, "Loading converter");
    logDebug("Loading FFmpeg WebAssembly runtime.");
    const ffmpegURL = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm";
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    await ffmpeg.load({
        classWorkerURL: await createFfmpegWorkerURL(ffmpegURL),
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm")
    });
    ffmpegReady = true;
    logDebug("FFmpeg runtime loaded.");
}

async function createFfmpegWorkerURL(ffmpegURL) {
    logDebug("Loading FFmpeg wrapper worker.");
    const response = await fetch(`${ffmpegURL}/worker.js`);
    if (!response.ok) {
        throw new Error("Could not load the FFmpeg worker.");
    }

    const workerCode = (await response.text()).replaceAll(
        'from "./',
        `from "${ffmpegURL}/`
    );

    return URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" }));
}

async function drawWaveform(file) {
    const canvas = els.waveCanvas;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(150 * scale));
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, rect.width, 150);

    try {
        const audioContext = new AudioContext();
        const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());
        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / rect.width);
        const amp = 62;

        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(96, 239, 255, 0.85)";
        ctx.beginPath();

        for (let x = 0; x < rect.width; x += 1) {
            let min = 1;
            let max = -1;
            for (let i = 0; i < step; i += 1) {
                const datum = data[(x * step) + i] || 0;
                min = Math.min(min, datum);
                max = Math.max(max, datum);
            }
            ctx.moveTo(x, 75 + min * amp);
            ctx.lineTo(x, 75 + max * amp);
        }

        ctx.stroke();
        els.emptyWave.style.display = "none";
        await audioContext.close();
        logDebug("Waveform rendered.");
    } catch (error) {
        logDebug(`Waveform unavailable: ${errorToText(error)}`);
        els.emptyWave.textContent = "Waveform unavailable, but trimming still works";
        els.emptyWave.style.display = "grid";
    }
}

function clearWaveform() {
    const canvas = els.waveCanvas;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function renderWaveTimestamps(totalSeconds) {
    const labels = [];
    const divisions = totalSeconds <= 20 ? 4 : 5;

    for (let i = 0; i <= divisions; i += 1) {
        const percent = (i / divisions) * 100;
        const seconds = (totalSeconds * i) / divisions;
        labels.push(`<span class="wave-time" style="left: ${percent}%">${formatTime(seconds)}</span>`);
    }

    els.waveTimestamps.innerHTML = labels.join("");
}

async function safeDelete(name) {
    try {
        await ffmpeg.deleteFile(name);
        logDebug(`Deleted stale virtual file: ${name}.`);
    } catch {
        // File may not exist yet.
    }
}

async function logFfmpegDirectory(label) {
    try {
        const entries = await ffmpeg.listDir("/");
        const names = entries
            .map(entry => `${entry.name}${entry.isDir ? "/" : ""}`)
            .join(", ");
        logDebug(`FFmpeg filesystem ${label}: ${names || "(empty)"}.`);
    } catch (error) {
        logDebug(`Could not list FFmpeg filesystem ${label}: ${errorToText(error)}`);
    }
}

function setProgress(percent, label) {
    els.progressBar.style.width = `${percent}%`;
    els.progressPercent.textContent = `${Math.round(percent)}%`;
    els.progressLabel.textContent = label;
}

function setMessage(text, isError = false) {
    els.message.textContent = text;
    els.message.style.color = isError ? "#ffb8df" : "rgba(235, 242, 255, 0.7)";
}

function logDebug(message) {
    const time = new Date().toLocaleTimeString();
    debugLines.push(`[${time}] ${message}`);
    if (debugLines.length > 220) {
        debugLines = debugLines.slice(-220);
    }
    els.debugLog.textContent = debugLines.join("\n");
    els.debugLog.scrollTop = els.debugLog.scrollHeight;
}

function clearDebugLog(addPlaceholder = true) {
    debugLines = [];
    els.debugLog.textContent = addPlaceholder ? "Debug log cleared." : "";
}

function updateFadeControls() {
    els.fadeInSlider.disabled = !els.fadeInEnabled.checked;
    els.fadeInDuration.disabled = !els.fadeInEnabled.checked;
    els.fadeOutSlider.disabled = !els.fadeOutEnabled.checked;
    els.fadeOutDuration.disabled = !els.fadeOutEnabled.checked;
    hideDownload();
    logDebug(`Fade controls updated: in=${els.fadeInEnabled.checked ? `${els.fadeInDuration.value}s` : "off"}, out=${els.fadeOutEnabled.checked ? `${els.fadeOutDuration.value}s` : "off"}.`);
}

function syncFadeInput(which, source) {
    const slider = which === "in" ? els.fadeInSlider : els.fadeOutSlider;
    const number = which === "in" ? els.fadeInDuration : els.fadeOutDuration;

    if (source === "slider") {
        number.value = slider.value;
    } else {
        const safeValue = clamp(Number(number.value) || 0.1, 0.1, 10).toFixed(1);
        number.value = safeValue;
        slider.value = safeValue;
    }

    hideDownload();
    logDebug(`Fade duration changed: in=${els.fadeInDuration.value}s, out=${els.fadeOutDuration.value}s.`);
}

function getFadeSettings(trimDuration) {
    return {
        fadeIn: {
            enabled: els.fadeInEnabled.checked,
            duration: clampFadeDuration(els.fadeInDuration.value, trimDuration)
        },
        fadeOut: {
            enabled: els.fadeOutEnabled.checked,
            duration: clampFadeDuration(els.fadeOutDuration.value, trimDuration)
        }
    };
}

function clampFadeDuration(value, trimDuration) {
    const seconds = Number(value) || 0;
    return clamp(seconds, 0.1, Math.max(0.1, Math.min(10, trimDuration)));
}

function resetTool() {
    stopPreview();
    sourceFile = null;
    els.fileInput.value = "";
    revokeMediaUrl();
    els.audioPreview.removeAttribute("src");
    els.audioPreview.load();
    els.fileName.textContent = "MP3, MP4, M4A, M4R, or WAV accepted";
    els.outputName.value = "ringtone";
    els.fadeInEnabled.checked = false;
    els.fadeOutEnabled.checked = false;
    els.fadeInSlider.value = "1.5";
    els.fadeInDuration.value = "1.5";
    els.fadeOutSlider.value = "2";
    els.fadeOutDuration.value = "2";
    els.previewBtn.disabled = true;
    els.convertBtn.disabled = true;
    els.emptyWave.textContent = "Select a file to reveal the timeline";
    els.emptyWave.style.display = "grid";
    clearWaveform();
    resetTimeline(IOS_RINGTONE_SECONDS);
    hideDownload();
    setProgress(0, "Ready");
    setMessage("Choose a new file to start another ringtone.");
    updateFadeControls();
    clearDebugLog(false);
    logDebug("Tool reset. Ready for a new file.");
}

function toggleDebugPanel() {
    const isOpen = els.toggleDebugBtn.getAttribute("aria-expanded") === "true";
    const nextOpen = !isOpen;

    els.toggleDebugBtn.setAttribute("aria-expanded", String(nextOpen));
    els.toggleDebugBtn.textContent = nextOpen ? "Hide" : "Show";
    els.debugBody.hidden = !nextOpen;
    els.debugPanel.classList.toggle("is-collapsed", !nextOpen);
}

async function copyDebugLog() {
    const text = els.debugLog.textContent || "";
    try {
        await navigator.clipboard.writeText(text);
        logDebug("Copied debug log to clipboard.");
    } catch {
        logDebug("Could not copy debug log. Select the text manually.");
    }
}

function errorToText(error) {
    if (!error) return "Unknown error";
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    if (error.name) return error.name;

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function hideDownload() {
    if (els.downloadLink.href && els.downloadLink.href.startsWith("blob:")) {
        URL.revokeObjectURL(els.downloadLink.href);
    }
    els.downloadLink.href = "#";
    els.downloadLink.download = "";
    els.downloadLink.innerHTML = '<span class="download-icon">↓</span><span>Download ringtone</span>';
    els.downloadLink.setAttribute("aria-disabled", "true");
    els.downloadLink.classList.remove("is-ready");
}

function revokeMediaUrl() {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    mediaUrl = "";
}

function getMaxLength() {
    return clamp(Number(els.maxLength.value) || IOS_RINGTONE_SECONDS, 1, 40);
}

function getExtension(name) {
    return name.split(".").pop().toLowerCase();
}

function sanitizeName(name) {
    return String(name || "")
        .trim()
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9-_ ]/gi, "")
        .replace(/\s+/g, "-")
        .slice(0, 80);
}

function getOutputBaseName() {
    return sanitizeName(els.outputName.value) || "ringtone";
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function formatTime(seconds) {
    const safe = Math.max(0, seconds);
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function mimeFor(format) {
    if (format === "wav") return "audio/wav";
    return "audio/mp4";
}
