# Save safety — Questions and decisions

**Feature cycle:** 2026-08-11  
**Status:** Proposed locks from planning discussion — confirm before coding  
**Brief:** [`01-brief.md`](./01-brief.md)  
**Technical plan:** [`03-technical-plan.md`](./03-technical-plan.md)  
**Research:** [`00-industry-solutions.md`](./00-industry-solutions.md)

---

## Decision table

| ID | Topic | Decision | Status |
|----|--------|----------|--------|
| Q1 | Primary safety model | Autosave **on** + in-app **Drive version history** | Proposed lock |
| Q2 | File identity | Single Drive `fileId`; never duplicate `.md` per version | Proposed lock |
| Q3 | Restore semantics | Non-destructive: fetch old revision content → upload as **new** head | Proposed lock |
| Q4 | Delivery shape | **Phased** (History first → destructive guard → conflicts → named/pins) | Proposed lock |
| Q5 | Stack | Extend vanilla JS modules; **no** Svelte/TS rewrite | Proposed lock |
| Q6 | Local drafts (Phase 1) | Keep **`localStorage`** drafts; defer IndexedDB | Proposed lock |
| Q7 | Autosave interval (Phase 1) | Keep **~10s** idle debounce; shorten later only after History ships | Proposed lock |
| Q8 | Session undo | Keep `history.js`; never clear on autosave/Save | Proposed lock |
| Q9 | Manual Save | Keep as “flush now”; not the primary safety story | Proposed lock |
| Q10 | Turn off autosave | Keep as power-user session toggle; not recommended default | Proposed lock |
| Q11 | `keepForever` safety pins | Phase 1: **on-demand only** when Preview/Restore needs media (Drive requirement) + pin pre-restore head. No pin-every-autosave. Broader safety/named policy in Phase 2/4 | Locked (Phase 1) |
| Q12 | Named versions | **Defer** to Phase 4; store labels in Drive **appData** JSON | Proposed lock |
| Q13 | Destructive-edit heuristic | Phase 2; configurable thresholds; soft defer/warn before pin strategy | Proposed lock |
| Q14 | Conflict detection | Phase 3; track Drive `version` (and/or etag); keep-mine / use-Drive / review | Proposed lock |
| Q15 | History UI density | Prefer recovery-worthy revisions; group/filter noisy autosaves if Drive returns many | Proposed lock |
| Q16 | Preview | Read-only text; copy allowed; does **not** mutate Drive until Restore | Proposed lock |
| Q17 | Testing | Pure JS unit tests for heuristics + save queue when practical; manual iPhone checklist; no new Playwright stack required | Proposed lock |
| Q18 | Scope / auth | Reuse existing Drive OAuth; Revisions API under current `drive` scope | Proposed lock |

---

## Q1 — Primary safety model

**Options**

- A) Autosave off / manual Save only  
- B) Autosave on + rely on Drive web UI for history  
- C) Autosave on + **in-app** version history restore  

**Decision: C**

Matches industry (Docs / Office / Notion) and `00-industry-solutions.md`. Option A re-introduces forgotten-save risk. Option B leaves phone recovery awkward.

---

## Q2 / Q3 — File identity and restore

**Decision:** Stable `fileId`. Restore = download revision media → `updateFileContent` (or equivalent upload) → new head revision. Never delete intermediate revisions as part of restore.

```text
100 … 101 (chosen) … 102 … 103 (was current)
→ 104 = content of 101 (new current)
```

Before restore (Phase 2+), prefer protecting current head when pins exist; Phase 1 may skip pin if Revisions API listing alone is enough to find pre-restore head after upload.

---

## Q4 — Phasing

**Decision: four phases** (see technical plan). Do not implement the full “ideal architecture” in one pass.

| Phase | Theme |
|-------|--------|
| 1 | Drive revisions list / preview / restore + status chrome |
| 2 | Destructive-edit detection + soft guard; optional first `keepForever` |
| 3 | Remote version conflict prompt |
| 4 | Named versions + retention policy for auto safety pins |

---

## Q5 — Stack

**Decision:** Vanilla ES modules next to existing `drive.js` / `app.js` / `editor.js` / `ui.js` / `history.js`.

Reject the external brief’s `src/lib/**/*.svelte` layout. Prefer small focused modules, e.g.:

```text
pages/Markdown-Editor/revisions.js      # Drive Revisions API wrapper
pages/Markdown-Editor/save-queue.js     # optional extract of coalescing writer
pages/Markdown-Editor/destructive.js    # Phase 2 heuristic
```

UI stays DOM in `index.html` + `ui.js` (panel/modal), not a new framework.

---

## Q6 — Local drafts

**Decision (Phase 1):** Keep `localStorage` draft keyed by `fileId`.

**Later (optional):** IndexedDB if large notes hit quota or structured sync metadata outgrows JSON-in-LS.

Do not block History on an IndexedDB migration.

---

## Q7 — Autosave timing

**Decision (Phase 1):** Keep `AUTOSAVE_IDLE_MS ≈ 10_000`.

Rationale: faster (1–2s) writes increase revision noise and commit bad pastes sooner. Shorten only after History is proven, if UX still wants snappier cloud sync.

---

## Q8–Q10 — Undo, Save, autosave-off

**Decision:** Preserve current behaviours; clarify messaging:

- Undo = recent same-tab mistakes  
- History = after reload / after cloud commit  
- Save = flush now  
- Autosave off = session escape hatch  

---

## Q11 / Q12 — Protected and named revisions

**Decision:**

- Phase 1: **no** automatic `keepForever`
- Phase 2: optionally pin **only** the pre-destructive head when heuristic fires
- Phase 4: user “Name this version”; metadata in Drive appData (existing `ensureAppDataFile` pattern)
- Never auto-delete user-named pins; prune only automatic safety pins under a retention policy

Be mindful of Drive’s protected-revision cap.

---

## Q13 — Destructive heuristic

**Proposed thresholds (configurable constants):**

```text
deleted characters > 500
OR document shrank by > 10%
OR became empty when previously substantial
OR near-total replacement (large delete + large insert in one step)
```

Normal typing must not trip it. Exact UX for Phase 2: **defer autosave briefly + soft status** first; hard modal only if needed after dogfooding.

---

## Q14 — Conflicts

**Decision (Phase 3):** On load/save, track Drive file `version` (request in `fields`). If remote `version` advanced without our write, show conflict UI; preserve both payloads (editor + fetched Drive text). Own autosaves must update the tracked version so they do not self-conflict.

Minimum actions: **Keep my version** / **Use Drive version** / **Review** (side-by-side or sequential read-only views — not a full merge editor).

---

## Q15 / Q16 — History UI

**Decision:**

- Entry: editor chrome / more menu → **History**
- Newest first; label Current / Automatic / Safety / Named when known
- Actions: **Preview** (read-only), **Restore** (confirm)
- If revision list is huge, show a sensible window (e.g. recent N + all protected/named) with “Load more” if needed

---

## Q17 — Testing

**Decision:**

- Unit-test pure functions (`isDestructiveChange`, save-queue ordering) with whatever lightweight runner fits the repo — or plain assert scripts if no Vitest exists for this page
- Manual checklist on desktop + iPhone
- Do **not** require adding Playwright solely for this feature

---

## Q18 — API / auth

**Decision:** Reuse GIS token + `driveFetch`. Add Revisions endpoints:

- `files.revisions.list`
- `files.revisions.get` (+ `alt=media` for content when supported)
- `files.revisions.update` (`keepForever`) in later phases

**Gate before Phase 1 coding:** confirm revision **media** is readable for the mime types this app uploads (`text/markdown` / plain).

---

## Open questions still to verify in implementation

1. Does `revisions.get` + `alt=media` return full text for our uploaded `.md` files?
2. How many revisions does Drive retain for these files in practice (personal account)?
3. Does `updateFileContent` (media upload) always create a new revision we can list afterward?
4. Mobile layout: sheet vs full-screen History on narrow viewports?

These are **validation** items, not product forks — technical plan Phase 0 covers them.
