import { state, constants } from './state.js';
import { dom, log } from './ui.js';
import { calculateMidiBounds, drawMidi, drawKeys } from './visualizer.js';
import { scheduleMidiEvents } from './audio.js';

export function updateChordUI() {
    if (!dom.chordBarSelect) return;
    dom.chordBarSelect.innerHTML = '';

    const targetLabel = document.querySelector('label[for="chordBarSelect"]') || dom.chordBarSelect.previousElementSibling;
    if (targetLabel) targetLabel.innerText = "Target Melody Note:";

    const melodyTrack = state.currentMidi ? state.currentMidi.tracks[0] : null;

    if (!melodyTrack || melodyTrack.notes.length === 0) {
        dom.chordBarSelect.innerHTML = '<option value="">No notes found in melody</option>';
        return;
    }

    melodyTrack.notes.forEach((note, index) => {
        const noteName = window.Tone.Frequency(note.midi, "midi").toNote();
        const timeForm = note.time.toFixed(2);
        dom.chordBarSelect.innerHTML += `<option value="${index}">Note ${index + 1} (${noteName} at ${timeForm}s)</option>`;
    });

    const romans = constants.ROMAN_NUMERALS[state.currentProject.scaleType];
    if (dom.customChordSelect) {
        dom.customChordSelect.innerHTML = romans.map((r, i) => `<option value="${i}">${r} Chord</option>`).join('');
    }

    dom.chordBarSelect.removeEventListener('change', updateChordSuggestions);
    dom.chordBarSelect.addEventListener('change', updateChordSuggestions);

    updateChordSuggestions();
}

export function updateChordSuggestions() {
    const noteIndex = parseInt(dom.chordBarSelect.value);
    if (isNaN(noteIndex)) return;

    if (dom.suggestedChordsContainer) dom.suggestedChordsContainer.innerHTML = '';

    const melodyTrack = state.currentMidi.tracks[0];
    const targetNote = melodyTrack.notes[noteIndex];
    if (!targetNote) return;

    const notePitchClass = targetNote.midi % 12;

    const beatDuration = 60 / state.currentProject.tempo;
    const barIndex = Math.floor(targetNote.time / (state.currentProject.beatsPerBar * beatDuration));
    const expectedDegree = state.currentProject.progressionRoots[barIndex % state.currentProject.progressionRoots.length] || 0;

    const scale = constants.DIATONIC_SCALES[state.currentProject.scaleType] ?? constants.DIATONIC_SCALES['major'];
    const scaleLen = scale.length;
    const rootPitchClass = state.currentProject.rootMidi % 12;
    const romans = constants.ROMAN_NUMERALS[state.currentProject.scaleType] ?? constants.ROMAN_NUMERALS['major'];

    let suggested = [];
    const numDegrees = scaleLen; // iterate over actual scale size

    for (let degree = 0; degree < numDegrees; degree++) {
        const triadPitches = [
            (rootPitchClass + scale[degree % scaleLen]) % 12,
            (rootPitchClass + scale[(degree + Math.floor(scaleLen / 3)) % scaleLen]) % 12,
            (rootPitchClass + scale[(degree + Math.floor(scaleLen * 2 / 3)) % scaleLen]) % 12
        ];

        if (triadPitches.includes(notePitchClass)) {
            if (degree === expectedDegree) {
                suggested.unshift({ degree, label: romans[degree] + " (Perfect Match)", type: "accent" });
            } else {
                suggested.push({ degree, label: romans[degree] + " (Harmonizes Note)", type: "secondary" });
            }
        }
    }

    if (suggested.length === 0) {
        const fallbackRomans = constants.ROMAN_NUMERALS[state.currentProject.scaleType] ?? constants.ROMAN_NUMERALS['major'];
        const expectedDeg = state.currentProject.progressionRoots[Math.floor((parseInt(dom.chordBarSelect.value) || 0) / 2) % 4] ?? 0;
        suggested.push({ degree: expectedDeg, label: (fallbackRomans[expectedDeg] ?? 'I') + ' (Bar Root)', type: 'secondary' });
    }

    suggested.forEach(s => addChordSuggestionButton(s.degree, s.label, s.type));

    const clearBtn = document.createElement('button');
    clearBtn.className = "btn danger small-btn";
    clearBtn.innerText = "Clear Note";
    clearBtn.onclick = () => {
        delete state.currentProject.addedChords[noteIndex];
        renderChordTrack();
    };
    if (dom.suggestedChordsContainer) dom.suggestedChordsContainer.appendChild(clearBtn);
}

function addChordSuggestionButton(degree, label, colorClass) {
    const btn = document.createElement('button');
    btn.className = `btn ${colorClass} small-btn`;
    btn.innerText = label;
    btn.onclick = () => {
        const noteIndex = parseInt(dom.chordBarSelect.value);
        state.currentProject.addedChords[noteIndex] = degree;
        renderChordTrack();
    };
    if (dom.suggestedChordsContainer) dom.suggestedChordsContainer.appendChild(btn);
}

export function handleAddChord() {
    const noteIndex = parseInt(dom.chordBarSelect.value);
    const degree = parseInt(dom.customChordSelect.value);
    if (!isNaN(noteIndex) && !isNaN(degree)) {
        state.currentProject.addedChords[noteIndex] = degree;
        renderChordTrack();
    }
}

export function handleAutoHarmonize() {
    if (!state.currentMidi || !state.currentMidi.tracks[0]) return;

    state.currentProject.addedChords = {}; // Clear existing

    const melodyTrack = state.currentMidi.tracks[0];
    const beatDuration = 60 / state.currentProject.tempo;
    const scale = constants.DIATONIC_SCALES[state.currentProject.scaleType] ?? constants.DIATONIC_SCALES['major'];
    const scaleLen = scale.length;
    const rootPitchClass = state.currentProject.rootMidi % 12;

    let lastChordTime = -999;
    let prevDegree = -1;

    melodyTrack.notes.forEach((note, index) => {
        const beatFloat = note.time / beatDuration;
        const barIndex = Math.floor(beatFloat / state.currentProject.beatsPerBar);
        const beatInBar = beatFloat % state.currentProject.beatsPerBar;
        
        // Intelligent Rhythm Placement: Harmonize mostly on strong beats (downbeats or mid-bar)
        // Also ensure chords are added if there's been a long gap (e.g. at least 1.5 beats)
        const isStrongBeat = (beatInBar % 2 < 0.2);
        const timeSinceLastChord = note.time - lastChordTime;

        if (!isStrongBeat && timeSinceLastChord < beatDuration * 1.5) {
             return; // Skip harmonizing this note to avoid chaotic clashing chords
        }

        const expectedDegree = state.currentProject.progressionRoots[barIndex % state.currentProject.progressionRoots.length] || 0;
        const notePitchClass = note.midi % 12;

        // Theory: Find all diatonic chords that contain this melody note
        let validDegrees = [];
        for (let degree = 0; degree < scaleLen; degree++) {
            const triadPitches = [
                (rootPitchClass + scale[degree % scaleLen]) % 12,
                (rootPitchClass + scale[(degree + Math.floor(scaleLen / 3)) % scaleLen]) % 12,
                (rootPitchClass + scale[(degree + Math.floor(scaleLen * 2 / 3)) % scaleLen]) % 12
            ];
            if (triadPitches.includes(notePitchClass)) {
                validDegrees.push(degree);
            }
        }

        let bestDegree = expectedDegree;

        if (validDegrees.length > 0) {
            if (validDegrees.includes(expectedDegree)) {
                // If the "expected" chord fits, occasionally substitute it (40% chance) for variety
                if (Math.random() < 0.4 && validDegrees.length > 1) {
                    const substitutes = validDegrees.filter(d => d !== expectedDegree && d !== prevDegree);
                    if (substitutes.length > 0) {
                        bestDegree = substitutes[Math.floor(Math.random() * substitutes.length)];
                    }
                } 
            } else {
                // The expected chord clashes! Pick a random matching triad, ideally avoiding immediate repetition
                const options = validDegrees.filter(d => d !== prevDegree);
                if (options.length > 0) {
                    bestDegree = options[Math.floor(Math.random() * options.length)];
                } else {
                    bestDegree = validDegrees[Math.floor(Math.random() * validDegrees.length)];
                }
            }
        }

        state.currentProject.addedChords[index] = bestDegree;
        lastChordTime = note.time;
        prevDegree = bestDegree;
    });

    renderChordTrack();
    updateChordUI();
    log("Auto-harmonized with intelligent functional harmony options.", "success");
}

export function handleClearAllChords() {
    state.currentProject.addedChords = {};
    renderChordTrack();
}

export function renderChordTrack() {
    if (!state.currentMidi || !state.currentMidi.tracks[0]) return;

    let trackIndex = state.currentMidi.tracks.findIndex(t => t.name === "Chords");
    if (trackIndex !== -1) {
        state.currentMidi.tracks[trackIndex].notes.length = 0;
    } else {
        const t = state.currentMidi.addTrack();
        t.name = "Chords";
        trackIndex = state.currentMidi.tracks.length - 1;
    }

    const chordTrack = state.currentMidi.tracks[trackIndex];
    const melodyTrack = state.currentMidi.tracks[0];
    const beatDuration = 60 / state.currentProject.tempo;

    const chordNoteIndices = Object.keys(state.currentProject.addedChords).map(Number).sort((a,b) => a - b);

    for (let i = 0; i < chordNoteIndices.length; i++) {
        const noteIndex = chordNoteIndices[i];
        const degree = state.currentProject.addedChords[noteIndex];

        const melodyNote = melodyTrack.notes[noteIndex];
        if (!melodyNote) continue;

        // Prolong chords until the next chord or a maximum length (to form pads instead of staccato plucks)
        let chordDuration = melodyNote.duration;
        if (i < chordNoteIndices.length - 1) {
            const nextMelodyNote = melodyTrack.notes[chordNoteIndices[i + 1]];
            if (nextMelodyNote) {
                chordDuration = nextMelodyNote.time - melodyNote.time;
            }
        } else {
            chordDuration = Math.max(melodyNote.duration, beatDuration * 2);
        }

        chordDuration = Math.min(chordDuration, beatDuration * state.currentProject.beatsPerBar);
        chordDuration *= 0.95; // detach slightly

        const triad = getDiatonicTriad(melodyNote.midi, degree, state.currentProject.scaleType);

        triad.forEach(midiNote => {
            chordTrack.addNote({
                midi: midiNote,
                time: melodyNote.time,
                duration: chordDuration,
                velocity: 0.5
            });
        });
    }

    if (window.Tone && window.Tone.Transport.state === "started") scheduleMidiEvents();
    calculateMidiBounds(state.currentMidi);
    drawMidi(state.currentMidi, window.Tone ? window.Tone.Transport.seconds : -1);
    drawKeys();
}

// Employs Voice Leading theory: keeps chords clustered near the melody note
function getDiatonicTriad(anchorMidi, degree, scaleType) {
    const scale = constants.DIATONIC_SCALES[scaleType] ?? constants.DIATONIC_SCALES['major'];
    const scaleLen = scale.length;
    const rootPitchClass = state.currentProject.rootMidi % 12;

    // Space the three triad members evenly across the scale length
    const step1 = degree % scaleLen;
    const step2 = (degree + Math.floor(scaleLen / 3)) % scaleLen;
    const step3 = (degree + Math.floor(scaleLen * 2 / 3)) % scaleLen;

    const getPitch = (step, octaveBoost = 0) =>
        rootPitchClass + (octaveBoost * 12) + scale[step % scaleLen];

    let p1 = getPitch(step1);
    let p2 = getPitch(step2);
    let p3 = getPitch(step3);

    // Ensure ascending order within one octave
    while (p2 <= p1) p2 += 12;
    while (p3 <= p2) p3 += 12;

    // Voice-leading wrapper: force notes to stay anchored within +/- 6 semitones of the melody
    const wrapPitch = (p, anchor) => {
        while (p > anchor + 6)  p -= 12;
        while (p < anchor - 18) p += 12; // allow roughly one octave below
        return p;
    };

    return [wrapPitch(p1, anchorMidi), wrapPitch(p2, anchorMidi), wrapPitch(p3, anchorMidi)].sort((a, b) => a - b);
}
