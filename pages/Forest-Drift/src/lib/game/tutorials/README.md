# Editing the tutorial

Edit `tutorials.ts` in this folder. The ordered entries in `lessons(touch)` are the
script: changing a `guide('stable-id', 'Spoken words here')` entry changes both
narration and subtitles. Move entries to reorder the guide. Keep IDs unique and
stable, and increment `TUTORIAL_VERSION` when changing the sequence or meaning.
There is currently no in-game script editor.

Narration uses [Phonon 31m English](https://huggingface.co/gradium/phonon-31m-en)
with its default voice, through `phonon-tts` 0.6.0's public raw WebAssembly API.
The q8 model revision is pinned in `../speech/types.ts`. Inference runs on one CPU
worker with standard SIMD (including Safari/iOS); no GPU, server or API key is needed.
First preparation downloads the model, tokenizer, config and voice from Hugging Face.
The page saves these assets in IndexedDB so they survive worker termination and
reloads in WebKit, including contexts with an ephemeral Cache API. Future preparation
can use them offline. Cache clearing removes both assets and generated clips.
Preparation removes obsolete model downloads and clips from the retired engine,
while preserving current Phonon clips. Existing users prepare the new voice once. The runtime is MIT/Apache-2.0; the model is Apache-2.0.

- `guide(...)` waits for Continue/F9. Use this for building practice so selecting a
  tool never falsely counts as successfully placing a piece.
- The movement lesson uses `action: 'move'` and advances after walking two metres
  and finishing its narration.
- `touch` selects mobile instructions. `select`, `place`, `customise`, and `variant`
  supply the correct wording for each input method. Numbers are spelled out for
  the voice; the corresponding digit key selects that hotbar slot.
- Keep sentences short. The speech system sends complete sentences to Phonon and synchronizes their
  clips automatically; do not write a separate subtitle track or record audio.
- After editing, use F8 for automatic preparation and playback, or open Speech
  options with F6 and use Prepare voice. Auto mode starts after the first
  instruction is ready. With manual setup, the first three instructions
  are prepared upfront; the current instruction plus two ahead are prepared during
  play. Current speech preparation continues on slow devices; only lookahead yields
  to the game's frame budget. Replay and navigation resume audio suspended by the
  browser. Changed text gets new cached audio; unchanged text can reuse existing clips. Text-only mode reflects
  the script immediately after the app reloads.
- Run `npx vitest run src/lib/game/tutorials src/lib/game/speech` and `npm run check`.
  The script test checks phrase limits, unique IDs and the preparation budget.

The guide covers mouse look, movement, the hotbar, foundation, all wall variants,
doors/windows/beams, ceilings/floors/roofs, stairs, all floor-detail variants,
shovel, objects, and finishing tools. Tool descriptions should stay consistent
with `../building/FoundationTypes.ts` and the tool implementations.

## Speech verification

```sh
npm run check
npx vitest run
FOREST_SPEECH_MODEL=1 FOREST_SPEECH_PERF=1 FOREST_DRIFT_GPU=1 npx playwright test tests/tutorials.e2e.ts tests/speechControls.e2e.ts tests/speechAutoStart.e2e.ts tests/phonon.e2e.ts
FOREST_SPEECH_POINTERLOCK=1 FOREST_DRIFT_GPU=1 npx playwright test tests/speechPointerLock.e2e.ts --project=chromium
FOREST_SPEECH_FULL=1 FOREST_DRIFT_GPU=1 npx playwright test tests/speechAutoStart.e2e.ts --project=chromium --grep 'entire tutorial'
```

The model tests generate all 187 distinct sentences from both the desktop and touch
scripts using the production worker in Chromium, WebKit and Firefox. They check
finite, non-silent 24 kHz audio within the clip budget, then reload with external
network requests blocked and check deterministic regeneration from saved assets.
External requests are restricted to model-file downloads; text and generated audio
stay on the device. These checks require the initial model download.

The UI tests cover F6 (options), F7 (previous), F8 (automatic start), F9 (next),
Escape, modifier/repeat/typing guards, native pointer lock, sample playback, replay,
manual and automatic advancement, configurable pauses, cancellation and retry,
background preparation, hidden-tab interruption, subtitles and touch layout,
mute recovery, persisted preferences, disabling tutorials and clearing speech.
Automatic-start checks cover slow rendering, interrupted downloads, offline reuse,
recovery from a suspended audio context, and touch download cancellation/restart.
The full-run opt-in starts with one click and plays all 28 instructions
at normal playback speed with no subsequent input; allow several minutes.
The native pointer-lock check uses a visible browser because the headless shell
rejects native pointer lock. Unit tests also exercise narration gain, local-only
OS voice fallback, expired dynamic turns, cache limits and cross-tab coordination.

`FOREST_DRIFT_GPU=1` enables the native Metal renderer on macOS for frame-pacing
measurements. It has no effect on Phonon's single-worker CPU inference.
