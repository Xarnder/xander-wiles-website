# Rivers start and end in small lakes (2026-11-09)

## The problem

- **Start:** a river rising at a spring began at full width with a square end, out of bare ground, in the middle of a forest. The spawn river starts with a lot of flow, so it was 7.5 m wide from its very first metre.
- **End:** a river whose route ran out (past its 1.1 km reach, boxed in, or back on itself) simply stopped.
- **Dead ends:** worse, when a higher-ranked river *ended* right where a lower one ran, the lower river was cut off where it reached that dead end, and no water went on from there.

## What changed

**Source ponds** (`HydrologyRegionGenerator.routeFromSpring`):
- Every spring river (`r:…`, and the spawn river `spawn:…`) now rises in a small pond at its spring. The pond's radius is 6–12 m, scaled to the river's width.
- The river leaves through the pond's lowest edge, routed like an existing lake outlet. Its water is held at the pond's level from inside the pond to the shore, so it starts on the pond, at full depth.
- If the lowest edge leads straight into a hollow, the river follows the spring's own original course instead, still rising on the pond.
- If no pond fits (a natural lake already there, or a cliff), it falls back to the old bare spring.

**End ponds** (`HydrologyRegionGenerator.endPond`):
- A river that would just stop now flows into a small pond just past its last step. The radius is 8–18 m, scaled to its width there.
- The pond's water sits at the lowest point of its rim, so it never hangs over a slope.
- The usual lake rules then apply: the river eases down onto the pond's level, and the pond drops to the river's level if the river arrives lower.
- End ponds never get an outlet of their own.

**Meeting rivers** (`HydrologySystem.resolveConfluence`):
- A river is no longer cut off by another river's final stretch when that river simply ends there.
- A river whose own end lies on another river now joins it, even a lower-ranked one. Its flow is added downstream, and its end pond goes dry (`LakeDefinition.inactive`: no water, no carving, not drawn, and no shoreline splashes).

**Load order:**
- A pond is created only with its river (`pendingPonds`), so the spawn river search's rejected candidates leave nothing behind.
- Existing lake logic ignores ponds: natural lake placement, sink lakes, and a river stopping when it reaches a lake.
- A new pond only checks against natural lakes, which are scanned first for the 3×3 regions around it.
- River meetings use only values settled in the same pass.
- So the result never depends on which area loaded first (covered by the existing determinism tests).

## Which worlds

`RIVER_POND_MIN_VERSION = 2`: current (version-2) worlds get the ponds and the confluence fix too, so existing worlds are fixed rather than only new ones.

What that means for existing worlds:
- Rivers don't move. Small ponds appear where rivers already start and end.
- Some rivers that used to be cut off at a dead end now carry on along their original course.
- Version-1 worlds are unchanged.

The world fingerprints (`determinism-golden.json`) are regenerated. Hydrology lake counts rise, for example from 55 to about 95 for one seed, as ponds are added. Terrain and tree fingerprints are unchanged.

## Tests

`hydrology/__tests__/riverPonds.spec.ts`, on a valley and on rolling hills:
- Spring rivers rise in their own pond, starting inside it at its level, with water over every sample of their first stretch.
- Every river ends in a lake or joins another, never in nothing.
- End ponds of joining rivers are dry and undrawn.
- A pond's water stays below the ground around it.
- Version-1 worlds get no ponds.

Existing determinism, spawn-river and bank tests still pass. The spawn test now measures from where the river leaves its pond.

In the in-app browser, all five rivers within 600 m of spawn on the `forest` seed now start from a lake or a spring pond and end in a lake or end pond. Seen from above:
- The spawn river leaves a round spring pond with a sandy shore.
- It ends in a rounded end pond, the water levels matching.

## River and lake surfaces blend where they meet (2026-11-09)

At both ends the river and its lake were already at one height (the locked mouth samples sit on the lake level). But they were drawn with a seam:
- the river's surface stopped exactly at the shoreline;
- the lake's surface faded to nothing along its whole shoreline, foam line included, which put a thin see-through, foamy strip across the mouth;
- the river's flowing ripples also switched to the lake's wind ripples right at that line.

What changed:
- `WaterRenderer.lakeEdgeDepth`: where a river at the lake's own level (within 0.2 m) crosses the shoreline, the lake keeps its real depth there instead of fading, so the two surfaces meet with no gap and no foam line. Everywhere else the shore fades as before.
- `WaterRenderer.lakeKinds`: each river's surface carries a per-vertex value in the existing `aKind` attribute.
  - It rises from 0 to 1 over the river's last 16 m before a lake, at its source and at its sink.
  - Past the shore it goes on from 1 to 2 over 6 m.
  - Distances are measured from where the centreline really crosses the shore (found by bisection), not from the nearest 8 m sample.
- The river's surface no longer stops at the shoreline. It carries on 6 m under the lake with the lake's look and fades out there; past 2 it isn't drawn. A straight cut across the river had left a strip of water 1–2 m wide undrawn on one side wherever the shore crossed the river at an angle. Now the two surfaces always overlap.
- `WaterMaterial`:
  - The shader cross-fades the river's flowing ripples into the lake's wind ripples between 0 and 1. The current's speed, its foam streaks and its bank foam fade with it.
  - It fades the surface's opacity out between 1 and 2.

This only changes how water is drawn: the world fingerprints are unchanged. Tests are in `riverLakeBlend.spec.ts`:
- the value rises smoothly before the shore;
- 4 m past it, the surface is two-thirds faded, and from 6 m on it's gone, at both a sink lake and a source pond;
- a river with no lakes gets nothing;
- the shoreline keeps full depth only at a river at the lake's level.

Checked in the in-app browser at both ends of the spawn river. Rays cast straight down over a 29 × 25 m grid around each mouth found every wet point along the river's channel covered by the river, the lake or both. The only uncovered points were a couple on the lake's own shoreline beside the mouth, where a lake always fades out. Close up at midday, both joins read as one surface.
