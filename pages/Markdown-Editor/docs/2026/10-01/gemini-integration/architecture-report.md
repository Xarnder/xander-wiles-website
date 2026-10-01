# Gemini in the Markdown Editor — architecture and feasibility

**Date:** 2026-10-01  
**Scope:** `pages/Markdown-Editor/`  
**SDK checked:** `@google/genai` Interactions API (`client.interactions.create`). The editor calls `gemini-2.5-flash-lite`, the cheapest Flash model on the current pricing page.  
**Verdict:** Feasible. Gemini should propose Markdown. The existing editor save pipeline should be the only writer. The Mac folder is a Google Drive for Desktop mirror of that write, not a second place for the model to save.

---

## 1. Architecture and feasibility

### What the editor actually writes

This app is a browser client. It does not open the Mac filesystem. A signed-in session holds a short-lived Google Identity Services access token and calls the Drive REST API:

| Step | Code | What happens |
|------|------|----------------|
| Read | `drive.getFileContent(fileId)` | `GET /drive/v3/files/{id}?alt=media` |
| Edit | `editor.js` textarea / `mdlist` UI | Dirty flag + `localStorage` draft |
| Wait | `app.js` `AUTOSAVE_IDLE_MS = 10_000` | Idle debounce; manual Save flushes immediately |
| Check | `inspectRemoteHead` | Compares Drive `version`. Same text is not a conflict. Different text pauses autosave and asks Keep mine / Use Drive / Review |
| Write | `drive.updateFileContent` | One `PATCH` media upload of the full string. Serialized by `enqueueDriveWrite` |
| Recover | `revisions.js` + `pinRetiredHeadAfterSave` | After a large save, the previous head can be pinned (`keepForever`, cap 200 per file) |

Drive for Desktop then syncs that cloud blob onto the Mac. The laptop folder is a replica. It is not the editor’s source of truth.

```text
textarea / mdlist UI
        │  proposed Markdown only
        ▼
Vercel function  ──►  Gemini Interactions API
        │              (store: false, no Drive credentials)
        ▼
editor buffer  (setEditorText, undo stack, local draft)
        │
        ▼
inspectRemoteHead  →  updateFileContent  →  Google Drive file
        │
        ▼
Drive for Desktop copies the new revision onto the Mac
```

### How Gemini should connect

Use the Interactions API from a server-side `@google/genai` client. As of June 2026 that API is the recommended surface for new work. `generateContent` still works and is treated as legacy. This editor does not need tools, agents, or `previous_interaction_id`.

The model must not receive a Drive token and must not be given a function that calls `updateFileContent`. A tool-using model would skip three protections that already exist:

- optimistic concurrency in `inspectRemoteHead`
- the large-change deferral and post-save pin
- session undo in `history.js`, which survives autosave

Each feature sends the open note, or a selection plus enough surrounding context to preserve structure, and receives a string. The client splices that string into `editorContent`. Autosave then does what it already does.

### Fit with this codebase

| Constraint | Consequence |
|------------|-------------|
| Vanilla JS modules, no Firebase (locked 2026-07-28) | Do not adopt Firebase AI Logic for this page. A small Vercel function matches the current deploy better. |
| Static Vercel project (`framework: null`, `outputDirectory: deploy_out`) | The function lives at the repo-root `api/` directory. It will not run if it is copied into `pages/Markdown-Editor/` as a static asset. |
| Service worker caches the app shell | `sw.js` ignores non-GET requests. Call the function with `POST`, so a Gemini response is never stored in the Cache API. |
| `mdlist` fenced JSON and `{{date:…}}` tags | These are load-bearing. A rewrite that drops a fence or breaks unique scores corrupts Custom / Mixed mode. Validate before apply. |
| Full `drive` OAuth scope, Testing mode, public site URL | The function must reject callers who are not the Drive owner. Otherwise `xanderwiles.com` becomes an open proxy for the Gemini key. |
| Computers vs My Drive | Drive for Desktop often exposes Mac folders under **Computers**, which the Drive API does not browse officially. LLM writes should target a file the editor already opened by `fileId` under **My Drive**. |

### What “the LLM edits the files” should mean

The model reads text the browser already loaded and returns replacement text. The browser commits through `updateFileContent`. The Mac file changes only because Drive for Desktop downloads that revision.

Sending the whole vault on every call is unnecessary and expensive. The open file, or the current selection, is the context. `gemini-2.5-flash-lite` can take a long note, but selection-scoped edits keep latency, cost, and blast radius small.

The editor uses `gemini-2.5-flash-lite` because it is the cheapest Flash model on the current Gemini pricing page ($0.10 / 1M input tokens, $0.40 / 1M output tokens). `@google/genai` must be **2.3.0 or newer** for `interactions.create`.

---

## 2. Authentication and security

### Where the key lives

`new GoogleGenAI({})` reads `GEMINI_API_KEY` from the environment. That variable belongs on the Vercel function only.

| Name | Where | Exposed to the browser? |
|------|--------|-------------------------|
| `PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID` | `.env.local`, Vercel, injected by `build.js` | Yes. It is an OAuth client id, which is public by design. |
| `GEMINI_API_KEY` | Vercel env for the function, and a local `.env` when running the proof of concept | No. Do not prefix it with `PUBLIC_`. Do not import it from `config.js`. |

The existing rule still holds: this page has no client secret, and the GIS token stays in `localStorage` until it expires. Adding Gemini does not change that. The new secret is the Gemini key, and it never enters the static bundle.

### Proxy shape

```text
Browser
  POST /api/markdown-gemini
  Authorization: Bearer <existing GIS access token>
  body: { task, markdown, selection? }
        │
        ▼
Vercel Node function
  1. tokeninfo (or oauth2 userinfo) on that Bearer token
  2. reject unless the email is the vault owner
  3. reject oversized bodies
  4. interactions.create with GEMINI_API_KEY
  5. return { markdown } and nothing else
```

The Drive token is an authentication ticket for the function. It is not forwarded to Gemini. Gemini never sees `fileId`, parents, or the OAuth token.

Check the token with Google’s token info endpoint and require:

- the token is unexpired
- the audience / client id matches `PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID` when that field is present
- The caller must be exactly `xanderwiles@gmail.com`. That address is fixed in `api/markdown-gemini.js`. Similar addresses are refused.

Testing-mode OAuth already limits who can obtain a Drive token. The email check is the second gate, so a future extra test user cannot spend the Gemini quota.

### Retention

Interactions defaults to `store: true` so `previous_interaction_id` can replay server-side history. That stores note text with Google. These calls should set `store: false`. One-shot edits do not need server history. If a later chat feature needs multiple turns, resend the steps from the browser, still with `store: false`, rather than leaving vault text in stored interactions.

### Other boundaries

- No `tools` array. In particular, do not declare a “write file” or “list Drive” function.
- Cap input size in the function (for example a few hundred kilobytes). The editor already warns before opening multi-megabyte notes.
- Log status codes and token counts, not the Markdown body.
- `thinking_level: "low"` is enough for expansion and header generation. Raise it only for summarization if the short setting is too lossy.

Firebase AI Logic (client SDK + App Check) is a different product. It would pull Firebase into a page whose plan explicitly left Firebase out, and it still needs a provisioning step (`firebase init ailogic`) plus App Check before it is safe. The Vercel proxy is the smaller change.

---

## 3. Google Drive sync handling

### The failure mode

Drive for Desktop and this editor can both change the same `.md` bytes.

| Writer | Mechanism |
|--------|-----------|
| This editor | Drive API `PATCH` of the cloud file |
| Drive for Desktop | Watches the Mac path and uploads or downloads |
| A local agent | `fs.writeFile` on that same path |

Two of those in the same minute produce a conflicted copy (`filename (1).md` or a “conflicted copy” sibling), a silent last-write-wins overwrite, or a file the editor’s `version` check then flags as “Changed elsewhere.” Streaming model tokens into the file makes this worse: the sync client can upload a half-written document.

`updateFileContent` itself is last-write-wins. Safety comes from `inspectRemoteHead` running *before* that PATCH, and from pinning the retired head *after* a successful large save. A local overwrite skips both.

### Strategy: one writer

1. **Keep the vault in My Drive**, not only under Computers. The README already documents the move: Computers → the Mac → Organise → Move into My Drive. The editor then has a stable `fileId`. Drive for Desktop mirrors My Drive down to the Mac after the API write.
2. **Apply model output in the editor buffer**, then let idle autosave or Save call `updateFileContent` once, with the complete string.
3. **Show streamed tokens in a preview**, not in the file. `interactions.create({ stream: true })` is a UI concern. The Drive body is the finished string.
4. **Treat a full-note replacement as a large change.** The destructive-edit path already defers autosave and, after the upload, pins the previous head (“Before large change”). Route whole-file Gemini replacements through that path. Do not pin every small selection edit; the file can hold only 200 `keepForever` revisions.
5. **Leave the Mac file alone while the web editor has it open.** If Cursor or another local editor saves the same path, Drive for Desktop uploads it, `version` advances, and the next autosave hits the existing conflict dialog. That dialog is the right outcome. Closing the local editor during a Gemini session avoids the dialog.
6. **Do not delete and recreate the Drive file.** A new `fileId` drops the local draft key, revision history, and recent-file entry.

### If a local write is ever required

Prefer not to. If a Node script must touch the mirror directly:

- Write a sibling temp file on the same volume, `fsync`, then `rename` over the target. A plain `writeFile` truncates first, and Drive for Desktop can upload the empty or partial file.
- Do this only when the web editor is not autosaving that `fileId`.
- Afterward, reopen the note in the editor so `driveVersion` is re-read. The script will not have updated the in-memory version, and the next Save would otherwise look like a conflict or overwrite a newer cloud revision.

The proof of concept below returns a string and does not write a path.

### Apply-time checks

Before `setEditorText`:

- Reject empty output.
- Strip one wrapping ` ```markdown ` fence if the model added it. The file should not gain an extra fence around the whole note.
- For selection edits, splice into the original string so bytes outside the selection stay identical, including `mdlist` fences and `{{date:…}}` tags.
- For whole-file edits, parse `mdlist` fences with the existing list parser. If a fence that was valid becomes invalid, or item ids disappear, refuse the apply and leave the buffer unchanged.
- On apply, undo history should record one step so ⌘Z restores the pre-model text even after autosave.

---

## 4. Feature implementation

Three features that stay inside one open note and reuse the save path above. All three return Markdown (or a span of it). None of them list the vault or call Drive.

### 4.1 Selection expansion

**User action:** in Edit (raw) mode, select a stub paragraph or a heading and ask to expand it.

**Request:** the selected string, plus a short prefix and suffix (a few hundred characters, not the whole vault) so tone and heading level match.

**Response:** replacement Markdown for the selection only.

**Apply:** splice by the selection offsets. Custom / Mixed mode is a poor host for this until the selection can be mapped back to raw offsets; start in raw mode, where the textarea offsets are the source of truth.

This is the safest feature. A bad expansion is one undo, and fences outside the selection cannot move.

### 4.2 Note header (frontmatter-shaped, editor-native)

YAML frontmatter is not a structure this editor parses. Preview would show it as text or as a broken code fence, and a generated `---` block at byte 0 can collide with an `mdlist` fence later in the file.

Generate a header the file already knows how to store:

```markdown
# Ship custom lists

{{date:2026-10-01}}

Short paragraph: what this note is for.
```

**Request:** the first ~2 KB of the note, or the whole note when it is small. Instruct the model not to echo the body.

**Response:** the header block only.

**Apply:** if the note already starts with a top-level `#` heading, replace that heading and the immediately following date tag and summary paragraph. Otherwise insert at offset 0. Do not rewrite anything below a delimiter such as the first `##` or the first `mdlist` fence.

That gives the practical result of frontmatter (title, date, summary) without a metadata dialect the preview ignores. A later cycle can add real YAML if Preview learns to hide it.

### 4.3 Summarize without replacing the note

**User action:** “Summarize this note” produces a block the user can insert, not a silent rewrite of the source.

**Request:** the raw note. The system instruction says `mdlist` fences and `{{date:…}}` tags are data, not prose to paraphrase.

**Response:** a `## Summary` section of a few bullets. It must not contain a fence.

**Apply:** insert after the header from 4.2, or at the caret. Offer Replace summary if a `## Summary` section already exists, matched by heading text, so repeated runs do not stack identical sections. The body, lists, and fences stay byte-identical.

A side panel that never writes is even safer, but an inserted section survives reload and syncs with the note, which matches how this editor stores everything else: inside the `.md` file.

### Shared UI rules

- The button sits in the Edit menu next to Version history. It is disabled while `status === 'saving'` or `'conflict'`.
- Preview the model output before it touches `editorContent`. Accept runs `setEditorText`. Cancel leaves the buffer alone.
- After Accept, status becomes dirty and the normal 10s autosave runs. Do not call `updateFileContent` from the Gemini callback directly, or a conflict check can be skipped.
- Failures (401 from the proxy, Gemini 429, invalid fences) set the existing error status and keep the text.

---

## 5. Code proof of concept

Node 18+, `@google/genai` ≥ 2.3.0. The client picks up `GEMINI_API_KEY` from the environment. This module returns Markdown. It does not read Drive and does not write a file. `store: false` keeps the note out of stored interactions.

```bash
npm install @google/genai
export GEMINI_API_KEY="your-key"
node rewrite-markdown.mjs
```

```javascript
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash-lite";

const SYSTEM = `You edit one Markdown note.
Return only the requested Markdown. No preamble, no closing comment.
Preserve every \`\`\`mdlist fence exactly, including its JSON and the HTML comment above it.
Preserve every {{date:...}} tag unless the task explicitly asks to add one.
Do not wrap the whole answer in a code fence.`;

/**
 * @param {import("@google/genai").GoogleGenAI} client
 * @param {{ task: "expand" | "header" | "summarize", markdown: string, selection?: string }} request
 * @returns {Promise<string>}
 */
export async function rewriteMarkdown(client, request) {
  const markdown = String(request.markdown ?? "");
  if (!markdown.trim()) {
    throw new Error("markdown is empty");
  }

  const selection = String(request.selection ?? "");
  const taskText = {
    expand: [
      "Expand the selection into a short Markdown passage that fits the surrounding note.",
      "Return only the replacement for the selection.",
      "",
      "SELECTION:",
      selection,
      "",
      "NOTE:",
      markdown,
    ].join("\n"),
    header: [
      "Write a note header: one H1, one {{date:YYYY-MM-DD}} tag for today, and one summary paragraph.",
      "Do not repeat the rest of the note.",
      "",
      markdown,
    ].join("\n"),
    summarize: [
      "Write a ## Summary section with 3 to 6 bullets describing the note.",
      "Do not include mdlist fences or copy the whole note.",
      "",
      markdown,
    ].join("\n"),
  }[request.task];

  if (!taskText) {
    throw new Error(`unknown task: ${request.task}`);
  }

  const interaction = await client.interactions.create({
    model: MODEL,
    store: false,
    system_instruction: SYSTEM,
    generation_config: { thinking_level: "low" },
    input: taskText,
  });

  if (interaction.status && interaction.status !== "completed") {
    throw new Error(`interaction ${interaction.status}`);
  }

  const text = stripWrappingFence(interaction.output_text || "");
  if (!text.trim()) {
    throw new Error("model returned empty markdown");
  }
  return text;
}

function stripWrappingFence(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

// Local smoke test. Delete this block when the function imports rewriteMarkdown.
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new GoogleGenAI({});
  const sample = [
    "# Ideas",
    "",
    "{{date:2026-08-03}}",
    "",
    "Ship the editor.",
    "",
    "<!-- For LLMs / coding agents: You may add items to this custom ranked list. Do not change the fenced mdlist JSON format. -->",
    "```mdlist",
    JSON.stringify({
      version: 1,
      id: "ideas",
      title: "Ideas",
      items: [{ id: "i1", text: "Add Gemini as a proposer", score: 8, tags: ["editor"] }],
    }, null, 2),
    "```",
    "",
  ].join("\n");

  const summary = await rewriteMarkdown(client, {
    task: "summarize",
    markdown: sample,
  });
  console.log(summary);
}
```

Wiring this into the page is a POST from `app.js` after the user accepts the preview. The function holds the key; the browser sends the GIS access token and the note text; the response is passed to `setEditorText`. Autosave, `inspectRemoteHead`, and `updateFileContent` stay as they are.

```javascript
// Sketch only — lives in the browser, not in the Node module above.
async function requestRewrite(accessToken, body) {
  const response = await fetch("/api/markdown-gemini", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Gemini proxy failed (${response.status})`);
  }
  const payload = await response.json();
  return String(payload.markdown || "");
}
```

The Vercel handler constructs `new GoogleGenAI({})`, checks the Bearer token against the allowlisted email, calls `rewriteMarkdown`, and returns `{ markdown }`.

---

## Recommendation

Build the proxy and selection expansion first. Header generation and summarization use the same function with a different `task`. Ship them only after fence validation and the Accept / Cancel preview are in place.

Do not point Gemini at the Mac path. Drive for Desktop should learn about edits the same way it already learns about a normal Save: one cloud revision, then a download.
