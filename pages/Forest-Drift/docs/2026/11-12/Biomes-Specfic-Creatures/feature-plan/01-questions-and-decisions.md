# Forest Drift — Biome-Specific Creatures: Questions and Decisions

**Feature cycle:** 2026-11-12 (written 2026-11-13)
**Status:** **Locked (2026-11-13).** All 23 questions answered in chat. Four answers differ from the recommended defaults: Q6 (natural colours everywhere, and the Main World replaced with biomes on), Q8 (real camouflage), Q9 (coat texture, patterns and feature colour only), and the Main World follow-up. The brief and technical plan (revision 2) are updated to match. **No implementation until you approve the plan in chat.**
**Related:** [`00-brief.md`](00-brief.md) · [`02-technical-plan.md`](02-technical-plan.md)

---

## How to answer

- Type into the box under each question, or tick an option. If your Markdown preview can't tick boxes or type into inputs, reply in chat, for example "Q2: B" or "Q4: …". That works just as well.
- **Status labels:**
  - `Needs user answer`: I can't pick for you, because it's about taste, scope or risk you own.
  - `Recommended default`: I've proposed an answer. Say "accept defaults" and I'll use it.
  - `Safe to decide now`: low risk and easy to change later. I'll go ahead with the default unless you object.
- Answered in chat on 2026-11-13. The **Decision** line under each question is the locked answer.

## Locked decision summary

| Q   | Topic                                      | Status                | Decision (locked)                                                                                            |
| --- | ------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Q1  | What "biome-specific" covers               | `Needs user answer`   | **B**: colours + patterns + coat texture per biome; same species, shapes and sizes                           |
| Q2  | Colour style                               | `Needs user answer`   | **B**: natural, earthy bodies with one brighter accent                                                       |
| Q3  | Telling species apart within a biome       | `Recommended default` | Lightness steps + different patterns + accents, kept apart by rule                                           |
| Q4  | Where the biome is measured                | `Recommended default` | **A**: the group centre's dominant biome, for the whole herd                                                 |
| Q5  | Your colour ideas per biome                | `Needs user answer`   | The proposed table in technical plan §5                                                                      |
| Q6  | Worlds with biomes off                     | `Recommended default` | **B (changed)**: natural style in every world; the Main World is replaced (same seed and outpost, biomes on) |
| Q7  | Surface detail in every world              | `Recommended default` | **A**: yes, the detail is render-only and doesn't change colours                                             |
| Q8  | Visibility (camouflage) and a vivid option | `Needs user answer`   | **C (changed)**: real camouflage, no contrast rule, no setting                                               |
| Q9  | Which texture improvements                 | `Recommended default` | **1, 3, 4 (changed)**: coat micro-texture, new patterns, small-feature colour                                |
| Q10 | Coat type per creature                     | `Recommended default` | **A**: from the body plan, with biome tweaks                                                                 |
| Q11 | Detail at distance                         | `Safe to decide now`  | LOD0 full, fading out by LOD1, none at LOD2                                                                  |
| Q12 | Weather on coats                           | `Recommended default` | **C**: later, not in v1                                                                                      |
| Q13 | Palette granularity                        | `Recommended default` | **A**: one profile per biome (26), grouped into families                                                     |
| Q14 | Rare colour morphs                         | `Safe to decide now`  | **A**: yes, about 1 in 60 individuals                                                                        |
| Q15 | Species names                              | `Safe to decide now`  | **A**: keep today's names                                                                                    |
| Q16 | Pellet colour online                       | `Recommended default` | **A**: clients work it out from the creature id; the room stays biome-free                                   |
| Q17 | Version bump for mixed clients             | `Recommended default` | **A**: no generator or protocol bump                                                                         |
| Q18 | Saved (Lab-placed) creatures               | `Recommended default` | **A**: no save-format change; the Lab can bake biome colours into the saved palette                          |
| Q19 | Creature moved to another biome            | `Safe to decide now`  | Keeps its home coat                                                                                          |
| Q20 | Creature Lab tools                         | `Safe to decide now`  | Biome picker, palette swatches, coat debug views, colour-blind preview, per-biome gallery                    |
| Q21 | Delivery phases                            | `Recommended default` | **A**: phases 0–4; the Main World replacement is in Phase 1                                                  |
| Q22 | Performance budgets                        | `Recommended default` | As in technical plan §14.1                                                                                   |
| Q23 | Testing scope                              | `Safe to decide now`  | Unit + determinism golden in 3 engines + e2e + screenshots + GPU benchmark                                   |

---

## A. Scope and look

### Question 1: What "biome-specific" covers (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: You asked for creatures to be "biome-specific" and to have "specific colours to the biomes". Colour is the clear ask. Whether biomes should also change _which_ creatures live there (body plans, sizes, features) is a much bigger change. The multiplayer room identifies ambient creatures from their id **without terrain**, so it can't know the biome. If species choice depended on the biome, the room would have to run terrain and biome code to check what can be carried or ridden. That makes the Worker larger and slower to start, and risks the room and clients disagreeing about a creature. If we go too small instead, a desert and a snowfield have the same animals in different paint, which may feel cheap.
- **Recommended Default**: **B**. Colours, patterns and coat texture follow the biome. Each region's species, their shapes, sizes and abilities stay as today. Body-plan mixes per biome can come in a later cycle.
- **Options**:
  - [ ] A — Colours only
  - [x] B — Colours + patterns + coat texture per biome; same species, shapes and sizes (Recommended)
  - [ ] C — B, plus biome-weighted species mix (e.g. more serpents in swamps, hexapods in jungles, no giants on snow); needs terrain in the room
  - [ ] D — A separate set of species for every biome
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **B**: colours, patterns and coat texture follow the biome; same species, shapes and sizes (recommended default).

### Question 2: Colour style (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: This sets the whole mood. Fully natural, real-animal colours (browns, greys, ochres) fit the biomes best but can look dull, and lose the game's playful, slightly fantastical tone. Keeping today's vivid colours and only tinting them toward the biome keeps the fun but won't feel like the creatures belong. If it's too dull, players stop noticing creatures; if it's too vivid, the feature hasn't solved its problem.
- **Recommended Default**: **B**. Natural, earthy body colours chosen from each biome's range. Each species gets one brighter accent (crest, tail tip, horns, feet), and jungle, flower and cherry biomes allow more colour.
- **Options**:
  - [ ] A — Fully natural (real-animal colour ranges, muted accents)
  - [x] B — Natural, earthy bodies with one brighter accent per species (Recommended)
  - [ ] C — Today's vivid style, hue-shifted toward each biome
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **B**: natural, earthy bodies with one brighter accent per species (recommended default).

### Question 3: Telling species apart within one biome

- **Status**: `Recommended default`
- **Why it matters**: Today the six species of a region are told apart mainly by hue (60° apart). With a biome palette, hues sit close together, so without a rule two herds could look like one species, which breaks the "different groups" look the population system was built for (`cellSpeciesOrder`, `selectVisibleCreatures`).
- **Recommended Default**: Each regional species gets a distinct **lightness step** (from a dark to a pale coat), a **different pattern** where the biome allows (no two of a region's species share both pattern and lightness step), and its own **accent hue** from the biome's accent set. A test checks every region in a sample of seeds and biomes for minimum lightness/pattern separation. Size and shape differences stay as they are.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: Lightness steps + different patterns + separate accents, kept apart by rule (recommended default).

### Question 4: Where the biome is measured (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Herds spawn per 64 m cell, and a group spreads a few metres around its centre. Biome borders are 60–90 m wide. If each individual took the biome under its own spawn point, a herd on a border would be half desert, half savanna and look like two species. Blending palettes across a border can produce muddy in-between colours. The choice also decides what the other players' clients have to compute to agree.
- **Recommended Default**: **A**. Use the dominant biome at the **group centre** for the whole herd. The centre comes from the cell's seeded random stream, so it's pure. Members keep their small individual hue and lightness variation.
- **Options**:
  - [x] A — Group centre, dominant biome, whole herd (Recommended)
  - [ ] B — Group centre, palette blended by biome weights
  - [ ] C — Each individual's own spawn point
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: the group centre's dominant biome colours the whole herd (recommended default).

### Question 5: Your colour ideas per biome

- **Status**: `Needs user answer`
- **Why it matters**: "Specific colours to the biomes" may mean you already picture particular colours, such as white creatures in snow or red ones in the savanna. The technical plan (§5) proposes a palette for all 26 biomes. If yours differ, it's much cheaper to know before the profiles are tuned and screenshots made.
- **Recommended Default**: Use the proposed table in technical plan §5. Write any biome you want different here (for example "Desert: pale cream with rust stripes").
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: Use the proposed table in technical plan §5 (recommended default).

### Question 6: Worlds with biomes off (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Every biome phase so far has kept worlds without biomes exactly as before (parity tests). Recolouring their creatures to a "default" palette would surprise players who know their world, and would break that promise. Keeping today's colours means two creature styles exist, depending on the world. **Note:** the Main World, which Play opens, is an embedded package from before biomes, so it has biomes off. With this default, most players won't see biome creatures until they create a new world or turn biomes on for the Main World. Turning them on would also change the Main World's terrain, forests and plants, so that's a separate decision; tell me in the box if you want it.
- **Recommended Default**: **A**. Biomes off (old worlds, worlds switched off, the kill switch) means exactly today's regional showcase colours, checked by a parity test.
- **Options**:
  - [ ] A — Exactly today's colours (Recommended)
  - [x] B — New natural palettes from a neutral temperate profile
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **B (changed from the default)**: existing saved worlds don't need to be kept; nobody uses them. Biomes-off worlds use a neutral temperate profile in the new natural style, so there's no parity rule for creature colours. **The Main World is replaced** by a new package with the same seed (`soft-lowlands-431`) and outpost, with biomes on. Any saved copy of the old Main World is replaced too.

### Question 7: Surface detail in every world (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: The texture improvements (fine coat detail, crease shading, small-feature colour) are rendering. They don't change palettes, saves or identity, much like the tree LOD work that applied everywhere. Limiting them to biome worlds keeps old worlds pixel-identical, but leaves two quality levels and two code paths to maintain.
- **Recommended Default**: **A**. Apply the surface detail in every world. Colours and patterns in biome-off worlds stay as today (Q6). New pattern types only appear in biome coats.
- **Options**:
  - [x] A — Every world (Recommended)
  - [ ] B — Biome worlds only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: the surface detail applies in every world (recommended default).

### Question 8: Visibility (camouflage) and a vivid option (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Matching a creature to its biome is realistic camouflage, and that's a problem for a game where you find, carry and ride creatures. A sand-coloured 0.6 m creature in the desert can disappear. Some players also simply prefer today's bright look. A setting adds UI and testing; no setting risks complaints that creatures are hard to find. Colour-blind players rely more on lightness contrast than on hue.
- **Recommended Default**: **A**. Natural colours only, with a hard rule: a body's lightness must differ from the biome's ground and grass colours by at least a set amount (technical plan §4.3), checked by tests. Accents stay saturated enough to catch the eye. No setting in v1.
- **Options**:
  - [ ] A — Natural only, guaranteed ground contrast, no setting (Recommended)
  - [ ] B — A, plus a "Creature colours: Natural / Vivid (classic)" setting in Graphics
  - [x] C — Natural, no contrast rule (realistic camouflage)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **C (changed from the default)**: real camouflage. No contrast rule against the ground and no Vivid setting. Small creatures may be hard to spot in matching biomes, and that's intended.

---

## B. Procedural textures

### Question 9: Which texture improvements (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Each improvement costs build time and some shader time. Pick the ones that matter to you so the effort goes where you'll notice it.
- **Recommended Default**: All six. They're listed from most to least visible gain per cost.
- **Options**:
  - [x] 1 — Coat micro-texture: fine fur grain, scales, chitin plates or skin, as per-pixel shading detail (Recommended)
  - [ ] 2 — Crease shading: soft darkening under the neck and belly, between the legs and at limb roots, baked once per creature (Recommended)
  - [x] 3 — New patterns: rosettes, reticulated network, patches (piebald), speckle, saddle (Recommended)
  - [x] 4 — Colour on small features: banded horns, tipped ears, spotted fins, darker claws (Recommended)
  - [ ] 5 — Biome extremities: dusty legs in dry biomes, dark wet legs and gloss in swamps, paler tips in snow (Recommended)
  - [ ] 6 — Soft rim light on fur, so coats read against dark backgrounds (Recommended)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **1, 3 and 4 (changed from the default)**: coat micro-texture, new patterns, and colour on small features. **Not in scope:** crease shading (2), biome extremities (5) and rim light (6).

### Question 10: Coat type per creature (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: The coat type decides the micro-texture: fur, scales, chitin or smooth skin. Deriving it from the body plan keeps it stable, so a creature doesn't change texture when it walks between biomes. Deriving it fully from the biome (for example everything scaly in the desert) is more biome-specific, but makes one species look like different animals in neighbouring biomes.
- **Recommended Default**: **A**. Base the coat on the body plan: quadrupeds and bipeds mostly fur or hide, serpents scales, hexapods chitin. The species seed picks between allowed coats, and the biome adjusts strength and length (thick fur in snow, short or bare hide in the desert, wet skin in the swamp).
- **Options**:
  - [x] A — From the body plan, with biome tweaks (Recommended)
  - [ ] B — From the biome only
  - [ ] C — From the species seed only (no biome influence)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: coat type from the body plan; the biome sets thickness and length (recommended default).

### Question 11: Detail at distance

- **Status**: `Safe to decide now`
- **Why it matters**: Fine detail at a distance shimmers (aliasing) and costs pixels nobody can see. Fading it too early makes the detail pop in close to the camera.
- **Recommended Default**: Full detail at LOD0, faded out over the LOD0→LOD1 distance band, none at LOD2. Crease shading is baked into vertex colours, so it shows at every LOD.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: LOD0 full, fading out by LOD1, none at LOD2 (recommended default).

### Question 12: Weather on coats (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Snow settling on backs while it snows, or wet sheen in rain, would tie creatures to Phase 5's local weather nicely. It needs one shared uniform (cheap), but adds tuning and testing. It's weather, not biome identity.
- **Recommended Default**: **C**. Later, not in v1.
- **Options**:
  - [ ] A — Snow dusting and wet sheen in v1
  - [ ] B — Wet sheen only in v1
  - [x] C — Later, not in v1 (Recommended)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **C**: weather on coats comes later, not in v1 (recommended default).

---

## C. Biome palettes

### Question 13: Palette granularity (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: One palette per biome group (temperate, cold, tropical, warm-dry, swamp) is quick to tune but makes Forest and Dark Forest creatures identical. A profile for every biome matches how ground, trees, plants and air were done, and lets variants (Cherry Grove, Silverwood) have their own touch.
- **Recommended Default**: **A**. One profile per biome (26), built from a few shared families so similar biomes start from the same base, the same way the other biome profile tables work.
- **Options**:
  - [x] A — One profile per biome, built from shared families (Recommended)
  - [ ] B — One per biome group (5)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: one profile per biome (26), built from shared families (recommended default).

### Question 14: Rare colour morphs (Multiple Choice)

- **Status**: `Safe to decide now`
- **Why it matters**: A rare pale (leucistic) or dark (melanistic) individual in a herd is a small discovery moment, and costs nothing. Too many would break the "herd of one species" look.
- **Recommended Default**: **A**. About 1 in 60 individuals is a rare morph, chosen from the individual's id, so it's the same for everyone.
- **Options**:
  - [x] A — Yes, about 1 in 60 (Recommended)
  - [ ] B — No rare morphs
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: rare pale or dark morphs, about 1 in 60 individuals (recommended default).

### Question 15: Species names (Multiple Choice)

- **Status**: `Safe to decide now`
- **Why it matters**: Players see species names in the carry and ride prompts ("Moss Stilt"). A name like "Moss Stilt" on a sand-coloured desert creature reads oddly. Changing names per biome means one species has different names in neighbouring biomes.
- **Recommended Default**: **A**. Keep today's names.
- **Options**:
  - [x] A — Keep today's names (Recommended)
  - [ ] B — Biome-flavoured first word (e.g. "Dune Stilt" in the desert)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: keep today's species names (recommended default).

---

## D. Online, saves and edge cases

### Question 16: Pellet colour online (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: When a carried creature fires, the room sends everyone a `shot` message with `colour` = the creature's accent, computed by the room from the creature id without terrain. With biome coats, the room's colour would be the old showcase accent, so other players would see the wrong pellet colour. Making the room compute biomes means bundling terrain and biome code into the Worker and reading the world's biome settings, which is heavier and is the risk Q1 avoids.
- **Recommended Default**: **A**. Each client works out the pellet colour from the creature that slot carries, which it already knows from the `carried` messages, with the biome coat applied locally. The room's `colour` stays in the message as a fallback for creatures the client can't resolve. No protocol change.
- **Options**:
  - [x] A — Clients compute it from the creature id; the room stays biome-free (Recommended)
  - [ ] B — The room computes biomes (bundle terrain and biome code into the Worker)
  - [ ] C — The shooter sends its colour; the room validates it is `#rrggbb` and relays it (protocol 9)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: clients work out the pellet colour from the creature id; the room stays biome-free (recommended default).

### Question 17: Version bump for mixed clients (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: `GENERATOR_VERSION` pins terrain, vegetation and water output so every client in a world generates the same land. Creature colours are cosmetic: an older client in the same room would see old colours, but creature identity, positions, carrying and riding still agree. A bump forces everyone onto the new build, and makes the Worker relabel older worlds again.
- **Recommended Default**: **A**. No generator or protocol bump. During a deploy, an older tab may briefly see old creature colours, which is harmless.
- **Options**:
  - [x] A — No bump (Recommended)
  - [ ] B — Bump `GENERATOR_VERSION` to 5, so everyone sees the same colours
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: no generator or protocol bump (recommended default).

### Question 18: Saved (Lab-placed) creatures (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Lab-placed creatures save their whole recipe, palette included, in the world (schema 10). If biome coats or new pattern types were saved, older builds would reject those recipes (the validator checks pattern types), so the save schema would need to go to 11, and online compatibility with it. If nothing changes, a creature placed in a desert keeps the Lab's colours.
- **Recommended Default**: **A**. No save-format change. In a biome world, the Lab's "Place in world" offers **Match biome**, which writes the biome palette into the existing palette fields and picks a pattern from today's types. New pattern types and coat detail for placed creatures are worked out at runtime from the body plan, so nothing new is saved.
- **Options**:
  - [x] A — No save-format change; Match biome bakes colours into today's fields (Recommended)
  - [ ] B — Save schema 11 with the full biome coat (new patterns, coat type)
  - [ ] C — Placed creatures never get biome colours
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: no save-format change; the Lab's Match biome bakes colours into today's fields (recommended default).

### Question 19: A creature moved to another biome

- **Status**: `Safe to decide now`
- **Why it matters**: Carried, ridden or wandering creatures can end up in another biome. Recolouring them on the move would look like a glitch, and would make the pellet colour depend on where you stand.
- **Recommended Default**: A creature keeps its **home** coat, from its group centre. When its cell regenerates, it's back with its herd in its home biome.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: A creature keeps its home coat wherever it's taken (recommended default).

### Question 20: Creature Lab tools

- **Status**: `Safe to decide now`
- **Why it matters**: Tuning 26 palettes by walking around the world is slow. Lab tools make the tuning and the review screenshots repeatable.
- **Recommended Default**: Add a **Biome** picker (recolours the specimen and the 12-species gallery), palette swatches, debug views (coat type, coat detail mask, crease shading, contrast against the biome ground) and a "6 regional species per biome" review gallery. Developer-only, like the existing Lab tools.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: Biome picker, regional-six gallery, palette swatches, coat debug views and colour-blind preview (recommended default). The contrast debug view is dropped with Q8.

---

## E. Delivery

### Question 21: Delivery phases (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Palettes and surface detail are independent. Shipping palettes first gives the biggest visible change soonest, and lets you review colours before the shader work.
- **Recommended Default**: **A**. Phases 0–4 as in the brief: palette model and Lab preview, biome coats in the world, surface detail, new patterns and morphs, then performance, docs and release. Each phase ends with screenshots for review.
- **Options**:
  - [x] A — Phases 0–4 as in the brief (Recommended)
  - [ ] B — Surface detail first, then biome palettes
  - [ ] C — Everything in one release
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-13`: **A**: phases 0–4 (recommended default). Replacing the Main World is part of Phase 1.

### Question 22: Performance budgets

- **Status**: `Recommended default`
- **Why it matters**: Creatures are CPU-bound today, but coat detail adds per-pixel GPU work on every creature, and a big creature close up can fill the screen.
- **Recommended Default**: Still one shader program and one draw per creature, and no new image textures. Creature fragment cost at most +10% (A/B at LOD0, full screen). Compile time per creature at most +10%. No new per-frame allocations. Coat cache under 1 MB. Details in technical plan §14.1.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: Budgets as in technical plan §14.1 (recommended default).

### Question 23: Testing scope

- **Status**: `Safe to decide now`
- **Why it matters**: Colour choices are subjective, but determinism, separation, contrast and parity can be tested exactly. Screenshots make the subjective part reviewable.
- **Recommended Default**: Unit tests (palette rules, separation, contrast, parity, rare morphs, pattern CPU/GPU mirror, coat LOD), determinism golden with a `biomeCreatures` section in Chromium, WebKit and Firefox, e2e (biome world herds, carry/pellet colour online), a screenshot gallery per biome, and an opt-in GPU benchmark.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-13`: Testing scope as in technical plan §18 (recommended default).
