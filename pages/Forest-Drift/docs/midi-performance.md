# Local MIDI import performance

Measured on 9 September 2026 using production-preview Playwright Chromium on the development host. Each fixture is parsed and planned, imported into a real world, saved, reloaded and checked for the exact logical note count. The 10,000-note case additionally travels to the final note and verifies that its visual streams in while the live plant cap remains at most 400. All three cases passed, along with the local file selection, preview, cancellation, New/Replace/Add and save/reload browser flow.

|  Notes | Parse + plan ms | Commit seconds | Reload seconds | Live plants | Plant scene objects | Terrain chunks | Whole-frame draws | Baseline / imported FPS | Music JSON bytes |
| -----: | --------------: | -------------: | -------------: | ----------: | ------------------: | -------------: | ----------------: | ----------------------: | ---------------: |
|    100 |            0.94 |           0.02 |           6.73 |          24 |                 218 |             81 |               253 |             3.11 / 3.09 |           25,663 |
|  2,000 |           10.88 |           7.90 |           6.95 |          24 |                 218 |             81 |               293 |             3.37 / 3.27 |          498,378 |
| 10,000 |           77.86 |          46.49 |           6.16 |          24 |                 218 |             81 |               279 |             3.21 / 3.34 |        2,492,702 |

The world retains every logical note but streams nearby plant meshes. At the measured starting position all three files produced 24 live plants, 218 plant scene objects and 81 terrain chunks. Import radius therefore does not force distant terrain or vegetation to load. Geometry and draw counts include the rest of the world and vary with ambient creatures and streaming. The JSON size measures music recipes only; reload time includes reopening the world and rebuilding its renderer.

The headless full-world baseline is only about 3 FPS on this host; these results are not representative hardware frame-rate guarantees. Imported FPS remains close to baseline. Browser heap estimates were 44.7, 53.5 and 86.4 MB respectively and include the whole page. Scheduler work totalled 2.3–3.2 ms across 24 sampled ticks, with a 1.1 ms maximum tick. See [raw measurements](midi-performance.json).

Large imports are bounded in live rendering but are not instant: 10,000 notes took 46.49 seconds to commit on this host. Commit includes per-note terrain, slope, building-clearance and overlap validation, with yielding batches before the staged composition replaces the current one. Pure parsing/planning took 77.86 ms. A future optimization should profile these placement probes and batch their work before raising import limits; dropping validation or claiming constant-time imports would be misleading.

Reproduce with `PLAYWRIGHT_PORT=4175 npx playwright test tests/midi.e2e.ts`. Timing results are indicative single runs, not statistical benchmarks.
