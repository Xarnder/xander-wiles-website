# Local development guide

How to run individual pages quickly, and how to preview the full site (homepage, nav, and cross-page links) the way production does.

All commands assume you are in the **repository root** unless a step says `cd pages/...`.

---

## Mental model

This repo is a **static site** plus a handful of **separate apps** under `pages/`:

| Kind | Examples | Fastest local workflow |
|------|----------|------------------------|
| **Static page** | To-Do List, Time Pass, Countdown, Markdown-Editor | Root `npm run dev` → open `/pages/<name>/` |
| **Vite app** (React) | Journal, Teleprompter | `cd pages/<app>` → `npm run dev` |
| **Vite app** (Svelte) | Logo-Demo | `cd pages/<app>` → `npm run dev` |
| **SvelteKit app** | Fighter-Jet, Z-Image Turbo, Tax-Helper | `cd pages/<app>` → `npm run dev` |
| **Full site** (nav + built apps) | Homepage → Journal link, etc. | `npm run build` → `npm run preview` |

Root `npm run dev` is **`npx serve .`** — it only serves files on disk. It does **not** compile TypeScript/JSX or run Vite. Opening a Vite app’s source `index.html` that way will look **blank** (browser tries to load `/src/main.tsx` and fails).

Bundled apps are **built in `build.js`** and copied into `deploy_out/pages/...`. Until you run a full build, those folders in the live tree are either missing or stale source, not production bundles.

---

## Quick reference

| App | Folder | Dev (hot reload) | URL in dev (typical) |
|-----|--------|------------------|----------------------|
| **Homepage** | `/` | `npm run dev` | `http://localhost:3000/` |
| **To-Do List** | `pages/To-Do-List/` | `npm run dev` | `http://localhost:3000/pages/To-Do-List/` |
| **Time Pass** | `pages/Time-Pass/` | `npm run dev` (UI) · `npm run build` + `npm run preview` (Google sign-in) | `http://localhost:3000/pages/Time-Pass/` |
| **Markdown-Editor** | `pages/Markdown-Editor/` | `npm run dev` | `http://localhost:3000/pages/Markdown-Editor/` |
| **Journal** | `pages/journal/` | `cd pages/journal && npm install && npm run dev` | `http://localhost:5173/pages/journal/` |
| **Teleprompter** | `pages/Teleprompter/` | `cd pages/Teleprompter && npm install && npm run dev` | `http://localhost:5173/pages/Teleprompter/` |
| **Logo Demo** | `pages/Logo-Demo/` | `cd pages/Logo-Demo && npm install && npm run dev` | `http://localhost:5173/pages/Logo-Demo/` |
| **Fighter-Jet** | `pages/Fighter-Jet/` | `cd pages/Fighter-Jet && npm install && npm run dev` | Vite prints URL (often `http://localhost:5173/`) |
| **Z-Image Turbo** | `pages/z-image-turbo-sveltekit/` | `cd pages/z-image-turbo-sveltekit && npm install && npm run dev` | Vite prints URL |

**Full site (production-like):**

```bash
npm run build
npm run preview
```

Then open `http://localhost:3000/` (or the port `serve` prints). Use homepage cards and the nav to jump between tools.

---

## 1. Static pages (To-Do List, Markdown-Editor, utilities, games, etc.)

Most folders under `pages/` are plain HTML/CSS/JS. No install in the page folder required.

```bash
# From repo root (first time only)
npm install

npm run dev
```

- Homepage: `http://localhost:3000/`
- To-Do List: `http://localhost:3000/pages/To-Do-List/`
- Time Pass: `http://localhost:3000/pages/Time-Pass/`
- Markdown-Editor: `http://localhost:3000/pages/Markdown-Editor/`
- Any other static tool: `http://localhost:3000/pages/<Folder-Name>/`

Many pages load shared assets from `/assets/` and the nav from `/nav.html` — those work automatically when you serve from the **repo root**, not when you open `index.html` as a `file://` URL.

**Firebase / API keys:** Some static apps read config that `build.js` injects from `.env.local` at **build** time. For day-to-day UI work, `npm run dev` on the repo root is usually enough; for auth or live backend behavior, use a full **`npm run build`** preview (see below) with `.env.local` populated (see `.env.example`).

**Markdown-Editor (Google Drive auth):** Root `npm run dev` serves the UI without env injection. To test sign-in / Drive, put `PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID` in `.env.local`, then:

```bash
npm run build
npm run preview
# open http://localhost:3000/pages/Markdown-Editor/
```

Setup details: `pages/Markdown-Editor/README.md` and `pages/Markdown-Editor/GOOGLE-CLOUD-SETUP.md`.

**Time Pass (Google sign-in):** Same injection rule. Root `npm run dev` shows the guest (read-only) sample events, but **Sign in with Google will not work** until Firebase config is baked in. See [Time Pass](#2-time-pass-google-sign-in) below.

---

## 2. Time Pass (Google sign-in)

Time Pass is a **static** page (`pages/Time-Pass/`). The UI runs from root `npm run dev`; **Google login and Firestore sync** need the Time Pass Firebase web config injected by `build.js`.

### UI only (guest preview)

```bash
# From repo root
npm install
npm run dev
```

Open **`http://localhost:3000/pages/Time-Pass/`**. You get read-only sample events. Tapping **Sign in with Google** shows “Firebase is not configured” until the steps below are done.

### Sign in with Google (local)

1. Copy env vars from `.env.example` into repo-root **`.env.local`** (do not commit `.env.local`):

   ```
   PUBLIC_TIME_PASS_FIREBASE_API_KEY=
   PUBLIC_TIME_PASS_FIREBASE_AUTH_DOMAIN=
   PUBLIC_TIME_PASS_FIREBASE_PROJECT_ID=
   PUBLIC_TIME_PASS_FIREBASE_STORAGE_BUCKET=
   PUBLIC_TIME_PASS_FIREBASE_MESSAGING_SENDER_ID=
   PUBLIC_TIME_PASS_FIREBASE_APP_ID=
   ```

   Fill them from the Time Pass **Firebase Console → Project settings → Your apps → Web**. This is a **dedicated** Firebase project (not To-Do List / Journal).

2. In that same Firebase project:

   - **Authentication → Sign-in method → Google** — enable it.
   - **Authentication → Settings → Authorized domains** — include `localhost` (and later `xanderwiles.com` / `www.xanderwiles.com` for production).
   - **Firestore** — create the database if needed, then publish the rules in `pages/Time-Pass/firestore.rules`.

3. Inject config and serve the built site (root `npm run dev` does **not** replace `process.env`):

   ```bash
   npm run build
   npm run preview
   # open http://localhost:3000/pages/Time-Pass/
   ```

4. Click **Sign in with Google**. Allow the popup if the browser blocks it. After a successful login, events and settings sync under your Google `uid`.

Project creation, rules deploy, and optional local `window.TIME_PASS_FIREBASE_CONFIG` override: `pages/Time-Pass/README.md`.

---

## 3. Journal (Vite + React)

```bash
cd pages/journal
npm install
npm run dev
```

Open **`http://localhost:5173/pages/journal/`** (base path is set in `vite.config.js`).

Useful extras:

```bash
npm run build    # production bundle → pages/journal/dist/
npm run preview  # serve dist locally (still under /pages/journal/ base)
```

Journal uses Firebase. For production-like behavior, keep `PUBLIC_*` / journal-related vars in repo root `.env.local` and test via **`npm run build`** + **`npm run preview`** at the repo root so `build.js` can inject them.

SPA routing: `serve.json` at the repo root rewrites `/pages/journal/*` to `index.html` when using `serve` on `deploy_out`.

---

## 4. Teleprompter (Vite + React)

```bash
cd pages/Teleprompter
npm install
npm run dev
```

Open **`http://localhost:5173/pages/Teleprompter/`**.

```bash
npm test              # alignment engine unit tests
npm run build
npm run preview
```

Mic and on-device ASR need a **secure context** (`localhost` is fine). Use Chrome/Edge and allow microphone when prompted.

**Do not** expect Teleprompter to work from root `npm run dev` alone — that serves source, not the Vite bundle.

---

## 5. SvelteKit apps (Fighter-Jet, Z-Image Turbo)

```bash
cd pages/Fighter-Jet   # or pages/z-image-turbo-sveltekit
npm install
npm run dev
```

Use the URL Vite prints in the terminal. These apps are built and injected into `deploy_out` during root `npm run build`; paths on the live site are `/pages/Fighter-Jet/` and `/pages/z-image-turbo-sveltekit/`.

---

## 6. Full website preview (navigation + built apps)

This matches what Vercel deploys: homepage, `assets/`, nav, static pages, **and** compiled Journal / Teleprompter / Fighter-Jet / Z-Image.

```bash
# From repo root
npm install
npm run build      # can take several minutes (installs + builds sub-apps)
npm run preview    # same as: npx serve deploy_out
```

- Homepage: `http://localhost:3000/`
- Teleprompter: `http://localhost:3000/pages/Teleprompter/`
- Journal: `http://localhost:3000/pages/journal/`
- To-Do List: `http://localhost:3000/pages/To-Do-List/`
- Time Pass: `http://localhost:3000/pages/Time-Pass/`
- Markdown-Editor: `http://localhost:3000/pages/Markdown-Editor/`

Click through the homepage grid and the loaded nav bar to verify links and “recent pages” behavior.

**Spelling:** the output folder is **`deploy_out`** (not `depoloy_out`).

**If every URL returns 404:** you were probably serving before a successful build, or an old copy of `deploy_out` had a `.gitignore` that made `serve` ignore all files. Run `npm run build` again (current `build.js` writes a safe `.gitignore` inside `deploy_out`).

**Optional:** Python instead of `serve`:

```bash
npm run build
cd deploy_out && python3 -m http.server 3000
```

---

## 7. Two-terminal workflow (common day)

| Terminal A | Terminal B |
|------------|------------|
| `cd pages/Teleprompter && npm run dev` | `npm run dev` (repo root) |

- Hack Teleprompter with hot reload on port **5173**.
- Check homepage layout / links to other static tools on port **3000**.
- Before merging, run **`npm run build && npm run preview`** once and click **Teleprompter** from the homepage.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Blank page on a Vite app via root `npm run dev` | Serving raw `index.html` + `/src/...` | Use `cd pages/<app> && npm run dev` |
| `GET /` → 404 while serving `deploy_out` | Stale/bad `.gitignore` in `deploy_out` | `npm run build` again; use `npm run preview` |
| Journal `/pages/journal/entry/...` 404 on refresh in preview | SPA rewrite not in `deploy_out/serve.json` | Test journal with `cd pages/journal && npm run preview`, or run `npx serve deploy_out -c serve.json` from the **repo root** (root `serve.json` includes journal rewrites) |
| Time Pass: “Firebase is not configured” on Sign in | Root `npm run dev` does not inject `.env.local` | Put `PUBLIC_TIME_PASS_FIREBASE_*` in `.env.local`, then `npm run build && npm run preview` |
| Time Pass: `auth/unauthorized-domain` | `localhost` missing from Firebase Auth | Firebase Console → Authentication → Settings → Authorized domains → add `localhost` |
| Time Pass: popup closes / blocked | Browser popup blocker | Allow popups for `localhost:3000`, or retry (the app falls back to redirect sign-in) |
| Wrong folder name | Typo | **`deploy_out`**, not `depoloy_out` |
