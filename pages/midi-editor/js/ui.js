export const dom = {
    statusLog: document.getElementById('status-log'),
    audioInput: document.getElementById('audioFile'),
    rootNoteSelect: document.getElementById('rootNote'),
    testAudioBtn: document.getElementById('testAudioBtn'),

    generateBtn: document.getElementById('generateBtn'),
    genKey: document.getElementById('genKey'),
    genScale: document.getElementById('genScale'),
    midiInput: document.getElementById('midiFile'),

    playBtn: document.getElementById('playBtn'),
    stopBtn: document.getElementById('stopBtn'),
    permRewindBtn: document.getElementById('permRewindBtn'),
    permPlayBtn: document.getElementById('permPlayBtn'),
    permStopBtn: document.getElementById('permStopBtn'),

    canvasWrapper: document.getElementById('canvasWrapper'),
    canvas: document.getElementById('midiCanvas'),
    keysCanvas: document.getElementById('keysCanvas'),
    fileInfo: document.getElementById('file-info'),
    playHead: document.getElementById('playHead'),
    overlayPlayBtn: document.getElementById('overlayPlayBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    exportFormat: document.getElementById('exportFormat'),

    shiftUpBtn: document.getElementById('shiftUp'),
    shiftDownBtn: document.getElementById('shiftDown'),
    shiftDisplay: document.getElementById('shiftDisplay'),

    tuningInterface: document.getElementById('tuning-interface'),
    playRawBtn: document.getElementById('playRawBtn'),
    autoDetectBtn: document.getElementById('autoDetectBtn'),
    pianoContainer: document.getElementById('pianoContainer'),
    octaveDownBtn: document.getElementById('octaveDown'),
    octaveUpBtn: document.getElementById('octaveUp'),
    currentOctaveDisplay: document.getElementById('currentOctaveDisplay'),

    chordBarSelect: document.getElementById('chordBarSelect'), 
    suggestedChordsContainer: document.getElementById('suggestedChordsContainer'),
    customChordSelect: document.getElementById('customChordSelect'),
    addChordBtn: document.getElementById('addChordBtn'),
    clearAllChordsBtn: document.getElementById('clearAllChordsBtn')
};

dom.autoHarmBtn = document.createElement('button');
dom.autoHarmBtn.className = "btn accent small-btn";
dom.autoHarmBtn.innerText = "Auto-Harmonize All Notes";
dom.autoHarmBtn.style.marginTop = "10px";
if (dom.clearAllChordsBtn && dom.clearAllChordsBtn.parentNode) {
    dom.clearAllChordsBtn.parentNode.appendChild(dom.autoHarmBtn);
}

export const ctx = dom.canvas.getContext('2d');
export const keysCtx = dom.keysCanvas.getContext('2d');

export function log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    if (dom.statusLog) dom.statusLog.innerText = `[${timestamp}] ${msg}`;
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

export function populateNoteSelect() {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let html = '';
    for (let oct = 1; oct <= 7; oct++) {
        notes.forEach(note => {
            const noteName = `${note}${oct}`;
            const selected = noteName === 'C3' ? 'selected' : '';
            html += `<option value="${noteName}" ${selected}>${noteName}</option>`;
        });
    }
    if (dom.rootNoteSelect) dom.rootNoteSelect.innerHTML = html;
}

export function renderPiano(onKeyClick) {
    if (!dom.pianoContainer) return;
    dom.pianoContainer.innerHTML = '';
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

        div.addEventListener('mousedown', () => onKeyClick(n.name, div));
        dom.pianoContainer.appendChild(div);
    });
}

export function enablePlaybackControls(enabled) {
    const btns = [dom.playBtn, dom.stopBtn, dom.permPlayBtn, dom.permStopBtn, dom.permRewindBtn];
    btns.forEach(b => { if (b) b.disabled = !enabled; });
    if (enabled && dom.overlayPlayBtn) dom.overlayPlayBtn.classList.remove('hidden');
}

export function updatePlaybackUI(playing) {
    if (dom.playBtn) dom.playBtn.innerText = playing ? "Pause" : "Play Tune";
    if (dom.permPlayBtn) dom.permPlayBtn.innerText = playing ? "⏸" : "▶";

    if (playing) {
        if (dom.playBtn) dom.playBtn.classList.add("danger");
        if (dom.overlayPlayBtn) dom.overlayPlayBtn.classList.add("hidden");
        if (dom.playHead) dom.playHead.style.display = 'block';
    } else {
        if (dom.playBtn) dom.playBtn.classList.remove("danger");
        if (dom.overlayPlayBtn) dom.overlayPlayBtn.classList.remove("hidden");
        
        // Ensure Tone is available since it is a global window variable 
        // In modular context, it might be better to pass the position, but since Tone is loaded via script tag, it works globally.
        if (window.Tone && Tone.Transport.position === 0 && Tone.Transport.seconds === 0) {
            if (dom.playHead) dom.playHead.style.display = 'none';
        } else {
            if (dom.playHead) dom.playHead.style.display = 'block';
        }
    }
}
