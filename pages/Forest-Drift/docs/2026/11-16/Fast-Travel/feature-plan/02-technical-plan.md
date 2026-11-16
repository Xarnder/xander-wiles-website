# Forest Drift — Fast Travel: Technical Plan

**Feature cycle:** 2026-11-16
**Status:** **Revision 2: approved; Phase 0 built (2026-11-16).** Decisions are locked in [`01-questions-and-decisions.md`](01-questions-and-decisions.md). Phase records: [Phase 0](../phase-0/implementation.md). §0 lists changes made while building.
**Related:** [`00-brief.md`](00-brief.md) · [`01-questions-and-decisions.md`](01-questions-and-decisions.md) · [Biome Minimap plan](../../Biome-Minimap/feature-plan/02-technical-plan.md)

Paths are relative to `pages/Forest-Drift/`.

---

## 0. Changes made while building

**Phase 0 (2026-11-16):**

1. **Only the terrain near your feet is built at once** (`TerrainManager.primeNear`): the chunk underfoot, plus a neighbour within 24 m of the landing. That's 1–4 chunks, not respawning's five; the rest of the 3 × 3 streams in. This cut the jump from 120–167 ms to 37–56 ms.
2. **Terrain streams faster for a few seconds after a trip** (`TerrainManager.boostGeneration`): up to 7 ms a frame instead of 2 ms, for at most 5 s or until the queue is empty. The view fills in about 1.5 s instead of about 7.5 s, and frames stayed at 17 ms on this Mac.
3. **The biome counts at once on arrival** (`BiomeTracker.arrive`): no 3 s hold, and a new biome is announced whatever the card cooldown. Before this, the minimap and the card named the biome you'd left.
4. **Working out the landing also builds the water there** (`fastTravelLanding`). Phase 1 calls it when the pin is dropped, so the jump itself drops to about 13–44 ms.
5. **Trees are no longer updated inside the jump.** The next frame does it as usual (5–28 ms).
6. **The dry-ground search moved to `FastTravel.findLanding`,** and respawning uses it too.

## 1. Summary

- **One scene method, `ThreeScene.fastTravel(x, z)`,** does the jump. It:
  1. checks that travel is allowed;
  2. remembers where you were, for Go back;
  3. finds a safe landing;
  4. loads the ground there at once;
  5. moves you, and the creature you carry or ride;
  6. flags the move as a teleport, so other screens snap rather than slide.

  Everything it needs already exists for respawning and rejoining. The work is mostly in the edge cases.

- **The rules live in a small pure module, `game/travel/FastTravel.ts`:** permission, landing search, Go back memory and the pin's description. It can be unit tested without Three.js.
- **The full map** gains a pin, a **Travel here** button and a **Go back** button. The pause menu gains **Go back**.
- **Online:** before it jumps, the client sends a `travel` message:
  - the room checks it against the owner's rule and your health, then tells the other players, who show the shimmer;
  - the rule is `env.rules.fastTravel` next to the existing damage rules;
  - this changes the protocol (version 8 → 9), so **the Worker deploys before the site**.

## 2. Existing system

| Area                | File                                                          | Today                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Placing the player  | `game/player/FirstPersonController.ts`                        | `spawn(x, z)` lands on the highest surface; `restoreState` puts you at an exact spot. Both count a teleport (`teleports`) and **end any ride** (`mount = null`). |
| Respawn             | `ThreeScene.respawn`, `dryGroundNear`                         | Rings outward (up to ~200 m) until out of deep water, then `primeAround` builds the 3 × 3 terrain chunks under you at once.                                      |
| Ground on frame one | `TerrainManager.primeAround(x, z, 1)`                         | Builds the nearest chunks synchronously; the rest stream. Trees: `treeManager.update(x, z)`.                                                                     |
| Teleports online    | `net/PoseSender.ts`, `RoomCore` pose check, `RemoteMotion`    | A change in `teleports`, or a jump over 50 m, sets `POSE_FLAGS.teleport`. The room skips its speed check, and other screens snap.                                |
| Owner rules         | `protocol.ts` `SharedEnvironment.rules`, Settings → Rules     | `fallDamage`, `playerDamage`, `creatureProjectiles`; the owner edits them in Settings → Rules, and they're saved with the world.                                 |
| Carrying            | `player/CarryController.ts`, `CreatureRuntimeManager.carried` | A carried creature is out of the herd and drawn at your hands, so it already follows any move.                                                                   |
| Riding              | `player/RideController.ts`, `CreatureRuntimeManager.ride`     | The ridden creature stays in its herd (`logical`). Teleport far away and its herd unloads, and `RideController.update` ends the ride ("Teleported, respawned…"). |
| Full map            | `components/BiomeMapOverlay.svelte`, `FullMapHost`            | Pan, zoom and a readout for the pointer or the crosshair; markers for you, players and waypoints.                                                                |
| Particles           | `particles/ParticleEffectManager.ts`, `effects/`              | Pooled particle effects (lake splashes, pellets).                                                                                                                |

## 3. The jump (`ThreeScene.fastTravel`)

1. **Check:** `canFastTravel()` returns `{ ok: true }` or `{ ok: false, reason }`. It refuses when:
   - you're knocked out;
   - another trip is in progress;
   - online, the owner has turned travel off and you aren't the owner;
   - online, the room refused the `travel` message (§6).
2. **Remember:** your feet position, yaw and pitch, and whether you were flying, saved as `lastOrigin`.
3. **Leave furniture** if you're sitting (the same path as standing up).
4. **Land** (§4).
5. **Load:** `terrainManager.primeAround(x, z, 1)`, `hydrology` sync for the spot, `treeManager.update(x, z)`.
6. **Move:**
   - walking: `controller.spawn(x, z)`, which keeps your view;
   - flying: `restoreState` at ground + 2 m, still flying [Q10].

   Either way the teleport counter goes up, so the next pose is flagged.

7. **Ride** [Q4]: move the ridden creature to the landing and keep the mount (§5).
8. **Tidy up:**
   - clear the wanted map tiles, so the map redraws at the new spot (the minimap's teleport case, E3);
   - announce "Travelled to Snowy Taiga" through the existing biome card;
   - online, send `travel` with the start and end points (the room hears it before the pose, §6).

**Go back** calls the same method with `lastOrigin`, restoring the exact height and flight you left with. The trip it makes then becomes the new `lastOrigin`, so pressing Go back twice returns you to where the first trip landed. `lastOrigin` is cleared when you leave or switch worlds.

## 4. Landing (`FastTravel.landingFor`)

- **Deep water:** reuse respawning's ring search (moved from `ThreeScene.dryGroundNear` into `FastTravel.ts` so both share it): rings every 14 m out to 196 m, 12 points each.
- **Height:** the highest supporting surface at the spot [Q9], so a roof if you pin a house. Horizontal collision (`resolveHorizontalCollision`) then nudges you out of any wall.
- **Water lookups far away:** `hydrology.waterColumnDepth` needs the hydrology region there to exist. Phase 0 measures how long the first lookup takes when the region isn't built yet. If it's too slow to wait for, the land check uses the map worker's water shapes (already built for that tile) or builds just that region.
- **The readout** says "Lands on the shore" when the landing is more than 10 m from the pin.

## 5. Creatures you carry or ride [Q4]

- **Carried:** nothing to do. The creature is out of the herd and drawn at your hands. Online, the room already treats the carrier's teleport like any other pose.
- **Ridden:** the hard part. Today the ridden creature belongs to its herd chunk, so a long jump unloads it and ends the ride. Phase 0 adds `CreatureRuntimeManager.relocateRide(position)`:
  - it takes the ridden creature out of its herd for the trip, as carrying does, and moves it to the landing;
  - the creature re-adopts the herd where it's let go;
  - its coat stays as it was (rides already keep theirs across biomes);
  - online, the room already moves a ridden creature to its rider when the reported spot is far away ("A ridden creature is left standing under its rider", `RoomCore`). Phase 2 confirms that this holds after a teleport.
- **Fallback if relocating proves fragile:** you climb off before the trip, and the plan comes back to you. It would contradict Q4, so it's a last resort.

## 6. Online (Phase 2)

- **The rule:** `SharedEnvironment.rules.fastTravel?: boolean`, default `true`. It works like `creatureProjectiles`:
  - parsed in `protocol.ts`;
  - read by `RoomCore` (`fastTravelEnabled()`);
  - captured and applied in `ThreeScene`;
  - edited in Settings → Rules as **Fast travel for others** (owner only, online worlds only);
  - saved with the world, like the other rules.
- **New messages (protocol 9):**
  - client → room: `{ t: 'travel', from: [x, y, z], to: [x, y, z] }`;
  - room → client: `{ t: 'travelResult', ok, reason? }`;
  - room → everyone else: `{ t: 'travelled', slot, from, to }`.
- **The room's checks:**
  - the rule (the owner is exempt);
  - the player isn't knocked out;
  - `from` is within 30 m of their last pose;
  - at most one trip per second (spam guard, not a cooldown);
  - both points are plausible (`isPlausiblePosition`).

  If all pass, it answers `ok` and broadcasts `travelled`.

- **The client waits for `travelResult`** (up to 2 s), then jumps. The button shows "Travelling…" meanwhile. The first teleport-flagged pose follows.
- **Honest limit:** the room already accepts any teleport-flagged pose, as it must for respawns and rejoins. A modified client could skip the `travel` message and jump anyway, as it can today. The rule stops the real game, and the room stops the shimmer. Enforcing it on poses (refuse long teleports without a grant or a respawn) is possible later but risks breaking legitimate jumps. Not in v1.
- **Rides online:** the room's ride claim stays with the rider. The creature's new spot reaches others through the rider's poses. Phase 2's two-player test checks that the visitor sees the mount arrive with its rider.
- **Deploy order:** server first (`npm run deploy` in `server/`), then the site. Clients on protocol 8 are told to refresh, as with every bump.

## 7. The map and menus (Phase 1)

- **`BiomeMapOverlay.svelte`:**
  - **The pin:** a click or tap with less than 6 px of movement drops a pin (a drag still pans). `Enter` pins the crosshair.
  - **The readout** follows the pin while there is one: biome, distance, direction, coordinates, and "Lands on the shore" when needed. Pointing elsewhere still shows the pointer's readout until the pin is chosen.
  - **Travel here** appears next to the readout when there's a pin. It's disabled, with the reason in its label, when travel isn't allowed.
  - **Go back** appears in the header after a trip.
  - Both are reachable by `Tab`. `T` presses Travel here while the map has focus.
  - `Esc` clears the pin first, then closes the map.
- **`FullMapHost`** gains:
  - `canTravel(): TravelPermission`;
  - `travel(x, z): Promise<TravelOutcome>`;
  - `goBack(): Promise<TravelOutcome>`;
  - `lastOrigin(): MapPoint | null`;
  - `landingNote(x, z): string | null`.
- **`PauseMenu.svelte`:** a **Go back** button next to **Map**, shown only after a trip.
- **Screen readers:**
  - "Pinned: Snowy Taiga, 2.4 km north-east" in the live region;
  - after a trip, "Travelled to Snowy Taiga".

## 8. The shimmer (Phase 3)

- **A new pooled effect,** `particles/effects/travelShimmer.ts`: about 40 soft motes rising in a 1 m column for 0.8 s at both ends of a trip. It follows the particle quality setting and is off when particles are off.
- **Where it plays:** shown by others when `travelled` arrives, and by you at your landing.
- **Reduced motion:** a single short fade of light, no rising motes.

## 9. Edge cases

| #   | Case                                           | Behaviour                                                                                                    |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| E1  | Pin in the ocean or a lake far from shore      | Nearest dry ground within 196 m; past that, you land in the water as respawning does, and the readout warns. |
| E2  | Pin far beyond the map's 16 km view            | The map can't show it, so you can't pin it. No limit is needed.                                              |
| E3  | Building tools active                          | Kept; the ghost preview simply follows you.                                                                  |
| E4  | Online and not joined yet, or offline too long | Travel waits for the room like building does; the button says "Connecting…".                                 |
| E5  | Trip while a creature is mid-throw             | The pellet keeps flying where it was; it's a separate projectile.                                            |
| E6  | Trip during a fall                             | Allowed. The landing resets fall tracking (no damage), as respawning does.                                   |
| E7  | Very large coordinates                         | Same world maths as the map, tested at ±200 km.                                                              |
| E8  | Biomes off                                     | Works the same; the readout shows terrain-only text.                                                         |
| E9  | Creature herds at the new spot                 | Populate as they do when you fly in; the chunks you left unload.                                             |
| E10 | Tutorials                                      | No change; a trip doesn't complete or skip any tutorial step.                                                |

## 10. Performance

| Metric                          | Budget                                                              | How measured                                            |
| ------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| The cut's hitch (one frame)     | ≤ 120 ms at full speed for a 5 km trip; ≤ 250 ms on a 4× slower CPU | Frame times round 20 trips, Chromium, throttled and not |
| Ground under you                | On the first frame after the trip                                   | e2e: feet within 0.2 m of the surface, no fall          |
| Trees and far terrain streaming | Settles within 3 s                                                  | Queue lengths after the trip                            |
| Idle cost                       | None: the feature does nothing until you press a button             | Code review                                             |

**Estimate.** Respawning primes five chunks in the same way, so the hitch should be similar. Phase 0 measures it. If it's over budget, priming drops to the one chunk underfoot, and the other eight stream in. **Measured (Phase 0):** the full-speed budgets are met; see the [Phase 0 record](../phase-0/implementation.md). The 4× slower CPU figure is Phase 3's.

## 11. Tests

| Level | Test                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Unit  | `FastTravel`: permission reasons, landing search (water rings, far coordinates), Go back memory, pin descriptions                        |
| Unit  | `RoomCore` travel: rule on/off, owner exempt, knocked out, `from` too far from the last pose, one per second, broadcast to others only   |
| Unit  | Protocol parsing of `travel`, `travelResult`, `travelled`, `rules.fastTravel`                                                            |
| E2E   | Map: pin, readout, Travel here, feet on the ground on the next frame, Go back, `Enter`, `T`, `Esc`, touch tap. Chromium, WebKit, Firefox |
| E2E   | Carrying and riding across a 3 km trip: still held, still seated                                                                         |
| E2E   | Online: two players, travel seen by the other (snap, no slide), the owner's switch hides the button for the visitor, rides seen arriving |
| Perf  | The cut's hitch and the settle time (§10)                                                                                                |

## 12. Rollback

- A build constant, `FAST_TRAVEL_AVAILABLE`, and `?fastTravel=off` hide the pin, the buttons and the setting.
- Online, protocol 9 stays: a room that receives `travel` from no one behaves exactly as protocol 8.
- Nothing new is saved except the owner's rule, which older builds ignore.

## 13. Definition of done

- [ ] Pin and Travel here on the full map, with keyboard and touch.
- [ ] Safe landing (dry, on a surface, out of walls), ground present on the first frame.
- [ ] Carried and ridden creatures arrive with you.
- [ ] Go back on the map and in the pause menu.
- [ ] Online: the owner's switch, the room-checked travel message, and others see a snap and a shimmer.
- [ ] Budgets in §10 met and measured.
- [ ] Tests in §11 pass in three browsers.
- [ ] Docs (`docs/biomes.md`'s map section, the player guide) and phase records with screenshots.

## 14. Assumptions (to confirm in Phase 0)

1. `primeAround` plus `controller.spawn` at a spot 5 km away gives solid ground on the first frame, as it does for respawning.
2. A hydrology lookup at an unbuilt region is fast enough to wait for, or can be built for just that region.
3. A ridden creature can be taken out of its herd for a trip without breaking the ride's animation or the room's claim.
4. No other system assumes the player only moves continuously, apart from those already handling respawns (the map, the biome tracker, weather and music).
