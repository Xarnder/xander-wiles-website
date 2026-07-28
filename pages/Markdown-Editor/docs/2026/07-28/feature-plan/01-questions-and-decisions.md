# Google Drive Markdown Editor — Questions and Decisions

**Feature cycle:** 2026-07-28  
**Status:** **Fully locked** — Q2/Q3 resolved as **Option 2C**. Implementation landed under `pages/Markdown-Editor/`.

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
| Q1 | **A** — GIS token client + Drive REST (not Firebase) | `Locked` |
| Q2 | **C** — `https://www.googleapis.com/auth/drive` (full Drive) | `Locked` |
| Q3 | **A** — In-app folder browser (Up, list folders + `.md`) | `Locked` |
| Q4 | **A** — New dedicated GCP project | `Locked` |
| Q5 | **A** — Plain `<textarea>`; no preview | `Locked` |
| Q6 | **B** — Existing files only (no create in MVP) | `Locked` |
| Q7 | **A** — Manual Save only | `Locked` |
| Q8 | **A** — Last-write-wins; keep text on failure | `Locked` |
| Q9 | **A** — Full PWA: manifest + service worker (shell cache) | `Locked` |
| Q10 | Readable dark theme (site-adjacent); light later optional | `Locked` (safe default; no override) |
| Q11 | Skip homepage card | `Locked` (safe default; no override) |
| Q12 | No SPA routes; no `vercel.json` change | `Locked` (safe default; no override) |
| Q13 | `PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID` | `Locked` (safe default; no override) |
| Q14 | **A** — Local draft + restore prompt | `Locked` |
| Q15 | **A** — No in-app allowlist; OAuth test users only | `Locked` |

---

## Conflict resolution (Q2 vs Q3) — locked 2026-07-28

Initial checkbox pair (`drive.file` + in-app browser) was incompatible. Per your instruction to take the **recommended** path for Q2/Q3:

- **Resolution:** **Option 2C**
- **Scope:** `https://www.googleapis.com/auth/drive`
- **UX:** In-app folder browser (My Drive / remembered folder → open folders → list `.md` → Up)
- **Why:** Matches the product brief (“browse Drive on phone”); acceptable for a personal testing-mode OAuth app used only by you. Broader than least privilege, but avoids Google Picker complexity and empty-folder failures under `drive.file`.

**Your conflict resolution**: Option 2C (recommended for browse-on-phone goal)

---

## How to use this file

1. ~~Resolve Q2 vs Q3~~ Done.  
2. Approve coding in chat when ready.  
3. Implement against [`02-technical-plan.md`](./02-technical-plan.md).
---

## Auth & Google Cloud

### Question 1: Auth approach (GIS vs Firebase + Drive scopes)

- **Status**: `Locked`
- **Why it matters**: Existing To-Do / Watch Later apps use Firebase Google sign-in for **Firestore identity only** — they do **not** obtain Drive access tokens. Drive needs an OAuth access token with Drive scopes.
- **Recommended Default**: **A** — Google Identity Services (GIS) token client + Drive REST from the browser.
- **Options**:
  - [x] A — **GIS token client** + Drive REST (recommended)
  - [ ] B — Firebase `GoogleAuthProvider` + `addScope(drive...)` + read OAuth access token from credential
  - [ ] C — GIS for Drive token **and** Firebase for something else (not needed for MVP)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 2: Drive OAuth scope (product-critical)

- **Status**: `Locked`
- **Why it matters**: Scope choice decides whether you can **browse arbitrary folders** for existing `.md` files, or only files the app created / you picked via Google Picker.
- **Recommended Default**: **C** after conflict resolution (Option 2C) — full Drive for in-app browse on a personal testing-mode app.
- **Options**:
  - [ ] A — **`drive.file` + `drive.readonly`** — list/read broadly; write only to app-accessible files (still relatively broad read)
  - [ ] B — **`drive.file` only** — least write privilege; requires Google Picker (or prior app files) — **no full in-app Drive browse**
  - [x] C — **`https://www.googleapis.com/auth/drive`** — full Drive access; simplest in-app folder UX; heaviest consent
  - [ ] D — **`drive.file` + Google Picker** — pick files/folders via Google’s UI; then edit/save those files in-app
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: C (Option 2C — recommended for browse-on-phone)

---

### Question 3: Browse UX for finding `.md` files

- **Status**: `Locked`
- **Why it matters**: In-app folder navigation needs list permission on arbitrary folders. Paired with Q2=C (full `drive`).
- **Recommended Default**: **A** with broad Drive scope.
- **Options**:
  - [x] A — **In-app folder browser** (list children of a folderId; filter `.md` / `text/markdown`; Up button; start at My Drive root or a remembered folder)
  - [ ] B — **Google Picker** to choose a file/folder, then editor + optional “recents” list of previously opened file IDs in `localStorage`
  - [ ] C — **Hybrid**: Picker to grant access to a root folder, then in-app browse within that folder tree
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A
---

### Question 4: Which Google Cloud / OAuth project?

- **Status**: `Locked`
- **Why it matters**: A dedicated project keeps Drive scopes isolated from other site Firebase apps.
- **Recommended Default**: **A** — new dedicated GCP project.
- **Options**:
  - [x] A — **New dedicated GCP project** for Markdown Editor (recommended)
  - [ ] B — Reuse an existing project — specify which: <input type="text" placeholder="e.g. taskmaster-cloud-xander" style="width: 70%;">
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 15: Restrict to your Google account only?

- **Status**: `Locked`
- **Why it matters**: OAuth testing mode already limits who can sign in.
- **Recommended Default**: **A** — no in-app allowlist.
- **Options**:
  - [x] A — **No in-app allowlist** — Google OAuth test users only (recommended)
  - [ ] B — Hard-code allowlist of your email(s) in client JS
  - [ ] C — Both testing mode **and** client-side email check
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## Editor & product scope

### Question 5: Editor component for MVP

- **Status**: `Locked`
- **Recommended Default**: **A** — plain `<textarea>`.
- **Options**:
  - [x] A — **Plain textarea**
  - [ ] B — Lightweight markdown editor library
  - [ ] C — Textarea + optional simple preview toggle
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 6: Create new `.md` files in MVP?

- **Status**: `Locked`
- **Recommended Default**: **B** — existing only.
- **Options**:
  - [ ] A — Include **New markdown file** in current folder for MVP
  - [x] B — **Existing files only** for MVP
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: B

---

### Question 7: Save UX

- **Status**: `Locked`
- **Recommended Default**: **A** — manual Save only.
- **Options**:
  - [x] A — **Manual Save only**
  - [ ] B — Autosave after idle + manual Save
  - [ ] C — Autosave on blur / visibility change only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 8: Save conflicts (file changed elsewhere)

- **Status**: `Locked`
- **Recommended Default**: **A** — last-write-wins.
- **Options**:
  - [x] A — **Last-write-wins** update; preserve editor text on failure
  - [ ] B — Use Drive revision / etag (`If-Match`); conflict prompt
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 14: Local draft backup if tab is killed?

- **Status**: `Locked`
- **Recommended Default**: **A** — local draft + restore prompt.
- **Options**:
  - [x] A — **Local draft + restore prompt**
  - [ ] B — Memory only + best-effort `beforeunload`
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

## Packaging & site integration

### Question 9: Home-screen / PWA packaging for MVP

- **Status**: `Locked`
- **Why it matters**: You overrode the recommended “no SW” default and chose a full PWA shell cache. That improves home-screen feel but adds stale-cache risk after deploys — SW must use a versioned cache and update strategy.
- **Recommended Default**: Was B (no SW); **you chose A**.
- **Options**:
  - [x] A — Full PWA: manifest + service worker (shell cache)
  - [ ] B — Manifest + Apple meta only; no SW
  - [ ] C — Plain web page only (no manifest)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A

---

### Question 10: Theme

- **Status**: `Locked` (accepted safe default — no text override)
- **Recommended Default**: One readable dark theme aligned with site glass aesthetic.
- **Your Answer**: *(empty — treating as accept default)*

---

### Question 11: Homepage card

- **Status**: `Locked` (accepted safe default — no text override)
- **Recommended Default**: **Skip** homepage card this cycle.
- **Your Answer**: *(empty — treating as skip)*

---

### Question 12: Client-side routes / `vercel.json` rewrite?

- **Status**: `Locked` (accepted safe default — no text override)
- **Recommended Default**: **No SPA routes**; **no** `vercel.json` change.
- **Your Answer**: *(empty — treating as accept default)*

---

### Question 13: Env var naming

- **Status**: `Locked` (accepted safe default — no text override)
- **Recommended Default**: `PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID`
- **Your Answer**: *(empty — treating as accept default)*

---

## Assumptions already taken from your brief (confirm if wrong)

| Assumption | Source | Overturn? |
|------------|--------|-----------|
| Live under `pages/Markdown-Editor/` only | Brief | No correction noted |
| Static HTML/CSS/JS preferred over Vite | Brief | No correction noted |
| Not inside Journal; not site root | Brief | — |
| Homepage card optional / skip | Brief | Q11 locked skip |
| Single user; ≤100 saves/day; $0 | Brief | — |
| Preview not required for MVP | Brief | Q5 locked |
| Document scopes + setup in page README | Brief | — |

**Corrections**: *(none provided)*

---

## Next step

1. ~~Resolve Q2 vs Q3~~ → **Option 2C locked**.  
2. Explicitly **approve coding** in chat before implementation starts.