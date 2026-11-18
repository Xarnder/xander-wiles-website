# Forest Drift — Basements and Joined Foundations: Technical Plan

**Feature cycle:** 2026-11-18
**Status:** **Revision 2: approved (2026-11-18). [Phase 0](../phase-0/implementation.md) complete;** its record lists where it differs from this plan (the format bump moves to Phase 1; simpler walking rules). Decisions are locked in [`01-questions-and-decisions.md`](01-questions-and-decisions.md).

---

## 0. Changes in revision 2 (your answers)

1. **Up to three basement storeys [Q1].** `basement` is `{ storeys, storeyHeight }` instead of `{ depth }`. Levels go down to −3: **Basement**, **Lower Basement**, **Deep Basement**. The floors between storeys are created with the basement as ordinary floor slabs (`role: 'basement-floor'`), which players may remove or cut.
2. **The anchor is stored in `joinId` (§5).** `joinId` is the anchor foundation's id, so "the existing building's storeys win" [Q10] is the same on every client without a creation time.
3. Q2–Q4 were answered as recommended, so nothing else changed.
   **Related:** [`00-brief.md`](00-brief.md) · [`01-questions-and-decisions.md`](01-questions-and-decisions.md) · README: "Building system", "Building levels, horizontal slabs, and multi-level collision", "Foundation deletion"

Paths are relative to `pages/Forest-Drift/src/lib/game/` unless they start with `docs/`, `tests/` or `server/`.

---

## 1. Summary

- **A basement is a field on the foundation,** not a new kind of thing: `basement: { storeys, storeyHeight }`, one to three storeys.
  - The foundation draws a **footing and floor** below the basement and **retaining walls** round it, both derived from the definition and never stored.
  - The **floor above** (the "deck") and the **floors between storeys** are ordinary slabs, flagged `role: 'deck'` and `role: 'basement-floor'`. Stairs cut them, Paint paints them, collision stands on them and online syncs them, all with today's code.
- **Terrain under a basement is removed** from the terrain mesh. Foundations snap to the terrain vertex grid, so the footprint covers whole terrain cells, and the cells inside are dropped from the chunk's index buffer. Nothing is drawn per-fragment.
- **Walking below a foundation's top** becomes possible. `WorldSurfaceSampler` treats a basement footprint as two grounds: the deck for anyone above its underside, and the lowest floor (plus the basement floors as ordinary slabs) for anyone below it.
- **A join is a shared `joinId` on touching foundations at the same `topY`.** A joined building is the edge-connected set of foundations sharing a `joinId`, worked out from the data every time, so a half-synced or hand-edited save can't produce a broken group.
- **Pieces keep their owner.** A wall still belongs to one `foundationId` and is stored in that foundation's local frame. It may now reach onto any foundation in the same building.
  - Joined foundations share `topY`, and their X/Z origins differ by whole terrain cells (2 m), a whole number of building-grid steps (0.25 m). So one building's pieces line up on one grid, and frames differ only by a translation.
- **A `BuildingView`** gives the consumers that look at "the building" one combined view in one frame: wall support, skirting lids, stair openings, corner snap, the one-slab rule, level discovery. It replaces reading a single foundation's `FoundationBuildingDefinition`.

## 2. Existing system

| Area                 | File                                                                                                                                                   | Today                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation data      | `building/FoundationTypes.ts` (`FoundationDefinition`)                                                                                                 | Grid footprint on the terrain vertex grid (2 m by default: `chunkSize 96 / chunkResolution 48`), `topY` = highest terrain vertex, `bottomY`, `style`. |
| Placement            | `building/foundationMath.ts`, `FoundationTool.ts`                                                                                                      | Two corners; at most 64 × 64 cells; no deep water; `placementConflict` forbids overlapping interiors (touching edges is allowed).                     |
| Foundation drawing   | `building/FoundationMesh.ts`, `FoundationManager.ts`                                                                                                   | One `BoxGeometry` from `bottomY` to `topY`, a timber frame on every edge (`buildFoundationFrame`), retaining depth refreshed from terrain.            |
| Terrain around pads  | `building/EarthFoundationField.ts`                                                                                                                     | Earth pads flatten and blend the terrain; stone pads leave the ground inside alone (the block hides it) and cap fill round their edges.               |
| Local frames         | `building/FoundationLocalMath.ts`, `FoundationRootRegistry`                                                                                            | Origin at the footprint's min corner, Y = 0 at `topY`. Every piece is stored in its foundation's frame.                                               |
| Building per pad     | `building/WallTypes.ts` (`FoundationBuildingDefinition`)                                                                                               | `walls`, `wallPaths`, `slabs`, `stairs`, `roofs`, `floorDetails`, `skirtingRuns`, all keyed by `foundationId`.                                        |
| Same-foundation rule | `BuildingManager.ts` (about 8 checks), `WallTool`, `PolygonWallTool`, `SlabToolBase`, `RoofTool`, `StairTool`, `BarrierTool`, `foundationTopTargeting` | Every point has to be inside one foundation's footprint ("Must stay on the same foundation").                                                         |
| Storeys              | `building/BuildingLevelManager.ts`                                                                                                                     | Levels per foundation, indexes contiguous from 0, `getOrCreateLevel` throws below 0, floor selector stops at Ground Floor.                            |
| Walking              | `building/WorldSurfaceSampler.ts`                                                                                                                      | Terrain and foundation tops are unconditional ground ("there are no basements yet"); slabs and roofs only count below the player's feet; stairs step. |
| Stair openings       | `BuildingManager.stairReachesSlab`                                                                                                                     | A stair cuts an opening in each slab of its foundation that its top reaches.                                                                          |
| Deleting             | `building/foundationDeletion.ts`                                                                                                                       | "Confirm Delete" removes a foundation and its whole building.                                                                                         |
| Saves                | `world/WorldTypes.ts` (schema 10), `WorldMigrationManager`, `WorldValidation`                                                                          | Online rooms accept schema 9 and 10.                                                                                                                  |
| Online rows          | `net/worldEntities.ts`                                                                                                                                 | `foundation`, `slab` (with `slabOpening` children) and the rest are rows with field-level "later change wins".                                        |

## 3. Data model (world schema v11)

```ts
interface FoundationDefinition {
	// …existing fields…
	/** Storeys below `topY`. Missing = solid, as today. */
	basement?: {
		storeys: 1 | 2 | 3; // levels −1 … −storeys [Q1]
		storeyHeight: number; // metres, 2.5–4.5, the same for each storey
	};
	/**
	 * Foundations sharing a joinId that touch along an edge at the same topY form one building.
	 * The value is the anchor foundation's id (§5).
	 */
	joinId?: string;
}

interface SlabDefinition {
	// …existing fields…
	/**
	 * 'deck': the floor over a basement. Created and removed with the basement; can't be moved or removed alone.
	 * 'basement-floor': a floor between basement storeys, created with the basement. An ordinary slab
	 * otherwise (removable, cuttable); the role only tells "Remove basement" what it came with.
	 */
	role?: 'deck' | 'basement-floor';
}
```

- **Depth:** `D = storeys × storeyHeight`, so 2.5–13.5 m.
- **Migration v10 → v11:** nothing to change. All three fields are optional, and missing ones mean today's behaviour.
- **Validation:**
  - `storeys` must be 1–3, and `storeyHeight` finite and within limits.
  - A `deck` slab must belong to a foundation with a basement and cover its footprint exactly. Otherwise the deck is dropped and rebuilt on load (logged).
  - A `basement-floor` slab on a foundation without a basement loses its role and stays an ordinary slab.
  - A `joinId` is a short string. Group membership is derived and never trusted from the save (§5).
- **Constants** in a new `building/basementTypes.ts`:
  - `DECK_THICKNESS` 0.25 m;
  - `RETAINING_WALL_THICKNESS` 0.3 m;
  - `FOOTING_DEPTH` 0.5 m below the lowest floor;
  - `MAX_BASEMENT_STOREYS` 3;
  - storey height limits 2.5–4.5 m.
- Floors between storeys use the existing `floorThickness` (0.2 m).

## 4. Basements

### 4.1 Shape (pure, `building/basementMath.ts`)

For a foundation with `basement = { storeys: n, storeyHeight: h }`, depth `D = n × h`, in the foundation's local frame. Storeys follow the same rules as storeys above ground: a level's walls are `h` tall, and the slab over it has its top at the level's wall top.

| Part                               | Local Y range                       | Derived from                                                                                                  |
| ---------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Deck (slab row)                    | `−DECK_THICKNESS … 0`               | A `type: 'ceiling'`, `localY: 0` slab over the whole footprint, `role: 'deck'`.                               |
| Basement storey −k (k = 1…n)       | `−k·h … −(k−1)·h`                   | Level −k: `baseY = −k·h`, `wallHeight = h`.                                                                   |
| Floors between storeys (slab rows) | top at `−k·h` for k = 1…n−1         | `type: 'floor'` slabs over the whole footprint, `floorThickness` thick, `role: 'basement-floor'`.             |
| Retaining walls                    | `−D … −DECK_THICKNESS`, 0.3 m thick | The basement outline (the footprint, or a joined basement's outline, §6.6), inset so the outer face is flush. |
| Footing                            | `bottomY … −D`                      | `bottomY` is lowered to at least `topY − D − FOOTING_DEPTH`. Its top is the lowest storey's floor.            |

- Each slab's `levelIndex` is set as the Ceiling and Floor tools would set it for that storey (checked in Phase 0).
- **Outside faces:** the footing's sides, the retaining walls' outer faces and the deck's edge are all flush with the footprint. So from outside a basement foundation looks like a solid one.
- **The foundation frame** (corner posts and top beams) is drawn as now.

### 4.2 Drawing (`FoundationMesh.ts`)

- A foundation with a basement swaps its box for three pieces:
  - a **footing** box (`bottomY` to the lowest floor; its top is that floor, with the floor material);
  - **retaining walls**, one merged geometry built by `basementGeometry.ts` from the outline, with the foundation's material and procedural stone;
  - the **deck's outside rim**, drawn by `SlabManager` like any slab edge.
- `setSupportDepth` keeps lowering only the footing's bottom.
- Paint on the foundation paints the footing and the walls; Paint on the deck paints the deck.

### 4.3 Terrain holes (`terrain/TerrainChunk.ts`, new `terrain/terrainHoles.ts`)

- `TerrainHoles` holds the basement outlines as cell rectangles on the terrain vertex grid, bucketed like `EarthFoundationField`.
- **Building a chunk's index buffer:** a terrain cell whose four corners lie inside a hole's footprint, and that isn't on its border, is left out.
  - Foundations snap to vertices, so a footprint covers whole cells and the cut is exact. No terrain triangle reaches into the basement.
  - Border cells stay; their triangles run along the outside of the retaining wall.
- **Distance levels of detail:** coarser terrain far away is hidden under the deck anyway (`topY` is the highest ground in the footprint), so only the full-detail chunks need the cut. Phase 0 checks whether coarser chunks need it too.
- **Changes:** adding or removing a basement, or loading a world, marks the chunks it touches for rebuild through the existing terrain revision path (as a shovel stroke does).
- **Shadows and grass:** dropped triangles cast no shadow. Grass is already kept off foundation footprints.
- **Height queries are unchanged.** `TerrainHeightSampler.sample` still returns the natural ground; the sampler in §4.4 decides when it doesn't count.

### 4.4 Walking and collision

**`WorldSurfaceSampler.getSupportingSurfaceY`**, inside a basement footprint (the interior, inside the retaining walls):

- With feet at or above the deck's underside (`topY − DECK_THICKNESS − SUPPORT_EPSILON`), the deck counts as unconditional ground, exactly as the foundation top does today. So walking onto a house from lower ground still works. Over a stair opening it doesn't count, and the player drops onto the stair or the floor below as through any slab opening.
- Below that, terrain and the foundation top are ignored. The lowest floor (the footing's top) is unconditional ground. The floors between storeys are slabs, so they only count below the player's feet, and stairs in the basement work as on any storey.
- The retaining walls' own tops (the ring under the deck's edge) stay foundation-top ground, so the rim never lets anyone fall through.

**Horizontal collision:**

- The retaining walls add wall collision boxes (`wallCollision.ts`) from the lowest floor to the deck's underside. They only stop a player below the deck, which is everyone inside the basement.
- From outside, a player at ground height is above the deck's underside (or meets the stone wall on a slope) and steps up as now.

**Other ground users** (creatures, dropped items, the spawn search, the camera if a third-person view exists) are checked in Phase 0:

- Ambient creatures already avoid foundation footprints, or are made to.
- Spawning inside a footprint lands on the deck (`referenceY = Infinity`).

### 4.5 Storeys (`BuildingLevelManager.ts`, `BuildingLevelTypes.ts`)

- **Levels −1 … −n exist only for a basement building:** `getOrCreateLevel(−k)` returns a level made from the basement (§4.1) and never creates one from `defaultStoreyHeight`. Below −n it returns nothing, and indexes below −3 are never valid.
  - `moveDown` reaches −n when the active building has a basement.
  - `canMoveDown` in `getLevelUiState` says so.
- **Names:** `levelDisplayName` gives −1 **"Basement"**, −2 **"Lower Basement"**, −3 **"Deep Basement"**.
- Level discovery (`discoverLevelsFromBuilding`) ignores the deck, the basement floors and anything below 0, so a basement never shifts the indexes of the storeys above it.
- Tools targeting level −k use that storey's floor height as their construction plane (`foundationTopTargeting.raycastLevelConstructionPlane` at `baseY = −k·h`).
- **Wall support:** the lowest basement storey counts as a ground floor for `upperWallsNeedSupport`, so walls can go anywhere on it. The storeys above it follow the upper-floor rule: they need a floor or a wall below, and the basement floors provide one everywhere.

### 4.6 Stairs down

- A stair built on level −k rising `h` reaches the slab above it (the deck, or a basement floor). The existing `stairReachesSlab` finds it because it's an ordinary slab, and cuts and frames the opening.
- `StairLevelTrigger` switches storeys as on any staircase.
- The stair tool's head-clearance rule applies to those slabs as to any floor.
- If a player removes a basement floor, a stair can rise two storeys in one flight, as above ground.

### 4.7 The Foundation tool (`FoundationTool.ts`, customise panel)

- **`E` panel:** `basementStoreys: 0 | 1 | 2 | 3` and `basementStoreyHeight` in `BuildingSettings`, copied onto the definition when placing.
  - The preview shows the depth as a translucent box below the top, with a line at each storey.
  - Placement is refused where the lowest floor would be below a river or lake's surface within the footprint ("Too close to water for a basement").
- **`F` on an existing foundation** (new key action `foundation.basement`):
  - adds a basement with the panel's settings: sets `basement`, lowers `bottomY`, creates the deck and basement-floor slabs, rebuilds terrain holes;
  - removes it when it has one and nothing is on its storeys but the deck and the basement floors ("Empty the basement first").
  - Each is one undo step.
  - Changing the storeys of an existing basement means removing it and adding it again. v1 has no resizing.
- **Hints:** "F: Add basement (2 storeys, 6 m)", "F: Remove basement".

## 5. Joining: the maths (pure, `building/foundationJoinMath.ts`)

- **`sharedEdges(a, b)`:** the segments where two footprints touch, as grid intervals. Touching only at a corner gives none.
- **`joinedBuildings(foundations)`:** union-find over foundations with the same `joinId` that share an edge of positive length and have `topY` within 1 mm.
  - Members that no longer qualify (moved, raised, deleted, or a stale row online) simply fall out into their own building.
- **The anchor** is the member whose `id` equals the `joinId`. Its storeys are the building's [Q10]. If it has gone (deleted, or split off), the member with the smallest `id` stands in, so every client picks the same one. How `joinId` is chosen:
  - **A new foundation placed against a building** takes that building's `joinId`. A lone neighbour first gets `joinId` = its own `id`.
  - **Joining two buildings** (with `L`, or a new foundation touching both): the one with more foundations keeps its `joinId`; on a tie, the smaller anchor `id` wins. Every member of the other takes it.
  - **Separating:** the side without the anchor takes the smallest `id` among its members as its `joinId`. A side of one foundation drops `joinId` altogether.
- **`buildingOutline(members)`:** the rectilinear union of the footprints as polygons, in grid units. It's used for inside tests, seams and joined basements.
- **`frameOffset(from, to)`:** the X/Z translation between two members' frames, in building-grid steps. Joining is offered only when `vertexSpacing / buildingGridSize` is a whole number (true by default: 2 / 0.25 = 8). Otherwise the hint says "This world's grid doesn't line up for joining".
- **`insideBuilding(point)` / `segmentInsideBuilding(a, b)` / `polygonInsideBuilding(points)`:** tests against the union. The union of rectangles is rectilinear, so a segment is inside when it doesn't cross the outline.
- **Limits:** at most 8 foundations per building (a sane bound for tests and the union), checked when joining ("A building can have at most 8 foundations").

## 6. Joining: in the game

### 6.1 Joining and separating (`FoundationTool.ts`, `FoundationManager.ts`)

**On placement [Q3]:**

- If the new footprint shares an edge with one or more foundations, the preview takes the highest neighbour's `topY` when that's at or above its own natural `topY`, by at most 3 m.
- It shows "Joins Cottage". Placing sets the same `joinId` on all of them, chosen as in §5.
- `Alt` held keeps it separate at its natural height.

**When the new one is higher [Q4]:**

- It's placed separately, and the hint offers "R: raise Cottage to match" (new action `foundation.raiseToMatch`).
- Raising sets the neighbour's `topY`. Every piece on it is local, so it moves up with it, as do its levels.
  - Earth neighbours re-run the bank check.
  - A raise of more than 3 m is refused.
- One undo step raises and joins.

**`L` on a seam** (new action `foundation.join`, aiming at a shared edge with the Foundation tool):

- It joins two touching foundations at the same height.
- On a joined seam it separates them, unless pieces cross that seam ("3 pieces cross this join").
- Separating sets `joinId` as in §5.

**Placing beside earth foundations:** the bank rule in `placementConflict` is skipped for a pair that will be joined, since there's no bank between them.

### 6.2 Who owns a piece

- A piece's `foundationId` is the foundation its **first point** is on (Wall: the start; paths and polygons: the first point; stairs: the first corner).
- Its points are stored in the owner's local frame, and may be outside the owner's footprint (negative or past `width` / `depth`) as long as they are inside the building (§5).
- Rendering needs no change: the owner's root group is at its frame origin, and the geometry is local.

### 6.3 The same-foundation checks

- Every "same foundation" check in `BuildingManager` and the tools becomes "same building", using `insideBuilding` and friends, in the owner's frame.
- `foundationTopTargeting` resolves a hit on any member to the **building** and converts the point into the locked owner's frame. So a wall started on the cottage and ended on the barn snaps to one grid.
- The level lock (`lockActiveFoundation`) locks the building.

### 6.4 `BuildingView` (new, `building/BuildingView.ts`)

- It gathers all members' walls, wall paths, slabs, stairs, roofs and skirting runs, translated into one frame, and is rebuilt on any member's revision.
- These consumers change from one `FoundationBuildingDefinition` to a `BuildingView`:
  - `upperWallSupport.wallSupportFor`;
  - skirting lid detection (`skirtingMath`);
  - `stairReachesSlab` (a stair cuts every deck or slab it reaches in the building, so an opening across a seam cuts both slabs);
  - wall corner snap (`wallCornerSnap`);
  - the one-physical-slab rule (`BuildingManager`);
  - roof and slab opening maths;
  - level discovery.
- A building of one foundation is a view with one member, so nothing changes for unjoined builds.

### 6.5 Storeys [Q10]

- `BuildingLevelManager` keys levels and the current level by the **building's anchor** instead of the foundation. Each member keeps its own level rows, which are reused if it's separated again.
- On joining, the anchor's levels win. Pieces keep their authored `baseY` / `localY`.

### 6.6 The seam

- **Frames:** `buildFoundationFrame` gets the member's shared edges and leaves out the posts and top beams along them. A corner post stays only where the outline actually turns.
- **Blocks:** the two box faces on a shared edge are left out (`FoundationMesh` per-face groups), so nothing is drawn inside.
- **Top surface:** the tops are flush. Materials use world-space UVs (checked in Phase 0), so stone and paint run on without a visible line. Different paint on each half still shows where one ends.
- **Joined basements [Q9]:** members whose basements have the same `storeys` and `storeyHeight` share one basement outline (the union of their footprints).
  - The retaining walls follow that outline, so there's no wall at the seam and the terrain holes merge.
  - Their decks and basement floors meet flush at the seam as separate slabs at the same height, as two slabs do today.
  - Different basements keep their own walls, and the walls on a shared edge are drawn once, from the deeper one.
- **Basement storeys in a mixed building:** the building's levels below 0 come from its basement members. On a basement storey, the construction plane only exists over footprints with that storey, so tools build only inside a basement.

### 6.7 Removing and deleting [Q8]

- `foundationDeletion.deleteFoundationAndBuilding` also deletes pieces owned by other members that reach onto the removed footprint. `RemoveTool`'s confirmation counts them.
- If removing a member splits the rest into two, they become two buildings. The derivation (§5) does this by itself, and the smaller part gets a new `joinId` so the save matches.
- **Move tool:** joined foundations can't be moved ("Separate it first"). Unjoined ones are unchanged.

## 7. Online [Q11]

- `basement` and `joinId` are fields on the `foundation` row; the deck is a `slab` row with `role`. Field-level "later change wins" already covers two people editing.
  - Joining writes `joinId` on each member.
  - The derivation in §5 means a join that only half arrives can't make a broken building.
- **The room** (`server/`, shared `net/worldEntities.ts` validation) accepts the new fields, and the deck rule from §3.
- **Rooms only accept schema 11** (`ONLINE_COMPATIBLE_SCHEMA_VERSIONS = [11]`): a v10 client would draw a basement as solid stone and let its player walk on the deck over a stair hole.
- **Server deploy:** one, in Phase 3, when you say.

## 8. Edge cases

| #   | Case                                                          | Behaviour                                                                                                                                |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | A basement on a steep slope                                   | The retaining wall shows where the ground is below the deck, like a foundation's side now. Closed, no openings in v1 [Q2].               |
| E2  | The shovel next to a basement                                 | Lowering outside exposes more wall; the footing deepens as now (`refreshTerrainSupport`). Raising ground over the deck is capped as now. |
| E3  | The shovel inside a basement footprint                        | No effect inside, as for a stone pad now (the ground there isn't drawn).                                                                 |
| E4  | Adding a basement under a built house                         | Allowed; nothing on level 0 moves. Furniture on the old foundation top now stands on the deck at the same height.                        |
| E5  | Water near the lowest floor                                   | Refused when a lake or river surface in the footprint is above the lowest floor. Outside water doesn't matter (the wall is closed).      |
| E6  | A player standing in a basement when it's removed (online)    | Removing needs an empty basement, but a player may still be in it. They're lifted to the deck, like a player under a foundation now.     |
| E7  | Joining heights 1 mm apart                                    | Treated as equal; joining snaps both to the higher.                                                                                      |
| E8  | A world whose grid doesn't divide (custom terrain resolution) | Joining isn't offered (§5). Basements still work.                                                                                        |
| E9  | Old saves with touching foundations                           | Not joined, since they have no `joinId`. `L` joins them if their heights match, or `R` raises one first.                                 |
| E10 | A joined building exported and imported                       | `joinId` travels with it; the derivation rebuilds the group.                                                                             |
| E11 | Earth and stone foundations joined                            | Allowed; earth sides have no frame, stone sides keep theirs except on the seam.                                                          |
| E12 | Fast travel or spawn into a basement footprint                | Lands on the deck (top surface), never in the basement.                                                                                  |
| E13 | Mini Builds and lights in a basement                          | Placed on the basement floor like any floor. `MiniBuildPlacement` uses the supporting surface, so it works.                              |

## 9. Performance

| Metric                                      | Budget                                                     | How measured                      |
| ------------------------------------------- | ---------------------------------------------------------- | --------------------------------- |
| Terrain chunk rebuild with holes            | ≤ 0.5 ms extra per chunk                                   | Chunk build timing, three engines |
| Adding or removing a basement               | ≤ 1 frame of main-thread work beyond the chunk rebuilds    | Timing in the e2e                 |
| `getSupportingSurfaceY` with 20 basements   | ≤ 2 µs per call more than today                            | Vitest bench                      |
| A joined building of 8 foundations          | `BuildingView` rebuild ≤ 2 ms, only when a member changes  | Vitest bench                      |
| Frame time, basement house + joined L-house | Within 0.2 ms CPU of the same build without them           | Building performance e2e          |
| Memory                                      | No per-frame allocation; hole buckets ≤ 50 KB for 200 pads | Code review, heap snapshot        |

## 10. Tests

| Level | Test                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit  | `basementMath`: parts and heights for one, two and three storeys at every height, the basement-floor slabs, footing depth, outline inset.                                                                                                                                 |
| Unit  | `terrainHoles`: cells dropped exactly inside, border cells kept, chunk edges, merged outlines, ±200 km.                                                                                                                                                                   |
| Unit  | `WorldSurfaceSampler`: deck from above, floor from below, the stair opening, the rim, spawning, walking in from outside on flat ground and on a slope.                                                                                                                    |
| Unit  | `BuildingLevelManager`: levels −1 to −3 only as deep as the basement, `[` stops at the lowest, names, discovery ignores them, anchor keys, levels back after separating.                                                                                                  |
| Unit  | `foundationJoinMath`: shared edges (full, partial, corner-only), union-find with stale ids, the anchor and `joinId` choice (placing, merging, ties, separating, a deleted anchor), the outline (L, T, U, ring with a hole), the inside tests, frame offsets, the 8 limit. |
| Unit  | `BuildingView` consumers: a wall supported across a seam, skirting under a ceiling across a seam, a stair cutting two slabs, corner snap across members, the one-slab rule.                                                                                               |
| Unit  | Deletion counts and crossing pieces; splitting a building; schema v11 validation, the deck rule, round trip.                                                                                                                                                              |
| E2E   | Basement: place a three-storey basement with `E` → walk round it → stairs up from each storey → walk down to Deep Basement and back → `[` / `]` → remove a basement floor for a tall hall → add a one-storey basement under an existing house with `F` → undo → reload.   |
| E2E   | Joining: place a foundation against a cottage (heights match, "Joins") → Corner Walls across the seam → ceiling and a roof over both → no seam frame → `L` refuses to separate → remove the barn and count → `Alt` keeps one separate → `R` raises.                       |
| E2E   | Joined basements become one; online: two browsers, one builds a basement and joins, the other sees it and walks down.                                                                                                                                                     |
| Perf  | §9, at full speed and 4× slower. Chromium, WebKit, Firefox.                                                                                                                                                                                                               |

## 11. Rollback

- `?basements=off` and `?joining=off` (and build constants) hide the tool options and keys.
- Saved basements and joins still load: a basement then draws as a solid foundation with its deck slab on top, and joined pieces still render, since they're local to their owner.
- A plain revert of the code is safe for v10 worlds. A v11 world opened by an older build is refused by the version check, as for any newer world.

## 12. Definition of done

- [ ] Basements: place with `E`, add and remove with `F`, real underground space, stairs down, Basement in the floor selector.
- [ ] Joining: on placement with matching height, `L`, `R` raise, shared storeys, every tool across the seam, clean seam, joined basements, removing and splitting.
- [ ] Undo, save, load, export and import for all of it.
- [ ] Online in a v11 room, after a server deploy you approve.
- [ ] §9 budgets met and measured; §10 tests pass in three browsers.
- [ ] Docs: README (Foundation tool, Building system, Building levels, Foundation deletion, Collision), the Controls guide, the multiplayer guide, and phase records with screenshots.

## 13. Assumptions (to confirm in Phase 0)

1. Every terrain chunk at full detail uses the same vertex grid as foundations, so a footprint covers whole cells. Coarser chunks don't need the cut.
2. Building and procedural materials use world-space or metre UVs, so two flush foundation tops show no seam.
3. Nothing else (creatures, items, the camera, water drawing) assumes the ground is never below a foundation's top.
4. `stairReachesSlab` and slab openings work unchanged on a `localY: 0` deck slab.
5. All the same-foundation checks are the ones listed in §2. A sweep for `foundationId ===` comparisons in `building/` finds the rest.
6. The new keys (`F`, `L`, `R`, `Alt` in the Foundation tool) don't clash with other actions (`input/conflicts.ts`). `R` is `tool.rotate` elsewhere, but the Foundation tool has no rotation.
