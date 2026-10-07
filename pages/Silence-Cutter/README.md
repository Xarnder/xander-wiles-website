# Silence Cutter

**Remove the silence, not the speech.** A browser-based editor that removes silence from spoken
MP4/MOV video (talks, interviews, podcasts, presentations, meetings), with **everything processed
locally**: decoding, silence detection, verbatim speech recognition, preview and export.

Live at `/pages/Silence-Cutter/` on the main site. Built with SvelteKit 3 + Svelte 5 (TypeScript),
Mediabunny/WebCodecs and Transformers.js/ONNX Runtime Web.

- [ARCHITECTURE.md](ARCHITECTURE.md): design, data flow and technical-spike results
- [MODEL.md](MODEL.md): ASR candidates, verbatim accuracy and licensing trade-offs
- [PERF.md](PERF.md): benchmarks and how to reproduce them on your hardware

## How it works

1. **Drop an MP4 or MOV.** The file is read in place from disk (never copied or uploaded).
2. **Audio analysis (Analysis A).** A worker decodes the audio with WebCodecs, downmixes and
   resamples it to 16 kHz, and builds an RMS envelope and waveform peaks in a single streaming pass.
   A hysteresis gate with attack, release and minimum-speech settings finds speech regions.
3. **Verbatim transcription (Analysis B).** On-device ASR produces every spoken token with word
   timestamps, _including_ `[UM]`, `[UH]`, repetitions, stutters, false starts and cut-off words.
   Each token's time span counts as speech; only the gaps between tokens are candidate silence.
4. **Combine.** _Conservative_ (default) cuts only where both detectors hear silence;
   _Aggressive_ cuts where either does; _Audio_ and _Transcript_ use one detector. Lead/trail
   padding and the minimum silence length are applied live, without re-running ASR.
5. **Edit.** Every automatic decision can be overridden: click a hatched cut to keep it, select a
   retained pause in the Detail track and delete it, drag boundaries (Trim tool), select ranges, split/merge, undo/redo. Manual edits
   are stored separately and survive parameter changes ("Reset to automatic" discards them).
6. **Preview.** _Edited_ mode plays the original file and skips removed regions, with the same
   audio fades as the export. Nothing is rendered to preview.
7. **Export.** Kept ranges are snapped to the frame grid and re-encoded to MP4 (H.264 + AAC where
   the browser supports it) with click-free audio joins, streamed straight to disk.

## Privacy and local processing

| Data                              | Where it goes                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Video file                        | Read from disk by this tab. Never uploaded. The site has no upload endpoint and no server code.       |
| Decoded audio, waveform, envelope | Memory of this tab (workers); envelope/peaks also in IndexedDB for reopening.                         |
| Transcript, edits, settings       | IndexedDB in this browser only.                                                                       |
| Exported video                    | Written directly to the file you choose, or to the browser's private file system and then downloaded. |
| AI model weights                  | Downloaded from `huggingface.co` on first use, cached in the browser's private file system (OPFS).    |

- **No telemetry or analytics** of any kind.
- A **Content-Security-Policy** (`security-headers.json`, mirrored in the site's `vercel.json`) limits
  network connections to this origin and Hugging Face, so the browser itself blocks sending data
  anywhere else.
- The UI says _"Downloading speech recognition model to this device"_ while weights download and
  _"Model cached locally"_ afterwards, so a model download is never mistaken for a video upload.

## Getting started

```bash
cd pages/Silence-Cutter
npm install
npm run dev            # CrisperWhisper is enabled in dev; open the printed URL
```

| Script                | Purpose                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`         | Dev server (cross-origin isolated)                                                                                 |
| `npm run build`       | Production build into `dist/` (CrisperWhisper **disabled** unless `CRISPERWHISPER=enabled`)                        |
| `npm run build:bench` | Production build with CrisperWhisper enabled (tests and benchmarks)                                                |
| `npm run check`       | `svelte-kit sync` + `svelte-check` (TypeScript)                                                                    |
| `npm run lint`        | Prettier + ESLint                                                                                                  |
| `npm run test:unit`   | Vitest unit tests (detectors, EDL, time mapping, ASR algorithms, resampler, export planning)                       |
| `npm run test:e2e`    | Playwright end-to-end tests with the **mock** ASR engine (no model download)                                       |
| `npm run test:asr`    | Opt-in Playwright test with a **real** model (`ASR_MODEL`, `ASR_FILE`)                                             |
| `npm run fixtures`    | Regenerate the synthetic test fixtures (`-- --bench`: 2-min real-speech clip; `-- --bench-long`: 37/60-min videos) |
| `npm run bench`       | Benchmark harness in real Chrome; writes JSON to `bench-results/` (see PERF.md)                                    |

The editor is served at `/`; the technical-spike/benchmark harness at `/spike/`. Append `?asr=mock`
to use the deterministic mock engine.

### CrisperWhisper licence flag

CrisperWhisper 2.0 weights **and their outputs** are licensed for non-commercial research only (see
MODEL.md). They are never bundled; the browser downloads them from Hugging Face. The engine is offered
only when enabled at build time:

```bash
CRISPERWHISPER=enabled npm run build
```

On Vercel, set `CRISPERWHISPER=enabled` in the project's environment variables if your use qualifies
(non-commercial, or you hold a commercial licence from nyra health). When enabled, users must also
tick a licence acknowledgement before the first download. Without the flag, only the MIT-licensed
Whisper models are offered, clearly labelled **not verbatim**.

## Deployment (static / Vercel)

The app is a fully static SvelteKit build (`adapter-static`, relative asset paths). The site's root
`build.js` installs and builds it and copies `dist/` to `deploy_out/pages/Silence-Cutter/`. Required
response headers for `/pages/Silence-Cutter/*`, already configured in `vercel.json` and `serve.json`:

- `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
  (cross-origin isolation for multi-threaded WASM inference)
- `Content-Security-Policy` from `security-headers.json` (restricts network access)

Without cross-origin isolation the app still works; CPU (WASM) inference just runs single-threaded.

## Editing by hand

Automatic cuts are only a starting point. Every edit is undoable, shows a confirmation with an
**Undo** button, and survives changes to the detection settings.

| To…              | Mouse                                                                              | Keyboard                                                      |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Select a segment | Click it in the **segment strip** (top lane)                                       | `[` / `]` previous/next cut · `{` / `}` previous/next segment |
| Select a range   | Drag on the waveform (snaps to words, cut edges, playhead; hold **Alt** to bypass) | **I** / **O** set in/out at the playhead · **⌘/Ctrl+A** all   |
| Select words     | Click/drag words in the timeline or the transcript; **Shift**-click extends        | —                                                             |
| Remove (delete)  | Selection bar **✂ Remove**, right-click menu, or double-click a speech segment     | **Delete / Backspace / X / R**                                |
| Keep / restore   | Click a hatched cut, selection bar **Keep**, right-click menu                      | **U** (also restores the cut under the playhead)              |
| Cut (split)      | Right-click → _Split here_                                                         | **S** or **C** at the playhead                                |
| Cut a kept pause | Click its grey piece in the Detail track, then Delete                              | **T** at the playhead                                         |
| Adjust           | Drag a selection edge; switch to the **Trim** tool to drag cut edges               | **Alt+←/→** nudge selection                                   |
| Check a join     | Toolbar **▶ Preview cut** (2 s either side, Edited mode)                           | **P** · **Shift+Space** play selection                        |

Also: **Space** play/pause · **J/K/L** shuttle · **E** Original/Edited · **←/→** frame step
(Shift: 1 s) · **↑/↓** previous/next cut edge · **Z** zoom to selection · **+/−/0** zoom ·
**N** snapping · **Esc** clear · **⌘/Ctrl+Z** undo · **⌘/Ctrl+Shift+Z** redo · **?** all shortcuts.
_K_ is "pause" in the J/K/L convention, so keep/restore is **U** (or Shift+K).

Every block in the segment strip is its own segment: pieces you create with Split, and cuts you make
yourself, are clicked, selected, restored and stepped through (**[ ]**) individually, even when they
sit right next to another cut. Automatic cuts that differ only by which detector found them are shown
as one block.

**Two mouse tools** (toolbar, or **V** / **B**) so selecting never moves a cut by accident:

- **Select (V)**, the default: click segments, drag to select ranges, drag the selection's edges.
  Cut edges never move.
- **Trim (B)**: drag the nearest cut edge (grab zone ±24 px, grips shown on every edge). Clicks
  only move the playhead; nothing is selected. A yellow badge shows while it is on.

**Two tracks at the top.** **Segments** shows the large blocks (green kept, cuts in the colour of
their main detector, yellow your edits); clicking selects the whole segment (or restores a cut).
**Detail** underneath splits the same timeline by detector agreement; clicking selects just that
piece (padding, a disagreement, one detector's part of a cut) without changing anything, so you can
then press Delete or U on exactly that part. Shift-click extends the selection in either track.

**Colour key** (shown under the timeline, hover an entry for details):

| Colour                          | Meaning                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| Green                           | Kept: the noise level and the transcript both hear speech          |
| Pale green + blue / purple bar  | Kept, detectors disagree (bar = which one heard silence)           |
| Grey                            | Kept pause or padding (both hear silence, but too short / padding) |
| Green with yellow dashed border | Kept by you                                                        |
| Red                             | Cut: both detectors agree it is silence                            |
| Blue stripes                    | Cut: only the noise level says silence                             |
| Purple                          | Cut: only the transcript says silence                              |
| Yellow                          | Cut by you                                                         |

The detector lanes use the same colours (blue = noise level, purple = transcript). Before
transcription only the noise level votes, so automatic cuts are blue.

Other conveniences: padding presets (Natural / Balanced / Tight), your last settings are reused for
new projects ("Reset all settings" restores defaults), a zoom scrollbar under the timeline (drag the middle to scroll, drag either end to zoom; also
keyboard-operable), contextual hints when hovering the timeline, and a warning before closing the tab while
transcription or export is running.

### Side-car exports

Besides the MP4, the Export section writes files for the **edited** video: subtitles (`.srt`,
`.vtt`, timed to the edited timeline, removed words dropped), the retained transcript (`.txt`),
and edit decision lists — CMX 3600 (`.edl`, to rebuild or refine the edit in Premiere Pro /
DaVinci Resolve) and JSON (source times in seconds).

## Browser compatibility

Feature detection only; no browser-name checks. The Diagnostics panel shows exactly what was detected.

| Capability                                | Chrome / Edge (desktop)                           | Safari 26+ | Firefox                              | Fallback                                                        |
| ----------------------------------------- | ------------------------------------------------- | ---------- | ------------------------------------ | --------------------------------------------------------------- |
| MP4/MOV demux (Mediabunny)                | ✅                                                | ✅         | ✅                                   | none needed                                                     |
| Audio decode (WebCodecs) AAC/MP3/Opus/PCM | ✅                                                | ✅         | ✅ (AAC depends on OS)               | error message suggesting MP4/AAC                                |
| WebGPU inference                          | ✅ (Windows, macOS, ChromeOS; Linux behind flags) | ✅         | ✅ in recent versions                | WASM/CPU (multi-threaded when isolated)                         |
| fp16 shader support                       | most discrete/Apple GPUs                          | Apple GPUs | varies                               | 4-bit/fp32 variants chosen automatically                        |
| H.264 encode (WebCodecs)                  | ✅, hardware where available                      | ✅         | ✅ on Windows/macOS; varies on Linux | HEVC → VP9 → AV1 in MP4                                         |
| AAC encode                                | ✅                                                | ✅         | ❌ in many builds                    | bundled WASM AAC encoder (`@mediabunny/aac-encoder`), then Opus |
| File System Access (save picker)          | ✅                                                | ❌         | ❌                                   | OPFS stream, then download                                      |
| OPFS (model cache, export staging)        | ✅                                                | ✅         | ✅                                   | in-memory buffer                                                |

Primary target: current Chromium on macOS (Apple Silicon) and Windows (NVIDIA/AMD/Intel). All
testing and benchmarks so far were done in Chrome on macOS. The Safari and Firefox columns reflect
those browsers' published API support and the app's fallbacks; they have **not** been tested yet.

## Known limitations

- **Codecs WebCodecs cannot decode** (e.g. ALAC or AC-3 audio in some MOVs, ProRes video in Chrome)
  are reported with a clear message. ffmpeg.wasm is the documented fallback path for these but is
  **not bundled** (≈30 MB WASM, software codecs); converting the file to MP4/AAC first is faster.
- **Export always re-encodes** for frame-accurate cuts. Remuxing without re-encoding is only exact
  when every cut lands on a keyframe (see ARCHITECTURE.md).
- **AAC padding:** the exported audio track can be up to ~70 ms longer than the video track (encoder
  priming/padding). The cut points themselves are frame-exact.
- **Edited preview** jumps the `<video>` element at each cut, so a seek gap of a few tens of
  milliseconds can be audible in preview (masked by the fade). The export is gap-free.
- **CPU-only machines** can transcribe with CrisperWhisper Turbo on WASM: 1.27× real time on an
  Apple M4 CPU (PERF.md), but expect slower than real time on older or low-core CPUs. "Audio" mode
  needs no model at all.
- **Model download size:** the verbatim models are 0.9–1.8 GB. They download once and are cached in
  the browser's private storage. The app requests persistent storage first. If the browser's quota is
  too small (the model panel shows free space and warns), or the browser evicts site data, the model
  is downloaded again next time.
- **Language:** choose the spoken language manually (no automatic detection).
- **Memory:** about 230 MB of RAM per hour of audio is kept for transcription (16 kHz mono PCM),
  plus model memory (PERF.md).
