import { state } from './state.js';
import { dom, log } from './ui.js';

export async function handleDownload() {
    if (!state.currentMidi) {
        alert("Please create or load a Tune first.");
        return;
    }

    if (!dom.exportFormat || !dom.downloadBtn) return;
    const format = dom.exportFormat.value;
    const originalText = dom.downloadBtn.innerText;
    dom.downloadBtn.innerText = "Rendering...";
    dom.downloadBtn.disabled = true;
    try {
        let blob;
        let filename = 'custom_tune';

        if (format === 'midi') {
            // Apply current transposition to a separate export instance
            const exportMidi = new window.Midi(state.currentMidi.toArray());
            exportMidi.tracks.forEach(track => {
                track.notes.forEach(note => {
                    note.midi = Math.max(0, Math.min(127, note.midi + state.transposeOffset));
                });
            });
            blob = new Blob([exportMidi.toArray()], { type: "audio/midi" });
            filename += '.mid';
        } else {
            if (!state.userAudioBuffer) {
                alert("Please load an Audio Sample to export Audio files (MP3/WAV).");
                return;
            }
            
            const duration = state.currentMidi.duration + 2;
            const sampleMap = {};
            const rootNote = dom.rootNoteSelect ? dom.rootNoteSelect.value : "C3";
            sampleMap[rootNote] = state.userAudioUrl;

            const buffer = await window.Tone.Offline(async ({ transport }) => {
                const offlineSampler = new window.Tone.Sampler({
                    urls: sampleMap,
                    baseUrl: ""
                }).toDestination();

                await window.Tone.loaded();

                state.currentMidi.tracks.forEach(track => {
                    track.notes.forEach(note => {
                        const transposedMidi = note.midi + state.transposeOffset;
                        const freq = window.Tone.Frequency(transposedMidi, "midi");
                        offlineSampler.triggerAttackRelease(
                            freq, note.duration, note.time, note.velocity
                        );
                    });
                });

                transport.start();
            }, duration);

            if (format === 'mp3') {
                blob = bufferToMp3(buffer);
                filename += '.mp3';
            } else {
                blob = bufferToWave(buffer);
                filename += '.wav';
            }
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 100);

        log(`Download ready: ${filename}`, "success");

    } catch (e) {
        console.error(e);
        log("Render failed: " + e.message, "error");
        alert("Rendering failed. See console.");
    } finally {
        dom.downloadBtn.innerText = originalText;
        dom.downloadBtn.disabled = false;
    }
}

function bufferToMp3(buffer) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const mp3encoder = new window.lamejs.Mp3Encoder(channels, sampleRate, 128);
    const mp3Data = [];

    const left = buffer.getChannelData(0);
    const right = channels > 1 ? buffer.getChannelData(1) : left;
    const sampleBlockSize = 1152;

    for (let i = 0; i < left.length; i += sampleBlockSize) {
        const leftChunk = left.subarray(i, i + sampleBlockSize);
        const rightChunk = right.subarray(i, i + sampleBlockSize);
        const leftInt = new Int16Array(leftChunk.length);
        const rightInt = new Int16Array(rightChunk.length);

        for (let j = 0; j < leftChunk.length; j++) {
            const l = Math.max(-1, Math.min(1, leftChunk[j]));
            leftInt[j] = l < 0 ? l * 32768 : l * 32767;
            const r = Math.max(-1, Math.min(1, rightChunk[j]));
            rightInt[j] = r < 0 ? r * 32768 : r * 32767;
        }

        const mp3buf = (channels === 1)
            ? mp3encoder.encodeBuffer(leftInt)
            : mp3encoder.encodeBuffer(leftInt, rightInt);

        if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }

    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);

    return new Blob(mp3Data, { type: 'audio/mp3' });
}

function bufferToWave(abuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const len = abuffer.length;
    const length = len * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
    const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };

    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);
    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164);
    setUint32(length - pos - 4);

    for (i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            if (offset >= len) break;
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([buffer], { type: "audio/wav" });
}
