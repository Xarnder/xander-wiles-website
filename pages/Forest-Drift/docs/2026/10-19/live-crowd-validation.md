# Full-room character validation — 19 October 2026

Final performance release: `00bfb399` (colour release: `382d485b`). Production frontend: https://xanderwiles.com/pages/Forest-Drift/. Existing protocol-v4 worker remains compatible; no worker runtime changes were required in this update.

## Changes

- Character preview uses the shared player palette instead of one blue colour.
- Live jackets already use server-assigned identity colours. Confirmed 20 distinct identities when every simulated player requests red, and 19 distinct remote jacket materials matching those identities.
- Load bots now import the actual protocol version and palette; failed/closed handshakes time out and clean up connected bots.
- Added a full-room colour allocation regression check, a preview colour check and an opt-in live crowd benchmark.

## Method

Apple M4; Chromium with Metal; 1280 × 800, device pixel ratio 1. One real browser plus 19 independent WebSocket clients connected to the production Durable Object. Clients send protocol-v4 poses at 10 Hz. Paths use generated terrain heights; phases exercise walking at 6 m/s, running at 12 m/s and idle. These simulated clients bypass player collision controls and are not 20 independent browser/GPU clients.

Each preset has three 20-second samples after warmup, plus an observer-only baseline. Actual whole-scene requestAnimationFrame timing and CPU/render timing are measured, not just the isolated animator. Each connection uses a viewer invite, makes no persistent world edits, and disconnects in cleanup. Credentials are read from a private file and omitted from reports.

## Results

| Preset | Walk FPS / p99 ms | Run FPS / p99 ms | Idle FPS / p99 ms | Frames >25 ms |
| --- | --- | --- | --- | --- |
| Low | 60 / 17.6 | 60 / 17.5 | 60 / 17.6 | 0 / 3,600 |
| High | 60 / 17.6 | 60 / 17.4 | 60 / 17.5 | 0 / 3,600 |

High retained full render scale, three shadow cascades, ambient occlusion and SMAA. All 19 character states transitioned to moving and then idle; bone poses changed. No browser errors, network reconnects or unexpected bot disconnects. High CPU frame time was 11.90–12.64 ms versus an 8.21 ms baseline. Further open-area testing revealed a recurring High idle dip; see the investigation below.

Spawn buildings partly obscure the first benchmark crowd; an additional open-area test is recorded separately below. Results establish this machine, viewport and scene only, not universal 60 FPS on mobile, Retina displays or larger user-built scenes.

## Local checks

- Svelte check: 0 errors, 0 warnings.
- Full unit suite after performance changes: 2,043 tests passed (160 files).
- Chromium character preview test: passed, including 19 distinct jacket materials.

## Reproduce

Use Node 22.18+ and installed Playwright Chromium. Run `FOREST_CROWD_QUALITY=high node scripts/live-character-crowd.mjs`. `FOREST_LIVE_CONFIG` optionally points to a private JSON file containing `server`, `worldId`, and `invites.viewer`; default is `~/.config/forest-drift/production-world.json`. `FOREST_CROWD_OUTPUT` controls the output filename prefix. Use a room with space for the observer and 19 bots, and do not commit invite files.

Detailed reports: [Low](live-crowd-low.json), [High](live-crowd-high.json). [Crowd screenshot](live-crowd.png).

## Open-area investigation and fixes

Moving the observer and all 19 bots 30 metres beside the spawn buildings removes building occlusion. Walking/running remained 60 FPS, but idle reached 58.7 FPS and then 58.5 FPS on repeat, with 25 and 30 frames over 25 ms respectively. The first dip overlapped workspace cleanup; the repeat rules out blaming that operation alone. Reports are retained as [first open-area test](live-crowd-open.json) and [repeat](live-crowd-open-repeat.json).

[Profiling](live-crowd-profile.json) measured approximately 1 ms for all avatar updates. Disabling character shadows alone did not solve the drop; it is not evidence that the IK solver causes the slowdown. Whole-scene render cost and available headroom vary substantially over longer runs.

Implemented conservative fixed bounds for each skinned mesh, replacing disabled frustum culling. Tests sample actual deformed vertices in walking, running and flight poses and check both containment and off-screen rejection. The root-only transform lookup no longer redundantly updates every descendant before the actual pose is applied. The preview camera now frames the whole selected crowd.

Dynamic resolution previously tolerated performance down to 90% of target (54 FPS for a 60 FPS target). It now reduces load below 99% of target and requires five healthy checks before restoring a quality step. User-selected quality floors remain unchanged. Tests cover the observed 58.5 FPS case, stable native resolution, recovery hysteresis and floor/reset behaviour. This cannot guarantee 60 FPS in CPU-bound scenes or under unrelated host load.

An exploratory [live adjustment experiment](live-crowd-adaptive.json) reached 60 / 60 / 59.4 FPS and the High resolution floor (0.7). This diagnostic result is not a clean final-release pass and is retained to avoid hiding remaining variability.

Frontend colour deployment `382d485b` was verified live: 19 distinct jacket colours in the published preview. Performance changes and final deployment verification are recorded below.

## Final deployed verification

Production deployment `3QzAxJePesytgAmZGtuGD1aqD4uh`, commit `00bfb399`, succeeded. The existing multiplayer worker remains on protocol 4. No worker runtime change or redeployment was needed for these client-side rendering fixes.

The final production tests ran sequentially in the open area, without local builds or worktree cleanup during measurement. Both rooms reached 20 connected players (one browser and 19 simulated network clients), 20 distinct assigned colours and 19 correctly tinted remote rigs. Every rig reported moving during walk/run and idle after stopping. No page errors, unexpected bot disconnects or reconnects occurred. All temporary clients were closed afterward.

| Final preset | Walk FPS / p99 ms | Run FPS / p99 ms | Idle FPS / p99 ms | Frames >25 ms |
| --- | --- | --- | --- | --- |
| High | 60 / 18.7 | 60 / 18.5 | 60 / 17.6 | 0 / 3,600 |
| Low | 59.6 / 17.6 | 60 / 17.6 | 60 / 17.6 | 1 / 3,591 |

High CPU frame time: 8.62–9.43 ms; Low: 3.84–4.23 ms. Both presets ended at full render scale (1.0), pixel ratio 1. The published preview was also checked for 19 distinct colours and enabled fixed culling bounds. The isolated Low hitch is retained rather than rerunning until a clean result appears. These are short, hardware-specific measurements, not a guarantee of an uninterrupted 60 FPS across all devices, resolutions or world contents. No causal claim is made that every earlier dip had a single source; the complete measurements remain available above.

Final data: [High](live-crowd-final-high.json), [Low](live-crowd-final-low.json). Screenshots: [High full room](live-crowd-final-high.png), [Low full room](live-crowd-final-low.png).
