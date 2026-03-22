import { state, constants } from './state.js';
import { dom, log, enablePlaybackControls } from './ui.js';
import { drawMidi, updatePlayHead, calculateMidiBounds, drawKeys, getLayoutDuration } from './visualizer.js';
import { updateChordUI } from './chords.js';

export function initEditor() {
    // Basic init, don't re-bind if already bound, handled by main listener assignment
    const toolRadios = document.querySelectorAll('input[name="editorTool"]');
    toolRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.currentTool = e.target.value;
            updateCursor();
        });
    });

    const snapToggle = document.getElementById('snapToggle');
    if (snapToggle) {
        snapToggle.addEventListener('change', (e) => {
            state.snapToGrid = e.target.checked;
        });
    }

    const snapScaleToggle = document.getElementById('snapScaleToggle');
    if (snapScaleToggle) {
        snapScaleToggle.addEventListener('change', (e) => {
            state.snapToScale = e.target.checked;
            redraw();
            drawKeys();
        });
    }

    if (dom.canvasWrapper) {
        // We override the old single click seeker with these down/move/up events
        dom.canvasWrapper.addEventListener('mousedown', handleMouseDown);
        dom.canvasWrapper.addEventListener('mousemove', handleMouseMove);
        // Bind to window to catch drags that leave the canvas
        window.addEventListener('mouseup', handleMouseUp);
        // Prevent default context menu on right click if needed, but not necessary yet
    }
    
    // Keyboard delete & move for selected notes
    window.addEventListener('keydown', (e) => {
        if (!state.currentMidi || state.selectedNotes.size === 0) return;
        
        if (e.key === 'Backspace' || e.key === 'Delete') {
            const track = state.currentMidi.tracks[0];
            if (track) {
                state.selectedNotes.forEach(n => {
                    const idx = track.notes.indexOf(n);
                    if (idx !== -1) track.notes.splice(idx, 1);
                });
                state.selectedNotes.clear();
                updateChordUI();
                redraw();
                log("Deleted notes.");
            }
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault(); // Prevent page scrolling
            const isOctave = e.shiftKey;
            
            state.selectedNotes.forEach(note => {
                let newPitch = note.midi;
                
                if (state.snapToScale && !isOctave) {
                    const step = e.key === 'ArrowUp' ? 1 : -1;
                    while (true) {
                        newPitch += step;
                        if (newPitch < 0 || newPitch > 127) {
                            newPitch = note.midi; // Revert if edge of keyboard
                            break;
                        }
                        if (snapPitch(newPitch) === newPitch) break;
                    }
                } else {
                    const delta = isOctave ? 12 : 1;
                    const shift = e.key === 'ArrowUp' ? delta : -delta;
                    newPitch = snapPitch(note.midi + shift);
                }
                
                note.midi = Math.max(0, Math.min(127, newPitch));
            });
            updateChordUI();
            redraw();
            log(`Shifted notes ${shift > 0 ? 'up' : 'down'} by ${delta} semitones.`);
        }
    });

    updateCursor();
}

export function updateCursor() {
    if (!dom.canvasWrapper) return;
    if (state.currentTool === 'pen') dom.canvasWrapper.style.cursor = 'crosshair';
    else if (state.currentTool === 'erase') dom.canvasWrapper.style.cursor = 'not-allowed';
    else dom.canvasWrapper.style.cursor = 'default';
}

function getCoords(e) {
    const rect = dom.canvasWrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y, width: rect.width, height: rect.height };
}

function timeToX(time, duration, canvasWidth) {
    return (time / duration) * canvasWidth;
}
function xToTime(x, duration, canvasWidth) {
    return (x / canvasWidth) * duration;
}
function pitchToY(pitch, minNote, maxNote, canvasHeight) {
    const range = maxNote - minNote;
    const h = canvasHeight / range;
    return canvasHeight - ((pitch - minNote) * h) - h;
}
function yToPitch(y, minNote, maxNote, canvasHeight) {
    const range = maxNote - minNote;
    const h = canvasHeight / range;
    return Math.floor(minNote + ((canvasHeight - y) / h));
}

function snapTime(time) {
    if (!state.snapToGrid) return time;
    // Snap to 16th notes (0.25 beats)
    const beatDuration = 60 / state.currentProject.tempo;
    const snapUnit = beatDuration * 0.25;
    return Math.round(time / snapUnit) * snapUnit;
}

export function snapPitch(pitch) {
    if (!state.snapToScale) return Math.max(0, Math.min(127, pitch));
    
    const root = state.currentProject.rootMidi % 12;
    const scale = constants.DIATONIC_SCALES[state.currentProject.scaleType] || constants.DIATONIC_SCALES.major;
    
    const octave = Math.floor(pitch / 12);
    const pitchClass = pitch % 12;
    let relativePitch = (pitchClass - root + 12) % 12;
    
    let minDiff = 12;
    let closestScaleNote = relativePitch;
    
    for (let note of scale) {
        let diff = Math.min(Math.abs(relativePitch - note), 12 - Math.abs(relativePitch - note));
        if (diff < minDiff) {
            minDiff = diff;
            closestScaleNote = note;
        }
    }
    
    let newPitch = (octave * 12) + root + closestScaleNote;
    if (Math.abs(newPitch - pitch) > 6) {
        if (newPitch > pitch) newPitch -= 12;
        else newPitch += 12;
    }
    
    return Math.max(0, Math.min(127, newPitch));
}

function getNoteAt(x, y, duration, canvasWidth, canvasHeight, tracks) {
    // Search top-to-bottom
    for (let track of tracks.slice().reverse()) {
        for (let note of track.notes.slice().reverse()) {
            const visiblePitch = note.midi + state.transposeOffset;
            const nx = timeToX(note.time, duration, canvasWidth);
            const ny = pitchToY(visiblePitch, state.minNote, state.maxNote, canvasHeight);
            const nw = timeToX(note.time + note.duration, duration, canvasWidth) - nx;
            const range = state.maxNote - state.minNote;
            const nh = canvasHeight / range;
            
            // Allow a small generous horizontal hit box for tiny notes
            if (x >= nx - 2 && x <= nx + nw + 2 && y >= ny && y <= ny + nh) {
                return { note, track, nx, ny, nw, nh };
            }
        }
    }
    return null;
}

function handleMouseDown(e) {
    if (!state.currentMidi) {
        if (state.currentTool === 'pen') {
            state.currentMidi = new window.Midi();
            state.currentMidi.header.setTempo(state.currentProject.tempo);
            state.currentMidi.addTrack().name = "Melody";
            
            const minDuration = getLayoutDuration(state.currentMidi);
            if (dom.fileInfo) dom.fileInfo.innerText = `Custom Tune | ${minDuration.toFixed(2)}s`;
            enablePlaybackControls(true);
        } else {
            return;
        }
    }
    const { x, y, width, height } = getCoords(e);
    const midiDuration = getLayoutDuration(state.currentMidi);
    
    let timeAtCursor = Math.max(0, xToTime(x, midiDuration, width));
    timeAtCursor = snapTime(timeAtCursor);
    
    const visiblePitchAtCursor = yToPitch(y, state.minNote, state.maxNote, height);
    const actualPitch = visiblePitchAtCursor - state.transposeOffset;

    const hit = getNoteAt(x, y, midiDuration, width, height, state.currentMidi.tracks);

    if (state.currentTool === 'erase') {
        if (hit) {
            const idx = hit.track.notes.indexOf(hit.note);
            if (idx !== -1) hit.track.notes.splice(idx, 1);
            state.selectedNotes.delete(hit.note);
            updateChordUI();
            redraw();
        }
        return;
    }

    if (state.currentTool === 'pen') {
        const targetTrack = state.currentMidi.tracks[0] || state.currentMidi.addTrack();
        
        const beatDuration = 60 / (state.currentProject.tempo || 120);
        let snappedPitch = snapPitch(actualPitch);
        const newNote = {
            midi: Math.max(0, Math.min(127, snappedPitch)),
            time: timeAtCursor,
            duration: beatDuration, 
            velocity: 0.8
        };
        targetTrack.addNote(newNote); 
        
        // Find reference to added note
        const addedNote = targetTrack.notes[targetTrack.notes.length - 1];
        
        state.selectedNotes.clear();
        state.selectedNotes.add(addedNote);
        
        state.dragState = {
            type: 'resizeRight',
            note: addedNote,
            startX: x,
            startWidthTime: beatDuration,
            startTime: timeAtCursor,
            layoutDuration: midiDuration
        };
        redraw();
        return;
    }

    if (state.currentTool === 'select') {
        if (hit) {
            const edgeThreshold = 8;
            let action = 'move';
            if (x < hit.nx + edgeThreshold) action = 'resizeLeft';
            else if (x > hit.nx + hit.nw - edgeThreshold) action = 'resizeRight';

            if (!state.selectedNotes.has(hit.note)) {
                if (!e.shiftKey) state.selectedNotes.clear();
                state.selectedNotes.add(hit.note);
            }

            state.dragState = {
                type: action,
                startX: x,
                startY: y,
                initialState: Array.from(state.selectedNotes).map(n => ({
                    note: n,
                    time: n.time,
                    midi: n.midi,
                    duration: n.duration
                })),
                layoutDuration: midiDuration
            };
        } else {
            // Seek or Box Select
            if (!e.shiftKey) state.selectedNotes.clear();
            state.dragState = {
                type: 'emptyClick',
                startX: x,
                startY: y,
                currentX: x,
                currentY: y,
                layoutDuration: midiDuration
            };
        }
        redraw();
    }
}

function handleMouseMove(e) {
    if (!state.currentMidi) return;
    const { x, y, width, height } = getCoords(e);
    
    const midiDuration = getLayoutDuration(state.currentMidi);

    // Cursor updates
    if (state.currentTool === 'select' && !state.dragState) {
        const hit = getNoteAt(x, y, midiDuration, width, height, state.currentMidi.tracks);
        if (hit) {
            const edgeThreshold = 8;
            if (x < hit.nx + edgeThreshold || x > hit.nx + hit.nw - edgeThreshold) {
                dom.canvasWrapper.style.cursor = 'ew-resize';
            } else {
                dom.canvasWrapper.style.cursor = 'grab';
            }
        } else {
            dom.canvasWrapper.style.cursor = 'default';
        }
    }

    if (!state.dragState) return;
    const s = state.dragState;
    
    // If we dragged past a tiny threshold on empty space, it's a box select
    if (s.type === 'emptyClick') {
        if (Math.abs(x - s.startX) > 3 || Math.abs(y - s.startY) > 3) {
            s.type = 'boxSelect';
        }
    }

    let timeDelta = xToTime(x - s.startX, midiDuration, width);
    const range = state.maxNote - state.minNote;
    const pitchDelta = -Math.round(((y - s.startY) / height) * range);

    if (s.type === 'move') {
        s.initialState.forEach(st => {
            let newTime = Math.max(0, st.time + timeDelta);
            newTime = snapTime(newTime);
            
            let newPitch = st.midi + pitchDelta;
            newPitch = snapPitch(newPitch);
            newPitch = Math.max(0, Math.min(127, newPitch));
            
            st.note.time = newTime;
            st.note.midi = newPitch;
        });
        dom.canvasWrapper.style.cursor = 'grabbing';
        redraw();
    } else if (s.type === 'resizeRight') {
        if (s.note) {
            let newDuration = Math.max(0.1, s.startWidthTime + timeDelta);
            if (state.snapToGrid) {
                const beatDuration = 60 / state.currentProject.tempo;
                const snapUnit = beatDuration * 0.25;
                newDuration = Math.max(snapUnit, Math.round(newDuration / snapUnit) * snapUnit);
            }
            s.note.duration = newDuration;
        } else {
            s.initialState.forEach(st => {
                let newDuration = Math.max(0.1, st.duration + timeDelta);
                if (state.snapToGrid) {
                    const beatDuration = 60 / state.currentProject.tempo;
                    const snapUnit = beatDuration * 0.25;
                    newDuration = Math.max(snapUnit, Math.round(newDuration / snapUnit) * snapUnit);
                }
                st.note.duration = newDuration;
            });
        }
        redraw();
    } else if (s.type === 'resizeLeft') {
        s.initialState.forEach(st => {
            let newTime = Math.max(0, Math.min(st.time + st.duration - 0.1, st.time + timeDelta));
            newTime = snapTime(newTime);
            
            const diff = newTime - st.time;
            st.note.time = newTime;
            st.note.duration = Math.max(0.1, st.duration - diff);
        });
        redraw();
    } else if (s.type === 'boxSelect') {
        s.currentX = x;
        s.currentY = y;
        
        const time1 = Math.max(0, xToTime(Math.min(s.startX, s.currentX), midiDuration, width));
        const time2 = Math.max(0, xToTime(Math.max(s.startX, s.currentX), midiDuration, width));
        
        const pitch1 = yToPitch(Math.max(s.startY, s.currentY), state.minNote, state.maxNote, height) - state.transposeOffset;
        const pitch2 = yToPitch(Math.min(s.startY, s.currentY), state.minNote, state.maxNote, height) - state.transposeOffset;
        
        state.selectedNotes.clear();
        state.currentMidi.tracks.forEach(track => {
            track.notes.forEach(n => {
                if (n.time < time2 && n.time + n.duration > time1 &&
                    n.midi >= pitch1 && n.midi <= pitch2) {
                    state.selectedNotes.add(n);
                }
            });
        });

        state.dragBox = {
            left: Math.min(s.startX, s.currentX),
            top: Math.min(s.startY, s.currentY),
            width: Math.abs(x - s.startX),
            height: Math.abs(y - s.startY)
        };
        redraw();
    }
}

function handleMouseUp(e) {
    if (state.dragState) {
        if (state.dragState.type === 'emptyClick') {
            // It was just a click on empty canvas, seek playhead
            const { x } = getCoords(e);
            const rect = dom.canvasWrapper.getBoundingClientRect();
            if (x >= 0 && x <= rect.width && state.currentMidi) {
                const midiDuration = getLayoutDuration(state.currentMidi);
                const seekTime = xToTime(x, midiDuration, rect.width);
                if (window.Tone && window.Tone.Transport) {
                    window.Tone.Transport.seconds = seekTime;
                }
                if (state.sampler) state.sampler.releaseAll();
                updatePlayHead(seekTime);
                log(`Seek to: ${seekTime.toFixed(2)}s`);
            }
        }

        // recalculate global duration bounds if a note was dragged past the end!
        if (state.currentMidi) {
            // Re-calculating duration internally if needed by tone.Midi.
            // Tone.Midi calculates it dynamically, so we don't assign it manually.
        }

        state.dragState = null;
        state.dragBox = null;
        updateCursor();
        updateChordUI();
        redraw();
    }
}

function redraw() {
    if (state.currentMidi) {
        drawMidi(state.currentMidi, window.Tone ? window.Tone.Transport.seconds : -1);
        drawKeys();
    }
}
