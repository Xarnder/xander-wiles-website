> Updated implementation decision: initial setup prepares three instructions, then
> an explicitly gated single-worker producer maintains the current instruction plus
> two ahead during gameplay. This supersedes earlier restrictions in this plan on
> all gameplay inference and full-script pre-generation. See the implementation
> note “Rolling preparation” for scheduling, cancellation and performance limits.

# Forest Drift: spoken tutorials and subtitles

Date: 27 October 2026  
Status: initial narrator implementation completed on 27 October 2026. See [implementation and validation](speech-subtitle-tutorials.implementation.md) for delivered behavior, measured performance, and remaining qualification boundaries. This document remains the broader design reference.

Review update: smooth 60fps gameplay takes priority over speech readiness. The performance admission rules below override earlier references to background or idle-time generation: a quiet scene or available worker is not sufficient permission to start inference.

## Recommended direction

Use free, on-device text-to-speech to narrate tutorial instructions, with subtitles generated from the same tutorial text. Prototype Kokoro in a browser worker, then integrate it only after testing speech quality, timing, memory use, and the effect on this game's rendering.

This satisfies the preferred workflow: no recorded MP3/WAV files to create, upload, transcribe, or maintain. Generated audio still exists temporarily as playback buffers and may be cached locally; “no audio files” means no manually managed recordings shipped with each tutorial.

Text-to-speech needs words to speak. Each tutorial therefore has one authored instruction, which supplies both narration and subtitles. The developer can draft this content during implementation; the author does not need to type a second subtitle script. A speech model does not invent accurate instructions or understand game state. Automatic tutorial writing with a local language model is outside this feature.

Prioritize accurate wording, clear presentation, and reliable playback over fast first-time generation. Do not build an upload/transcription system alongside the primary solution. Keep that as a contingency only if local speech proves unsuitable for the supported devices.

## Research and engine choice

Free local speech exists. Kokoro has 82 million parameters and Apache-2.0 model weights. Its browser ecosystem makes it a credible candidate, but published model capabilities are not proof that it will perform acceptably alongside Forest Drift. [Kokoro model card](https://huggingface.co/hexgrad/Kokoro-82M), [official repository](https://github.com/hexgrad/kokoro).

| Option | Role in this plan | Main consideration |
| --- | --- | --- |
| Kokoro through its JavaScript browser implementation | Primary prototype | Produces application-controlled audio; benchmark WebGPU and WASM on actual target devices. |
| HeadTTS with timestamped Kokoro | Evaluate if finer timing is needed | Project documents browser inference and phoneme timestamps; validate accuracy and dependencies before adopting. |
| Browser/OS speech synthesis | Lightweight local fallback | Installed voices vary; require a voice reporting `localService: true`. |
| Uploaded recording plus automatic transcription | Contingency only | Recognition can mishear words; introduces a second model and an authoring workflow. |

HeadTTS documents WebGPU/WASM support, an MIT implementation, and a timestamped Kokoro dependency. Its documentation also warns about loading time, memory use, slower WASM execution, and English-only support in that implementation. These are reasons to evaluate it, not to commit to it yet. [HeadTTS documentation](https://github.com/met4citizen/HeadTTS).

Browser voices can be local or remote. Select only reported local voices for the on-device promise, and verify offline behavior. Word-boundary callbacks have limited browser availability, so they cannot underpin universal subtitle timing. [Local voice flag](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService), [boundary events](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event).

“Free” means no paid inference API or per-utterance service charge. Initial model delivery still uses bandwidth, storage, and device resources. Before shipping, pin and review the licenses and redistribution requirements of the exact model, voices, runtime, and phonemizer selected. Do not infer every dependency's license from the model license.

## Player experience

1. A player starts the introductory tutorial or encounters an eligible contextual lesson.
2. If local speech resources are missing, show preparation/download progress with a cancel option in a lightweight preparation screen. The player can continue with text immediately; entering active gameplay suspends new preparation jobs unless that configuration has passed the performance gate below.
3. Prepare the current short instruction before starting speech. Show the corresponding subtitle when its audio actually starts.
4. Display clean, centered text immediately above the hotbar, without a rectangle, blur panel, or background fill. Use a restrained dark text outline/shadow for contrast over terrain and sky.
5. After the narration, wait for the relevant player action where appropriate. Do not advance an interactive lesson solely because its voice clip ended.
6. Provide replay, skip, and disable-tutorial controls in a compact tutorial control area or menu. Keep the subtitle itself non-interactive.

Start with English and one approved voice assigned to the tutorial narrator. Build speaker identity and voice profiles into the shared system from the beginning so future characters can use distinct voices without replacing the speech/subtitle pipeline. Additional characters, languages, and player-facing voice selection are later work, because pronunciation, model support, caption layout, and cache size all need separate verification.

## Shared speech foundation for future characters

The tutorial narrator is the first consumer of a reusable game speech service. Tutorial progression owns lesson triggers and completion conditions; the shared service owns synthesis, scheduling, playback, and synchronized subtitles. Future character dialogue must use this same service and its timing guarantees.

Design these contracts during the initial implementation, while registering only the tutorial narrator in the shipped content:

| Concept | Required responsibility |
| --- | --- |
| Speaker identity | Stable `speakerId`, display name, and reference to a voice profile. Keep character identity separate from the chosen engine or voice asset. |
| Voice profile | Stable profile ID plus version, engine/model revision, voice asset ID, language, supported delivery settings, and explicit local fallback policy. Different characters can select different profiles; profiles can share model weights. |
| Speech request | Explicit `scripted` or `dynamic` mode, unique utterance ID, speaker ID, final text, context/session ID, priority, cancellation scope, and optional conversation ID. Scripted requests reference a content ID/version; dynamic requests carry a turn/revision ID and expiry policy. Resolve and snapshot the voice profile when accepting the request. |
| Playback and subtitle events | Carry utterance ID, speaker ID, phrase/cue ID, actual playback timing, and completion/cancellation/failure status together. Never infer the active speaker from whichever synthesis job finished last. |

Keep source-text generation separate from speech generation. Later dialogue may come from authored lines or a separately designed dialogue system. Finalize each phrase's wording before synthesis and retain that exact text for its subtitles; changing dialogue creates a new request and invalidates obsolete queued work.

For the initial release, allow one foreground utterance at a time. Preserve this as the default when multiple characters arrive: a bounded queue, explicit priorities, expiry of irrelevant lines, and cancellation by speaker/conversation keep voices and subtitles understandable. Define interruption and resume behavior centrally. Simultaneous audible conversations, spatial character audio, and multiplayer dialogue synchronization require later product decisions; multiple supported characters does not require overlapping speech in version one.

The subtitle component should accept optional speaker labels from the start. Hide the label for the sole tutorial narrator by default; future dialogue can display a character name while retaining the clean, background-free presentation above the hotbar. Speaker changes, interruption, replay, and character removal must never leave the previous character's captions attached to the next voice. Reserve the layout space for labels when enabled and do not rely on color alone to identify speakers.

Share the inference worker/runtime and compatible model weights across voice profiles. Load voice assets only when a relevant speaker is about to speak; do not preload the future character roster or allocate one model per character. Bound both voice-asset and generated-audio caches globally. Audio cache keys must include the resolved voice profile/version and every synthesis-affecting setting. Keep speaker labels in request metadata so safe reuse of identical audio never reuses the wrong character name.

If a selected character voice is unavailable, use the profile's declared local fallback or text-only output. Preserve the character's identity in captions and avoid random voice reassignment between lines. Distinct voices cannot be guaranteed on every device's OS-speech fallback; evaluate that limitation before releasing multiple voiced characters.

Initial scope remains one tutorial narrator. Character dialogue content, character-specific triggers, conversation UI, voice cloning, emotion controls, and dialogue generation are deferred. The initial architecture and focused test fixtures should nevertheless demonstrate that two speaker profiles can pass through the same service without mixing voices, captions, caches, or cancellation state.

## Two speech paths from day one

Separate **pre-scripted speech** and **dynamic speech** explicitly in the service contracts, preparation queues, and cache policies from the first implementation. Both synthesize speech locally and share engines, voice profiles, playback, and subtitle synchronization. Their differences concern when the words become available and how long the result remains useful; they do not require two separate models.

Speech mode and speaker identity are independent. The initial tutorial narrator uses scripted speech. A future character may deliver both a scripted greeting and a dynamic reply using the same voice profile.

| Concern | Pre-scripted speech: tutorials and known dialogue | Dynamic speech: live character dialogue |
| --- | --- | --- |
| Text availability | Known in advance, with a stable content ID/version; resolve input labels and other substitutions before preparing. | Becomes available during play, potentially from a future dialogue generator; identify the conversation turn and text revision. |
| Preparation | Generate and cache a bounded starter set when a narrated session begins, before the relevant trigger fires. Prepare later lessons during explicit safe preparation states or performance-qualified gameplay windows. | Queue synthesis once a complete, finalized phrase is available; execute only when the performance admission policy permits. Preparation cannot assume the eventual reply in advance. |
| Readiness | Track missing, queued, generating, ready, and failed assets independently of lesson progression. A ready clip still waits for its gameplay trigger. | Track waiting for text, queued for synthesis, generating, ready, and playing separately so delays are explainable. |
| Cache lifetime | Prefer versioned persistent reuse across sessions within the global byte budget. A warm start generates only missing or invalid entries. | Default to bounded session memory; discard expired turns. Persist only explicitly reusable lines, never the full conversation history by default. |
| Scheduling | Background preparation has low priority and must yield to speech the player is currently waiting for. | Active conversation requests take precedence over speculative preparation, subject to foreground playback priority and relevance. |
| Waiting experience | Show preparation progress during initial setup; allow text-only play without waiting for the whole starter set. | Show a discreet speaker preparation state, then start captions with actual speech. Permit cancellation or explicit text-only delivery after a configurable wait budget. |
| Expiry and cancellation | Cached content may remain reusable after its current playback request is cancelled. Content/settings changes invalidate affected variants. | Cancel or discard superseded replies, expired turns, departed characters, and ended conversations. A valid audio cache entry does not make a stale reply relevant. |
| Quality checks | Review all shipped text and listen to every prepared lesson before release. | Validate finalized text and cue integrity at runtime; test representative names, lengths, interruptions, and generation failures. Unseen dialogue cannot receive advance listening review. |

Provide separate operations conceptually: **prepare scripted content** without playing it, **play a scripted content reference** when triggered, and **request dynamic speech** for a live turn. All converge on the same immutable phrase/audio/cue package and playback coordinator. Readiness must never imply automatic playback.

For scripted startup preparation, select only the introductory lessons likely to be needed, using the active language, voice, and controls. Start after narration is enabled and a session is starting, rather than unconditionally on the landing page. Sequence heavy speech setup separately from world generation, shader compilation, asset decoding, and world restoration. Use a lightweight preparation screen with no expensive live world preview. Longer waits are acceptable; downloading or synthesizing every possible tutorial or character line is not required. Continuing into the game applies the performance admission rules below.

For future streamed dialogue, buffer text until a natural phrase is finalized; do not synthesize individual tokens or display speculative text as spoken subtitles. Sequence phrases within a turn even if work finishes out of order. Once a phrase starts playing, its text is immutable. Revised unspoken text creates replacement work; cancellation prevents late audio from reviving the old turn. Bound lookahead and pause cleanly between phrases if the next audio is not ready.

Use one resource scheduler with separate demand and preparation queues, initially permitting one synthesis job at a time. At safe job boundaries, prefer current playback needs and live turns over starter-set pre-generation. If the engine cannot abort an in-flight job, invalidate its result for playback and dispatch the urgent request next. Keep jobs short enough to avoid long background work blocking a live response. Do not interrupt currently audible speech merely because another request finishes generating.

Both paths retain actual playback-based subtitle timing. While audio is preparing, a loading indicator is distinct from a spoken caption. If the player chooses text-only delivery, mark that request delivered and suppress its eventual late audio; do not unexpectedly read the line afterward. Cache keys include the finalized text and resolved synthesis settings, while turn/session metadata independently controls whether playback is still allowed.

Initial release implements scripted preparation and the narrator. Define the dynamic request contract, queue policy, and test fixtures from day one, but defer live character dialogue generation and gameplay integration. Measure scripted cold preparation/warm cache reuse separately from dynamic time-to-first-audio, gaps between phrases, and stale-result suppression.

## Subtitle accuracy and synchronization

Separate two requirements: correct words and correct timing. Sharing source text avoids transcription errors, but synthesis can still mispronounce, omit, or repeat words. Listen to every shipped tutorial, especially key names and game-specific terms.

For the first version, use short, natural caption phrases as synthesis units. Automatically split the instruction at punctuation and suitable clause boundaries. Display each phrase for the actual duration of its generated audio buffer. This provides reliable phrase-level synchronization without estimating word timestamps or loading speech recognition.

If a phrase is too long for two readable lines on the supported screen sizes, split it before synthesis rather than cycling arbitrary text over one long recording. Preserve natural prosody and avoid tiny fragments. Choose stable semantic segmentation against the narrowest supported layout and largest supported subtitle font; version the segmentation policy in the cache identity. Resizing should normally reflow the same phrase without changing its audio or cues. If an accessibility/layout change genuinely requires different segmentation, prepare a new variant at a safe point and retain text-only delivery until ready; never invent timing for fragments of an existing clip. Exact segmentation thresholds are tuning decisions to validate on desktop and mobile.

Use the playback clock as the source of truth. Account for pause offsets, resumed contexts, buffering, and playback rate; do not advance captions using independent wall-clock timers. Clear captions on cancellation and suppress late results from old requests. If generation falls behind, stop between phrases and show a preparation state instead of displaying words before they are spoken.

Use a shared text normalization step for numbers, abbreviations, key bindings, and pronunciation. Keep a mapping between readable labels and spoken forms where necessary. Resolve input-specific wording before generation: keyboard instructions must not tell touch users to press nonexistent keys.

Do not promise karaoke word highlighting in version one. If later required, evaluate timestamped synthesis output and validate it against recorded playback. Character-count estimates are not an accuracy solution.

### Timing details and engine capabilities

Store cue offsets in the generated clip's sample timeline, together with sample rate, sample count, normalized spoken text, display text mapping, and segmentation version. Validate finite, ordered offsets inside the clip duration before accepting cached output. Keep the exact audio and its cues paired; never regenerate one while retaining the other's timing. Account for leading/trailing silence consistently, and update offsets if audio is trimmed. Phrase-level captions cover the utterance phrase; they do not claim exact individual-word onset detection.

For generated buffers, schedule sources on the audio clock with a small bounded lookahead. Map that timeline to audible output where supported using `getOutputTimestamp()`; account for device latency without adding the same latency twice. Output latency is device-dependent, especially with Bluetooth. Recompute synchronization after output-device changes or context interruptions, and validate with recordings. Use a tested fallback when output timestamps are unavailable; the 150 ms target is a release-test target, not a guarantee across every audio device. [Output timestamp mapping](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp), [output latency](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency).

Sample the active cue against the playback timeline during rendering, but update Svelte/DOM text only at cue transitions. Do not perform layout measurement or caption wrapping every frame. Maintain explicit source handles: cancellation stops both playing and already scheduled sources, removes scheduled cues, and ignores late completion callbacks. Pause/resume restores a sample offset with a new source where needed; stop only speech sources rather than suspending a shared audio context used by music/ambience. Freeze the chosen voice and synthesis rate for the current phrase; apply settings changes at the next phrase boundary and invalidate future affected work.

Browser/OS speech is a separate capability tier: it generally exposes no application-owned audio buffers to persist, no sample-accurate seek, and no reliable universal word timing. Cache its text/metadata only. Use one short utterance per caption, driven by start/end/error callbacks, replay the phrase after an unreliable pause, and use a watchdog for missing events. Qualify this fallback separately for timing; if it fails, offer text-only delivery rather than claiming the neural buffer guarantees. Muted text-only mode should not synthesize unheard audio solely to obtain timing; use explicit continue/action progression instead.

## Presentation and accessibility

- Maximum two caption lines, responsive width, adjustable text size, and sensible line breaks.
- Anchor above the actual occupied hotbar region, including its expanding mode panel; respect safe-area insets and touch controls.
- Resolve competition with `ToolHint`, door prompts, placement controls, and multiplayer notices through shared HUD layout rules.
- Keep narration and subtitles separately configurable. Muting audio must not disable instructional text.
- Text-only mode provides replay/continue controls and action-based progression without downloading a speech model.
- Avoid duplicate speech from screen readers: announce instructions deliberately once per phrase/step, not on every rendering update, with accessible controls.
- Verify white text plus outline/shadow over bright sky, snow-like materials, dark scenes, and moving foliage. Keep the requested background-free default.

## Tutorial content and progression

Store data-driven tutorial definitions separately from rendering and speech. Each definition should describe its stable ID, content version, language, instruction text, trigger, prerequisites, completion condition, priority, and replay policy. Resolve control labels from the active input configuration.

Suggested first lessons are movement/look, selecting a hotbar tool, placing the first object, removing or undoing an edit where supported, and opening help/settings. Confirm their instructions against existing controls before writing final copy.

Use a small controller with explicit states: idle, preparing, speaking, waiting for action, paused, completed, skipped, and failed. Permit one narrator at a time, deduplicate repeated events, and discard obsolete contextual prompts rather than accumulating a long queue. If the player completes the requested action early, stop or finish at a natural phrase boundary and move on without repeating stale instructions.

Save completed/skipped lesson IDs and versions locally. Keep this separate from world serialization: tutorials are personal guidance, not shared world content. Restarting a lesson should be available from help. In multiplayer, only local player actions satisfy local tutorial conditions; other players must not trigger or hear the narrator.

## Loading, caching, and resource lifetime

The ordinary game entry path must not eagerly import the speech runtime, fetch model weights, or generate all tutorials. Load lightweight lesson metadata normally; dynamically load speech when narration is enabled for a starting session or requested during play. This permits bounded scripted startup preparation without loading speech for players who do not use it.

Run synthesis in a worker, with one active generation job. During narrated session setup, prepare the bounded scripted starter set into persistent cache; during active gameplay, keep decoded playback buffers to the current step and at most the next likely short step. Future dynamic requests use bounded phrase lookahead and the demand queue. A worker protects the main thread but does not eliminate CPU, GPU, memory, or battery contention with Three.js. Start with preparation at safe moments and suspend speculative generation during heavy gameplay.

Use three distinct lifetimes:

| Resource | Intended lifetime |
| --- | --- |
| Runtime, model, and selected voice downloads | Versioned persistent browser cache, subject to browser eviction |
| Generated phrase audio and cue metadata | Scripted content uses bounded persistent cache; dynamic content defaults to bounded session memory. Keys include content hash, resolved input labels, voice/model revision, language, rate, and normalization version. |
| Decoded audio buffers and worker/model memory | Current and next phrase/step only; release after inactivity or session teardown |

Set byte-based cache limits after measurement, evict least-recently-used generated clips first, and provide a clear-downloaded-speech control. Cache writes are optional: quota failure or private browsing must still allow temporary playback. Verify cached assets before treating a download as complete, and retry failed downloads without caching partial models as valid.

Choose exact model size, precision, memory cap, and idle timeout during the prototype. Report actual transfer size and peak memory rather than estimating from parameter count. Keep cached resources across visits where permitted, but never promise permanent storage or offline first use. Offline playback can use already cached generated clips without the model; generating missing clips offline requires all runtime/model/voice resources to be available. Text remains available otherwise.

### Cache integrity, limits, and offline readiness

Distinguish **cached**, **decoded/playback-ready**, and **model-ready**. A valid cached generated clip can play without loading the model or voice weights. A missing clip requires synthesis resources. Check the clip cache before starting the inference engine. OS speech cannot satisfy the persistent generated-audio-cache contract and must expose that capability difference.

Use a versioned manifest for each complete audio/cue pair, with content hash, engine/model/voice and pronunciation revisions, synthesis settings, segmentation/schema version, format, sample rate, sample count, and byte size. Commit the pair atomically where supported, or publish a ready marker only after both objects are durably written and validated. Interrupted writes, malformed metadata, and missing assets are cache misses; clean abandoned staging entries. Deduplicate identical in-flight requests and retain separate cancellation ownership for each caller.

Choose one storage owner for each asset class so runtime-managed caching and application caching do not silently duplicate large model downloads. Keep application namespaces distinct from world saves. Clearing speech data must never delete worlds or unrelated origin data. Invalidate active cache writes when clearing so a late job cannot immediately repopulate the cache. Account for multiple tabs: coordinate expensive preparation and cache mutation where possible; otherwise disable background preparation in additional tabs and make writes idempotent.

Set concrete measured release limits for model/voice storage, generated clip storage, decoded PCM, inference memory, queued text, and outstanding results. They are separate budgets. Include temporary download buffers, tensor allocations, audio copies, and model initialization peaks; compressed file size is not a RAM estimate. As a planning example, 24 kHz mono float32 PCM occupies 96,000 bytes per second before copies and metadata. Bound phrases by text length and resulting audio duration, and reject oversized runtime output. Do not keep whole tutorials decoded.

Use quota-aware best-effort persistence and bounded retry/backoff. Pin assets in active use against eviction, and evict unused generated clips before required active assets. Give scripted clips a reserved share so transient dynamic audio cannot displace the starter set. Update models only at safe session boundaries and avoid keeping old and new model instances resident together. On storage failure, stop retrying each frame and use bounded memory playback or text.

Offline readiness has two levels: cached-clip playback needs the application and valid audio/cue pairs; new synthesis also needs all runtime/model/voice assets. Do not force a model reload to play a cached lesson. Report these capabilities separately and test cache eviction between sessions.

## Protecting smooth 60fps gameplay

60fps provides roughly 16.67 ms per displayed frame. Speech must preserve the game's frame pacing, not merely produce an average near 60fps. No browser model or worker can guarantee this on arbitrary hardware; the release policy is to delay speech generation or use text when performance is unproven, instead of spending the rendering budget. Do not reduce the player's chosen graphics quality automatically to accommodate speech.

### Default execution policy

- **Before active gameplay:** allow model initialization, compilation, and scripted starter generation in the lightweight preparation phase, sequenced separately from heavy world loading. The user may skip waiting. Stop admitting new jobs when they continue; where an in-flight inference cannot be interrupted safely, terminate/dispose its dedicated worker if supported and verified, or offer text play after that bounded job finishes. Do not silently overlap unqualified inference with gameplay.
- **During active gameplay:** default to cached playback and subtitles only. Missing scripted clips wait for the next safe preparation opportunity or use text. No speculative neural synthesis, model loading, compilation, encoding, or bulk cache maintenance is admitted merely because `requestIdleCallback` fires.
- **Qualified configurations only:** enable limited live synthesis after representative browser/device/backend measurements pass the gate below. Start with one short job and no speculative lookahead; increase only within measured limits. Future dynamic speech must use this same policy and may remain text-only or wait on devices that cannot meet it.
- **Menus and hidden tabs:** a pause menu is not automatically safe if the world continues rendering, especially in multiplayer. Preparation requires an explicit lightweight state with expensive rendering suspended/reduced. Hidden tabs cancel/defer new work; they are not free compute windows.

A dedicated worker moves JavaScript work off the main thread but still competes for CPU, shared GPU resources, memory bandwidth, and thermal headroom. Benchmark WebGPU alongside the game's renderer; do not select it solely because it exists. For WASM, start evaluation with one inference thread, then measure any increase rather than automatically using all cores. Confirm cross-origin isolation requirements before enabling threaded WASM, including impacts on existing hosting/resources. ONNX Runtime documents worker execution and configurable WASM threading; these improve deployment options, not guaranteed gameplay isolation. [ONNX Runtime Web performance guidance](https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html).

Keep model imports, tokenization/phonemization, synthesis, hashing, and bulk serialization off the main thread where the selected engine permits. Transfer bounded PCM buffers instead of repeatedly cloning them. Budget unavoidable AudioBuffer creation/copying, decoding, cache reads, and garbage collection as part of speech cost. A worker alone is not the entire performance solution. No extra model per speaker, no per-frame cache writes, and no progress updates at inference-token frequency; throttle progress UI.

### Measurement and admission gate

Record a repeatable speech-disabled baseline on supported desktop and mobile devices at fixed graphics settings, world seed, camera route, and 60 Hz presentation target. Include dense building/vegetation, movement, weather, music, multiplayer activity, autosave, and a sustained run of at least ten minutes to expose thermal degradation. Test cold initialization, startup preparation, warm playback, cache misses, cancellation, memory cleanup, and proposed concurrent inference separately.

Proposed release thresholds, to verify with actual traces rather than treat as achieved results:

- At the supported baseline settings, target at least 99% of foreground frame intervals within 18 ms (measurement tolerance around the 16.67 ms cadence). If the base game cannot meet that on a configuration, concurrent speech generation is not admitted there.
- Relative to the matched baseline, speech adds no more than 0.5 percentage points of frames exceeding 18 ms and no more than 1 ms to p99 frame interval. Investigate every reproducible speech-attributable frame exceeding 33.3 ms; any speech-attributable main-thread task of 50 ms or more fails the gate.
- Target speech-owned main-thread work below 1 ms at p99 during gameplay, including playback handoff and subtitle changes. Measure GPU/frame pacing as well as main-thread tasks: GPU contention can miss frames without a JavaScript long task.
- Run repeated trials and report frame-time distributions, missed-frame counts, input responsiveness, peak memory, and thermal behavior, not only average FPS. Passing a short synthetic model demo does not qualify a game/device/backend combination.

Use a lightweight runtime guard on qualified configurations. As initial tuning values, suspend new inference when a rolling two-second window has more than 2% of frame intervals above 20 ms, or when an inference-period frame exceeds 50 ms. Do not infer causation from that alone; protecting gameplay takes precedence. Stop prefetch immediately, finish/cancel the bounded active job safely, and use cached speech or text. A rolling guard cannot prevent the first hitch, which is why offline qualification and the conservative default are required. Resume only after at least ten seconds of healthy pacing; repeated breaches disable live synthesis for the session. Tune thresholds against 60 Hz traces and actual display cadence without masking regressions.

Set a measured maximum non-interruptible job duration and memory ceiling before enabling live synthesis. If the engine cannot satisfy those limits or cancel safely, keep that backend preparation-only. Repeated worker failures/device loss must trip a circuit breaker rather than trigger an expensive reload loop. Validate disposal and recovery without deleting useful cached clips.

## Audio and lifecycle behavior

Add a narration channel to existing audio preferences, respecting master volume and mute. Neural generated audio can use the game's Web Audio routing. Optionally duck music and ambience temporarily; restore their previous effective levels on completion, cancellation, or failure.

OS speech generally does not pass through the game's gain nodes. Its adapter must apply master/narration volume through utterance controls and handle cancellation explicitly. Do not claim identical mixing behavior across engines.

Unlock audio through a player gesture. A browser rejecting autoplay should produce a visible start/replay action. Pause both narration and captions when local pause/settings/editor overlays or tab hiding interrupt the lesson. Resume from a known offset where reliable; otherwise replay the current short phrase. In multiplayer, pausing narration is local and does not pause the shared world.

Cancel outstanding work on skip, world exit, scene replacement, or route destruction. Use request IDs or cancellation tokens so a slow old synthesis result cannot start speaking in a new world. Release audio nodes, buffers, worker resources, and listeners deliberately.

## Integration with the current repository

Inspection found Svelte 5/SvelteKit, Three.js, existing audio preferences, and both Vitest and Playwright. There is no speech dependency in the current package manifest.

| Existing area | Planned responsibility |
| --- | --- |
| `src/routes/+page.svelte` | Connect tutorial controller to session lifecycle, local overlay state, and HUD. Keep synthesis implementation outside this already substantial file. |
| `src/lib/components/Hotbar.svelte` | Expose/share occupied layout bounds for caption positioning, including responsive panels. |
| `src/lib/components/ToolHint.svelte` and `TouchControls.svelte` | Coordinate prompts and avoid overlap. |
| `src/lib/game/ThreeScene.ts` | Emit narrow gameplay signals needed by tutorial completion; avoid speech logic in the render loop. |
| `src/lib/game/audio/AudioPreferences.ts` | Add narration volume/routing and backward-compatible defaults for existing saved preferences. |
| `src/lib/components/SettingsMenu.svelte` and `src/lib/game/settings/personalSettingsCatalog.ts` | Add tutorial, subtitle, and narration preferences using existing settings conventions. |

Proposed new modules: a tutorial catalogue/controller, shared game speech service, speaker/voice-profile registry, speech-engine interface, neural worker adapter, local browser-speech adapter, bounded speech cache, playback/caption coordinator, and a Svelte subtitle component. The speech service and subtitle contracts must not depend on tutorial step IDs or completion rules; the tutorial controller calls them as a consumer. These names describe boundaries, not files created by this plan. Keep browser-only initialization out of server rendering and static build execution. Verify model/worker URLs under the deployed base path and hosting CSP/CORS rules.

## Implementation sequence and decision gates

1. **Feasibility prototype:** test a small set of real game instructions using Kokoro, including long sentences, punctuation, numbers, key names, and Forest Drift terminology. Compare phrase generation with timestamped HeadTTS only if needed. Measure cold/warm loading, synthesis time, peak memory, voice quality, and game frame pacing.
2. **Engine decision:** choose a pinned model/runtime/voice combination only after desktop and mobile checks. Test Chromium, Safari/iOS, Firefox, WebGPU absence, and WASM fallback. Record tested versions and devices. If neural speech is too demanding on a device, try an available local OS voice, then text-only mode.
3. **Shared speech and tutorial foundation:** establish speaker/voice-profile and utterance/event contracts with explicit scripted/dynamic modes, separate preparation/demand policies, and dynamic test fixtures, registering only the tutorial narrator for release. Implement data-driven tutorial progression, local persistence, gameplay triggers, and replay/skip using text-only lessons first.
4. **Caption and playback layer:** add transparent subtitles, phrase synchronization, volume, pause/resume, cancellation, and input-specific wording.
5. **Demand loading and cache:** integrate the chosen engine, bounded scripted startup preparation, preparation progress, demand-prioritized scheduling, distinct persistent/session cache policies, cache invalidation, cleanup, and offline/error behavior.
6. **Content and release validation:** listen to every shipped lesson, validate real completion triggers, and test the full flow with existing world, touch, audio, and multiplayer behavior. Publish the measured device/backend qualification matrix, resource limits, frame-pacing results, and preparation-only fallback policy before enabling live generation.

Implementation was subsequently authorized by the user. See the implementation report for the current scope and validation results.

## Acceptance criteria

- Launching the game with narration unused produces no speech-model requests or inference work.
- One tutorial source text drives narration and subtitles; no second manually maintained transcript exists.
- Scripted preparation can populate a bounded starter cache at narrated session start without triggering playback. A continue-with-text action cancels preparation or completes the bounded non-interruptible handoff before active gameplay begins. Warm preparation synthesizes only missing or invalid content.
- Scripted/dynamic mode is explicit and independent of speaker identity. Dynamic test fixtures verify waiting for finalized phrases, ordered playback, priority over speculative preparation, turn expiry, and rejection of late results after cancellation or text-only delivery.
- Preparing many scripted lines does not retain all decoded buffers in memory. Dynamic conversation audio is not persistently stored by default, and both paths obey shared resource limits.
- Each caption phrase begins with its actual playback and stays aligned through pauses/replays; target no more than 150 ms observable mismatch under normal foreground playback, verified by captured playback.
- Every shipped instruction is reviewed for audible omissions, repetitions, pronunciation, and correct gameplay advice.
- Captions remain above the hotbar with no background panel, and are readable without covering controls on desktop and touch layouts.
- Only one tutorial speaks at a time. Skip, disable, exit, and teardown prevent stale narration.
- The shipped feature has one speaker: the tutorial narrator. Adding a future speaker requires a profile and caller integration, not a separate synthesis or subtitle implementation.
- Two-speaker test fixtures verify distinct voice selection, correct speaker labels, cache isolation across voice profiles, out-of-order generation results, and interruption/cancellation without voice or caption crossover. These fixtures do not add character gameplay to the initial release.
- Registering unused speaker profiles causes no voice downloads or additional model instances; all speakers share bounded synthesis and cache resources.
- A warm replay reuses valid cached output; changing text, controls, voice, model, or rate invalidates affected entries.
- Missing GPU support, denied autoplay, offline first use, cache eviction, quota failure, and worker/model errors leave text guidance usable.
- Resource measurements pass the 60fps frame-pacing gate above before concurrent generation is enabled. Unqualified configurations use preparation-only generation, cached playback, or text. Startup/model compilation, cache I/O, and audio handoff are included in the performance assessment.
- Corrupt/incomplete cache pairs, cache clearing during generation, quota errors, multi-tab activity, and model updates cannot mix audio/cues, cause repeated reloads, or damage world saves.
- Cached generated speech plays without loading model weights; OS speech exposes its lack of reusable audio caching and receives separate subtitle-timing qualification.
- Subtitle tests cover output latency, silence, resizing/font changes, scheduled-source cancellation, pause/resume, and settings changes without caption drift or stale playback.
- Unit tests cover progression, invalidation, cue timing, and cancellation races. Browser tests cover real lifecycle/layout and cold/warm loading; real-device listening/performance checks complement mocked engine tests.

## Conditional MP3/WAV fallback — deferred

Because free local TTS exists, an uploader is not part of the recommended initial implementation. If the feasibility gate later rejects local speech for the intended product, revisit recorded audio explicitly.

That alternative would accept a recording in an authoring/import flow, automatically transcribe and timestamp it once, and save audio plus generated subtitle cues together. Playback would lazily load only the active tutorial, never re-transcribe it on every play. Content hashes would invalidate transcripts when recordings change. A recognition engine would need its own current research, license review, accuracy evaluation, and resource budget before selection.

No transcription model can guarantee perfect subtitles for arbitrary recordings: noise, accents, overlapping voices, names, and unsupported languages can cause errors. Manual transcription would not be required, but optional correction/review would remain available for accuracy. This limitation is another reason to prefer shared-text speech generation for authored tutorials.
