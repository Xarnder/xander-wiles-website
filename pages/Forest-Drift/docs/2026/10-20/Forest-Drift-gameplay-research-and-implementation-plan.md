# Forest Drift: gameplay research and prioritised implementation plan

Research and repository review: 20 October 2026.

This is a design and implementation plan, not a claim that the proposed features have been built. It contains no implementation timescales. The numbered backlog is ordered from most important to least important; dependencies and completion criteria explain how to deliver it safely.

## 1. Recommended direction

**Make Forest Drift a game about discovering the forest's sounds, growing a musical garden, befriending its listeners, and building a home that becomes part of the forest.**

The strongest opportunity is the connection between systems already present. Forest Drift already has sophisticated construction, procedural landscapes, visually varied plants and creatures, a working music garden, and online shared building. Its next major improvement should give players reasons to use those systems together.

A separate multiplayer settlement layer is specified in section 17: new residents join a village around a central well, claim road-connected plots and share local services and markets. Established players can eventually found another village at substantial cost. This shapes where people live without becoming another compulsory stage of the music loop.

The recommended core loop is:

> Explore → discover a musical plant → bring back seeds → grow and arrange it around a Music Tree → perform → attract and understand creatures → receive materials and friendship → improve your home and garden → discover a reason to explore again.

Building should be available early. Music should be enjoyable before the player understands music theory. Creatures should feel like inhabitants with preferences rather than machines that dispense currency. Exploration should change what the player can do, rather than just reveal different scenery.

Your rough loop has the right ingredients. I recommend changing its reward structure: **ordinary listeners give useful building materials directly; established creature friends offer specialist exchanges; gems unlock unusual options later.** Requiring every reward to pass through stones, then gems, then another creature before it becomes a wall would make the main loop harder to understand and slower to enjoy.

The first major delivery should be a deliberately small but complete game: one dependable starting area, a few recognisable musical plants, a few listeners, one useful reward cycle, a modest house project, and reliable saves. Expand the variety after that experience works.

## 2. Evidence and scope

### How to read the research

- Minecraft's table below describes historical implementation order, not an ideal order every game must copy.
- Other games' feature comparisons describe documented mechanics. Development chronology is stated only where a developer announcement supports it.
- Conclusions about why those mechanics suit Forest Drift are design interpretations, not experimentally proven explanations of another game's success.
- Repository findings come from source and test inspection. I did not launch the game, perform a new browser playtest, or rerun the existing test suite for this document. Existing tests show intended coverage, not a fresh pass result.
- Proposed plant names, creature roles, rewards, formulas, and quantities are working designs. They should be validated in play, then tuned.

Primary sources are preferred. A few Minecraft development-stage dates use community historical records because the earliest builds have fragmented documentation. Several Minecraft Wiki pages could not be opened directly; where used, the research relies on their indexed historical entries. The plan avoids pretending that every early patch is comprehensively documented.

## 3. Minecraft: what was implemented first, in order

The important distinction is between **being able to alter a world** and **having Minecraft's familiar survival progression**. The former came first. Crafting, farming, automation, beds, and trading arrived at different stages.

| Order | Period / milestone                                               | Features introduced or substantially established                                                                                    | What this contributed                                                      | Implication for Forest Drift                                                                                                  |
| ----- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1     | Pre-Classic, May 2009                                            | First-person movement in a generated block world; placing and removing blocks.                                                      | A simple, direct way to change the surroundings.                           | Make the basic interactions satisfying before expanding the content catalogue.                                                |
| 2     | Public Classic, May 2009                                         | Publicly playable construction sandbox; more block and world variety across Classic. The official anniversary date is 17 May.       | Players could make things worth showing others.                            | Forest Drift already has this creative foundation; it needs motivating connections.                                           |
| 3     | Multiplayer Test, beginning 31 May 2009                          | Shared-world multiplayer building experiments.                                                                                      | Creation acquired a social purpose very early.                             | Social creativity is valuable, but multiplayer alone does not provide a resource economy.                                     |
| 4     | Survival Test, September–October 2009                            | Health and hostile creatures, including zombies, skeletons and creepers; survival interactions.                                     | The environment began to create problems and consequences.                 | Forest Drift needs meaningful problems, but can use habitat, navigation and visitor needs instead of combat.                  |
| 5     | Indev, December 2009–February 2010                               | A survival-development branch; more persistent progression and inventory-related systems developed across this stage.               | A world became somewhere to keep investing effort.                         | Save discoveries, gardens and relationships as carefully as buildings.                                                        |
| 6     | Indev, 24 January 2010                                           | Chests introduced.                                                                                                                  | Collected resources could have a lasting place in a home.                  | Storage is useful very early once gathering exists.                                                                           |
| 7     | Indev, 29 January 2010                                           | Crafting and foundational item/tool progression, including sticks, ingots and diamonds; tools were introduced in this period.       | Resources could become capabilities, rather than only accumulate.          | Plants and materials need concrete uses and understandable next steps.                                                        |
| 8     | Indev, 6 February 2010                                           | Farming: seeds, farmland, hoe, wheat and bread.                                                                                     | A renewable production loop connected a home to future activity.           | Growing musical plants should supply a renewable creative resource.                                                           |
| 9     | Indev, February 2010                                             | Day/night cycle; furnaces on 19 February established a dedicated smelting station.                                                  | Time and transformation gave a base more practical purpose.                | Use weather and growing conditions to make gardens interesting; keep processing simple initially.                             |
| 10    | Infdev, beginning 27 February 2010; development through mid-2010 | Experiments with effectively infinite terrain and chunk-based worlds; further exploration and traversal development.                | More room for discovery and long-lived worlds.                             | Forest Drift already streams terrain. Its next exploration work should add memorable destinations and meaningful discoveries. |
| 11    | Alpha, July 2010 onward                                          | Redstone arrived in Alpha 1.0.1; survival multiplayer developed during Alpha, distinct from Classic's earlier creative multiplayer. | Simple mechanics began combining into player-built systems.                | Later, let music interact with lights, water and garden mechanisms. Avoid building that before the core loop.                 |
| 12    | Halloween Update, October 2010                                   | Nether dimension and a new generator with formal biomes.                                                                            | Major exploration variety expanded an established game.                    | Add biomes when they change plants, listeners, sounds or materials.                                                           |
| 13    | Beta, January–February 2011                                      | Note blocks on 13 January; beds in February.                                                                                        | More expression, utility and reasons to customise a base.                  | Musical creation can be Forest Drift's central verb from the outset because it already exists.                                |
| 14    | Later Beta / release, 2011; trading in 2012                      | Villages appeared in Beta 1.8; villagers initially lacked trading. Trading followed in 2012.                                        | Settlements and exchange expanded an already functioning progression loop. | Creature barter and player trade can deepen the game after materials already have useful sources and sinks.                   |

Sources for the earliest stages and branch order: [development history](https://en.wikipedia.org/wiki/Development_of_Minecraft%3A_Java_Edition), [multiplayer's first implementation](https://en.wikipedia.org/wiki/Minecraft_server), [Survival Test history](https://minecraft.fandom.com/wiki/Java_Edition_Survival_Test), and the official [anniversary retrospective](https://www.minecraft.net/en-us/15th-anniversary). Mojang's [Classic retrospective](https://www.minecraft.net/en-us/article/embrace-past-minecraft-classic) describes the limited block palette of its browser recreation; that recreation should not be mistaken for the exact contents of the first public build.

Specific item milestones are supported by Mojang's histories of [chests](https://www.minecraft.net/nl-nl/article/block-week-chest), [crafting-era string](https://www.minecraft.net/en-us/article/taking-inventory--string), [axes](https://www.minecraft.net/fr-ca/article/taking-inventory--axe), [wheat and farming](https://www.minecraft.net/en-us/article/taking-inventory--wheat), [furnaces](https://www.minecraft.net/nl-nl/article/block-week-furnace), [redstone](https://www.minecraft.net/en-us/article/block-week-redstone), [biomes](https://www.minecraft.net/es-mx/article/around-block--swamp), [note blocks](https://www.minecraft.net/fr-fr/article/block-week-note-block), [beds](https://www.minecraft.net/ru-ru/article/taking-inventory--bed), and [emerald trading](https://www.minecraft.net/en-us/article/taking-inventory--emerald). The indexed [day/night history](https://th.minecraft.wiki/w/%E0%B8%A7%E0%B8%B1%E0%B8%8F%E0%B8%88%E0%B8%B1%E0%B8%81%E0%B8%A3%E0%B9%80%E0%B8%A7%E0%B8%A5%E0%B8%B2) places its introduction in February 2010. The [Infdev record](https://minecraft.fandom.com/wiki/Java_Edition_Infdev_20100227-1) dates the initial infinite-world experiment.

Early crafting-table dates differ between some official retrospectives and community version histories. This plan uses **29 January for crafting's introduction** and treats the separate crafting-table/grid refinements as part of the following Indev changes; no Forest Drift decision depends on resolving a one-day discrepancy.

For the later settlement distinction, Mojang's [village history](https://www.minecraft.net/ja-jp/article/village) dates villages to Beta 1.8 in September 2011, while its [villager retrospective](https://www.minecraft.net/es-mx/article/meet-villagers) explicitly says the first villagers could not trade. This is why trading is listed as a later layer rather than a foundation of the original game.

### Most important lessons, ranked

1. **A small set of satisfying verbs can carry a game.** Placing, breaking, gathering and transforming items mattered before a huge list of content existed. For Forest Drift, those verbs are inspect, collect, plant, arrange, perform, befriend and build.
2. **Persistent change creates ownership.** The player should recognise what they changed and want to return to it.
3. **Progression works when resources create capabilities.** A new plant should introduce a sound or interaction, not just a higher sale price.
4. **Systems become deeper when they connect.** A garden that attracts a creature which helps construct a home is more valuable than three isolated demonstrations.
5. **Exploration needs useful variation.** More terrain matters when travelling reveals something that affects play.
6. **Social play amplifies an existing activity.** Shared creation is valuable even before trade; trade needs trustworthy ownership and scarcity.
7. **Large content expansions should follow a working foundation.** Minecraft's chronology is useful evidence that a game can grow through layers, although chronology alone does not prove causation.

Forest Drift should borrow these structural ideas while developing its own identity. Hunger, mining tiers, hostile nights and equipment durability are not necessary prerequisites for a compelling forest game.

## 4. Comparable games: the features most relevant to Forest Drift

### Stardew Valley — several activities feeding a place and a community

The official description connects farming, foraging, crafting, relationships, exploration and restoration. These create different ways to work toward personal and shared goals. In a 2015 development update, ConcernedApe explicitly described connecting partly completed systems. Co-op was added later in the 1.3 update, released on PC on 1 August 2018. Sources: [official overview](https://www.stardewvalley.net/about/), [development update 25](https://www.stardewvalley.net/dev-update-25/), [multiplayer announcement](https://www.stardewvalley.net/stardew-valley-1-3-multiplayer-update-is-now-available/).

**Forest Drift interpretation:** offer small goals in different activities that contribute to one visible home. A player can discover a reed, grow it, meet a listener, or complete a room without following one mandatory daily checklist. Borrow the connected goals; avoid making constant watering or exhaustion the price of participation.

### Animal Crossing: New Horizons — a home and landscape worth personalising

Nintendo describes learning recipes, gathering island resources, crafting furnishings, upgrading a tent into a house, and contributing to infrastructure. Collection, gardening, residents and decoration provide parallel activities. Sources: [creating a getaway](https://animalcrossing.nintendo.com/new-horizons/create/), [island exploration](https://animalcrossing.nintendo.com/new-horizons/explore/).

**Forest Drift interpretation:** a home is both a practical centre and an expression of identity. Give discovery a journal and display value; make paths, storage, seating and garden decorations useful. Introduce the first shelter before long progression chains. Use a game-world clock rather than mandatory real-calendar waiting.

### Slime Rancher — creatures connect exploration to production

The developer's store description emphasises collecting slimes, growing crops, harvesting resources and exploring with a common tool. Ranch management and the creatures' outputs connect returning home with venturing out. Source: [developer store description](https://store.steampowered.com/app/433340/Slime_Rancher/), specifically its “About This Game” section.

**Forest Drift interpretation:** a new creature should change the player's understanding of their garden. Different listeners can bring different materials or useful knowledge. Keep creatures free to visit and leave; don't make every relationship an enclosure or production-rate problem.

### Spiritfarer — practical upgrades acquire emotional purpose

Thunder Lotus describes building a boat, exploring, caring for spirit passengers, and farming, mining, fishing, harvesting, cooking and crafting. Source: [official game page](https://thunderlotusgames.com/games/spiritfarer/).

**Forest Drift interpretation:** connect construction to an inhabitant's recognisable need. A sheltered listening spot or reed-side resting place can give a building project meaning. Forest Drift does not need to copy Spiritfarer's narrative subject or make every visitor a long dialogue quest.

### Ooblets — a distinct central interaction unifies familiar systems

The developer announced replacing traditional battles with dance-offs in June 2018. Later devlogs show iteration on how those encounters connect to seeds and creature collection. A December 2019 update also explains adding close-range text because farm-state visuals were ambiguous. Sources: [dance-off announcement](https://ooblets.com/2018/06/the-secret-ooblets-feature-weve-been-working-on/), [seed-system revision](https://ooblets.com/2019/09/september-2019-devlog/), [farm-information UI](https://ooblets.com/2020/01/december-2019-devlog/).

**Forest Drift interpretation:** music should affect what happens, not simply decorate a standard crafting game. Plant information should explain readiness and growing conditions clearly. Also expect to revise the proposed loop: attractive ideas need practical balancing, as those devlogs demonstrate.

### Sky: Children of the Light — music as a reason to gather

Sky's official materials describe players composing, performing and sharing with instruments, while the AURORA experience demonstrates a shared musical event. Sources: [music and performance](https://www.thatskygame.com/creator-space/), [AURORA](https://www.thatskygame.com/aurora/).

**Forest Drift interpretation:** listening can be valuable play. Visitors need reactions, seating, gentle invitations and a way to participate without composing. Forest Drift should first support intimate garden gatherings within its existing room limits rather than pursue mass concerts.

### Valheim — exploration and building improvements reinforce each other

Iron Gate describes procedural exploration, gathering, crafting stations, construction tiers, farms and cooperative bases. Its FAQ explains that environments and resources support progression and that food improves attributes without starvation being mandatory. Sources: [official overview](https://www.valheimgame.com/), [FAQ](https://www.valheimgame.com/faq/).

**Forest Drift interpretation:** returning from an expedition should improve the home, and a better home should support another expedition. Borrow that relationship, adapting gates into habitat knowledge, instruments and paths. Avoid importing combat bosses or destructive raids into the default experience.

### ODDADA — approachable creation with a finished artefact

Its developer store description presents a low-pressure musical playground with discoverable tools, changing instruments, customisable virtual cassettes and audio export. Source: [developer store description](https://store.steampowered.com/app/1627870/ODDADA/), specifically “About This Game”.

**Forest Drift interpretation:** creation should produce something the player can name, save, revisit and eventually share. Constrained, forgiving musical tools can still offer expression. Audio export is useful later; understanding the garden instrument comes first.

### Cross-game feature priorities

| Priority | Repeated useful pattern                     | Forest Drift application                                                   |
| -------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| Highest  | Clear interaction → visible result          | A collected seed becomes a sounding plant; a visitor leaves a usable gift. |
| Highest  | Permanent, personally meaningful change     | Gardens, homes, discoveries and creature relationships survive reloads.    |
| Highest  | Activities feed each other                  | Exploring changes music; music changes visitors; visitors help building.   |
| High     | A short, understandable next goal           | Find a bass plant; help a listener; finish a shelter.                      |
| High     | New capabilities alongside cosmetic variety | New sounds, habitat tools and building functions.                          |
| High     | Home as a useful and expressive place       | Storage, nursery, listening spaces and custom rooms.                       |
| Medium   | Relationships and collection                | Named returning visitors, journal pages, specimen displays.                |
| Medium   | Shared creation                             | Friends visit, arrange gardens and build together.                         |
| Later    | Extensive exchange and automation           | Specialist barter, safe player trading and musical mechanisms.             |

## 5. What Forest Drift already has

### Source-based capability audit

Paths below are relative to the Forest Drift repository directory. They are evidence pointers, not a requirement to reorganise the existing project.

| System                  | Observed implementation                                                                                                                                                  | Missing connection / proposed extension                                                                                                               | Source pointers                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Terrain and exploration | Seeded terrain, regions and streaming; rivers/lakes through hydrology.                                                                                                   | Gameplay destinations, discoverable resources, field navigation and reasons to revisit.                                                               | `src/lib/game/terrain/TerrainManager.ts`, `TerrainHeightSampler.ts`, `src/lib/game/hydrology/`                           |
| First-person movement   | Walking, running, jumping, collision, touch controls and flight support; online guide says flight is disabled online.                                                    | Interaction targeting, reliable returning-home tools, contextual prompts.                                                                             | `src/lib/game/player/FirstPersonController.ts`, `src/lib/components/TouchControls.svelte`                                |
| Building                | Foundations, walls and paths, doors/windows, multiple levels, slabs, stairs, roofs, barriers, material changes, furniture, Mini Builds and undo.                         | Resource-funded construction, beginner-friendly house projects, usable room functions and economic treatment of undo.                                 | `src/lib/game/building/`, `src/lib/game/miniBuild/`, `docs/MiniBuild.md`, `docs/Furniture.md`                            |
| Wild vegetation         | Procedural species, colonies, habitat variation, rarity and optimised rendering.                                                                                         | Inspectable collectible identity, seed collection, harvest deltas and authored cultivation. Wild visual plants are not currently a farming inventory. | `src/lib/game/vegetation/plants/PlantTypes.ts`, `plantEcology.ts`, `plantPlacement.ts`, `PlantManager.ts`                |
| Music garden            | Music Trees, five plant species entries, pitch and instrument assignment, loop/timeline sequencing, sustain, wave visuals, MIDI parsing/planning/import and persistence. | Discovery/growth link, guided composition, formal performances, listeners and rewards.                                                                | `src/lib/game/music/MusicModel.ts`, `MusicTreeSequencer.ts`, `MusicPlantPlacementTool.ts`, `midi/`, `tests/music.e2e.ts` |
| Creatures               | Seeded species and individuals, four body plans, anatomy, animation, LOD, ecology, proximity behaviour and persistent-individual recipes.                                | Music attraction, listening behaviour, friendship, named visitor continuity, gifts and barter.                                                        | `src/lib/game/creatures/CreatureTypes.ts`, `CreatureBehaviourSystem.ts`, `CreatureEventBus.ts`, `CreaturePersistence.ts` |
| Environment             | Sky and weather systems, environmental audio and shared-environment infrastructure.                                                                                      | Bounded effects on growing, discovery and visitors; accessible presentation.                                                                          | `src/lib/game/weather/`, `src/lib/game/sky/`, `src/lib/game/net/sharedEnvironment.ts`                                    |
| Saves                   | Versioned logical world definitions, migrations, IndexedDB repository, autosave, import/export and revisions. Current schema constant is 9.                              | Inventories, cultivated plants, discoveries, claims and relationship records; new migrations and validation.                                          | `src/lib/game/world/WorldTypes.ts`, `WorldSession.ts`, `WorldMigrationManager.ts`, `WorldValidation.ts`                  |
| Multiplayer             | Room/protocol implementation, shared authored entities, permissions, avatars, reconnect and server persistence. Local guide describes a deployed shared world.           | Authoritative gameplay resources and rewarded visitors, performance transport, atomic trade and stronger identity for portable ownership.             | `src/lib/game/net/`, `server/src/WorldRoom.ts`, `docs/multiplayer-player-guide.md`                                       |
| Existing validation     | Unit and browser test files cover music, worlds, creatures, building, networking and performance.                                                                        | Tests of the connected progression loop, plus fresh human playtesting.                                                                                | `tests/music.e2e.ts`, `tests/worldPersistence.e2e.ts`, `tests/creatures.e2e.ts`, `tests/multiplayer.e2e.ts`              |

### Important boundaries the implementation must respect

**Wild plants and music plants are separate systems.** Procedural wild plants regenerate from settings and seed. `MusicPlantDefinition` records authored notes around a tree. A new gameplay definition must connect them without treating every wild flower as a full saved object.

**The existing `growth` music field is not a cultivation system.** `MusicModel.ts` marks it as legacy; `MusicMigration.ts` converts old growth-derived pitch into explicit musical values. Do not restore biological growth by changing the old pitch behaviour. Growing a plant should not silently detune a composition.

**Creatures currently react to proximity, not music.** The inspected behaviour states are `IDLE`, `WANDER`, `LOOK`, `APPROACH`, `FLEE` and `RETURN_TO_GROUP`. `CreatureEventBus.ts` exposes spawn, despawn, state and footstep events and explicitly describes future interaction seams. It does not implement audience rewards.

**Ambient creatures currently run locally online.** The player guide states that exact movement can differ between players. Shared entity rows explicitly exclude creatures. Therefore two clients must not independently award items because their local copy of an animal heard a song.

**Shared music content is not proof of synchronised performance.** Music Trees and plants are network entity kinds. The inspected sequencer starts against a local `AudioContext` clock. A common concert start and late-join state need their own transport design.

**Construction is currently a creative tool path.** For example, foundation confirmation validates geometry and water restrictions, then adds a foundation. That path has no resource debit. Costing must be inserted through a central transaction layer, not scattered across tools.

**Multiplayer identity is not yet a portable player account.** The local guide says identities and access are remembered by the browser. This is adequate for invited shared building but does not establish cross-device ownership for a persistent market.

**Existing worlds need protection.** Default old worlds to their present creative behaviour. Introduce progression through new worlds or an explicit conversion flow with a backup and clear rules. Existing imported MIDI gardens and player houses must not acquire unpaid bills or stop working.

## 6. Refined gameplay loop

### The immediate loop: an action feels good

1. Notice an unusual plant through shape, habitat and a short preview sound.
2. Inspect it and collect a seed without destroying the whole colony.
3. Plant it and see a visible stage change.
4. Place or move a ready musical plant into the garden and hear the phrase change.
5. See a nearby creature react.

Each action needs a readable cause and effect. Don't make the first interesting feedback depend on completing an entire house or mastering a sequencer.

### The home loop: an expedition changes your place

1. Choose a practical or expressive goal: another instrument, a porch, a visitor's favourite planting, a listening bench.
2. Explore a recognisable local habitat.
3. Bring back something useful.
4. Improve a composition or habitat.
5. Perform and receive a clearly explained gift.
6. Spend some of the materials on a visible home improvement.
7. Discover another reachable goal.

### The progression loop: new relationships create new possibilities

1. Learn a visitor's preference through observation and journal hints.
2. Give it a suitable listening place and perform something it enjoys.
3. Establish friendship without mandatory daily attendance.
4. Unlock a seed source, blueprint, specialist exchange or discovery clue.
5. Use that new capability to explore or create differently.

### The social loop: share something worth visiting

1. Build a garden or home with a recognisable identity.
2. Invite friends to listen, explore or help.
3. Compose and build together with clear permissions.
4. Exchange surplus seeds and materials once ownership is trustworthy.
5. Save memories, compositions and blueprints worth revisiting.

Multiplayer should enrich this loop. A solo player must be able to obtain all essential construction resources and continue progressing.

### What changes from the original idea

| Original ingredient                  | Recommendation                                              | Reason                                                                          |
| ------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Explore and find plants              | Keep as the principal discovery activity.                   | It supplies variety and reasons to leave home.                                  |
| Grow plants                          | Keep, with short readable stages and renewable supply.      | The player nurtures creative possibilities.                                     |
| Create music around a Music Tree     | Make this the distinctive central activity.                 | It is already implemented and gives the game an identity.                       |
| Perform and attract creatures        | Keep, with visible preferences and deliberate performances. | It connects expression to the living forest.                                    |
| Receive building materials           | Give some directly from ordinary visitors.                  | The reward is immediately understandable and useful.                            |
| Receive stones and gems              | Separate common stone from rare specialist gems.            | One is construction stock; the other provides later choices.                    |
| Give gems to creatures for materials | Make this optional specialist barter.                       | It adds depth without becoming a mandatory extra conversion.                    |
| Build a house                        | Start early and develop continuously.                       | The player needs a personal place before the late game.                         |
| Trade with players                   | Add after authority, identity and transaction foundations.  | Trading amplifies existing value and should not undermine saves or progression. |

## 7. Prioritised implementation backlog

The following rank is the recommended order of investment. Rank 1 defines and starts the integration target; ranks 2–11 supply its minimum playable parts. Finish that complete loop before broadening into the later systems. Accessibility, save safety and performance are requirements throughout, even where later entries describe their broader expansion.

### 1. Establish the smallest complete playable loop

**Why first:** the central uncertainty is whether exploration, music, creatures and building are enjoyable together. More isolated tools will not answer it.

**Build:** create a progression-world start with one accessible Music Tree, an inspectable nearby colony, renewable starter seeds, a place to cultivate them, a friendly listener and one modest construction project. The start should let the player finish a short musical phrase and make a visible home improvement using the resulting gift. Provide a starter sound so cultivation never becomes the first thing the player must wait for.

The initial content target is three musical plant families, three listener profiles, four common material types, one specialist material, a starter shelter blueprint and a handful of useful furnishings. These are scope limits for proving the design, not eventual content limits. Use the existing geometry and music systems.

**Implementation:** introduce a small gameplay coordinator and a content fixture. Keep economy and progression decisions in renderer-independent functions. Start with events such as `SeedCollected`, `PlantReady`, `PerformanceCompleted`, `GiftClaimed` and `BuildCommitted`. Don't require a universal event framework before the first loop works.

**Completion:** a new player can explain why they explored, changed the garden, attracted a listener and built something. Reopening the world preserves all four results. The same basic loop remains possible after the first reward.

### 2. Add persistent gameplay state, inventory and transaction rules

**Depends on:** the content and ownership decisions in rank 1.

**Build:** item definitions, stack inventory, seed pouch, material stockpile, discovery records, progression flags and a logical gameplay clock. A player sees what they have, what an item is for, and how to obtain it. Distinguish consumable stock, known blueprints and learned musical capabilities.

Initially use generous capacity and no weight system. Storage should simplify organisation, not make walking home the dominant activity. If a reward cannot fit, keep it in a persistent pending-gift record; never delete it.

**Implementation:** add a versioned gameplay section to `WorldDefinition`, migration defaults, import/export validation, autosave revision integration and bounded collections. Use stable item IDs and integer quantities. Provide commands that validate prerequisites and commit changes together. Every reward and spending action has a unique operation ID and an inspectable result.

Keep new offline progression world-scoped. Plan shared-room stock separately from personal inventories before adding online earning. Do not invent portable accounts in this foundational patch.

**Completion:** item totals cannot become negative; failed actions do not consume items; repeated reward commands do not duplicate items; save/reload and export/import preserve state. Old creative worlds load without progression restrictions.

### 3. Make the forest inspectable and collectible

**Depends on:** 2.

**Build:** one consistent “interact” action for plants, seed pods, useful fallen branches, small stones and later creature gifts. Targeting shows a name, action and brief explanation. Plants offer a sound preview and habitat clue before collection.

Only a curated subset of visible vegetation needs to be collectible initially. Identify it through silhouette, seed pods and the interaction prompt; don't turn every grass blade into a pickup. Collecting seeds should leave the colony visually alive, with a clear cooldown or harvested marker.

**Implementation:** create stable resource IDs from world seed, generator version, region/cell and candidate identity. Add bounded harvest overrides or cooldown records alongside the existing procedural-delta approach. Pick candidates through spatial queries rather than adding a heavyweight scene object to each rendered plant. Regenerating or unloading a chunk must not regenerate a claimed resource early.

Provide repeatable nearby sources of all essential starter seeds and materials. Random generation may create rare optional finds, but cannot determine whether the player can start the game.

**Completion:** players can collect, leave the chunk, return and see the correct state. The same resource cannot be collected simultaneously twice. Keyboard/mouse and touch use the same action semantics. Essential seed sources remain reachable across representative world seeds.

### 4. Add a forgiving cultivation system

**Depends on:** 2–3.

**Build:** authored planting beds or pots with seed → sprout → ready stages. Show current state and one actionable need. Begin with light and moisture categories rather than a full soil chemistry simulation. Suitable conditions grow normally; unsuitable ones slow growth and explain the problem.

Care should improve readiness or seed yield. Neglect should not kill the player's last copy. Rain can supply moisture, and initial plants should be easy to grow near the starting area. Plants mature through active world simulation, with no requirement to return on a real calendar day.

**Implementation:** keep cultivated plant records separate from procedural vegetation and note records. Store species/content ID, position, planted simulation time, accumulated growth and care state. Update at coarse intervals or on relevant events rather than per frame. Save authored plants, not meshes or every ambient flower.

Start with offline progression: paused worlds and closed browsers do not grow. Online growth must later use the room's authoritative active-world clock. Imported world time and owner weather adjustments must not mint growth rewards accidentally.

**Completion:** stages survive reloads; unloading has the same result as staying nearby; planting consumes one seed only on success; mature plants provide a renewable seed route. Growth never changes a stored note's pitch or musical timing.

### 5. Connect discovered plants to the existing music garden

**Depends on:** 3–4 and existing music systems.

**Build:** a clear mapping from a discoverable botanical identity to an instrument family. A player previews the sound when inspecting, recognises it when planting, and hears it in a composition. Start with a bell-like flower, a low resonant mushroom family and a soft reed or pad family.

Give each family one meaningful musical role. Cosmetic variants can share that role. Avoid making hundreds of generated flower colours into hundreds of nearly identical inventory items.

**Recommended ownership rule:** cultivating a ready musical plant creates a reusable garden voice. Moving that voice, changing its note and rearranging a song cost no materials. Multiplying simultaneous planted voices requires more cultivation. Keep the reusable capability distinct from consumable seeds.

**Implementation:** add a gameplay plant catalogue referencing both botanical recipes and existing instrument IDs. Add an optional source/cultivation reference to authored notes through an explicit migration. Keep biological stage, visual identity, pitch, duration and gain as separate concepts. Preserve exact imported MIDI data.

**Completion:** one discovery clearly changes the player's available sound; re-editing a phrase never destroys a seed; authored plants maintain identity through saves. Creative mode and existing MIDI imports retain their current freedom.

### 6. Make composition understandable without music knowledge

**Depends on:** 5.

**Build:** a beginner view with “add a sound”, “move when it plays”, “higher/lower”, “longer/shorter”, “listen” and “undo”. Show how the expanding wave triggers notes. Keep scale-safe defaults and offer a few editable starting phrases.

Use the same underlying editor for beginner and advanced controls. Advanced players can expose precise pitch, sustain, tempo, meter and MIDI tools. A player should progress from altering a pleasant starter phrase to making something recognisably theirs.

Preview a sound before placement. Give the earliest phrase enough audible space that adding another instrument sounds like an improvement rather than uncontrolled noise. Keep a clear distinction between botanical planting locations and the music grid.

**Implementation:** layer UI over existing `MusicModel`, timeline and placement logic. Add composition snapshots or revisions for non-destructive editing. Respect existing controls and touch-action infrastructure. Audio must resume through a user gesture when the browser requires it.

**Completion:** a first-time user can change a phrase, hear the difference, undo it and save it. The result remains useful for attracting a beginner listener. Basic progress does not require MIDI import, notation, precise rhythm input or an external tutorial.

### 7. Add music-responsive creature listeners

**Depends on:** 5–6 and existing creature runtime.

**Build:** nearby creatures notice an active garden, consider whether they like it, approach a reachable listening point, settle, react and eventually leave. Show the transition with body language before displaying a reward.

Begin with three readable preference profiles: a curious listener attracted to the starter sound, a calm listener drawn to sparse sustained notes, and a lively listener drawn to a clearer rhythmic pattern. Species appearance and individual temperament can vary without making every preference unknowable.

**Implementation:** introduce a separate audience intent/state layer so music does not overwrite basic locomotion safety. States might include noticing, approaching, listening and departing; keep behaviour-state validation compatible. Query nearby sound sources through a spatial index and evaluate preferences from symbolic composition data.

Choose viable listening spots and reserve spacing by body size. If there is no safe route, use a reachable perimeter point or explain the obstructed venue. Do not teleport a visible animal through a wall. Start with modest local range and a bounded audience.

**Completion:** listeners respond predictably to a changed phrase, avoid dangerous terrain and do not crowd through structures. LOD or a low graphics setting cannot change whether a logical visit qualifies.

### 8. Define deliberate performances and understandable feedback

**Depends on:** 6–7.

**Build:** separate free composition playback from “perform for visitors”. A performance has a selected tree, a composition snapshot, a beginning, a bounded musical completion point, audience feedback and an ending. Free playback remains unlimited.

Allow simple live decisions such as introducing a layer or changing intensity at a musical boundary. A technically complex rhythm game is unnecessary. Muted players can participate through visual timing and reactions; hearing volume must not determine rewards.

**Implementation:** evaluate musical attributes from note data: active roles, density, repetition and tempo range. Don't inspect microphone input or attempt subjective audio-quality scoring. Store the composition revision used for eligibility; edits during the show apply predictably at boundaries or to the next performance.

Interrupted performances may offer a small acknowledgement, but full gifts require reaching the defined completion point. Explain this gently. A listener should like a particular feeling, not declare one style universally superior.

**Completion:** a simple phrase can succeed; more notes do not automatically earn more; the player can explain at least one creature reaction. Repeating a loop forever does not count as endlessly completing fresh shows.

### 9. Award useful gifts and close the reward loop

**Depends on:** 2, 7–8.

**Build:** qualifying visits provide named, visible gifts: timber, fibre, clay or stone. Show who brought what and why. Make the earliest gift enough to complete a meaningful small project rather than one tiny fraction of an expensive house.

Provide a guaranteed qualifying beginner visitor or a clear alternate path to the first reward. Rewards should depend on a valid performance and available visit opportunity, not rare random drops. Repeat visitors can bring modest supplies; first discoveries or fulfilled preferences can unlock one-time extras.

**Implementation:** create a reward ledger keyed by world, performance, visit and beneficiary. Grant stock and mark the claim in one transaction. Use reward opportunities tied to meaningful visits and bounded world progression, rather than raw note count or render visibility. Persist unclaimed gifts without depending on the creature staying loaded.

Give every common construction material an ordinary gathering source as well. Music should be a pleasant, valuable path, not the only way a player can replace their first door.

**Completion:** replaying a command, reloading, changing clients or leaving the area cannot duplicate a gift. A failed save leaves a recoverable state. The player sees a clear connection from song to visitor to material.

### 10. Make existing construction a rewarding use of materials

**Depends on:** 2, 9 and existing build tools.

**Build:** material costs, visible quotes, affordable starter shapes and an optional ghost blueprint for a small shelter. Retain freeform construction. Show missing materials and their known sources before committing.

Start with a small open shelter, then a room, then a personal house. Avoid making the starter project depend on roofs, advanced stairs and fine detailing all at once. Let the player customise proportions and placement without repeatedly paying for experimentation.

**Implementation:** add a central `BuildCostCalculator` over logical dimensions and material definitions. Compute costs from net surface/volume or standardised build units, with explicit rounding. A long wall should cost consistently whether drawn in one piece or several. Recolours need not cost materials; changing the underlying material may cost only the positive difference.

Wrap validation, debit and logical placement in one command. Store paid cost provenance. Undo, demolition, cascading foundation deletion, multiplayer ownership and Mini Build edits all need economic rules; see the transaction section below. Do not make each tool invent its own inventory changes.

**Completion:** the player can fund a home improvement through the music loop; cancellation and invalid geometry consume nothing; split/merge, undo and refunds cannot create materials. Existing creative worlds remain unrestricted.

### 11. Add a useful home, storage and a guided first-session journey

**Depends on:** 2–10.

**Build:** a storage chest, nursery position, listening seat, home marker and lightweight journal goals. Furnishings should have at least a few understandable functions: storing seeds, sheltering a plant, making a listening space or displaying a discovery.

Guide through actions in the world: inspect a sound-bearing plant, collect, grow, alter a phrase, welcome a listener, use its gift and name the new home. Allow prompts to be dismissed and replayed. Track completed actions rather than forcing a rigid quest order; experienced players can do things ahead.

**Implementation:** use existing furniture/Mini Build placement where appropriate, adding interaction components keyed to logical instances. Starter blueprint requirements should inspect recognised structure/function tags rather than require exact furniture coordinates or an architectural style score.

Restore goals from actual state after imports and migrations. Provide a renewable recovery package or equivalent seed source if the player spends their last starter item unhelpfully. Add a visible route home early, even before an advanced map exists.

**Completion:** a new player completes the loop without developer controls. Their home has a practical use and a personal name. They can identify another goal without being forced into an endless tutorial.

### 12. Give exploration purposeful landmarks and a field journal

**Depends on:** 3–5, 11.

**Build:** a small vocabulary of destinations: a reed pool, shaded grove, sunlit meadow, resonant stone clearing and old garden remains. Each offers a different sound, useful material, visitor clue or blueprint fragment.

Give landmarks recognisable silhouettes and environmental sound cues. The journal records observed species, preview sounds, habitat clues, known material sources and rough directions. It should help answer “where could I find a softer sound?” rather than just show completion percentages.

**Implementation:** generate landmarks deterministically with spacing, slope, water and access constraints. Store discovery deltas only. Keep a stable content identity and generator version so changes don't move a claimed landmark underneath a house. Where a world lacks an essential habitat nearby, provide a fallback discovery route.

Limit the initial journal to curated gameplay families while letting procedural specimens retain cosmetic identity. A finite useful collection is easier to understand than an unfinishable list of generated flowers.

**Completion:** an expedition yields something that changes music, building or understanding. Landmarks remain recognisable across loads, and journal hints lead to reachable sources without external research.

### 13. Build persistent creature friendships

**Depends on:** 7–9, 12.

**Build:** returning visitors with recognisable identity, a name, learned preferences and relationship milestones. Friendship can unlock a planting tip, blueprint, seed or modest gathering assistance. Show specific memories: “heard your reed song” is more meaningful than an unexplained experience bar.

Avoid friendship decay for missed real-world days. A creature can prefer another environment without becoming permanently unavailable. Let affection coexist with free movement and departures.

**Implementation:** persist compact relationship/visit records. Promote selected ambient individuals into persistent visitors when meaningful interaction occurs; do not save every ambient animal. Keep species identity, individual identity and visitor identity separate enough to survive streaming and generator changes.

Add a bounded return scheduler that respects habitat and available listening space. Ensure named visitors can arrive at a reachable point, and provide a journal note if a garden no longer suits them.

**Completion:** the player recognises a returning individual across sessions; friendship unlocks a real option; no essential material requires maintaining an attendance streak. Existing ambient behaviour and performance budgets remain intact.

### 14. Expand plant collection with meaningful musical differences

**Depends on:** 5–6, 12–13.

**Build:** grow beyond the initial families with distinct roles: short chimes, low pulses, soft pads, breathy reeds, percussion pods and unusual sustained tones. Let a new region introduce one new musical possibility alongside a small number of visual variants.

Create bounded traits such as brightness, attack or supported range. Provide a clear preview of the difference. Do not make a rare plant simply sound louder or universally improve rewards.

**Implementation:** separate curated gameplay family definitions from generated specimen appearance. Species recipes select compatible family/trait tags; instrument definitions remain stable and validated. Preserve the association for collected specimens rather than rerolling it after an update.

If hybridisation is added, begin with understandable pairings that produce predictable role variations and retain parent seeds. Keep full genetics out until collecting the base families remains interesting after repeated play.

**Completion:** players can describe why they want a new family. An attractive rare specimen is useful without being required for beginner progression. Colour variants don't overwhelm inventory or fragment every trade into incompatible stacks.

### 15. Add creature requests and communal forest projects

**Depends on:** 10–14.

**Build:** optional requests that combine systems: plant a shaded nook, arrange a quiet reed phrase, build a small crossing or prepare a gathering place. Larger projects restore a grove, reveal an old musical site or establish a woodland venue.

Requests should invite a choice. A calm visitor might accept any composition with a soft sustained role; a shelter request should accept several roof styles. Use specific named inhabitants when emotional context helps.

**Implementation:** represent requirements as bounded predicates over logical state and journal knowledge. Credit contributions once. Freeze project requirements for an accepted instance so a content update doesn't invalidate deposited materials. Support partial contributions and clear cancellation/refund behaviour.

Rewards should include new possibilities, not only larger item piles. A restored grove might introduce a sound family or create a reliable visitor route. Ordinary home progression must remain available without completing every project.

**Completion:** players understand the purpose of a project, see their contribution in the world and receive credit reliably. There is no requirement to copy one exact song or one exact house shape.

### 16. Make weather and habitat affect play gently

**Depends on:** 4, 7, 12–15 and existing weather.

**Build:** rain helps moisture-loving plants, shade benefits a small set of species, certain listeners prefer sheltered venues, and changing weather reveals optional sights or sounds. Use existing environmental systems to enrich choices.

Avoid losing plants, houses or essential progression to weather in the default mode. A player who likes a particular garden should have ways to maintain it. Weather-dependent discoveries need repeatable opportunities, clear clues and an alternate route for essential unlocks.

**Implementation:** evaluate conditions from logical weather/habitat state, independent of precipitation particles, shadow quality and audio volume. Add a small cached exposure query for gameplay rather than sampling expensive rendering data repeatedly. Record growth integrals so time skipping and chunk unloading behave consistently.

Online owner changes must not accelerate personal claims or bypass reward rules. Decide explicitly whether visual weather overrides affect simulation; the default recommendation is that debug/visual overrides do not generate economic progress.

**Completion:** a weather change gives the player a useful choice they can explain. Low graphics settings preserve identical gameplay. No essential task requires waiting through an unpredictable sequence of real-world days.

### 17. Add specialist creature barter and a clear role for gems

**Depends on:** 9–10, 13–16.

**Build:** a few trusted specialist creatures exchange known resources for particular materials, seeds or designs. Common stone remains ordinary building stock. Gems are uncommon specialisation items for glass-like decoration, instrument variants, lighting or distinctive blueprints.

Use your gem idea here: an established listener might introduce a stoneworker who accepts a certain gem for a specialist material bundle. This adds a reason to explore and befriend creatures without putting a conversion chain between every song and every plank.

**Implementation:** define explicit input/output recipes, unlock conditions and quantity bounds. Preview exact results; validate stock and exchange atomically. Check exchange graphs for profitable cycles, especially when crafted items can be dismantled.

Start with a small number of recipes and no fluctuating global prices. Do not add coins, reputation tokens and concert tickets merely to mediate between resources that can already be traded directly.

**Completion:** the player knows why a gem matters and can choose between at least two attractive uses. Basic housing remains possible without gems. Barter plus construction refunds cannot produce unbounded material gains.

### 18. Extend multiplayer authority to gameplay resources

**Depends on:** stable offline loop, 2–11; must precede online earning and trading.

**Build:** shared gathering, garden growth, rewarded visits and inventory changes with a clear server authority. Preserve existing invited building while adding progression rooms as an explicit mode.

Decide resource ownership before implementation: support shared material stockpiles for fully cooperative progression worlds. For village worlds, use personal household inventories and separately permissioned village stockpiles/treasuries, as detailed in section 17; village residents need ownership of goods they sell. Keep discovery records personal where appropriate. A visitor role must not gain spending or trading rights through an unrelated interaction.

**Implementation:** use the existing Cloudflare room/protocol foundation. The room validates commands, owns logical time and commits inventory, resource deltas and reward claims atomically. Reward-bearing visitor sessions need common identities and state; local ambient animals can remain cosmetic.

Do not run an entire rendered ecology on the server. Validate a bounded logical visit simulation and let clients animate it. Introduce reconciliation for disputed movement or eligibility. During disconnection, allow harmless exploration/previews but do not grant spendable online resources speculatively.

**Completion:** concurrent harvests, reconnects, room restart and duplicate commands produce one consistent result. New gameplay records are included in durable snapshots and restores. Existing shared-world permissions still work.

### 19. Add synchronised garden performances and cooperative music

**Depends on:** 8, 18.

**Build:** players hear a shared performance at a common musical position, see common logical listeners and can contribute layers with permission. Provide a countdown, who-is-performing indication, listening reactions and an immediate local mute.

**Implementation:** publish a performance transport record with tree ID, composition revision, room start time, tempo/timeline and state. Map room time to the local audio clock; schedule ahead, join at an appropriate musical boundary and correct drift gently. Existing `ClockSync.ts` is a useful integration point, not a substitute for audio scheduling.

Never send every note over the network as a real-time packet. Send validated composition changes and transport state. Define edit ownership, layer locks or a similarly understandable conflict rule so two players don't continuously overwrite each other.

Audio muting, browser suspension and late join do not create new reward claims. Every eligible participant's reward policy must be explicit; do not multiply total shared materials simply by opening extra clients.

**Completion:** ordinary network delay does not make a duet unusable. A late joiner hears the correct position, and reconnecting neither restarts the performance for everyone nor reissues gifts.

### 20. Establish compact multiplayer villages around a central well

**Depends on:** 18 for shared ownership and persistence. Layout prototyping can proceed earlier in a creative test world. Synchronised music is complementary, not a prerequisite for claiming a home.

**Build:** a founding well and protected public square, a connected street network, affordable residential plots with road frontage, newcomer joining beside friends, and shared construction projects. Reserve space for a market and communal musical garden. Personal plots, public land and shared stockpiles have distinct permissions.

The first village in a new world receives a bootstrap well and starter plots. New players normally join an existing village; they do not pay the cost of founding one. If a village fills, extend its streets and neighbourhoods before encouraging everyone to establish a distant settlement. Keep temporary expedition camps possible without granting them all village services.

Make proximity useful through public workshops, nearby shops, projects and sociable spaces. Preserve personal building styles, private storage and optional participation. A continuous road alone does not make a remote plot eligible: require a bounded route to the well and expand serviced neighbourhoods deliberately.

**Implementation:** add server-owned village, road-graph, plot, membership and public-project records. Validate claims and all object footprints against permissions; current world-wide builder roles are insufficient. Add identity recovery before durable property ownership. Require explicit approval for street removal affecting access, and keep residents' property intact when membership changes.

Later founding requires substantial materials, a coin-funded charter and demonstrated settlement experience, with transparent requirements and a safe site preview. Rank 21 adds local buying/selling and money; a global market is unnecessary. Section 17 specifies the detailed design and its own priority order.

**Completion:** friends can join, claim neighbouring plots, build independently and improve a shared street. A newcomer finds a viable plot without rare resources or founder availability. Road edits, disconnections and leadership changes cannot silently erase ownership or access.

### 21. Add safe direct player trading

**Depends on:** 17–20 and durable participant identity rules.

**Build:** a two-party offer screen for seeds, gems, materials and eligible crafted objects, then village stalls using one world-scoped coin balance. Support both barter and priced sales; money is optional in the core solo loop. Show exact names, quantities and specimen traits. Both parties confirm the final offer; any edit clears confirmations.

Start inside the same world. This can use room-scoped identity and storage while portable cross-world ownership remains out of scope. Trade personal surplus only; a shared stockpile cannot be spent without the appropriate cooperative permission.

**Implementation:** reserve offered stock in an escrow state; commit both debits and both credits as one durable transaction. Use unique trade IDs, state revisions and idempotent retries. Handle cancellation, disconnect, full storage and room restart without item loss or duplication. Keep a bounded receipt log visible to the participants.

Do not allow local exported creative worlds to introduce supposedly scarce stock into progression rooms. Cross-world markets require a separate provenance, identity, backup and restore design. Building blueprints can be copied as knowledge; their construction materials should not materialise for free.

**Completion:** changed offers cannot be accepted accidentally; a disconnected participant cannot lose items; duplicate messages cannot duplicate stock. All essential solo progression remains available without trade.

### 22. Improve navigation and create reasons to travel farther

**Depends on:** 12 and enough region-specific content.

**Build:** player markers, journal directions, local maps, paths, bridges and eventually limited travel between established places. Reward remembering the landscape while keeping home easy to find.

Give distant trips a purpose: a new sound family, an unusual listener habitat, a specialist material or a shared restoration site. Avoid increasing travel distance just to stretch collection effort.

**Implementation:** store discovered map cells and named markers compactly. Use the existing terrain/hydrology samplers for route and bridge placement. Test interactions with foundation exclusion, water and creature traversal. A later fast-travel network should connect discovered, established sites rather than replace all exploration at the start.

Accessibility needs include readable directions, text alternatives to sound cues and recovery from being stranded. A return-home action can have clear constraints without destroying carried discoveries.

**Completion:** players can plan an expedition, find its target and return without external maps. New traversal options shorten repeated errands while preserving the pleasure of first discovery.

### 23. Add expressive venues, festivals and shared projects

**Depends on:** 15, 19–22.

**Build:** player-hosted garden gatherings, themed performances, collaborative venue construction and optional forest celebrations. Support listening, planting, furnishing and performing as valid contributions.

Keep events player-triggered or reliably repeatable initially. Avoid a live-service calendar that makes players feel they missed the only chance at essential content. A small gathering with a few friends and recognisable creature visitors can be more meaningful than a huge crowd.

**Implementation:** reuse performance, request, permission and contribution systems. Add bounded event state, admission rules, start/stop controls and recovery after room restart. Event rewards favour keepsakes and cosmetic variety; ordinary materials should still come from ordinary play.

Players need a way to stop disruptive edits or unwanted sounds at their venue. Respect existing room capacities and measured budgets. Do not introduce large crowds as an untested extension of the avatar implementation.

**Completion:** an event feels social even for non-musicians; contributions receive reliable credit; the host can end it cleanly. Participating once is enjoyable without beginning a mandatory recurring obligation.

### 24. Add useful composition and building sharing

**Depends on:** 6, 10, 18–21.

**Build:** named song arrangements, garden layouts, house blueprints, preview images and creator attribution. Let players preserve a design without requiring them to duplicate a full world.

Start with local saves and explicit file exchange. Then consider sharing inside trusted rooms. Public discovery galleries can follow only when there is a clear audience and a moderation/storage plan.

**Implementation:** make portable content packages separate from economic state. Validate size, note count, nesting, referenced instruments and geometry budgets. Import a blueprint as a plan with a material quote; import a progression composition using allowed voices or show its requirements. Keep creative import unrestricted within normal technical limits.

For audio export, use the symbolic timeline and existing instruments to render a bounded result. Test long sustain, tempo changes and browser resource limits. Do not make external audio hosting a prerequisite for composing or saving.

**Completion:** a shared design can be previewed and reproduced accurately; imports cannot mint progression materials or overwrite unrelated content. Attribution survives round trips, and failures leave the old world intact.

### 25. Add musical mechanisms and light automation

**Depends on:** stable creative/economic loop and 24.

**Build:** musical lights, fountains, moving ornaments, timed gates and a small number of helpful garden devices. Let a repeated phrase visibly animate a place. Later, a trusted creature helper might tend a bounded patch.

Begin with aesthetic or organisational effects. Automation should reduce repeated chores and create expressive possibilities, not generate unlimited gifts from unattended performances.

**Implementation:** expose a small event interface from the sequencer and a bounded mechanism graph. Schedule logical triggers from musical time rather than frame count. Define trigger limits, maximum chain depth and lifecycle cleanup. Online mechanisms use the shared transport.

Keep economic automation separate from visual mechanisms. A flashing lantern can run freely; producing seeds or materials requires validated costs and production limits. Avoid general scripting until the simple mechanisms prove useful.

**Completion:** players create at least several different effects from a small vocabulary. Devices remain synchronised after save/reload and don't create audio, rendering or network spikes at a dense musical boundary.

### 26. Expand biomes, mysteries and long-term expression

**Depends on:** 12–25, especially evidence that the existing loop remains enjoyable.

**Build:** additional regions with distinctive plant roles, creature cultures, local materials, garden remains and optional mysteries. A misty wetland might emphasise breathy sustained sounds; a dry stone grove might introduce short resonant percussion. These are proposed themes, not fixed lore.

Offer several long-term aspirations: collect a curated set of sound families, befriend a set of visitors, restore a woodland network, complete a personal concert garden or build a settlement with friends.

**Implementation:** use content definitions and existing procedural systems rather than bespoke engine features for each region. Protect generated identity with versions and preserve collected recipes. Add a new biome only if it changes at least one decision in exploration, gardening, music or building.

Avoid an arbitrary “infinite level” treadmill. A rare sound, memorable place or personal project can be a better goal than a larger damage-style statistic.

**Completion:** new regions offer qualitatively different options and fit the existing resource and performance budgets. The player can remain happy in a favourite garden without needing every expansion's newest item.

### 27. Broaden optional modes and advanced creation tools

**Depends on:** evidence from the established game.

**Build:** additional world options for abundant resources, more demanding gardening, advanced musical control, aesthetic exploration and specialist collaborative creation. Preserve the existing creative experience from the first progression release; this rank refers to further mode expansion.

A more demanding mode might increase planning needs, but combat, hunger, raids and destructive weather require their own design justification. They are not automatic next steps.

**Implementation:** use capability flags and policy objects rather than scattered mode conditionals. Economy, growth, reward and import policies should be explicit and serialised. Mode changes must explain their effect on trading eligibility and shared-world ownership.

Consider advanced MIDI workflows, larger arrangements or deeper botanical breeding only where players demonstrate demand. These should extend the approachable core rather than obscure it.

**Completion:** each added mode serves an identifiable player preference; the default experience stays coherent; content and saved worlds remain compatible through documented migrations.

## 8. Recommended first playable content

This is a proposed testable content set, not a production-sized catalogue.

| Working plant | Where found                                       | Musical role                | Growing rule                               | First useful connection                                        |
| ------------- | ------------------------------------------------- | --------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Bellbloom     | Open meadow colony                                | Clear short melody/chime    | Comfortable in ordinary light and moisture | Attracts the friendly starter listener.                        |
| Hollowcap     | Shaded grove                                      | Low pulse / rounded bass    | Likes shade; slower in exposed ground      | Gives a second musical role and a clue toward a grove visitor. |
| Whisperreed   | Pond margin or a guaranteed nearby fallback patch | Breath-like sustained voice | Likes moist ground                         | Supports calmer arrangements and waterside listeners.          |

These are gameplay families. Procedural specimens can vary in shape and colour while retaining the same recognisable role. The mushroom-to-instrument mapping in the present catalogue has a Marimba display name and a `bass` instrument ID; audit labels and actual preview sounds before finalising the family names.

| Working listener     | First readable preference                               | Behavioural identity                    | Ordinary gift                   | Friendship possibility                                  |
| -------------------- | ------------------------------------------------------- | --------------------------------------- | ------------------------------- | ------------------------------------------------------- |
| Curious forager      | Any completed starter phrase                            | Approaches readily; looks at new sounds | Timber or fibre                 | A reliable starter-seed source or planting hint.        |
| Gentle grove dweller | Sparse sustained sounds and comfortable listening space | Cautious approach; settles quietly      | Clay or stone                   | A sheltered nursery or garden blueprint.                |
| Energetic collector  | A clear repeating pulse                                 | Bobs, steps or gestures in time         | Timber or a mixed common bundle | A clue to a resonant clearing; specialist barter later. |

Use existing creature body plans and deterministic identities. The three roles do not require three new rendering engines or a full population rewrite.

### Example opening journey

1. The player enters a clearing, sees a Music Tree and hears a short starter phrase after enabling audio.
2. A nearby Bellbloom prompts inspection, a sound preview and seed collection.
3. The player plants a seed in the starter bed and learns what a ready plant provides.
4. A supplied ready voice lets them edit immediately while that plant grows.
5. They move a note, hear the difference and start a performance.
6. A curious visitor approaches a reachable spot and reacts.
7. The visitor leaves a named gift. The UI shows that it can fund the first home improvement.
8. The player places a small shelter segment or storage object with that material.
9. The new home receives a name and marker. The journal records the encounter and hints at a shaded sound nearby.
10. On reopening the world, the garden, stock, visitor memory and home are intact.

The opening should teach the loop through results. It must not require completing all tutorial text, finding a rare gem, waiting for a particular day or importing a song.

## 9. Economy and progression rules

### Start with a compact resource vocabulary

| Resource       | Primary source                          | Additional source              | Useful sinks                                | Availability rule                                      |
| -------------- | --------------------------------------- | ------------------------------ | ------------------------------------------- | ------------------------------------------------------ |
| Timber         | Fallen wood / simple gathering          | Forager gifts                  | Frames, walls, storage, seating             | Renewable and available near the start.                |
| Fibre          | Common plants or seed-related gathering | Listener gifts                 | Beds, nursery items, furnishings            | Common; never the sole gate on the first performance.  |
| Stone          | Small outcrops / loose stones           | Collector gifts                | Foundations, paths, stone finishes          | Common; clearly distinct from specialist gems.         |
| Clay           | Suitable ground near accessible water   | Grove-listener gifts           | Pots, planters, selected finishes           | Reliable fallback if water generation is inconvenient. |
| Seeds          | Wild colonies                           | Mature cultivation, friendship | Additional plants and new voices            | The last essential family cannot be permanently lost.  |
| Specialist gem | Optional discovery / milestone          | Later specialist exchange      | Unusual instruments, glass, lights, designs | Optional for basic housing and music.                  |

Keep the solo plant/music/creature loop free of mandatory money. The multiplayer village proposal in section 17 supplies a concrete reason for one world-scoped currency: residents can price different goods and services without arranging a matching barter each time. Introduce that currency with safe trading and market records, after the village layout and ordinary resource economy work. Do not add a separate currency for every village.

### Relationships should unlock breadth

Prefer “this friend introduces a new sound or design” to “this friend multiplies every reward by ten”. The former encourages exploration and identity; the latter risks making all previous options obsolete.

Recipes, discoveries and friendship memories are knowledge. Consumable stock is inventory. A known blueprint should not disappear when its physical preview is deleted.

### Example balancing model

Use a simple model before tuning quantities:

```text
gift = common_bundle(visitor_role)
     + one_time_discovery_bonus(if unclaimed)
     + preference_bonus(if that visit's condition is met)

eligible = completed_performance
        && valid_visit_opportunity
        && !already_claimed(visit_id, beneficiary)
```

The preference bonus should improve the outcome modestly, not make the base gift worthless. More plants, faster tempo, more clients or louder output must not multiply rewards without bound.

Prototype a material budget around visible projects. For example, set a basic wall segment to 2 timber, a bench to 4 timber and 1 fibre, and a starter storage object to 4 timber and 2 fibre. Then choose starter supplies and the first gift so a player can complete one of those meaningful objects. These are illustrative ratios, not final prices or a specification for existing geometry dimensions.

Before expanding the catalogue, simulate several loops and ask:

- Can a beginner finish something useful without grinding the same performance?
- Is gathering competitive enough to remain a valid choice?
- Can a player who prefers building earn materials without mastering complex music?
- Does exploration unlock options instead of merely raising output?
- Are there worthwhile sinks for common materials after the first shelter?
- Does a player still want to play when no reward is pending?

### Avoid unattended concert farming without making music a chore

Free ambient playback is always allowed. Material grants come from bounded logical visits, requests and completed performance opportunities. Do not grant per loop, per note or per rendered listener.

After a visit has paid out, the creature can stay and enjoy the music without paying again. Later opportunities can arise through exploration, a new request, changed habitat or active world progression. Avoid demanding arbitrary edits to every song just to prove activity; that would punish a player for liking their composition.

Exact visit cadence is a balancing question. The first release needs a transparent, renewable rule, not hidden anti-player timers or daily streaks.

## 10. Technical implementation shape

### Extend the existing architecture

The current stack is Svelte, TypeScript, Three.js, browser audio, IndexedDB and a Cloudflare multiplayer server. There is no demonstrated need for an engine rewrite to deliver this plan.

Keep orchestration thin. `ThreeScene.ts` already connects many systems; new economic logic should live in testable modules rather than adding another large block of rules directly to the scene or Svelte page.

Suggested new responsibilities, with names to adapt to local conventions:

```text
src/lib/game/gameplay/
  GameplayTypes.ts           persisted state and command/result contracts
  GameplayCommands.ts        validation and atomic state transitions
  GameplayClock.ts           simulation-time policy
  GameplayEvents.ts          small, typed integration events
  content/                   items, plant families, visitors, recipes, goals

src/lib/game/gardening/
  CultivationSystem.ts       authored plants and logical growth
  HarvestSystem.ts           stable resource identities and harvest deltas
  GardenHabitat.ts           bounded environmental queries

src/lib/game/audience/
  AudienceSystem.ts          visit eligibility and listener intents
  PerformanceSystem.ts       snapshot, transport state and completion
  RewardLedger.ts            idempotent grants and pending gifts

src/lib/game/progression/
  DiscoveryJournal.ts
  FriendshipSystem.ts
  RequestSystem.ts

src/lib/game/building/
  BuildCostCalculator.ts     costs over existing logical definitions
```

These are proposed seams, not a requirement to create every file before implementing one feature. Prefer fewer modules with clear responsibilities over a speculative general-purpose framework.

### Logical state sketch

```ts
// Illustrative contracts; adapt to actual repository types.
interface GameplayState {
	version: number;
	mode: 'creative' | 'progression';
	simulationTime: number;
	inventories: Record<string, InventoryState>;
	cultivatedPlants: CultivatedPlantState[];
	harvestOverrides: HarvestOverride[];
	discoveries: DiscoveryState;
	relationships: VisitorRelationship[];
	pendingGifts: PendingGift[];
	rewardClaims: RewardClaimState;
	projects: ProjectState[];
}

interface CultivatedPlantState {
	id: string;
	plantFamilyId: string;
	specimenRecipeId?: string;
	position: { x: number; y: number; z: number };
	growthUnits: number;
	lastSimulatedAt: number;
	stage: 'seed' | 'sprout' | 'ready';
	voiceEntitlementId?: string;
}

interface PerformanceState {
	id: string;
	treeId: string;
	compositionRevision: number;
	startedAtSimulationTime: number;
	status: 'preparing' | 'playing' | 'completed' | 'cancelled';
	visitorIds: string[];
}
```

The final schema must define collection limits, numeric bounds, ownership keys and validation. In particular, do not implement `rewardClaims` as an infinitely growing array of every note or historical frame. Use bounded per-visitor opportunity counters, compact summaries and retention rules that cannot reopen old claims.

### Central command boundaries

| Command      | Validate                                           | Commit together                                      | Typical failure response                         |
| ------------ | -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Collect seed | Resource identity, readiness, range, permission    | Inventory increase + harvest override                | Explain depleted resource or invalid target.     |
| Plant seed   | Stock, placement, permission, world mode           | Seed decrease + cultivated record                    | Keep seed and preview; show placement issue.     |
| Claim gift   | Valid visit, completion, beneficiary, unclaimed ID | Material increase/pending gift + claim record        | Show already claimed or pending completion.      |
| Construct    | Geometry, costs, ownership, permissions            | Material decrease + logical object + paid provenance | Keep preview; show missing material or conflict. |
| Demolish     | Ownership, dependencies, refund provenance         | Logical removal + exact refund allocation            | Explain permission or attached-work restriction. |
| Barter       | Unlocked recipe, stock, quantities                 | Inputs decrease + outputs increase                   | Keep offer unchanged and explain missing input.  |
| Trade        | Offer revision, reservations, consent, identity    | Both sides' inventory changes + receipt              | Cancel/recover escrow without partial transfer.  |

Rendering, particles, creature gestures and notifications follow committed results. They cannot be the source of inventory truth.

### Construction costs, undo and refund policy

Recommended default policy for progression:

1. Placement previews and blueprint planning are free.
2. A confirmed valid build pays once.
3. Geometry edits calculate a cost delta: charge increases and refund eligible decreases according to stored provenance.
4. A shape split or merge preserves total paid stock. Rounding cannot create a discount by fragmentation.
5. Demolition returns a clearly stated amount of the actual paid stock. Start with full refunds for ordinary solo construction so experimentation stays inviting.
6. Refunds return to the original stock owner or shared stockpile, not whoever happens to press delete.
7. Undo is an inverse transaction against the current revision. Reject or reconcile stale undo after shared edits; never simply credit the original cost again.
8. Foundation deletion aggregates its dependent paid records once. Attached objects are not refunded both individually and through the parent.
9. Mini Build material cost is computed from a bounded logical design metric. Editing a shared design cannot cheaply upgrade all paid instances without validating their cost deltas.
10. Creative objects and imported blueprint previews have no refundable progression material value.

This work is necessary because Forest Drift already has rich construction. Pricing only the foundation tool would leave most of the economy bypassable.

### Time policy

Use separate concepts for musical time and progression time:

- The local audio clock schedules notes precisely.
- World simulation time drives cultivation and logical visits.
- The room clock coordinates online performance transport.
- Wall-clock timestamps record provenance and save metadata.

Offline progression pauses when the world is paused, hidden or closed under the initial policy. Online progression advances under the room's active-world rules, with empty-room pause preserved. Browser audio suspension must never rewind growth or create another completed performance.

Later offline growth can be considered as an explicit feature with a bounded catch-up policy. It should not be introduced accidentally by subtracting arbitrary wall-clock timestamps.

### Determinism and save migration

Preserve the existing distinction between generated world and authored changes. Store collected specimens, harvest exceptions, cultivated plants and named visitor relationships. Regenerate untouched scenery.

For each schema change:

1. Add explicit types and validation.
2. Increment the current schema version as required by the existing migration contract.
3. Supply a deterministic migration and old-world fixture.
4. Default existing worlds to creative behaviour.
5. Verify music pitch/timeline and building recipes remain unchanged.
6. Include the new state in local saves, packages, shared-room persistence and backup/restore as applicable.

Never silently reassign a collected specimen to a new sound after a procedural generator update. Pin its gameplay definition or preserve a compatible recipe.

### Multiplayer constraints

The local guide describes a 20-player room cap, browser-local identities, locally simulated ambient creatures and outstanding longer-duration/touch validation. Treat these as present project constraints, not evidence that the new economy or synchronised music is already production-ready.

Use a compact authoritative visit model rather than server-side Three.js or per-frame skeletal updates. Replicate outcomes and necessary state transitions. Keep cosmetic creatures separate from rewarded listeners.

Portable inventory and cross-world trading must account for local save exports, restored backups, cloned worlds and creative imports. Until provenance and ownership are designed, keep economic state within a world. A restored online backup needs an explicit economy epoch or equivalent invalidation/reconciliation mechanism so old exported receipts cannot be replayed into it.

## 11. Quality requirements for every feature

### Accessibility and readability

- Full music participation with visual timing and text preference cues.
- Independent audio controls and immediate mute without a progression penalty.
- Reduced motion/flashing options for the music wave, weather and crowd reactions.
- Colour-independent plant readiness, resource and relationship indicators.
- Readable interaction text, remappable actions where supported and touch equivalents.
- No mandatory precision rhythm input, rapid clicking or perfect hearing for the main loop.
- Pause and clear feedback when opening a demanding editing interface in solo play.

### Performance

Maintain a cost model as systems grow:

- Cultivation and preference decisions run at coarse rates or after meaningful changes.
- Gameplay plant targeting uses spatial candidates; ambient vegetation keeps its batching.
- Logical listener counts are bounded independently of rendered detail.
- Composition attributes are cached per revision rather than recalculated for every creature every frame.
- Audio scheduling remains independent of render stalls.
- Network messages carry commands, revisions and transport state, not continuous per-note traffic.
- Save size grows with meaningful authored changes; distant terrain remains generated.

Capture comparable baseline and changed measurements on representative desktop and touch hardware. Existing performance JSON files help define scenarios, but are not a substitute for new measurements after integrating gameplay. A smaller audience that behaves convincingly is preferable to many visitors that stall the browser.

### Test the rules that can lose or duplicate effort

Meaningful automated coverage should include:

1. Seed collection and cultivation across reload and chunk unload.
2. New state through migration, validation, export/import and restore.
3. Fixed musical pitch and timing through cultivation changes.
4. One reward per qualifying logical visit despite retries and reconnects.
5. Failed construction leaving both stock and world unchanged.
6. Cost consistency for equivalent wall/roof shapes and split/merge operations.
7. Undo, demolition and dependent deletion without duplicated refunds.
8. Simultaneous harvest/spend conflicts resolved authoritatively online.
9. Trade edits clearing confirmations; crash/disconnect recovering escrow.
10. Old creative worlds retaining content and behaviour.

Browser-level scenarios should exercise the complete beginner loop with ordinary UI and a small set of representative seeds. Continue using focused existing building, music, creature and multiplayer checks where changes touch them. Avoid creating tests that merely duplicate implementation formulas without checking an observable rule.

Human playtests must answer questions automation cannot: whether the first phrase feels inviting, whether creature reactions are legible, whether rewards feel useful and whether the player voluntarily starts another expedition.

## 12. Delivery gates, in dependency order

These gates are completion conditions, not a schedule.

### Gate A: connected solo loop

Deliver the minimum parts of ranks 2–11 and complete rank 1's end-to-end acceptance. The player finds a plant, gains a musical option, attracts a visitor, receives a gift and changes their home. Save and recovery work throughout.

Stop expanding content if this requires developer explanations, repetitive waiting or a large material grind. Adjust the loop before adding more species.

### Gate B: a reason to repeat it

Add purposeful discovery, returning friendships and a few distinct sound roles from ranks 12–14. Demonstrate several different garden goals and useful expeditions. The second and third cycles should reveal choices rather than repeat the tutorial with larger quantities.

### Gate C: meaningful depth

Add requests, habitat interactions and specialist barter from ranks 15–17. Confirm the economy remains understandable and old activities still matter. The player's preferred style should remain viable.

### Gate D: trustworthy shared progression

Complete rank 18's authority and persistence changes before enabling online material earning. Then add rank 19's synchronised performances. Existing creative multiplayer can continue while this work is isolated behind an explicit progression-world capability.

### Gate E: exchange and community

Deliver rank 20's village well, connected roads, protected plots and newcomer joining before expanding social features. This can proceed alongside rank 19 once rank 18 provides the required authority. Enable rank 21's same-world trades and village money only after identity, ownership, receipts and recovery are sound. Follow with richer travel, events and sharing. Cross-world markets require a separate later approval of their design and operating scope, not merely a new trade button.

### Gate F: expression at larger scope

Add mechanisms, new regions and optional advanced modes from ranks 25–27 when the established loops justify them. Reuse the vocabulary players already understand.

## 13. What to postpone

| Candidate                                   | Why it is lower value now                                                                          | Evidence that would justify revisiting it                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Combat and weapon tiers                     | Requires new animation, balance and consequences while weakening focus on music and relationships. | A clear player need for optional adventure that the existing systems cannot satisfy. |
| Hunger and tool durability                  | Adds maintenance before the existing actions have progression purpose.                             | Playtests show planning needs meaningful stakes, and gentler approaches fail.        |
| Deep plant genetics                         | Risks inventory complexity and an opaque optimisation task.                                        | Base families remain engaging and players actively seek breeding depth.              |
| Fully simulated ecology                     | Expensive and difficult to explain; rewarded visitors only need bounded logical behaviour.         | Concrete gameplay depends on interactions a simpler model cannot express.            |
| Massive crowds                              | Current online limits and browser budgets favour small gatherings.                                 | Reliable performance and a product need for larger events.                           |
| Global auction house                        | Requires durable accounts, provenance, abuse handling and economic operations.                     | Same-world direct trade is popular and cross-world exchange has a clear purpose.     |
| Public user-content marketplace             | Adds discovery, hosting, moderation and ownership work.                                            | Trusted sharing is useful enough to justify a public service.                        |
| Large new furniture catalogue               | Existing construction already has substantial expressive range.                                    | Players have meaningful projects but lack specific needed pieces.                    |
| More visual polish without new interactions | The game already has extensive scenery and rendering work.                                         | A measured readability or performance problem blocks the loop.                       |

## 14. Design risks and concrete responses

| Risk                                          | What it would look like                                                  | Response                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Music becomes an income chore                 | Players run the easiest phrase only for materials.                       | Keep free creation valuable; reward discoveries/relationships and allow ordinary gathering.       |
| Creativity feels judged                       | One dense song earns everything; unusual songs seem wrong.               | Use local creature preferences and multiple valid styles, never a universal beauty score.         |
| Gardening changes authored music unexpectedly | A plant matures and detunes a saved phrase.                              | Separate biological growth from explicit note pitch and timing.                                   |
| Infinite procedural variety lacks meaning     | Many flowers differ visually but the player cannot tell why any matters. | Curated musical roles with visible traits and bounded specimen variation.                         |
| The first home takes too long                 | Rewards accumulate without visible change.                               | Price starter projects around one useful gift plus starter stock.                                 |
| Returning visitors lose identity              | A befriended creature disappears when its chunk unloads.                 | Persistent visitor promotion, pinned recipes and scheduled logical return opportunities.          |
| Early garden placement prevents visitors      | Water, foundations or steep ground block every approach.                 | Validate the starting venue, provide reachable perimeter positions and readable path feedback.    |
| Online copies disagree about rewards          | Each browser awards its own interpretation of the same animal.           | Server-owned visit and claim state; local ambient movement has no economic authority.             |
| Restore/import creates duplication            | Old snapshots reintroduce spent gems or trade receipts.                  | World-scoped economics, restore epochs and explicit provenance rules before cross-world transfer. |
| Modes break old worlds                        | Existing buildings become unusable or require back-payment.              | Creative migration defaults and explicit opt-in progression worlds.                               |
| Too much scope hides the main question        | New systems grow while the opening still feels directionless.            | Require Gate A before expanding variety.                                                          |

## 15. How to decide whether the plan is working

Observe play with informed consent, using local/debug counters first. An analytics service is not a prerequisite. Track useful milestones and their failure reasons rather than recording every movement.

Useful observations include:

- Whether a new player understands how a wild discovery becomes a musical option.
- Whether they can hear or see how their edit changes the garden.
- Whether the first creature's arrival feels caused by their action.
- Whether they understand the gift and spend it on something they value.
- Whether they recognise their home and visitor after returning.
- Whether they voluntarily try another sound or destination.
- Whether several different musical styles remain rewarding.
- Whether a non-musician can enjoy watching, gardening or building with a friend.
- Whether common sources, costs and next goals are understandable without a wiki.
- Whether saves, refunds and reconnects preserve trust.

Do not optimise for hours spent repeating actions. A player finishing a small garden and feeling pleased with it is a successful outcome. Long-term play should come from new possibilities, relationships and personal projects.

## 16. Final implementation decision

The most valuable next development work is **the connection between the existing music garden, discoverable plants, creature listeners and affordable construction**.

Begin with a small complete solo loop and the state needed to preserve it. Add destinations and friendships once it is enjoyable to repeat. Add specialist gems and barter when ordinary materials already matter. Extend the multiplayer server's authority before enabling shared rewards, synchronised concerts and safe player trade.

For multiplayer, add a settlement layer that makes neighbours useful and living together appealing: a central well, road-connected claims, shared projects and a local market. Keep joining affordable and make founding another village a substantial, later achievement. Section 17 defines this proposal in detail.

This gives Forest Drift a clear promise: **the forest gives you new sounds; the music brings it closer; the relationships help you make a home.**

## 17. Multiplayer village design: neighbours, streets and local life

This section expands the multiplayer direction requested after the original plan. It is a proposed design, not an implemented or externally researched feature. The objective is specific: **friends should naturally build a place together instead of sharing a server while living too far apart to meet.**

### 17.1. A separate settlement loop

The personal loop remains exploration, plants, music, creatures and home improvements. The village layer answers different questions: where do I live, who are my neighbours, what do we build together, and where do we exchange things?

> Join a village → choose a plot near friends → build a home → contribute to streets and shared facilities → buy, sell and help locally → expand the neighbourhood → eventually help found another village.

Players can contribute as gardeners, builders, musicians, explorers, shopkeepers or organisers. A resident does not need to compose songs to deserve a home. The well and street system gives these different activities a common place.

The default social experience should be “my home in our village”. Personal ownership and shared belonging need to coexist. Avoid making every chest communal or requiring a village leader's permission for ordinary house edits.

### 17.2. The central well and square

Each village has one founding well, a name, a public square and a small initial street layout. The well is the recognisable social and administrative centre. It provides a newcomer arrival point, village noticeboard, map, plot directory and access to public projects.

The well can also supply garden water and a shared nursery service. Carrying water repeatedly should not become a tax on music or gardening. Give nearby residents convenience rather than making every home depend on constant well visits.

Reserve public land around it for a market, seating, signs and a communal musical garden. Keep the actual arrival point clear of doors, private plots and construction previews. Protect its essential functions from casual demolition or obstruction.

Let residents customise the well's appearance, square and planting through normal construction. The public area should feel player-built, not become a fixed decorative menu hub. Relocation of the founding well is a special migration of the village boundary and access graph, with a preview and affected-resident checks; picking up the mesh must not move the village instantly.

### 17.3. Starting a server and joining an existing village

**The first village must be possible before anyone is experienced.** On creating a village-mode world, the host chooses a valid site and receives one bootstrap founding package. It creates the initial well, public land and a modest set of available plots. The package is recorded once per world and cannot be reclaimed through rejoining or restoring an item.

A later entrant normally arrives at an existing village. Show villages with available homes or plots, their building permissions and a short description. On a private friends' world, prioritise the inviter's village and neighbouring available plots. This is a directory within an authorised world, not a requirement for a global matchmaking service.

Offer a temporary guest space and a free or nominal-cost first residential claim. Starter supplies should help construct a modest home, with no need to buy land from a wealthy founder first. Avoid handing out large transferable coin gifts to every newly created identity.

Village admission can be open within the invited world or require an invitation. Reserve an automatic newcomer route in starter villages so progress does not depend on the founder being online. If a private village is closed, show an actual alternative, not an empty join screen.

The initial host should not receive permanent power over every resident's belongings merely because they placed the first well. World administration still exists, but village membership and property rules need their own clear contract.

### 17.4. Streets determine expansion

Roads are public infrastructure with logical connectivity. They are more than painted strips on the ground. Store a road graph rooted at the well and derive its walkable corridor, frontage and eligible plot edges.

Begin with streets built outward from the square. A proposed road needs a valid connection, public right of way, usable slope and clearance. A bridge can become a connected road edge only when its route is actually traversable. A decorative line, unfinished blueprint or disconnected path does not service a plot.

Expand street segments as small shared projects with material requirements. Show future road reservations clearly so someone cannot claim the only exit or build a wall across the planned main street. Roads may bend around terrain and use different visual styles; the rules need not force a square grid.

**A road connection alone is insufficient.** Otherwise a player can build a very long road to a remote mansion and recreate the original problem. Claim eligibility should combine:

- A completed connection to the well.
- Direct frontage or access through a designated public lane.
- A bounded route distance to the village centre, calculated along streets rather than through terrain.
- An unlocked neighbourhood envelope with a finite expansion budget.
- Reserved circulation space and an actually usable entrance route.

Start with one compact neighbourhood. Extend it in adjoining sections when current plots are genuinely occupied or the group funds an expansion. Do not award expansion simply because one person placed empty claims around the well.

The initial distance and plot-size values need a layout playtest using the actual movement speed and Music Tree footprint. A starter residential plot might be roughly 12–16 metres wide as an experiment, but it must fit the existing building tools. Large radial music gardens may need dedicated shared plots or larger outer garden allotments rather than squeezing inside every small house plot.

### 17.5. Claims: enough private space without land hoarding

At the first release, make plot boundaries explicit and easy to preview. A plot has an ID, owner/household, village, boundary, street access and permissions. Claiming it is an atomic server action: simultaneous claims have one winner and a clear result for the other player.

Recommend one ordinary home plot per resident identity in a village. Offer adjacent expansion or a garden allotment later. Larger commercial plots and public projects are separate allocations. Count linked accounts or trusted household memberships where possible, but do not assume browser-local identities prevent alternate-identity hoarding.

Owners can grant friends permission to build, decorate, garden or use particular containers. Co-owners and guests have distinct rights. Visitors may walk through designated public areas and use a shop without gaining permission to empty storage or edit the house.

Building validation must include the entire logical footprint and relevant height bounds, not just the foundation's centre. Cover overhanging roofs, upstairs structures, fences, placed furniture, trees and musical gardens. Prevent placement into neighbouring airspace or a public road. Shared walls and agreed overhangs require an explicit shared boundary permission.

Claims protect authored contents and access. They do not grant ownership of every ambient creature that wanders across the plot or exclusive rights to all scenery visible from it. Prevent staking a claim over an essential public resource or a required landmark.

Display boundaries on demand and during placement, with a restrained visual treatment during normal exploration. The village should remain a landscape people inhabit, rather than a permanent grid of bright ownership lines.

### 17.6. Make living close together rewarding

Proximity should increase useful encounters rather than impose a constant penalty on distant exploration.

| Shared place              | Reason to visit                                             | Boundary that protects the personal loop                        |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Well and noticeboard      | Find available plots, neighbours and public projects.       | Ordinary house edits do not require checking in.                |
| Market square             | Buy a needed seed, sell surplus, place a local order.       | Barter and self-sufficient gathering remain possible.           |
| Shared nursery            | Preview unfamiliar plants and contribute seeds.             | Personal gardens remain viable.                                 |
| Workshop                  | Share tools, blueprints and specialist material processing. | Basic construction is available from the start.                 |
| Concert garden            | Host a gathering and attract common logical visitors.       | Personal music gardens keep their value.                        |
| Community storehouse      | Contribute to visible village projects.                     | Private stock is never donated automatically.                   |
| Roads, lights and bridges | Move between homes and open the next neighbourhood.         | Expedition camps and exploring outside the village are allowed. |

Keep the useful everyday places close enough that people see one another on ordinary trips. Put larger gardens and workshops on connected edges rather than moving the whole social centre outward with every upgrade.

Do not use raw online headcount as a reward multiplier. Extra clients standing at the well should not mint more materials or coins. Shared projects should unlock useful facilities and choices rather than unlimited output bonuses.

### 17.7. A village economy with money and items

The user specifically wants buying and selling as well as item exchange. Introduce **one world-scoped coin currency** after the safe trade foundation. All villages in that world use it. The core solo loop continues using ordinary resources and creature gifts.

Support three first-class exchange types:

1. **Barter:** items for items through the direct trade interface.
2. **Priced sales:** items for coins, either face-to-face or at a market stall.
3. **Funded requests:** a buyer deposits coins or materials for a specific deliverable, such as a seed bundle or a contribution to a bridge.

Start service work with objective deliverables that the server can verify. A construction commission can specify an agreed blueprint and material supply. Open-ended promises such as “make my house beautiful” should remain social arrangements until there is a fair completion/dispute mechanism.

Personal coins belong to personal inventories/accounts. A village treasury is a separately permissioned balance. Shared project deposits and shop escrow cannot also be spent from the seller's available balance.

**Coin sources need to be designed, not assumed.** A small system-funded demand budget can pay for bounded village deliveries or forest restoration work. Pay from a pre-funded project pool, with a per-world issuance policy and objective completion records. Player-to-player sales transfer existing coins; they do not create them. Do not offer an unlimited instant NPC buyer for materials that can be generated or refunded cheaply.

Coin sinks can include optional shop improvements, special decoration and a later founding charter. Common housing, the starter plot and seed recovery must remain affordable without waiting for rich players to employ newcomers. Keep essential recurring rent and debt out of the default design.

Use a simple ledger with integer balances and reason codes. Track minted coins, transfers, treasury deposits, refunds and sinks. Tune price examples only after material earnings and construction costs are measured; a nominal “high” founding price means little without a working economy.

### 17.8. Market stalls and local discovery

Provide small physical stalls around the square or on commercial street plots. A stall displays the seller, item, traits, unit price and remaining stock before purchase. A village directory helps people find goods, but purchases initially remain local to that village/world; avoid a universal auction house that removes the reason to visit neighbours.

The seller deposits actual items into escrow. Buyers receive the displayed stock and sellers receive coins in one transaction. Changing a price creates a new listing revision; a buyer never silently accepts a different price. Bound listings per resident and per village so someone cannot cover the square with empty stalls.

Offline selling can run against server-held stock without the owner online. Proceeds remain safely claimable; a room restart must preserve listings and purchases. A village need not simulate while empty to support this: the sale occurs when a buyer is present and submits a command.

Offer order-board listings later: “buying 10 fibre for this deposited payment.” Validate quantities, fill orders once and return unused escrow on cancellation. Market taxes are optional later governance tools, not a requirement for the first market.

### 17.9. Shared growth and fair contributions

Give the village a small set of development projects: a first street, another housing lane, a bridge, shared nursery, market canopy or concert space. Show exact requirements, current deposits and the resulting layout before asking for contributions.

Store contributions once and visibly credit helpful residents without turning the village into a mandatory leaderboard. Money, materials and eligible construction tasks can all contribute. A player should not have to become a shopkeeper to feel useful.

Village progression should measure completed shared facilities, occupied homes and varied meaningful contributions. Avoid simply checking account age, total hours online or the richest person's balance. Core plot access does not depend on winning a contribution competition.

Keep funds for accepted public projects reserved. A founder cannot redirect deposited bridge materials into a private mansion. Cancellation and replacement of a funded project require clear refund rules. Expensive public changes need review by the affected residents or a previously agreed stewardship policy.

### 17.10. Founding another village is a later achievement

Agree with the proposed high barrier, with one adjustment: **make founding depend on capability and a substantial shared project as well as wealth.** Money alone can be hoarded or transferred to a new identity; hours alone reward inactivity.

A prospective founder should have established a home, completed useful settlement contributions and obtained a founding charter. The charter combines a substantial material package with a coin sink once money exists. It grants the right to establish one new well at a valid site, not ownership of nearby players' buildings.

Illustrative founding requirements to tune after the economy works:

- Demonstrated completion of ordinary home and village contribution milestones.
- A large, varied material bundle representing multiple meaningful village projects rather than one repeatable cheap recipe.
- A clearly displayed coin fee for the charter.
- A valid site with room for the square, initial streets, gardens and more than one home.
- A reasonable separation from existing village centres and no overlap with their reserved expansion or protected landmarks.
- For group-focused servers, an optional co-founder commitment; solo long-term founding remains possible under the world's chosen rules.

The founding cost should be high enough that joining and improving an existing place is the natural beginner choice. It must not require a calendar-age account or a permanent grind. Publish exact requirements and progress before the player gathers the package.

Preview the site and starting layout before payment. Validate terrain, access, world limits and ownership, then consume the charter and materials atomically. Invalid placement keeps everything. A co-funded founding project holds contributions in escrow and returns them if cancelled.

Use server-owned charter IDs and receipts so dismantling/replacing the well cannot reproduce the founding package. Do not let a new village reset each resident's starter gifts, first-visit material rewards or economic identity.

New villages are additional settlements in the same world initially. They are not automatically separate hosted rooms or a new global server architecture. Limit their number according to actual world size, room capacity and tested operating costs. A new square in an empty world does not create a useful community by itself.

### 17.11. Full villages, absence and personal freedom

**When a village is full:** show nearby expansion proposals, larger planned neighbourhoods and available plots in other authorised villages. Never let someone accept an invitation, arrive and discover they cannot have a home. Plot count and concurrent player cap are different: a village can have offline residents, so planning cannot assume 20 online slots mean 20 lifetime owners.

**When friends want adjoining plots:** allow short, bounded reservations for named invited friends. Show reservations publicly and release unused ones through a clear policy. Don't allow a founder to reserve the entire centre indefinitely.

**When a founder stops playing:** preserve plot ownership and ordinary services. Give designated stewards limited public-project powers; use an explicit succession rule or world-owner recovery. Membership removal is not confiscation. Removing a troublesome resident can revoke entry/build privileges without automatically transferring their private stock to the leader.

**When a player takes a break:** no surprise demolition, mounting mandatory rent or loss of belongings. Optional abandoned-plot reclamation is a world setting with clear notice, review and a recoverable blueprint/material package. Default private friend worlds to retaining homes.

**When someone wants wilderness space:** allow temporary camps, exploration gardens and later outposts with bounded facilities. Full village claims and public services require founding. Avoid giving camps every settlement benefit at zero cost, but do not forbid travel, musical experimentation or building a rest shelter outside town.

**When a resident moves:** provide an explicit transfer process. Preserve knowledge and possessions; account for buildings and refunds once. Empty the old claim or archive its design before releasing it. A village leader cannot force a move by deleting the road in front of the house.

### 17.12. Privacy, sound and shared-space rules

Living close together increases potential friction. Personal storage is private by default. House owners control collaborators, and public paths stay usable without granting access to private containers. Define whether doors allow visitors rather than treating all residents as trusted co-builders.

Give players independent music-volume controls and a way to opt out of hearing a neighbour's continuous playback. Shared concerts use clear venue boundaries and deliberate participation; decorative proximity must not force overlapping full-volume sequencers. Logical creature preferences and reward eligibility stay independent of a listener's local audio setting.

Public roads and squares cannot be blocked by giant furniture, planted trees or foundation overhangs. Footprint checks, placement budgets and clear refusal reasons should enforce this through the same authoritative rules as private land.

Maintain a small record of property and public-fund changes. Residents should be able to tell whether a boundary changed, who edited a shared road and where their project contribution went. World-owner recovery remains available with a visible administrative record.

### 17.13. Implementation contracts and existing-code implications

The inspected `src/lib/game/net/capability.ts` signs world/player/role capabilities. These authenticate a participant within a world; they do not by themselves model village membership or plot ownership. The current guide's broad builder permissions would let neighbours alter one another's work, so claims require new server checks at every mutation path.

Recommended additional logical records:

| Record           | Essential contents                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Village          | ID, name, well, protected square, founding receipt, rules, stewards and current neighbourhood envelope.           |
| Road network     | Nodes, completed edges, widths, surface/bridge references, reservations, access relationships and graph revision. |
| Plot             | Boundary/height policy, road frontage, owner/household, permissions, expansion state and claim revision.          |
| Membership       | Player identity, village, permissions, home plot and recovery association.                                        |
| Public project   | Approved design/site, requirements, reserved deposits, contributor receipts and completion state.                 |
| Treasury         | Coin/material balances, spending permissions, reservations and ledger.                                            |
| Market listing   | Seller, stall, escrowed stock, price, listing revision, sale receipts and claimable proceeds.                     |
| Founding charter | Unique entitlement, eligible founder/group, paid contributions, validity and consumed state.                      |

Validate claim overlap, reachable road frontage and protected land on the server. Building tools use the same validator for previews, but a successful preview is not permission to bypass a changed claim revision at commit. Use spatial indexing and cached road-distance results so permission checks do not scan the whole village on every frame.

Road removal is a transaction with access consequences. Reject removal that would strand a home unless a validated replacement route is committed with it or the affected owner agrees to the move. Flooding, terrain changes and bridge edits also need access checks when those features become editable.

Store roads, plots and ownership as logical definitions; derive their meshes. Extend world validation, migrations, package exports, room snapshots and restore tooling together. Existing worlds remain creative; introducing claims over an occupied world requires a reviewed conversion map that preserves existing houses and collaborators.

Long-lived houses, shops and coins require a recovery mechanism beyond “the browser remembers you”. Before property release, choose a trusted room-scoped recovery credential or durable account binding, with a tested transfer flow. Reusing a display name is never evidence of ownership. Public cross-world identity is a separate later scope.

### 17.14. Village implementation priorities

Within backlog rank 20 and the market extension in rank 21, implement in this order. This list has no implementation timescales.

1. **Well, public square and village records:** bootstrap the first world and make the village readable.
2. **Resident identity and recovery:** preserve ownership across reloads, browser changes and leadership changes.
3. **Protected personal plots:** atomic claims, full-footprint build checks, collaborators and private storage.
4. **A compact street graph:** connected frontage, route-distance limits, public corridors and safe road edits.
5. **Newcomer joining:** available-plot directory, join-near-friend flow, temporary lodging and affordable starter claim.
6. **Shared material projects:** expand streets and add useful facilities through explicit voluntary contributions.
7. **Basic local barter:** complete safe direct exchange before introducing currency complexity.
8. **One coin ledger and priced sales:** define issuance, sinks, personal balances and separate treasury authority.
9. **Escrowed physical market stalls:** stocked listings, offline proceeds and bounded orders.
10. **Neighbourhood expansion and village stewardship:** handle capacity, public decisions, absence and moves.
11. **Expensive new-village founding:** charters, experience/contribution requirements, co-funding and atomic site placement.
12. **Inter-village character:** later trade routes, visiting performers and specialist facilities, without making the starting village obsolete.

The first multiplayer village test needs only a well, a street, neighbouring protected plots and a contribution project. Markets and expensive founding follow once there is a settlement people actually enjoy inhabiting.

### 17.15. Acceptance scenarios and evidence of success

Test the ownership and economic rules that could lose player work:

- Two friends claim adjacent plots; a third arrives later and finds a viable nearby home.
- Simultaneous claims, road edits or purchases commit once and return clear conflict results.
- A roof, fence, Mini Build, musical plant or upstairs extension cannot invade another claim or block the public road.
- Extending a road far away does not bypass the compact-neighbourhood rules.
- An edited or removed bridge cannot silently strand residents.
- A founder disconnects or leaves; residents retain property and ordinary village services.
- A resident recovers identity on another browser without transferring ownership to an impersonator.
- Emptying a treasury, cancelling a project, moving house and demolishing paid objects cannot duplicate stock.
- An offline shop sale survives room restart with the item, payment and receipt in agreement.
- A failed founding preview consumes nothing; a repeated founding command creates one village.
- A new world can always establish its first village and a full starter settlement offers a meaningful joining path.

For human playtesting, observe whether friends choose neighbouring homes, use the square naturally and can walk between common destinations comfortably. Ask whether residents feel they own their house and whether newcomers find the village welcoming. Compare the distribution of occupied homes and actual street routes, not simply the count of connected roads.

The design succeeds when players say “I live next to my friends, we recognise what each other built, and there is usually something useful happening in the village.” If people only visit the well to satisfy a mandatory meter and immediately disappear, change the incentives and layout before adding more restrictions.
