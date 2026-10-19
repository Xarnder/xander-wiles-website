# Character implementation

The multiplayer renderer now uses the supplied `Breathing Idle.fbx` character. The original files remain untouched. A first-person visible body and held-tool hand IK remain separate optional work, as described in the plan.

## Asset pipeline

Run `npm run build:character` to regenerate `src/lib/game/characters/assets/character.glb` and its manifest from the original FBX. The script uses the installed Three.js loader/exporter, so Blender or an external login is not required.

The export captures the relaxed first idle pose while preserving skin bind matrices, normalizes the loader's four strongest skin influences, converts source colours into vertex colours, separates tintable clothing, indexes compatible vertices, and normalizes height/facing. It preserves 5,848 triangles in two material primitives. The generated GLB is about 845 KiB, loaded once per multiplayer renderer lifetime through a Vite asset URL. The source animation stays available in the original FBX; runtime breathing and locomotion are procedural.

The FBX importer reports its expected weight-truncation warning during generation; the runtime GLB has normalized four-influence weights. Geometry, materials and colour appearance were inspected in the browser preview.

## Runtime behaviour

- Each player gets a cloned skeleton with its own pose and clothing colour. Geometry is shared. Per-player materials/skeletons are released on leave; cached assets are released on detach, including late asynchronous load completion.
- The capsule remains the loading/failure fallback and distant proxy. Character creation is spread over frames. The detailed/proxy boundary has 90/110 m hysteresis, and shadows stop beyond 40 m.
- Walking/running phases follow displayed displacement. Legs use analytic two-bone IK, world-space stance targets, swing arcs and bounded height probes. Feet use small slope probes that reject abrupt height changes. Contact queries run at reduced rates beyond 15 m; characters beyond 40 m use a simple gait without surface sampling.
- Breathing, arm swing, looking, jumping, landing compression and flight are cosmetic layers. Neither IK nor root animation changes controller collision, movement speed, camera bob or network position.
- Explicit teleports reset displayed speed and contact history. Remote grounded/run state follows the interpolated sample timeline instead of applying the next sample early. Speed filtering now uses elapsed time rather than a fixed per-frame factor.
- Existing name tags, AO exclusions, shadow material registration, locator identity and fallback rendering remain intact.

## Multiplayer deployment

**Deploy the browser build and room worker together. Protocol version is now 4.** The new character state requires senders to populate the previously reserved grounded/running flags. The existing protocol mismatch handling prevents old clients from silently being interpreted as perpetually airborne. No live service was deployed as part of this implementation.

Pose and snapshot sizes are unchanged: 24 bytes per outgoing pose and 20 bytes per player entry. The send interval remains 100 ms. Bones, foot targets and gait phase are never transmitted. Existing controller restrictions on multiplayer flight remain unchanged; the shared animation runtime supports flight for previews/future contexts.

## Preview and tests

Open `/characters` in a local dev or preview server. Select idle, walk, run, jump or flight and 1/5/19 characters. Orbit and zoom to inspect the actual runtime asset. This follows the existing standalone lab-route pattern.

Tests added/extended:

- Real GLB loading, independent rigs, foot locks, bounded support, solver reach/singularities and teleport/flight robustness.
- Ground/run flag transitions and remote discrete-state timing/speed reset.
- Browser rendering with 19 animated rigs, expected triangle/draw counts and resizing the crowd back to one.
- Two-client multiplayer verifies that both clients load the real rig, observes changing remote leg poses while the owner moves, and confirms idle after stopping. Existing reconnect/leave and shared-building tests remain part of validation.

For the GPU-backed Chromium run on macOS:

```sh
FOREST_DRIFT_GPU=1 npx playwright test tests/characters.e2e.ts tests/multiplayer.e2e.ts --project=chromium
```

The opt-in uses the Metal backend. Its multiplayer test additionally records a real-world baseline and an 18-synthetic-plus-one-real-remote-character sample, restoring the renderer afterwards. Reports are written to the Playwright test output directories. The synthetic crowd exercises the normal character renderer without opening 19 extra browser worlds; it is not a 20-client network soak.

## Performance scope and remaining refinements

The first isolated M4/Metal sample measured about 0.7 ms p95 for 19 animation updates, 38 character draws plus the grid, and 111,112 triangles. This is an isolated CPU measurement, not a claim that the complete world runs at 60 fps on all hardware. Whole-world performance reports include existing terrain, vegetation, buildings and the cost of running two clients simultaneously.

The initial distance policy uses the original capsule as a distant proxy, not separately authored mesh LODs. Near characters update every rendered frame. The fast existing 6/12 m/s movement uses a stylized procedural stride; no gameplay speed was changed. Contacts are bounded height queries with conservative slope estimation, not arbitrary furniture collision or a full surface-ID contact system. These are deliberate first-release limits; further authored LODs, precise surface normals and local-body rendering can be added without changing the multiplayer packet format.

## Recorded verification

The final Chromium/Metal run passed all three browser tests: character crowd rendering, multiplayer join/movement/reconnect/leave, and shared building. The complete unit suite passed 2,039 tests; Svelte/TypeScript checks reported no errors or warnings, and the production build and changed-file lint passed.

The warmed low-preset game scene at 1100×700 held 60 fps average both with one real remote and with a 19-character crowd. CPU frame time increased from 3.00 to 4.11 ms average. Frame-time p95 was 17.4 ms baseline and 17.5 ms with the crowd; this does not meet a strict every-frame 16.67 ms guarantee. The final isolated 19-character animation sample was 1.0 ms CPU p95. See [recorded results](character-benchmark-results.json) for counts and scope. Mobile devices and other browser engines were not benchmarked.
