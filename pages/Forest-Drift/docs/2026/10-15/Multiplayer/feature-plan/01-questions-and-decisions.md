# Forest Drift — Multiplayer: Questions and Decisions

**Feature cycle:** 2026-10-15
**Status:** **Locked (2026-10-15).** All 34 questions and follow-ups F1–F5 are answered. The technical plan ([`multiplayer-research.plan.md`](../../../../multiplayer-research.plan.md), revision 3) has been updated to match. **No implementation until you approve it in chat.**
**Related:** [`multiplayer-research.plan.md`](../../../../multiplayer-research.plan.md) (research and technical plan, revision 2) · [`chatgpt-multiplayer-research.plan.md`](../../../../plans/2026/10/chatgpt-multiplayer-research.plan.md) (independent cross-review)

**Decision status legend:**

| Status                | Meaning                                                       |
| --------------------- | ------------------------------------------------------------- |
| `Needs user answer`   | Blocks or strongly shapes the design. Only you can decide it. |
| `Recommended default` | A sensible default exists. Confirm it or override it.         |
| `Safe to decide now`  | Low risk. The default is used unless you say otherwise.       |
| `Locked`              | Confirmed from your answers.                                  |

---

## How this was answered

Q1–Q5 were ticked in this file. All 34 were then submitted through the in-chat form on 2026-10-15. Markdown previews can't tick boxes, so the remaining follow-ups (F1–F5) are also offered as an in-chat form.

---

## Locked decision summary

| Q   | Decision                                                                                              | Status   |
| --- | ----------------------------------------------------------------------------------------------------- | -------- |
| Q1  | **A** — Publish a local world as a separate online copy                                               | `Locked` |
| Q2  | **A** — Only you (admin) create online worlds in v1                                                   | `Locked` |
| Q3  | **A** — Owner, editor and viewer links                                                                | `Locked` |
| Q4  | **C** — Add to anyone's builds; delete only your own (changing others' objects: F1)                   | `Locked` |
| Q5  | **A** — Guests + invite links; Firebase sign-in later                                                 | `Locked` |
| Q6  | Free-text names, 2–20 characters, remembered; duplicates get "(2)"                                    | `Locked` |
| Q7  | **A** — Invite-only                                                                                   | `Locked` |
| Q8  | **D** — Full simultaneous co-building in v1 (rules: F1, F2)                                           | `Locked` |
| Q9  | **A** — Creatures local to each player in v1                                                          | `Locked` |
| Q10 | **C** — Flight off in multiplayer worlds (via F3)                                                     | `Locked` |
| Q11 | **A** — World clock pauses while empty                                                                | `Locked` |
| Q12 | World keeps running in the pause menu; you show as "away"                                             | `Locked` |
| Q13 | **A** — Doors shared live; reset to closed each session                                               | `Locked` |
| Q14 | **A** — Owner changes sky/weather/time; terrain locked after publishing                               | `Locked` |
| Q15 | **A** — No chat in v1                                                                                 | `Locked` |
| Q16 | **A** — Players pass through each other (default applied)                                             | `Locked` |
| Q17 | **A** — Stylised figure + chosen colour + name tag                                                    | `Locked` |
| Q18 | **A** — Last position; first-timers at the world spawn                                                | `Locked` |
| Q19 | **B** — 20 players per world                                                                          | `Locked` |
| Q20 | **A** — Mini Build designs copied into the world                                                      | `Locked` |
| Q21 | Undo own last 5; 30 s offline grace, then building pauses                                             | `Locked` |
| Q22 | **A** — Free in idle/dev months; Paid ($5) in session months                                          | `Locked` |
| Q23 | No Cloudflare account yet; you create it, I configure everything else (F5)                            | `Locked` |
| Q24 | **A** — `*.workers.dev` address                                                                       | `Locked` |
| Q25 | **A** — Mostly UK / Europe                                                                            | `Locked` |
| Q26 | **B** — Alert above £8 ($10)                                                                          | `Locked` |
| Q27 | **A** — 30-day recovery + weekly R2 export + manual export                                            | `Locked` |
| Q28 | **A** — Fly.io fallback, confirmed with you first                                                     | `Locked` |
| Q29 | **B** — Fix terrain maths everywhere; accept small river/lake changes                                 | `Locked` |
| Q30 | **A** — Desktop + mobile supported at launch                                                          | `Locked` |
| Q31 | M4 MacBook Air + iPad Pro M4 (via F4); no phone named                                                 | `Locked` |
| Q32 | **A** — `pages/Forest-Drift/server/`, manual `wrangler deploy`                                        | `Locked` |
| Q33 | **A** — Cloudflare logs + in-game diagnostics only                                                    | `Locked` |
| Q34 | Smooth remote movement is a release requirement (R1)                                                  | `Locked` |
| F1  | **A** — Anyone can add to and change anything; only the creator (or owner) deletes                    | `Locked` |
| F2  | **B** — Deleting your build that holds others' additions needs a confirmation listing whose work goes | `Locked` |
| F3  | **C** — Flight off in multiplayer worlds                                                              | `Locked` |
| F4  | iPad Pro M4 for touch testing (no phone)                                                              | `Locked` |
| F5  | **A** — Start locally; create the Cloudflare account with guidance when first needed                  | `Locked` |

### Overrides of the recommended defaults

| Topic              | Recommended was                          | You chose                                     | Consequence                                                                                                                                                   |
| ------------------ | ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q4 Others' builds  | B — editors change/delete only their own | **C** — add to anyone's, delete only your own | Ownership is tracked per object, including additions such as a window in someone else's wall                                                                  |
| Q8 Same foundation | A — one builder per foundation (lease)   | **D** — full simultaneous co-building         | Finer-grained edit operations and merge rules; about **+2–4 weeks**, so roughly **36–62 developer days** to the 20-player release                             |
| Q29 Terrain fix    | A — new worlds only                      | **B** — fix everywhere                        | Existing worlds (including single-player saves) may see small river or lake changes; a pre-release check will list any foundation that would end up in water  |
| Q10 / F3 Flight    | A — allowed; owner toggle later          | **C** — off in multiplayer worlds             | The flight toggle is disabled in multiplayer worlds. The server can use a tight walking/running speed check, which makes pose validation simpler and stronger |

---

## A. Shared worlds and access

### Question 1: Multiplayer world model (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: This decides what a "multiplayer world" is and where its truth lives. Your local worlds in IndexedDB are single-player saves today. If we choose badly:
  - Two copies of one world can silently diverge, so it's unclear which version is "real".
  - A guest could overwrite your personal save.
  - Building a live "open my local world to friends" mode would need your browser to stay online as the host. That is the peer-to-peer reliability problem the plan rejected.
- **Recommended Default**: **A**. Publish a local world as a **separate online copy** that lives on the server. Your local single-player world is never touched, and you can export the online world back to a local file at any time.
- **Options**:
  - [x] A — Publish a local world as a separate online copy (recommended)
  - [ ] B — Create brand-new online worlds only (no publishing of existing local worlds)
  - [ ] C — Both A and B
  - [ ] D — Open a local world live while you're playing it (your browser hosts; the world goes offline when you leave)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Publish a local world as a separate online copy.

### Question 2: Who can create online worlds (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Anyone who can create a world creates storage and running costs on your Cloudflare account. An unprotected "create world" endpoint could be abused by strangers: spam worlds, stored junk, or usage pushing past the free-plan caps. Locking it down too far means friends can't share their own builds.
- **Recommended Default**: **A**. Only you can create online worlds in v1, protected by an admin secret. Friends join worlds you create.
- **Options**:
  - [x] A — Only me (admin) in v1 (recommended)
  - [ ] B — Anyone I have invited to at least one world
  - [ ] C — Anyone who visits the game page (public)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Only me (admin) in v1.

### Question 3: Invite roles and edit rights (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Invite links are the only access control in v1. If one link lets everyone edit:
  - a younger family member or a forwarded link can change or wreck builds;
  - there is no way to have "visit only" guests.

  Too many roles adds friction to every session.

- **Recommended Default**: **A**. Each world gets three kinds of link:
  - an **owner** secret, kept by the publisher;
  - an **editor** link: can build;
  - a **viewer** link: can explore but not build.

  Links can be rotated if one leaks.

- **Options**:
  - [x] A — Owner + editor link + viewer link (recommended)
  - [ ] B — Owner + one shared link where everyone can edit
  - [ ] C — Owner + one shared link where everyone is view-only (only the owner builds)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Owner + editor link + viewer link.

### Question 4: Deleting other people's builds (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Remove Mode can delete walls, roofs, stairs and whole foundations. In a shared world, one accidental or mischievous click could remove someone else's afternoon of work. Point-in-time recovery can roll the _whole world_ back, but that also undoes everyone else's work since then.
- **Recommended Default**: **B**. Editors can change or delete only what they created. The **owner** can change or delete anything.
- **Options**:
  - [ ] A — Any editor can change or delete anything (simplest; trust everyone)
  - [ ] B — Editors change or delete only their own builds; the owner can do anything (recommended)
  - [x] C — Editors can add to anyone's builds (for example a window in someone's wall) but only delete their own
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: C — Editors can add to anyone's builds but only delete their own. Whether editors may also _change_ other people's objects (repaint, move, restyle) is follow-up F1.

### Question 5: Accounts and identity (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Accounts decide how players are recognised across devices and sessions.
  - **Guests:** quick to build and need no sign-in. But your identity lives in one browser, so switching from laptop to phone looks like a different person.
  - **Firebase sign-in:** already used elsewhere on the site, and free up to 50k monthly users. It adds sign-in UI, token checks on the server and a privacy responsibility.
  - Choosing accounts too early slows the first playable version. Choosing them too late means migrating guest identities.
- **Recommended Default**: **A**. Guest identity (a random player ID plus a display name, remembered in the browser) and invite links in v1. Add optional Google sign-in through Firebase in Phase 5.
- **Options**:
  - [x] A — Guests + invite links in v1; optional Firebase sign-in later (recommended)
  - [ ] B — Firebase (Google) sign-in required from day one
  - [ ] C — Guests for players, but the owner signs in with Google (protects world ownership)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Guests + invite links in v1; optional Firebase sign-in later.

### Question 6: Display names

- **Status**: `Locked`
- **Why it matters**: Names appear above avatars and in the player list.
  - Without limits, very long or offensive names, or two players called "Dad", cause confusion.
  - Too many rules annoy family players.
  - Names are shown to everyone in the world, so they shouldn't be real full names if a world is ever shared more widely.
- **Recommended Default**: Free text, 2–20 characters, chosen on first join and remembered in the browser. Duplicate names in the same world get a small suffix (for example "Sam (2)"). No profanity filter in v1, because worlds are invite-only.
- **Your Answer**: Recommended rules: free text, 2–20 characters, remembered in the browser; duplicates get a suffix such as "(2)".

### Question 7: Public listing or invite-only (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: A public world list makes the game discoverable to strangers. That needs moderation, abuse limits, possibly reporting tools, and more traffic on the free-plan caps. Invite-only keeps v1 small and safe, but every player needs a link from you.
- **Recommended Default**: **A**. Invite-only in v1.
- **Options**:
  - [x] A — Invite-only (recommended)
  - [ ] B — Invite-only, plus a "Featured world" anyone can visit as a viewer
  - [ ] C — Public list of worlds
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Invite-only.

---

## B. Gameplay in a shared world

### Question 8: Building on the same foundation (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Two people editing one house at the same moment is the hardest case. With simple "last edit wins", one person's change can silently erase the other's. For example, a stair cuts a hole in a slab while someone repaints that slab, and the hole vanishes. True simultaneous co-building needs weeks of extra work (merge rules, collaborative undo).
- **Recommended Default**: **A**. One builder per foundation at a time (an "edit lease"). Others can build on any other foundation or on open ground, and they see "Sam is building here". The lease frees itself after 60 s of inactivity or when the builder leaves, and the owner can break it.
- **Options**:
  - [ ] A — One builder per foundation at a time (recommended)
  - [ ] B — Anyone can edit any foundation at once; last edit wins (risk of lost changes)
  - [ ] C — Only the foundation's creator (and the owner) can ever build on it
  - [x] D — Full simultaneous co-building in v1 (adds about 2–4 weeks)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: D — Full simultaneous co-building in v1. **Overrides the recommended edit lease.** Adds roughly 2–4 weeks; rules in follow-ups F1 and F2.

### Question 9: Creatures in v1 (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Creatures spawn in the same places for everyone, but their movement reacts to the local player and a local clock, so it differs between players. Making them shared needs a server-side creature simulation and extra network traffic. That could delay the first release by weeks. If creatures stay local, two players standing together may see the same deer behaving differently. That is harmless today, because creatures have no gameplay effect.
- **Recommended Default**: **A**. Local to each player in v1. Creatures you _place_ yourself (recipes) are shared.
- **Options**:
  - [x] A — Local to each player in v1; shared later (recommended)
  - [ ] B — Shared creatures required before the first release
  - [ ] C — Turn ambient creatures off in multiplayer worlds
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Local to each player in v1; shared later.

### Question 10: Flight (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Flight reaches 600 m/s in single player. In a shared world it lets players scatter far apart, which matters later for interest management. It can also feel unfair if you ever add exploration goals. Turning it off removes a feature players already enjoy.
- **Recommended Default**: **A**. Allowed, the same as single player. A per-world owner toggle comes in a later phase.
- **Options**:
  - [ ] A — Allowed; owner toggle later (recommended)
  - [ ] B — Owner toggle in v1
  - [x] C — Off in multiplayer worlds
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: C — Off in multiplayer worlds (answered as follow-up F3). **Overrides the recommended default.**

### Question 11: World clock when nobody is online (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Day/night and weather must match for everyone, so they need one shared clock.
  - **Paused while the world is empty:** matches single player, where time only passes while you play. Each session continues from where the last ended.
  - **Real time:** the world feels alive, but players may always arrive at night or in the same weather. The clock also keeps running for months while nobody plays.
- **Recommended Default**: **A**. Paused while empty; it runs while at least one player is connected.
- **Options**:
  - [x] A — Paused while the world is empty (recommended)
  - [ ] B — Runs in real time, even when empty
  - [ ] C — Owner sets a fixed time of day and weather
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Paused while the world is empty.

### Question 12: Pause menu in multiplayer

- **Status**: `Locked`
- **Why it matters**: In single player, opening the menu freezes the world clock and weather. In a shared world one player can't freeze time for everyone. If it could, anyone opening a menu would stop the sun for all players. If a paused player simply vanished, others would think they had left.
- **Recommended Default**: The world keeps running. Your controls freeze, and your avatar shows as "away" (dimmed name tag) until you return. The same applies while the developer panel or Mini Build editor is open, or the tab is hidden.
- **Your Answer**: Recommended: the world keeps running; you show as "away".

### Question 13: Doors (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Doors are the first shared interactive object. If door state isn't shared, one player sees a door shut that another sees open, and collision differs: one player walks through a door the other sees closed. Saving door state permanently is extra storage for little benefit; single-player saves don't keep it either.
- **Recommended Default**: **A**. Opening or closing a door is shared live. All doors reset to closed when a new session starts (first player joins an empty world).
- **Options**:
  - [x] A — Shared live; reset to closed each new session (recommended)
  - [ ] B — Shared live and remembered permanently
  - [ ] C — Not shared (each player sees their own doors)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Shared live; reset to closed each new session.

### Question 14: World settings in multiplayer (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: The Settings menu can change world-defining things live: Terrain, Vegetation, Sky, Weather, World and Creatures.
  - If anyone can change these, one guest can reshape the terrain for everyone mid-session.
  - Changing terrain-shaping settings after people have built can leave houses floating or buried, and forces every player to regenerate the world.
  - Sky, weather and time changes are harmless and cheap to share.
- **Recommended Default**: **A**. Only the owner changes settings.
  - Sky, weather and time-of-day changes are shared live.
  - **Terrain, vegetation and water shaping are locked once a world is published.** To change them, the owner exports the world and publishes it again as a new world.
  - Graphics settings always stay personal.
- **Options**:
  - [x] A — Owner changes sky/weather/time live; terrain-shaping locked after publishing (recommended)
  - [ ] B — Owner can change everything live, including terrain (risk of floating or buried builds)
  - [ ] C — Everything locked after publishing (no live changes at all)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Owner changes sky, weather and time live; terrain-shaping settings locked after publishing.

### Question 15: Communication in game (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Players need some way to coordinate.
  - **Text chat** is cheap to build (about 1–2 days). It brings message storage and limits, and needs moderation if worlds ever become public.
  - **Voice chat** is a large project with real costs.
  - For family playtests, most groups already use a phone call or a messaging app alongside the game.
- **Recommended Default**: **A**. No chat in v1. Use your usual voice or chat app. Text chat comes in a later phase if playtests show it's needed.
- **Options**:
  - [x] A — No chat in v1 (recommended)
  - [ ] B — Simple quick reactions only (wave, point, "come here" ping)
  - [ ] C — Simple text chat in v1 (not stored after the session)
  - [ ] D — Text chat with history saved in the world
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — No chat in v1.

### Question 16: Player collision (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Making players solid to each other means checking collisions against positions that arrive about 100–200 ms late. Players would bump into ghosts of where someone _was_, block doorways and stairs, and could trap each other. Passing through each other is standard for calm cooperative games.
- **Recommended Default**: **A**. Players pass through each other.
- **Options**:
  - [x] A — Players pass through each other (recommended)
  - [ ] B — Players are solid to each other
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Players pass through each other. (Left blank in the form; `Safe to decide now`, so the default applies.)

### Question 17: Avatar style (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: The game has no player body today, only a first-person camera, so remote players need a visible form.
  - A detailed animated character takes weeks, and costs rendering time with 20 players on screen.
  - Something too abstract makes it hard to tell who is who or which way they're facing.
  - The style should fit the game's stylised world.
- **Recommended Default**: **A**. A simple stylised figure (body, head, facing direction, simple walk bob) in a colour each player picks, with a floating name tag. All avatars drawn together cheaply.
- **Options**:
  - [x] A — Simple stylised figure + chosen colour + name tag (recommended)
  - [ ] B — Minimal marker only (floating orb or capsule + name tag)
  - [ ] C — Procedurally generated characters (later phase, using the creature system)
  - [ ] D — Detailed animated character in v1
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Simple stylised figure + chosen colour + name tag.

### Question 18: Spawn point (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: The single-player save stores one player position, and a shared world can't use one visitor's position as everyone's spawn. A bad choice leaves new players appearing in water, inside a building, or kilometres away from everyone else.
- **Recommended Default**: **A**. Each player returns to their own last position in that world. First-time visitors appear near the world's spawn point (set by the owner), moved to dry, open ground.
- **Options**:
  - [x] A — Your last position; first-timers at the world spawn (recommended)
  - [ ] B — Always at the world spawn
  - [ ] C — First-timers appear next to the owner (if online)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Your last position; first-timers at the world spawn.

### Question 19: Player cap per world (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: The cap is the number we test and promise.
  - Set it too high and an untested crowd could overload one world room or slow down weaker devices.
  - Set it too low and a family gathering hits "world full".
  - Raising the cap later is easy after a load test. Lowering it after people rely on it is awkward.
- **Recommended Default**: **B**. 20 players per world at launch, raised after Phase 5 load tests.
- **Options**:
  - [ ] A — 10
  - [x] B — 20 (recommended)
  - [ ] C — 30
  - [ ] D — No cap
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B — 20.

### Question 20: Mini Build designs in shared worlds (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: When you place one of your personal Mini Build designs in a shared world, the design has to travel with it, or others can't see it. Today worlds are self-contained: every design an object uses is stored inside the world. Keeping that rule means your design is visible to, and copyable by, others in that world. Breaking it would leave invisible objects for other players.
- **Recommended Default**: **A**. Designs are copied into the shared world when first placed. Your personal library is never uploaded as a whole.
- **Options**:
  - [x] A — Design copied into the world when placed (recommended)
  - [ ] B — Same as A, but other players can't copy it into their own library
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Design copied into the world when placed.

### Question 21: Undo and editing while disconnected

- **Status**: `Locked`
- **Why it matters**:
  - **Undo:** in single player, undo removes your last placement. In a shared world, undo must never remove someone else's work, or a change someone made on top of yours.
  - **Disconnects:** if you keep building while disconnected, those edits may conflict with what others did in the meantime. Replaying them could overwrite newer work. Silently dropping them loses yours.
- **Recommended Default**:
  - **Undo** removes only _your own_ last 5 builds. It is refused, with a message, if someone has changed that object since.
  - **While disconnected**, edits are held for up to 30 seconds or 50 edits and sent on reconnect. After that, building tools pause with a "Reconnecting…" banner. Long offline edits are never merged automatically.
- **Your Answer**: Recommended: undo only your own last 5 builds (refused if someone changed it since); 30 s offline grace, then building pauses.

---

## C. Hosting, cost and operations

### Question 22: Billing approach (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**:
  - The free Cloudflare plan costs £0, but **exceeding a daily limit stops the world working until midnight UTC**. It doesn't send a bill.
  - It's unverified how the free limit counts game messages. A forum report this month suggests it may cut off earlier than the docs imply.
  - The $5/month plan (about £3.75, or £4.50 with VAT) removes that risk, but costs $5 in **every** month it stays switched on, even with nobody playing.
  - Choose badly and either a family playtest dies mid-session, or you pay for idle months.
- **Recommended Default**: **A**.
  - Stay on Free during idle and development months.
  - Switch to Paid ($5) for any month with a group playtest or regular play.
  - Switch back to Free afterwards.
  - Phase 1 measures the free limit, so small playtests may turn out to be free too.
- **Options**:
  - [x] A — Free in idle/dev months; Paid only in months with group sessions (recommended)
  - [ ] B — Paid permanently from the first group playtest onwards (simplest; about £45/year)
  - [ ] C — Free only; accept the risk of a session stopping mid-way
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Free in idle/dev months; Paid ($5) only in months with group sessions.

### Question 23: Cloudflare account

- **Status**: `Locked`
- **Why it matters**:
  - The multiplayer server needs a Cloudflare account. **Free-plan limits are shared across everything on the account.**
  - If your account already runs other Workers (or will), they eat into the same daily caps and could knock the game offline, or vice versa.
  - The account owner also controls billing, the server secrets and the 30-day recovery.
- **Recommended Default**: Use a Cloudflare account dedicated to Forest Drift, or an existing one that runs no other Workers. Please tell me:
  1. whether you already have a Cloudflare account;
  2. whether it runs any Workers or other projects;
  3. whether it's personal or shared with anyone.
- **Your Answer**: No account yet: "I have no account and know nothing about Cloudflare; you must set it up for me." See follow-up F5 for what you'll need to do yourself and what I'll handle.

### Question 24: Server address (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: The game client connects to the server by address.
  - A custom address such as `mp.xanderwiles.com` looks tidier and survives a later change of host. However, it requires the `xanderwiles.com` DNS to be managed by Cloudflare, which may mean moving DNS away from its current provider. That is a risk to the whole website if done wrongly.
  - The free `*.workers.dev` address works immediately and touches nothing else.
- **Recommended Default**: **A**. `forest-drift-mp.<your-subdomain>.workers.dev` for v1. Revisit a custom domain later.
- **Options**:
  - [x] A — `*.workers.dev` address (recommended)
  - [ ] B — Custom subdomain on xanderwiles.com (I'll confirm where my DNS is managed)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — `*.workers.dev` address.

### Question 25: Where players are located (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Each world runs in **one** place. It's created near the first player and doesn't move. The plan places worlds in Western Europe for UK players, giving round trips of roughly tens of milliseconds. If some family members are in, say, Australia or the US West Coast, they will see more delay (up to about 250–300 ms). That's fine for a calm game, but building edits will feel slightly laggy for them. Knowing this now decides the placement hint and the delay targets.
- **Recommended Default**: **A**. Mostly UK and Europe; worlds are placed in Western Europe.
- **Options**:
  - [x] A — Mostly UK / Europe (recommended)
  - [ ] B — UK plus some players in North America
  - [ ] C — UK plus some players in Asia-Pacific / Australia
  - [ ] D — Spread worldwide
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Mostly UK / Europe.

### Question 26: Budget alert (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: The modelled costs are small (about £0–£5.33/month), but a bug can still generate unexpected usage, such as a client stuck sending messages in a loop. **Cloudflare budget alerts are notifications, not spending caps.** Without an alert you might not notice until the invoice. Set the threshold too low and the alerts become noise.
- **Recommended Default**: **B**. Email alert when the estimated monthly bill passes about £8 ($10). The in-game usage meter warns at 70% of the free daily limit.
- **Options**:
  - [ ] A — Alert above £5 ($7)
  - [x] B — Alert above £8 ($10) (recommended)
  - [ ] C — Alert above £15 ($20)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B — Alert above £8 ($10).

### Question 27: Backups (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**:
  - The server has built-in 30-day point-in-time recovery. That protects against mistakes and bugs, but it lives in the **same** Cloudflare account.
  - If the account is lost or locked, or a problem goes unnoticed for more than 30 days, the world is gone.
  - Local browser copies are a convenience cache, not a backup.
- **Recommended Default**: **A**. Built-in 30-day recovery, plus a weekly `.forestworld` export to Cloudflare R2 (free up to 10 GB), only written when something changed. Plus a manual "Export world" button for the owner. One restore drill before the first public session.
- **Options**:
  - [x] A — 30-day recovery + weekly export to R2 + manual export (recommended)
  - [ ] B — 30-day recovery + manual export only (I'll download backups myself)
  - [ ] C — 30-day recovery + weekly export to somewhere outside Cloudflare (for example Google Drive)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — 30-day recovery + weekly export to R2 + manual export.

### Question 28: Fallback host (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: The plan keeps the room logic portable, so it can move if Cloudflare fails our Phase 1 tests or changes its pricing. The fallback (Fly.io) has no free tier and requires a payment card. It costs about £0.17/month idle and about £0.94/month at regular use, and brings more maintenance. Deciding now avoids a stalled project if the Phase 1 measurements go badly.
- **Recommended Default**: **A**. If Cloudflare fails the Phase 1 tests, switch to Fly.io (London) with auto-stop, after confirming with you.
- **Options**:
  - [x] A — Fly.io as the fallback, confirmed with me before switching (recommended)
  - [ ] B — Cheap always-on VPS as the fallback (about £5.15/month fixed)
  - [ ] C — No fallback; stop and re-plan if Cloudflare fails
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Fly.io as the fallback, confirmed with me before switching.

---

## D. Engineering and release

### Question 29: Fixing terrain differences between browsers (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**:
  - Every player's browser generates the terrain itself from the seed. Some generator maths (`Math.tanh`, `Math.pow`, `Math.sin` and others) is allowed to differ by a tiny amount between Chrome, Safari and Firefox.
  - Heights wouldn't visibly change, but a river or lake could occasionally be placed differently on one player's screen.
  - If Phase 1 finds such a difference, fixing the maths may slightly change rivers or lakes in **existing** worlds, including your single-player saves. A lake could appear under a house you've already built.
- **Recommended Default**: **A**. Fix differences behind a new "generator version" that applies to newly created worlds only. Existing worlds keep their current terrain. Mixing browsers is fine in new worlds.
- **Options**:
  - [ ] A — Fix for new worlds only (new generator version); existing worlds unchanged (recommended)
  - [x] B — Fix everywhere, accepting small changes to existing worlds' rivers or lakes
  - [ ] C — Restrict multiplayer to one browser engine instead of fixing
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B — Fix everywhere, accepting small changes to existing worlds' rivers or lakes. **Overrides the recommended default.**

### Question 30: Mobile support at launch (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**:
  - Forest Drift already has touch controls, and family members will likely join on phones or tablets.
  - Mobile adds real work and testing. iOS Safari drops connections when the app is backgrounded, phones have less graphics headroom for 20 avatars, and every phase gets an extra test matrix.
  - Declaring desktop-only and then having half the family on phones would spoil the first playtest.
- **Recommended Default**: **A**. Desktop and mobile both supported at launch. Mobile is tested on one real iPhone and one Android device if available, with a lighter graphics preset on phones.
- **Options**:
  - [x] A — Desktop + mobile supported at launch (recommended)
  - [ ] B — Desktop first; mobile "best effort" (not blocking release)
  - [ ] C — Desktop only for multiplayer
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Desktop + mobile supported at launch.

### Question 31: Reference devices for performance

- **Status**: `Locked`
- **Why it matters**:
  - The release gate is "multiplayer may not slow the game noticeably": under 10% median frame-time increase, and at most 1 ms per frame on desktop or 2 ms on a phone.
  - That only means something on named devices.
  - If we test on a fast Mac alone, a family member on an older phone may get a slideshow with 20 avatars.
  - If we target the weakest device anyone owns, we may over-optimise.
- **Recommended Default**: Your development Mac (as used for the existing benchmarks), plus one specific phone that family members commonly use. Please name the phone model(s) and any older laptop or tablet that must work.
- **Your Answer**: M4 MacBook Air (desktop) and iPad Pro M4 (tablet), answered as follow-up F4. No phone was named; see the note under F4.

### Question 32: Where server code lives and how it deploys (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**:
  - The website builds with `build.js` and deploys on Vercel.
  - The multiplayer server deploys separately to Cloudflare with its own tool (Wrangler) and its own secrets.
  - Wiring it into `build.js` would make every website build need Cloudflare credentials, and could deploy server changes in the middle of a session, which drops everyone's connection.
  - Keeping it fully separate means one extra manual step when the server changes.
- **Recommended Default**: **A**. A separate package at `pages/Forest-Drift/server/` in this repo, deployed manually with `wrangler deploy`, outside play sessions. The website build is unchanged. A deploy workflow can be automated later.
- **Options**:
  - [x] A — `pages/Forest-Drift/server/`, manual `wrangler deploy` (recommended)
  - [ ] B — Same folder, but automated deploys via GitHub Actions from the start
  - [ ] C — A separate repository for the server
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — `pages/Forest-Drift/server/`, manual `wrangler deploy`.

### Question 33: Telemetry and analytics (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: To debug lag and disconnects we need some measurements: round-trip time, messages per second, reconnects, rejected edits and frame time. Third-party analytics adds privacy obligations (cookie consent, data processing) and another vendor. Collecting nothing makes playtest problems hard to diagnose afterwards.
- **Recommended Default**: **A**. No third-party analytics. Cloudflare's own logs, plus an in-game diagnostics panel (toggle) and a "copy diagnostics" button for bug reports. No personal data, invite tokens or names are written to logs.
- **Options**:
  - [x] A — Cloudflare logs + in-game diagnostics only (recommended)
  - [ ] B — Also send anonymous session summaries (duration, player count, average lag) to the server
  - [ ] C — Third-party analytics service
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Cloudflare logs + in-game diagnostics only.

---

## Anything else

### Question 34: Other requirements or constraints

- **Status**: `Locked`
- **Why it matters**: Anything not covered above can still change the design: a date for the first family playtest, specific features friends have asked for, places you never want multiplayer to appear, or budget limits beyond those modelled. Better to hear it before Phase 1 than after.
- **Recommended Default**: None. Leave blank if there's nothing to add.
- **Your Answer**: "It would be great if player movement was not stuttery or low FPS. In some multiplayer games other players' movement looks like it's running slower than the rest of the game; that's what I want to avoid. Apply smoothing, or look at how other games do it." Adopted as a release requirement: see **Requirement R1: smooth remote movement** below.

---

## Requirement R1: smooth remote movement (from Q34)

**Status:** `Locked`. This is a release requirement, not a nice-to-have.

**The problem you described.** Network updates arrive about 10 times a second, but the game draws 60 or more frames a second. If a remote avatar only moves when an update arrives, it visibly steps and looks like it's running at a lower frame rate than everything else. Snapping it to each new position, or letting its walk animation run at a different speed from its actual movement, makes it worse.

**How established games solve it.** The plan uses the same proven technique, _entity / snapshot interpolation_:

- **Move remote avatars every rendered frame, never only when a packet arrives.** Each avatar is drawn at a moment slightly in the past (about 100–150 ms), between two received positions. That way there is always a "before" and "after" to blend between.
- **Smooth curves, not straight lines.** Each update includes velocity, so positions are blended along a curve (Hermite interpolation). Turns and stops look natural, with no zig-zags or jerks at each update.
- **An adaptive jitter buffer.** The delay grows slightly when the network is uneven and shrinks when it's steady, so late packets don't cause hitches.
- **No snapping.**
  - If updates stop briefly, the avatar keeps going in a straight line for up to 250 ms.
  - Any correction is blended in over a few frames.
  - Only a real teleport (respawn) jumps instantly.
- **Animation matches movement.** Walk cycle and bob are driven by the avatar's _displayed_ speed, so feet never slide or "moon-walk".
- **Shared clock.** Updates carry the server's timestamp, so every client agrees when each position happened. Uneven arrival times don't change the motion.
- **Send rate tuned by measurement.** The baseline is 10 updates a second. If testing shows nearby players need more, the rate for close players rises to 15–20 per second. That costs pennies on the $5 plan.
- **Your own movement is never delayed.** The local player stays fully responsive, exactly as today.

**Acceptance tests** (added to Phase 1 and the Phase 4 release gate):

- Remote avatars update position on 100% of rendered frames. No frame repeats the previous position while the player is moving.
- At a steady walk, frame-to-frame speed varies by less than 10%, measured on the M4 MacBook Air with simulated 100 ms latency, jitter and 2% packet loss.
- No visible snap larger than 10 cm except on a teleport.
- The walk cycle's speed matches movement speed within 10%.
- Remote avatar work costs at most 0.3 ms per frame for 20 players.
- A side-by-side screen recording of a remote player next to the local player looks equally smooth (manual check).

**References** (classic, widely used write-ups):

- Glenn Fiedler, "Snapshot Interpolation": https://gafferongames.com/post/snapshot_interpolation/
- Gabriel Gambetta, "Entity Interpolation": https://www.gabrielgambetta.com/entity-interpolation.html
- Valve, "Source Multiplayer Networking": https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking

---

## Follow-up questions

These came out of your answers. All five were answered through the in-chat form on 2026-10-15.

### Question F1: Changing other people's objects (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: You chose full co-building (Q8-D), and "add to anyone's builds, delete only your own" (Q4-C). One case is still open: **changing** something that already exists and belongs to someone else. Examples: repainting their wall, moving their furniture, resizing their roof, restyling their fence.
  - If changes are allowed, two people can change the same thing at the same moment, and one change has to win.
  - If they're not allowed, co-building means adding only, and anyone who wants a change has to ask the creator.
  - Additions (a new window, a new wall) never conflict either way.
- **Recommended Default**: **A**. Anyone can add to and change anyone's objects; only the creator (or the owner) can delete them. If two people change the same detail at the same moment, the later change wins and the other person sees a brief "Sam changed this" notice. Separate details (one repaints, the other adds a window) both survive.
- **Options**:
  - [x] A — Add and change anything; delete only your own (recommended)
  - [ ] B — Add to anything; change and delete only your own
  - [ ] C — As A, but a creator can lock a building so only they (and the owner) can change it
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Add and change anything; delete only your own.

### Question F2: Deleting your own build when others have added to it (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Deleting a wall removes its windows and doors; deleting a foundation removes everything on it. With co-building, some of those additions may belong to other people. Q4-C protects other people's work from deletion, so we need a rule for when your delete would take their additions with it.
  - Blocking it can leave you stuck with a building you want gone.
  - Allowing it silently breaks the spirit of Q4-C.
- **Recommended Default**: **B**. Allowed, but a confirmation first lists whose work will also be removed ("This also removes 3 things Sam added"). The owner can still restore anything with the 30-day recovery.
- **Options**:
  - [ ] A — Blocked while it contains other people's additions (they, or the owner, must remove theirs first)
  - [x] B — Allowed after a confirmation that lists whose work will also be removed (recommended)
  - [ ] C — Allowed silently
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B — Allowed after a confirmation that lists whose work will also be removed.

### Question F3: Flight in multiplayer worlds (Q10, not answered in the form) (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**: Q10 came back blank. Flight (up to 600 m/s) lets players scatter far apart. Turning it off removes a feature players already enjoy. An owner toggle in v1 is a small extra.
- **Recommended Default**: **A**. Allowed, the same as single player; owner toggle later.
- **Options**:
  - [ ] A — Allowed; owner toggle later (recommended)
  - [ ] B — Owner toggle in v1
  - [x] C — Off in multiplayer worlds
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: C — Off in multiplayer worlds. **Overrides the recommended default.**

### Question F4: Phone for mobile testing

- **Status**: `Locked`
- **Why it matters**: You chose mobile support at launch (Q30-A), but the only reference device is the M4 MacBook Air. Phones have far less graphics headroom. Without a named phone, "works on mobile" can't be tested, and the first family playtest could be the first time anyone notices it stutters on a phone. Ideally name one iPhone and one Android device that you, or someone who'll playtest, can lend for testing.
- **Recommended Default**: The phone you use most, plus the oldest phone or tablet a family member will realistically play on.
- **Your Answer**: iPad Pro M4. Note: this is a high-end tablet, so it proves touch controls and tablet layout but not phone performance. A borrowed phone, or the lowest graphics preset as a stand-in, should be tried before the first family playtest.

### Question F5: Setting up Cloudflare (Multiple Choice)

- **Status**: `Locked`
- **Why it matters**:
  - **What you must do yourself:** create the Cloudflare account, verify the email, and approve the one-time Wrangler login in your browser. Signing up means choosing your own password and accepting Cloudflare's terms, and the account must belong to you, so I can't do those steps.
  - **What I'll do after that:** everything else. The `workers.dev` subdomain, the server project, configuration, secrets, deploying, budget alerts, and R2 backups.
  - **Payment:** Free needs no card. A card goes on the account only when you choose the $5 plan for a session month. R2 may need a payment method on file even within its free allowance (**U**); it's set up in Phase 4, when Paid is on anyway.
  - **When the account is needed:** Phase 1 can begin entirely on this Mac with no account. The account is needed when we first test on two different devices over the internet.
- **Recommended Default**: **A**. Start Phase 1 locally now. When we reach the first cross-device test, I'll give you a short step-by-step (about 5 minutes) to create the account, and then take it from there.
- **Options**:
  - [x] A — Start locally; walk me through creating the account when it's needed (recommended)
  - [ ] B — I'll create the account now; send me the steps
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A — Start locally; walk me through creating the account when it's needed.
