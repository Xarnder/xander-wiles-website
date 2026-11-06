# Waypoints and carry badges — implementation notes

_2026-11-06. Follows the ranged-weapons work in `docs/2026/11-04/range-weapons/` and the marker model in
`docs/2026/10-22/Multiplayer/multiplayer-social-features.plan.md` §3 (ping / waypoint / landmark)._

## What the player gets

1. **Gold paw badges over carryable creatures.** Every small four-legged creature you can pick up (the
   same rule as K: a quadruped ≤ 0.9 m, `abilityFor`) has a gold paw badge floating above it within
   25 m, fading out over the last 8 m. The one under the crosshair, and the one the creature waypoint
   follows, is drawn larger. Badges are depth-tested (they don't show through hills or walls), and
   they are hidden while you carry a creature, in Build Mode, and online when shared creature
   projectiles are off. They can be turned off in Pause → Waypoints (saved for every world).
2. **Pause → Waypoints** (new button in the Explore group). The list always starts with
   **Nearest carryable creature**, then your own waypoints. Each row has an on/off switch, the
   distance (and, for the creature waypoint, the creature's name), and × to delete your own.
   **Add here** drops a waypoint where you stand, with an optional name (24 characters, up to 20 per
   world).
3. **Dynamic waypoint: Nearest carryable creature.** It moves with the creature every frame and
   re-picks the nearest one every 0.5 s. A different creature has to be at least 3 m closer to take
   over, so the waypoint doesn't flick between two creatures at about the same distance. It hides
   itself while you carry a creature (status "carrying") and comes back when you put it down. If no
   carryable creature is loaded it says "none nearby".
4. **Beacons.** Each waypoint that's on has a 70 m soft beam in its colour (ignores fog, so you can
   see it from far away; fades out within 14 → 4 m so it never fills the screen on arrival) and a
   floating pin with its icon (⚑ for yours, 🐾 for the creature) that shows through trees.
5. **Locator bar.** Waypoints that are on show on the locator bar at the top as a pin-shaped marker
   with their icon (shape, not just colour, says "place, not person"), with name and distance.
   Out of view they wait at the end of the bar with ◀ / ▶ pointing the way to turn, like the
   closest player. The bar now also shows in single player whenever a waypoint is on. Labels that
   would overlap (two waypoints in nearly the same direction) drop to a second or third row.

## Where it lives

| Piece                                                        | File                                                                                                                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Waypoint model, retargeting, persistence                     | `src/lib/game/waypoints/WaypointSystem.ts`                                                                                                                            |
| Beams and pins in the world                                  | `src/lib/game/waypoints/WaypointBeacons.ts`                                                                                                                           |
| Paw badges                                                   | `src/lib/game/creatures/CarryHints.ts`                                                                                                                                |
| Nearest carryable / creature position / carryable cache      | `CreatureRuntimeManager.nearestCarryable`, `creaturePosition`, `isCarryable`                                                                                          |
| Crosshair candidate id for the badge                         | `CarryController.targetId`                                                                                                                                            |
| Locator markers (`kind: 'waypoint'`, icon, label rows)       | `src/lib/game/hud/LocatorBar.ts`, `src/lib/components/LocatorBar.svelte`                                                                                              |
| Online: player markers + scene's waypoint markers on one bar | `MultiplayerSession` (`locatorExtrasActive`, `placeLocatorExtras`)                                                                                                    |
| Wiring, per-frame update, public API for the UI              | `ThreeScene` (`updateWaypoints`, `getWaypoints`, `setWaypointEnabled`, `addWaypointHere`, `removeWaypoint`, `setCarryHints`, `setWaypointWorld`, `setLocatorElement`) |
| Pause panel                                                  | `src/lib/components/PauseMenu.svelte`, wired in `src/routes/+page.svelte`                                                                                             |

### Locator bar ownership

- **Single player:** `ThreeScene` owns a `LocatorBar` and drives it itself (waypoints only).
- **Online:** `MultiplayerSession`'s bar draws players as before and calls the scene's
  `placeLocatorExtras` before `endFrame`, so players and waypoints share one bar without fighting
  over the DOM. The scene's own bar is detached while online. With Settings → "Show locator bar"
  off, players are hidden but waypoints you turned on (and a tracked player) still show.

### Saving

- Waypoints are saved in `localStorage` under `forest-drift.waypoints.v1:<world id>` (online worlds
  use `online:<worldId>`), so each world keeps its own. Saved: whether the creature waypoint is on,
  and each personal waypoint's id, name, colour, position and on/off.
- The badge preference is global: `forest-drift.carry-hints.v1`.
- Every read and write is wrapped, so a blocked or corrupt store just means waypoints aren't kept.

## Public waypoints in online worlds (added later the same day)

Each of your waypoints is **Private** or **Public**, and a public one has a separate
**Others can control** switch. Seeing a waypoint and controlling it are different things:

|                             | Sees it (list, beacon, locator bar)                                 | Turns it on/off for everyone, renames it | Private/public, others' control, remove |
| --------------------------- | ------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| Private                     | Only you                                                            | You                                      | You                                     |
| Public                      | Everyone in the world, including visitors and people who join later | You (and the world's owner)              | You (the world's owner can remove it)   |
| Public + Others can control | Everyone                                                            | Everyone                                 | You (the world's owner can remove it)   |

- Every waypoint starts private. Switching **Public** on sends it to the room; switching it off
  takes it out of the room (it disappears for everyone else) and keeps it in your browser.
- The creature waypoint is always private (creatures wander differently for each player). In
  single-player worlds the **Public** switch is still shown, off and greyed out, with "public
  waypoints are for online worlds".
- Someone else's public waypoint shows whose it is ("Olive's · only they can change it"), and who
  last changed it ("changed by Vince"). Without control, its switch is disabled.
- Changes show straight away and are confirmed by the room; if the room refuses (a limit, no
  rights, removed meanwhile) your copy snaps back and the panel says why. Offline, changes to public
  waypoints are not made and the panel says so.
- Limits: 20 public waypoints per player and 60 per world (and 20 private per world, as before).
  A new public waypoint must be within 2 km of where the room last saw its creator.
- Public waypoints are **saved with the world** in the room (meta key `waypoints`): they stay when
  everyone leaves, when the room sleeps or restarts, and across a world restore (they're places to
  meet, not building). They aren't part of world exports or _Save a copy_.

**Protocol 7** (`src/lib/game/net/sharedWaypoints.ts`, shared by the room and the browser):

- C→S `{t:'waypoint', op:'put', waypoint}` — publish, or the creator's (or world owner's) full
  change; `{op:'set', id, on?, name?}` — on/off and rename, for anyone who may control it;
  `{op:'remove', id}`.
- S→C `{t:'waypoints', put?, remove?}` to everyone (the sender included, with the room's stamped
  copy: owner, owner's name, who changed it); a refusal goes to the sender alone with
  `refused: {id, reason}` and the waypoint as the room holds it. `welcome.waypoints` on joining.
- Rules and validation live in `WaypointBoard` (pure): names cleaned to 1–24 characters, `#rrggbb`
  colours, finite coordinates, ids `[A-Za-z0-9-]{4,48}`; on top of the room's 20 JSON messages per
  second per player.

**Pause → Waypoints** rows now have the **Show** switch (padded inside its wooden frame; "Show for
all" on a public waypoint), and below it, on each of your own waypoints, a labelled **Public**
switch with a line saying who can see and change it, then rename (✎) and remove (×). Once public, a
second switch, **Others can control**, appears. Other players' public waypoints show whose they are
instead.

## Deliberately not done (yet)

- Sharing with chosen players only, groups, expiry and arrival notices (plan §3.1, §3.7).
- Moving a waypoint after it's made, and choosing its icon or colour.
- Hiding someone else's public waypoint on your own screen without controlling it.
- Pings and landmarks from the same plan section.
- The creature waypoint only considers creatures in the loaded herd (the runtime's logical set),
  not ones in unloaded regions.

## Performance

- Badges, beacons and locator markers are pooled (24 each); after warm-up nothing is allocated per
  frame apart from one small position object for the followed creature.
- The locator bar still writes the DOM only when something changes; label stacking estimates label
  widths from text length rather than measuring the DOM.
- Retargeting scans the herd at most twice a second.

## Tests

- Unit: `WaypointSystem.spec.ts` (13: retargeting, hysteresis, following, carrying, persistence per
  world, corrupt/blocked storage, name cleaning), `LocatorBar.spec.ts` "LocatorBar waypoints" (5,
  incl. label rows), `CreatureCarry.spec.ts` "finding carryable creatures" (2).
- End to end: `tests/waypoints.e2e.ts` (badges shown, pause panel on/off and add, two beacons, two
  pins on the locator bar in single player, carrying hides the creature waypoint and the badges,
  kept across a reload, remove, badge toggle). Set `WAYPOINT_SHOTS_DIR` to write the screenshots in
  `screenshots/`.
- Regression: `multiplayer.e2e.ts`, `rangedWeapons.e2e.ts`, `rangedWeaponsMultiplayer.e2e.ts`
  (locator ownership changed in `MultiplayerSession`).
- Public waypoints: `sharedWaypoints.spec.ts` (the rules: who may see, control and manage; limits;
  distance; saved JSON; parsing), `RoomCoreWaypoints.spec.ts` (shared now and with late joiners,
  refusals to the sender only, kept after everyone leaves and after a restart, the world owner
  removing), `WaypointSystem.spec.ts` "public waypoints online" (8), and
  `tests/waypointsMultiplayer.e2e.ts` (two browsers and a real room: private by default, public
  for a visitor with beacon and locator pin, no control until allowed, then the visitor turns it
  off for everyone and renames it, private again removes it from the visitor).
