# Forest Drift — Find a Biome: Technical Plan

**Feature cycle:** 2026-11-16
**Status:** **Revision 2: complete (2026-11-17).** All phases built: [Phase 0](../phase-0/implementation.md), [Phase 1](../phase-1/implementation.md), [Phase 2](../phase-2/implementation.md). Decisions are locked in [`01-questions-and-decisions.md`](01-questions-and-decisions.md).
**Related:** [`00-brief.md`](00-brief.md) · [`01-questions-and-decisions.md`](01-questions-and-decisions.md) · [Biome Minimap plan](../../Biome-Minimap/feature-plan/02-technical-plan.md) · [Fast Travel plan](../../Fast-Travel/feature-plan/02-technical-plan.md)

Paths are relative to `pages/Forest-Drift/`.

---

## 0. Changes in revision 2 (Phase 0)

1. **Groups are already in code:** each `BiomeDefinition` has a `group`. `game/map/biomeGroups.ts` only adds the list's labels and order (`BIOME_LIST_GROUPS`).
2. **The list's distance is to the nearest pin,** not the nearest cell. After the rings, the scan finds each biome's first pin (about 1 ms each), so the list and Find always agree. Progress messages carry no distances, so the √2 rule is no longer needed.
3. **The pin aims 3 cells in** (192 m from any other-biome cell), not 2. The border lies somewhere in the last 64 m, so 3 cells guarantees "at least 100 m in" (128 m); 2 cells could give 64 m.
4. **Specks are passed over:** a patch whose most-inside cell is under 2 cells in (under about 190 m across) is usually a sliver on a border. The dev preview showed one as Desert's 4th patch, 64 m in. Specks are only pinned when a biome has nothing bigger in range.
5. **Land tiles first:** land tiles always go before a scan slice, so a land tile waits at most one slice. Scan slices take turns with water tiles.
6. **The scan always runs to the end:** Find needs the whole grid, so there's no early end.
7. **Messages:** `scanned` gains `generation`, `done` and `sampled`; `found` gains `generation` and `ms`.

## 1. Summary

- **One scan, in the map worker.** When the Biomes list first opens, the worker classifies a 64 m grid round the player out to 16 km: about 196,000 points at about 2.6 µs each, so about 0.5 s. It runs in slices of about 8 ms between tiles, so the map keeps drawing.
  - It keeps the result as a byte per cell (about 250 KB).
  - It sends back the distance to the nearest cell of each biome.
- **Finding** a biome is answered from that grid with no new sampling:
  - it groups the biome's cells into separate patches (flood fill);
  - it picks the five nearest patches, at least 1 km apart [Q4];
  - for each it picks a spot at least 100 m inside, nearest you [Q6].
- **The full map** gains a **Biomes** button and list [Q1, Q5], picking [Q2], **Next nearest** and the `B`/`N` keys [Q7]. The pin, readout and Travel here are fast travel's.
- **No main-thread work, no network, no saves, no server changes.**

## 2. Existing system

| Area                    | File                                                        | Today                                                                                                        |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Map worker              | `game/map/biomeMap.worker.ts`, `biomeMapProtocol.ts`        | Draws 128 px tiles, one job per turn (`setTimeout(0)` between), land before water; `init`, `tile`, `cancel`. |
| The world in the worker | `game/map/mapWorld.ts` (`MapWorld`)                         | Its own `TerrainHeightSampler`, `BiomeField` and `HydrologySystem` built from the world's settings.          |
| Classifying a point     | `BiomeField.classifyPoint(x, z, out)`                       | Returns the dominant biome index directly, with no lattice cache: about 2.6 µs (Node).                       |
| Tile client             | `game/map/BiomeMapClient.ts`                                | Owns the worker, the tile LRU and the generation; shared by the minimap and the full map.                    |
| Full map                | `components/BiomeMapOverlay.svelte`                         | Pan, zoom, readout, pin, **Travel here**, **Go back**; dialog keys by `event.key`.                           |
| Colours and names       | `biomeMapPalette.ts` (`biomeMapHex`), `biomeDefinitions.ts` | A map colour and a name for each of the 26 biomes.                                                           |
| Groups                  | `BiomeDefinition.group`, `docs/biomes.md`                   | Temperate, Cold, Warm and dry, Tropical, Swamp (Wet in the docs).                                            |

## 3. The search (`game/map/biomeSearch.ts`, pure)

No DOM, no worker globals. It takes a `classify(x, z) → biome index | null` function, so the unit tests can use made-up layouts.

### 3.1 The scan

- **The grid:** `BiomeScan` covers a square of cells 64 m apart, centred on the player's cell, `2 × 250 + 1 = 501` cells a side (16 km each way). The cells are stored in an `Int8Array` (−1 = biomes off or not yet scanned).
- **Order:** it fills in rings, nearest first, so `step(budgetMs)` can stop between slices. Points beyond 16 km straight-line distance are skipped (the corners).
- **Nearest per biome (revision 2):** after the rings, the scan finds each biome's first pin with `patches(b, 1)`, so the list's distance is where Find puts the pin.
- **No early end (revision 2):** Find needs the whole grid, so the scan always runs to 16 km (about 0.5 s).

### 3.2 Finding patches

`patches(biome, count = 5, minSeparation = 1000)`:

1. **Nearest cells:** take the biome's cells, nearest first.
2. **Group them:** from the nearest cell not yet in a patch, flood-fill its 8-connected cells of the same biome into a patch.
3. **Separation:** skip a patch whose pin would be within 1 km of a pin already chosen.
4. **The patch you're in:** skip it when the biome is the one under you [Q10].
5. **Spot well inside [Q6]:** a chamfer distance-to-edge over the patch picks the nearest cell at least 3 cells (192 m) from any other biome (revision 2). When a patch is too thin for that, it picks its most-inside cell.
6. **Specks (revision 2):** patches under 2 cells in are only used when a biome has nothing bigger.
7. Stop at `count`. Patches are found ring by ring; once `count` pins are chosen nearer than the ring being searched, nothing further can beat them.

Patches are at most a few thousand cells, so this takes a few milliseconds in the worker.

### 3.3 Accuracy

- 64 m cells can miss a patch narrower than about 64 m. Phase 0 checked against a 32 m grid in four worlds: the 64 m grid found all 1,130 patches at least 160 m across and missed only specks.
- The pin's own readout uses `classifyPoint` at the exact spot, so it never names the wrong biome.

## 4. Worker protocol (`biomeMapProtocol.ts`)

**To the worker:**

| Message                                | Meaning                                      |
| -------------------------------------- | -------------------------------------------- |
| `{ t: 'scan', generation, id, x, z }`  | Start (or restart) a scan centred on (x, z). |
| `{ t: 'find', generation, id, biome }` | Patches of `biome` from the current scan.    |
| `{ t: 'cancelScan' }`                  | Stop scanning (the full map closed).         |

**From the worker:**

| Message                                             | Meaning                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `{ t: 'scanned', id, nearest, here, ms }`           | `nearest`: 26 distances in metres, or null for none within 16 km; `here`: the biome under the centre. |
| `{ t: 'found', id, patches: { x, z, distance }[] }` | Up to five patches.                                                                                   |

- **Taking turns with tiles (revision 2):** land tiles always go first, so a land tile waits at most one slice (about 8 ms). Scan slices and water tiles take turns.
- **A find that arrives mid-scan** waits for the scan to finish.
- **A new world generation** (settings changed) drops the scan, as it drops tiles.

## 5. Client (`BiomeMapClient`)

- `scan(x, z): Promise<ScanResult>`:
  - reuses the last result while (x, z) is within 250 m of its centre and the generation is unchanged [Q9];
  - otherwise starts a new scan;
  - it's cancelled when the full map closes (`closeFull`), and the minimap never asks for one.
- `find(biome): Promise<Patch[]>`.

## 6. The full map (`BiomeMapOverlay.svelte`)

- **The Biomes button** in the header and the `B` key open and close a panel on the left: a sheet on phones, at most 320 px wide on desktop.
- **The list:**
  - five groups, from a new `BIOME_GROUPS` table in `game/map/biomeGroups.ts` matching `docs/biomes.md`;
  - each row: a colour swatch, the name, and the distance or "…" while scanning;
  - nearest first within each group [Q5];
  - none in range: greyed out, "None within 16 km", still focusable, and picking one says so;
  - the biome you're in: "Here" [Q10].
- **Picking a biome:**
  1. it asks `find`;
  2. it centres the map on the first patch and drops the pin there, which prepares the landing as fast travel's pins do;
  3. the footer says "Nearest Desert · 1 of 5" beside the readout, with a **Next nearest** button.
- **Next nearest** (`N`) moves to the next patch. After the last one, it says "No more within 16 km".
- **Keys [Q7]:** in the list, `↑`/`↓` move and `Enter` picks.
- **`Esc` order:** the list first, then the pin, then the map.
- **Screen readers:**
  - the list is a labelled region of buttons, each named "Desert, 2.4 km";
  - picking announces "Nearest Desert: 2.4 km north-east" in the live region.
- **Biomes-off worlds:** no button and no key.

## 7. Edge cases

| #   | Case                                               | Behaviour                                                                                        |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| E1  | The list opens again after travelling              | More than 250 m from the last scan: a fresh scan. The old distances show greyed until it's done. |
| E2  | Picking before the scan has finished               | Shows "Searching…", then pins when the scan reaches it.                                          |
| E3  | A biome with no other patch than the one you're in | "No other patch within 16 km".                                                                   |
| E4  | World settings change while the map is open        | The generation changes; the scan restarts; the list shows "…" again.                             |
| E5  | The pin lands in a lake inside the patch           | Fast travel's landing moves it ashore, and the readout says "Lands on the shore", as now.        |
| E6  | Online                                             | Nothing different: every player's map comes from the same seed.                                  |
| E7  | Very large coordinates                             | The grid is relative to its centre; tested at ±200 km.                                           |

## 8. Performance

| Metric                    | Budget                                           | How measured                         |
| ------------------------- | ------------------------------------------------ | ------------------------------------ |
| A full scan (16 km, 64 m) | ≤ 0.8 s in the worker, full speed                | Worker timing, three engines         |
| Tiles while scanning      | Each tile no more than ~10 ms later than without | Tile timings with and without a scan |
| `find`                    | ≤ 30 ms in the worker                            | Worker timing                        |
| Main thread               | Only drawing the list (no per-frame cost)        | Code review, frame times             |
| Memory                    | ≤ 300 KB for the grid, freed with the full map   | Code review                          |

## 9. Tests

| Level  | Test                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit   | `biomeSearch`, on made-up layouts: the nearest patch in rings, the √2 rule, the 16 km limit, the spot well inside, thin patches, 1 km separation, five at most, excluding the patch you're in, ±200 km. |
| Unit   | Slicing: a scan in 8 ms slices gives the same answer as in one go.                                                                                                                                      |
| Worker | `scan` and `find` in Vitest's worker pool, on a real world's settings; tile jobs keep flowing during a scan.                                                                                            |
| E2E    | Open the list with the button and `B`; distances fill in; pick a biome; the pin's readout names that biome; Next nearest; `Esc` order; touch; biomes-off world. Chromium, WebKit, Firefox.              |
| Perf   | Scan time and tile delay, at full speed and 4× slower.                                                                                                                                                  |

## 10. Rollback

- `?findBiome=off` (and a build constant) hides the button and the key.
- Nothing is saved; a plain revert is safe.

## 11. Definition of done

- [x] The Biomes list on the full map with colours, groups, distances, "Here" and "None within 16 km".
- [x] Picking pins a spot well inside the nearest patch, ready for Travel here; Next nearest up to five.
- [x] `B`, `N`, arrows, `Enter`, `Esc` order; screen-reader names and announcements; touch.
- [x] Budgets in §8 met and measured at full speed (a slower machine's worker couldn't be measured: see Phase 2).
- [x] Tests in §9 pass in three browsers.
- [x] Docs (`docs/biomes.md`, the multiplayer guide, the Controls guide) and phase records with screenshots.

## 12. Assumptions (to confirm in Phase 0)

1. `classifyPoint` costs about the same in the worker in all three engines as it does in Node (about 2.6 µs).
2. 64 m cells find every biome patch that matters, variants included.
3. Taking turns between tiles and scan slices keeps the map responsive while a scan runs.
