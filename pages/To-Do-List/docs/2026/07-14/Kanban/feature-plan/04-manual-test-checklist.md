# Work Tools / Kanban — Manual Test Checklist

**Feature cycle:** 2026-07-14  
**Apps:** Task Master (`/pages/To-Do-List/`) + Story Manager (`/pages/Story-Manager/`)  
**Status:** Ready for your runtime pass — code paths below are in place.

Legend: `[code]` verified by implementation review · `[you]` needs browser confirmation

---

## Task Master

### Settings & backup
- [ ] `[you]` Work Tools off → no Kanban buttons on lists
- [ ] `[you]` Enable Work Tools → persists after reload
- [ ] `[you]` Kanban Column Names panel appears when Work Tools is on; Save Labels updates headers
- [ ] `[code]` JSON backup includes `kanbanStatus`, `completedAt`, `updatedAt`, `nestedIdeas`, and full `settings` (incl. `workToolsEnabled`, `kanbanColumnLabels`)
- [ ] `[you]` Download backup → restore → stages and labels survive (Q16)

### Focus mode
- [ ] `[you]` Kanban button on each non-orphan list
- [ ] `[you]` Enter focus → other lists gone; four columns + pin tray if important tasks
- [ ] `[you]` Exit via Kanban button and Escape
- [ ] `[you]` Board switch / Work Tools off clears focus
- [ ] `[you]` Entering Kanban clears archive / recent-completed modes

### Stages & sync
- [ ] `[you]` Existing completed tasks appear in Finished
- [ ] `[you]` New task appears in New (add form in New column)
- [ ] `[you]` Drag across columns updates stage; Finished marks completed
- [ ] `[you]` Drag out of Finished / uncheck → Almost Done + incomplete
- [ ] `[you]` Stage buttons still move tasks (a11y fallback)
- [ ] `[you]` Important (`!`) tasks appear in **pinned subsection at top of their stage column** (default New); draggable between columns

### Regression
- [ ] `[you]` Work Tools off → board behaves as before
- [ ] `[you]` Mobile: horizontal scroll of four columns usable

---

## Story Manager

- [ ] `[code]` Options includes Work Tools toggle + Kanban Column Names (same element IDs as Task Master)
- [ ] `[code]` Shares To-Do-List `main.js` / `ui.js` / `kanban.js` via `<base href="/pages/To-Do-List/">`
- [ ] `[you]` Enable Work Tools → Kanban buttons on lists
- [ ] `[you]` Enter Kanban; drag to Finished works without checkboxes (`hideCheckboxes: true`)
- [ ] `[you]` Stage buttons move ideas between columns
- [ ] `[you]` Labels save and show on column headers

---

## Out of scope this cycle (confirmed)

- Beta To-Do List parity
- CSV `kanbanStatus` column
- Firestore Console rules file in repo (confirm optional fields allowed in Console — D10)

---

## Sign-off

| Role | Result | Date |
|------|--------|------|
| Code complete (Phases 1–5) | Done | 2026-07-14 |
| Runtime QA (you) | | |
