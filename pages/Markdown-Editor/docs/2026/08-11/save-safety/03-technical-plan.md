# Save safety — Technical plan (phased)

**Feature cycle:** 2026-08-11  
**Status:** Phases 1–4 implemented (History, destructive guard, conflicts, named versions + retention).  
**Brief:** [`01-brief.md`](./01-brief.md)  
**Decisions:** [`02-questions-and-decisions.md`](./02-questions-and-decisions.md)  
**Research:** [`00-industry-solutions.md`](./00-industry-solutions.md)  
**API notes:** [`04-api-notes.md`](./04-api-notes.md)

---

## Locked direction (summary)

| Choice | Plan |
|--------|------|
| Safety model | Autosave on + in-app Drive revision recovery |
| Document model | One Drive file / stable `fileId` |
| Restore | Upload old content as **new** head (non-destructive) |
| Stack | Vanilla JS modules; extend existing architecture |
| Phase 1 drafts / debounce | Keep `localStorage` + ~10s idle autosave |
| Pins / named versions / IndexedDB / 1–2s debounce | Later phases |

---

## Architecture today → target

```text
TODAY
  textarea / list UI
       ↓
  editor.js (dirty + localStorage draft)
       ↓
  app.js autosave timer + saveCurrentFile
       ↓
  drive.updateFileContent (last-write-wins)
  history.js (session undo)

TARGET (phased)
  same editor pipeline
       ↓
  local draft (Phase 1: localStorage)
       ↓
  coalesced save writer (strengthen existing app.js logic; extract if needed)
       ↓
  drive.updateFileContent + track file.version (Phase 3)
       ↓
  revisions.js → list / get media / (later) keepForever
       ↓
  History UI (preview + restore)
```

Four recovery layers (map to phases):

| Layer | Mechanism | Phase |
|-------|-----------|-------|
| 1 | Session undo/redo (`history.js`) | Exists — preserve |
| 2 | Local unsynced draft | Exists — preserve; improve only if needed |
| 3 | Normal Drive revisions + History UI | **Phase 1** |
| 4 | Selected protected / named revisions | **Phase 2 / 4** |

---

## Phase 0 — API validation (half-day, before UI)

**Goal:** Prove Drive Revisions work for this app’s files.

### Steps

1. With a real test `.md` edited by this app, call:
   - `GET /drive/v3/files/{fileId}/revisions`
   - `GET /drive/v3/files/{fileId}/revisions/{revisionId}?alt=media`
2. Confirm media body matches expected markdown.
3. Confirm a content `PATCH` upload creates a listable new revision.
4. Note pagination / retention behaviour for a noisy autosaved file.

### Exit criteria

- [ ] Revision list returns entries for app-written files
- [ ] Revision media download returns usable markdown text
- [ ] Document any API quirks in this folder (short `04-api-notes.md` if needed)

**If media download is unavailable:** stop and redesign (e.g. app-managed snapshot ring) before building History UI on sand.

---

## Phase 1 — Version History MVP (primary ship)

**Status:** Implemented (2026-08-11)

**Goal:** “Even if autosave committed a bad edit, I can get an earlier version back.”

### Drive download constraint (discovered in Phase 0 docs)

Older blob revision **media** requires `keepForever: true` before download. Phase 1 therefore pins on demand when Preview/Restore loads an older revision, and pins the pre-restore head before uploading restored content. This is **not** “pin every autosave.”

### In scope

1. **`revisions.js`** — thin Drive Revisions wrapper using existing `driveFetch` / auth:
   - `listRevisions(fileId)` / `listAllRevisions`
   - `getRevisionContent(fileId, revisionId)` (pins older revs as needed)
   - `protectRevision` for `keepForever`
   - Normalize into a small `DocumentRevision` shape (JSDoc)
2. **History UI** (mobile-first dialog in `index.html` + `ui.js`):
   - Open from editor more menu: **Version history**
   - Newest first
   - Mark **Current** / **Automatic** / **Protected**
   - Per row: time, size if available, **Preview**, **Restore**
3. **Preview** — read-only view of revision markdown; copy allowed; no Drive write until Restore
4. **Restore**:
   - Confirm dialog
   - Fetch revision text (pin if needed)
   - Protect previous head, then upload via `updateFileContent`
   - Update editor buffer + draft baseline + reset session undo
   - Refresh history list so new head appears as Current
5. Precache `revisions.js` in `sw.js` + cache version bump
6. README + Settings tip: Undo vs History

### Out of scope for Phase 1

- Named versions / appData labels
- IndexedDB migration
- Changing idle autosave from ~10s to 1–2s
- Full conflict UI
- Destructive-edit auto-pin heuristics
- Retention pruning of safety pins

### Undo / editor behaviour on restore

| Event | Behaviour |
|-------|-----------|
| Successful restore | Set editor to restored text; mark saved (or dirty only if upload succeeded and local equals head); **reset** session undo for the new baseline (restore is a new document epoch) |
| Preview | No editor mutation |
| Autosave during History open | Allowed; do not clear undo |

### Files likely touched

| File | Change |
|------|--------|
| `drive.js` | Optionally share `driveFetch`; or keep fetch private and put revision calls in `revisions.js` that imports auth the same way — prefer **one** HTTP helper pattern |
| `revisions.js` | **New** |
| `app.js` | Wire open History, preview, restore → save path |
| `ui.js` / `index.html` / `style.css` | History panel, preview, buttons |
| `sw.js` | Precache + version bump |
| `README.md` | User-facing Undo vs History |

### Race / save rules (Phase 1 minimum)

Keep / clarify existing `app.js` behaviour:

- Single in-flight autosave per document
- Fingerprint / coalesce: if dirty after save finishes, schedule another save
- Never apply an older save completion over newer `editorContent` (already partially handled via `applySavedBaseline`)
- History restore waits for (or cancels/queues around) in-flight save so restore upload is not raced by stale autosave

### Manual test checklist (Phase 1)

- [ ] Open file → edit → autosave → History shows multiple revisions
- [ ] Preview older revision — editor unchanged
- [ ] Restore older revision — editor shows restored text; Drive reopen matches
- [ ] After restore, previous “current” still appears earlier in history
- [ ] Dirty local draft prompt still works after failed network save
- [ ] Custom list / preview modes: restore re-parses `mdlist` like a normal open
- [ ] iPhone: History usable; Preview + Restore confirm work
- [ ] Offline: History fetch fails gracefully without wiping editor

---

## Phase 2 — Destructive-edit guard (+ optional safety pin)

**Status:** Implemented (2026-08-11)

**Goal:** Reduce how often users need History for select-all → delete / huge paste-overwrite.

### In scope

1. **`destructive.js`** with configurable constants + `isDestructiveChange` / `analyzeContentChange`
2. Soft path: defer autosave (~+8s) + toast “Large change — Undo available”
3. Before Drive write of still-destructive content: `protectRevision` on head + appData safety label “Before large change”
4. Unit tests in `destructive.test.js` (`node --test`)

---

## Phase 3 — Concurrent edit protection

**Status:** Implemented (2026-08-11)

**Goal:** Do not silently overwrite another tab/device.

### In scope

1. Track `driveVersion` + `headRevisionId` on editor state (load + successful save)
2. Before upload, compare remote `version`; if advanced and content differs → conflict
3. Autosave: toast + pause further autosaves; manual Save opens dialog
4. Dialog: **Keep my version** / **Use Drive version** / **Review** (both texts)
5. Own successful saves update `driveVersion` from upload response `fields`

---

## Phase 4 — Named versions + retention

**Status:** Implemented (2026-08-11)

**Goal:** Intentional checkpoints + keep protected revision count healthy.

### In scope

1. Edit ⋮ → **Name this version…** → protect head + label in appData (`revision-meta.js`)
2. History UI shows Named / Safety labels via `enrichRevisionsWithMeta`
3. `pruneSafetyRevisions` keeps newest ~12 automatic safety pins; **never** unpins named
4. Autosave interval left at ~10s (no forced shorten)

---

## Module plan (adapt names; avoid parallel systems)

| Module | Role | Phase |
|--------|------|-------|
| `history.js` | Session undo/redo | Exists |
| `editor.js` | Dirty + drafts + save status helpers | Exists; extend lightly |
| `drive.js` | Files + upload | Exists; maybe expose shared fetch / version fields |
| `revisions.js` | Revisions list/get/(update keepForever) | 1 / 2 / 4 |
| `destructive.js` | Heuristic | 2 |
| `save-queue.js` | Extract coalescing writer **if** `app.js` becomes unreadable | 1 optional |
| `revision-meta.js` | appData labels + retention | 4 |
| `ui.js` + `index.html` | History / preview / conflict dialogs | 1 / 3 |

**Do not** introduce a general state-management library.

---

## Save state model

Align with existing `editor` status strings; extend rather than replace:

```text
idle | loading | dirty | saving | saved | error
+ offline   (optional explicit)
+ conflict  (Phase 3)
```

UI copy targets:

```text
Saving…
Saved
Offline — changes saved locally
Save failed — changes preserved locally
This document was changed elsewhere.
```

---

## Testing strategy

| Layer | What | When |
|-------|------|------|
| Manual API | Phase 0 revision media proof | Before Phase 1 UI |
| Unit | `isDestructiveChange` cases | Phase 2 |
| Unit | Save coalescing / stale completion | If/when queue extracted |
| Manual UI | History / preview / restore / iPhone | Phase 1 |
| Manual | Conflict keep/use/review | Phase 3 |
| Manual | Named + prune never deletes named | Phase 4 |

No requirement to add Playwright for this page unless it already exists later.

---

## Implementation process (when coding starts)

1. Confirm Q decisions in `02-questions-and-decisions.md` (flip Proposed → Locked).
2. Complete **Phase 0** API validation; write quirks if any.
3. Implement **Phase 1** only; ship / dogfood.
4. Only then schedule Phase 2 → 3 → 4.
5. After each phase: bump `sw.js`, smoke desktop + iPhone, update README if user-facing behaviour changed.

### Before modifying code (per coding session)

Briefly restate in the PR/chat:

- Relevant existing architecture found
- Exact files to change for **that phase only**

### After a phase

- Summarise architecture decisions actually taken
- Note any Drive API surprises
- List follow-ups deferred

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Revisions media not available for `.md` uploads | Phase 0 gate; fallback design before UI |
| Too many revisions → noisy History | Cap + Load more; later pins for landmarks |
| `keepForever` quota exhaustion | Defer pins; retention policy before widespread pinning |
| Restore raced by autosave | Gate restore behind save queue / cancel pending idle timer |
| False conflict on own autosave | Update tracked `version` on every successful write |
| Custom lists break on restore | Reuse open-file parse/repair path after setting content |
| SW serves stale History JS | Precache list + version bump |

---

## Explicit non-goals (all phases)

- Duplicate `.md` files per version
- Manual-save-only as the recommended model
- Pin every autosave
- Framework rewrite
- Full collaborative editing
- Large unrelated refactors

---

## Suggested ship order (one line)

**Phase 0 prove API → Phase 1 History restore → Phase 2 destructive soft guard → Phase 3 conflicts → Phase 4 named + retention.**

That sequence delivers the user promise (“I can get it back”) first, then reduces how often they need it, then protects multi-device, then adds deliberate checkpoints.
