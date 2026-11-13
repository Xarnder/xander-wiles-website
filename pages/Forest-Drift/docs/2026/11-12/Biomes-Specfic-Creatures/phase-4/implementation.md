# Forest Drift — Biome-Specific Creatures Phase 4: Release Record

**Date:** 2026-11-13
**Plan:** [`../feature-plan/02-technical-plan.md`](../feature-plan/02-technical-plan.md) (revision 7) · earlier: [Phase 0](../phase-0/implementation.md), [1](../phase-1/implementation.md), [2](../phase-2/implementation.md), [3](../phase-3/implementation.md)
**Status:** All phases built. Phases 0–2 are on main (pushed); Phase 3 is committed locally (`91681dba`, not pushed); Phase 4 is not committed. Waiting on your review of the screenshot galleries.

## Performance pass

`tests/creatureSurfacePerformance.e2e.ts`, release test (opt-in, `CREATURE_BENCH=1`). It compares everything on with `?creatureCoats=off&creatureDetail=off`. Chromium on Metal, 1512×945 at 2×, vsync off. Numbers in [`creature-release-performance.json`](creature-release-performance.json).

| Scene                                       | Everything on | Coats and detail off | Budget (§14.1)             |
| ------------------------------------------- | ------------- | -------------------- | -------------------------- |
| Lab, 100 creatures: compile                 | 240 ms        | 228 ms               | ≤ +10% (measured +5%)      |
| Lab, 100 creatures: frame                   | 1.8 ms        | 1.9 ms               | —                          |
| Lab, 100 creatures: programs / draw calls   | 1 / 100       | 1 / 100              | 1 program, draws unchanged |
| Biome world near spawn (40 live): frame     | 5.03 ms       | 5.04 ms              | —                          |
| Biome world near spawn: draw calls          | 411           | 411                  | Unchanged                  |
| Full-screen close-ups, five coats (Phase 2) | 2.0–2.1 ms    | 2.0–2.1 ms           | Fragment cost ≤ +10%       |
| Coat function, per species                  | 0.007 ms      | —                    | ≤ 0.2 ms                   |

Every budget is met. The only measurable cost is compile time: +12 ms over 100 creatures, from feature colour and the coat values. Compilation stays behind the one-creature-per-frame queue.

## Docs

- **`docs/creature-system.md`:** a new section, "Biome coats and coat detail (November 2026)", covering profiles, region coats, the world and online path, morphs, saves, patterns, coat detail, switches and cost. The limits now note feature colour.
- **`docs/biomes.md`:** players learn how creatures follow biomes, that herds respawn on setting changes, and that the Main World now has biomes on. Developers get a "Creatures" section with paths and switches.
- **README:** the creature section points to both.

## The whole feature, as built

| Phase | What                                                                                                 | Commit                  |
| ----- | ---------------------------------------------------------------------------------------------------- | ----------------------- |
| 0     | 26 profiles plus neutral, OKLCh, region coats with species separation, Lab biome picker              | `fd7e629e` (with 1)     |
| 1     | Coats in the world, resolver, remote pellets, biome changes, `biomeCreatures` golden, new Main World | `fd7e629e`              |
| 2     | Coat micro-texture: fur, hide, scales, chitin, skin                                                  | `47678c26`              |
| 3     | Rosettes, reticulated, patches, speckle, saddle; feature colour; rare morphs                         | `91681dba` (not pushed) |
| 4     | Performance pass, docs                                                                               | not committed           |

## Verification (final)

- `npx vitest run`: **274 files, 3,063 tests pass**. `npm run check`: 0 errors. ESLint and Prettier clean on everything this feature changed.
- E2E, latest runs:
  - Determinism in Chromium, WebKit and Firefox (Phase 3).
  - Multiplayer in all three engines (Phase 1).
  - Chromium:
    - `creatures`;
    - `creatureQuality`;
    - `creatureBiomes`;
    - `creatureRiding`;
    - `defaultWorld`;
    - `rangedWeaponsMultiplayer`.
  - Two known timing-sensitive tests each failed once and passed on re-run:
    - riding "carry a small creature onto a mount";
    - "everyone else sees a pellet fly … 200 ms behind".

## Open

- **Your review** of the screenshot galleries in the Phase 0–3 records (definition of done, §21).
- **Not built (decided):** weather on coats (Q12, later), crease shading, extremities and rim light (Q9), a Vivid colour setting (Q8), biome-specific species mixes (Q1).
- **Known limits:**
  - Very pale or grey placed creatures come back slightly tinted, because saved recipes use the classic clamps (Phase 1).
  - Real camouflage can hide small creatures (Q8).
  - Pre-existing ESLint error in `CreatureGrounding.ts:1065`.
