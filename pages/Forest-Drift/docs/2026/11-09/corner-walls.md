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
