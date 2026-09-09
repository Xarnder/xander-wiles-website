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
- `P`, or the paint icon beside the hotbar — toggle Paint Mode, another global overlay, mutually
  exclusive with Remove Mode (see "Paint Tool"); while active, `C` opens the colour palette and left
  click paints the highlighted wall, wall segment, slab, or foundation with the selected colour;
  `P` / right click / `Esc` exits back to whichever tool was selected before
- `C` — cycle the draw-snap mode (Off → Axis → Axis + Inline → Wall Corners) on Wall, Continuous
  Wall, Ceiling, Floor and Roof — see "Draw-snap: axis, inline and wall-corner alignment" below
  (while Paint Mode is active, `C` instead opens the colour palette — see "Paint Tool")
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

`SlabType = 'ceiling' | 'floor' | 'flat-roof'` — `'flat-roof'` is now a LOAD-ONLY legacy member (see
the "Roofs" section below for the pitched-roof system that replaced it on the hotbar); all three are
exactly the same underlying
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

The Ceiling and Floor tools are two thin `SlabToolBase` configurations (label, slab type, default
thickness setting) — one shared implementation for the click-to-add-a-point,
click-first-point-to-close polygon interaction (always closed; there's no "open slab" concept,
unlike a wall path), live stepped preview, and per-tool HUD. Roof used to be a third `SlabToolBase`
configuration (`'flat-roof'`) but is now its own, considerably larger multi-type system — see
"Roofs" below — that happens to reuse this exact same polygon-drawing interaction as its first
phase, rather than extending `SlabToolBase` itself (a pitched roof needs a whole extra modal phase
`SlabToolBase` has no concept of).

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
cancels back to idle. Interior stairs use the same level-aware construction-plane targeting as
every other storey-aware tool, with `baseY` frozen from the current level at first-corner time.
Approach stairs (a flight up onto the pad from the ground) can also be aimed at terrain beside
the foundation: the rectangle snaps flush to the nearest pad edge, sits fully outside it, and
uses a typically-negative `baseY` sampled from terrain so the top landing meets the foundation
surface. Green preview means the run length matches that height difference — the same
"1 cell of run = 1 cell of rise" rule, never an automatic resize.

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
tool exists yet. `addStair` calls `findCeilingSlabForStair`, which considers every slab on the same
foundation whose footprint overlaps the stair's, is strictly ABOVE the stair's own base (never the
floor the stair stands on), and whose underside the stair's solid mass actually reaches
(`BuildingManager.stairReachesSlab`, see the bugfix below) — and opens ONLY the nearest such slab,
never a farther one the stair would also technically intersect; `addSlab` does the mirror check
(`autoOpenStairsIntoSlab`) against every existing stair on that foundation, additionally moving the
opening (and removing the stale one) if the newly placed slab turns out to be nearer than whichever
slab currently owns it. The opening is simply the stair's own full footprint — a deliberately
"slightly oversized rather than too small" v1 choice (per the spec) that also automatically
guarantees head clearance the whole way up, since nothing above the stair's own footprint is ever
solid.

**Bugfix: a stair punched a hole in every slab it was "at or below," including the floor it stood on
and any slab stacked above the one it actually reached.** `stairReachesSlab`'s "does the stair's
solid mass reach this slab's underside" check has no upper bound by design (see the section above),
but the original `openSlabForStair`/`autoOpenStairsIntoSlab` never paired it with a LOWER bound
either, and looped over and opened every slab that matched rather than picking the nearest one. In
practice this meant: (1) the ground-floor slab a stair stood ON received a hole too, since its
underside is trivially "at or below" the stair's top; and (2) if more than one slab was stacked above
the level the stair actually reaches (a second- and third-floor ceiling, say), every one of them got
opened, not just the ceiling directly above. Fixed with `findCeilingSlabForStair`, which adds the
missing `slabBottomY(slab) > stair.baseY` lower bound (excluding the stair's own floor) and returns
only the single nearest qualifying slab rather than looping over all of them; `autoOpenStairsIntoSlab`
now also removes a stair's stale opening on a previously-nearest slab if a newer, nearer slab is
placed afterward, via the new `sourceStairId`-scoped `removeStairOpeningsExcept`.
`BuildingManager.spec.ts` covers all three cases: no hole in the slab the stair stands on, only the
nearest of two reachable stacked slabs gets opened, and placing a nearer slab after a farther one
already has the opening moves it.

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
adds `addStair` validation (long-axis direction, min width/run, interior vs edge-attached
approach placement, missing foundation, upper-level `baseY`) and the bidirectional auto-opening behavior: slab-then-stair,
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

## Roofs: nine procedural pitched roof types over one polygon-drawing workflow (`RoofTypes.ts`, `roofMath.ts`, `RoofGeometryBuilder.ts`, `RoofManager.ts`, `RoofTool.ts`)

The original Roof Tool was just Ceiling/Floor's flat-slab workflow relabelled (see the "Roofs" note
in the Slabs section above). This replaces it on the hotbar with a real pitched-roof system —
`flat | shed | gable | hip | gambrel | mansard | butterfly | m-shaped | dutch-gable` — while
deliberately keeping the exact same footprint-drawing interaction the flat version (and every slab
tool) already used: draw a closed polygon, click the first point to close it. What changes is what
happens next.

### Data model: a logical definition, never generated vertices (`RoofTypes.ts`)

`RoofDefinition` stores only what can't be derived — `{id, foundationId, levelIndex, points, baseY,
type, direction, shedDirection, rise, thickness, overhang, profileSettings, material?}` — the exact
same "logical world, not rendered world" rule every other building type (and the world-save system
itself) already follows. `points` is the flat eave-line footprint polygon, in the same
foundation-local building-grid integers every other building type uses; `baseY` is the eave
elevation, matching the top of the level's walls at creation time exactly like a slab's `localY`.
`rise` (metres, vertical) is authoritative; pitch (the angle) is always DERIVED from it plus the
footprint's own span (`roofMath.pitchDegrees`), never stored — the same reasoning `StairDefinition`
stores footprint length rather than a typed-in height. `direction: 'x' | 'z'` says which axis the
ridge (or valley, for butterfly) runs along; `shedDirection` is `shed`'s separate four-state "which
edge is high" field, since a shed has no ridge at all.

`RoofProfileSettings` (the gambrel/mansard/dutch-gable/m-shaped shape-defining fractions) is frozen
into the roof from the live `BuildingSettings` defaults at CREATION time, never re-read later — the
same "world-defining settings snapshotted into the definition" rule `WorldEnvironmentDefinition`
already follows for terrain/vegetation/sky: retuning the GUI's defaults later must never reshape an
already-built roof.

### Geometry, expressed once in (u, v), never once per orientation (`roofMath.ts`)

Every pitched type is built from an axis-aligned rectangle (`axisAlignedRectangleOf` — exactly 4
points, every edge axis-parallel; returns `null` for anything else, including an off-axis rectangle,
a triangle, or an L-shape) in a local `(u, v)` frame: `u` runs along the ridge (or, for `shed`, along
the high/low edge), `v` runs across the span the roof climbs over. `direction: 'x'` maps `u→x, v→z`;
`direction: 'z'` maps `u→z, v→x`. Writing each type's slope maths once in `(u, v)` and mapping to
world axes only at the very end is what lets `R` "rotate" a roof by 90° for free — every face-builder
takes the same numbers regardless of orientation; only the frame changes.

- **`shed`** — one full-span slope from the low edge to the high edge.
- **`gable`** — two slopes meeting at a full-length ridge; **`butterfly`** is the identical shape
  with the eave/ridge Y roles swapped (a valley instead of a ridge).
- **`hip`** — rises from all four eave edges to a real ridge (or, for a square footprint, a single
  peak point — the pyramid case degenerates safely rather than needing a special case). Its ridge
  axis is always the footprint's LONGER dimension (`hipRidgeDirection`) — `R` has no effect on it.
- **`gambrel`** — a symmetric two-pitch gable: a steep lower slope to a break, then a shallow upper
  slope to the ridge, both sides.
- **`m-shaped`** — two gables side by side sharing a central valley (four full-span slopes).
- **`mansard`** — a steep hip frustum (`buildHipFrustumFaces`, a uniform inset on all four sides —
  genuinely different from `hip`'s converging ridge line, since it stops at a real, still-rectangular
  inner platform) topped by a shallower true hip rising to a real peak. Like `hip`, this is fully
  footprint-derived (both the frustum and its hip cap ignore `direction` entirely) — `R` has no
  effect on it either.
- **`dutch-gable`** — the same hip frustum, but topped by a full-length GABLE cap instead of another
  hip — so, unlike `mansard`, it DOES have a real, user-chosen ridge direction (an earlier version of
  this roof ignored the stored `direction` and re-derived the cap's orientation from the footprint
  the same way `hip`/`mansard` do — fixed so `R` actually rotates the visible cap; see
  `roofTypeHasOrientationControl`'s doc comment).

`roofTypeHasSlope`/`roofTypeHasOrientationControl` are the single source of truth for which keys do
anything for a given type — `'flat'` has neither; `'hip'` and `'mansard'` have slope but no
orientation control (both are fully footprint-derived); every other pitched type has both.

### Solid geometry, sharp ridges, and a watertight underside (`RoofGeometryBuilder.ts`)

`buildRoofGeometry(roof, buildingGridSize)` is the one place a `RoofDefinition` becomes a mesh —
nothing about it is persisted; loading a world calls straight back into this function, exactly like
`SlabGeometryBuilder.buildSlabGeometry` for slabs. `'flat'` is handled separately by delegating to
`buildSlabGeometry` directly (it supports an arbitrary simple polygon, not just a rectangle); every
other type requires `axisAlignedRectangleOf` to succeed first, or this throws `RoofFootprintError`
("`Gable roof requires a compatible footprint`"-style messages) rather than ever building corrupt
geometry — `RoofTool`'s live preview and `RoofManager.addRoof` both turn this into the same rejection
rather than a crash.

Each `RoofFace` (a planar, convex list of points plus a per-edge `fasciaEdges` flag marking a true
outer boundary vs. an internal ridge/hip/valley edge shared with a neighbour) becomes: a fan-
triangulated TOP skin, wound so its normal points up (`ensureUpwardWinding`, a Newell-normal check —
every real face here is a "roof skin," never something that should face down); a BOTTOM skin reusing
the SAME (now-corrected) point order, offset down by `thickness` and reversed; and a vertical FASCIA
quad per edge flagged `true`. Vertices are deliberately NOT deduplicated across faces even where two
faces share an edge exactly (positions coincide, so there's no visible gap) — each face gets its own,
independently-computed flat normal, which is what keeps a ridge or hip line looking like a sharp
architectural edge instead of being smoothed across by shared vertex normals. A cheap planar
(world-ish XZ) UV is written for every vertex — not textured today, but real coordinates rather than
an empty attribute, so a future roof material has something usable to sample without this geometry
needing to be rebuilt from scratch.

### Placement: draw, then adjust, then confirm (`RoofTool.ts`)

`RoofToolState = 'idle' | 'drawing' | 'adjusting'`. The first two phases are the identical
polygon-drawing interaction every slab tool already uses (same draw-snap cycling via `C`, the same
building-grid overlay, Backspace to undo a point, right-click to cancel) — closing the loop (clicking
the first point with ≥3 points) freezes the footprint and enters `'adjusting'` instead of confirming
immediately. From there:

- **`V`** cycles `ROOF_TYPE_ORDER`, wrapping.
- **`R`** rotates — toggles `direction` between X/Z axis for most types, cycles `shedDirection`
  through all four compass directions for `shed`, and is a no-op for `flat`/`hip`/`mansard` (see
  above).
- **`↑` / `↓`** adjust `rise` by `roofRiseStep` (Shift for the finer `roofRiseFineStep`), clamped to
  never go negative; a no-op for `'flat'` (`roofTypeHasSlope`).

A second click confirms (`BuildingManager.addRoof`, recorded on the undo stack); right-click cancels
the WHOLE placement back to `'idle'` — mirroring `StairTool`'s own `'choosing-direction'` phase rather
than stepping back to `'drawing'`, the same "a modal adjustment step is all-or-nothing" convention
already established there. The live preview while adjusting is built from the exact same
`buildRoofGeometry` call the real placement uses, so what's shown is always what will actually be
placed — never a simplified stand-in. The HUD shows the current type, rise, a live-computed pitch in
degrees, and the ridge/high-edge orientation (or "auto (long axis)" for the footprint-derived types),
plus the type/rise entering `'adjusting'` always starts from `defaultRoofType`/`roofRiseStep` — the
settings fields double as both the starting point for a new roof and the ↑/↓ increment, never
retroactively applied to an already-placed one.

Entering `'adjusting'` on an incompatible (non-rectangular) footprint simply means every pitched type
shows "requires a compatible footprint" until `V` cycles back to `'flat'` — there is no separate
"fix the polygon" step; the footprint was already frozen when the loop closed.

### Sloped-surface collision, without touching `WorldSurfaceSampler`'s contract (`RoofManager.ts`)

A roof's top/underside is NOT a constant Y across its footprint, unlike a slab — the one genuinely
new collision problem this system introduces. Rather than changing what `WorldSurfaceSampler` itself
does, `RoofManager` caches every placed roof's world-space `RoofFace` list (or, for `'flat'`, the
same constant-Y pair a slab uses) and exposes `getTopSurfacesAt`/`getUndersidesAt` with the EXACT SAME
shape `SlabManager`'s own methods already have: given a world `(x, z)`, find which face's 2D
projection contains the point (`pointInPolygon2D`, reused from `slabMath.ts`) and evaluate that face's
own plane equation for the real Y there. `WorldSurfaceSampler.getSupportingSurfaceY`/
`getCeilingBlockY` fold these in with one extra loop each, identical in shape to the existing slab
loop — a player can stand on (and bump their head against the underside of) a pitched roof exactly
like a flat one, at the correct sloped height rather than the roof's highest point everywhere.

### Remove/Paint Mode and world-save integration

A placed roof is removable (`'roof'` `RemovalTarget`, dispatched to `BuildingManager.removeRoof`) and
paintable (`'roof'` `PaintTarget`, reusing the `'slab-roof'` `MaterialKind` — a pitched roof gets the
exact same CSM shadow registration and cached-material behaviour a flat roof/ceiling/floor already
had, for free) — see the Remove Mode and Paint Tool sections below, both updated to include it.
`FoundationBuildingDefinition.roofs: RoofDefinition[]` sits alongside `walls`/`wallPaths`/`slabs`/
`stairs` (defaulting to `[]` for older saves); `BuildingManager.serialize()`/`.load()` round-trip it
exactly like every other building type, and `WorldValidation.validateRoof` gives imported roof data
the same untrusted-input treatment (unknown type/direction/shedDirection rejected, size-capped
points/roofs-per-foundation, finite-number checks on every numeric field) every other imported
building type already gets.

### GUI and settings

**Building > Roofs**: `defaultRoofType`, `roofDeckThickness` (a NEW, separate field from the legacy
`roofThickness` the old flat-roof-as-slab path still uses — kept apart so a world saved before this
system still reproduces its old flat roofs unchanged), `roofRiseStep`, `roofRiseFineStep`,
`roofOverhang`, `roofPreviewOpacity`, the five profile fractions (`gambrelLowerSlopeFraction`,
`gambrelBreakHeightFraction`, `mansardBreakFraction`, `dutchGableHipFraction`,
`mShapedValleyFraction`), and `showRoofBounds`/`showRoofPlanes`/`showRoofRidge`/`showRoofNormals`
(the latter three reserved for a future debug-visualisation pass; only `showRoofBounds` is currently
wired to anything).

### Tests

`roofMath.spec.ts` (26 tests): the axis-aligned-rectangle detector (including rejecting an off-axis
rectangle and a non-rectangular quad); pitch/rise math; per-type face generation for all nine types,
including the square-footprint hip "pyramid" degenerate case and the mansard/dutch-gable
break-rectangle handoff (no gap between the lower frustum and upper cap); the shed-direction axis
mapping regression (see below); and `roofTypeHasOrientationControl`'s exact true/false set for every
type, including the dutch-gable ridge-direction regression. `RoofGeometryBuilder.spec.ts` (15 tests)
verifies the built solid directly: watertightness (triangle count is a multiple of 3, correctly
accounting for `'flat'`'s indexed geometry), every triangle's real geometric normal (not just the
smoothed attribute) faces outward/upward, sharp (non-shared) normals at a ridge, and the
`RoofFootprintError` rejection path for every incompatible type/footprint combination.
`RoofManager.spec.ts` (9 tests) covers add/remove/serialize round-trips, the footprint-compatibility
rejection, and `getTopSurfacesAt`/`getUndersidesAt` returning the exact eave and ridge heights for a
known gable. `WorldValidation.spec.ts` adds an unknown-roof-type rejection and an absurd
roofs-per-foundation count guard. `tests/game.e2e.ts` confirms the Roof hotbar slot (6) and its GUI
folder render with no console errors.

**Bugfix: `shed`'s high/low edge was mapped to the wrong axis.** `buildShedFaces` initially computed
`axis = shedDirection is +x/-x ? 'x' : 'z'` — backwards. A shed's high/low edges vary ALONG the axis
named in `shedDirection`, which means the frame's `v` (the varying coordinate) must map to THAT axis
— per the `(u, v)` convention above, that requires the OPPOSITE `direction` value. Two failing tests
(all four corners on the expected plane; reversing `shedDirection` swaps which edge is high) caught
this before it shipped.

**Bugfix: a square-footprint hip roof was missing two of its four faces.** An early version guarded
the two long ("north"/"south") trapezoid faces behind `if (ridgeUMax - ridgeUMin > EPSILON)`, meant
to skip a supposedly-zero-area face once the ridge shrinks to a point on a square footprint — but the
"trapezoid" doesn't have zero AREA in that case, only one zero-length edge (a valid degenerate quad),
so the guard silently produced two open holes in the roof for any square/near-square footprint. Fixed
by pushing both faces unconditionally; the geometry builder's fan-triangulation turns the degenerate
case into one real triangle plus one harmless zero-area one.

**Bugfix: `dutch-gable`'s upper cap ignored the player's chosen ridge direction.** Unlike `mansard`
(genuinely footprint-derived — the geometry is identical either way, since both the frustum and its
hip cap are direction-invariant), `dutch-gable`'s upper section is a real gable with a real ridge
direction, but `buildDutchGableFaces` originally called `hipRidgeDirection(rect)` internally instead
of accepting the roof's own `direction` field — so `R` had no visible effect at all. Fixed by
threading `direction` through as a real parameter; `roofTypeHasOrientationControl` was also corrected
to return `false` for `mansard` specifically (it previously claimed `R` did something for every
non-hip pitched type, which wasn't true for mansard) while confirming `dutch-gable` genuinely does
rotate.

### Not implemented yet

Dormers, skylights, chimneys, gutters/downpipes, roof windows, decorative fascia/trim, tile/shingle
textures, snow accumulation, drainage simulation, structural support rules, arbitrary (non-rectangle)
footprints for any pitched type, and a straight-skeleton solver for non-rectangular hip-family roofs.
The legacy flat-roof-as-slab path (`SlabType: 'flat-roof'`) is intentionally left in place, unreachable
from the hotbar but still fully functional for any world saved before this system existed.

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
staircases (with their owned upper-floor slab opening restored), and pitched roofs (see the "Roofs"
section above — the first "remove a slab-like solid" case in the codebase, with no
`removeSlab`/floor/ceiling equivalent yet). Floors/ceilings (the flat-slab kind), whole wall paths,
and foundations are still deliberately not wired up — `RemovalTarget`
(`RemovalTypes.ts`) is a plain `{type, ...ids}` discriminated union specifically so adding one of
those later is a new case in a handful of `switch` statements, not a redesign; a foundation in
particular already has its own cascade primitive (`BuildingManager.removeBuildingForFoundation`,
built for the level system) but no deletion UI at all, and no "what happens to a full 5-deep undo
stack when a foundation it referenced just vanished" answer yet — better solved once foundation
deletion is actually designed than bolted on here.

### Targeting: a logical RemovalTarget, never a raw mesh

`RemoveTool.update()` raycasts every frame against four pools of geometry — standalone wall
meshes + wall-path segment picking meshes (`BuildingManager.getRaycastableWallMeshes`, already used
by Window/Door), every stair's real mesh (`getRaycastableStairMeshes`), every roof's real mesh
(`getRaycastableRoofMeshes`), and this tool's own OpeningPickingProxy meshes (below) — and resolves
the nearest hit's `object.userData` into a
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

## Paint Tool: a building material system, not a colour-only hack (`PaintTool.ts`, `BuildingMaterialManager.ts`, `MaterialTypes.ts`, `PaintTypes.ts`, `MaterialPresetStore.ts`)

Pressing `P` toggles Paint Mode — a third temporary GLOBAL overlay alongside Remove Mode (`X`),
using the exact same mechanism (see BuildToolManager's class doc comment): entering it cancels any
unfinished multi-click construction and suspends the active tool's own preview/HUD, and exiting
restores whatever hotbar slot was selected before, in its normal idle state. `HotbarUiState.globalMode`
is a single `'none' | 'remove' | 'paint'` field rather than two independent booleans, specifically so
"both active at once" is structurally impossible rather than merely avoided by convention — pressing
`P` while Remove Mode is active exits it and enters Paint Mode, and vice versa for `X`.

### The core design requirement: a material system, not a colour system

The spec for this feature was explicit that today's "solid colour only" implementation must not
become tomorrow's rewrite when textures arrive. `BuildingMaterialDefinition` (`MaterialTypes.ts`) is
a union with exactly one member today —

```ts
export type BuildingMaterialDefinition = { type: 'color'; color: string };
```

— never a bare `{color: string}` shape. Every wall/segment/slab/foundation stores this (or
`undefined`) as its own `material` field; a future `{type: 'texture', textureId, scale, rotation}`
variant is a new case added to this union, to the `switch` in `BuildingMaterialManager`, and to
`MaterialPalette.svelte`'s swatch grid — never a redesign of where paint state lives or how it's
applied. `MaterialPreset` (`{id, name, definition}`) is the other half of this: today's default
palette and saved colours are already "lightweight material presets" in exactly the shape a future
texture preset (with a thumbnail instead of a flat colour) would also take.

### Paint targeting: a logical PaintTarget, never a raw mesh

`PaintTarget` (`PaintTypes.ts`) mirrors `RemovalTarget` exactly — `resolvePaintTarget` is a small
pure function (unit-tested without Three.js) that turns a raycast hit's `userData` into one of
`'wall' | 'wall-segment' | 'slab' | 'roof' | 'foundation'`. `PaintTool.update()` raycasts against the
SAME standalone-wall and wall-path-segment picking meshes Remove Mode already uses, plus every slab,
roof, and foundation mesh — never terrain, trees, window/door openings, or stairs (none of those are
paintable in this version). A roof reuses the exact same `'slab-roof'` `MaterialKind` a flat-roof
slab already used — one shared look, no new cache dimension needed. A wall-path SEGMENT is targeted
individually, exactly like
Window/Door/Remove Mode already do — painting one segment never recolours its neighbours (see
below for how the merged mesh makes this possible).

### The live preview: swap to the REAL target material, not an approximation

Hovering a valid target temporarily swaps its actual mesh's `.material` to whichever cached material
`BuildingMaterialManager` would really apply if you clicked — a genuine, byte-identical preview, not
a tinted stand-in — plus a thin cyan outline (`EdgesGeometry`, the same technique Remove Mode's own
highlight uses) so the target is unambiguous even before the colour registers. Both are restored the
instant the hover target changes (`PaintTool.clearHighlight`), and — critically — NEITHER is
"restored" after an actual paint click: by the time `BuildingManager.paintX()` returns, the owning
manager (`WallManager`/`WallPathManager`/`SlabManager`/`FoundationManager`) has already rebuilt the
mesh with its real new material, so `discardHighlightTracking()` just drops the stale tracking
instead of clobbering that fresh state — the exact same "don't restore after a successful mutation"
rule Remove Mode's own `discardHighlightTracking` already established.

A wall-path SEGMENT can't use a single-material swap or a clean outline (its merged geometry has no
per-segment boundary an `EdgesGeometry` could isolate) — instead, `PaintTool` resolves the segment's
own material-array GROUP indices (`WallPathManager.getVisibleMeshAndGroupIndices`) and replaces only
those entries in a cloned `THREE.Material[]`, leaving every sibling segment's own array slot
untouched. The colour swap alone is still an unambiguous "this is the target" signal.

### Material caching (`BuildingMaterialManager.ts`)

Every wall/foundation/slab manager used to build its own mesh against ONE shared module-level
`MeshStandardMaterial` constant, applied unconditionally to every instance. `BuildingMaterialManager`
replaces that with a cache keyed by `(surface kind, logical definition)` — `getMaterial('wall',
undefined)` always returns the exact same unpainted-look material every unpainted wall already
shared; `getMaterial('wall', {type:'color', color:'#3E6FA6'})` returns one shared instance for every
wall painted that exact colour, however many there are. Each of the four `MaterialKind`s
(`'wall' | 'foundation' | 'slab-floor' | 'slab-roof'`) keeps its OWN default look (roughness/
metalness/flatShading/foundation's `polygonOffset`) — extracted unchanged from each manager's former
constant — so an unpainted object renders byte-identical to before this system existed. Colours are
normalized to uppercase `#RRGGBB` (`normalizeColorHex`) before ever being used as a cache key, so
`#d9d1c3` and `#D9D1C3` share one material instance rather than silently allocating two. Nothing
returned by `getMaterial()` is ever mutated in place — PaintTool's preview swap is a pure reference
reassignment (see above), never a `.color.set(...)` on a shared instance.

### Default material inheritance

`material?: BuildingMaterialDefinition` is optional on `WallDefinition`, `WallPathSegmentDefinition`,
`SlabDefinition`, and `FoundationDefinition` — `undefined` means "use this object's own normal
default look," not "authored to look however it currently happens to." An existing building's every
wall/slab/foundation loads with `material` absent and renders exactly as before Paint Tool existed;
nothing is migrated or backfilled. Painting sets an explicit override; selecting **Default** in the
palette doesn't try to remember/restore some original colour — it just deletes the field again
(`BuildingManager.paintX(id, undefined)`), which is a cleaner and more honest inheritance mechanism
than round-tripping a remembered RGB value.

### Removing colour-hardcoding from the render managers

`WallManager`/`WallPathManager`/`SlabManager`/`FoundationManager` (via `FoundationMesh`) all take an
OPTIONAL `materialManager: BuildingMaterialManager` constructor option now — optional specifically so
the many existing tests exercising these classes for placement/collision/geometry math don't need to
construct one; each falls back to a private instance of its own when omitted, which is functionally
fine since a test never compares materials across separate manager instances. `ThreeScene` always
constructs and shares ONE real `BuildingMaterialManager` across every manager, so the cache is
actually shared in the running game — painting a wall and a slab the same colour reuses one material,
not two.

### Painting a Continuous Wall segment without recolouring the whole path

`WallPathGeometryBuilder.buildWallPath` already merged every segment's pieces (a middle span plus up
to two join caps) into ONE geometry via `BufferGeometryUtils.mergeGeometries`. It now merges with
`useGroups: true` and returns `groupSegmentIds: string[]` — which segment owns group index `i`, in
the same order the input pieces were merged — so `WallPathManager.rebuildEntry` can build a matching
`THREE.Material[]` (one cached material per segment, repeated across however many groups that
segment contributed) and assign it as the merged mesh's own `.material`. `BuildingManager.paintWallSegment`
mutates the target segment's own `material` field directly (the same "mutate the stored definition,
call the manager's own rebuild" pattern `addOpening`/`removeOpening` already use) and calls
`WallPathManager.rebuildPath`, which regenerates the whole merged mesh — but every OTHER segment's
own `material` field is untouched, so its group(s) resolve to the exact same cached material as
before. Painting one segment of a room's four walls never touches the other three.

A related bug surfaced writing this: `WallPathManager.getSegmentAsWallView` — the function that lets
`BuildingManager.getWall()` treat a path segment exactly like a standalone wall — synthesized a
`WallDefinition`-shaped view from the segment's own fields but forgot to copy `material` across, so a
painted segment read back as unpainted through that unified accessor even though the paint itself had
applied correctly. Fixed by adding the missing field; caught by
`WallPathManager.spec.ts`'s "getSegmentAsWallView surfaces the segment's own material" regression
test.

### Preserving openings, geometry, and collision

Painting a wall or slab calls the exact same `rebuildWall`/`rebuildPath`/`buildEntry` code path
adding an opening or removing one already goes through — the only thing that changes between "cut a
window" and "change the colour" is which field of the definition was mutated before the rebuild.
Openings, collision rects, and geometry are all regenerated from the SAME authoritative
`WallDefinition`/`WallPathSegmentDefinition`/`SlabDefinition` fields every other rebuild reads —
nothing about painting a wall can lose a window, and nothing about painting a foundation can move
it, resize it, or change its terrain intersection (`paintFoundation` only ever calls
`FoundationManager.setMaterial`, which reassigns `entry.mesh.material` and copies `material` onto a
new `FoundationDefinition` object — `topY`/`bottomY`/the grid footprint are never touched).

### Palette UX (`MaterialPalette.svelte`)

`C` opens the colour palette while Paint Mode is active (PaintTool owns this key itself, exactly like
`WallTool`/`SlabToolBase` own their own snap-mode `C` handling) and calls
`document.exitPointerLock()` so the OS cursor reappears — the same direct browser API call
`FirstPersonController`'s own Escape handling already uses. `PaintTool.onPrimaryAction()` refuses to
paint while the palette is open, and the palette panel's own root `stopPropagation`s its clicks so
clicking it can never reach the full-screen backdrop's "click outside to close" handler underneath
it — clicking a preset/saved/Default swatch both selects it AND closes the palette (a fast
"pick-and-go" action); the custom colour picker deliberately stays open on every drag, since it's a
more deliberate multi-step interaction and the Save Colour button needs to still be reachable
afterward.

The palette's own layout (`Default` / `Neutrals` / `Warm` / `Cool` / `Accent` / `Custom Colour` /
`Saved Colours`) is deliberately generic — "Materials" the section title, "Colours" the only
populated category — so a future `Textures` section slots in as a sibling without any markup
rewrite; nothing assumes a swatch can only ever be a flat CSS colour. `BuildUiState.paintColor`
(a plain `#RRGGBB` or `undefined` for "Default") is a dedicated typed field, not a magic string
inside `hintLines` — `+page.svelte` renders it as a real coloured `<span>` next to "Current Colour:"
in the corner HUD, the same pattern `notice`/`snapMode`/`level` already established for anything
needing more than plain text.

### Saved colours and last-selected persistence (`MaterialPresetStore.ts`)

Saved colour presets and the most recently selected paint colour are `localStorage`-backed UI
preference data — deliberately NOT part of the authoritative building-state serialization
`BuildingManager`/`ThreeScene` handle, since they describe the player's own editing preferences, not
multiplayer building data. Saving the same colour twice is a no-op returning the existing preset
(normalized-colour equality), so the Saved Colours list never accumulates visual duplicates. All
reads/writes are wrapped in `try`/`catch` and guarded by `typeof localStorage === 'undefined'` (true
in this project's own Vitest suite, which runs in vitest's `node` environment with no `localStorage`
global at all) — a missing/throwing/corrupted store degrades to an in-memory-only session rather than
crashing Paint Mode; a malformed saved-presets array has its bad entries filtered out individually
rather than discarding the whole list.

### Tests

`MaterialTypes.spec.ts` covers `normalizeColorHex` (uppercasing, 3-digit shorthand expansion,
rejecting malformed input) and the default palette's own internal consistency (every preset colour
pre-normalized, every id unique). `PaintTypes.spec.ts` covers `resolvePaintTarget`'s priority
(slab > wall-segment > wall > foundation) exactly like RemovalTypes.spec.ts covers its own resolver,
entirely without Three.js. `BuildingMaterialManager.spec.ts` covers caching (same colour ⇒ same
instance, different kind ⇒ different instance even for the same colour, `dispose()` clearing the
cache). `MaterialPresetStore.spec.ts` covers save/remove/persist-across-reload for both saved
presets and the last-selected colour, plus resilience against corrupted/missing `localStorage`.
`BuildingManager.spec.ts` covers `paintWall`/`paintWallSegment`/`paintSlab`/`paintFoundation`:
mesh material actually changes; a wall's openings and a path's collision rects are byte-identical
before and after painting; painting one segment never touches its sibling's own material; resetting
to Default clears the override; a foundation's footprint/height/collision are unaffected; and a full
serialize → paint → serialize → reload round trip retains every painted colour.
`WallPathManager.spec.ts` covers the per-segment material GROUP mechanism directly (disjoint group
indices, distinct cached materials per segment) plus the `getSegmentAsWallView` regression above.
`game.e2e.ts` confirms `P` shows a `PAINT` HUD and toggles the hotbar paint icon, restores the
previous tool and its own HUD on exit, that Remove Mode and Paint Mode are mutually exclusive
(pressing one while the other is active switches straight over), that `C` opens the palette without
exiting Paint Mode, and that picking a swatch updates the HUD's colour indicator.

### Not implemented yet

Image/tileable textures (the union has room to grow — see "The core design requirement" above — but
the texture branch itself is deliberately not built yet); per-face painting (inside/outside wall
face, wall top/edges, slab top/bottom face); painting stairs, windows, or doors; painting an entire
wall path in one click rather than segment-by-segment; a confirmation step for painting (not needed
for the current per-element painting — hover-preview-plus-click is the whole confirmation, same
reasoning Remove Mode's own "Not implemented yet" section gives); and any undo-stack integration
(painting doesn't currently push onto `BuildUndoManager`'s stack — reversing a paint would need to
remember the PREVIOUS material, not just the object's id, which that stack's `{type, id}` shape
doesn't carry today; a natural, but separate, future extension, same gap Remove Mode already has).

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

## Graphics quality: presets, cascaded shadows, GTAO, and postprocessing (`graphics/GraphicsTypes.ts`, `graphics/GraphicsPipeline.ts`, `graphics/GraphicsSettingsStore.ts`)

Press **`L`** to cycle graphics quality LOW → MEDIUM → HIGH → ULTRA → LOW — live, with no reload,
no world/seed/building reset, and no player-position change. A small "Graphics: HIGH"-style HUD
notification fades in/out over ~2 seconds, and the chosen level persists in `localStorage`
(`GraphicsSettingsStore`, mirroring `MaterialPresetStore`'s safe-storage pattern) so a reload keeps
it. `L` is ignored while the player is typing into a focusable control (the paint palette's colour
picker is the one that exists today) via the same `isTypingTarget` guard `+page.svelte` uses.

### One preset table, not scattered `if (quality === 'high')` checks

`GraphicsTypes.ts` defines `GraphicsQuality` (`'low'|'medium'|'high'|'ultra'`) and a `GRAPHICS_PRESETS`
table of `GraphicsPreset` objects — pixel ratio cap, shadow cascade count/resolution/distance, AO
quality/radius/intensity, anti-aliasing mode, bloom parameters, terrain/tree render-distance
multipliers, and the dynamic-resolution floor. `GraphicsPipeline` is the ONLY place that reads this
table; every other system either doesn't know quality exists (terrain/tree managers just get told
"your view distance is now N") or is handed a finished value (a material to register, a render size
to use). `GraphicsSettings` (mutable, not the preset table) holds the current `quality` plus a
handful of independent advanced knobs (`dynamicResolutionEnabled`, `targetFps`, `toneMappingExposure`,
`showRenderStats`) exposed in the debug GUI's new "Graphics" folder.

HIGH is the default — a deliberate choice per the brief's instruction not to aggressively
user-agent-sniff; a player on weaker hardware drops a level with one `L` press, remembered from then
on.

### Cascaded shadow maps (CSM) fully replace the plain sun light while shadows are on

Three.js's own `CSM` addon (`three/examples/jsm/csm/CSM.js`) creates 0/2/3/4 `DirectionalLight`s
(LOW/MEDIUM/HIGH/ULTRA) each covering one depth slice of the view frustum, with independently
configurable shadow-map resolution per cascade — `GraphicsPipeline` overrides CSM's own
uniform-resolution default so the near cascade (carrying almost all visible shadow detail) gets the
highest resolution (e.g. 2048 for the nearest of ULTRA's four, 1024 for the farthest two).

CSM's shader injection is global (`ShaderChunk.lights_fragment_begin`/`lights_pars_begin`) and, for
any material that ISN'T registered via `csm.setupMaterial()`, the un-patched shader path sums the
**full** contribution of every cascade light as if each were an independent, non-shadowed sun —
meaning an unregistered material would render 2–4× overbright the moment shadows turn on. Because of
this, `ThreeScene` registers every single lit (`MeshStandardMaterial`) surface in the game with
`GraphicsPipeline.registerMaterial()`: the terrain material, all 6 tree trunk/foliage materials, the
stair material, the stair tool's 2 preview materials, and — via a new `onMaterialCreated` callback on
`BuildingMaterialManager` — every wall/foundation/slab colour `PaintTool` ever creates, the moment
it's created. This finite, enumerable set (confirmed by grepping the whole codebase for
`MeshStandardMaterial`) is exactly what makes CSM tractable here — every other material in the game
(sky, clouds, all preview/highlight/grid/outline overlays) is `ShaderMaterial`/`MeshBasicMaterial`/
`LineBasicMaterial`, none of which include the patched lighting chunk at all.

Because a `USE_CSM`-registered material only ever receives ONE cascade's contribution per fragment
(selected by depth, with a soft blend at cascade boundaries via `csm.fade = true`), and an
unregistered material would double/triple/quadruple-count light, **the plain, non-shadow-casting
`sunLight` and CSM's own cascade lights can never both be in the scene at once** — `GraphicsPipeline`
removes `sunLight`/`sunLight.target` from the scene the moment shadows turn on (LOW → anything-else)
and re-adds them the moment shadows turn off. `ThreeScene` keeps computing `sunLight`'s
color/intensity/direction from sky settings exactly as before (harmless on a detached light) and
additionally forwards those same values to `GraphicsPipeline.setSunColorIntensity()`/
`setSunDirection()`, which apply them to whichever representation is actually live. CSM's own
`update()` (per-frame, cheap — repositions cascade lights from the stored direction and the camera's
current frustum) is called every frame; `updateFrustums()` (recomputes cascade split planes from
camera near/far/aspect — more work) is only called after `CSM` is (re)constructed and on resize, per
CSM's own documented per-frame vs per-setting-change split.

**Known, deliberate simplification — trees don't cast shadows.** `InstancedTreeLayer` sets
`frustumCulled = false` on its `InstancedMesh` (a populated instance buffer's default bounding sphere
doesn't reflect the actual, chunk-scattered instance positions, and there's no per-chunk bounds
recomputation implemented). That same disabled culling applies to a shadow camera's frustum test too
— with `castShadow` enabled, every loaded tree instance (thousands, across every variant layer) would
be submitted to the depth shader for every single cascade, every frame, with no distance-based
exclusion at all. Measured cost of that was severe enough to rule it out for this pass (see "Verified
performance" below) — a real fix would mean splitting vegetation instancing by chunk so each chunk's
`InstancedMesh` carries its own correct bounds, which is a bigger restructuring of `TreeManager` than
this pass attempted. Trees still `receiveShadow` (grounded by shadows falling from buildings/terrain)
and get GTAO contact shading at their bases; they just don't cast their own.

### GTAO, not SSAO

`GTAOPass` (RenderPass → **GTAOPass** → optional Bloom → AA → OutputPass) computes ground-truth
ambient occlusion from a depth+normal G-buffer, denoised via a Poisson-disc blur, then blends onto
the scene with a tunable `blendIntensity` (`aoIntensity` in the preset — capped low enough that AO
never crushes an area to black, just adds subtle grounding at wall/floor joins, stair edges,
foundation contact, and terrain creases). `aoQuality` (`low`/`medium`/`high`, one step below the
overall `GraphicsQuality` since LOW disables AO entirely) drives both the GTAO shader's sample count
and the Poisson denoiser's ring/sample counts. The AO buffer itself also renders at a fraction of full
resolution on cheaper tiers (0.5/0.75/0.85 of the composer's pixel-ratio-scaled size) — reapplied via
`gtaoPass.setSize()` immediately after `EffectComposer.setSize()` would otherwise reset it to full
res, since the composer propagates its own size to every pass uniformly.

### Anti-aliasing: FXAA on LOW, SMAA everywhere else — deliberately never TAA

The brief was explicit that a poor TAA implementation (ghosting/smearing/vegetation trails on a
moving first-person camera) is worse than a clean SMAA result, and three.js's `TAARenderPass` is
built for progressive/static-camera accumulation, not a real-time FPS controller — so ULTRA uses SMAA
too, not TAA. LOW uses the cheaper single-pass `FXAAPass` instead.

### PBR, HDR, and tone mapping

`renderer.outputColorSpace = SRGBColorSpace` and `renderer.toneMapping = ACESFilmicToneMapping` are
set once, for every quality level — this game already used `MeshStandardMaterial` with
physically-reasonable roughness/metalness per surface (see the Paint Tool section above), and already
had HDRI-based image-based lighting via `HdriEnvironmentSystem` (`scene.environment`/
`environmentIntensity`), so this pass didn't need to introduce PBR or IBL from scratch — it needed to
stop discarding the dynamic range those systems already produce. `toneMappingExposure` is a
debug-GUI-exposed, quality-independent knob (default `1.0`) rather than baked into the presets, since
exposure is a look/taste choice, not a performance one. No emissive materials were added anywhere —
nothing in this game should glow on its own.

### Pixel ratio and dynamic resolution

`renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` (a single hardcoded line, previously
the entire graphics-configuration surface of this codebase) is gone; each preset caps it instead —
except LOW, which deliberately has **no** effective cap (`pixelRatioCap: 4`, comfortably above any
real device pixel ratio) and a `minDynamicResolutionScale` of `1`, so it never renders below the
display's native resolution. LOW's performance savings come entirely from disabling shadows/AO and
shrinking render distance, not from a blurrier sub-native image — a fixed-effects-off, full-resolution
"fast" tier reads as correct on every screen, where a resolution cut only reads as correct on some.

On top of that, an optional dynamic-resolution controller (`GraphicsSettings.dynamicResolutionEnabled`,
default on, `targetFps: 60`) tracks an exponentially-smoothed FPS (≈0.5s time constant) and, checked
at most once per second (explicit hysteresis — never a frame-to-frame reaction), nudges a
`renderScale` multiplier (applied to the logical width/height passed to `renderer.setSize(w, h, false)`,
`updateStyle: false` so the canvas's CSS size — governed entirely by
`.canvas-container canvas { width/height: 100% }` — never changes) down toward the preset's
`minDynamicResolutionScale` floor when smoothed FPS falls below 90% of `targetFps`, and back up
toward `1.0` at the _same_ step size when it recovers above 97% — recovery used to be half as fast as
the drop, which reads as "stuck" at reduced quality even once the hardware can comfortably do better.
Switching quality (`L`, or the debug GUI) also resets `renderScale` to `1` and clears the smoothed-FPS
history immediately, rather than carrying over a scale/reading computed for a _different_ preset's
cost profile — otherwise LOW could stay visibly reduced for several seconds after switching down from
a heavier preset that had scaled itself back, even though LOW's own floor is `1`.

### Render-distance scaling

`terrainRenderDistanceMultiplier`/`treeRenderDistanceMultiplier` scale `TerrainSettings.viewDistance`/
`VegetationSettings.loading.treeViewDistanceChunks` on every quality change. Both multipliers are
always applied against the value captured at `ThreeScene` construction time
(`baseTerrainViewDistance`/`baseTreeViewDistanceChunks`), never against whatever the previous quality
level left behind — otherwise repeated quality switching would compound the scaling down to nothing.

### Resource lifecycle — no leaks across repeated quality switches

Every quality change tears down and rebuilds the CSM instance (`csm.remove(); csm.dispose();`) and
the entire `EffectComposer` (each pass's own `.dispose()`, then `composer.dispose()`) before
constructing fresh ones — `EffectComposer.dispose()` does NOT dispose passes added via `addPass()` on
its own, so `GraphicsPipeline.disposeComposer()` does that explicitly first. Registered materials
persist across quality changes (the same finite set is just re-registered with the new CSM instance);
`ThreeScene.dispose()` calls `GraphicsPipeline.dispose()` alongside every other manager's disposal. A
Playwright test cycles quality 8 times (two full LOW→MEDIUM→HIGH→ULTRA rotations) and asserts no
console errors and a still-rendering canvas at the end.

### Graceful fallback

Both CSM construction and postprocessing-pipeline construction are wrapped in `try/catch` —
a failure disables shadows (falling back to the plain sun light) or postprocessing (falling back to
`renderer.render()` directly, which still applies correct tone mapping/colour space on its own)
respectively, logging a warning rather than crashing the render loop.

### Debug GUI and the performance overlay

`TerrainDebugGui.addGraphicsFolder()` exposes `qualityPreset` (a dropdown — changing it calls
`GraphicsPipeline.setQuality()`, a full preset rebuild), `dynamicResolutionEnabled`, `targetFps`, and
`toneMappingExposure` (a cheap live update, no rebuild). The always-on stats overlay in `+page.svelte`
was extended with graphics quality, frame time, render scale, pixel ratio, draw calls,
geometry/texture counts (all from `renderer.info`), and shadow/AO/AA status — pulled from
`GraphicsPipeline.getRenderStats()`, updated at the same throttled ~4×/second rate the rest of the
overlay already used (`ThreeScene.updateStats()`'s existing `statsAccumSeconds` gate).

### Ambient Occlusion tuning: live sliders, not fixed-per-quality guesses (`AoTuning` in `GraphicsTypes.ts`)

Unlike shadows/bloom/AA (fixed per quality tier in `GRAPHICS_PRESETS`, since those are genuine
performance tiers), GTAO's look parameters — sample radius, contrast, denoise radius, overall
strength, and so on — are a "look at the result and adjust" task that no fixed per-quality number
gets right for every scene. `AoTuning` (in `GraphicsSettings.aoTuning`) holds every GTAOShader/
PoissonDenoiseShader parameter that shapes the effect, shared across every quality level that has AO
enabled, and fully live-tunable from the debug GUI's Graphics → "Ambient Occlusion" folder:

| GUI label              | Field                   | What it does                                                                      |
| ---------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| GTAO Strength          | `blendIntensity`        | Overall strength the AO darkens the scene by                                      |
| AO Spread Distance     | `radius`                | World-space sample radius (~1 ≈ one grid cell/wall width)                         |
| AO Darkness Power      | `distanceExponent`      | Raises AO contrast — darker, more defined creases                                 |
| AO Thickness           | `thickness`             | Max depth difference still counted as a nearby occluder                           |
| AO Distance Falloff    | `distanceFallOff`       | How quickly farther samples contribute less                                       |
| AO Scale               | `scale`                 | Overall sample-radius scale (leave at 1 unless radius alone isn't enough range)   |
| AO Samples             | `samples`               | GTAO raw sample count — smoother but more expensive                               |
| AO Denoise Radius      | `denoiseRadius`         | Poisson-disc blur radius — smooths noise, can wash out narrow creases if too high |
| AO Denoise Rings       | `denoiseRings`          | Poisson-disc ring count                                                           |
| AO Denoise Samples     | `denoiseSamples`        | Samples per ring                                                                  |
| AO Sample Distribution | `denoiseRadiusExponent` | Higher values cluster denoise samples closer to the current pixel                 |

Every slider calls `GraphicsPipeline.refreshAoTuning()` on change — a cheap direct update to the
already-built `GTAOPass`'s uniforms (`updateGtaoMaterial`/`updatePdMaterial`/`blendIntensity`), never
a composer rebuild, so dragging a slider is instant. Defaults (`createDefaultAoTuning()`) are seeded
directly from three.js's own `GTAOShader`/`GTAOPass` built-in values (`radius: 0.25`, not a guessed
number) rather than invented from scratch — a real, known-reasonable starting point, since an
earlier version of this tuning used values roughly 12–24× too large for `radius`'s actual world-space
units (a genuine bug, part of what made an earlier build's AO/shadows look wrong; see the fixed
`GTAOPass.output` mode below for the other half of that).

A "Export Settings" button next to the AO folder calls `GraphicsPipeline.exportSettings()`, which
prints the current quality/exposure/dynamic-resolution/AO-tuning values as JSON to the console and
tries to copy them to the clipboard — meant for exactly the workflow of dialing in values by eye in
the running game, then handing that JSON back to become new code defaults, rather than guessing
numbers blind.

### A real GTAOPass bug this pass found and fixed: wrong `output` mode

`GTAOPass.output` was set to `GTAOPass.OUTPUT.Denoise` — the mode shown in three.js's own JSDoc usage
example. That mode does **not** composite AO onto the scene; it replaces the entire frame with the
raw AO buffer texture, which for a typical outdoor scene (mostly unoccluded, so mostly white) renders
as an almost completely blown-out white screen — exactly the bug this pass hit at every quality level
except LOW (the only one with AO disabled). `GTAOPass.OUTPUT.Default` is the mode that actually
copies the scene through and then blends the denoised AO term on top of it via `blendIntensity`,
which is what a real rendered frame needs; `OUTPUT.Denoise`/`OUTPUT.AO`/`OUTPUT.Normal`/`OUTPUT.Depth`
are debug-visualization modes for looking at one buffer in isolation, not for normal rendering. Found
by bisection: disabling AO entirely fixed the render, and forcing `blendIntensity` to `0` (which
should make AO's blend step a no-op) _still_ showed a fully white screen — proving the bug was in the
output mode itself, not in any blend/intensity tuning.

### Verified performance, and how the numbers were actually obtained

Forcing a `gl.readPixels()` synchronization point after `render()` (a debugging technique, not
something shipped) showed `GraphicsPipeline.update()`/`render()` themselves queue GPU work in well
under 1ms per frame after warm-up shader compilation settles (the first 2–3 frames after a quality
change cost tens to a couple hundred ms while shaders compile — a one-time cost, not sustained). The
biggest _actual_ GPU-bound cost isolated this way was GTAO (roughly halved total frame cost when
disabled) followed by tree shadow-casting (see "Known, deliberate simplification" above) — CSM itself,
with trees excluded from casting, added comparatively little. This is the evidence behind
prioritizing "distance-based tree shadow casting" and "reduced-resolution AO" as the two optimizations
actually worth doing in this pass, over, say, more AA modes or extra bloom tuning — matching the
brief's own stated priority order (better sunlight/shadows and AO first, flashy postprocessing last).

### Tests

- **Vitest** (`graphics/__tests__/GraphicsTypes.spec.ts`, `GraphicsSettingsStore.spec.ts`,
  `building/__tests__/BuildingMaterialManager.spec.ts`): the `L`-cycle order and that it visits all
  four levels; preset-table invariants (LOW has no shadows, cascade count matches shadow-map-size
  array length, no preset uses TAA, bloom is always subtle where enabled, AO is never crushing);
  quality persistence round-trips through `localStorage` and degrades safely without it;
  `BuildingMaterialManager`'s `onMaterialCreated` fires exactly once per newly-allocated material.
- **Playwright** (`tests/graphics.e2e.ts`): defaults to HIGH on a fresh visit; `L` cycles through all
  four levels (checked via the stats overlay, not a fixed wall-clock wait); the HUD notification
  appears with the right text and fades back out on its own (dispatching the synthetic keydown and
  polling the DOM from _inside_ the same `page.evaluate()` call — a real fix for a real flake this
  pass hit: a separate `page.keyboard.press()` round-trip before checking can land after a
  first-time-only CSM/composer rebuild's synchronous cost already ate into the notification's visible
  window); quality persists across a reload; `L` is ignored while focused on the paint palette's
  colour input; switching quality 8 times in a row (two full rotations) never throws and leaves the
  canvas rendering.

### Not implemented yet

- **Per-chunk tree shadow casting.** The real fix for the "trees don't cast shadows" simplification
  above — would need `TreeManager`/`InstancedTreeLayer` restructured so each loaded chunk's instances
  live in their own correctly-bounded `InstancedMesh` (enabling both proper frustum culling and
  distance-based shadow participation), rather than one giant per-variant buffer for the whole world.
- **Reduced-resolution GTAO with intelligent upscale** beyond the flat per-quality resolution scale
  used today — an edge-aware upscale filter would let LOW-ish AO resolutions look closer to full-res.
- **SSR** (screen-space reflections) for water/polished floors/glass — deliberately not built, per
  the brief; the postprocessing pipeline's pass ordering (RenderPass → GTAO → Bloom → AA → Output)
  leaves room to insert an SSR pass later without restructuring.
- **Volumetric clouds/fog** — deliberately not built, per the brief; the existing procedural sky/cloud
  system and `Fog`/`FogExp2` are untouched by the quality system.
- **Terrain self-shadowing.** Terrain `receiveShadow`s (from trees/buildings) but never `castShadow`s
  onto itself — a minor visual nicety judged not worth the extra per-chunk shadow draw calls.

## Worlds: local persistence, import/export, and the save architecture (`world/`)

The game opens on a **Worlds** screen rather than dropping into an anonymous session. A player can
keep several local worlds, each with its own seed, terrain, forests and buildings; worlds autosave
while you play, and can be renamed, duplicated, exported to a file, imported back, and deleted.

### The one rule the whole design follows

```
SAVE:           what defines the world
DO NOT SAVE:    what can be regenerated from that definition
```

A world's save contains its seed, its generation settings, the buildings a player authored, the
handful of _exceptions_ to the procedural world, and where the player was standing. It contains no
terrain vertices, no chunk cache, no tree positions, no meshes, no materials, no collision rects and
no Three.js objects of any kind — all of those are runtime representations rebuilt on load from the
definition.

That distinction is what makes an infinite world cheap to store. Walking 20km generates a great deal
of terrain and many thousands of trees, and adds **zero bytes** to the save, because every one of
them is reproducible from `(seed, settings)`. Save size grows with _authored content plus procedural
exceptions_, never with explored area.

### `WorldDefinition` — the persistence contract (`world/WorldTypes.ts`)

```ts
interface WorldDefinition {
	schemaVersion: number;
	id: string;                 // stable UUID; the NAME is a label, never identity
	name: string;
	createdAt / updatedAt / lastPlayedAt: string;   // ISO strings
	saveRevision: number;       // monotonic; every successful write bumps it
	seed: string;               // authoritative over environment.terrain.seed

	environment: {              // how this world generates — snapshotted explicitly
		terrain: TerrainSettings;
		vegetation: VegetationSettings;
		sky: SkySettings;
	};

	foundations: FoundationDefinition[];            // authored — cannot be regenerated
	buildings: FoundationBuildingDefinition[];      // walls, wall paths, slabs, stairs, openings, paint
	buildingLevels: BuildingLevelDefinition[];

	proceduralOverrides: { removedTreeIds: string[] };   // deltas only

	player: SavedPlayerState;
}
```

Every authored building type is covered, and the existing `serialize()`/`load()` pairs on
`FoundationManager`, `BuildingManager` and `BuildingLevelManager` are reused as the contract for
their own state rather than reimplemented — so a new building type is included by construction as
soon as it appears in its manager's `serialize()`.

**Environment settings are stored in full, including values identical to today's defaults.** That's
deliberate: application defaults drift between releases, and a world made today must keep looking
like itself after they change. `WorldSerializer.spec.ts` asserts exactly this.

### World state vs. application preference

A few values live in a world's settings objects but are _not_ world state, and are normalized out on
capture (see `ThreeScene.getEnvironment`):

| Value                                                       | Where it lives                           | Why                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Graphics quality, AO tuning, exposure                       | `localStorage` (`GraphicsSettingsStore`) | A machine's capability, not a world's look. "Graphics: ULTRA" must not be baked into a world you share.                        |
| Terrain/tree **view distance**                              | Normalized to the world's own baseline   | The active graphics preset scales these live; a world must not inherit the render distance of whichever machine last saved it. |
| Debug view toggles (wireframe, chunk borders, cloud bounds) | Reset on capture                         | Debug GUI preferences, not world content.                                                                                      |
| Saved paint colours                                         | `localStorage` (`MaterialPresetStore`)   | A player's palette, not a property of one world.                                                                               |

### Player state

Position, yaw, pitch, the locked foundation, and the per-foundation current storey. Explicitly _not_
saved: velocity, held keys, jump state, pointer lock — those are transient input, and a world that
reloaded you mid-fall with keys still held would be restoring a moment rather than a place.
`sanitizePlayerState` rejects non-finite or absurdly distant coordinates and falls back to a safe
spawn, so a corrupted save can't strand a player at `NaN`.

### Procedural overrides: deltas, never contents

Trees exist because `(worldSeed, cellX, cellZ)` says so (see `TreePlacementGenerator`), so a tree's
stable identity is just its cell — `proceduralTreeId(cellX, cellZ)` → `"12:-7"`. Cutting one down
stores that one short string; the millions still standing store nothing. `TreeManager` consults the
removed set while materializing a chunk, so a removed tree never reappears and never flickers into
existence on load. Every future procedural-world edit (terrain deformation, harvested resources,
scattered props) should take the same delta shape.

### Storage architecture

```
GAME LOGICAL STATE  →  WorldSerializer  →  VERSIONED WorldDefinition  →  WorldRepository  →  IndexedDB
```

| Class                   | Responsibility                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorldManager`          | Lifecycle: create, open, save, rename, duplicate, delete, import, export. Owns the single authoritative copy of the open world.                            |
| `WorldRepository`       | The persistence _interface_. `IndexedDbWorldRepository` is today's implementation; `InMemoryWorldRepository` backs unit tests and the no-storage fallback. |
| `WorldSerializer`       | Converts between live runtime state and the persisted contract. Imports no Three.js, by design.                                                            |
| `WorldAutosaveManager`  | Dirty tracking, debouncing, save-status state machine, stale-write protection.                                                                             |
| `WorldImportExport`     | The portable `.forestworld` package.                                                                                                                       |
| `WorldMigrationManager` | Old schema → current schema.                                                                                                                               |
| `WorldSession`          | Binds one open world's scene + autosave + browser lifecycle hooks together.                                                                                |

**IndexedDB, not `localStorage`**: worlds are structured, potentially multi-megabyte, and must not
block the main thread mid-gameplay. `localStorage` is synchronous, string-only, and quota-limited to
a few megabytes — disqualifying regardless of how small a single save happens to be today.

Three stores, each for a specific reason:

- **`worldMeta`** — what the Worlds browser lists. Opening the Worlds screen reads only these (a few
  hundred bytes each), never full worlds; the difference between an instant screen and a multi-second
  one once someone has a dozen large worlds.
- **`worlds`** — the full `WorldDefinition`, read only when a world is opened, exported or duplicated.
- **`thumbnails`** — image blobs, kept out of the record autosave rewrites every few seconds.

A save writes `worlds` and `worldMeta` inside **one transaction**, so the two can never disagree
about which revision is current — a half-applied save is exactly the corruption that makes a save
system untrustworthy.

### Autosave: revision counters, not serialization

Managers bump a plain integer when they mutate (`BuildingManager.getRevision()`,
`FoundationManager.getRevision()`, `BuildingLevelManager.getRevision()`, `TreeManager
.getOverrideRevision()`, plus `ThreeScene`'s own environment counter). The autosave loop polls those
integers twice a second, so _"has anything changed?"_ costs a few comparisons — an idle world costs
nothing, and serialization only happens when a debounce actually fires.

| Trigger                                    | Timing                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Structural edit (wall, paint, removal, …)  | 2s after the last change, capped at 10s from the first unsaved change so continuous building still saves |
| Critical edit (foundation placed, rename)  | 0.6s                                                                                                     |
| Player movement only                       | Every 15s, and only if the position actually changed                                                     |
| Pause menu, quit, `Cmd/Ctrl+S`, tab hidden | Immediate, awaited                                                                                       |

Lifecycle flushes use `visibilitychange` and `pagehide`, **not** `beforeunload` — asynchronous
IndexedDB writes frequently cannot complete there. The normal cadence is designed to keep storage
nearly current at all times rather than relying on a last-gasp save.

### Stale-write protection

Every capture is tagged with the content _generation_ it came from. If the world changes while a
write is in flight, the completed write only clears dirtiness up to the generation it actually
captured, and the newer state is written on the next tick. Writes are serialised through a single
promise chain, so two never run concurrently and an older one can never mark newer work as saved —
the failure mode that silently resurrects deleted walls. Directly asserted in
`WorldAutosaveManager.spec.ts`.

### Save status and failure handling

`SaveStatus` is a four-state machine (`saved` / `dirty` / `saving` / `error`) surfaced as a small
unobtrusive corner indicator that only becomes prominent when it needs attention. A failed write
keeps the world dirty _and_ keeps the in-memory world intact — the pause menu then offers **Retry
Save** and **Export Backup**, because a storage failure should never mean the session's work is gone.

`navigator.storage.persist()` is requested once, right after the player creates real world data —
not on first page load, which is how you train people to decline.

### Thumbnails

Captured at milestones only — manual save, quitting to the Worlds screen, and at most every five
minutes during autosave — never on the autosave cadence. Rendered to a 320×180 WebP at quality 0.7,
cover-fit so the view isn't squashed, and stored in their own IndexedDB store. **Thumbnail failure
never fails a save**: it's optional metadata, so a world writes successfully whether or not a
screenshot could be produced.

### Export package (`.forestworld`)

A ZIP holding three entries:

```
manifest.json     format, versions, world id/name, exportedAt, applicationVersion, checksum
world.json        the WorldDefinition
thumbnail.webp    optional
```

Deflate at level 6 for the JSON (building data is extremely repetitive and compresses roughly an
order of magnitude — asserted in the tests); the thumbnail is stored uncompressed since WebP is
already compressed. The manifest sits _outside_ the compressed payload so provenance and the checksum
can be read before anything large is decompressed. The checksum (FNV-1a over the exact `world.json`
bytes) detects accidental corruption — a truncated download, a mangled transfer. It is deliberately
**not** a signature, and imports are treated as untrusted regardless of whether it matches.

Everything happens locally in the browser; no backend is involved.

### Import validation

Imported files are hostile input until proven otherwise, and nothing is instantiated — no Three.js
geometry is built — until all of this has passed:

1. Package size ceiling, checked _before_ decompressing (a zip bomb's compressed size is the first
   thing that can be checked, so it is).
2. Manifest present, correct `format`, `formatVersion` not from a newer build.
3. Checksum matches.
4. World JSON size ceiling, then parse.
5. Migration to the current schema.
6. Full structural validation: types, finite numbers, known enums, valid colour strings, and
   **record-count limits** — a file declaring five hundred million walls is rejected rather than
   frozen over.
7. **Relationship integrity**: every wall/slab/stair/level must reference a foundation that exists in
   the same file, and the saved active foundation must exist. A file can be perfectly valid JSON and
   still describe a building hanging off nothing.

An id collision **never overwrites**. Re-importing a world you already have produces a second copy,
because silently replacing someone's current save with an older exported version of it is a data-loss
bug wearing a convenience feature's clothing.

### Schema versioning and migrations

`schemaVersion` starts at 1 and is versioned from day one. `WorldMigrationManager` holds sequential
`N → N+1` steps; loading or importing an older world migrates it in memory, validates it, and writes
the upgraded form back so the cost is paid once. A world from a **newer** schema is refused with an
actionable message ("Please update the game") rather than guessed at — silently dropping unrecognised
fields would quietly corrupt someone's world.

Application version and schema version are deliberately separate concepts: a release doesn't imply a
schema change, and vice versa.

### Loading a world

```
read stored WorldDefinition → migrate → validate → apply environment settings (in place)
→ foundations → buildings → levels → procedural overrides → player position → prime nearby chunks
```

Environment settings are copied _into_ the existing settings objects rather than replacing them:
every manager, tool and GUI controller holds a reference to those exact instances. Only chunks near
the player are generated — the infinite world keeps using ordinary proximity-based loading, and
loading a world never depends on a generated chunk cache existing.

### Worlds UI

```
MY WORLDS                          in-world:  Esc → Resume / Settings / Help / Creature Lab / Save / World / Quit
[ + New World ] [ Import World ]              World → Rename / Export World / Duplicate World
┌─────────────────────────────┐
│ [thumb]  Forest House       │
│          Updated 2m ago     │
│          1.8 MB   [Play][…] │
└─────────────────────────────┘
```

Each row's `…` menu holds Play / Rename / Duplicate / Export / Delete. Deleting asks for confirmation
and offers **Export Backup** first — unlike deleting a wall, it isn't undoable. `Cmd/Ctrl+S` saves
(and suppresses the browser's own save-page action), but only in-game and never while typing.

### Ready for cloud worlds later, without building them now

Cloud saving, accounts, and multiplayer sync are explicitly **not** implemented. What _is_ in place
is the seam they'd need: game code talks only to the `WorldRepository` interface, never to IndexedDB,
so a `CloudWorldRepository` slots in without touching a single building manager. The concepts that
make remote synchronisation possible — a stable world `id`, a `schemaVersion`, and a monotonic
`saveRevision` that detects stale and diverged writes — are already the ones this system runs on
locally.

### Measured sizes and timings

Measured in a real browser session (`tests/worldPersistence.e2e.ts` prints these):

| World                                                                                                          | Stored size      |
| -------------------------------------------------------------------------------------------------------------- | ---------------- |
| Walked around in for several seconds — hundreds of terrain chunks and thousands of trees generated             | **3,093 bytes**  |
| 300 walls, each with a window opening and a paint colour, plus a foundation, a level and 3 removed-tree deltas | **82,092 bytes** |

The first number is the important one: exploring generates a great deal of world and adds _nothing_
to the save, because all of it is reproducible from the seed. Size tracks authored content only —
roughly 270 bytes per fully-specified wall — and the export package compresses that by about 4×.

**Synchronous cost of a save: 0.20 ms.** That's capture plus serialization on the main thread, the
only part that could stall a frame; the IndexedDB write itself is asynchronous. Well under a 16 ms
frame budget, and it runs on a debounce rather than per edit, so autosave doesn't appear in frame
timings at all.

### Tests

- **Vitest** (`world/__tests__/`, 100+ cases): full round trip of every authored building type;
  openings, materials and stair-owned slab openings; player state precision and spawn sanitisation;
  seed/settings preserved against changed application defaults; procedural trees never written while
  removed-tree deltas are; create/rename/duplicate/delete semantics (new id, fresh timestamps, deep
  copy, thumbnail carried across); import as copy on id collision; malformed/corrupt/newer-schema
  packages rejected; autosave debouncing, cadence, status machine, failure handling, and the
  stale-write guard; migration and future-schema refusal; validation of numbers, enums, colours,
  relationships and record-count limits; revision counters on every mutation path.
- **Playwright** (`tests/worlds.e2e.ts`): Worlds screen and empty state; create → play → list; survives
  a full reload; pause-menu save and `Cmd/Ctrl+S`; quit to Worlds tears the renderer down; rename;
  duplicate; delete-with-confirmation (including cancel); export a real downloaded file and import it
  back as a separate copy; invalid file rejected with a message; listing worlds without starting a
  renderer.

### Not implemented yet

- **Cloud/multiplayer worlds** — deliberately out of scope; see the seam described above.
- **Explicit "replace this world" on import** — an id collision always imports as a copy today.
- **Web Worker compression for export** — worlds compress in well under a frame at current sizes;
  the seam to move it off-thread is `createWorldPackage`, if large builds ever make it worth doing.
- **Per-section incremental persistence** — a world is written as one atomic record. The repository
  interface is shaped so foundations/buildings/overrides could be split into separate records later,
  but that complexity isn't earned yet.
- **Auto-resume the last world on launch** — the Worlds screen is always the entry point.

## Testing

```sh
npm run test:unit   # Vitest — terrain determinism/seams, biome regions, vegetation, foundation math, grid snapping, click routing, sky/atmosphere math, graphics presets, world persistence
npm run test:e2e    # Playwright — worlds screen + save/load lifecycle, canvas renders, hotbar + Foundation slot exist, sky + its GUI sections render, graphics quality cycling, no errors
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

## Music Garden

Press **M** near a Music Tree to compose. **Q/E** changes species, **Up/Down** changes pitch, **Left/Right** changes vibrancy, **comma/period** changes duration, **click** plants, and **J** pauses/resumes. **F** selects a plant under the crosshair: its exact imported pitch is retained until edited, arrow keys edit it, and clicking moves it freely around its original timing ring. **X** uses the existing Remove Mode. Leaving Music mode restores the construction tool. Old worlds without a tree create one on entering Music mode.

### Local MIDI import

Choose **Import MIDI**, then a local `.mid`/`.midi`. The bundled MIT-licensed [`midi-file` 1.2.4](https://github.com/carter-thaxton/midi-file) parses Standard MIDI format 0/1 in a dedicated worker. Files are never uploaded. Format 2, SMPTE timing, malformed/truncated files and invalid event values produce errors. Limits are 16 MB, 256 tracks, one million events, 100,000 notes and two million quantized steps; a 30-second worker watchdog can terminate pathological input. These are browser safety limits, not a small-garden design cap.

The analysis shows tracks/programs, note count, bar count, tempo changes, meters and maximum polyphony. Select inclusive bars (1–8 by default, unrestricted up to the song length), tracks, species mapping, timing resolution, physical spacing (including Tight) and whether notes cluster in one area of the garden. Preview counts, quantization error, smallest/largest plants and garden diameter before committing. Notes crossing section boundaries are clipped; tempo and meter active at the section start become events at step zero.

`MidiImportPlan` is a deterministic, serializable preview containing canonical note parameters, timeline, size metrics, angles, layout and warnings. Parsing and planning never mutate the world. **New Tree** starts a ground-placement preview after confirmation; **Replace** requires an explicit checkbox; **Add** preserves the current tree’s grid, tempo, meter and all existing note timing/angles, expanding physical spacing if necessary. Commit stages a complete logical/spatial manager, checks terrain, building clearance and neighboring plants, then swaps the composition atomically. Conflicts may rotate new notes around their original ring; they never move a note to another time. Failure leaves the old composition intact. Large commits yield every 128 notes; nearby visuals appear in batches after logical commit.

### Musical timing, pitch and sustain

The authoritative timeline is `loop.timeline`: `totalSteps`, `grid.stepsPerQuarter`, `tempoMap` and `meterMap`. Legacy scalar loop settings remain for the manual editor and migration. Starts and ends round to the nearest grid step, with a minimum one-step duration and no loop-boundary wrap. Explicit grids are 2, 4, 8 or 12 steps per quarter (eighth, sixteenth, thirty-second, triplet-aware). Auto examines starts and ends and chooses the coarsest of 2/3/4/6/8/12 with mean error ≤0.032 quarter and 95th-percentile error ≤0.065 quarter; it falls back to 12. Tempo/meter event positions retain fractional steps rather than being musically quantized.

`MusicTimeline` precompiles tempo segments with cumulative seconds and binary-searches step→seconds and seconds→step. The 25-ms audio scheduler schedules 150 ms ahead against the shared AudioContext, gives chords identical timestamps and skips missed events after stalls. Note releases and the wave use the same tempo conversion. Meter segments provide denominator-aware bar/beat labels, including a partial bar when a meter change falls inside a bar. Add mode explicitly warns that source tempo/meter changes are ignored.

`pitchMidi` is the exact integer 0–127. Import never passes through a pentatonic filter or an instrument octave clamp. Manual pitch edits select the next note in the tree’s chosen scale. Pitch determines height with `referenceHeight * scalePerOctave ** ((referenceMidi-pitchMidi)/12)` so low notes are large and high notes are small, clamped to species visual bounds (5 cm minimum, 35–45 m maximum); sound pitch is unchanged by visual bounds. The root remains at its saved angle/radius and terrain height. `PlantVisualMetrics` supplies height, canopy/base radius and placement clearance to both rendering and layout.

Velocity becomes `vibrancy = velocity/127`, controlling saturation/emission and the existing nonlinear gain curve. Note-off and velocity-zero note-on release matching voices. CC64 defers releases until pedal-up; repeated same-pitch voices are tracked independently, and dangling notes end at file end. Duration steps drive the existing root/mycelium/vine trails and instrument release envelopes. Unsupported bend/aftertouch/controllers are reported. GM families default to bell flowers (piano/guitar), marimba mushrooms (bass/percussive), pad ferns (strings/ensemble), flute reeds (winds) and glass crystals (synth/effects), with per-track remapping. Channel 10 retains drum-note identity and uses reusable synthesized kick/snare/hat/tom voices and kit-sized plants. Audio has per-tree compression and a 128-voice safety limit, with a preview warning above source polyphony 128.

### Spatial layout and large worlds

All onset indices remain musical integers. Radius is always `firstRingRadius + ringIndex * ringSpacing`; angle is a free continuous value. Adjacent occupied rings determine minimum spacing from the sum of plant clearance radii divided by their step gap. Dense chords determine the minimum circumference, followed by conservative arcsine footprint packing. A seeded layout groups species and places angular footprints with continuous offsets. Add mode fits new notes into open angular gaps while retaining old angles. Tight/Compact/Balanced/Epic multiply physical clearance by 1/1/1.35/2.25, with Tight also using closer packing margins and a smaller inner ring. **Cluster notes in one area** packs each ring from a shared heading instead of spreading leftover space around the tree. Pitch, onset and duration are unchanged. Giant plants and dense chords can produce kilometre-scale gardens.

All logical notes and the ring-indexed audio schedule remain loaded. A 32-m spatial cell index streams plants near the camera (100 m plus footprint), limits live plants to 400 and creates at most 16 per frame. Distant notes still play. Sustain geometry exists only for loaded plants and uses bounded terrain samples. Terrain chunks continue to follow the existing camera-driven terrain manager; import only queries the procedural height sampler. It does not request every chunk inside the garden.

The wave uses a fixed 224×224-m ground patch with a 112×112 grid, translated in 16-m camera increments and evaluated against the tree’s radial origin in the shader. A garden’s total radius never determines geometry size. Between patch moves, playback changes uniforms only. Pause/removal/disposal release queued voices, timers and render resources; the application AudioContext is shared across worlds.

### Persistence and verification

Schema **4** saves exact pitch, instrument, optional percussion identity, angle, onset, duration, vibrancy and timeline as JSON through the existing autosave/export pipeline. No MIDI bytes, workers or audio/render objects are saved. Migration from schema 3 computes each old growth-based note through the original scale algorithm, replaces growth with exact pitch and a fixed visual reference profile, preserving both its previous sound and size. Schema 1/2 migrations still pass through their existing music/duration defaults.

MIDI unit tests cover format 0/1, malformed input, chromatic/full-range pitch, sustain pedal/repeated voices, section boundaries, all resolutions, changing tempo/meter, spacing, dense chords, deterministic layouts, migration and package round trips. Browser tests exercise local selection, preview options, cancellation, New/Replace/Add, save/reload and bounded rendering for 100/2,000/10,000 notes. `?musicTest` exposes the scene only for these tests. Performance measurements are documented in [MIDI performance](docs/midi-performance.md); rerun with `npx playwright test tests/midi.e2e.ts`.

## Procedural creatures

Forest Drift includes deterministic species and individual recipes, four skinned body plans, terrain-aware animation, streamed ecology, and a Creature Lab for generation, inspection and persistent placement. See the [creature engineering report](docs/creature-system.md) for architecture, controls, verification, measured 10/25/50/100-creature performance and current limitations.
