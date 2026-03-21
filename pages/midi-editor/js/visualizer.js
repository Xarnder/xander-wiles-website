import { state, constants } from './state.js';
import { dom, ctx, keysCtx } from './ui.js';

export function resizeCanvas() {
    const wrapper = dom.canvasWrapper;
    if (wrapper) {
        dom.canvas.width = wrapper.clientWidth - 60;
        dom.canvas.height = wrapper.clientHeight;
        dom.keysCanvas.width = 60;
        dom.keysCanvas.height = wrapper.clientHeight;

        if (state.currentMidi) {
            drawMidi(state.currentMidi, window.Tone ? window.Tone.Transport.seconds : -1);
            drawKeys();
        } else {
            drawEmptyGrid();
        }
    }
}

export function calculateMidiBounds(midi) {
    let min = 127, max = 0;
    let hasNotes = false;
    
    midi.tracks.forEach(t => t.notes.forEach(n => {
        hasNotes = true;
        const visiblePitch = n.midi + state.transposeOffset;
        if (visiblePitch < min) min = visiblePitch;
        if (visiblePitch > max) max = visiblePitch;
    }));

    if (!hasNotes) { 
        min = 48; 
        max = 72; 
    } else {
        const range = max - min;
        if (range < 24) {  // Enforce at least ~2 octaves of vertical space
            const center = Math.floor((min + max) / 2);
            min = center - 12;
            max = center + 12;
        }
    }
    
    state.minNote = Math.max(0, min - 2);
    state.maxNote = Math.min(127, max + 2);
}

export function getLayoutDuration(midi) {
    if (state.dragState && state.dragState.layoutDuration) {
        return state.dragState.layoutDuration;
    }
    if (!midi) return 8;

    const beatDuration = 60 / state.currentProject.tempo;
    const barDuration = beatDuration * state.currentProject.beatsPerBar;
    
    const minDuration = 4 * barDuration;
    const paddedDuration = (midi.duration || 0) + 2 * barDuration;
    
    // Quantize layout duration to chunks of 4 bars so it expands discretely
    const chunk = 4 * barDuration;
    const layoutDuration = Math.ceil(Math.max(minDuration, paddedDuration) / chunk) * chunk;
    
    return layoutDuration;
}

export function isNoteInScale(midi) {
    const root = state.currentProject.rootMidi % 12;
    const scale = constants.DIATONIC_SCALES[state.currentProject.scaleType] || constants.DIATONIC_SCALES.major;
    const pitchClass = midi % 12;
    const relativePitch = (pitchClass - root + 12) % 12;
    return scale.includes(relativePitch);
}

export function drawMidi(midi, currentTime = -1) {
    if (!midi || !ctx) return;
    ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);

    const duration = getLayoutDuration(midi);
    const width = dom.canvas.width;
    const height = dom.canvas.height;
    const range = state.maxNote - state.minNote;
    const h = height / range;

    // Draw Grid
    const beatDuration = 60 / state.currentProject.tempo;
    const barDuration = beatDuration * state.currentProject.beatsPerBar;
    
    ctx.lineWidth = 1;
    for (let i = state.minNote; i <= state.maxNote; i++) {
        const y = height - ((i - state.minNote) * h);
        const noteInScale = isNoteInScale(i);
        
        if (state.snapToScale && !noteInScale) {
            ctx.fillStyle = "rgba(255, 0, 0, 0.15)"; // Soft red overlay
            ctx.fillRect(0, y - h, width, h);
        } else {
            const noteName = window.Tone.Frequency(i, "midi").toNote();
            const isBlack = noteName.includes("#");
            if (isBlack) {
                ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
                ctx.fillRect(0, y - h, width, h);
            }
        }
        
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.stroke();
    }
    for (let t = 0; t <= duration; t += beatDuration) {
        const x = (t / duration) * width;
        const isBar = Math.abs(t % barDuration) < 0.01;
        
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.strokeStyle = isBar ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = isBar ? 2 : 1;
        ctx.stroke();
    }
    
    // Draw Middle C Line
    const middleCy = height - ((60 - state.transposeOffset - state.minNote) * h);
    if (middleCy > 0 && middleCy < height) {
        ctx.beginPath();
        ctx.moveTo(0, middleCy);
        ctx.lineTo(width, middleCy);
        ctx.strokeStyle = "rgba(255, 165, 0, 0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    midi.tracks.forEach((track, i) => {
        const baseHue = (i * 137 + 200) % 360;
        track.notes.forEach(n => {
            const visiblePitch = n.midi + state.transposeOffset;
            const isActive = currentTime >= n.time && currentTime < (n.time + n.duration);

            let isSelected = state.selectedNotes && state.selectedNotes.has(n);
            
            if (isActive) {
                ctx.fillStyle = `#fff`;
                ctx.shadowBlur = 10;
                ctx.shadowColor = `hsl(${baseHue}, 100%, 50%)`;
            } else if (isSelected) {
                ctx.fillStyle = `hsl(${baseHue}, 90%, 80%)`;
                ctx.shadowBlur = 5;
                ctx.shadowColor = `#fff`;
            } else {
                ctx.fillStyle = `hsl(${baseHue}, 70%, 60%)`;
                ctx.shadowBlur = 0;
            }

            const nx = (n.time / duration) * width;
            const ny = height - ((visiblePitch - state.minNote) * h) - h;
            const nw = (n.duration / duration) * width;
            const nh = h - 1;

            ctx.fillRect(nx, ny, nw, nh);
            
            // Draw resize handle hints for selected notes
            if (isSelected) {
                ctx.fillStyle = "#fff";
                ctx.fillRect(nx, ny, 2, nh);
                ctx.fillRect(nx + nw - 2, ny, 2, nh);
            }
        });
    });
    ctx.shadowBlur = 0;

    // Draw Drag Box Overlay
    if (state.dragBox) {
        ctx.fillStyle = "rgba(0, 150, 255, 0.2)";
        ctx.strokeStyle = "rgba(0, 150, 255, 0.8)";
        ctx.lineWidth = 1;
        ctx.fillRect(state.dragBox.left, state.dragBox.top, state.dragBox.width, state.dragBox.height);
        ctx.strokeRect(state.dragBox.left, state.dragBox.top, state.dragBox.width, state.dragBox.height);
    }

    // Draw Chords
    if (state.currentProject && state.currentProject.addedChords && midi.tracks.length > 0) {
        const melodyTrack = midi.tracks[0];
        const romans = constants.ROMAN_NUMERALS[state.currentProject.scaleType];
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "left";

        for (let nIdx in state.currentProject.addedChords) {
            const index = parseInt(nIdx);
            const degree = state.currentProject.addedChords[index];
            const note = melodyTrack.notes[index];
            
            if (note && romans && romans[degree]) {
                const x = (note.time / duration) * width;
                const txt = romans[degree];
                ctx.fillText(txt, x + 2, 20); // 20px from top
            }
        }
    }
}

export function drawKeys() {
    if (!keysCtx) return;
    keysCtx.clearRect(0, 0, dom.keysCanvas.width, dom.keysCanvas.height);
    const height = dom.keysCanvas.height;
    const range = state.maxNote - state.minNote;
    const keyHeight = height / range;

    for (let i = state.minNote; i < state.maxNote; i++) {
        const noteName = window.Tone.Frequency(i, "midi").toNote();
        const isBlack = noteName.includes("#");
        const y = height - ((i - state.minNote) * keyHeight) - keyHeight;
        const noteInScale = isNoteInScale(i);

        if (state.snapToScale && !noteInScale) {
            keysCtx.fillStyle = "rgba(255, 0, 0, 0.4)"; // Clear red for out-of-scale keys
        } else {
            keysCtx.fillStyle = isBlack ? "#333" : "#ddd";
        }
        
        keysCtx.fillRect(0, y, dom.keysCanvas.width, keyHeight - 1);

        if (noteName.startsWith("C") && !noteName.includes("#")) {
            keysCtx.fillStyle = isBlack ? "#fff" : "#333";
            keysCtx.font = "10px sans-serif";
            keysCtx.fillText(noteName, 4, y + keyHeight - 2);
            
            if (i === 60) {
                keysCtx.fillStyle = "rgba(255, 165, 0, 0.3)";
                keysCtx.fillRect(0, y, dom.keysCanvas.width, keyHeight - 1);
            }
        }
    }
}

export function drawEmptyGrid() {
    state.minNote = 48; // C3
    state.maxNote = 72; // C5
    // Just draw a fake empty midi grid so the background is present
    drawMidi({ duration: 0, tracks: [] }, -1);
    drawKeys();
    
    if (!ctx) return;
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.textAlign = "center";
    ctx.font = "italic 16px sans-serif";
    ctx.fillText("Select the Pen Tool to start drawing...", dom.canvas.width / 2, dom.canvas.height / 2);
}

export function updatePlayHead(time) {
    if (!state.currentMidi) return;
    const duration = getLayoutDuration(state.currentMidi);
    const progress = Math.min(1, time / duration);
    if (dom.playHead) dom.playHead.style.left = `${progress * 100}%`;
}

export function startAnimation() {
    state.animationId = requestAnimationFrame(animate);
}

export function stopAnimation() {
    cancelAnimationFrame(state.animationId);
}

function animate() {
    if (window.Tone && window.Tone.Transport.state !== "started") return;
    const time = window.Tone.Transport.seconds;
    updatePlayHead(time);
    if (state.currentMidi) drawMidi(state.currentMidi, time);
    state.animationId = requestAnimationFrame(animate);
}

export function handleTranspose(delta, scheduleMidiEvents) {
    state.transposeOffset += delta;
    updateShiftDisplay();
    if (window.Tone && window.Tone.Transport.state === "started") scheduleMidiEvents();
    if (state.currentMidi) {
        calculateMidiBounds(state.currentMidi);
        drawMidi(state.currentMidi, window.Tone ? window.Tone.Transport.seconds : -1);
        drawKeys();
    }
}

export function updateShiftDisplay() {
    const octaves = state.transposeOffset / 12;
    if (dom.shiftDisplay) dom.shiftDisplay.innerText = octaves > 0 ? `+${octaves}` : octaves;
}
