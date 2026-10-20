# Forest Drift character model and animation implementation plan

Date: 19 October 2026. Status: implementation proposal based on source and asset inspection; no game code or source assets changed. Performance numbers below are acceptance targets, not measured results.

## 1. Recommended approach

Use the rig from `assets/Character Model/Breathing Idle.fbx`, prepare a clean, optimized GLB offline, and replace the capsule remote avatars with independently posed instances of that character. Preserve the supplied idle animation as an optional reference/base layer; implement custom procedural locomotion with planted feet and analytic two-bone leg IK. Keep player movement and collision authoritative within the existing controller: animation follows movement and never moves the camera or changes collision.

Retain the existing multiplayer transport, 10 Hz outgoing poses, adaptive interpolation, and 20-player room limit. Compute all bone poses, gait phase, foot targets and IK on each viewer's client. Send meaningful gameplay state through the existing flag byte, not skeletons or continuous animation events.

Deliver remote characters first, with a local character preview for tuning. A visible first-person body is a separate final phase because camera clipping, local shadows, and held tools require additional work. The animation runtime should support local and remote motion sources from the beginning.

## 2. What is actually in the project

### Assets verified by parsing

FBXs were parsed using the installed Three.js `FBXLoader`; the GLB JSON chunk was inspected directly. These are structural findings, not visual approval of deformation quality.

| Source                        | Findings                                                                                                                                                                                                    | Intended role                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `Breathing Idle.fbx`          | 1,265,088 bytes; one skinned mesh; 5,848 triangles; 17,544 expanded vertices; 7 material slots; 33 bone nodes, with 28 bones in the mesh skeleton; one 9.917-second clip named `mixamo.com`, with 29 tracks | Rigged source of truth; preserve original               |
| `Forest Drift Charachter.fbx` | 156,220 bytes; same reported triangle/vertex counts and material names; no bones, skin attributes or animations in the loader result                                                                        | Static appearance reference, not an animation-ready rig |
| `Forest Drift Charachter.glb` | Approximately 52 KB; one mesh, seven primitives; no skins or animations; position/normal/UV attributes only; materials marked double-sided                                                                  | Static reference, not a replacement for the rigged FBX  |
| `.obj` / `.mtl`               | Static interchange files, not a skeletal animation format                                                                                                                                                   | Source/reference only                                   |

The rig includes `mixamorigHips`, Spine/Spine1/Spine2, Neck, Head, Left/Right UpLeg, Leg, Foot and ToeBase, shoulders, arms, forearms, hands and index-finger chains. Build a semantic mapping from these names; do not hard-code bone array indices. Some end/helper bones are not skin joints.

**Asset blockers to resolve first:**

- FBXLoader reports vertices with more than four influences and discards additional weights. Clean to the four strongest influences and normalize in the authoring pipeline; visually check shoulders, hips and knees after cleanup.
- Both FBXs report roughly 18.109 units of height at import. Establish metres and a target standing height around 1.8 m, then verify eye alignment against the controller's 1.7 m default. Do not blindly apply a centimetre conversion or assume an animation frame is the bind pose.
- Seven materials can produce seven draws per avatar before depth, AO and shadow passes. The full model's triangle count is already modest; material consolidation is a higher priority than aggressive decimation.
- Confirm orientation, mesh-to-skeleton alignment, sole offsets, rest pose and joint axes visually in Blender and the game. A matching mesh name does not prove compatible bind matrices.

### Existing integration points

Paths below are relative to the project root.

| File                                                                        | Existing behaviour / required change                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/game/ThreeScene.ts`                                                | Controller updates before `afterControllerUpdate`; multiplayer draws through `beforeRender`. Inject surface queries and character quality settings here.                                                                                       |
| `src/lib/game/player/FirstPersonController.ts`                              | Owns movement, collision, jumping, flight and grounded state; true eye position is separate from camera walk bob. Expose an animation-state snapshot after collision resolution.                                                               |
| `src/lib/game/net/MultiplayerSession.ts`                                    | Creates `RemoteAvatarRenderer`, passes feet position and flight state to networking, renders `remoteFrames`. Extend its typed context and local frame fields.                                                                                  |
| `src/lib/game/net/RemoteAvatarRenderer.ts`                                  | Capsule/head/visor avatars with speed-based bob; preserves name labels, player colours, AO exclusions and 600 m draw cutoff. Replace visual body and retain identity/lifecycle behaviour. Remove whole-root bob when foot planting is enabled. |
| `src/lib/game/net/RemoteMotion.ts`                                          | Hermite position interpolation; adaptive 60–300 ms delay, initially 150 ms; 250 ms extrapolation; correction blending. Extend its output for direction, discontinuities and correctly timed state transitions.                                 |
| `src/lib/game/net/PoseSender.ts`                                            | Sends changing poses about every 100 ms, one final stopped pose, idle suppression and alone throttling. Currently emits moving/flying/teleport/away, not the declared grounded/running/building flags.                                         |
| `src/lib/game/net/protocol.ts`                                              | Protocol v3; 24-byte client pose; snapshot header 6 bytes plus 20 bytes/player; existing eight flag bits include grounded/running/underwater/building.                                                                                         |
| `src/lib/game/building/WorldSurfaceSampler.ts`                              | Combines terrain, foundations, slabs, roofs and stairs using reference height. Returns height only; needs a bounded contact-query adapter for animation.                                                                                       |
| `src/lib/game/graphics/GraphicsPipeline.ts`                                 | Register every lit material with CSM; dispose events remove registrations. Keep label AO exclusion and verify skinned depth/normal/shadow passes.                                                                                              |
| `src/lib/game/creatures/CreatureAnimationSystem.ts`, `CreatureGrounding.ts` | Existing analytic IK, reusable scratch storage and grounding ideas. Review and extract pure math only if compatible; creature bind-axis assumptions must not be imposed on the imported humanoid.                                              |

Default movement is 6 m/s walking and 12 m/s running; flight can reach 600 m/s. Animation must support these actual values. They are unusually fast for human proportions: evaluate the stylized stride visually, with no silent changes to movement settings.

## 3. Asset preparation and validation

1. Preserve all originals. Create an authoring file and reproducible export recipe under `assets/Character Model/authoring/`. Record source hashes, export settings and resulting rig version in a manifest.
2. Import the rigged idle FBX into Blender. Inspect rest pose, weight quality, material colours and the complete skeleton. Keep the mesh, armature, weights and inverse bind relationship intact when removing animation actions.
3. Create a clean runtime root with +Y up, forward −Z, feet at Y=0, uniform scale, and dimensions in metres. Apply transforms consistently to mesh and armature and re-export/revalidate skinning. Store sole-to-ankle offsets and semantic bone axes.
4. Export a rig-only asset and optionally an in-place idle clip on the identical rig. Remove horizontal root travel and unwanted root rotation from the clip, while retaining calibrated hips height and intentional breathing. Do not delete all hips position keys indiscriminately. Validate the idle loop seam; crossfade or trim it if needed.
5. Consolidate colours into vertex colours or a small palette texture. Aim for one body material plus one independently tintable clothing material. Keep skin, eyes and leather recognisable; tint `Grean Fabric` or a deliberate clothing mask with the existing player identity colour. Preserve hard edges when indexing/welding geometry; do not merge across incompatible normals, UVs or weights.
6. Prefer opaque front-sided materials after checking backfaces. Avoid introducing hair alpha layers or expensive cloth simulation. Preserve the supplied style.
7. Produce LOD0 near 5,848 triangles, LOD1 around 2,000–3,000 and optional LOD2 around 500–1,000, retaining joint names and bind compatibility. Treat these as budgets, not mandatory decimation if visual quality suffers.
8. Save generated files under `src/lib/game/characters/assets/` and load with Vite `?url` imports. Verify assets load from the built `/pages/Forest-Drift/` path and a preview route. Avoid hard-coded root `/assets/` URLs. Start with ordinary GLB; add compression only after measuring download/decode cost.
9. Generate a manifest/report with triangle counts per LOD, material count, joint map, local rest transforms, leg lengths, pole directions, foot offsets, conservative animation bounds and clip metadata. Fail export validation for missing joints, non-finite transforms, invalid weights or absent skin data.

No online login is needed for this pipeline. Optional authored walk/run clips can be obtained later using an online animation service if the procedural gait does not meet the visual gate; access and asset usage rights would be checked then. Do not block the initial implementation on that option.

## 4. Runtime structure and ownership

Add `src/lib/game/characters/` with the following focused modules:

| Module                    | Responsibility                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `CharacterAssetCache.ts`  | One asynchronous load per rig/LOD; shared immutable geometry, clips and base materials; validation and reference-counted disposal |
| `CharacterRig.ts`         | Semantic joint lookup, bind/rest transforms, chain measurements and bone-axis corrections                                         |
| `CharacterInstance.ts`    | Independent skeleton, pose state, optional mixer, identity material, bounds and lifetime                                          |
| `CharacterAnimation.ts`   | Locomotion state machine, phase, base pose and upper-body layering                                                                |
| `CharacterGrounding.ts`   | Contact scheduling, world-space foot locks, bounded surface queries and pelvis correction                                         |
| `twoBoneIK.ts`            | Pure analytic solver with rest-axis corrections, stable poles and reach constraints                                               |
| `CharacterLod.ts`         | Distance/screen-size quality selection, scheduling and hysteresis                                                                 |
| `CharacterDiagnostics.ts` | Timing, query counts, active rigs, draw/pass counters and visual debug overlays                                                   |

Clone the complete loaded rig using `SkeletonUtils.clone`, including ancestor bones. Geometry and immutable materials can be shared, but skeletons, animation state and tint materials must be independent. Ordinary `Object3D.clone` is not sufficient for this ownership contract. [Three.js SkeletonUtils documentation](https://threejs.org/docs/pages/module-SkeletonUtils.html).

Keep `RemoteAvatarRenderer` as the multiplayer adapter and label owner. Load once; show the existing capsule until loading and shader preparation finish. Handle failed requests and late load completion after leave/detach using a generation token. Stagger expensive instance setup across frames when many players join. Warm relevant skinning/shadow programs before swapping visible bodies.

On leave, release per-instance skeleton/bone textures, mixer bindings, tint material and label resources. Shared geometry/materials/textures remain alive until the cache's last owner releases them. Ensure all LOD meshes share the intended per-instance skeleton, not another player's skeleton. World switching and reconnects must not multiply resources.

## 5. Motion contract and animation order

Expose `grounded`, `running`, resolved velocity, vertical velocity and explicit discontinuity information from the local controller. Running should represent the controller's active movement mode after input resolution, including touch input. Use actual displacement for stride, so walking against a wall does not animate running in place.

For remote characters, extend `MotionFrame` with displayed horizontal direction/velocity and a one-shot discontinuity generation. Derive displacement from the rendered trajectory, excluding teleports and reseeding after discontinuities. Replace the current fixed 0.25-per-frame speed smoothing with a time-based exponential filter for consistent 30/60/120 Hz behaviour. Keep a lightly filtered speed for pose blending and actual travelled distance for stride phase.

Each rendered frame:

1. Resolve controller motion locally, or evaluate `RemoteMotion` once remotely. All avatar parts and labels use the same sample time.
2. Select animation LOD; reset contacts on teleport, world change, long resume or invalid state.
3. Restore the complete base pose from rest transforms or evaluate the chosen base clip. Never accumulate procedural rotations on last frame's IK result.
4. Select/blend locomotion state and advance gait phase from horizontal distance.
5. Apply pelvis sway, arm swing, restrained body lean and view-direction offsets.
6. Update the required world matrices; evaluate bounded contact targets; apply pelvis reach correction.
7. Solve legs, apply ankle/toe orientation and optional hand IK; update matrices again before rendering.
8. Position label above a stable calibrated head height. Animation affects the model beneath the network root, never the network position or camera.

Use `1 - exp(-dt / tau)` for transitions and quaternion slerp for rotations. Start with 100–180 ms locomotion blends and tune visually. Clamp animation integration after hitches and reseed contacts after a long pause; do not run an unbounded catch-up loop.

### State priorities

| State           | Trigger                                   | Pose/contact policy                                                                       |
| --------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Flight          | Flying flag                               | Hover or directional flight pose; no ground IK, irrespective of horizontal speed          |
| Airborne        | Not grounded                              | Rise/fall from vertical movement; relaxed legs; no foot planting                          |
| Landing         | Airborne → grounded                       | Brief pelvis/knee compression, then locomotion; never alter controller position           |
| Grounded moving | Actual displacement over threshold        | Forward/back/strafe gait with speed and run mode; foot locks                              |
| Idle / turn     | Grounded, near-zero speed                 | Breathing; planted feet within reach; step-turn when yaw exceeds a threshold              |
| Away / stale    | Presence state or exhausted extrapolation | Stop travel phase, release unreachable locks, settle into idle/hover; retain dimmed label |

Treat building as an upper-body overlay, not a locomotion state. Do not add swimming gameplay merely because an underwater flag exists; the controller currently blocks deep-lake movement and allows flight. Keep underwater appearance separate until swimming is actually implemented.

### Procedural gait

Maintain one phase per character. Advance by `deltaPhase = 2π × horizontalDistance / fullStrideLength`; legs are half a cycle apart. Define full stride as two steps and explicitly test units. Infer forward/sideways/backward motion in the body's yaw space. Walking should have overlapping support, with a shorter stance fraction for running.

During stance, keep each foot target fixed in world space. During swing, move from its last contact to a predicted landing location using an eased curve with vertical clearance. Select landing distance from displayed velocity and step duration, clamped to anatomical reach. Add modest counter-swing to arms, torso twist and bounded acceleration lean. Maintain stable knee pole vectors during backward and sideways motion.

Start tuning stride length around 1.4–1.8 m for walking and 2.2–3.2 m for running, then evaluate at the actual 6/12 m/s defaults. A 3 m full stride at 12 m/s is four cycles per second, which may look frantic. If acceptable stride length/cadence cannot fit the existing speed, choose a deliberately stylized gait or seek a separate movement-speed decision; do not stretch bones or claim perfect human realism. Authored in-place walk/run clips are a fallback base layer with the same IK and networking architecture.

Body yaw initially follows view yaw with bounded smoothing; distribute look pitch/yaw over spine, neck and head with anatomical limits. At idle, allow a small head turn before turning the body with stepping feet. Reset locked contacts when turning would cross the legs or exceed reach.

## 6. Ground contact and IK details

Use analytic two-bone IK for each leg: constant bounded work and explicit knee control suit this two-segment chain. The built-in CCD solver is available for more complex chains, but is iterative and is not the default leg solution. [Three.js CCDIKSolver documentation](https://threejs.org/docs/pages/CCDIKSolver.html).

The solver must account for imported bone rest orientations, rather than assuming the creature solver's local axes. Work in a documented coordinate space, clamp target distance to `(abs(upper - lower) + epsilon, upper + lower - epsilon)`, choose a stable pole projected perpendicular to the target, solve with the cosine rule, and convert desired rotations back through parent and bind orientations. Never scale bones to reach a target. Handle coincident targets and straight-leg singularities without NaNs or knee flips.

Introduce a contact query returning `{valid, height, normal, surfaceId, revision}`. Use the existing surface managers through a read-only adapter with a finite reference height and a short above/below-foot search interval. Do not use `Infinity` to find foot support: it can select an upstairs floor or roof. Existing terrain/foundation results can exceed reference height; reject unreachable results rather than copying controller assumptions into IK.

For the initial implementation, reuse height queries but bound the result and return no contact if inappropriate. Extend candidate APIs to provide surface identity/normals where necessary. Terrain normals can use cached nearby samples; stair treads/slabs use their actual face normals. Avoid finite differences across stair edges or between different floors. Check Mini Build support separately: `WorldSurfaceSampler` currently does not include it, so do not claim arbitrary furniture contact without a dedicated query.

Plant sole targets, then convert to ankle targets using the rig's calibrated offsets. Align feet to the contact normal with a slope clamp. On stairs, query prospective landing height before swing, raise foot clearance over the riser, and reduce contact near tread edges. Bound and smooth pelvis lowering so both legs remain reachable; it is a visual offset only. If there is no valid surface, fade IK out instead of pulling a leg toward distant terrain.

Cache stance contacts. Invalidate on nearby building edits, surface removal, excessive root correction, stance release and world revision changes. Remote surfaces may differ temporarily while edits arrive; keep the network root intact and gracefully relax IK. Foot/hand contacts remain cosmetic and never submit building operations.

Do not raycast the whole scene per foot. Budget support queries globally, stagger refreshes, reuse vectors/quaternions and avoid temporary arrays in the hot path. Begin with two foot probes per near avatar at 30 Hz, with normals/extra landing probes only when needed; measure candidate-manager cost before increasing this.

## 7. Multiplayer changes without bone traffic

Keep the existing packet sizes and rate for the first release:

- Extend controller → `LocalPlayerFrame` → `LocalPose` to carry grounded/running/building state. Only set underwater if its semantics are defined and sourced correctly.
- Populate the existing flag bits in `PoseSender`. Preserve immediate state-change/final-stop sends and idle/alone/away suppression. Add tests showing that turning in place does not create a walk cycle: `moving` currently includes looking changes, so animation must use displacement.
- Fix remote discrete-state timing: `RemoteMotion.evaluate` currently returns `b.flags` throughout interpolation between `a` and `b`, which can announce landing/flight early. Sample continuous motion smoothly but hold discrete state until its sample timestamp. Preserve special teleport handling and strip event-like teleport state into a one-shot discontinuity signal for animation.
- Confirm `RoomCore` validation and storage preserve all intended flags. Snapshot history must retain transition state consistently, including reconnect/welcome paths. Do not perform skeletal work on the server.
- Reset displayed velocity and gait contacts on explicit teleports, large correction snaps and resumes. Current speed estimation can interpret a position snap as extreme speed; guard that before it reaches animation.
- Gait phase is local and need not agree between viewers. Jump/landing derive from sampled grounded transitions and vertical motion; very brief events shorter than pose cadence may be absent. If a later feature requires guaranteed visible short actions, add timestamped, sequenced action events with late-arrival/expiry rules in a versioned protocol extension.

Using previously declared flags does not change binary layout. Test older-client semantics explicitly: old senders never supply grounded, so a new receiver cannot safely interpret every missing grounded bit as airborne. Recommended rollout: bump `PROTOCOL_VERSION` for this behavioural contract and deploy matching client/server builds, using the existing refresh-on-mismatch handling. Alternatively negotiate a capability and provide an explicit legacy fallback; do not guess legacy support from one pose.

### Bandwidth budget

At 10 Hz, a moving client sends 24 × 10 = **240 bytes/s of binary application payload**. With 19 other moving players, their entry data totals 19 × 20 × 10 = **3,800 bytes/s per receiver**, plus snapshot headers (up to 120 bytes/s at 20 flushes/s). This is roughly 3.9 KB/s before WebSocket/TLS/TCP overhead, pings, joins and world edits; it is not a measured wire rate. Current changed-entry batching can reduce it when peers stop. Animation adds no recurring payload bytes under this design.

A full room is 20 players, normally 19 remote rigs per client. Test 20 synthetic rigs as an extra margin. Do not introduce skeletal instancing or interest-management protocol changes until profiling demonstrates a need; ordinary `InstancedMesh` is not a drop-in solution for independently animated skeletons.

## 8. 60 fps budget and graceful quality scaling

Target a 16.67 ms frame on explicitly recorded desktop and mobile hardware, browser, resolution, device pixel ratio and graphics preset. Measure the existing game baseline first. The plan cannot promise 60 fps on unspecified hardware or a scene whose terrain/vegetation already exhausts the budget.

Initial acceptance budgets for 19 visible remote characters in the representative scene:

| Measure                                                  | Target                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Character CPU animation + contacts + matrix work         | p95 ≤ 2 ms/frame                                                                      |
| Incremental character GPU cost including affected passes | p95 ≤ 2 ms; measure separately from CPU                                               |
| Whole warmed scene                                       | p95 ≤ 16.67 ms, p99 ≤ 25 ms; report missed refreshes and hitches separately           |
| Near model                                               | Approximately 5.8k triangles, ≤ 2 body material draws                                 |
| Near contact workload                                    | Initial ~1,140 base foot queries/s for 19 rigs at 30 Hz; profile and cap extra probes |
| Memory/lifecycle                                         | Stable resource counts after repeated joins/leaves and world switches                 |

CPU and GPU can overlap; do not sum their timings as if they were serial. Count all geometry passes: 19 × 2 body draws is 38 colour-pass draws, plus labels, shadow cascades and AO/depth work. Seven original materials would be 133 body colour draws before those extra passes.

Suggested starting LOD policy, tuned by projected size and hardware:

| Range                     | Mesh/pose updates              | Contacts/shadows                                                          |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| 0–15 m                    | LOD0, pose at render rate      | IK every frame from cached targets; support refresh ~30 Hz; near shadows  |
| 15–40 m                   | LOD1, base pose ~30 Hz         | Reduced contacts ~15 Hz; limited shadows                                  |
| 40–100 m                  | LOD2 or LOD1, base pose ~15 Hz | No terrain IK; simple gait; no dynamic shadows                            |
| 100–600 m                 | Low-detail silhouette/proxy    | No contact queries; sparse animation; preserve appropriate labels/locator |
| Beyond 600 m / irrelevant | Skip visual pose work          | Keep network history/presence; locator policy remains independent         |

Keep root interpolation at every render frame in all visible tiers. If bone evaluation is throttled, interpolate cached poses for visible mid-distance characters and measure that cost; near avatars must not visibly tick at 15/30 Hz. Use distance hysteresis, staggered updates and a blend when re-entering detailed IK. Maintain conservative precomputed animation bounds rather than recalculating skinned bounds every frame. Camera-frustum culling must still respect nearby offscreen shadow casters.

If overloaded, reduce contact refreshes, shadow range, then distant mesh/pose quality. Preserve near foot placement and root interpolation as long as possible. Do not reduce network send rate to save animation CPU. Record baseline and avatar-on measurements with identical world/camera settings.

## 9. Implementation sequence and completion gates

### Phase 1 — Asset and character preview

Create an asset audit script/export recipe, rigged runtime GLB, semantic manifest and `/characters` development preview route following the existing lab-route pattern. Add bind/idle views, skeleton overlay and single-leg target controls. Gate: correct scale, facing, colour, skinning and independent clones; no weight truncation warning in runtime assets. Original files stay untouched.

### Phase 2 — Static multiplayer integration

Introduce cache/instance ownership and swap capsule bodies behind a development flag. Preserve labels, identity colours, AO exclusions, locator and cleanup. Gate: two clients see independent rigs; 19 simultaneous joins do not block on repeated downloads; load failure uses a capsule; deployed relative asset URLs work.

### Phase 3 — Motion/state contract

Expose post-controller animation state, populate flags, fix remote state timing and discontinuity speed spikes, choose protocol rollout. Gate: unit tests for stop, turn-only, grounded/airborne, flight, teleport, stale stream and reconnect; no change to packet lengths or steady-state cadence.

### Phase 4 — Flat-ground locomotion

Implement base pose, distance-driven gait, start/stop blending, direction changes, backward/strafe movement, turning, air/flight and look layers. Gate: review at default 6/12 m/s and touch analog speeds. Reject a treadmill gait or frantic cadence before layering terrain complexity over it.

### Phase 5 — Terrain/stair IK

Implement contact adapter, foot locks, analytic leg solving, sole orientation, pelvis reach correction, surface invalidation and debug overlays. Gate: planted-foot drift below 2 cm during steady stance on a static surface, no sustained sole penetration over 2 cm, no knee flips/NaNs, and no attachment to an upstairs floor. These are initial measurable tuning targets with separate allowances for transitions/network snaps.

### Phase 6 — Performance and multiplayer hardening

Add LODs, staged loading/shader warmup, contact scheduling and counters. Benchmark forests, buildings, stairs, water edges and crowded spawn with 0/1/5/19 rigs; add a 20-rig synthetic stress case. Gate: recorded frame-time and resource budgets on named hardware, stable memory, and correct behaviour under network impairment.

### Phase 7 — Optional local body and hand interactions

Reuse the same rig with local resolved movement; hide head/upper-body geometry from the local camera using a deliberate visibility/pass design. Keep walk bob camera-only and test near-plane clipping while looking down. Handle local shadow rendering explicitly. Add hand/tool IK only for actual visible tool interactions with defined attachment targets; keep it cosmetic and avoid network bone data. This phase is independent of the remote-character launch.

## 10. Validation plan

- **Asset checks:** expected skin/joints, four normalized influences, finite transforms, material/triangle budgets, correct rest/idle alignment, compatible LOD bind matrices and valid bounds.
- **Unit tests:** IK reach limits/pole stability/rest-axis conversions; phase independent of 30/60/120 Hz; stopped and teleport motion; independent skeleton clones; state transitions on the render timeline; contact rejection across floors and unreachable foundations; balanced shared-resource ownership.
- **Existing regressions:** extend `RemoteAvatarRenderer.spec.ts`, `RemoteMotion.spec.ts`, `PoseSender.spec.ts`, `protocol.spec.ts`, `RoomCore.spec.ts`, controller tests and `WorldSurfaceSampler.spec.ts`. Preserve name-tag depth/AO behaviour and first-person collision.
- **Visual preview cases:** idle, slow movement, full-speed run, diagonals, backward movement, rapid 180° turns, jump/landing, flight, stairs both ways, ramps, ledges, standing under a roof, shallow river and removed support. Inspect clothing deformation and knee/ankle limits from multiple angles.
- **Network tests:** add controlled delay/jitter, disconnect/reconnect, late samples, tab pause, clock correction and teleport cases to `tests/multiplayer.e2e.ts`. WebSocket transport is ordered/reliable; emulate stalls and application sample omission rather than pretending ordinary UDP packet loss. Ensure interpolation delay stays within the existing adaptive policy, without a second root-smoothing buffer.
- **Performance:** add `tests/characterPerformance.e2e.ts` using the project's existing performance harness pattern. Use GPU-backed rendering, report p50/p95/p99, CPU/GPU separately where timer queries are available, draw counts per pass, contact counts, shaders, geometries/textures and missed refreshes. Run a warmed 60-second capture plus a longer join/leave/world-switch soak; measure cold loading separately.
- **Build gate:** run focused unit tests, `npm run check`, production build, relevant multiplayer/browser tests and the actual-hardware benchmark. Formatting and lint apply to changed files. Headless software-rendered FPS is not evidence of device performance.

## 11. Decisions and remaining uncertainty

Proceed with one character rig, clothing colour identity, procedural gait plus leg IK, existing multiplayer movement and no bone traffic. Keep the existing idle clip as optional content rather than discarding useful source data. No external account is required to start.

The first visual preview must resolve imported joint axes/rest-pose quality and how stylized movement should look at 6/12 m/s. Baseline hardware measurements must establish the supported 60 fps quality presets. Those two gates determine tuning and fallback clips; neither can be honestly settled from static code inspection alone.

### Reference material

- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html): runtime GLB loading and optional decoder integration. The initial uncompressed GLB avoids adding decoder setup before there is a measured need.
- [Three.js SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils.html): skeleton-safe cloning and optional offline retargeting support.
- [Three.js CCDIKSolver](https://threejs.org/docs/pages/CCDIKSolver.html): alternative iterative IK API; analytic two-bone legs are the proposed implementation choice.

Sources checked 19 October 2026; implementation should use the installed Three.js r185 APIs and verify compatibility before adopting later documentation changes.
