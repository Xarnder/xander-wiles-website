export const state = {
    sampler: null,
    referenceSynth: null,
    rawPlayer: null,
    currentMidi: null,
    userAudioUrl: null,
    userAudioBuffer: null,
    isPlaying: false,
    hasPlayed: false,
    animationId: null,

    // Editor State
    currentTool: 'select',
    snapToGrid: true,
    snapToScale: false,
    selectedNotes: new Set(),
    dragBox: null,

    currentOctave: 4,
    transposeOffset: 0,
    minNote: 48,
    maxNote: 72,

    currentProject: {
        rootMidi: 60,
        scaleType: 'major',
        tempo: 110,
        beatsPerBar: 4,
        bars: 8,
        progressionRoots: [0, 4, 5, 3],
        addedChords: {} // Format: { noteIndex: scaleDegree }
    }
};

export const constants = {
    DIATONIC_SCALES: {
        major:        [0, 2, 4, 5, 7, 9, 11],
        minor:        [0, 2, 3, 5, 7, 8, 10],
        pentatonic:   [0, 2, 4, 7, 9],
        dorian:       [0, 2, 3, 5, 7, 9, 10],
        phrygian:     [0, 1, 3, 5, 7, 8, 10],
        lydian:       [0, 2, 4, 6, 7, 9, 11],
        mixolydian:   [0, 2, 4, 5, 7, 9, 10],
        harmonic_minor: [0, 2, 3, 5, 7, 8, 11]
    },
    PENTATONIC_SUBSETS: {
        major: [0, 1, 2, 4, 5],
        minor: [0, 2, 3, 4, 6]
    },
    // Multiple named progressions per scale — generator picks one randomly
    PROGRESSIONS: {
        major: [
            { name: 'I–V–vi–IV',   roots: [0, 4, 5, 3] },
            { name: 'I–IV–V–I',    roots: [0, 3, 4, 0] },
            { name: 'I–vi–IV–V',   roots: [0, 5, 3, 4] },
            { name: 'I–IV–VI–V',   roots: [0, 3, 5, 4] },
            { name: 'ii–V–I–VI',   roots: [1, 4, 0, 5] },
            { name: 'I–iii–IV–V',  roots: [0, 2, 3, 4] }
        ],
        minor: [
            { name: 'i–iv–v–i',    roots: [0, 3, 4, 0] },
            { name: 'i–VI–III–VII',roots: [0, 5, 2, 6] },
            { name: 'i–VII–VI–VII',roots: [0, 6, 5, 6] },
            { name: 'i–iv–VII–III',roots: [0, 3, 6, 2] },
            { name: 'i–ii°–v–i',   roots: [0, 1, 4, 0] }
        ],
        pentatonic: [
            { name: 'I–IV–I–V',    roots: [0, 3, 0, 4] },
            { name: 'I–V–IV–I',    roots: [0, 4, 3, 0] }
        ],
        dorian: [
            { name: 'i–IV–i–VII',  roots: [0, 3, 0, 6] },
            { name: 'i–VII–IV–i',  roots: [0, 6, 3, 0] }
        ],
        phrygian: [
            { name: 'i–II–i–VII',  roots: [0, 1, 0, 6] },
            { name: 'i–VII–VI–i',  roots: [0, 6, 5, 0] }
        ],
        lydian: [
            { name: 'I–II–vi–V',   roots: [0, 1, 5, 4] },
            { name: 'I–II–I–V',    roots: [0, 1, 0, 4] }
        ],
        mixolydian: [
            { name: 'I–VII–IV–I',  roots: [0, 6, 3, 0] },
            { name: 'I–IV–VII–I',  roots: [0, 3, 6, 0] }
        ],
        harmonic_minor: [
            { name: 'i–iv–V–i',    roots: [0, 3, 4, 0] },
            { name: 'i–VI–V–i',    roots: [0, 5, 4, 0] }
        ]
    },
    // Legacy single-array — kept for chord panel compatibility
    PROGRESSION_ROOTS: {
        major: [0, 4, 5, 3],
        minor: [0, 3, 4, 0],
        pentatonic:     [0, 3, 0, 4],
        dorian:         [0, 3, 0, 6],
        phrygian:       [0, 1, 0, 6],
        lydian:         [0, 1, 5, 4],
        mixolydian:     [0, 6, 3, 0],
        harmonic_minor: [0, 3, 4, 0]
    },
    ROMAN_NUMERALS: {
        major:          ["I",  "ii",  "iii", "IV",  "V",   "vi",  "vii°"],
        minor:          ["i",  "ii°", "III", "iv",  "v",   "VI",  "VII"],
        pentatonic:     ["I",  "II",  "IV",  "V",   "VII", "–",   "–"],
        dorian:         ["i",  "II",  "III", "IV",  "v",   "vi°", "VII"],
        phrygian:       ["i",  "II",  "III", "iv",  "v°",  "VI",  "VII"],
        lydian:         ["I",  "II",  "iii", "#iv°","V",   "vi",  "vii"],
        mixolydian:     ["I",  "ii",  "iii°","IV",  "v",   "vi",  "VII"],
        harmonic_minor: ["i",  "ii°", "III+","iv",  "V",   "VI",  "vii°"]
    },
    TEMPO_MARKS: [
        { bpm: 72,  label: 'Adagio' },
        { bpm: 88,  label: 'Andante' },
        { bpm: 100, label: 'Moderato' },
        { bpm: 112, label: 'Allegretto' },
        { bpm: 126, label: 'Allegro' },
        { bpm: 144, label: 'Vivace' },
        { bpm: 160, label: 'Presto' }
    ]
};
