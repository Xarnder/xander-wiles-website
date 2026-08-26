# Google Drive Markdown Editor

Personal, phone-friendly editor for `.md` files in your Google Drive.  
Live path: `/pages/Markdown-Editor/`

## What it does

1. Sign in with Google (OAuth access token via Google Identity Services)
2. Browse Drive folders in-app (open folder, list markdown, navigate Up)
3. **Create** new markdown notes and folders in the current location
4. **Rename** notes and folders from the list (or Rename while editing)
5. Open a `.md` / `text/markdown` file
6. Edit in a plain textarea (**Standard** mode), or use **Custom** / **Mixed** modes for structured `mdlist` blocks
7. Save back to the **same** Drive file
8. Shows loading / dirty / saving / saved / error status
9. Keeps a local draft on this device if the tab is killed (restore prompt on reopen)
10. **Autosaves** to Drive after **10 seconds** of inactivity (slim countdown bar under the mode switcher)
11. **Undo / Redo** survive autosave — Edit toolbar buttons (mobile) plus ⌘/Ctrl+Z and ⌘/Ctrl+Shift+Z / Ctrl+Y
12. **Version history** — Edit ⋮ → Version history lists Drive revisions; Preview (read-only) or Restore (uploads that text as a **new** current version; older revisions stay available)
13. **Large-change guard** — big deletes/replacements delay autosave, then pin the *previous* Drive revision **after** a successful save (Drive cannot pin the live head). Pin failure never blocks saving.
14. **Conflict check** — if Drive’s file *text* changed elsewhere, Save asks Keep mine / Use Drive / Review. Version bumps from our own pins are ignored.
15. **Named versions** — Edit ⋮ → Name this version… protects the current revision with a label in History
16. **Pinned / Finder / Settings** keep the open file in memory and save in the background — they do not show “unsaved changes” dialogs. That prompt still appears when opening a different file or signing out.

**Undo vs History:** Undo/Redo cover mistakes in the current tab. Version history covers earlier cloud uploads after reload or after a bad autosave.

## Custom lists (`mdlist`)

You can embed ranked lists inside a `.md` file using a fenced JSON block:

````markdown
<!-- For LLMs / coding agents: You may add items to this custom ranked list. Do not change the fenced mdlist JSON format — keep version, id, title, and items (unique scores; optional tags). Look carefully at the existing structure before editing. -->
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
````

Each valid list is saved with that HTML comment immediately above the fence so Cursor / Codex / other agents can extend the list without breaking the schema. The comment is hidden in Preview / Mixed rendering.

### Hidden date tags

Insert metadata dates that stay in the file source but stay out of Preview by default:

```markdown
{{date:2026-08-03}}
Meeting notes for {{date:3 Aug 2026}}
```

| Surface | Behavior |
|---------|----------|
| **Raw** | Always shows the `{{date:…}}` tag |
| **Preview / List prose** | Hidden unless **Show dates** is on in the Edit ⋮ menu |
| **Fill missing list dates…** | Stamps undated list items (normal + custom) with the file’s created date or a custom date you enter |
| **Insert date** | Adds today’s tag (`{{date:YYYY-MM-DD}}`) at the caret (Raw) or end of file |
| **New list items** | Custom (`mdlist`) and normal markdown list items automatically get today’s tag appended |

Inner values are smart-parsed (ISO, day/month/year, named months, `today` / `yesterday` / `tomorrow`).

| Mode | Behavior |
|------|----------|
| **Custom** | Interactive list UI only (add/delete items, scores, tags, drag reorder) |
| **Mixed** | List UI for `mdlist` blocks + rendered markdown elsewhere (Edit per section) |
| **Edit** | Full-file textarea (raw markdown, including fences) |
| **Preview** | Full-file rendered markdown (headings, lists, links, code, tables, tasks, …) |

Rules locked for v1:

- Scores are finite numbers, **unique within a list**, shown in the UI
- Display order is **by score (highest first)**; drag/up/down reassigns scores to match
- Tags are a string array; optional tag filter is view-only (Save keeps all items)
- Mode choice is remembered per file in `localStorage`
- Invalid blocks: best-effort repair when safe; otherwise warn and edit in Standard

## Auth approach & Drive scope

| Item | Choice |
|------|--------|
| Auth | **Google Identity Services** token client (`google.accounts.oauth2.initTokenClient`) — **not** Firebase |
| Scope | `https://www.googleapis.com/auth/drive` |
| Why this scope | Needed for an **in-app folder browser** over existing files. `drive.file` alone cannot list arbitrary My Drive trees. This is a personal, testing-mode OAuth app. |
| Token storage | Access token cached in **localStorage** until expiry (~1h); silent GIS refresh on reopen; full consent only when needed |
| Allowlist | None in-app — rely on OAuth **Testing** mode + test users |

No client secret is used in the browser. Never commit secrets.

## Google Cloud setup

**Full beginner walkthrough (recommended):** see **[`GOOGLE-CLOUD-SETUP.md`](./GOOGLE-CLOUD-SETUP.md)** — step-by-step Google Cloud + Drive API + OAuth + env vars.  
**You do not need Firebase for this app.**

Short version:

1. Create a **new** Google Cloud project (suggested id: `markdown-editor-xander`).
2. Enable **Google Drive API**.
3. Configure **OAuth consent screen**:
   - User type: External
   - Publishing status: **Testing**
   - Add your Google account as a **test user**
   - Scopes: add `https://www.googleapis.com/auth/drive` (or it will be requested at runtime)
4. Create credentials → **OAuth client ID** → Application type **Web application**.
5. Authorized **JavaScript origins** (add all you use):
   - `http://localhost:3000`
   - `https://xanderwiles.com`
   - `https://www.xanderwiles.com` (if used)
6. Copy the **Client ID** (public). Do **not** put a client secret in this app.

## Env vars

| Variable | Where |
|----------|--------|
| `PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID` | `.env.local` (local) and Vercel project env (production) |

Also listed in repo root `.env.example`.

Local preview with injected env:

```bash
# from repo root
echo 'PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com' >> .env.local
npm run build
npm run preview
# open http://localhost:3000/pages/Markdown-Editor/
```

`npm run dev` serves source files **without** env injection. For auth testing, prefer `build` + `preview`.

## PWA

- `site.webmanifest` + Apple meta tags for Add to Home Screen
- `sw.js` caches the **app shell** only (HTML/CSS/JS). Drive API traffic is never cached.

After a deploy, you may need one refresh for the new service worker.

## Out of scope (MVP)

Create new files, markdown preview, autosave, conflict merge UI, offline sync, homepage card, Journal integration.

## Manual test checklist

1. Sign in on phone Safari / home-screen app
2. Browse to a folder with `.md` files
3. Open → edit → Save → refresh → reopen → content matches
4. Unsaved navigation / sign-out shows confirm
5. Airplane mode Save shows error and keeps text
6. Kill tab with dirty text → reopen file → restore draft prompt
7. Paste an `mdlist` fence → Custom/Mixed → reorder, score, tags → Save → reopen
8. Duplicate score is rejected; tag filter hides items but Save keeps them
9. Invalid JSON fence warns; Standard still editable

## Mac + Google Drive for Desktop

Drive for Desktop often puts Mac folders under **Computers** in [drive.google.com](https://drive.google.com), which is **not** the same tree as **My Drive**.

**Google’s Drive API has no official “Computers” browser**, so support is best-effort (looking for orphan computer root folders). It often works in practice — as in your account — but can fail for some setups.

### If Computers doesn’t show what you need

1. Open [drive.google.com](https://drive.google.com) while signed into the same account.
2. Left sidebar → **Computers** → open your Mac.
3. Select the folder (or `.md` files) you want.
4. Right-click → **Organise** → **Move** → a folder under **My Drive**.
5. In this app, use **My Drive**.

### In-app options

- **Computers** tab: best-effort list of computer roots, then normal folder browsing inside.
- **Find .md**: account-wide name search.
- Lists always show **markdown files above folders**.
