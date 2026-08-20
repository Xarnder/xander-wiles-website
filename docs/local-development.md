# Local development guide

How to run individual pages quickly, and how to preview the full site (homepage, nav, and cross-page links) the way production does.

All commands assume you are in the **repository root** unless a step says `cd pages/...`.

---

## Mental model

This repo is a **static site** plus a handful of **separate apps** under `pages/`:

| Kind | Examples | Fastest local workflow |
|------|----------|------------------------|
| **Static page** | To-Do List, Countdown | Root `npm run dev` → open `/pages/<name>/` |
| **Static page + Google auth** | Markdown-Editor, Time Pass | `npm run build` → `npm run preview` (Client ID / Firebase is injected at build time) |
| **Vite app** (React) | Journal, Teleprompter | `cd pages/<app>` → `npm run dev` |
| **Vite app** (Svelte) | Logo-Demo | `cd pages/<app>` → `npm run dev` |
| **SvelteKit app** | Fighter-Jet, Z-Image Turbo, Tax-Helper | `cd pages/<app>` → `npm run dev` |
| **Full site** (nav + built apps) | Homepage → Journal link, etc. | `npm run build` → `npm run preview` |

Root `npm run dev` is **`npx serve .`** — it only serves files on disk. It does **not** compile TypeScript/JSX or run Vite. Opening a Vite app’s source `index.html` that way will look **blank** (browser tries to load `/src/main.tsx` and fails).

Bundled apps are **built in `build.js`** and copied into `deploy_out/pages/...`. Until you run a full build, those folders in the live tree are either missing or stale source, not production bundles.

---

## Quick reference

Copy-paste the **From repo root** command while your shell is in the website repo.

- **Static pages** (Homepage, To-Do, Time Pass, Markdown-Editor, Full site): stay at the repo root. Do **not** `cd` into `pages/...` — those folders have no `package.json`.
- **Vite / SvelteKit apps:** the one-liner **does** `cd` into the app first, then install and run. After you stop the server you will be left in that app folder; `cd ../..` (or `cd -`) to get back to the repo root.

`npm install` is a no-op when dependencies are already present.

| App | Folder | URL | From repo root |
|-----|--------|-----|----------------|
| **Homepage** | `/` | `http://localhost:3000/` | `npm install && npm run dev` |
| **To-Do List** | `pages/To-Do-List/` | `http://localhost:3000/pages/To-Do-List/` | `npm install && npm run dev` |
| **Time Pass** (UI only) | `pages/Time-Pass/` | `http://localhost:3000/pages/Time-Pass/` | `npm install && npm run dev` |
| **Time Pass** (Google sign-in) | `pages/Time-Pass/` | `http://localhost:3000/pages/Time-Pass/` | `npm install && npm run build && npm run preview` |
| **Markdown-Editor** | `pages/Markdown-Editor/` | `http://localhost:3000/pages/Markdown-Editor/` | `npm install && npm run build && npm run preview` |
| **Journal** | `pages/journal/` | `http://localhost:5173/pages/journal/` | `cd pages/journal && npm install && npm run dev` |
| **Teleprompter** | `pages/Teleprompter/` | `http://localhost:5173/pages/Teleprompter/` | `cd pages/Teleprompter && npm install && npm run dev` |
| **Logo Demo** | `pages/Logo-Demo/` | `http://localhost:5173/pages/Logo-Demo/` | `cd pages/Logo-Demo && npm install && npm run dev` |
| **Fighter-Jet** | `pages/Fighter-Jet/` | Vite prints URL (often `http://localhost:5173/`) | `cd pages/Fighter-Jet && npm install && npm run dev` |
| **Z-Image Turbo** | `pages/z-image-turbo-sveltekit/` | Vite prints URL | `cd pages/z-image-turbo-sveltekit && npm install && npm run dev` |
| **Tax Helper** | `pages/Tax-Helper/` | Vite prints URL | `cd pages/Tax-Helper && npm install && npm run dev` |
| **Full site** | `deploy_out/` | `http://localhost:3000/` | `npm install && npm run build && npm run preview` |

After `npm run preview` / `npm run dev`, open the URL for that app (or the port `serve` / Vite prints). Homepage cards and the nav work on the **Full site** command.

---

## 1. Static pages (To-Do List, utilities, games, etc.)

Most folders under `pages/` are plain HTML/CSS/JS. No install in the page folder required.

```bash
# From repo root (first time only)
npm install

npm run dev
```

Run these from the **repository root** (`npx serve .`). There is no `npm run dev` inside `pages/Markdown-Editor/` — that folder has no `package.json`.

- Homepage: `http://localhost:3000/`
- To-Do List: `http://localhost:3000/pages/To-Do-List/`
- Time Pass: `http://localhost:3000/pages/Time-Pass/` (UI only; Google login needs [section 3](#3-time-pass-google-sign-in))
- Any other static tool: `http://localhost:3000/pages/<Folder-Name>/`

Many pages load shared assets from `/assets/` and the nav from `/nav.html` — those work automatically when you serve from the **repo root**, not when you open `index.html` as a `file://` URL.

**Firebase / API keys:** Some static apps read config that `build.js` injects from `.env.local` at **build** time. For day-to-day UI work, `npm run dev` on the repo root is usually enough; for auth or live backend behavior, use a full **`npm run build`** preview (see below) with `.env.local` populated (see `.env.example`).

**Markdown Editor:** Do **not** use root `npm run dev` if you need to sign in. Google Drive login needs the Client ID baked in at build time — see [Markdown Editor](#2-markdown-editor-google-drive-sign-in) below.

**Time Pass (Google sign-in):** Same injection rule. Root `npm run dev` shows the guest (read-only) sample events, but **Sign in with Google will not work** until Firebase config is baked in. See [Time Pass](#3-time-pass-google-sign-in) below.

---

## 2. Markdown Editor (Google Drive sign-in)

The Markdown Editor is a **static** page (`pages/Markdown-Editor/`). Google sign-in uses a **Web OAuth Client ID** injected by `build.js` from `.env.local`. Root `npm run dev` (`npx serve .`) serves the source files **without** that injection, so Sign in with Google fails (typically “Client ID not configured”).

Do **not** `cd pages/Markdown-Editor` and run `npm run dev` — that folder has no npm scripts. Always run from the **repository root**.

### Sign in with Google (local)

1. Copy the variable from `.env.example` into repo-root **`.env.local`** (do not commit `.env.local`):

   ```
   PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID=
   ```

   Fill it with the **OAuth 2.0 Web client ID** from Google Cloud (ends in `.apps.googleusercontent.com`). Full Cloud + Drive API + consent-screen walkthrough: `pages/Markdown-Editor/GOOGLE-CLOUD-SETUP.md`.

2. In that Google Cloud OAuth client, **Authorized JavaScript origins** must include:

   - `http://localhost:3000`
   - `https://xanderwiles.com` (production)
   - `https://www.xanderwiles.com` if you use www

   Use `http` for localhost, **no trailing slash**. The consent screen should be **Testing**, with your Google account added as a **test user**.

3. Inject the Client ID and serve the **built** site (root `npm run dev` does **not** replace `process.env`):

   ```bash
   # From repo root
   npm install
   npm run build
   npm run preview
   ```

4. Open **`http://localhost:3000/pages/Markdown-Editor/`** (port `3000`, not a Vite `5173` URL).

5. Click **Sign in with Google**. Allow the popup if the browser blocks it. After consent you should land on the Drive folder browser.

Rebuild after changing `.env.local` — preview serves `deploy_out`, which only updates when `npm run build` runs.

---

## 3. Time Pass (Google sign-in)

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

## 4. Journal (Vite + React)

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

## 5. Teleprompter (Vite + React)

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

## 6. SvelteKit apps (Fighter-Jet, Z-Image Turbo)

```bash
cd pages/Fighter-Jet   # or pages/z-image-turbo-sveltekit
npm install
npm run dev
```

Use the URL Vite prints in the terminal. These apps are built and injected into `deploy_out` during root `npm run build`; paths on the live site are `/pages/Fighter-Jet/` and `/pages/z-image-turbo-sveltekit/`.

---

## 7. Full website preview (navigation + built apps)

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

## 8. Two-terminal workflow (common day)

| Terminal A | Terminal B |
|------------|------------|
| `cd pages/Teleprompter && npm run dev` | `npm run dev` (repo root) |

- Hack Teleprompter with hot reload on port **5173**.
- Check homepage layout / links to other static tools on port **3000**.
- Before merging, run **`npm run build && npm run preview`** once and click **Teleprompter** from the homepage.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Blank page on a Vite app via root `npm run dev` | Serving raw `index.html` + `/src/...` | Use `cd pages/<app> && npm run dev` |
| `GET /` → 404 while serving `deploy_out` | Stale/bad `.gitignore` in `deploy_out` | `npm run build` again; use `npm run preview` |
| Journal `/pages/journal/entry/...` 404 on refresh in preview | SPA rewrite not in `deploy_out/serve.json` | Test journal with `cd pages/journal && npm run preview`, or run `npx serve deploy_out -c serve.json` from the **repo root** (root `serve.json` includes journal rewrites) |
| Markdown Editor: “Client ID not configured” / Sign in does nothing | Root `npm run dev` (or `cd pages/Markdown-Editor`) does not inject the OAuth Client ID | Put `PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID` in `.env.local`, then from repo root: `npm run build && npm run preview` and open `http://localhost:3000/pages/Markdown-Editor/` |
| Markdown Editor: origin / `redirect_uri_mismatch` | OAuth JS origin does not match the address bar | Google Cloud OAuth client → Authorized JavaScript origins: `http://localhost:3000` (no trailing slash, `http` not `https`) |
| Markdown Editor: “app has not completed Google verification” | Consent screen is Testing and this Google account is not a test user | Google Cloud → OAuth consent screen → add your account as a test user |
| Time Pass: “Firebase is not configured” on Sign in | Root `npm run dev` does not inject `.env.local` | Put `PUBLIC_TIME_PASS_FIREBASE_*` in `.env.local`, then `npm run build && npm run preview` |
| Time Pass: `auth/unauthorized-domain` | `localhost` missing from Firebase Auth | Firebase Console → Authentication → Settings → Authorized domains → add `localhost` |
| Time Pass: popup closes / blocked | Browser popup blocker | Allow popups for `localhost:3000`, or retry (the app falls back to redirect sign-in) |
| Wrong folder name | Typo | **`deploy_out`**, not `depoloy_out` |
