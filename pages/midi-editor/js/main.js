import { state } from './state.js';
import { dom, log, populateNoteSelect, renderPiano } from './ui.js';
import { initSampler, playReferenceNote, handleAudioUpload, updateSampler, autoCorrelate, togglePlayback, stopPlayback, resetTransport, startAudioContext, scheduleMidiEvents } from './audio.js';
import { generateTune } from './generator.js';
import { handleMidiUpload } from './midi.js';
import { handleAddChord, handleAutoHarmonize, handleClearAllChords } from './chords.js';
import { resizeCanvas, handleTranspose, updatePlayHead, drawMidi } from './visualizer.js';
import { handleDownload } from './export.js';
import { initEditor } from './editor.js';

function init() {
    populateNoteSelect();
    renderPiano((noteName, div) => {
        startAudioContext().then(() => {
            const noteFull = `${noteName}${state.currentOctave}`;
            playReferenceNote(noteFull);
            if (dom.rootNoteSelect) dom.rootNoteSelect.value = noteFull;
            updateSampler();
            div.classList.add('active');
            setTimeout(() => div.classList.remove('active'), 200);
        });
    });
    
    setupEventListeners();
    resizeCanvas();
    initEditor();
    log("System initialized. Upload a sample or generate a tune.");
    resetTransport();
    initSampler();
}

function setupEventListeners() {
    if (dom.octaveUpBtn) dom.octaveUpBtn.addEventListener('click', () => {
        if (state.currentOctave < 7) {
            state.currentOctave++;
            if (dom.currentOctaveDisplay) dom.currentOctaveDisplay.innerText = state.currentOctave;
        }
    });
    
    if (dom.octaveDownBtn) dom.octaveDownBtn.addEventListener('click', () => {
        if (state.currentOctave > 1) {
            state.currentOctave--;
            if (dom.currentOctaveDisplay) dom.currentOctaveDisplay.innerText = state.currentOctave;
        }
    });

    if (dom.audioInput) dom.audioInput.addEventListener('change', (e) => handleAudioUpload(e.target.files[0]));
    
    if (dom.playRawBtn) dom.playRawBtn.addEventListener('click', async () => {
        if (state.rawPlayer && state.rawPlayer.loaded) {
            log("Playing original uploaded file...");
            state.rawPlayer.start();
        }
    });

    if (dom.autoDetectBtn) dom.autoDetectBtn.addEventListener('click', () => {
        if (!state.userAudioBuffer || !state.userAudioBuffer.loaded) return;
        log("Analyzing pitch...", "info");
        const bufferData = state.userAudioBuffer.getChannelData(0);
        const sampleRate = window.Tone.context.sampleRate;
        const detectedFreq = autoCorrelate(bufferData, sampleRate);

        if (detectedFreq === -1) {
            log("Could not detect pitch clearly. Try manual tuning.", "warn");
        } else {
            const note = window.Tone.Frequency(detectedFreq).toNote();
            log(`Detected Pitch: ${note} (${Math.round(detectedFreq)}Hz)`, "success");
            if (dom.rootNoteSelect) dom.rootNoteSelect.value = note;
            const oct = note.slice(-1);
            if (!isNaN(oct)) {
                state.currentOctave = parseInt(oct);
                if (dom.currentOctaveDisplay) dom.currentOctaveDisplay.innerText = state.currentOctave;
            }
            updateSampler();
        }
    });

    if (dom.rootNoteSelect) dom.rootNoteSelect.addEventListener('change', () => { if (state.userAudioUrl) updateSampler(); });
    
    if (dom.testAudioBtn) dom.testAudioBtn.addEventListener('click', async () => {
        await startAudioContext();
        if (state.sampler && state.sampler.loaded) state.sampler.triggerAttackRelease(["C3"], 1);
        else log("No audio loaded.", "warn");
    });

    if (dom.generateBtn) dom.generateBtn.addEventListener('click', generateTune);
    
    if (dom.genKey) dom.genKey.addEventListener('change', (e) => {
        state.currentProject.rootMidi = parseInt(e.target.value);
        if (state.currentMidi) {
            drawMidi(state.currentMidi);
            drawKeys();
        }
    });
    
    if (dom.genScale) dom.genScale.addEventListener('change', (e) => {
        state.currentProject.scaleType = e.target.value;
        if (state.currentMidi) {
            drawMidi(state.currentMidi);
            drawKeys();
        }
    });

    if (dom.midiInput) dom.midiInput.addEventListener('change', (e) => handleMidiUpload(e.target.files[0]));

    if (dom.addChordBtn) dom.addChordBtn.addEventListener('click', handleAddChord);
    if (dom.autoHarmBtn) dom.autoHarmBtn.addEventListener('click', handleAutoHarmonize);
    if (dom.clearAllChordsBtn) dom.clearAllChordsBtn.addEventListener('click', handleClearAllChords);

    if (dom.playBtn) dom.playBtn.addEventListener('click', togglePlayback);
    if (dom.overlayPlayBtn) dom.overlayPlayBtn.addEventListener('click', togglePlayback);
    if (dom.permPlayBtn) dom.permPlayBtn.addEventListener('click', togglePlayback);
    
    if (dom.permRewindBtn) dom.permRewindBtn.addEventListener('click', () => {
        stopPlayback();
        resetTransport();
    });

    if (dom.stopBtn) dom.stopBtn.addEventListener('click', stopPlayback);
    if (dom.permStopBtn) dom.permStopBtn.addEventListener('click', stopPlayback);

    window.addEventListener('resize', resizeCanvas);

    if (dom.shiftUpBtn) dom.shiftUpBtn.addEventListener('click', () => handleTranspose(12, scheduleMidiEvents));
    if (dom.shiftDownBtn) dom.shiftDownBtn.addEventListener('click', () => handleTranspose(-12, scheduleMidiEvents));

    if (dom.downloadBtn) dom.downloadBtn.addEventListener('click', handleDownload);
}

document.addEventListener('DOMContentLoaded', init);
