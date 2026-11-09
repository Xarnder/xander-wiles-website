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
