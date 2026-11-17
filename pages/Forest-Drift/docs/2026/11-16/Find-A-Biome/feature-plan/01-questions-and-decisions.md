# Forest Drift — Find a Biome: Questions and Decisions

**Feature cycle:** 2026-11-16
**Status:** **Locked (2026-11-16).** You answered Q1–Q8 in chat as multiple choice, every one as recommended. Q9–Q12 take their recommended defaults unless you say otherwise.
**Related:** [`00-brief.md`](00-brief.md) · [`02-technical-plan.md`](02-technical-plan.md)

---

## Locked decision summary

| Q   | Topic                      | Status                | Decision (locked)                                                                                                    |
| --- | -------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Q1  | Where players pick a biome | Answered              | **A legend on the full map:** all 26, with colours, in their groups. No search box.                                  |
| Q2  | What picking does          | Answered              | **Pin the nearest patch:** centre the map on it and drop a pin, ready for Travel here. No highlight, no auto-travel. |
| Q3  | How far to search          | Answered              | **Up to 16 km.** None in range: greyed out, "None within 16 km".                                                     |
| Q4  | More than one patch        | Answered              | **Next nearest:** up to five separate patches, at least 1 km apart.                                                  |
| Q5  | What the legend shows      | Answered              | **Distance to the nearest** of each, from one background scan when the list opens; nearest first in each group.      |
| Q6  | Where the pin goes         | Answered              | **Well inside the patch:** at least 100 m in where possible, not on a border.                                        |
| Q7  | Keys                       | Answered              | **`B` opens the list, `N` next nearest;** arrows and `Enter` in the list. Only while the map is open.                |
| Q8  | The minimap                | Answered              | **Unchanged:** full map only.                                                                                        |
| Q9  | When to scan again         | `Recommended default` | The scan is kept while you stay within 250 m of where it ran; reopening the map after moving further scans again.    |
| Q10 | The biome you're in        | `Recommended default` | Marked "Here" at the top of its group. Picking it pins the nearest _other_ patch, so Travel here goes somewhere new. |
| Q11 | Variant biomes             | `Recommended default` | Listed with their parents (Cherry Grove under Meadow's group), like any other biome.                                 |
| Q12 | Phases and tests           | `Recommended default` | Phases 0–2 as in the brief; unit and worker tests, e2e in three browsers, screenshots and numbers.                   |

---

## Q9: When to scan again

- **Default:** keep the scan while you're within 250 m of where it ran. A 250 m move changes no distance by more than 250 m, and the list rounds to 0.1 km. Reopening the map after travelling or flying further runs a fresh scan.
- **Alternative:** scan every time the map opens. It's simpler, but repeats half a second of background work for nothing.

## Q10: The biome you're in

- **Default:** it's marked "Here". Picking it finds the nearest patch that _isn't_ the one you're standing in, since a pin under your own feet is no use.
- **Alternative:** picking it pins where you are.

## Q11: Variant biomes

Cherry Grove, Flower Forest, Old Growth Birch Forest, Silverwood, Sunflower Plains and Bamboo Jungle grow inside a parent biome.

- **Default:** they're listed in their group like any other biome, with their own distance.
- **Alternative:** indent them under their parent.

## Q12: Phases and tests

- **Default:** Phases 0–2 as in the brief.
- **Tests:**
  - unit tests for the search (fake biome layouts: nearest, inside spot, separate patches, range);
  - a worker test;
  - e2e in Chromium, WebKit and Firefox (list, pick, pin, Next nearest, keys, touch);
  - the scan's cost and how it delays tiles, measured.
