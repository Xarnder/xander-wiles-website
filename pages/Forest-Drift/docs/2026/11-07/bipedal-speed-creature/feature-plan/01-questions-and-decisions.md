# Forest Drift — Riding Bipedal Creatures: Questions and Decisions

**Feature cycle:** 2026-11-07
**Status:** **Locked (2026-11-07).** All 28 questions and follow-ups F1–F2 are answered. The brief and technical plan (revision 2) are updated to match. **No implementation until you approve the plan in chat.**
**Related:** [`00-brief.md`](00-brief.md) · [`02-technical-plan.md`](02-technical-plan.md)

---

## How this was answered

Answered in chat on 2026-11-07, one question at a time. Four answers differ from the recommended default (**Q3, Q12, Q15, Q20**). Q12 raised two follow-ups (F1, F2), which are recorded at the end.

The status labels show how each question was _classified_ before you answered. The **Answer** line under each question is the decision.

## Locked decision summary

| Q | Topic | Decision | vs default |
| --- | --- | --- | --- |
| Q1 | Your cut-off sentence "Look at how the." | Use the quadruped (carry) system as the model, but adapt the architecture for the biped sit-on-top pose and fast walking | Same intent |
| Q2 | Who steers | **A**: you steer with WASD relative to the camera, Shift sprints | Same |
| Q3 | Ride speed | **B**: bigger is faster. Sprint goes from 1.2× run (smallest) to 1.5× run (giants), and cruise is about 85% of sprint | **Changed** |
| Q4 | One shoulder vs both | **A**: 3.5 m standing height | Same |
| Q5 | Which shoulder on large bipeds | **A**: always the right | Same |
| Q6 | Size limit | Every biped, 1.2 m to 26 m | Same |
| Q7 | Bipeds aren't in every region | **A**: leave the fauna as is | Same |
| Q8 | Mount and dismount controls | **A**: `K` toggles (see F1 for when you're also carrying) | Same |
| Q9 | Where you land when you get off | **A**: beside the creature on safe ground, no fall damage | Same |
| Q10 | Camera while riding | **A**: keep your current view, and the toggle still works | Same |
| Q11 | Looking around while riding | **A**: free look, world-relative | Same |
| Q12 | Carrying while riding | **C**: you can carry **and fire pellets** while riding | **Changed** |
| Q13 | Health while riding | **A**: you can still be hurt, can't punch, and a knock-out drops you safely | Same |
| Q14 | Ambient vs Lab-placed bipeds | **A**: both; a placed creature's new spot is saved (editors only online) | Same |
| Q15 | Online owner rule | **B**: **no rule**, so riding is always allowed online | **Changed** |
| Q16 | Roles online | **A**: everyone can ride wild creatures; placed ones need edit rights | Same |
| Q17 | Two riders on one creature | **A**: one rider (seats are designed so a second can be added later) | Same |
| Q18 | Terrain limits | **A**: the same rules as wild creatures (slope, no deep water, no buildings) | Same |
| Q19 | What the creature does afterwards | **A**: stands still, then wanders home | Same |
| Q20 | Showing which creatures are rideable | **B**: ride badges **plus a "nearest rideable" waypoint** | **Changed** |
| Q21 | Gait animation at speed | Speed-scaled run gait | Same |
| Q22 | Motion comfort | **A**: tiny bob (≤ 2 cm), none with reduced motion | Same |
| Q23 | Touch controls | A contextual Ride / Get off button, joystick steers, run toggle sprints | Same |
| Q24 | Bumping into things | Slides around creatures, stops at walls, passes through players | Same |
| Q25 | Saving mid-ride | You load on the ground; the ride isn't restored | Same |
| Q26 | Phasing | **A**: three phases in one cycle (single player, polish, online) | Same |
| Q27 | Stamina | **A**: no limit | Same |
| Q28 | Prompt wording | "Ride {name}" / "Get off" / "Climbing on…" plus refusal toasts | Same |
| F1 | `K` while riding **and** carrying | `K` gets you off the mount and you keep carrying | Recommended |
| F2 | How you end up riding while carrying | Either way: climb on while carrying, or pick one up from the seat if it's in reach | Recommended |

### Rules that follow from Q8 + Q12 + F1 + F2 (for your review)

These weren't asked directly. They're the only consistent way to combine your answers:

| You are… | Under the crosshair | `K` does |
| --- | --- | --- |
| Riding, not carrying | A carryable creature within 2 m | Picks it up (F2) |
| Riding, not carrying | Anything else | Gets you off |
| Riding **and** carrying | Anything | Gets you off, and you keep carrying (F1) |
| On foot, carrying | A rideable biped within reach | Climbs on, and you keep carrying (F2) |
| On foot, carrying | Anything else | Puts the creature down (unchanged) |
| On foot, empty-handed | A door or seat | Door or seat (unchanged) |
| On foot, empty-handed | A creature | Carries or rides it, whichever creature is nearest on the look ray |

---

## Intent and core feel

### Question 1: Your cut-off sentence "Look at how the."
- **Status**: `Needs user answer`
- **Why it matters**: The request included "Look at how the." and then stopped. Guessing wrong could mean missing a requirement.
- **Recommended Default**: Assume "look at how the carry and seat interactions work and reuse them".
- **Your Answer**: Look at the quadruped system, but adapt the architecture for the new biped sit-on-top pose and fast walking. _(Locked 2026-11-07)_

### Question 2: Who steers the creature (Multiple Choice)
- **Status**: `Needs user answer`
- **Why it matters**: This decides the input model and the controller, and whether riding works as travel at all. A creature roaming on its own stays inside its herd's leash.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — You steer: WASD relative to where you're looking, Shift sprints, and releasing the keys stops it. **(Locked)**
  - [ ] B — It moves on its own, faster than you can run, within its wander area.
  - [ ] C — Point and go: look at a spot and click.
  - [ ] D — Auto-run where you look, and S slows or stops it.
  - [ ] Custom/Other: —

### Question 3: Ride speed (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: It must be faster than running (12 m/s), but the online room rejects movement faster than `run × 1.5 + 4` (22 m/s by default).
- **Recommended Default**: **A**. Cruise at 1.25× run and sprint at 1.45× run.
- **Options**:
  - [ ] A — Fixed multiples: cruise 1.25×, sprint 1.45×.
  - [x] B — Bigger is faster: sprint goes from 1.2× (smallest) to 1.5× (giants), and cruise is about 85% of that. **(Locked, changed from default)**
  - [ ] C — One speed only (1.35×), no sprint.
  - [ ] D — Faster than the room allows (2×), with a rider allowance.
  - [ ] Custom/Other: —
- **Consequences** (in the technical plan, §4.1 and §9):
  - The smallest bipeds (1.2 m) cruise at about **1.02× run** (12.2 m/s), only just faster than running. Sprinting (1.2×) is clearly faster.
  - Giants sprint at **1.5× run**, which leaves exactly 4 m/s of headroom under the room's speed limit at every run-speed setting. The online soak test (Phase 3) checks this for pose rejections. If any appear, a rider speed allowance would be proposed then.

### Question 4: When it's "one shoulder" vs "both shoulders" (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: Set too low, you perch on a creature as wide as you. Set too high, you straddle a 10 m giant's neck.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — 3.5 m standing height. **(Locked)**
  - [ ] B — 2× the player's height (about 3.6 m).
  - [ ] C — Based on shoulder width.
  - [ ] Custom/Other: —

### Question 5: Which shoulder on large bipeds (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: It decides the seat maths, the camera offset, and where the creature's head appears on screen.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Always the right shoulder. **(Locked)**
  - [ ] B — Always the left shoulder.
  - [ ] C — Whichever is nearer when you mount.
  - [ ] Custom/Other: —

### Question 6: Confirm "no size limit"
- **Status**: `Safe to decide now`
- **Why it matters**: Riding a 1.2 m biped looks comic, and on a 26 m giant your eye is about 20 m up.
- **Recommended Default**: Every biped from 1.2 m to 26 m is rideable.
- **Your Answer**: Yes, every size. _(Locked 2026-11-07)_

### Question 7: Bipeds aren't in every region (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: About 67% of regions have a biped. Forcing one into every region would change the creatures in existing worlds.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Leave the fauna as it is. **(Locked)**
  - [ ] B — Force band 1 to be a biped.
  - [ ] C — Force band 3 to be a biped.
  - [ ] Custom/Other: —

## Controls and presentation

### Question 8: Mount and dismount controls (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: `K` already handles doors, seats and carrying, so the order of precedence must be clear.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — `K` toggles: on, then off. **(Locked; see F1 and the rules table above for when you're carrying too)**
  - [ ] B — `K` gets on; `K` or Space gets off.
  - [ ] C — Hold `K` to get on, tap to get off.
  - [ ] Custom/Other: —

### Question 9: Where you land when you get off (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: A real drop from a giant would knock you out, and a badly chosen spot could put you inside a wall or a lake.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Blend down to safe ground beside the creature (seat side, then other side, front, back), with no fall damage. **(Locked)**
  - [ ] B — Real drop with fall damage.
  - [ ] C — Always in front.
  - [ ] Custom/Other: —

### Question 10: Camera while riding (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: Third person is the only way to see yourself on a giant. The camera boom must ignore the creature you're riding.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Keep your current view, and the toggle still works. **(Locked)**
  - [ ] B — Always third person while riding.
  - [ ] C — First person only.
  - [ ] Custom/Other: —

### Question 11: Looking around while riding (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: A view that turns with the creature is disorienting and creates a feedback loop with camera-relative steering.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Free look, world-relative. Your avatar's body faces the creature's heading. **(Locked)**
  - [ ] B — The view turns with the creature, and the mouse adds an offset.
  - [ ] Custom/Other: —

### Question 12: Carrying a small creature while riding (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: It allows mounted pellet fire from height and at speed, which changes online combat and the server's shot checks.
- **Recommended Default**: **A**. Not allowed.
- **Options**:
  - [ ] A — Not allowed.
  - [ ] B — Allowed, but no firing.
  - [x] C — Allowed, including firing. **(Locked, changed from default)**
  - [ ] Custom/Other: —
- **Consequences** (in the technical plan, §4.6, §4.7, §6, §9 and §10):
  - The carry hold (under the left arm) is combined with both ride poses. On the right-shoulder seat, the carried creature sits between you and the mount's neck, so the seat moves out a little when you're carrying.
  - Online, the room's pellet **origin check** (within 3.5 m of the shooter's last pose) is re-tested at sprint speed. A rider moves about 1.2 m between poses, plus lag. If it's too tight, the room extrapolates the rider's pose.
  - Pellets fired from a giant's shoulder (about 20 m up) use the same 30 m range and 3 points of damage. The height advantage is accepted.
  - The "Creature projectiles" owner rule still controls firing, including from a mount.

### Question 13: Health while riding (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: If riders couldn't be hurt, riding would become a way to escape fights. Punching from a mount would give extra reach.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — You can still be hit, you can't punch, and a knock-out drops you safely first. **(Locked)**
  - [ ] B — You can't be hurt.
  - [ ] C — You can be hit and can punch.
  - [ ] Custom/Other: —

## Content and multiplayer

### Question 14: Ambient vs Lab-placed bipeds (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: Riding a placed creature moves saved world content.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Both can be ridden, and a placed creature's new spot is saved (online: editors and owners only). **(Locked)**
  - [ ] B — Both, but placed creatures snap back.
  - [ ] C — Wild creatures only.
  - [ ] Custom/Other: —

### Question 15: Online owner rule (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: Without a rule, owners can't keep everyone on foot in their world.
- **Recommended Default**: **A**. A new rule, on by default.
- **Options**:
  - [ ] A — New "Creature riding" rule, on by default.
  - [x] B — No rule: riding is always allowed. **(Locked, changed from default)**
  - [ ] C — Reuse the "Creature projectiles" rule.
  - [ ] Custom/Other: —
- **Consequences**: There's no `rules.creatureRiding`, no settings entry, no `rule` refusal for rides, and no "rule switched off" forced dismount. The code kill switch `CREATURE_RIDING_ENABLED` is the only off switch. Firing from a mount still follows the existing "Creature projectiles" rule.

### Question 16: Roles online (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: Riding a wild creature changes nothing that's saved, but riding a placed one does.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Everyone can ride wild creatures; placed ones need edit rights. **(Locked)**
  - [ ] B — Only editors and owners.
  - [ ] Custom/Other: —

### Question 17: Two riders on one large creature (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: Two riders complicate who steers, seat arbitration and dismount rules.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — One rider, with seats modelled so a second can be added later. **(Locked)**
  - [ ] B — Two riders on large bipeds.
  - [ ] Custom/Other: —

## World behaviour

### Question 18: Terrain limits while riding (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: Following the wild creatures' rules keeps riding believable and keeps creatures out of houses.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — The species' slope limit, no deep water, no buildings; it slides along obstacles. **(Locked)**
  - [ ] B — Large bipeds can wade.
  - [ ] C — Large bipeds can step over low buildings.
  - [ ] Custom/Other: —

### Question 19: What the creature does after you get off (Multiple Choice)
- **Status**: `Safe to decide now`
- **Why it matters**: The herd's home stays where it was.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — It stands still for a moment, then wanders home. **(Locked)**
  - [ ] B — It stays near where you got off.
  - [ ] C — It follows you for a while.
  - [ ] Custom/Other: —

### Question 20: Showing which creatures are rideable (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: Players won't discover riding without hints, and giants are visible from far away.
- **Recommended Default**: **A**. Badges only.
- **Options**:
  - [ ] A — Ride badges only.
  - [x] B — Ride badges plus a "nearest rideable" waypoint toggle. **(Locked, changed from default)**
  - [ ] C — No badges.
  - [ ] Custom/Other: —
- **Consequences**: `WaypointSystem` gains a `nearestRideable` toggle (a saved per-player preference, like `nearestCarryable`), and `CreatureRuntimeManager` gains a `nearestRideable()` query. The waypoint follows the creature, and the creature it follows gets the larger ride badge.

### Question 21: Gait animation at riding speed
- **Status**: `Safe to decide now`
- **Why it matters**: At 15+ m/s, the normal run cycle would look like skating.
- **Recommended Default**: A speed-scaled run gait.
- **Your Answer**: Speed-scaled run: steps get faster with speed (capped) and strides lengthen up to the leg's reach. _(Locked 2026-11-07)_

### Question 22: Motion comfort (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: A swaying camera at speed can cause motion sickness.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — A tiny smoothed bob (≤ 2 cm), none with reduced motion. **(Locked)**
  - [ ] B — Full sway.
  - [ ] C — No bob.
  - [ ] Custom/Other: —

### Question 23: Touch controls
- **Status**: `Safe to decide now`
- **Why it matters**: Touch screens have no `K` or Shift.
- **Recommended Default**: A contextual Ride / Get off button.
- **Your Answer**: A Ride / Get off button in the Pick up / Put down slot. The joystick steers, the run toggle sprints, and Jump is hidden while riding. _(Locked 2026-11-07)_

### Question 24: Bumping into things while riding
- **Status**: `Safe to decide now`
- **Why it matters**: Passing through other creatures looks broken, and there's no creature-to-creature physics today.
- **Recommended Default**: Slide around creatures.
- **Your Answer**: Slides around other creatures, stops at walls, and passes through players. _(Locked 2026-11-07)_

### Question 25: Saving and reloading mid-ride
- **Status**: `Safe to decide now`
- **Why it matters**: Restoring onto a giant could drop you 20 m.
- **Recommended Default**: Load on the ground.
- **Your Answer**: The ride isn't restored. You're saved at the safe ground spot beside the creature. _(Locked 2026-11-07)_

## Delivery

### Question 26: Phasing (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: The online protocol bump means the Worker and site must deploy together.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Three phases in one cycle (single player, polish, online), each in its own commit. Deploy live after Phase 3. **(Locked)**
  - [ ] B — Single player only this cycle.
  - [ ] C — All at once.
  - [ ] Custom/Other: —

### Question 27: Stamina or time limit (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: A limit adds rules and a HUD meter. The game's tone is relaxed.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — No limit. **(Locked)**
  - [ ] B — Sprint stamina.
  - [ ] C — The creature tires.
  - [ ] Custom/Other: —

### Question 28: Prompt wording
- **Status**: `Safe to decide now`
- **Why it matters**: It should match the existing prompts, and screen readers read it as written.
- **Recommended Default**: "Ride {name}" / "Get off".
- **Your Answer**: "Ride {species name}", "Climbing on…" (online, while waiting for the room), "Get off", and the refusals "Someone else is riding it" and "Too far away". _(Locked 2026-11-07)_

## Follow-ups

### Follow-up F1: `K` while riding and carrying (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: Q12 C (carry while riding) and Q8 A (`K` toggles) both want the `K` key.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — `K` gets you off the mount and you keep carrying. You put the creature down later, on foot. **(Locked)**
  - [ ] B — The first `K` puts down the carried creature, and the second gets you off.
  - [ ] C — Space gets you off while riding.
  - [ ] Custom/Other: —

### Follow-up F2: How you end up riding while carrying (Multiple Choice)
- **Status**: `Recommended default`
- **Why it matters**: Pick-up reach is 2 m, so from a giant's shoulder nothing on the ground is in reach.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Either way: climb on while carrying, or pick one up from the seat if it's in reach (realistically only from small mounts). **(Locked)**
  - [ ] B — Carry before mounting only.
  - [ ] Custom/Other: —
