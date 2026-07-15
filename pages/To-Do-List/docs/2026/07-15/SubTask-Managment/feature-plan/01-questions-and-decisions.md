# Task Master — Subtask Management: Questions and Decisions

**Feature cycle:** 2026-07-15  
**Status:** **Locked** (2026-07-15) — ready for phased implementation pending Phase 1 approval.

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
| Q1 | **A** — Enrich embedded `nestedIdeas` nodes | `Locked` |
| Q2 | **A** — Persistent `id` on every node | `Locked` |
| Q3 | **A** — Fully independent parent/subtask completion | `Locked` |
| Q4 | **B** — Max 3 levels visible on board | `Locked` |
| Q5 | **C** — Parent card stretches/spans Kanban columns | `Locked` |
| Q6 | **Custom** — Parent stretches / spans columns (same as Q5) | `Locked` |
| Q7 | **A** — Parent Finished independent of subtasks | `Locked` |
| Q8 | **C** — Prompt “Mark parent complete?” when all subtasks done | `Locked` |
| Q9 | **A** — Reorder siblings only (normal board) | `Locked` |
| Q10 | **A** — Search includes subtask text | `Locked` |
| Q11 | **A** — Keep subtasks hidden in compact view | `Locked` |
| Q12 | **A** — Task Master + Story Manager parity | `Locked` |
| Q13 | **A** — Full JSON backup/restore + import round-trip | `Locked` |
| Q14 | Google auth unchanged | `Locked` (default accepted) |
| Q15 | No Firestore rules change | `Locked` (default accepted) |
| D1–D8 | Safe defaults in table below | `Locked` |

---

## Data model & architecture

### Question 1: How should subtasks be stored?

- **Status**: `Locked`
- **Why it matters**: Foundational fork between embedded nodes vs promoted task documents.
- **Recommended Default**: A — Enrich embedded nodes.
- **Options**:
  - [x] A — **Enrich `nestedIdeas` nodes**
  - [ ] B — Promote subtasks to real task docs
  - [ ] C — Hybrid with manual promote
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 2: Stable identity for nested nodes

- **Status**: `Locked`
- **Options**:
  - [x] A — Persistent `id` on every node
  - [ ] B — Path-based keys
  - [ ] C — No stable id
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 3: Subtask `completed` vs parent `completed`

- **Status**: `Locked`
- **Options**:
  - [x] A — **Fully independent**
  - [ ] B — Independent + optional roll-up
  - [ ] C — Parent completion cascades to subtasks
  - [ ] D — Subtasks are source of truth (parent read-only)
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 4: Maximum nesting depth & UX

- **Status**: `Locked`
- **Options**:
  - [ ] A — Unlimited depth on board
  - [x] B — **Max 3 levels** on board; deeper in modal only
  - [ ] C — Max 2 levels
  - [ ] D — Flatten to 1 level on save
  - [ ] Custom/Other:
- **Your Answer**: B

---

## Kanban & Work Tools

### Question 5: Kanban model for subtasks

- **Status**: `Locked`
- **Options**:
  - [ ] A — No subtask Kanban columns; subtasks on parent card only
  - [ ] B — Independent `kanbanStatus` per subtask as mini-cards in columns
  - [x] C — **Parent stretches / spans columns** with incomplete subtasks at different stages
  - [ ] D — Roll-up only
  - [ ] E — Promote on stage move
  - [ ] Custom/Other:
- **Your Answer**: C

---

### Question 6: Parent placement when subtasks have stages

- **Status**: `Locked`
- **Options**:
  - [ ] A — Parent in each column with subtasks
  - [ ] B — Parent in one column; subtask stages visual-only
  - [ ] C — Parent header above columns
  - [ ] D — Hide parent; subtasks only
  - [ ] N/A
  - [x] Custom/Other: **Parent stretches / spans columns**
- **Your Answer**: Parent stretches / spans columns

---

### Question 7: Finished column + subtask checkboxes

- **Status**: `Locked`
- **Options**:
  - [x] A — **Parent Finished independent** of subtasks
  - [ ] B — Block Finished until all subtasks complete
  - [ ] C — Auto-complete all subtasks when parent → Finished
  - [ ] D — Auto-uncheck parent Finished if subtask unchecked
  - [ ] Custom/Other:
- **Your Answer**: A

---

## Move, reorder & scope

### Question 8: Roll-up when all subtasks are checked

- **Status**: `Locked`
- **Options**:
  - [ ] A — No roll-up
  - [ ] B — Auto-complete parent
  - [x] C — **Prompt** “Mark parent complete?”
  - [ ] D — Roll-up Kanban only
  - [ ] Custom/Other:
- **Your Answer**: C

---

### Question 9: What “move” means (normal board)

- **Status**: `Locked`
- **Options**:
  - [x] A — **Reorder siblings** under same parent
  - [ ] B — Reparent to another task
  - [ ] C — Promote to top-level task
  - [ ] D — A + C
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 10: Search & filter

- **Status**: `Locked`
- **Options**:
  - [x] A — Include subtask text in search
  - [ ] B — Parent text only
  - [ ] C — Separate toggle
  - [ ] Custom/Other:
- **Your Answer**: A

---

## UI, import & parity

### Question 11: Compact view behavior

- **Status**: `Locked`
- **Options**:
  - [x] A — **Keep hidden** in compact view (status quo)
  - [ ] B — Show incomplete subtasks in compact
  - [ ] C — Always show
  - [ ] D — User setting
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 12: Story Manager skin parity

- **Status**: `Locked`
- **Options**:
  - [x] A — Task Master + Story Manager
  - [ ] B — Task Master only
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 13: JSON backup, restore, and AI import

- **Status**: `Locked`
- **Options**:
  - [x] A — Full round-trip + import normalization
  - [ ] B — Backup only
  - [ ] C — Lazy migration only
  - [ ] Custom/Other:
- **Your Answer**: A

---

### Question 14: Auth model

- **Status**: `Locked`
- **Recommended Default**: No change — Google sign-in.
- **Your Answer**: _(default accepted)_

---

### Question 15: Firestore rules

- **Status**: `Locked`
- **Recommended Default**: No rules change for embedded model.
- **Your Answer**: _(default accepted)_

---

## Safe defaults summary (implement unless you override)

| ID | Default | Status |
|----|---------|--------|
| D1 | Native checkbox + label for subtasks | `Locked` |
| D2 | `completedAt` on subtask when checked | `Locked` |
| D3 | Strikethrough + muted style when completed | `Locked` |
| D4 | Checkbox click stops propagation (no edit modal) | `Locked` |
| D5 | Migration assigns `id`, `completed: false`, `kanbanStatus` on load | `Locked` |
| D6 | Warn if nested tree JSON > ~100KB | `Locked` |
| D7 | CSV export writes real subtask `completed` | `Locked` |
| D8 | No new npm dependencies | `Locked` |

---

## Next step

Approve **Phase 1** in [`02-technical-plan.md`](./02-technical-plan.md) (schema + migration only — no UI).
