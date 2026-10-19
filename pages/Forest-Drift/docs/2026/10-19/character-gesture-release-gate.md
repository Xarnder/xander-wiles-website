# Character gesture release validation — 19 October 2026

The release combines building reach, independent head look and impact-based landing with the fixes needed to clear the full test gate. It is based on production `00bfb399`; unrelated work in the original checkout is excluded.

## Resolved blockers

- **10,000-note MIDI import timeout:** profiling identified repeated global hydrology resolution while sampling distant placement points. Large imports now prepare the required region halos in batches, yielding during collection/generation and supporting cancellation. Placement, slope, water and collision checks remain enabled. River-bank probes are reused when their width and linked lake levels are unchanged, distant confluence candidates are rejected by bounds, and nearby sample grids replace all-pairs river approach scans. Regression tests compare bulk versus sequential terrain samples, cached versus fresh river-bank results, cancellation and invalidation.
- **Sustained-note preview:** the duration-clamp test used one fixed angle that current terrain can legitimately reject. It now searches for valid ground on the same final ring before asserting the original duration and loop-boundary requirements.
- **Grass texture comparison:** the flat and textured screenshots previously used different lighting and could have different dynamic resolution or vegetation obscuring the ground. The fixture now holds those conditions constant; the existing image-detail thresholds remain unchanged.

Other stale UI expectations were updated to the current accessible fence label, B draw-snap shortcut, N Compose shortcut, help Done button, and registered material-variant count.

The full browser run also exposed a pointer-lock race in the pause-menu test helper: Resume can reacquire the pointer, so Escape may only release it. The helper now opens the menu through the visible Pause button. Keyboard-specific behaviour remains covered by the dedicated gameplay checks. The Safari co-building test also captured an optimistic losing pad as its fixed expectation; it now polls both replicas together until they agree on one valid winner, retaining the fresh-join persistence check.

## Measurements and checks

- Targeted 10,000-note browser test: 28.1 seconds overall, 18.15 seconds to commit, 1.22 seconds to reload, all 10,000 logical notes retained, 24 streamed plants at the initial viewpoint, and 81 terrain chunks. The test also travels to the final note and checks bounded streaming. These are development-host measurements, not performance guarantees.
- Unit suite: 2,052 tests across 161 files passed.
- App and worker type checks passed; changed implementation files passed ESLint.
- All 93 browser cases are green across the full run and affected-test rerun. The full run passed 91/93 in 17.4 minutes, exposing the pause-helper and optimistic-expectation races described above. After correcting those fixtures, all 67 affected cases passed in 5.4 minutes, including weather and multiplayer in Chromium, WebKit and Firefox. No application code changed between those runs.

## Production smoke check

Run `node scripts/live-character-gestures.mjs` after deployment. It reads the existing private viewer configuration outside Git, connects a browser plus one pose client, checks independent head look, building reach, body following and landing recovery, then leaves cleanly. It does not change world contents. `FOREST_GESTURE_OUTPUT` selects the JSON output path.

The wire protocol and worker code are unchanged; the existing deployed multiplayer worker is compatible. Frontend production deployment uses the existing main-to-Vercel pipeline.
