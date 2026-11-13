# Forest Drift — Biomes and Environments: Questions and Decisions

**Feature cycle:** 2026-11-12
**Status:** **Locked (2026-11-12).** All 33 questions are answered: you accepted every recommended default. The brief and technical plan (revision 2) have been updated to match. **No implementation until you approve the plan in chat.**
**Related:** [`00-brief.md`](00-brief.md) · [`02-technical-plan.md`](02-technical-plan.md)

---

## How this was answered

Answered in chat on 2026-11-12 with "Accept all defaults". Every question takes its recommended default, and none was overridden. The only follow-on choice was the two new display names the Q2 default called for (Silverwood and Sunlit Wood, taken from the examples in Q2). Say if you want different names.

The status labels below show how each question was _classified_ before answering. The **Decision** line under each question is the locked answer.

## How to answer (kept for reference)

- Type into the box under each question, or tick an option. If your Markdown preview can't tick boxes or type into inputs, reply in chat as "Q7: A" or "Q3: …". That works just as well.
- **Status labels:**
  - `Needs user answer`: I can't pick for you, because it's about taste, scope or risk you own.
  - `Recommended default`: I've proposed an answer. Say "accept defaults" and I'll use it.
  - `Safe to decide now`: low risk and easy to change later. I'll go ahead with the default unless you object.
- Questions are grouped A–G. The **summary table** lists every recommended default, so "accept all defaults except Q2, Q3 and Q10" is a complete answer.

## Locked decision summary

| Q   | Topic                          | Status                | Decision (locked)                                                       |
| --- | ------------------------------ | --------------------- | ----------------------------------------------------------------------- |
| Q1  | Biome scope                    | `Needs user answer`   | **A**: the 26 named biomes, gaps intentional                            |
| Q2  | Names and identity             | `Needs user answer`   | **A**: generic names, own look; rename the most distinctive             |
| Q3  | What "Dappled Forest" is       | `Needs user answer`   | Sunlit mixed broadleaf woodland with open canopy and a flowery floor    |
| Q4  | What "Pale Garden" is          | `Needs user answer`   | **A**: silvery, misty variant of the dark forest; calm, not hostile     |
| Q5  | Minimum distinctiveness        | `Safe to decide now`  | Each biome differs from its neighbours in at least 3 of 6 layers        |
| Q6  | Existing worlds                | `Needs user answer`   | **A**: biomes off on migration; owner can opt in                        |
| Q7  | Biomes changing terrain height | `Needs user answer`   | **A**: never in v1                                                      |
| Q8  | Bundled Main World             | `Recommended default` | **A**: leave unchanged (biomes off)                                     |
| Q9  | Turning biomes on/off later    | `Recommended default` | **A**: both directions, local worlds, with confirmation                 |
| Q10 | Biome size                     | `Needs user answer`   | **A**: Normal, roughly 600–900 m across                                 |
| Q11 | Layout model                   | `Recommended default` | **A**: climate + landform + elevation, plus a rarity field for variants |
| Q12 | Rarity of variant biomes       | `Recommended default` | About 15% of the parent biome's area                                    |
| Q13 | Impossible neighbours          | `Safe to decide now`  | Never snow next to desert or jungle                                     |
| Q14 | World composition              | `Recommended default` | Temperate 40%, cold 20%, warm/dry 22%, tropical 12%, swamp 6%           |
| Q15 | Ice on lakes and rivers        | `Recommended default` | **A**: none in v1                                                       |
| Q16 | Swamp water                    | `Recommended default` | **A**: biome over existing water; tint and mud, no new lakes            |
| Q17 | New tree species               | `Needs user answer`   | **A**: full set (9 new species + tint variants)                         |
| Q18 | Tree density budget            | `Safe to decide now`  | Keep 400 trees/chunk cap; dense biomes use bigger trees, not more       |
| Q19 | Signature plants               | `Recommended default` | **A**: procedural pools biased by biome + a few fixed signature species |
| Q20 | Grass per biome                | `Safe to decide now`  | Profile per biome (see table in the question)                           |
| Q21 | Spawn biome                    | `Recommended default` | **A**: gentle temperate biome guaranteed at spawn                       |
| Q22 | Creatures                      | `Recommended default` | **A**: unchanged in v1                                                  |
| Q23 | World-creation options         | `Recommended default` | **A**: one "Biome size" choice                                          |
| Q24 | Weather per biome              | `Needs user answer`   | **A**: shared schedule; local snow / rain / dry by climate              |
| Q25 | Snow on buildings              | `Recommended default` | **A**: only while it's snowing (as today); ground-only permanent snow   |
| Q26 | Fog and sky tint               | `Safe to decide now`  | Subtle per-biome fog/tint, blended at the camera                        |
| Q27 | Ambient sound                  | `Recommended default` | **A**: later phase, not v1                                              |
| Q28 | Biome name indicator           | `Recommended default` | **A**: brief card on entry + name in pause menu                         |
| Q29 | Biome map                      | `Safe to decide now`  | Developer debug view only                                               |
| Q30 | Online compatibility           | `Recommended default` | Generator version 4; v3 worlds relabelled only when biomes are off      |
| Q31 | Delivery phases                | `Recommended default` | **A**: 7 phases as in the brief                                         |
| Q32 | Performance budget             | `Recommended default` | ≤ 15% extra chunk-generation time; ≤ 0.5 ms extra frame time            |
| Q33 | Testing scope                  | `Safe to decide now`  | Unit + golden determinism + e2e + perf, as listed in the technical plan |

---

## A. Scope and identity

### Question 1: Biome scope (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: The request lists 26 named biomes, but the numbering skips 10, 15–17, 23–24, 28 and 32–47, and two entries reuse 11 and 12. The section headers also give larger totals (14, 10, 4, 7) than the entries under them. That looks like a longer source list with items deleted, but I can't tell whether the deletions were deliberate. If I guess wrong, either I build biomes you didn't want (weeks of art and tuning) or I miss ones you expected and the climate layout has gaps. The layout model (Q11) is easier to tune with the full set known up front.
- **Recommended Default**: **A**. Build exactly the 26 named biomes. Treat the gaps as intentional.
- **Options**:
  - [x] A — The 26 named biomes only (Recommended)
  - [ ] B — The 26 plus some missing ones (name them in the box)
  - [ ] C — Fewer for v1 (name the must-haves; the rest come later)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: the 26 named biomes, gaps intentional (recommended default accepted).

### Question 2: Biome names and visual identity (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Most of the names are ordinary ecology (Forest, Taiga, Savanna, Desert, Swamp, Jungle, Meadow). A few (Pale Garden, Old Growth Birch Forest, Windswept Hills, Snowy Slopes, Cherry Grove, Grove, Sparse Jungle, Bamboo Jungle, Sunflower Plains, Flower Forest, Dark Forest) match another very popular game's biome list word for word. Forest Drift is your own game with its own stylised procedural look. If biomes copy that game's names, palettes and signature features as well, the world reads as a clone. That hurts the game's identity, and anything copied closely enough (a named biome together with its distinctive creature or block style) is something I won't build. Generic names with Forest Drift's own definitions avoid both problems.
- **Recommended Default**: **A**. Keep the generic ecological names. Define every biome by Forest Drift's own palette, trees and plants. Rename the two most distinctive (Pale Garden, Dappled Forest) once Q3/Q4 are answered, for example "Silverwood" and "Sunlit Wood".
- **Options**:
  - [x] A — Generic names, own look; rename the most distinctive two (Recommended)
  - [ ] B — Keep all names exactly as listed, with Forest Drift's own look
  - [ ] C — Fully original Forest Drift names for every biome (I'll propose a list)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: generic names, own look; rename the most distinctive. Display names: **Silverwood** (was Pale Garden) and **Sunlit Wood** (was Dappled Forest) (recommended default accepted).

### Question 3: What is the "Dappled Forest"?

- **Status**: `Needs user answer`
- **Why it matters**: It's marked "(new in 2026)", and I don't have a reliable definition for it. I won't make one up and present it as fact. Its definition decides its climate slot (Q11), its trees (Q17) and how it differs from Forest, Birch Forest and Flower Forest, which are already close to each other. Without a clear identity it ends up as a fourth near-identical woodland.
- **Recommended Default**: If you have no reference in mind: a **sunlit mixed broadleaf woodland**. Oak, birch and small ornamentals in a loose canopy with frequent small clearings, a bright patchy floor (light and shadow patches in the ground colour) and scattered low flowers. It sits in temperate, moderately moist, rolling hills, between Forest and Meadow.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-12`: Sunlit mixed broadleaf woodland with open canopy and a flowery floor (recommended default accepted).

### Question 4: What is the "Pale Garden" in Forest Drift? (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: This name is the most strongly tied to another game, where it comes with a hostile creature and specific signature blocks. Forest Drift is relaxing and has no hostile mobs, so that version doesn't fit and I won't recreate it. It needs its own definition that suits the game. A badly chosen mood (eerie and threatening) would clash with the game's tone.
- **Recommended Default**: **A**. A rare, quiet variant of the Dark Forest. Silvery-grey foliage, pale bark, low-lying mist, desaturated ground and a few pale flowers. Calm and dreamlike, not hostile.
- **Options**:
  - [x] A — Silvery, misty dark-forest variant; calm and dreamlike (Recommended)
  - [ ] B — A "faded garden": pale overgrown flowers and shrubs on open ground, no forest
  - [ ] C — Drop it from v1
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: silvery, misty variant of the dark forest; calm, not hostile (recommended default accepted).

### Question 5: How different must a biome be?

- **Status**: `Safe to decide now`
- **Why it matters**: 26 biomes is a lot. Without a rule, some (Forest / Birch Forest / Dappled Forest, or Savanna / Shrub Savanna / Tropical Dry Grassland) will look the same in practice, and players won't notice the difference. A rule also keeps each biome's content scope bounded.
- **Recommended Default**: Every biome must differ from **each of its likely neighbours** in at least **3 of 6 layers**: ground palette, grass, trees, plants, weather/climate, atmosphere (fog/tint). The technical plan's biome table (§5) is checked against this rule. Variant biomes (Q12) only need 2 of 6, since they're meant to read as a twist on the parent.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-12`: Each biome differs from its neighbours in at least 3 of 6 layers (recommended default accepted).

---

## B. World safety

### Question 6: What happens to existing worlds? (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Every existing world (local saves, imported `.forestworld` files and published online worlds) was built on today's green countryside. Biomes change at least the ground colour, grass and plants, and (because forest density becomes biome-driven) **where trees grow**. A player's garden could fill with jungle trees, or a fenced paddock could get a spruce in the middle. Building clearance keeps trees off foundations, but fences, Mini Builds and music gardens aren't protected the same way. Hydrology handled the same problem by migrating old worlds with `enabled: false` (`WorldMigrationManager.ts`, v7 → v8).
- **Recommended Default**: **A**. Migration v9 → v10 adds `environment.biomes` with `enabled: false`. Old worlds look exactly as before. In a **local** world the owner can switch biomes on from Settings, behind a confirmation that explains trees and plants will change but land and buildings won't.
- **Options**:
  - [x] A — Off for old worlds; owner can opt in (Recommended)
  - [ ] B — "Skin only" automatically: ground, grass, plants, weather and fog change; tree layout and land don't
  - [ ] C — Full biomes switched on for every world automatically
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: biomes off on migration; owner can opt in (recommended default accepted).

### Question 7: May biomes change the height of the land? (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Some requested biomes traditionally have their own shape: Savanna Plateau (flat-topped mesas), Desert (dunes), Swamp (flat, waterlogged), Windswept Hills (rugged). Changing height is the single most dangerous thing this feature could do. It moves land under existing buildings, moves rivers (hydrology routes over `sampleBase`), invalidates the determinism golden and forces a compatibility review for every published world. The landforms that exist today can already provide those shapes if biomes are **chosen from** the landform (Savanna Plateau = warm and dry on highlands) rather than **creating** it.
- **Recommended Default**: **A**. Never in v1. Biomes read the existing landform and elevation. A later, separate proposal could add small, version-gated shape modifiers for **new worlds only**.
- **Options**:
  - [x] A — Never in v1; biomes are chosen from existing landforms (Recommended)
  - [ ] B — Small modifiers (plateau flattening, dune ripples, swamp flats) for new worlds only, in v1
  - [ ] C — Biome-driven terrain shape for new worlds (a much larger project)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: never in v1 (recommended default accepted).

### Question 8: The bundled "Main World" (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: The default world shipped in `DefaultWorld.ts` (seed `soft-lowlands-431`, schema 6, with 1 foundation and 1 building) is the first thing a new player sees. It already migrates with hydrology off. If biomes are switched on for it, its trees and ground change around the existing building, and the bundled package and thumbnail need re-exporting and re-checking. If they're left off, first-time players don't see biomes until they create a world.
- **Recommended Default**: **A**. Leave it unchanged (biomes off). New worlds show biomes. Revisit when the Main World is next re-authored.
- **Options**:
  - [x] A — Leave unchanged, biomes off (Recommended)
  - [ ] B — Turn biomes on, re-check the building's surroundings, re-export the package and thumbnail
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: leave unchanged (biomes off) (recommended default accepted).

### Question 9: Turning biomes on or off after creation (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Land-shaping settings are already locked in online worlds ("Locked in online worlds so everyone walks on the same land", `settingsCatalog.ts`). Biomes count as land. For local worlds, being able to switch both ways is useful, especially for testing, but every switch reshuffles trees and plants.
- **Recommended Default**: **A**. Local worlds: switch either way from Settings, with a confirmation each time. Online worlds: locked like other land settings, so to change it you change your local copy and publish again.
- **Options**:
  - [x] A — Both directions in local worlds, with confirmation; locked online (Recommended)
  - [ ] B — Only chosen at world creation; never changeable
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: both directions, local worlds, with confirmation (recommended default accepted).

---

## C. Layout and climate

### Question 10: How big is a biome? (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: The player walks at 6 m/s and runs at 12 m/s (`TerrainSettings.player`). Today's landform regions are ~1.8 km (`biome.scale = 1800`), forests ~900 m, plant regions 192 m and creature regions 512 m. Biomes that are too small feel like confetti and give no sense of place. Biomes that are too big mean minutes of the same scenery, and with 26 biomes many players will never see the rare ones.
- **Recommended Default**: **A, Normal.** A typical biome is about **600–900 m across**, so a running player meets a new one roughly every 1–2 minutes. Variants (Q12) are smaller patches inside their parent.
- **Options**:
  - [x] A — Normal: ~600–900 m (Recommended)
  - [ ] B — Large: ~1.2–2 km (fewer, grander biomes)
  - [ ] C — Small: ~300–500 m (lots of variety, less sense of place)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: Normal, roughly 600–900 m across (recommended default accepted).

### Question 11: How biomes are laid out (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: This is the core design decision. It decides whether neighbours make sense, whether mountains get mountain biomes, and how cheap classification is. Random cells (Voronoi) are simple but produce snow next to desert. Using landform alone gives only four kinds of place.
- **Recommended Default**: **A**. Two new seeded low-frequency **climate fields** (temperature and moisture), combined with the **existing landform weights** (plains/hills/highlands/mountains) and **elevation** (higher is colder). A third low-frequency **rarity field** selects variants (Sunflower Plains inside Plains, Cherry Grove inside Meadow, and so on). Each biome is a soft "envelope" in that space, and the best-scoring 2–3 blend at borders. Details are in technical plan §4.
- **Options**:
  - [x] A — Climate + landform + elevation, with a rarity field for variants (Recommended)
  - [ ] B — Random cells with adjacency rules
  - [ ] C — Landform only (4 groups, variants by noise)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: climate + landform + elevation, plus a rarity field for variants (recommended default accepted).

### Question 12: Rarity of variant biomes

- **Status**: `Recommended default`
- **Why it matters**: Six requested biomes are natural "variants" of a parent: Sunflower Plains (Plains), Flower Forest (Forest), Old Growth Birch Forest (Birch Forest), Pale Garden (Dark Forest), Cherry Grove (Meadow) and Bamboo Jungle (Jungle). Sparse Jungle is an edge band of Jungle. Too common and they stop being special. Too rare and most players never find them.
- **Recommended Default**: Each variant covers about **15% of its parent's area**, in patches about half the size of a normal biome. Sparse Jungle forms naturally where Jungle meets drier biomes and isn't a separate rarity roll.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-12`: About 15% of the parent biome's area (recommended default accepted).

### Question 13: Neighbours that must never touch

- **Status**: `Safe to decide now`
- **Why it matters**: A snowfield directly beside a jungle breaks believability, and hard climate jumps also cause ugly blends (white snow fading into tropical green over 30 m).
- **Recommended Default**: Temperature and moisture are continuous fields, so this mostly happens on its own. Biome envelopes also leave a gap: no cold biome's temperature range touches a hot one's. A unit test samples thousands of border points and fails if a cold biome and a hot biome are ever within one blend width of each other.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-12`: Never snow next to desert or jungle (recommended default accepted).

### Question 14: Overall world composition

- **Status**: `Recommended default`
- **Why it matters**: The climate fields' thresholds decide how much of the world is each kind of place. Today the world is 100% temperate. Swinging to 40% snow and desert would change the game's relaxed, green character.
- **Recommended Default**: Roughly **temperate 40%** (Plains, Forest, Birch, Dark, Dappled, Meadow and variants), **cold 20%** (Taiga, Snowy Taiga, Snowy Plains, Grove, Snowy Slopes, Windswept Hills), **warm/dry 22%** (Savanna, Savanna Plateau, Shrub Savanna, Tropical Dry Grassland, Desert), **tropical 12%** (Jungle, Sparse Jungle, Bamboo Jungle) and **swamp 6%**. Measured over 100 km² samples across many seeds, with ±5% tolerance per group.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-12`: Temperate 40%, cold 20%, warm/dry 22%, tropical 12%, swamp 6% (recommended default accepted).

### Question 15: Ice on lakes and rivers in cold biomes (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: A liquid blue lake in a snowfield looks odd. But walkable ice touches hydrology, the water renderer, the swim/underwater logic (`underwater.ts`), creature pathing and foundations on water (`foundationWater.ts`). That's its own feature.
- **Recommended Default**: **A**. No ice in v1. Cold-biome water gets a colder, darker tint only if Q16's tint mechanism exists.
- **Options**:
  - [x] A — No ice in v1 (Recommended)
  - [ ] B — Visual-only frosted surface (still swimmable, which may confuse players)
  - [ ] C — Walkable ice (separate, larger feature)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: none in v1 (recommended default accepted).

### Question 16: Swamps and water (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: A swamp is defined by water. Hydrology routes rivers and lakes from the land itself and doesn't know about biomes. Making swamps wetter means either adding water (a hydrology generator change that moves water in existing worlds) or faking it with ground and colour. Getting this wrong either gives a dry "swamp" or rivers that move.
- **Recommended Default**: **A**. Swamps are placed where it's warm, very moist and low and flat, which is where hydrology already tends to put lakes. The swamp biome adds dark mud and wet-ground patches, reeds, swamp trees, low mist and a darker, greener water tint. No new water bodies.
- **Options**:
  - [x] A — Biome over existing water: tint, mud, reeds, mist (Recommended)
  - [ ] B — Also add small shallow ponds in swamps (hydrology change, new worlds only)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: biome over existing water; tint and mud, no new lakes (recommended default accepted).

---

## D. Content

### Question 17: New tree species (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Most of the work is here. Today there are 8 species (`TREE_SPECIES_IDS`: oak, pine, cypress, ornamental, spruce, birch, scotsPine, willow) and 3 canopy kinds (blobs, tiers, spindle). Jungle, bamboo, acacia and cactus need **new canopy or trunk kinds** in `treePrototypeGenerator.ts` and `treeCardAtlas.ts`. Each species adds prototypes, card atlas space and draw calls. Too few and biomes look alike. Too many and memory and draw calls blow the budget.
- **Recommended Default**: **A**. Nine new species: **dark broadleaf** (wide, dense crown), **tall birch** (old-growth), **jungle giant** (tall, buttressed, broad crown), **bamboo** (new "stalk cluster" kind), **acacia** (new flat "umbrella" crown), **cherry blossom** (pink blossom crown), **pale tree** (silvery foliage), **swamp tree** (drooping crown, wide base) and **cactus** (new "columnar" kind). Plus **tint variants** of existing species (frosted spruce and pine for snowy biomes, autumn-warm oak for Windswept Hills) through per-biome foliage tint, not new species.
- **Options**:
  - [x] A — Full set: 9 new species + tint variants (Recommended)
  - [ ] B — Minimal: jungle, acacia, bamboo, cactus only; everything else from tints of existing species
  - [ ] C — Tints only in v1, new species later
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: full set (9 new species + tint variants) (recommended default accepted).

### Question 18: Tree density budget

- **Status**: `Safe to decide now`
- **Why it matters**: Jungles and dark forests look best very dense, but `maxTreesPerChunk = 400` and the LOD and draw-call budgets in `docs/tree-lod-performance.json` assume today's density. Raising the cap would hurt frame time most in exactly the biomes where players will stop and look around.
- **Recommended Default**: Keep the 400-per-chunk cap and the 6 m tree cell. Dense biomes read as dense through **bigger crowns, undergrowth (plants) and darker ground**, not more trunks. Deserts and plains go well below today's density, which frees budget overall.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-12`: Keep 400 trees/chunk cap; dense biomes use bigger trees, not more (recommended default accepted).

### Question 19: Signature plants (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Plants are fully procedural today: species are generated from seeds in random regional pools (`plantEcology.ts`). Some biomes are defined by one specific plant (Sunflower Plains needs **sunflowers**, not a random yellow flower). Others just need a bias (Flower Forest = many flowers; Desert = succulents only). Fixed species are easy to recognise but are hand-authored content. Pure procedural is cheap but can't promise a sunflower.
- **Recommended Default**: **A**. Each biome sets **family and colour biases** for the procedural pools (for example desert = succulent and ground-tuft only, snowy = sparse low tufts, flower forest = more flower species per region). A small set of **fixed signature species** is added: sunflower, reed/cattail (swamp), fern (taiga/jungle undergrowth), dead shrub (desert/shrub savanna) and pale bloom (Pale Garden).
- **Options**:
  - [x] A — Biased procedural pools + a few fixed signature species (Recommended)
  - [ ] B — Biased procedural pools only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: procedural pools biased by biome + a few fixed signature species (recommended default accepted).

### Question 20: Grass per biome

- **Status**: `Safe to decide now`
- **Why it matters**: Grass is the most visible layer near the player and costs the most to draw (`docs/grass-performance.json`). Its density, height and colour per biome do a lot of the work of making biomes feel different.
- **Recommended Default**: Short turf with snow showing through (Snowy Plains/Slopes: sparse), tall golden grass (Savanna family), very sparse dry tufts (Desert), lush tall grass (Jungle, Swamp), rich meadow (Meadow, Plains, Flower Forest), dim sparse forest-floor grass (Dark Forest, Pale Garden). Grass colour follows the biome's ground palette, as it already follows `writeTerrainColor` today. The full table is in technical plan §5.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-12`: Profile per biome (see table in the question) (recommended default accepted).

### Question 21: Where new players spawn (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Every world spawns at the origin. Hydrology already guarantees a river near spawn (`SPAWN_RIVER_RADIUS`). With biomes, some seeds would spawn players in a desert or on a snowy slope, which is a harsh first impression and makes the tutorials (which assume grass, trees and flowers) look wrong.
- **Recommended Default**: **A**. The climate fields are offset per world so the origin always falls in a gentle temperate biome (Plains, Forest or Meadow), with other biomes reachable within about 1 km.
- **Options**:
  - [x] A — Guarantee a gentle temperate spawn (Recommended)
  - [ ] B — Whatever the seed gives
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: gentle temperate biome guaranteed at spawn (recommended default accepted).

### Question 22: Creatures and biomes (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Creatures are generated per 512 m region with no knowledge of the land, and their fingerprints are pinned by snapshot tests (`CreatureFingerprints.spec.ts`). Changing which species spawn where changes every existing world's fauna, which was a deliberate, follow-up-level decision last time (range-weapons F1). A colour bias is cheaper but still changes snapshots.
- **Recommended Default**: **A**. Unchanged in v1. A later proposal could add biome-aware palettes or habitats.
- **Options**:
  - [x] A — Unchanged in v1 (Recommended)
  - [ ] B — Colour palette biased by biome (sandy in deserts, pale in snow), only in biome-enabled worlds
  - [ ] C — Biome-specific species sets (larger change)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: unchanged in v1 (recommended default accepted).

---

## E. Climate and atmosphere

### Question 23: Options when creating a world (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: The Create World dialog (`WorldsScreen.svelte`) asks only for a name and seed today. Every option added there is something players must understand, and something that changes what a seed means (the same seed with "Large" biomes is a different world, which matters when sharing seeds).
- **Recommended Default**: **A**. One "Biome size: Small / Normal / Large" choice, defaulting to Normal. It's saved in the world's biome settings. The developer settings menu keeps the full climate knobs.
- **Options**:
  - [x] A — One "Biome size" choice (Recommended)
  - [ ] B — Biome size + climate sliders (warmer/colder, wetter/drier)
  - [ ] C — No options; developer settings only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: one "Biome size" choice (recommended default accepted).

### Question 24: Weather in different biomes (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Weather is one global state, shared online by the owner (`sharedEnvironment.ts`). Snow falling on deserts and rain on snowfields is the most obvious way biomes could look broken. Fully separate regional weather would mean a new multiplayer protocol, multiple schedules and visible weather "walls" at borders.
- **Recommended Default**: **A**. Keep one shared schedule. Each player's client turns it into local weather from the climate under the camera: cold biomes turn rain into snow, deserts turn rain into a dry, hazy overcast with no rainfall, and jungles and swamps get heavier rain. The change eases over a few seconds while crossing a border. It's deterministic from position, so players in the same place see the same weather.
- **Options**:
  - [x] A — Shared schedule, local precipitation type by climate (Recommended)
  - [ ] B — Same weather everywhere, as today
  - [ ] C — Fully regional weather schedules (larger change, protocol work)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: shared schedule; local snow / rain / dry by climate (recommended default accepted).

### Question 25: Snow on buildings in snowy biomes (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Weather snow already settles on the tops of terrain and buildings through one global `uWxSnow` uniform (`weatherSurface.ts`). Permanent snow in snowy biomes is easy on the terrain (it's the ground palette), but on buildings it needs the biome to be known per pixel in every building shader, through a world-space biome texture. That's extra GPU cost and shader complexity.
- **Recommended Default**: **A**. Permanent snow on the **ground** only (ground palette and grass). Buildings get snow only while it's snowing, as today, which in snowy biomes is often.
- **Options**:
  - [x] A — Ground-only permanent snow; buildings snowy only while it snows (Recommended)
  - [ ] B — Permanent light snow on building tops in snowy biomes too
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: only while it's snowing (as today); ground-only permanent snow (recommended default accepted).

### Question 26: Fog and sky tint per biome

- **Status**: `Safe to decide now`
- **Why it matters**: Atmosphere is cheap and does a lot of the work: humid jungle haze, misty swamp, warm desert glare, cold blue snowfields. Overdone, it fights the day/night cycle and HDRI skies (`SkySystem.ts`, `HdriEnvironmentSystem.ts`).
- **Recommended Default**: Each biome sets a small fog colour/density offset and a light tint, blended at the camera position over about 4 seconds. Offsets are capped, so day/night and weather always dominate. It's local-only and purely visual, so there's no multiplayer impact.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-12`: Subtle per-biome fog/tint, blended at the camera (recommended default accepted).

### Question 27: Ambient sound per biome (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: The implementation-order doc says a biome should "introduce a meaningful sound, habitat, listener, material or project". Sound helps a place feel real (jungle insects, desert wind, swamp frogs). But the project only has a few audio files (`assets/Audio/`), so this means new assets or synthesis, plus mixing work alongside weather audio.
- **Recommended Default**: **A**. A later phase. v1 delivers ground, plant, tree, weather and atmosphere identity. Ambient beds come in a follow-up once biomes are settled.
- **Options**:
  - [x] A — Later phase, not v1 (Recommended)
  - [ ] B — v1: synthesised ambient beds (wind, insects, frogs, birds)
  - [ ] C — v1: recorded or licensed ambient loops (you supply or approve sources)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: later phase, not v1 (recommended default accepted).

---

## F. UI and accessibility

### Question 28: Showing the biome's name (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Players like knowing they've found somewhere new, and it helps when talking about places online ("meet me in the cherry grove"). A persistent label adds HUD clutter. A card that pops up at every border flicker is annoying.
- **Recommended Default**: **A**. A brief, gentle card ("Snowy Taiga") when the dominant biome has held for about 3 seconds, at most once per 20 seconds. It's announced to screen readers through a polite live region, and fades without motion when reduced motion is on. The current biome is also shown in the pause menu. There's a setting to turn the card off.
- **Options**:
  - [x] A — Brief card on entry + name in pause menu, with an off switch (Recommended)
  - [ ] B — No indicator
  - [ ] C — Persistent HUD label
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: brief card on entry + name in pause menu (recommended default accepted).

### Question 29: Biome map

- **Status**: `Safe to decide now`
- **Why it matters**: Developers need to see the biome layout to tune it, and today's debug views (`TerrainDebugView`) include "Biome colours" for the four landforms. A player-facing map is a separate feature with UI, discoverability and performance work of its own.
- **Recommended Default**: Add a developer **"Biome map"** debug view (each biome's colour, blended) and a **"Climate"** view (temperature/moisture). No player-facing map in this feature.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-12`: Developer debug view only (recommended default accepted).

---

## G. Online, delivery and quality

### Question 30: Online compatibility

- **Status**: `Recommended default`
- **Why it matters**: Online worlds require every client to generate the same world, gated by `GENERATOR_VERSION` (`net/protocol.ts`, currently 3). `worldTransfer.ts` rejects a world whose generator version doesn't match, and `server/src/generatorMigration.ts` relabels known-safe older versions. Biomes change generation, so the version has to change. Done badly, either published worlds stop loading or two players see different trees.
- **Recommended Default**: Bump `GENERATOR_VERSION` to **4**. A v3 published world is relabelled to v4 **only** because biomes are absent (disabled) in it, which makes its output identical. Deploy order is Worker first, then site, as with earlier bumps. Publishing a biome-enabled world requires v4 clients. Old clients get the existing "update your game" path.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-12`: Generator version 4; v3 worlds relabelled only when biomes are off (recommended default accepted).

### Question 31: Delivery phases (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: This is a large feature, roughly 7 phases in the brief. One big drop is hard to review and risky to roll back. Phases let you see and steer the look early (ground and grass first) before the expensive tree work.
- **Recommended Default**: **A**. Phases 0–6 as in the brief (§8). Each phase is a reviewable commit series with tests and before/after screenshots, and the world stays playable between phases.
- **Options**:
  - [x] A — 7 phases as in the brief (Recommended)
  - [ ] B — 3 larger drops: foundation + ground/grass; trees + plants; climate + online
  - [ ] C — One drop
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Decision**: `Locked 2026-11-12`: **A**: 7 phases as in the brief (recommended default accepted).

### Question 32: Performance budget

- **Status**: `Recommended default`
- **Why it matters**: Biome classification runs wherever chunks generate (terrain, grass, plants, trees). If it costs too much, streaming stalls while running or riding fast creatures. A budget agreed now becomes a pass/fail check rather than a judgement call later.
- **Recommended Default**: Measured with the existing perf e2e harnesses (`treePerformance`, `grassPerformance`, `plantPerformance`) on the same machine and preset: at most **+15% chunk-generation time** (terrain + vegetation, p95), at most **+0.5 ms median frame time**, no new per-frame allocations, and the draw-call increase from new species within **+10%** in the densest biome.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-12`: ≤ 15% extra chunk-generation time; ≤ 0.5 ms extra frame time (recommended default accepted).

### Question 33: Testing scope

- **Status**: `Safe to decide now`
- **Why it matters**: Determinism, migration and performance regressions are the expensive failures here, and none of them are visible in a quick play test.
- **Recommended Default**: Unit tests for climate, classification, blending, adjacency and composition. The determinism golden extended with a `biomes` section and checked in all three browser engines. Migration fixtures v9 → v10. E2E tests for biome-name card, settings toggle and old-world unchanged. Perf runs against Q32. The full list is in technical plan §16–17.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">
- **Decision**: `Locked 2026-11-12`: Unit + golden determinism + e2e + perf, as listed in the technical plan (recommended default accepted).
