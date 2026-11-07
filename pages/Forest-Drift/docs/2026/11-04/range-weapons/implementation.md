# Forest Drift — Creature Ranged Weapons: Implementation Notes

**Feature cycle:** 2026-11-04
**Plan:** [`feature-plan/02-technical-plan.md`](feature-plan/02-technical-plan.md) (revision 2) · Decisions: [`feature-plan/01-questions-and-decisions.md`](feature-plan/01-questions-and-decisions.md)

Paths are relative to `pages/Forest-Drift/`.

## Phase 0 — A small quadruped in every region (2026-11-04)

**Decision:** Q3 C, confirmed in F1. Existing worlds change.

### What changed

| File                                                                             | Change                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/game/creatures/CreaturePopulationSystem.ts`                             | New `SMALLEST_BAND_PLAN = 'quadruped'`. `regionSpecies` still takes the body-plan `rng()` draw for every band, then uses `quadruped` for band 0 (0.55–0.8 m). Every later draw is untouched.                                                         |
| `src/lib/game/creatures/RegionSpeciesQuadruped.spec.ts` (new)                    | Band 0 is a quadruped in 1,728 regions over 3 seeds; band 0 stays in its height band; every band-0 individual spawned in 512 cells is ≤ 0.9 m (the carry limit, Q2); bands 1–5 match a snapshot **recorded on the old generator** before the change. |
| `src/lib/game/creatures/__snapshots__/RegionSpeciesQuadruped.spec.ts.snap` (new) | Fingerprints of bands 1–5 for 64 regions × 2 seeds, from before the change.                                                                                                                                                                          |

No other code changed. `CREATURE_GENERATOR_VERSION` wasn't bumped (F1). No world schema change.

### Measured effect

| Measure                                                                                       | Before    | After                                       |
| --------------------------------------------------------------------------------------------- | --------- | ------------------------------------------- |
| Regions whose smallest species is a quadruped (1,200 regions, seeds `forest`, `42`, `meadow`) | 479 (40%) | 1,200 (100%)                                |
| Species genomes in bands 1–5 (128 regions)                                                    | —         | identical (snapshot)                        |
| Spawns of bands 1–5 (800 cells, seed `forest`)                                                | 3,618     | 3,615 identical, 1 moved, 2 no longer spawn |

The 3 changed larger spawns (0.08%) happen because a new band-0 herd has a different footprint, and the population generator skips a member that would overlap an earlier group. That's expected and harmless.

### Verification

- `npx vitest run`: 209 files, 2,524 tests passing (creature folder: 12 files, 118 tests). The existing `CreatureFingerprints` and `CreatureEcology` snapshots didn't change. They use fixed seeds, not regional species.
- ESLint, Prettier and `tsc` clean on the changed files.
- In the dev browser, a new world with seed `forest`: 24 species in the 4 loaded regions. The four smallest (0.59–0.83 m) are all quadrupeds, the screenshot shows a "Moon Ribbon" herd beside the player, and the console shows no errors.

### Not verified

- An existing saved world from before the change, opened side by side with the old build, to compare the scene by eye.
- Online: no room was opened. All players in a room must run the same build, which the v6 protocol bump in Phase 2 will enforce. Until then, **a mixed-version room would show different small species to different players**. Ambient creatures are already local-only (Q9-A), so nothing breaks, but don't deploy this to the live site on its own if online play matters to you before Phase 2.

### Rollback

Revert the Phase 0 commit. Nothing stored depends on it.

## Phase 1 — Carrying and firing in single player (2026-11-04)

**Decisions used:** Q1 A, Q2 A, Q5 A, Q6 A, Q7 A, Q8 A, Q10 B, Q11 B, Q12, Q19, Q20, Q21 A, Q22 A, Q23, Q24 C, Q26 A, Q29 A, Q30 A.

### What was built

| Area                                   | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared, pure (browser + future Worker) | `src/lib/game/creatures/creatureDimensions.ts` (moved out of the population system), `creatureAbilities.ts` (`RANGED_WEAPONS_ENABLED` kill switch, `abilityFor`: quadruped ≤ 0.9 m → `mouth-projectile`), `carryableCreatureRef.ts` (ambient id ⇄ recipe without terrain; placed lookup), `src/lib/game/player/creatureProjectile.ts` (35 m/s, 4 m/s² arc, 30 m / 1.2 s life, 3 damage, 5 charges, +1 per 1.5 s, 350 ms gap, closed-form flight, body sweep)                                                                                                                                                                                  |
| Population                             | `CreaturePopulationSystem.ts`: `cellSpeciesOrder`, `creatureGroupId`, `creatureGroupSize`, `CREATURE_CELL_SLOTS` extracted as pure helpers (same output; the ecology and region tests confirm it)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Runtime                                | `CreatureRuntimeManager.ts`: `carried` map (out of `logical`, so behaviour, grounding, culling, collision and cell reloads skip it), `pickCarryable`, `carry`, `release` (snaps to the ground; ambient creatures join the cell they're put down in; placed creatures save their new spot and bump `revision`), `isCarried`. Reset, seed change and creatures-off forget carries.                                                                                                                                                                                                                                                              |
| Player                                 | `src/lib/game/player/CarryController.ts`: state, `K` toggle, trigger hold-to-repeat, charges, stow/auto-release rules, prompts. No Three.js.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Visuals                                | `src/lib/game/creatures/HeldCreatureView.ts` (own LOD1 copy at its real size — revised 2026-11-06, see `docs/2026/11-06/carry-pose/implementation.md`; first person: its head and neck in the lower-left, placed by the view frustum so portrait phones see it; third person: the character's carry anchor; idle animation; 80 ms recoil, off with reduced motion), `CharacterInstance.ts` (`carrying` flag, left-arm IK, `carryAnchor` from the bones), `src/lib/game/particles/ProjectileSystem.ts` (64-pellet pool, one `InstancedMesh`, world collision callback, counters), `particles/effects/creaturePellet.ts` (pollen-coloured puff) |
| Scene                                  | `ThreeScene.ts`: `carry`, `heldCreature`, `projectiles`; `K` capture listener; left click fires while carrying (punch otherwise); mouse-up/blur end the trigger; `projectileCollision` (terrain and floors via `WorldSurfaceSampler`, ceilings, wall/door/stair/furniture/fence/Mini Build rects, every 20 cm); `toggleCarry`, `setCarryTrigger`, `getCarryState`; seats aren't offered while carrying. `WorldSession.ts` forwards the three new callbacks.                                                                                                                                                                                   |
| UI                                     | `CarryHud.svelte` (species dot, name, 5 pips; dims when stowed; `role="img"` label), `+page.svelte` (prompt "[K] Pick up {species}" / "[K] Put down · Left click to fire", HUD above the health row, polite announcements, sounds), `TouchControls.svelte` (contextual Pick up / Put down; Fire replaces Punch while carrying, press-and-hold), `ControlsGuide.svelte` and the Help overlay (two rows each), `src/lib/game/audio/creatureSounds.ts` (synthesised fire, dry fire, impact, pick-up, put-down)                                                                                                                                   |

### Where the build differs from plan revision 2

1. **A seat or door under the crosshair always wins `K`** over a creature, instead of "nearest to the crosshair". It's simpler and predictable; step aside to pick up a creature standing by a chair. While carrying, `K` always puts down (seats aren't offered).
2. **The creature is put down 0.8 m in front of the player**, not at the feet, so its collision doesn't shove the player.
3. **Carrying is off in online worlds until Phase 2** (`inputAllowed` checks `!this.multiplayer`), so nobody carries a creature other players can't see.
4. **Startle removed** (Q6 A: projectiles have no effect on creatures).
5. **`ProjectileSystem` lives in `particles/`** and counts `launched` / `worldHits` for diagnostics and tests.

### Verification

- Unit: `npx vitest run`: 214 files, 2,558 tests passing. New: `CreatureAbilities.spec.ts`, `CarryableCreatureRef.spec.ts` (rebuilt recipes deep-equal 400+ spawned ones), `creatureProjectile.spec.ts`, `CreatureCarry.spec.ts`, `CarryController.spec.ts`.
- TypeScript: `tsc --noEmit` clean on every touched file (3 old errors remain in `src/lib/ui/woodTexture.worker.ts`). `npm run check` can't resolve `#lib` / `$app` imports anywhere in this checkout (an existing problem), so Svelte files were only partly type-checked; that's how a missing `WorldSession` forward slipped through until the browser test caught it.
- ESLint and Prettier clean on touched files (one old ESLint error remains in `CreatureGrounding.ts`).
- E2E: `tests/rangedWeapons.e2e.ts` (Chromium). Results below.
- E2E `tests/rangedWeapons.e2e.ts`, Chromium: **4 of 4 passing**. It covers:
  - Pick up with `K`. The creature leaves the herd, and the HUD shows 5 pips plus a "Picked up …" announcement.
  - One level shot launches one pellet and spends one charge. A downward shot stops at the ground.
  - Holding the trigger fires 2–4 pellets in 1.1 s, with the 350 ms gap still enforced.
  - Build Mode stows the creature: firing is refused and the HUD dims.
  - Third person.
  - `K` puts the creature down within 2 m, with a "Put down …" announcement.
  - A too-big creature can't be picked up.
  - A carry doesn't survive a reload.
  - At 375 × 812 the HUD stays on screen and above the health bar.
- Screenshots (`screenshots/`): `carry-first-person.png`, `carry-pellet.png`, `carry-third-person.png`, `carry-phone.png`.
- Found and fixed through those tests:
  - `WorldSession` didn't forward the new callbacks.
  - The in-hand creature sat off-screen in portrait. It's now placed by the view frustum.
  - In third person the creature was hidden behind the body. It now sits 0.38 m out with its head angled 0.6 rad outward.

### Not verified yet

- **Sounds.** The synthesised cues haven't been listened to.
- **Real touch device.** Fire's press-and-hold was never tried on one (only the Playwright desktop emulation at phone size ran).
- **A pellet in mid-flight in a screenshot.** Pellets are small and fast. The launch and ground-hit counters prove the flight, not a picture.
- **Collision with buildings.** Pellet collision with walls, doors, fences and furniture is implemented but not exercised by a test (the e2e world has no buildings). Terrain hits are tested.
- **VoiceOver, frame-pacing benchmark, iPad.**
- **Phase 0's online caveat still applies.** Carrying is switched off in online worlds until Phase 2.

## Phase 2 — Carrying in online worlds (2026-11-04)

**Decisions used:** Q15 A (separate rule, on by default), Q16 (everyone, viewers included, for ambient creatures), Q17 A (the room arbitrates), Q18 A, Q19, Q27 (protocol v6).
**Not in this phase:** Lab-placed creatures online (Phase 2b, F2) and pellets online (Phase 3). The room refuses `placed_…` ids with `ineligible` and drops `shoot` / `shotHit`.

### What was built

| Area        | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Protocol v6 | `src/lib/game/net/protocol.ts`: client `carry`, `drop` and (for Phase 3) `shoot`, `shotHit`; server `carryResult`, `carried` and (for Phase 3) `shot`, `shotResult`; `welcome.carries`; `rules.creatureProjectiles`. Strict parsers: safe-integer ids, creature ids ≤ 160 characters, finite tuples within ±10⁷, unit directions. One bump covers Phases 2 and 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Room        | `RoomCore.ts`: `carries` (player → creature) and `releasedAt` (the last 256 put-down spots). `handleCarry` checks, in order: rule, state (already carrying, seated, knocked out, no pose yet), `ineligible` (malformed, another world's seed, a member the group doesn't have, too big, not a quadruped), `taken`, and `far` (more than 80 m from the creature's home cell centre and from where it was last put down). `releaseCarry` puts the creature down at the requested spot when it's within 3 m of the feet, otherwise at the feet. Releases happen on `drop`, knock-out, sitting down, leaving, the grace period ending, and the rule being switched off. Carries are saved with the session state (doors and seats), only while someone carries. Stats: `carriesGranted`, `carriesRefused`. `server/src/WorldRoom.ts` passes a lazy seed loader that reads the published world's base once. |
| Client net  | `NetSession.ts` (`sendCarry`, `sendDrop`, `onCarryResult`, `onCarried`, `welcome.carries`), `MultiplayerSession.ts` (slot → creature map, `claimCarry` with a 2 s timeout, `dropCarry`, welcome reconciliation, offline settles pending claims), `RemoteAvatarRenderer.ts` (a `HeldCreatureView` per carrying avatar, drawn at the avatar's carry anchor within detail distance)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Scene       | `ThreeScene.ts`: online carrying enabled, gated by the owner's rule. `claim` goes through the room, and `release` also sends `drop`. `applyRoomCarry` keeps the herd consistent: remote carries leave it via `holdRemote`, remote put-downs return it via `release`, or via `forget` when there's no spot. If the room ends this player's carry, `CarryController.forceRelease` runs. If the room thinks we hold something after a reload, we hand it back. `resolveCreature` rebuilds recipes from ids. Settings → Rules gets **Creature projectiles (carrying and firing)**, online and owner-only.                                                                                                                                                                                                                                                                                                  |
| Runtime     | `CreatureRuntimeManager.ts`: `holdRemote`, `carrierOf`, `forget`, and `carry(id, fallback)` (carries from the recipe when this herd lost the creature). Creatures this client never saw get a synthetic runtime that adopts its put-down spot as home.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Controller  | `CarryController.ts`: an online claim step (prompt "Picking up …", repeat presses swallowed), `refused` event, `forceRelease`, and handing back a granted creature the world can't hold                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| UI          | `+page.svelte`: a toast and an announcement for each refusal ("Someone else picked it up.", "You're too far away…", "Carrying creatures is off in this world.", …)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Where the build differs from plan revision 2

1. **Carries persist in the room's session state, not in socket attachments.** The session state already survives hibernation and restarts, and it also covers players in their reconnect grace period, who have no socket. It's written only when a carry changes, and only while someone is carrying, so rooms without carries keep their exact old record.
2. **The room remembers where creatures were put down** (256 spots), so a creature carried far from home can be picked up again there.
3. **The claim radius is 80 m from the home cell centre**, not "64 m + 3 m", to allow for half a cell's diagonal plus wandering.
4. **A seed loader instead of a manifest field.** Already-published worlds work without republishing.

### Verification

- Unit: 216 files, 2,585 tests passing. New: `RoomCoreCarry.spec.ts` (14 tests), `protocolRanged.spec.ts` (5 tests), and online additions to `CarryController.spec.ts` and `CreatureCarry.spec.ts`. Existing room and protocol suites are unchanged and passing.
- TypeScript: app and `server/` clean (the same 3 old `woodTexture.worker.ts` errors remain). ESLint and Prettier clean on touched files.
- Worker bundle (`wrangler deploy --dry-run`): 195.5 KiB, 52.2 KiB gzipped. The creature modules add about 18 KB minified, and Three.js tree-shakes to nothing. That's well under the plan's 150 KB fallback threshold.
- E2E `tests/rangedWeaponsMultiplayer.e2e.ts`: two Chromium browsers against `wrangler dev`, **passing**. It checks:
  - The owner picks up a creature, and the watcher sees it leave their herd and held by the owner's slot, drawn under the arm (`screenshots/online-remote-carry.png`).
  - The watcher's claim is refused with `taken`.
  - Put down: back in the watcher's herd.
  - The owner turns the rule off: the room puts the owner's new carry down, and the watcher's claim is refused with `rule`.

- Regression: `tests/multiplayer.e2e.ts` (5 tests: publishing, roles, a dropped connection, co-building, doors through a server restart, punching) plus `tests/rangedWeapons.e2e.ts` (4 tests), Chromium: **9 of 9 passing** (8.5 min).

### Not verified yet

- **Rendering.** Under green light the creature under a remote player's arm can blend into the grass (seen in the screenshot). It is drawn, but it's hard to see at a distance.
- **Knock-out and sit releases online.** These are tested in `RoomCoreCarry.spec.ts` with fake connections, not in the browser.
- **Hibernation in a real Durable Object.** Covered by the unit test's restore path only.
- **WebKit and Firefox.** The new e2e test runs only in Chromium.

## Phase 3 — Pellets that hurt other players (2026-11-04)

**Decisions used:** Q9 A (3 points), Q10 B (5 charges, enforced by the room), Q11 B, Q12 (30 m), Q13 A (the shooter detects, the room validates), Q14 A (walls aren't checked by the room, accepted risk), Q25 (projectile damage source and death card).

### What was built

| Area         | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared rules | `creatureProjectile.ts`: `shotOriginPlausible` (within 3.5 m of the shooter's eye from their last pose) and `shotHitPlausible` (where the pellet's path was at the reported time is within 0.45 + 3 m of the target's feet horizontally, and within the body's height ±1.5 m; flight between 0 ms and lifetime + 400 ms); `ROOM_SHOT_CLOCK_SLACK_MS` (1 s). `PlayerHealth.ts`: `DamageSource` adds `{ kind: 'projectile', by, species }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Room         | `RoomCore.ts` `handleShoot` refuses unless all of these hold: carrying, the rule is on, alive, not seated, not flying or under water (pose flags), `at` within ±1 s of the room clock, a plausible origin, and a charge spent on the shooter's own clock (`at`), so jitter between two quick shots can't refuse the second. Refusals reply `shotResult { refused, charges }`. Accepted shots are broadcast as `shot` (colour included) to everyone else. `handleShotHit` checks it's the sender's own unresolved shot (each shot can land once), the target is another connected player with a pose, the rule is on, and the hit is plausible, then applies `damageHealth(3)` with the projectile source. Only the shooter hears `shotResult { hit }`. The 16 most recent shots are kept per player, not per carry, so a pellet still in the air when its creature is put down can land. Stats: `shotsFired`, `shotsRefused`, `shotHitsAccepted`, `shotHitsRejected`. |
| Client       | `NetSession.ts` (`sendShoot`, `sendShotHit`, `onShot`, `onShotResult`), `MultiplayerSession.ts` (`fireShot` stamps the room clock; `reportShotHit` sends fire time + flight time; `shotTargets` lists the other players as drawn, skipping offline and knocked-out ones; remote `shot` messages are drawn with their age taken off). `ProjectileSystem.ts`: local pellets carry their shot id and sweep the targets every step, the first body met wins unless the world is in the way first, then it's an impact of kind `player` (`playerHits`). Remote pellets are visual only and never report hits.                                                                                                                                                                                                                                                                                                                                                              |
| Scene / UI   | `ThreeScene.ts`: `launch` also sends the shot; player impacts report the hit; the room's verdicts become a hit event or a charge resync (`CarryController.resyncCharges`). `+page.svelte`: a hit shows the same X marker and sound as a landed punch; being hit plays the punch sound and vignette; the death card reads "You were knocked out by Sam's Moon Ribbon". `RoomHealthAuthority.ts`: any source with a player behind it is reported as damage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Where the build differs from plan revision 2

1. **Charges are spent on the shooter's clock (`at`), not on the room's arrival time.** That `at` must be within ±1 s of the room clock, which keeps it honest within one second.
2. **Shots are tracked per player rather than per carry**, so plan §12 case 6 holds.
3. **Hit plausibility uses the path point at the reported time against the target's last pose**, with 3 m of horizontal slack and 1.5 m vertical, instead of "3 m + body radius of the feet capsule". The effect is the same.
4. **No separate "out of range" HUD cue.** Pellets simply end at 30 m.

### Verification

- Unit: 217 files, 2,597 tests passing. New in this phase:
  - `RoomCoreCarry.spec.ts` "creature pellets": broadcast with colour; a 3-point hit seen only by the target, with the projectile source; one landing per shot; refused hits that are off-path, too late, or on the shooter; refused far origins, off-clock shots and empty charges, with the room's charge count returned; the rule switching off; a pellet landing after its creature was put down.
  - `creatureProjectile.spec.ts`: the room's checks.
  - `ProjectileSystem.spec.ts`: a local hit is reported, a wall in front wins, remote pellets never report, and pellets expire at 30 m.
- TypeScript: app and `server/` clean (apart from the old `woodTexture.worker.ts` errors). ESLint and Prettier clean.
- E2E `tests/rangedWeaponsMultiplayer.e2e.ts`, two Chromium browsers against `wrangler dev`: **passing**, now including a pellet fired 8 m at the other player. The shooter sees the hit marker, the target loses exactly 3 points, the shooter's health is untouched, and the target's client drew the pellet (`screenshots/online-pellet.png`).
- Regression: `tests/multiplayer.e2e.ts` (including punching and co-building) and `tests/rangedWeapons.e2e.ts`, Chromium: **9 of 9 passing** (8.7 min).

### Not verified yet

- **Accepted risk (Q14).** A modified client can shoot through walls. Honest clients stop pellets at walls, and `shotHitsAccepted` is counted per room for spotting abuse.
- **No full knock-out by pellets in the browser.** The death-card text "by Sam's Moon Ribbon" isn't tested end to end. The room path to zero health is shared with punching, which is.
- **Pellets haven't been seen mid-flight in a screenshot.** The target's client counts the remote pellet (`projectiles.launched`), but no screenshot caught one.
- **Untested conditions:** lag spikes, hits at the 30 m limit, players moving fast across each other's line of fire, WebKit and Firefox.
- **Performance:** the frame-pacing benchmark and the 20-player soak with bots firing (plan §11) haven't been run. `server/tools/bots.mjs` doesn't fire pellets yet.

### Deploying

Protocol v6 means **the Worker and the site go out together**, as with v5. A v5 client gets "Please refresh the game to update it". Deploy the Worker (`cd server && npx wrangler deploy`), then the site. To roll back:

- **Client only:** `RANGED_WEAPONS_ENABLED = false`.
- **Per world:** the owner turns off Rules → Creature projectiles.
- **Full revert:** revert both the Worker and the site. Revert the Phase 0 fauna commit too if you want the old species back.

## Performance checks (2026-11-04)

Raw numbers: [`ranged-performance.json`](ranged-performance.json). Tools: `scripts/profile-carry.mjs` (new) and `server/tools/bots.mjs --carry / --fire` (new flags).

### Frame pacing (plan §11 budget: p95 rises by ≤ 0.5 ms with 4 carriers firing, Medium)

Headless Chromium on the GPU (Metal) against the production preview, Main World, Medium, 1280×800. Frame callback intervals (ms), second run:

| Phase                                                                                                        | fps  | p95  | p99  | max  | frames > 25 ms                 | feature cost per frame |
| ------------------------------------------------------------------------------------------------------------ | ---- | ---- | ---- | ---- | ------------------------------ | ---------------------- |
| Idle, not carrying                                                                                           | 60.0 | 18.3 | 19.1 | 20.0 | 0                              | —                      |
| Walking, not carrying                                                                                        | 60.0 | 18.6 | 20.0 | 25.3 | 1 (creature streaming, 3.5 ms) | —                      |
| Carrying, idle                                                                                               | 60.1 | 18.5 | 19.1 | 19.4 | 0                              | ≈ 0.04 ms              |
| Carrying, firing continuously                                                                                | 60.0 | 18.4 | 19.1 | 19.9 | 0                              | ≈ 0.10 ms              |
| Walking and firing                                                                                           | 60.0 | 18.5 | 20.0 | 24.2 | 0                              | ≈ 0.10 ms              |
| This player plus 3 simulated carriers firing (3 more creatures in view, their pellets at the sustained rate) | 60.0 | 18.3 | 19.2 | 20.7 | 0                              | ≈ 0.11 ms              |

**Result: within budget.** p95 doesn't rise measurably (18.3–18.6 ms in every phase). Per frame, `projectiles.update` costs ≤ 0.03 ms, `heldCreature.update` ≈ 0.03 ms and `CarryController.update` ≈ 0.05 ms. The first run had one 70.7 ms frame while firing, but the soak's room server was running at the same time, and the second run had none in any carrying or firing phase. The simulated carriers aren't real remote avatars (no network or character rigs), so this measures this feature's rendering and simulation cost, not a full 4-player session.

### 20-player soak (local room)

20 Node bots for 60 s against `wrangler dev` on the same machine, so round-trip times are local. The firing run has every bot carry a creature and send a shot every 360 ms. The room accepts about one shot per 1.5 s per carrier once the first 5 are spent, and refuses the rest. Real players' clients don't send shots without a charge, so this is harsher than play.

|                                         | Baseline (walking) | Carrying and firing                                                                |
| --------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| Disconnects                             | 0                  | 0                                                                                  |
| Round trip p50 / p99 / max (ms)         | 0.9 / 3.9 / 6.0    | 0.6 / 3.8 / 5.9                                                                    |
| Pose entry age p50 / p99 (ms)           | 29 / 57            | 29 / 56                                                                            |
| Snapshots per second per bot            | 12.6               | 12.3                                                                               |
| Download per bot (bytes/s)              | 3,914              | 5,948 (+52%)                                                                       |
| Upload per bot (bytes/s)                | 255                | 569                                                                                |
| Carries granted                         | —                  | 16 of 20 (4 `taken`: only 16 carryable creatures lived within reach of the circle) |
| Other players' pellets received per bot | —                  | 11.1 per second                                                                    |

**Result:** pose relay was unaffected. Latency and entry age didn't change, and nobody disconnected. Firing adds about 2 KB/s of download per player at this deliberately excessive rate, mostly `shot` broadcasts plus refusals. Against the deployed Worker, expect the same message counts with real network round trips. The bots don't report hits, so damage traffic isn't included. It's small: one `shotHit` and two replies per landed pellet.

### Not measured

- **Deployed room, and longer runs.** The soak ran against a local room only, not the deployed Cloudflare Worker, and for 60 s, not hours.
- **Real browsers.** The soak used Node bots, not real browsers (client rendering of 20 carriers' avatars and pellets).
- **WebKit, Firefox and lower presets** for frame pacing.

## Phase 2b — Lab-placed creatures shared online (2026-11-04)

**Decisions used:** Q4 C (placed creatures are carryable and their new spot is saved), F2 (shared online through the world's edit feed), Q16 + F2 (moving one needs edit rights).

### What was built

| Area                   | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rows                   | `worldEntities.ts`: new top-level kind `creature`. `AuthoredContent.placedCreatures` flattens into rows and back, sorted by id. `mergePlacedCreatures` rebuilds a world from base + rows: rows join (and, by id, replace) the base's `creatures.individuals`, and nothing else in the world's `creatures` field changes.                                                                                                                                    |
| Store / feed           | `WorldStore.ts`: a creature row must have a species, an individual, and a finite position and heading, with at most 1,000 per world (the world file's cap). Viewers can't add or change rows, as before. `WorldOpFeed.ts`: `AffectedContent.creatures`, "a creature" in notices.                                                                                                                                                                            |
| Publishing and loading | `server/src/WorldRoom.ts`: new publishes store placed creatures as rows (owned by the publisher) and keep an empty list in the base. `worldTransfer.ts` assembles online worlds with `mergePlacedCreatures`.                                                                                                                                                                                                                                                |
| Runtime                | `CreatureRuntimeManager.ts`: `placedRevision` changes only when placed creatures are added, put down or removed, never while they wander, so wandering never turns into edits. `sharedPlacedCreatures()` lists saved spots, not live positions. `applyPlaced(list, ids)` adds, moves or removes from other players' edits, and a creature being carried keeps being carried. `release(…, { save: false })` shows someone else's put-down without saving it. |
| Scene                  | `ThreeScene.ts`: online content includes `placedCreatures`. The shared revision includes `placedRevision`. Other players' creature edits apply through `applyPlaced`. `resolveCreature` finds placed recipes in the world. A remote put-down of a placed creature isn't saved locally, because the carrier's own edit does that. Placing from the Creature Lab online is an ordinary `add` edit.                                                            |
| Room                   | `RoomCore.ts` `carryableHere`: ambient creatures from the seed (home = cell centre, 80 m), placed ones from the world's rows (home = saved spot, 20 m). Placed creatures need edit rights (viewers get `role`). Recipes from rows are checked defensively (`safeAbility`). If a carried placed creature is removed by a committed edit, the room takes it off the carrier's arm.                                                                            |

### Where the build differs from plan revision 2

1. **The carrier's own client saves the put-down, as a normal edit, instead of the room committing the move.** The room never authors edits. If the carrier leaves or drops out while carrying, the placed creature keeps its last saved spot, and everyone sees it back there after they reload. Other players see it where it was put down until then.
2. **Worlds published before this change keep their placed creatures in the base record.** Those are still visible online exactly as before, but can't be carried online, because the room only knows rows. Migrating them into rows in place would leave clients with cached copies of the world out of step, so that was left alone. Republishing (or a fresh publish) makes them shared.
3. **The room's pick-up radius for a placed creature is 20 m from its saved spot.** It wanders around that spot locally.

### Verification

- Unit: 218 files, 2,608 tests passing. New tests:
  - `placedCreatureRows.spec.ts`: rows round-trip; a put-down is one `patch` of `position`; `affectedBetween` marks only that creature; the merge replaces by id, keeps base settings, and leaves older worlds as they were.
  - `RoomCoreCarry.spec.ts`: an editor near the saved spot can carry it; a viewer gets `role`; a player 50 m away gets `far`; removal releases the carry; malformed rows are rejected.
  - `CreatureCarry.spec.ts`: `applyPlaced` add, move and remove; wandering doesn't change `placedRevision`; a remote put-down isn't saved.
- TypeScript (app and `server/`), ESLint and Prettier clean on touched files.
- E2E `tests/rangedWeaponsMultiplayer.e2e.ts`, new test, **passing** in two Chromium browsers against `wrangler dev`: the owner places a small creature through the Creature Lab's placement call, and it reaches the editor through the shared world. The editor walks up and picks it up with `K`; the owner sees it held. The editor carries it 8 m and puts it down, and the owner's saved world moves it to within 2 m of the new spot.
- Regression, Chromium: `rangedWeaponsMultiplayer.e2e.ts` (2), `multiplayer.e2e.ts` (5, including publishing, offline copies of online worlds, co-building and punching) and `rangedWeapons.e2e.ts` (4), **11 of 11 passing** (10.8 min). One earlier run of the online pick-up step failed because a wandering creature stepped out of reach between aiming and pressing `K`. The test helper now re-aims up to 12 times.

### Not verified yet

- **Older worlds:** republishing an already-published world to move its base creatures into rows wasn't tested.
- **Viewers and the Creature Lab:** a viewer placing a creature with the Creature Lab online (the edit is refused, as for any building) wasn't checked in the browser.
- **Leaving mid-carry:** the case where the carrier leaves while carrying a placed creature (it stays at its last saved spot) is covered by reasoning and the room's unit tests, not end to end.

## Where the whole plan stands

Every phase of plan revision 2 is built: 0, 1, 2, 2b and 3, plus the performance checks. Nothing is committed or deployed. Deploy the Worker and the site together (protocol v6).

## Robustness pass on online shooting and carrying (2026-11-04)

A review of every path a pellet or a pick-up takes between two browsers and the room, looking for what breaks under real networks. Nine problems were found and fixed. Each has a test, and the two biggest were confirmed to fail without their fix.

| #   | Problem                                                                                                                                                    | Effect before                                                                                                                                                                                                | Fix                                                                                                                                                                                                    | Test                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **The room kept a player's last message ids across a reconnect.** A page reloaded inside the 30 s grace period numbers its messages from 1 again.          | Every shot, pick-up, punch and fall report from the reloaded page was **silently ignored** until the new ids overtook the old ones. This also affected punching and fall damage, which predate this feature. | `RoomCore` resets the fall, punch, carry and shot ids when a new connection takes over a player                                                                                                        | `RoomCoreCarry.spec.ts` "reloaded page" (fails without the fix)                                                                                                     |
| 2   | **No lag compensation.** Hits were checked against the target's latest pose, but the shooter sees other players about one interpolation delay in the past. | Hits on running players were rejected even though they connected on the shooter's screen.                                                                                                                    | The room keeps each player's last 24 poses (cleared on teleport) and accepts a hit if the path met the target at any pose from the 800 ms before the hit (`ROOM_HIT_REWIND_MS`), or at its latest pose | `RoomCoreCarry.spec.ts` "lag compensation": a target that ran 7 m away after being hit is accepted, and one never near the path still isn't (fails without the fix) |
| 3   | **Charge timing was exact to the millisecond.** The shooter's room-clock estimate can move a few ms between two shots.                                     | A legitimate shot 350 ms after the last could be refused.                                                                                                                                                    | `canSpendCharge` / `spendCharge` take a slack. The room forgives 60 ms (`ROOM_SHOT_TIMING_SLACK_MS`) on the gap and on refills, which never accumulates past one shot.                                 | 320 ms accepted, 200 ms refused                                                                                                                                     |
| 4   | **A pick-up granted after the client's 2 s timeout was dropped.**                                                                                          | The room thought the player held a creature they didn't, so it was gone from everyone's herd.                                                                                                                | `MultiplayerSession` hands a late grant straight back (`drop` at where the player stands)                                                                                                              | `MultiplayerSessionCarry.spec.ts` (new, fake socket)                                                                                                                |
| 5   | **A refused shot kept flying on the shooter's screen.**                                                                                                    | It looked like a real shot nobody else saw and that couldn't hurt anyone.                                                                                                                                    | `shotResult` carries the shot id, and the scene removes that pellet (`ProjectileSystem.cancelShot`)                                                                                                    | `ProjectileSystem.spec.ts`                                                                                                                                          |
| 6   | **The pellet pool could be full of other players' pellets.**                                                                                               | This player's own shot got no pellet, so it couldn't hit anyone.                                                                                                                                             | A local shot takes the slot of the oldest remote pellet                                                                                                                                                | `ProjectileSystem.spec.ts` (64 remote, then a local one still hits)                                                                                                 |
| 7   | **The muzzle could poke through a wall the player stood against.**                                                                                         | Shooting through thin walls at point blank.                                                                                                                                                                  | If the eye-to-muzzle segment is blocked, the pellet leaves from the eye along the crosshair (and meets the wall at once)                                                                               | Reasoned; no automated test (the e2e world has no walls)                                                                                                            |
| 8   | **Other players' pellets passed through bodies**, the local player's included.                                                                             | The target never saw the pellet land on them.                                                                                                                                                                | Remote pellets stop at any body as this client draws it, as a visual impact (`body`) that's never reported                                                                                             | `ProjectileSystem.spec.ts`                                                                                                                                          |
| 9   | **Firing while disconnected** spent charges on pellets nobody else saw.                                                                                    | Misleading.                                                                                                                                                                                                  | Online and disconnected counts as "stowed": no firing, and the HUD dims                                                                                                                                | `MultiplayerSessionCarry.spec.ts` (`connected()` false, `fireShot` null)                                                                                            |

Checked and found sound:

- **Each shot lands once:** the room marks a shot resolved on its first hit report.
- **Malformed input can't crash the room:** strict parsers, and recipes from rows are checked defensively.
- **Shooter and target are kept apart:** the room refuses self-hits, and knocked-out and offline players aren't targets.
- **Message ordering:** hits arrive on the same socket after their shot.
- **The room clock is checked:** `at` must be within ±1 s.
- **The rule switching off mid-flight refuses hits.**
- **A pellet still in the air when its creature is put down still counts.**
- **Message rates are low:** at most about 3 shots and hit reports a second, well under the room's 20 JSON messages a second per player.

Known limits that remain:

- **Walls aren't checked by the room** (Q14, accepted risk).
- **Pellets drawn for other players start where the shooter's camera muzzle was**, not at the creature under their avatar's arm. That's a visual offset of about half a metre.
- **If the room hibernates mid-fight**, hit reports for pellets fired just before are ignored. This is unlikely, because firing keeps the room awake.

Verification: 219 unit files, 2,618 tests passing, and TypeScript (app and server), ESLint and Prettier clean on touched files. E2E results below.

- E2E, Chromium: `rangedWeaponsMultiplayer.e2e.ts` (2, including a pellet hit and placed creatures across two browsers), `multiplayer.e2e.ts` (5, including punching after the id-reset change) and `rangedWeapons.e2e.ts` (4): **11 of 11 passing** (10.8 min).

## Cover: pellets stop at floors and ceilings at any angle (2026-11-07)

Pellets already stopped at walls, doors, stairs, furniture, fences, Mini Builds, terrain and foundations, using the collision rectangles and surface heights the player walks against. Floors and ceilings were only checked at single points every 20 cm, though, so a pellet shot down through a floor (at 30° or 80°, for example) or into a floor's edge passed straight through.

`player/projectileWorld.ts` (pure, unit-tested) now tests each 20 cm step as a segment:

- Down through terrain, a foundation, a floor or a roof (the surface under where the step started is now above the pellet).
- Up through a ceiling or roof underside.
- Sideways into a floor or roof's edge. This uses the new `SlabManager` / `RoofManager.getSpansAt` and `WorldSurfaceSampler.isInsideSlab`, which read the slabs' and roofs' existing bottom and top.

No geometry was added. `ThreeScene.projectileCollision` delegates to it, so both your own and other players' pellets use it. In a test building: a wall stopped pellets at its face, pellets over it flew on, shots down through a floor at 30–89° stopped at its top, shots up at 30–89° stopped at the ceiling underside, and a shot into the floor's edge stopped at the edge. The room still doesn't check walls (Q14 A): it's the shooter's browser that decides, so normal players can hide behind walls, floors and ceilings.

## Every player can pick up and shoot (2026-11-07)

Some players were told they couldn't pick up a small creature, or found that `K` did nothing. There were three causes:

1. **Build Mode stowed the carry.** World owners, editors and single-player worlds open in Build Mode, where carrying is stowed. While stowed, no creature was offered as a target, so `K` did nothing. Now a creature can be picked up from any mode. Picking it up leaves Build Mode and any global mode (`BuildToolManager.enterNormalMode`), so firing works straight away. Flying and underwater still stow it, and firing still waits.
2. **Viewers got `role` for Lab-placed creatures.** Anyone may carry any creature now. A viewer's put-down isn't saved to the world (`release(..., { save: !locked })`), so the creature goes back to its saved spot for everyone else.
3. **The `far` check refused valid pick-ups.** The room checked distance from the creature's home cell, or from a put-down it remembered. Those remembered put-downs were lost when the room slept, so a creature carried away and dropped became "too far" for everyone. The check is gone for carrying and riding. The room still checks the state (alive, not seated, not already carrying), that the creature is eligible (small enough, rideable), that the rule is on, and that the creature isn't taken. The removed code: `CARRY_CLAIM_RADIUS`, `PLACED_CLAIM_RADIUS`, the released-spot memory and `rideClaimRadius`. `CarryRefusal` is now `taken | ineligible | rule | state`, and `RideRefusal` is `taken | ineligible | role | state`. Riding a Lab-placed creature still needs edit rights.

Verified with 2,784 unit tests and the carrying, online carrying and riding e2e suites (9 tests). In the browser, from Build Mode: the creature under the crosshair was offered, `K` picked it up and switched to normal mode, and a pellet fired.
