# Performance benchmarks

All numbers were measured **in the browser**, through the same code paths a user runs, by the
`/spike/` harness driven by `npm run bench` (headless Google Chrome, real GPU). Raw JSON records,
including per-window ASR diagnostics, are written to `bench-results/` (git-ignored).

## Test machine

|                       |                                                                 |
| --------------------- | --------------------------------------------------------------- |
| Hardware              | Apple M4 (10-core CPU, 10-core GPU), 16 GB unified memory       |
| OS / browser          | macOS 26.6.2, Google Chrome 154 (headless, `--use-angle=metal`) |
| WebGPU adapter        | `apple / metal-3`, `shader-f16` available                       |
| Cross-origin isolated | yes (8 WASM threads)                                            |
| WebCodecs             | H.264 encode (hardware), AAC encode: yes                        |

**Windows + NVIDIA and other machines were not available for this work.** Run the same benchmark
there (see "Reproducing") and add the JSON to this table. No vendor-specific code exists: the
identical WebGPU/WASM/WebCodecs path runs on NVIDIA, AMD and Intel GPUs.

## Test material

Public-domain NASA "Apollo 11 Post Flight Press Conference" (1969): spontaneous speech, several
speakers, reporters off-mic, applause and laughter, lots of _uh_. Muxed under a 1080p30 or 720p30
synthetic H.264 test pattern with AAC 128 kbit/s stereo audio (`npm run fixtures -- --bench-long`).

## Results

### Audio decode + analysis (Mediabunny + WebCodecs, one streaming pass)

| Recording                   | Wall time | Speed            | 16 kHz PCM kept | JS heap after |
| --------------------------- | --------- | ---------------- | --------------- | ------------- |
| 2 min 720p                  | 0.35 s    | ≈ 340× real time | 7.7 MB          | 12 MB         |
| 37 min 1080p (817 MB file)  | 6.6 s     | 333×             | 141 MB          | 165 MB        |
| 60 min 1080p (1.34 GB file) | 10.8 s    | 333×             | 230 MB          | 266 MB        |

### Speech-recognition model download and load

| Model / variant                                     | Download | First load (download + init)       | Warm load (OPFS cache)                             |
| --------------------------------------------------- | -------- | ---------------------------------- | -------------------------------------------------- |
| CrisperWhisper 2.0 Turbo fp16 (WebGPU)              | 1.76 GB  | 114 s (~15 MB/s from Hugging Face) | **3.7–4.9 s** (files 2.2–2.6 s, session 1.4–2.3 s) |
| CrisperWhisper 2.0 Turbo q4 enc / fp16 dec (WebGPU) | 906 MB   | 30 s (~30 MB/s)                    | 5.0 s                                              |
| CrisperWhisper 2.0 Turbo q4 / q4 (WASM)             | 1.02 GB  | 32 s                               | —                                                  |
| Whisper Small fp16 (WebGPU)                         | 488 MB   | 21 s                               | —                                                  |
| Whisper Base fp16 (WebGPU)                          | 149 MB   | 6.2 s                              | —                                                  |

Before switching to OPFS, the Cache API failed to store the ~450 MB files, so every "cached" load
re-downloaded (28 s). Download speed depends on the Hugging Face CDN and your connection.

### Transcription

| Model (backend)                             | Recording | Wall time | **Speed**      | Words | Fillers / cut-offs / events |
| ------------------------------------------- | --------- | --------- | -------------- | ----- | --------------------------- |
| CW 2.0 Turbo fp16 (WebGPU)                  | 2 min     | 16 s      | 7.4× real time | 339   | 15 / 5 / 2                  |
| CW 2.0 Turbo q4/fp16 (WebGPU)               | 2 min     | 33 s      | 3.6×           | 338   | —                           |
| CW 2.0 Turbo fp16 (WebGPU)                  | 37 min    | 5.7 min   | **6.5×**       | 5,387 | 326 / 29 / 35               |
| CW 2.0 Turbo fp16 (WebGPU)                  | 60 min    | 9.4 min   | **6.4×**       | 8,915 | 529 / 49 / 52               |
| CW 2.0 Turbo q4/q4 (**WASM, CPU only**)     | 2 min     | 95 s      | **1.27×**      | 338   | 15 / 5 / 2                  |
| Whisper Small fp16 (WebGPU), _not verbatim_ | 2 min     | 11 s      | 10.5×          | 303   | **0 / 0 / 0**               |
| Whisper Base fp16 (WebGPU), _not verbatim_  | 2 min     | 6 s       | 20×            | 284   | 0 / 0 / 0                   |

Where the time goes (CW Turbo, WebGPU fp16): encoder ≈ 1.25–1.7 s per 30 s window (q4 encoder:
2.2 s); decoder ≈ 16–20 ms per token. On CPU: encoder ≈ 11 s per window, decoder ≈ 52 ms per token.

Long recordings cost more per minute than the 2-minute clip because of the skipped-speech recovery
in MODEL.md: on the 60-minute file, 44 of 139 windows were re-decoded without context and 23 got
a shifted-window retry. Before those fixes the 37-minute file ran at 8.8× but produced ~380 fewer
words (real speech that would otherwise look like silence).

Verbatim check, same passage: Whisper Small wrote _"…it looked like you, the two of you suddenly
stopped doing everything…"_; CrisperWhisper wrote _"[UH] … it looked like you the two of you
suddenly stopped doing any- doing everything…"_.

Timestamp quality: no ground-truth timings exist for this audio, so word-boundary error was not
measured (upstream reports ~30 ms on TIMIT for the unquantised model). Checked here: timestamps
are monotonic, no duplicated 4-grams occur at any of the 84 window seams of the 37-minute file,
and no word is placed beyond the end of the audio.

### Export (decode → retime → re-encode H.264 + AAC, streamed to OPFS)

| Recording            | Kept   | Cuts | Wall time | Speed  | Output  | Video bitrate               |
| -------------------- | ------ | ---- | --------- | ------ | ------- | --------------------------- |
| 12 s 640×360 fixture | 7.4 s  | 4    | 0.3 s     | 20–25× | 0.6 MB  | 0.5 Mbit/s                  |
| 2 min 720p           | 117 s  | 10   | 8 s       | 14.7×  | 23.7 MB | 1.5 Mbit/s                  |
| 37 min 1080p         | 36 min | 93   | 4.7 min   | 7.6×   | 802 MB  | 2.8 Mbit/s (matches source) |
| 60 min 1080p         | 59 min | 129  | 7.7 min   | 7.6×   | 1.31 GB | 2.8 Mbit/s                  |

Export runs alongside the editor (worker); memory stays flat because frames stream through the
encoder and the file streams to disk. Note: the test pattern is high-entropy video; typical talking-head
footage encodes faster.

### Memory

Browsers do not expose GPU memory, and `performance.memory` (JS heap) is Chromium-only. Measured JS
heap: ≈ 300 MB for a 37-minute project after transcription and export, ≈ 490 MB for 60 minutes. The
dominant term is the 16 kHz PCM (230 MB/hour), kept so the recording can be re-transcribed without
decoding again. Model weights live in GPU memory: roughly the download size × 1.3–1.5 (estimate shown
in the model panel).

## Reproducing on another machine (e.g. Windows + NVIDIA)

```bash
cd pages/Silence-Cutter
npm install
npm run fixtures -- --bench-long     # downloads the NASA audio (88 MB), builds 2/37/60-min videos (~2.3 GB)
npm run build:bench                  # production build with CrisperWhisper enabled
npm run bench -- --file fixtures/local/apollo-2min-720p.mp4 --model crisperwhisper-2-turbo-hq
npm run bench -- --file fixtures/local/apollo-60min-1080p.mp4 --model crisperwhisper-2-turbo-hq
npm run bench -- --file fixtures/local/apollo-2min-720p.mp4 --model crisperwhisper-2-turbo --backend wasm --skip-export
```

On Windows the script launches Chrome with `--use-angle=d3d11`; pass `--channel msedge` to use Edge
and `--headed` to watch. Each run writes `bench-results/<time>-<platform>-<model>-<backend>.json`.
The editor's **Diagnostics** panel shows the same metrics for an interactive session ("Copy as JSON").
