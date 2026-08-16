# Time Pass — Timeline View — Questions and Decisions

**Feature cycle:** 2026-08-16  
**Status:** **Locked** (2026-08-16) — pending your approval of [`02-technical-plan.md`](./02-technical-plan.md) before coding.  
**Related:** [`00-brief.md`](./00-brief.md) · [`02-technical-plan.md`](./02-technical-plan.md)

**Decision status legend:**

| Status | Meaning |
|--------|---------|
| `Needs user answer` | Blocks or strongly shapes the product — waiting on you |
| `Recommended default` | Sensible default if you want to defer; still changeable |
| `Safe to decide now` | Can be decided during implementation without your input |
| `Locked` | Confirmed from your answers |
| `Locked (default)` | Left blank; recommended default applied |

---

## Locked decision summary

| Q | Decision | Status |
|---|----------|--------|
| Q1 | **C** — Now-centered; scroll **up = future**, **down = past** | `Locked` |
| Q2 | **B** — Linear + min-gap + labeled compressed voids | `Locked` |
| Q3 | **A** — One marker per event at list primary instant | `Locked (default)` — left unchecked; confirm if wrong |
| Q4 | **B** — Toggle List ↔ Timeline; default **list** | `Locked` |
| Q5 | **C** — Gap-on-track **and** until/since on the marker | `Locked` |
| Q6 | **B** — Cluster same-instant names on one stem | `Locked` |
| Q7 | **B** — Finite event span + padded empty time at both ends | `Locked` |
| Q8 | **A** — Now scrolls away; Jump-to-now FAB when off-screen | `Locked` |
| Q9 | **B** — Firestore `eventsView` when signed in; session for guests | `Locked` |
| Q10 | **B** — When / Type / Category / Search; **no sort** | `Locked` |
| Q11 | **C** — No list bands; pin / this-week **badges** on chronological markers | `Locked` |
| Q12 | **B** — Tap opens the existing event modal | `Locked` |
| Q13 | **A** — **Pinch-zoom the time scale** (diverges from recommended C) | `Locked` |
| Q14 | **B** — Marker stays minimal; extras only in modal/list | `Locked` |
| Q15 | **A** — Timeline is not multi-select | `Locked` |
| Q16 | **B** — Year ticks on linear segments | `Locked` |
| Q17 | **B** — Richer guest-only demos; do not change first-sign-in seeds | `Locked` |
| Q18 | **B** — `t` toggles List ↔ Timeline | `Locked` |
| Q19 | **B** — Patch labels every tick; coarse re-layout; keep viewport time stable | `Locked` |
| Q20 | **A** — No hash/query routing | `Locked` |
| D1–D16 | Recommended defaults (no objections written) | `Locked (default)` |

---

## Locked from this brief (product intent)

| Item | Decision |
|------|----------|
| Product | New **vertical** timeline reading inside existing Time Pass |
| Stack | Unchanged: vanilla HTML/CSS/JS + Firebase CDN |
| Auth | Unchanged: Google; guest read-only demos |
| Backend | Event documents unchanged; settings gain optional `eventsView` (Q9) |
| Aesthetic | Glass; **no hover lift**; inline SVG icons |
| List | **Kept**; toggle with Timeline; default remains list (Q4) |
| Scale | Linear nearby + labeled compressed voids (Q2) **and** pinch-zoom (Q13) |
| Recurrence | One marker at the list primary instant (Q3 default) |

---

## Geometry and meaning

### Question 1: Vertical direction — which way is “up”?

- **Status**: `Locked`
- **Why it matters**: This is the spatial language of the whole feature. Get it wrong and every scroll gesture feels inverted.
- **Recommended Default**: **C**
- **Options**:
  - [ ] A — Future at the **top**, past at the **bottom** (countdown / approaching)
  - [ ] B — Past at the **top**, future at the **bottom** (document / feed)
  - [x] C — **Now-centered**: scroll **up = future**, scroll **down = past** (recommended)
  - [ ] D — Now-centered: scroll **up = past**, scroll **down = future**
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: C

### Question 2: Scale — how is “real relative distance” drawn?

- **Status**: `Locked`
- **Why it matters**: Nearby honesty vs multi-decade usability on a phone.
- **Recommended Default**: **B**
- **Options**:
  - [ ] A — **Strict linear** everywhere (1px = constant time). Zoom required for usability.
  - [x] B — **Linear + min gap + labeled compressed voids** (recommended)
  - [ ] C — **Logarithmic** from now (or from a chosen origin)
  - [ ] D — **Auto-zoom camera**: scale changes while scrolling so clusters open up and voids skip
  - [ ] E — Piecewise: linear **near now**, compressed **far away**
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B

### Question 3: Recurring events — what is a marker?

- **Status**: `Locked (default)`
- **Why it matters**: Exploding daily recurrences would drown the axis; one marker matches the list catalogue.
- **Recommended Default**: **A**
- **Options**:
  - [ ] A — **One marker per event** at the list’s primary instant (recommended)
  - [ ] B — Expand **all** occurrences inside the loaded time window (daily included)
  - [ ] C — Expand **yearly and monthly** in the window; keep daily/weekly as a single next/last marker
  - [ ] D — Show **two** markers for recurring events (last + next) and no further expansion
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: *(left unchecked — applying A. Object before coding if you wanted B/C/D.)*

### Question 4: Relationship to the list view?

- **Status**: `Locked`
- **Why it matters**: Navigation chrome and whether the current “what’s next / this week” home is kept.
- **Recommended Default**: **B**
- **Options**:
  - [ ] A — Timeline **replaces** the list as the only content view
  - [x] B — **Toggle**; default **list** (recommended)
  - [ ] C — Toggle; default **timeline**
  - [ ] D — Timeline is a **settings** / calculator-style separate page, not a peer of the list
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B

### Question 5: What do the distance labels measure?

- **Status**: `Locked`
- **Why it matters**: Inter-event gaps are new; until/since-now is what the list already teaches.
- **Recommended Default**: **C**
- **Options**:
  - [ ] A — **Only** gaps between consecutive markers
  - [ ] B — **Only** each marker’s distance to **now** (spatial list)
  - [x] C — **Both**: gap-on-track + until/since on the marker (recommended)
  - [ ] D — Gap-on-track; until/since only when the marker is selected / expanded
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: C

### Question 6: Events at the same instant (or closer than a label can fit)?

- **Status**: `Locked`
- **Why it matters**: Date-only events share midnight; ungrouped overlap looks like a bug.
- **Recommended Default**: **B**
- **Options**:
  - [ ] A — **Nudge** along the axis with min-gap (positions are slightly untrue)
  - [x] B — **Cluster** on one instant; stack names (recommended)
  - [ ] C — Alternate left/right of the axis with overlap allowed
  - [ ] D — Keep strict position; allow overlapping labels (user pinches to separate)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B

---

## Scrolling and now

### Question 7: How far can the user scroll? (“smart continuous scrolling”)

- **Status**: `Locked`
- **Why it matters**: Infinite empty centuries vs a hard stop at the last event.
- **Recommended Default**: **B**
- **Options**:
  - [ ] A — **Strict finite**: first event through last event, no extra empty time
  - [x] B — Finite event span + **padded** empty time at both ends (recommended)
  - [ ] C — **Extend-on-demand**: approaching the edge grows the window (empty years included)
  - [ ] D — **Infinite** in both directions (map of all civil time)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B

### Question 8: Now marker behaviour

- **Status**: `Locked`
- **Why it matters**: Sticky now fights “I am traveling in time”; now that scrolls away needs a way back.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Now **scrolls away**; Jump-to-now FAB when off-screen (recommended)
  - [ ] B — Now is **sticky** in the viewport; events flow past it
  - [ ] C — Now sticky **and** a Jump control (redundant but very explicit)
  - [ ] D — No dedicated now chrome; only gap labels / colours imply direction
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A

---

## App chrome and persistence

### Question 9: Remember List vs Timeline across visits?

- **Status**: `Locked`
- **Why it matters**: Synced last-view vs surprising device follow-along.
- **Recommended Default**: **B**
- **Options**:
  - [ ] A — Never persist; always open on the Q4 default
  - [x] B — Persist in Firestore settings when signed in; session for guests (recommended)
  - [ ] C — `localStorage` only (per browser, not synced)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B

### Question 10: Do list filters apply on the timeline?

- **Status**: `Locked`
- **Why it matters**: Sort contradicts a time axis; dropping filters silently looks like data loss.
- **Recommended Default**: **B**
- **Options**:
  - [ ] A — All list filters **and** sort (sort would fight the axis)
  - [x] B — When / Type / Category / Search; **no sort** (recommended)
  - [ ] C — Timeline ignores filters; always shows every event
  - [ ] D — Timeline has its own independent filter state
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B

### Question 11: Pinned and “This week’s events” on the timeline?

- **Status**: `Locked`
- **Why it matters**: List bands break chronology on purpose; the timeline must not lie about position.
- **Recommended Default**: **C**
- **Options**:
  - [ ] A — Keep Pinned + This week **bands** above the timeline (same as list)
  - [ ] B — Pinned band only; this-week stays chronological
  - [x] C — No bands; **badges** on chronological markers (recommended)
  - [ ] D — Omit pin/this-week entirely on this view
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: C

### Question 12: What happens on tap / click?

- **Status**: `Locked`
- **Why it matters**: Dense markers vs reaching the existing editor.
- **Recommended Default**: **B**
- **Options**:
  - [ ] A — Tap does nothing except focus for accessibility
  - [x] B — Tap opens the **existing event modal** (recommended)
  - [ ] C — Tap expands an in-place peek (units, date); Edit is a second control
  - [ ] D — Long-press to edit; tap only selects
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B

---

## Density, extra data, and extras

### Question 13: Zoom, pinch, or a scale slider?

- **Status**: `Locked`
- **Why it matters**: You chose **pinch-zoom** even with Q2 compressed voids. That is in scope: pinch changes `pxPerMs` around the gesture centroid so voids can **open** toward linear when zooming in. iOS custom-pinch vs browser zoom is the main implementation risk (see technical plan).
- **Recommended Default**: Was **C** (no pinch). **Overridden.**
- **Options**:
  - [x] A — Pinch-zoom the time scale
  - [ ] B — Buttons / slider only (no pinch)
  - [ ] C — **No zoom** in v1; rely on Q2 compression + density chips (recommended unless Q2=A)
  - [ ] D — Pinch **and** buttons
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A

### Question 14: Recurring extra stats on the timeline?

- **Status**: `Locked`
- **Why it matters**: Extra stats would destroy name + distance clarity.
- **Recommended Default**: **B**
- **Options**:
  - [ ] A — Render since-last / since-first / cycle on the marker
  - [x] B — Marker stays minimal; extras only in modal/list (recommended)
  - [ ] C — Show extras only when the marker is selected
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B

### Question 15: Multi-select / batch edit on the timeline?

- **Status**: `Locked`
- **Why it matters**: Multi-select stays list-only.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Timeline is **not** multi-select (recommended)
  - [ ] B — Same multi-select as list (checkboxes on markers)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A

### Question 16: Calendar axis ticks (2024, 2025, months)?

- **Status**: `Locked`
- **Why it matters**: Year ticks orient without competing with void labels.
- **Recommended Default**: **B**
- **Options**:
  - [ ] A — No ticks; only event names + gap labels
  - [x] B — **Year** ticks on linear segments (recommended)
  - [ ] C — Year + month ticks
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B

### Question 17: Should guest demo events be richer so the timeline is obvious?

- **Status**: `Locked`
- **Why it matters**: Two guest events cannot show voids, clusters, or past-vs-future.
- **Recommended Default**: **B**
- **Options**:
  - [ ] A — Keep current 2 guest events
  - [x] B — Richer **guest** set only (recommended)
  - [ ] C — Richer guest set **and** new first-sign-in seeds
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B

### Question 18: Keyboard shortcut to toggle the view?

- **Status**: `Locked`
- **Why it matters**: Desktop toggle without colliding `/`, `n`, `s`.
- **Recommended Default**: **B**
- **Options**:
  - [ ] A — No new shortcut
  - [x] B — `t` toggles timeline (recommended)
  - [ ] C — `l` list, `t` timeline (two keys)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B

### Question 19: When the clock ticks, may the layout move?

- **Status**: `Locked`
- **Why it matters**: Live now must not yank scroll.
- **Recommended Default**: **B**
- **Options**:
  - [ ] A — Full re-layout every tick (now crawls; risk of jitter)
  - [x] B — Patch labels every tick; re-layout coarsely; **keep viewport time stable** (recommended)
  - [ ] C — Freeze geometry until the user scrolls or switches view
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: B

### Question 20: Deep link to Timeline?

- **Status**: `Locked`
- **Why it matters**: No router today; hash would fight Q9.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — No hash/query (recommended)
  - [ ] B — `#timeline` / `#list` synchronized with the view
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here">
- **Your Answer**: A

---

## Safe to decide now (implementation defaults)

Left blank → **locked as recommended defaults.**

| ID | Locked default |
|----|----------------|
| D1 | `js/timeline-layout.js` (pure) + `js/timeline-view.js` (DOM) |
| D2 | Virtual scroller; never a naive billion-pixel element |
| D3 | No event-document schema change; settings may gain `eventsView` |
| D4 | Reuse `toViewModel` / occurrence window / `buildPrimaryView` / `formatRelativeCue` |
| D5 | `styles/timeline.css` |
| D6 | Own overflow scroller filling remaining viewport; document does not scroll in this view |
| D7 | Auth, rules, guest writes unchanged |
| D8 | Bump `sw.js` `CACHE_NAME` and add new assets |
| D9 | Glow-only hover; inline SVG; `prefers-reduced-motion` |
| D10 | Tick never writes Firestore; patch timeline when `view === 'timeline'` |
| D11 | Header Add stays; Jump-to-now FAB only (no second Add FAB) |
| D12 | Region + one-shot announce; no live-announce while scrolling |
| D13 | Round-trip `eventsView` in export/settings; missing → `list` |
| D14 | Settings/calculator/Esc return to last content view (`list` \| `timeline`) |
| D15 | `node --test` on layout module only |
| D16 | No horizontal mode, print, screenshot export, haptics, or “play time” |

---

## Next step

Approve [`02-technical-plan.md`](./02-technical-plan.md) (and confirm Q3 = **A** if that was intentional). **Do not start coding** until that approval.
