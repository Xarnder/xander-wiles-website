# Shovel terrain editor implementation

21 October 2026

## Controls and behaviour

Select **7 — Shovel** in Build Mode. Left mouse raises ground; right mouse lowers it. Holding either repeats at a maximum of eight steps per second. Release commits one undoable stroke. Escape, losing focus, losing pointer lock, switching tools, and opening settings cancel unfinished work. Touch uses explicit Raise and Lower buttons. **E** opens the wooden brush panel: radius, 0.125–0.5 metre steps, and single-point mode. **−** undoes a stroke; **+ / =** redoes it.

The terrain remains a heightfield. There are no caves, holes or overhangs. Height targets are quantised to 1/32 metre. Brushes are limited to four metres; strokes and saved point counts are bounded. The tool rejects unsafe changes rather than spreading terrain adjustments beyond the displayed brush footprint. It does not simulate soil resources or water.

## Foundations and safety

- Stone tops, grass-pad tops and building origins remain fixed. Foundation interiors are protected. Stone contact edges may be excavated; the masonry extends downward with half a metre of buried overlap.
- Effective stone depth is derived from terrain and does not overwrite the authored base. Raising ground or undoing excavation restores support without repeatedly deepening the saved foundation.
- Stone ground limits preserve a small top reveal and stop increasing exposed masonry beyond four metres. Existing terrain violations are not made worse.
- Grass pad cores mask older manual edits. Banks outside the core can be edited, subject to the same grade and neighbouring-foundation limits. Removing a grass pad restores its automatic contribution while retaining manual records.
- New foundation interiors cannot overlap. Grass/stone height differences that cannot fit a safe transition are rejected. Automatic grass banks are capped near stone.
- Shovel edits protect water-carved regions and shore margins, loaded tree roots, and the support/clearance footprints of furniture, Mini Builds, barriers, walls and doors. The interpolation footprint is checked as well as the brush centre.

## Storage, history and shared worlds

`TerrainEdits` stores sparse absolute height targets on a saved lattice in `proceduralOverrides.terrainEdits`. Older saves need no migration. Validation bounds coordinates, heights, spacing, point count and duplicates. Unfinished strokes are excluded from snapshots. Undo records each point's first value and final value once, and retains the existing five-action build-history limit. Redo applies accepted records rather than replaying input. History refuses to overwrite subsequently changed terrain.

Shared worlds exchange 16 × 16 lattice tiles through the existing authored-world operation feed. Pending strokes defer shared transactions; changed tiles refresh locally. The room validates tile shapes, coordinates, foundation interiors and stone contact limits, and rejects stale terrain patches. Water, roots and object-clearance checks run in the game client; the room does not run procedural hydrology or a complete physics simulation. Online end-to-end synchronisation still warrants dedicated multiplayer playtesting beyond the pure authority/round-trip tests.

## Rendering and cost

Unedited terrain uses an early-out. Edited samples perform four sparse lookups, skip zero-weight corners, and share the existing terrain material and procedural texture. No mesh or material is created per stroke.

Local edits rewrite only affected height, normal, colour and shore vertices, with a normal halo. GPU attribute update ranges cover changed rows. Position/index/UV buffers are reused; untouched chunks are restamped instead of rebuilt. Grass and plant regeneration is restricted to affected regions through existing budgeted queues. Surface queries and mesh updates publish synchronously in the same operation.

The shovel supports lattice spacings from 0.25 to 16 metres; unsupported custom grids display an explanation and cannot create invalid edit saves.

The saved lattice stays fixed when chunk settings change after terrain or foundations have been authored. Chunk partitioning may change, but authored coordinates are not rescaled.

Desktop Chromium measurements in the integration fixture were approximately 0.1–0.3 ms for a small terrain-buffer update and 0.4–0.8 ms for a protected single-point brush plus rendering/support updates. These are local CPU samples, not mobile frame-rate guarantees or whole-frame GPU timings.

## Verification

Unit coverage includes sparse interpolation, unfinished snapshots, one-stroke history data, invalid saves, slope limits, protected interpolation footprints, grass/stone composition, derived stone depth, partial geometry updates, matching chunk-edge normals, regenerated chunks, shared tile round trips, and authority conflicts. Browser coverage exercises the shovel settings and actions, rendered height agreement, undo/redo, save/reopen, stone excavation and grass-pad protection, plus the existing grass foundation placement/reload regression.

Final automated checks: 2,295 unit tests passed; Svelte/TypeScript reported zero errors and zero warnings.
