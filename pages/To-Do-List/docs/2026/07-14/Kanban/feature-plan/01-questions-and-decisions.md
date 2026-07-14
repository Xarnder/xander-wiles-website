# Task Master — Work Tools / Kanban: Questions and Decisions

**Feature cycle:** 2026-07-14  
**Status:** Locked (2026-07-14) — ready for implementation pending approval of Phase 1.

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
| Q1 | **A** — User-global `settings.workToolsEnabled` | `Locked` |
| Q2 | **A** — Persist `kanbanStatus` on each task document | `Locked` |
| Q3 | **A** — Finished ↔ `completed` synced both ways | `Locked` |
| Q4 | **A** — New → `new`; existing completed → `finished`, else `new` | `Locked` |
| Q5 | **A** — Global `kanbanStatus` on task (shared across linked lists) | `Locked` |
| Q6 | **A** — Session-only `focusedKanbanListId` | `Locked` |
| Q7 | **A** — Do not render other lists while focused | `Locked` |
| Q8 | **A** — List header Kanban icon button | `Locked` |
| Q9 | **A** — Stage drag + within-column reorder; no cross-list; prefer custom sort in focus | `Locked` |
| Q10 | **B** — Fixed four keys; **user-editable display names** | `Locked` |
| Q11 | **A** — Horizontal scroll of four columns on mobile | `Locked` |
| Q12 | **B** — Task Master **+ Story Manager** (not beta in same change) | `Locked` |
| Q13 | **B** — Keep pin tray **above all columns** in Kanban | `Locked` |
| Q14 | **A** — No change to time automation; default stage on arrival | `Locked` |
| Q15 | **A** — Kanban mutually exclusive with archive + recent-completed | `Locked` |
| Q16 | **A** — Include `kanbanStatus` in JSON backup/restore; CSV later | `Locked` |
| D1–D10 | Safe defaults accepted (no objections) | `Locked` |

---

## Product & data model

### Question 1: Work Tools scope

- **Status**: `Locked`
- **Why it matters**: Decides whether enabling Work Tools affects every board/list for the account, or only some contexts. Global is simplest and matches other settings (`autoArchive`, `showNumbers`). Board- or list-level toggles add UI and storage complexity; choosing wrong may surprise you when switching boards.
- **Recommended Default**: **User-global** setting `settings.workToolsEnabled` (same pattern as other App Options toggles). When on, every list on every board shows the Kanban button.
- **Options**:
  - [x] A — User-global (recommended): one toggle in App Options
  - [ ] B — Per-board: Work Tools only on selected boards
  - [ ] C — Per-list: enable Work Tools on individual lists (e.g. in Edit List)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — User-global

---

### Question 2: How should kanban columns map to data?

- **Status**: `Locked`
- **Why it matters**: This is the core architecture choice. A **persisted stage field** syncs across devices and survives refresh. **View-only grouping** is simpler but loses column placement on reload unless mirrored elsewhere. **Creating four real lists** reuses move-between-lists but pollutes the board and conflicts with “hide other lists.” A bad choice creates dual sources of truth or data you cannot roll back cleanly.
- **Recommended Default**: **Persisted `kanbanStatus` on each task**, enum: `new` \| `under_review` \| `almost_done` \| `finished`. Default existing tasks to `new` (or derive from `completed` — see Q3). Dragging between columns writes Firestore. Kanban view filters the focused list’s `taskIds` into four buckets by status.
- **Options**:
  - [x] A — Persist `kanbanStatus` on the task document (recommended)
  - [ ] B — Persist per-list placement map on the list doc (e.g. `kanbanColumns: { new: [], … }`) separate from `taskIds` order
  - [ ] C — View-only: group by heuristics (`completed` → Finished, else New); no new field; drag does not persist stage
  - [ ] D — Materialize four sibling lists when entering Kanban (heavy; not recommended)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Persist `kanbanStatus` on the task document

---

### Question 3: How does “Finished” relate to `completed` / `archived`?

- **Status**: `Locked`
- **Why it matters**: Tasks already have checkbox completion and archive. If Finished is independent, users see “finished but unchecked” weirdness. If moving to Finished auto-completes, casual checkbox use and Kanban stay aligned — but exiting Finished must decide whether to uncomplete. Wrong coupling breaks auto-archive, daily completed counts, and clear-completed broom.
- **Recommended Default**: **Moving to Finished sets `completed: true`** (and `completedAt`). Moving out of Finished sets `completed: false` and clears `completedAt`. Archive remains separate (broom / archive mode). Optional: when Work Tools is off, ignore `kanbanStatus` in UI but keep field.
- **Options**:
  - [x] A — Finished ↔ completed synced both ways (recommended)
  - [ ] B — Finished is independent of completed (two concepts)
  - [ ] C — Finished only means completed; no separate stage write — “Finished” column = `completed === true`
  - [ ] D — Moving to Finished also archives immediately
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Finished ↔ completed synced both ways

---

### Question 4: Default stage for existing and new tasks

- **Status**: `Locked`
- **Why it matters**: On first enable, thousands of existing tasks need a bucket. New tasks need a default. Mapping all completed → Finished and rest → New is intuitive; putting everything in New forces manual triage.
- **Recommended Default**: **New tasks → `new`**. **Existing:** if `completed === true` → `finished`, else → `new`. Missing/undefined field treated as `new` (or finished if completed).
- **Options**:
  - [x] A — New → `new`; existing completed → `finished`, else `new` (recommended)
  - [ ] B — Everything starts in `new` (ignore completed for placement)
  - [ ] C — Lazy migrate on first Kanban open per list (write statuses then)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — New → `new`; existing completed → `finished`, else `new`

---

### Question 5: Is kanban stage global per task or per-list?

- **Status**: `Locked`
- **Why it matters**: Tasks can be **linked** across lists (same task id in multiple `taskIds`). A single `kanbanStatus` on the task means List B’s Kanban shows the same stage as List A. Per-list stage needs a map keyed by listId. Wrong choice breaks linked-task workflows or duplicates state.
- **Recommended Default**: **Global on the task** (`kanbanStatus`) — one pipeline position per task. Linked appearance in another list shares the stage. Document this in UI if needed.
- **Options**:
  - [x] A — Global `kanbanStatus` on task (recommended)
  - [ ] B — Per-list map, e.g. `kanbanStatusByList: { [listId]: stage }`
  - [ ] C — Disallow Kanban for linked tasks / show read-only in secondary lists
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Global `kanbanStatus` on task

---

## Focus mode & UX

### Question 6: Persist “which list is in Kanban focus”?

- **Status**: `Locked`
- **Why it matters**: Session-only focus is simpler and avoids sticky empty boards after reload. Persisting focus restores work context across refresh/devices but can confuse if you left Kanban open days ago.
- **Recommended Default**: **Session-only** (in-memory `state.focusedKanbanListId`), like `compactView` / archive mode. Refresh returns to normal board; Work Tools setting itself remains persisted.
- **Options**:
  - [x] A — Session-only focus (recommended)
  - [ ] B — Persist focus per board in Firestore or localStorage
  - [ ] C — Persist focus in localStorage only (device-local)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Session-only focus

---

### Question 7: How should “other lists disappear”?

- **Status**: `Locked`
- **Why it matters**: Affects CSS/layout and Sortable list-reorder. Hard-hide (not in DOM) is cleanest for focus. Minimize-to-rail keeps context but costs design work. Wrong choice fights horizontal scroll and drag-to-reorder-lists.
- **Recommended Default**: **Do not render other list columns** while focused (same as filtering `renderBoard`). Disable list reordering while in Kanban focus. Show focused list title + exit control clearly.
- **Options**:
  - [x] A — Unmount / do not render other lists (recommended)
  - [ ] B — CSS-hide other lists (keep in DOM)
  - [ ] C — Collapse other lists to a thin side rail / chips to switch focus
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Unmount / do not render other lists

---

### Question 8: Where does the Kanban button live?

- **Status**: `Locked`
- **Why it matters**: List headers are already dense (broom, select-all, sliders). Bad placement causes mis-taps on mobile or feels hidden.
- **Recommended Default**: **List header icon button** (Phosphor e.g. `ph-kanban` / `ph-columns`), only when Work Tools is on; visually distinct when that list is focused (active state).
- **Options**:
  - [x] A — List header icon button (recommended)
  - [ ] B — Inside Edit List modal only
  - [ ] C — Both header button + Edit List entry
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — List header icon button

---

### Question 9: Drag between kanban columns vs existing drag modes

- **Status**: `Locked`
- **Why it matters**: SortableJS already moves tasks between *lists* and reorders within a list. Kanban needs drag between *stages* of one list. Cut/copy drag mode, important pinning, and custom sort locks interact. Unclear rules cause accidental cross-list moves or lost order.
- **Recommended Default**: **In Kanban focus:** drag between the four stage columns updates stage (+ order within column). Do **not** allow drag out to other lists (other lists hidden). Preserve relative order within each column via list `taskIds` or a secondary order field. When sort mode ≠ custom, still allow stage changes but maybe disable reorder — or force custom while in Kanban (safer).
- **Options**:
  - [x] A — Stage drag + within-column reorder; no cross-list; prefer custom sort in focus (recommended)
  - [ ] B — Stage change via buttons/menu only; no Sortable between columns
  - [ ] C — Full Sortable between columns; ignore cut/copy mode while focused
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Stage drag + within-column reorder; no cross-list; prefer custom sort in focus

---

### Question 10: Fixed four columns or customizable?

- **Status**: `Locked`
- **Why it matters**: Custom columns explode schema and UI. Custom **labels** keep stable keys while allowing personal naming.
- **Recommended Default**: Fixed labels (A) — you chose **B** instead.
- **Options**:
  - [ ] A — Fixed four columns as specified (recommended)
  - [x] B — Fixed four keys, user-editable display names
  - [ ] C — Fully custom columns in v1
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: B — Fixed four keys, user-editable display names

---

### Question 11: Mobile layout for four columns

- **Status**: `Locked`
- **Why it matters**: Four ~300px columns do not fit a phone. Horizontal scroll (like today’s board) is familiar; stacked vertical sections are more readable but longer. Bad choice makes the feature unusable on iOS PWA.
- **Recommended Default**: **Horizontal scroll of four columns** (same board metaphor), with sticky list title / exit bar. Optional later: stacked accordion.
- **Options**:
  - [x] A — Horizontal scroll of four columns (recommended)
  - [ ] B — Vertical stacked sections (one under another)
  - [ ] C — Tabbed: one column visible at a time with tab bar
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Horizontal scroll of four columns

---

### Question 12: Apply to Story Manager and/or beta To-Do List?

- **Status**: `Locked`
- **Why it matters**: Story Manager loads To-Do-List assets via `base href` + `APP_CONFIG` (hides checkboxes). Beta uses a separate Firebase project. Shipping in shared `ui.js` without a flag may change Story Manager unexpectedly.
- **Recommended Default**: Task Master only (A) — you chose **B** (Task Master + Story Manager).
- **Options**:
  - [ ] A — Task Master only; hide Work Tools when Story Manager config active (recommended)
  - [x] B — Task Master + Story Manager
  - [ ] C — Task Master + beta-to-do-list in same change
  - [ ] D — All of the above
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: B — Task Master + Story Manager

---

## Interactions with existing features

### Question 13: Important (pinned) tasks in Kanban

- **Status**: `Locked`
- **Why it matters**: Important tasks (`!` / `!!`) pin to a frozen container above the normal list. In Kanban, pinning vs stage columns can fight for layout.
- **Recommended Default**: No pin tray in Kanban (A) — you chose **B**.
- **Options**:
  - [ ] A — No pin tray in Kanban; stages only (recommended)
  - [x] B — Keep pin tray above all columns
  - [ ] C — Pin tray only inside the New column
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: B — Keep pin tray above all columns

---

### Question 14: Time automation while in Kanban / with stages

- **Status**: `Locked`
- **Why it matters**: Automation moves tasks **between lists**, not stages. A task auto-moved into a list may land without a sensible stage; focus mode on list A while a task leaves list A is confusing.
- **Recommended Default**: **Keep automation as-is** (list moves). On arrival, if no `kanbanStatus`, apply Q4 defaults. Do not pause automation in Kanban focus. If focused list loses the task, task disappears from current Kanban view via snapshot (expected).
- **Options**:
  - [x] A — No change to automation; default stage on arrival (recommended)
  - [ ] B — Pause automation while any Kanban focus is active
  - [ ] C — Automation also advances kanbanStatus (out of scope unless you insist)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — No change to automation; default stage on arrival

---

### Question 15: Archive mode, recent completed, compact view vs Kanban

- **Status**: `Locked`
- **Why it matters**: Exclusive view modes already exist. Stacking Kanban + archived view creates ambiguous filters.
- **Recommended Default**: **Entering Kanban exits archive / recent-completed modes** (or refuse enter with toast). Compact view can remain. Multi-edit allowed inside columns if low-cost; otherwise defer multi-edit in Kanban to v1.1.
- **Options**:
  - [x] A — Kanban mutually exclusive with archive + recent-completed (recommended)
  - [ ] B — Allow stacking filters
  - [ ] C — Kanban only shows non-archived; ignore other modes silently
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Kanban mutually exclusive with archive + recent-completed

---

### Question 16: Backup / CSV export of kanbanStatus

- **Status**: `Locked`
- **Why it matters**: JSON backup and CSV export today are incomplete vs live schema. Omitting stage causes restore/export loss; including it without restore support is half-done.
- **Recommended Default**: **Include `kanbanStatus` in task objects for JSON backup/restore if those paths are touched**; CSV can add an optional column in a follow-up. Do not block v1 on perfect export parity if backup already skips other fields — but document the gap.
- **Options**:
  - [x] A — Include in JSON backup/restore when implementing; CSV later (recommended)
  - [ ] B — Must include JSON + CSV in v1
  - [ ] C — Persist in Firestore only; export out of scope for v1
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Include in JSON backup/restore when implementing; CSV later

---

## Safe to decide now (locked)

| ID | Decision | Status |
|----|----------|--------|
| D1 | Setting key name: `workToolsEnabled` (boolean, default `false`) | `Locked` |
| D2 | Stage enum values: `new`, `under_review`, `almost_done`, `finished` | `Locked` |
| D3 | Require Google sign-in for all reads/writes (existing model) | `Locked` |
| D4 | No remote feature flag service; rollback via git + optional setting default off | `Locked` |
| D5 | Reuse Phosphor icons + existing `icon-btn` / `dropdown-item-toggle` patterns | `Locked` |
| D6 | Orphan lists: no Kanban button (rescue UI stays as today) | `Locked` |
| D7 | Add-task form in Kanban: add into **New** column | `Locked` |
| D8 | Escape key exits Kanban focus (in addition to toggle button) | `Locked` |
| D9 | No new npm dependencies; keep SortableJS CDN | `Locked` |
| D10 | Firestore rules: confirm Console allows new optional task fields (no rules file in repo) | `Locked` |

---

## Next step

See locked [`02-technical-plan.md`](./02-technical-plan.md). Implementation starts only after you approve the first implementation step.
