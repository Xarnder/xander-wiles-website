# Forest Drift — Basements and Joined Foundations: Brief

**Feature cycle:** 2026-11-18
**Status:** **Approved (2026-11-18).** Decisions are locked in [`01-questions-and-decisions.md`](01-questions-and-decisions.md): up to three basement storeys (Q1), the rest as recommended. In progress: [Phase 0](../phase-0/implementation.md) and [Phase 1](../phase-1/implementation.md) complete (2026-11-18).
**Related:** [`01-questions-and-decisions.md`](01-questions-and-decisions.md) · [`02-technical-plan.md`](02-technical-plan.md) · builds on [Corner Walls](../../../11-09/corner-walls.md) and the README's "Building system" and "Building levels" sections

Paths are relative to `pages/Forest-Drift/`.

---

## 1. The idea in one paragraph

Today a foundation is a solid stone (or earth) block, levelled to the highest ground under it, and everything built on it has to stay on it. This cycle adds two things:

- **Basements.** A foundation can have up to three storeys **below** its top:
  - stone walls round the edge, a stone floor at the bottom, floors between the storeys;
  - the foundation top becomes a floor over them.

  Players go down by stairs, and `[` from the Ground Floor goes to **Basement**, then **Lower Basement** and **Deep Basement**.

- **Joined foundations.** Two foundations that touch along an edge, at the same height, can be **joined** into one building:
  - one set of storeys;
  - walls, floors, ceilings, roofs, stairs, floor detailing, skirting and fences can cross the join;
  - the seam between the two blocks disappears.

  An L-shaped house, a barn built onto a cottage, or a hall added later all become possible. Two buildings with a gap between them are connected by placing a foundation in the gap that joins both.

## 2. The user problem

| Today                                                                                                                 | Why it's a problem                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| There is no way to build below ground. The code says so: "there are no basements yet".                                | Cellars, cellars under towers and walk-in storerooms can't be made. Players dig with the shovel and find nothing under a house. |
| A foundation is at most 64 × 64 terrain cells and always a rectangle.                                                 | L-, T- and U-shaped houses mean several foundations, which can't share anything.                                                |
| Every wall, floor, roof and stair tool refuses to cross onto another foundation ("Must stay on the same foundation"). | A room can't span two foundations. A roof can't cover both. Adding a wing means a second, separate house.                       |
| Each foundation takes its height from its own highest ground.                                                         | Two touching foundations almost never line up, so there's a step at the seam and the floors don't match.                        |
| Each foundation has its own storeys, and the foundation frame posts and beams are drawn on every edge.                | Even when heights match, the First Floor of one isn't the other's, and a timber seam runs through the middle of the floor.      |

## 3. Goals

1. **Basements** [Q1, Q2]: a foundation can have one to three basement storeys, each 2.5–4.5 m tall, chosen when placing it (Foundation tool, `E`) or added later to an existing foundation.
2. **Real underground space:** no terrain inside a basement, stone walls round it, a stone floor, collision and walking that work as in any room.
3. **Getting down:** stairs up to the storey above cut their own opening in its floor, as stairs between storeys do now. `[` / `]` and the floor selector reach every basement storey.
4. **Joining** [Q3, Q4]: placing a foundation against another lines it up to the same height and joins them; existing touching foundations can be joined or separated with the Foundation tool.
5. **One building:** joined foundations share storeys, and everything the build tools make can cross the join [Q6].
6. **A clean seam:** no frame posts, top beams or block faces along a join, and no step.
7. **Online** [Q11]: basements and joins sync to everyone in the room, like any other build.

## 4. Non-goals (v1)

- More than three basement storeys.
- Doors and windows in basement outer walls on slopes ("walk-out" basements): later (Q2).
- Bridges or walkways across a gap between buildings: a joining foundation in the gap does the job (Q7).
- Joining foundations at different heights as a split-level building (Q4's alternative).
- Joining foundations that only touch at a corner.
- Digging a basement with the shovel. The shovel still shapes the ground outside.
- Water in basements, flooding or damp.

## 5. What players get

**Basements**

- **Foundation tool, `E`:** a new **Basement** section:
  - **Storeys:** _None_, 1, 2 or 3;
  - **Storey height:** 2.5–4.5 m, default 3 m, the same for each basement storey.
- **Adding one later:** aim the Foundation tool at an existing foundation and press `B` to add a basement with the `E` panel's settings. The hint says "B: Add basement (2 storeys, 6 m)". Pressing `B` again removes the basement, but only while nothing is built down there.
- **Inside:**
  - stone walls on all four sides, a stone floor at the bottom and the underside of the floor above;
  - with two or three storeys, a floor between each, already built. They're ordinary floors: remove one for a double-height cellar hall;
  - dark until lit, like any closed room (torches and lanterns work);
  - every build tool works there as on the Ground Floor.
- **Getting there:** build stairs from each basement storey up to the one above. They cut a hole in the floor above, framed like any stair opening. `[` from the Ground Floor selects **Basement**, then **Lower Basement**, then **Deep Basement**.
- **From outside:** a house with a basement looks the same as one without. On a slope, the basement's stone wall shows where the ground falls away, like a foundation's side does now.

**Joined foundations**

- **Placing a foundation against another:**
  - the preview's top lines up with its neighbour's;
  - the hint says "Joins Cottage";
  - when placed, it's one building with its neighbour, seam gone.
  - Hold `Alt` while placing to keep it separate.
- **When the new one would be higher than its neighbour** [Q4]: it can't be lowered into the ground, so the preview says "1.4 m above Cottage: R raises Cottage to match". Raising lifts the whole cottage and everything on it.
- **Existing touching foundations:** aim the Foundation tool at a seam and press `L` to join them, or `L` on a joined seam to separate them, which works only while nothing crosses it.
- **Building across:**
  - walls, Corner Walls and Poly Wall, ceilings, floors and roofs, stairs, planks and tiles, skirting and fences can start on one foundation and end on another;
  - each storey is at the same height across the whole building.
- **Two basements joined:** if both have the same basement storeys (count and height), they become one basement. The stone wall between them goes, and you can walk from one to the other.
- **Removing:** deleting a joined foundation (Remove, "Confirm Delete") also deletes anything crossing onto it. The confirmation says how many pieces that is.

## 6. Delivery

| Phase | What                                                                                                                                                                                                      | You can see                                                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 0     | Groundwork: the save format; terrain with holes under basements; walking and collision below a foundation's top; the pure maths for joins (shared edges, the building's outline, inside tests). Measured. | A dev page showing a hole-cut terrain chunk and joined outlines; numbers |
| 1     | Basements: the Foundation tool choice and `B`, one to three storeys, the stone walls and floors, the basement storeys in the floor selector, stairs down, undo, save and load.                            | Build a cellar and walk into it                                          |
| 2     | Joining: lining up and joining on placement, `L`, raising to match, shared storeys, every tool across the join, the clean seam, joined basements, removing.                                               | Build an L-shaped house with one roof                                    |
| 3     | Online and release: shared rows, the room's checks (a server deploy, when you say), three browsers, touch, a slower machine, docs and the final record.                                                   | Phase records with screenshots and numbers                               |

Each phase ends with screenshots and a record. I commit and push when you say. Phase 3 needs a server deploy, which I'll only do when you ask.
