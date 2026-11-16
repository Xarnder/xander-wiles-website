# Forest Drift — Biome Minimap: Brief

**Feature cycle:** 2026-11-16
**Status:** **Decisions locked (2026-11-16)** in [`01-questions-and-decisions.md`](01-questions-and-decisions.md). No implementation code until you approve the plan.
**Related:** [`01-questions-and-decisions.md`](01-questions-and-decisions.md) · [`02-technical-plan.md`](02-technical-plan.md) · builds on [Biomes](../../../11-12/Biomes-and-Enviroments/feature-plan/02-technical-plan.md), waypoints and the locator bar ([social features plan](../../../10-22/Multiplayer/multiplayer-social-features.plan.md))

Paths are relative to `pages/Forest-Drift/`.

---

## 1. The idea in one paragraph

Worlds now have 26 biomes, each 450 m–1.5 km across, but the only way to find a desert or a cherry grove is to wander until a "You entered…" card appears. A **biome minimap** in a corner of the screen shows the land around the player coloured by biome, so the next desert, jungle or snowfield is visible at a glance. Players can **zoom it in and out**, from the next few hundred metres to several kilometres, and **turn it off completely**. A **full-screen map** lets them pan and zoom further and read the biome, distance, direction and coordinates of any point.

## 2. The user problem

| Today                                                                                                        | Why it's a problem                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Biomes are only discovered by walking into them; the biome name card shows where you are, not what's nearby. | Players who want a particular biome (snow to build a lodge, a desert for sand, a jungle for bipeds) have no way to find one. |
| Waypoints and the locator bar point at places you already know.                                              | There is nothing to aim a waypoint at until you've found the place.                                                          |
| Biomes come from the world seed, so they're deterministic and cheap to compute anywhere.                     | The information exists; it just isn't shown.                                                                                 |

## 3. Goals

1. **See the biomes around you** [Q1, Q2]: a corner minimap coloured by biome, with your position and facing, that you can read at a glance.
2. **Zoom** [Q4, Q5]: from close (a few hundred metres across) to far (several kilometres), with keys, mouse, touch and on-screen buttons.
3. **Turn it off completely** [Q6, Q7]: a setting and a key. When it's off, it costs nothing: no drawing and no background work.
4. **Plan a trip** [Q1, Q11]: the full map shows the name, distance, direction and coordinates of whatever you point at. A grid and your coordinates on both maps help you keep your bearings [Q2].
5. **Efficient** [Q16]: map tiles are drawn in a background worker, cached, and only redrawn when needed. No effect on frame time you could notice, and no network use.
6. **Works everywhere the game does**: desktop, touch, single player and online, light and dark backgrounds, colour-blind players.

## 4. Non-goals (v1)

- Showing creatures, trees, builds or other players' builds on the map.
- A hand-drawn or fantasy-styled map. It's a clear, readable biome map.
- Fast travel or teleporting from the map.
- Sharing, exporting or printing the map.
- Changing biomes, terrain or the network protocol.

## 5. What players get (proposed)

- **A round or square minimap** in a corner (top-right by default), about 180 px, showing:
  - biome colours with soft borders, light hill shading, and water if it's cheap;
  - an arrow for you, dots for other players online, and waypoint pins;
  - the current biome's name, a north marker, a faint grid and your coordinates.
- **Zoom:** six steps, from about 250 m to 8 km across. `PageUp` and `PageDown` by default (rebindable), `+` and `−` buttons on touch.
- **Toggle:** a key (`;` by default, rebindable) and a "Show biome map" setting, remembered between sessions.
- **Full map**: a key opens a large map. Drag to pan, scroll or pinch to zoom, and point at an area to read its biome, distance, direction and coordinates. There's no legend, "find nearest" or waypoint setting in v1 (Q11).
- **Biomes-off worlds:** a terrain map (shading and water) with a note that biomes are off (Q8).

## 6. Delivery (proposed, Q15)

| Phase | What                                                                                                            | You can see                                |
| ----- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 0     | Map tile worker, palette, relief (and water, if cheap), tile cache. Measured costs. A developer preview page.   | Map tiles of a world at every zoom level   |
| 1     | Corner minimap: toggle, zoom, player arrow, other players, waypoints, grid, coordinates, settings, keys, touch. | The minimap in the game                    |
| 2     | Full map: pan, zoom, pointer readout (name, distance, direction, coordinates), grid labels.                     | The full map                               |
| 3     | Polish: performance pass, accessibility, persistent cache (if chosen), docs, tests in three browsers.           | Phase records with screenshots and numbers |

Each phase ends with screenshots. I commit and push when you say.
