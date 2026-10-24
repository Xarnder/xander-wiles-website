# Mini Build System — Architecture, Decisions & Results

Player-created furniture and objects from at most **16 grid-snapped cuboids**. This document started
as the implementation plan; it now records the architecture, the decisions that were not dictated by
the brief, the measured performance and the known limitations.

## Hard limits (centralised in `src/lib/game/miniBuild/MiniBuildTypes.ts`)

| Limit                           | Value                                |
| ------------------------------- | ------------------------------------ |
| Cuboids per design              | 16                                   |
| Grid increment                  | 0.03125 m                            |
| Block size                      | 0 – 4 m per axis; at most one axis 0 |
| Design bounds                   | 4 × 4 × 4 m (128 grid units)         |
| Material slots                  | 4                                    |
| Block / object rotation         | Snap steps of 90°–7.5° (7.5° units)  |
| Primitive budget per chunk      | 512 source cuboids (a plane costs 1) |
| Instance safety ceiling / chunk | 256                                  |
| Collision boxes per design      | 8 (after merging)                    |

## Decisions not fixed by the brief

1. **Mini Build chunk = 16 m square, independent of terrain chunks.** Terrain `chunkSize` (96 m by
   default) is a per-world debug setting; tying the budget to it would let a slider change which
   worlds are over budget. 16 m divides 96 m evenly, so budget chunks still align with terrain
   chunks by default. The same chunk is the streaming unit and the instancing unit.
2. **Integer storage.** `positionGrid` is the min corner of a block's _effective_ (post-rotation)
   axis-aligned box; `sizeGrid` is the block's local extents. Quarter-turn rotations of a cuboid are
   an axis permutation, so effective boxes are always integer. Rotation is kept in the schema
   (UV grain direction today, non-cuboid primitives later).
3. **Anchor** is computed, never stored as an offset: bottom-centre of the design bounds
   (`anchor: { type: 'bottom-center' }` leaves room for a custom origin later). Save normalises the
   design so its lowest point is Y = 0.
4. **Worlds are self-contained.** A world stores every definition its instances reference. The
   personal "My Builds" library (IndexedDB, cross-world) holds the most recently saved version of
   each design; placing a personal design copies it into the world. Default designs are templates
   in code; placing one imports a world copy (reused while its content hash still matches).
5. **Legacy furniture stays supported, not migrated.** Existing saved furniture (parametric kinds)
   keeps loading, rendering, moving and removing through `FurnitureManager`. The Object Library no
   longer offers the static kinds — default Mini Build designs replace them. Light-emitting objects
   (torch, lantern, fireplace) stay special functional objects. Converting parametric furniture to
   cuboids would lose dimensions/colours silently, which the brief forbids.
6. **Over-budget saves load, excess stays inactive.** Structural corruption rejects the world (the
   existing validation philosophy). Budget or instance-cap overflow loads the world, keeps the
   excess instances in the save untouched, and does not render or collide them.
7. **Planes are zero-thickness cuboids, not a new primitive.** A block with size 0 on exactly one
   axis is a plane (two zero axes — a line — is rejected). The compiler needs no special path: the
   four edge faces have zero area, and the two opposite faces become one quad each, so a plane is
   4 triangles in the world, never a squashed six-sided box. Two quads rather than one double-sided
   material keeps every batch on the shared front-side materials and gives correct lighting and
   shadows on both sides. `auto` collision treats every plane as decorative, a plane-only design
   (rug, poster) has no collision, and a plane forced `solid` gets one grid unit of collision
   thickness. The editor draws planes with a shared two-sided `PlaneGeometry`.
   **No z-fighting.** Wherever two surfaces lie in the same place facing the same way, exactly one
   is drawn (`miniBuildSurfaces.ts`): opaque over glass, a plane over a cuboid face, the plane with
   the higher `layer` over another plane, otherwise the earlier block. Selecting a plane in the
   editor raises its `layer` above every plane it overlaps, so the last-selected plane is on top.
   The world compiler removes the losing cells outright rather than nudging the winner by a depth
   epsilon (an epsilon invisible at 1 m shimmers at 50 m, and removal saves overdraw). The editor,
   which draws one mesh per block, gives the winner a small ranked polygon offset towards the
   camera, so it shows the same result from any side. Cells hidden under a solid opaque block are
   "don't care" during quad merging, so legs on a rug or a box on a table no longer cut the surface
   below into strips (default furniture: 1,436 → 1,202 triangles). Glass never hides what it covers.
8. **Schema v2 halved the grid.** v1 designs (0.125 m grid) are upgraded on load by doubling every
   grid coordinate, so they keep their exact size. The compiler version (now 3) is part of every
   asset key and content hash, so cached assets and thumbnails regenerate.
9. **Schema v3 halved the grid again** to 0.03125 m for finer furniture detail. Older designs are
   scaled on load (v1 ×4, v2 ×2) and keep their exact size in metres; planes forced solid still get
   0.0625 m of collision thickness.
10. **Snap-angle rotation (schema v4).** Block angles (X/Y/Z) and placed-object yaw may be any whole
    number of 7.5° units in [0, 360). The player picks a snap step — 90, 45, 30, 22.5, 15 or 7.5° —
    shared by the editor and the world tools (`MiniBuildRotationSnap.ts`, a local preference). 7.5°
    is the finest unit every step divides, so changing step never strands an angle off the grid,
    and all angle arithmetic runs in integer units: a full turn in any step returns to exactly 0.
    - **Angled blocks** (any angle not a quarter turn) keep integer storage: `positionGrid` and the
      grid box are those of the rotation rounded down to quarter turns, and the visible cuboid is
      the same block turned the rest of the way about that box's centre. So inside a quarter turn
      a block turns exactly about its centre; crossing a quarter turn the grid box swaps extents
      and its corner moves to keep the centre, rounding a half unit down on one crossing and up on
      the next (by quarter-turn parity), so spinning a block all the way round on any axis brings
      it back to exactly where it started (`rotateBlockTo`). A turn that would sink the block
      below the floor lifts it onto the floor instead of being refused.
    - **Compiling:** angled blocks bypass the grid hidden-face pass — each is its own turned cuboid
      (6 quads, a plane 2), never hides a neighbour's face and is never hidden. Bounds (and so the
      anchor, workspace and 4 m limits) use the turned corners rounded outwards to the grid.
    - **Collision:** an angled block that stays upright (one own axis vertical — in practice, turned
      about Y) keeps its exact footprint as a collision box with a `yaw`; a tilted block collides
      as the grid box around it. Yawed boxes never merge exactly, and take part in over-budget
      merging as their surrounding grid box.
    - **Placed objects** at any yaw collide with the player as oriented rects, and placement tests
      walls, other objects and furniture with oriented boxes (separating axis), so a bench at 45°
      can sit beside another bench at 45° instead of being judged by the square around it.
      Highlights in Place / Move / Remove turn with the object.
11. **Procedural textures on material slots.** Every slot has a `texture` (`miniBuildTextures.ts`):
    a curated set of the game's existing procedural materials — woven fabric, solid wood (dark
    oak, aged oak, weathered, pine, mahogany), oak planks, forged iron, brass, lime/rough plaster,
    dressed/cut/field/rough/smooth stone, cobbles, setts, flagstones, slate, soil, gravel, earth
    path, meadow/dry grass, clear/old glass — or `flat`. Omitted means `auto`, chosen from the
    finish: wood → aged oak, stone → dressed stone, fabric → woven fabric, glass → clear glass,
    metal → forged iron; only plain stays flat. The metal generator (`generators/metal.ts`) is the
    one material that paints metalness (ORM blue): bare metal stays metallic, rust or verdigris
    patches do not. So every design is procedurally textured unless its slot says otherwise, and
    every default design names a texture for every slot (the defaults test enforces it).
    - Wood slots keep the player's colour down to a near-black floor (`woodMinLuma` 0.03, see
      `miniBuildBindingOptions`): floor planks lift anything darker than ~`#7E5A3E` so their grain
      stays visible, which made a dark oak slot look exactly like an oak one.
    - The slot colour **tints** the texture (its average becomes the colour), exactly like painting
      a wall, so material overrides and recolouring still work. Picking a texture in the editor
      sets the colour to the texture's natural swatch and moves the finish into line (wood, stone,
      glass); recolour it afterwards for a painted look.
    - Textures use the compiled geometry's metre UVs (`native` mapping, grain along U); wood uses
      the solid-wood shader with a per-vertex `woodCoord` the compiler now emits — each block is one
      piece of timber, grain along its longest side, log offset hashed from the block id (compiler
      version 4). `BuildingMaterialManager.getStyledMaterial` caches one material per
      (finish, colour, texture), shared by every copy.
    - The editor draws each block as that block compiled on its own, with materials bound by the
      same procedural library, so the editor shows the world's exact look (including wood grain).
      Turning procedural materials off in Graphics turns them off in both.
    - An unknown texture id in a save falls back to `auto`; the texture only enters the content
      hash when set, so designs saved before textures keep their hash.

## Runtime pipeline

```text
MiniBuildDefinition (≤16 logical cuboids)
   → MiniBuildCompiler (pure, worker-ready)     exposed-face emission, greedy quad merge,
                                                one indexed group per material slot
   → MiniBuildCollisionCompiler (pure)          solid/decorative classification, box merge, ≤8
   → MiniBuildAssetCache                        key = designId:revision:compilerVersion,
                                                ref-counted, small LRU for unreferenced assets
   → MiniBuildInstanceManager                   chunk index, budgets, streaming,
                                                batches = chunk + design + revision + material signature
   → InstancedMesh per (batch × material group) picking map instanceIndex → instance id
```

## Modules (`src/lib/game/miniBuild/`)

| Module                           | Responsibility                                                            |
| -------------------------------- | ------------------------------------------------------------------------- |
| `MiniBuildTypes.ts`              | Limits, schema types, schema + compiler versions                          |
| `miniBuildGrid.ts`               | Grid/rotation math, bounds, grounding, chunk ids, content hash            |
| `MiniBuildValidation.ts`         | Untrusted-data validation (definitions, instances, world block)           |
| `MiniBuildCompiler.ts`           | Pure compile: exposed faces, greedy quads, per-slot indexed groups        |
| `MiniBuildCollisionCompiler.ts`  | Decorative classification, exact box merging, ≤8 boxes                    |
| `MiniBuildAsset.ts`              | Three.js wrapper: `BufferGeometry` per slot, bounds, dispose              |
| `MiniBuildAssetCache.ts`         | Compile-once cache, reference counting, unreferenced LRU                  |
| `MiniBuildChunkBudgetManager.ts` | 512-unit/256-instance budget index keyed by 16m chunk                     |
| `MiniBuildLibrary.ts`            | World-local registry: create / save / save as / duplicate / rename        |
| `MiniBuildInstanceManager.ts`    | Instances, chunk + design indexes, streaming, batches, picking, collision |
| `MiniBuildRenderBatch.ts`        | One chunk/design/revision/signature batch of `InstancedMesh`es            |
| `MiniBuildSystem.ts`             | Facade enforcing design ↔ instance invariants and budget rules            |
| `MiniBuildPlacement.ts`          | Placement solver: surface Y, grid snap, wall snug, overlap, budget        |
| `MiniBuildGhost.ts`              | Ghost preview from cached compiled geometry                               |
| `PlaceObjectTool.ts`             | Hotbar 8: place / rotate / copy / edit; lights delegate to FurnitureTool  |
| `MiniBuildPreferences.ts`        | Local prefs: last selection, recently used, library sort                  |
| `MiniBuildRotationSnap.ts`       | Local pref: the rotation snap step, shared by editor and world tools      |
| `miniBuildTextures.ts`           | Slot texture catalogue (existing procedural looks), auto-by-finish        |
| `MiniBuildEditorState.ts`        | Pure transactional editor state with snapshot undo/redo                   |
| `MiniBuildEditorViewport.ts`     | Editor viewport: orbit camera, grid, axes, bounds, anchor, handles, rings |
| `MiniBuildPersonalLibrary.ts`    | Cross-world IndexedDB "My Builds" + thumbnails                            |
| `MiniBuildThumbnails.ts`         | Thumbnails rendered offscreen through the game renderer                   |
| `defaultMiniBuilds.ts`           | 27 starter designs under the same rules (review them at `/mini-builds/`)  |
| `MiniBuildBenchmark.ts`          | Stress scenes (repeated, unique, simple, dense, mixed)                    |

UI: `ObjectLibraryModal.svelte`, `MiniBuildEditor.svelte`, `MiniBuildChoiceDialog.svelte`, wired in
`src/routes/+page.svelte`. Integration points: `ThreeScene.ts` (system, tools, collision, streaming,
stats, benchmark), `RemoveTool.ts`, `MoveTool.ts`, `BuildUndoManager.ts`, world schema v7
(`WorldTypes.ts`, `WorldMigrationManager.ts`, `WorldSerializer.ts`, `WorldValidation.ts`).

## Controls

| Where        | Control                                      | Action                                                        |
| ------------ | -------------------------------------------- | ------------------------------------------------------------- |
| World        | `8`                                          | Place Object                                                  |
| Place Object | `E`                                          | Object Library (My Builds, Default Designs, Lights, Create)   |
| Place Object | `R` / `Shift+R`, `T` / `Shift+T`             | Rotate one snap step either way; finer / coarser snap step    |
| Place Object | `↑` `↓`                                      | Cycle recently used objects                                   |
| Move         | `R` / `Shift+R`, `T` / `Shift+T`             | Same, for a held or looked-at Mini Build                      |
| Place Object | `B` / `F`                                    | Copy / Edit the looked-at Mini Build                          |
| Place Object | Click / Right click / `-`                    | Place / cancel preview / undo placement                       |
| World        | `X` / `M`                                    | Remove one copy / move a copy (budget-checked)                |
| Settings     | Mini Builds → Chunks & detail budget         | Toggle chunk boundary grid + labels, and the chunk counter    |
| Editor       | `N`, `Delete`, `Ctrl/Cmd+D`, `M`             | Add, delete, duplicate, duplicate + mirror X                  |
| Editor       | Arrows, `E`/`Q` (+`Shift` resizes)           | Move/resize in 0.03125m steps; shrink a size to 0 for a plane |
| Editor       | `R` (`Shift` X, `Alt` Z), `T` / `Shift+T`    | Rotate one snap step on Y (X, Z); finer / coarser snap step   |
| Editor       | Drag a ring, Snap menu, Rotate° fields       | Rotate in snap steps; pick the step; type an angle (snapped)  |
| Editor       | `1`–`4`, `Tab`                               | Assign material, next block                                   |
| Editor       | `Ctrl/Cmd+Z`, `Shift+Z`, `Ctrl/Cmd+S`, `F`   | Undo, redo, save and keep editing, frame design               |
| Editor       | Drag arrows / cubes, drag, right-drag, wheel | Move, resize, orbit, pan, zoom                                |

## Performance results

Measured by `tests/miniBuildPerformance.e2e.ts` (headless Chromium, ANGLE Metal on an Apple M4,
default graphics preset, production build, 3 s sample per scene). Raw data:
`docs/mini-build-performance.json`. Frames are vsync-capped, so **CPU frame time** (main-thread
simulation + render submission) and **draw calls** are the discriminating metrics. Draw calls
include shadow-cascade and post-processing passes.

| Scene                             | Placed |          Compiles |   CPU frame |  CPU render | Draw calls | Mini Build draws (batches) |        Cache | Chunk activation | Collision boxes near player | Mini Build save JSON |
| --------------------------------- | -----: | ----------------: | ----------: | ----------: | ---------: | -------------------------: | -----------: | ---------------: | --------------------------: | -------------------: |
| Baseline (no Mini Builds)         |      0 |                 0 |     2.81 ms |     1.75 ms |        145 |                      0 (0) |            0 |           0.1 ms |                           0 |                    — |
| Small house (30 mixed defaults)   |     30 | 16 (3.5 ms total) |     2.90 ms |     2.12 ms |        517 |                    47 (16) |   16 / 98 KB |           0.4 ms |                         100 |              28.7 KB |
| Furnished large house (150 mixed) |    150 |       16 (2.1 ms) |     3.51 ms |     2.81 ms |      1,571 |                   188 (64) |   16 / 98 KB |           0.8 ms |                         528 |              50.9 KB |
| **100 identical 16-block chairs** |    100 |    **1 (0.1 ms)** | **2.42 ms** | **1.74 ms** |    **237** |                 **12 (4)** |    1 / 12 KB |           0.3 ms |                         100 |              20.4 KB |
| 100 unique 16-block designs       |    100 |      100 (9.3 ms) |     3.90 ms |     3.32 ms |      2,243 |                  300 (100) | 100 / 1.2 MB |           5.4 ms |                         166 |               268 KB |
| Dense area (4 chunks at 512)      |    128 |        1 (0.3 ms) |     2.40 ms |     1.72 ms |        237 |                     12 (4) |    1 / 12 KB |           0.1 ms |                         128 |              25.3 KB |
| 1000 simple 1–4 block props       |   1000 |        4 (0.1 ms) |     2.38 ms |     1.69 ms |        333 |                    24 (24) |     4 / 7 KB |           0.9 ms |                         920 |               188 KB |
| 1000 identical chairs (36 chunks) |   1000 |        1 (0.2 ms) |     2.76 ms |     2.12 ms |        849 |                   108 (36) |    1 / 12 KB |           1.4 ms |                         252 |               182 KB |

All scenes held 60 FPS (p95 frame 16.8–17.7 ms). JS heap stayed at ~51 MB throughout.

### Compile + instancing vs one mesh per cuboid

The benchmark can temporarily render the same placed objects the way the brief forbids — one
`THREE.Mesh` per cuboid — to quantify the architecture:

| Scene                 | Architecture         | Meshes / instanced draws | CPU frame | CPU render | Draw calls | FPS |
| --------------------- | -------------------- | -----------------------: | --------: | ---------: | ---------: | --: |
| 100 identical chairs  | Compiled + instanced |      12 instanced meshes |   2.42 ms |    1.74 ms |        237 |  60 |
| 100 identical chairs  | One mesh per cuboid  |             1,600 meshes |   9.19 ms |    8.59 ms |     11,401 |  60 |
| 1000 identical chairs | Compiled + instanced |     108 instanced meshes |   2.76 ms |    2.12 ms |        849 |  60 |
| 1000 identical chairs | One mesh per cuboid  |            16,000 meshes |  70.82 ms |   68.71 ms |     90,675 |  14 |

Repeated designs get cheaper as they repeat: 10× more chairs cost +0.34 ms CPU, not +60 ms. Unique
designs cost a compile and a batch each (100 unique designs ≈ +1.1 ms CPU over baseline), which is
why the chunk budget counts source cuboids rather than rendered meshes.

## Tests

- Unit (Vitest, `src/lib/game/miniBuild/__tests__/`): compiler (face culling, coplanar ownership,
  winding/normals/UVs, determinism, rotation, 16-block compile time), collision merging, validation
  and 17-block / 10,000-block rejection, grid snapping, editor state (limits, snapping, bounds,
  rotation, undo/redo, materials, mirror), chunk budgets (511+1 / 512+1, 1/4/8/16 costs, moves,
  origin ownership, shared-edit overflow), asset cache (same asset, one recompile per revision, safe
  disposal, bounded growth), library semantics, system (10 copies → 1 batch, delete safety, shared
  edits, Make Unique, Save As, instanced picking at index 17 through swap-removal, streaming,
  collision, save/load, over-budget load, resource-leak cycles), placement (upper floors, grid snap,
  wall snug, tuck-under collision, budget messages), snap rotation (`MiniBuildRotation.spec.ts`:
  exact full turns in every step on every axis, typed-angle snapping, floor lift, angled-block
  bounds / compile / yawed collision, oriented placement overlap and player collision), benchmark
  scenes. World schema v7 migration,
  serializer, validation and export/import round trip.
- Playwright: `tests/miniBuilds.e2e.ts` (8 → E → Create New → build → Save "Test Chair" → place →
  Copy → place → save/reload → F → Make Unique → edit → original unchanged; 17th block / 4m bounds /
  non-grid values; snap rotation of blocks and placed objects; Remove Mode reclaims budget and keeps
  the design), `tests/miniBuildPerformance.e2e.ts`,
  and updated slot-8 / persistence tests in `tests/game.e2e.ts` and `tests/worldPersistence.e2e.ts`.

## Known limitations and next steps

- **Legacy furniture is not converted.** Saved parametric furniture still renders through
  `FurnitureManager`; the old static kinds are no longer offered for placement. A later explicit
  conversion step can map them to default designs once dimension loss is acceptable.
- **Material overrides** are in the schema, validation, batching (material signature) and Copy, but
  there is no UI yet to set them (e.g. Paint Mode on a Mini Build).
- **Touch controls** can open the Object Library and place; Copy (`B`) and Edit (`F`) have no touch
  buttons yet, and the editor is designed for mouse + keyboard.
- **No stacking**: Mini Builds place on terrain, foundations, slabs and roofs, not on top of other
  Mini Builds.
- **Personal library conflicts** use last-save-wins per design id across worlds; worlds themselves
  are never affected.
- **Unique-design-heavy areas** cost one batch per design per chunk; a future coarser render cell or
  merged static batches for singletons could reduce draw calls there without changing persistence.
- Collision is simplified boxes only (by design); low objects still block walking like walls do.
