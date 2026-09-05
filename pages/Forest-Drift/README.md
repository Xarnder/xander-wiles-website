# Forest Drift

A browser-based procedural infinite-terrain prototype. Built with SvelteKit, Svelte 5, TypeScript
and Three.js. This is the foundation for a future relaxing multiplayer exploration game — no
networking is implemented yet, but the terrain is generated so that every client, given the same
seed and settings, will independently compute exactly the same world.

## Developing

```sh
npm install
npm run dev
```

Open the printed local URL and click the canvas to enter mouse-look mode.

## Controls

- `W` / `A` / `S` / `D` — move
- Mouse — look around (after clicking to enter pointer lock)
- `Shift` — run
- `Space` — jump (when gravity is enabled)
- `Esc` — release the mouse, and cancel a pending foundation corner or in-progress wall/path if one
  is selected
- `1`–`9` — hotbar slots: `1` Foundation, `2` Wall, `3` Window, `4` Door, `5` Continuous/Polygon
  Wall, `6` Ceiling, `7` Floor, `8` Flat Roof, `9` Stairs
- Left click — select a corner/point, place a wall, add a path point, close a path loop, or place a
  window/door (only once pointer lock is engaged)
- Right click — cancel the current foundation, wall, or in-progress wall-path selection
- `Enter` (Continuous Wall only) — finish the current path as an open (unclosed) chain
- `Backspace` (Continuous Wall only) — undo the most recently placed path point
- `Page Up` / `Page Down` — change the current building level (see "Building levels"), or click the
  ▲ / ▼ on-screen floor selector on the left edge of the screen, shown whenever a level-aware tool
  (Wall, Continuous Wall, Ceiling/Floor/Roof, Stairs) is active
- `-` (Minus, or Numpad Subtract) — undo the last build action (see "Undo: reverting the last few
  build actions")
- `X`, or the trash icon beside the hotbar — toggle Remove Mode, a global overlay independent of
  the hotbar (see "Remove Mode"); while active, left click removes the highlighted wall, wall
  segment, window, door, or staircase, and `X` / right click / `Esc` exits back to whichever tool
  was selected before
- `C` — cycle the draw-snap mode (Off → Axis → Axis + Inline → Wall Corners) on Wall, Continuous
  Wall, Ceiling, Floor and Roof — see "Draw-snap: axis, inline and wall-corner alignment" below
- `H`, or the "? Help" button in the bottom-left corner — toggle an in-game controls overlay
  (`src/routes/+page.svelte`) that lists every control above, grouped by category, so a player
  never has to leave the game to look them up

## How infinite terrain works

The world is split into square **chunks**, addressed by integer `(chunkX, chunkZ)` coordinates.
`TerrainManager` tracks which chunk the player is standing in and keeps a roughly circular area of
chunks (`viewDistance`) loaded around them, using a `Map` keyed by `"chunkX:chunkZ"`. As the player
crosses a chunk boundary, only the _delta_ changes — newly-required chunks are queued, and chunks
that fall outside the active radius are recycled back into a pool rather than destroyed, so walking
continuously doesn't produce garbage-collection pressure from constant allocation.

Chunks nearest the player are generated first (`TerrainGenerationQueue` sorts pending jobs by
squared distance to the player's chunk) and only a small, GUI-configurable number of chunks
(`chunksGeneratedPerFrame`) are generated per animation frame, so moving through the world — or
dragging a noise slider — never stalls the main thread or the page.

## Why terrain remains seamless

Every terrain vertex is generated directly from its **absolute world-space coordinate**:

```ts
const worldX = chunkX * chunkSize + (localX / chunkResolution) * chunkSize;
const worldZ = chunkZ * chunkSize + (localZ / chunkResolution) * chunkSize;
const worldY = heightSampler.sample(worldX, worldZ);
```

No chunk ever samples noise using chunk-relative coordinates, and no chunk is randomized
independently of its neighbours. Because two neighbouring chunks share the same edge in world
space, they necessarily sample identical world coordinates along that edge and therefore produce
bit-identical heights.

Normals are computed the same way: rather than calling `computeVertexNormals()` per chunk (which
can disagree at a shared edge), `TerrainHeightSampler.sampleWithNormal()` takes a central-difference
gradient of the same world-space height function at each vertex. Since both chunks sharing an edge
sample the same world coordinates with the same epsilon, they always compute the same normal too.
This is verified directly in `src/lib/game/terrain/__tests__/chunkSeams.spec.ts`, including across
the world-zero boundary and for diagonal neighbours.

## Terrain regions: large geography instead of noise everywhere

Early versions of this prototype just summed a handful of noise layers at every world coordinate —
that reliably produces uniform bumpiness (small hills everywhere) but never the large, readable
geography (broad flat plains, occasional dramatic mountain ranges) a relaxing exploration game
wants. `TerrainHeightSampler.sample(worldX, worldZ)` now works the other way around: a very-low-
frequency **biome mask** decides, at each coordinate, how much of each of four **region recipes**
(plains / rolling hills / highlands / mountains) applies there, and only those recipes' outputs get
blended together — not a pile of layers added everywhere.

```ts
sample(worldX, worldZ) {
  const weights = sampleBiomeWeights(worldX, worldZ);       // {plains, hills, highlands, mountains}, sums to 1
  const macro = sampleMacroElevation(worldX, worldZ);        // plateaus/basins, independent of region type
  const sharedDetail = sampleSharedDetail(worldX, worldZ);   // one high-frequency term, reused by every recipe

  let regional = 0;
  if (weights.plains > 0)    regional += samplePlains(worldX, worldZ, sharedDetail)      * weights.plains;
  if (weights.hills > 0)     regional += sampleRollingHills(worldX, worldZ, sharedDetail) * weights.hills;
  if (weights.highlands > 0) regional += sampleHighlands(worldX, worldZ, sharedDetail)    * weights.highlands;
  if (weights.mountains > 0) regional += sampleMountains(worldX, worldZ, sharedDetail)    * weights.mountains;

  return baseHeight + (macro + regional) * heightMultiplier; // terracing applied to (macro + regional) first
}
```

Each recipe's weight-check (`> 0`) is also a real performance win, not just a style choice — far
from a mountain-leaning area, `weights.mountains` is exactly `0` (see below), so the comparatively
expensive ridged-noise mountain recipe is skipped entirely for most of the world.

### The biome mask (large regions)

`sampleBiomeMaskValue(worldX, worldZ)` is a **single-octave** simplex noise field at `biome.scale`
world units, domain-warped by `biome.warpStrength` so regions read as organic and elongated rather
than circular, then passed through `tanh(raw * biome.contrast)` to stay smoothly bounded. It's
deliberately single-octave: adding higher octaves (the usual move for "richer" noise) fragments what
should be a handful of huge, clean regions into dozens of small ones — the opposite of the goal.

`sampleBiomeWeights()` classifies by **`|maskValue|`** (distance from the mask's center), not the
signed value. Single-octave simplex noise naturally spends most of its time near the middle of its
range and rarely reaches the extremes — so plains, anchored at the center, ends up the common case,
while mountains, anchored at the far tail, stays rare and concentrated, without needing to fake a
skewed distribution by hand. Classification runs through three `smoothstep` transitions
(plains→hills→highlands→mountains), so the four weights are non-negative and sum to exactly 1 by
construction (a telescoping sum) — there's no hard `if (mask < x)` boundary anywhere, and no
division-by-zero edge case to guard against. `biome.blendWidth` widens each transition band.

At the defaults this lands close to the brief's target world composition: roughly 45-50% plains,
25-30% hills, 10-15% highlands, 10-15% mountains — see the `absValue histogram` / `counts`
measurements used to tune `PLAINS_HILLS_EDGE` / `HILLS_HIGHLANDS_EDGE` / `HIGHLANDS_MOUNTAINS_EDGE`
in `TerrainHeightSampler.ts` if you want to reproduce or retune it.

### Keeping plains flat

A plains-weighted vertex only ever gets: one low-frequency "broad undulation" noise term, scaled by
`plains.amplitude * (1 - plains.flatness)` (linear, so it's smooth and continuous — never a clamp
or a round), plus the shared fine-detail term scaled by `plains.detailStrength` — which defaults to
`0.05` (world units!), i.e. a few centimetres of texture. Nothing medium- or high-frequency ever
reaches a plain at anything like the amplitude it has in hills/highlands/mountains.

### Mountains: ridged noise, gated by a second mask

`sampleMountains()` uses `fbm2D(..., ridgeAmount: 1)` — the "ridged multifractal" trick, where each
octave folds around its zero-crossings (`1 - |n| * 2`) instead of passing through unmodified, turning
smooth simplex noise into sharp ridgelines. A `mountains.sharpness` exponent (`Math.pow`, sign-
preserving) sharpens peaks further, and a secondary ridged noise at a higher frequency adds
structural detail on top of the primary shape — the primary shape is still low-frequency, per the
brief ("do not attempt to create mountains mostly through high-frequency noise").

That ridged shape is then gated by a **second**, independent low-frequency mask
(`sampleMountainRegionMask`, its own `mountainRegionScale`/`mountainRegionThreshold`/
`mountainRegionBlend`, warped by `mountainWarpStrength`) via `smoothstep`. This exists on top of the
biome mask's own "mountains" weight because the biome mask alone only says "this area leans
mountainous" — the region mask is what actually groups the dramatic ridges into a smaller number of
real ranges within that area, rather than jagged terrain everywhere the biome mask merely leans that
way. It's a smooth 0..1 multiplier, never a hard cliff at its edge.

### Macro elevation (plateaus and basins)

`sampleMacroElevation()` is an even-lower-frequency field, independent of region type entirely —
it can lift a plains area onto a plateau, or sink a mountain range into a basin, without changing
which recipe generates the local shape. This is what keeps the world feeling geographically coherent
(one continuous landmass) rather than like a grid of independently-elevated tiles.

Every noise generator (14 in total — one or two per mask/recipe/warp) is seeded deterministically
from the world seed string (via a cyrb53 hash into a mulberry32 PRNG — see `seededRandom.ts`), so no
`Math.random()`, wall-clock time, or load order ever affects terrain shape. `sample()` and its
helpers allocate nothing per call — the one exception, constructing the noise generators themselves,
only happens in `setSeed()`, which runs rarely (only when the seed text actually changes).

### Adding a fifth region recipe

Add a settings group to `TerrainSettings.ts` (mirroring `PlainsRecipeSettings` etc.), seed its noise
generator(s) in `TerrainHeightSampler.setSeed()`, write a `sampleMyRegion(worldX, worldZ,
sharedDetail)` method, add a `myRegion` weight to `BiomeWeights` and give it a band in
`sampleBiomeWeights()`, add its weighted contribution in `sample()`, and expose its knobs via a new
folder in `TerrainDebugGui`. Chunk generation, seam stitching, and the player-grounding height
sampler all keep working unchanged — they only ever call the top-level `sample()`.

## How chunks are loaded

See `TerrainManager.update()`. Each frame:

1. Compute the player's current chunk from their world position (`Math.floor`, so this is correct
   across the zero boundary too).
2. If that chunk changed since the last frame, recompute the required chunk set, enqueue anything
   missing, and recycle anything now out of range.
3. Pull up to `chunksGeneratedPerFrame` jobs off the queue, nearest first, and generate them.

A settings change is handled via a small **dirty-flag** mechanism rather than regenerating on every
slider tick: `TerrainDebugGui` just flips a boolean per category (topology / seed / shape+noise /
view distance / rendering), and `ThreeScene`'s render loop applies each dirty category at most once
per frame. A parameter that only changes terrain _shape_ (noise, warp, shaping, seed) re-queues the
currently visible chunks for regeneration in place, reusing their existing mesh/geometry/typed
arrays — the world reshapes progressively, nearest chunks first, without a "Regenerate" button. A
parameter that changes chunk _topology_ (`chunkSize`, `chunkResolution`) instead disposes everything
and rebuilds from scratch, since the vertex layout itself is different.

## How deterministic seeds work

`settings.seed` is an arbitrary string. It's hashed into a 32-bit integer (cyrb53) and used to seed
14 independent `mulberry32` PRNGs — one per mask/recipe/warp noise generator (biome, its two warp
axes, macro elevation, plains, hills, highlands, the mountain base/detail/region noises and the
region mask's two warp axes, shared detail, and its two warp axes) — which in turn seed
`simplex-noise`'s permutation tables. Reloading the page with the same seed reproduces the exact
same terrain; typing a different seed and then typing the original seed back also reproduces it
exactly (see `TerrainHeightSampler.spec.ts`).

## How this is prepared for eventual multiplayer

A world is fully described by `{ seed, settings }` (see `TerrainWorldDefinition` in
`TerrainSettings.ts`). Terrain generation never touches `Math.random()`, wall-clock time, frame
count, or load order — only true world-space coordinates and the settings object. That means two
clients that agree on a seed and settings can independently generate identical height data for any
chunk, which is the property a future networked client needs in order to only exchange player state
and world _events_ rather than the terrain itself.

## Why LOD is deliberately not implemented yet

Every active chunk currently uses the same edge resolution (`chunkResolution`), which is what makes
the "shared world coordinate ⇒ shared vertex" seam argument above airtight — there's no vertex
density mismatch to reconcile at a boundary. A future level-of-detail system, where distant chunks
use a coarser mesh, will need an explicit edge-stitching strategy between differing resolutions.
Adding that now would have coupled it with getting seamless chunking correct in the first place, so
it's left for a follow-up once the base terrain system is solid.

## Building: the Foundation tool

A small building system sits alongside the terrain, in `src/lib/game/building/`. It does **not**
modify terrain generation in any way — a foundation is a separate cuboid that intersects the
procedural ground.

### Rendering: flat shading on every built object

Every final, placed-object material in the building system — `wallMaterial` (`WallManager.ts`,
`WallPathManager.ts`), `foundationMaterial` (`FoundationMesh.ts`), `floorMaterial` /
`roofMaterial` (`SlabManager.ts`, shared by Ceiling/Floor/Flat Roof), and `stairMaterial`
(`StairManager.ts`) — sets `flatShading: true`. Windows and doors have no material of their own;
they render as a cutout in the wall mesh, so they inherit `wallMaterial`'s flat shading for free.
This matters most for `SlabGeometryBuilder.ts` and `WallPathGeometryBuilder.ts`, which both call
`geometry.computeVertexNormals()` on a hand-built, vertex-shared `BufferGeometry` — without
`flatShading`, that produces smoothly-interpolated (Gouraud) lighting across an edge where two
differently-angled faces meet (e.g. a slab's top face rounding into its collar/side wall),
which reads as subtly rounded rather than crisply built. `flatShading` derives each triangle's
lighting normal from screen-space position derivatives instead, giving every face a single flat
tone regardless of the underlying vertex-normal data — a deliberate low-poly/blocky look
consistent with the plain, grid-snapped geometry the building tools produce. `WallGeometryBuilder.ts`,
`FoundationMesh.ts`, and `StairGeometryBuilder.ts` build from (or copy per-face normals out of)
plain `THREE.BoxGeometry`, which already keeps every face's vertices unshared — so those objects
already read as faceted, and `flatShading` there is a no-op kept for consistency in case that
changes.

- **`foundationMath.ts`** — pure, framework-free math: snapping a world coordinate to the global
  terrain grid, normalizing two clicked corners into a footprint, and scanning that footprint for
  its highest/lowest terrain grid vertex via `TerrainHeightSampler.sample()`. Never touches
  rendered mesh geometry, so a footprint spanning several chunks — loaded or not, on either side of
  world zero — behaves identically. This is the part covered most heavily by tests.
- **`WorldSurfaceSampler.ts`** — `getGroundHeight(x, z)` returns the higher of terrain height and
  any foundation's top surface at that point; `FirstPersonController` calls this instead of the raw
  terrain sampler, which is the entire reason walking onto a foundation "just works".
- **`FoundationManager.ts`** — owns placed foundations (`FoundationDefinition[]`, plain serializable
  data — see `serialize()`/`load()`) and their Three.js meshes. Foundations are independent of
  terrain chunk lifetime: they never unload just because the chunk beneath them does.
- **`FoundationTool.ts`** — the actual tool: raycasts from the screen centre (the crosshair) against
  currently-loaded terrain meshes to find _where_ the player is looking, snaps that to the nearest
  global grid vertex, then does everything else (the two-corner state machine, live preview, the
  hover-grid overlay, the highest-point marker) using only the grid coordinate and
  `TerrainHeightSampler` — never the raycast hit's own Y. The preview/overlay only rebuild when the
  snapped grid vertex actually changes (cached via `lastHoveredGridX/Z`), not every frame, so
  dragging the view around stays cheap.
- **`BuildToolManager.ts`** — the thin part: owns the hotbar slot, listens for the number keys and
  mouse buttons, and forwards them to whichever tool is active through a small `BuildTool`
  interface. It contains no foundation-specific logic at all — adding a second tool later means
  implementing that interface and registering it, nothing here changes.

**Global grid, not per-chunk vertices.** A foundation corner is stored as `{ gridX, gridZ }`
integers — `worldX = gridX * (chunkSize / chunkResolution)` — the exact same grid the terrain mesh
itself is built from. A vertex sitting on a chunk boundary is one grid coordinate, not two separate
per-chunk ones, and grid snapping uses `Math.round` (with an explicit −0 → 0 canonicalization),
never floor/truncation, so it snaps symmetrically on both sides of world zero — see
`foundationMath.spec.ts`.

**Why the click that acquires pointer lock never places a foundation:** `BuildToolManager` checks
`isPointerLocked()` _inside_ the `mousedown` handler. The very first click on the canvas fires
before the browser has granted pointer lock (that happens asynchronously), so that check is still
false at the moment it's read, and the click is ignored as a build action — it only acquires the
lock (via `FirstPersonController`'s own click handler). Every click after that is genuinely
gated. This exact behaviour is covered by `BuildToolManager.spec.ts`, which injects
`isPointerLocked` directly rather than trying to automate real Pointer Lock — Chromium refuses to
grant pointer lock outside a focused, headed window, which makes it unreliable to drive from
Playwright (confirmed while building this; the Playwright suite here sticks to hotbar/UI checks
that don't need it, per the brief).

**A development-only caveat:** `chunkSize`/`chunkResolution` changes are a live, GUI-driven,
dev-only affordance (see "How chunks are loaded" above). `FoundationManager` reads the current
vertex spacing live, so a foundation placed _after_ such a change uses the new grid correctly — but
a foundation placed _before_ the change keeps its stored grid integers, which now mean a different
world footprint. Its Three.js mesh still renders exactly where it was placed (its geometry was
already baked at placement time), but its collision footprint (`getTopYAt`) will have shifted. In
the eventual game, terrain settings are fixed/versioned once building starts, so this only matters
during terrain-tuning development — don't change `chunkSize`/`chunkResolution` after placing
foundations you want to keep walking on correctly.

## Building system: foundation-local walls, windows and doors

Everything above the foundation — walls, and eventually floors/roofs/etc. — lives in
`src/lib/game/building/` alongside the foundation tool, built around one rule: **buildings can
only exist on foundations, and every building element is stored relative to its foundation, never
in raw world coordinates.**

```
WORLD
│
├── terrain (global coordinates)
│
└── foundation (placed in world coordinates)
      │
      └── BUILDING LOCAL SPACE (local X/Z origin at the footprint's min corner, local Y=0 at the top surface)
            │
            └── wall (foundation-local grid endpoints)
                  │
                  ├── window opening (wall-local U/Y)
                  └── door opening (wall-local U/Y)
```

### Foundation-local coordinates

**`FoundationLocalMath.ts`** is the one place the "foundation top = local Y 0" rule is implemented
— every tool and manager goes through it rather than re-deriving world math itself:

```ts
foundationLocalFrame(foundation, vertexSpacing); // { originWorldX, originWorldY: foundation.topY, originWorldZ }
foundationLocalToWorld(frame, localX, localY, localZ);
worldToFoundationLocal(frame, worldX, worldY, worldZ);
```

The origin is the footprint's min-X/min-Z corner (`foundation.minGridX/minGridZ * vertexSpacing`);
local Y=0 is `foundation.topY`. A wall authored as "local Y 0 to 3" therefore renders at
17.4m–20.4m on a foundation whose top is 17.4m, and at 42m–45m on a foundation at 42m — the _same_
`WallDefinition`, unchanged — because `foundation.topY` is read fresh every time a wall's transform
is computed, never baked into the stored wall. `FoundationLocalMath.spec.ts` asserts this round-trip
and the topY-swap case directly.

### The fine building grid

The foundation itself snaps to the coarse _terrain_ vertex grid (spacing ≈ `chunkSize /
chunkResolution`, ~2m by default). Walls snap to a separate, much finer **building grid**
(`buildingGridSize`, default `0.25m`), local to each foundation and never forced to equal the
terrain spacing. `FoundationLocalMath.snapLocalToBuildingGrid()` rounds a local X/Z position to
integer `{ gridX, gridZ }` — the _authoritative_ representation stored on every `WallDefinition` —
with metres always derived (`gridX * buildingGridSize`), the same "store integers, derive floats"
approach `foundationMath.worldToGridCoord` already uses for the terrain grid, so there's no
floating-point drift. `isBuildingGridPointInsideFoundation()` rejects any grid point that would fall
outside the footprint — enforced both while hovering (Wall Tool won't show a target) and again at
the data layer (`BuildingManager.addWall` re-validates independently).

### Wall placement (`WallTool.ts`)

Wall Tool raycasts against foundation _top surfaces only_ (`FoundationManager.getMeshes()`, filtered
to hits whose face normal is ≈ `(0, 1, 0)`) — never terrain, so there is no way to target open
ground. A hit point is converted to foundation-local X/Z, snapped to the building grid, and checked
against the footprint. The tool runs the same two-click state machine as Foundation Tool
(`idle` → `first-point-selected` → confirm), and — since a wall's local direction is unrestricted —
supports horizontal, vertical, and diagonal walls: `dx/dz = end - start`, length = `Math.hypot(dx,
dz)`, heading = `Math.atan2(dz, dx)`. Both endpoints must resolve to the _same_ foundation; hovering
a different foundation while a first point is selected shows an invalid preview rather than letting
the wall span two independent coordinate systems. While targeting a foundation, a bounded grid
overlay (dots) plus a boundary outline render over just that foundation's footprint — never a
permanent grid over every foundation — falling back from the full footprint to a radius around the
cursor once the point count would exceed a small cap, so a very large foundation never allocates an
unbounded buffer.

### Wall-local coordinates and openings (`wallGeometryMath.ts`)

Each wall has its own simple local space, independent of its world rotation: **U** runs along the
wall from the start point (`U=0`) to the end point (`U=wallLength`); **Y** is vertical, `Y=0` at the
foundation top (the wall's bottom) and `Y=wallHeight` at its top. `WallOpeningDefinition` stores
`{ minU, maxU, minY, maxY }` in this space — a door always has `minY=0`. Because openings are
wall-local, they work identically on a diagonal wall as on an axis-aligned one; nothing about
opening math ever assumes the wall faces X or Z (`wallGeometryMath.spec.ts`'s diagonal-wall test
asserts this directly).

**No destructive CSG.** A wall is never one box with holes carved out of it at runtime. Instead,
`computeSolidWallSegments(wallLength, wallHeight, openings)` is a pure function that: collects every
opening's `minU`/`maxU` plus the wall's own `0`/`length` as strip boundaries; sorts/dedupes them into
vertical strips; for each strip, finds the openings that fully span it and subtracts their Y-ranges
from `[0, wallHeight]` (via a standard interval-merge-then-subtract, `subtractIntervals`); and emits
one rectangular solid segment per remaining Y-interval per strip. A door opening removes the `Y=0`
interval entirely, so no segment ever exists beneath it. This supports any number of non-overlapping
openings — including one stacked directly above another (a window over a door in the same strip) —
purely as data, deterministically, and is exercised directly in `wallGeometryMath.spec.ts` without
touching Three.js at all.

`WallGeometryBuilder.ts` turns those solid segments into geometry: one `THREE.BoxGeometry` per
segment (built in wall-local space — X=U, Y=vertical, Z=thickness — so segment math never has to
think about world orientation), merged into a single `THREE.BufferGeometry` via
`BufferGeometryUtils.mergeGeometries` — **one render mesh per wall**, regardless of how many
openings it has. The whole mesh is then positioned/rotated as a unit
(`applyWallTransform`) — note `rotation.y = -headingRadians`, not `headingRadians`: Three.js's
Y-rotation matrix maps local +X to world `(cosθ, -sinθ)`, while `headingRadians` is defined as
`atan2(dz, dx)` (local +X should map to `(cosφ, sinφ)`), so `θ = -φ`. Every wall mesh is a child of
its foundation's **BuildingRoot** group (`WallManager`), positioned once at the foundation's world
origin — exactly the hierarchy the spec calls for — so if a foundation's world position ever changed,
every attached wall would move with it for free via the scene graph, without touching a single
`WallDefinition`.

### Window Tool / Door Tool (`OpeningToolBase.ts`, `WindowTool.ts`, `DoorTool.ts`)

Both tools raycast against wall meshes only (`WallManager.getWallMeshesForRaycast()`) — never
terrain or foundations — and share one implementation (`OpeningToolBase`) parameterized by opening
type, width, and vertical extent; `WindowTool`/`DoorTool` are thin wrappers so the hotbar/tool
identity stays distinct. A hit is converted into that wall's local `(U, Y)` via
`worldToWallLocal(transform, ...)`, the horizontal centre snaps to `openingGridSize` (default 0.1m,
deliberately separate from `buildingGridSize`), and the vertical extent comes straight from settings
— a fixed `windowSillHeight`/`windowHeight` for windows, `minY=0`/`doorHeight` for doors — the
"preferred first version" the spec calls for, rather than trying to derive height from where you're
looking vertically. Before showing a valid preview, the candidate is checked against the _same_
`isOpeningWithinWallBounds`/`doOpeningsOverlap` functions `BuildingManager.addOpening` uses
authoritatively — `openingEdgeMargin` (clearance from the wall's own ends/top/bottom) and
`openingSpacing` (clearance from other openings) apply identically to windows and doors, since an
opening is an opening regardless of type. Only a _confirmed_ click rebuilds the wall's actual
geometry — hovering never touches it — and only that one wall regenerates, never every wall in the
world.

### Collision (`wallCollision.ts`)

Collision is derived from the exact same solid segments used for the visible mesh — never a
separate shape — so a hole the player can see is always a hole the player can walk through.
`WallManager` turns each solid segment into a world-space `WallCollisionRect` (an oriented rectangle:
centre, half-length along the wall, half-thickness, direction, and a world Y range). The player is
approximated as a vertical capsule — a circle of `PLAYER_COLLISION_RADIUS` in the horizontal plane —
and `resolvePlayerPositionAgainstWalls()` pushes a proposed `(x, z)` out of any rect whose Y range
overlaps the player's `[feetY, headY]`; a rect for a door's Y=0..wallHeight gap simply doesn't exist,
so there's nothing to collide with in the doorway. `FirstPersonController` gained one optional
`resolveHorizontalCollision` callback (decoupled the exact same way `getTerrainHeight` already is —
the controller has no idea "walls" exist), called between computing a proposed move and grounding it
on terrain/foundation height. `wallCollision.spec.ts` asserts the centre of a valid door opening is
left untouched while the solid sections beside it still block.

### Enforcement at the data layer

Every rule above is checked in `BuildingManager`, not only in the tools — `addWall` independently
validates both endpoints resolve to the _same, existing_ foundation and land inside its footprint
before ever constructing a `WallDefinition`; `addOpening` re-validates bounds/overlap before
mutating a wall. `WallManager` remains the single permanent owner of wall/mesh/collision state (per
the "don't make the tool the permanent state owner" rule); `BuildingManager` is a thin validating
facade in front of it, and is what every tool calls.

### Foundation deletion

Not implemented as a UI action yet, but the rule is settled: deleting a foundation **cascades** to
its building content — `BuildingManager.removeBuildingForFoundation(foundationId)` removes every
wall (and the foundation's now-empty BuildingRoot group) — rather than blocking deletion while
occupied. Any future deletion code path must call it alongside `FoundationManager.removeFoundation`.

### Serialization

`BuildingManager.serialize()` groups walls by foundation into plain `FoundationBuildingDefinition[]`
— grid integers and wall-local opening rectangles only, never Three.js objects or derived world
transforms:

```json
{
	"foundationId": "foundation-123",
	"walls": [
		{
			"id": "wall-1",
			"foundationId": "foundation-123",
			"startGridX": 0,
			"startGridZ": 0,
			"endGridX": 20,
			"endGridZ": 0,
			"height": 3,
			"thickness": 0.15,
			"openings": [
				{ "id": "window-1", "type": "window", "minU": 1.5, "maxU": 2.7, "minY": 0.9, "maxY": 2.1 },
				{ "id": "door-1", "type": "door", "minU": 3.4, "maxU": 4.3, "minY": 0, "maxY": 2.1 }
			]
		}
	]
}
```

`load()` reproduces every wall's mesh/collision exactly, since both are always _derived_ from this
data plus the current `FoundationDefinition` — never loaded or cached independently — which is also
what `BuildingManager.spec.ts`'s round-trip test asserts (`serialize()` after a fresh `load()` of a
prior `serialize()` output is deep-equal to the original).

### GUI and settings

One **Building** GUI folder, alongside the existing **Foundation** sub-folder: **Grid**
(`buildingGridSize`, `showBuildingGrid`, `buildingGridOpacity`), **Walls** (`wallHeight`,
`wallThickness`, `minimumWallLength`, `showWallBounds`), **Windows** and **Doors** (their own
width/height plus the shared `openingGridSize`/`openingEdgeMargin`/`openingSpacing`). Every one of
these is read live at placement time and copied into the new `WallDefinition`/`WallOpeningDefinition`
— changing a default only ever affects the _next_ thing placed, never anything already built.

### Tests

`FoundationLocalMath.spec.ts`, `wallGeometryMath.spec.ts`, `wallCollision.spec.ts`, and
`BuildingManager.spec.ts` cover: the local↔world round trip and the topY-swap case; building-grid
snapping (including negative coordinates) and footprint containment; the segmentation algorithm for
no openings, a centred window, a door with nothing beneath it, two independent windows, and a window
stacked above a door; wall/opening validation (zero-length, too-short, out-of-bounds, overlapping,
too close to the edge, cross-foundation endpoints); a diagonal wall's world transform round trip;
and collision leaving a door's centre passable while still blocking the solid wall beside it.
`openingWallPick.spec.ts` (10 tests) covers which wall an opening applies to once a building has
more than one storey: the nearest wall being taken and marked on-level when that's what's being
pointed at, the same wall marked off-level (not silently replaced) when it belongs to another
storey, a regression that it never reaches _through_ the wall in front of the crosshair to a farther
one that happens to be on the selected level, placing on an upper wall when that upper wall is what's
being pointed at, per-foundation level resolution, and the wall↔level epsilon accepting float drift
while still rejecting an adjacent storey.
`tests/game.e2e.ts` extends the existing smoke tests: the hotbar shows Wall/Window/Door and switches
tool with 2/3/4, and the Building GUI folder's Grid/Walls/Windows/Doors sections render.

## Continuous Wall paths: clean joined corners

The Straight Wall Tool (`[2]`) is unchanged and still works exactly as before — two clicks, one
independent wall. Its known limitation was corners: two independently-placed straight walls meeting
at a point either overlap (a visible double-thickness spike) or gap, because each wall's geometry is
a plain rectangle with flat, perpendicular end caps that know nothing about their neighbour.

The **Continuous/Polygon Wall Tool** (`[5]`, `src/lib/game/building/PolygonWallTool.ts`) solves this
by drawing a whole connected path in one tool session and computing real corner joins between
consecutive segments — while still producing ordinary, individually-addressable wall segments
underneath, so Window/Door/collision/serialization all keep working exactly as they did for
standalone walls.

### How paths are stored

`WallPathDefinition` (`WallPathTypes.ts`) holds an ordered `points: BuildingGridPoint[]` (the exact
same foundation-local building-grid integers standalone walls already use — nothing new here), a
`closed` flag, and one `WallPathSegmentDefinition` per edge (`points[i] -> points[i+1]`, plus a
closing `points[length-1] -> points[0]` segment when `closed`). Each segment is just `{ id,
openings: WallOpeningDefinition[] }` — as lightweight as a standalone wall's own openings list, and
deliberately _not_ storing its own endpoints redundantly (they're derived from the path's `points`
by index). `wallHeight`/`wallThickness`/`joinStyle`/`miterLimit` live once per path, since a path is
authored as one continuous shape.

**Existing `WallDefinition` is untouched** — no migration, no shared base type, no "wall paths are
now the only representation" refactor. `FoundationBuildingDefinition` just grew an additive
`wallPaths: WallPathDefinition[]` field alongside its original `walls: WallDefinition[]`; older
serialized saves with no `wallPaths` field load back in with an empty path list (`BuildingManager
.load()`'s `building.wallPaths ?? []`), so nothing existing ever breaks.

### How corner joins are calculated

`wallPathMath.ts` is pure, Three.js-free 2D math (foundation-local X/Z), directly unit-tested
(`wallPathMath.spec.ts`, 32 tests). For each interior path point (or, on a closed path, _every_
point — see below), `computeJoinAt()` takes the incoming and outgoing segment directions and:

1. Offsets each segment's edge line by `wallThickness / 2` along its own `perpLeft()` — a consistent
   "rotate 90°" convention that's purely local to each segment's own direction, which is what makes
   left turns, right turns, and clockwise/counter-clockwise drawing all produce identical-looking
   joins with no special-casing for winding order.
2. Intersects the two offset lines (`lineIntersection2D`, plain 2D line-line intersection) to find
   the **miter point** — the single point both segments' edges should route through so they meet
   with no gap and no overlap.
3. Checks `miterDistance / halfThickness` against `miterLimit` (the standard SVG/canvas-stroke
   ratio). If either side of the corner exceeds it, **both** sides fall back to a **bevel** — two
   separate points (the two segments' own unextended edge offsets) joined by a short flat cut,
   rather than letting a very acute angle produce a runaway spike. A near-collinear point (checked
   via an angular epsilon before any of the above) collapses straight to a single shared offset
   point with no join computation at all — so `A──B──C` never bulges at `B`.

`buildSegmentFootprint()` then assembles one segment's actual 2D shape from its own start/end points
plus the (possibly-null, for an open path's bare endpoints) join points at each end — a segment with
no join at either end degenerates to exactly the plain rectangle a standalone wall already uses, so
the join math never changes anything visually unless a real neighbour is present.

### Miter/bevel fallback

`wallJoinStyle` (`miter` default, or `bevel`) and `miterLimit` (default `4`) are both exposed in the
**Building → Walls** GUI folder and read live per path at _placement_ time (captured into the
`WallPathDefinition`, so changing the GUI default never reshapes an already-built path). Explicit
`bevel` style always produces the two-point cut; `miter` produces a clean single-point corner and
only falls back to bevel automatically when the limit is exceeded — see `wallPathMath.spec.ts`'s
acute-angle test.

### Geometry: one merged mesh, still built from real per-segment solid regions

`WallPathGeometryBuilder.buildWallPath()` builds each segment's visible geometry as: a small
join-aware "cap" polygon at each joined end via a generic `extrudePolygon()` helper, plus a
plain-rectangle "safe middle" built through the _exact same_ `computeSolidWallSegments()` openings
algorithm standalone walls use, clipped (`clipPolygonToURange`, a small Sutherland-Hodgman pass) to
stay clear of the join caps. Every segment's pieces across the whole path are merged into **one**
`BufferGeometryUtils.mergeGeometries()` mesh per path — a real room has one draw call, not one per
wall — with normals computed per-piece before merging so lighting doesn't show seams at a join.

**The cap's clip range is the join's own true computed extent (`computeJoinUBounds`), never a fixed
margin measured from the plain endpoint.** This is the one detail that makes the whole join actually
gap-free: for any non-collinear corner, a miter (or bevel) point's _outer_ side necessarily extends
slightly _past_ the plain corner — that's the entire mechanism that lets it meet the neighbouring
segment's edge. An earlier version of this clipped the cap to `[0, someMargin]` /
`[length - someMargin, length]`, i.e. it never let the range extend past the plain endpoint at all —
which chopped that extension off and produced exactly the visible corner gaps described above (the
centerlines met correctly; the outer edges didn't, because the geometry that should have reached
them was being clipped away before it got there). `computeJoinUBounds` instead returns the join
points' actual `[minU, maxU]` in that segment's own local frame, which can and does extend below `0`
or above `length` — and the cap is clipped to _that_ range, so the true corner vertex always ends up
in the final mesh. `WallPathGeometryBuilder.spec.ts` asserts this directly: it independently computes
the true miter point via `computeJoinAt` and checks the built mesh's vertex buffer actually contains
it (both the outer and inner corner vertices), for a single 90° corner and for all four corners
(including the closing one) of a full rectangular room.

### How windows/doors identify polygon segments

`WallPathManager.getSegmentAsWallView(segmentId)` synthesizes a `WallDefinition`-shaped object from
a path segment (its own two grid points, the path's height/thickness, its own openings) — segments
already have their own globally-unique id (`crypto.randomUUID()`, same as a standalone wall's id),
so `BuildingManager.getWall()` just tries `WallManager` first, then falls back to this synthesized
view. `OpeningToolBase` (shared by Window/Door tools) now raycasts against
`BuildingManager.getRaycastableWallMeshes()` — the union of standalone wall meshes and, per path,
one small **invisible picking box per segment** (a plain box, positioned/rotated exactly like a
segment's real placement, tagged `userData.wallId = segment.id`) alongside the merged _visible_
mesh. This is the "continuous visible geometry + simple invisible segment picking meshes" approach —
the visible mesh stays one clean merged shape, while raycasting still resolves to an exact logical
segment. Neither tool needed to change beyond routing lookups through `BuildingManager` instead of
`WallManager` directly, since a segment view and a standalone wall are identical for their purposes.

Openings near a joined corner need more clearance than a plain edge, since the join's cap extends
into that space. `WallPathGeometryBuilder` also computes, per segment, how far each joined end's cap
_actually_ reaches into the segment (`startJoinReach`/`endJoinReach` — the same `computeJoinUBounds`
result the geometry itself was built from, cached by `WallPathManager` alongside the mesh so it's
never recomputed out of sync with what's actually rendered). `BuildingManager.getOpeningMargins()`
then requires `max(cornerOpeningMargin, actualJoinReach)` clearance at a joined end (falling back to
the plain `openingEdgeMargin` at an unjoined open-path endpoint) — so the configured
`cornerOpeningMargin` (Building → Walls GUI folder, default `0.15`) acts as a user-adjustable
_minimum_, but can never be smaller than what the real corner geometry requires, regardless of wall
thickness or `miterLimit`. This is the same margin used by both the live preview and the
authoritative `addOpening` check, so they can never disagree.

### Collision at joined corners

Collision reuses each segment's own solid regions (never a separate shape from what's visible), with
one adjustment: an outer collision rect touching a _joined_ end is extended to the join's own actual
`[minU, maxU]` bound (the same one the visible cap geometry was clipped to — not a fixed guess), so
two segments' collision always meets or slightly overlaps at a corner rather than leaving a gap.
`BuildingManager.spec.ts`'s polygon-door test confirms a door on a path segment stays fully passable
at its centre while the solid wall on either side of it still blocks.

### Closed loops

Setting `closed: true` adds one extra segment (`points[length-1] -> points[0]`) and — critically —
`computeWallPathJoints()` computes a join at **every** point of a closed path, including that
wrap-around point, using the _exact same_ `computeJoinAt()` call as any interior corner. There is no
special-cased "closing seam" logic anywhere in the geometry builder; `wallPathMath.spec.ts` asserts
all four corners of a closed rectangle (including the wrap-around one) produce identical, symmetric
single-point miters.

### Tool interaction

`PolygonWallTool.ts` shares its foundation-top targeting/snapping with `WallTool.ts` via the
extracted `foundationTopTargeting.ts` (both tools need identical raycast-top-face → foundation-local
→ snap-to-grid → footprint-check logic). It holds an ordered list of confirmed points; every click
either adds a point, ignores a duplicate-of-the-last-point click, or — when hovering the path's own
first point with at least 3 points already placed — closes the loop. `Backspace` undoes the most
recent point (or returns to idle if only one remains); `Enter` finishes an open path; right-click/
`Escape` cancels the whole in-progress path (routed through the existing `onSecondaryAction`/
`BuildToolManager` machinery, unchanged). The live preview is not a stack of disconnected boxes —
it's the _exact_ final geometry, built by constructing a temporary `WallPathDefinition` from the
current points plus the hovered point (or `closed: true` when hovering the first point) and running
it through the real `buildWallPath()`, so what you see while drawing is exactly what gets built.

### Draw-snap: axis, inline and wall-corner alignment (`polygonDrawSnap.ts`)

Placing points freehand rarely lands exactly on a straight line — `polygonDrawSnap.ts` is a small,
framework-free module shared by every point-drawing tool (`WallTool`, `PolygonWallTool`, and the
Ceiling/Floor/Flat Roof tools via `SlabToolBase`) that fixes this without touching any tool's own
raycasting or rendering. Pressing `C` cycles
`SnapMode = 'off' | 'axis' | 'axis-inline' | 'wall-corners'`:

- **`'axis'`** forces the segment from the last confirmed point to be perfectly horizontal or
  vertical — whichever the raw drag direction is closer to — instead of an arbitrary diagonal.
- **`'axis-inline'`** (only reachable once 3+ points are already confirmed — `Wall Tool` never
  accumulates enough points to reach it, so `C` only toggles `'axis'` there) keeps the same axis
  constraint, but if the point's other, still-free coordinate is close to matching an EARLIER
  confirmed point's corresponding coordinate (`INLINE_SNAP_TOLERANCE_CELLS`, a small fixed grid-cell
  radius — deliberately tight, so it only fires for a clearly-intended alignment), it snaps exactly
  to that value instead of the raw one. This is what lets the last wall of a room close flush with
  the very first corner, or a new segment line up with one built several points earlier, without
  needing pixel-perfect aiming.
- **`'wall-corners'`** — slab tools (Ceiling/Floor/Roof) only, and only offered when at least one
  wall corner exists to snap to (`cycleSnapMode`'s `wallCornersAvailable` parameter — Wall/Polygon
  Wall Tool never pass it, since a wall has no "wall below itself"). Snaps the hovered point to the
  nearest corner of a standalone wall or wall-path on the SAME level (`SlabToolBase.wallCornersOnCurrentLevel`,
  comparing each wall's frozen `baseY` against the current level's own `baseY`), via
  `snapToNearestCorner`'s plain nearest-point search (`WALL_CORNER_SNAP_TOLERANCE_CELLS`, a bit more
  generous than the inline tolerance — aiming at an invisible plane above a room is naturally less
  precise than aiming at the ground below). Unlike the other two modes, this applies even to the
  very FIRST point of a polygon, not just once a "last point" exists to lock an axis against — since
  tracing a room's ceiling should be able to start exactly on that room's own corner. This exists
  because drawing a slab now targets the plane at the room's actual ceiling height rather than the
  ground (see "Targeting elevated building levels" below), so lining a slab's corners up with the
  walls it sits above is otherwise hard to eyeball precisely.

### Defaults on entry, not "off"

Every point-drawing tool used to start each activation at `'off'`, requiring a `C` press before
snapping did anything. `WallTool` now defaults to `'axis-inline'` and the three `SlabToolBase` tools
(Ceiling/Floor/Roof) default to `'wall-corners'` every time the tool is activated (see each one's
`activate()`) — axis-locked placement and tracing a room's own wall corners are what a player wants
almost all the time for these tools, not an opt-in. `C` still cycles exactly as before, so a single
press turns the default off (`'axis-inline' -> 'off'` for Wall Tool, `'wall-corners' -> 'off'` for
the slab tools — see `cycleSnapMode`), and re-selecting the tool later resets back to the default
rather than remembering whatever the player last chose. `PolygonWallTool` is unchanged and still
starts at `'off'` — a freehand continuous wall is the one drawing tool where an unconstrained first
attempt is the more common case.

`snapDrawingPoint(points, raw, mode)` is the one pure function every tool calls from inside its own
`update()`, right after the shared raycast/grid-snap resolves a raw hover point and before that
point becomes the tool's live `hoverTarget` — so the preview, the HUD, and the eventual confirmed
point are always the SAME (possibly snapped) value, never out of sync with each other; it passes
`'wall-corners'` straight through unchanged, since resolving actual wall data is a tool-side concern
`snapDrawingPoint` deliberately doesn't have — `SlabToolBase.update()` calls `snapToNearestCorner`
itself instead when that mode is active. Each tool's HUD shows the current mode (`Snap: Axis` /
`Snap: Axis + Inline` / `Snap: Wall Corners`) and a `C: Cycle snap` hint whenever relevant.

Because the small HUD text line was easy to miss mid-build, the current mode is additionally
plumbed all the way to `BuildUiState.snapMode` (`FoundationTypes.ts`) and rendered in
`+page.svelte` as a standalone, high-contrast pill directly under the crosshair (`AXIS SNAP` in
blue, `AXIS + INLINE SNAP` in green, `WALL CORNER SNAP` in orange) — it's present only while a mode
is active and disappears the instant `C` cycles back to `'off'`, so it reads at a glance without
competing with the rest of the build HUD.

### Serialization

`BuildingManager.serialize()`/`.load()` now round-trip `wallPaths` alongside `walls`, grouped by
foundation exactly like before. `BuildingManager.spec.ts`'s wall-path round-trip test confirms
`points`, `closed`, every segment's stable `id`, and every segment's `openings` survive a
serialize → load → serialize cycle unchanged.

### Tests

`wallPathMath.spec.ts` (32 tests): 90-degree miters for left and right turns, identical results
regardless of clockwise/counter-clockwise winding, straight-through points producing no bulge,
miter-limit-triggered bevel fallback, explicit bevel always producing two points, diagonal↔diagonal
and diagonal↔straight joins, footprint construction matching a plain rectangle when unjoined,
polygon U-range clipping, self-intersection detection (including that adjacent segments sharing an
endpoint are never flagged), and a closed rectangle's four corners (including the wrap-around one)
all producing identical symmetric joins. `BuildingManager.spec.ts` adds path-level integration tests:
accepting an open L-shape and a closed rectangle, rejecting an out-of-foundation point, a duplicate
point, a duplicate closing point, an obviously self-intersecting path, and a too-short point list;
adding a window to one segment without affecting its neighbour's openings or corner; rejecting a
window placed inside its joined end's actual required clearance; a door on a polygon segment staying
passable while the solid wall beside it still blocks; and the full serialize/load round trip.
`WallPathGeometryBuilder.spec.ts` verifies the actual built geometry (not just the isolated join
math) — that a 90° corner's built mesh contains both the true outer and inner miter vertices rather
than being clipped at the plain endpoint, that all four corners of a closed rectangular room do too,
and that windows/doors on a segment adjacent to a joined corner still produce collision on both
segments. `polygonDrawSnap.spec.ts` (26 tests) covers the shared draw-snap module directly: mode
cycling (including that `'axis-inline'` is skipped with fewer than 3 points, and that
`'wall-corners'` is only ever offered when `wallCornersAvailable` is true); axis locking in all four
drag directions, ties favoring X, and locking against the LAST point rather than the first once
several are confirmed; inline alignment — snapping to a genuinely earlier point's coordinate, never
the immediately-previous point's own (that's what plain axis locking already provides), rejecting a
match outside the tolerance, and preferring the closest qualifying candidate; and
`snapToNearestCorner` — snapping to the nearest in-tolerance corner, preferring the closest of
several, passing an out-of-tolerance or empty corner list through unchanged, and an exact
tolerance-boundary match still snapping.
`tests/game.e2e.ts` confirms the hotbar's slot 5 (Polygon/Continuous Wall) is selectable with the 5
key, and that pressing `C` on the Wall/Polygon Wall/Ceiling tools cycles snap mode with no console
errors.

## Building levels, horizontal slabs, and multi-level collision

`src/lib/game/building/` extends the ground-floor-only building system above with **storeys**:
ceilings, upper floors, and flat roofs (all one shared "slab" representation), a logical
current-level selector the player can build on above ground level, and collision that lets the
player actually stand on, and be blocked by, those slabs.

### Building levels (`BuildingLevelTypes.ts`, `BuildingLevelManager.ts`)

A **level** is a logical subdivision of the _same_ foundation-local coordinate space every other
building element already uses — never a separate per-storey origin. `BuildingLevelDefinition`
stores `{ id, foundationId, index, baseY, wallHeight }`; `BuildingLevelManager.getOrCreateLevel`
recursively ensures every level below the requested one exists first (so indices are always
contiguous from 0), and freezes a new level's `baseY` (previous level's `baseY + wallHeight`, or 0
for level 0) and `wallHeight` (the _current_ `defaultStoreyHeight` setting) at creation time — the
same "store authored values, don't re-derive from a live default" rule `wallHeight`/`wallThickness`
already follow for individual walls. Dragging `defaultStoreyHeight` in the GUI afterwards only
changes the _next_ level created, never an existing one. Because levels are always created
contiguously and each new one's `baseY` is always strictly greater than its predecessor's, "the next
index" and "the next known elevation" are the same thing — moving up/down never needs a separate
search by Y, and never skips a level authored with a non-default storey height (a building doesn't
have to use the same storey height throughout).

**Levels are per-foundation, not global.** Two foundations never share a "current level" — each has
its own independent index, tracked in `BuildingLevelManager`'s own
`Map<foundationId, currentLevelIndex>`. `getCurrentLevelIndex(foundationId)`/
`setCurrentLevelIndex(foundationId, index)` both take an explicit `foundationId` for exactly this
reason (an earlier version stored one single global index in `BuildingSettings`, which meant
standing on Foundation B's Level 0 while Foundation A's Level 2 was still "current" would silently
apply Foundation A's level number to Foundation B). `BuildingSettings.currentBuildingLevelIndex`
still exists, but only as a live, best-effort **mirror** of whichever foundation is currently active
— written to (for the dev-only debug GUI's benefit), never read from, by anything else.

**Which foundation "current level" applies to** is its own piece of state,
`BuildingLevelManager`'s `activeFoundationId`, resolved via:

- `reportHoveredFoundation(foundationId | null)` — called every frame by every level-aware tool
  with whatever its crosshair currently resolves to. A hit switches the active foundation; a miss
  deliberately does nothing (retains whichever foundation was last active), so a player's context
  doesn't flicker away the instant they glance off the edge of what they're building.
- `lockActiveFoundation(foundationId)` / `unlockActiveFoundation()` — every tool calls the former
  the moment a multi-click placement begins (a wall's first point, a wall-path/slab polygon's first
  point, a stair footprint's first corner) and the latter on both successful confirm and cancel
  (including via `Escape`/right-click, undoing back to zero points, or switching hotbar slots
  mid-draw — every tool's `deactivate()` also unlocks, defensively). While locked,
  `reportHoveredFoundation` is a no-op, so the crosshair drifting over a neighbouring foundation
  mid-placement can never retarget which foundation "current level" means partway through.

Page Up/Page Down (and the on-screen floor selector below) both call `moveUp()`/`moveDown()`, which
operate on `activeFoundationId` — never below level 0 (a no-op there), and never past
`maxBuildingLevels` (a safety limit, default 10, not a game-design restriction) unless a higher
level was already authored, in which case selecting it is always allowed regardless of the cap.
`moveUp()` doesn't need to search for "the next known elevation" separately from "the next index"
(see above) — it just calls `getOrCreateLevel(foundationId, currentIndex + 1)`, which transparently
returns an already-authored level's real elevation, or creates a new one from the _current_ level's
own `baseY + wallHeight` if none exists yet.

**Automatic level discovery**, for a foundation that already has placed geometry but no
`BuildingLevelDefinition`s recorded yet (e.g. after a fresh load in a future save/load feature —
today, every level is always created through `getOrCreateLevel` the moment a tool needs it, so this
mainly exists for that future case and is directly unit-tested):
`BuildingLevelManager.discoverLevelsFromBuilding(foundationId, building)` scans a
`FoundationBuildingDefinition`'s walls'/wall-paths' `baseY`, slabs' `localY` (a slab's top surface
always sits exactly at the `baseY` of the level above it — see the Slabs section), and stairs'
`baseY`, dedupes elevations within a small epsilon, and backfills one `BuildingLevelDefinition` per
distinct elevation (level 0 always included at `baseY = 0`), with each one's `wallHeight` inferred
from the gap to the next elevation above it. A no-op if the foundation already has any authored
levels — this only ever backfills, never overwrites.

**Level naming** (`BuildingLevelTypes.levelDisplayName`): the first eleven levels get player-facing
names — "Ground Floor", "First Floor", "Second Floor", ... "Tenth Floor" — read far more naturally
in a first-person building game than "Level 0"; anything beyond that falls back to `Level N`.
Internal code (grid math, HUD keys, serialization) always keeps using the plain numeric
`index`/`baseY` — this table is consulted only at the point text is actually shown to the player.

### Targeting elevated building levels (`foundationTopTargeting.raycastLevelConstructionPlane`)

Ground-floor tools raycast against a real foundation-top mesh. An upper level usually has nothing
physical to raycast yet, so `raycastLevelConstructionPlane` resolves the target foundation first
(a real mesh hit if one exists, otherwise whichever foundation's footprint contains the player's
current position — covers looking up to build a ceiling while standing in the room below it), then
analytically intersects the same camera ray against a logical horizontal plane at
`foundation.topY + level.baseY`. Wall, Polygon Wall and Stairs all use this one function, so they
can never disagree about where "the current level's floor" is. The level itself is resolved via
`levelManager.getCurrentLevelIndex(foundationId)` — deliberately **after** the foundation is known
(not passed in as a separate parameter), since with per-foundation levels there's no single "current
level" to ask for until you know which foundation you mean.

**Bugfix: targeting an elevated level failed as soon as the player stepped outside the
foundation's own footprint.** Both heuristics above have a blind spot for upper storeys
specifically: there's no mesh to hit (nothing physical exists up there yet, most of the time), and
"standing inside the footprint" fails the moment the player backs away from a small foundation to
get a workable upward viewing angle on a plane several metres above their head — exactly the pose
you'd naturally take to see a high ceiling or wall. When both failed, the function returned `null`
outright: no crosshair, no preview, and for Window/Door (which need a real wall to already exist)
nothing to attach an opening to either, even though the player was clearly still working on the
same foundation. Fixed by adding a third fallback — `levelManager.getActiveFoundationId()`, i.e.
whichever foundation is already the established building context (see "Building levels" above) —
tried only after both other heuristics fail. This is safe against wandering off somewhere unrelated:
the existing `isBuildingGridPointInsideFoundation` check at the end still rejects the result if the
analytic plane, projected from wherever the player actually is, doesn't land inside that
foundation's real footprint — the fallback only ever helps the case where it does.
`foundationTopTargeting.spec.ts` covers both the successful fallback and that out-of-range case.

Slabs use a sibling function, `raycastSlabConstructionPlane` — see the Slabs section below for why
they need a different target height than the other level-aware tools; it gained the identical
fallback and regression coverage.

### Slabs (`SlabTypes.ts`, `slabMath.ts`, `SlabGeometryBuilder.ts`, `SlabManager.ts`, `SlabToolBase.ts`)

`SlabType = 'ceiling' | 'floor' | 'flat-roof'` — all three are exactly the same underlying
`SlabDefinition` (a foundation-local polygon, a top-surface `localY`, and a `thickness`); `type`
only ever affects material and HUD text, never geometry. This is also what lets **one physical slab
serve as both a room's ceiling and the floor above it**: Ceiling Tool and Floor Tool both default a
new slab's `localY` to `level.baseY + level.wallHeight` (the top of the level's walls), and
`SlabManager.findOverlappingSlabAtLevel` rejects a second slab with an overlapping footprint at that
_same_ `localY` on the same foundation as a duplicate — there's no separate "usages" flag, the
ordinary overlap rule alone prevents two coplanar objects. Slabs at _different_ `localY` values are
free to overlap in X/Z (that's just stacked floors).

**Targeting: looking up at the slab's own plane, not down at the ground.** Unlike Wall/Polygon
Wall/Stairs (which start at the current level's _floor_), a slab always sits at the top of the
current level's walls — well above head height (see `defaultLocalY` above). Reusing
`raycastLevelConstructionPlane` here (as originally implemented) meant every slab tool's crosshair
targeted the ground-level plane, so a player had to aim _down_ at their feet to place points for a
shape that actually gets built a storey above their head — the point markers and preview appeared
in the right place, but nothing about where you were looking corresponded to where a click would
land. `SlabToolBase` instead calls a dedicated `foundationTopTargeting.raycastSlabConstructionPlane`,
which always intersects the ray with the analytic plane at the slab's real height
(`foundation.topY + level.baseY + level.wallHeight`) — so the crosshair, the building-grid overlay,
and the point/preview markers all sit on the exact same plane a player is looking _up_ at, and
corners are clicked directly on that (otherwise invisible) plane rather than inferred from a ground
click. Foundation resolution prefers "which foundation's footprint am I standing in" over a mesh
hit, since aiming up moves the ray away from any ground-level mesh; the mesh-hit path remains as a
fallback for aiming down at a foundation from just outside its footprint.
`foundationTopTargeting.spec.ts` covers both resolution paths, the ceiling-vs-ground height
regression, an out-of-footprint miss, and targeting a level other than 0.

Points are the same foundation-local `BuildingGridPoint` list every wall/wall-path uses — no second
grid. `slabMath.validateSlabPolygon` rejects fewer than 3 points, a duplicate/zero-length edge, a
zero-area polygon, and self-intersection (reusing `wallPathMath.pathSelfIntersects` directly, since
a slab polygon is geometrically a closed wall path). `slabMath.ensureCCW` normalizes winding before
triangulation so a polygon drawn clockwise or counter-clockwise always produces an identical,
correctly-lit solid — verified directly by `SlabGeometryBuilder.spec.ts` computing each output
face's actual normal.

`SlabGeometryBuilder.buildSlabGeometry` builds a real extruded prism (top surface, underside, and
vertical side walls — never a single-sided flat `ShapeGeometry`) via
`THREE.ShapeUtils.triangulateShape` (Earcut), which supports concave simple polygons, not just
convex fans. It also accepts `holes` (see "Stair openings in slabs" below) and punches an actual
physical gap through both faces plus an inward-facing "collar" wall around each hole's boundary —
the opening is real geometry, not a rendering trick.

`SlabManager` owns one BuildingRoot group per foundation (`FoundationRootRegistry`, the same "one
Group at the foundation's world origin, children positioned foundation-locally" pattern
WallManager/WallPathManager already use, extracted here since this is its third independent user).
It caches each slab's world-space outer polygon and hole polygons alongside its mesh so
`getTopSurfacesAt`/`getUndersidesAt` (point-in-polygon queries the collision system below reads)
never re-derive them per call, and correctly exclude any point that falls inside an opening.

The Ceiling/Floor/Roof tools are three thin `SlabToolBase` configurations (label, slab type,
default thickness setting) — one shared implementation for the click-to-add-a-point,
click-first-point-to-close polygon interaction (always closed; there's no "open slab" concept,
unlike a wall path), live stepped preview, and per-tool HUD.

### Multi-level collision (`WorldSurfaceSampler.ts`, `FirstPersonController.ts`)

A single (worldX, worldZ) column can have several stacked horizontal surfaces — terrain, a
foundation top, and any number of slabs at different levels. `WorldSurfaceSampler.getSupportingSurfaceY(worldX, worldZ, referenceY)`
returns the _highest_ candidate that is still at or below `referenceY` (the player's own pre-step
feet Y) plus a small epsilon — this is the whole fix for "must NOT magically teleport vertically
onto slabs above them": a roof's top is a real "highest surface at this X/Z", but since it isn't
below the player, it's correctly excluded. Terrain height and a foundation's top are both always
included unconditionally, regardless of `referenceY` — see the bugfix note directly below for why
foundations don't get the same restriction slabs do. Spawning passes `referenceY = Infinity`,
recovering the original "land on the highest available surface" behavior as a plain special case.

`getCeilingBlockY(worldX, worldZ, fromY, toY)` finds the lowest slab underside crossed by an upward
move, so a jump can't punch through a floor from below — `FirstPersonController.update()` checks it
only while `proposedY > this.worldPosition.y` (moving up), clamping the proposed position and
zeroing vertical velocity if a ceiling is hit.

**Bugfix: foundations were incorrectly given the same "not above referenceY" restriction slabs
need, breaking the previously-working "always step up onto a foundation" behavior.** The
restriction exists so a player standing in a room can't be magically sucked up onto the roof above
them — a real scenario for slabs, since a room genuinely exists _underneath_ one. A foundation has
no equivalent scenario (there are no basements yet; it's a raised platform, not a ceiling), but an
earlier version applied the identical `referenceY + SUPPORT_EPSILON` (~0.05m) gate to it anyway. A
foundation levels out to the site's _highest_ terrain point, so its edge is very often a metre or
more above the surrounding ground it was built on — walking up to one from lower terrain almost
always exceeded that 5cm tolerance, so the player would clip straight through the edge instead of
stepping up onto it, landing at the wrong height below it. Since a stair's `baseY` is measured from
that same foundation top, this made stairs built on such a foundation feel unreachable too, even
though the stairs' own collision was correct — the player's _reference_ height was simply wrong to
begin with. Fixed by treating a foundation's top exactly like terrain: an unconditional candidate,
never gated by `referenceY`. `FoundationManager.spec.ts` and `FirstPersonController.spec.ts` both
cover the corrected behavior — the latter walks a full end-to-end scenario (spawn on low terrain →
step onto a 2m-elevated foundation → climb its stairs) with no jump required at any point.

### Walls on upper levels

`WallDefinition`/`WallPathDefinition` both gained a required `baseY` (defaulting to 0 for older
saved data via `?? 0` at load time) — the wall's bottom, still measured from the _same_
foundation-local Y=0 origin every other element uses. `computeWallTransform` took a new optional
`baseY` parameter that simply adds into `originWorldY`, so `buildWallCollisionRects`' existing
`transform.originWorldY` usage needed no changes at all; `WallPathGeometryBuilder`'s mesh vertices
are baked in local space, so `baseY` had to be added explicitly into every `extrudePolygon` Y-value
and into each collision rect's Y extents. Window/Door openings stay wall-local (`minY`/`maxY`
relative to the wall's own base) exactly as before — an upper-storey wall's opening world Y is
still just `wall transform's originWorldY + opening minY/maxY`, no separate code path.

### The on-screen floor selector, and per-tool level HUD

Every tool's `BuildUiState` (Foundation excepted — it has no notion of "current level" at all)
carries an optional `level: BuildingLevelUiState` field — `{ index, baseY, displayName, canMoveUp,
canMoveDown }`, computed live by `BuildingLevelManager.getLevelUiState(foundationId)` (a single
shared source for the cap/bounds logic, rather than duplicating it per tool). `+page.svelte` renders
this as a standalone widget on the screen's left edge whenever it's present — a ▲ button, the
level's display name and elevation, and a ▼ button, each arrow disabled exactly when
`canMoveUp`/`canMoveDown` is false. Clicking either button calls
`ThreeScene.moveLevelUp()`/`moveLevelDown()`, which simply forward to
`BuildingLevelManager.moveUp()`/`moveDown()` — the exact same methods Page Up/Page Down call, so the
two controls can never disagree about what "moving a level" means.

Each tool's HUD `hintLines` also show the current level's display name (`"GROUND FLOOR"`,
`"FIRST FLOOR"`, ...) instead of the old raw `"LEVEL 0"` text, via the same `getLevelUiState`/
`levelDisplayName` — falling back to `getActiveFoundationId()` when the tool itself has nothing
specific hovered (e.g. the idle HUD right after switching tools), and to `'Look at a foundation'`
when no foundation has ever been targeted at all.

### Window/Door targeting (`openingWallPick.ts`)

`WindowTool`/`DoorTool` (via `OpeningToolBase`) place an opening on the wall the crosshair is
pointing at — never on an invisible construction plane — and the opening's position _within_ that
wall comes purely from where the ray lands on it. That wall is then **validated against the selected
level**: `pickOpeningWall` (a pure, framework-free module, unit-tested in `openingWallPick.spec.ts`)
returns the nearest hit flagged with whether its `baseY` matches its foundation's current level.
On-level it places; off-level `OpeningToolBase` still highlights the wall — so it's obvious what the
crosshair found — but refuses, showing `Wall is on Ground Floor` / `Page Up / Page Down to match`.
Levels are resolved per foundation inside the pick, so two foundations in view can legitimately be
on different storeys at once.

**Bugfix, in two rounds.** Originally the tool took `hits[0]` with no level check at all, so with
"First Floor" selected a window aimed near an upper wall still got cut into whatever wall the ray
met first — usually a ground-floor one — and Page Up changed nothing, because nothing about the pick
consulted the level. The first fix over-corrected: it scanned the hit list for the first wall _on
the selected level_. But a raycaster reports every wall along the ray, **including ones hidden
behind the one you're looking at** — in a closed room, aiming slightly upward at the near
ground-floor wall also passes through the far first-floor wall above and beyond it. Openings then
landed on walls the player couldn't see, and the only way to place upstairs was to aim at a
downstairs wall: exactly backwards. The rule is now simply "the wall in front of the crosshair,
validated against the level", which keeps what you see and what you get the same thing, and makes
the failure case self-explanatory instead of silently redirecting the opening elsewhere.

A wall's `baseY` is copied verbatim from its level at placement time, so the wall↔level comparison
(`isWallOnLevel`) is an exact match plus a 1cm epsilon that only ever absorbs float drift through
serialization — not a "near enough" allowance that could let an adjacent storey qualify.

**Why this needs loud feedback: stacked walls look like one wall.** A ground-floor wall and the
first-floor wall above it are flush and identically shaded, so they read as a single tall surface
with no visible seam at `y = 3`. Aiming at the lower half of "the wall in front of you" while
standing upstairs is therefore genuinely aiming at the ground-floor wall, and gets refused — which
looks exactly like the tool doing nothing unless it says so. Two things make it say so:
`BuildUiState.notice` renders the blocking reason as a badge right above the crosshair (see below),
and the build HUD was moved out from under the dev GUI.

**Bugfix: an upper-storey Continuous Wall's raycast target sat a whole storey below the wall
itself.** A wall path keeps two meshes per segment — one merged _visible_ mesh, and an invisible
per-segment **picking** box that Window/Door raycast against (`WallPathManager`). The visible mesh
bakes `baseY` into its vertices (see `WallPathGeometryBuilder`), but the picking box is built
spanning local Y `0..wallHeight` and was then positioned at local Y **0**, ignoring `baseY`
entirely. So a first-floor path _rendered_ at 3–6m while the thing the crosshair could actually hit
sat at 0–3m. Standing upstairs and aiming straight at the wall found nothing at all ("Look at a
wall"), and aiming down at the ground floor found the stale box — which resolves to the upper
segment's id, so the opening appeared on the floor above. That is the whole "I have to point at the
ground-floor wall to place upstairs" behaviour, and it was never the level check: standalone
Wall-tool walls (`WallManager`, which positions via the full `computeWallTransform` including
`baseY`) were always correct, which is why it looked intermittent. Fixed by positioning the picking
mesh at `definition.baseY`. `WallPathManager.spec.ts` pins the picking box's world-Y extent to the
path's own storey at several levels — those tests fail against the old line.

**Bugfix: the build HUD was drawn underneath the lil-gui debug panel.** `.build-hud` sat at
top-right; lil-gui auto-places itself at top-right too, at full viewport height. The HUD was
completely covered — so every hint and every blocking reason the build tools emit ("Look at a wall",
"Wall is on Ground Floor", opening dimensions, the level name) was rendered invisibly, and the only
feedback reaching the player was the crosshair's colour. It now sits bottom-left, clear of the GUI,
the stats overlay, the floor selector and the hotbar; `tests/game.e2e.ts` asserts the two boxes
don't intersect so it can't silently regress.

**Bugfix: the floor selector disappeared, and Page Up/Down silently stopped doing anything, the
moment a player switched to Window or Door.** `BuildingLevelManager.moveUp()`/`moveDown()` (and by
extension the floor selector's own arrows) act on `activeFoundationId` — which is only ever set by a
tool calling `reportHoveredFoundation()`. `OpeningToolBase` originally never called it at all (it
had no `BuildingLevelManager` reference), so switching to Window/Door didn't just hide the selector
— if the player hadn't already established a foundation as active via some OTHER tool first, Page
Up/Down would do nothing at all while placing openings, with no feedback that anything was wrong.
This is exactly backwards from "place a window on a Level 2 wall": you need the floor selector and
Page Up/Down precisely to get to the right wall in the first place. Fixed by giving
`OpeningToolBase` a `levelManager` reference and calling
`reportHoveredFoundation(wall.foundationId)` in `update()` whenever a wall is hovered (via the
target wall's own stored `foundationId` — never the reverse: this still never influences where an
opening actually gets placed, which is unaffected and still purely wall-based). The HUD's `level`
field falls back to `getActiveFoundationId()` when nothing is currently hovered, so the selector
stays visible and stable between openings rather than flickering away every time the crosshair
drifts off a wall.

### Stairs and level targeting

The Stair Tool locks onto a foundation (`lockActiveFoundation`) the moment its first corner is
placed, and freezes `activeLevelIndex`/`activeBaseY` from that foundation's current level at that
same moment — a stair's bottom is always `currentLevel.baseY`, exactly like the other level-aware
tools' first click. `findMatchingLevel` (unchanged from before this feature) checks whether the
stair's calculated total rise lines up with an already-authored level's `baseY`, or with where the
_next_ level would land if created — the direction-HUD now surfaces this as

```
Stairs connect:
Ground Floor → First Floor
```

using the same player-facing names as everywhere else, replacing the old `Target: Level N` line.
Once stairs are confirmed and they meaningfully reach a level, `StairTool` remembers that target
(`{ foundationId, levelIndex }`) and surfaces a `Page Up: Build on First Floor` hint in the idle HUD
— cleared automatically the moment the player's own current level for that foundation reaches or
passes the target (checked on every idle-state HUD refresh), so the hint never lingers once it's
been acted on. Placing stairs never forces the player up to the new level automatically — the hint
is the only nudge.

### GUI and settings

**Building > Levels**: `currentBuildingLevelIndex` (now a live-updating, best-effort **mirror** of
whichever foundation is active — `.listen()`'d so it stays current, but no longer meaningfully
editable by dragging it: the real controls are Page Up/Down and the on-screen floor selector),
`defaultStoreyHeight`, `maxBuildingLevels`, `showLevelConstructionPlane`, `buildingLevelViewMode`
(default changed to `'current-and-below'`, per the brief — showing every level by default made
placing something on an upper floor harder to judge against the room below it), `fadeNonCurrentLevels`
(currently a plain settings field with no rendering wired to it yet — see "Not implemented yet").
**Building > Slabs**: `floorThickness`, `roofThickness`, `showSlabBounds`, `showSlabPolygonPoints`,
`slabPreviewOpacity`. (A `snapToWallCorners` GUI toggle used to sit here — removed once wall-corner
snapping actually shipped as the `C`-cycled `'wall-corners'` mode below; the toggle's own doc comment
described exactly that behavior but nothing had ever implemented it.)

### Tests

`BuildingLevelManager.spec.ts` (34 tests): level 0 always starts at `baseY = 0`; a new level's
`baseY` is the previous level's `baseY + wallHeight`; requesting level N recursively creates every
level below it, contiguously; `wallHeight`/`baseY` freeze at creation and don't move when
`defaultStoreyHeight` changes afterward; levels are independent per foundation; a negative index
throws; each foundation's `currentLevelIndex` is independent and mirrored onto
`buildingSettings.currentBuildingLevelIndex` only for the active foundation;
`reportHoveredFoundation`/`lockActiveFoundation`/`unlockActiveFoundation` — hover switches context,
a miss retains the last active foundation, and a lock makes hover a no-op until released;
`moveUp`/`moveDown` via Page Up/Down — selects an already-authored higher level instead of
recomputing one from the live `defaultStoreyHeight`, never skips a known elevation, and refuses to
create a level past `maxBuildingLevels` while still allowing one already authored above the cap;
`getLevelUiState`'s `canMoveUp`/`canMoveDown` bounds; `discoverLevelsFromBuilding` inferring levels
from wall/slab/stair elevations (deduped within a small epsilon, level 0 always included, a no-op
once any level is already authored); `removeLevelsForFoundation` also forgetting that foundation's
current-level and active-foundation state; serialize/load round-trips. `slabMath.spec.ts` (18
tests) and `SlabGeometryBuilder.spec.ts` (10 tests, including geometric winding checks via each
triangle's cross-product normal) cover the polygon math and extrusion in isolation.
`foundationTopTargeting.spec.ts` (12 tests) covers both targeting functions: `raycastSlabConstructionPlane`
resolving the foundation a player stands in and intersecting the ceiling plane (not the ground) while
looking straight up; a regression proving a diagonal look-up ray lands at the ceiling height
specifically, not the old ground height; falling back to a physical mesh hit when aiming down at a
foundation from outside its footprint; returning `null` for a ray that hits neither; returning `null`
when a shallow look-up angle lands outside the footprint at the ceiling's height; targeting a level
other than 0; and the active-foundation fallback both succeeding (stepped outside the footprint, still
land inside it) and correctly staying rejected when the ray genuinely lands outside. `raycastLevelConstructionPlane`
gets equivalent coverage: a direct ground-level mesh hit, the standing-inside fallback for an elevated
floor plane, the same active-foundation-fallback regression, and a plain `null` case with nothing active.
`BuildingManager.spec.ts` adds: `addSlab` accepting concave polygons and rejecting self-intersecting
/ out-of-foundation / zero-area / duplicate-point ones; rejecting a same-level overlapping slab
while accepting one at a different `localY`; a Ceiling+Floor pair at the same default elevation
collapsing into exactly one physical slab; world-Y conversion (`topY=20, localY=3 → top=23`) and
thickness (`localY=3, thickness=0.2 → bottom=2.8`); CW/CCW winding producing an identical walkable
surface; concave-slab point containment correctly excluding a point in the polygon's own notch;
wall `baseY` placement and an upper-wall opening's absolute world Y; and a full multi-storey
serialize/load round trip across two levels. `WorldSurfaceSampler.spec.ts` adds the core multi-level
collision behavior directly: no snapping onto a slab above the player, snapping fine once the player
is actually at/above it, spawn-style `Infinity` landing on the highest surface, terrain as the
unconditional fallback, and `getCeilingBlockY` reporting the correct (lowest, when several are
crossed) underside. `tests/game.e2e.ts` confirms the hotbar's Ceiling/Floor/Roof slots (6-8) and the
Levels/Slabs GUI folders render with no console errors, plus that the on-screen floor selector stays
hidden until a foundation is actually targeted (never shows a misleading "Ground Floor" for a world
with no foundations at all) and that Page Up/Page Down never throw with no active foundation yet.

### Not implemented yet

Room detection/auto-enclosure, floor holes/stairwell openings beyond the stair-driven ones below,
atriums, balconies, railings/parapets, skylights, sloped floors, a floor materials catalogue, and
negative building levels (basements).

`buildingLevelViewMode` (`'all' | 'current-and-below' | 'current-only'`) and `fadeNonCurrentLevels`
exist as `BuildingSettings` fields with a debug GUI toggle each, but nothing yet reads either one to
actually hide or fade any wall/slab/stair mesh by level — every placed object on every level, on
every foundation, always renders simultaneously regardless of these settings. Wiring this up means
teaching `WallManager`/`WallPathManager`/`SlabManager`/`StairManager` to compare each mesh's own
`baseY` (or, for a slab, `localY`) against the active foundation's current level and adjust
visibility/opacity accordingly, re-applied whenever the active foundation or level changes.

## Undo: reverting the last few build actions (`BuildUndoManager.ts`)

Pressing `-` (or Numpad Subtract) reverses the most recent successful placement: a standalone wall,
a Continuous/Polygon Wall path, a window/door opening, or a ceiling/floor/roof slab. `BuildUndoManager`
holds a small LIFO stack — up to 5 entries, oldest dropped once a 6th is recorded — of tagged actions
(`{kind: 'wall', wallId}`, `{kind: 'wallPath', pathId}`, `{kind: 'opening', wallId, openingId}`,
`{kind: 'slab', slabId}`). Every placement tool calls `record()` right after its own
`BuildingManager.addX(...)` call reports `{valid: true, value}`, capturing `value.id`; `undo()` pops
the most recent entry and reverses it with the matching `BuildingManager.removeX(...)` call — the
same removal methods `BuildingManager` already exposed, so the undo manager owns no placement state
of its own beyond "what to remove next."

Like `BuildingLevelManager`'s own Page Up/Down handling, the `-` key listener is attached once,
unconditionally, in the constructor (not gated on any particular tool being active) — pressing `-`
undoes the last build action regardless of which tool is currently selected, or none at all.
Removing a wall or wall path already cascades to remove every opening on it (openings live inside
the wall/segment's own `openings` array — see "Enforcement at the data layer"), so undoing a wall
placement never needs to separately track or remove the openings that were cut into it afterward;
undoing a single opening, by contrast, only removes that one opening and leaves its wall standing.

Deliberately out of scope: undoing a Foundation or a Stair placement. A foundation's removal cascades
to every wall/path/slab/stair built on it (`BuildingManager.removeBuildingForFoundation`) and there is
no foundation-deletion UI at all yet (see "Foundation deletion"); wiring that into a 5-deep undo stack
raises its own questions (what happens to other entries in the stack that reference something the
foundation undo just deleted out from under them) that are better solved once foundation deletion
itself is designed, not bolted on here.

### Tests

`BuildUndoManager.spec.ts` covers: `undo()` on an empty history is a no-op returning `false`; each of
the four action kinds calls the correct `BuildingManager.removeX` with the correct id(s) (notably
`removeOpening(wallId, openingId)` — the two-argument case); LIFO ordering across mixed action kinds;
the 5-entry cap actually evicts the oldest entry once a 6th is recorded; a real `keydown` dispatch for
both `Minus` and `NumpadSubtract` triggers undo while an unrelated key does not; and `dispose()`
actually removes the listener. A `FakeWindow` stand-in (identical in shape to
`BuildingLevelManager.spec.ts`'s own) dispatches real `keydown` events in vitest's DOM-less `node`
environment, so the key-handling path is exercised for real rather than by calling `undo()` directly.

## Stairs: axis-aligned, grid-driven straight staircases

`src/lib/game/building/stairMath.ts`, `StairTypes.ts`, `StairGeometryBuilder.ts`,
`StairManager.ts`, `StairTool.ts` add a simple, deterministic way to physically connect building
levels — the multi-level system above lets you _build_ an upper floor, but had no way to _reach_
one. This is deliberately the simplest possible staircase: straight, axis-aligned, one flight, no
landings, turns, or spirals (see "Not implemented yet" below).

### The core rule: footprint length determines height

Stair height is never typed in independently. `1 grid cell of run = 1 step = 1 grid cell of rise`:
given the current foundation-local building grid size, `stepRise = stepRun = buildingGridSize`, and
`stepCount` is simply the footprint's run length in grid cells — `totalRise = stepCount * stepRise`
falls straight out of that. A 12-cell run at the default 0.25m grid produces 12 steps and exactly
3.0m of rise; a 4-cell run produces 4 steps and 1.0m. The longer the footprint, the higher the
staircase reaches — there is no other way to make a staircase taller.

### Coordinate model (`StairTypes.ts`)

`StairDefinition` stores only what can't be derived: `{ id, foundationId, minGridX, maxGridX,
minGridZ, maxGridZ, baseY, direction, levelIndex, gridSizeAtCreation }`. `gridSizeAtCreation` is the
building grid size _at placement time_, frozen — the same "store authored values" rule
`BuildingLevelDefinition.wallHeight` follows — so a later change to the GUI's default building grid
size never resizes an existing staircase's steps. Everything else (width, run, step count, rise,
total rise) is derived on demand via `stairMath.computeStairMetrics`.

`StairDirection = '+x' | '-x' | '+z' | '-z'` — the axis and sense the stairs ascend along. Only
directions along the footprint's _long_ dimension are valid (`validDirectionsForFootprint`): a
footprint longer in X only offers `+x`/`-x`; longer in Z only offers `+z`/`-z`; an exactly square
footprint offers all four, letting Left/Right Arrow cycle through every axis.

### Canonical stair space (`stairMath.stairCanonicalToLocalXZ`)

Rather than four separate geometry/collision implementations (one bug-prone copy per direction),
everything is built once in "canonical stair space" — run along +X (0 = bottom), width along +Z,
rise along +Y — and every point is remapped into foundation-local X/Z via one shared function,
`stairCanonicalToLocalXZ(bounds, direction, runDistance, widthDistance)`. `StairGeometryBuilder` (the
visual mesh) and `StairManager` (tread-surface and collision rects) both call this _same_ function,
so the visible steps and the walkable/collidable steps can never drift apart. Passing an all-zero
`bounds` recovers just the transform's linear part (no translation) — used to remap normals the same
way positions are remapped, since the transform is always a pure axis permutation/reflection, never
a shear or scale.

Two of the four directions (`-x`, `+z`) are reflections rather than rotations (`stairDirectionFlipsWinding`),
which would otherwise invert triangle winding; `StairGeometryBuilder` detects these and reverses
their index order afterward, so lighting and backface culling stay correct without needing a
double-sided material (the stair material is still double-sided anyway, as a defensive fallback).
`StairGeometryBuilder.spec.ts` verifies this isn't just plausible-looking but actually correct, by
computing each triangle's real geometric (cross-product) normal — not just the smoothed vertex
attribute, which would pass even with backwards winding — for the topmost, fully-exposed tread in
every direction.

### Step geometry: a stacked solid, not a ramp (`StairGeometryBuilder.ts`)

Each tread `i` (0-indexed) is a box spanning canonical run `[i * stepRun, runMeters]` (i.e. it
extends all the way to the top, hidden beneath higher treads) and canonical rise
`[i * stepRise, (i + 1) * stepRise]`. The union of these `stepCount` boxes is the classic nested
staircase profile: at any point along the run, the visible/walkable height is `(k + 1) * stepRise`
where `k` is that point's cell index. **Top step convention**: the topmost tread's surface reaches
exactly `baseY + totalRise`, never one riser short — tread `i`'s surface is `baseY + (i + 1) *
stepRise`, so the _last_ tread (`i = stepCount - 1`) lands exactly on `totalRise`. **Bottom
convention**: the first tread (i=0) rises one grid increment from the base floor, so the player
steps naturally up from level ground onto it. Both are tested explicitly in `stairMath.spec.ts` and
`StairGeometryBuilder.spec.ts` (bounding-box min/max Y). The whole solid is intentionally a stepped
mass down to the ground (an acceptable, documented v1 simplification — no open timber
understructure yet), built once via temporary `THREE.BoxGeometry` instances merged into a single
`BufferGeometry` — never one Mesh per step.

### Placement interaction (`StairTool.ts`)

A three-state machine (`StairToolState = 'idle' | 'first-corner-selected' | 'choosing-direction'`)
mirroring `FoundationTool`'s two-click flow plus a direction-selection step: click a first corner,
move to the opposite corner (rectangular footprint preview, mirroring Foundation Tool), click to
confirm the footprint, then Left/Right Arrow cycles `StairDirection` while a live stepped preview
(built with the real `StairGeometryBuilder`, not a placeholder box) updates immediately, with
bottom/top markers when `showStairDirection` is on. Enter or another click confirms; right-click
cancels back to idle. Uses the same level-aware `raycastLevelConstructionPlane` targeting as every
other level-aware tool, so stairs can be started from any building level, with `baseY` frozen from
the current level at first-corner time.

The HUD shows width, run, step count, rise per step, total rise, and current direction as soon as
the footprint is confirmed — and, if the stair's `topLocalY` lands within one grid increment of an
existing (or would-be-next) building level's `baseY`, "Target: Level N"; otherwise "No matching
floor level", without ever silently resizing the stair to force a match — height is footprint length,
full stop.

**Judging the right length before committing.** Getting a stair's footprint length right by eye is
hard — its height only exists as an abstract "1 cell of run = 1 cell of rise" rule until it's built.
Two aids address this, both driven by `StairTool.findCeilingLocalYAbove` (a live query against
_actual placed slabs_ via `BuildingManager.getSlabsForFoundation`, not the abstract level system):

- **A rough bounding-box preview appears as soon as the second corner is being chosen** — before a
  `direction` (and therefore the real stepped geometry) even exists yet. It estimates height from
  the footprint's longer dimension (the eventual run axis) at the same one-cell-run-per-cell-rise
  rule the real stair uses, so the player can judge roughly how tall the staircase will reach while
  still dragging, not only after committing to a footprint.
- **The box (and, after the footprint is confirmed, the real stepped preview) turns green the moment
  its height would land exactly on a ceiling or floor slab actually present directly above** —
  reserving green specifically for that exact match, rather than for "valid" in general (a merely
  valid, non-matching placement stays a neutral blue). The HUD's `Ceiling above: X.XXm` /
  `Matches ceiling height!` lines make the same signal explicit in text. If no slab exists above the
  footprint at all, no ceiling line is shown and the preview simply stays neutral — this never forces
  or auto-resizes anything, it only tells the player when they've dragged to the height that would
  align.

### Stair opening in slabs (`SlabTypes.SlabOpeningDefinition`, `BuildingManager`)

If a floor/ceiling slab fully covers a staircase's arrival point, the player has nowhere to walk
through. `SlabOpeningDefinition` (`{ id, type: 'stairs', minGridX, maxGridX, minGridZ, maxGridZ }`)
is a rectangular hole belonging to a specific slab; `SlabGeometryBuilder.buildSlabGeometry`'s `holes`
parameter (see above) cuts it as real geometry on both faces, and `SlabManager.getTopSurfacesAt`/
`getUndersidesAt` correctly exclude any point inside an opening, so the hole exists in collision too,
not just visually.

`BuildingManager` generates this automatically and bidirectionally — no user-facing "cut a hole"
tool exists yet. `addStair` checks every slab on the same foundation for whether the stair's solid
mass actually reaches into it (`BuildingManager.stairReachesSlab`, see the bugfix below) and its
footprint overlaps, opening every one that qualifies (not just the first — a very tall single flight
can legitimately pierce more than one stacked slab); `addSlab` does the mirror check against every
existing stair on that foundation. The opening is simply the stair's own full footprint — a
deliberately "slightly oversized rather than too small" v1 choice (per the spec) that also
automatically guarantees head clearance the whole way up, since nothing above the stair's own
footprint is ever solid.

**Bugfix: the opening only ever appeared for the one stair length that happened to match a slab's
`localY` bit-for-bit.** The original "does this stair reach this slab" check
(`SlabManager.findOverlappingSlabAtLevel`) required `stair.topLocalY` to equal `slab.localY` within
a tiny floating-point epsilon — but a stair's length (and therefore its `topLocalY`) is whatever the
user's freely-chosen footprint produces, so in ordinary use it essentially never lines up exactly,
and the opening silently never appeared ("no visual hole" / "no collision hole", reported after the
step-up collision fix above made the stairs themselves climbable). Fixed by testing genuine
solid/solid intersection instead: `BuildingManager.stairReachesSlab` opens a slab whenever the
stair's top is at or past that slab's UNDERSIDE (`stairTopLocalY >= slabBottomY(slab)`, not
`=== slab.localY`) — correct because the stair is a stacked solid all the way from its own base up
to `topLocalY` (see StairGeometryBuilder above), so it physically intersects a slab the moment it
reaches at least that slab's underside, whether it stops partway through the slab's thickness, lands
exactly on its top surface, or overshoots past it entirely. A stair that never reaches a slab's
underside at all correctly gets no opening there. `BuildingManager.spec.ts` now covers all three
"reaches into" cases (mid-thickness, past the top surface, and short of the underside) explicitly.

**Bugfix: the collar (the hole's inner side wall, connecting its top and bottom rings) had backwards
winding.** `buildSlabGeometry` normalizes a hole's point order to be opposite the outer contour's
(purely so earcut/`triangulateShape` behaves consistently) — that reversed loop direction alone is
what flips the resulting face normal to point correctly inward, into the hole. An earlier version
_additionally_ reversed the triangle index order on top of that already-reversed loop, cancelling
out and pointing every collar face into the solid material instead of into the opening — invisible
from a normal viewing angle on the slab's single-sided material, which was the "the hole in the
ceiling doesn't render" report. `SlabGeometryBuilder.spec.ts` now verifies this directly by computing
each collar triangle's actual geometric (cross-product) normal and checking it points toward the
hole's centre, for both winding directions of both the outer polygon and the hole.

### Step-up / step-down collision (`WorldSurfaceSampler.ts`, `StairManager.ts`)

`StairManager.getStepSurfacesAt(worldX, worldZ)` returns every tread's world-space top Y whose
axis-aligned rectangle contains that point (trivial, since stairs are strictly axis-aligned — no
polygon math needed, unlike slabs). `WorldSurfaceSampler.getSupportingSurfaceY` folds these in with
a **much larger** tolerance than every other surface: `maxStepHeight` (a GUI setting, default 0.3m,
must be `>= buildingGridSize` for the default grid's steps to be climbable) rather than the tiny
fixed `SUPPORT_EPSILON` (~0.05m) foundation/slab tops use. This is the entire "walk up stairs
without jumping" mechanism — reusing the exact same "snap onto the highest surface at or below
`referenceY` (+ tolerance)" logic that already handles foundation edges and floors, just with a
bigger allowance specifically for treads, which are _meant_ to be climbed one at a time. Descending
needs no special tolerance at all: a lower step is always "at or below" the player regardless of
epsilon size, so the existing logic already returns the very next step down, not several at once.

**Bugfix: a single frame's horizontal movement can cross more than one tread.** An individual
tread's walkable footprint is only one grid cell wide along the run (e.g. 0.25m), and
`getSupportingSurfaceY` only ever climbs one riser per call. Checking just the frame's _endpoint_
worked fine at a normal 60fps walk speed (each frame moves far less than one tread), but at run
speed, or after any single frame-time hitch (the delta is clamped but can still reach 0.1s — see
`ThreeScene.animate`), a frame's movement can cross several tread widths at once. Once that happens
even one frame, the player permanently falls behind the stairs' rising floor: every remaining
tread's top is now further than `maxStepHeight` above their (now too-low) actual height, so they
just walk under the (visually elevated) rest of the staircase for good — indistinguishable from "the
stairs have no collision at all until you jump" (jumping's fall happens across many small, slow
frames, which never triggers the skip).

`FirstPersonController.sweptSupportingSurfaceY` fixes this: instead of one `getSupportingSurfaceY`
call at the frame's endpoint, it walks the straight-line path the frame actually covered in small
increments (`STEP_SWEEP_SAMPLE_SPACING`, capped at `MAX_STEP_SWEEP_SAMPLES` samples), **progressively
re-basing `referenceY` on each increment's own result** — simulating what continuous,
infinitesimally-small movement steps would have produced, so several risers can be climbed within a
single real frame if that frame's full movement crossed several tread boundaries. It never climbs
higher, per real-world distance travelled, than a normal walking pace would; it only removes the
frame-boundary artefact that let a tread be skipped over undetected.
`FirstPersonController.spec.ts` reproduces the failure directly (a 0.1s-dt, run-speed climb) and
confirms the player reaches the top instead of falling back to ground level partway across.

Horizontal collision is a deliberate v1 simplification, called out explicitly rather than silently
skipped: `StairManager.getAllCollisionRects()` returns two thin side-edge strips (reusing the exact
`WallCollisionRect` shape/consumer wall collision already uses), running the stair's full length
along whichever edges are perpendicular to its width, blocking the player from walking sideways into
the stair body. Each strip is positioned **entirely outside** the footprint — its inner face flush
with the tread edge, never overlapping the walkable width — rather than centered on the boundary
line; centering it on the boundary was an early bug that, combined with the player's own collision
radius, could narrow a stair's _effectively walkable_ width to zero for anything near the minimum
configured width, making it impossible to climb except by hugging one edge (see
`stairMath.stairSideRectsLocal`'s doc comment and its regression tests in `stairMath.spec.ts` /
`StairManager.spec.ts`). It intentionally does **not** attempt full volumetric side/underside
collision for the entire stepped solid (a player standing directly beneath a ground-level staircase,
in the rare case that's physically reachable at all given the solid bottom-slab construction, is not
blocked) — the vertical (step-up/step-down) collision above is the one this feature is actually
about, and is fully real, not a hidden-ramp shortcut.

### GUI and settings

**Building > Stairs**: `minimumStairWidthCells` (default 4 — chosen comfortably above the player's
own collision diameter so a minimum-width staircase is always walkable, not merely non-zero-width),
`minimumStairRunCells` (default 2), `maxStepHeight`, `stairPreviewOpacity`,
`showStairBounds`, `showStairDirection`, `stairHeadClearance` (reserved for a future, more precise
opening-sizing pass — see "Not implemented yet"). `stepRise` is deliberately **not** exposed
independently; the grid-driven rule above is the whole point.

### Serialization

`FoundationBuildingDefinition` gained `stairs: StairDefinition[]` alongside `walls`/`wallPaths`/
`slabs` (defaulting to `[]` for older saves). `BuildingManager.serialize()`/`.load()` round-trip
stairs exactly, including any slab opening a stair generated — `BuildingManager.spec.ts`'s
serialize/load test confirms both the stair and its resulting `SlabOpeningDefinition` survive a
full cycle unchanged.

### Tests

`stairMath.spec.ts` (28 tests): the core grid-driven rule (`stepCount`/`totalRise` for several run
lengths); the top-step convention (topmost tread reaches exactly `baseY + totalRise`, never one
riser short); a non-zero `baseY` (upper-level stair) shifting `topLocalY` correctly; direction
validity and cycling (including wrap-around and the square-footprint four-axis case); footprint
validation (short/narrow/zero-area rejection, direction-vs-long-axis rejection); the canonical→local
mapping for all four directions, including that a reversed direction on the _same_ footprint keeps
identical dimensions while swapping bottom/top; tread and side-collision-rect derivation, including
a regression check that the side rects sit entirely outside the footprint (see the bugfix note
above). `StairGeometryBuilder.spec.ts` (10 tests) verifies the built mesh directly: bounding-box
top/bottom Y match the top-step/bottom conventions exactly for every direction, and — the most
important correctness check — genuine geometric (not just attribute) face-normal winding for both
the topmost exposed tread and the underside, in all four directions. `StairManager.spec.ts` (9
tests) covers tread-surface queries (including a reversed-direction footprint), side collision
rects — including an integration-level regression proving a player-radius circle can stand anywhere
across a stair's walkable width without being pushed — and serialize/load. `BuildingManager.spec.ts`
adds `addStair` validation (long-axis direction, min width/run, foundation containment, missing
foundation, upper-level `baseY`) and the bidirectional auto-opening behavior: slab-then-stair,
stair-then-slab, no opening when the stair never reaches the slab's underside, and the three
"reaches into" regressions above (mid-thickness, past the top surface, short of the underside).
`WorldSurfaceSampler.spec.ts` adds the step-up/step-down integration behavior directly: auto-climbing
a step within `maxStepHeight` without needing `referenceY` above it, NOT climbing one further away in
a single query, and descending returning the very next step down. `SlabGeometryBuilder.spec.ts`
gained a dedicated holes suite: a hole cuts a real gap through both faces (ray-tested with a
double-sided material to rule out culling as a false pass/fail), the collar-winding regression
described above, and identical results regardless of the outer polygon's or the hole's own winding
direction. `FirstPersonController.spec.ts` (new) drives the _real_ `FirstPersonController` +
`WorldSurfaceSampler` + `StairManager` stack end to end (fake `window`/`document` event targets, no
DOM needed): climbing a full staircase smoothly at 60fps without jumping; the frame-skip regression
above, reproduced at run speed with a 0.1s dt; walking dead-centre up a minimum-width stair without
being pushed sideways; and descending staying grounded, coming down one step at a time without ever
going airborne. `tests/game.e2e.ts` confirms the Stairs hotbar slot (9) and the Building > Stairs GUI
folder render with no console errors.

### Not implemented yet

L-shaped/U-shaped/spiral stairs, landings, railings/bannisters, a stair materials catalogue,
decorative trim, curved stairs, elevators, ladders, ramps, automatic stair generation between
arbitrary floors, and precise head-clearance-driven (rather than full-footprint) opening sizing.

## Remove Mode: a global demolition overlay (`RemoveTool.ts`, `BuildingRemovalManager.ts`, `RemovalTypes.ts`)

Pressing `X` (or clicking the trash icon beside the hotbar) toggles Remove Mode — a temporary
GLOBAL overlay, not another numbered hotbar tool. The hotbar is already full at 1-9, and removal is
a universal editor action rather than another building piece, so it lives entirely outside
`BuildToolManager`'s slot system: entering Remove Mode cancels any unfinished multi-click
construction (a pending polygon/stair selection) and suspends the active tool's own preview/HUD —
exactly what its own `deactivate()` already does for every tool — without ever touching
`activeSlotNumber`. Exiting (`X` again, right-click, Escape, or picking a different hotbar slot)
calls that same slot's `activate()` again, so the tool you had selected is exactly what comes back,
in its normal idle state, with zero separate "remembered slot" bookkeeping needed.

### What can be removed

Individual straight walls, individual segments of a Continuous/Polygon Wall path, windows, doors,
and staircases (with their owned upper-floor slab opening restored). Floors/ceilings/roofs, whole
wall paths, and foundations are deliberately not wired up yet — `RemovalTarget`
(`RemovalTypes.ts`) is a plain `{type, ...ids}` discriminated union specifically so adding one of
those later is a new case in a handful of `switch` statements, not a redesign; a foundation in
particular already has its own cascade primitive (`BuildingManager.removeBuildingForFoundation`,
built for the level system) but no deletion UI at all, and no "what happens to a full 5-deep undo
stack when a foundation it referenced just vanished" answer yet — better solved once foundation
deletion is actually designed than bolted on here.

### Targeting: a logical RemovalTarget, never a raw mesh

`RemoveTool.update()` raycasts every frame against three pools of geometry — standalone wall
meshes + wall-path segment picking meshes (`BuildingManager.getRaycastableWallMeshes`, already used
by Window/Door), every stair's real mesh (`getRaycastableStairMeshes`), and this tool's own
OpeningPickingProxy meshes (below) — and resolves the nearest hit's `object.userData` into a
`RemovalTarget` via `resolveRemovalTarget` (`RemovalTypes.ts`), a small pure function unit-tested
without Three.js at all. Everything downstream — highlighting, HUD text, the actual removal call —
operates on that logical target, never on the mesh; `RemoveTool` doesn't even know which manager
owns what.

Priority ("a door/window opening beats the wall it's cut into, a wall beats nothing") falls out of
the raycast itself rather than an explicit rule: a standalone wall's real geometry has an actual
hole where an opening is (see "Wall-local coordinates and openings" above), so only its
OpeningPickingProxy can register a hit there at all; a wall-path segment's picking box, by contrast,
is a simple solid box that knows nothing about openings, so its co-located proxy is built
deliberately `OPENING_PROXY_DEPTH_BUFFER` (4cm) _thicker_ than the wall — its front face sits
fractionally nearer the camera from either approach direction, so ordinary nearest-hit-wins already
resolves it correctly without a second comparison pass.

`removeToolMaxDistance` (default 12m, a `BuildingSettings`/debug-GUI field) caps the raycast the same
way a player shouldn't be able to demolish a wall hundreds of metres away.

### Window/door opening picking (`OpeningPickingProxy`)

Windows and doors are holes in wall geometry — see the "Window/Door targeting" section above for why
that's true even for a Continuous Wall segment's own (opening-unaware) picking box. Rather than
assume a hole has nothing to click, `RemoveTool` builds one invisible box per EXISTING opening,
sized to the opening's own logical bounds (`maxU-minU` × `maxY-minY` × `wall.thickness + buffer`,
transformed via the same `wallLocalToWorld`/`applyWallTransform` helpers OpeningToolBase's own
preview uses) and tagged with `foundationId`/`wallId`/`openingId`/`openingType` — never rendered
normally (`showRemovalPickingProxies` in the debug GUI renders them translucent yellow for
inspection). The whole set is rebuilt from scratch on `activate()` and after every successful
removal — never incrementally patched — the same "rebuild the whole thing, don't try to be clever"
rule every other manager in this codebase already applies to its own geometry.

Hovering a proxy shows a translucent rectangle filling the hole (`WINDOW / 1.20 × 1.20m / Click to
remove`), reusing the proxy's own box geometry for the highlight rather than the parent wall's.

### Removing a window or door restores solid wall — never a patch mesh

`BuildingRemovalManager.removeOpening` calls straight through to the SAME
`BuildingManager.removeOpening` every other tool already used to CUT the opening — it splices the
`WallOpeningDefinition` out of the wall's (or wall-path segment's) own `openings` array and calls
`rebuildWall`/`rebuildPath`, which regenerates the mesh from `computeSolidWallSegments(wallLength,
wallHeight, wall.openings)` — the exact same authoritative "what's solid" function the wall was
built from in the first place (see "Wall-local coordinates and openings"). With the opening gone
from that array, the function naturally reports the whole span as solid again — there's no separate
"patch" step, because there's no such thing as a wall mesh independent of its own opening list to
patch in the first place.

### Removing a wall or wall-path segment

A standalone wall's removal was already a single `BuildingManager.removeWall` call (openings live
inside the wall's own definition, so they're disposed along with it — no separate cleanup loop
needed, confirmed by `WallManager.removeWall` tearing down the whole entry in one shot).

A Continuous/Polygon Wall path's SEGMENT is new: `BuildingManager.removeWallSegment(pathId,
segmentId)` never leaves a fake logical connection across the gap. For an OPEN path, the removed
segment's index splits `points`/`segments` into a "before" and "after" run; each becomes its own new
path only if it still has >= 2 points (a lone leftover point isn't a wall at all, so removing a
path's only segment can delete the whole thing with no replacement). For a CLOSED path, removing any
one segment can never split a loop in two — a cycle minus one edge is a single connected chain — so
the result is always exactly one new OPEN path (`closed = false`), containing every original point,
rotated to start right after the cut (removing `B→C` from loop `A-B-C-D` leaves the single chain
`C→D→A→B`, not two fragments).

Both cases preserve the ORIGINAL `WallPathSegmentDefinition` objects — same id, same openings — for
every segment that survives; the removed segment's own openings are never migrated to a neighbour,
they simply cease to exist with it. The old path is torn down and the new one(s) built fresh via
`WallPathManager.addPath`, which is what guarantees the corner-join geometry at the new endpoints
regenerates cleanly from the current point sequence alone — no leftover miter/bevel/spike, no stale
collision, from a segment that no longer exists (see "How corner joins are calculated").

### Removing stairs restores ONLY the slab opening they own

`SlabOpeningDefinition` gained an optional `sourceStairId` — set to the stair's own id the moment
`BuildingManager.addStairOpening` cuts the hole (mirroring the forward cascade in `openSlabForStair`
/`autoOpenStairsIntoSlab`). `BuildingManager.removeStair` now removes the stair, then scans every
slab for an opening whose `sourceStairId` matches and removes exactly those (via the new
`SlabManager.removeOpening`, the mirror of `addOpening`) — never an opening belonging to a different
staircase, and never a manually authored one that merely happens to overlap the same footprint.
Ownership is explicit, stored data, never inferred from overlapping position.

### Dependency-aware removal, and where the logic actually lives

Every removal operates on IDs and stored building state, never by searching for nearby meshes.
`BuildingRemovalManager` is a deliberately thin RemoveTool-facing facade — `removeWall`/
`removeWallSegment`/`removeOpening`/`removeStair`, plus a `remove(target: RemovalTarget)` dispatcher
RemoveTool actually calls — over `BuildingManager`'s own primitives. The topology-splitting and
cascade logic themselves live in `BuildingManager`, not in `BuildingRemovalManager`: `BuildingManager`
already privately owns `WallPathManager`/`SlabManager`/`StairManager` and is the one place every
OTHER tool's `confirm*()` call already goes to mutate building state (see its own class doc
comment) — putting the REMOVE side of the exact same relationships anywhere else would mean two
competing places that can mutate the same state.

### Collision and serialization

Every collision query (`WallManager`/`WallPathManager`/`StairManager`.`getAllCollisionRects()`,
`SlabManager.getTopSurfacesAt`/`getUndersidesAt`) is already called fresh every frame by
`FirstPersonController`'s own movement resolution rather than cached — removing a wall, restoring a
doorway, or clearing a stairwell all take effect on the very next frame with no separate
"invalidate collision" step. Removal mutates the same `WallManager`/`WallPathManager`/`SlabManager`/
`StairManager` maps every other placement already writes to, so `BuildingManager.serialize()`
reflects a removal immediately — there is no separate "visual-only" removal path to keep in sync.

### Tests

`RemovalTypes.spec.ts` covers `resolveRemovalTarget`'s priority (opening > stair > wall-segment >
wall) and `removalTargetKey`'s stability, entirely without Three.js. `BuildingManager.spec.ts`
covers: `removeWall` removing a wall's openings/collision in one call; `removeOpening` restoring
exact pre-cut collision rect counts for both a window (partial height) and a door (full height down
to the wall base); `removeWallSegment` on an open path (middle segment splits into two, an end
segment leaves one survivor, a path's only segment deletes it entirely, openings never migrate to a
neighbour) and on a closed path (one segment removed always yields a single open path with the
correct rotated point/segment order); `removeStair` restoring only its own slab opening (never a
different stair's, never a manually authored one); and a full serialize → remove → serialize →
reload round trip proving a removal is never purely visual. `BuildToolManager.spec.ts` covers Remove
Mode's input routing end-to-end with a fake tool: `X` activates/deactivates it and suspends the
active tool; left-click routes to it only once pointer lock is engaged (the lock-acquiring click
never removes anything, same rule every other tool follows); right-click and Escape exit it;
selecting a hotbar slot — including via a real simulated KEYDOWN, which caught a real routing bug
during development where digit keys were silently swallowed instead of exiting Remove Mode first —
exits Remove Mode and switches tools; and no digit key ever activates the remove tool. `game.e2e.ts`
confirms `X` shows a `REMOVE` HUD and toggles the hotbar trash icon's active state, that the
previously selected tool (and its own HUD) comes back exactly once Remove Mode exits, that clicking
the trash icon does the same as `X`, and that selecting a hotbar slot while active exits Remove Mode.

### Not implemented yet

Removing floors/ceilings/roofs, whole wall paths in one click, and foundations (see "What can be
removed" above); a confirmation step for any of those once they exist (deliberately not needed for
the current per-element removals — hover-preview-plus-click is the whole confirmation, per the
spec's "removal must feel like almost no friction" guidance); and any deeper undo integration beyond
what `BuildUndoManager` already covers for placement (removal doesn't currently push onto that same
stack — reversing a removal would mean fully reconstructing a `WallDefinition`/`WallPathDefinition`
/`StairDefinition` including every opening it had, which the existing undo stack's `{type, id}`
shape doesn't carry; a natural, but separate, future extension).

## Vegetation: independent forest regions

`src/lib/game/vegetation/` adds large procedural forests **as a second map laid over the terrain**,
not a property of terrain biome. Terrain biome answers "what shape is the ground"; vegetation only
answers "how much forest exists here" — plains, hills, highlands and mountains can each be forested
or bare, and a forest belt can run straight through all four without caring.

- **`VegetationRegionSampler.ts`** — the forest coverage map itself: `getForestDensity(x, z)`
  returns a continuous 0..1 value (not a boolean). A single-octave, domain-warped mask (same
  "single octave" reasoning as the terrain biome mask — extra octaves fragment large regions into
  speckles) decides the broad forest/open split via `smoothstep(threshold ± blendWidth, ...)`; a
  medium-frequency **cluster** mask multiplies local density up/down subtly (small groups within a
  forest); a medium-frequency **clearing** mask subtracts holes. The large mask dominates by
  construction — density is `0` outright (skipping the other two samples entirely) wherever it
  says "no forest", and the other two only ever modulate around that base.
- **`TreePlacementGenerator.ts`** — turns density into actual deterministic tree candidates. See
  "deterministic tree candidates" below.
- **`TreeManager.ts`** — the Three.js side: loads/unloads vegetation chunks around the player
  (aligned to terrain's `chunkSize` purely for loading granularity — see below) and renders
  everything through instanced meshes. See "instanced rendering" below.
- **`treeGeometry.ts`** — three simple procedural tree variants (trunk cylinder + cone/sphere
  foliage, low-poly), built once and shared by every instance.
- **`cellHash.ts`** — the address-independent per-cell hash every deterministic roll is built on.
- **`InstancedTreeLayer.ts`** — packed-instance bookkeeping (see below).

### Independence from terrain biome

`VegetationRegionSampler` never imports or reads anything from `TerrainHeightSampler`'s biome
weights, and every one of its noise generators is seeded from its own name
(`forestRegion`/`forestWarpX`/`forestWarpZ`/`forestClearing`/`forestCluster`) — distinct from every
terrain-biome seed name, via the same `createNamedRandom(worldSeed, name)` helper terrain itself
uses. Both systems ultimately derive from the same world seed string, but hashing a different name
into that seed produces an uncorrelated noise channel — this is the "avoid correlation" requirement
from the brief, and it's asserted directly in `VegetationRegionSampler.spec.ts` (mutating terrain
biome settings drastically and confirming the forest mask doesn't move at all) and visible in the
"Terrain + Forest" debug view: the same dark-green forest tint appears over plains-green,
hills-olive, highlands-brown and mountains-white alike, crossing every biome-colour boundary freely
— I generated this offline while tuning it (sampling the two maps over a wide area and rendering
them to a PNG) and the forest belts plainly ignore biome shape entirely.

The one place terrain properties _do_ matter is **candidate validity**, not region selection — see
below.

### Deterministic tree candidates

The world is divided into a **vegetation placement grid** (`treeCellSize` world units per cell,
independent of terrain vertex spacing) — never one random roll per terrain vertex. Each cell yields
at most one candidate. `TreePlacementGenerator.evaluateCell(cellX, cellZ)`:

1. **Offset** — `hashCellToFloat01(seedHash, cellX, cellZ, OffsetX/Z)` picks a position inside the
   cell (not its center), so trees never form a visible grid.
2. **Existence** — samples forest density at that candidate position, multiplies by
   `treeDensityMultiplier` and (if enabled) a treeline falloff, then compares against another
   independent hashed roll. Denser forest -> higher acceptance probability -> naturally more trees;
   this is genuinely continuous (a 0.5-density edge accepts roughly half its candidates), which is
   what makes forest edges read as "a few trees, then more, then dense" instead of a hard line.
3. **Slope** — rejects the candidate if the _actual_ terrain slope there (from
   `TerrainHeightSampler.sampleWithNormal`'s normal, converted to degrees) exceeds
   `maxTreeSlopeDegrees`. This is real geometry, never a biome-based proxy — a mountain slope
   shallow enough to plant on keeps its trees; a cliff doesn't, regardless of what biome it's in.
4. **Scale/rotation/variant** — three more independent hashed rolls.

`hashCellToFloat01` (`cellHash.ts`) is a pure integer bit-mixer, not a sequential PRNG — it needs no
prior state, so cell `(12, -7)` always evaluates identically no matter what order chunks load in,
which chunk is loading it, or whether neighbouring cells have been evaluated yet. This is what makes
placement reproducible per multiplayer client and stable when you leave and return to an area.
`TreePlacementGenerator.spec.ts` asserts this directly (two independent generator instances, same
seed, same cell, identical output down to the exact rotation/scale/variant) as well as negative-cell
correctness (a candidate for `cellX = -5` lands inside `[-5 * cellSize, -4 * cellSize)`, not
somewhere floor/truncation would misplace it).

### Crossing chunk boundaries seamlessly

Every tree's existence and position comes from `(worldSeed, cellX, cellZ)` alone. A vegetation
_chunk_ only decides which cells get **evaluated in this loading pass** — `TreeManager` assigns a
cell to a chunk purely by which chunk's world-space bounds contain that cell's _origin_
(`Math.ceil`-based range math, correct for any `chunkSize`/`treeCellSize` ratio and negative
coordinates, mirroring the same reasoning as terrain's `worldToChunkCoord`). A candidate's actual
offset position can land up to one `treeCellSize` outside its owning chunk's nominal boundary, which
is expected and harmless — nothing clips or culls a tree at a chunk edge, so there is no seam to see.
`VegetationRegionSampler.spec.ts` and `TreePlacementGenerator.spec.ts` both assert this: sampling
density (or evaluating a cell) at a shared chunk-boundary coordinate from two independently-
constructed samplers/generators produces bit-identical results.

### Slope and treeline

`maxTreeSlopeDegrees` (default 40°) is the hard cutoff described above. `enableTreeLine` adds a
_soft_ falloff on top — density is multiplied by `1 - smoothstep(treeLineStartHeight,
treeLineEndHeight, terrainHeight)`, so trees thin out gradually over that elevation band rather than
vanishing at one exact Y value. It's on by default but tuned to this project's terrain amplitudes
(default mountain peaks reach roughly 55-90 world units, so the band starts at 55 and finishes at 85) — subtle enough that it only matters on genuine mountain summits, not everyday hills.

### Vegetation chunks and prioritized loading

`TreeManager` reuses the exact same generic `TerrainGenerationQueue` terrain uses (it was already
framework/domain-agnostic — just chunk coordinates and a revision number) — nearest-chunk-first,
budgeted by `treeChunksGeneratedPerFrame` per frame, with its own `treeViewDistanceChunks`
independent of terrain's `viewDistance`. Vegetation chunks align to terrain's `chunkSize` purely so
"which chunk is this cell's responsibility to load" has an unambiguous answer — see "crossing chunk
boundaries" above for why that alignment never leaks into tree placement itself.

### Instanced rendering

Three tree variants × two components (trunk, foliage) = six `THREE.InstancedMesh` objects total,
each with a fixed capacity — the _entire_ visible forest, however many thousand trees, costs six
draw calls, not thousands of individual `Mesh` objects. `InstancedTreeLayer` keeps each mesh's
active instances packed into `[0, mesh.count)` (a hard InstancedMesh requirement): removing an
instance from the middle swaps the _last_ active instance into its place — O(1), no shifting pass —
and reports which owner moved so `TreeManager` can update that specific tree's stored instance
index. A tree's trunk and foliage share one computed transform (position/yaw/uniform-scale); the
relative trunk-to-foliage offset is baked into each variant's base geometry instead, so placing a
tree is one matrix, not two.

### Foundations exclude trees

Before a candidate becomes a live instance, `TreeManager` checks
`foundationManager.getTopYAt(worldX, worldZ) !== null` — the same containment test
`WorldSurfaceSampler` already uses for player grounding. A covered candidate is simply skipped for
_this_ generation pass; the underlying deterministic forest map is never modified, so removing the
foundation later (not implemented yet, but the data model supports it) would let that tree reappear
on the next regeneration. `TreeManager.spec.ts` covers this directly: an identical dense-forest
setup produces trees with an empty `FoundationManager` and zero trees once a foundation covers the
whole chunk.

### Debug visualization

The existing terrain "Debug View" dropdown gained two entries rather than inventing a parallel
system: **Forest Density** (black -> green ramp of `getForestDensity`, ignoring terrain biome
entirely) and **Terrain + Forest** (the normal biome-colour blend, darkened toward forest-green
proportional to density) — the latter is what makes independence visually obvious, per above. The
**Vegetation > Debug** GUI folder adds `showTreeCells`/`showRejectedTreeCandidates` (a `THREE.Points`
overlay: green for accepted, red for slope-rejected, blue-ish for density-rejected candidates,
collected during generation and only when one of those flags is on) and `showTreeChunkBorders`
(applies instantly, since it just toggles existing outline visibility rather than needing
regeneration).

### Live regeneration, and why it doesn't touch terrain

Vegetation has its own `vegetationRevision`, bumped independently of terrain's `revision`. Changing
a forest/tree setting calls `TreeManager.notifySettingsChanged()` — regenerates visible vegetation
chunks, terrain untouched. The reverse mostly holds too, with one deliberate exception: since tree Y
and slope-rejection both read the _same_ `TerrainHeightSampler` vegetation never duplicates, a
terrain shape/seed/topology change also calls `TreeManager.notifyTerrainChanged()` so visible trees
stay planted on the ground you're currently looking at rather than floating over stale heights — a
development convenience the brief explicitly allows ("acceptable" to rebuild vegetation when terrain
geometry changes), not a hard coupling of the two systems' actual generation logic.

## Sky: HDRI lighting, a procedural sky dome, and layered cloud sheets

`src/lib/game/sky/` adds three independent, framework-free systems, all driven from one
`SkySettings` object (`SkyTypes.ts`) and one GUI folder (`TerrainDebugGui.addSkyFolder()`). None of
them touch terrain or vegetation generation — `ThreeScene` calls `applySkySettings()` from the sky
GUI's single `onChange` callback, never a dirty-flag/revision bump, since every sky/cloud/HDRI change
is a cheap uniform or scene-property update, not a regeneration.

- **`SkySystem.ts`** — the actual visible sky: one large sphere (`SKY_RADIUS = 1900`, inside the
  camera's `far = 2000`) rendered back-face-in with a `ShaderMaterial` gradient (horizon → mid → top,
  via nested `smoothstep`/`mix`), a warm horizon-haze blend below `horizonHeight`, and an optional
  additive sun glow/disc computed from the same sun direction the lighting uses. It's repositioned to
  the camera every frame (`update(cameraPosition)`), so it always reads as an infinite sky with no
  edge to reach.
- **`CloudSystem.ts`** — 2–3 large, mostly-flat planes (`PLANE_SIZE = 8000`, one `ShaderMaterial`
  each), not sprites or volumetrics. Alpha comes from three octaves of scrolling value noise
  (`macroCloudScale`/`breakupScale`/`wispyScale`, shaped through `edgeThreshold`/`edgeSoftness`) so
  large shapes dominate and only the biggest features read as "clouds" — the same "large shapes over
  everywhere-noise" lesson as the terrain biome mask. Each of the (fixed, non-GUI) 3 layer recipes
  gives that layer a different altitude/scale/opacity/speed/direction multiplier for cheap parallax.
  A radial fade hides each plane's own boundary, and every layer is recentred on the player's X/Z
  every frame (`update(deltaSeconds, settings, cameraX, cameraZ)`), so there is never a cloud "edge"
  to fly to no matter how far the player walks.
- **`HdriEnvironmentSystem.ts`** — loads an equirectangular HDRI purely for lighting/reflections
  (`scene.environment` via `THREE.PMREMGenerator`), **not** as the visible sky by default
  (`showHdriAsBackground: false`) — the visible sky is always `SkySystem`'s gradient dome unless you
  explicitly opt into showing the HDRI itself. This avoids "double clouds": if the HDRI has visible
  clouds baked into its panorama _and_ it were also shown as the background, they'd float behind (and
  disagree with) the procedural cloud layers.

### Sun, atmosphere, and fog

`sunElevation`/`sunAzimuth` (degrees) feed `atmosphereMath.ts`'s `sunDirectionFromAngles()` — one
pure, tested function shared by the sky shader's glow/disc, `ThreeScene`'s directional `sunLight`
positioning, and the hemisphere light's up-axis intensity. This is a static sun position, not a
day-night cycle — moving the sliders re-lights the scene instantly but nothing animates on its own.

Fog defaults to matching the sky's horizon color (`fogMatchHorizon: true`,
`atmosphereMath.ts`'s `resolveFogColor()`) so the horizon never shows a visible seam between "fog
color" and "sky color" — turn it off to pick an independent `fogColor`. `fogDensityMode` switches
between `THREE.Fog` (linear, `fogNear`/`fogFar`) and `THREE.FogExp2` (exponential, density derived
from `fogFar`).

### Infinite coverage

Both the sky dome and every cloud layer are repositioned to the camera's world position every frame
rather than living at a fixed world-space location — the same pattern the terrain/vegetation chunk
systems use "we always load around the player," applied to a single mesh instead of a chunk grid.
There's no view-distance boundary to configure because there's nothing to stream in: one dome mesh
and 2–3 cloud planes cover the entire visible sky from wherever the player currently is.

### Swapping in an HDRI

No `.hdr` ships with this project by default — `HdriEnvironmentSystem.initialize()` tries to fetch
`hdri/sky.hdr` (resolved from `document.baseURI`, so it works whether the app is served from `/` or
a subpath) and, if that fails for any reason (missing file, network error, bad format), catches it
and falls back to a tiny procedural canvas-gradient environment instead — `hdriEnabled: true` always
works out of the box, it just won't have real reflections until you add a file. To add one:

1. Download a **clear or lightly-clouded** equirectangular HDRI from
   [Poly Haven](https://polyhaven.com/hdris) (search "sky" — a mostly-clear noon/afternoon sky
   works best). Avoid heavily-clouded HDRIs — since `showHdriAsBackground` is off by default the
   clouds in the HDRI won't normally be visible, but if you _do_ turn that on, its clouds would
   otherwise visually compete with `CloudSystem`'s procedural layers.
2. Save it as `static/hdri/sky.hdr` in this project (create the `hdri/` folder — it doesn't exist
   yet).
3. Reload — `HdriEnvironmentSystem` picks it up automatically, no code change needed. You should see
   the fallback console message (`[sky] No HDRI found at "..."`) stop appearing.

### GUI controls added

One new top-level **Sky** folder, with five sub-folders matching `SkySettings`'s groups exactly:
**Sky** (dome gradient colors, horizon shape, sun disc), **HDRI** (`hdriEnabled`/`hdriIntensity`/
`hdriRotation`/`showHdriAsBackground`), **Sun & Atmosphere** (sun direction/color/intensity,
hemisphere fill, and all fog controls), **Clouds** (coverage, softness, opacity, per-layer speed and
direction, the three noise-octave scales), and **Debug** (`showCloudBounds`,
`showCloudLayerWireframe`, `showSkyOnly` — hides terrain/trees/foundations to inspect the sky/clouds
in isolation).

### Defaults chosen

A bright, calm daytime look: a mid-blue upper sky fading through pale blue to a warm, hazy horizon,
a soft mid-elevation sun (45°) with warm-white light, gentle far-off fog that matches the horizon
color, and two cloud layers at moderate coverage (`0.45`) and fairly high softness — few hard edges,
slow independent drift per layer, no storm-like density or fast movement.

## Testing

```sh
npm run test:unit   # Vitest — terrain determinism/seams, biome regions, vegetation, foundation math, grid snapping, click routing, sky/atmosphere math
npm run test:e2e    # Playwright — canvas renders, hotbar + Foundation slot exist, sky + its GUI sections render, no errors
npm run test        # both
```

## Commands

```sh
npm run dev      # start the dev server
npm run build    # production build (static, via adapter-static)
npm run preview  # preview the production build
npm run check    # svelte-check
npm run lint     # prettier --check + eslint
npm run format   # prettier --write
```
