# Forest Drift — Player Health: Questions and Decisions

**Feature cycle:** 2026-10-30
**Status:** **Locked (2026-10-30).** All 27 questions and follow-ups F1–F2 are answered. The technical plan ([`02-technical-plan.md`](02-technical-plan.md), revision 2) has been updated to match. **No implementation until you approve it in chat.**
**Related:** [`00-brief.md`](00-brief.md) · [`02-technical-plan.md`](02-technical-plan.md)

---

## How this was answered

Answered through the in-chat form on 2026-10-30, because Markdown previews can't tick boxes. Q1, Q2, Q7, Q12, Q13, Q14, Q16 and Q20 were answered individually. Your Q20 answer raised two follow-ups (F1, F2). All remaining recommended and safe defaults were accepted as written.

## Locked decision summary

| Q   | Decision                                                                                                           | Status   |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| Q1  | **B** — Per-world rule: on for new worlds, off for existing worlds; the owner decides online                         | `Locked` |
| Q2  | **A** — With no hotbar, the bar drops into the hotbar's resting position (animated; instant with reduced motion)   | `Locked` |
| Q3  | **A** — Always visible during play                                                                                 | `Locked` |
| Q4  | **Changed 2026-10-30:** the bar row spans the hotbar's full width, and keeps that width when the hotbar is hidden | `Locked` |
| Q5  | **A** — 6 px tall (5 px phones), red-coral fill, dark outlined empties, thin backing strip                         | `Locked` |
| Q6  | **A** — Max 36; one segment = 1 point; whole numbers                                                               | `Locked` |
| Q7  | **B** — Safe to 4 m; 2 segments per metre beyond, rounded up; lethal from full at 22 m                             | `Locked` |
| Q8  | Distance from the airborne peak to the landing; landing speed recorded too                                         | `Locked` |
| Q9  | **A** — Water ≥ 1.0 m deep at the landing spot cancels the damage                                                  | `Locked` |
| Q10 | **A** — Immune until the next landing after leaving flight                                                         | `Locked` |
| Q11 | No damage with gravity off, in tutorial example movement, in interactions, or while movement is locked             | `Locked` |
| Q12 | **A** — Falls can be lethal                                                                                        | `Locked` |
| Q13 | **A** — Fade, then a small "You fell too far" card with a Respawn button                                           | `Locked` |
| Q14 | **A** — Respawn at the **world spawn** (same as the pause-menu Respawn)                                            | `Locked` |
| Q15 | No death penalty in v1                                                                                             | `Locked` |
| Q16 | **B** — Regain 1 segment every 3 s after 8 s without damage                                                        | `Locked` |
| Q17 | Drain + ghost trail, edge vignette, landing thud, low-health pulse; no camera shake or dip                         | `Locked` |
| Q18 | **Changed 2026-10-30:** a small `24/36` number at the right end of the bar (screen readers use the meter value) | `Locked` |
| Q19 | **A** — Save health with the single-player world                                                                   | `Locked` |
| Q20 | **Custom** — Health is private to each player, but must work in multiplayer worlds and be ready for player-vs-player damage (see F1, F2) | `Locked` |
| Q21 | **B** — Falls caused by the floor being removed under you are immune                                               | `Locked` |
| Q22 | The world owner sets the fall-damage rule in online worlds                                                          | `Locked` |
| Q23 | General `DamageSource` pipeline now                                                                                | `Locked` |
| Q24 | First landing after load, respawn, join or teleport is immune, plus a 2 s grace period                             | `Locked` |
| Q25 | Same centred position on all devices; the bar ignores touches                                                      | `Locked` |
| Q26 | Physics unchanged while paused; a death card waits until the menu closes                                           | `Locked` |
| Q27 | `PLAYER_HEALTH_ENABLED` constant as the kill switch                                                                | `Locked` |
| F1  | **A** — The server owns each player's health online, applies damage, and sends it only to that player             | `Locked` |
| F2  | **A** — Online health persists per player across leave and rejoin                                                  | `Locked` |

### Overrides of the recommended defaults

| Topic                  | Recommended was                           | You chose                                                        | Consequence                                                                                                                                                                                                                                                                                       |
| ---------------------- | ----------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q14 Respawn location   | B — last safe spot before the fall         | **A** — world spawn                                              | Simpler: no safe-position tracker. Reuses `ThreeScene.respawn()`. In a large world, a death far from the origin means travelling back (single player can fly; online can't).                                                                                                                  |
| Q20 Online health      | A — local only, reset on join, not shown  | **Custom** — private, but must work online and be PvP-ready      | Health becomes **server-owned in online worlds** (F1 A) and **persists per player** (F2 A). This adds a protocol bump (v4 → v5), new room messages, server-side regeneration and fall plausibility checks, and per-player storage. Estimated **+2–3 days** over a local-only v1. The client and the Worker must be deployed together. |

---

## Follow-up questions (raised by your Q20 answer)

### Follow-up F1: How much server authority in v1 (Multiple Choice)

- **Status**: `Locked` — **A**
- **Why it matters**: You said other players will be able to damage each other later. That only works fairly if the server holds the real health value. A client-reported value can be forged. The server can't easily recompute falls itself, because it has no terrain or building heights, but it can check a reported fall against the poses it has already received.
- **Options**:
  - [x] A. Server owns health now: client reports landings, server checks them against the pose stream, applies damage, and sends health only to that player
  - [ ] B. Server computes falls purely from poses (needs server-side heights; much more work)
  - [ ] C. Client-side in v1, with a server-ready design

### Follow-up F2: Online health across leave and rejoin (Multiple Choice)

- **Status**: `Locked` — **A**
- **Why it matters**: If health resets on rejoin, leaving and coming back heals you, which becomes an exploit once PvP exists.
- **Options**:
  - [x] A. Persist per player, alongside their last position. Players who were dead rejoin at full health at the world spawn.
  - [ ] B. Reset to full on join

**Decision status legend:**

| Status                | Meaning                                                       |
| --------------------- | ------------------------------------------------------------- |
| `Needs user answer`   | Blocks or strongly shapes the design. Only you can decide it. |
| `Recommended default` | A sensible default exists. Confirm it or override it.         |
| `Safe to decide now`  | Low risk. The default is used unless you say otherwise.       |

**Reference numbers used below.** These come from the current code. Gravity is 18 m/s² and jump speed is 7 m/s, so a flat jump peaks at about **1.36 m**. With no air drag, landing speed is 6 × √(fall height): 3 m → 10.4 m/s, 5 m → 13.4 m/s, 10 m → 19 m/s, 20 m → 26.8 m/s. One building storey is **3 m**.

---

## A. Scope and tone

### Question 1: Fall damage on by default (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: The 2026-10-20 gameplay research plan describes Forest Drift as calm, with no combat, hunger or destructive hazards required. Fall damage is the first mechanic that punishes the player. If it's on everywhere with no way to turn it off, existing worlds suddenly feel different and players who build tall can get hurt on their own roofs. If it's off by default, most players never see the feature.
- **Recommended Default**: Option B — a per-world "Fall damage" rule, on for new worlds and off for worlds created before this release. The owner decides in online worlds.
- **Options**:
  - [ ] A. Always on, in every world, with no toggle
  - [ ] B. Per-world rule: on for new worlds, off for existing worlds (Recommended)
  - [ ] C. Per-world rule: on for all worlds, including existing ones
  - [ ] D. Personal setting (each player chooses for themselves, in every world)
  - [ ] E. Off by default everywhere; opt in per world
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 2: Bar position when no hotbar is showing (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: The hotbar only appears in build mode (toggled with **G**) or music mode. Online viewers see a "Viewing only" badge instead. With nothing to sit above, a bar "just above the hotbar" would float in mid-air or jump around. If we get this wrong, the bar moves unpredictably whenever you press G, which is distracting and hard to read.
- **Recommended Default**: Option A — the bar drops into the hotbar's resting position and animates smoothly (instantly with reduced motion).
- **Options**:
  - [ ] A. Drop down to where the hotbar would sit (Recommended)
  - [ ] B. Stay at the same height as if the hotbar were there (a fixed gap at the bottom)
  - [ ] C. Hide the bar when the hotbar is hidden (only show health while building)
  - [ ] D. Hide the bar when the hotbar is hidden, but show it for 4 s after any damage
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 3: Always visible, or hide at full health (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Auto-hiding at full health keeps the screen clean, which suits a calm building game. But a bar that keeps appearing and disappearing pulls the eye, and players can't check their health at a glance.
- **Recommended Default**: Option A — always visible while playing. It's slim enough not to be in the way.
- **Options**:
  - [ ] A. Always visible during play (Recommended)
  - [ ] B. Hidden at full health; shown on damage, while regenerating, and for 4 s after
  - [ ] C. Hidden unless fall damage is enabled for this world (combine with A or B)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 4: Bar width (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: The build hotbar and the music hotbar are different widths, and the hotbar can be hidden. If the bar tracks the hotbar's width, it changes width when you switch modes and its segments resize. If it's fixed, it may look slightly narrower or wider than the tray beneath it.
- **Recommended Default**: Option A — a fixed width of about 260 px on desktop and 200 px on small screens. With 36 segments and 1 px gaps, each segment is about 6 px (desktop) or 4.5 px (mobile) wide.
- **Options**:
  - [ ] A. Fixed width, centred (≈260 px desktop / ≈200 px phones) (Recommended)
  - [ ] B. Always exactly match the visible hotbar tray's width
  - [ ] C. Full hotbar width on desktop, fixed on phones
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 5: Bar thickness and style (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: You asked for "quite slim". Too thin (under 4 px) and segments can't be told apart on high-DPI screens, and low-vision players struggle. Too thick and it competes with the hotbar. The colour also has to work against bright sky, snow, dark night and the hotbar's dark-green glass.
- **Recommended Default**: Option A — 6 px tall (5 px on phones) with 1 px gaps. Filled segments are warm red-coral with a light top edge; empty segments are a dark translucent outline. It sits on a thin dark backing strip so it reads against bright skies. Below 25%, the filled segments shift to a brighter tone.
- **Options**:
  - [ ] A. 6 px tall, red-coral fill, dark outlined empties, thin backing strip (Recommended)
  - [ ] B. 4 px tall, no backing strip (thinnest possible)
  - [ ] C. 8 px tall with a small heart/leaf icon at the left end
  - [ ] D. Match the game's gold/amber UI theme instead of red
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 6: What one segment represents (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: This decides how fine-grained damage can be. If the maximum is 36 and one segment is one health point, everything is a whole number and the bar is exact. Half-segments or a 100-point scale allow smaller hits (useful for later sources like brushing a thorn bush), but the bar has to round, so it may not visibly change for small hits.
- **Recommended Default**: Option A — maximum health 36; one segment = 1 health point; whole numbers only.
- **Options**:
  - [ ] A. Max 36, one segment = 1 point, whole numbers only (Recommended)
  - [ ] B. Max 72, one segment = 2 points (half-segments shown as half-filled)
  - [ ] C. Max 100, shown as 36 segments (rounded up)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

---

## B. Fall damage rules

### Question 7: Safe height and how fast damage grows (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: This decides how the feature feels. If the threshold is too low, jumping down a staircase or off a one-storey roof hurts, and building becomes a chore. If it's too high, the feature does nothing. The slope sets how lethal a fall is: a steep slope means one mistake on a tall build kills you.
- **Recommended Default**: Option B — no damage up to **4 m**, then **2 segments per metre** beyond that, rounded up. 5 m → 2, 6 m → 4, 8 m → 8, 10 m → 12, 15 m → 22, **22 m or more → 36 (lethal from full health)**. A one-storey roof (≈3–3.5 m) is safe; a two-storey roof (≈6.5 m) costs about 5 segments.
- **Options**:
  - [ ] A. Gentle: safe to 5 m, 1 segment per metre beyond (lethal at 41 m)
  - [ ] B. Balanced: safe to 4 m, 2 segments per metre beyond (lethal at 22 m) (Recommended)
  - [ ] C. Harsh: safe to 3 m, 3 segments per metre beyond (lethal at 15 m)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 8: Measure by fall distance or landing speed

- **Status**: `Safe to decide now`
- **Why it matters**: With no air drag, the two are mathematically the same today. Distance (highest point minus landing height) is easier to reason about and tune, isn't affected by the 0.1 s frame-time clamp, and handles ceiling bumps correctly. Speed would matter later if drag, gliding or slow-fall were added. We record both so we can switch without a rewrite.
- **Recommended Default**: Measure distance from the highest point reached while airborne to the landing point (feet height). Also record landing speed for future use and debugging.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">

### Question 9: Landing in water (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Players expect water to break a fall. Rivers are walkable, and deep lakes block walking in but not falling in. If water doesn't help, jumping off a cliff into a lake kills you, which feels wrong. If any puddle counts, a 0.1 m stream negates a 30 m fall.
- **Recommended Default**: Option A — no fall damage if the water at the landing spot is at least 1.0 m deep (the existing hydrology `waterColumnDepth`). Shallower water has no effect.
- **Options**:
  - [ ] A. Water ≥ 1.0 m deep cancels the damage; shallower water does nothing (Recommended)
  - [ ] B. Damage scales down with depth (full at 0 m, none at ≥ 2 m)
  - [ ] C. Water has no effect on fall damage
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 10: Stopping flight in mid-air (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Single-player flight (F) is a travel and viewing tool. The current code comment explicitly says leaving flight mid-air causes no fall damage. If we change that, pressing F by accident at 80 m kills you. If we keep it, flight is a guaranteed way to avoid damage, which is fine while flight is a single-player tool (it's already off online).
- **Recommended Default**: Option A — the fall right after you stop flying is immune until you next touch the ground. After that, normal rules apply.
- **Options**:
  - [ ] A. Immune until next landing after leaving flight (Recommended — matches current behaviour)
  - [ ] B. Measure the fall from where flight stopped (stopping flight high up can kill)
  - [ ] C. Immune, but only if flight is stopped less than 10 m above the ground
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 11: Developer tools (gravity off, example movement, screenshot lock)

- **Status**: `Safe to decide now`
- **Why it matters**: The developer settings can turn gravity off. Tutorials use scripted "example movement" that jumps automatically, and the screenshot capture freezes movement. Damage during any of these would be confusing, and could kill the player during a narrated tutorial.
- **Recommended Default**: No falls are tracked while gravity is off, during tutorial example movement, during a mini-build or furniture interaction, or while movement is locked. The first landing after any of these is immune.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">

### Question 12: Can a fall kill you? (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: A lethal fall gives health real stakes and makes death and respawn necessary. A non-lethal floor (stop at 1 segment) keeps the calm tone and avoids death entirely in v1. But then health has little meaning until other damage sources arrive, and Q13–Q15 become moot.
- **Recommended Default**: Option A — falls can be lethal. Without that, the 36-segment bar has nothing to protect.
- **Options**:
  - [ ] A. Yes, a big enough fall takes you to 0 and you die (Recommended)
  - [ ] B. No, falls leave you at 1 segment minimum (no death in v1)
  - [ ] C. Lethal only if you were already low (a single fall from full can't kill)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

---

## C. Death and recovery

### Question 13: What happens at zero health (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: This is the first "fail state" in Forest Drift. If it's too heavy (a long death screen, lost progress), it clashes with the calm tone. If it's too light (an instant silent teleport), the player may not understand what happened and could think it's a bug.
- **Recommended Default**: Option A — a short fade to dark, then a small "You fell too far" card with a **Respawn** button (Enter / Space / tap). The pointer is released while the card is open.
- **Options**:
  - [ ] A. Fade + small card with a Respawn button (Recommended)
  - [ ] B. Fade, then automatic respawn after 2 s with a brief toast
  - [ ] C. Full death screen with the cause, fall height and Respawn / Quit to menu buttons
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 14: Where you respawn (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: The pause menu's existing Respawn sends you to dry ground near world origin (0, 0). Worlds are infinite, so if you die 3 km from the origin, walking back is tedious (flight helps in single player but is off online). Respawning near where you fell is kinder, but it needs a "last safe position" record, and that position might be the dangerous ledge you just fell from.
- **Recommended Default**: Option B — respawn at the last safe standing spot from at least 5 s before the fatal fall (on solid ground, not in deep water). Fall back to the world spawn if none is known.
- **Options**:
  - [ ] A. World spawn (same as the pause-menu Respawn)
  - [ ] B. Last safe standing spot before the fall, falling back to world spawn (Recommended)
  - [ ] C. Player chooses on the death card: "Here" or "World spawn"
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 15: Penalty for dying

- **Status**: `Safe to decide now`
- **Why it matters**: There is no inventory, currency or experience yet, so there is nothing to lose. Adding an artificial penalty (such as a cooldown) would only add friction.
- **Recommended Default**: No penalty in v1. You respawn at full health. When inventory exists, this question comes back as its own decision.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">

### Question 16: Health regeneration (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: There are no healing items yet. Without regeneration, damage is permanent until you die, so a player at 3 segments is stuck being cautious forever, or has to die on purpose to reset. If regeneration is too fast, fall damage barely matters.
- **Recommended Default**: Option B — after 8 s without taking damage, regain 1 segment every 3 s (full recovery from empty in about 2 minutes).
- **Options**:
  - [ ] A. No regeneration (only respawning restores health)
  - [ ] B. Slow regeneration: 1 segment / 3 s after 8 s without damage (Recommended)
  - [ ] C. Fast regeneration: 1 segment / 1 s after 4 s without damage
  - [ ] D. Regeneration only while standing still or sitting on furniture
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

---

## D. Feedback and presentation

### Question 17: Damage feedback (Multiple Choice — tick all that apply)

- **Status**: `Recommended default`
- **Why it matters**: A slim bar at the bottom of the screen is easy to miss, so without other feedback players may not notice damage. Too much (camera shake, loud sounds) is jarring in a calm game and can cause motion discomfort.
- **Recommended Default**: The first four. No camera shake. All motion effects are skipped when the system's "reduce motion" setting is on.
- **Options**:
  - [ ] Segments drain with a short pale "recent damage" trail that catches up after 0.6 s (Recommended)
  - [ ] Brief red vignette at the screen edges, stronger for bigger hits (Recommended)
  - [ ] Soft landing thud sound, louder for bigger hits, using the existing volume preferences (Recommended)
  - [ ] Gentle pulse on the bar at or below 25% health (Recommended)
  - [ ] Small camera dip on heavy landings
  - [ ] Camera shake
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 18: Show a number next to the bar (Multiple Choice)

- **Status**: `Safe to decide now`
- **Why it matters**: A number like "25 / 36" is exact but adds visual noise to a deliberately slim bar. Screen readers get the value either way.
- **Recommended Default**: Option A — no visible number. The value is exposed to screen readers and shown as a tooltip on hover.
- **Options**:
  - [ ] A. No visible number; tooltip on hover; full value for screen readers (Recommended)
  - [ ] B. Small number at the right end of the bar, always
  - [ ] C. Number only while the pause menu is open
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

---

## E. Persistence and multiplayer

### Question 19: Save health in single-player worlds (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: If health isn't saved, quitting and reloading heals you fully. That's a harmless exploit in a calm game, but it's surprising. If it is saved, it becomes part of the world file and has to be validated on import. The save format already handles new optional fields without a schema bump.
- **Recommended Default**: Option A — save current health with the player's position. Worlds without it load at full health. Imported values are clamped to 0–36, and a saved 0 loads as full health at the spawn point.
- **Options**:
  - [ ] A. Save health with the player state (Recommended)
  - [ ] B. Don't save; every load starts at full health
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 20: Health in online (multiplayer) worlds (Multiple Choice)

- **Status**: `Needs user answer`
- **Why it matters**: Syncing health means protocol changes, server storage per player, and server-side validation. Otherwise a modified client could claim any health value, and once PvP or creature damage exists that matters. Keeping it local is cheap and safe today, because nothing depends on another player's health. But others can't see that you're hurt, and health resets when you rejoin.
- **Recommended Default**: Option A — local only in v1. Not sent to the server or shown to others, and full health on every join. Revisit when a shared damage source (creatures, PvP) is planned.
- **Options**:
  - [ ] A. Local only; full health on each join; not shown to others (Recommended)
  - [ ] B. Local, but shown to others as a tiny bar under the name tag (sent with poses; not validated)
  - [ ] C. Fully synced and stored on the server per player
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 21: Falls caused by someone else's edit (Multiple Choice)

- **Status**: `Recommended default`
- **Why it matters**: Online, anyone can change shared builds, and the creator can delete their foundation or floor. If another player deletes the floor under you, you fall. Damage here could feel like griefing. Making it immune adds complexity: we'd need to know why the support disappeared.
- **Recommended Default**: Option B — if the surface under you disappears because of a remote edit (or your own undo or delete), that fall is immune. Normal falls still count.
- **Options**:
  - [ ] A. Apply normal fall damage regardless of why you fell
  - [ ] B. Immune when the floor was removed from under you by an edit (Recommended)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">

### Question 22: Who controls the fall-damage rule online

- **Status**: `Recommended default`
- **Why it matters**: This only applies if Q1 is a per-world rule. Online worlds are owned by the admin (you). If each player could toggle it, the rule would differ between players in the same world, which is confusing but harmless while health is local.
- **Recommended Default**: The world owner sets it in the owner panel, alongside sky, weather and time. Guests and editors see it but can't change it.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">

---

## F. Engineering decisions

### Question 23: Build a general damage pipeline now

- **Status**: `Safe to decide now`
- **Why it matters**: You've said other damage types will come later. If fall damage is wired straight into the bar, each new source means rewiring. A small general pipeline now (a damage source type, plus immunity and grace-period handling in one place) costs about half a day and saves a refactor later.
- **Recommended Default**: Yes. `PlayerHealth.damage(source)` takes a typed `DamageSource` (only `{ kind: 'fall' }` in v1). The bar and death handling only listen to health changes and never know about falls.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">

### Question 24: Grace period after load, respawn and join

- **Status**: `Safe to decide now`
- **Why it matters**: Restoring a world places you at the saved position with "not grounded". If you saved while flying high, you'd fall and could die on load, because flight state isn't saved. A newly spawned player might also land on terrain that's still streaming in.
- **Recommended Default**: The first landing after a load, respawn, join or teleport is always immune. In addition, there's a 2 s period with no damage from any source.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">

### Question 25: Touch and small-screen layout

- **Status**: `Safe to decide now`
- **Why it matters**: On phones and iPad, the hotbar shares the bottom of the screen with the joystick cluster (bottom-left) and the touch action dock. In landscape phones, the hotbar is limited to `100vw − 320px`. A bar that overlaps those areas could block touches. Making the bar ignore touches avoids that, but it must still not hide anything visually.
- **Recommended Default**: Same centred position above the hotbar on every device. The bar ignores pointer and touch input (`pointer-events: none`). Verify no visual overlap at 375×812, 812×375, 768×1024 and the iPad Pro M4 viewport.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">

### Question 26: Falling while the pause menu is open

- **Status**: `Safe to decide now`
- **Why it matters**: Pausing doesn't stop movement physics today, so a player who opens the menu mid-fall lands while the menu is open. Freezing physics in single-player pause changes long-standing behaviour and affects more than health. Online, the world keeps running anyway.
- **Recommended Default**: Leave physics unchanged. Damage applies on landing as normal. If the landing kills you, the death card waits until the menu closes.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">

### Question 27: Feature switch for rollback

- **Status**: `Safe to decide now`
- **Why it matters**: If the feature causes problems after release (unexpected deaths, layout overlap on a device we didn't test), we want to turn it off without reverting code or touching saves.
- **Recommended Default**: One constant, `PLAYER_HEALTH_ENABLED`, in the health module. When false, no damage is applied and the bar isn't rendered, but saved health values are kept untouched.
- **Your Answer**: <input type="text" placeholder="Type your answer here" style="width: 100%;">

---

## Decisions

All answers are recorded in the [locked decision summary](#locked-decision-summary) at the top of this file. The question text above is kept as originally asked, so the reasoning behind each decision stays visible.
