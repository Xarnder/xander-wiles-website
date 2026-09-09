# Procedural creature ecosystem v1

The persistent animal is a versioned species recipe, individual variation and world state. No generated vertices, bones, textures, colliders or animation state enter world saves. This is an original implementation built for Forest Drift; no external creature generator, schema or assets are used.

## Architecture and shared contracts

`CreatureTypes.ts` establishes renderer-independent species/individual genomes, four body plans, parent-local semantic joints, swept body volumes, feature attachments, numeric compiled geometry, movement intent, spawn identity and persistent overrides. Coordinates are +Y up, +Z forward, +X right, with a logical ground root. `generatorVersion: 1` selects the current grammar; unsupported versions are rejected.

Implementation workstreams covered genomes/persistence, skeletons/geometry/skinning, procedural animation, ecology/behaviour/spatial indexing and settings. The integrating agent established contracts, reviewed the quadruped proof before ecology, built the Lab/runtime/world integration, and conducted browser and performance verification. The quadruped milestone compiled 100 seeds; animation validation covered 25 different quadrupeds before the other grammars were added.

`SpeciesGenerator` chooses a dominant silhouette strategy (long-legged, round, long-bodied or large-headed), signature feature, complementary palette and correlated anatomy. Dimensions are reference metres, including approximately 0.12–25 m stature. `IndividualGenerator` makes bounded changes to size, proportions, palette, feature asymmetry and behaviour. Species identity remains recognizable. The existing named seeded RNG supplies every persistent procedural decision. Individual `sizeFactor` multiplies reference dimensions; `scaleRange` bounds that multiplier.

## Compiler and animation

The quadruped has pelvis/chest limb pairs, spine, neck, head and tail. The upright biped has its own pelvis-to-chest axis, alternating legs and independent arms. Hexapods have three pairs around abdomen/thorax. Serpents use an 8–24 joint axial chain. Parent-local logical joints are converted into real `THREE.Bone`, `THREE.Skeleton` and one merged `THREE.SkinnedMesh` per creature.

Body masses and limbs are indexed swept cross-sections along interpolated skeletal paths. Transported frames prevent arbitrary tail/neck twisting. Vertex normals, UVs, colours and up-to-four-slot normalized skin influences are generated numerically. Weights blend adjacent chain joints. Eyes, ears, horns, antennae, spikes, fins, frills, plates, feet and tail tips attach to semantic joints with bilateral placement and controlled asymmetry. Deterministic vertex colours provide solid, gradient, belly, stripe, spot, band and limb-tip patterns. Materials use no texture assets.

LOD0 and LOD1 regenerate the same anatomy with different cross-section detail. Typical tested creatures stay below 8,000 triangles; rigid features use fewer axial sections than deforming limbs. Materials are reference-counted, numeric geometry is kept separate from renderer allocation, and disposal releases geometry, skeleton textures and materials. The Lab isolates its materials from the world's shadow-shader configuration.

Animation directly evaluates semantic bones; there are no per-animal mixers or baked clips. Quadrupeds use phased walking, bipeds counter-swing their arms, hexapods alternate tripod groups, and serpents carry a travelling curvature wave. Idle breathing, head tracking, turn lean and tail sway share the rig. Lightweight two-bone leg IK samples existing world surfaces and preserves segment lengths. Unreachable terrain is clamped rather than stretching a limb. Root height follows terrain, and compiled ground offsets prevent size changes from burying the body.

## Ecology, behaviour and runtime

Species derive from world seed, 512-m ecology region and species slot. Population candidates derive from 64-m world cells, independent of rendered terrain chunks. Weighted size tiers keep giants rare. Social species spawn related individuals in loose groups. Regenerating a cell reproduces the same identities and recipes; leaving does not add ambient records to the save.

The explicit state machine supports IDLE, WANDER, LOOK, APPROACH, FLEE and RETURN_TO_GROUP. Decisions run at 2–5 Hz nearby and more slowly at distance; movement is separate from bone posing. Seek/arrive, bounded wandering, separation, cohesion and player awareness generate intent. Terrain and building probes reject unsafe targets and movement substeps; no combat or navmesh is added. `CreatureSpatialIndex` supplies neighbour queries. `CreatureEventBus` is an extension seam for future discovery/sound interactions.

`CreatureRuntimeManager` keeps a bounded population window. Only selected visible creatures receive live meshes. Quality budgets are centralized beside graphics presets: LOW 16, MEDIUM 25, HIGH 40 and ULTRA 50 maximum live creatures, further capped by the world setting (40 by default). Tiny animals disappear sooner; large animals can remain visible hundreds of metres away. Near rigs update each frame, medium rigs around 10 Hz, far rigs around 2.5 Hz. New compilation is limited to one creature per frame. New visuals grow in over 0.35 seconds after logical creation. Nearby shadow use follows the graphics preset. Coarse scaled body collision shapes keep player collision independent of skinned triangles.

World schema 5 introduced creature settings and persistent recipe overrides; later schema 6 adds furniture independently. Ambient creatures are regenerated. Lab-placed creatures are persistent and survive save/reload. The validator caps persistent overrides at 1,000, rejects runtime fields and conflicting/duplicate recipes, and preserves earlier music/building migrations.

## Creature Lab and verification

Open Creature Lab from the game or Creature settings. Change species/individual seeds, body plan, scale and LOD; orbit or select front/side/top views; inspect wireframe, skeleton, collision, body chains, anchors and skin weights. GENERATE 100 compiles and disposes samples and reports validation/geometry/time statistics. Place in world persists the recipe. Creature settings also expose population density, active cap, debug controls and a deterministic five-species demo (small curious herd, tall shy herd, low fast hexapod, slow serpent and rare giant). Demo fauna is a development fixture, not the production distribution.

Unit coverage includes deterministic fingerprints, 400 species and 4,000 bounded individuals, 175 morphology seeds and 100 animated anatomies, hierarchy/mirroring, skin normalization, finite CPU-skinned vertices, limb lengths, loop continuity, all body plans and LODs. Ecology tests cover regeneration, negative cells, behaviour transitions, bounded movement, terrain/building rejection, separation, spatial queries and event cleanup. Persistence tests cover migrations, snapshots and malformed recipes. Browser tests exercise all four Lab plans, 100-seed generation, placement/save/reload, streaming/return and graphics budgets.

## Measured stress scene

Measured in headless Chromium on the development host, 9 September 2026. Mixed body plans at LOD0, one draw per creature, one isolated Lab render pass, 45 measured frames; the world renderer is paused. Values are indicative, not a hardware-independent frame-rate guarantee. CPU time covers JS animation/behaviour/render submission; FPS includes GPU and browser frame pacing. Reported JS heap is the browser's coarse total-page estimate, not incremental creature memory.

| Creatures | Compile total ms |  FPS | CPU ms/frame | Animation ms/frame | Behaviour ms/frame | Draws | Triangles | Reported heap MB |
| --------: | ---------------: | ---: | -----------: | -----------------: | -----------------: | ----: | --------: | ---------------: |
|        10 |             26.7 | 55.3 |         0.50 |               0.24 |              0.027 |    10 |    53,712 |             31.2 |
|        25 |             45.5 | 27.5 |         0.70 |               0.30 |              0.036 |    25 |   132,264 |             31.2 |
|        50 |             90.3 | 14.9 |         1.28 |               0.64 |              0.038 |    50 |   261,672 |             31.2 |
|       100 |            215.7 |  7.5 |         2.54 |               1.22 |              0.102 |   100 |   525,384 |             31.2 |

The 100-creature scene is an intentional overload, not the production budget. Rendering dominates this stress result; normal play uses live-count caps, reduced distant geometry, reduced pose rates and limited shadows. Pure compilation averages about 2 ms per creature here, so a bounded main-thread queue is used rather than adding worker complexity prematurely.

## Limits and next milestone

Body volumes overlap at anatomical junctions rather than sharing a welded surface. They are smooth swept masses, but some poses expose seams. Basic terrain IK cannot negotiate steep ledges or steps gracefully. Coarse collision is intentionally conservative. Ambient individuals reset transient behaviour when their cells regenerate; persistent creatures retain recipe/position/state but not full simulation history. There is no indoor pathfinding, taming, breeding, combat, procedural fur or sound.

The next milestone should focus on welded shoulder/hip junctions, planted-foot stance intervals and turn-aware foot trajectories, followed by profiling real walking scenes on representative hardware. Geometry caching or worker compilation should follow measured need without weakening individual identity.
