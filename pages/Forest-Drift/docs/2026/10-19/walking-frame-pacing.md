# Walking and camera-turn frame pacing

## Reproduced causes

A fresh Main World at High quality averaged close to 60 fps while still visibly hitching. CPU profiling found:

- Terrain streaming generated entire chunks synchronously. Crossing a boundary produced a 62.9 ms frame, including 42.8 ms inside terrain update.
- Music wave patches sampled all 12,769 ground vertices whenever the rounded camera cell changed, including invisible guides. Oscillating around a boundary repeatedly spent about 23 ms in music animation.
- Resolution recovery resized render targets on the main thread. Single mild frame-rate dips could start unnecessary downscale/recovery cycles.
- Newly visible render variants still performed GPU setup on the first turn; compiling only the ordinary colour shaders did not warm the actual postprocessing passes and driver draws.

## Changes

Terrain mesh generation now advances by rows within a 2 ms budget. A completed mesh replaces the old one atomically. Unfinished meshes are excluded from rendering and surface lattices; travel, revision changes, topology changes and disposal cancel pending work. Startup priming remains synchronous, and generated attributes match the synchronous path exactly.

Inactive music waves skip following. Active patches have movement hysteresis and reuse overlapping ground samples: a 16 m step samples 904 new vertices rather than all 12,769. Explicit surface rebuilds invalidate the cache.

Dynamic resolution gives startup five seconds to settle and requires two consecutive mildly pressured checks before reducing resolution. Severe pressure still reduces it immediately. Startup GPU warmup draws the other camera directions through the real passes before presenting the original view; camera orientation and renderer state are restored even on failure. This moves first-use work into loading, at the cost of extra startup draws.

## Measurements

See `walking-frame-pacing.json`. With CPU sampling enabled in both runs, the walking maximum fell from 62.9 ms to 21.9 ms; walking frames over 25 ms fell from 20 to zero.

The final run without CPU sampling measured approximately 60 fps in all four phases, with zero frames over 25 ms across idle (6 s), turning (14 s), walking (25 s), and walking while turning (14 s). First-turn maximum was 24.9 ms; walking maximum was 22.9 ms. These are frame callback intervals on this development host at 1280×800, not a guarantee for every device or workload.

## Repeat the check

Start the production preview on port 4185, then run:

```sh
PROFILE_OUT=/tmp/forest-walking node scripts/profile-walking.mjs
```

`PROFILE_URL` selects another game URL; `PROFILE_CPU=1` also saves a DevTools CPU profile. The script uses a fresh local Main World and records browser errors. It does not join a multiplayer room or change a saved online world.

Regression tests cover exact streamed geometry, atomic replacement, cancellation, music-patch reuse/invalidation, isolated versus sustained resolution pressure, and camera restoration during GPU warmup. Final validation: 2,061 unit tests across 164 files passed; all 27 selected browser regressions passed, covering Main World, graphics settings, MIDI/music, materials, determinism and multiplayer in Chromium, WebKit and Firefox. App type checking reported zero errors/warnings, and all changed source/test files passed lint and formatting checks.
