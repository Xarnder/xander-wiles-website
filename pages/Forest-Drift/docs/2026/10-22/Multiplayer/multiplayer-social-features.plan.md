# Forest Drift — Multiplayer social and co-operation features plan

Date: 22 October 2026<br>
Status: **Implementation in progress.** Authorised in chat on 24 October 2026, with incremental delivery at the implementer's discretion.<br>
Related: [`multiplayer-research.plan.md`](../../../multiplayer-research.plan.md) (architecture, rev. 3) · [`01-questions-and-decisions.md`](../../10-15/Multiplayer/feature-plan/01-questions-and-decisions.md) (locked decisions) · [`multiplayer-player-guide.md`](../../../multiplayer-player-guide.md) · [`Forest-Drift-gameplay-research-and-implementation-plan.md`](../../10-20/Forest-Drift-gameplay-research-and-implementation-plan.md) (items 18–24 and §17 villages)

---

## Implementation checkpoint — 24 October 2026

The first installment implements M0 and the Track action from M2. The remainder of this document describes the longer-term proposal, not completed functionality.

- **M0:** doors and occupied Mini Build locations are stored in one compact SQLite metadata row, written only on changes. Hibernation restores occupied seats only for connected players with unchanged, valid anchors. Disconnections release seats; an empty room or world restore clears session state. Reconnecting clients also close doors absent from the server's current state.
- **M2, partial:** a redesigned Multiplayer roster has player colours, presence, expandable permissions and a Track toggle, available to visitors as well as builders. Tracking keeps the chosen player labelled and pinned at the locator edge, with a distinct diamond marker. Stop with **U**, the locator's touch-friendly Stop control, or the roster toggle. The online badge also offers **Find people**. Tracking is local, follows the existing player identity through a brief disconnect, and clears when that player leaves. Explicit tracking temporarily shows the locator even if its graphics toggle is off.
- **Still pending:** all of M1 (pings, waypoints, landmarks and beacons), and M2's Locate beacon, Watch and consented travel. No new social messages are introduced here, so this installment retains protocol 4.
- **Validation:** room-restoration and locator regression tests, browser coverage for tracking/stop and phone-width layout, and a real local room-server restart with a late joiner. A real two-device/iPad session remains a manual follow-up.
- **Performance direction:** no 60fps target or fixed per-frame budget for this implementation, per the current user instruction. Preserve change-driven storage, bounded room state, and the existing locator's write-on-change behaviour.

---

## 1. Summary

Today, players in an online world can see each other move, build together, open doors, sit on Mini Build seats and find each other with the locator bar. They can't yet point things out, arrange to meet, or do anything together except build.

**Recommendation:** build one shared primitive first, the **marker**, and add features on top of it.

A marker is a position in the world, plus an icon, a colour, an audience and a lifetime. It appears in three places: the locator bar, an in-world beacon and (later) the world map. It comes in three tiers:

| Tier         | Example                                         | Created by                 | Lasts                                      |
| ------------ | ----------------------------------------------- | -------------------------- | ------------------------------------------ |
| **Ping**     | "Look here" at a door                           | Anyone (a key tap)          | 20 seconds                                 |
| **Waypoint** | "Old oak — meet here", shared with Sam and Alex | Anyone                      | Until removed, or until the room empties   |
| **Landmark** | "Village well", visible to everyone forever     | Owner (editors: decision D3) | Saved with the world                       |

Once markers exist, many later features need very little extra code:

- meeting up (ask to join a player, gather everyone);
- events ("concert at the lake in 5 minutes", with a marker);
- build requests ("bridge needed here");
- tours, races and treasure hunts (markers in order, or hidden markers).

**Proposed order:**

| Phase | What                                                          | Effort (dev days) |
| ----- | ------------------------------------------------------------- | ----------------- |
| M0    | Keep room state through Durable Object hibernation (doors, seats, markers) | 1–2 |
| M1    | Markers: pings, waypoints, landmarks, locator bar icons, beacons, basic mute | 6–9 |
| M2    | Find and meet: roster actions, track, spectate, consented "join player" | 3–5 |
| M3    | Expression: emote wheel, pointing, quick-chat phrases          | 4–6               |
| M4    | World map with players and markers; mark on the map            | 5–8               |
| M5    | Co-building awareness: who's editing what, placement ghosts, activity feed | 4–7 |
| M6    | Groups, owner announcements, events, group photo               | 3–5               |
| M7    | Games built from markers: treasure hunt, checkpoint races, hide and seek | 5–10 |
| M8    | Owner moderation: kick, mute, freeze building, rotate invites  | 2–4               |

**Total: about 33–56 developer days.**

The smallest release worth shipping is **M0 + M1 + M2**, about 10–16 days. It delivers the requested waypoint feature and makes it easy to find people.

---

## 2. What exists today, and the constraints that follow

Facts below are from the code as of commit `41407317`.

| Area | Current state | What it means for these features |
| --- | --- | --- |
| Locator bar | `hud/LocatorBar.ts`. Players only, keyed by `playerId`. Allocation-free per frame; all DOM writes batched in `endFrame`. The closest player is pinned to the edge with an arrow. Hidden when you're alone. | Generalise it to markers with icons. Keep the frame contract: no allocation, write only what changed. It must also show when you're alone but have markers. |
| Protocol | Version 4. Binary pose (24 B) and snapshot. JSON for rare messages. All 8 pose flag bits are in use. | New features use **JSON** messages and bump to protocol 5. No new per-frame traffic. Emotes can't fit in pose flags. |
| Room limits | 20 JSON messages per player per second; 2 KB per JSON message; 20 players. | Pings and waypoints are rare and small. Each feature also needs its own stricter limit (§10.3). |
| Roles | Owner, editor (builder), viewer (visitor). Enforced on the server. | Social features should work for **visitors** too. Landmarks and announcements are owner (or editor) features. |
| Identity | A per-browser `playerId`. Display names aren't verified. Links can be forwarded. | Show colour plus name everywhere. Owners need mute and kick before social features invite misuse. |
| Persistence | SQLite tables: `entities`, `ops`, `batches`, `players` (name, bookmark), `restore_points`. World entities go through the ops pipeline (undo, restore points, Save a copy). | Landmarks should be a **new entity kind**, so they get restore and export for free. Session waypoints need a small table of their own. |
| Hibernation | Players are rebuilt from WebSocket attachments. **`openDoors` and Mini Build seat occupancy are in memory only.** | Likely existing bug, not yet tested: if the room is evicted while everyone stands still, someone who joins after it wakes sees every door closed. Markers would have the same problem, hence M0. |
| Teleport flag | `handlePose` skips the speed check for **any** pose with the teleport flag set. | Today anyone could teleport with a modified client. "Join player" (M2) should come with a tightened rule: teleports are accepted only inside a window the room has granted (§5.3). |
| Notices | `MultiplayerSession` already passes `onNotice` toasts (environment and door changes). | Waypoint, join and arrival toasts use the same channel. |
| Chat | Locked decision **Q15-A: no chat in v1.** | v1 gets preset quick-chat phrases only. No free text, so nothing to moderate. Free-text chat stays a later, owner-enabled option (D7). |
| Flight | Off online (Q10-C), so the room can use a tight speed check. | Fast travel to landmarks stays off by default (D6). |
| Creatures | Simulated locally on each client; positions differ between players. | A ping on a creature can't follow it or name it reliably. It pings the spot and says "an animal" (§3.6). |
| Free plan | Cloudflare Workers Free. Conservative event counting in the usage panel. 100,000 SQLite row writes per day. | Every feature here costs a handful of messages per player-minute, tiny next to pose traffic. Writes: about 2 rows per waypoint and about 3 per landmark. |

**Free keys** (checked with grep in `src/`): **Z, Y, U, I and Tab** aren't bound in normal play. Some are used inside the Mini Build editor and dialogs only. Taken keys include T (Move and Place Object tools), M (Move Mode) and backquote (screenshot). Proposed bindings are in §11, subject to a binding audit.

---

## 3. Feature 1 (M1): Markers — pings, waypoints and landmarks

This is the feature you asked for: a player adds a waypoint, shares it with some or everyone online, and it shows on their locator bar with a special icon.

### 3.1 The three tiers in detail

|                    | Ping                                              | Waypoint                                                       | Landmark                                             |
| ------------------ | ------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| Purpose            | "Look at this", right now                         | "Meet here" or "this is where X is", for a session              | A permanent named place in the world                 |
| Who can create     | Everyone, including visitors                      | Everyone, including visitors                                    | Owner. Editors too if D3 = yes                       |
| Name               | None; a context label ("Sam: door")               | 1–24 characters, typed or chosen from suggestions               | 1–32 characters                                      |
| Audience           | Everyone online (or your group, M6)               | Everyone online · chosen players · my group · just me           | Everyone, always. Can be `hidden` for games (M7)     |
| Lifetime           | 20 s; ends early on arrival                       | Until removed; optional expiry (15 min, 1 h); ends when the room empties | Until deleted                                |
| Where it's kept    | Room memory only                                  | Room SQLite `session_markers` (survives hibernation); "just me" stays in the browser | World entity `landmark` (ops pipeline)  |
| Per-player limit   | 3 in 10 s, 1 every 1.5 s after that               | 10 live at a time                                               | 100 per world                                        |
| Locator bar        | Pulsing icon; pinned to the edge while live       | Icon in the creator's colour; pinned if tracked                 | Neutral icon; shows only when in view or tracked     |
| In-world           | Short pulse ring plus beam                        | Beam plus icon billboard with name and distance                 | Tall soft beam (only when tracked or within 150 m)   |

"Everyone online" means the people in the room now, **plus anyone who joins while the waypoint is live**. That matches what someone expects from "share with everyone". Waypoints for chosen players go only to those players (decision D4).

### 3.2 How a player uses it

**Desktop:**

1. **Tap Z**: ping whatever's under the crosshair. Your avatar briefly points at it (M3 reuses the build-reach arm IK).
2. **Hold Z**: a radial wheel opens at the crosshair. Moving the mouse picks an option; releasing confirms. Options:
   - Look here
   - Go here
   - Meet here
   - Help me build
   - Love this
   - **Waypoint…**
3. **Waypoint…** pauses pointer lock and opens a small sheet with:
   - a name, with suggestions ("Meet here", "Camp", "Build site", "Look at this");
   - an icon (pin, flag, star, house, tent, question mark, heart, hammer);
   - audience: Everyone online / Choose players (a checklist of the current roster with colours) / Just me;
   - lifetime: until I remove it / 15 min / 1 hour;
   - **Share**.
4. **Pause → Multiplayer → a player row → Send waypoint**: opens the same sheet with that player already selected.
5. **Removing a waypoint:** aim at its beacon, or pick it in the marker list (Pause → Multiplayer → Markers), and choose Remove. You can remove your own waypoints. The owner can remove anyone's.

**Touch** (`TouchControls.svelte`): a **ping button** beside Jump.
- Tap: ping at the screen centre.
- Long-press: the same wheel, laid out for thumbs.
- The waypoint sheet is a bottom sheet.

**Receiving a waypoint:**

- A toast: *"Sam shared 'Old oak' with you · 212 m · Track · Dismiss"*.
- With "Auto-track waypoints shared with me" on (the default), the newest shared waypoint is tracked automatically.
- **Dismiss** hides it on your device only. The creator isn't told.
- **Arrival:** within 4 m horizontally and 3 m vertically, a soft chime plays and the marker shows "Arrived". Pings disappear; waypoints stay but stop being tracked.
- The creator can choose to be told *"Alex reached Old oak"*. The room works this out from the poses it already checks, so this costs no extra client messages (§3.7).

### 3.3 Locator bar design

Currently, players are round dots in their colour. Markers need to be clearly different, even for colour-blind players, so **the shape carries the meaning**:

```
 ◀ Sam · 84 m      ●          ⬥ Old oak · 212 m          ●     ┆      ⬦     ⬦
                 (player)    (tracked waypoint, pill)  (player) centre (landmarks)
```

- **Waypoint:** a small rounded-square "pin head" with the icon glyph inside. Filled with the creator's colour; the glyph ink uses the existing `inkFor` contrast choice.
- **Ping:** the same shape plus a CSS pulse ring. Pulses three times, then holds still.
- **Landmark:** a neutral outline style (white rim, no fill), so permanent places don't compete with live markers.
- **Tracked:** the one marker *or* player you're tracking behaves like today's "closest player":
  - it stays pinned to the edge with an arrow when out of view;
  - it always shows its name and distance.
- **Only one thing is tracked at a time.** Tracking something new replaces the old one.
- **Height:** ▲/▼ above 3 m height difference, as for players.
- **Draw order:** tracked > live pings > closest player > waypoints > other players > landmarks.
- **Overlaps:** markers closer than about 12 px merge into a stack showing the top icon and a count ("⬥ +2"). The stack expands when it's within the existing 4° "name window" at the centre. There's no hover in pointer lock, so the centre window takes hover's place.
- **Visibility:** the bar shows when there are other players *or* any markers. Personal waypoints therefore also work in single-player worlds.

**Implementation notes** (keeping today's performance contract):

- Generalise `Marker` with `kind: 'player' | 'ping' | 'waypoint' | 'landmark'` and an `icon`.
- `MultiplayerSession.beforeRender` calls `place()` for markers as well as players. Markers are static, so their per-frame cost is just the angle maths.
- Icons are `<svg><use href="#fd-icon-star"/></svg>`. The `<symbol>`s are defined once in `LocatorBar.svelte`. The `href` is written only when the icon changes: no `innerHTML` and no per-frame DOM creation.
- Cap at 40 markers drawn. Beyond that, show the nearest 40 in view, plus the tracked one.
- Extend `LocatorBar.spec.ts`:
  - icon shapes per kind;
  - the tracked marker pinned at the edge;
  - stacking;
  - zero allocations per frame with 20 players and 50 markers;
  - DOM writes only on change.

### 3.4 In-world beacons

- **Beam:** one `InstancedMesh` for every marker beam. It's a tall, thin, additive, unlit cylinder with a vertical gradient, in the marker's colour (landmarks are white).
  - Fades out within 8 m, so it doesn't fill the screen when you're standing in it.
  - Fades with fog distance, so it doesn't break the atmosphere.
- **Icon billboard:** one `InstancedMesh` of camera-facing quads reading from a small icon atlas (8 icons × 64 px).
  - Drawn without depth testing, so it shows through trees, at a capped size.
  - Name and distance labels reuse the canvas-sprite approach of the player name tags in `RemoteAvatarRenderer`. Only labels within 60 m, or the tracked one, get a texture.
- **Ping pulse:** a ground ring (decal-style quad) that expands twice.
- **Budget:** at most 0.15 ms per frame on the M4 MacBook Air with 40 markers. Beacons are excluded from shadows, reflections and the hydrology pass.
- **Settings:** Settings → Graphics → "Show marker beacons" (on). The existing locator bar toggle stays separate.

### 3.5 What a ping attaches to

A ping raycasts from the crosshair, using the same centre-screen ray as the other tools, and records what it hit:

| Hit                                      | Stored                                  | Label             | Follows the object? |
| ---------------------------------------- | --------------------------------------- | ----------------- | ------------------- |
| Terrain or water                         | Position                                | "here" / "water"  | n/a                 |
| Building entity (wall, roof, foundation…) | Position + `entityKey`                 | "this building"   | Yes, if moved (Move tool) |
| Door                                     | Position + opening id                   | "door"            | Yes                 |
| Mini Build or furniture                  | Position + instance id                  | design name       | Yes                 |
| Remote player                            | `playerId`                              | their name        | Yes (pings the person) |
| Tree, plant or creature                  | Position only                           | "tree" / "an animal" | No (see below)  |

**Creatures don't follow.** Creatures are simulated separately on each client, so the creature at a spot on one screen may not be there on another. The ping marks where you saw it and says "an animal". It deliberately never names a species or follows one.

**Entity-attached markers** look up the entity's current position each frame, using the local replica's foundation and instance transforms. If the entity is deleted, the marker falls back to its last stored position.

### 3.6 Data model

```ts
// src/lib/game/net/markers/markerTypes.ts (shared by client and RoomCore)
export type MarkerKind = 'ping' | 'waypoint' | 'landmark';
export type MarkerIcon =
	| 'pin' | 'flag' | 'star' | 'house' | 'tent' | 'question' | 'heart' | 'hammer'
	| 'look' | 'go' | 'meet' | 'help';

export type MarkerAudience =
	| { to: 'all' }
	| { to: 'players'; ids: string[] } // playerIds, at most 19
	| { to: 'group' }                  // M6
	| { to: 'self' };                  // never sent to the room

export interface Marker {
	id: string;              // client-generated UUID; room rejects duplicates
	kind: MarkerKind;
	icon: MarkerIcon;
	name: string;            // '' for pings
	colour: string;          // creator's colour unless they choose one
	x: number; y: number; z: number;
	attach?: { kind: 'entity' | 'door' | 'miniBuild' | 'player'; key: string };
	audience: MarkerAudience;
	createdBy: string;       // playerId (room fills this, never trusted from the client)
	createdAt: number;       // room clock, ms
	expiresAt: number | null;
	notifyArrival?: boolean;
	hidden?: boolean;        // landmarks only, for treasure hunts (M7)
}
```

Landmarks are stored as a new top-level entity kind, `landmark`, in `worldEntities.ts`. Its data is `{ name, icon, x, y, z, hidden }`. This brings undo, restore points, *Save a copy*, `.forestworld` export and offline single-player support for free. The other two tiers use the realtime messages below.

### 3.7 Protocol 5: messages

| Direction | Message                                       | When                                    | Notes |
| --------- | --------------------------------------------- | --------------------------------------- | ----- |
| C→S       | `{t:'marker', op:'add', marker}`              | Ping or share                           | ≤ 1 KB. The room validates and stamps `createdBy` and `createdAt` |
| C→S       | `{t:'marker', op:'remove', id}`               | Creator (or owner) removes              | |
| C→S       | `{t:'marker', op:'move', id, x, y, z}`        | Creator drags it (map, M4)              | At most 2 per second |
| S→C       | `{t:'markers', add?:Marker[], remove?:string[]}` | Changes, sent **only to the audience** | Batched in the room tick |
| S→C       | `welcome.markers`                             | Join                                    | Only the markers this player may see |
| S→C       | `{t:'arrived', id, playerId}`                 | Arrival, to the creator only, when `notifyArrival` | Worked out by the room |

**Audience filtering happens on the server.** A waypoint shared with Sam never reaches Alex's browser, so it can't be read from network traffic either. "Just me" markers are never sent at all. They're kept per world in local storage (IndexedDB alongside the world, or `localStorage` keyed by world id).

**Arrival detection:** in `tick()`, the room already holds each player's latest checked pose. For markers with `notifyArrival`, it compares each audience member's position with the marker. That's at most 20 × 10 distance checks per tick, and only while poses are changing. No client messages are needed.

### 3.8 Server rules (`RoomCore`)

- **Validation:**
  - `id` is UUID-shaped;
  - `icon` is in the enum;
  - `name` goes through a `sanitizeDisplayName`-style cleaner (control characters removed, 1–24 characters);
  - `colour` is checked with `sanitizeColour`;
  - coordinates are finite, within `WORLD_COORD_LIMIT`, and within 2 km of the creator's latest pose, so markers can't be dropped at random places;
  - audience ids must be players currently in the room.
- **Rights:**
  - pings and waypoints: every role;
  - landmarks: owner, plus editors if D3;
  - removing: the creator or the owner.
- **Limits:**
  - pings: 3 per 10 s, then 1 every 1.5 s;
  - waypoint adds: 10 per minute, 10 live per player, 60 live per room;
  - all of this on top of the existing 20 JSON messages per second.
- **Storage:**
  - pings: a memory `Map` with expiry checked in `tick()`/`onAlarm()`;
  - waypoints: SQLite `session_markers(id PRIMARY KEY, body TEXT, expires_at INTEGER)`. One write on add and one on remove. Read once on wake. Cleared when the room empties, in the same place `openDoors` is cleared today.
- **Leaving:** when a waypoint's creator leaves for good (grace period over), their waypoints stay until expiry or until the room empties, so a meet-up point doesn't vanish when someone's Wi-Fi drops (decision D5).
- **World restore:** session waypoints are cleared; landmarks roll back with the other entities.

### 3.9 Edge cases

| Case | Behaviour |
| --- | --- |
| A chosen recipient leaves and comes back within the grace period | Still has the waypoint (same `playerId`) |
| A chosen recipient comes back after the grace period | Doesn't get it. Waypoints are "for people online now" |
| Several people ping the same spot | Each is a separate pulse in each player's colour; the bar stacks them |
| A marker is inside a building on another storey | ▲/▼ arrow plus "2 floors up" (from the `BuildingLevelManager` level height, if one is known at that spot) |
| Sender is muted by the receiver (§10) | Their pings and waypoints never show; the sender isn't told |
| Room is full or the world is restored mid-share | Message dropped or markers cleared; a toast explains |
| Single-player / offline | Pings are hidden. Waypoints default to "Just me". Landmarks work (saved with the world) |
| Protocol 4 client still open | Already refused by the protocol bump, with the existing "refresh" prompt |

### 3.10 M1 acceptance

1. A ping appears on another client within **250 ms p95** (the same target as building ops), measured in the e2e harness.
2. A waypoint shared with B only is **never received** by C. The e2e test checks C's raw incoming messages.
3. Waypoints and open doors **survive a forced hibernation or restart** (RoomCore restore spec plus an e2e that restarts wrangler).
4. Locator bar: **zero allocations per frame** and **≤ 0.1 ms per frame** with 20 players and 50 markers. Beacons ≤ 0.15 ms per frame (M4 Air, production build, game tab in the foreground).
5. Rate limits enforced, with `reject: 'rate'` toasts in place of silent drops.
6. Works with touch: tap, long-press wheel and bottom sheet, tested with WebKit mobile emulation. The real iPad test is still outstanding (R18).
7. Landmarks appear in restore points, *Save a copy* and offline exports.

---

## 4. Feature 0 (M0): Room state that survives hibernation

Do this before M1. It's small and fixes what looks like an existing gap.

- Persist `openDoors` and seat occupancy (`interactions`) the way waypoints will be persisted: a small SQLite table, or one `meta` row holding a compact JSON set that's written only on change.
  - Doors change rarely, so the write cost is negligible.
  - Seats can be rebuilt instead: each client resends its current seat on reconnect or on `welcome`. Seats are short-lived, so this is cheaper.
- Restore it in `RoomCore.restore()` alongside players.
- **Test:** open a door, force the Durable Object to hibernate (stand still past the idle timeout under `wrangler dev`, or call `restore()` on a fresh `RoomCore` in the spec), join a third player and check the door is open.

---

## 5. Feature 2 (M2): Find, follow and meet

### 5.1 Roster actions

Pause → Multiplayer is read-only today. Each player row gets actions:

| Action                     | What it does                                                                | Network cost |
| -------------------------- | --------------------------------------------------------------------------- | ------------ |
| **Locate**                 | Tracks the player on the locator bar and flashes their beacon for 30 s      | None         |
| **Track**                  | Keeps them pinned until you stop                                            | None         |
| **Watch** (spectate)       | Third-person camera behind their avatar (below)                             | None         |
| **Ask to join**            | Teleport next to them, if they accept (below)                               | 2–3 messages |
| **Send waypoint**          | Opens the waypoint sheet with them selected                                 | 1 message    |
| **Mute** / **Hide**        | Local only: hide their pings, emotes and phrases / their avatar too         | None         |

The touch HUD gets a compact "people" button that opens the same list.

### 5.2 Watch (spectate)

- The camera attaches to the remote avatar's **interpolated** frame (`RemoteMotion`), using `ThirdPersonCamera` with its wall-avoidance.
- Your own avatar stays where it is and is marked away (the existing `away` flag).
- Any movement key, tap or Esc returns you.
- Useful for visitors, for showing someone a build, and on mobile when walking is awkward.
- **Transparency:** the watched player sees a small "👁 Sam" chip. This costs one tiny `watching` message at start and stop. Players can turn "Allow others to watch me" off (decision D8, default on).

### 5.3 Ask to join, with consent

1. A sends `{t:'request', kind:'join', to: B}`.
2. B gets a prompt: *"Alex wants to come to you · Allow · Not now"*. It auto-declines after 20 s. "Not now" isn't reported as a refusal; A just sees "No answer".
3. If B allows, the room opens a **10-second teleport window** for A, anchored to B's latest pose.
4. A's client finds a clear standing spot within 4 m of B and sends a pose with the teleport flag. It reuses the "nearby clear standing position" search from leaving a seat (`PlayerInteractionController`).
5. The room accepts the teleport only inside the window and within 8 m of B's position. Otherwise it applies the normal speed check.

**Tightening the teleport rule** (needed here, and good regardless): today any pose with `POSE_FLAGS.teleport` skips the speed check. After M2, the room only accepts teleports:

- at spawn or bookmark on join;
- inside a granted join window;
- inside an owner-enabled landmark travel window (D6).

**Gather everyone (owner only):** sends a join offer from the owner to everyone. Each player gets *"Xander is gathering everyone · Go · Stay"*.

**Chunk loading:** teleporting far triggers terrain generation at the destination. Show the existing loading overlay until the destination chunks are ready, the same as a world load. This is also why flight stays off.

---

## 6. Feature 3 (M3): Expression — emotes, pointing and quick chat

### 6.1 Emote wheel (hold Y; touch: smiley button)

- **One-shots:** wave, cheer, clap, nod, shake head, shrug, **point** (at a target).
- **Loops:** sit on the ground, dance, look around. A loop ends when you move.
- **Pointing** reuses the right-arm IK and head-look from the build-reach gesture (`CharacterAnimationState` / `CharacterInstance`), aimed at the target position. A ping automatically makes your avatar point for 1.2 s, so everyone can see who pinged and where they're looking.
- **Network:** `{t:'emote', id, target?}` is relayed to everyone in range (everyone, until interest management arrives). Remote clients stop loops when they see the `moving` flag, so no stop message is needed. Rate: 1 per second.
- **New animation work:** wave, cheer, clap and the loops need clips or procedural poses on the existing rig. Build these with the `/characters` preview page's Look/Build/Jump modes and add an Emote mode.

### 6.2 Quick-chat phrases (no free text, consistent with Q15-A)

- About 16 preset phrases:
  - "Over here!"
  - "Follow me"
  - "Come and see this"
  - "Want to build together?"
  - "Thanks!"
  - "Nice build!"
  - "Be right back"
  - "On my way"
  - "Wait for me"
  - "Good night"
  - …and a few more.
- Shown as a speech bubble above the name tag for 4 s, plus a line in a small recent-messages list (last 10, this session only).
- **The wire carries only a phrase id** (`{t:'say', id: 7}`). Nothing to moderate or store, and easy to translate later.
- Optional: a phrase can carry the current ping target ("Come and see this" + a marker).

### 6.3 Reactions to builds

"Love this" in the ping wheel puts a heart on the aimed building or Mini Build. The creator (from `created_by`) gets *"Sam loved your cottage"*.

- Session-only: no stored counter in v1.
- If players like it, a later version can store a per-entity kudos count as an excluded patch field.

---

## 7. Feature 4 (M4): World map

There's no map yet, and it's the natural partner to waypoints.

- **Open it:** hold or toggle **Tab** (with `preventDefault`, so focus doesn't move). Touch: a map button.
- **Rendering:**
  - sample `TerrainHeightSampler` (with hydrology) on a coarse grid around the player, in a worker;
  - shade by height, with rivers and lakes in blue;
  - draw foundation footprints and roads/paths from the replica;
  - cache 256 m tiles by terrain revision, so shovel edits refresh only the affected tiles.
- **Content:**
  - players as coloured dots with heading;
  - markers with their icons;
  - landmarks with names;
  - your bookmark and the spawn point.
- **Interaction:**
  - **click or tap to drop a waypoint** (opens the sheet);
  - drag your own waypoint to move it;
  - pinch or scroll to zoom;
  - north-up, with a compass rose.
- **Network cost:** none. Everything comes from data the client already has.
- **Later:** an optional "discovered areas" fog tied to the field journal (gameplay plan item 22).
- **Budget:** map generation happens off the main thread. Opening it must not cause a frame over 16.7 ms. Tile generation is ≤ 20 ms per tile in the worker.

---

## 8. Feature 5 (M5): Co-building awareness

These make full co-building (F1-A) feel collaborative rather than surprising.

1. **"Sam is editing this"** (the `editing` hint from plan §9.2, deferred from Phase 3):
   - when your build target changes, send `{t:'editing', key}` at most twice a second;
   - others see a thin outline in your colour on that entity and a small hammer badge on your locator dot;
   - the `building` pose flag already says *that* you're building; this says *what*.
2. **Placement ghosts:** while another builder hovers a placement preview, the room relays `{t:'preview', tool, kind, transform}` at 2 Hz. Others see a translucent ghost in that builder's colour.
   - Off by default for crowded worlds (D9).
   - Cut when more than 4 builders are active.
3. **Who built this?** Aim at something and press **I** (inspect) to see:
   - who created it (`created_by` → the `names` map);
   - who last changed it (from the room's field revisions);
   - when.
4. **Activity feed:** commits are grouped by player and area over 30 s, for example *"Sam added 12 walls and a roof · near the lake · Show me"*. **Show me** creates a personal ping there. Commits already carry `by` and `byName`, and the ops' own data gives their positions.
5. **Build requests:** a waypoint with the hammer icon and a **Done** checkbox. When it's saved as a landmark-style entity (`task: true`), it becomes a shared to-do list in the world. This links to the gameplay plan's communal projects (item 15).
6. **Send a design:** ping a Mini Build and choose **Copy to my library**, or send a design from the roster. `miniBuildDefinition` rows already exist in the world, so this is a client-side copy into `MiniBuildPersonalLibrary`, with no new server data.

---

## 9. Features 6 and 7 (M6, M7): Groups, events and games

### 9.1 Groups (M6)

- Invite from the roster. Accepting puts both players in a group; up to 20 players.
- Group members are always on the locator bar (pinned when out of view) and get a coloured ring under their name tag.
- "My group" becomes an audience option for waypoints and pings.
- The room holds the group id in memory and in the player's attachment (a few bytes), so it survives hibernation.

### 9.2 Owner announcements and events (M6)

- **Announcement:** a banner for everyone, up to 80 characters. The owner is trusted with free text; visitors and editors can't send it. Optionally attach a marker and a countdown, for example *"Concert at the lake · 5:00 · Track"*.
- **Event:** an announcement plus a waypoint plus "Gather everyone" at zero. It uses the room clock, so the countdown matches on every screen.
- **Music:** music trees are shared entities, but playback runs on each client's audio clock. For events, start the shared music garden on a beat aligned to the room clock, so everyone hears it in phase. This is the first step of gameplay plan item 19 (synchronised performances).

### 9.3 Group photo (M6)

- Anyone starts a 5-second countdown. Everyone within 30 m sees it and does a "pose" emote at zero.
- **Each client takes its own best-quality screenshot**, using the existing backquote screenshot path.
- No images are uploaded, so there's no storage, cost or privacy question.

### 9.4 Games built from markers (M7)

These are **friendly** games. Movement is client-authoritative, and the speed check only limits obvious cheating.

| Game | How it uses markers | Server role |
| --- | --- | --- |
| **Treasure hunt** | The owner places `hidden` landmarks. Players get a hot/cold hint (warmer or colder on the locator, no position) | Works out "found" from poses (within 3 m). Saves a found-by list per landmark |
| **Checkpoint race** | An ordered list of landmarks makes a course. Ready, 3-2-1 countdown on the room clock | Times checkpoint crossings from checked poses. Saves the top 10 per course in SQLite |
| **Hide and seek** | The owner starts a round. Hiders' locator dots are hidden from seekers. Seekers "tag" within 2 m | Hides poses from seekers' locator data (avatars still render, so it's fair). Checks distance for a tag |
| **Tours** | Record your walk as breadcrumbs every 5 m, then share it as a route. Others follow glowing footprints | Stores the route as a landmark-style entity (≤ 200 points) |

---

## 10. Safety, moderation and privacy

Anyone holding a link can join, and names aren't verified. Every social feature adds a way to annoy people, so a minimal safety set ships **with M1**, and the full set with M8.

### 10.1 Per-player (local, ships in M1/M3)

- **Mute player:** hides their pings, waypoints, emotes and phrases. They aren't told.
- **Hide player:** also hides their avatar and locator dot.
- **Accept waypoints from:** Everyone / My group / Nobody.
- **Do not disturb:** auto-declines join requests and Watch.

### 10.2 Owner tools (M8)

- **Kick:** a new close code, `kicked`. The player id is blocked for the rest of the session.
- **Mute for everyone:** the room drops that player's social messages.
- **Freeze building:** the room rejects that player's ops with `reason: 'role'` for the session.
- **Rotate invite links:** issue new editor or viewer tokens, so forwarded old links stop working. Existing capabilities expire on their normal schedule, or straight away if D10 = yes.
- **Clear all markers.**

### 10.3 Limits

| Message | Limit | Size |
| --- | --- | --- |
| `marker` add (ping) | 3 per 10 s, then 1 every 1.5 s | ≤ 1 KB |
| `marker` add (waypoint) | 10 per minute; 10 live per player; 60 per room | ≤ 1 KB |
| `emote` | 1 per second | ≤ 100 B |
| `say` | 1 every 2 s | ≤ 50 B |
| `request` (join) | 1 every 10 s; one open request per target | ≤ 200 B |
| `editing` / `preview` | 2 per second | ≤ 300 B |
| `announce` (owner) | 1 every 30 s | ≤ 300 B |

### 10.4 Privacy

- Targeted waypoints reach only their audience.
- "Just me" waypoints stay in the browser.
- No new position history is stored. Tours store only what the player chooses to share.
- Still no free text from non-owners (Q15-A).

---

## 11. Architecture summary

**Proposed key bindings** (audit before building):

| Key | Action |
| --- | --- |
| Z (tap / hold) | Ping / ping wheel |
| Middle mouse | Quick ping |
| Y (hold) | Emote and phrase wheel |
| Tab | World map |
| I | Inspect: who built this |
| U | Stop tracking |

**New and changed client files:**

| File | Purpose |
| --- | --- |
| `src/lib/game/net/markers/markerTypes.ts` | Shared types and validation (also used by `RoomCore`) |
| `src/lib/game/net/markers/MarkerStore.ts` | Client marker state: room markers + local "just me" markers + tracking |
| `src/lib/game/hud/LocatorBar.ts` | Generalised to marker kinds and icons; tracked target; stacking |
| `src/lib/components/LocatorBar.svelte` | Icon `<symbol>`s and marker styles |
| `src/lib/game/world/MarkerBeacons.ts` | Instanced beams, icon billboards and label sprites |
| `src/lib/components/PingWheel.svelte`, `WaypointSheet.svelte`, `MarkerList.svelte` | Ping and waypoint UI (desktop and touch) |
| `src/lib/components/EmoteWheel.svelte`, `QuickChat.svelte` | M3 |
| `src/lib/components/WorldMap.svelte`, `src/lib/game/hud/mapTiles.worker.ts` | M4 |
| `src/lib/game/net/protocol.ts` | Protocol 5 messages and parsers |
| `src/lib/game/net/worldEntities.ts` | `landmark` entity kind |

**Server changes:**

- `RoomCore.ts`:
  - handlers for `marker`, `emote`, `say`, `request`, `editing`, `preview`, `announce`, `mod`;
  - audience routing;
  - arrival checks in `tick()`;
  - teleport windows;
  - per-feature limits.
- `server/src/WorldRoom.ts`:
  - `session_markers` table;
  - persisted door state (M0);
  - `RoomPersistence` gains `saveMarkers` / `loadMarkers` / `saveDoors`.

**Cost check (Workers Free):**

- A busy session (20 players, each sending 2 social messages a minute for 2 hours) is **4,800 incoming messages**. That's about 5% of the 100,000-per-day allowance by the usage panel's conservative count, and small next to pose traffic.
- SQLite writes from waypoints and landmarks are in the low hundreds per session, against 100,000 per day.
- Nothing adds a timer that keeps the room awake. Expiries go through `nextAlarmAt()`.

---

## 12. Testing

- **Unit:**
  - `markerTypes` validation;
  - `RoomCore.spec`: audience routing, rights, limits, expiry, arrival, teleport windows, restore after hibernation;
  - `LocatorBar.spec`: icons, tracked target, stacking, allocation-free frame;
  - `locatorMath` for marker angles;
  - protocol round-trips.
- **Browser** (`tests/multiplayer.e2e.ts`, own wrangler on :8791, all three engines):
  - A pings and B sees it;
  - A shares with B only, and C never receives it;
  - waypoints and doors survive a wrangler restart;
  - B accepts a join and A lands within 4 m;
  - a rejected teleport outside the window is speed-checked;
  - mute hides markers.
- **Driving it:** pointer lock can't be automated. As the existing tests do, drive pings and wheels through `__forestSession` hooks, and check state rather than short toasts (SwiftShader timing).
- **Visual:** screenshots of the locator bar with every marker kind, in light and dark skies, at phone width (the bar moves below the HUD under 46 rem). Beacons in fog, rain and night.
- **Performance:** locator and beacon budgets in `docs/multiplayer-performance.json`, from a production build with the tab in the foreground.
- **Human:** a real two-device session (Mac + iPad) before calling M1 done. That's still the outstanding gap R18.

---

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| Locator bar gets cluttered with 20 players and many markers | Shape-coded kinds, stacking, a 40-marker cap, landmarks only in view or tracked, a per-kind visibility setting |
| Ping spam or pranks from forwarded links | Per-feature limits, local mute (M1), owner mute and kick (M8) |
| Teleport abuse (it's unchecked today) | Granted teleport windows (M2) |
| State lost when the room hibernates | M0 persistence, with an e2e restart test |
| Creature pings mislead (local simulation) | Pings mark the spot only and say "an animal" |
| Emote animation takes longer than expected | Ship pointing (reuses existing IK) and phrases first; add the other emotes one at a time |
| Map tile generation stutters on iPad | Worker-only generation, a tile cache, and coarse first then refined tiles |
| Feature creep before the real 20-player playtest | Ship M0–M2, run the planned family playtest, then pick M3–M8 by what players actually did |

---

## 14. Decisions needed

Recommended defaults are in **bold**. Markdown previews can't tick boxes, so I'll ask these through the in-chat form when you're ready.

| # | Decision | Options |
| --- | --- | --- |
| D1 | Ping key | **Z + middle mouse** / another free key |
| D2 | Can visitors (viewers) ping and share waypoints? | **Yes** / pings only / no |
| D3 | Who can create landmarks? | Owner only / **owner + editors** |
| D4 | "Everyone online": include people who join later? | **Yes, while the waypoint is live** / only those online at share time |
| D5 | When the creator leaves, their waypoints… | **stay until expiry or the room empties** / disappear with them |
| D6 | Fast travel to landmarks | **Off** / owner toggle / on |
| D7 | Free-text chat | **No (keep Q15-A); phrases only** / owner toggle, off by default |
| D8 | Allow Watch (spectate) by default | **On, with a "watching you" chip** / off by default |
| D9 | Placement ghosts of other builders | **Off by default** / on |
| D10 | Rotating invites ends existing sessions straight away | **No (next reconnect)** / yes |
| D11 | First release scope | **M0 + M1 + M2** / M0 + M1 only / M0–M3 |
