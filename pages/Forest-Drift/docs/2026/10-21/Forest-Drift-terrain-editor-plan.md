# Forest Drift — shovel terrain editor plan

Date: 21 October 2026<br>
Status: Proposed design only. No game implementation is authorised by this document.

## 1. Recommended behaviour

Add a shovel that raises and lowers the existing terrain surface. Keep terrain as a heightfield: every horizontal position has one ground height. There are no caves, tunnels, overhangs, holes through the mesh, or voxel terrain.

**Buildings stay where the player built them.** Neither shovelling nor placing a grass foundation moves an existing foundation top, its building origin, or its walls, floors, furniture and interaction locations.

Stone foundations act as retaining walls. Lowering adjacent ground reveals more masonry; raising adjacent ground can approach the foundation top but cannot bury its usable surface. Grass foundations are protected flat pads with editable surroundings. All terrain-producing tools must use one shared foundation constraint system.

These are recommended rules for the first release, not descriptions of features already implemented.

## 2. What exists today

Relevant code inspected:

- `src/lib/game/terrain/TerrainHeightSampler.ts`: procedural terrain and hydrology are sampled through one height function; it now supports a height modifier.
- `src/lib/game/terrain/TerrainManager.ts`: edited areas can rebuild nearby chunks and advance the terrain revision.
- `src/lib/game/building/EarthFoundationField.ts`: spatially indexed grass foundation footprints and smooth surrounding banks. It does not currently enforce stone-foundation protection.
- `src/lib/game/building/FoundationManager.ts`: foundation definitions, visible stone meshes, grass-pad targeting proxies, support queries and vegetation exclusions.
- `src/lib/game/building/foundationMath.ts`: placement chooses the highest sampled footprint height. Existing load-time support logic extends a stone foundation downward when necessary; this is not yet a complete live terrain-edit support system.
- `src/lib/game/world/WorldValidation.ts`: saved foundation validation.
- `src/lib/game/building/BuildUndoManager.ts`: an existing small build-action undo mechanism. Terrain strokes need a deliberately designed transaction path rather than one undo entry per terrain point.

The shovel should extend this architecture rather than create a second ground surface or an unrelated collision mesh.

## 3. Shovel interaction

Provide a dedicated shovel tool in the build/tool selection UI, without silently replacing an existing hotbar assignment. Final key/slot assignment should follow a control-binding audit.

Suggested controls while the shovel is selected:

| Input | Action |
| --- | --- |
| Primary action / left mouse | Raise ground |
| Secondary action / right mouse | Lower ground |
| Hold either action | Repeat small, fixed increments at a capped rate |
| E | Open shovel settings |
| Escape | Cancel the active uncommitted stroke or close settings |
| Existing undo/redo bindings | Undo or redo one complete stroke |

Use explicit Raise, Lower and Apply controls on touch screens. Do not depend on hover, right-click or pointer lock there. Route these through the same edit commands as desktop input.

Initial settings: brush radius, strength, and single-point versus soft-brush mode. Suggested starting values, subject to playtesting: 0.125m height steps, 0.5–4m brush radius, and 8 held-action ticks per second. Integrate input by fixed ticks, not rendered frames, so a fast computer does not dig faster.

Single-point mode selects the nearest authored terrain lattice point and moves it vertically, subject to neighbouring-slope constraints. Soft brush affects several points with a smooth falloff. Keep point markers and the brush outline local to the area being edited; do not draw the entire world's grid.

Flatten, Smooth, soil inventory, stamina and excavation resources are later features. The first version should make raising and lowering reliable.

### Preview and feedback

Show the resulting terrain shape before committing it, including adjustments required near foundations. Highlight constrained points in amber and forbidden regions in red. Examples of useful messages:

- “Stone foundation: ground cannot cover the top.”
- “Grass foundation: this building surface is locked.”
- “Maximum safe bank slope reached.”
- “This edit would leave an unsupported object.”

A limited brush stroke may still affect its valid points. Show the limited result clearly; if nothing can change, create no history entry. Never accumulate invisible height changes behind a clamp.

One press–drag–release gesture is one stroke. Pointer cancellation, focus loss, tool switching, opening a menu or disconnecting must end or cancel it consistently; no background digging may continue.

## 4. Stone foundations: fixed top, adaptable buried support

### Directly underneath stone

Block shovel edits inside its footprint. Do not dig beneath a building and pretend a tunnel exists. Do not record hidden edits that only become visible when the foundation is removed.

Protect the terrain along the footprint boundary from rising above the top. A provisional 0.05m reveal below the stone top gives a clean visible edge and reduces coplanar surface artefacts. Tune this visually and test small character steps before treating it as final.

### Lowering beside stone

Allow excavation outside the footprint. The foundation's top stays fixed and its visible side becomes taller. Recompute the required buried masonry depth immediately for the affected foundation, including terrain contact along its perimeter. Maintain a provisional 0.5m buried overlap beneath the lowest contacting terrain.

The new support must update in the same transaction as terrain, picking, bounds and collision. Do not wait for a save/reload to repair a floating foundation. Sample triangle-edge intersections as well as lattice points so a diagonal contact cannot leave a gap.

Treat this as extending a retaining wall, not adding columns or simulating structural collapse. Limit how much can be exposed: a provisional 4m maximum exposed masonry height is a useful starting point. Once this limit or the bank-slope limit is reached, stop further excavation with visible feedback. Large legacy foundations should remain loadable; edits must not make an existing violation worse.

### Raising beside stone

Allow soil to cover more of the side, but not the top or the building. Constrain the bank to meet the protected edge height and blend outward smoothly. Do not simply clamp the last row of vertices: that would produce a sharp lip or a vertical terrain wall.

Prevent newly raised ground from obstructing ground-level doorways or intersecting occupied building volumes outside the foundation footprint. Doorway clearance checks should use actual doorway and approach geometry, not assume every foundation edge is a door.

### Buried depth and undo

Separate the authored minimum base depth from the effective support depth derived from current terrain. The effective depth is the lower of the authored base and the required terrain-contact depth. It may return upward when the terrain is restored, but never above the authored base.

This avoids the current “only deepen” load-time behaviour permanently ratcheting foundations downward after repeated dig/undo cycles. Undo must restore terrain and derived support consistently without moving the building top.

## 5. Grass foundations and foundation interactions

### Grass foundation interior

Its footprint stays exactly at its saved top height. Block shovel edits there, even when the pad is empty. Do not silently raise a grass foundation together with everything built on it.

To change its level, remove it through the existing foundation deletion flow, edit the terrain, and rebuild. A future explicit “change foundation elevation” operation would need to move the entire building hierarchy safely and is outside this plan.

Continue clearing grass blades from the pad while retaining the procedural grass ground texture.

### Grass foundation banks

Allow shovelling outside the footprint, including the existing automatic bank. Manual edits there should visibly change the bank; they must not be silently overwritten by the grass foundation's current raise-only blending rule.

A bank still has to connect continuously to the flat pad and satisfy the slope limits. If the brush cannot produce the requested depth within those constraints, show and commit only the feasible change.

### New grass foundation beside existing stone

1. Determine the requested flat pad height using the normal placement rules.
2. Find existing foundations and other constraints within the full proposed bank area.
3. Keep all existing foundation tops fixed.
4. Shape the new bank around stone, retaining the stone top reveal and any doorway clearance.
5. Extend the stone's buried support if the final ground contact requires it.
6. Preview the complete result, including the affected existing foundation.
7. Reject placement if there is not enough room for a valid transition within the bounded blend area.

Do not let a newly placed grass pad bury an older stone pad merely because its automatic bank has a higher target. Do not unexpectedly lower the new pad's requested top to make it fit. The player can choose another footprint or prepare the site first.

### Overlaps and touching foundations

Reject new overlapping foundation interiors, including stone over grass, grass over stone and grass over grass. Distinct touching edges are allowed if their fixed heights and clearance rules admit a continuous, safe transition. A grass pad next to a stone edge may need to sit slightly below the stone top to preserve the reveal.

For existing saves with overlapping pads, preserve their authored definitions. Use a stable compatibility rule: the existing highest support surface remains authoritative, with IDs breaking exact ties. Mark conflicting regions as protected and reject new edits that worsen the conflict. Loading a legacy save must not relocate its buildings.

### Removing foundations

- Removing stone removes its protection and retaining wall; it does not erase unrelated shovel edits.
- Removing a grass foundation removes its automatic pad and bank contribution. Previously committed manual terrain remains, including manual landscaping beside it.
- Manual terrain that existed before a grass pad covered it may be revealed when that pad is removed. Newly attempted edits beneath the protected pad are never recorded.
- Preview terrain restoration and run support/occupancy checks before deletion completes. Do not strand the player or invalidate a neighbouring foundation.

## 6. One terrain composition and constraint pipeline

Recommended evaluation order:

1. Seeded procedural terrain and existing hydrology carve.
2. Automatic grass-foundation pad/bank candidates.
3. Committed manual target heights, interpolated on a canonical edit lattice.
4. Protected foundation interiors, stone contact-height limits and occupied-space constraints.
5. A bounded local transition solve for feasible neighbouring slopes.
6. Final mesh heights, normals, colours, terrain collision and surface queries.

Manual edits are **target heights at authored lattice points**, not a stream of additive operations replayed forever. A shovel tick starts from the currently visible final height, proposes an increment, and stores the accepted result. This allows lowering an automatic grass bank while avoiding feedback where repeatedly resampling the bank adds more fill.

Keep automatic pads as recipes and manual edits as sparse data. Do not bake grass-foundation fill into manual edits simply by placing a pad. Masking previously authored terrain beneath a new pad must be reversible.

The final constraint projection must be deterministic and independent of foundation iteration order. Specify fixed iteration limits and convergence tolerances. If it cannot converge in the allowed area and work budget, reject the proposed edit rather than leaving an arbitrary partly solved result.

Suggested initial bank limit: about 35° for edited exposed terrain. This is a product starting point, not a claim about the current controller's exact walkable slope. Audit controller limits and leave a safety margin. Steep existing natural terrain remains valid; the tool should not globally flatten mountains.

Use a finite transition halo. Do not allow slope relaxation to spread across an unbounded region or alter distant buildings. All secondary terrain changes in the halo must appear in the preview and belong to the same undo transaction.

## 7. Data model, saving and multiplayer

Define an immutable world-space edit lattice, initially aligned with the world's terrain lattice. Its origin and spacing belong to the saved world, not to a graphics-quality setting. Changing render chunk resolution must not move authored points or foundations. Rendering and collision must resolve edited detail sufficiently; do not promise single-point dents that a coarse visible mesh cannot represent.

Persist sparse, quantised target heights in chunk-addressed records, with a terrain-edit format version and lattice metadata. Keep absent records equivalent to unedited terrain. Suggested height quantum: 0.03125m; shovel steps are multiples of it. Reject non-finite values, invalid coordinates, excessive edit extents and oversized payloads before allocating buffers.

Save recipes and committed points, not Three.js meshes, normals or textures. Store any material disturbance masks separately from height. Old worlds load with no manual records and retain their existing foundations.

Each transaction includes the changed height records and relevant consequences: disturbed ground, any explicit object relocation, and foundation changes that are not purely derived. Record before/after values. Redo must reproduce the accepted result rather than rerunning the brush against potentially different terrain.

Use bounded history by bytes and stroke count. Compress consecutive changes to one point within a stroke. Autosave only completed transactions; an interrupted save must not persist half a stroke.

For multiplayer, edits need authority-side validation and region revisions. Send compact accepted patches rather than every held-input event. Reject or rebase conflicting strokes, enforce the same foundation rules remotely, and broadcast dependent changes atomically. Preview may be local; committed terrain cannot depend on client frame rate.

## 8. Water, vegetation and existing objects

**Water:** do not implement dynamic fluid simulation in the first release. Lock editing inside active river/lake basins, shore-transition zones and a safety margin based on the actual water system. Reject edits that expose a water volume or block a channel. Wet-area editing should wait for an explicit hydrology regeneration and flooding design.

**Grass and textures:** retain the current procedural terrain material and world-space texture mapping. No per-stroke texture generation. Clear grass blades in the actually edited footprint; reuse deterministic vegetation exclusion machinery. Surface colour can show mild disturbed earth without replacing the underlying material system. Grass regrowth can come later; persistent disturbance is simpler initially.

**Trees and substantial plants:** initially protect root footprints. Ask players to remove a tree before digging through it rather than automatically uprooting or floating it. Small ground cover can regenerate in affected cells.

**Placed objects:** protect the support footprint of loose furniture, Mini Builds, paths and other authored ground-supported objects in the first version. Do not move them automatically during a shovel stroke. Buildings attached to foundations continue to use their fixed foundation coordinates. Dynamic characters and creatures resample support; validate that a rising surface cannot trap them under a ceiling.

The edit preflight must check objects throughout the transition halo, not just at the brush centre.

## 9. Performance and rendering

- Spatially index edits and foundation constraints; an ordinary height query must not scan the world's complete edit history.
- Maintain one authoritative sampled surface for mesh generation, player grounding, tool raycasts, placement and vegetation.
- Rebuild only dirty chunks and the necessary border/normal halo. Shared world-space samples must produce matching chunk-edge heights and normals.
- Coalesce repeated held-input changes. Use a bounded work queue or worker for large brushes; cancel stale preview jobs.
- Publish mesh, collision and dependent support updates together. Keep the previous committed state active until the new state is ready rather than letting the player walk on invisible edits.
- Reuse typed arrays, geometry buffers, terrain materials and procedural textures. No additional mesh per shovel stroke and no extra terrain material per edited patch.
- Profile preview generation, commit work, upload time, memory growth and dirty-region size on desktop and mobile. Set release budgets from measurements; a proposed starting preview target is a small fraction of one 16.7ms frame, not an unverified performance promise.

## 10. Implementation sequence — not started

1. **Specify invariants and fixtures:** canonical lattice, foundation contact rules, slope limits, occupancy checks, and legacy overlapping-foundation policy.
2. **Build pure terrain composition:** sparse manual targets, automatic banks, deterministic constraints, bounded dirty regions, and query tests.
3. **Add live stone support:** derived effective base depth and consistent geometry, picking and collision updates.
4. **Integrate grass foundations:** constrained bank placement, editable banks, removal restoration and infeasible-placement feedback.
5. **Add shovel interaction:** brush preview, point mode, settings, desktop/touch controls, stroke transactions and cancellation.
6. **Add persistence and history:** validation, migrations, undo/redo, reload and multiplayer authority integration where applicable.
7. **Integrate dependants:** grass exclusion, protected roots/objects, water restrictions and character safety.
8. **Verify and tune:** visual checks, performance measurements, error feedback and edge-case testing.

## 11. Acceptance scenarios

| Scenario | Required outcome |
| --- | --- |
| Raise/lower bare ground | Visible mesh and collision agree; no caves or disconnected surfaces |
| Stroke across a chunk border | Continuous height, colour and normals; both sides update |
| Dig next to stone | Top/building unchanged; masonry extends down with no visible undercut |
| Dig beneath stone | Protected points do not change or accumulate hidden edits |
| Raise ground against stone | Bank stays below the protected top and cannot block a doorway |
| Place high grass pad beside low stone | Bank respects stone; infeasible placement is rejected |
| Dig beside a grass pad | Bank changes, flat core remains exact, no cliff at the edge |
| Competing banks | Deterministic, continuous result or a clear rejection |
| Maximum-depth or slope limit | Preview shows the limited result; no silent invalid commit |
| Remove a grass pad | Automatic fill is removed; authored manual terrain remains |
| Undo/redo a stroke | Terrain, support geometry, grass state and side effects restore together |
| Save/reload and chunk eviction | Identical edited heights and foundation tops after reconstruction |
| Resize render chunks/change quality | Authored coordinates and building positions do not shift |
| Water/root/object protection | Blocked edits are explained before committing |
| Cancel, lose focus or disconnect | No ongoing digging and no partial saved transaction |
| Large brush/repeated edits | Bounded allocations, dirty area, history and queued work |
| Legacy stone/overlapping pads | Existing saves remain usable without moving buildings |

## 12. Choices to confirm before implementation

The main recommendation is settled in this plan: fixed building tops, stone retaining-wall support, protected flat grass pads, and shared constraints for every terrain-changing tool.

The adjustable design choices are the shovel's hotbar location, exact brush sizes/rates, maximum digging depth, permitted exposed stone height, walkable bank slope, water safety margin and whether disturbed grass regrows. These can be tuned without changing the core foundation policy.
