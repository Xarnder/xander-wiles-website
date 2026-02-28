export class AudioManager {
    constructor(engine) {
        this.engine = engine;
        this.isMutedAll = false;
        this.isMutedSFX = false;
        this.isMutedAmbience = false;

        this.sfx = {};
        this.ambience = {};

        this._initSounds();
    }

    _initSounds() {
        // SFX
        this.sfx.place = this._createAudio('assets/sounds/place.mp3', 0.5);
        this.sfx.break = this._createAudio('assets/sounds/break.mp3', 0.8);
        this.sfx.walk = this._createAudio('assets/sounds/walking.mp3', 0.3, true);
        this.sfx.swim = this._createAudio('assets/sounds/swimming.mp3', 0.4, true);
        this.sfx.splash = this._createAudio('assets/sounds/splash.mp3', 0.7);

        // Ambience
        this.ambience.underwater = this._createAudio('assets/sounds/underwater-ambients.mp3', 0, true);
        this.ambience.normal = this._createAudio('assets/sounds/normal-ambients.mp3', 0, true);
    }

    _createAudio(src, volume, loop = false) {
        const audio = new Audio(src);
        audio.volume = volume;
        audio.loop = loop;
        audio._baseVolume = volume; // Store original for muting logic
        return audio;
    }

    playSFX(name, forceRestart = true) {
        const sound = this.sfx[name];
        if (!sound || this.isMutedAll || this.isMutedSFX) return;

        if (forceRestart) sound.currentTime = 0;
        sound.play().catch(e => console.warn(`Audio play failed for SFX ${name}:`, e));
    }

    stopSFX(name) {
        const sound = this.sfx[name];
        if (sound) {
            sound.pause();
            sound.currentTime = 0;
        }
    }

    setAmbienceVolume(name, volume) {
        const sound = this.ambience[name];
        if (!sound) return;

        sound._baseVolume = volume;
        if (this.isMutedAll || this.isMutedAmbience) {
            sound.volume = 0;
        } else {
            sound.volume = volume;
        }

        // Auto-play if volume > 0 and not playing
        if (sound.volume > 0 && sound.paused) {
            sound.play().catch(e => console.warn(`Ambience auto-play failed:`, e));
        }
    }

    toggleMuteAll(muted) {
        this.isMutedAll = muted;
        this.updateAllVolumes();
    }

    toggleMuteSFX(muted) {
        this.isMutedSFX = muted;
        this.updateAllVolumes();
    }

    toggleMuteAmbience(muted) {
        this.isMutedAmbience = muted;
        this.updateAllVolumes();
    }

    updateAllVolumes() {
        // SFX: Just stop looping sounds if muted
        const muteSFX = this.isMutedAll || this.isMutedSFX;
        if (muteSFX) {
            if (this.sfx.walk) this.sfx.walk.pause();
            if (this.sfx.swim) this.sfx.swim.pause();
        }

        // Ambience: Set volume to 0 or base
        const muteAmbience = this.isMutedAll || this.isMutedAmbience;
        for (const key in this.ambience) {
            const sound = this.ambience[key];
            sound.volume = muteAmbience ? 0 : sound._baseVolume;
        }
    }
}
