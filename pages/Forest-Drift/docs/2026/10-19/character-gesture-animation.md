# Character gestures, head look and jump landings

Implemented locally on 19 October 2026. These changes have not been deployed.

## Behaviour

- A placement action blends the right arm toward the player's look direction for 650 ms. Carrying a build object keeps the reach active; blocked/locked building and stale/away players suppress it.
- The head and neck share independent yaw and pitch. At rest, the head leads; once the look exceeds about 37 degrees, the body eases around until nearly aligned. Walking aligns the body with the look direction. Neck yaw is bounded to about 57 degrees and pitch to about 66 degrees.
- Landing compresses the pelvis and bends the knees against planted feet, with a small torso counter-lean. Compression scales with descending speed, builds over 100 ms and recovers over 320 ms. Flight exits, initial spawns and teleports do not generate false impacts.

## Implementation

`CharacterAnimationState` contains the scalar transitions separately from the imported rig. `CharacterInstance` applies world-space head rotations and analytic arm IK, retaining the existing foot support solver and shared asset resources. Temporary vectors/quaternions are reused. Camera and collision transforms are unchanged.

The existing protocol-4 building flag carries the action. `BuildToolManager` exposes a gesture window and `PoseSender` sends flag transitions immediately through the existing 24-byte poses. No additional network field, server change or periodic send rate is needed.

The `/characters` preview now offers Look and Build modes and a Jump mode with a real grounded/airborne cycle.

## Validation

Added scalar animation tests, actual-asset world-space head/hand/foot checks, construction gesture expiry/lock checks, pose flag transition tests, preview screenshots, and two-browser multiplayer assertions for independent head look, building reach and landing recovery.

A local GPU world sample with 19 remote rigs reported 60 fps average, 18.4 ms p95 frame time and 6.18 ms average CPU frame time. This synthetic rendering sample is not a live 20-client network load test or a guarantee for other hardware.

Final checks: 2,052 unit tests across 161 files passed with two workers; `npm run check` reported zero errors/warnings; all four Chromium preview/multiplayer tests passed. Build, independent-look and landing screenshots were inspected. The build succeeded with its existing large-chunk warning. The optional sky HDR request still reports a missing asset during world tests; it did not prevent the tests from passing.
