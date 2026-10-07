# Silence Cutter — architecture & technical spike

> "Remove the silence, not the speech."

This document records the architecture chosen **before** the full editor was built, and the
results of the technical spike that validated it. Benchmarks are in [PERF.md](PERF.md); model
licensing and accuracy trade-offs are in [MODEL.md](MODEL.md).

## 1. Constraints that shaped the design

1. **Never delete actual speech.** Every automatic decision is biased towards keeping audio.
2. **Verbatim transcription.** Fillers, repetitions, stutters, false starts and cut-off words are
   speech and must be transcribed — the transcript is primarily a _speech-presence_ signal.
3. **Everything local.** No media, audio, transcript, waveform or edit leaves the browser. The only
   network traffic is the static site itself and (optionally) model weights from Hugging Face.
4. **Static hosting.** Plain static files (Vercel or any CDN). No server code, no upload endpoint.
5. **Hour-long recordings.** Streaming everywhere; no whole-video buffers; workers for all heavy work.

## 2. Module map

```
src/lib/
├── core/                  Pure, deterministic, unit-tested editing logic (no DOM, no I/O)
│   ├── types.ts           Range, EditRegion (EDL), ManualOverride, Transcript…
│   ├── ranges.ts          Interval algebra (normalize/invert/intersect/union/subtract)
│   ├── audioDetector.ts   Analysis A: RMS envelope + hysteresis gate (attack/release/min speech)
│   ├── transcriptDetector.ts  Analysis B: verbatim tokens → speech; gaps → candidate silence
│   ├── combine.ts         Audio / Transcript / Conservative (∩) / Aggressive (∪) + padding
│   ├── edl.ts             Automatic EDL, manual-override replay, effective EDL
│   ├── timeMap.ts         Source ↔ edited time mapping, frame quantisation for export
│   ├── stats.ts           Edit statistics
│   └── history.ts         Undo/redo
├── asr/                   Pluggable speech recognition
│   ├── types.ts           TranscriptionEngine interface, ModelSpec, progress types
│   ├── models.ts          Model catalogue (sizes, licences, per-backend dtype variants)
│   ├── workerEngine.ts    TranscriptionEngine → asr.worker.ts
│   ├── asr.worker.ts      Transformers.js + ONNX Runtime Web (WebGPU → WASM)
│   ├── crisper/           Port of CrisperWhisper 2.0's MIT-licensed inference algorithms
│   ├── modelCache.ts      OPFS cache for model weights
│   └── mockEngine.ts      Deterministic engine for automated tests
├── media/                 Mediabunny + WebCodecs
│   ├── analysis.worker.ts Demux → decode → mono → 16 kHz PCM + envelope + peaks (one pass)
│   ├── resampler.ts       Streaming windowed-sinc resampler
│   ├── peaks.ts           Waveform peak pyramid
│   ├── exportPlan.ts      Audio join planning (fades, centred crossfades), bitrates
│   ├── export.worker.ts   EDL → MP4 (decode, retime, re-encode, stream to disk)
│   └── client.ts          Main-thread wrappers, save-target selection
└── runtime/               Capability detection, asset paths
```

## 3. Data flow

```
File (stays on disk, read in place via Blob)
  │
  ├─ analysis.worker ─► MediaInfo
  │                   ├► 16 kHz mono Float32 PCM  (the only uncompressed copy; ~230 MB/hour)
  │                   ├► RMS envelope, 10 ms hop  (~1.4 MB/hour)
  │                   └► min/max peaks, 2 ms      (~3.6 MB/hour, pyramid built on demand)
  │
  ├─ asr.worker (PCM transferred, returned afterwards) ─► verbatim words with timestamps
  │
  └─ core (main thread, pure functions, recomputed live on every parameter change)
        envelope ─► audio speech regions ┐
        words    ─► transcript speech    ┴► combined silence (mode) ─► min-silence filter
                 ─► lead/trail padding ─► automatic cuts ─► automatic EDL
                 ─► manual overrides replayed ─► effective EDL ─► time map / stats / preview
                 ─► frame-quantised kept ranges ─► export.worker ─► MP4 on disk
```

Every arrow is a pure transformation. Changing lead/trail/threshold/mode recomputes the chain in
milliseconds without re-running ASR or decoding. Both analyses remain separately available after
combination (they are separate lanes on the timeline).

## 4. Key decisions

### Media: Mediabunny + WebCodecs, not ffmpeg.wasm

Mediabunny demuxes MP4/MOV natively in TypeScript, reads the file lazily from the `File`
(`BlobSource`), and uses WebCodecs for hardware decode/encode. Decoding 2 minutes of AAC takes
≈0.3 s; nothing close to the whole video is ever in memory. ffmpeg.wasm (≈30 MB of WASM, single
threaded, software codecs) is reserved as a documented fallback path for codecs WebCodecs cannot
decode (e.g. ALAC/AC-3 audio in some MOVs) — see "Limitations".

### Export: re-encode, frame-quantised EDL, centred crossfades

Cuts rarely land on keyframes, so frame-accurate trimming requires re-encoding. Kept ranges are
snapped to the video frame grid so audio and video cut on identical instants (no drift).
Audio is re-encoded with short raised-cosine fades at each join (defaults 12 ms in / 20 ms out),
or an optional equal-power crossfade _centred_ on the join using handles borrowed from the
removed material, so the output duration — and A/V sync — is unchanged. Output streams to disk:
File System Access save picker → OPFS → in-memory buffer (last resort).

_Remuxing without re-encoding_ was investigated: it is only exact when every kept range starts on
a keyframe. Snapping cuts outward to keyframes would keep up to a full GOP (often 2–10 s) of
silence per cut, and mixing copied H.264 packets with re-encoded ones requires matching SPS/PPS.
The trade-off is not worth it for a tool whose purpose is precise cuts; re-encoding with the
hardware encoder is fast (see PERF.md).

### ASR: CrisperWhisper 2.0 behind `TranscriptionEngine`, verbatim prompt reproduced exactly

The standard Transformers.js Whisper pipeline cannot express CrisperWhisper's prompt (mode tags
**before** `<|startoftranscript|>`), so `asr.worker.ts` drives `generate()` with explicit
`decoder_input_ids` and ports the upstream (MIT) algorithms:

| Upstream (Python)          | Port                                   | Purpose                                                                                                                        |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `PromptBuilder`            | `buildPrompt`                          | `[verbatim_1..5] (<ctx> … <ectx>)? <sot> <lang> <transcribe> <notimestamps>`                                                   |
| `word_timing.py`           | `crisper/wordTiming.ts`                | Alignment-head attention → sharpened log-probs; mel-energy blank; word-level Viterbi with virtual blanks; 100 ms gap splitting |
| `longform/continuation.py` | `transcribe()` + `crisper/longform.ts` | 30 s windows / 26 s stride, conditional continuation, overlap-aware trailing-word drop, seam monotonisation                    |
| `loop_detection.py`        | `findTokenLoop`                        | Decoder-loop repair (thresholds high enough to keep real stutters)                                                             |
| `fallback.py`              | coverage gate                          | Temperature fallback for collapsed decodes                                                                                     |
| `longform/early_eot.py`    | `recoverEarlyEot`                      | Force past low-confidence premature EOTs                                                                                       |

Cross-attention is captured **inline** by wrapping the model's per-step `forward`; only the
alignment-head average of the last query row (~6 KB/token) is kept, so memory stays flat.

**Additions beyond upstream, motivated by the spike:**

- _Skipped-speech detection._ Speech-active mel frames not covered by any word (gaps ≥ 1.5 s)
  are measured anywhere in the window, not only after the last word.
- _Context reset with gap filling._ With continuation context the model sometimes stopped
  confidently after `[laughter]`, or resumed later in the window, skipping real speech (a 13 s
  question). If ≥ 4 s of speech is uncovered, the window is re-decoded without context and those
  words are inserted only into the gaps of the continuation decode.
- _Shifted-window retry._ A few windows missed a quieter speaker even without context. If speech is
  still uncovered, a fresh 30 s window starting just before the gap is decoded and gap-filled. On a
  37-minute recording these steps recovered ~380 words with no duplicated phrases at any seam.
- _Padding clip._ Words aligned into a window's zero padding (beyond the real audio) are discarded
  as hallucinations, and the loop detector covers units of up to 40 tokens (upstream: 24).
- _Encoder output reuse_ across re-decodes of the same window (repair, recovery, context reset,
  shifted retry reuses only within its own window).
- _Unplaceable words are interpolated_ between neighbours instead of dropped, so every spoken word
  contributes speech time.
- _OPFS model cache_ (the Cache API failed to store ~450 MB entries).

### Runtime selection

WebGPU first (fp16 variants when `shader-f16` is available), WASM/CPU otherwise. ONNX Runtime's
WASM loader and binary are imported with Vite `?url`, so they ship as hashed same-origin assets
(no CDN), and the app is cross-origin isolated (COOP/COEP) so the CPU fallback is multi-threaded. No vendor-specific code:
the same path runs on Apple, NVIDIA, AMD and Intel GPUs.

### Network policy

`security-headers.json` defines COOP/COEP and a Content-Security-Policy whose `connect-src` only
allows this origin and Hugging Face (model weights). It is mirrored in the site's `vercel.json`
and `serve.json`, and applied by `vite preview`, so the e2e tests run under the production policy.
Even a bug could not send media to another host: the browser would block the request.

### Detection modes

Both detectors produce speech regions; silence is their complement.

| Mode                     | Silence =                              | Risk                                             |
| ------------------------ | -------------------------------------- | ------------------------------------------------ |
| Conservative _(default)_ | audio silence **∩** transcript silence | lowest — speech heard by either detector is kept |
| Audio                    | audio silence                          | quiet speech below threshold can be cut          |
| Transcript               | transcript gaps                        | breaths/noise and missed words can be cut        |
| Aggressive               | audio silence **∪** transcript silence | highest                                          |

Each automatic cut is split into pieces labelled by which detectors agree (`both`, `audio`,
`transcript`), which drives colouring and confidence.

### Edit Decision List and manual overrides

The EDL is a contiguous list of `{start, end, action, source, confidence, manual}` regions in
source time. Manual edits are stored separately as an ordered list of _paint_ (`keep`/`remove`
over a time range) and _split_ operations, replayed on top of the automatic EDL. Because they are
absolute and independent of detector parameters, **manual edits survive parameter changes**; the
user can explicitly "Reset to automatic edit". Dragging a boundary records a paint over the
delta. Undo/redo snapshots the (small) override list.

### Preview

_Original_ plays the file unchanged. _Edited_ plays the same `<video>` element and jumps over
removed regions using `requestVideoFrameCallback`; audio is routed through Web Audio so the same
fade-out/fade-in envelope is applied at each jump. No export is needed to preview.

### Project state

`EditorStore` (`src/lib/state/editor.svelte.ts`) is the explicit `MediaProject`. It holds media
metadata, waveform pyramid, envelope, transcript, settings, manual overrides and export settings,
and _derives_ (Svelte runes) audio speech, transcript speech, the cut proposal, the automatic EDL,
the effective EDL, the time map and statistics. No derived array is mutated in place.

### Persistence

Per-file project records in IndexedDB (keyed by name + size + mtime): settings, transcript, word
timestamps, envelope, peaks, manual overrides. Video is never copied into browser storage; where
the File System Access API is available the file handle is stored so reopening needs only a
permission prompt.

## 5. Technical spike results (Apple M4, Chrome, October 2026)

| #   | Requirement                                | Result                                                                                                                                                                     |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Load MP4/MOV locally and decode audio      | ✅ MP4 and MOV via Mediabunny/WebCodecs; 2 min 720p decoded in 0.3–0.4 s; 12 s fixture in 0.2 s                                                                            |
| 2   | Waveform + silence envelope                | ✅ Envelope/peaks built in the same pass; fixture pauses detected exactly (100 ms bridged, 1.8 s split)                                                                    |
| 3   | Verbatim ASR with reliable word timestamps | ✅ CrisperWhisper 2.0 Turbo on WebGPU keeps `[UH]`, `w- which`, `interesting interested`, `this this sta- the statement`, `loner- lunar`; 7.4× real time with fp16 encoder |
| 4   | Cut sections and export a playable MP4     | ✅ H.264 High + AAC-LC; frame-exact video duration; joins verified with ffprobe; 15–25× real time                                                                          |

Issues found and fixed during the spike:

- Continuation-context collapse (missing 13 s question) → context-reset fallback.
- Cache API could not store 450 MB model files → OPFS cache; warm load 28 s → 5 s.
- Encoder dominated runtime (2.2 s/window q4) → fp16 encoder on f16 GPUs (1.25 s) and encoder
  reuse across re-decodes.
- Fractional measured bitrates rejected by WebCodecs → integer rounding (regression test added).
- Vite `server.headers` did not reach SvelteKit pages → middleware plugin for COOP/COEP.

Issues found while hardening long-form ASR after the spike (see MODEL.md): mid-window skipped
speech (context reset + gap filling, shifted-window retry), hallucinated words aligned into window
padding (padding clip).

Not measurable on this machine: Windows + NVIDIA. `npm run bench` produces the same JSON record
on any machine; see PERF.md.
