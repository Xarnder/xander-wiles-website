import { state, constants } from './state.js';
import { dom, log } from './ui.js';
import { startAudioContext } from './audio.js';
import { loadMidiData } from './midi.js';

// ─────────────────────────────────────────────
// Helper: pick a random element from an array
// ─────────────────────────────────────────────
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const coin = (p = 0.5) => Math.random() < p;

// ─────────────────────────────────────────────
// Rhythm tables  (values = beats)
// ─────────────────────────────────────────────
const RHYTHMS = [
    [1, 1, 1, 1],
    [0.5, 0.5, 1, 2],
    [1.5, 0.5, 1, 1],
    [1, 0.5, 0.5, 2],
    [0.5, 1.5, 1, 1],
    [2, 0.5, 0.5, 1],
    [0.5, 0.5, 0.5, 0.5, 1, 1],   // more subdivisions
    [1, 0.5, 0.5, 0.5, 0.5, 1],   // syncopation-friendly
];
const END_RHYTHMS = [[1, 1, 2], [2, 2], [1, 3], [0.5, 0.5, 3], [4]];

// ─────────────────────────────────────────────
// Motif: generate a short seed pattern of scale indices
// ─────────────────────────────────────────────
function buildMotif(startIdx, length, maxIdx, allowedIndices, scaleLen) {
    const motif = [startIdx];
    for (let i = 1; i < length; i++) {
        const dir = coin() ? 1 : -1;
        let next = motif[motif.length - 1] + dir;
        // Keep in range and on allowed scale degrees
        let tries = 0;
        while (tries++ < 10 && (next < 0 || next > maxIdx || !allowedIndices.includes(next % scaleLen))) {
            next = motif[motif.length - 1] + (coin() ? 1 : -1);
        }
        next = Math.max(0, Math.min(maxIdx, next));
        motif.push(next);
    }
    return motif;
}

// Transformations
const invertMotif = (motif, pivot) => motif.map(n => pivot + (pivot - n));
const retrogradeMotif = motif => [...motif].reverse();
const transposeMotif = (motif, steps) => motif.map(n => n + steps);
const clampMotif = (motif, lo, hi) => motif.map(n => Math.max(lo, Math.min(hi, n)));

// ─────────────────────────────────────────────
// Main generator
// ─────────────────────────────────────────────
export async function generateTune() {
    await startAudioContext();

    // ── Scale resolution ──────────────────────
    const rootMidi   = parseInt(dom.genKey.value);
    const userScale  = dom.genScale.value;
    const isPentatonic = userScale === 'pentatonic';

    const scaleIntervals = constants.DIATONIC_SCALES[userScale];
    const scaleLen       = scaleIntervals.length;
    const maxScaleIndex  = scaleLen * 2 - 1;

    // Which diatonic indices are allowed (pentatonic filters them)
    let allowedIndices = Array.from({ length: scaleLen }, (_, i) => i);
    if (isPentatonic) allowedIndices = constants.PENTATONIC_SUBSETS['major'] ?? allowedIndices;

    // ── Progression ───────────────────────────
    const progressionPool = constants.PROGRESSIONS[userScale] ?? constants.PROGRESSIONS['major'];
    const chosenProgression = pick(progressionPool);

    // ── Tempo ─────────────────────────────────
    const tempoMark = pick(constants.TEMPO_MARKS);
    const tempo     = tempoMark.bpm;
    const beatDur   = 60 / tempo;

    // ── Theory flags ─ randomly enabled on each generation ──
    const useMotif        = coin(0.85);   // build & reuse a short motif
    const useVelocityArc  = coin(0.80);   // crescendo toward bar 4, decrescendo after
    const useSyncopation  = coin(0.65);   // occasional rests
    const useLeapResolve  = coin(0.70);   // large leap followed by stepwise resolution
    const useNeighbour    = coin(0.60);   // neighbour/passing tones on weak beats
    const usePickup       = coin(0.40);   // start with an anacrusis pickup note
    const useMotifInverse = useMotif && coin(0.50);
    const useMotifRetro   = useMotif && coin(0.40);
    const useMotifTranspose = useMotif && coin(0.55);

    // ── Phrase structure ──────────────────────
    // AABA = bars [A,A,B,A,A,A,B,A]  ABAB = [A,B,A,B,A,B,A,B]
    const phraseType = coin(0.6) ? 'AABA' : 'ABAB';
    const rhythmA    = pick(RHYTHMS);
    const rhythmB    = pick(RHYTHMS.filter(r => r !== rhythmA));
    const rhythmEnd  = pick(END_RHYTHMS);

    const phraseMapAABA = [rhythmA, rhythmA, rhythmB, rhythmA, rhythmA, rhythmA, rhythmB, rhythmEnd];
    const phraseMapABAB = [rhythmA, rhythmB, rhythmA, rhythmB, rhythmA, rhythmB, rhythmA, rhythmEnd];
    const phraseMap = phraseType === 'AABA' ? phraseMapAABA : phraseMapABAB;

    // ── Project state ─────────────────────────
    const bars = 8;
    state.currentProject = {
        rootMidi,
        scaleType: userScale,
        tempo,
        beatsPerBar: 4,
        bars,
        progressionRoots: chosenProgression.roots,
        addedChords: {}
    };

    // ── Build active-rule summary ─────────────
    const activeRules = [
        `Progression: ${chosenProgression.name}`,
        `Tempo: ${tempo} BPM (${tempoMark.label})`,
        `Phrase: ${phraseType}`,
        useMotif        ? `Motif (len ${Math.floor(Math.random()*2)+2})` : null,
        useMotifInverse ? 'Motif Inversion' : null,
        useMotifRetro   ? 'Motif Retrograde' : null,
        useMotifTranspose ? 'Motif Transposition' : null,
        useVelocityArc  ? 'Velocity Arc' : null,
        useSyncopation  ? 'Syncopation / Rests' : null,
        useLeapResolve  ? 'Leap+Resolve' : null,
        useNeighbour    ? 'Neighbour Tones' : null,
        usePickup       ? 'Pickup Note' : null,
    ].filter(Boolean);

    log(`Generating… [${activeRules.join(' | ')}]`, 'info');

    // ── MIDI scaffold ─────────────────────────
    const newMidi = new window.Midi();
    newMidi.header.setTempo(tempo);
    const melodyTrack = newMidi.addTrack();
    melodyTrack.name = 'Melody';

    // ── Motif construction ────────────────────
    const motifLength = useMotif ? (coin(0.5) ? 2 : 3) : 0;
    let baseMotif = null;
    const motifVariants = {}; // bar → transformed motif or null

    // ── Playback cursor ───────────────────────
    let currentTime = 0;
    let currentScaleIndex = scaleLen; // start in the middle octave

    // Pickup (anacrusis): add a single upbeat note half a beat before bar 0
    if (usePickup) {
        const pickupScaleIdx = Math.max(0, currentScaleIndex - 1);
        const octOff = Math.floor(pickupScaleIdx / scaleLen);
        const deg    = pickupScaleIdx % scaleLen;
        const midiNote = rootMidi + octOff * 12 + scaleIntervals[deg];
        melodyTrack.addNote({
            midi:     midiNote,
            time:     Math.max(0, -0.5 * beatDur),
            duration: 0.5 * beatDur - 0.04,
            velocity: 0.55
        });
    }

    // ── Bar loop ──────────────────────────────
    for (let bar = 0; bar < bars; bar++) {
        const chordRootDegree = chosenProgression.roots[bar % 4];
        const chordDegrees    = [
            chordRootDegree,
            (chordRootDegree + 2) % scaleLen,
            (chordRootDegree + 4) % scaleLen
        ];

        // Build valid chord tone positions across two octaves
        let validChordTones = [];
        for (let i = 0; i <= maxScaleIndex; i++) {
            if (chordDegrees.includes(i % scaleLen)) validChordTones.push(i);
        }

        const chosenRhythm = phraseMap[bar];
        let beatInBar = 0;

        // ── Motif assignment per bar ──────────
        if (useMotif) {
            if (bar === 0) {
                baseMotif = buildMotif(currentScaleIndex, motifLength, maxScaleIndex, allowedIndices, scaleLen);
                motifVariants[bar] = baseMotif;
            } else if (bar === 2 && useMotifInverse && baseMotif) {
                const pivot = baseMotif[0];
                motifVariants[bar] = clampMotif(invertMotif(baseMotif, pivot), 0, maxScaleIndex);
            } else if (bar === 4 && useMotifRetro && baseMotif) {
                motifVariants[bar] = retrogradeMotif(baseMotif);
            } else if (bar === 6 && useMotifTranspose && baseMotif) {
                const shift = coin() ? 2 : -2; // transpose up/down a third (2 scale steps)
                motifVariants[bar] = clampMotif(transposeMotif(baseMotif, shift), 0, maxScaleIndex);
            }
        }
        const barMotif = motifVariants[bar] ?? null;
        let motifNoteIdx = 0;

        // ── Note loop within bar ──────────────
        const isLastBar = bar === bars - 1;

        for (let noteI = 0; noteI < chosenRhythm.length; noteI++) {
            const dur = chosenRhythm[noteI];
            const isStrongBeat = Number.isInteger(beatInBar);
            const isFinalNote  = isLastBar && noteI === chosenRhythm.length - 1;

            // ── Velocity arc ─────────────────
            let velocity;
            if (useVelocityArc) {
                // bars 0→3 crescendo 0.6→0.95, bars 4→7 decrescendo 0.95→0.6
                const arc = bar < 4 ? 0.6 + (bar / 3) * 0.35 : 0.95 - ((bar - 3) / 4) * 0.35;
                velocity = isStrongBeat ? Math.min(1, arc + 0.05) : Math.max(0.4, arc - 0.15);
            } else {
                velocity = isStrongBeat ? 0.9 : 0.7;
            }

            // ── Cadential resolution (final note) ──
            if (isFinalNote) {
                // Force landing on tonic (scale index 0 or scaleLen)
                currentScaleIndex = validChordTones.find(ct => ct % scaleLen === 0) ?? scaleLen;
            }

            // ── Motif playback ────────────────
            else if (barMotif && motifNoteIdx < barMotif.length && noteI < barMotif.length) {
                currentScaleIndex = barMotif[motifNoteIdx++];
                currentScaleIndex = Math.max(0, Math.min(maxScaleIndex, currentScaleIndex));
            }

            // ── Leap-then-resolve ─────────────
            else if (useLeapResolve && isStrongBeat && coin(0.20) && noteI < chosenRhythm.length - 2) {
                const leap = coin() ? 3 : -3; // leap of a 5th (3 scale steps)
                currentScaleIndex = Math.max(0, Math.min(maxScaleIndex, currentScaleIndex + leap));
                // The NEXT weak beat will resolve by step (handled below naturally)
            }

            // ── Strong beat: chord tone targeting ──
            else if (isStrongBeat) {
                let options = validChordTones.filter(ct => Math.abs(ct - currentScaleIndex) <= 4);
                if (options.length === 0) options = validChordTones;
                const diffOpts = options.filter(o => o !== currentScaleIndex);
                currentScaleIndex = (diffOpts.length > 0 && coin(0.88))
                    ? pick(diffOpts)
                    : pick(options);
            }

            // ── Weak beat: stepwise / neighbour tones ──
            else {
                if (useNeighbour && coin(0.30)) {
                    // Chromatic neighbour tone (half-step above or below current)
                    // We store the raw midi offset and skip scale quantization
                    const octOff   = Math.floor(currentScaleIndex / scaleLen);
                    const deg      = currentScaleIndex % scaleLen;
                    const rawMidi  = rootMidi + octOff * 12 + scaleIntervals[deg];
                    const nbrMidi  = rawMidi + (coin() ? 1 : -1);

                    // ── Syncopation rest ──
                    if (useSyncopation && coin(0.18)) {
                        // skip note (rest) — do nothing except advance time
                    } else {
                        melodyTrack.addNote({
                            midi:     Math.max(36, Math.min(96, nbrMidi)),
                            time:     currentTime + beatInBar * beatDur,
                            duration: dur * beatDur - 0.04,
                            velocity
                        });
                    }
                    beatInBar += dur;
                    continue; // skip the normal note-add below
                }

                // Stepwise motion in a random direction
                const dir  = coin() ? 1 : -1;
                let next   = currentScaleIndex + dir;
                let tries  = 0;
                while (tries++ < 8 && (next < 0 || next > maxScaleIndex || !allowedIndices.includes(next % scaleLen))) {
                    next = currentScaleIndex + (coin() ? 1 : -1);
                }
                currentScaleIndex = Math.max(0, Math.min(maxScaleIndex, next));
            }

            currentScaleIndex = Math.max(0, Math.min(maxScaleIndex, currentScaleIndex));

            // ── Syncopation rest (strong beats too, occasionally) ──
            if (useSyncopation && !isFinalNote && !isStrongBeat && coin(0.12)) {
                beatInBar += dur;
                continue;
            }

            // ── Emit note ─────────────────────
            const octOff   = Math.floor(currentScaleIndex / scaleLen);
            const deg      = currentScaleIndex % scaleLen;
            const midiNote = rootMidi + octOff * 12 + scaleIntervals[deg];

            melodyTrack.addNote({
                midi:     Math.max(36, Math.min(96, midiNote)),
                time:     currentTime + beatInBar * beatDur,
                duration: dur * beatDur - 0.05,
                velocity: Math.max(0.3, Math.min(1.0, velocity))
            });

            beatInBar += dur;
        }

        currentTime += state.currentProject.beatsPerBar * beatDur;
    }

    const keyName = dom.genKey.options[dom.genKey.selectedIndex].text;
    const scalePretty = userScale.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    const name = `AI Song (${keyName} ${scalePretty} — ${chosenProgression.name}, ${tempoMark.label})`;
    loadMidiData(newMidi, name);
    log(`Done! ${activeRules.join(' · ')}`, 'info');
}
