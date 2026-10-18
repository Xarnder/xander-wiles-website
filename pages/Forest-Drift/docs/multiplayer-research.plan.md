# Forest Drift — Multiplayer Research and Implementation Plan

**Status:** Research and planning only — **revision 3** (updated for the locked decisions). No
application code, dependencies or deployment configuration were changed.
**Decisions:** all 34 questions and 5 follow-ups are locked in
[`2026/10-15/Multiplayer/feature-plan/01-questions-and-decisions.md`](2026/10-15/Multiplayer/feature-plan/01-questions-and-decisions.md).
The "Revision 3" section below lists what they changed.
**Date:** 15 October 2026. Prices and platform statuses were checked on this date unless stated
otherwise.
**Scope:** `pages/Forest-Drift/` (SvelteKit + Three.js, deployed as a static build under
`/pages/Forest-Drift/` on the main site).
**Revision 2:** cross-reviewed against the independently written
[`plans/2026/10/chatgpt-multiplayer-research.plan.md`](plans/2026/10/chatgpt-multiplayer-research.plan.md).
Section 0 lists what changed and why.

### How to read this document

Claims are tagged so facts, estimates and guesses stay separate:

| Tag    | Meaning                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------- |
| **F**  | Confirmed fact: seen in this repository, or on a primary source (official docs, pricing page, repo). |
| **F²** | Fact from secondary reporting only (news, vendor blogs, forums, third-party listings).               |
| **E**  | Engineering estimate, with the working shown.                                                        |
| **A**  | Assumption, stated so it can be challenged.                                                          |
| **U**  | Could not be verified. Do not rely on it without checking.                                           |

**Currency:**

- **$1 = £0.75** (**A**). The last GBP/USD quote found was 1.3381 on 22 July 2026; no verified
  October 2026 rate was available. The other plan used £0.80; at that rate every dollar figure here
  rises by about 7%, and the $5 Cloudflare plan becomes £4.00.
- **€1 = £0.86** (**A**, not verified).
- **All prices exclude VAT.** A UK individual will usually pay 20% on top (**A**; each provider's VAT
  treatment was not checked). For example, the $5 Workers Paid plan is about £4.50 including VAT.

---

## Revision 3: what the locked decisions changed

The architecture, hosting choice and costs are **unchanged**. The decisions mainly change how building
works and how the release is tested.

| Decision                                                                                      | Effect on this plan                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q8-D:** full simultaneous co-building in v1                                                 | Per-foundation edit leases are **removed**. Instead, building edits travel at a finer grain: windows, beams, slab openings and wall-path segments become their own sub-entities, and edits to an object's settings travel as field-level patches. Concurrent edits to _different_ details always merge; the same detail resolves to the later change. The server re-checks wall/opening fit with the existing pure maths (§7). Phase 3 grows by about 2–4 weeks. |
| **Q4-C + F1-A:** add to and change anything; delete only your own                             | Every object and sub-entity records its creator. Anyone with the editor role can add and change. Only the creator (or the world owner) can delete (§7.5).                                                                                                                                                                                                                                                                                                        |
| **F2-B:** deleting your build that holds others' additions                                    | Allowed after a confirmation listing whose work will also be removed. The server checks that confirmed list against what the delete would actually remove; if something new appeared, it asks again. The same flow covers a change that would invalidate someone's addition, such as shortening a wall that has their window (§7.6).                                                                                                                             |
| **Q10/F3-C:** flight off in multiplayer worlds                                                | The flight toggle is disabled in multiplayer worlds. The server's pose check can use a tight running-speed ceiling, which makes movement validation simpler and stronger. Players scatter less, which helps interest management later.                                                                                                                                                                                                                           |
| **Q29-B:** fix terrain maths everywhere                                                       | Any cross-browser fix applies to all worlds, including single-player saves. A pre-release check lists any existing foundation that would end up in water (Phase 1).                                                                                                                                                                                                                                                                                              |
| **Q34 → R1:** smooth remote movement is a release requirement                                 | Hermite (curve) interpolation with velocities, an adaptive jitter buffer, no snapping, and animation matched to displayed speed, with measured smoothness tests (§9.5, Phase 1, Phase 4).                                                                                                                                                                                                                                                                        |
| **Q31/F4:** M4 MacBook Air + iPad Pro M4                                                      | These are the performance reference devices. No phone was named; a phone (or the lowest graphics preset as a stand-in) is tried before the first family playtest (risk R18).                                                                                                                                                                                                                                                                                     |
| **Q23/F5:** no Cloudflare account yet                                                         | Phase 1 runs entirely on the Mac (`wrangler dev`, no account). When the first cross-device test is due, you create the account with a step-by-step guide (about 5 minutes); everything after that is set up for you.                                                                                                                                                                                                                                             |
| **Q2, Q3, Q5, Q7:** admin-only world creation, owner/editor/viewer links, guests, invite-only | As already planned in revision 2.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Q11, Q13, Q14, Q22, Q24–Q28, Q32, Q33**                                                     | All match revision 2's recommended defaults; no change.                                                                                                                                                                                                                                                                                                                                                                                                          |

**Effort through the 20-player release gate** rises from 26–42 to about **36–62 developer days**
(**E**). Almost all of the increase is co-building in Phase 3.

---

## 0. Revision 2: cross-review with the independent plan

Both plans were written from the same brief on the same day without seeing each other. They
**independently reached the same primary choice and the same fallback**, which raises confidence in
the decision. Revision 2 adopts several of the other plan's safeguards, corrects facts in both
directions, and keeps the parts of revision 1 that are more specific to this codebase.

### 0.1 Where the two plans agree

- **Primary:** a hybrid design with one SQLite-backed Cloudflare Durable Object per world.
  Movement is client-authoritative; building is ordered by the server.
- **Fallback:** a Node room server (Colyseus) on an auto-stopping Fly.io Machine.
- Terrain is never sent: only seed, settings and deltas such as removed tree IDs.
- Ambient creatures stay cosmetic and local to each client in v1.
- Secure WebSockets in v1, not WebRTC or WebTransport. Peer-to-peer is rejected for the persistent
  world, and Supabase and Firebase are rejected as carriers for movement.
- Cross-browser determinism must be tested in Chromium, Firefox and WebKit.
- Scale by adding rooms first, then add interest management inside one room.

### 0.2 What revision 2 adopts from the other plan

| Topic                            | Revision 1                                     | Other plan                                                                   | **Revision 2**                                                                                                               | Why                                                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent edits                 | Last writer wins per entity; conflicts flagged | One editor per foundation (a lease)                                          | **Per-foundation edit leases, plus version-checked writes that are rejected on mismatch** (§7.6)                             | Replacing a whole record silently loses nested changes. Example: a stair adds an opening to a slab while someone else repaints the same slab; the repaint's copy has no opening, so the opening vanishes. |
| Free-plan budgeting              | Playtests expected to cost £0                  | Budget the paid plan for 20-player events; verify how quotas are counted     | **Paid by default for any month with a group session.** Free-plan playtests are a possible saving, to be verified in Phase 1 | Official docs don't say how the free daily cap counts WebSocket messages. A Cloudflare Community thread this month reports a free account blocked at about 64k adjusted requests (**F²**).                |
| World state classes              | Implicit                                       | Manifest, durable content, ephemeral shared state, personal local state      | **Adopted explicitly** (§8.10)                                                                                               | `WorldDefinition.player` is a single record. Multiplayer needs a bookmark per player.                                                                                                                     |
| Version negotiation              | `schemaVersion` only                           | Protocol, build and generator versions in the handshake                      | `hello` carries `protocolVersion`, `schemaVersion`, `generatorVersion` and a build ID                                        | During a Vercel rollout, old and new clients could otherwise generate different terrain.                                                                                                                  |
| Access                           | One invite token                               | Signed guest capability with a role and an expiry                            | **Owner, editor and viewer invite links**, plus an HMAC-signed session capability for resuming                               | Cheap to build, and it stops view-only guests from editing.                                                                                                                                               |
| World clock                      | Runs continuously from a fixed start time      | Pauses while the room is empty                                               | **Pauses while the room is empty**                                                                                           | Matches single player, where time only passes while you play.                                                                                                                                             |
| Render-loop coupling             | Pose hook in `animate`                         | Network lifetime must not depend on the render loop                          | The network session runs from socket events and its own timers. The frame loop only samples poses                            | `ThreeScene.animate` returns early while the developer panel or Mini Build editor is open (`ThreeScene.ts:3071`), and `requestAnimationFrame` stops in hidden tabs.                                       |
| Offline edits in an online world | Resend pending edits with the same batch ID    | Pause editing, or create an explicit fork                                    | **A short grace queue** (30 s or less, 50 ops or fewer), then building is disabled until reconnected. No silent merges       | Avoids replaying stale edits against a world that has moved on.                                                                                                                                           |
| Recovery fencing                 | None                                           | Room epoch                                                                   | `worldEpoch` increments on a point-in-time restore or migration. Clients with a different epoch resynchronise                | After a restore, sequence numbers go backwards.                                                                                                                                                           |
| Join limits                      | Measured 15–50 KB                              | 10 MB cap, chunked, with progress                                            | **Hard 10 MB decoded cap**, chunking above 1 MB, progress UI                                                                 | The importer allows far larger worlds than today's.                                                                                                                                                       |
| Release testing                  | 30-minute soak                                 | 4-hour soak, mass reconnect, server killed after commit but before ack       | **Adopted**                                                                                                                  | These are the failures that would spoil a real playtest.                                                                                                                                                  |
| Load test timing                 | Phase 4                                        | Measure 20 moving sockets before building persistence                        | **A 20-bot pose spike moves into Phase 1**                                                                                   | De-risks Durable Object CPU and quota accounting before the expensive work starts.                                                                                                                        |
| Server-side budgets              | Structural validation only                     | Enforce Mini Build primitive and chunk budgets and grid bounds on the server | **Adopted**, plus a foundation-overlap check                                                                                 | Cheap pure checks that keep the shared world well-formed.                                                                                                                                                 |
| CRDTs                            | Not discussed                                  | Not suitable for geometry                                                    | Explicit note in §4.4                                                                                                        | The brief asked about CRDTs.                                                                                                                                                                              |
| Effort                           | Lines of code                                  | Developer days                                                               | **Developer-day estimates per phase**                                                                                        | Easier to plan around.                                                                                                                                                                                    |
| Operations                       | Not covered                                    | Deploys drop rooms; budget alerts are not spending caps; no SLA              | **Adopted** (§8.11)                                                                                                          | Realistic expectations for a hobby-scale service.                                                                                                                                                         |

### 0.3 Fact corrections

- **Fly.io changed its pricing on 1 October 2026** (**F**). `shared-cpu-2x` with 512 MB is now
  $0.0061/h, and `shared-cpu-4x` with 1 GB is $0.0122/h. Revision 1 used older documentation figures.
  The Fly cost for regular 20-player use moves from £0.89 to **£0.94** (§6.4).
- **Hetzner CX23 at €5.49** is now confirmed by Hetzner's own price-adjustment page (**F**).
  Revision 1 relied on secondary sources.
- **SpacetimeDB:** the free tier's "~3M calls / 12.5 GB egress / 1 GB storage" are _alternative
  equivalents_ of one 2,500 TeV credit, not separate allowances. Revision 1 implied they stacked.
- **Rivet:** the free tier includes a $5 compute ceiling. At the listed rates, a 0.25 vCPU / 0.5 GiB
  actor costs about $0.035 per awake hour (**E**, §6.4).
- **Cloudflare Paid costs $5 a month even with no players.** £0 when idle requires being on the Free
  plan. This is now stated in the summary, not only in the assumptions.

### 0.4 Where revision 2 keeps its own approach, and why

- **Change detection by diffing saved state**, rather than a new command layer in every tool. Diffing
  catches every cascade without touching more than 20 mutation paths. The other plan's concerns are
  handled in §7.3:
  - **A tool-transaction guard.** Verified in code: `MoveTool.pickUp` (`MoveTool.ts:557`) _removes_
    the furniture from its manager while it is held and re-adds it on drop. A naive diff would delete
    it for everyone mid-move.
  - **A baseline rule** so that applying a remote change never echoes it back.
  - **Remote ops bypass the undo manager.**

  Explicit commands remain a later optimisation.

- **Batched binary snapshots and a detailed traffic model.** The other plan models unbatched
  80-byte updates. With batching, a client in a 20-player world downloads about 4.7 KB/s instead of
  about 7.6 KB/s.
- **Rivet as the third shortlist option, not a Hetzner VPS.** A VPS runs the same Node code as
  option 2, so it is a hosting variant of the fallback rather than a different architecture. It also
  fails the £0-idle requirement.
- **Exchange rate of $1 = £0.75**, based on the last quote found. Sensitivity to £0.80 is stated
  above.
- **Codebase-specific findings** that the other plan doesn't include:
  - measured world sizes;
  - the exact `Math` functions that threaten determinism;
  - Three.js leaking into `WorldValidation`;
  - `crypto.randomUUID` failing on LAN test addresses;
  - which settings categories to lock;
  - Vercel's WebSocket beta;
  - Cloudflare's 30-day point-in-time recovery.

---

## 1. Executive summary and recommendation

### The recommendation

**Build a hybrid multiplayer layer on Cloudflare Durable Objects: one Durable Object per shared world,
using the WebSocket Hibernation API and the object's own SQLite storage.** The game client stays where
it is (static files on Vercel) and connects to the room over a WebSocket.

- **Movement is client-authoritative.** Each browser keeps running the existing
  `FirstPersonController`, so input feels exactly as it does today. Clients send a compact pose at up
  to 10 Hz. The room batches poses into one binary snapshot per player at 10 Hz, and remote players
  are drawn with snapshot interpolation. No server-side physics is needed.
- **Building is collaborative, server-ordered and conflict-safe.** All authored content is already
  plain JSON records keyed by UUID.
  - Several people can build on the same house at once.
  - Changes travel as small operations: add, change a field, or delete. Windows, beams and slab
    openings are their own sub-entities, so adding one never clashes with someone repainting the
    wall.
  - Anyone with the editor role can add and change. Only the creator (or the owner) can delete, and
    deleting something that holds other people's additions needs a confirmation.
  - The server re-checks that windows still fit their walls, then orders, stores and broadcasts each
    change. Clients apply their own edits immediately and roll back if one is rejected.
- **Remote players move smoothly.** They are animated on every frame along curves, never in 10 Hz
  steps (release requirement R1).
- **Terrain is never sent.** Clients regenerate it from `{seed, environment, generatorVersion}`.
- **Creatures stay local in v1.** They are ambient, deterministic per cell and never saved.
- **The room code is plain TypeScript (`RoomCore`)** behind a thin Durable Object adapter. A Node
  `ws` adapter runs the same code locally, in tests, or on another host. That is the exit route.

**Fallback:** run the same `RoomCore` on a **Fly.io Machine in London that stops automatically when
idle**. This is the hosting model of shortlist option 2, with Colyseus 0.17 as an optional framework.

### Expected monthly costs (primary recommendation, ex VAT)

| Scenario                               | Plan                                                                         | Expected cost                    |
| -------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| No activity                            | Workers Free                                                                 | **£0**                           |
| Development (2 players, 20 h/month)    | Workers Free                                                                 | **£0**                           |
| Small playtest (5 players, 3 h)        | Free if Phase 1 shows the 20:1 ratio applies to the free cap; otherwise Paid | **£0** or **£3.75**              |
| One 20-player playtest (4 h)           | **Paid for that month** (recommended default)                                | **£3.75** (about £4.50 with VAT) |
| Regular use (20 players, 4 h/day × 20) | Paid                                                                         | **£3.75–£3.98**                  |
| 50 players, 4 h/day × 20               | Paid                                                                         | **£3.98–£4.54** (**E**)          |
| 100 players, 4 h/day × 20              | Paid                                                                         | **£4.20–£5.33** (**E**)          |

**Why it costs so little.** The relevant Durable Object billing facts (**F**):

- outgoing WebSocket messages are not billed;
- incoming messages bill at a 20:1 ratio;
- there are no egress charges;
- objects that can hibernate are not billed for idle time.

**The catch.** Going over a free-plan daily cap makes the room stop working rather than sending a
bill. So a month with any group session should run on the $5 plan. A paid month with no players
still costs $5, so return to Free between active periods.

### Why this beats the alternatives

- **Always-on servers** (a VPS, Colyseus Cloud from $15/month, Photon production plans) cost money
  every month, which breaks the £0-idle requirement.
- **Per-message pub/sub services** (Supabase Realtime, Firebase Realtime Database) hit hard caps at
  about 5 players. A single 20-player session costs £100 or more on paid plans.
- **Peer-to-peer with a host player:** the world disappears when the host leaves, some players need
  paid TURN relays, and browsers throttle hidden host tabs.
- **Fly.io as primary:** a close second, and cheaper at regular use (£0.94/month). It loses on idle
  cost (£0.17), on requiring a card, on operations work, and on having no built-in point-in-time
  recovery.
- **SpacetimeDB, Rivet, Nakama:** respectively a heavier rewrite under a BSL licence, a younger
  platform with partly unverified billing, or a heavyweight always-on stack.

### Biggest architectural changes

1. **A network layer** (`src/lib/game/net/`) that runs independently of the render loop. It covers
   the connection, binary pose codec, remote-player interpolation, remote avatars, clock sync, and
   sending and applying world operations.
2. **A co-building operation path for authored content.**
   - Local changes are detected by diffing `captureWorldContent()` field by field and sub-entity by
     sub-entity when revision counters move, with a guard while a tool has an edit in progress.
   - Remote changes are applied through upsert and remove calls that keep the server's ID.
   - Every object records its creator; deletes are checked against it.
   - The server re-runs the existing pure fit checks (`wallGeometryMath`, `roofOpeningMath`,
     `FoundationLocalMath`) when edits overlap.
3. **Split world state:** shared content, a manifest, ephemeral room state, and per-player bookmarks.
   This replaces the single `player` record in `WorldDefinition`.
4. **Shared clocks.** Day/night and weather are derived from a room clock that runs only while
   someone is connected. The pause menu no longer pauses the world.
5. **Owner-only world settings** (Terrain, Vegetation, Sky, Weather, World and Creatures), plus
   owner, editor and viewer roles. Flight is turned off in multiplayer worlds.
6. **A remote avatar** that moves smoothly (R1). There is currently no player body.
7. **A small Cloudflare Worker project** (`pages/Forest-Drift/server/`, proposed).

### Version one versus later

**Ships in v1:**

- invite links with owner, editor and viewer roles; only the admin creates worlds;
- smooth live movement (R1); flight off in multiplayer worlds;
- join, leave and reconnection with resume;
- **full co-building**: add and change anything, delete only your own, confirmed cascades;
- door state, tree removal, and shared day/night and weather;
- owner-only environment edits; terrain locked once published;
- persistence with point-in-time recovery, plus weekly R2 exports;
- desktop and tablet/mobile support.

**Deferred:**

- shared creature simulation;
- accounts (Firebase Auth);
- chat (players use their own voice or chat app);
- interest management (needed beyond about 30 players);
- sharding one world across several rooms;
- full server-side geometric validation (v1 re-checks only fit between overlapping edits);
- locking a building to its creator.

**Effort through the 20-player release gate:** about **36–62 developer days** (**E**, §10).

---

## 2. Existing codebase audit

### 2.1 Shape of the application

- **F** A SvelteKit 2 / Svelte 5 / Three.js 0.185 app built with `@sveltejs/adapter-static` into
  `dist/` (`vite.config.ts`). The root `build.js` (around line 414) builds it and copies it into
  `deploy_out/pages/Forest-Drift/`, which Vercel serves (`vercel.json`). **There is no server
  runtime.**
- **F** Runtime dependencies are only `three`, `simplex-noise`, `fflate`, `idb` and `midi-file`.
  **There is no networking code** — no `WebSocket`, `RTCPeerConnection` or `fetch(` in `src/`.
- **F** The code already anticipates multiplayer:
  - `README.md` line 225, "How this is prepared for eventual multiplayer";
  - `WorldRepository.ts` lines 3–14, a seam for a future `CloudWorldRepository`;
  - `WorldTypes.ts`, where `saveRevision` is meant to "detect divergence between replicas later".

  These are seams only. Replacing the repository alone is **not** enough for concurrent editing,
  because it saves whole worlds.

- **F** Touch controls exist (`src/lib/components/TouchControls.svelte`), so mobile browsers are in
  scope.
- **F** End-to-end tests run in Chromium only (`playwright.config.ts`).

### 2.2 Game loop and rendering

- **F** `ThreeScene.animate` (`ThreeScene.ts:3063`) is a single `requestAnimationFrame` loop with a
  **variable timestep**, clamped to 0.1 s. Each frame it runs, in order:
  1. weather and the day cycle;
  2. dirty flags;
  3. doors;
  4. `controller.update`;
  5. hydrology, terrain and water around the player;
  6. particles, vegetation and Mini Builds;
  7. build tools, music and creatures;
  8. lights, sky and clouds;
  9. the graphics pipeline, then render.
- **F** The loop **returns early while the developer panel or Mini Build editor is open**
  (`ThreeScene.ts:3071`). Browsers also stop `requestAnimationFrame` in hidden tabs.
  - **Consequence:** the network session must run from socket events and its own timers. The frame
    loop should only sample the local pose and drive remote avatars.
  - A player whose loop is paused is shown as "away"; they are not dropped.
- **F** Everything streams around **one position**, `controller.worldPosition`. That is fine for
  multiplayer: each client streams around its own player and only draws remote avatars.

### 2.3 Movement, physics and collision

- **F** `player/FirstPersonController.ts` contains pointer-lock look, WASD, gravity
  (`GRAVITY = 18`), jumping, a step-up sweep, and flight up to `FLY_SPEED_MAX = 600` m/s.
- **F** Collision is injected through callbacks:
  - `getSupportingSurfaceY`, from `WorldSurfaceSampler.ts:55` (terrain, foundations, slabs, stairs,
    roofs);
  - `resolveHorizontalCollision`, from walls and doors (`wallCollision.ts:67`);
  - `isMoveBlocked`, for deep water.
- **F** `worldPosition` is the true eye position. Walk-bob is applied only to the camera (class
  comment). The pose to send is therefore `worldPosition`, with feet height =
  `worldPosition.y − eyeHeight`. Bob is excluded automatically.
- **Consequence:** movement depends on the whole generated world. Running it authoritatively on a
  server would mean running terrain and building collision headless, which is too heavy for v1.
  **Movement stays client-authoritative**, with server sanity checks only:
  - finite numbers;
  - a speed ceiling that allows flight;
  - a teleport flag for respawns.
- **F** There is **no player avatar mesh.**

### 2.4 Input

- **F** Input uses `window` keyboard listeners in the tools (`BuildUndoManager`,
  `DoorInteractionController`, `FirstPersonController`, …) plus a touch layer.
- Multiplayer adds only a player list and a name UI. Text fields already suppress game shortcuts.

### 2.5 Creatures and other moving entities

- **F** `creatures/CreaturePopulationSystem.ts` spawns fauna deterministically per 64 m cell from
  `createNamedRandom(worldSeed, 'fauna-cell-v1:x:z')`.
- **F** `CreatureBehaviourSystem.ts:32` `decideCreature(state, player, …)` takes **a single player
  position**.
  - Decisions use per-creature seeded randomness.
  - Time comes from the runtime manager's local clock (`CreatureRuntimeManager.ts:60, 193`).
  - Which creatures are active depends on the local player's position and on **graphics quality**.
- **F** Ambient fauna are never saved. Only ecology settings and placed recipes persist.
- **Consequence:** creatures spawn identically on every client, but their movement diverges. They
  stay **local and cosmetic in v1**. Placed creature recipes are shared content.
- **F** Door open state lives in `DoorInteractionController.openById` (`:37`). It is runtime-only
  and not saved, which makes doors a natural first shared interactive object.

### 2.6 Procedural terrain and world generation

- **F** A world is fully described by `{seed, environment}`. The seed is hashed into 14 `mulberry32`
  generators that seed `simplex-noise`. No `Math.random()`, wall-clock time or load order is
  involved.
- **F** Trees are deterministic per cell. A removed tree is stored as
  `proceduralTreeId(cellX, cellZ)` (`TreeManager.ts:31`) in `removedTreeIds` (`WorldTypes.ts:79`).
- **F** Hydrology regenerates from the seed and settings. Weather has a seed and a logical clock.
  Lightning uses `Math.random()`, but only cosmetically.
- **Cross-browser determinism risk (F + E).** The generators call `Math.tanh`
  (`TerrainHeightSampler.ts:157`), `Math.pow` (`:254`, `:289`), and `Math.sin`, `Math.cos` and
  `Math.atan2` (`HydrologyRegionGenerator.ts:406, 481, 735` and more).
  - ECMAScript does not require these to give bit-identical results across engines. Chrome, Safari
    and Firefox can differ in the last bit.
  - The difference is invisible for heights, but it could flip **discrete** decisions such as a
    lake-rim angle or a river source.
  - This is untested today.
  - Foundations store absolute `topY` and `bottomY`. However, `ThreeScene.loadWorld` (`:1738`)
    **re-grounds** `bottomY` locally, so that field must be excluded from multiplayer diffs.
- **Graphics quality** scales view distance and creature activation. That is presentation only and
  must never feed into generation or shared coordinates. This holds today; a test should keep it so.
- **Opportunity:** walking around for several seconds adds about 3 KB to a save (README).
  **No terrain or vegetation is ever sent.**

### 2.7 Buildings and placed objects

- **F** Record types:
  - `FoundationDefinition` (`FoundationTypes.ts:41`): grid bounds, absolute Y values, material.
  - `FoundationBuildingDefinition` (`WallTypes.ts:123`): groups walls, wall paths, slabs, stairs,
    roofs, floor details and skirting runs per foundation. Openings and beams are nested inside
    walls; roof openings inside roofs.
  - `BuildingLevelDefinition`: created on demand with UUIDs (`BuildingLevelManager.ts:232, 283`).
  - `BarrierDefinition` (`BarrierTypes.ts:154`): fences and railings.
  - Also: furniture, Mini Build designs and instances (designs have at most 16 blocks), and music
    trees and plants.
- **F** **Every authored record has a client-generated UUID** (`crypto.randomUUID()` in
  `BuildingManager.ts` at lines 298, 387, 455, 530, 605 and elsewhere, and in
  `FoundationTool.ts:274`). No server ID allocation is needed.
- **F** `BuildingManager` is "the single entry point every building tool goes through". It validates
  geometry and delegates to the mesh-owning managers. Because it **generates IDs itself**
  (`addWall`, `:263`), a remote replica cannot replay calls like `addWall(params)` and get the same
  ID.
- **F** The low-level managers already accept **full definitions**:
  - `WallManager.addWall(def)`, `SlabManager.addSlab(def)`, `FoundationManager.addFoundation(def)`;
  - `FurnitureManager.add`, `BarrierManager.add`, `MiniBuildInstanceManager.add`,
    `MusicPlantManager.add`;
  - each with a matching remove method and a bulk `load()`.
- **F** **When tools change records:**
  - **Painting** changes a record only on click (`PaintTool.onPrimaryAction`). The live preview swaps
    materials on meshes only.
  - **Moving furniture** removes the record while it is held: `MoveTool.pickUp`
    (`MoveTool.ts:557`) calls `furnitureManager.remove(id)`. The drop re-adds it; cancelling restores
    the original.
  - **Rotating** furniture in place mutates the record and re-adds it.
  - **Cascades** live in `BuildingManager`: `removeWallSegment` splits a path in two, and a stair
    owns a slab opening. Foundation deletion is in `foundationDeletion.ts`.
- **F** Undo is a five-deep, local, remove-only stack (`BuildUndoManager.ts`).
- **F** `BuildingLevelManager.lockActiveFoundation` locks the targeted foundation only around an
  in-progress multi-click placement. `getActiveFoundationId()` (`:69`) returns the foundation
  currently targeted. That is the natural trigger for sending a presence hint ("Sam is working here").

### 2.8 World persistence

- **F** The pipeline is: game state → `WorldSerializer` → versioned `WorldDefinition` →
  `WorldRepository` → IndexedDB.
- **F** `WorldDefinition` (`WorldTypes.ts:97`):
  - schema version 9, `id`, `saveRevision`, `seed`, `environment`;
  - every authored collection, plus `proceduralOverrides`;
  - **exactly one `player`** — one visitor's position must not overwrite the world's.
- **F** `WorldRuntime` (`WorldSerializer.ts:46`) is a port with no Three.js.
  `captureWorldContent()` deep-clones all logical state; a save's synchronous cost is 0.20 ms
  (README).
- **F** Revision counters (`ThreeScene.getRevisionCounters`, `:2593`) let autosave detect changes
  with integer comparisons. Autosave polls every 500 ms and debounces structural changes by 2 s, up
  to 10 s.
- **F** Validation and migration already exist: `validateWorldDefinition` (`WorldValidation.ts:543`)
  with `IMPORT_LIMITS`, `WorldMigrationManager`, `.forestworld` export and import, and stale-write
  protection.
- **F** `WorldValidation` imports `three` only transitively, through `CreaturePaletteGenerator.ts`
  (`Color`) and `CreatureSurfaceNoise.ts` (`Data3DTexture`). It is otherwise plain TypeScript and can
  be reused on the server once those two imports are split out.
- **F** Measured sizes:
  - The one-house example world is **37,823 bytes** of JSON, or 14,179 bytes zipped. Its environment
    block is 2,689 bytes.
  - The README records 82 KB for 300 walls.
  - **Today's join sync is tens of kilobytes.** The importer permits far larger worlds, hence the
    10 MB cap.
- **F** Other backends on the website: Firebase Auth and Firestore (Journal, Markdown Editor and
  others) and Supabase (Group Availability). Forest Drift uses neither. Firebase Auth is the
  candidate for later accounts.

### 2.9 Clocks, pause and settings

- **F** Day/night (`ThreeScene.updateDayCycle`, `:2675`) and weather (`updateWeather`, `:2693`)
  advance locally. Both stop when `simulationPaused` is set, which `+page.svelte` does while menus
  are open (lines 207 and 323).
- **F** `settings/settingsCatalog.ts` exposes Creatures, Weather, World, Terrain, Vegetation and Sky
  categories. These edit **world-defining state live**. Graphics settings are per machine.
- **Consequences:**
  - Use a shared room clock that runs only while players are connected.
  - Pausing stops local input only.
  - World settings become owner-only and travel as `env` operations.

### 2.10 Does simulation state separate from rendering state?

**Mostly yes**, and this is the audit's strongest finding.

| Layer               | Separated? | Evidence                                                                                                                      |
| ------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Authored content    | **Yes**    | Plain definitions serialized without Three.js; meshes are rebuilt from definitions.                                           |
| Procedural world    | **Yes**    | Pure functions of seed and settings, with deltas only.                                                                        |
| Player pose         | Partly     | Position, yaw and pitch are readable and `restoreState` exists. Velocity can be derived.                                      |
| Creatures           | Partly     | The logical map is separate from the meshes, but behaviour is tied to one player and a local clock.                           |
| Doors               | Yes        | A set of opening IDs.                                                                                                         |
| Building validation | **No**     | Lives beside the mesh-owning managers. The pure maths (`wallGeometryMath`, `slabMath`, `roofMath`, …) can be split out later. |

### 2.11 Components that assume a single player

| Component                                                          | Assumption                                  | Multiplayer change                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `ThreeScene.animate` (early return at `:3071`; paused when hidden) | Loop life equals session life               | Network runs on socket events and timers; paused players are shown as "away"       |
| Streaming (terrain, trees, grass, …)                               | Streams around the local player             | None needed                                                                        |
| `BuildingManager.add*`, `FoundationTool`                           | Generate IDs locally                        | Fine for local edits; remote ops go through the low-level managers                 |
| `MoveTool` pick-up and drop                                        | Removing a held item is invisible to others | Tool-transaction guard pauses emission until drop or cancel                        |
| `WorldAutosaveManager` / `WorldManager`                            | Whole-world writes to IndexedDB             | Server is the truth; local storage keeps a cache plus the player's bookmark        |
| `WorldDefinition.player`                                           | One player                                  | Per-player bookmarks stored server-side                                            |
| `BuildUndoManager`                                                 | Undo removes the last placement             | Undo becomes a version-checked `del` of your own entity                            |
| `loadWorld` re-grounding of `bottomY`                              | Local terrain is the truth                  | Exclude the field from diffs                                                       |
| Day cycle, weather, `simulationPaused`                             | One clock, paused by menus                  | Room clock; pause stops input only                                                 |
| Settings catalogue (world categories)                              | The player owns the world                   | Owner-only, sent as `env` ops                                                      |
| `CreatureRuntimeManager`                                           | One player position                         | v1 local; later, remote players and ownership                                      |
| `DoorInteractionController`                                        | Local door state                            | Ephemeral room state                                                               |
| Spawn                                                              | One spawn                                   | Per-player bookmark, or a shared spawn                                             |
| `crypto.randomUUID()`                                              | Secure context                              | Fallback ID generator for LAN phone testing, as `miniBuildGrid.ts:724` already has |

### 2.12 Reuse and risks found in the code

**Reuse:**

- `WorldDefinition`, the serializer, validation (limits and relationship checks) and migration;
- revision counters;
- UUIDs;
- `fflate`;
- `.forestworld` export as the backup format;
- `ThreeScene.loadWorld` as the join path.

**Risks:**

- cross-engine floating-point differences;
- validation coupled to Three.js;
- remote edit bursts rebuilding meshes on the main thread;
- tools that remove records temporarily (MoveTool);
- world settings that can be changed live;
- no avatar;
- the variable timestep, which rules out lock-step simulation.

---

## 3. Platform landscape and findings (checked 15 October 2026)

### 3.1 What changed in 2025–2026

| Development                                                                                                                                                                                                                    | Why it matters                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **F** **Hosted PartyKit is shutting down.** Its docs say "Deploys stop on 16 October and the platform shuts down on 23 October 2026". PartyServer (ISC licence, Cloudflare repo, "Work in Progress") runs on your own account. | Don't build on hosted PartyKit. PartyServer and PartySocket remain usable libraries.                              |
| **F²** **Hathora's game-server hosting closed on 5 May 2026.** Unity Multiplay also exited, and Jamsocket joined Modal.                                                                                                        | Game-hosting vendors are churning, so lock-in and exit paths matter.                                              |
| **F** **Durable Objects are on Workers Free** (SQLite-backed only; launched April 2025) with daily caps. SQLite billing started on or after 7 January 2026. Point-in-time recovery covers 30 days.                             | Stateful WebSocket rooms that cost £0 when idle.                                                                  |
| **F²** **A Cloudflare Community report** (October 2026) describes a free account blocked at about 64k adjusted requests, under the published 100k/day cap.                                                                     | Treat free-plan capacity as unverified for sessions; budget the paid plan.                                        |
| **F** **Fly.io repriced on 1 October 2026** (§6.4).                                                                                                                                                                            | Still cheap per hour; still no free tier.                                                                         |
| **F** **Vercel Functions WebSockets** entered public beta on 22 June 2026. Connections are pinned to one instance, capped at 300 s on Hobby, and need Redis for fan-out.                                                       | The current host can't run a shared room on its own.                                                              |
| **F** **WebTransport** is in Safari 26.4 (desktop and iOS), Chrome 97+ and Firefox 114+, about 91.6% of users.                                                                                                                 | A later option for unreliable datagrams. Needs an HTTP/3 endpoint; Durable Object support is unconfirmed (**U**). |
| **F** **Colyseus 0.17**: automatic reconnection, an `onDrop` hook, MIT licence.                                                                                                                                                | A mature option for a Node host.                                                                                  |
| **F** **SpacetimeDB 2.x**: TypeScript modules, BSL 1.1 licence.                                                                                                                                                                | Interesting, but a whole-stack commitment.                                                                        |
| **F** **Rivet Actors**: Apache-2.0, objects that sleep when idle, a free cloud tier.                                                                                                                                           | An open-source version of the same model.                                                                         |
| **F** **Hetzner** raised cloud prices on 15 June 2026. CX23 went from €3.99 to €5.49.                                                                                                                                          | Cheap VPSs got less cheap.                                                                                        |
| **F²** **Oracle Always Free:** allowance reportedly cut, and idle instances get reclaimed.                                                                                                                                     | Unsuitable for a rarely used server.                                                                              |

### 3.2 Candidates evaluated

| Candidate                                               | Licence                                      | Scales to zero?                                                    | Verdict                                                                 |
| ------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **Cloudflare Durable Objects** (raw API or PartyServer) | Platform is proprietary; our code stays ours | **Yes**, via hibernation                                           | **Shortlist #1**                                                        |
| **Colyseus 0.17** (self-hosted)                         | MIT                                          | Depends on the host                                                | **Shortlist #2**, on Fly.io                                             |
| **Rivet Actors / RivetKit**                             | Apache-2.0                                   | **Yes**                                                            | **Shortlist #3**                                                        |
| Hetzner VPS running option 2's code                     | n/a                                          | No (fixed £5.15/month or more)                                     | Hosting variant of the fallback; sensible beyond 100 players            |
| SpacetimeDB 2.x (Maincloud)                             | BSL 1.1                                      | Billed on energy                                                   | Ranked below the shortlist                                              |
| Nakama                                                  | Apache-2.0                                   | No (always-on server plus database)                                | Eliminated: overkill                                                    |
| Photon Realtime (JavaScript SDK)                        | Proprietary                                  | Plans are per concurrent user                                      | Eliminated: free tier is for development only, relay only, high lock-in |
| Playroom Kit                                            | Proprietary                                  | **U**                                                              | Eliminated: pricing unverified, no world persistence                    |
| Supabase Realtime                                       | Apache-2.0 / managed                         | Free projects pause (**F²**)                                       | Eliminated for movement                                                 |
| Firebase Realtime Database                              | Proprietary                                  | Yes                                                                | Eliminated for movement                                                 |
| Railway                                                 | n/a                                          | Yes, with caveats                                                  | Possible host; Hobby has a $5 floor                                     |
| Render                                                  | n/a                                          | Free tier only (about 1 minute to wake, "may restart at any time") | Eliminated for live sessions                                            |
| Cloudflare Containers                                   | n/a                                          | Yes (needs Workers Paid)                                           | Alternative Colyseus host; not needed                                   |
| Vercel WebSockets (beta)                                | n/a                                          | Yes                                                                | Eliminated: no shared room state                                        |
| Edgegap                                                 | n/a                                          | Yes                                                                | Eliminated: built for short matches; egress $0.10/GB                    |
| WebRTC peer-to-peer (Trystero etc.)                     | MIT                                          | Yes                                                                | Rejected as the primary design (§4)                                     |
| geckos.io                                               | **U**                                        | Depends on the host                                                | Eliminated: needs UDP ports                                             |
| Multisynq (formerly Croquet)                            | **U**                                        | **U**                                                              | Eliminated: needs lock-step determinism; pricing page returned 403      |
| Cloudflare Realtime SFU/TURN                            | n/a                                          | Yes                                                                | Only relevant as TURN for a peer-to-peer mode                           |

### 3.3 Eliminated candidates, explained briefly

- **Supabase Realtime** (**F**): Free allows 100 messages/s and 2M messages/month. Each broadcast
  counts once for the send plus once per recipient. 20 players at 10 Hz therefore count as about
  **4,000 messages/s**. One 4-hour session costs about **£118** on Pro. Free projects also pause
  after a week of inactivity (**F²**).
- **Firebase Realtime Database** (**F**): Spark allows 100 connections and 10 GB/month of downloads.
  Blaze charges $1/GB. Regular 20-player use costs about **£157/month**.
- **Photon** (**F**):
  - The free 20-user plan is "For Development Only".
  - Production costs $95 upfront for 12 months of 100 users.
  - It is a relay only, so persistence needs a second backend.
  - The other plan cites Photon's FAQ saying traffic counts in both directions (not re-checked,
    **U**).
- **Nakama** (**F**): needs Postgres or CockroachDB and an always-on server. No clear managed price
  was found.
- **Colyseus Cloud** (**F**): from $15/month, fixed. Self-hosted Colyseus stays on the shortlist.
- **Render free** (**F**): spins down after 15 minutes, takes about a minute to wake, may restart at
  any time, and has no persistent disk.
- **Oracle Always Free** (**F²**): an idle game server would be reclaimed.
- **Hosted PartyKit** (**F**): shutting down this month.

---

## 4. Networking architectures compared

### 4.1 The five architectures

- **A. Authoritative server:** the server simulates movement and collision; clients send inputs.
- **B. Client-authoritative relay:** clients own their own entities and the server forwards state.
- **C. Peer-to-peer / host:** one player's browser acts as the server, over WebRTC.
- **D. Hybrid:** clients own movement; the server orders and persists the world.
- **E. Scale-to-zero rooms:** a deployment model for A, B or D, where a room exists only while
  players are present.

| Criterion             | A. Authoritative                                        | B. Relay                                                  | C. P2P / host                                                 | **D. Hybrid (recommended)**                             | E. Scale-to-zero (deployment of D)                      |
| --------------------- | ------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| Fit with our code     | **Poor**: collision needs the whole world on the server | Good                                                      | Good (the host already has the world)                         | **Very good**                                           | Same as D                                               |
| Hosting cost          | Highest                                                 | Low                                                       | £0, plus TURN                                                 | Low                                                     | **£0 idle**                                             |
| Latency feel          | Needs prediction and reconciliation                     | Local player instant                                      | Same as B                                                     | Same as B; edits applied optimistically                 | Wake-up: milliseconds (Durable Object) to seconds (Fly) |
| Host disconnects      | Good                                                    | Good                                                      | **Poor**: world ends with the host; hidden tabs are throttled | Good                                                    | Good                                                    |
| NAT and firewalls     | None                                                    | None                                                      | **Real**: some players need TURN                              | None                                                    | None                                                    |
| Consistency           | Strongest                                               | Weak for shared objects                                   | Host orders everything                                        | **Strong for the world; eventual for poses**            | Same                                                    |
| Cheating              | Strongest protection                                    | Weakest                                                   | Host can cheat                                                | Pose checks, ownership, rights, roles; fine for friends | Same                                                    |
| Persistence           | Server                                                  | Needs a separate store                                    | Host's IndexedDB only                                         | **Server SQLite plus point-in-time recovery**           | Same                                                    |
| Complexity            | Very high                                               | Low                                                       | Medium–high                                                   | **Medium**                                              | Low extra                                               |
| 20 / 50 / 100 players | Yes, at high CPU                                        | Yes / with interest management / with interest management | Yes / marginal / no (a 20-player mesh needs 190 links)        | Yes / yes / yes, with interest management then sharding | Same                                                    |

**Verdict: D on E.**

- **A** is deferred until gameplay needs anti-cheat or shared physics.
- **B alone** doesn't protect persistent edits.
- **C** can't host a persistent shared world. It could later be an optional private-session mode.

### 4.2 Movement inside the hybrid design

- **The local player needs no client prediction:** its pose is authoritative, so nothing needs
  reconciling.
- "Prediction" applies to building ops (optimistic, with rollback) and doors.
- Remote players use **snapshot interpolation** with a 100–150 ms buffer and **extrapolation** for at
  most 250 ms.
- Poses are "latest state wins". Stale poses are dropped rather than queued during an outage.
- Durable commands are ordered and idempotent. **Keeping these two semantics separate is essential.**

### 4.3 100 players in separate rooms versus 100 in one world

| Aspect                                        | 100 across 5 worlds of 20                | 100 in one world, spread out                                   | 100 in one world, **crowded at spawn**                                            |
| --------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Server shape                                  | 5 independent rooms                      | 1 room with interest management                                | 1 room; radius-based interest management doesn't help                             |
| Fan-out                                       | O(20²) per room                          | O(nearby)                                                      | O(100²) unless capped. Use the **K-nearest players at full rate**, others at 1 Hz |
| Client download                               | ~4.7 KB/s                                | ~6.5 KB/s (**E**)                                              | ~6.5 KB/s with the K-nearest cap (§6.2); avatar GPU cost becomes the limit        |
| Single-object limit (1,000 req/s soft, **F**) | Far below                                | 100 × 10 Hz = 1,000/s worst case; ~500/s with adaptive sending | Same; load-test it                                                                |
| Cost on Cloudflare                            | Same money (billed per incoming message) | Same                                                           | Same; **the cost is CPU and engineering, not the bill**                           |
| Cost on egress-priced hosts                   | Linear                                   | Fine with interest management                                  | Naive fan-out costs about £86/month on Fly                                        |

- If several rooms are copies of **the same** editable world, they are not independent. They need
  one content authority or explicit forks.
- **Plan:** add more worlds first. Then add K-nearest interest management with rate tiers. Shard a
  single world into regions only if load tests show one object is saturated.

### 4.4 CRDTs (Yjs and similar)

- CRDTs are good for text, annotations and independent metadata.
- They do **not** prevent an opening pointing at a deleted wall, or a stair losing the slab cut it
  needs. Server transactions with sub-entities, field revisions and fit checks are simpler and safer for geometry.
- Possible later uses: world notes, signs, chat. Y-PartyServer exists for that.

---

## 5. Shortlist and ranking

### 5.1 Option 1: hybrid world rooms on Cloudflare Durable Objects (recommended)

| Item         | Detail                                                                                                                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture | D on E. One `WorldRoom` object per world (`idFromName(worldId)`), created with `locationHint: 'weur'` (best effort; not a London guarantee).                                                                                                                                                                                 |
| Framework    | A small `RoomCore` in plain TypeScript, plus a Durable Object adapter using the Hibernation API. PartyServer is an optional wrapper; PartySocket is an optional reconnection helper on the client.                                                                                                                           |
| Host         | Workers Free for idle and development months; Workers Paid ($5) for months with sessions. The client stays on Vercel.                                                                                                                                                                                                        |
| Why it suits | £0 idle; stateful rooms without servers to manage; SQLite with 30-day point-in-time recovery; TypeScript end to end; free fan-out and egress.                                                                                                                                                                                |
| Connection   | 1. An invite link `?mp=<worldId>#invite=<role token>`. 2. An HTTP snapshot. 3. WebSocket `hello`, carrying versions, the token and `lastSeq`. 4. A signed session capability for resuming.                                                                                                                                   |
| Movement     | Client-authoritative 24-byte binary pose, adaptive up to 10 Hz. Batched 10 Hz snapshots. Interpolation 120 ms behind.                                                                                                                                                                                                        |
| Terrain      | `{seed, environment, generatorVersion}` sent once. A cross-browser determinism hash test runs in CI.                                                                                                                                                                                                                         |
| Buildings    | Full co-building: sub-entities and field-level patches, creator-based delete rights, confirmed cascades, server fit re-checks where edits meet, server sequence numbers, optimistic apply with rollback (§7).                                                                                                                |
| Persistence  | SQLite tables for manifest, entities (including sub-entities, with creators), ops, players and dedupe. Point-in-time recovery (30 days) plus weekly portable exports.                                                                                                                                                        |
| Costs        | £0 for idle and development; £3.75 for a playtest month; £3.75–£3.98 regular; £3.98–£4.54 at 50; £4.20–£5.33 at 100 (§6).                                                                                                                                                                                                    |
| Main risks   | Free-plan cap enforcement (**F²**/**U**); whether the free 10 ms CPU limit applies to object messages (**U**); one object is single-threaded; co-building edge cases (topology changes, clashing additions) need thorough convergence tests; lock-in, mitigated by `RoomCore`; the 2 MB row limit, so storage is per entity. |
| Difficulty   | Medium–high. About 36–62 developer days to the 20-player gate (**E**), mostly co-building in Phase 3.                                                                                                                                                                                                                        |
| Path to 100  | Adaptive sending, then K-nearest interest management, then more worlds, then region rooms for poses.                                                                                                                                                                                                                         |

### 5.2 Option 2: Colyseus 0.17 on an auto-stopping Fly.io Machine in London

| Item         | Detail                                                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture | D on E. A Node process; Fly Proxy starts the Machine on demand and stops it when idle. Whether an open WebSocket counts as load is **U**. Drain rooms explicitly before stopping. |
| Framework    | Colyseus 0.17 (MIT), or the same `RoomCore` through a `ws` adapter.                                                                                                               |
| Host         | `lhr`; `shared-cpu-2x` with 512 MB at **$0.0061/h** (**F**, October 2026 pricing; London-specific price **U**). A 1 GB volume.                                                    |
| Persistence  | SQLite on the volume. One volume is not high-availability, so external backups and restore drills are needed.                                                                     |
| Costs        | Idle **£0.17**; development £0.26; regular £0.94; 50 players £2.09; 100 players £3.72 with an efficient protocol (about £86 naive). No free tier; a card is required (**F**).     |
| Risks        | Auto-stop behaviour with open sockets; cold-start time (**U**); volume recovery; operations work.                                                                                 |
| Difficulty   | Medium. Colyseus helps with rooms and reconnection; deployment is more work.                                                                                                      |
| Path to 100  | A bigger Machine, Redis presence across processes, interest management. A VPS is the predictable-cost variant at higher scale.                                                    |

### 5.3 Option 3: Rivet Actors (Rivet Cloud free tier, or self-hosted)

| Item         | Detail                                                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture | D on E. One actor per world. Actors "sleep when idle, wake on the next request with state intact" (**F**). WebSockets and SQLite are built in.                                                              |
| Host         | **Free**, with hard caps: 100,000 awake actor-hours, 100 GB egress, 5M writes, $5 compute ceiling (**F**). **Hobby:** $20/month plus usage. Rivet is self-hostable under Apache-2.0.                        |
| Costs        | £0 for idle, development and playtests. Regular use £0 if compute stays within the ceiling (a 0.25 vCPU actor for 80 h is about $2.79, **E**). At 100 players egress exceeds 100 GB, so Hobby: £15 or more. |
| Risks        | A young platform that has pivoted before; where actor code runs on Rivet Cloud and whether compute is billed on allocation are **U**.                                                                       |
| Path to 100  | The Hobby plan, then sharding by actor.                                                                                                                                                                     |

### 5.4 Weighted scores

Scores are 0–10 judgements (**E**). In revision 2, the Durable Object cost score drops from 10 to 9
because of the free-plan uncertainty and the $5 step for active months.

| Option                                     | Cost, esp. £0 idle (30%) | Fit (20%) | Reliability and UX (20%) | Ease (15%) | Scale (10%) | Lock-in (5%) |  **Total** |
| ------------------------------------------ | -----------------------: | --------: | -----------------------: | ---------: | ----------: | -----------: | ---------: |
| **1. Cloudflare Durable Objects (hybrid)** |                        9 |         8 |                        8 |          8 |           7 |            5 |   **8.05** |
| 2. Colyseus on Fly.io (auto-stop)          |                        8 |         8 |                        7 |          7 |           8 |            9 |   **7.70** |
| 3. Rivet Actors                            |                        8 |         8 |                        6 |          7 |           8 |            8 |   **7.45** |
| P2P host-authoritative                     |                        9 |         9 |                    **4** |          5 |       **3** |            9 |       6.80 |
| Colyseus Cloud                             |                        4 |         8 |                        8 |          8 |           8 |            7 |       6.75 |
| Colyseus on a Hetzner VPS                  |                        5 |         8 |                        7 |          6 |           8 |            9 |       6.65 |
| Photon plus a separate store               |                        6 |         5 |                        8 |          6 |           7 |            2 |       6.10 |
| SpacetimeDB Maincloud                      |                        6 |         5 |                        7 |          5 |           9 |            4 |       6.05 |
| Supabase / Firebase as a pose bus          |                      0–2 |         7 |                        5 |          8 |           3 |          4–6 | Eliminated |

- **Cross-check:** the other plan scored Durable Objects 86/100, Fly 78 and VPS 65. The ordering of
  the top two is identical.
- **Overrides:**
  - Peer-to-peer can't be the persistent world, whatever its score.
  - Supabase and Firebase fail on hard limits.
  - If gameplay ever needs strong anti-cheat or authoritative creatures from day one, choose option 2
    and budget time to build a headless simulation.

### 5.5 Decision

- **Primary: Option 1.**
- **Fallback:** a Fly.io auto-stopping Machine running `RoomCore` through a Node `ws` adapter, with
  Colyseus optional.
- **Switch to the fallback if any of these happen:**
  - Cloudflare limits or billing change materially;
  - the Phase 1 load spike shows one object can't hold 20 moving players with tick work under about
    1 ms;
  - gameplay requires server simulation.

---

## 6. Cost modelling

### 6.1 Assumptions

| #   | Assumption                                                                                                                                                                                      | Tag   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| A1  | **Worst case:** everyone moves 100% of the time at 10 Hz. This is the capacity case.                                                                                                            | A     |
| A2  | **Expected case:** players move 60% of the time with adaptive sending at about 5 Hz, i.e. about 3 messages/s per player. The other plan assumed 5/s; both give nearly the same paid-plan cost.  | A     |
| A3  | Pose message: 24 bytes. Snapshot: 6-byte header plus 20 bytes per player entry.                                                                                                                 | E     |
| A4  | About 80 bytes of wire overhead per WebSocket message sent alone (TCP/IP 52, TLS 22, frame 2–6).                                                                                                | E     |
| A5  | Naive design: a ~120-byte JSON pose relayed individually to every other player.                                                                                                                 | E     |
| A6  | Interest management at 50–100 players: the **K = 20 nearest** players at 10 Hz, everyone else at 1 Hz. This also holds when everyone is crowded at spawn.                                       | A     |
| A7  | Building ops: about 1 every 5 s while building, ~400 bytes each. Join snapshot: 15–50 KB today, hard cap 10 MB. Both are under 1% of traffic.                                                   | E     |
| A8  | One awake room is billed at 0.125 GB, so 450 GB-s per hour (128 MB, **F**).                                                                                                                     | F + E |
| A9  | Heartbeat every 30 s, i.e. 120 messages per player-hour. Presence hints are sent only when your build target changes (typically under 0.2/s); negligible.                                       | A     |
| A10 | All prices exclude VAT.                                                                                                                                                                         | A     |
| A11 | Workers Paid costs $5 in every month it is active, even with no players.                                                                                                                        | F     |
| A12 | **How the free daily cap counts WebSocket messages is unverified.** Two cases are modelled: (a) the cap uses the 20:1 billing ratio; (b) it counts raw messages, as the forum report may imply. | U     |

### 6.2 Traffic per player-hour

**Server to each client:**

| Players | Efficient (binary, batched, K-nearest)      | Naive (JSON relay of every message) |
| ------: | ------------------------------------------- | ----------------------------------- |
|       2 | 10 × (6+20+80) = 1,060 B/s = **3.8 MB/h**   | 2,000 B/s = **7.2 MB/h**            |
|       5 | 1,660 B/s = **6.0 MB/h**                    | 8,000 B/s = **28.8 MB/h**           |
|      20 | 10 × (6+380+80) = 4,660 B/s = **16.8 MB/h** | 38,000 B/s = **136.8 MB/h**         |
|      50 | 4,860 + 666 = 5,526 B/s = **19.9 MB/h**     | 98,000 B/s = **352.8 MB/h**         |
|     100 | 4,860 + 1,666 = 6,526 B/s = **23.5 MB/h**   | 198,000 B/s = **712.8 MB/h**        |

- **Client to server:** about 104 B per pose, so about 1 KB/s at 10 Hz.
- At 100 players, a naive client parses about 990 JSON messages a second, a real cost on phones. The
  efficient design delivers 10 binary messages a second.

### 6.3 Scenario volumes (worst case)

| Scenario                  | Player-hours | Room-hours | Incoming messages (worst / expected) | Egress, efficient | Egress, naive |
| ------------------------- | -----------: | ---------: | -----------------------------------: | ----------------: | ------------: |
| No activity               |            0 |          0 |                                    0 |                 0 |             0 |
| Development               |           40 |         20 |                        1.44M / 0.44M |            153 MB |        288 MB |
| Small playtest (5 × 3 h)  |           15 |          3 |                        0.54M / 0.17M |             90 MB |        432 MB |
| Large playtest (20 × 4 h) |           80 |          4 |                        2.88M / 0.88M |           1.34 GB |      10.94 GB |
| Regular (20, 80 h)        |        1,600 |         80 |                        57.6M / 17.6M |           26.8 GB |        219 GB |
| 50 players (80 h)         |        4,000 |     80–160 |                           144M / 44M |           79.6 GB |      1,411 GB |
| 100 players (80 h)        |        8,000 |   80–400\* |                           288M / 88M |            188 GB |      5,702 GB |

\* Up to 400 room-hours if poses are later split across one world room plus four region rooms.
Expected-case egress is about 0.6–0.7 times worst case.

### 6.4 Costs per candidate (monthly, GBP, ex VAT)

#### Cloudflare Durable Objects (Option 1)

**Pricing (F):**

- **Free:** 100k requests/day and 13k GB-s/day; going over means further operations fail. Caps reset
  at 00:00 UTC.
- **Paid:** $5/month minimum, including 1M requests (then $0.15 per million, rounded up) and 400k
  GB-s.
- **WebSockets:** incoming messages bill at 20:1; outgoing messages are free.
- **SQLite:** Free allows 100k rows written per day; Paid includes 50M per month.
- **Egress:** none charged.

Billable requests per player-hour are about **1,806 worst case and 550 expected**.

| Scenario       | Requests/day, 20:1 (worst / expected) | Fits Free, case (a)?       | Fits Free, case (b) raw?             | Duration                      | **Recommended cost**                 |
| -------------- | ------------------------------------: | -------------------------- | ------------------------------------ | ----------------------------- | ------------------------------------ |
| No activity    |                                     0 | Yes                        | Yes                                  | 0                             | **£0** (Free)                        |
| Development    |                           7.2k / 2.2k | Yes                        | Expected yes (44k raw/day); worst no | 900 GB-s/day                  | **£0** (Free, with adaptive sending) |
| Small playtest |                            27k / 8.3k | Yes                        | **No** (165k raw)                    | 1,350 GB-s                    | **£0** if (a), else **£3.75**        |
| Large playtest |                            144k / 44k | Expected only              | **No**                               | 1,800 GB-s                    | **£3.75** (Paid for that month)      |
| Regular use    |                            144k / 44k | Expected only, no headroom | No                                   | 36,000 GB-s (included)        | **£3.75–£3.98** ($5.00–$5.30)        |
| 50 players     |                           361k / 110k | No                         | No                                   | Included                      | **£3.98–£4.54** ($5.30–$6.05)        |
| 100 players    |                           722k / 220k | No                         | No                                   | Up to 180,000 GB-s (included) | **£4.20–£5.33** ($5.60–$7.10)        |

- Storage is kilobytes.
- Row writes are about 3 per op, plus one per affected sub-entity. Never persist poses per tick; save the bookmark on
  disconnect.
- Naive and efficient designs cost the same money here, but not the same CPU.
- **Free-plan quotas are account-wide** (**F**, Workers limits). If the Cloudflare account hosts
  other Workers, they share the caps (**U** whether it does).

#### Fly.io with Colyseus or `RoomCore` (Option 2 and the fallback)

**October 2026 pricing (F):**

- `shared-cpu-1x` / 256 MB: $0.0030/h.
- `shared-cpu-2x` / 512 MB: $0.0061/h.
- `shared-cpu-4x` / 1 GB: $0.0122/h.
- Stopped rootfs: $0.15/GB-month. Volumes: $0.15/GB-month, billed on provisioned size.
- Egress in North America and Europe: $0.02/GB.
- First 10 GB of snapshots free; shared IPv4 free; no free tier.

Idle cost (0.5 GB rootfs plus a 1 GB volume) is $0.225 (**E**).

| Scenario                  | Machine                               | Compute      | Egress (efficient / naive) | **Total, efficient** | Total, naive |
| ------------------------- | ------------------------------------- | ------------ | -------------------------- | -------------------- | ------------ |
| No activity               | Stopped                               | $0           | $0                         | **£0.17**            | £0.17        |
| Development               | shared-cpu-2x / 512 MB                | 20 h → $0.12 | $0.003 / $0.006            | **£0.26**            | £0.26        |
| Small playtest (marginal) | same                                  | 3 h → $0.018 | $0.002 / $0.009            | **£0.02**            | £0.02        |
| Large playtest (marginal) | same                                  | 4 h → $0.024 | $0.027 / $0.22             | **£0.04**            | £0.18        |
| Regular use               | same                                  | 80 h → $0.49 | $0.54 / $4.38              | **£0.94**            | £3.82        |
| 50 players                | shared-cpu-4x / 1 GB                  | 80 h → $0.98 | $1.59 / $28.22             | **£2.09**            | £22.07       |
| 100 players               | shared-cpu-4x / 1 GB (capacity **E**) | $0.98        | $3.76 / $114.04            | **£3.72**            | **£86.43**   |

#### Rivet Cloud (Option 3)

**Rates (F):** $0.0000330 per vCPU-second plus $0.0000029 per GiB-second. Free compute is capped at
$5/month. Hobby is $20/month plus usage.

| Actor size          | Cost per awake hour (**E**) | 80 h                 |
| ------------------- | --------------------------: | -------------------- |
| 0.25 vCPU / 0.5 GiB |                      $0.035 | $2.79 (fits Free)    |
| 1 vCPU / 0.5 GiB    |                      $0.124 | $9.92 (exceeds Free) |

- **Monthly costs:** idle, development and playtests **£0**. Regular use **£0** with a small actor.
  At 50 players egress (79.6 GB) is near the 100 GB cap, so plan for Hobby at **£15**. At 100 players:
  **£15 or more**.

#### Reference costs (not shortlisted)

| Option                                         | Idle                     | Development                            | 20-player playtest                      | Regular 20                                        | 50 / 100                                                       |
| ---------------------------------------------- | ------------------------ | -------------------------------------- | --------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| Hetzner CX23 (€5.49 **F** + €0.50 IPv4 **F²**) | **£5.15** fixed          | £5.15                                  | £5.15                                   | £5.15 (20 TB traffic included)                    | £5.15; about £6.10 with the server backup add-on (+20%, **U**) |
| Railway Hobby (**F** rates)                    | $5 floor → **£3.75**     | £3.75                                  | £3.75                                   | £3.75 (about $2.27 usage, inside the $5)          | ~£3.75–£6                                                      |
| Colyseus Cloud (**F**)                         | **£11.25** fixed         | £11.25                                 | £11.25                                  | £11.25                                            | £11.25+                                                        |
| Photon Realtime (**F**)                        | £0 (development only)    | £0                                     | Free tier not allowed for production    | $95 per 12 months ≈ **£5.94/month**, plus a store | 500 users: $95/month ≈ £71                                     |
| SpacetimeDB Maincloud (**F** tiers)            | £0                       | £0, using about half the shared credit | Worst case exceeds the 2,500 TeV credit | **£18.75** (Pro $25)                              | £19–£40 (**E**)                                                |
| Supabase Realtime (**F**)                      | £0 (pauses after a week) | Rate-capped                            | **≈£118** on Pro                        | ≈ £2,170                                          | Not viable                                                     |
| Firebase Realtime Database (**F**)             | £0                       | £0                                     | ≈ £8 on Blaze                           | ≈ £157                                            | Not viable                                                     |

### 6.5 Hidden costs and constraints

- **Cloudflare:**
  - Free-plan overage is a **hard failure**. Run playtest months on Paid, and keep an in-room usage
    meter that warns at 70% of the daily cap.
  - Paid costs $5 even when idle. Downgrading requires having no key-value-backed object namespaces,
    which we won't have.
  - Budget alerts are notifications, not spending caps.
  - Deploying new server code restarts rooms and drops sockets (**E**). Clients reconnect, but avoid
    deploying during sessions.
  - A custom domain needs the DNS zone on Cloudflare (**U** for xanderwiles.com); `*.workers.dev`
    works without it.
  - The free 10 ms CPU limit for object messages is **U**. Keep handlers under 1 ms and precompute
    snapshots.
- **Fly:** a card is required; the volume costs money while stopped; minimum-invoice policy **U**;
  restores and recovery are our job.
- **TURN** (only for a future peer-to-peer mode): $0.05/GB. The SFU page states a 1,000 GB shared free
  allowance; the TURN page says it's free only alongside the SFU. **The pages conflict (U).**
- **Engineering time** is the largest real cost of every option.

### 6.6 Automatic stop and start

| Service                    | Stops when idle                                                                    | Starts when players arrive           | Notes                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| Cloudflare Durable Objects | **Yes**: hibernates about 10 s after the last event if no timers (**F²** for 10 s) | **Yes**                              | Sockets stay connected; no duration billed. Paid plan fee still applies |
| Fly.io                     | **Yes**: auto-stop "every few minutes" (**F**)                                     | **Yes**: auto-start                  | Treatment of open sockets **U**                                         |
| Railway                    | **Yes**: 5–10 min after the last outbound packet (**F**)                           | Yes; the first request may get a 502 | Hobby floor still applies                                               |
| Render (Free)              | After 15 min                                                                       | About 1 minute                       | Unsuitable                                                              |
| Hetzner                    | Only through scripts                                                               | Needs a control plane                | Powered-off servers are still billed                                    |
| Rivet                      | **Yes**                                                                            | **Yes**                              |                                                                         |

---

## 7. Multiplayer building: full co-building (locked: Q4-C, Q8-D, F1-A, F2-B)

### 7.1 Options compared, and the decision

| Criterion         | A. Save-to-publish                                     | B. Live sync with foundation leases          | **C. Full co-building (chosen)**                                                       |
| ----------------- | ------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Experience        | Others see changes only after a publish                | One builder per foundation at a time         | Several people build on the same house at once                                         |
| Effort (**E**)    | 3–5 days                                               | 12–20 days                                   | **22–40 days** (Phase 3)                                                               |
| Consistency       | Whole-world publishes can clobber other people's edits | Leases prevent clashes by preventing overlap | Sub-entities and field-level patches merge different details; same detail → later wins |
| Fit with the code | Uses export and import as-is                           | Whole-record operations                      | Nested parts already have their own IDs; fit checks are already pure maths (**F**)     |

- **Option A** is used only as the Phase 1 bootstrap (owner publishes, others load it read-only).
- **Option B** was the revision 2 recommendation. It was replaced by your choice of full co-building.

### 7.2 Data model: entities and sub-entities

The wire and storage model splits today's nested records into rows that can be edited separately.
The client still receives today's nested shapes, so `ThreeScene.loadWorld` is unchanged.

**Top-level entities** (one row each):

- `foundation` and `buildingLevel`;
- the building parts `wall`, `wallPath`, `slab`, `stair`, `roof`, `floorDetail` and `skirtingRun`;
- `barrier`, `furniture`, `miniBuildDefinition` and `miniBuildInstance`;
- `musicTree`, `musicPlant`, `removedTree` and `placedCreature`.

**Sub-entities** (own row, with a `parent`). All of these **already have their own `id`** today (**F**):

| Sub-entity    | Parent        | Today's type                                                        |
| ------------- | ------------- | ------------------------------------------------------------------- |
| `wallOpening` | `wall`        | `WallOpeningDefinition` (windows and doors)                         |
| `wallBeam`    | `wall`        | `WallBeamDefinition`                                                |
| `pathSegment` | `wallPath`    | `WallPathSegmentDefinition` (has its own `material` and `openings`) |
| `pathOpening` | `pathSegment` | `WallOpeningDefinition`                                             |
| `slabOpening` | `slab`        | `SlabOpeningDefinition` (stair-owned ones carry `sourceStairId`)    |
| `roofOpening` | `roof`        | `RoofOpeningDefinition` (extends `WallOpeningDefinition`)           |

**Fields:**

- Each entity's own settings (material, height, thickness, style, position, rotation, closed, …) can
  be changed one field at a time.
- Arrays without IDs are treated as **one field**: `WallPathDefinition.points` and
  `BarrierDefinition.points`.
- Every row stores:
  - `createdBy`, the player who added it;
  - `rev`, bumped on every change;
  - `fieldRevs`, which field changed in which revision and by whom (used for "Sam changed this"
    notices).

### 7.3 The operation model

```ts
type EntityKind =
	| 'foundation'
	| 'buildingLevel'
	| 'wall'
	| 'wallPath'
	| 'slab'
	| 'stair'
	| 'roof'
	| 'floorDetail'
	| 'skirtingRun'
	| 'barrier'
	| 'furniture'
	| 'miniBuildDefinition'
	| 'miniBuildInstance'
	| 'musicTree'
	| 'musicPlant'
	| 'removedTree'
	| 'placedCreature'
	// sub-entities
	| 'wallOpening'
	| 'wallBeam'
	| 'pathSegment'
	| 'pathOpening'
	| 'slabOpening'
	| 'roofOpening';

type WorldOp =
	| { op: 'add'; kind: EntityKind; id: string; parent?: string; data: unknown } // place
	| {
			op: 'patch';
			kind: EntityKind;
			id: string;
			fields: Record<string, unknown>; // only the changed fields
			seen: Record<string, number>;
	  } // field revisions this edit was based on
	| { op: 'del'; kind: EntityKind; id: string; confirm?: string[] } // others' items the player agreed to remove (F2-B)
	| { op: 'env'; patch: Partial<WorldEnvironmentDefinition> }; // owner only

interface OpBatch {
	batchId: string;
	ops: WorldOp[];
} // atomic; batchId is the idempotency key
interface OpCommit {
	seq: number;
	worldEpoch: number;
	by: string;
	batchId: string;
	ops: (WorldOp & { rev: number })[];
	overwritten?: { kind: EntityKind; id: string; field: string; previousBy: string }[];
	checksum: string;
}
```

**How the brief's vocabulary maps onto these operations:**

| Brief term                    | Operation                                                              |
| ----------------------------- | ---------------------------------------------------------------------- |
| `placeObject`                 | `add` with a new UUID                                                  |
| `moveObject` / `updateObject` | `patch` of the changed fields (position, rotation, material, style, …) |
| `deleteObject`                | `del`, with `confirm` when other people's additions go too             |
| `removeProceduralTree`        | `add removedTree`                                                      |
| `publishAsset`                | `add miniBuildDefinition`, in the same batch as its first instance     |
| `setDoorState`                | A separate ephemeral message (§9.2)                                    |

A typical edit is tiny. Adding a window sends one `add wallOpening` of about 200 bytes; repainting a
wall sends one `patch` of about 100 bytes.

### 7.4 Generating ops: state diff at field level, with a tool-transaction guard

1. **Watch the counters.** `WorldOpFeed` watches the summed `structural` and `procedural` revision
   counters (integer comparisons).
2. **Guard.** Emission is paused while a tool has an **open transaction**. Initially that means
   `MoveTool` holding an item (it removes the record on pick-up, `MoveTool.ts:557`) and any drag in
   progress. `BuildToolManager` exposes `isTransactionOpen()`, and Phase 3 audits every tool for
   temporary removals.
3. **Collect and diff.** When the counters change and no transaction is open, wait about 50 ms to
   collect the whole action (a stair plus its slab opening, a split wall path). Then call
   `captureWorldContent()` and flatten it into entities and sub-entities. Compare against the
   **baseline**, i.e. what the client believes the server holds (confirmed plus pending):
   - a new ID becomes `add`;
   - a missing ID becomes `del`;
   - changed fields become one `patch` carrying only those fields.
4. **Confirm before deleting others' work (F2-B).**
   - In multiplayer, `RemoveTool` and the foundation-deletion flow ask the replica what a delete
     would take with it before removing anything.
   - If that includes other people's items, a dialog lists them by creator ("This also removes 2
     windows Sam added and Mum's fence").
   - Only after confirmation does the local delete run. The resulting `del` ops carry the confirmed
     IDs.
   - The existing typed "Confirm Delete" step for foundations stays.
5. **Excluded fields:** `FoundationDefinition.bottomY` (re-grounded locally), `player`, the
   environment clocks, and view-distance normalisation.
6. **Safety and coalescing.**
   - **Echo safety:** applying a remote op updates the baseline too, so it is never re-emitted.
   - **Undo safety:** remote ops call managers directly, so they never enter `BuildUndoManager`.
   - **Coalescing:** drags and paint strokes produce one op, the final state after the transaction.

### 7.5 Permissions and validation

**Permissions (Q3, Q4-C, F1-A, F2-B):**

| Action                                    | Viewer | Editor                                                                                | Owner |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------- | ----- |
| Add anything, anywhere                    | No     | Yes                                                                                   | Yes   |
| Change anything (paint, move, restyle, …) | No     | **Yes**, including other people's objects (F1-A)                                      | Yes   |
| Delete something you created              | No     | Yes. If it holds other people's additions, only with a matching `confirm` list (F2-B) | Yes   |
| Delete something someone else created     | No     | **No** (Q4-C)                                                                         | Yes   |
| World settings (`env`), kick, restore     | No     | No                                                                                    | Yes   |

**Validation:**

| Check                                                                                                     | Where                                   | v1?   |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----- |
| Geometry rules for a single edit (inside foundation, minimum lengths, roof fit)                           | Client (`BuildingManager`, as today)    | Yes   |
| Structure: types, finite numbers, enums, colours, `IMPORT_LIMITS`, at most 64 KB per op                   | **Server** (`WorldValidation` per kind) | Yes   |
| Relationships: parent exists; a Mini Build instance's design exists                                       | **Server**                              | Yes   |
| Permissions table above; `confirm` list must match exactly what the delete would remove                   | **Server**                              | Yes   |
| **Fit re-checks where edits meet** (§7.6)                                                                 | **Server**, using existing pure maths   | Yes   |
| Budgets: Mini Build `primitiveBudgetPerChunk` (512) and `maxInstancesPerChunk`; foundations don't overlap | **Server**                              | Yes   |
| Rates: 20 ops/s, 200 ops/min, batches of 100 ops or fewer                                                 | **Server**                              | Yes   |
| Every geometric rule re-checked on the server                                                             | Server                                  | Later |

**Fit re-checks** use functions that already exist and import no Three.js (**F**):

- `isOpeningWithinWallBounds` and `findOverlappingOpening` (`wallGeometryMath.ts:245, 268`);
- `validateWallLength` (`:225`);
- `checkRoofOpeningFit` (`roofOpeningMath.ts:360`);
- `isBuildingGridPointInsideFoundation` (`FoundationLocalMath.ts:108`).

The server runs them whenever an op touches a parent that has sub-entities, or adds a sub-entity to a
parent. Each client checks only its own edit against what it can see, so this is what catches two
edits that are each fine alone but clash together.

### 7.6 How concurrent edits resolve

| Situation                                                                       | Result                                                                                                                                                                                          |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two people add different things (two windows in different places)               | Both kept (fresh UUIDs never clash).                                                                                                                                                            |
| Two people add things that physically overlap (two windows in the same spot)    | The later one fails the fit re-check. It is rolled back with "Sam just put a window there".                                                                                                     |
| Two people change **different** fields of one object (one paints, one restyles) | Both kept.                                                                                                                                                                                      |
| Two people change the **same** field (both paint the same wall)                 | The later change wins (server order). The earlier painter sees "Sam changed the colour of this wall" (F1-A).                                                                                    |
| Someone changes or adds to an object that was just deleted                      | Rejected as `gone`. The client rolls back with "Sam removed this".                                                                                                                              |
| Deleting your build that holds others' additions                                | Needs the confirmation (F2-B). If someone adds something between confirming and sending, the server rejects with `confirmNeeded` and the new list, and the dialog asks again.                   |
| A change that would invalidate someone else's addition (it would no longer fit) | Treated like a delete of that addition: confirmation listing whose work goes, otherwise rejected.                                                                                               |
| Topology changes (removing a wall segment splits a path in two)                 | Applied as one atomic batch (delete the old path, add the two new paths, re-parent their segments and openings). Concurrent ops that referenced the old path are rejected `gone`. This is rare. |

**Other rules:**

- **Ordering:** the server assigns `seq`; every client applies commits in that order, so all
  replicas converge.
- **Optimistic overlay:** each entity is displayed as its pending local version if there is one,
  otherwise the confirmed version. A rejection restores the confirmed version and shows a short
  notice.
- **Atomic batches:** one SQLite `transactionSync` per batch. The server commits, then broadcasts;
  the broadcast doubles as the sender's acknowledgement.
- **Presence hints** reduce clashes before they happen. While building, each player broadcasts what
  they're working on (`editing {kind, id}`, sent only when the target changes, at most 2 per second). Others see a soft outline in that player's
  colour with their name.

### 7.7 Undo

- v1 keeps today's scope: **undo removes your own last 5 placements** (`BuildUndoManager`).
- In multiplayer an undo is a `del` of your own item. If other people have added to it since, the F2
  confirmation appears.
- Undo never removes anybody else's work. The server's op log is the audit trail.
- Undoing changes such as a repaint is not in today's single-player game, and stays out of v1.

### 7.8 Reconnecting and missed changes

- Clients store `worldEpoch` and `lastSeq` per world.
- **On `hello`:**
  - same epoch, and `lastSeq` still in the retained log (the last 5,000 ops or 14 days, **A**): the
    server sends the `ops` since then;
  - otherwise: `resyncRequired`, and the client fetches a fresh snapshot.
- Pending batches are resent with the **same `batchId`**. A bounded dedupe table makes resends
  idempotent, covering the case where the server committed but the acknowledgement was lost.
- **While disconnected (Q21):** edits queue for up to 30 s or 50 ops. After that, build tools pause
  with a "Reconnecting…" banner. Long offline edits are never silently merged.
- **Checksum:** the server keeps a rolling hash over `(kind, id, rev)` and sends it with every commit
  and snapshot. A mismatch triggers a resync plus a diagnostics event.

### 7.9 Versioning

- `hello` carries `protocolVersion`, `schemaVersion`, `generatorVersion` and `buildId`.
  `generatorVersion` is bumped whenever terrain, vegetation or hydrology output changes, including
  the Q29-B maths fix.
- The world manifest pins `generatorVersion` and `schemaVersion`. Mismatched clients are told to
  refresh.
- The server accepts the current and previous `protocolVersion` during a rollout.
- Schema changes migrate stored entities with the same `WorldMigrationManager` steps, then increment
  `worldEpoch`.

### 7.10 Building: v1 versus deferred

**Ships in v1:**

- full co-building: add and change anything, delete only your own;
- sub-entities and field-level patches;
- confirmed cascades (F2-B), and fit re-checks where edits meet;
- presence hints;
- atomic batches, rollback, and undo of your own placements;
- catch-up, dedupe and checksums;
- owner-only `env`;
- doors and trees;
- Mini Build designs travelling with their first instance;
- server-side budgets and overlap checks.

**Deferred:**

- locking a building to its creator;
- every geometric rule re-checked on the server;
- a history browsing UI (point-in-time recovery covers disasters);
- undo of changes such as repaints;
- Mini Build designs edited by two people at once (the design editor is modal; the later save wins,
  with a notice).

---

## 8. Recommended architecture

### 8.1 Components

```
 Each player's browser                                   Cloudflare (Free for idle/dev months, Paid for session months)
┌───────────────────────────────────────────────┐      ┌──────────────────────────────────────────────────┐
│ Forest Drift static app (served by Vercel)    │      │ Worker  forest-drift-mp                          │
│                                               │ HTTPS│   GET  /w/:id/snapshot   (chunked, ≤10 MB)        │
│ ThreeScene (unchanged loop)                   │─────►│   POST /w               (owner: publish world)   │
│   ├─ FirstPersonController ─ sampled pose ─┐  │ WSS  │   GET  /w/:id/ws         (upgrade → room)        │
│   ├─ RemoteAvatarRenderer ◄─ interpolation ┤  │◄────►│   Origin allowlist, size and rate limits         │
│   └─ managers ◄─ WorldReplica ◄──┐         │  │      │        │ idFromName(worldId), hint 'weur'         │
│                                  │         │  │      │        ▼                                         │
│ net/ (runs on socket events and timers,    │  │      │ WorldRoom Durable Object (one per world)         │
│       not on requestAnimationFrame)        │  │      │   RoomCore (plain TS; also runs on Node `ws`)    │
│   NetSession  (versions, capability, backoff) │     │     presence, poses → 10 Hz snapshots while dirty │
│   PoseCodec / SnapshotCodec ───────────────┘  │      │     creators, roles, presence, clock             │
│   RemotePlayerStore                           │      │     ops: validate → rights/fit → seq → SQLite →  │
│   WorldOpFeed (diff + transaction guard) ─────┘      │          broadcast                               │
│   ClockSync, NetDiagnostics                   │      │   SQLite: meta | entities | ops | players |      │
│                                               │      │           batches                                │
│ IndexedDB: local worlds (unchanged)           │      │   Hibernation API, serializeAttachment, alarms   │
│            + multiplayer cache (epoch, lastSeq) │    │   Point-in-time recovery 30 days; weekly export  │
└───────────────────────────────────────────────┘      └──────────────────────────────────────────────────┘
```

### 8.2 Client integration points (proposed)

| Where                                                 | Change                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/game/net/*` (new)                            | `NetSession`, `protocol.ts` (types and codecs, shared with the server, no DOM or Three.js), `RemotePlayerStore`, `RemoteAvatarRenderer`, `ClockSync`, `WorldOpFeed`, `WorldReplica`, `PresenceHints`, `NetDiagnostics` |
| `ThreeScene.animate` (`:3063`)                        | After `controller.update`: `net?.samplePose(controller)`. Before render: update remote avatars and drain the replica queue within budget. When the loop isn't running, `NetSession` sends the away flag                |
| `ThreeScene` options                                  | Optional `multiplayer` handle. `null` means the single-player path is unchanged                                                                                                                                        |
| `updateDayCycle` / `updateWeather` (`:2675`, `:2693`) | In multiplayer, derive from the room clock; ignore `simulationPaused` for shared clocks                                                                                                                                |
| `WorldSession`                                        | Multiplayer variant: no whole-world autosave to the server; local cache of `worldEpoch`, `lastSeq` and the bookmark; flushes pending batches on `pagehide`                                                             |
| `WorldTypes` / `WorldSerializer`                      | Entity flattening helper; the multiplayer manifest and the per-player bookmark replace `player` in shared content                                                                                                      |
| `BuildToolManager`, `MoveTool`                        | `isTransactionOpen()`; presence hints (what you're working on)                                                                                                                                                         |
| `RemoveTool`, `foundationDeletion.ts`                 | Multiplayer pre-delete check: list other people's additions that would go, confirm, then send `del` with the confirmed IDs (F2-B)                                                                                      |
| `FirstPersonController`                               | Flight toggle disabled in multiplayer worlds (F3-C)                                                                                                                                                                    |
| `WorldsScreen.svelte`, `routes/+page.svelte`          | Multiplayer section (join by link, publish); read `?mp=` and `#invite=`; lazy-load `net/`                                                                                                                              |
| `settingsCatalog.ts`                                  | World categories are owner-only in multiplayer; changes become `env` ops                                                                                                                                               |
| `DoorInteractionController.ts`                        | Emit and accept door states                                                                                                                                                                                            |
| `crypto.randomUUID` sites                             | Fallback ID generator for non-secure contexts                                                                                                                                                                          |
| Low-level managers                                    | `upsert(def)` / `remove(id)` where missing                                                                                                                                                                             |
| `WorldValidation.ts`                                  | Split the creature palette and texture imports; export per-kind validators                                                                                                                                             |

### 8.3 Server layout and schema (proposed)

```
pages/Forest-Drift/server/
  wrangler.jsonc          # WORLD_ROOM binding, SQLite migration, secrets (HMAC key)
  src/worker.ts           # routing, Origin allowlist, snapshot and publish over HTTP
  src/WorldRoomDO.ts      # Durable Object adapter: hibernation, alarms, SQLite
  src/RoomCore.ts         # transport-agnostic room logic
  src/storage.ts          # schema and queries
  src/adapters/node.ts    # `ws` adapter: tests, LAN play, Fly fallback
  test/*.spec.ts
```

```
meta(key TEXT PRIMARY KEY, value TEXT)   -- worldId, name, seed, environment, schemaVersion,
                                         -- generatorVersion, worldEpoch, nextSeq, roomClock,
                                         -- ownerHash, inviteHashes{editor,viewer}
entities(kind, id, parent, created_by, rev, field_revs, data, updated_at, updated_by,
         PRIMARY KEY(kind, id))                                     -- includes sub-entities
ops(seq INTEGER PRIMARY KEY, batch_id, player_id, ts, body)          -- bounded, trimmed
players(player_id PRIMARY KEY, name, role, last_seen, bookmark)      -- per-player position
batches(player_id, batch_id, seq, ts, PRIMARY KEY(player_id, batch_id))  -- dedupe, bounded
```

Per-entity rows avoid the **2 MB SQLite row limit** (**F**).

### 8.4 Lifecycles

**Join:**

```
client                                worker / WorldRoom
  │ GET /w/:id/snapshot ─────────────────►│ wakes if hibernating; serves cached compressed snapshot
  │◄── manifest + entities + seq + worldEpoch + checksum (chunked if >1 MB; ≤10 MB decoded)
  │ check generatorVersion/schemaVersion → build WorldDefinition → ThreeScene.loadWorld()
  │ WSS /w/:id/ws ──────────────────────►│ acceptWebSocket (hibernatable)
  │ hello{protocol, schema, generator, buildId, invite|capability, playerId, name, epoch, lastSeq} ─►
  │                                       │ verify role; assign slot; serializeAttachment
  │◄── welcome{slot, role, capability, players, roomClock, doors, presence, opsSince | resyncRequired}
```

**Move:** the client sends poses, and the room keeps only the latest pose per slot. While anything is
dirty, a 100 ms tick sends each client one snapshot. When nothing has changed for 2 s, the tick stops
so the object can hibernate.

**Build:**

1. The local edit is applied immediately. A delete that would remove other people's additions asks
   for confirmation first (F2-B).
2. A batch is sent.
3. The server checks rights, confirmation lists and fit where edits meet, assigns `seq`, writes a
   transaction, then broadcasts the commit, including any "changed by" notices.

**Leave or drop:** the slot is marked "away" and a 30 s alarm is set. If the player doesn't
reconnect in time, the room sends `playerLeft` and saves their bookmark.

**Room clock:** it accumulates only while at least one player is connected. The last player leaving
stores the accumulated time; doors reset to closed for the next session (§8.8).

**Idle month:** no connections and no alarms, so there's no compute cost. Data is kilobytes.

### 8.5 Persistence and backups

| Layer                    | Mechanism                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source of truth          | SQLite in the object, written transactionally                                                                                                                                              |
| Disaster recovery        | Built-in point-in-time recovery (30 days, **F**). An owner-only admin endpoint restores and **increments `worldEpoch`**, forcing every client to resync                                    |
| Independent backup       | A weekly `.forestworld` export (only if anything changed) to R2 or a download. **One restore drill before the first public session.** Local IndexedDB is a convenience cache, not a backup |
| Publishing a local world | `POST /w` with a validated `WorldDefinition` creates a new room. The single-player copy is untouched                                                                                       |

### 8.6 Identity and access

- **v1 guests:**
  - A random `playerId` and display name, stored in `localStorage`.
  - The owner gets **two invite links**: _editor_ and _viewer_. Tokens live in the URL fragment
    (`#invite=…`), so they never appear in HTTP logs, and only their hashes are stored.
  - On join, the server issues an **HMAC-signed capability** (`worldId`, `playerId`, role, expiry,
    nonce) used to resume after a drop. The key is a Worker secret.
  - The owner is the browser that published the world; it holds an owner secret, stored hashed.
- **Hardening:** Origin allowlist (xanderwiles.com and localhost), message size caps, per-actor rate
  limits, kick, invite rotation. **Never log raw tokens.**
- **Later:** Firebase Auth (already used on the site; free to 50k MAU, **F**). The Worker would verify
  Google-issued ID tokens. This enables "my worlds on any device" and finer permissions.

### 8.7 Procedural world handling

- Send `seed`, the full `environment` and `generatorVersion` once per join.
- **Never** send terrain, vegetation, grass, plants, hydrology or clouds.
- Procedural edits travel as deltas (`removedTree` by `proceduralTreeId`).
- **CI determinism test (Phase 1):** add Playwright WebKit and Firefox projects. For three seeds,
  hash:
  - terrain heights at 10,000 points;
  - the hydrology layout over 4 km²;
  - tree IDs in 9 cells;
  - re-grounded foundation transforms.

  If engines differ, replace the offending `Math.*` calls in the generators with deterministic
  approximations. A second test asserts that graphics quality never changes generated values.

### 8.8 Creatures, doors, clocks and pause

| System      | v1                                                                                                                                                                    | Later                                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Creatures   | Local and cosmetic; placed recipes are shared                                                                                                                         | Feed remote players into `decideCreature`; then server-owned logical roots at a low tick (sending pose, intent and seed, with skeletons animated locally). Avoid making any one browser the permanent creature authority |
| Doors       | The server holds `{open, changedAt}` per opening and sends them in `welcome`. **Reset to closed when a new session starts** (as in single player, doors aren't saved) | Optionally persist                                                                                                                                                                                                       |
| Day/night   | Room clock = accumulated time while occupied. Clients compute `timeOfDay` from it                                                                                     | Owner time controls as `env`                                                                                                                                                                                             |
| Weather     | Same room clock drives the weather schedule; lightning stays random and local                                                                                         | —                                                                                                                                                                                                                        |
| Pause menu  | Freezes local input; the pose shows "away"; **the world keeps running while others are present**                                                                      | —                                                                                                                                                                                                                        |
| Music trees | Placement is shared; playback is local                                                                                                                                | Align sequencer start to the room clock                                                                                                                                                                                  |
| Flight      | **Off in multiplayer worlds** (F3-C); the server's speed check uses running speed                                                                                     | Owner toggle, if ever wanted                                                                                                                                                                                             |

### 8.9 Local development without cloud costs

- `wrangler dev` runs the Worker and object locally with SQLite, offline and free.
- The Node `ws` adapter runs `RoomCore` for Vitest and LAN sessions.
- Single player never needs the server. Multiplayer is lazy-loaded behind `?mp=`.
- Phones and the iPad on a LAN need HTTPS or the `workers.dev` endpoint (secure context).

### 8.10 State classes

| Class                      | Contents                                                                                                                                | Where it lives                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **World manifest**         | World ID, name, seed, full environment, `generatorVersion`, `schemaVersion`, `protocolVersion`, `worldEpoch`, room clock, invite hashes | `meta` table                                                                 |
| **Durable content**        | Every authored entity and procedural delta                                                                                              | `entities` table plus the op log                                             |
| **Ephemeral shared state** | Presence, latest poses, presence hints, door states                                                                                     | Memory and attachments; poses rebuilt from fresh client updates after a wake |
| **Personal local state**   | Graphics and audio settings, active tool, current storey, palette                                                                       | The player's browser (as today)                                              |
| **Personal shared state**  | Bookmark (last position and yaw), display name, role                                                                                    | `players` table, written on disconnect                                       |

### 8.11 Operations

- **Deploys:** deploying new server code restarts rooms and drops sockets (**E**). Clients reconnect
  automatically. Deploy outside sessions, and keep the previous protocol version accepted during a
  client rollout.
- **Monitoring:**
  - connections per room;
  - incoming messages per day (against the cap);
  - bytes per client;
  - handler p95 time;
  - op acceptance latency;
  - rejects, resyncs and checksum mismatches;
  - snapshot size;
  - SQLite rows and storage;
  - an estimated monthly bill.

  The data sources are Workers observability and `wrangler tail`, plus the in-game diagnostics
  overlay.

- **Expectations:** no contractual SLA on a hobby plan. Cloudflare outages and our own bugs will
  happen. The design aims for automatic reconnection and no lost acknowledged edits, not zero
  downtime.
- **Abandoned worlds:** the owner can archive or delete. Point-in-time recovery covers mistakes for
  30 days.

---

## 9. Network message and state model

### 9.1 Transport and encoding

- **Secure WebSocket (port 443)** for realtime.
- **Binary** for `pose` and `snapshot`; **JSON** for the low-frequency messages.
- **HTTP** for snapshots and publishing, compressed with `fflate`, with a chunk checksum and a hard
  maximum decoded size.
- **Backpressure:**
  - the client sends no poses while `bufferedAmount` exceeds 16 KB;
  - the server skips a client's snapshot if its socket is behind;
  - stale poses are never queued.
- **WebTransport is not used in v1:** it needs HTTP/3, Durable Object support is **U**, and
  interpolation absorbs occasional TCP stalls.

### 9.2 Message catalogue

| Direction | Name             | Encoding | Rate                                              | Payload                                                                                                                              |
| --------- | ---------------- | -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| C→S       | `hello`          | JSON     | Once                                              | `protocolVersion, schemaVersion, generatorVersion, buildId, invite \| capability, playerId, name, worldEpoch, lastSeq`               |
| S→C       | `welcome`        | JSON     | Once                                              | `slot, role, capability, players[], roomClock, doors, presence, opsSince[] \| resyncRequired, checksum`                              |
| C→S       | `pose`           | Binary   | 0–10 Hz, adaptive                                 | 24 bytes (§9.3)                                                                                                                      |
| S→C       | `snapshot`       | Binary   | 10 Hz while anything is dirty                     | Header plus changed slots                                                                                                            |
| C→S       | `ops`            | JSON     | On edit (about 50 ms batching)                    | `OpBatch`                                                                                                                            |
| S→C       | `commit`         | JSON     | Per accepted batch                                | `OpCommit`                                                                                                                           |
| S→C       | `reject`         | JSON     | Per rejected batch                                | `batchId, reason (rights \| fit \| gone \| confirmNeeded \| invalid \| role \| rate), canonical[] or the items needing confirmation` |
| C→S / S→C | `editing`        | JSON     | Only when your build target changes (at most 2/s) | `{kind, id}` presence hint, relayed to others                                                                                        |
| C↔S       | `door`           | JSON     | On toggle                                         | `openingId, open`                                                                                                                    |
| S→C       | `presence`       | JSON     | On change                                         | joined, left, away, rename                                                                                                           |
| C→S / S→C | `ping` / `pong`  | Binary   | Every 5 s at first, then every 30 s               | `clientTime` / `clientTime, serverTime` (also keeps the connection alive)                                                            |
| S→C       | `env`            | JSON     | On owner change                                   | Patch                                                                                                                                |
| S→C       | `resyncRequired` | JSON     | Rare                                              | Reason (epoch changed, log trimmed, checksum mismatch)                                                                               |
| S→C       | `notice`         | JSON     | Rare                                              | Kicked, usage warning, server restarting                                                                                             |

### 9.3 Binary layouts

**`pose`, 24 bytes:**

| Offset | Type | Field                                                                          |
| -----: | ---- | ------------------------------------------------------------------------------ |
|      0 | u8   | Message type `0x01`                                                            |
|      1 | u8   | Flags: moving, running, flying, grounded, teleport, underwater, away, building |
|      2 | u16  | Sequence number                                                                |
|      4 | u32  | Client time, ms                                                                |
|      8 | f32  | x                                                                              |
|     12 | f32  | y (feet)                                                                       |
|     16 | f32  | z                                                                              |
|     20 | u16  | Yaw                                                                            |
|     22 | i16  | Pitch                                                                          |

- `f32` gives 7.8 mm precision at 65–131 km from the origin and about 6 cm at 1,000 km.
- If needed later, positions can be made relative to a cell origin to keep precision anywhere.

**`snapshot`:**

- Header: `[0x02][count u8][serverTimeMs u32]`.
- Entries of 20 bytes each: `[slot][flags][x f32][y f32][z f32][yaw u16][pitch i16][ageMs u16]`.
- Phase 5 adds quantised deltas (about 8–10 bytes per entry), plus despawn and baseline messages
  when a player leaves or enters interest range.

### 9.4 Rates

| Item            | v1                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client pose     | Send when the prediction error exceeds 0.15 m or 3°, or when flags change. At most 10 Hz; at least 2 Hz while moving; nothing when still (after one final stopped pose) |
| Server snapshot | 10 Hz while anything is dirty; stops when idle                                                                                                                          |
| Ops             | After a 50 ms collection window, outside tool transactions                                                                                                              |
| Presence hint   | Only when your build target changes; at most 2 per second                                                                                                               |
| Clock sync      | Median offset from the last 8 ping/pong samples                                                                                                                         |

### 9.5 Interpolation and smoothing (release requirement R1)

Remote players must look as smooth as the rest of the game (Q34). Established games all use the
same technique for this: Valve's Source engine, Glenn Fiedler's "Snapshot Interpolation" and Gabriel
Gambetta's "Entity Interpolation" (links in §13).

- **Every rendered frame**, each remote avatar's position is computed afresh for
  `serverNow() − delay`. Avatars never move only when a packet arrives.
- **Buffer:** a ring of 8 snapshots per remote player.
  - The delay starts at 120 ms and adapts to 1.5 × the snapshot interval plus 2 × jitter, clamped to
    80–250 ms.
  - It changes gradually (playback stretched by up to 5%), never in jumps.
- **Curves, not straight lines.** Position uses Hermite interpolation, with velocity estimated from
  consecutive snapshots, so turns and stops look natural. Yaw takes the shortest arc with eased
  blending.
- **Extrapolation:** if the buffer runs dry, the avatar continues along its last velocity for up to
  250 ms, then eases to a stop and fades its name tag. When data resumes, it blends back over about
  150 ms; it never snaps.
- **Corrections** are blended out over a few frames. Only the teleport flag (respawn) jumps
  instantly.
- **Animation matches movement:** walk cycle and bob are driven by the avatar's displayed speed, so
  feet never slide.
- **Send rate is tuned by measurement:** baseline 10 Hz; nearby players move to 15–20 Hz if Phase 1
  shows it's needed.
- **Avatars:** instanced meshes; no bone data is sent. Target: 0.3 ms or less per frame for 20
  avatars.
- **Smoothness tests** (Phase 1 and Phase 4), on the M4 MacBook Air with 100 ms latency, jitter and
  2% loss:
  - remote positions update on 100% of rendered frames while moving;
  - frame-to-frame speed varies by less than 10% at a steady walk;
  - no snap over 10 cm except teleports;
  - walk-cycle speed is within 10% of movement speed.

### 9.6 Interest management (Phase 5) and network ownership

| Entity         | Owner                                                                       | Notes                             |
| -------------- | --------------------------------------------------------------------------- | --------------------------------- |
| Player pose    | That player's client                                                        | Server sanity clamps              |
| World entities | Server ordering; creator-based delete rights; field-level later-change-wins |                                   |
| Doors          | Server                                                                      | The last toggle wins              |
| Creatures      | v1: each client locally                                                     | Later: server-owned logical roots |

**Interest policy:** each client gets the **K = 20 nearest** players at 10 Hz, players within 250 m
at 3 Hz, and everyone else at 1 Hz.

- Players beyond `viewDistance × chunkSize` (480 m) get presence only.
- A 96 m cell grid with hysteresis keeps players from flickering in and out of range.
- Policy is independent of graphics quality.
- Because K-nearest is used rather than a radius, crowds at spawn stay bounded.
- Collision-relevant edits always reach every peer, even when the mesh is culled.

### 9.7 Join and initial sync

1. Download the HTTP snapshot (manifest, entities, `seq`, `worldEpoch`).
2. Run the existing `loadWorld` path.
3. `hello` with `lastSeq` = the snapshot's `seq`; the server returns the ops committed since.
4. `welcome` brings players, doors, presence and the room clock.
5. Spawn at your bookmark, or next to the owner's spawn.

If the op tail between snapshot and `hello` has been trimmed, the server sends `resyncRequired`.

---

## 10. Phased implementation roadmap

Each phase is releasable. **Single-player behaviour must stay identical; run the existing suites in
every phase.** Effort estimates assume one developer who knows the project (**E**).

### Phase 1: Prototype — two players see each other move (4–6 days, £0)

> **Status, 16 October 2026: built and verified locally.**
>
> - **Measurements:** `docs/multiplayer-performance.json`.
> - **Setup and deploy steps:** `server/README.md`, and the step-by-step account guide
>   `docs/2026/10-16/Multiplayer/cloudflare-setup-guide.md`.
> - **Determinism:** engines match on everything players see (23 seeds), so no terrain-maths fix is
>   needed (Q29-B stays as the rule if that changes). Only last-bit `exact` hashes differ.
> - **Room CPU per tick (task 7, measured locally):** 20 players' room logic takes 0.011 ms per tick at
>   p50 (0.14 ms p99), about 0.3–0.6 ms of CPU per second, before WebSocket send costs. Real Workers
>   numbers still need the deploy.
> - **Free-plan message counting (task 7), from Cloudflare's pricing page:** incoming WebSocket
>   messages count 20:1 against the 100,000 requests a day; outgoing messages, protocol pings and
>   auto-responses are free. A moving player is about 0.5 requests a second, so 20 players moving
>   non-stop use the free day in about 2¾ hours, and four players in about 14 hours. Still to confirm
>   against the dashboard after the first real session.
> - **Audit before Phase 2** found three gaps, all fixed in Phase 2: `net/` wasn't lazy-loaded; the
>   pause menu didn't show the player as away (Q12); and the world snapshot was open to anyone who
>   knew the world id (now invite-only, Q7).
> - **Still open:** the deploy, and the internet test on the Mac (Chrome and Safari) and the iPad.
>   Both wait for the Cloudflare account (F5).

- **Architecture:**
  - `server/` with a `WorldRoom` object using the Hibernation API, plus `RoomCore`.
  - Client `NetSession` running independently of the render loop, codecs, `RemotePlayerStore`, and
    simple avatars.
  - Version handshake.
  - Bootstrap world using **Option A** (the owner publishes; joiners load it read-only).
- **Files:**
  - `server/*` and `src/lib/game/net/*` (new);
  - `ThreeScene.ts` (two hooks);
  - `routes/+page.svelte` (`?mp=`, lazy import);
  - `world/WorldSession.ts`;
  - `playwright.config.ts` (WebKit and Firefox projects).
- **Dependencies:** `wrangler` (development dependency in `server/` only) and optionally
  `partysocket`. **No Cloudflare account is needed to start:** `wrangler dev` runs everything on the
  Mac. When the first cross-device test is due, you create the account with a guided walkthrough
  (about 5 minutes, F5), and the rest is set up for you.
- **Tasks:**
  1. Protocol and codecs, with tests.
  2. `RoomCore` slots and batching.
  3. The Durable Object adapter.
  4. Client connection and avatars.
  5. Publish and join.
  6. Cross-browser determinism hash test.
  7. **A 20-bot continuous-movement spike.** It measures room CPU per tick, handler time, and **how the
     free-plan cap actually counts messages**, settling case (a) or (b) from §6. This needs the
     Cloudflare account.
  8. **Smooth remote movement (R1):** Hermite interpolation, adaptive buffer, matched animation, and
     the smoothness tests from §9.5.
  9. **Terrain-fix pre-check (Q29-B):** if engines differ, list existing foundations, including in
     single-player saves, that the fix would put in water.
- **Risks:** determinism; how free-plan CPU and caps are enforced; camera eye height versus body
  origin.
- **Acceptance:**
  - The M4 MacBook Air (Chrome and Safari) and the iPad Pro M4 see each other moving smoothly, with
    200 ms or less of visual delay on UK connections.
  - The R1 smoothness tests pass.
  - Closing either browser doesn't end the other's session.
  - Opening the developer panel shows the player as "away", not disconnected.
  - Single-player tests pass.
  - Terrain hashes match across engines, or the differences are fixed for all worlds (Q29-B) and the
    pre-check list has been reviewed.
  - The spike results are recorded in `docs/multiplayer-performance.json`.

### Phase 2: Reliable sessions (5–8 days, £0 on Free; Paid only for shared tests)

> **Status, 16 October 2026: built and verified locally (Chromium, WebKit, Firefox).**
>
> - **Acceptance, checked:**
>   - A dropped connection resumes into the same slot, with no duplicate avatar and no leave or join
>     for others. Tested end to end in all three engines, in unit tests (a silent socket, a hidden
>     tab, the network returning), and live: a real server restart resumed in 3 s with the room clock
>     carried on.
>   - Bad tokens are refused (4007), stale builds are refused (4001), and the world can't be
>     downloaded without an invite (403). Checked live.
>   - Day/night matches across players to within 1 s of game time, and follows the owner's changes
>     (end to end).
>   - Visitors can't build. The land settings are locked for everyone online; the sky, weather and
>     time are the owner's (end to end and unit).
> - **Still open:** the iPad Pro M4 and Safari runs need the deployed server.
> - **Deliberate differences from the plan above:**
>   - _Adaptive pose rate._ Dead-reckoning thresholds would leave gaps of up to 500 ms, which R1's
>     200 ms delay can't absorb. Instead: 10 Hz while moving and visible to someone, nothing when
>     still, 1 Hz when alone, one pose when away.
>   - _Pings._ Clock pings go out 5 at 1 s, then every 30 s. Separate 10 s keep-alives are answered
>     by the runtime's auto-response, which costs nothing and doesn't wake the room. A connection
>     silent for 25 s (not counted while the tab is hidden) is replaced, and coming back to the tab
>     probes the connection within 5 s.
>   - _Clock sync_ uses the lowest-round-trip sample of the last 8 (not the median). The
>     interpolation delay is clamped to 60–300 ms.
>   - _Capability key._ It is derived from `ADMIN_SECRET` unless `CAPABILITY_SECRET` is set, so a
>     deploy needs only one secret.
>   - _Grace period._ A deliberate leave skips it. After a restart, a room that was running holds
>     its clock for 30 s in case players come back, then stops it at the last checkpoint (written
>     once a minute while occupied).
>   - _Server-side backpressure_ isn't possible: Workers WebSockets don't expose `bufferedAmount`.
>     The client still never queues poses behind a full socket.
>   - _Avatars_ are separate meshes, not instanced (+11 draw calls each). Revisit on the iPad in
>     Phase 4.
>   - _Weather._ Only the shared weather settings travel; sound volume and density stay personal.
>     Lightning stays local, as planned.

- **Architecture:**
  - Reconnection with backoff and jitter, plus capability resume and a 30 s grace period.
  - Invite roles; presence and a player list; adaptive pose rate.
  - The room clock (runs only while occupied), and pause behaviour.
  - Owner-only settings; terrain-shaping settings locked once published (Q14-A).
  - Flight disabled in multiplayer worlds (F3-C), with a running-speed server check.
  - A diagnostics overlay.
  - Origin, size and rate limits; backpressure.
- **Files:**
  - `net/ClockSync.ts`, `net/NetDiagnostics.ts`;
  - `ThreeScene.updateDayCycle` and `updateWeather`;
  - `+page.svelte`, `settingsCatalog.ts`, `WorldsScreen.svelte`.
- **Tasks:**
  1. Reconnection state machine.
  2. Alarm-based grace period.
  3. Room clock.
  4. HMAC capabilities.
  5. Settings gating.
  6. Diagnostics.
  7. Background and foreground handling on mobile.
- **Risks:** hibernation edge cases (in-memory state is lost); iOS backgrounding.
- **Acceptance:**
  - A 30 s Wi-Fi drop, a tab hidden for 5 minutes, and a network change all resume without a
    duplicate avatar.
  - A server restart is recovered.
  - Bad tokens and stale builds are rejected.
  - Day/night matches within 1 s of game time.
  - Viewers can't edit.
  - Tests cover Chromium, Firefox, WebKit and the iPad Pro M4 (plus a borrowed phone if available).

### Phase 3: Shared world and full co-building (22–40 days, £0 on Free)

> **Status, 16 October 2026: core built; verified locally in unit and end-to-end tests.**
>
> - **Built:**
>   - The world as rows: `net/worldEntities.ts` handles flattening, rebuilding, field-level diffs,
>     cascades and checksums.
>   - The room's rules in `net/WorldStore.ts`: roles, delete rights (Q4-C), confirm lists (F2-B),
>     `gone`, clash re-checks (windows on a wall or path segment, roof windows per face,
>     foundations, storeys), field-level "later wins" with "changed by" notices (F1-A), atomic
>     batches, revisions and the checksum.
>   - The optimistic overlay in `net/WorldReplica.ts`.
>   - The diff emitter, transaction guard and rollback in `net/WorldOpFeed.ts`.
>   - SQLite storage (entities, commit log, batch dedupe, players, restore points), catch-up or
>     `resync`, shared doors (Q13-A), bookmarks (Q18).
>   - The scene's per-foundation apply path.
>   - The F2-B dialog, offline pause (Q21), and the owner's "Save a copy" and "Restore…".
> - **Acceptance, checked:**
>   - Convergence: three simulated players edit at random through the real room rules, over five
>     seeds and dozens of commits with clashes. Every replica and checksum ends identical.
>   - Two windows in one spot: the later one is refused, with a notice naming who was first.
>   - The same field changed by two people: later wins, and the earlier one is told.
>   - Deleting your own thing that holds someone else's addition needs a confirmation naming them;
>     deleting someone else's thing is refused unless you're the owner.
>   - A resent batch the room already committed is acknowledged, not repeated. This is the
>     "server died after commit, before the ack" case.
>   - A restore forces every client to resync.
>   - End to end in a real browser: shared, saved (a fresh join gets it all), permissions, a
>     foundation clash resolved the same everywhere, and an owner restore.
> - **Measured (Node, M4):** a local edit costs about 1.5 ms of capture and diff on the default
>   world, 10 ms at 10× its size (1,900 rows) and 45 ms at 40× (7,500 rows, 1.3 MB). Applying
>   someone else's change costs about half that (one capture, not two).
> - **Deliberate differences from the plan:**
>   - _F2-B confirmation comes after the local removal, not before._ The feed sees the delete in its
>     diff, then asks. "Keep everything" puts it all back. This covers every tool (Remove, foundation
>     delete, undo, Move) without touching each one.
>   - _Restore points instead of built-in point-in-time recovery._ Our own SQLite restore points
>     (hourly for two days, daily for 30) can bump `worldEpoch` reliably and be tested locally.
>     Cloudflare's point-in-time recovery stays as the disaster fallback.
>   - _Wall-path segment beams_ are sub-entities too (`pathBeam`), like wall beams.
> - **Not yet:**
>   - Presence hints (outlines showing what others are working on) move to Phase 4 polish.
>   - Mini Build budgets aren't re-checked on the server (each client still checks its own).
>   - No 30-minute bot soak yet: the bots don't build.
>   - Incremental baselines for very large worlds (risk R13).

- **Architecture:**
  - `WorldOpFeed` (diff plus transaction guard) and `WorldReplica` (apply by ID, within a frame
    budget).
  - The optimistic overlay.
  - The SQLite schema from §8.3.
  - Server validation, budgets and the overlap check.
  - **Co-building (§7):**
    - sub-entities and field-level patches;
    - creator-based delete rights, with confirmed cascades (F2-B);
    - server fit re-checks where edits meet;
    - "changed by" notices and presence hints.
  - Atomic batches with dedupe; undo of your own placements.
  - Catch-up, `worldEpoch` and checksums.
  - Door, tree and Mini Build design ops.
  - Per-player bookmarks.
  - Point-in-time restore, plus export of the live world.
- **Files:**
  - `net/WorldOpFeed.ts`, `net/WorldReplica.ts`, `net/PresenceHints.ts` (new).
  - Server reuse of the pure fit checks in `wallGeometryMath.ts`, `roofOpeningMath.ts` and
    `FoundationLocalMath.ts`.
  - `RemoveTool.ts` and `foundationDeletion.ts` (pre-delete confirmation).
  - `WorldSerializer.ts` (flattening), `WorldTypes.ts` (manifest and bookmark split).
  - `WorldValidation.ts`: export validators; split the imports in `CreaturePaletteGenerator.ts` and
    `CreatureSurfaceNoise.ts`.
  - `BuildToolManager.ts`, `MoveTool.ts` (`isTransactionOpen`).
  - Upsert and remove methods in the low-level managers: `WallManager`, `WallPathManager`,
    `SlabManager`, `StairManager`, `RoofManager`, `FloorDetailManager`, `SkirtingRunManager`,
    `FoundationManager`, `BuildingLevelManager`, `BarrierManager`, `FurnitureManager`,
    `MiniBuildSystem`, the music managers and `TreeManager`.
  - `BuildUndoManager.ts`, `DoorInteractionController.ts`.
- **Tasks:**
  1. Flattening into entities and sub-entities, with field-level canonical JSON.
  2. **Audit every mutation producer** (each tool and cascade, including temporary removals) and
     turn the audit into a test checklist.
  3. Diff emitter with a convergence property test (random edits across three simulated clients
     must end in **identical snapshots**).
  4. Manager methods.
  5. Server reducers and SQLite.
  6. Co-building rules: ownership, confirmation lists, fit re-checks, "changed by" notices, and
     topology changes such as path splits.
  7. Overlay and rollback.
  8. Catch-up and checksums.
  9. Doors and trees.
  10. Undo.
  11. Restore and export.
- **Risks:**
  - managers that don't fit remove-then-add;
  - tools with hidden temporary removals;
  - mesh rebuild cost;
  - echo bugs;
  - co-building edge cases (clashing additions, a path split while someone edits it).
- **Acceptance:**
  - Three people build the **same** house at once (walls, windows, paint, furniture), and every
    replica converges.
  - Two windows placed in the same spot at the same moment: the later one is rejected with a notice.
  - Two people painting the same wall: the later colour wins and the other person sees "changed by".
  - Deleting your own wall that holds someone else's window asks for confirmation naming them.
    Deleting someone else's object is refused unless you're the owner.
  - Move, paint, delete, undo, stairs with slab openings, and foundation deletion all keep their
    references intact.
  - **Killing the server after commit but before the ack** loses and duplicates nothing on resume.
  - A point-in-time restore forces a resync.
  - A 30-minute random-edit soak with three bots and one browser ends with matching checksums.

### Phase 4: The 20-player release gate (5–8 days; Paid for that month, £3.75)

- **Architecture:**
  - Avatar instancing and level of detail; tuning the apply budget.
  - The in-room usage meter (warns at 70% of the cap).
  - Weekly exports and a **restore drill**.
  - A runbook for running a playtest.
  - Budget alerts.
- **Files:** `tests/multiplayer.e2e.ts`, `server/tools/bots.ts`,
  `docs/multiplayer-performance.json`. Reuse `graphics/frameStats.ts`.
- **Tasks:**
  1. Bot load at 20, 30 and 50.
  2. **A 4-hour soak at 20 players**, including an all-moving burst, building, a mass reconnect, and
     a mid-session server redeploy.
  3. Impairment tests: 100–200 ms RTT, jitter, 2% loss (Network Link Conditioner).
  4. iPad Pro M4 (Safari, touch controls), plus a borrowed phone, or the lowest graphics preset as a
     phone stand-in, before the first family playtest.
  5. A real friends-and-family session on Paid.
- **Risks:** headless bots miss GPU and main-thread load (mitigated by real browsers); slow clients
  (mitigated by backpressure).
- **Acceptance:**
  - Median client frame time rises by **less than 10%**, and by 1 ms or less on the development Mac.
  - No frame over 16.7 ms is attributable to networking.
  - Download 6 KB/s or less, upload 1.2 KB/s or less.
  - UK RTT p95 under 100 ms.
  - Building ops visible to others within 250 ms at p95.
  - Zero lost acknowledged edits and zero checksum mismatches.
  - Memory stays bounded.
  - Room tick at 1 ms or less.
  - The R1 smoothness tests pass with 20 players connected.

### Phase 5: Scaling to 50–100 (5–15 days, about £4–£6/month at modelled use)

Work through these in order and stop when the targets are met:

1. K-nearest interest management with delta entries.
2. More worlds.
3. Explicit op emission, if diffing gets slow.
4. Shared creatures (server-owned logical roots).
5. Firebase Auth accounts and permissions.
6. **Only if needed:** region rooms for poses, while the world room keeps the ops.

- **Risks:** the soft limit of 1,000 requests/s per object; GPU cost of avatars at a crowded spawn;
  hand-off bugs if regions are sharded.
- **Acceptance:**
  - 100 bots in one world at a 5 Hz average.
  - Room CPU at 50% or less.
  - Client download 8 KB/s or less.
  - Snapshot age p95 at 200 ms or less.
  - The **crowd-at-spawn** benchmark passes on the reference devices.

**Total through Phase 4: about 36–62 developer days.** Revision 2 estimated 26–42; the other plan
estimated 23–41, both without co-building. Co-building in Phase 3 is the largest uncertainty.

---

## 11. Performance targets, testing strategy and scaling plan

### 11.1 Targets

| Metric                              | 20 players (v1)                                                                                    | 50–100 players (Phase 5) |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------ |
| Extra client CPU per frame          | ≤1 ms on the M4 MacBook Air; ≤2 ms on the iPad Pro M4; median regression under 10%                 | ≤1.5 ms / ≤3 ms          |
| Remote op application               | ≤2 ms per frame budget                                                                             | Same                     |
| Client download / upload            | ≤6 / ≤1.2 KB/s                                                                                     | ≤8 / ≤1.2 KB/s           |
| UK RTT p95                          | Under 100 ms                                                                                       | Same                     |
| Remote motion display delay         | ≤200 ms                                                                                            | ≤250 ms                  |
| Remote movement smoothness (R1)     | Updated every frame; speed varies under 10% at a steady walk; no snaps over 10 cm except teleports | Same                     |
| Building op visible to others (p95) | ≤250 ms                                                                                            | ≤300 ms                  |
| Join (warm)                         | ≤3 s typical; ≤5 s for a 10 MB snapshot, with progress shown                                       | Same                     |
| Reconnect after a 10 s drop         | ≤3 s, no lost acknowledged ops                                                                     | Same                     |
| Room CPU                            | ≤10% average                                                                                       | ≤50%                     |

### 11.2 Testing

- **Unit tests (Vitest):**
  - codecs and fuzzing;
  - `RoomCore`: slots, batching, validation, permissions and confirmation lists, fit re-checks,
    field-level merges, dedupe, catch-up windows, epochs, checksums, roles, budgets;
  - interpolation and the R1 smoothness metrics;
  - the diff emitter (excluded fields, transaction guard, echo safety);
  - the replica convergence property test.
- **Integration tests:** `@cloudflare/vitest-pool-workers` for hibernation and wake, attachments,
  alarms, SQLite across restarts, and the kill-after-commit case.
- **End-to-end tests (Playwright):** multiple contexts against `wrangler dev` (move, co-build the
  same house, clashing windows, delete confirmation, reconnect, roles, owner settings), plus the single-player regression suite. WebKit and
  Firefox run the determinism test.
- **Load tests:** Node bots (Phase 4), plus real browsers.
- **Debugging desyncs:** checksum mismatch events; a "dump replica" button; an owner-only
  `GET /w/:id/debug` endpoint.
- **Manual checklist:**
  - M4 MacBook Air (Chrome, Safari, Firefox) and iPad Pro M4, plus a phone if one can be borrowed;
  - poor Wi-Fi;
  - background tabs;
  - three people building the same house at once;
  - deleting a foundation someone is standing on;
  - a redeploy mid-session.

### 11.3 Scaling plan

```
2 → 20 players         v1 as designed                                    Free (idle/dev) + Paid in session months
20 → 50                adaptive send + K-nearest interest + delta entries  Workers Paid ($5)
50 → 100 (one world)   load test; region rooms for poses only if needed    Workers Paid (~$5–7)
100+ total             more worlds; no code change                         Linear in usage
```

---

## 12. Risks, trade-offs and decisions

### 12.1 Risks

| #   | Risk                                                                                          | Likelihood    | Impact | Mitigation                                                                                             |
| --- | --------------------------------------------------------------------------------------------- | ------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| R1  | A free-plan cap is hit mid-session, or the cap counts differently from the docs (**F²**)      | Medium        | High   | Paid in session months; usage meter; measured in the Phase 1 spike                                     |
| R2  | The free 10 ms CPU limit applies to object messages (**U**)                                   | Unknown       | Medium | Phase 1 measurement; handlers under 1 ms; Paid                                                         |
| R3  | Cross-engine floating-point divergence                                                        | Low–medium    | High   | Determinism CI; deterministic maths; absolute foundation Y                                             |
| R4  | Concurrent edits clash or lose changes (co-building)                                          | Medium        | High   | Sub-entities and field-level patches; fit re-checks; confirmation lists; convergence property tests    |
| R5  | A tool removes or mutates records temporarily (as `MoveTool` does)                            | Medium        | High   | Transaction guard; mutation-producer audit; convergence tests                                          |
| R6  | Manager refactor is larger than expected                                                      | Medium        | Medium | Rebuild-per-foundation fallback; diffing means tools barely change                                     |
| R7  | One object's throughput at 100 players                                                        | Medium        | Medium | K-nearest interest, adaptive rates, region rooms, more worlds                                          |
| R8  | Platform churn (hosted PartyKit closing; Hathora closed)                                      | Medium        | High   | Raw Durable Object API, `RoomCore` adapters, exports                                                   |
| R9  | Mixed client versions during a rollout                                                        | Medium        | Medium | Version handshake; previous protocol accepted                                                          |
| R10 | Sequence numbers go backwards after a restore                                                 | Low           | High   | `worldEpoch`, forced resync                                                                            |
| R11 | Griefing                                                                                      | Low (friends) | Medium | Viewer role, kick, invite rotation, point-in-time recovery                                             |
| R12 | Mobile background tabs                                                                        | High          | Low    | Resume with a grace period                                                                             |
| R13 | Remote edit bursts cause frame hitches                                                        | Medium        | Medium | Per-frame apply budget                                                                                 |
| R14 | The local copy is mistaken for the truth                                                      | Low           | High   | Multiplayer worlds stored as a cache only; clear labelling                                             |
| R15 | `crypto.randomUUID` unavailable on LAN test addresses                                         | High (LAN)    | Low    | Fallback generator                                                                                     |
| R16 | A deploy disconnects a session                                                                | Medium        | Low    | Auto-reconnect; deploy outside sessions                                                                |
| R17 | Co-building edge cases (path splits, clashing additions, cascades) take longer than estimated | Medium        | Medium | Topology changes as atomic batches; reject and retry on `gone`; Phase 3 sized at 22–40 days            |
| R18 | No phone in the test set (only the iPad Pro M4)                                               | Medium        | Medium | Borrow a phone before the first family playtest, or test with the lowest graphics preset as a stand-in |
| R19 | The Q29-B terrain fix moves a river or lake under an existing build                           | Low           | Medium | Phase 1 pre-check lists affected foundations; foundations keep their absolute heights                  |

### 12.2 Trade-offs accepted

- **Client-authoritative movement:** a modified client could cheat. Acceptable for friends.
- **The server re-checks only fit where edits meet** in v1; other geometric rules are trusted to
  clients.
- **Local creatures:** players may see different animals.
- **Full co-building:** when two people change the same detail, the later change wins. Players get
  a notice rather than a merge.
- **Flight is off in multiplayer worlds.**
- **The world clock pauses when the room is empty**, as single player does.
- **Cloudflare dependence**, with the Node adapter as the exit route.

### 12.3 Decisions (locked 15 October 2026)

All 34 questions and 5 follow-ups are locked in
[`01-questions-and-decisions.md`](2026/10-15/Multiplayer/feature-plan/01-questions-and-decisions.md).
The ones that shape this plan most:

- Online worlds are separate copies published from a local world; only you create them.
- Owner, editor and viewer invite links; guests with display names; invite-only.
- **Full co-building:** anyone with the editor role adds and changes anything; only the creator (or
  the owner) deletes; deleting something holding others' additions needs a confirmation.
- Creatures local in v1; flight off in multiplayer worlds; no chat in v1; 20 players per world.
- World clock pauses while empty; doors shared and reset each session; owner-only sky, weather and
  time; terrain locked once published.
- Free plan in idle and development months, $5 Paid in session months; alert above £8;
  `workers.dev`; weekly R2 backups; Fly.io as the confirmed fallback.
- Terrain maths fixed everywhere if browsers differ; desktop and tablet/mobile at launch; reference
  devices M4 MacBook Air and iPad Pro M4.
- Smooth remote movement (R1) is a release requirement.
- No Cloudflare account yet: Phase 1 starts locally, and you create the account with guidance when
  it's first needed.

---

## 13. Sources (checked 15 October 2026)

**Cloudflare**

- Durable Objects pricing (page updated 30 September 2026): https://developers.cloudflare.com/durable-objects/platform/pricing/
- Durable Objects limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- WebSocket hibernation: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Data location: https://developers.cloudflare.com/durable-objects/reference/data-location/
- SQLite storage API and point-in-time recovery: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- Free-tier launch changelog: https://developers.cloudflare.com/changelog/post/2025-04-07-durable-objects-free-tier/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Containers pricing: https://developers.cloudflare.com/containers/pricing/
- Realtime TURN: https://developers.cloudflare.com/realtime/turn/
- Realtime SFU pricing: https://developers.cloudflare.com/realtime/sfu/pricing/
- Community report of the free cap blocking early (**F²**; page returned 403, read via search summary): https://community.cloudflare.com/t/durable-objects-free-quota-block-below-100k-after-websocket-20-1-adjustment/967650

**PartyKit**

- Shutdown banner: https://docs.partykit.io/
- Repository: https://github.com/cloudflare/partykit

**Colyseus**

- Pricing: https://colyseus.io/pricing/
- Repository: https://github.com/colyseus/colyseus
- 0.17 release: https://colyseus.io/blog/colyseus-017-is-here/
- 0.17 migration guide: https://docs.colyseus.io/migrating/0.17

**Rivet**

- Pricing: https://www.rivet.dev/pricing
- Actors docs: https://www.rivet.dev/docs/actors
- Repository: https://github.com/rivet-dev/rivet

**SpacetimeDB**

- Pricing: https://spacetimedb.com/pricing
- Repository: https://github.com/clockworklabs/SpacetimeDB

**Nakama**

- Repository: https://github.com/heroiclabs/nakama
- Heroic Cloud pricing: https://heroiclabs.com/pricing/

**Photon**

- Realtime pricing: https://www.photonengine.com/realtime/pricing

**Playroom**

- Pricing (unreadable): https://joinplayroom.com/pricing

**Supabase**

- Realtime pricing: https://supabase.com/docs/guides/realtime/pricing
- Realtime limits: https://supabase.com/docs/guides/realtime/limits
- How Realtime messages are counted: https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages

**Firebase**

- Pricing: https://firebase.google.com/pricing

**Fly.io**

- October 2026 pricing update: https://fly.io/pricing-update/
- Pricing docs (older figures): https://docs.fly.io/about/pricing
- Auto-stop and auto-start: https://docs.fly.io/launch/autostop-autostart/
- Proxy auto-stop reference: https://docs.fly.io/reference/fly-proxy-autostop-autostart/

**Railway**

- Pricing: https://railway.com/pricing
- App sleeping: https://docs.railway.com/reference/app-sleeping

**Render**

- Free tier: https://render.com/docs/free

**Hetzner**

- Official price adjustment: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
- IPv4 price (**F²**): https://costgoat.com/pricing/hetzner

**Oracle**

- Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm
- Free-tier cut (**F²**): https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/

**Edgegap**

- Pricing: https://edgegap.com/pricing

**Vercel**

- WebSocket support in Functions: https://vercel.com/support/articles/do-vercel-serverless-functions-support-websocket-connections

**Browser support**

- WebTransport: https://caniuse.com/webtransport

**Peer-to-peer**

- Trystero: https://github.com/dmotz/trystero

**Industry changes** (**F²**)

- Hathora shutdown: https://crux.supercraft.host/blog/hathora-shut-down-where-to-go-after-may-2026/
- Jamsocket joins Modal: https://thenewstack.io/jamsockets-session-lived-infra-gets-a-new-home-with-modal/

**Exchange rate basis**

- GBP/USD: https://pluang.com/en/tools/currency-converter/gbp-usd

**Smooth movement (R1)**

- Glenn Fiedler, "Snapshot Interpolation": https://gafferongames.com/post/snapshot_interpolation/
- Gabriel Gambetta, "Entity Interpolation": https://www.gabrielgambetta.com/entity-interpolation.html
- Valve, "Source Multiplayer Networking": https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking

**Cross-review**

- Independent plan: [`plans/2026/10/chatgpt-multiplayer-research.plan.md`](plans/2026/10/chatgpt-multiplayer-research.plan.md)

**Not verifiable (U):**

- how the free cap counts WebSocket messages, and the free CPU limit for object messages;
- Multisynq pricing;
- whether Fly Proxy treats open WebSockets as load;
- Fly's London price and minimum-invoice policy;
- Rivet's compute billing basis;
- Playroom's official pricing;
- Photon counting traffic in both directions;
- Hetzner's backup add-on percentage;
- whether xanderwiles.com's DNS is on Cloudflare;
- WebTransport on Durable Objects;
- whether a server deploy disconnects sockets (expected, not confirmed).
