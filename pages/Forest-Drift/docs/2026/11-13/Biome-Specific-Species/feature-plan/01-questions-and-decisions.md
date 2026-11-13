# Forest Drift — Biome-Specific Species: Questions and Decisions

**Feature cycle:** 2026-11-13
**Status:** **Locked (2026-11-13).** You accepted every recommended default in chat ("Accept all defaults"). **No implementation until you approve the plan in chat.**
**Related:** [`00-brief.md`](00-brief.md) · [`02-technical-plan.md`](02-technical-plan.md)

---

## How to answer

- Type into the box under each question, or tick an option. You can also reply in chat ("Q2: B"), or ask me to put the questions to you in chat as multiple choice, as last time.
- **Status labels:** `Needs user answer` (taste, scope or risk you own), `Recommended default` (say "accept defaults"), `Safe to decide now` (low risk, easy to change).

## Locked decision summary

| Q   | Topic                                    | Status                | Decision (locked)                                                                 |
| --- | ---------------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| Q1  | What changes per biome                   | `Needs user answer`   | Body plans, sizes, anatomy leanings, herd behaviour and density                   |
| Q2  | Roster model                             | `Recommended default` | **A**: each region has a roster per biome family; a herd uses its centre's family |
| Q3  | Biome granularity                        | `Recommended default` | **A**: 6 families, with small per-biome tweaks                                    |
| Q4  | Species per roster                       | `Recommended default` | **B**: 4–7 depending on the family (desert and snow fewer, jungle more)           |
| Q5  | Giants                                   | `Needs user answer`   | **A**: open land and jungle only; none in dense forest or on snow                 |
| Q6  | Carry and ride guarantees                | `Needs user answer`   | **A**: every roster has a carryable creature and a rideable biped                 |
| Q7  | Species names                            | `Safe to decide now`  | **B**: first word from the family (e.g. "Dune Stilt", "Frost Pebbleback")         |
| Q8  | How the room knows the biome             | `Recommended default` | **A**: the Worker runs the terrain and biome code (+~7 KB gzipped)                |
| Q9  | Version gating                           | `Recommended default` | **A**: generator version 5; biomes-off worlds relabelled                          |
| Q10 | Worlds with biomes off                   | `Recommended default` | **A**: today's species exactly                                                    |
| Q11 | Existing biome worlds (incl. Main World) | `Safe to decide now`  | Herds change; builds, terrain and placed creatures don't                          |
| Q12 | Lab-placed creatures                     | `Safe to decide now`  | Unchanged (saved recipes)                                                         |
| Q13 | Anatomy leanings per family              | `Recommended default` | As proposed in technical plan §5                                                  |
| Q14 | Herd behaviour per family                | `Recommended default` | As proposed in technical plan §5                                                  |
| Q15 | Density per family                       | `Recommended default` | ×0.55 (desert, snow) … ×1.3 (jungle, plains)                                      |
| Q16 | Delivery phases                          | `Recommended default` | Phases 0–2 as in the brief                                                        |
| Q17 | Performance budgets                      | `Recommended default` | As in technical plan §12                                                          |
| Q18 | Testing scope                            | `Safe to decide now`  | Unit + golden in 3 engines + room tests + e2e + screenshots                       |

---

## A. Scope

### Question 1: What changes per biome (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Each item adds visible variety and tuning work. Body plans and sizes make the biggest difference you can see. Behaviour and density change how a place feels. Doing too little looks like the old recolour; doing everything in v1 makes it harder to tune and review.
- **Recommended Default**: The first five.
- **Options**:
  - [x] Body plans (which of quadruped, biped, hexapod, serpent live there) (Recommended)
  - [x] Sizes (which height bands, where giants live) (Recommended)
  - [x] Anatomy leanings (long legs, big ears, fins, thick bodies, crests…) (Recommended)
  - [x] Herd behaviour (herd sizes, skittishness, wandering range) (Recommended)
  - [x] Density (how many herds) (Recommended)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: Body plans, sizes, anatomy leanings, herd behaviour and density (recommended default accepted).

### Question 2: Roster model (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Today each 512 m region has one roster of six species. Biomes are 450 m–1.5 km across, so regions often span several. Choosing a roster per region from its centre's biome would put snow animals in the neighbouring desert. A single roster per biome for the whole world removes regional variety: every desert would have the same animals.
- **Recommended Default**: **A**. Each region generates a roster per biome family on demand (seeded by region and family). A herd uses the roster of the family at its group centre, which Phase 1 of the creature cycle already computes.
- **Options**:
  - [x] A — Per region and biome family (Recommended)
  - [ ] B — Per region, from the region centre's biome
  - [ ] C — Per biome family, the same everywhere in the world
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: each region has a roster per biome family; a herd uses its centre's family (recommended default accepted).

### Question 3: Biome granularity (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: 26 separate rosters per region is a lot of variety, but neighbouring biomes like Forest and Birch Forest would have unrelated animals, which can feel random. Six families (temperate forest, open temperate, cold, tropical, warm-dry, wet: the same families the creature coats already use) give clear identities, and coats already differ per biome.
- **Recommended Default**: **A**. Six families define the roster. A few biomes add small tweaks: Bamboo Jungle leans to bipeds, Snowy Slopes has no giants, Swamp has the most serpents.
- **Options**:
  - [x] A — 6 families with small per-biome tweaks (Recommended)
  - [ ] B — One roster per biome (26)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: 6 families, with small per-biome tweaks (recommended default accepted).

### Question 4: Species per roster (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Six per area today. Harsh places with fewer species read as sparse and real; rich places with more feel lush. But fewer species means less variety to find, and more means more compile work as you travel.
- **Recommended Default**: **B**. Desert and snow 4, open land and cold forest 5, temperate forest and wet 6, jungle 7.
- **Options**:
  - [ ] A — Always 6
  - [x] B — 4–7 depending on the family (Recommended)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **B**: 4–7 depending on the family (desert and snow fewer, jungle more) (recommended default accepted).

### Question 5: Where giants live (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Giants (8–26 m) are landmarks today and appear in every region. In dense forest they clip through trees. On snow and in deserts they can feel out of place, or, if you like that, epic. This is a taste call.
- **Recommended Default**: **A**. Open land (plains, savanna, meadow) and jungle only. None in dense forest, snow or swamp; deserts get a rare one.
- **Options**:
  - [x] A — Open land and jungle; rare in desert; none in forest, snow or swamp (Recommended)
  - [ ] B — Everywhere, as today
  - [ ] C — Rarer everywhere (half today's chance)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: open land and jungle only; none in dense forest or on snow (recommended default accepted).

### Question 6: Carry and ride guarantees (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Carrying (small quadrupeds ≤ 0.9 m) and riding (any biped) are gameplay features. Today every region guarantees a carryable quadruped, but bipeds are only a 1-in-5 draw per band, so riding depends on luck. If biome rosters drop these, a player in the swamp couldn't carry or ride anything. If every roster must have both, swamp and snow animal sets are a little less "pure".
- **Recommended Default**: **A**. Every roster has a carryable small quadruped and at least one rideable biped (of any size). Riding then becomes reliable everywhere, which it isn't today.
- **Options**:
  - [x] A — Both in every roster (Recommended)
  - [ ] B — Carryable everywhere; rideable only where it fits (plains, savanna, jungle, forest)
  - [ ] C — No guarantees (pure biome logic)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: every roster has a carryable creature and a rideable biped (recommended default accepted).

### Question 7: Species names (Multiple Choice)

- **Status**: `Safe to decide now`
- **Why it matters**: Names show in the carry and ride prompts ("Pick up Moss Stilt"). Last cycle you kept today's names, because species were the same everywhere. Now each family has its own species, so a family word fits naturally.
- **Recommended Default**: **B**. The first word comes from the family: Dune and Sand for warm-dry, Frost and Rime for cold, Fern and Vine for tropical, Bog and Reed for wet, Moss and Bark for forest, Meadow and Wind for open land. The second word stays from the body shape: Stilt, Pebbleback, Ribbon, Crownling.
- **Options**:
  - [ ] A — Today's name words
  - [x] B — Family first word (Recommended)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **B**: first word from the family (e.g. "Dune Stilt", "Frost Pebbleback") (recommended default accepted).

---

## B. Online and compatibility

### Question 8: How the multiplayer room knows the biome (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: The room rebuilds a creature from its id to check carry and ride (size and body plan). When species depend on the biome, the room must know the biome at the herd's centre. Biomes need the world's terrain shape, which the room doesn't run today. Measured: the terrain and biome code is 18.8 KB minified (7 KB gzipped), loads and answers in about 7.5 ms. The alternatives: species chosen from climate only, without terrain, which drifts from the biomes players see near hills and mountains; or trusting clients, which lets a modified client carry a giant.
- **Recommended Default**: **A**. Bundle the terrain and biome code into the Worker. Build it lazily per room from the published world's terrain and biome settings, used only on carry, ride and shot.
- **Options**:
  - [x] A — The room runs the terrain and biome code (Recommended)
  - [ ] B — Rosters from climate only, no terrain (room and clients agree, but drift from the visible biomes)
  - [ ] C — The room trusts the client's species
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: the Worker runs the terrain and biome code (+~7 KB gzipped) (recommended default accepted).

### Question 9: Version gating (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: In biome worlds, creature identities change: a given id now names a different species. An older client and the new room would disagree about what a creature is, so carry and ride would be refused or wrong. The generator version exists to keep mismatched builds apart.
- **Recommended Default**: **A**. Bump `GENERATOR_VERSION` to 5. The Worker relabels worlds published at 1–4 with biomes off to 5 (their creatures don't change), the same pattern as the biomes release. Deploy the Worker first, then the site.
- **Options**:
  - [x] A — Generator 5 with relabel for biomes-off worlds (Recommended)
  - [ ] B — No bump (mixed clients briefly disagree)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: generator version 5; biomes-off worlds relabelled (recommended default accepted).

### Question 10: Worlds with biomes off (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Biomes-off worlds have no biome to pick a roster from. Keeping today's species exactly means no change, and no relabel risk online. A "neutral" roster would change their animals for no visible reason.
- **Recommended Default**: **A**. Today's regional species exactly, with neutral coats as now.
- **Options**:
  - [x] A — Today's species (Recommended)
  - [ ] B — A neutral temperate roster
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: today's species exactly (recommended default accepted).

### Question 11: Existing biome worlds, including the Main World

- **Status**: `Safe to decide now`
- **Why it matters**: Herds in existing biome worlds will become different animals. Last cycle you said existing worlds don't need protecting.
- **Recommended Default**: Herds change; builds, terrain, plants and placed creatures don't. No migration, and no prompt.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: Herds change; builds, terrain and placed creatures don't (recommended default accepted).

### Question 12: Lab-placed creatures

- **Status**: `Safe to decide now`
- **Why it matters**: Placed creatures save their whole recipe, so they don't depend on rosters.
- **Recommended Default**: Unchanged. The Lab gets a "biome roster" gallery to preview each family's animals.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: Unchanged (saved recipes) (recommended default accepted).

---

## C. Look and feel

### Question 13: Anatomy leanings per family

- **Status**: `Recommended default`
- **Why it matters**: The species generator already chooses a silhouette strategy (long-legged, round, long-bodied, large-headed), a form preset (elegant, chunky, cute, slender, heavy) and signature traits (huge ears, long neck, dorsal fin, tall plates…). Leaning those per family is what makes animals look native. Too strong and every desert animal looks the same; too weak and nobody notices.
- **Recommended Default**: Technical plan §5. For example: desert leans long-legged and slender with huge ears; cold leans round and heavy with short legs; wet leans long-bodied with fins and frills; tropical leans to crests, long tails and bipeds; open land leans to long legs and long necks. Each leaning is a weight, never a rule.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: As proposed in technical plan §5 (recommended default accepted).

### Question 14: Herd behaviour per family

- **Status**: `Recommended default`
- **Why it matters**: Herd size, how skittish creatures are and how far they wander change how a place feels. Big skittish herds on the plains and solitary animals in the jungle read well. They also change how easy creatures are to approach and carry.
- **Recommended Default**: Technical plan §5. Open land: herds ×1.5, more skittish. Jungle and forest: smaller groups, more curious. Snow and desert: pairs and small groups, wide wandering. Swamp: slow, calm.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: As proposed in technical plan §5 (recommended default accepted).

### Question 15: Density per family (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Uniform density makes deserts and snowfields feel as busy as forests. Lower density there is more believable, but those places get emptier, and with the camouflage you chose, creatures there are harder to find.
- **Recommended Default**: **A**. Multipliers on the herd chance: desert and snow ×0.55, cold forest and wet ×0.85, temperate forest ×1, jungle and open land ×1.3. The world density setting still applies on top, and the live-creature caps don't change.
- **Options**:
  - [x] A — Per-family multipliers as above (Recommended)
  - [ ] B — Same density everywhere
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: ×0.55 (desert, snow) … ×1.3 (jungle, plains) (recommended default accepted).

---

## D. Delivery

### Question 16: Delivery phases (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Reviewing rosters in the Lab before they reach the world keeps tuning fast. Room and versioning work is best done in one go, so the version bump ships once.
- **Recommended Default**: **A**. Phase 0 rosters and Lab preview; Phase 1 world, room, version and golden; Phase 2 tuning, screenshots, performance and docs. Each phase ends with screenshots; commit and push when you say.
- **Options**:
  - [x] A — Phases 0–2 (Recommended)
  - [ ] B — One release
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: Phases 0–2 as in the brief (recommended default accepted).

### Question 17: Performance budgets

- **Status**: `Recommended default`
- **Why it matters**: More species variety means more distinct compiles while travelling. The room gains code and a little CPU on carry, ride and shot.
- **Recommended Default**: Technical plan §12. Live-creature caps and draw calls unchanged; compile time per creature ≤ +10%; roster function ≤ 0.5 ms per new roster (cached); Worker bundle ≤ +30 KB; room carry check ≤ 15 ms cold (first in a room), ≤ 0.5 ms warm.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: As in technical plan §12 (recommended default accepted).

### Question 18: Testing scope

- **Status**: `Safe to decide now`
- **Why it matters**: The guarantees (carry and ride everywhere, room equals client) are exact rules, so they can be tested exactly.
- **Recommended Default**: Unit tests for rosters, guarantees, leanings and density. The determinism golden gains `biomeSpecies` and is checked in 3 engines. Room tests check the resolver against the population on a published biome world. E2E: carry and ride online in a biome world, plus screenshots per family and a performance check.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: Unit + golden in 3 engines + room tests + e2e + screenshots (recommended default accepted).
