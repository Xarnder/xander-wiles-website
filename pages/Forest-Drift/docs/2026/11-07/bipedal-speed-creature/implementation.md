# Forest Drift — Riding Bipedal Creatures: Implementation Notes

**Feature cycle:** 2026-11-07
**Plan:** [`feature-plan/02-technical-plan.md`](feature-plan/02-technical-plan.md) (revision 2) · Decisions: [`feature-plan/01-questions-and-decisions.md`](feature-plan/01-questions-and-decisions.md)

Paths are relative to `pages/Forest-Drift/`. All three phases ship together in one commit.

## What it does

Look at any two-legged creature within 3 m and press `K` (or tap **Ride**):

- **Under 3.5 m:** you sit astride its neck, a leg over each shoulder, with your hands on its head.
- **3.5 m and over:** you sit on its right shoulder beside the neck, holding the neck with your left hand.
- **A head too big to sit beside:** some species (the "Crownling" shape) have heads that overhang the whole shoulder. You sit on top of the head instead of half inside it. This departs from Q4/Q5, and only where anatomy leaves no room.

W/A/S/D steer relative to where you look and Shift sprints. Sprint is 1.2× run speed for the smallest bipeds, rising on a log scale to 1.5× for 26 m giants, and cruising is 85% of sprint (Q3 B). `K` gets you off onto safe ground beside the creature with no fall damage. The creature stands, then wanders back toward its herd.

You can carry a small creature while riding, and fire from the seat (Q12 C). `K` while riding and carrying gets you off and keeps the creature (F1). While carrying, `K` on a biped climbs on, and `K` from the seat with a carryable creature in reach picks it up (F2).

## Architecture

| Piece | File | Notes |
| --- | --- | --- |
| Rules | `creatures/creatureRiding.ts` | Pure, shared with the room: `rideFor`, seat kind, speeds, turn rate, cadence cap, `rideClaimRadius`, and the `CREATURE_RIDING_ENABLED` kill switch. |
| Motion | `creatures/CreatureRideMotion.ts` | Pure. Camera-relative steering, turn-rate arcs, acceleration and braking, slowing through sharp turns, and substeps. Obeys `creatureSurface` (slope, buildings) and `standable` (deep water), and slides round creatures at least 25% of its own height (smaller ones are stepped over). No herd leash. |
| Seat | `creatures/RideSeat.ts` | Pure, run once at mount. Reads the skin points: the column above the seat must be clear for the rider, the walk never steps off the skin or slides more than 12% of the height down, and the fallback is on top of the head. `rideSeatAnchors` pins the seat and hand holds to the bones that carry them. |
| Bone anchors | `creatures/boneAnchors.ts` | Bone-space points to world space. The rider rides the chest's bob and sway (the rider was fixed over the feet before). |
| Runtime | `creatures/CreatureRuntimeManager.ts` | `mountRide` / `steerRide` / `rideFrame` / `rideFootprint` / `dismountRide`. The mount stays in `logical` and `live`, always drawn at the best LOD, never culled or unloaded, and the player isn't pushed out of it. A shared `settle()` serves both carry release and dismount. A placed creature's home now moves with its saved spot. |
| Player | `player/FirstPersonController.ts` | Mount mode: `beginMount` / `endMount` blends, `rideInput`, no gravity or fall tracking, flight refused, and a first-person-only camera offset. |
| Controller | `player/RideController.ts` | Host-interface state machine, as `CarryController` is: claim, mount, steer every frame, "can't go that way" (at most every 3 s), abandon. |
| Key routing | `player/creatureKeyRouting.ts` | The `K` table from the decisions file, plus the single creature prompt the page and touch button show. |
| Landing | `player/rideDismount.ts` | Right side, left, front, back, then a wider ring, else where you climbed on. |
| Body | `characters/CharacterInstance.poseRide` | Straddle or side-sit, hand IK to the holds, carry arm layered on top. |
| Camera | `player/ThirdPersonCamera.ts` | New `bodies` obstacle: the mount's skin points, tested in its own space, so the boom stops at a giant's head instead of entering it. |
| Hints | `creatures/CarryHints.ts`, `waypoints/WaypointSystem.ts` | Teal saddle-square badges, and a "Nearest rideable creature" waypoint (the creature waypoints are now a small list of followers). |
| UI | `RideHud.svelte`, `+page.svelte`, `TouchControls.svelte`, `PauseMenu.svelte`, `ControlsGuide.svelte` | Ride chip, prompt, announcements, sounds (`creatureSounds.ts`), touch button, Jump hidden while riding, help text. |
| Online | `net/protocol.ts` (v8), `net/RoomCore.ts`, `net/CreatureClaims.ts`, `net/NetSession.ts`, `net/MultiplayerSession.ts`, `net/RemoteAvatarRenderer.ts`, `creatures/RiddenCreatureView.ts` | `ride` / `dismount` / `rideResult` / `ridden` / `welcome.rides`. The room arbitrates (state, rideable, role for placed creatures, taken, claim radius), persists rides with the session, and releases on knock-out, leaving, sitting or removal. Riders can't punch, and their pellets are checked against the pose carried forward along their velocity (`riderPoseAt`). Other players draw the mount under the rider from its recipe, facing the way it travels. |

## Decisions applied

Q1–Q28 and F1–F2 as locked, with these notes:

- **Q15 B (no owner rule):** the kill switch is the only off switch. Firing from a mount still follows "Creature projectiles".
- **Q22 / sway:** the first build added a tiny synthetic step bob. After you asked for the rider to move with large bipeds' sway, the seat is now pinned to the chest bone, so the rider (and the eye) rides the body's real bob and sway. On a 24 m giant that's about 0.8 m at a sprint. With reduced motion, the first-person camera holds the steady height while the body still moves.
- **Tutorial lesson:** not added. It would bump `TUTORIAL_VERSION` and invalidate the cached narrated speech. Badges, the prompt and the waypoint cover finding rideable creatures.

## Verification

- `npx vitest run`: 238 files and 2,776 tests passed before the sway change. After it, the creature, player and net folders (63 files, 572 tests, including the new sway test) pass.
- New unit specs: `creatureRiding`, `CreatureRideMotion`, `RideSeat`, `CreatureRide` (runtime, sway), `FirstPersonMount`, `RideController`, `creatureKeyRouting`, `rideDismount`, `RoomCoreRide` (claims, refusals, carry+ride, no punching, releases, hibernation, sprint never speed-rejected, mounted pellet origin), and `protocolRide` (parsing, `CreatureClaims`, `riderPoseAt`). The waypoint spec covers the rideable follower.
- `tests/creatureRiding.e2e.ts` (Chromium) passed 6 of 6 runs: climb on, sprint above 1.15× run, get off on the ground at full health; and carry, climb on, fire, get off still carrying, then put down.
- `svelte-check`: 0 errors. Prettier clean. ESLint is clean on the changed files apart from one existing `no-useless-assignment` in `CreatureGrounding.ts`'s serpent trail, in code this change doesn't touch.
- In the browser (seed `forest`): a 1.5 m "Moss Ribbon" cruised at 12.5 m/s and sprinted at 14.7 m/s. Neck seat, shoulder seat on a 24 m "River Ribbon", and head seat on an 11.6 m "Amber Crownling" are in `screenshots/`. Getting off landed at eye height with health unchanged, and a reload after a save taken mid-ride opened on the ground.

## Not verified

- A live two-browser session against the deployed Worker. Online behaviour is covered by `RoomCoreRide.spec.ts` and the protocol tests only.
- WebKit and Firefox, and a real phone or tablet. Touch is unit-level only.
- Performance runs: frame pacing while riding, and the 4-rider soak.

## Rollback

- Set `CREATURE_RIDING_ENABLED = false` in `creatureRiding.ts` (site only) to hide every prompt, badge and HUD and make nothing rideable.
- A full revert needs **the Worker and the site deployed together** (protocol v8 → v7). Rooms on v7 ignore an unknown `rides` key in a session saved by v8.
