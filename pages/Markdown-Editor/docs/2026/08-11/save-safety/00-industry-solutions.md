# Save safety — how cloud products solve the autosave dilemma

**Feature cycle:** 2026-08-11  
**Repo path:** `pages/Markdown-Editor/`  
**Status:** Research / options brief (no implementation yet)  
**Related:** idle autosave (10s) + manual Save + local drafts in `app.js` / `editor.js`

---

## The dilemma

| Mode | Wins | Loses |
|------|------|-------|
| **Autosave on** | Hard to forget work; crash / tab close is usually fine | Accidental deletes / bad edits land on Drive quickly; “undo” may not restore what was already overwritten in the cloud |
| **Autosave off** | You choose when Drive gets the new text | Easy to forget Save; failed Save + leave = lost new work |

Industry consensus: **keep autosave**, and make **recovery** (not “remember to save”) the safety net. Manual Save alone is treated as the fragile path.

---

## What users actually need

Two different failure modes get conflated:

1. **Protect new work** — don’t lose text I typed but haven’t committed yet.
2. **Undo bad work** — recover text I deleted or mangled *after* it was saved.

Products that feel “safe” cover **both**. Autosave alone only solves (1). Version history / snapshots / trash mainly solve (2).

---

## Patterns used by existing products

### 1. Autosave + version history (most common)

**Who:** Google Docs / Drive, Microsoft Word Online / OneDrive, Dropbox Paper / Dropbox, Notion, Apple Pages (iCloud), Quip, Coda.

**Idea:** Every successful write is cheap and automatic. Safety comes from **time-travel**: open a past revision and restore (whole doc or a range).

| Product | Mechanism (user-facing) |
|---------|-------------------------|
| **Google Docs** | File → Version history; named versions; restore any revision |
| **Google Drive (binary / `.md` files)** | Keep revision history on the file; restore older content from Drive UI |
| **Notion** | Page history / restore prior page state |
| **OneDrive / Office** | Version history on the file; Autosave when cloud-backed |
| **Dropbox** | File version history + Paper’s own history |
| **iCloud Pages / Notes** | Device sync + (Pages) version browse; Notes has limited undo / recently deleted for notes |

**Why it works:** Users stop thinking about Save. Mistakes are “go back in time,” not “I hope I didn’t save.”

**Fit for this app:** Strong — files already live on **Google Drive**, which keeps **file revisions** for non-Docs files when content is updated. The editor can surface “Restore earlier version…” via the Drive Revisions API instead of inventing a second history store.

---

### 2. Soft checkpoints / named versions

**Who:** Google Docs (“Name current version”), Figma (named versions), Notion (optional snapshots in some plans), Git-based tools (commits).

**Idea:** Autosave keeps a dense trail; users (or the app) can **pin** important moments (“Before rewrite”, “End of day”).

**Fit:** Optional later. Even without naming, listing Drive revisions by timestamp covers most personal-use recoveries.

---

### 3. Local draft / offline buffer separate from “published” cloud state

**Who:** Gmail (drafts), many blogs (draft vs publish), Notion offline cache, this app’s existing `localStorage` draft backup.

**Idea:** Editor text is buffered locally first; cloud write is debounced. If cloud write fails, local buffer remains. Some apps also keep **last-known-good cloud** vs **local dirty** and prompt on reopen (this app already has a draft restore dialog).

**Why it works:** Protects against network / auth failure (problem 1). Does **not** by itself undo a successful autosave of a bad edit (problem 2).

**Fit:** Already partially implemented. Keep it as the “don’t lose unsaved / failed-save text” layer.

---

### 4. Session undo that survives autosave

**Who:** Google Docs, Notion, Word Online — Undo (⌘Z) works for recent edits even though the cloud already has newer versions.

**Idea:** Autosave writes the **current** document; **undo stack stays in the client** until the tab is closed (or until history depth is exhausted). Saving does not clear undo.

**Why it works:** Most “oops I deleted a paragraph” moments happen **seconds** later, still in the same session. Version history is the backstop after reload.

**Fit:** High value, low conceptual cost. Plain `<textarea>` undo is browser-native for typing; structured Custom List edits may need an explicit undo stack if they bypass the textarea.

---

### 5. Warn on large destructive edits

**Who:** Rare as a hard block; seen in some CMS / spreadsheet “clear sheet” confirms; GitHub sometimes warns on force-push-scale actions. Consumer docs usually **don’t** modal on every big delete (too noisy).

**Idea:** If a single edit removes more than N characters or % of the doc, delay autosave, flash “Large deletion — Undo or Save anyway,” or require one confirm before the next cloud write.

**Why it works:** Catches select-all → delete / paste-overwrite without training users to fear autosave.

**Fit:** Good **complement** to history for a personal markdown tool; cheap heuristic, not a full history system.

---

### 6. Trash / recently deleted (file-level)

**Who:** Drive Trash, Notion trash, Apple Notes Recently Deleted.

**Idea:** Deleting a **file** is reversible for days. Does not help with **in-file** content loss.

**Fit:** Out of band for in-editor mistakes; Drive already has trash for file delete. Not the fix for accidental paragraph deletion.

---

### 7. Explicit “Save” while autosave still runs

**Who:** Almost everyone with a Save affordance or ⌘S (Docs maps ⌘S to “Saved” / force flush).

**Idea:** Autosave is default; Save means “flush now” + reassurance. Turning autosave **off** is an advanced escape hatch (this app already offers session “Turn off autosave”).

**Fit:** Align messaging: Save = “write now,” not “I’m the only way to keep work.” Prefer not to make “autosave off” the recommended safety strategy.

---

### 8. Conflict / multi-device merge UI

**Who:** Google Docs (live OT/CRDT), Notion, Dropbox (conflicted copy), iCloud (conflict copies).

**Idea:** Separate problem from accidental delete: two devices wrote different content.

**Fit:** Already noted as post-MVP in earlier plans (etag / revision conflict). Orthogonal to this brief, but revision APIs help both conflict detection and restore.

---

## How products combine layers

```text
Typing
  → client undo stack          (seconds–minutes, same tab)
  → local draft buffer         (crash / failed network)
  → debounced autosave         (protects new work)
  → cloud version history      (hours–months, after reload)
  → named / pinned versions    (optional milestones)
```

No serious cloud editor relies on “user remembered to Save” as the primary safety story.

---

## Options for Markdown-Editor

Mapped to this app’s current stack (Drive file update + local draft + optional idle autosave).

| Option | What it is | Solves | Effort | Notes |
|--------|------------|--------|--------|-------|
| **A. Surface Drive revision history** | List revisions for `fileId`; preview; restore content into editor (then Save) or restore via API | Bad edits after autosave | Medium | Best match to industry default; data already on Drive |
| **B. Keep autosave + strengthen session undo** | Don’t clear undo on save; ensure Custom view mutations are undoable | Immediate oops | Low–medium | Doesn’t help after full page reload |
| **C. Large-deletion guard** | Pause/ defer autosave or prompt when Δ chars exceeds threshold | Select-all delete | Low | Heuristic; pair with A |
| **D. Local snapshot ring** | e.g. last N drafts in `localStorage` / IndexedDB with timestamps | Recovery without Revisions API | Low–medium | Duplicates Drive; quota / privacy; good offline supplement |
| **E. Named checkpoint button** | “Save version” that names a Drive revision or copies a `.bak` | Milestones | Low | Nice-to-have after A |
| **F. Default autosave off** | Manual Save only | Accidental cloud overwrite | Already available | Re-introduces forgotten-save risk; not industry direction |
| **G. Longer idle / save on hide only** | Autosave less often | Slightly fewer bad writes | Trivial | Weak safety; still overwrites without history |

---

## Recommended direction (product)

1. **Keep autosave on by default** — treat it as “don’t lose new work,” same as Docs / Notion / Office.
2. **Add recovery via Drive revisions (Option A)** as the real answer to “autosave ate my paragraph.”
3. **Keep local drafts** for failed saves and crash recovery.
4. **Optionally add** large-deletion guard (C) and/or clearer Undo expectations (B) so most mistakes never need the history UI.
5. **Do not** rely on “turn autosave off” as the recommended fix; keep it as a power-user session toggle.

### Suggested MVP for “save safety”

- **Restore earlier version** in the editor more menu: fetch Drive revisions → pick one → load text into editor (dirty) or restore file content.
- Status copy: after autosave, something like “Autosaved · Version history available” once the feature ships.
- Help text: explain that Undo is for recent edits; Version history is for after reload.

### Explicit non-goals for a first pass

- Full Docs-style collaborative OT
- Pixel-perfect diff UI (a simple “preview this revision” + Restore is enough)
- Turning off Drive’s own revision retention (don’t upload in ways that skip revisions if avoidable)

---

## Open questions

1. **API:** Use `drive.revisions.list` / `get` with existing `drive` scope — confirm revision bodies are available for plain `text/markdown` uploads the app already performs.
2. **UX:** Restore → replace editor buffer (user hits Save), vs restore revision as current Drive head immediately?
3. **Retention:** How far back do Drive revisions go for this account/file type, and is that enough for personal notes?
4. **Custom Lists:** After restore, re-parse `mdlist` fences; same repair rules as open-file.
5. **Mobile:** History UI must work on iPhone (list + preview + confirm), not desktop-only.

---

## Decision summary (to lock later)

| Choice | Proposal |
|--------|----------|
| Primary safety model | Autosave **on** + **version restore** |
| Primary implementation | Google Drive **file revisions** in-app |
| Secondary guards | Local drafts (have); large-delete defer (optional); session undo clarity |
| Not recommended as default | Autosave off / manual-only |

---

## References (behavior, not implementation commits)

- Google Docs / Drive: autosave + Version history / file revisions  
- Microsoft 365: Autosave when OneDrive/SharePoint-backed + Version history  
- Notion: continuous save + page history  
- Dropbox: file version history  
- This app today: 10s idle autosave, manual Save, local draft restore, session “Turn off autosave”
