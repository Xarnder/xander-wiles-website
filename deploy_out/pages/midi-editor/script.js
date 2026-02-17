/* 
    MIDI Editor & Custom Sampler Script 
    Uses Tone.js for Audio and @tonejs/midi for parsing
*/

// --- DOM Elements ---
const statusLog = document.getElementById('status-log');
const audioInput = document.getElementById('audioFile');
const midiInput = document.getElementById('midiFile');
const rootNoteSelect = document.getElementById('rootNote');
const testAudioBtn = document.getElementById('testAudioBtn');
const playBtn = document.getElementById('playBtn'); // Control Panel Button
// New Persistent Controls
const permRewindBtn = document.getElementById('permRewindBtn');
const permPlayBtn = document.getElementById('permPlayBtn');
const permStopBtn = document.getElementById('permStopBtn');

const stopBtn = document.getElementById('stopBtn'); // Control Panel Stop
const canvasWrapper = document.getElementById('canvasWrapper');
const canvas = document.getElementById('midiCanvas');
const keysCanvas = document.getElementById('keysCanvas');
const ctx = canvas.getContext('2d');
const keysCtx = keysCanvas.getContext('2d');
const fileInfo = document.getElementById('file-info');

const playHead = document.getElementById('playHead');
const overlayPlayBtn = document.getElementById('overlayPlayBtn');
const downloadBtn = document.getElementById('downloadBtn');
const shiftUpBtn = document.getElementById('shiftUp');
const shiftDownBtn = document.getElementById('shiftDown');
const shiftDisplay = document.getElementById('shiftDisplay');

// Tuning Assistant Elements
const tuningInterface = document.getElementById('tuning-interface');
const playRawBtn = document.getElementById('playRawBtn');
const autoDetectBtn = document.getElementById('autoDetectBtn');
const pianoContainer = document.getElementById('pianoContainer');
const octaveDownBtn = document.getElementById('octaveDown'); // Tuning assistant octave
const octaveUpBtn = document.getElementById('octaveUp'); // Tuning assistant octave
const currentOctaveDisplay = document.getElementById('currentOctaveDisplay');

// --- Global Variables ---
let sampler;
let referenceSynth;
let rawPlayer;
let currentMidi = null;
let userAudioUrl = null;
let userAudioBuffer = null;
let isPlaying = false;
let animationId = null;

// Tuning State
let currentOctave = 4;

// Playback & Transposition State
let transposeOffset = 0; // In semitones
let minNote = 48; // Global state for rendering sync
let maxNote = 72;

// --- Initialization ---

function init() {
    populateNoteSelect();
    renderPiano();
    setupEventListeners();
    resizeCanvas();
    log("System initialized. Upload a sample to start.");

    sampler = new Tone.Sampler({
        urls: {},
        baseUrl: "",
        onload: () => log("Audio Engine Ready.")
    }).toDestination();

    referenceSynth = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 }
    }).toDestination();
    referenceSynth.volume.value = -5;

    // Initial draw to clear
    drawEmptyGrid();
}

// --- Helper Functions ---

function log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    if (statusLog) statusLog.innerText = `[${timestamp}] ${msg}`;
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

function populateNoteSelect() {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let html = '';
    for (let oct = 1; oct <= 7; oct++) {
        notes.forEach(note => {
            const noteName = `${note}${oct}`;
            const selected = noteName === 'C4' ? 'selected' : '';
            html += `<option value="${noteName}" ${selected}>${noteName}</option>`;
        });
    }
    rootNoteSelect.innerHTML = html;
}

// --- Tuning Assistant UI (Piano) ---
// (Kept mostly same, just ensuring variables play nice)
function renderPiano() {
    pianoContainer.innerHTML = '';
    const notes = [
        { name: 'C', type: 'white' },
        { name: 'C#', type: 'black' },
        { name: 'D', type: 'white' },
        { name: 'D#', type: 'black' },
        { name: 'E', type: 'white' },
        { name: 'F', type: 'white' },
        { name: 'F#', type: 'black' },
        { name: 'G', type: 'white' },
        { name: 'G#', type: 'black' },
        { name: 'A', type: 'white' },
        { name: 'A#', type: 'black' },
        { name: 'B', type: 'white' }
    ];

    notes.forEach(n => {
        const div = document.createElement('div');
        div.className = `key ${n.type === 'white' ? 'white-key' : 'black-key'}`;
        div.dataset.note = n.name;

        div.addEventListener('mousedown', async () => {
            await startAudioContext();
            const noteFull = `${n.name}${currentOctave}`;
            playReferenceNote(noteFull);
            rootNoteSelect.value = noteFull;
            updateSampler();
            div.classList.add('active');
            setTimeout(() => div.classList.remove('active'), 200);
        });

        pianoContainer.appendChild(div);
    });
}

function playReferenceNote(note) {
    if (referenceSynth) {
        referenceSynth.triggerAttackRelease(note, "8n");
        log(`Playing Reference: ${note}`);
    }
}

octaveUpBtn.addEventListener('click', () => {
    if (currentOctave < 7) {
        currentOctave++;
        currentOctaveDisplay.innerText = currentOctave;
    }
});

octaveDownBtn.addEventListener('click', () => {
    if (currentOctave > 1) {
        currentOctave--;
        currentOctaveDisplay.innerText = currentOctave;
    }
});

// --- Audio Upload & Handling ---

async function startAudioContext() {
    if (Tone.context.state !== 'running') {
        await Tone.start();
    }
}

audioInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        await startAudioContext();
        log(`Loading audio: ${file.name}...`);
        userAudioUrl = URL.createObjectURL(file);

        userAudioBuffer = new Tone.Buffer(userAudioUrl, () => {
            log(`Audio loaded. Use Tuning Assistant to find pitch.`, "success");
            tuningInterface.classList.remove('hidden');
            if (rawPlayer) rawPlayer.dispose();
            rawPlayer = new Tone.Player(userAudioBuffer).toDestination();
        });

        updateSampler();
    } catch (err) {
        log(`Error loading audio: ${err.message}`, "error");
    }
});

playRawBtn.addEventListener('click', async () => {
    if (rawPlayer && rawPlayer.loaded) {
        log("Playing original uploaded file...");
        rawPlayer.start();
    }
});

autoDetectBtn.addEventListener('click', () => {
    if (!userAudioBuffer || !userAudioBuffer.loaded) return;
    log("Analyzing pitch...", "info");
    const bufferData = userAudioBuffer.getChannelData(0);
    const sampleRate = Tone.context.sampleRate;
    const detectedFreq = autoCorrelate(bufferData, sampleRate);

    if (detectedFreq === -1) {
        log("Could not detect pitch clearly. Try manual tuning.", "warn");
    } else {
        const note = Tone.Frequency(detectedFreq).toNote();
        log(`Detected Pitch: ${note} (${Math.round(detectedFreq)}Hz)`, "success");
        rootNoteSelect.value = note;
        const oct = note.slice(-1);
        if (!isNaN(oct)) {
            currentOctave = parseInt(oct);
            currentOctaveDisplay.innerText = currentOctave;
        }
        updateSampler();
    }
});

function autoCorrelate(buf, sampleRate) {
    const SIZE = 2048;
    const start = Math.floor(buf.length / 2) - (SIZE / 2);
    if (start < 0) return -1;
    const slice = buf.slice(start, start + SIZE);
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += slice[i] * slice[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(slice[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
        if (Math.abs(slice[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }

    const buf2 = slice.slice(r1, r2);
    const c = new Array(buf2.length).fill(0);
    for (let i = 0; i < buf2.length; i++) {
        for (let j = 0; j < buf2.length - i; j++) {
            c[i] = c[i] + buf2[j] * buf2[j + i];
        }
    }
    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < buf2.length; i++) {
        if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    let T0 = maxpos;
    if (T0 === -1) return -1;
    return sampleRate / T0;
}

// --- Sampler Logic ---

function updateSampler() {
    if (!userAudioUrl) return;
    const rootNote = rootNoteSelect.value;
    if (sampler) sampler.dispose();
    const sampleMap = {};
    sampleMap[rootNote] = userAudioUrl;
    sampler = new Tone.Sampler({
        urls: sampleMap,
        baseUrl: "",
    }).toDestination();
}

rootNoteSelect.addEventListener('change', () => { if (userAudioUrl) updateSampler(); });
testAudioBtn.addEventListener('click', async () => {
    await startAudioContext();
    if (sampler && sampler.loaded) {
        log("Auditioning Middle C (C4)...");
        sampler.triggerAttackRelease(["C4"], 1);
    } else {
        log("No audio loaded.", "warn");
    }
});

// --- MIDI Handling ---

midiInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        log(`Parsing MIDI: ${file.name}...`);
        const arrayBuffer = await file.arrayBuffer();
        currentMidi = new Midi(arrayBuffer);

        if (!currentMidi || !currentMidi.duration) throw new Error("Invalid MIDI file.");

        const duration = currentMidi.duration.toFixed(2);
        log(`MIDI Loaded: ${duration}s`);
        fileInfo.innerText = `${file.name} | ${duration}s`;

        enablePlaybackControls(true);
        resetTransport();

        // Calculate bounds for rendering
        calculateMidiBounds(currentMidi);
        drawMidi(currentMidi);
        drawKeys();

    } catch (err) {
        console.error(err);
        log(`Error: ${err.message}`, "error");
    }
});

function enablePlaybackControls(enabled) {
    const btns = [playBtn, stopBtn, permPlayBtn, permStopBtn, permRewindBtn];
    btns.forEach(b => b.disabled = !enabled);
    if (enabled) overlayPlayBtn.classList.remove('hidden');
}

// --- Playback & Animation Loop ---

// Shared toggle Logic
function togglePlayback() {
    if (Tone.Transport.state === "started") {
        pausePlayback();
    } else {
        startPlayback();
    }
}

playBtn.addEventListener('click', togglePlayback);
overlayPlayBtn.addEventListener('click', togglePlayback);
permPlayBtn.addEventListener('click', togglePlayback);

// Rewind (Stop and Reset)
permRewindBtn.addEventListener('click', () => {
    stopPlayback();
    Tone.Transport.position = 0;
    updatePlayHead(0);
});

// Stop
stopBtn.addEventListener('click', stopPlayback);
permStopBtn.addEventListener('click', stopPlayback);

async function startPlayback() {
    if (!currentMidi) return;
    await startAudioContext();

    if (Tone.Transport.state !== "started") {
        // If starting from 0, or resumed
        if (Tone.Transport.seconds === 0) {
            scheduleMidiEvents();
        }
        Tone.Transport.start();
    }

    updatePlaybackUI(true);
    animate();
}

function pausePlayback() {
    Tone.Transport.pause();
    // Release active notes so they don't hang
    if (sampler) sampler.releaseAll();
    updatePlaybackUI(false);
    cancelAnimationFrame(animationId);
}

function stopPlayback() {
    Tone.Transport.stop();
    Tone.Transport.cancel(); // Clear scheduled events?
    // Actually, if we cancel, we must reschedule on next play.
    // Simpler to just pause and seek 0 for "stop behavior", but cancel is cleaner.

    if (sampler) sampler.releaseAll();

    updatePlaybackUI(false);
    cancelAnimationFrame(animationId);

    // Reset visually
    updatePlayHead(0);
    if (currentMidi) drawMidi(currentMidi);
}

function resetTransport() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.position = 0;
    updatePlayHead(0);
}

function scheduleMidiEvents() {
    // We clear previous because we might be rescheduling from 0
    Tone.Transport.cancel();

    currentMidi.tracks.forEach(track => {
        track.notes.forEach(note => {
            if (sampler) {
                // Schedule each note on the transport timeline
                // Use Transport.schedule
                Tone.Transport.schedule((time) => {
                    const transposedMidi = note.midi + transposeOffset;
                    const freq = Tone.Frequency(transposedMidi, "midi");

                    // We use a small lookahead or just 'time' provided by Transport
                    sampler.triggerAttackRelease(
                        freq, note.duration, time, note.velocity
                    );
                }, note.time);
            }
        });
    });

    // Auto-pause at end
    Tone.Transport.scheduleOnce(() => {
        pausePlayback();
        Tone.Transport.position = 0; // Or just stop
        updatePlayHead(0);
        log("Playback finished.");
    }, currentMidi.duration + 0.5);
}

function updatePlaybackUI(playing) {
    isPlaying = playing;
    const text = playing ? "Pause" : "Play";
    const symbol = playing ? "⏸" : "▶";

    playBtn.innerText = text;
    permPlayBtn.innerText = symbol;

    if (playing) {
        playBtn.classList.add("danger");
        overlayPlayBtn.classList.add("hidden");
        playHead.style.display = 'block';
    } else {
        playBtn.classList.remove("danger");
        overlayPlayBtn.classList.remove("hidden");
        // Don't hide playHead on pause, only stop
        if (Tone.Transport.position === 0 && Tone.Transport.seconds === 0) {
            playHead.style.display = 'none';
        } else {
            playHead.style.display = 'block';
        }
    }
}

function animate() {
    if (Tone.Transport.state !== "started") return;

    const time = Tone.Transport.seconds;
    updatePlayHead(time);
    drawMidi(currentMidi, time);

    animationId = requestAnimationFrame(animate);
}

function updatePlayHead(time) {
    if (!currentMidi) return;
    const duration = currentMidi.duration;
    const progress = Math.min(1, time / duration);
    playHead.style.left = `${progress * 100}%`;
}


// --- Seek Implementation ---

canvasWrapper.addEventListener('click', (e) => {
    if (!currentMidi) return;

    const rect = canvasWrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const seekTime = ratio * currentMidi.duration;

    // Move Transport
    Tone.Transport.seconds = seekTime;

    // Release any hanging notes from jump
    if (sampler) sampler.releaseAll();

    // Update visuals immediately
    updatePlayHead(seekTime);
    drawMidi(currentMidi, seekTime);

    log(`Seek to: ${seekTime.toFixed(2)}s`);
});

// --- Visualizer Logic ---

function resizeCanvas() {
    const wrapper = document.querySelector('.canvas-container');
    if (wrapper) {
        canvas.width = wrapper.clientWidth - 60;
        canvas.height = wrapper.clientHeight;
        keysCanvas.width = 60;
        keysCanvas.height = wrapper.clientHeight;

        if (currentMidi) {
            drawMidi(currentMidi, Tone.Transport.seconds); // Redraw with current time
            drawKeys();
        } else {
            drawEmptyGrid();
        }
    }
}

window.addEventListener('resize', resizeCanvas);

function calculateMidiBounds(midi) {
    let min = 127, max = 0;
    midi.tracks.forEach(t => t.notes.forEach(n => {
        const visiblePitch = n.midi + transposeOffset;
        if (visiblePitch < min) min = visiblePitch;
        if (visiblePitch > max) max = visiblePitch;
    }));

    if (min > max) { min = 48; max = 72; }
    minNote = Math.max(0, min - 2);
    maxNote = Math.min(127, max + 2);
}

function drawMidi(midi, currentTime = -1) {
    if (!midi) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const duration = midi.duration;
    const width = canvas.width;
    const height = canvas.height;
    const range = maxNote - minNote;
    const h = height / range;

    midi.tracks.forEach((track, i) => {
        const baseHue = (i * 137) % 360;
        track.notes.forEach(n => {
            const visiblePitch = n.midi + transposeOffset;

            // Check if active
            const isActive = currentTime >= n.time && currentTime < (n.time + n.duration);

            if (isActive) {
                ctx.fillStyle = `#fff`;
                ctx.shadowBlur = 10;
                ctx.shadowColor = `hsl(${baseHue}, 100%, 50%)`;
            } else {
                ctx.fillStyle = `hsl(${baseHue}, 70%, 60%)`;
                ctx.shadowBlur = 0;
            }

            ctx.fillRect(
                (n.time / duration) * width,
                height - ((visiblePitch - minNote) * h) - h,
                (n.duration / duration) * width,
                h - 1
            );
        });
    });
    ctx.shadowBlur = 0;
}

function drawKeys() {
    keysCtx.clearRect(0, 0, keysCanvas.width, keysCanvas.height);
    const height = keysCanvas.height;
    const range = maxNote - minNote;
    const keyHeight = height / range;

    for (let i = minNote; i < maxNote; i++) {
        const noteName = Tone.Frequency(i, "midi").toNote();
        const isBlack = noteName.includes("#");
        const y = height - ((i - minNote) * keyHeight) - keyHeight;

        keysCtx.fillStyle = isBlack ? "#333" : "#ddd";
        keysCtx.fillRect(0, y, keysCanvas.width, keyHeight - 1);

        if (noteName.startsWith("C") && !noteName.includes("#")) {
            keysCtx.fillStyle = isBlack ? "#fff" : "#333";
            keysCtx.font = "10px sans-serif";
            keysCtx.fillText(noteName, 4, y + keyHeight - 2);
        }
    }
}

function drawEmptyGrid() {
    ctx.fillStyle = "#333";
    ctx.textAlign = "center";
    ctx.font = "14px sans-serif";
    ctx.fillText("Load MIDI to visualize", canvas.width / 2, canvas.height / 2);
}

// --- Transposition Controls ---

function handleTranspose(delta) {
    transposeOffset += delta;
    updateShiftDisplay();
    // Re-schedule if playing to apply pitch shift immediately?
    // Tone.js scheduling is locked in. We need to cancel and reschedule if we want live shift?
    // Or just simple check mechanism inside dynamic scheduler?
    // We used fixed schedule events. Let's just reschedule.
    if (Tone.Transport.state === "started") {
        scheduleMidiEvents(); // This might double schedule if not careful?
        // scheduleMidiEvents calls cancel first, so it's safe.
    }

    // Redraw static for visual update
    calculateMidiBounds(currentMidi);
    drawMidi(currentMidi, Tone.Transport.seconds);
    drawKeys();
}

shiftUpBtn.addEventListener('click', () => handleTranspose(12));
shiftDownBtn.addEventListener('click', () => handleTranspose(-12));

function updateShiftDisplay() {
    const octaves = transposeOffset / 12;
    shiftDisplay.innerText = octaves > 0 ? `+${octaves}` : octaves;
}

// --- Download MP3/WAV ---

const exportFormat = document.getElementById('exportFormat');

downloadBtn.addEventListener('click', async () => {
    if (!currentMidi || !userAudioBuffer) {
        alert("Please load a MIDI file and an Audio Sample first.");
        return;
    }

    const format = exportFormat.value; // 'wav' or 'mp3'
    const originalText = downloadBtn.innerText;
    downloadBtn.innerText = "Rendering...";
    downloadBtn.disabled = true;

    try {
        const duration = currentMidi.duration + 2; // buffer time
        const sampleMap = {};
        sampleMap[rootNoteSelect.value] = userAudioUrl;

        // Render Offline
        const buffer = await Tone.Offline(async ({ transport }) => {
            const offlineSampler = new Tone.Sampler({
                urls: sampleMap,
                baseUrl: ""
            }).toDestination();

            await Tone.loaded();

            currentMidi.tracks.forEach(track => {
                track.notes.forEach(note => {
                    const transposedMidi = note.midi + transposeOffset;
                    const freq = Tone.Frequency(transposedMidi, "midi");
                    offlineSampler.triggerAttackRelease(
                        freq, note.duration, note.time, note.velocity
                    );
                });
            });

            transport.start();
        }, duration);

        let blob;
        let filename = 'remix';

        if (format === 'mp3') {
            log("Encoding MP3...", "info");
            blob = bufferToMp3(buffer);
            filename += '.mp3';
        } else {
            log("Encoding WAV...", "info");
            blob = bufferToWave(buffer);
            filename += '.wav';
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 100);

        log(`Download ready: ${filename}`, "success");

    } catch (e) {
        console.error(e);
        log("Render failed: " + e.message, "error");
        alert("Rendering failed. See console.");
    } finally {
        downloadBtn.innerText = originalText;
        downloadBtn.disabled = false;
    }
});

function bufferToMp3(buffer) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
    const mp3Data = [];

    // Process left/right channels
    // LameJS expects 16-bit integers
    const left = buffer.getChannelData(0);
    const right = channels > 1 ? buffer.getChannelData(1) : left;

    const sampleBlockSize = 1152; // multiple of 576

    for (let i = 0; i < left.length; i += sampleBlockSize) {
        const leftChunk = left.subarray(i, i + sampleBlockSize);
        const rightChunk = right.subarray(i, i + sampleBlockSize);

        // Convert to Int16
        const leftInt = new Int16Array(leftChunk.length);
        const rightInt = new Int16Array(rightChunk.length);

        for (let j = 0; j < leftChunk.length; j++) {
            // Clamp and scale
            const l = Math.max(-1, Math.min(1, leftChunk[j]));
            leftInt[j] = l < 0 ? l * 32768 : l * 32767;

            const r = Math.max(-1, Math.min(1, rightChunk[j]));
            rightInt[j] = r < 0 ? r * 32768 : r * 32767;
        }

        const mp3buf = (channels === 1)
            ? mp3encoder.encodeBuffer(leftInt)
            : mp3encoder.encodeBuffer(leftInt, rightInt);

        if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }

    // Flush
    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);

    return new Blob(mp3Data, { type: 'audio/mp3' });
}

// Simple WAV encoder (Integer 16-bit)
function bufferToWave(abuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const len = abuffer.length;
    const length = len * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"

    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit

    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 4);                   // chunk length

    // write interleaved data
    for (i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {             // interleave channels
            // Check if offset is within bounds
            if (offset >= len) {
                break;
            }
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
            view.setInt16(pos, sample, true);          // write 16-bit sample
            pos += 2;
        }
        offset++;                                     // next source sample
    }

    return new Blob([buffer], { type: "audio/wav" });

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
}

function setupEventListeners() {
    window.addEventListener("dragover", e => e.preventDefault());
    window.addEventListener("drop", e => e.preventDefault());
}

init();