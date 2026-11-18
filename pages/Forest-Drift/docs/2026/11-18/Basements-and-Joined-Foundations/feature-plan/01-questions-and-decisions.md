# Forest Drift — Basements and Joined Foundations: Questions and Decisions

**Feature cycle:** 2026-11-18
**Status:** **Locked (2026-11-18).** You answered Q1–Q4 in chat as multiple choice: Q1 **up to three storeys** (not the recommended one storey), Q2–Q4 as recommended. Q5–Q12 take their recommended defaults unless you say otherwise.
**Related:** [`00-brief.md`](00-brief.md) · [`02-technical-plan.md`](02-technical-plan.md)

---

## Locked decision summary

| Q   | Topic                               | Status                | Decision (locked)                                                                                                                                        |
| --- | ----------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | How deep basements go               | Answered              | **Up to three storeys** (Basement, Lower Basement, Deep Basement), one storey height for all, 2.5–4.5 m (default 3 m). Floors between them come built.   |
| Q2  | Doors and windows in basement walls | Answered              | **Later.** v1 basements are closed; stairs are the way in.                                                                                               |
| Q3  | How foundations join                | Answered              | **Automatically when placed against one**, matching its height; `L` on a seam joins or separates existing ones.                                          |
| Q4  | Neighbours at different heights     | Answered              | **Raise to match:** a new foundation rises to meet a higher neighbour; a lower neighbour is raised only when you press `R`. No split-level joins.        |
| Q5  | Making a basement                   | `Recommended default` | Chosen in the Foundation tool's `E` panel, or added to an existing foundation with `F`.                                                                  |
| Q6  | What can cross a join               | `Recommended default` | Everything the build tools make: walls, wall paths, ceilings, floors, roofs, stairs, floor detailing, skirting, fences. Mini Builds already go anywhere. |
| Q7  | Buildings with a gap between them   | `Recommended default` | Fill the gap with a foundation that joins both. No bridges in v1.                                                                                        |
| Q8  | Removing a joined foundation        | `Recommended default` | Deletes what crosses onto it too, and the confirmation counts it.                                                                                        |
| Q9  | Two joined basements                | `Recommended default` | Same storeys (count and height): one basement, no wall between. Otherwise: kept apart by their walls.                                                    |
| Q10 | Storeys in a joined building        | `Recommended default` | One shared set, the existing building's. Each foundation's own storeys come back if separated.                                                           |
| Q11 | Online                              | `Recommended default` | Shared like other builds; world format v11; one server deploy, when you say.                                                                             |
| Q12 | Phases and tests                    | `Recommended default` | Phases 0–3 as in the brief, with unit, e2e and performance tests.                                                                                        |

---

## Q1: How deep basements go

**Answered: up to three storeys.**

- **Storeys:** one, two or three, as levels −1 **Basement**, −2 **Lower Basement** and −3 **Deep Basement**.
- **Height:** one storey height for all of a basement's storeys, 2.5–4.5 m (default 3 m), so a basement is 2.5–13.5 m deep.
- **Floors between storeys** come built, as ordinary floor slabs. A player can remove one for a double-height hall, or cut it with stairs.
- **Outer walls and terrain hole** run the full depth.

Also offered:

- One storey (recommended at the time): simpler levels, nothing below −1.
- A fixed 3 m single storey.

The level code now supports negative levels down to −3, created from the basement rather than from `defaultStoreyHeight`.

## Q2: Doors and windows in basement walls

On a slope, the ground outside one side of a basement can be lower than the basement floor (a "walk-out" basement). The stone wall shows there.

**Answered: later (as recommended).**

- **Later.** In v1, the basement's outer walls are part of the foundation, like its sides today, with no openings. Stairs are the way in. It keeps the outer walls simple and joinable (Q9).
- **Alternative: in v1.** Doors and windows can go in a basement's outer wall, but only where the ground outside is below the opening all the way along. That means storing openings on the foundation, and checking the ground when the shovel changes it. Adds about half a phase.

## Q3: How foundations join

**Answered: automatically when placed against one (as recommended).**

- **Automatically when placed against one.**
  - The preview lines its top up with the neighbour's and says "Joins Cottage". Hold `Alt` to keep it separate.
  - `L` on a seam joins existing touching foundations at the same height, or separates them (only while nothing crosses the seam).
- **Alternative: only with `L`.** Placing never joins, and the player joins afterwards. This is more predictable, but it's an extra step every time, and it has no height lining-up on placement.
- **Alternative: merge into one foundation.** Only works when the two make a rectangle, so no L-shapes. Not recommended.

## Q4: Neighbours at different heights

A stone foundation can't sit below the ground under it, because the ground would show through the floor. So a join can only raise foundations, never lower them.

**Answered: raise to match (as recommended).**

- **Raise to match.**
  - A new foundation lower than its neighbour rises to meet it (up to 3 m).
  - A new foundation higher than its neighbour is placed separately, and the preview offers "R raises Cottage to match". Raising lifts that foundation and everything on it, because everything is stored relative to the foundation's top.
- **Alternative: split-level joins.** Foundations at different heights can join; storeys stay separate, but stairs can cross the join. More flexible, and much more to build and test (two sets of storeys in one building).
- **Alternative: refuse** different heights entirely. The player has to find flat ground.

## Q5: Making a basement

- **Default:** the Foundation tool's `E` panel has **Basement storeys: None / 1 / 2 / 3** and a storey height slider.
  - Aiming the Foundation tool at an existing foundation shows "F: Add basement (2 storeys, 6 m)" with the panel's settings, or "F: Remove basement" when it has one and it's empty (nothing but the floors it came with).
  - Adding a basement under a built house is fine: nothing on the Ground Floor moves.
- **Alternative:** only when placing.

## Q6: What can cross a join

- **Default:** everything the build tools make. A piece belongs to the foundation it starts on, and can reach onto any foundation joined to it.
- **Alternative:** walls and floors only, with roofs and stairs kept on one foundation.

## Q7: Buildings with a gap between them

- **Default:** place a foundation in the gap. It joins both neighbours, so the two buildings become one, with nothing new to learn.
- **Alternative (later):** a bridge or walkway piece across a gap, at any storey.

## Q8: Removing a joined foundation

- **Default:** "Confirm Delete" deletes the foundation, everything on it, and any piece that crosses onto it from a neighbour. The confirmation says "…and 3 pieces that cross onto it". The rest stay joined.
- **Alternative:** refuse while anything crosses onto it.

## Q9: Two joined basements

- **Default:** two joined basements with the same storeys (count and height) become one basement. The stone walls follow the outside of the joined shape, so there's no wall between them. Otherwise each keeps its own walls.
  - A joined building where only some foundations have basements has its basement storeys only over those. Tools on a basement storey only build inside a basement.
- **Alternative:** each basement keeps all four walls, and players build stairs or doorways themselves (not possible without Q2).

## Q10: Storeys in a joined building

- **Default:** a joined building has one set of storeys, the existing building's: the one you place onto, or with `L`, the one with more foundations.
  - Pieces already built keep their exact heights.
  - Separating the foundations again gives each one back its own storeys.
- **Alternative:** keep each foundation's storeys and pick by where you aim, as now. Storeys of the same number could then be at different heights in one building.

## Q11: Online

- **Default:** basements and joins are fields on the foundation's shared row. The basement's floor above is a shared slab row. Two people can work in the same basement as in any room.
  - World format v11.
  - Rooms only accept v11 clients, because an older client would draw a basement as solid stone.
  - One server deploy, which I only do when you say.
- **Alternative:** offline only in v1.

## Q12: Phases and tests

- **Default:** Phases 0–3 as in the brief.
- **Tests:**
  - unit tests for the join maths, basement maths, terrain holes, walking and collision, saves and migration;
  - e2e in Chromium, WebKit and Firefox (build a basement and walk down; join, build across and roof over; separate; remove; undo; reload; online two-browser);
  - terrain rebuild time and frame time with basements and joined buildings, measured.
