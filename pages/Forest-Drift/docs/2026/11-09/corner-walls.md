# Corner Walls: two-click rooms (2026-11-09)

A new wall subtool on hotbar slot 2, and now its **default**: click one corner of a room, then the opposite corner, and all four walls of a right-angled room are built at once as one closed wall path.

The other wall tools are unchanged and stay one ↓ away. Slot 2 is now:
1. Corner Walls (default)
2. Poly Wall
3. Wall
4. Fence / Rail
5. Skirting
6. Wooden Pillars

## How it's built

- **The same tool, a different shape.** `PolygonWallTool` takes a `shape` option. `path` (Poly Wall) works as before. `rectangle` (`toolId: 'corner-wall'`) takes the first click as a corner, previews the closed room live as you aim, and on the second click calls the same `buildingManager.addWallPath(..., closed: true)` with `rectangleWallPoints(a, c)`, the four corners in order. So targeting, levels, the building grid, the live preview and E customise (height and thickness) all match Poly Wall. Undo removes the whole room in one step, and the result is an ordinary closed wall path that saves, syncs and edits like any other.
- **Snapping.** Corner Walls only snaps to existing wall corners. B turns that on and off, and the badge reads "WALL CORNER SNAP". Poly Wall's axis snap would line the opposite corner up with the first one and flatten the room, so it isn't used.
- **Rules.** The opposite corner has to differ from the first in both directions ("Pick the opposite corner"). Each side has to be at least the minimum wall length ("Room is too small"), and both corners have to be on the same foundation. If a room can't be built, the tool keeps the first corner so you can pick another. Backspace or right click starts again.
- **HUD.** "CORNER WALLS", "Click: First corner" / "Click: Opposite corner", and the room's size in metres as you aim.
- **Wiring.** `ToolId` gains `'corner-wall'`, which is customisable with E and uses Poly Wall's customise preview. `ThreeScene` registers a second `PolygonWallTool` with `shape: 'rectangle'`. The tutorial's walls step now teaches Corner Walls first, then Poly Wall. Help lists it under its own heading.

## Tests

- Unit:
  - `cornerWalls.spec.ts`: the corners come in order from the first click, it works for every diagonal, and every side is axis-aligned with no crossing.
  - `hotbarSlots.spec.ts` and `BuildToolManager.spec.ts`: Corner Walls is the default, and the order and counts of the other subtools are updated.
- E2E `tests/cornerWalls.e2e.ts`:
  - Slot 2 opens on Corner Walls.
  - A second click in line with the first builds nothing.
  - The opposite corner builds one closed 4-wall path with the expected corners.
  - Undo removes it, and ↓ still reaches Poly Wall and Wall.
- The existing slot 2 e2e tests (`game`, `barriers`, `skirting`, `touchControls`) are updated for the new order.
- In the in-app browser, the room was previewed and built on a foundation (clean mitred corners).

## Upper-floor walls need support below

On the ground floor, walls can go anywhere on the foundation. On upper floors, by default, every part of a new wall (Corner Walls, Poly Wall or Wall) has to stand on something from the storey below:
- a ceiling, floor or flat roof (its edges count, but its stair openings don't), or
- the top of a straight wall or wall run.

A support counts when its top is within 0.4 m below or 0.05 m above the new wall's base, so a ceiling set a little lower still holds the floor above. It's a pure function, `building/upperWallSupport.ts` (`wallSupportFor(building, baseY, gridSize, thickness)`). It samples each new segment every half grid cell, and a sample is held up if it's within a support wall's footprint (half of each thickness) or on a slab. All the data it needs is already in the foundation's local grid.

How each tool uses it:
- **Corner Walls and Poly Wall:** a first point over thin air isn't taken. The next segment, the closing segment, or the whole rectangle has to be held up. Otherwise the preview turns red with "Needs a ceiling, floor or wall below".
- **Wall:** same idea for its start point and the wall itself.

The rule lives in the tools, not in `BuildingManager`, so saved worlds, undo and other players' builds load exactly as before. It's on by default: `BuildingSettings.upperWallsNeedSupport` is shown as Settings → Building → Walls → "Upper-floor walls need support below". A saved setting missing the field counts as on.

**Tests:**
- `upperWallSupport.spec.ts`:
  - The ground floor is unrestricted.
  - Walls on top of walls below work, all the way round and at corners.
  - Ceilings and their edges hold walls, but not over a stair hole.
  - Overhangs and open rooms are refused.
  - A slightly lowered ceiling counts. Half-height walls and supports two storeys down don't.
  - Straight walls below count.
- `cornerWalls.e2e.ts`: on the first floor, an overhanging room and a first corner over thin air are refused with the reason shown. The same room on top of the walls below is built at 3 m up.

