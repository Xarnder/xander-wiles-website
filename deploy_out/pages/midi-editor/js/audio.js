import { state } from './state.js';
import { dom, log, updatePlaybackUI } from './ui.js';
import { updatePlayHead, drawMidi, startAnimation, stopAnimation } from './visualizer.js';

export async function startAudioContext() {
    if (window.Tone && Tone.context.state !== 'running') await Tone.start();
}

export function initSampler() {
    state.sampler = new Tone.Sampler({
        urls: { "C3": "assats/middle-c.mp3" },
        baseUrl: "",
        onload: () => {
            log("Audio Engine Ready (Default Sample Loaded).");
            state.userAudioUrl = "assats/middle-c.mp3";
            state.userAudioBuffer = new Tone.Buffer("assats/middle-c.mp3", () => {
                if (dom.tuningInterface) dom.tuningInterface.classList.remove('hidden');
                if (state.rawPlayer) state.rawPlayer.dispose();
                state.rawPlayer = new Tone.Player(state.userAudioBuffer).toDestination();
            });
        }
    }).toDestination();

    state.referenceSynth = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 }
    }).toDestination();
    state.referenceSynth.volume.value = -5;
}

export function playReferenceNote(note) {
    if (state.referenceSynth) {
        state.referenceSynth.triggerAttackRelease(note, "8n");
        log(`Playing Reference: ${note}`);
    }
}

export async function handleAudioUpload(file) {
    if (!file) return;
    try {
        await startAudioContext();
        log(`Loading audio: ${file.name}...`);
        state.userAudioUrl = URL.createObjectURL(file);

        state.userAudioBuffer = new Tone.Buffer(state.userAudioUrl, () => {
            log(`Audio loaded. Use Tuning Assistant to find pitch.`, "success");
            if (dom.tuningInterface) dom.tuningInterface.classList.remove('hidden');
            if (state.rawPlayer) state.rawPlayer.dispose();
            state.rawPlayer = new Tone.Player(state.userAudioBuffer).toDestination();
        });

        updateSampler();
    } catch (err) {
        log(`Error loading audio: ${err.message}`, "error");
    }
}

export function updateSampler() {
    if (!state.userAudioUrl) return;
    const rootNote = dom.rootNoteSelect ? dom.rootNoteSelect.value : "C3";
    if (state.sampler) state.sampler.dispose();
    const sampleMap = {};
    sampleMap[rootNote] = state.userAudioUrl;
    state.sampler = new Tone.Sampler({
        urls: sampleMap,
        baseUrl: "",
    }).toDestination();
}

export function autoCorrelate(buf, sampleRate) {
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

export function scheduleMidiEvents() {
    Tone.Transport.cancel();

    state.currentMidi.tracks.forEach(track => {
        track.notes.forEach(note => {
            if (state.sampler) {
                Tone.Transport.schedule((time) => {
                    const transposedMidi = note.midi + state.transposeOffset;
                    const freq = Tone.Frequency(transposedMidi, "midi");
                    state.sampler.triggerAttackRelease(freq, note.duration, time, note.velocity);
                }, note.time);
            }
        });
    });

    Tone.Transport.scheduleOnce(() => {
        pausePlayback();
        Tone.Transport.position = 0;
        updatePlayHead(0);
        log("Playback finished.");
    }, state.currentMidi.duration + 0.5);
}

export async function startPlayback() {
    if (!state.currentMidi) return;
    await startAudioContext();

    if (Tone.Transport.state !== "started") {
        if (!state.hasPlayed || Tone.Transport.seconds === 0) {
            Tone.Transport.seconds = 0;
            scheduleMidiEvents();
            state.hasPlayed = true;
        }
        Tone.Transport.start();
    }

    state.isPlaying = true;
    updatePlaybackUI(true);
    startAnimation();
}

export function pausePlayback() {
    Tone.Transport.pause();
    if (state.sampler) state.sampler.releaseAll();
    state.isPlaying = false;
    updatePlaybackUI(false);
    stopAnimation();
}

export function stopPlayback() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    if (state.sampler) state.sampler.releaseAll();

    state.isPlaying = false;
    updatePlaybackUI(false);
    stopAnimation();
    updatePlayHead(0);
    if (state.currentMidi) drawMidi(state.currentMidi);
}

export function resetTransport() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.position = 0;
    updatePlayHead(0);
}

export function togglePlayback() {
    if (Tone.Transport.state === "started") pausePlayback();
    else startPlayback();
}
