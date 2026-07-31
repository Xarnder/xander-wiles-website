# Time-Pass — Questions and Decisions

**Feature cycle:** 2026-07-30  
**Status:** **Locked** (2026-07-30) — ready for phased implementation pending your approval of [`02-technical-plan.md`](./02-technical-plan.md).  
**Related:** [`00-brief.md`](./00-brief.md) · [`02-technical-plan.md`](./02-technical-plan.md)

**Decision status legend:**

| Status | Meaning |
|--------|---------|
| `Needs user answer` | Blocks or strongly shapes implementation — waiting on you |
| `Recommended default` | Sensible default if you want to defer |
| `Safe to decide now` | Can be decided during implementation without your input |
| `Locked` | Confirmed from your answers |

---

## Locked decision summary

| Q | Decision | Status |
|---|----------|--------|
| Q1 | **A** — Keep Countdown and Time-Pass separate | `Locked` |
| Q2 | **A** — Homepage card in the same cycle | `Locked` |
| Q3 | **A** — Display name **Time Pass** | `Locked` |
| Q4 | **A** — Vanilla static HTML/CSS/JS + Firebase CDN | `Locked` |
| Q5 | **B** — Firebase Auth (Google) + Cloud Firestore | `Locked` |
| Q5a | **C** — **New dedicated** Firebase project for Time-Pass | `Locked` |
| Q5b | **B** — Guest preview: sample **read-only** demo events (not saved) | `Locked` |
| Q5c | **A** — Enable Firestore offline persistence | `Locked` |
| Q5d | **A** — Any Google account may sign in | `Locked` |
| Q6 | **A** — Full PWA (manifest + service worker) | `Locked` |
| Q7 | **A** — Date-only = start of day `00:00:00` in effective TZ | `Locked` |
| Q8 | **A** — Blank TZ → browser local timezone | `Locked` |
| Q9 | **A** — Per-event optional TZ | `Locked` |
| Q10 | **A** — Full units: decades → seconds | `Locked` |
| Q11 | **A** — Calendar-aware civil date math | `Locked` |
| Q12 | **A** — **Per event only** unit preferences (no user global defaults) | `Locked` |
| Q13 | **A** — Hide leading zero large units; keep smaller | `Locked` |
| Q14 | **Custom** — Weekly recurrence on **Monday**; weeks start Monday | `Locked` |
| Q15 | **A** — Clamp to last valid day of month / Feb 28 non-leap | `Locked` |
| Q16 | **A** — Infinite recurrence only in v1 | `Locked` |
| Q17 | **A** — One-shots keep counting up forever | `Locked` |
| Q18 | **A** — Filters: direction + recurring + search | `Locked` |
| Q19 | **A** — Sort: upcoming soonest, then past most recent | `Locked` |
| Q20 | **A** — Curated colour palette only (no custom hex) | `Locked` |
| Q21 | **A** — Seed 1–2 demo events on **first sign-in** (Firestore writes) | `Locked` |
| Q22 | **A** — Font: **Outfit** | `Locked` |
| Q23 | **A** — Midnight blue + cyan accents | `Locked` |
| Q24 | **A** — Adaptive tick interval | `Locked` |
| Q25 | **A** — JSON export/import in v1 | `Locked` |
| Q26 | **A** — Confirm before delete | `Locked` |
| Q27 | **A** — Soft warn 100 / hard stop 250 | `Locked` |
| D1–D15 | Safe defaults below | `Locked` |

---

## Locked from this brief (product intent)

| Item | Decision |
|------|----------|
| Product | Multi-event countdown / count-up under `pages/Time-Pass/` |
| Auth | Google via Firebase Authentication |
| Backend | Cloud Firestore, uid-scoped, **dedicated new Firebase project** |
| Aesthetic | Futuristic Antigravity Glassmorphism; **no hover lift** |
| Recurrence | daily / weekly (**Monday**) / monthly / yearly; next + last |
| Guest | Read-only sample preview when signed out |
| PWA | Manifest + service worker |

---

## Product scope & relationship to Countdown

### Question 1: Relationship to existing `pages/Countdown/`?

- **Status**: `Locked`
- **Why it matters**: Countdown is a hard-coded mystery cinematic page (no auth). Time-Pass is a signed-in personal multi-event tool.
- **Recommended Default**: **A** — Keep separate.
- **Options**:
  - [x] A — Keep **separate** apps (recommended)
  - [ ] B — Replace Countdown with Time-Pass (retire mystery page)
  - [ ] C — Time-Pass private/unlisted; Countdown stays the public “countdown”
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 2: Homepage discoverability?

- **Status**: `Locked`
- **Why it matters**: Without a homepage card, the app is only reachable by URL.
- **Recommended Default**: **B** — Ship app first.
- **Options**:
  - [x] A — Add homepage card in the same cycle
  - [ ] B — App only (no homepage card yet)
  - [ ] C — Add to hidden / tools section only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 3: App display name?

- **Status**: `Locked`
- **Why it matters**: Title, OG text, homepage card, PWA name.
- **Recommended Default**: **Time Pass**.
- **Options**:
  - [x] A — **Time Pass**
  - [ ] B — **Time-Pass** (hyphenated everywhere)
  - [ ] C — Something else
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## Stack, Firebase project & auth

### Question 4: Implementation stack?

- **Status**: `Locked`
- **Why it matters**: Folder layout, Firebase CDN vs npm, build steps.
- **Recommended Default**: **A** — Vanilla + Firebase CDN.
- **Options**:
  - [x] A — **Vanilla static** HTML + CSS + JS modules + Firebase CDN
  - [ ] B — **Vite + React**
  - [ ] C — **SvelteKit**
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 5: Persistence backend?

- **Status**: `Locked`
- **Why it matters**: Google login requires cloud identity + sync.
- **Options**:
  - [x] B — **Firebase Auth + Firestore**
  - [ ] A — Browser only — *rejected*
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: Firebase Auth (Google sign-in) + Cloud Firestore

---

### Question 5a: Which Firebase project?

- **Status**: `Locked`
- **Why it matters**: New project isolates billing/rules; requires Console setup + config values before Auth works in prod.
- **Recommended Default**: Was A (reuse To-Do List project).
- **Options**:
  - [ ] A — Reuse **To-Do List project** `taskmaster-cloud-xander`
  - [ ] B — Reuse **Work Tracker** / Journal project
  - [x] C — Create a **new dedicated** Firebase project for Time-Pass
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: C

**Implementation note:** Scaffold `firebase-config.js` with placeholders / env overrides; `README.md` documents creating the project, enabling Google Auth, authorized domains, and deploying `firestore.rules`. Coding can start on UI/engine before live credentials exist; Auth/Firestore integration needs the project config.

---

### Question 5b: Signed-out experience?

- **Status**: `Locked`
- **Why it matters**: Guest preview must be clearly read-only and never written to Firestore.
- **Options**:
  - [ ] A — **Login wall** only
  - [x] B — Guest preview with sample/read-only demo events (not saved)
  - [ ] C — Guest local events that merge on sign-in
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: B

---

### Question 5c: Firestore offline persistence?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Enable** Firestore offline persistence
  - [ ] B — Online-only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 5d: Who may sign in?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Any Google account**
  - [ ] B — Allowlist only
  - [ ] C — Testing mode only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 6: Offline / PWA install?

- **Status**: `Locked`
- **Options**:
  - [x] A — Full PWA (manifest + service worker, offline shell)
  - [ ] B — Manifest + icons only
  - [ ] C — Neither
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## Date, time, and timezone model

### Question 7: Date-only events — what instant do we use?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Start of day** (`00:00:00`) in effective timezone
  - [ ] B — End of day
  - [ ] C — Noon
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 8: Default timezone when user leaves TZ blank?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Browser local** timezone
  - [ ] B — Fixed `Europe/London`
  - [ ] C — Require timezone always
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 9: Per-event vs global timezone?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Per-event optional** TZ (blank → browser local)
  - [ ] B — Global setting only
  - [ ] C — Per-event required always
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## Units & display math

### Question 10: Which units are in scope for v1?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Full set**: decades → seconds
  - [ ] B — Skip decades
  - [ ] C — Skip seconds by default
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 11: How should years / months / decades be calculated?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Calendar-aware** civil date math
  - [ ] B — Fixed averages
  - [ ] C — Days-only core
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 12: Unit preferences — per event, global, or both?

- **Status**: `Locked`
- **Why it matters**: **Per event only** means no `defaultUnits` in user settings; each event stores its own `units` array. New events are created with an **app constant** default unit set (all units enabled) that the user can change per event.
- **Options**:
  - [x] A — **Per event only**
  - [ ] B — Global only
  - [ ] C — Global defaults + per-event override
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 13: Default visible units rule?

- **Status**: `Locked`
- **Options**:
  - [x] A — Hide leading zero **large** units; keep smaller units
  - [ ] B — Always show every enabled unit
  - [ ] C — Top N non-zero only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## Recurrence

### Question 14: Weekly recurrence — which weekday?

- **Status**: `Locked`
- **Why it matters**: You chose **Monday start of the week** instead of anchoring to the event’s weekday.
- **Interpretation (locked):**
  1. **Weekly recurrence** — next/last occurrences fall on **Mondays** (same local time-of-day as the event, or `00:00:00` if date-only).
  2. **Week unit math** — week boundaries use **Monday start** (ISO-8601-style).
- **Options**:
  - [ ] A — Anchor weekday from the event’s date
  - [ ] B — User picks weekday explicitly
  - [ ] C — Both
  - [x] Custom/Other: Monday start of the week
- **Your Answer**: Monday start of the week

---

### Question 15: Monthly / yearly — short months and Feb 29?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Clamp** to last day of month
  - [ ] B — Skip invalid
  - [ ] C — Roll forward
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 16: Recurrence end / limits?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Infinite only** in v1
  - [ ] B — Optional end date
  - [ ] C — End date or count
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 17: One-shot events after they pass?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Keep counting up** forever
  - [ ] B — Auto-archive
  - [ ] C — Archive-when-passed flag
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## Filters, list UX, colour

### Question 18: Which filters in v1?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Direction + recurring + search**
  - [ ] B — Also colour
  - [ ] C — Search only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 19: Default sort order?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Upcoming soonest**, then **past most recent**
  - [ ] B — Absolute proximity
  - [ ] C — Manual drag-reorder
  - [ ] D — Alphabetical
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 20: Colour picker style?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Curated palette only**
  - [ ] B — Palette + custom hex
  - [ ] C — Native color input only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 21: Seed data / empty state?

- **Status**: `Locked`
- **Why it matters**: First signed-in empty account gets **1–2 demo events written to Firestore** (flagged via settings so it runs once). Distinct from guest read-only samples (Q5b).
- **Options**:
  - [x] A — Seed 1–2 demo events on first sign-in (Firestore writes)
  - [ ] B — Empty state + Add CTA only
  - [ ] C — Opt-in “Load examples”
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## Visual design specifics

### Question 22: Primary UI font?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Outfit**
  - [ ] B — Montserrat
  - [ ] C — Inter
  - [ ] D — Split faces
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 23: Accent atmosphere hue?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Midnight blue + cyan** accents
  - [ ] B — Purple-dominant
  - [ ] C — Dual theme toggle
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 24: Tick / live update interval?

- **Status**: `Locked`
- **Options**:
  - [x] A — Adaptive interval
  - [ ] B — Always 1s
  - [ ] C — Always 1 minute
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## Data hygiene & extras

### Question 25: Export / import JSON backup?

- **Status**: `Locked`
- **Options**:
  - [x] A — **Yes** — JSON export/import
  - [ ] B — No in v1
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 26: Delete confirmation?

- **Status**: `Locked`
- **Options**:
  - [x] A — Confirm before delete
  - [ ] B — Soft delete / archive
  - [ ] C — Immediate delete
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 27: Max events soft cap?

- **Status**: `Locked`
- **Options**:
  - [x] A — Soft warn 100 / hard stop 250
  - [ ] B — No cap
  - [ ] C — Hard stop 50
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## Safe defaults (locked)

| ID | Decision | Status |
|----|----------|--------|
| D1 | Event ids: `crypto.randomUUID()` as Firestore doc ids | `Locked` |
| D2 | `schemaVersion: 1` on settings doc | `Locked` |
| D3 | Name max length 80 characters | `Locked` |
| D4 | `prefers-reduced-motion: reduce` → static orbs | `Locked` |
| D5 | Accessible summary at most once per minute | `Locked` |
| D6 | No analytics SDK in v1 | `Locked` |
| D7 | Favicon pack cloned from site standard | `Locked` |
| D8 | Hover: glow only — **no** lift | `Locked` |
| D9 | Slider tracks thicker than thumb; end padding | `Locked` |
| D10 | Home escape link to site root | `Locked` |
| D11 | Auth: Google provider only | `Locked` |
| D12 | Auth persistence: `browserLocalPersistence` | `Locked` |
| D13 | Sign-in: popup first, redirect fallback | `Locked` |
| D14 | No Cloud Functions in v1 | `Locked` |
| D15 | Authorized domains: `xanderwiles.com` + localhost on **new** project | `Locked` |
| D16 | App-constant default units for new events = full set (Q10); user edits per event | `Locked` |
| D17 | Settings flag `hasSeededDemo: true` after first-sign-in seed (Q21) | `Locked` |
| D18 | Colour palette: 8–12 neon/glass hexes defined in code; reject other values on write | `Locked` |
| D19 | Firestore paths on dedicated project: `users/{uid}/events/{eventId}` + `users/{uid}/settings/app` | `Locked` |
| D20 | Bump `sw.js` `CACHE_NAME` on each release | `Locked` |

---

## Remaining assumptions (not blocking approval)

| Item | Assumption | Needs from you before Auth works in prod |
|------|------------|------------------------------------------|
| Firebase credentials | New project not created yet | Create project, enable Google Auth, paste web config into `firebase-config.js` / env |
| Demo event copy | Seed/guest samples use placeholder names/dates | Optional: prefer specific demo events |
| Homepage card placement | Near Countdown / utilities section | Optional: exact homepage section preference |
| Weekly Monday time | Monday at event’s time (or 00:00 date-only) | Confirm if wrong |

---

## Next step

Approve **Phase 1** in [`02-technical-plan.md`](./02-technical-plan.md) to begin implementation (scaffold + glass shell + guest preview). Provide Firebase web config when ready for Auth/Firestore phases.
