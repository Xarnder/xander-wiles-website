# Forest Drift — Biome Minimap: Questions and Decisions

**Feature cycle:** 2026-11-16
**Status:** **Locked (2026-11-16).** Answered in chat: Q1, Q3, Q6 and Q7 as recommended; Q2 adds a grid and coordinates; Q11 keeps pan, zoom and pointer names only; every other question takes its recommended default. **No implementation until you approve the plan in chat.**
**Related:** [`00-brief.md`](00-brief.md) · [`02-technical-plan.md`](02-technical-plan.md)

---

## How to answer

- Type into the box under each question, or tick an option. You can also reply in chat ("Q2: B"), or ask me to put the questions to you in chat as multiple choice, as last time.
- **Status labels:** `Needs user answer` (taste, scope or risk you own), `Recommended default` (say "accept defaults"), `Safe to decide now` (low risk, easy to change).

## Locked decision summary

| Q   | Topic                             | Status                | Recommended default                                                       | Decision (locked)                                                                  |
| --- | --------------------------------- | --------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Q1  | Minimap, full map or both         | `Needs user answer`   | **A**: corner minimap and a full-screen map                               | Corner minimap and a full-screen map                                               |
| Q2  | What the map shows                | `Needs user answer`   | Biomes, shading, water, you, other players, waypoints, biome name, north  | Biomes, shading, water, you, players, waypoints, name, north, grid and coordinates |
| Q3  | Whole map or explored areas only  | `Needs user answer`   | **A**: everything is visible                                              | Everything is visible                                                              |
| Q4  | Zoom range                        | `Recommended default` | **A**: six steps, about 250 m to 8 km across                              | Six steps, 250 m to 8 km (full map 16 km)                                          |
| Q5  | Orientation                       | `Recommended default` | **A**: north up, your arrow turns                                         | North up, your arrow turns                                                         |
| Q6  | On by default?                    | `Needs user answer`   | **A**: on in biome worlds, remembered once you change it                  | On in biome worlds, remembered                                                     |
| Q7  | Default keys                      | `Needs user answer`   | **A**: `;` toggle, `PageUp`/`PageDown` zoom, `'` full map, all rebindable | `;` toggle, `PageUp`/`PageDown` zoom, `'` full map                                 |
| Q8  | Worlds with biomes off            | `Recommended default` | **A**: a terrain map (shading and water), labelled "Biomes are off"       | Terrain map with a note                                                            |
| Q9  | Colours                           | `Recommended default` | **A**: a dedicated map palette                                            | Dedicated map palette                                                              |
| Q10 | Shape, size and position          | `Safe to decide now`  | **A**: round, top-right, medium (180 px); small/medium/large setting      | Round, top-right, size setting                                                     |
| Q11 | Full map tools                    | `Needs user answer`   | Pan, zoom, names, legend, find nearest, set waypoint                      | Pan, zoom, name/distance/direction under the pointer only                          |
| Q12 | Does the full map pause the game? | `Recommended default` | **A**: pauses alone, not online                                           | Pauses alone, not online                                                           |
| Q13 | Remembering map tiles             | `Safe to decide now`  | **A**: memory only, for this session                                      | Memory only                                                                        |
| Q14 | Touch                             | `Safe to decide now`  | **A**: tap opens the full map; pinch and `+`/`−` buttons zoom             | Tap opens full map; buttons and pinch                                              |
| Q15 | Accessibility                     | `Safe to decide now`  | **A**: names and legend, colour-blind check, keyboard-only full map       | Names, colour-blind check, keyboard-only full map                                  |
| Q16 | Performance budgets               | `Recommended default` | As in technical plan §12                                                  | Technical plan §12                                                                 |
| Q17 | Delivery phases                   | `Recommended default` | Phases 0–3 as in the brief                                                | Phases 0–3                                                                         |
| Q18 | Testing scope                     | `Safe to decide now`  | Unit + worker + e2e in three browsers + screenshots + performance numbers | Unit + worker + e2e in three browsers + screenshots + numbers                      |

---

## A. Scope

### Question 1: Minimap, full map or both (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: A corner minimap answers "what's near me?" while playing. Finding a particular biome a few kilometres away, and setting a waypoint to it, needs room to pan and point, and a free mouse. The game locks the mouse while you play, so a corner map can't be clicked. The full map roughly doubles the UI work (Phase 2).
- **Recommended Default**: **A**. Both: the minimap for play, a full map for planning trips.
- **Options**:
  - [x] A — Corner minimap and a full-screen map (Recommended)
  - [ ] B — Corner minimap only (zoom and toggle, no pointing or waypoints)
  - [ ] C — Full-screen map only (opened with a key, nothing on screen while playing)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: a corner minimap and a full-screen map (recommended default).

### Question 2: What the map shows (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Each layer makes the map more useful, and each adds drawing and testing. Biome colours alone look flat, and hill shading makes mountains and valleys readable. Water (rivers and lakes) is the most useful landmark, but it needs the hydrology system in the map worker. Phase 0 measures its cost, and it's dropped if it's too slow. Other players come from the same positions the locator bar already uses.
- **Recommended Default**: Everything but the grid and coordinates.
- **Options**:
  - [x] Biome colours, with soft borders (Recommended)
  - [x] Hill shading (Recommended)
  - [x] Rivers and lakes, if Phase 0 shows they're cheap enough (Recommended)
  - [x] You: an arrow showing where you face (Recommended)
  - [x] Other players online, in their colours (Recommended)
  - [x] Waypoints you can see (your own and public ones) (Recommended)
  - [x] The current biome's name under the map (Recommended)
  - [x] A north marker (Recommended)
  - [x] A grid and coordinates
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: Everything: biome colours, hill shading, rivers and lakes (if Phase 0 shows they're cheap), you, other players, waypoints, the biome name, north, **and a grid with coordinates** (the grid and coordinates were added to the recommended set).

### Question 3: Whole map or explored areas only (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Showing everything makes biomes easy to find, which is the point of the feature, but it takes away the surprise of discovering them. A "fog" over unexplored land keeps exploration meaningful, but players can't find a biome they haven't been near. That works against the goal, and it needs a record of explored areas saved per world (and per player online).
- **Recommended Default**: **A**. Everything is visible.
- **Options**:
  - [x] A — Everything is visible (Recommended)
  - [ ] B — Only places you've been near (fog elsewhere, saved per world)
  - [ ] C — Everything, but unexplored areas are dimmed until you've been near them
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: everything is visible (recommended default).

## B. How it behaves

### Question 4: Zoom range (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Biomes are 450 m–1.5 km across. To see neighbouring biomes you need about 2–4 km across, and to plan a trip, more. Very far zoom levels cost the most to draw the first time: each map tile needs the same work at any zoom. Fixed steps let tiles be cached and reused; smooth zoom has to rescale them.
- **Recommended Default**: **A**. Six doubling steps: 250 m, 500 m, 1 km, 2 km, 4 km and 8 km across the minimap. The full map can go one step further out (16 km).
- **Options**:
  - [x] A — Six steps, 250 m to 8 km (full map to 16 km) (Recommended)
  - [ ] B — Four steps, 500 m to 4 km
  - [ ] C — Smooth zoom between 250 m and 8 km
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: six steps, 250 m to 8 km; the full map to 16 km (recommended default).

### Question 5: Orientation (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: North-up maps are easier to learn and to match with the full map, and their tiles never need rotating. Heading-up maps turn as you turn, so "ahead" is always up, which some players find easier for steering.
- **Recommended Default**: **A**. North up, your arrow turns. The full map is always north up.
- **Options**:
  - [x] A — North up; your arrow turns (Recommended)
  - [ ] B — Turns with you (heading up)
  - [ ] C — A setting, north up by default
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: north up; your arrow turns (recommended default).

### Question 6: On by default? (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: On by default helps players discover the feature. Some players like a clean screen, and the top-right corner already holds the day clock when it's shown. Whatever they choose is remembered.
- **Recommended Default**: **A**. On in biome worlds. Your choice is remembered from then on, for every world.
- **Options**:
  - [x] A — On in biome worlds, remembered once you change it (Recommended)
  - [ ] B — Off until you turn it on
  - [ ] C — On in every world
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: on in biome worlds, remembered once you change it (recommended default).

### Question 7: Default keys (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Nearly every letter is taken. `M`, the usual map key in games, is Move Mode while walking. `;`, `'` and `` ` `` are free, as are `PageUp` and `PageDown` (they only resize in the mini-build editor). `+` and `−` are undo and redo while walking. Every key can be rebound on the Controls screen.
- **Recommended Default**: **A**.
- **Options**:
  - [x] A — `;` shows/hides the minimap, `PageUp`/`PageDown` zoom, `'` opens the full map (Recommended)
  - [ ] B — `M` opens the map (Move Mode moves to `;`), `PageUp`/`PageDown` zoom, toggle in settings only
  - [ ] C — No default keys: settings, on-screen buttons and the pause menu only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: `;` toggle, `PageUp`/`PageDown` zoom, `'` full map, all rebindable (recommended default).
- **Follow-up (Phase 1)**: `PageUp`/`PageDown` turned out to be Build level keys while walking (the key-conflict tests caught it), so zoom is `'` (in) and `/` (out) for now. The full-map key is chosen in Phase 2. **Confirmed by you 2026-11-16** ("Keep ' and /").

### Question 8: Worlds with biomes off (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Older worlds and worlds with biomes switched off have no biomes to show. A terrain-only map (hills and water) is still useful for finding your way, but it's not what the feature is named for.
- **Recommended Default**: **A**. A terrain map with shading and water, plus a note: "Biomes are off in this world".
- **Options**:
  - [x] A — Terrain map (shading, water) with a note (Recommended)
  - [ ] B — No map; the toggle says "Biomes are off in this world"
  - [ ] C — A plain grass-coloured map with shading
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: a terrain map with shading and water, and a note (recommended default).

## C. Look

### Question 9: Colours (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: The biome debug view's colours were chosen to tell biomes apart in development, and some are harsh. Real ground colours look natural but are too alike: forest, birch and dark forest are all green. A map palette can keep each biome close to its real look (sand, snow, deep green) while making neighbours distinct, including for colour-blind players.
- **Recommended Default**: **A**. A dedicated map palette: groups by hue (greens for forests, whites and greys for snow, ochres for dry land, teal-olive for swamp), biomes within a group by lightness and a slight hue shift.
- **Options**:
  - [x] A — A dedicated map palette (Recommended)
  - [ ] B — The existing biome debug colours
  - [ ] C — The biome's real ground colour
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: a dedicated map palette (recommended default).

### Question 10: Shape, size and position (Multiple Choice)

- **Status**: `Safe to decide now`
- **Why it matters**: Round minimaps read as "what's around me" and hide the tile corners. Square ones show more area for the space. In play, the FPS counter sits top-left, the online status top-centre, and the day clock (when shown) top-right; the clock would move under the minimap.
- **Recommended Default**: **A**. Round, top-right, 180 px, with a Small (140), Medium (180) or Large (240) setting.
- **Options**:
  - [x] A — Round, top-right, size setting (Recommended)
  - [ ] B — Square, top-right, size setting
  - [ ] C — Round, bottom-left (above touch controls on phones)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: round, top-right, Small/Medium/Large (recommended default).

## D. Full map

### Question 11: Full map tools (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: This is what turns "I can see a desert" into "I'm going there". "Find nearest" searches outward from you in the map worker, about 0.1 s for 8 km. Setting a waypoint reuses the existing waypoint system, private by default. Painting biome names onto the map needs label placement, which is fiddly and can wait.
- **Recommended Default**: The first six.
- **Options**:
  - [x] Drag to pan, scroll or pinch to zoom (Recommended)
  - [x] The biome name under the pointer (Recommended)
  - [ ] A legend of the biomes in view (Recommended)
  - [ ] "Find nearest" for any biome in the legend (Recommended)
  - [ ] Set a waypoint where you point (right-click or long-press) (Recommended)
  - [x] Distance and direction to the pointer (Recommended)
  - [ ] Biome names painted onto large areas
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **Pan and zoom, plus the biome name, distance and direction under the pointer.** No legend, no "find nearest", no setting waypoints from the map, and no painted names (fewer than the recommended set).

### Question 12: Does the full map pause the game? (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Single-player worlds already pause in the pause menu, and the full map is similar: the mouse is free and you aren't steering. Online, the world can't pause for one player, so the map lies over the game and you stand still.
- **Recommended Default**: **A**. Pauses when playing alone; doesn't pause online.
- **Options**:
  - [x] A — Pauses alone, not online (Recommended)
  - [ ] B — Never pauses
  - [ ] C — The full map lives inside the pause menu (as a tab)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: pauses when playing alone, not online (recommended default).

## E. Technical

### Question 13: Remembering map tiles (Multiple Choice)

- **Status**: `Safe to decide now`
- **Why it matters**: Drawn tiles are kept in memory for the session (a few MB at most). Saving them in the browser would make the map appear at once when a world reopens, at the cost of a few more MB of storage per world and code to clear it when the world's biome settings change. Drawing is fast enough that it's likely not needed.
- **Recommended Default**: **A**. Memory only. Revisit in Phase 3 if first draws feel slow.
- **Options**:
  - [x] A — Memory only, for this session (Recommended)
  - [ ] B — Also save tiles in the browser per world
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: memory only (recommended default).

### Question 14: Touch (Multiple Choice)

- **Status**: `Safe to decide now`
- **Why it matters**: Phones and tablets have no keys and their screens are small. The minimap must not cover the touch controls.
- **Recommended Default**: **A**. Tap the minimap to open the full map. Small `+` and `−` buttons beside the minimap zoom it. Pinch zooms the full map, and a long press sets a waypoint.
- **Options**:
  - [x] A — Tap opens the full map; buttons and pinch zoom (Recommended)
  - [ ] B — Minimap buttons only, no full map on touch
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: tap opens the full map; `+`/`−` buttons and pinch zoom (recommended default). There's no long-press waypoint, since Q11 leaves waypoints out.

### Question 15: Accessibility (Multiple Choice)

- **Status**: `Safe to decide now`
- **Why it matters**: Colour carries most of a biome map's meaning, so colour-blind players need another way to tell biomes apart. Keyboard-only and screen-reader players need the full map's tools too.
- **Recommended Default**: **A**. Names on hover and in the legend, the palette checked under deuteranopia and protanopia (neighbours must differ in lightness too), the full map usable with arrow keys, and the current biome's name in a live region.
- **Options**:
  - [x] A — Names, legend, colour-blind check, keyboard-only full map (Recommended)
  - [ ] B — Also a pattern per biome group (hatching for dry, dots for snow…)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A** (recommended default), without the legend (Q11): names under the pointer, the current biome's name, the colour-blind check, a keyboard-only full map.

### Question 16: Performance budgets (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: The map must not cost frame time you could notice, on a laptop or a phone, and must cost nothing when it's off.
- **Recommended Default**: As in technical plan §12. On the main thread: at most 0.1 ms per frame on average and 0.5 ms at most. In the worker: 60 ms per 128-px tile. Memory: 8 MB. Off: nothing.
- **Options**:
  - [x] A — The budgets in technical plan §12 (Recommended)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: the budgets in technical plan §12 (recommended default).

### Question 17: Delivery phases (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Phase 0 proves the drawing is fast and looks good before any UI is built. The minimap is useful on its own, so it ships before the full map.
- **Recommended Default**: Phases 0–3 as in the brief (§6).
- **Options**:
  - [x] A — Phases 0–3 (Recommended)
  - [ ] B — Minimap only first (Phases 0–1), decide on the full map after trying it
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A**: Phases 0–3 (recommended default).

### Question 18: Testing scope (Multiple Choice)

- **Status**: `Safe to decide now`
- **Why it matters**: The map is drawn from deterministic biome code, so its tiles can be checked against the game's own biome lookup. The UI needs end-to-end tests on desktop and touch.
- **Recommended Default**: Unit tests for tile drawing and maths; a worker test showing tile pixels match `BiomeField` at sample points; e2e for toggle, zoom, full map, find nearest and waypoints in Chromium, WebKit and Firefox; touch e2e; screenshots per phase; performance numbers.
- **Options**:
  - [x] A — As above (Recommended)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-16`: **A** (recommended default), less the find-nearest and waypoint tests (Q11).
