# Forest Drift — Find a Biome: Brief

**Feature cycle:** 2026-11-16
**Status:** **Approved (2026-11-16).** Decisions are locked in [`01-questions-and-decisions.md`](01-questions-and-decisions.md). Complete (2026-11-17): [Phase 0](../phase-0/implementation.md), [Phase 1](../phase-1/implementation.md), [Phase 2](../phase-2/implementation.md).
**Related:** [`01-questions-and-decisions.md`](01-questions-and-decisions.md) · [`02-technical-plan.md`](02-technical-plan.md) · builds on the [Biome Minimap](../../Biome-Minimap/feature-plan/02-technical-plan.md) and [Fast Travel](../../Fast-Travel/feature-plan/02-technical-plan.md)

Paths are relative to `pages/Forest-Drift/`.

---

## 1. The idea in one paragraph

The full map shows the biomes and lets you travel anywhere, but finding a particular biome still means scanning the map by eye, and rare ones may be off-screen. **Find a biome** adds a **Biomes** list to the full map:

- all 26 biomes in their groups, each with its map colour and **how far away the nearest one is**;
- pick one and the map centres on the nearest patch and drops a pin **well inside it**, ready for **Travel here**;
- **Next nearest** steps to the next separate patch.

Biomes with none within 16 km are greyed out, so players know not to look.

## 2. The user problem

| Today                                                                                     | Why it's a problem                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| The map has no legend: a colour can't be told from its neighbours without pointing at it. | "Which of these is Savanna?" means hovering over patches one by one.      |
| Rare biomes (Cherry Grove, Bamboo Jungle, Snowy Slopes) can be several kilometres off.    | Panning a 16 km map looking for a small pink patch is slow and uncertain. |
| Nothing says a biome isn't nearby at all.                                                 | Players keep looking for something that isn't there.                      |

## 3. Goals

1. **A legend** [Q1]: every biome's name and colour on the full map, in the same groups as the docs.
2. **How far** [Q5]: the distance to the nearest patch of each biome, or "None within 16 km" [Q3].
3. **Find** [Q2, Q6]: pick a biome and get a pin well inside its nearest patch, with the readout and **Travel here** from fast travel.
4. **Next nearest** [Q4]: up to five separate patches, at least 1 km apart.
5. **Keyboard** [Q7]: `B` opens the list, arrows and `Enter` pick, `N` goes to the next nearest.
6. **Costs nothing in play**: all searching happens in the map's background worker, only while the full map is open.

## 4. Non-goals (v1)

- The minimap stays as it is (Q8).
- Highlighting every patch of a biome on the map (Q2 chose the pin only).
- Searching past 16 km (Q3).
- A search box (Q1 chose the list).
- Anything online: biomes come from the seed, so there are no server changes and no deploy.

## 5. What players get

- A **Biomes** button (and `B`) on the full map opens a list on the left:
  - five groups (Temperate, Cold, Tropical, Warm and dry, Wet);
  - each biome shows a colour swatch, its name and "2.4 km", nearest first within its group;
  - biomes with none in range are greyed out with "None within 16 km";
  - the biome you're standing in is marked "Here".
- **Pick a biome:**
  - the map centres on its nearest patch and drops a pin well inside it;
  - the readout says "Nearest Desert: 2.4 km north-east";
  - **Travel here** works as it does now.
- **Next nearest** (or `N`) moves the pin to the next patch out, up to five. After the last, it says so.
- **Biomes-off worlds:** no Biomes button.

## 6. Delivery

| Phase | What                                                                                                                          | You can see                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 0     | The search in the map worker: a scan for every biome's nearest patch, finding a spot well inside, the next patches. Measured. | Numbers, and results drawn on the dev preview page |
| 1     | The Biomes list on the full map, picking, the pin, Next nearest, keys, screen-reader text.                                    | Find a biome in the game                           |
| 2     | Release pass: three browsers, touch, a slower machine, docs and the final record.                                             | Phase records with screenshots and numbers         |

Each phase ends with screenshots and a record. I commit and push when you say. No server deploy is needed.
