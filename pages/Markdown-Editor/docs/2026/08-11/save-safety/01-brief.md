# Save safety — Brief

**Feature cycle:** 2026-08-11  
**App path:** `pages/Markdown-Editor/`  
**Expected live URL:** `https://xanderwiles.com/pages/Markdown-Editor/`  
**Status:** Plan drafted — await decision lock + coding approval  
**Research:** [`00-industry-solutions.md`](./00-industry-solutions.md)  
**Decisions:** [`02-questions-and-decisions.md`](./02-questions-and-decisions.md)  
**Technical plan:** [`03-technical-plan.md`](./03-technical-plan.md)

---

## Summary

Keep **autosave on by default**, and make **recovery** (not “remember to Save”) the safety net.

Users should type without thinking about saving, and still recover from:

1. Accidental deletes / paste-overwrites that get autosaved
2. Wanting an earlier document version after reload
3. Crash / refresh before a Drive write finishes
4. Temporary network / Drive API failures
5. Restoring an old version and later needing the newer one
6. Overwriting edits made in another tab / device

The document remains **one Google Drive `.md` file** with a stable `fileId`. Do **not** create duplicate `.md` files per version.

---

## User problem being solved

| Pain today | Impact |
|------------|--------|
| Autosave (or Save) can commit a bad edit to Drive | Paragraph / whole-doc loss with no in-app time-travel |
| Undo only lives in the current tab | After refresh, bad cloud content is the only copy |
| Local drafts protect *unsynced* text, not *already-saved* mistakes | Draft restore cannot undo a successful autosave of a wipe |
| Multi-device / multi-tab last-write-wins | Easy to clobber another session’s work silently |

---

## Target audience

| Audience | Need |
|----------|------|
| **Primary (you only)** | Confident iPhone + desktop editing of personal Drive markdown |
| **Not in scope** | Collaborative OT/CRDT, shared editing cursors, team ACLs |

---

## Goals

1. **Autosave remains normal behaviour** — no return to manual-save-as-primary.
2. **Four recovery layers** (phased): session undo → local draft → Drive revisions → selected protected / named revisions.
3. **In-app Version History** — list, preview, restore without leaving the editor.
4. **Non-destructive restore** — restoring an old revision uploads its content as a **new** head; later revisions stay available.
5. **Never silently discard** newer local unsynced content or newer remote content when a conflict is detected.
6. Stay on the current stack: **static HTML/CSS/vanilla JS**, existing GIS + Drive auth, no new backend, no new heavy libraries.

---

## Non-goals (this feature cycle)

- Rewriting the editor into Svelte / React / TypeScript
- Collaborative live multiplayer editing
- Pixel-perfect diff / merge UI (simple keep-mine / use-Drive / preview is enough)
- Creating a `.md` copy or `.bak` for every autosave
- Pinning (`keepForever`) every Drive revision
- Making “turn off autosave” the recommended safety strategy
- Unrelated Finder / Custom Lists / homepage refactors

---

## Current product context (relevant)

| Area | Today |
|------|--------|
| Stack | Vanilla ES modules under `pages/Markdown-Editor/` |
| Autosave | Idle debounce `AUTOSAVE_IDLE_MS = 10_000` in `app.js` + in-flight fingerprint coalescing |
| Manual Save | Still available; quiet autosave path exists |
| Session undo | `history.js` — survives autosave / Save; cleared on file change |
| Local draft | `localStorage` via `editor.js` (`writeDraft` / `readDraft` / restore dialog) |
| Drive write | `drive.js` → `updateFileContent` (media upload, last-write-wins) |
| Revisions API | **Not used yet** |
| Conflict detection | **Not implemented** for content version / etag |
| Escape hatch | Session “Turn off autosave” in editor more menu |

---

## Expected user experience (target)

```text
Typing quietly
  → local draft updates quickly
  → debounced Drive autosave
  → status: Saving… → Saved
  → History available for time-travel

If offline / API fail:
  → Offline — changes saved locally  (or Save failed…)
  → retry when appropriate; never claim Drive-saved when not

If destructive edit:
  → (later phase) protect prior head / defer / soft warn
  → still recoverable via History

If remote conflict:
  → prompt; preserve both sides
```

Primary chrome stays simple:

```text
Saved                         History
```

Warnings only for offline, save failure, draft recovery, or conflict.

---

## Success criteria

- [ ] User can open History, preview an older revision, restore it, and still find the pre-restore content later in history
- [ ] Accidental large delete after autosave is recoverable without leaving the app
- [ ] Crash / failed save still recovers via local draft prompt (existing behaviour, preserved or improved)
- [ ] Concurrent remote change does not silently overwrite without a prompt (Phase 3)
- [ ] Manual iPhone pass: History + Preview + Restore usable on phone Safari / home-screen PWA
- [ ] `sw.js` precaches any new modules + cache version bump

---

## Related docs

| Doc | Role |
|-----|------|
| [`00-industry-solutions.md`](./00-industry-solutions.md) | Research / industry patterns |
| [`02-questions-and-decisions.md`](./02-questions-and-decisions.md) | Locked product/tech choices |
| [`03-technical-plan.md`](./03-technical-plan.md) | Phased implementation plan |
| App README | OAuth / Drive setup |
