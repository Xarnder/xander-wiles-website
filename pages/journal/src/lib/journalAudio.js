const SAVE_SOUND_URL = `${import.meta.env.BASE_URL}audio/Save.mp3`;
const PROGRESS_SOUND_URL = `${import.meta.env.BASE_URL}audio/Progress.mp3`;
const SOUNDS_ENABLED_KEY = 'journal-sounds-enabled';

let saveAudio = null;
let progressAudio = null;
let audioUnlocked = false;

export function areJournalSoundsEnabled() {
    try {
        return localStorage.getItem(SOUNDS_ENABLED_KEY) === 'true';
    } catch {
        return false;
    }
}

export function setJournalSoundsEnabled(enabled) {
    try {
        localStorage.setItem(SOUNDS_ENABLED_KEY, String(Boolean(enabled)));
    } catch {
        // Ignore storage failures; playback is still gated in memory this session.
    }

    if (!enabled) {
        stopAllJournalAudio();
        audioUnlocked = false;
    }
}

function createAudio(url, volume) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = volume;
    audio.setAttribute('playsinline', '');
    return audio;
}

function getSaveAudio() {
    if (!saveAudio) {
        saveAudio = createAudio(SAVE_SOUND_URL, 0.8);
    }
    return saveAudio;
}

function getProgressAudio() {
    if (!progressAudio) {
        progressAudio = createAudio(PROGRESS_SOUND_URL, 0.65);
    }
    return progressAudio;
}

function stopAudio(audio) {
    if (!audio) return;

    try {
        audio.pause();
        audio.currentTime = 0;
    } catch {
        // Ignore teardown errors from interrupted playback.
    }
}

function stopAllJournalAudio() {
    stopAudio(saveAudio);
    stopAudio(progressAudio);
}

function playAudio(audio, label) {
    if (!audio) return;

    try {
        audio.pause();
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise) {
            playPromise.catch((error) => {
                console.warn(`Could not play the ${label} sound:`, error);
            });
        }
    } catch (error) {
        console.warn(`Could not play the ${label} sound:`, error);
    }
}

export function unlockJournalAudio() {
    if (!areJournalSoundsEnabled() || audioUnlocked) return;
    audioUnlocked = true;

    [getSaveAudio(), getProgressAudio()].forEach((audio) => {
        const requestedVolume = audio.volume;
        audio.volume = 0.01;

        try {
            const playPromise = audio.play();
            if (playPromise) {
                playPromise
                    .then(() => {
                        audio.pause();
                        audio.currentTime = 0;
                    })
                    .catch(() => {
                        // A later direct interaction can still allow playback.
                    })
                    .finally(() => {
                        audio.volume = requestedVolume;
                    });
            } else {
                audio.pause();
                audio.currentTime = 0;
                audio.volume = requestedVolume;
            }
        } catch {
            audio.volume = requestedVolume;
        }
    });
}

export function playSaveSound() {
    if (!areJournalSoundsEnabled()) return;
    unlockJournalAudio();
    playAudio(getSaveAudio(), 'save');
}

export function playProgressSound() {
    if (!areJournalSoundsEnabled()) return;
    unlockJournalAudio();
    playAudio(getProgressAudio(), '100-word progress');
}
