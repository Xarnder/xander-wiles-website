/* 
    Tune Creator & Custom Sampler Script 
    Features: Tone.js Sampler, Mathematical Diatonic Music Generation, and Intelligent Note-Synced Chords
*/

// --- DOM Elements ---
const statusLog = document.getElementById('status-log');
const audioInput = document.getElementById('audioFile');
const rootNoteSelect = document.getElementById('rootNote');
const testAudioBtn = document.getElementById('testAudioBtn');

const generateBtn = document.getElementById('generateBtn');
const genKey = document.getElementById('genKey');
const genScale = document.getElementById('genScale');
const midiInput = document.getElementById('midiFile');

const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const permRewindBtn = document.getElementById('permRewindBtn');
const permPlayBtn = document.getElementById('permPlayBtn');
const permStopBtn = document.getElementById('permStopBtn');

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

const tuningInterface = document.getElementById('tuning-interface');
const playRawBtn = document.getElementById('playRawBtn');
const autoDetectBtn = document.getElementById('autoDetectBtn');
const pianoContainer = document.getElementById('pianoContainer');
const octaveDownBtn = document.getElementById('octaveDown');
const octaveUpBtn = document.getElementById('octaveUp');
const currentOctaveDisplay = document.getElementById('currentOctaveDisplay');

// Chord UI Elements
const chordBarSelect = document.getElementById('chordBarSelect'); // Now used for Notes
const suggestedChordsContainer = document.getElementById('suggestedChordsContainer');
const customChordSelect = document.getElementById('customChordSelect');
const addChordBtn = document.getElementById('addChordBtn');
const clearAllChordsBtn = document.getElementById('clearAllChordsBtn');

// Dynamically Add Auto-Harmonize Button
const autoHarmBtn = document.createElement('button');
autoHarmBtn.className = "btn accent small-btn";
autoHarmBtn.innerText = "Auto-Harmonize All Notes";
autoHarmBtn.style.marginTop = "10px";
clearAllChordsBtn.parentNode.appendChild(autoHarmBtn);

// --- Global Variables ---
let sampler;
let referenceSynth;
let rawPlayer;
let currentMidi = null;
let userAudioUrl = null;
let userAudioBuffer = null;
let isPlaying = false;
let animationId = null;

let currentOctave = 4;
let transposeOffset = 0;
let minNote = 48;
let maxNote = 72;

// --- Global Project State (for Music Theory & Chords) ---
let currentProject = {
    rootMidi: 60,
    scaleType: 'major',
    tempo: 110,
    beatsPerBar: 4,
    bars: 8,
    progressionRoots: [0, 4, 5, 3],
    addedChords: {} // Format: { noteIndex: scaleDegree }
};

// Math logic mappings
const DIATONIC_SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10]
};

const PENTATONIC_SUBSETS = {
    major: [0, 1, 2, 4, 5],
    minor: [0, 2, 3, 4, 6]
};

const PROGRESSION_ROOTS = {
    major: [0, 4, 5, 3], // I - V - vi - IV
    minor: [0, 3, 4, 0]  // i - iv - v - i
};

const ROMAN_NUMERALS = {
    major: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
    minor: ["i", "ii°", "III", "iv", "v", "VI", "VII"]
};


// --- Initialization ---
function init() {
    populateNoteSelect();
    renderPiano();
    setupEventListeners();
    resizeCanvas();
    log("System initialized. Upload a sample or generate a tune.");

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

    drawEmptyGrid();
}

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
function renderPiano() {
    pianoContainer.innerHTML = '';
    const notes = [
        { name: 'C', type: 'white' }, { name: 'C#', type: 'black' },
        { name: 'D', type: 'white' }, { name: 'D#', type: 'black' },
        { name: 'E', type: 'white' }, { name: 'F', type: 'white' },
        { name: 'F#', type: 'black' }, { name: 'G', type: 'white' },
        { name: 'G#', type: 'black' }, { name: 'A', type: 'white' },
        { name: 'A#', type: 'black' }, { name: 'B', type: 'white' }
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
    if (Tone.context.state !== 'running') await Tone.start();
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
    if (sampler && sampler.loaded) sampler.triggerAttackRelease(["C4"], 1);
    else log("No audio loaded.", "warn");
});


// --- MATHEMATICAL MUSIC GENERATOR (MELODY & BASS) ---

const RHYTHMS = [
    [1, 1, 1, 1], [0.5, 0.5, 1, 2], [1.5, 0.5, 1, 1],
    [1, 0.5, 0.5, 2], [0.5, 1.5, 1, 1], [2, 0.5, 0.5, 1]
];

const END_RHYTHMS = [[1, 1, 2], [2, 2], [1, 3], [0.5, 0.5, 3]];

generateBtn.addEventListener('click', async () => {
    await startAudioContext();
    log("Running Advanced Mathematical Algorithm...", "info");

    const rootMidi = parseInt(genKey.value);
    let userScale = genScale.value;
    let isPentatonic = false;

    let diatonicHarmony = userScale;
    if (userScale === 'pentatonic') {
        isPentatonic = true;
        diatonicHarmony = 'major';
    }

    currentProject = {
        rootMidi: rootMidi,
        scaleType: diatonicHarmony,
        tempo: 110,
        beatsPerBar: 4,
        bars: 8,
        progressionRoots: PROGRESSION_ROOTS[diatonicHarmony],
        addedChords: {}
    };

    const diatonicIntervals = DIATONIC_SCALES[diatonicHarmony];
    const scaleLength = diatonicIntervals.length;

    const newMidi = new Midi();
    newMidi.header.setTempo(currentProject.tempo);
    const melodyTrack = newMidi.addTrack();
    const bassTrack = newMidi.addTrack();

    melodyTrack.name = "Melody";
    bassTrack.name = "Bass";

    const beatDuration = 60 / currentProject.tempo;

    const rhythmA = RHYTHMS[Math.floor(Math.random() * RHYTHMS.length)];
    const rhythmB = RHYTHMS[Math.floor(Math.random() * RHYTHMS.length)];
    const rhythmEnd = END_RHYTHMS[Math.floor(Math.random() * END_RHYTHMS.length)];
    const getRhythmForBar = (bar) => [rhythmA, rhythmB, rhythmA, rhythmEnd, rhythmB, rhythmA, rhythmA, rhythmEnd][bar];

    let currentTime = 0;
    let currentScaleIndex = Math.floor(scaleLength * 1.0);
    const maxScaleIndex = scaleLength * 2 - 1;

    let allowedIndices = [0, 1, 2, 3, 4, 5, 6];
    if (isPentatonic) allowedIndices = PENTATONIC_SUBSETS[diatonicHarmony];

    for (let bar = 0; bar < currentProject.bars; bar++) {
        const chordRootDegree = currentProject.progressionRoots[bar % 4];
        const chordDegrees = [chordRootDegree, (chordRootDegree + 2) % 7, (chordRootDegree + 4) % 7];

        // --- BASSLINE ---
        const bassMidi = rootMidi - 24 + diatonicIntervals[chordRootDegree];
        bassTrack.addNote({
            midi: bassMidi,
            time: currentTime,
            duration: currentProject.beatsPerBar * beatDuration - 0.1,
            velocity: 0.7
        });

        // --- MELODY ---
        const chosenRhythm = getRhythmForBar(bar);
        let beatInBar = 0;

        let validChordTones = [];
        for (let i = 0; i <= maxScaleIndex; i++) {
            if (chordDegrees.includes(i % scaleLength)) validChordTones.push(i);
        }

        for (let dur of chosenRhythm) {
            let isStrongBeat = Number.isInteger(beatInBar);

            if (isStrongBeat) {
                let options = validChordTones.filter(ct => Math.abs(ct - currentScaleIndex) <= 3);
                if (options.length > 0) {
                    let diffOptions = options.filter(o => o !== currentScaleIndex);
                    currentScaleIndex = (diffOptions.length > 0 && Math.random() < 0.9)
                        ? diffOptions[Math.floor(Math.random() * diffOptions.length)]
                        : options[Math.floor(Math.random() * options.length)];
                } else {
                    currentScaleIndex = validChordTones.reduce((prev, curr) =>
                        Math.abs(curr - currentScaleIndex) < Math.abs(prev - currentScaleIndex) ? curr : prev
                    );
                }
            } else {
                let direction = Math.random() < 0.5 ? 1 : -1;
                let next = currentScaleIndex + direction;
                while (!allowedIndices.includes(next % scaleLength) && next > 0 && next < maxScaleIndex) {
                    next += direction;
                }
                currentScaleIndex = next;
            }

            currentScaleIndex = Math.max(0, Math.min(maxScaleIndex, currentScaleIndex));

            let octaveOffset = Math.floor(currentScaleIndex / scaleLength);
            let degree = currentScaleIndex % scaleLength;
            let midiNote = rootMidi + (octaveOffset * 12) + diatonicIntervals[degree];

            melodyTrack.addNote({
                midi: midiNote,
                time: currentTime + beatInBar * beatDuration,
                duration: (dur * beatDuration) - 0.05,
                velocity: isStrongBeat ? 0.9 : 0.7
            });

            beatInBar += dur;
        }
        currentTime += currentProject.beatsPerBar * beatDuration;
    }

    newMidi.duration = currentProject.bars * currentProject.beatsPerBar * beatDuration;
    loadMidiData(newMidi, `AI Song (${genKey.options[genKey.selectedIndex].text} ${userScale})`);
});


// --- MIDI Handling ---

midiInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        log(`Parsing MIDI: ${file.name}...`);
        const arrayBuffer = await file.arrayBuffer();
        const parsedMidi = new Midi(arrayBuffer);
        loadMidiData(parsedMidi, file.name);
    } catch (err) {
        console.error(err);
        log(`Error: ${err.message}`, "error");
    }
});

function loadMidiData(midiObj, name) {
    currentMidi = midiObj;
    if (!currentMidi || !currentMidi.duration) {
        log("Invalid Tune Data.", "error");
        return;
    }

    if (!name.includes("AI Song")) {
        const bpm = midiObj.header.tempos[0] ? midiObj.header.tempos[0].bpm : 110;
        const totalBars = Math.ceil((midiObj.duration * bpm) / 60 / 4) || 8;
        currentProject = {
            rootMidi: 60,
            scaleType: 'major',
            tempo: bpm,
            beatsPerBar: 4,
            bars: totalBars,
            progressionRoots: [0, 3, 4, 0],
            addedChords: {}
        };
    }

    const duration = currentMidi.duration.toFixed(2);
    log(`Tune Ready: ${duration}s`);
    fileInfo.innerText = `${name} | ${duration}s`;

    enablePlaybackControls(true);
    resetTransport();

    updateChordUI();
    calculateMidiBounds(currentMidi);
    drawMidi(currentMidi);
    drawKeys();
}


// --- NOTE-SYNCED CHORD ACCOMPANIMENT EDITOR ---

function updateChordUI() {
    chordBarSelect.innerHTML = '';

    // Change UI label dynamically to reflect the new functionality
    const targetLabel = document.querySelector('label[for="chordBarSelect"]') || chordBarSelect.previousElementSibling;
    if (targetLabel) targetLabel.innerText = "Target Melody Note:";

    const melodyTrack = currentMidi ? currentMidi.tracks[0] : null;

    if (!melodyTrack || melodyTrack.notes.length === 0) {
        chordBarSelect.innerHTML = '<option value="">No notes found in melody</option>';
        return;
    }

    melodyTrack.notes.forEach((note, index) => {
        const noteName = Tone.Frequency(note.midi, "midi").toNote();
        const timeForm = note.time.toFixed(2);
        chordBarSelect.innerHTML += `<option value="${index}">Note ${index + 1} (${noteName} at ${timeForm}s)</option>`;
    });

    const romans = ROMAN_NUMERALS[currentProject.scaleType];
    customChordSelect.innerHTML = romans.map((r, i) => `<option value="${i}">${r} Chord</option>`).join('');

    chordBarSelect.removeEventListener('change', updateChordSuggestions);
    chordBarSelect.addEventListener('change', updateChordSuggestions);

    updateChordSuggestions();
}

function updateChordSuggestions() {
    const noteIndex = parseInt(chordBarSelect.value);
    if (isNaN(noteIndex)) return;

    suggestedChordsContainer.innerHTML = '';

    const melodyTrack = currentMidi.tracks[0];
    const targetNote = melodyTrack.notes[noteIndex];
    const notePitchClass = targetNote.midi % 12;

    const beatDuration = 60 / currentProject.tempo;
    const barIndex = Math.floor(targetNote.time / (currentProject.beatsPerBar * beatDuration));
    const expectedDegree = currentProject.progressionRoots[barIndex % currentProject.progressionRoots.length] || 0;

    const scale = DIATONIC_SCALES[currentProject.scaleType];
    const rootPitchClass = currentProject.rootMidi % 12;
    const romans = ROMAN_NUMERALS[currentProject.scaleType];

    let suggested = [];

    // Intelligent Music Theory analysis: Find Triads that CONTAIN this exact melody note
    for (let degree = 0; degree < 7; degree++) {
        const triadPitches = [
            (rootPitchClass + scale[degree]) % 12,
            (rootPitchClass + scale[(degree + 2) % 7]) % 12,
            (rootPitchClass + scale[(degree + 4) % 7]) % 12
        ];

        if (triadPitches.includes(notePitchClass)) {
            if (degree === expectedDegree) {
                suggested.unshift({ degree, label: romans[degree] + " (Perfect Match)", type: "accent" });
            } else {
                suggested.push({ degree, label: romans[degree] + " (Harmonizes Note)", type: "secondary" });
            }
        }
    }

    // Fallback if the note is a passing tone not belonging to a main diatonic chord
    if (suggested.length === 0) {
        suggested.push({ degree: expectedDegree, label: romans[expectedDegree] + " (Bar Root)", type: "secondary" });
    }

    // Render suggestion buttons
    suggested.forEach(s => addChordSuggestionButton(s.degree, s.label, s.type));

    const clearBtn = document.createElement('button');
    clearBtn.className = "btn danger small-btn";
    clearBtn.innerText = "Clear Note";
    clearBtn.onclick = () => {
        delete currentProject.addedChords[noteIndex];
        renderChordTrack();
    };
    suggestedChordsContainer.appendChild(clearBtn);
}

function addChordSuggestionButton(degree, label, colorClass) {
    const btn = document.createElement('button');
    btn.className = `btn ${colorClass} small-btn`;
    btn.innerText = label;
    btn.onclick = () => {
        const noteIndex = parseInt(chordBarSelect.value);
        currentProject.addedChords[noteIndex] = degree;
        renderChordTrack();
    };
    suggestedChordsContainer.appendChild(btn);
}

addChordBtn.addEventListener('click', () => {
    const noteIndex = parseInt(chordBarSelect.value);
    const degree = parseInt(customChordSelect.value);
    if (!isNaN(noteIndex) && !isNaN(degree)) {
        currentProject.addedChords[noteIndex] = degree;
        renderChordTrack();
    }
});

// Auto-Harmonize every note intelligently
autoHarmBtn.addEventListener('click', () => {
    if (!currentMidi || !currentMidi.tracks[0]) return;

    const melodyTrack = currentMidi.tracks[0];
    const beatDuration = 60 / currentProject.tempo;
    const scale = DIATONIC_SCALES[currentProject.scaleType];
    const rootPitchClass = currentProject.rootMidi % 12;

    melodyTrack.notes.forEach((note, index) => {
        const barIndex = Math.floor(note.time / (currentProject.beatsPerBar * beatDuration));
        const expectedDegree = currentProject.progressionRoots[barIndex % currentProject.progressionRoots.length] || 0;
        const notePitchClass = note.midi % 12;

        let bestDegree = expectedDegree;

        // Does the expected harmony already contain this note?
        const expectedPitches = [
            (rootPitchClass + scale[expectedDegree]) % 12,
            (rootPitchClass + scale[(expectedDegree + 2) % 7]) % 12,
            (rootPitchClass + scale[(expectedDegree + 4) % 7]) % 12
        ];

        if (!expectedPitches.includes(notePitchClass)) {
            // Find a theoretical chord that DOES contain the melody note
            for (let degree = 0; degree < 7; degree++) {
                const triadPitches = [
                    (rootPitchClass + scale[degree]) % 12,
                    (rootPitchClass + scale[(degree + 2) % 7]) % 12,
                    (rootPitchClass + scale[(degree + 4) % 7]) % 12
                ];
                if (triadPitches.includes(notePitchClass)) {
                    bestDegree = degree;
                    break;
                }
            }
        }

        currentProject.addedChords[index] = bestDegree;
    });

    renderChordTrack();
    updateChordUI();
    log("Auto-harmonized all notes successfully.", "success");
});

clearAllChordsBtn.addEventListener('click', () => {
    currentProject.addedChords = {};
    renderChordTrack();
});

function renderChordTrack() {
    if (!currentMidi || !currentMidi.tracks[0]) return;

    let trackIndex = currentMidi.tracks.findIndex(t => t.name === "Chords");
    if (trackIndex !== -1) {
        currentMidi.tracks[trackIndex].notes.length = 0;
    } else {
        const t = currentMidi.addTrack();
        t.name = "Chords";
        trackIndex = currentMidi.tracks.length - 1;
    }

    const chordTrack = currentMidi.tracks[trackIndex];
    const melodyTrack = currentMidi.tracks[0];

    // Build chords synced exactly to the attached melody note's rhythm
    for (let nIdx in currentProject.addedChords) {
        const noteIndex = parseInt(nIdx);
        const degree = currentProject.addedChords[noteIndex];

        const melodyNote = melodyTrack.notes[noteIndex];
        if (!melodyNote) continue;

        const triad = getDiatonicTriad(currentProject.rootMidi - 12, degree, currentProject.scaleType);

        triad.forEach(midiNote => {
            chordTrack.addNote({
                midi: midiNote,
                time: melodyNote.time,
                duration: melodyNote.duration,
                velocity: 0.5
            });
        });
    }

    if (Tone.Transport.state === "started") scheduleMidiEvents();
    calculateMidiBounds(currentMidi);
    drawMidi(currentMidi, Tone.Transport.seconds);
    drawKeys();
}

function getDiatonicTriad(baseMidi, degree, scaleType) {
    const scale = DIATONIC_SCALES[scaleType];
    const getPitch = (step) => {
        const oct = Math.floor(step / 7);
        const idx = step % 7;
        return baseMidi + (oct * 12) + scale[idx];
    };
    return [getPitch(degree), getPitch(degree + 2), getPitch(degree + 4)];
}


// --- Playback & Animation Loop ---

function enablePlaybackControls(enabled) {
    const btns = [playBtn, stopBtn, permPlayBtn, permStopBtn, permRewindBtn];
    btns.forEach(b => b.disabled = !enabled);
    if (enabled) overlayPlayBtn.classList.remove('hidden');
}

function togglePlayback() {
    if (Tone.Transport.state === "started") pausePlayback();
    else startPlayback();
}

playBtn.addEventListener('click', togglePlayback);
overlayPlayBtn.addEventListener('click', togglePlayback);
permPlayBtn.addEventListener('click', togglePlayback);

permRewindBtn.addEventListener('click', () => {
    stopPlayback();
    Tone.Transport.position = 0;
    updatePlayHead(0);
});

stopBtn.addEventListener('click', stopPlayback);
permStopBtn.addEventListener('click', stopPlayback);

async function startPlayback() {
    if (!currentMidi) return;
    await startAudioContext();

    if (Tone.Transport.state !== "started") {
        if (Tone.Transport.seconds === 0) scheduleMidiEvents();
        Tone.Transport.start();
    }

    updatePlaybackUI(true);
    animate();
}

function pausePlayback() {
    Tone.Transport.pause();
    if (sampler) sampler.releaseAll();
    updatePlaybackUI(false);
    cancelAnimationFrame(animationId);
}

function stopPlayback() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    if (sampler) sampler.releaseAll();

    updatePlaybackUI(false);
    cancelAnimationFrame(animationId);
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
    Tone.Transport.cancel();

    currentMidi.tracks.forEach(track => {
        track.notes.forEach(note => {
            if (sampler) {
                Tone.Transport.schedule((time) => {
                    const transposedMidi = note.midi + transposeOffset;
                    const freq = Tone.Frequency(transposedMidi, "midi");
                    sampler.triggerAttackRelease(freq, note.duration, time, note.velocity);
                }, note.time);
            }
        });
    });

    Tone.Transport.scheduleOnce(() => {
        pausePlayback();
        Tone.Transport.position = 0;
        updatePlayHead(0);
        log("Playback finished.");
    }, currentMidi.duration + 0.5);
}

function updatePlaybackUI(playing) {
    isPlaying = playing;
    playBtn.innerText = playing ? "Pause" : "Play Tune";
    permPlayBtn.innerText = playing ? "⏸" : "▶";

    if (playing) {
        playBtn.classList.add("danger");
        overlayPlayBtn.classList.add("hidden");
        playHead.style.display = 'block';
    } else {
        playBtn.classList.remove("danger");
        overlayPlayBtn.classList.remove("hidden");
        if (Tone.Transport.position === 0 && Tone.Transport.seconds === 0) playHead.style.display = 'none';
        else playHead.style.display = 'block';
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

    Tone.Transport.seconds = seekTime;
    if (sampler) sampler.releaseAll();

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
            drawMidi(currentMidi, Tone.Transport.seconds);
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
        const baseHue = (i * 137 + 200) % 360;
        track.notes.forEach(n => {
            const visiblePitch = n.midi + transposeOffset;
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
    ctx.fillText("Load or Generate a Tune to visualize", canvas.width / 2, canvas.height / 2);
}

// --- Transposition Controls ---
function handleTranspose(delta) {
    transposeOffset += delta;
    updateShiftDisplay();
    if (Tone.Transport.state === "started") scheduleMidiEvents();
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
        alert("Please load an Audio Sample and a Tune first.");
        return;
    }

    const format = exportFormat.value;
    const originalText = downloadBtn.innerText;
    downloadBtn.innerText = "Rendering...";
    downloadBtn.disabled = true;

    try {
        const duration = currentMidi.duration + 2;
        const sampleMap = {};
        sampleMap[rootNoteSelect.value] = userAudioUrl;

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
        let filename = 'custom_tune';

        if (format === 'mp3') {
            blob = bufferToMp3(buffer);
            filename += '.mp3';
        } else {
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

    const left = buffer.getChannelData(0);
    const right = channels > 1 ? buffer.getChannelData(1) : left;
    const sampleBlockSize = 1152;

    for (let i = 0; i < left.length; i += sampleBlockSize) {
        const leftChunk = left.subarray(i, i + sampleBlockSize);
        const rightChunk = right.subarray(i, i + sampleBlockSize);
        const leftInt = new Int16Array(leftChunk.length);
        const rightInt = new Int16Array(rightChunk.length);

        for (let j = 0; j < leftChunk.length; j++) {
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

    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);

    return new Blob(mp3Data, { type: 'audio/mp3' });
}

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

    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);
    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164);
    setUint32(length - pos - 4);

    for (i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            if (offset >= len) break;
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
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