# Spoken tutorials: implementation and validation

Implemented 27 October 2026 against `speech-subtitle-tutorials.plan.md`.

## Using the feature

Open **Tutorial** in a world, press **F8** on desktop, or choose **Open narrated tutorial** in Help. The menu offers:

- **Prepare voice:** generate the short starter guide locally using Kokoro. An opaque preparation screen suspends world rendering and blocks world input. First use downloads model resources; preparation is cancellable.
- **Start with cached voice:** play prepared clips without loading a model. Missing clips deliver text instead of starting inference during gameplay.
- **Start with device voice:** explicitly select an installed local browser/OS voice, when available. Remote voices are excluded. Missing local voices or speech errors fall back to text.
- **Start with text:** no model or speech-resource downloads.
- Replay, skip, close, subtitle visibility/size, disable tutorials, and clear saved speech.

The introductory lessons cover movement, opening the hotbar, selecting Walls, and finding Help. Keyboard and touch wording differ. Action lessons progress from actual local player/UI state; narration ending alone does not satisfy them. An already satisfied condition, such as Build Mode already being enabled, completes automatically. Completion/skip history and personal settings are saved separately from world data. Explicit Start replays the guide.

The Settings menu includes Tutorials & subtitles and a Narration volume under Audio. Master volume and mute apply to generated speech. Subtitles are transparent text with a shadow, placed above the occupied hotbar/utility region. Installed voices use start/end callbacks; generated clips use the audio output timeline. Pauses, help/settings overlays, tab hiding, replay, and world teardown cancel narration; resuming replays the current short lesson.

## Shared foundation

`src/lib/game/speech/` contains speaker/voice profiles, discriminated scripted/dynamic requests, a dedicated synthesis worker, a bounded cache, optional local OS speech, and playback/subtitle coordination. The tutorial controller is a consumer of this service.

Only the tutorial narrator ships as content. Future characters can supply their own speaker/profile and final text; subtitle events retain the request and speaker identity. Requests are copied before asynchronous playback so later caller mutations cannot change the voice mid-request. Dynamic requests carry conversation/turn identifiers and expiry, use session-only generated caching when prepared, and fall back to text when audio is unavailable. Foreground playback uses a latest-request-wins interruption policy. No live dialogue generator or multiple-character gameplay is included in this initial release.

## Performance policy

No configuration is qualified for neural inference during gameplay. `prepare()` requires an explicit render-suspension predicate, and checks it before starting work. The UI holds that suspension until generation ends or the worker is terminated. Generation uses one WASM inference thread; no GPU inference is enabled. Worker termination releases the model before returning to gameplay.

A browser-wide preparation lock prevents multiple tabs from preparing concurrently. Hidden tabs cancel preparation. A timeout, skipped preparation, cancellation, or missing audio never triggers background retries during gameplay. Preparing is optional and is intentionally initiated by the player rather than automatically at every world launch.

Playback reads at most a bounded phrase at a time, updates caption text only at cue transitions, and does not regenerate missing clips. HUD position measurements follow relevant layout changes rather than the game render loop. Tutorial completion samples local state at 4 Hz.

The adaptive live-inference scheduler and runtime qualification matrix remain disabled/unimplemented until real target-device qualification is completed. This is the conservative release branch specified by the plan, rather than a claim that a worker makes concurrent inference safe.

## Cache and resource behavior

- The model is pinned to Hugging Face commit `1939ad2a8e416c0acfeecc08a694d14ef25f2231`; `kokoro-js` is pinned to 1.2.1 and Transformers.js to 3.8.1.
- Models and voices use application-owned, versioned Cache Storage names. Generated audio/cues use the separate `forest-drift-speech-v1` IndexedDB database (schema version 2; existing version-1 clips are preserved). Clearing speech never touches world saves.
- Every generated phrase is one atomic record containing text, PCM, duration/sample rate, schema, and synthesis identity. Timing/payload shape mismatches are rejected as misses.
- Generated memory cache: 4 MiB / 64 clips. Persistent generated-clip cache: 24 MiB / 256 clips. One phrase: at most 48 characters and 18 seconds. One preparation set: at most 32 phrases. Runtime request text: at most 1,200 characters.
- Memory eviction uses recency; persistent eviction uses recorded usage timestamps, updated on generated writes. Cache reads do not rewrite full PCM records during gameplay. Consequently persistent recency is approximate across sessions; this favors bounded playback cost.
- Dynamic clips are not persisted by default. Cache eviction or unavailable storage leaves text mode usable. Saved clips play independently of the model cache.
- Clearing serialized speech writes waits for preparation ownership and removes all application speech model/voice cache versions. Browser HTTP caching of application runtime assets is managed by the browser separately.
- The model/voice cache is not a general asset repository: this release uses one pinned model and narrator. There is no claim of a fixed inference RAM ceiling; model allocations occur only in the suspended preparation phase and are released by terminating the worker. Benchmark peak model memory before expanding supported devices/voices.

Third-party notices and source references are in `static/speech-licenses/`. First preparation needs network access; inference itself sends no tutorial text to a speech service.

## Validation performed

- Production build succeeded, including the module-format synthesis worker and static-site output.
- Svelte/TypeScript checking: zero errors and warnings.
- Full Vitest run: **196 files, 2,412 tests passed**.
- Targeted lint and formatting checks passed.
- Real Chromium browser tests passed: text-only guide with zero model requests; actual model download/generation and subtitle playback; second preparation with zero model requests; transparent two-line touch subtitles at 390 × 844 and maximum font size.
- Unit coverage includes cache bounds/corruption/clear races, scripted versus dynamic persistence, expired turns, speaker labels, cancellation after asynchronous reads, local-only OS voice selection, and rejection of preparation without world suspension.

Hardware-backed Chromium, high graphics, fixed test world, 600 foreground frames per sample:

| Run | Baseline median / p99 | Active text tutorial median / p99 | Frames over 18 ms: baseline / tutorial |
| --- | --- | --- | --- |
| First sample pair | 16.7 / 17.7 ms | 16.7 / 17.7 ms | 0 / 0 |
| Repeated sample pair | 16.7 / 17.6 ms | 16.7 / 18.4 ms | 2 / 11 |

These samples show approximately 60fps median cadence. The repeated sample does **not** satisfy every strict admission threshold in the plan, and the automated performance test is diagnostic, not an inference-qualification switch. No device has been admitted for live neural synthesis. The software-rendered browser run was substantially slower even without inference; it is useful for functional checks, not hardware FPS claims.

## Remaining qualification boundaries

A ten-minute thermal soak, actual mobile hardware, Firefox/Safari coverage, audio-output/Bluetooth latency recordings, and listening review of every voice/content variant are still required before claiming the full device/timing release matrix. The 150 ms subtitle target has not been measured against physical audio output in this implementation session. The existing runtime degrades to cached playback or text and never enables concurrent neural generation based on these short tests.

Future dialogue integration should add explicit conversation queue/priority policies, broader voice-asset limits, pronunciation review, and qualified live generation. No MP3/WAV authoring/upload workflow was added because local TTS is working.

## Follow-up implementation review — 27 October 2026

Fixed the following concrete issues:

- An old cancelled playback could clear a newer request's caption after its playback promise resumed. Caption updates are now guarded by playback ownership.
- Finished phrase captions stayed visible while the next clip was being fetched. They now clear at the audible phrase boundary, and audio output timestamps are extrapolated to display time without counting device latency twice.
- Playback interruption/watchdog expiry previously returned successful completion. It now produces text fallback, cleans up callbacks, and does not silently claim the phrase was spoken. Native speech gets a start-event watchdog and dynamic-turn expiry cancellation.
- Cache eviction deserialized each stored PCM payload just to read its byte count. Schema version 2 adds an IndexedDB key-only eviction index, preserving existing clips. Only small metadata records enter JavaScript during eviction; clip-count limits also bound metadata growth.
- A blocked cache schema upgrade could stall playback indefinitely. It now uses memory/text fallback while an old tab holds the database. Restricted storage/channel access and disposed cache instances are handled safely.
- Clearing saved speech now invalidates other tabs' warm caches when BroadcastChannel is available. Invalid reads no longer issue a separate delete that could race a newer write, and text/key mismatches are rejected.
- Removed a redundant full PCM copy during AudioBuffer creation. HUD observers are scoped to occupied controls and disconnected outside active tutorials; idle guide steps no longer sample player position.
- Text-only startup no longer creates/resumes an AudioContext. Delayed audio-unlock completions cannot restart a closed or replaced guide. Preparation snapshots voice/text before awaiting the cross-tab lock, and timeout failures retain their actual error message.

Regression coverage now includes playback ownership, delayed cache reads between cues, audio interruption/watchdog cleanup, native voice expiry, v1 cache migration, blocked upgrades, cross-tab clearing, restricted browser storage, and metadata-only eviction. All 2,412 unit tests passed; the final targeted speech run passed 31 tests. Type checking and targeted lint passed. Production browser checks passed for real Kokoro generation, warm cache reuse, tutorial progression, and touch layout.

Additional hardware-backed Chromium samples, 600 frames per phase:

| Measurement | Baseline median / p99 | Feature median / p99 | Frames over 18 ms: baseline / feature |
| --- | --- | --- | --- |
| Active text tutorial | 16.7 / 18.7 ms | 16.7 / 18.7 ms | 112 / 110 |
| Cached PCM playback and caption changes | 16.7 / 18.1 ms | 16.7 / 18.1 ms | 7 / 12 |

The second test seeds valid silent PCM fixtures and exercises real IndexedDB reads, AudioBuffer creation, Web Audio playback, and cue clocks without inference/network variability. It made zero model requests. Real generated narration was separately exercised in the model browser test.

Median cadence remains approximately 60fps, with unchanged p99 in these paired samples. These short measurements do not satisfy every strict device-admission threshold or prove universal smoothness; baseline jitter and missed-frame counts remain recorded rather than hidden behind an average. Neural inference remains prohibited during gameplay, and the broader device/thermal/audio-output qualification boundaries above still apply.

### Guided narrator setup

The setup dialog now presents three numbered steps: prepare the local voice, test a
spoken sample, then start the tutorial. It explains the initial download and wait,
reusing saved clips on later visits, and the pause during preparation. Spoken start
and the sample remain disabled until preparation succeeds in the current session;
returning players run the cache-first preparation check. A muted/zero-volume game
shows an explicit explanation and an Enable narrator sound button. Browser/device
volume checks remain visible, and failed audio activation keeps setup open with a
retry message. Text and installed-device voice remain available as alternatives.
The preview uses existing cached playback, cancels on leaving setup, and does not
start inference. Cache clearing invalidates setup readiness.

### Long-operation feedback

Narrator setup shows overall ready/reused clip counts and a separate current-file
transfer bar, bytes, average observed transfer rate and approximate file ETA when
the size is known. Cached asset reads are explicitly included in transfer stats;
this is not an estimate of total preparation time. Missing/changing file lengths
stay indeterminate. Runtime loading, generation, saving, sound testing and cache
clearing show activity and elapsed time without fabricated percentages. A quiet
stage shows time since the last update and a possible-delay warning after 20s,
not a claim that the worker has crashed. Transfer ETAs disappear after 10s without
updates. Preparation errors remain visible and cancellation permits retry.
Worker progress messages are throttled to four per second during transfers; the
UI clock runs once per second only during operations. Worker inactivity times out
after three minutes, reset by progress so slow active downloads can finish.

### Rapid tutorial navigation

F7/F9 transitions invalidate pending narration completions before changing lessons.
Completion prompts use the lesson captured when playback began. Retired audio
frames and device-voice start events cannot alter current playback or captions.
Audio cancellation stops the old source before a replacement starts; late cache
reads remain guarded by playback identity. Automatic action completion now waits
for narration to finish, while explicit navigation still interrupts immediately.
Regression tests cover rapid replacement, out-of-order cache reads, queued stale
callbacks, and real-model F9/F7/F9 navigation with matching subtitles.

Spoken phrases always display their synchronized captions, including the setup
sound sample. The subtitle preference now controls keeping the instruction visible
after narration ends; text fallback remains visible regardless of that preference.

### Expanded building script

Version 2 contains 28 ordered lessons, starting with looking around, then walking,
the hotbar, and slots 1–8 with individual subtool instructions. Building lessons
wait for Continue/F9 so players can practise; selecting a tool does not count as
placing a piece. See `src/lib/game/tutorials/README.md` for authoring instructions.
The script and subtitles share `tutorials.ts`. The preparation cap is now 192
phrases and the persistent audio budget is 64 MiB (still 256 clips); in-memory
playback remains capped at 4 MiB. Old text-keyed clips are reused where applicable.
Both input variants are checked against preparation limits in tests.

### Rolling preparation (supersedes full-guide pre-generation)

Initial setup prepares only three instructions and retains the loaded worker.
During play, SpeechWindow serially prepares the current instruction plus two ahead,
reuses cached phrases, and checks for a changed target after each phrase. It never
queues the whole guide. A selected uncached instruction shows a buffering status
and starts automatically when its paired audio/cues are ready. Explicit Continue,
F9 and gameplay completion still control moving between instructions.

Background inference is now explicitly authorized, separate from paused initial
setup. It uses the same single-threaded WASM worker with a 100ms yield between
phrases. New synthesis backs off for one second after a rendered frame exceeds
24ms; menus/hidden states pause scheduling. An already-running WASM phrase cannot
be cooperatively interrupted, so this reduces contention but does not guarantee
60fps on all devices. Closing the guide releases the worker; old playback and
late readiness results cannot take over a newer navigation request. Errors offer
text fallback and Options for retry, instead of leaving the guide stuck.

Rolling-buffer validation: 43 speech/tutorial unit tests passed; Chromium GPU tests
passed initial-three setup, rapid F7/F9 retargeting, an uncached sixth instruction
that automatically played after buffering, cached setup reuse and mobile/text UI.
A 240-frame hardware sample measured baseline median 16.7ms / p99 18.5ms versus
background synthesis median 16.7ms / p99 18.1ms; neither sample had frames over
20ms. This is one machine/configuration, not a universal frame-rate guarantee.

### One-key auto start

F6 opens speech options. F8 (or Auto tutorial) unlocks audio from the user gesture,
starts the rolling producer without opening setup, and plays as soon as the first
instruction is ready. Model downloads and preparation status appear in small,
background-free text in the subtitle area. Repeated F8 presses during startup do
not restart work. F7/F9 retain navigation; F6 interrupts speech to show options.
Muted narration gets an explicit message directing the player to F6. The manual
three-instruction preparation and sound test remain optional in speech options.

Auto mode now advances after the current instruction's speech ends, including
replayed instructions reached with F7. F9 still interrupts and advances immediately.
Only the current playback completion can advance; cancellation, buffering, menus
and text fallback do not trigger an automatic skip. Manual setup/text mode retains
its previous Continue/gameplay-driven behavior. At the final instruction, auto
mode ends normally. Hearing an action lesson does not mark its action completed.

### Buffer resilience review

Window requests now snapshot their text/voice settings. Retargeted waiters are
cancelled even if their caller misses an invalidation, and old failures/read results
cannot poison a newer window. Ready current speech is released before lookahead
storage finishes. Reads have a 15-second deadline and are abandoned immediately
on navigation/disposal. Network/download and cross-tab contention failures retry
at most twice with a short yield-based delay; permanent failures remain explicit.
Tests cover stale errors, hung reads, disposal, bounded retry exhaustion and
current-first readiness in addition to rapid playback replacement.
