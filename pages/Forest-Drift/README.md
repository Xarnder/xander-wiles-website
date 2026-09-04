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
- `Esc` — release the mouse, and cancel a pending foundation corner if one is selected
- `1`–`5` — hotbar slots (`1` is the Foundation tool)
- Left click — select a foundation corner / confirm placement (only once pointer lock is engaged)
- Right click — cancel the current foundation selection

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
  clouds baked into its panorama *and* it were also shown as the background, they'd float behind (and
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
   clouds in the HDRI won't normally be visible, but if you *do* turn that on, its clouds would
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
