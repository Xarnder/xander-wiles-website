# Task Master — Task Tags: Questions and Decisions

**Feature cycle:** 2026-07-21  
**Status:** **Locked** (2026-07-21) — ready for phased implementation pending approval in [`02-technical-plan.md`](./02-technical-plan.md).

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
| Q1 | **A** — One tag per task (`tagId`); glow derived from tag | `Locked` |
| Q2 | **A** — `tagId` canonical; stop writing `glowColor` after cutover | `Locked` |
| Q3 | **A** — All existing tasks → Misc; ignore legacy `glowColor` | `Locked` |
| Q4 | **C** — Add 7th glow colour to palette | `Locked` |
| Q5 | **A** — Delete tag → reassign tasks to Misc | `Locked` |
| Q6 | **A** — Replace Edit Task glow picker with tag picker | `Locked` |
| Q7 | **A** — Tag Mode = intake only; no board filter | `Locked` |
| Q8 | **A** — Multi-edit batch `tagId` assignment | `Locked` |
| Q9 | **B** — Glow only on card; no on-card tag label | `Locked` |
| Q10 | **A** — Empty slot; user names tag on create | `Locked` |
| Q11 | **A** — Persist `settings.activeTagId` in Firestore (synced) | `Locked` |
| Q12 | **A** — Task Master + Story Manager full parity | `Locked` |
| Q13 | **A** — `aiTags` independent; no auto-assignment to `tagId` | `Locked` |
| Q14 | **A** — Search matches tag display name | `Locked` |
| D1–D10 | Safe defaults in table below | `Locked` |

---

## Locked from your brief (product intent)

| Item | Intent |
|------|--------|
| Max tags | 8 total — 1 Misc (built-in) + up to 7 custom |
| Misc | Always exists; no glow; default for existing tasks |
| Non-Misc tags | Each maps to a glow colour |
| Tag Mode UI | Coloured buttons above existing tool rows in `.app-header`; one always selected |
| New tasks | Assigned to whichever tag is selected in Tag Mode |
| Mobile | Tag row must stay very small — slim dock must not grow excessively |

---

## Data model & architecture

### Question 1: One tag per task or multiple tags?

- **Status**: `Locked`
- **Why it matters**: Glow is a **single** visual on each card today. Multiple tags per task would need chip UI, search/filter semantics, and multi-edit rules. One tag keeps the glow mapping 1:1 and matches “card glow maps to tag.” Choosing multiple tags without a primary tag makes glow ambiguous.
- **Recommended Default**: **One tag per task** (`tagId: string` on the task document).
- **Options**:
  - [x] A — **One tag per task** (`tagId`) — glow derived from that tag
  - [ ] B — Multiple tags (`tagIds: string[]`) — need rule for which tag drives glow
  - [ ] C — One primary tag + optional secondary labels (no glow for secondary)
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 2: Store tag on task vs keep `glowColor` as source of truth?

- **Status**: `Locked`
- **Why it matters**: **Tag-as-source** (`tagId` only, glow computed at render) avoids drift when a tag’s colour is changed in settings. **Dual fields** simplify migration but can desync. **Glow-only** ignores your tag-management requirement.
- **Recommended Default**: **A** — `tagId` on task; remove user-facing `glowColor` writes; keep `glowColor` read-only during migration then stop writing it.
- **Options**:
  - [x] A — **`tagId` is canonical**; glow computed from `settings.tags`; deprecate `glowColor` writes
  - [ ] B — Keep both `tagId` and `glowColor` in sync on every write
  - [ ] C — Keep `glowColor` only; tags are just presets that set glow
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 3: How to migrate existing tasks that already have a glow colour?

- **Status**: `Locked`
- **Why it matters**: Users who *did* use glow have semantic meaning attached to colours. **Map to auto-created tags** preserves intent but may create 6+ default tag names they did not choose. **Reset all to Misc** is simpler but destroys existing colour coding. **Map colour → nearest default tag slot** needs default tag names you approve.
- **Recommended Default**: **B** — On first load, auto-create tags for each glow colour in use (e.g. “Red”, “Blue”) up to cap; assign tasks accordingly; unused colour slots stay empty. Tasks with `glowColor: none` → Misc.
- **Options**:
  - [x] A — **All existing tasks → Misc** (ignore legacy `glowColor`)
  - [ ] B — Auto-create tags from colours in use; map tasks to matching tag
  - [ ] C — Auto-create 6 fixed default tags (you name them) on every account; map by colour
  - [ ] D — Prompt user once on upgrade to review mapping
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 4: Seven custom tags but only six glow colours — how do we handle the 7th?

- **Status**: `Locked`
- **Why it matters**: Your spec allows **7 custom + Misc = 8** tags, but only **6** hex glow values exist in `VALID_GLOW_COLORS`. Without a rule, the 7th tag cannot have a unique glow, breaking “all non-Misc tags map to a glow.”
- **Recommended Default**: **A** — Cap custom tags at **6** (7 tags total including Misc) **OR** allow 7 custom tags where **two may share the same glow colour** (buttons distinguished by name).
- **Options**:
  - [ ] A — Max **6 custom tags** (7 total with Misc) — matches glow palette exactly
  - [ ] B — Allow 7 custom tags; **two tags may share a glow colour**
  - [x] C — Add a **7th glow colour** to the palette (new hex — see A1 in technical plan)
  - [ ] D — 7th tag uses a **non-glow visual** (e.g. dashed border only)
  - [ ] Custom/Other:
- **Your Answer**: C

---

### Question 5: Deleting a custom tag that still has tasks?

- **Status**: `Locked`
- **Why it matters**: Orphan `tagId` values break glow resolution and Tag Mode display. **Reassign to Misc** is safe. **Block delete** forces user to retag first. **Force delete + orphan** causes invisible bugs.
- **Recommended Default**: **A** — Reassign all tasks with that `tagId` to Misc, then delete the tag.
- **Options**:
  - [x] A — **Reassign tasks to Misc**, then delete tag
  - [ ] B — Block delete until zero tasks use the tag
  - [ ] C — Require picking a replacement tag before delete
  - [ ] Custom/Other:
- **Your Answer**: A

---

## UI & interaction

### Question 6: Replace the Edit Task glow picker with a tag picker?

- **Status**: `Locked`
- **Why it matters**: Two controls for the same visual confuses users and risks desync. Removing glow picker commits fully to tags. Keeping both undermines “glow maps to tag.”
- **Recommended Default**: **A** — Remove `#glow-color-options`; show tag buttons or dropdown in edit modal.
- **Options**:
  - [x] A — **Replace glow picker** with tag picker only
  - [ ] B — Show both (tag picker + legacy glow picker)
  - [ ] C — Tag picker only; hide glow section entirely with no replacement (change tag elsewhere only)
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 7: Filter or highlight board by tag?

- **Status**: `Locked`
- **Why it matters**: Tag Mode today is proposed for **intake only** (which tag new tasks get). If Tag Mode also **filters** the board, tapping a tag hides other tasks — powerful but very different UX and more mobile complexity. Scope creep affects Kanban and search.
- **Recommended Default**: **A** — Tag Mode selects **active tag for new tasks only**; board shows all tasks (v1).
- **Options**:
  - [x] A — **Intake only** — selection affects new tasks, not visibility
  - [ ] B — **Filter mode** — selecting a tag filters board to those tasks (toggle?)
  - [ ] C — Separate filter control from Tag Mode
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 8: Multi-edit batch tag assignment?

- **Status**: `Locked`
- **Why it matters**: Multi-edit already batches glow colour. Users selecting many tasks will expect batch tag change. Omitting it leaves a parity gap.
- **Recommended Default**: **A** — Replace `#multi-glow-color-options` with tag buttons (same as single edit).
- **Options**:
  - [x] A — **Yes** — batch set `tagId` in multi-edit modal
  - [ ] B — No — change tags one task at a time in v1
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 9: Show tag name on the card (in addition to glow)?

- **Status**: `Locked`
- **Why it matters**: Glow-only is minimal but colour-blind users and shared-colour tags (Q4-B) need a text label. A chip adds height — conflicts with compact view goals.
- **Recommended Default**: **B** — Glow only on card; tag name visible in edit modal and Tag Mode bar (no on-card label in v1).
- **Options**:
  - [ ] A — **Small tag chip** on card (e.g. top-right)
  - [x] B — **Glow only** — no on-card text label
  - [ ] C — Tag label only in non-compact view
  - [ ] Custom/Other:
- **Your Answer**: B

---

### Question 10: Default names for new custom tags?

- **Status**: `Locked`
- **Why it matters**: Empty slots vs pre-filled names affect first-run UX and migration (Q3). Generic names (“Tag 1”) are ugly but clear. Category names you prefer may not fit all users.
- **Recommended Default**: **B** — New tags default to **“Tag 2”…“Tag 8”** (Misc is Tag 1 / “Misc”); user renames in settings.
- **Options**:
  - [x] A — **Empty slot** — user must name on create
  - [ ] B — Auto-name **“Tag N”** until renamed
  - [ ] C — Ship **6 preset names** you define (list them in Custom)
  - [ ] D — No empty slots — user clicks “+ Add tag” to create each
  - [ ] Custom/Other:
- **Your Answer**: A

**Implementation note (Q10=A):** No pre-created placeholder tags. Settings start with **Misc only**. User taps **“+ Add tag”** in options; a name is required before save. Max 7 custom tags.

---

### Question 11: Persist selected Tag Mode across sessions?

- **Status**: `Locked`
- **Why it matters**: Session-only resets to Misc every reload — safe default but annoying for “always adding Work tasks.” Persisting in `settings.activeTagId` syncs across devices (usually desired).
- **Recommended Default**: **A** — Persist `settings.activeTagId` in Firestore (synced).
- **Options**:
  - [x] A — **Persist in Firestore** `settings.activeTagId` (synced across devices)
  - [ ] B — **sessionStorage** only — resets on tab close
  - [ ] C — Always reset to Misc on load
  - [ ] Custom/Other:
- **Your Answer**: A — Firestore persistence is important

---

### Question 12: Story Manager parity?

- **Status**: `Locked`
- **Why it matters**: Story Manager loads the same `ui.js` / `main.js` via `<base href="/pages/To-Do-List/">`. Tags will appear there unless gated. Story workflows may not need tags.
- **Recommended Default**: **A** — Ship tags in **both** Task Master and Story Manager (same code path).
- **Options**:
  - [x] A — **Full parity** — tags in Task Master and Story Manager
  - [ ] B — Gate with `APP_CONFIG.enableTags` (Story Manager off)
  - [ ] C — Task Master only — fork UI (not recommended)
  - [ ] Custom/Other:
- **Your Answer**: A

---

## Data lifecycle & AI

### Question 13: Relationship between user tags and `aiTags`?

- **Status**: `Locked`
- **Why it matters**: Local AI writes `aiTags: string[]` on summarise. User tags are structured IDs. Merging could overwrite user intent; ignoring keeps them separate.
- **Recommended Default**: **A** — **Independent** — `aiTags` unchanged; no auto-assignment from AI to `tagId` in v1.
- **Options**:
  - [x] A — **Keep separate** — `aiTags` stays AI-only, hidden
  - [ ] B — AI suggests a user tag after summarise
  - [ ] C — Deprecate `aiTags` field
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 14: Include tags in search?

- **Status**: `Locked`
- **Why it matters**: Users will name tags meaningfully; search should find tasks by tag name. Low cost if tag names are in settings and resolved at search time.
- **Recommended Default**: **A** — Yes — `performSearch()` matches tag name for task’s `tagId`.
- **Options**:
  - [x] A — **Yes** — search matches tag display name
  - [ ] B — No in v1
  - [ ] Custom/Other:
- **Your Answer**: A

---

## Safe defaults (locked for implementation)

| ID | Decision | Status |
|----|----------|--------|
| D1 | Misc tag id: `tag_misc` (constant) | `Locked` |
| D2 | Tag definition shape: `{ id, name, glowColor: string \| null, order }` | `Locked` |
| D3 | `settings.tags` array on `users/{uid}.settings` | `Locked` |
| D4 | Max tag name length: 24 characters | `Locked` |
| D5 | Tag Mode: horizontal scroll, `flex-wrap: nowrap`, min button height ~28px | `Locked` |
| D6 | Misc button: neutral border, no glow ring; selected state = ring/outline | `Locked` |
| D7 | Auth model unchanged — Google sign-in, uid-scoped data | `Locked` |
| D8 | Firestore rules unchanged — client-trusted writes (same as today) | `Locked` |
| D9 | Bump `sw.js` `CACHE_NAME` on release | `Locked` |
| D10 | CSV export: replace Glow columns with Tag Name | `Locked` |

---

## Next step

Approve **Phase 1** in [`02-technical-plan.md`](./02-technical-plan.md) to begin implementation.
