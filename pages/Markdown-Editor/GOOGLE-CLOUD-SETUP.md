# Beginner setup guide — Google Cloud for Markdown Editor

This guide walks through **every basic step** to get the Markdown Editor talking to Google Drive.

**Time needed:** about 15–30 minutes the first time.  
**Cost:** $0 for personal/testing use.

---

## Important: you do **not** need Firebase for this app

Other tools on your site (To-Do List, Journal, Watch Later) use **Firebase**.

This Markdown Editor does **not**.

| Service | Used here? | Why |
|---------|------------|-----|
| **Google Cloud** | **Yes** | Hosts OAuth + Drive API |
| **Google Drive API** | **Yes** | List / open / save `.md` files |
| **Google Identity (OAuth)** | **Yes** | “Sign in with Google” in the browser |
| **Firebase Auth / Firestore** | **No** | We store nothing in Firebase; Drive is the database |

If the Google Cloud console shows a “Firebase” button, you can ignore it for this project.

---

## What you will create

When you finish, you will have:

1. A **Google Cloud project** (a container for settings)
2. The **Drive API** turned on
3. An **OAuth consent screen** (the permission popup users see)
4. A **Web OAuth Client ID** (a public string your website uses)
5. That Client ID saved in **`.env.local`** (local) and **Vercel** (production)

You will **never** put a **Client Secret** into this website. The browser only needs the Client ID.

---

## Before you start — checklist

- [ ] A Google account (the one that owns the Drive files you want to edit)
- [ ] Access to this website repo on your computer
- [ ] Your live site domain (e.g. `https://xanderwiles.com`)
- [ ] Ability to set environment variables on Vercel (for production)

Suggested project name: `Markdown Editor Xander`  
Suggested project ID: `markdown-editor-xander` (must be unique; Google may append numbers)

---

## Part A — Create a Google Cloud project

### A1. Open Google Cloud Console

1. Go to: [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Sign in with the Google account you will use for Drive.

### A2. Create a new project

1. At the top of the page, click the **project picker** (it may say “Select a project” or show another project name).
2. Click **New Project**.
3. **Project name:** `Markdown Editor Xander` (or similar).
4. **Organization / Location:** leave default unless you know you need something else.
5. Click **Create**.
6. Wait a few seconds, then select the new project from the project picker so the top bar shows your new project name.

> Tip: Everything below must be done **inside this project**. If menus look empty, check you selected the right project.

---

## Part B — Enable the Google Drive API

Your app calls Drive over the internet. Google blocks that until you enable the API.

1. In the left menu, go to **APIs & Services** → **Library**  
   Direct link (after selecting project): [https://console.cloud.google.com/apis/library](https://console.cloud.google.com/apis/library)
2. Search for: `Google Drive API`
3. Click **Google Drive API** (from Google).
4. Click **Enable**.
5. Wait until it says enabled / you see the API overview page.

You do **not** need to enable Firebase, Maps, or other APIs for this app.

---

## Part C — Configure the OAuth consent screen

This is the screen that says: “Markdown Editor wants access to your Google Drive.”

### C1. Open consent screen settings

1. Go to **APIs & Services** → **OAuth consent screen**  
   Link: [https://console.cloud.google.com/apis/credentials/consent](https://console.cloud.google.com/apis/credentials/consent)

### C2. Choose user type

1. If asked for **User type**, choose **External**.
   - External = any Google account *you allow as a test user* can try the app.
   - For a personal tool, External + Testing is normal.
2. Click **Create**.

### C3. Fill app information

On **App information**:

| Field | What to enter |
|-------|----------------|
| **App name** | `Markdown Editor` (or `Xander Markdown Editor`) |
| **User support email** | Your email |
| **App logo** | Optional — skip for now |
| **App domain / homepage** | Optional for testing — you can add `https://xanderwiles.com` later |
| **Developer contact email** | Your email |

Click **Save and Continue**.

### C4. Scopes (permissions)

1. On the **Scopes** step, click **Add or Remove Scopes**.
2. Filter/search for Drive, or paste this scope:

   ```text
   https://www.googleapis.com/auth/drive
   ```

3. Tick that scope (it allows the app to see and manage files in Drive **as the signed-in user**).
4. Click **Update**, then **Save and Continue**.

**Why this scope?**  
This app browses your folders in-app. A narrower scope (`drive.file`) cannot list your existing Drive tree. For a personal testing app used only by you, full Drive is acceptable. Details are also in [`README.md`](./README.md).

### C5. Test users (critical)

While the app is in **Testing** mode, **only test users can sign in**.

1. On **Test users**, click **Add Users**.
2. Add **your** Gmail address (the Drive owner).
3. Save.

If you skip this, sign-in will fail with an error like “Access blocked” or “app has not completed Google verification.”

### C6. Summary + publishing status

1. Review the summary → **Back to Dashboard** / finish.
2. Confirm **Publishing status** is **Testing** (not “In production”).
   - Testing is what you want for a personal tool.
   - You do **not** need Google’s expensive verification process for Testing + your own account.

---

## Part D — Create an OAuth Client ID (Web)

### D1. Open Credentials

1. Go to **APIs & Services** → **Credentials**  
   Link: [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)

### D2. Create OAuth client

1. Click **+ Create Credentials**.
2. Choose **OAuth client ID**.
3. If Google says you must finish the consent screen first, go back to Part C.

### D3. Application type = Web application

1. **Application type:** **Web application**
2. **Name:** `Markdown Editor Web` (any label is fine)

### D4. Authorized JavaScript origins

These are the exact website addresses allowed to start Google sign-in.

Click **Add URI** for each:

| Environment | URI to add |
|-------------|------------|
| Local preview (this repo) | `http://localhost:3000` |
| Production | `https://xanderwiles.com` |
| Production www (if you use it) | `https://www.xanderwiles.com` |

**Rules beginners often miss:**

- Use `http` for localhost, `https` for production.
- **No path** at the end — not `/pages/Markdown-Editor/`.
- **No trailing slash** on the origin (use `http://localhost:3000`, not `http://localhost:3000/`).
- If you use another local port later, add that origin too.

### D5. Authorized redirect URIs

For this app’s GIS **token** client, JavaScript origins matter most.

- You can leave **Authorized redirect URIs** empty for this MVP.
- If Google requires at least one, you may add something like:
  - `http://localhost:3000`
  - `https://xanderwiles.com`
  
  (Only if the console complains; otherwise skip.)

### D6. Create and copy the Client ID

1. Click **Create**.
2. A popup shows:
   - **Client ID** — looks like `123456789-abcdefg.apps.googleusercontent.com`
   - **Client secret** — looks like `GOCSPX-...`
3. Copy the **Client ID** into a password manager or notes app.
4. You may download the JSON for backup, but **do not commit it** to git.

**Do not put the Client Secret in the Markdown Editor code or `.env` for this app.**  
Browser apps are not allowed to keep that secret safe. This project only needs the Client ID.

---

## Part E — Put the Client ID into this website

### E1. Local machine (`.env.local`)

1. Open the **repo root** (folder that contains `package.json` and `build.js`).
2. If you do not have `.env.local`, create it (same folder as `.env.example`).
3. Add this line (paste **your** Client ID):

```bash
PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
```

4. Save the file.
5. Confirm `.env.local` is **not** committed (it should already be gitignored).

Check `.env.example` already documents the variable name — you only fill the real value in `.env.local`.

### E2. Why `npm run build` matters

This site injects env vars at **build** time (`build.js`).

| Command | Env injection? | Good for auth testing? |
|---------|----------------|------------------------|
| `npm run dev` | No | Weak — Client ID may be missing |
| `npm run build` then `npm run preview` | Yes | **Yes — use this** |

From the repo root:

```bash
npm run build
npm run preview
```

Then open:

```text
http://localhost:3000/pages/Markdown-Editor/
```

### E3. Production (Vercel)

1. Open your project on [Vercel](https://vercel.com/).
2. Go to **Settings** → **Environment Variables**.
3. Add:

| Name | Value |
|------|--------|
| `PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID` | your Client ID |

4. Apply to **Production** (and Preview if you test preview URLs).
5. **Redeploy** the site so `build.js` can inject the new value.
6. If you use Vercel preview URLs for auth, also add those preview origins in Google Cloud (Part D4). Wildcard origins usually are **not** allowed — add exact hostnames as needed.

---

## Part F — First sign-in test (local)

1. Finish Parts A–E.
2. Run `npm run build && npm run preview`.
3. Open `http://localhost:3000/pages/Markdown-Editor/`.
4. You should **not** see “Client ID not configured”.
5. Click **Sign in with Google**.
6. Choose your test-user account.
7. Review the Drive permission prompt → Allow.
8. You should land on a folder browser (My Drive).
9. Open a folder → open a `.md` file → edit → **Save**.
10. Refresh, open the same file again — your text should still be there.

---

## Part G — Production test (phone)

1. Confirm Vercel env var is set and a new deploy finished.
2. Confirm `https://xanderwiles.com` is in **Authorized JavaScript origins**.
3. On iPhone Safari, open:

   ```text
   https://xanderwiles.com/pages/Markdown-Editor/
   ```

4. Sign in → browse → edit → save.
5. Optional: Share → **Add to Home Screen** (PWA).

---

## Mental model (how the pieces connect)

```text
You (browser)
   │
   │ 1. Sign in → Google shows consent (Drive scope)
   │ 2. Google returns a short-lived access token (in memory)
   │
   ▼
Markdown Editor page (/pages/Markdown-Editor/)
   │
   │ 3. Calls Drive API with: Authorization: Bearer <token>
   │
   ▼
Google Drive
   │
   └── Your real files (source of truth)
```

- **Client ID** = “which Google Cloud app is asking”
- **Consent screen** = “what permissions, and who can use it in Testing”
- **Access token** = temporary key (~1 hour); cached locally until expiry, then silently refreshed while you’re still signed into Google
- **Drive API** = list folders, download file text, upload saved text

---

## Security basics (beginner version)

| Do | Don’t |
|----|--------|
| Keep app in **Testing** + only your test users | Publish to Production without understanding verification |
| Store Client ID in `.env.local` / Vercel | Commit Client **Secret** to git |
| Use HTTPS in production | Put secrets in `config.js` |
| Remember full Drive scope can see/edit Drive as you | Share the live URL widely while Testing if you add more test users |

The Client ID is considered **public** (it will appear in built JS). Security comes from OAuth + Testing users + your Google account password, not from hiding the Client ID.

---

## Troubleshooting

### “Client ID not configured”

- `.env.local` missing or typo in the variable name.
- You ran `npm run dev` instead of `build` + `preview`.
- Vercel env missing / you did not redeploy.

### “Access blocked: app has not completed Google verification”

- App is in Testing and your account is **not** a test user → add yourself in Part C5.
- Or you signed in with a different Google account than the test user.

### Popup / sign-in does nothing

- Ad blocker / Safari popup blocking — allow the Google window.
- Wrong JavaScript origin (must match exact host + port).
- Using `https://localhost` instead of `http://localhost:3000` (or wrong port).

### Sign-in works but folders are empty / API errors

- Drive API not enabled (Part B).
- Wrong Google account (no files there).
- Scope missing — revoke app access at [https://myaccount.google.com/permissions](https://myaccount.google.com/permissions), then sign in again so consent re-requests Drive.

### Works on laptop, fails on phone production

- Production origin missing in Google Cloud credentials.
- Vercel env not set / old deploy.
- Try a private tab to avoid stale service worker; hard-refresh once after deploy.

### “Error 400: redirect_uri_mismatch” / origin errors

- Fix **Authorized JavaScript origins** to match the address bar exactly (scheme + host + port).

---

## Optional: what about Firebase Console?

You might see docs or YouTube videos that say “create a Firebase project for Google login.”

For **this** Markdown Editor:

1. You can skip Firebase entirely.
2. If you already opened Firebase and it created a Google Cloud project, that is fine — you can still enable Drive API and OAuth on **that** linked Cloud project — but the plan for this app was a **dedicated** Cloud project (`markdown-editor-xander`) separate from To-Do/Journal Firebase apps.
3. Do **not** paste Firebase `apiKey` / `projectId` into the Markdown Editor; it expects `PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID` only.

---

## Quick recap checklist

- [ ] Google Cloud project created and selected
- [ ] Google Drive API enabled
- [ ] OAuth consent screen filled out
- [ ] Scope `https://www.googleapis.com/auth/drive` added
- [ ] Your email added as **test user**
- [ ] Status = **Testing**
- [ ] OAuth Client ID type = **Web application**
- [ ] JS origins include `http://localhost:3000` and production domain
- [ ] Client ID in `.env.local`
- [ ] Client ID in Vercel + redeploy
- [ ] Local test: sign in → open `.md` → save → refresh
- [ ] Phone test on production URL

---

## Related docs

- Short reference: [`README.md`](./README.md)
- Product / technical plan: [`docs/2026/07-28/feature-plan/`](./docs/2026/07-28/feature-plan/)
- Repo local workflow: [`../../docs/local-development.md`](../../docs/local-development.md)
