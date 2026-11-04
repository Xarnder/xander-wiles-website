# Forest Drift — Creature Ranged Weapons: Questions and Decisions

**Feature cycle:** 2026-11-04
**Status:** **Locked (2026-11-04).** All 30 questions and follow-ups F1–F2 are answered. The technical plan ([`02-technical-plan.md`](02-technical-plan.md), revision 2) and the brief have been updated to match. **No implementation until you approve the plan in chat.**
**Related:** [`00-brief.md`](00-brief.md) · [`02-technical-plan.md`](02-technical-plan.md)

---

## How this was answered

Answered through the in-chat form on 2026-11-04, because Markdown previews can't tick boxes. Every question was answered individually. Four answers override the recommended default (**Q3, Q4, Q6, Q16**), and two of those raised follow-ups (F1, F2), which are recorded at the end.

Status labels below each question show how the question was _classified_ before answering. The `Locked 2026-11-04` tag on each answer is the decision.

## Locked decision summary

| Q   | Topic                                   | Decision                                                                                       | vs default  |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| Q1  | Tone and what the projectile looks like | **A** — Seed pellets in the creature's accent colour, soft puff                                | Same        |
| Q2  | Which creatures can be carried          | **A** — Quadrupeds ≤ 0.9 m tall                                                                | Same        |
| Q3  | Regions with no small quadruped         | **C** — Force one per region; existing worlds' fauna changes (F1)                              | **Changed** |
| Q4  | Ambient vs Lab-placed creatures         | **C** — Both; a placed creature's new position is saved, online via the op feed (F2)           | **Changed** |
| Q5  | Single-player behaviour                 | **A** — Carry and fire; no damage targets                                                      | Same        |
| Q6  | Effect on other creatures               | **A** — No effect; projectiles pass through creatures                                          | **Changed** |
| Q7  | Pick up / put down control              | **A** — `K` toggles                                                                            | Same        |
| Q8  | Fire control and punching               | **A** — Left click fires instead of punching; holding repeats                                  | Same        |
| Q9  | Damage per hit                          | **A** — 3 points (12 hits)                                                                     | Same        |
| Q10 | Fire rate and ammo model                | **B** — 5 charges, 350 ms gap, +1 per 1.5 s                                                    | Same        |
| Q11 | Projectile flight                       | **B** — 35 m/s, light gravity                                                                  | Same        |
| Q12 | Maximum range                           | 30 m                                                                                           | Same        |
| Q13 | Who decides a hit                       | **A** — Shooter detects, room validates                                                        | Same        |
| Q14 | Walls and cover                         | **A** — Browser-only line of sight; risk accepted and documented                               | Same        |
| Q15 | World rule toggle                       | **A** — Separate "Creature projectiles" rule, on by default                                    | Same        |
| Q16 | Roles                                   | **Everyone, including viewers**, can carry and fire (placed creatures need edit rights online) | **Changed** |
| Q17 | Exclusive carrying online               | **A** — Room arbitrates; carried creature leaves every herd                                    | Same        |
| Q18 | Where a released creature goes          | **A** — At your feet, then wanders                                                             | Same        |
| Q19 | Automatic put-down and stowing          | As proposed                                                                                    | Same        |
| Q20 | Carry limit                             | One at a time                                                                                  | Same        |
| Q21 | Movement while carrying                 | **A** — No penalty                                                                             | Same        |
| Q22 | First-person presentation               | **A** — Creature visible lower-left                                                            | Same        |
| Q23 | Creature animation while carried        | Breathing + head recoil; no jaw                                                                | Same        |
| Q24 | Sounds                                  | **C** — Reuse hit sound, synthesise the rest                                                   | Same        |
| Q25 | Death card and damage source            | `projectile` source; "Knocked out by Name's {species}"                                         | Same        |
| Q26 | Aim assist on touch                     | **A** — None; generous 0.45 m hit radius                                                       | Same        |
| Q27 | Protocol bump and deploy                | v6; Worker then site; kill switch                                                              | Same        |
| Q28 | Delivery phases                         | **A** — Phased (now five phases, see F2)                                                       | Same        |
| Q29 | Ability registry now or later           | **A** — Small registry now                                                                     | Same        |
| Q30 | Help, prompts and tutorial              | **A** — Help entries + contextual prompt                                                       | Same        |
| F1  | Q3 follow-up                            | Yes, change existing worlds                                                                    | —           |
| F2  | Q4 follow-up                            | Placed creatures are shared and moved through the world op feed                                | —           |

---

## A. Scope and feel

### Question 1: Tone and projectile look (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Forest Drift is described as a _relaxing_ exploration game, and the 2026-10-22 implementation order says combat should come only "through a separately justified feature proposal". This document is that proposal. How the shot looks decides whether it feels like a playful snowball fight or like violence against animals. Get it wrong and the feature clashes with the music, garden and creature-friendship plans (FD-022–FD-029), and changing it later means redoing the art, sounds and copy.
- **Recommended Default**: **A**. Soft seed pellets tinted with the creature's palette accent colour, bursting into a small puff of leaves or pollen. "Knocked out" stays as the wording. No blood, gore or creature distress.
- **Options**:
  - [x] A — Seed pellets / berries in the creature's accent colour, soft puff on impact (recommended)
  - [ ] B — Water spit / bubbles (splash on impact)
  - [ ] C — Glowing energy bolts (more "game-like", less natural)
  - [ ] D — Different per species, derived from palette and features (more work; varies more)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — Seed pellets / berries in the creature's accent colour, soft puff on impact `Locked 2026-11-04`

### Question 2: Which creatures can be carried (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: "Small quadruped" needs an exact, deterministic rule that the browser and the room evaluate the same way. In the code, ambient population heights come in bands. The smallest is **0.55–0.8 m** (`REGION_HEIGHT_BANDS` in `CreaturePopulationSystem.ts`), and that band's body plan is random: quadruped, hexapod, biped or serpentine. If the rule is too loose, players carry animals as tall as their waist and it looks wrong. If it's too strict, eligible creatures are rare and the feature is hard to find.
- **Recommended Default**: **A**. `bodyPlan.id === 'quadruped'` and standing height (from `creatureDimensions`) ≤ 0.9 m, so the smallest band plus margin.
- **Options**:
  - [x] A — Every quadruped ≤ 0.9 m tall (recommended)
  - [ ] B — A deterministic subset of those (for example, only species with a muzzle or a "spitter" trait), so it's a rarer find
  - [ ] C — Every creature ≤ 0.9 m of any body plan (hexapods, small bipeds, serpents too)
  - [ ] D — Quadrupeds up to 1.65 m (include the second band; looks oversized under the arm)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — Every quadruped ≤ 0.9 m tall `Locked 2026-11-04`

### Question 3: Regions with no small quadruped (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Each 512 m region chooses its six species by seeded draws. Some regions will have no small quadruped at all. The only way to guarantee one is to change `regionSpecies`, and that changes the species draw order, which **changes the fauna of every existing world** (the docs call draw order "part of identity"). If we don't change it, some areas just don't have weapons, which could be good, because it sends players exploring.
- **Recommended Default**: **A**. Accept the gaps and leave generation alone.
- **Options**:
  - [ ] A — Accept it; some regions have none (recommended)
  - [ ] B — Add a separate, new seeded "companion" species stream per region that is always a small quadruped (keeps existing species, adds extra animals)
  - [x] C — Change `regionSpecies` to force one (breaks existing worlds' fauna)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **C — Force one per region**, changing existing worlds (confirmed in follow-up F1). Overrides the recommended default. `Locked 2026-11-04`

### Question 4: Ambient vs Lab-placed creatures (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Ambient creatures have deterministic ids (`group:{seed}:{cellX}:{cellZ}:{slot}:{member}`), and their recipe can be rebuilt from the world seed alone. So the room and other clients can identify and draw a carried one without receiving its whole genome. Creatures placed in the Lab are saved world content (`PersistentCreatureDefinition`, ids `placed_…`). Picking one up and putting it down elsewhere would **edit saved content**. That needs saving support, undo, and, online, the world op feed, which currently leaves creatures out on purpose (`ThreeScene.sharedWorldPort`).
- **Recommended Default**: **A**. Ambient only in v1.
- **Options**:
  - [ ] A — Ambient creatures only (recommended)
  - [ ] B — Ambient + placed in single player only; placed snap back to their saved spot when put down
  - [x] C — Both, with the placed creature's new position saved (needs op-feed work online)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **C — Both, with the placed creature's new position saved**; online it goes through the world op feed (follow-up F2). Overrides the recommended default. `Locked 2026-11-04`

### Question 5: Single-player behaviour (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: The damage target is "other players", so single player has nobody to hurt. Letting players carry and fire there anyway makes the feature easy to find and practise, and it's how most of Phase 1 gets tested. Turning it off offline makes the feature invisible to most players.
- **Recommended Default**: **A**.
- **Options**:
  - [x] A — Carry and fire in single player; shots splat on terrain and buildings, no damage (recommended)
  - [ ] B — Carry in single player, fire only online
  - [ ] C — The whole feature is online-only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — Carry and fire in single player; shots splat on terrain and buildings, no damage `Locked 2026-11-04`

### Question 6: Effect of projectiles on other creatures (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Creatures have no health, and their behaviour runs separately on each client (Multiplayer Q9-A). Damaging creatures would need creature health and shared creature simulation, which is a large new system. A local "startle" uses the existing `FLEE` state and is cheap, though two players may see different reactions.
- **Recommended Default**: **B**.
- **Options**:
  - [x] A — No effect; projectiles pass through creatures
  - [ ] B — Creatures within ~3 m of an impact flee (local only, cosmetic) (recommended)
  - [ ] C — Projectiles hit creatures and they flee (needs per-creature hit tests)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A — No effect**; projectiles pass through creatures. Overrides the recommended default (B). `Locked 2026-11-04`

---

## B. Controls

### Question 7: Pick up / put down control (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: `K` is already the contextual interact key: sit on Mini Builds, open and close doors (`MiniBuildInteractionRuntime.ts`, the door prompt in `+page.svelte`). Another key adds more to learn, but sharing `K` means deciding what wins when a chair and a creature are both in reach. Mouse buttons are taken: left punches, and right cancels while building. `E`, `F`, `G`, `Q`, `R` and `B` already mean things in various modes.
- **Recommended Default**: **A**. `K` toggles. When several targets are in reach, the one nearest the crosshair wins, the same rule `chooseInteraction` uses. Touch: the existing contextual interact button shows "Pick up" / "Put down".
- **Options**:
  - [x] A — `K` picks up and puts down (recommended)
  - [ ] B — A new dedicated key (please name it in the box)
  - [ ] C — Hold `K` for 0.4 s to pick up (stops accidental pick-ups next to chairs and doors)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — `K` picks up and puts down `Locked 2026-11-04`

### Question 8: Fire control and punching (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: In normal mode, left click is the punch today (`ThreeScene.handlePunchMouseDown`). Something has to give while carrying. If holding the button repeats, players don't have to click rapidly, which helps with accessibility, but it makes holding down fire an easy default.
- **Recommended Default**: **A**.
- **Options**:
  - [x] A — While carrying, left click fires instead of punching; holding fires again whenever a charge is ready (recommended)
  - [ ] B — Left click fires, each shot needs a new click; no punching while carrying
  - [ ] C — Right click fires, left click still punches
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — While carrying, left click fires instead of punching; holding fires again whenever a charge is ready `Locked 2026-11-04`

---

## C. Balance

### Question 9: Damage per hit (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Health is 36 points with regeneration (1 point per 3 s, starting 8 s after the last hit). A punch does 2 points every 500 ms at most, about 4 points/s at 2.5 m. Ranged damage is safer for the attacker, so if it does as much damage per second as punching, it takes over. If it does too little, it feels pointless next to regeneration.
- **Recommended Default**: **A**. 3 points: 12 hits from full, about 3.3 points/s at the recommended fire rate (Q10). That's slightly below punching, at range.
- **Options**:
  - [x] A — 3 points (12 hits from full) (recommended)
  - [ ] B — 4 points (9 hits)
  - [ ] C — 2 points (18 hits, same as a punch)
  - [ ] D — 6 points (6 hits; very lethal)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — 3 points (12 hits from full) `Locked 2026-11-04`

### Question 10: Fire rate and ammo model (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: The room has to enforce the rate, so it needs a model it can check cheaply. With unlimited ammo and only a cooldown, the game is simple but encourages holding the button down. Charges add rhythm and a reason to pause, and the HUD needs pips. "The creature gets tired and runs away" is the most flavourful option, but it adds state the room must track per creature.
- **Recommended Default**: **B**. 5 charges. 1 shot uses 1 charge, with at least 350 ms between shots. A charge comes back every 1.5 s. Charges belong to the **player's carry**: they reset to full on each pick-up, and the room tracks them, timestamped like health regeneration (no timers).
- **Options**:
  - [ ] A — Cooldown only (one shot per 900 ms, unlimited)
  - [x] B — 5 regenerating charges, 350 ms minimum gap, +1 charge per 1.5 s (recommended)
  - [ ] C — Fixed shots per creature (e.g. 10), then it wriggles free and runs off
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **B** — 5 regenerating charges, 350 ms minimum gap, +1 charge per 1.5 s `Locked 2026-11-04`

### Question 11: Projectile flight (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: This decides whether hits take skill, whether shots can be dodged, and how hard the room's plausibility check is. Hitscan (instant) is the simplest and easiest to keep cheat-resistant, but it's invisible and impossible to dodge. Slow arcs look lovely but are hard to aim at range, and with pose lag (≈100–200 ms) they're unfair to the target.
- **Recommended Default**: **B**. 35 m/s, gravity 4 m/s² (a quarter of normal), a visible pellet, a 0.12 m collision radius, removed after 30 m or 1.2 s.
- **Options**:
  - [ ] A — Fast and straight (50 m/s, no gravity)
  - [x] B — Fast with a light arc (35 m/s, light gravity) (recommended)
  - [ ] C — Hitscan with a cosmetic tracer (instant)
  - [ ] D — Slow lob (15 m/s, full gravity)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **B** — Fast with a light arc (35 m/s, light gravity) `Locked 2026-11-04`

### Question 12: Maximum range

- **Status**: `Recommended default`
- **Why it matters**: Range interacts with how far away remote avatars are drawn and with pose interpolation lag. The further the shot, the more the shooter's view of the target differs from the room's, so the room needs more slack, and more slack means more room for cheats. Range also sets the HUD "out of range" cue and the room's distance check.
- **Recommended Default**: 30 m. The projectile is removed after 30 m of travel. The room accepts hits where the target's feet were within 30 m + 3 m of lag slack of the shot origin.
- **Your Answer**: 30 m (recommended default accepted). `Locked 2026-11-04`

---

## D. Multiplayer authority and fairness

### Question 13: Who decides a hit (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: The room (`RoomCore`, a Cloudflare Durable Object) has player poses but **no terrain or building geometry**, so it can't simulate projectiles against the world. Punching already works by having the shooter's browser choose the target and the room check plausibility from poses. If the room simulated hits, players would see shots that clearly connected get refused because the room's view lags by 100–200 ms. Trusting the client completely makes cheating trivial.
- **Recommended Default**: **A**.
- **Options**:
  - [x] A — The shooter's browser detects the hit against what it sees; the room validates timing, distance, direction and state (same model as punching) (recommended)
  - [ ] B — The room simulates projectiles against poses only (ignores terrain and walls; more cheat-resistant, feels laggier)
  - [ ] C — Trust the client completely (fastest to build; no protection)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — The shooter's browser detects the hit against what it sees; the room validates timing, distance, direction and state (same model as punching) `Locked 2026-11-04`

### Question 14: Walls and cover (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: The honest browser stops projectiles at terrain and buildings. The room can't check that (no geometry, see Q13), so a **modified client could shoot through walls**. Punching has the same gap, but at 2.5 m it barely matters. At 30 m it does. Giving the room geometry means bundling terrain height sampling and building colliders into the Worker: a large, risky piece of work and extra CPU per shot.
- **Recommended Default**: **A**. Accept the risk for v1: rooms are invite-based and owners can turn the rule off. Write it down as a known limit, and log `shotHitsAccepted` per attacker so abuse is visible.
- **Options**:
  - [x] A — Line of sight checked only in the browser; accept and document the risk (recommended)
  - [ ] B — Room checks terrain height along the path only (bundle the deterministic `TerrainHeightSampler` into the Worker; buildings still unchecked)
  - [ ] C — Full room-side geometry (terrain + buildings) before shipping; adds weeks
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — Line of sight checked only in the browser; accept and document the risk `Locked 2026-11-04`

### Question 15: World rule toggle (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: The owner already has **Rules → Health → Player damage (punching)** (`rules.playerDamage`, on by default). Some owners will want punching but not shooting, or the other way round. A separate switch costs one field in `SharedEnvironment.rules` and one settings row. Sharing the switch is simpler but less flexible.
- **Recommended Default**: **A**.
- **Options**:
  - [x] A — Separate rule "Creature projectiles", on by default (recommended)
  - [ ] B — Separate rule, off by default (owners opt in)
  - [ ] C — Reuse the existing Player damage rule for both
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — Separate rule "Creature projectiles", on by default `Locked 2026-11-04`

### Question 16: Roles

- **Status**: `Safe to decide now`
- **Why it matters**: Viewers can't punch today (`RoomCore.handlePunch`). If viewers could carry, they could take creatures away from players who can fight, while being unable to take part themselves.
- **Recommended Default**: Owners and editors can carry and fire. Viewers can do neither, and they still see carriers and shots.
- **Your Answer**: **Everyone, including viewers**, can carry ambient creatures and fire. Overrides the recommended default. (Placed creatures still need edit rights online, because putting one down is a world edit; see F2.) `Locked 2026-11-04`

### Question 17: Exclusive carrying online (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Each client simulates ambient creatures on its own (Q9-A), so the "same" creature can be standing in different places for different players. If carrying isn't arbitrated, two players can pick up the same animal and both carry it, and the herd still shows it walking around. That makes the feature look broken.
- **Recommended Default**: **A**. The room keeps `creatureId → carrier slot`. The first valid claim wins. Every client hides its local copy of a carried creature and draws it under the carrier's arm, rebuilding the recipe from the id.
- **Options**:
  - [x] A — Room arbitrates; carried creatures disappear from herds and appear under the carrier's arm for everyone (recommended)
  - [ ] B — No arbitration; others see a copy under the arm and the herd copy keeps wandering
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — Room arbitrates; carried creatures disappear from herds and appear under the carrier's arm for everyone `Locked 2026-11-04`

### Question 18: Where a released creature goes (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: After release, the creature goes back into each client's local simulation, so positions will drift apart again. Putting it down where the carrier stands is what players expect. Sending it back to its herd's home spot is tidier but looks like teleporting. If the carrier has walked far, the creature's home cell may not even be loaded on other clients.
- **Recommended Default**: **A**. It's put down at the carrier's feet (or the knocked-out spot). Each client re-adds it to the local simulation there, where it can return to its group with the existing `RETURN_TO_GROUP` behaviour. When its cell later unloads and reloads, it regenerates at home, as ambient creatures already do.
- **Options**:
  - [x] A — At the carrier's feet, then it wanders/returns naturally (recommended)
  - [ ] B — Straight back to its herd's home spot
  - [ ] C — It runs away from the carrier (FLEE) for a few seconds, then returns
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — At the carrier's feet, then it wanders/returns naturally `Locked 2026-11-04`

### Question 19: Automatic put-down and stowing

- **Status**: `Recommended default`
- **Why it matters**: Many existing states conflict with carrying: knocked out, seated, flying, building and global modes (remove, paint, move, music), underwater, disconnect, leaving, and switching worlds. Each one needs a defined result. Otherwise a creature stays stuck to a seated player, or someone fires from a chair.
- **Recommended Default**:
  - **Put down automatically:** knocked out, entering a sit/lie interaction, disconnect or leave (the room releases it after the existing 30 s grace if the player doesn't come back), world switch or reload.
  - **Kept but stowed (can't fire):** build mode or any global mode, flying (same as punching), head underwater, pause menu open.
  - **Allowed:** walking, running, jumping, swimming at the surface, third person.
- **Your Answer**: Accepted as proposed. `Locked 2026-11-04`

### Question 20: Carry limit

- **Status**: `Safe to decide now`
- **Why it matters**: One arm, one creature. More than one complicates the view, the network state and the balance.
- **Recommended Default**: One creature at a time. `K` on another creature while carrying does nothing; the player has to put the first one down.
- **Your Answer**: One at a time (default accepted). `Locked 2026-11-04`

### Question 21: Movement while carrying (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: A speed penalty makes the attacker an easier target and balances range against melee, but it makes the relaxing game feel heavier. Turning off running is a middle ground.
- **Recommended Default**: **A**.
- **Options**:
  - [x] A — No penalty (recommended)
  - [ ] B — 15% slower walk and run
  - [ ] C — Can't run while carrying
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — No penalty `Locked 2026-11-04`

---

## E. Presentation and accessibility

### Question 22: First-person presentation (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: In first person the player's body isn't drawn today. `PlayerInteractionView` only shows the character in third person or during interactions. Showing the creature in view means a camera-attached skinned mesh: one extra draw, plus clipping and lighting problems near the camera. Showing nothing makes it unclear that you're carrying anything, and the shot appears to come from nowhere.
- **Recommended Default**: **A**. A scaled-down copy of the creature in the lower-left of the view (left arm), with its head toward the crosshair. Shots visibly leave its mouth. Drawn without shadows, and hidden when the camera is pressed against a wall.
- **Options**:
  - [x] A — Creature visible in the lower-left corner of the view (recommended)
  - [ ] B — Only its head poking in from the left edge
  - [ ] C — Nothing in first person; an icon on the HUD only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — Creature visible in the lower-left corner of the view `Locked 2026-11-04`

### Question 23: Creature animation while carried

- **Status**: `Safe to decide now`
- **Why it matters**: The creature rig has a `head` joint but no jaw bone (the muzzle is geometry), so "mouth opens" would need compiler changes. A still creature under the arm looks like a prop.
- **Recommended Default**: Idle breathing, a slow tail sway, and the head turning toward the crosshair. On each shot, a quick head recoil (80 ms) and a small puff at the muzzle tip. No jaw animation in v1. With reduced motion: no recoil, the puff is kept.
- **Your Answer**: Breathing, tail sway, head look and recoil; no jaw (default accepted). `Locked 2026-11-04`

### Question 24: Sounds (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: `assets/Audio/` has `punch-hit-sound.mp3`, `knocked-out.mp3` and `rain.mp3`, and nothing for firing, impacts or pick-up. Sourcing new files raises licensing questions and adds download size. WebAudio synthesis is free but has never been heard by a person (the landing thud is still unverified).
- **Recommended Default**: **C**.
- **Options**:
  - [ ] A — Synthesise everything with WebAudio
  - [ ] B — You supply licensed mp3s (fire "pfft", impact puff, pick-up chirp)
  - [x] C — Reuse `punch-hit-sound.mp3` for player hits, synthesise fire, impact and pick-up (recommended)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **C** — Reuse `punch-hit-sound.mp3` for player hits, synthesise fire, impact and pick-up `Locked 2026-11-04`

### Question 25: Death card and damage source

- **Status**: `Safe to decide now`
- **Why it matters**: `DamageSource` currently has `fall` and `player`. Recording the projectile as its own kind lets the death card, sounds and later statistics tell a punch from a shot.
- **Recommended Default**: Add `{ kind: 'projectile'; by: number; species: string }`. Death card: "You were knocked out by Name's {species name}". Same vignette and thud as a punch.
- **Your Answer**: Accepted: new `projectile` damage source; "You were knocked out by Name's {species}". `Locked 2026-11-04`

### Question 26: Aim assist on touch (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Aiming by dragging a thumb is much harder than with a mouse. Aim assist makes touch fairer but can feel like cheating to mouse players, and the room can't tell assisted aim from cheating anyway.
- **Recommended Default**: **A**.
- **Options**:
  - [x] A — No aim assist; generous 0.45 m body radius for everyone (recommended)
  - [ ] B — Light aim slowdown near players, touch only
  - [ ] C — Light aim magnetism toward players within 3°, touch only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — No aim assist; generous 0.45 m body radius for everyone `Locked 2026-11-04`

---

## F. Delivery

### Question 27: Protocol bump and deploy

- **Status**: `Safe to decide now`
- **Why it matters**: New message types change the wire protocol. A client and Worker on different versions must refuse each other cleanly ("Please refresh the game"), as the v5 rollout did.
- **Recommended Default**: `PROTOCOL_VERSION = 6`. Deploy the Worker first, then the site, in the same window. A `RANGED_WEAPONS_ENABLED` constant hides the feature on the client for a fast rollback.
- **Your Answer**: Accepted: protocol v6, Worker then site, `RANGED_WEAPONS_ENABLED` kill switch. `Locked 2026-11-04`

### Question 28: Delivery phases (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: The multiplayer half (arbitration, validation, protocol) carries most of the risk. Shipping single-player carrying first lets the controls and visuals be tuned before the hard part. Shipping all at once avoids a protocol bump in the middle of the feature.
- **Recommended Default**: **A**. Four phases (brief §8), one protocol bump in Phase 2 that already includes the Phase 3 messages, so only one coordinated deploy is needed.
- **Options**:
  - [x] A — Four phases: single player → online carry → online damage → polish (recommended)
  - [ ] B — One release with everything
  - [ ] C — Single-player phase only for now; online later
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — Four phases: single player → online carry → online damage → polish `Locked 2026-11-04`

### Question 29: Ability registry now or later (Multiple Choice)

- **Status**: `Safe to decide now`
- **Why it matters**: You said different creatures will have different abilities. A small registry (eligibility rule + ability id + parameters) now costs about a day and stops `if (quadruped && small)` checks spreading through the UI, the room and the renderer. A big framework now would be guessing at needs nobody has yet.
- **Recommended Default**: **A**.
- **Options**:
  - [x] A — Small pure registry with one ability (`mouth-projectile`) (recommended)
  - [ ] B — Hard-code it now, refactor when the second ability arrives
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — Small pure registry with one ability (`mouth-projectile`) `Locked 2026-11-04`

### Question 30: Help, prompts and tutorial (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Players can't find carrying without being told. The Help overlay and `ControlsGuide.svelte` list every control today. A full tutorial (`tutorials.ts`, speech + subtitles) is much more work.
- **Recommended Default**: **A**.
- **Options**:
  - [x] A — Help overlay + ControlsGuide entries, and the contextual "[K] Pick up {species}" prompt (recommended)
  - [ ] B — A + a one-time hint the first time an eligible creature is in reach
  - [ ] C — B + a short spoken tutorial in the tutorials system
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **A** — Help overlay + ControlsGuide entries, and the contextual "[K] Pick up {species}" prompt `Locked 2026-11-04`

---

## Follow-ups raised by the answers

### Follow-up F1: Forcing a small quadruped changes existing worlds

- **Status**: `Needs user answer`
- **Why it matters**: Q3 C changes `regionSpecies`, so the animals in existing single-player saves and published online worlds change, possibly near players' homes.
- **Options**:
  - [x] Yes, change existing worlds
  - [ ] Companion stream instead (extra species, existing ones unchanged)
  - [ ] New worlds only (new generator version)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **Yes, change existing worlds.** `Locked 2026-11-04`
- **How the plan limits the change**: the smallest band (index 0) keeps its `rng()` plan draw but overrides the result to `quadruped`. Every other draw is unchanged, so only the smallest species changes, and only in regions where it wasn't already a quadruped (about 3 in 5, since 2 of the 5 plan slots are quadrupeds). Herd placement, larger species and colours elsewhere stay the same.

### Follow-up F2: Placed creatures in online worlds

- **Status**: `Needs user answer`
- **Why it matters**: Online worlds don't contain placed creatures today. `AuthoredContent` and the entity rows in `worldEntities.ts` leave creatures out, and `ThreeScene.sharedWorldPort` excludes them from the content revision. Saving a moved placed creature online first needs placed creatures to become shared content.
- **Options**:
  - [x] Through the world op feed
  - [ ] Single player only
  - [ ] Not carryable online
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: **Through the world op feed.** `Locked 2026-11-04`
- **Consequences recorded in the plan**:
  - New top-level entity kind `creature` (recipe, position, heading) in `worldEntities.ts`, with publish, `welcome` and op-feed support. Placing a creature in the Lab online becomes an `add` op.
  - Putting a placed creature down is an `update` op, so it follows edit permissions: **viewers can carry ambient creatures but not placed ones** (Q16 + F2).
  - Moving a placed creature is not added to the build undo history.
  - This is a new phase in the plan (Phase 2b), before online carrying of placed creatures.

## Anything else?

- **Other notes or constraints**: <input type="text" placeholder="Type anything the questions above missed" style="width: 100%;">
