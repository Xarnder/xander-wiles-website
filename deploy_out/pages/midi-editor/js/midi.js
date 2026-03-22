import { state } from './state.js';
import { dom, log, enablePlaybackControls } from './ui.js';
import { calculateMidiBounds, drawMidi, drawKeys } from './visualizer.js';
import { updateChordUI } from './chords.js';
import { resetTransport } from './audio.js';

export async function handleMidiUpload(file) {
    if (!file) return;

    try {
        log(`Parsing MIDI: ${file.name}...`);
        const arrayBuffer = await file.arrayBuffer();
        const parsedMidi = new window.Midi(arrayBuffer);
        loadMidiData(parsedMidi, file.name);
    } catch (err) {
        console.error(err);
        log(`Error: ${err.message}`, "error");
    }
}

export function loadMidiData(midiObj, name) {
    state.currentMidi = midiObj;
    state.hasPlayed = false;
    if (!state.currentMidi || !state.currentMidi.duration) {
        log("Invalid Tune Data.", "error");
        return;
    }

    if (!name.includes("AI Song")) {
        const bpm = midiObj.header.tempos[0] ? midiObj.header.tempos[0].bpm : 110;
        const totalBars = Math.ceil((midiObj.duration * bpm) / 60 / 4) || 8;
        state.currentProject = {
            rootMidi: 48,
            scaleType: 'major',
            tempo: bpm,
            beatsPerBar: 4,
            bars: totalBars,
            progressionRoots: [0, 3, 4, 0],
            addedChords: {}
        };
    }

    const duration = state.currentMidi.duration.toFixed(2);
    log(`Tune Ready: ${duration}s`);
    if (dom.fileInfo) dom.fileInfo.innerText = `${name} | ${duration}s`;

    enablePlaybackControls(true);
    resetTransport();

    updateChordUI();
    calculateMidiBounds(state.currentMidi);
    drawMidi(state.currentMidi);
    drawKeys();
}
