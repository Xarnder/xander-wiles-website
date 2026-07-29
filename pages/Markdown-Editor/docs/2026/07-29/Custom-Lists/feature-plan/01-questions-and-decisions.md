# Custom Structured Lists — Questions and Decisions

**Feature cycle:** 2026-07-29  
**Status:** **Locked** — awaiting explicit coding approval  
**Related:** [`00-brief.md`](./00-brief.md) · [`02-technical-plan.md`](./02-technical-plan.md)

**Decision status legend:**

| Status | Meaning |
|--------|---------|
| `Needs user answer` | Blocks or strongly shapes implementation — waiting on you |
| `Recommended default` | Sensible default if you want to defer; confirm or override |
| `Safe to decide now` | Can be decided during implementation without your input |
| `Locked` | Confirmed from your answers |

---

## Locked decision summary

| Q | Decision | Status |
|---|----------|--------|
| Q1 | **A** — Fenced `mdlist` JSON block | `Locked` |
| Q2 | **A** — Always manual three-way toggle; remember last choice per file in `localStorage` | `Locked` |
| Q3 | **A** — Multiple named lists per file | `Locked` |
| Q4 | **B** — `score` + `tags` (string array) in v1 UI; preserve unknown keys | `Locked` |
| Q5 | **C** — Unbounded finite number for score | `Locked` |
| Q6 | **Custom** — Order by score; scores unique within a list; show score in UI | `Locked` |
| Q7 | **A** — Plain text item body only | `Locked` |
| Q8 | **A** — Vanilla pointer-event drag + up/down buttons | `Locked` |
| Q9 | **A** — Editor chrome segmented control (Custom \| Mixed \| Standard) | `Locked` |
| Q10 | **A** — No new npm/CDN dependencies | `Locked` |
| Q11 | **Both A+B** — Best-effort repair on open when safe; otherwise warn + raw Standard; never clobber unrepairable blocks | `Locked` |
| Q12 | **A** — Include `"version": 1` | `Locked` |
| Q13 | **A** — Any remaining view filter is view-only; full list always saved | `Locked` |
| Q14 | **A** — Standard = full-file textarea | `Locked` |
| Q15 | **A** — Add + Delete in custom UI (confirm on delete) | `Locked` |

### Q6 interpretation (locked intent)

Your answer: *“Order based on score, no score can be the same, show in UI.”*

Locked product rules for v1:

1. **Display order** follows **score** (not arbitrary file order alone).
2. **Scores must be unique** within each list (no two items share the same score).
3. **Score is shown** on each item in the structured UI.
4. Classic “min score threshold filter” from the recommended default is **replaced** by this ranked unique-score model (tag filtering may still exist — see remaining assumptions in the summary / `02`).

---

## How to use this file

1. ~~Answer each question~~ Done.  
2. Review locked summary + [`02-technical-plan.md`](./02-technical-plan.md).  
3. Approve coding in chat when ready.

---

## Syntax & data model

### Question 1: Custom list syntax container

- **Status**: `Locked`
- **Why it matters**: Wrong container collides with normal markdown, breaks other editors, or makes parse/serialize fragile. A vague format makes Mixed mode and round-trips unreliable.
- **Recommended Default**: **A** — Fenced code block with a dedicated language tag and JSON body, e.g. ` ```mdlist ` … ` ``` `.
- **Options**:
  - [x] A — **Fenced `mdlist` JSON block** (recommended) — machine-readable JSON array of items + metadata
  - [ ] B — **HTML comment envelope** — `<!-- mdlist:start -->` … YAML/JSON … `<!-- mdlist:end -->`
  - [ ] C — **Custom heading + bullet dialect** — e.g. `## @list ideas` then `- [score=7] text` lines
  - [ ] D — **YAML fenced block** — ` ```yaml mdlist` or similar
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

**Locked example:**

````markdown
# Notes

Intro paragraph stays normal markdown.

```mdlist
{
  "version": 1,
  "id": "ideas",
  "title": "Ideas",
  "items": [
    { "id": "i1", "text": "Ship custom lists", "score": 8, "tags": ["product"] },
    { "id": "i2", "text": "Add tags later", "score": 5, "tags": ["meta"] }
  ]
}
```

More normal markdown after.
````

---

### Question 2: Display mode UX (Custom / Standard / Mixed)

- **Status**: `Locked`
- **Why it matters**: Three modes can confuse on mobile if always manual. Auto Mixed is powerful but must not trap users who want raw text.
- **Recommended Default**: **B** (you chose **A** instead).
- **Options**:
  - [x] A — **Always manual three-way toggle** — Custom / Standard / Mixed; remember last choice per file in `localStorage`
  - [ ] B — **Auto Mixed when blocks detected** + explicit Standard (and Custom) toggles (recommended)
  - [ ] C — **Auto Custom if file is “only” custom lists**; else Mixed; Standard always available
  - [ ] D — **No Mixed UI** — either full Custom overlay or full Standard; Mixed only as file capability, not a mode
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 3: Multiple custom lists per file

- **Status**: `Locked`
- **Why it matters**: One-list-only simplifies UI but blocks real notes that have several ranked sections.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — **Multiple lists per file** (recommended)
  - [ ] B — **Single list per file only** (v1)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 4: First-pass sub-variables (metadata fields)

- **Status**: `Locked`
- **Why it matters**: Extensible metadata is a goal, but v1 field set drives UI density on iPhone.
- **Recommended Default**: **A** (you chose **B**).
- **Options**:
  - [ ] A — **`score` only** in UI (recommended); preserve unknown keys if present
  - [x] B — **`score` + `tags` (string array)** in v1
  - [ ] C — **`score` + freeform key/value editor** per item
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: B

---

### Question 5: Score semantics

- **Status**: `Locked`
- **Why it matters**: Filter/order controls depend on type.
- **Recommended Default**: **A** (you chose **C**).
- **Options**:
  - [ ] A — Integer **0–10** (recommended)
  - [ ] B — Integer **1–5**
  - [x] C — Unbounded number (any finite number)
  - [ ] D — Stars UI mapped to 1–5
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: C

---

### Question 6: Filter UX (v1)

- **Status**: `Locked` (custom)
- **Why it matters**: Filter/order rules define list UX and conflict with drag if unclear.
- **Recommended Default**: **A** — Min score threshold (superseded by your custom answer).
- **Options**:
  - [ ] A — **Min score threshold** + clear (recommended)
  - [ ] B — **Exact score** match
  - [ ] C — **Score range** (min + max)
  - [ ] D — Hide unscored / show only unscored toggle in addition to threshold
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: Order based on score, no score can be the same, show in UI

---

### Question 7: Item body content

- **Status**: `Locked`
- **Why it matters**: Nested markdown inside items forces a mini-renderer.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — **Plain text** only (recommended)
  - [ ] B — Plain text + basic inline markdown later (bold/links) — not in v1 UI
  - [ ] C — Full nested markdown per item in v1
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## Interaction & UI

### Question 8: Drag-to-reorder approach

- **Status**: `Locked`
- **Why it matters**: iPhone Safari drag is fiddly.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — **Vanilla pointer-event drag** + up/down buttons (recommended)
  - [ ] B — Allow a **small CDN drag library** (you pick / approve name later)
  - [ ] C — **No drag in v1** — only up/down buttons (ship filter + score first)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 9: Where the mode switch lives

- **Status**: `Locked`
- **Why it matters**: Must not steal Finder/Edit/Settings tabs.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — **Editor chrome** segmented control: Custom | Mixed | Standard (recommended)
  - [ ] B — Buttons in **nav-actions** strip (above app tabs) when Edit is active
  - [ ] C — Settings-only preference + auto detection (no per-session switch)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 10: New dependencies (npm / CDN)

- **Status**: `Locked`
- **Why it matters**: Dependency-light static app.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — **No new deps** (recommended)
  - [ ] B — Allow **one** small approved library (name it in Your Answer)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 15: Add / delete list items in custom UI

- **Status**: `Locked`
- **Why it matters**: Structure edits without leaving Custom UI.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — **Add + Delete** in custom UI (recommended)
  - [ ] B — **Add only**; delete via Standard/raw edit
  - [ ] C — **Neither** in v1 — reorder + score + filter only; structure via Standard
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## Reliability & edge behavior

### Question 11: Invalid or unsupported custom blocks

- **Status**: `Locked`
- **Why it matters**: Corrupt JSON must never blank the file.
- **Recommended Default**: **A** (you chose **Both A and B**).
- **Options**:
  - [x] A — Warn + raw Standard editable; do not clobber invalid block (recommended)
  - [x] B — Attempt best-effort repair on open
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: Both

**Locked repair policy:** Attempt safe repairs (e.g. missing item `id`, missing/empty `tags` → `[]`, coerce numeric score strings). If the block is still invalid/untrusted, warn and keep raw Standard editable; **do not** overwrite Drive content with a guessed repair until the user successfully edits/saves via structured UI or Standard.

---

### Question 12: Schema version field

- **Status**: `Locked`
- **Why it matters**: Future schema gate.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Include `version` (recommended)
  - [ ] B — No version field in v1
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 13: Filtering vs persistence

- **Status**: `Locked`
- **Why it matters**: Hiding items must not delete on Save.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Filter is view-only (recommended)
  - [ ] B — “Commit filter” action that deletes hidden items (explicit, dangerous — not recommended for v1)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 14: What Standard mode shows

- **Status**: `Locked`
- **Why it matters**: Escape hatch for raw fences.
- **Recommended Default**: **A**
- **Options**:
  - [x] A — Full-file textarea (recommended)
  - [ ] B — Standard strips/hides custom blocks (not recommended)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## After lock

1. ~~Mark questions `Locked`~~ Done  
2. ~~Align [`02-technical-plan.md`](./02-technical-plan.md)~~ Done  
3. **Wait** for your explicit approval before writing implementation code
