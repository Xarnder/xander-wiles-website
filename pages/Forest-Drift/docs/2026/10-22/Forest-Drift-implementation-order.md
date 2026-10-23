# Forest Drift — implementation order and task checklist

Created: 22 October 2026.

**Purpose:** the actionable, feature-by-feature implementation order for Forest Drift. Work from the top down. Each numbered task describes what to implement and what must be true before marking it complete. There are no implementation timescales.

**Design reference:** [gameplay research and implementation plan](../10-20/Forest-Drift-gameplay-research-and-implementation-plan.md), including its multiplayer village proposal. That document explains the design; this document defines the work order. Use this checklist for sequencing where the research document groups several dependent systems into one broad priority.

**Status:** all checkboxes start unchecked. They represent work to implement or verify, not a claim that every underlying component is absent. Check the current code before each task and extend working systems instead of rebuilding them. This document does not implement game features.

## How to use this checklist

1. The task numbers are the default execution order: FD-001, FD-002, and so on. Earlier tasks provide the foundation for later tasks. Each stage's final acceptance task must pass before advancing to the next stage.
2. Foundations needed for an important feature are included immediately before that feature. Importance therefore includes dependencies: for example, reliable item transactions precede material rewards, and protected plots precede village markets.
3. Keep each task focused on its stated outcome. Use small content sets until the connected loop works. Avoid building a general-purpose framework or a full content catalogue to complete an early task.
4. A gameplay task includes its state model, UI, save/load behaviour, failure handling and relevant validation. Online tasks also include authority, reconnect and permissions. Do not defer those essentials to the last stage.
5. Use desktop and touch interaction equivalents, readable text, colour-independent indicators and independent audio controls as applicable from the first implementation. Visual or hearing settings must not change logical rewards.
6. Add focused automated coverage for rules that can lose progress, duplicate stock, break ownership or desynchronise players. Use human playtests for fun, clarity and social layout. Documentation changes alone do not establish a gameplay test pass.
7. If a task exposes a blocker, fix it before dependent work. Do not mark a feature complete because its interface exists while the underlying rule remains unimplemented.
8. Preserve stable task IDs when adding work later. Insert supplementary IDs such as FD-064a rather than silently renumbering references to completed work.

## Order at a glance

| Order | Stage                                        | Tasks         | Result                                                                 |
| ----- | -------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| 1     | A — Progression foundations                  | FD-001–FD-008 | Safe new progression worlds and reusable item rules.                   |
| 2     | B — Discover, grow and compose               | FD-009–FD-021 | A wild seed becomes an editable musical voice.                         |
| 3     | C — Listeners, performances and gifts        | FD-022–FD-029 | A completed song attracts creatures and earns useful materials.        |
| 4     | D — Build a home and complete the first loop | FD-030–FD-040 | Exploration → music → creature → materials → home works end to end.    |
| 5     | E — Reasons to repeat the loop               | FD-041–FD-047 | Discoveries, returning visitors and small requests.                    |
| 6     | F — Trustworthy online progression           | FD-048–FD-058 | Shared earning and spending with durable ownership.                    |
| 7     | G — Compact villages and neighbours          | FD-059–FD-078 | Central well, connected streets, protected plots and shared projects.  |
| 8     | H — Meeting and making music together        | FD-079–FD-087 | Shared markers, readable social actions and synchronised performances. |
| 9     | I — Trading, coins and village markets       | FD-088–FD-099 | Safe barter and local buying/selling.                                  |
| 10    | J — Experienced players found new villages   | FD-100–FD-108 | Expensive founding, capacity handling and settlement continuity.       |
| 11    | K — Deeper exploration and progression       | FD-109–FD-120 | More sound roles, habitats, specialist exchanges and travel.           |
| 12    | L — Long-term expression and expansion       | FD-121–FD-132 | Events, sharing, mechanisms, new regions and optional modes.           |

**First milestone:** complete FD-040 before expanding the game significantly. **First village milestone:** complete FD-078 before adding money or shops. Advanced music, public content galleries, new biomes and deep plant breeding do not block either milestone.

## Existing work to reuse

The existing project already contains terrain and hydrology, construction and Mini Builds, procedural vegetation and creatures, the music sequencer and MIDI import, local world persistence, and multiplayer rooms. Extend these systems.

The newer [terrain-editor implementation notes](../10-21/Forest-Drift-terrain-editor-implementation.md) describe shovel editing and sparse terrain records. The current source also contains `TerrainEdits.ts` and the `terrainTile` network entity kind. Treat this as existing work to integrate with costs and plot permissions, not a terrain-editor feature to rebuild.

The separate [multiplayer social plan](Multiplayer/multiplayer-social-features.plan.md) provides detailed marker, meeting and expression proposals. Reuse its contracts when implementing FD-079–FD-082 and FD-117; check their current implementation status and unresolved choices at that point. This checklist does not add free-text chat, automatic player teleporting or voice chat as prerequisites.

Relevant code areas are `src/lib/game/world/`, `music/`, `vegetation/plants/`, `creatures/`, `building/`, `miniBuild/`, `terrain/`, `net/`, `src/lib/components/` and `server/src/`. Names proposed in the research plan are responsibilities, not a required file structure.

## A — Progression foundations

### FD-001 — Record the current compatibility baseline

- [ ] **Implement:** preserve representative existing creative worlds, a MIDI garden, a multi-level building, a Mini Build and a terrain-edited world as compatibility fixtures. Record relevant existing checks and separate known failures from new regressions.
- **Complete when:** later changes can be compared against reproducible examples without modifying the player's originals.

### FD-002 — Add explicit creative and progression world policies

- [ ] **Implement:** distinguish unrestricted creative worlds from new resource-funded progression worlds. Default existing worlds to creative. Keep progression state out of purely local graphics and audio preferences.
- **Complete when:** old worlds open with their existing tools and contents; new progression worlds can be selected explicitly and retain that choice after reload.

### FD-003 — Define the minimum gameplay content catalogue

- [ ] **Implement:** stable IDs for timber, fibre, stone, clay, seeds and three starter musical plant families. Define item categories, stack rules, display text and source hints. Reserve specialist gems for later content.
- **Complete when:** the inventory, gathering, cultivation and rewards can reference the same validated definitions without duplicate naming systems.

### FD-004 — Implement inventory and the seed pouch

- [ ] **Implement:** logical item stacks, generous capacity, add/remove queries and a readable stock display. Separate consumed items from learned blueprints and discoveries. Provide desktop and touch access without excessive menu navigation.
- **Complete when:** quantities display correctly, invalid quantities are rejected, and rearranging inventory never creates or loses stock.

### FD-005 — Introduce atomic gameplay commands

- [ ] **Implement:** a shared command boundary for validating and committing item changes with world changes. Include operation IDs, state revisions, failure results and idempotent retry handling. Begin with the commands needed for collection and planting.
- **Complete when:** a failed command changes nothing and repeating an accepted command cannot apply its effects twice.

### FD-006 — Persist and validate progression state

- [ ] **Implement:** save/load, migration defaults, import/export and autosave integration for inventories, discoveries, future cultivation records and transaction summaries. Bound record sizes and numeric values. Use the existing world migration contract.
- **Complete when:** state survives a round trip, malformed imports are rejected safely, and FD-001's old-world fixtures still load unchanged in behaviour.

### FD-007 — Add an explicit progression clock

- [ ] **Implement:** active-world simulation time independent of rendering, wall-clock dates and note scheduling. Initially pause offline progression when paused, hidden or closed. Expose a controlled test clock without allowing debug time changes to create economic rewards.
- **Complete when:** reloads and browser suspension cannot unexpectedly mature plants or complete performances.

### FD-008 — Create the small progression starting world

- [ ] **Implement:** a dependable clearing with one Music Tree, a cultivation area, starter stock, a ready musical voice and accessible starter resources. Validate terrain, water and approach space; provide fallback placement for unsuitable seeds.
- **Complete when:** representative seeds produce a playable starting area with no rare-item dependency. Save/reload preserves the starter grant exactly once.

## B — Discover, grow and compose

### FD-009 — Add a common interaction action

- [ ] **Implement:** contextual inspect/interact prompts with a consistent action for plants, pickups, gifts and useful furnishings. Define range, target priority, unavailable reasons and input handling when dialogs or build tools are active.
- **Complete when:** mouse/keyboard and touch select the same logical action without accidental double activation.

### FD-010 — Make a curated subset of plants inspectable

- [ ] **Implement:** identify collectible colonies through shape and targeting. Show family, habitat hint and a short instrument preview. Use spatial candidates rather than creating a heavyweight interaction object for every visible flower.
- **Complete when:** a player can distinguish a useful colony from decorative ground cover and preview its sound before collecting it.

### FD-011 — Give harvestable resources stable identities

- [ ] **Implement:** deterministic resource IDs and persisted harvest/cooldown exceptions using seed, generator version and candidate identity. Regenerate untouched scenery; do not save all ambient plant instances.
- **Complete when:** unloading a chunk or reopening the world does not reset a claimed resource or change its gameplay family.

### FD-012 — Implement seed collection

- [ ] **Implement:** collect a seed through the common action, atomically credit stock and update the colony's harvest state. Provide visible feedback, renewable availability and a reliable starter-family source.
- **Complete when:** collecting twice, leaving the area and reloading cannot duplicate seeds; collection leaves the colony recognisably alive.

### FD-013 — Add basic material gathering

- [ ] **Implement:** accessible fallen wood, fibre plants, loose stone and clay sources with clear prompts and renewable rules. Reuse targeting and harvest identity. Give essential materials reliable near-start sources.
- **Complete when:** basic construction resources are available without music rewards, specialist tools or fortunate world generation.

### FD-014 — Record initial plant discoveries

- [ ] **Implement:** journal entries for inspected/collected gameplay families, their sound previews, habitat hints and known collection sources. Keep generated cosmetic specimens distinct from the finite set of useful families.
- **Complete when:** a player can answer what they found, what it sounds like and where to look again after reopening the game.

### FD-015 — Add authored planting beds or pots

- [ ] **Implement:** a small cultivation container using existing placement/furniture systems. Store its identity and usable planting positions. Validate slope, obstruction and the existing foundation/terrain rules.
- **Complete when:** a bed can be placed, selected, saved and removed safely without depending on a new construction engine.

### FD-016 — Implement planting a seed

- [ ] **Implement:** choose a seed, preview a valid cultivated position and commit seed consumption with the authored plant record. Cancelled or blocked placements retain the seed. Display family and current stage.
- **Complete when:** one successful planting consumes one seed, and a failed or repeated command cannot consume another.

### FD-017 — Implement forgiving growth and care

- [ ] **Implement:** seed, sprout and ready stages using the progression clock. Begin with simple light/moisture suitability, readable needs and optional care benefits. Unsuitable conditions slow growth; they do not destroy the last essential plant.
- **Complete when:** growth is consistent across frame rates, chunk unloads and reloads, with no mandatory real-calendar waiting.

### FD-018 — Make cultivated plants renewable

- [ ] **Implement:** ready plants provide a renewable seed route and a reusable musical-voice entitlement. Define harvest/recovery behaviour and preserve the relationship to the cultivated plant. Avoid unlimited grants from repeated interactions.
- **Complete when:** a player can expand their garden legitimately and recover from spending their last starter seed.

### FD-019 — Connect cultivated voices to authored music plants

- [ ] **Implement:** link available cultivated voices to existing Music Tree note placement. Moving or retuning an owned voice is free; additional simultaneous voices require the defined cultivation entitlement. Preserve creative placement and existing MIDI data.
- **Complete when:** biological growth does not alter explicit pitch, timing or sustain, and rearranging a composition does not consume another seed.

### FD-020 — Add a beginner music-editing interface

- [ ] **Implement:** sound preview, add/move note, higher/lower pitch, longer/shorter sustain, playback and a small editable starter phrase. Use scale-safe defaults and explain the expanding wave. Keep precise controls accessible as an advanced view.
- **Complete when:** a non-musician can change a phrase and understand the audible or visual result without importing MIDI.

### FD-021 — Save and undo composition edits

- [ ] **Implement:** non-destructive music edit history and composition revisions covering the beginner controls. Preserve voice ownership, instrument identity, exact imported notes and duration information through save/load.
- **Complete when:** edits can be undone without duplicating voices, and a planted discovery reliably becomes a saved, editable musical option.

## C — Listeners, performances and gifts

### FD-022 — Define three starter listener profiles

- [ ] **Implement:** a friendly beginner listener, a calm sustained-sound listener and a rhythmic listener using existing creature generation. Define understandable preferences, ordinary gift roles and readable reactions.
- **Complete when:** the profiles differ through behaviour and musical preference, without requiring three new rendering or animation pipelines.

### FD-023 — Extract musical preference attributes

- [ ] **Implement:** derive bounded attributes such as instrument roles, note density, repetition, tempo range and sustained notes from symbolic composition data. Cache by composition revision.
- **Complete when:** attributes are deterministic and do not depend on microphone input, sound volume, graphics quality or subjective audio-quality scoring.

### FD-024 — Add audience intentions to creature behaviour

- [ ] **Implement:** noticing music, deciding to visit, approaching, listening and departing while preserving flee behaviour and safe locomotion. Evaluate nearby gardens through a spatial index at a bounded update rate.
- **Complete when:** a suitable phrase predictably attracts a nearby listener without making every ambient creature permanently follow the tree.

### FD-025 — Allocate reachable listening spaces

- [ ] **Implement:** safe audience positions with spacing by body size and clearance from water, buildings and planted notes. Handle obstructed venues through reachable perimeter spots or clear feedback; avoid visible teleporting through walls.
- **Complete when:** a small audience can gather and leave without overlapping the house, each other or unsafe terrain.

### FD-026 — Add deliberate performance sessions

- [ ] **Implement:** separate free playback from a performance with an ID, selected tree, composition revision, start, bounded completion point and cancellation state. Tie sessions to simulation time while retaining audio-clock note scheduling.
- **Complete when:** ambient looping is unlimited but cannot be mistaken for an unlimited sequence of rewarded performances.

### FD-027 — Resolve performances and show reactions

- [ ] **Implement:** clear completion/interruption feedback and creature preference reactions, with text/visual equivalents. Apply live edits at defined musical boundaries or defer them to the next session.
- **Complete when:** a simple starter phrase can succeed and the player understands why a listener responded; adding more notes is not automatically better.

### FD-028 — Implement an idempotent reward ledger

- [ ] **Implement:** grant common material bundles once per eligible logical visit/opportunity. Persist claim IDs or compact equivalent counters, beneficiary and pending gifts in the same transaction as stock changes.
- **Complete when:** retries, reloads, hidden tabs and a despawned creature cannot duplicate or lose an earned gift.

### FD-029 — Present and claim creature gifts

- [ ] **Implement:** visible gifts with who gave them, what they contain and a useful construction suggestion. Guarantee the first qualifying visitor and explain renewable visit opportunities. Retain gifts if inventory capacity is reached.
- **Complete when:** the player can connect their song to a creature and a usable material reward without a gem-conversion chain.

## D — Build a home and complete the first loop

### FD-030 — Calculate consistent construction costs

- [ ] **Implement:** central cost quotes from existing logical geometry and material definitions, starting with foundations, walls, a roof, storage and seating. Define standard units and rounding; keep equivalent split/merged shapes economically consistent.
- **Complete when:** a player sees the required materials before placement and cannot reduce cost merely by fragmenting a wall.

### FD-031 — Commit material-funded construction atomically

- [ ] **Implement:** validate geometry and permissions, debit stock, create the logical object and record paid provenance together. Route the supported tools through this command; creative mode bypasses cost without creating refundable paid value.
- **Complete when:** blocked/cancelled builds cost nothing, and successful retry messages cannot pay for or place an object twice.

### FD-032 — Integrate refunds, demolition and undo

- [ ] **Implement:** inverse transactions, safe edit deltas and refunds to the original owner/stockpile. Handle dependent deletion, especially foundation contents, exactly once. Reject stale undo rather than overwriting later shared work.
- **Complete when:** build/edit/undo/demolish cycles cannot mint materials, and ordinary solo experimentation can use clearly stated full refunds.

### FD-033 — Cover every progression construction path

- [ ] **Implement:** extend economic handling to levels, slabs, stairs, doors/windows, roof changes, barriers, details and material replacement. Until a tool is integrated, disable its material-producing progression path with a clear reason; retain it in creative.
- **Complete when:** an available progression tool cannot bypass payment or refund rules through an alternate editor or shortcut.

### FD-034 — Handle Mini Build and furniture material value

- [ ] **Implement:** bounded logical design costs for paid instances, design-edit cost deltas and provenance for placed furniture. Separate copying a blueprint from receiving its physical materials.
- **Complete when:** editing one shared design cannot upgrade all instances free of charge or produce an oversized demolition refund.

### FD-035 — Add usable home storage

- [ ] **Implement:** a chest or storehouse interaction with atomic inventory transfers, seed/material organisation and persistent contents. Set up ownership fields that can later distinguish a household chest from village stock.
- **Complete when:** opening, moving or removing a container follows an explicit content-recovery rule and never silently deletes items.

### FD-036 — Add the first shelter project and home marker

- [ ] **Implement:** an optional ghost blueprint for a modest affordable shelter, a home name/position and a simple return-direction indicator. Accept several valid shapes and recognise basic useful furnishings.
- **Complete when:** the first reward plus starter supplies funds a visible improvement, and the player can find the home again.

### FD-037 — Guide the opening through completed actions

- [ ] **Implement:** dismissible goals for inspecting, collecting, growing, arranging, performing, receiving and building. Derive completion from real state rather than assuming a fixed action order. Save progress and provide replayable help.
- **Complete when:** a newcomer can finish the opening with ordinary UI, including when they complete an action before its tutorial prompt.

### FD-038 — Add recovery from common beginner mistakes

- [ ] **Implement:** renewable starter seed access, stranded-player recovery, pending-item retrieval and clear save errors. Prevent repeated starter grants from becoming a profitable stock source.
- **Complete when:** losing a seed, choosing an inconvenient site or interrupting a save cannot permanently block the core loop.

### FD-039 — Verify the complete first loop

- [ ] **Implement:** an end-to-end scenario that collects a plant, grows a voice, edits music, completes a visit, claims a gift and funds construction. Reload/export/import at meaningful points and exercise cancellation/retry cases.
- **Complete when:** the loop preserves stock, composition and home state, and the creative compatibility fixtures still work.

### FD-040 — Pass the first playable-game gate

- [ ] **Implement:** human playtests of the opening, then fix confusing interactions, waiting, poor rewards and obvious performance/accessibility blockers. Measure the integrated scene, not isolated system demos.
- **Complete when:** a new player understands the loop, completes a useful home improvement and identifies something they want to do next without developer guidance.

## E — Reasons to repeat the loop

### FD-041 — Add a few purposeful discovery landmarks

- [ ] **Implement:** a meadow colony, shaded grove, reed pool and simple resonant clearing using deterministic placement and access checks. Each provides a sound family, material source or concrete clue.
- **Complete when:** an expedition changes the player's available options and required starter discoveries have reachable fallbacks.

### FD-042 — Expand the field journal into a practical guide

- [ ] **Implement:** observed habitat clues, rough landmark directions, material sources and known listener preferences. Preserve discoveries through save/load and distinguish unobserved hints from confirmed information.
- **Complete when:** players can plan another useful expedition without an external wiki or a huge list of meaningless procedural variants.

### FD-043 — Add renewable, bounded visitor opportunities

- [ ] **Implement:** repeat visits driven by active world progression and understandable opportunities. Keep visitors enjoying old songs after payment without paying every loop. Avoid daily streaks and arbitrary forced composition edits.
- **Complete when:** ordinary play can continue supplying materials while unattended playback cannot generate unlimited gifts.

### FD-044 — Save relationship memories and milestones

- [ ] **Implement:** named visitor identity, remembered performances, learned preferences and one useful friendship unlock. Store compact relationship records rather than every ambient animal.
- **Complete when:** the player recognises a friend after reopening the world and gains a new option instead of only a larger reward multiplier.

### FD-045 — Make named visitors return reliably

- [ ] **Implement:** promotion from ambient identity to persistent visitor, bounded return scheduling and safe arrival when the original chunk is unloaded. Pin recipes so updates do not change the animal's appearance unexpectedly.
- **Complete when:** a known visitor can return to a suitable garden across sessions without duplicating itself or being permanently stranded.

### FD-046 — Add small optional creature requests

- [ ] **Implement:** a few requests involving a suitable planting, calm phrase, listening seat or shelter. Use objective flexible predicates, one-time completion receipts and useful seeds/blueprints as rewards.
- **Complete when:** several player-created solutions qualify and ordinary housing remains possible without completing every request.

### FD-047 — Pass the repeat-play gate

- [ ] **Implement:** play through several complete cycles with different sounds, destinations and home projects. Adjust reward supply and costs using actual material budgets.
- **Complete when:** later cycles offer choices rather than repeat the tutorial with larger numbers, and neither planting nor music feels like an obligatory income chore.

## F — Trustworthy online progression

### FD-048 — Define multiplayer stock and ownership policies

- [ ] **Implement:** distinguish personal household inventory, optional cooperative stock and separately permissioned village stock. Specify reward beneficiaries, donation ownership and which invite roles can spend or modify gameplay state.
- **Complete when:** every earning/spending command has an explicit owner and adding another client cannot multiply shared rewards.

### FD-049 — Implement durable participant recovery

- [ ] **Implement:** a room-scoped recovery credential or durable account binding with an explicit transfer/recovery flow. Reuse existing signed capabilities where suitable. Never infer ownership from a display name.
- **Complete when:** a resident can recover their identity on another browser while a player using the same name cannot take their stock or future house.

### FD-050 — Add authoritative gameplay protocol commands

- [ ] **Implement:** validated server commands and responses for gathering, cultivation, claiming and spending, with operation IDs, revisions, bounds and permission checks. Keep speculative previews separate from accepted changes.
- **Complete when:** modified clients cannot credit their own stock by submitting arbitrary world patches or replaying accepted commands.

### FD-051 — Persist gameplay transactions in the room

- [ ] **Implement:** durable inventory, claims, cultivation and transaction summaries in shared-world snapshots/storage. Extend room wake/restart handling and account for current transient-state limitations rather than relying on process memory.
- **Complete when:** room restart during a command yields either its complete accepted result or no result, never a partial debit/credit.

### FD-052 — Synchronise collection and depletion

- [ ] **Implement:** server-owned harvest claims, resource cooldowns and inventory credits. Validate resource identity, actor eligibility and a practical authoritative position/resource check.
- **Complete when:** two clients collecting the same source receive one consistent result, and reconnecting cannot reset depletion.

### FD-053 — Synchronise cultivation and world time

- [ ] **Implement:** room-owned active-world growth time and shared cultivated plants. Preserve the empty-room pause policy. Handle late join and avoid treating owner visual weather/time overrides as production progress.
- **Complete when:** clients agree on stages and yield, including after hibernation, reconnect and a long empty-room interval.

### FD-054 — Enforce construction spending on the server

- [ ] **Implement:** authoritative cost quotes/checks, ownership, debits and refunds across build tools and Mini Builds. Reject stale geometry/cost revisions and preserve creator/refund provenance.
- **Complete when:** concurrent spending cannot overdraw stock, and bypassing a client tool cannot produce unpaid progression objects.

### FD-055 — Give rewarded visits shared logical authority

- [ ] **Implement:** a bounded server-owned visit/performance eligibility model and reward state. Clients animate these visits; ordinary ambient animals can remain local. Validate completion without running Three.js on the server.
- **Complete when:** clients see compatible reward-bearing visits and cannot independently award gifts from local creature movement.

### FD-056 — Reconcile reconnects and restored worlds

- [ ] **Implement:** accepted/pending/failed command reconciliation, backup/export coverage and an economy epoch or equivalent restore policy. Keep offline local copies from becoming an alternate authority for online balances.
- **Complete when:** restoring or retrying cannot replay old receipts, lose committed stock or import creative materials as scarce online goods.

### FD-057 — Add bounded operational diagnostics

- [ ] **Implement:** compact counters for command failures, retries, persistence cost, claim sizes and reconciliation issues. Enforce record/message limits and show actionable connection/save status.
- **Complete when:** the shared loop fits tested hosting budgets and failures can be diagnosed without recording private player content unnecessarily.

### FD-058 — Pass the shared-progression gate

- [ ] **Implement:** multi-client tests for simultaneous harvest/spend, disconnect during gifts/builds, room restart, permission denial and restoration. Exercise the complete core loop online.
- **Complete when:** stock and authored state converge correctly, with no duplication/loss and no requirement for synchronised audio to establish economic correctness.

## G — Compact villages and neighbours

### FD-059 — Add village and membership records

- [ ] **Implement:** village ID/name, founding position, public boundary, members, steward roles and configuration. Keep village membership distinct from world administration and personal property ownership.
- **Complete when:** a world can list its villages and members durably without giving every founder control of every resident's belongings.

### FD-060 — Bootstrap the first well and public square

- [ ] **Implement:** one free first-village founding package per new village-mode world, a valid well site, protected arrival space, noticeboard and reserved market/music areas. Provide site preview before committing.
- **Complete when:** a brand-new server can establish its first village without experienced players or money, and retrying cannot issue another package.

### FD-061 — Implement a road graph rooted at the well

- [ ] **Implement:** completed road nodes/edges, widths, terrain-following geometry and walkable access. Only connected usable segments provide frontage. Keep decorative paths distinct from service-providing roads.
- **Complete when:** the server can determine which street fronts connect to the centre; unfinished or disconnected lines cannot service claims.

### FD-062 — Reserve public corridors and compact neighbourhoods

- [ ] **Implement:** protected road space, future street reservations, a neighbourhood envelope and bounded route distance to the well. Reject claimed obstructions and long-road bypasses.
- **Complete when:** connecting a distant location by an arbitrarily long path does not make it an eligible starter house plot.

### FD-063 — Generate and preview usable plot candidates

- [ ] **Implement:** residential boundaries with road frontage, entrance access, usable height rules and enough room for existing building tools. Reserve larger shared garden plots for radial Music Trees where needed.
- **Complete when:** candidates are physically buildable and preview their full boundary, rather than only a centre marker.

### FD-064 — Add atomic residential plot claims

- [ ] **Implement:** free or nominal-cost first claims, one ordinary home allocation per resident under the world policy, and explicit claim revisions. Include overlap and public-space checks.
- **Complete when:** simultaneous claims have one winner, and a newcomer can obtain a home without buying land from a wealthy founder.

### FD-065 — Add plot collaborators and permissions

- [ ] **Implement:** owner/household, co-builder, gardening and container permissions with sensible defaults. Check every mutation on the server as well as showing permission-aware previews.
- **Complete when:** being a village member or world builder alone does not permit altering a neighbour's protected house.

### FD-066 — Validate full object footprints against claims

- [ ] **Implement:** permissions for foundations, roofs/overhangs, upper storeys, barriers, furniture, Mini Builds, trees and music plants. Define shared-boundary exceptions explicitly.
- **Complete when:** placing an object's centre inside your plot cannot invade neighbouring land/airspace or block a public street.

### FD-067 — Apply claims to shovel edits and access changes

- [ ] **Implement:** plot/public-space protection over the entire terrain brush and interpolation footprint, plus support and road-access consequences. Extend existing terrain tile authority; client-only safety checks cannot authorise protected edits.
- **Complete when:** a resident cannot excavate a neighbour's support or destroy the public route by editing from just outside the boundary.

### FD-068 — Separate private, household and public containers

- [ ] **Implement:** container access and transfer rules for each ownership type. Connect household building costs to its selected stock, with deliberate donation to public supplies.
- **Complete when:** shopping or visiting a village grants no access to private chests, and public projects cannot spend personal items automatically.

### FD-069 — Add joining near friends and temporary lodging

- [ ] **Implement:** arrival at the inviter's authorised village, clear available plots, basic guest accommodation and a guided first claim. Ensure ordinary joining does not require a founder online.
- **Complete when:** a late-arriving friend can establish a nearby home using normal UI and understand local rules before claiming.

### FD-070 — Add a village map and plot directory

- [ ] **Implement:** a compact village layout view showing the well, public streets, available/occupied plots and named shared places. This is a local settlement view; the full world map comes later.
- **Complete when:** residents can locate a neighbour, public project or viable plot without manually searching the whole world.

### FD-071 — Add bounded plot reservations for friends

- [ ] **Implement:** named reservations with explicit expiry, occupancy limits and visible state. Release unused reservations according to policy; retain separate offline ownership for genuinely occupied homes.
- **Complete when:** friends can plan adjoining plots without a player permanently reserving the entire village centre.

### FD-072 — Fund public projects with material contributions

- [ ] **Implement:** approved requirements, committed site/design, escrowed contributions, contributor receipts, completion and cancellation refunds. Start with one street or shared nursery project.
- **Complete when:** residents see a useful shared result, and deposited public materials cannot be diverted into private construction.

### FD-073 — Expand housing through completed street projects

- [ ] **Implement:** adjoining neighbourhood expansion unlocked by useful development and genuine occupancy, not empty speculative claims. Complete roads before advertising their plots as available.
- **Complete when:** a growing group gains new nearby homes while the original centre remains useful and compactness rules still apply.

### FD-074 — Protect access during road removal and rerouting

- [ ] **Implement:** access-impact checks, replacement-route transactions and affected-owner consent where appropriate. Reject edits that strand homes or block essential arrival/service space.
- **Complete when:** deleting a street, bridge reference or terrain support cannot silently remove a resident's usable home access.

### FD-075 — Add limited stewardship and public change history

- [ ] **Implement:** delegated public-project roles, founder absence/succession policy and a bounded audit history. Separate treasury/project powers from the ability to confiscate private property.
- **Complete when:** ordinary services keep working without the founder, and residents can understand who changed shared land or funds.

### FD-076 — Implement moving homes and releasing plots

- [ ] **Implement:** explicit move/archive choices, preserved possessions and blueprints, one-time eligible refunds and release of the old claim. Validate destination capacity and ownership before moving anything.
- **Complete when:** moving neither duplicates construction value nor discards belongings, and a leader cannot force it by revoking membership.

### FD-077 — Handle absence and resident recovery fairly

- [ ] **Implement:** homes persist through normal breaks with no mandatory rent or automatic confiscation. If optional reclamation is enabled, require notice, review and recoverable contents/designs. Integrate identity recovery and world-owner repair tools.
- **Complete when:** an absent resident can return or recover their property according to the declared world rules.

### FD-078 — Pass the neighbouring-homes gate

- [ ] **Implement:** a multi-player scenario with a well, connected road, adjoining claimed homes, private storage, a later joiner and a funded expansion. Test trespass, shovel edits, road removal, founder departure and restart.
- **Complete when:** friends naturally settle near one another, own their space and use shared facilities. Money and shops are not needed to prove this.

## H — Meeting and making music together

### FD-079 — Establish durable marker state

- [ ] **Implement:** the marker identity/lifetime/audience contract and persistence appropriate for pings, session waypoints and landmarks. Resolve wake/hibernation behaviour using the dedicated social plan; reuse existing locator infrastructure.
- **Complete when:** a marker's intended lifetime survives relevant reconnect/wake cases without leaking targeted markers to other players.

### FD-080 — Add pings and shared destinations

- [ ] **Implement:** common-action pings, personal/shared waypoints and tracked village landmarks with locator/in-world indicators. Include rate limits, dismiss/mute, arrival feedback and touch input.
- **Complete when:** a resident can guide a friend to a plot, material source or well without free-text chat or automatic teleporting.

### FD-081 — Add roster actions for meeting up

- [ ] **Implement:** track a player, share a destination and request a meeting through the online roster. Reuse marker audiences and permissions. Keep consented relocation optional and separately validated if later implemented.
- **Complete when:** players can arrange and find a meeting without exposing private waypoints or bypassing movement checks.

### FD-082 — Add lightweight social reactions

- [ ] **Implement:** a small emote/pointing set and preset phrases for hello, thanks, follow, help and listening. Use bounded network events and reuse character gestures where available.
- **Complete when:** visitors and residents can communicate basic intent with mute/rate controls, without requiring free-text or voice-chat systems.

### FD-083 — Synchronise performance transport

- [ ] **Implement:** room start time, composition revision, timeline state and late-join musical position. Map room time to local audio time, schedule ahead and correct drift gently.
- **Complete when:** two clients hear the same performance position under ordinary latency without sending each note as a live network packet.

### FD-084 — Coordinate shared composition editing

- [ ] **Implement:** clear per-layer editing rights or another understandable ownership rule, revision conflicts and changes at musical boundaries. Show who is editing and distinguish private previews from committed notes.
- **Complete when:** collaborators can add parts without continuously overwriting each other or invalidating an active performance snapshot.

### FD-085 — Control neighbouring music and venue sound

- [ ] **Implement:** distance/venue-aware sound presentation, independent mute/volume controls and participation choices. Avoid overlapping full-volume gardens in compact villages. Keep logical eligibility separate from hearing preferences.
- **Complete when:** a resident can enjoy or mute a neighbour's garden without losing progress or muting all useful game feedback.

### FD-086 — Credit cooperative performances fairly

- [ ] **Implement:** explicit participants/beneficiaries and one shared logical visit outcome. Use contribution rules that support musicians and listeners without multiplying material supply by idle client count.
- **Complete when:** late join, mute, reconnect and an extra browser tab cannot create duplicate claims or erase valid participation.

### FD-087 — Pass the social-performance gate

- [ ] **Implement:** a village gathering with meeting markers, permitted co-editing, shared playback and a reward-bearing visit. Test latency, interruption, audio suspension and late join.
- **Complete when:** gathering is enjoyable for both musicians and listeners and remains economically correct after reconnect.

## I — Trading, coins and village markets

### FD-088 — Add a direct item-barter interface

- [ ] **Implement:** two-party offers with item IDs, quantities, specimen traits and clear ownership. Keep trades within the authorised world and exclude unproven creative imports/shared stock without permission.
- **Complete when:** both players can inspect exactly what they would give and receive before anything moves.

### FD-089 — Reserve offered items in escrow

- [ ] **Implement:** server-held trade reservations, unique trade IDs, bounded offer sizes and available-versus-reserved stock. Handle partial stacks without rounding or duplication.
- **Complete when:** offered items cannot simultaneously be spent, built with, donated or offered in another trade.

### FD-090 — Commit confirmed trades atomically

- [ ] **Implement:** both parties accept the same final revision; any offer change clears confirmations. Commit both debits, both credits and the receipt together.
- **Complete when:** neither side can substitute an item after acceptance, and a trade completes wholly or not at all.

### FD-091 — Recover cancelled and interrupted trades

- [ ] **Implement:** cancellation, disconnection, expiry, full-storage handling and room-restart recovery. Persist receipts and reconcile retry messages without reopening completed offers.
- **Complete when:** every escrowed item has exactly one final owner after interruption or restore.

### FD-092 — Add one world-scoped coin ledger

- [ ] **Implement:** integer personal balances, reservations, transfers and reason-coded receipts. Keep village treasury funds separate. Barter and ordinary solo progression continue to work without money.
- **Complete when:** coin transfers conserve balances and cross-world/creative imports cannot claim monetary value.

### FD-093 — Define bounded coin issuance and sinks

- [ ] **Implement:** funded delivery/restoration opportunities with a per-world issuance policy, objective completion and optional sinks. Avoid unlimited NPC buying or large repeatable newcomer grants.
- **Complete when:** the world can account for minted/spent coins and common gathering/refund cycles cannot create unbounded income.

### FD-094 — Add priced face-to-face sales

- [ ] **Implement:** extend the proven trade transaction to item-for-coin offers, with explicit total price, stock and revision. Keep exact amounts visible before confirmation.
- **Complete when:** a sale transfers the agreed items and coins atomically, including failure and retry cases.

### FD-095 — Add a village treasury with spending rules

- [ ] **Implement:** voluntary deposits, reserved project budgets, authorised spending and readable records. Refunded project money returns according to contribution ownership.
- **Complete when:** holding a steward role does not automatically allow personal withdrawals or spending already-committed funds twice.

### FD-096 — Add physical market stalls

- [ ] **Implement:** permitted stall placement, seller identity, escrowed stock, unit price, listing revision and remaining quantity. Keep listing limits and public access; discover stalls through the village directory.
- **Complete when:** a buyer knows the exact item/price and simultaneous purchases cannot oversell inventory.

### FD-097 — Preserve offline-shop sales and proceeds

- [ ] **Implement:** transactions against deposited stock while a seller is absent, durable proceeds and safe claiming. Price edits require new revisions; purchases never silently accept changed prices.
- **Complete when:** room restart preserves stock, buyer ownership, seller proceeds and receipts in agreement.

### FD-098 — Add funded local orders

- [ ] **Implement:** buy orders and objective delivery commissions backed by deposited payment. Fill quantities once; return unused escrow on cancellation. Keep subjective building/service promises outside automatic settlement initially.
- **Complete when:** a newcomer can fulfil a genuine local request without the buyer online and receive the promised payment reliably.

### FD-099 — Pass the village-economy gate

- [ ] **Implement:** exercise barter, face-to-face sale, offline stall purchase, public funding and funded delivery together. Test duplicate commands, disconnects, changing offers and scarcity/price feedback.
- **Complete when:** balances reconcile, homes remain affordable and residents find real reasons to trade rather than being forced to buy essentials.

## J — Experienced players found new villages

### FD-100 — Track founding experience through contributions

- [ ] **Implement:** verifiable milestones for an established home and useful completed village work. Display progress toward founding. Avoid eligibility based only on hours online, account age or transferable wealth.
- **Complete when:** an experienced contributor can see what qualifies and an idle or newly funded alternate identity cannot automatically bypass it.

### FD-101 — Define the founding charter and substantial cost

- [ ] **Implement:** one-use charter entitlements, a varied material package and a coin sink calibrated against completed village projects. Explain requirements and keep the first-world bootstrap exception separate.
- **Complete when:** joining remains the clear beginner choice, while a long-term player has an attainable, transparent route to founding.

### FD-102 — Preview valid new-village sites

- [ ] **Implement:** separation from existing centres, protected expansion, terrain/water/access checks and space for a square, streets and multiple homes. Enforce tested per-world limits.
- **Complete when:** a founder can inspect a complete viable starting footprint before committing any charter or resources.

### FD-103 — Support co-funded founding projects

- [ ] **Implement:** reserved contributions, explicit founder/co-founder rights, cancellation and refunds. Make a group-commitment requirement configurable; retain a deliberate solo long-term route.
- **Complete when:** collaborators understand what they fund, and cancelling or leaving cannot strand their reserved stock.

### FD-104 — Found a new village in one transaction

- [ ] **Implement:** revalidate eligibility/site revisions, consume the charter/resources and create the village/well/public records once. Include a founding receipt and restore/retry protection.
- **Complete when:** invalid placement costs nothing and duplicate submission produces exactly one settlement.

### FD-105 — Add cross-village visiting and membership choices

- [ ] **Implement:** same-world village directory entries, visitor rights, home-village designation and explicit residency transfer. Preserve earned knowledge and prevent repeat starter grants.
- **Complete when:** another village is an accessible place to visit without silently changing property rights or creating a separate unplanned hosting system.

### FD-106 — Handle full villages and growth choices

- [ ] **Implement:** capacity based on actual plots/expansion rather than concurrent player slots. Offer nearby expansion, other authorised villages or temporary lodging when no plot is free.
- **Complete when:** a late-joining player always sees a meaningful housing path and offline residents are not evicted to free online slots.

### FD-107 — Define camps and limited outposts

- [ ] **Implement:** allowed wilderness rest/build areas with bounded services and explicit ownership rules. Full village claims, market services and public expansion still require founding.
- **Complete when:** exploration and wilderness creativity remain possible without a cheap camp providing every settlement benefit or circumventing claims.

### FD-108 — Pass the new-village gate

- [ ] **Implement:** play through contribution eligibility, charter purchase, co-funding, failed site placement, successful founding, later joining and founder absence. Test restore and identity recovery across both settlements.
- **Complete when:** founding feels like a substantial achievement, and the original village remains useful rather than emptying as soon as players can leave.

## K — Deeper exploration and progression

### FD-109 — Add more distinct plant sound roles

- [ ] **Implement:** a bounded set of new instrument families such as percussion pods and unusual sustained tones. Give each an audible role, preview, discovery route and cultivation rule; preserve collected specimen recipes.
- **Complete when:** players want new plants for expressive possibilities rather than merely higher sale prices or cosmetic inventory clutter.

### FD-110 — Add understandable plant variation

- [ ] **Implement:** a small trait vocabulary such as brightness, attack or supported range. Keep cosmetic traits separate. Add limited predictable hybrid pairings only if base collection playtests support it, retaining viable parent seeds.
- **Complete when:** variation is previewable and useful without requiring a deep genetics system or overwhelming storage.

### FD-111 — Connect growing and listening to habitat

- [ ] **Implement:** shade, moisture, shelter and comfortable venue tags using bounded logical queries. Add hints and tools for creating suitable habitats with existing planting/building features.
- **Complete when:** players can deliberately improve a garden's suitability without losing essential species or needing maximum graphics settings.

### FD-112 — Add gentle gameplay effects from weather

- [ ] **Implement:** rain-assisted growth, sheltered listener preferences and optional repeatable discoveries. Define exactly which weather changes affect simulation and preserve authoritative time rules online.
- **Complete when:** weather creates useful choices without destructive surprises, arbitrary waiting or reward generation from owner/debug overrides.

### FD-113 — Introduce specialist gems and their uses

- [ ] **Implement:** optional reliable discovery/milestone sources and several attractive sinks, such as unusual instruments, lights, glass-like finishes or blueprints. Keep gems distinct from common construction stone.
- **Complete when:** a player understands a gem's purpose and chooses between worthwhile uses while basic homes remain gem-free.

### FD-114 — Add specialist creature barter

- [ ] **Implement:** friendship-unlocked recipes trading gems or specific resources for specialist goods. Preview exact input/output, use atomic commands and check exchange/refund cycles.
- **Complete when:** barter adds choices without becoming a mandatory intermediate step between every music gift and every building material.

### FD-115 — Add larger forest restoration projects

- [ ] **Implement:** multi-step optional projects with recognisable creature needs, objective flexible requirements, stable accepted budgets and preserved contribution receipts. Unlock new places or sounds as well as materials.
- **Complete when:** players see a permanent meaningful change and old accepted projects remain completable after content updates.

### FD-116 — Add discovery displays and personal collections

- [ ] **Implement:** specimen displays, visitor memories and named song/garden records using existing furnishings. Keep collection targets finite at the gameplay-family level while preserving optional cosmetic identity.
- **Complete when:** a home expresses the player's discoveries without requiring a public content service or mandatory completion grind.

### FD-117 — Expand navigation to a world map

- [ ] **Implement:** compact explored-area records, landmarks, shared/personal markers and known material sources. Reuse the village view and marker contracts; preserve intended audiences and hidden destinations.
- **Complete when:** players plan and share distant expeditions without exposing private markers or saving all generated terrain.

### FD-118 — Add reliable crossings and route improvements

- [ ] **Implement:** bridge/path projects using existing structures and authoritative surface queries, with water clearance and road connectivity. Extend village route validation and creature traversal where supported.
- **Complete when:** a finished crossing provides a genuinely usable route and later edits cannot strand homes or visitors.

### FD-119 — Add limited travel between established places

- [ ] **Implement:** an explicit travel network between discovered developed destinations, with world policy, permission and server-granted relocation checks. Preserve carried ownership and avoid revealing undiscovered places.
- **Complete when:** repeated errands become easier without replacing first discovery or bypassing property, movement and eligibility rules.

### FD-120 — Pass the deeper-progression gate

- [ ] **Implement:** check alternative musical styles, new habitats, weather, gems, specialist exchanges and travel together. Compare rewards and common sinks against the original loop.
- **Complete when:** old sound families and home locations remain worthwhile, and every essential path still works without trading or a rare weather window.

## L — Long-term expression and expansion

### FD-121 — Add repeatable village events

- [ ] **Implement:** player-triggered concerts, themed gatherings and shared venue projects using existing performance/project systems. Include host controls, restart recovery and recognition for listening, planting and building.
- **Complete when:** an event is enjoyable without mandatory calendar attendance, and non-musicians can make a useful contribution.

### FD-122 — Share building blueprints safely

- [ ] **Implement:** named portable designs with previews, attribution, validation and size limits. Import as plans with material quotes; keep blueprint knowledge separate from paid physical stock.
- **Complete when:** reproducing a shared design is accurate, cannot mint construction materials and leaves unrelated content intact on failure.

### FD-123 — Share compositions and garden layouts

- [ ] **Implement:** named arrangements, instrument requirements, voice entitlement checks and bounded package imports. Start with local files/trusted-room exchange; retain unrestricted creative import within technical budgets.
- **Complete when:** a recipient can preview a piece and understand what is needed to perform it in progression mode.

### FD-124 — Export finished musical creations

- [ ] **Implement:** bounded audio rendering/export from the symbolic timeline and existing instruments, with naming and attribution. Test sustain, tempo changes and resource limits rather than recording microphone output.
- **Complete when:** an exported piece matches the saved arrangement, and export failure cannot alter the world or consume stock.

### FD-125 — Add simple music-reactive mechanisms

- [ ] **Implement:** a small vocabulary of lights, fountains, timed ornaments or gates driven by musical events. Bound trigger chains and use shared transport online; keep visual effects separate from economic production.
- **Complete when:** several expressive combinations remain synchronised after reload and cannot trigger unbounded work or gifts at dense note boundaries.

### FD-126 — Add limited helpful automation

- [ ] **Implement:** bounded tending or organisational help through established devices/creature friendships. Require explicit permissions, inputs and production limits where resources are involved.
- **Complete when:** helpers reduce repetitive chores without enabling unlimited unattended seed, coin or concert-reward farming.

### FD-127 — Expand regions with new decisions

- [ ] **Implement:** additional biomes only when each introduces a meaningful sound, habitat, listener, material or project. Reuse content definitions and procedural systems; version generation and preserve collected identities.
- **Complete when:** visiting the region changes a player's options and does not require rebuilding the terrain or creature engine.

### FD-128 — Add several long-term aspirations

- [ ] **Implement:** optional collection, friendship, restoration, concert-garden and settlement goals with visible progress. Support personal and shared ambitions without making every activity compulsory.
- **Complete when:** established players have meaningful projects beyond higher item totals and can happily maintain a favourite home.

### FD-129 — Broaden optional world and creator settings

- [ ] **Implement:** explicit policies for abundant resources, more demanding gardening and advanced music workflows where demand exists. Serialise policy changes and explain effects on trading eligibility; preserve the approachable default.
- **Complete when:** modes serve identifiable preferences without silently invalidating worlds, accounts or scarce-stock rules.

### FD-130 — Verify compatibility across the expanded systems

- [ ] **Implement:** broaden earlier regression fixtures to include households, roads, listings, claims, relationships, mechanisms and mode changes. Verify migration, export/import and room restore together.
- **Complete when:** whole-world round trips preserve ownership, authored content, balances and known musical timing, including old creative fixtures.

### FD-131 — Validate realistic world and village budgets

- [ ] **Implement:** representative desktop/touch and multi-client scenarios with developed homes, gardens, roads, audiences, markers and markets. Measure frame time, audio scheduling, memory, save growth and server operations; fix measured bottlenecks.
- **Complete when:** tested limits are documented and a busy neighbourhood remains usable without changing reward logic at lower graphics quality.

### FD-132 — Pass the expanded-game acceptance gate

- [ ] **Implement:** play through newcomer joining, private home building, social performance, local trade, experienced founding and independent exploration. Verify the recovery paths and revisit actual player choices about proximity and repetition.
- **Complete when:** the complete game preserves trust and gives players reasons to return to both their garden and their neighbours. This gate expands earlier validation; it does not replace checks required at each preceding task.

## Delivery boundaries

| Gate                        | Required tasks | What must be demonstrated before moving on                                     |
| --------------------------- | -------------- | ------------------------------------------------------------------------------ |
| First complete game         | FD-001–FD-040  | A beginner turns discovery into music, a gift and a home improvement.          |
| Repeatable solo progression | FD-041–FD-047  | Another expedition and a returning visitor create a worthwhile new choice.     |
| Online progression          | FD-048–FD-058  | Concurrent clients and recovery preserve authoritative stock and state.        |
| A real village              | FD-059–FD-078  | Friends settle together, retain private ownership and improve a public street. |
| Shared musical life         | FD-079–FD-087  | Players meet and hear compatible performances with fair participation.         |
| Local economy               | FD-088–FD-099  | Items, coins, orders and public funds reconcile under interruption.            |
| Later settlement founding   | FD-100–FD-108  | A meaningful experienced-player project creates another viable village.        |
| Wider progression           | FD-109–FD-120  | New content expands choices without invalidating early play.                   |
| Long-term expansion         | FD-121–FD-132  | Expression, sharing and scale remain compatible with saves and ownership.      |

## Tasks deliberately outside this order

Combat tiers, hunger, destructive raids, fully simulated ecology, global auction houses, cross-world scarce-item transfer, public content marketplaces, massive concerts, unrestricted scripting and deep botanical genetics are not prerequisites. Add them only through a separately justified feature proposal. Do not treat their absence as a reason to postpone a complete playable loop or compact multiplayer village.

## Tracking implementation

For a completed task, check its box and add a short implementation note with changed code, relevant verification and any remaining limitation. If only part is done, leave it unchecked and identify the missing acceptance condition. Keep speculative prices, plot dimensions and performance limits labelled as tuning values until measured.

The next implementation task is **FD-001**, followed by **FD-002**. The first target is **FD-040**; the later village target is **FD-078**.
