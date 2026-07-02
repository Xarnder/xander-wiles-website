# Beutifully Living — Questions and Decisions

**Status:** Locked (2026-07-02) — all decisions recorded; ready for implementation.

**Decision status legend:**


| Status                | Meaning                                                     |
| --------------------- | ----------------------------------------------------------- |
| `Needs user answer`   | Blocks or strongly shapes implementation — waiting on you   |
| `Recommended default` | Sensible default if you want to defer                       |
| `Safe to decide now`  | Can be decided during implementation without your input     |
| `Locked`              | Answer recorded — do not change without revisiting the plan |


---

## Locked decision summary


| Q   | Decision                                                                               | Status                                                                        |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Q1  | **A** — Public read; authenticated write only                                          | `Locked`                                                                      |
| Q2  | Admin Google email: **`xanderwiles@gmail.com`**                                          | `Locked`                                                                      |
| Q3  | **A** — `request.auth.token.email` in security rules                                   | `Locked`                                                                      |
| Q4  | Firebase project ID: **`beautifully-living-xander`**                                   | `Locked`                                                                      |
| Q5  | **A** — One Firestore document per idea (`ideas/{ideaId}`)                             | `Locked`                                                                      |
| Q6  | **A** — All images in Firebase Storage; migrate existing 14; no new image commits      | `Locked`                                                                      |
| Q7  | **C** — Full admin: add, delete, reorder, edit hierarchy and all fields                | `Locked`                                                                      |
| Q8  | **A** — One-time seed from CSV + manifest + images before cutover                      | `Locked`                                                                      |
| Q9  | **A** — Remove folder picker; image manager requires Google sign-in + Firebase only    | `Locked`                                                                      |
| Q10 | **A** — `firebase-config.js` + `PUBLIC_HOME_DESIGN_FIREBASE_`* env vars                | `Locked`                                                                      |
| Q11 | `http://localhost:3000` (repo default)                                                 | `Locked` (default applied)                                                    |
| Q12 | **A** — Add specific Vercel preview hostnames to authorized domains as needed          | `Locked`                                                                      |
| Q13 | **A** — Keep CSV/JSON in repo as read-only backup/export; Firestore is source of truth | `Locked`                                                                      |
| Q14 | **A** — Skip App Check v1; rely on rules                                               | `Locked`                                                                      |


---



## Locked setup values

### Q2 — Admin Google email: `xanderwiles@gmail.com`

**What this means (plain language):** This is the Gmail address you use when you click **Sign in with Google** on your own site. Firebase security rules will only allow **that exact account** to add, edit, delete ideas, or upload images. Everyone else can still **read** the blog, but they cannot change anything — even if they sign in with a different Google account.

You must create the Firebase project and enable Google sign-in while logged into this Google account (or ensure this account is the one you sign in with on the site).

**Used in rules as:**

```
request.auth.token.email == 'xanderwiles@gmail.com'
```

### Q4 — Firebase project ID: `beautifully-living-xander`

Permanent project identifier. Becomes `PUBLIC_HOME_DESIGN_FIREBASE_PROJECT_ID` and `authDomain` (`beautifully-living-xander.firebaseapp.com`). Create the project in Firebase Console with this ID (or accept the suggested ID if Console offers it).

---



## Recorded answers (archive)



### Question 1: Public read access

- **Status**: `Locked` → **A**
- **Decision**: Public read, authenticated write. Visitors browse without login; only owner can mutate data.



### Question 2: Your admin Google account

- **Status**: `Locked`
- **Decision**: **`xanderwiles@gmail.com`** — the only Google account allowed to write data or upload images.



### Question 3: Authorization strategy in security rules

- **Status**: `Locked` → **A**
- **Decision**: Email match in rules: `request.auth.token.email == 'xanderwiles@gmail.com'`.



### Question 4: Firebase project name

- **Status**: `Locked`
- **Decision**: **`beautifully-living-xander`**



### Question 5: Data storage model

- **Status**: `Locked` → **A**
- **Decision**: One Firestore document per idea at `ideas/{ideaId}`.



### Question 6: Image hosting strategy

- **Status**: `Locked` → **A**
- **Decision**: All images in Firebase Storage; migrate existing 14 WebPs; stop committing new binaries to git.



### Question 7: Text editing scope (beyond images)

- **Status**: `Locked` → **C**
- **Decision**: Full admin in v1 — add, delete, reorder, edit hierarchy, and all idea fields. User note: *"I want to be able to add delete ideas reorder and everything else as well."*



### Question 8: Migration of existing data

- **Status**: `Locked` → **A**
- **Decision**: One-time seed of ~371 CSV rows + manifest + 14 images before cutover. No dual-read fallback in production.



### Question 9: Image manager UX after migration

- **Status**: `Locked` → **A**
- **Decision**: Remove File System Access / folder picker entirely. Image manager requires sign-in and uses Firebase only.



### Question 10: Firebase config pattern

- **Status**: `Locked` → **A**
- **Decision**: `pages/Home-Design/firebase-config.js` with `process.env.PUBLIC_HOME_DESIGN_FIREBASE_`*, `.env.local` locally, Vercel env vars at build. Matches Work-Tracker pattern.



### Question 11: Local development URL

- **Status**: `Locked`
- **Decision**: `http://localhost:3000/pages/Home-Design/` via `node build.js` + `npx serve deploy_out`.



### Question 12: Vercel preview deployments

- **Status**: `Locked` → **A**
- **Decision**: Add specific `*.vercel.app` preview hostnames to Firebase authorized domains when testing previews (Firebase does not support wildcards).



### Question 13: Keep CSV/JSON files in repo after migration

- **Status**: `Locked` → **A**
- **Decision**: Keep as read-only backup/export; Firestore is source of truth; optional export-to-CSV from admin.



### Question 14: Firebase App Check

- **Status**: `Locked` → **A**
- **Decision**: Skip v1; rely on Firestore + Storage rules.

---



## Infrastructure decisions (safe to decide now)


| ID  | Decision                                                                                         | Status   |
| --- | ------------------------------------------------------------------------------------------------ | -------- |
| D1  | Use **Firestore** (not Realtime Database)                                                        | `Locked` |
| D2  | Use **Firebase Storage** for all images                                                          | `Locked` |
| D3  | **Google sign-in popup** (`signInWithPopup`) — same as Work-Tracker                              | `Locked` |
| D4  | Firestore started in **production mode**                                                         | `Locked` |
| D5  | Firebase JS SDK **v12.x** CDN ESM imports                                                        | `Locked` |
| D6  | Env prefix: `PUBLIC_HOME_DESIGN_FIREBASE_*` — **separate from all other site Firebase projects** | `Locked` |
| D7  | `experimentalForceLongPolling: true` on Firestore (Work-Tracker pattern)                         | `Locked` |
| D8  | **New dedicated Firebase project** — do not reuse To-Do, Work-Tracker, Journal, etc.             | `Locked` |


---



## Monorepo Firebase isolation (important)

This website already uses **six+ separate Firebase projects**. Home-Design must be a **seventh**, with its own env var prefix:


| App             | Env prefix                      | Firebase project (example) |
| --------------- | ------------------------------- | -------------------------- |
| To-Do List      | `PUBLIC_TODO_FIREBASE_*`        | `taskmaster-cloud-xander`  |
| Work Tracker    | `PUBLIC_WORK_FIREBASE_*`        | `work-tracker-xander`      |
| Story Manager   | `PUBLIC_STORY_FIREBASE_*`       | `xanders-story-manger`     |
| Prompt Manager  | `PUBLIC_PROMPT_FIREBASE_*`      | `xanders-prompt-manager`   |
| Social Network  | `PUBLIC_SOCIAL_FIREBASE_*`      | `social-network-b6579`     |
| Journal         | `VITE_FIREBASE_*`               | (separate Vite build)      |
| **Home-Design** | `PUBLIC_HOME_DESIGN_FIREBASE_*` | **`beautifully-living-xander`** |


**Do not** copy config from another app’s `.env.local` entry or reuse another project’s Firestore/Storage — data and rules would collide.

Root `build.js` already injects any `process.env.PUBLIC_*` reference across all `deploy_out/` JS files; adding `PUBLIC_HOME_DESIGN_FIREBASE_*` to `.env.example` follows the existing pattern with no `build.js` code changes required.

---



## Implementation unblocked

All decisions are locked, including:

- **Owner email:** `xanderwiles@gmail.com`
- **Project ID:** `beautifully-living-xander`

Implementation may begin. Create the Firebase project in Console with project ID `beautifully-living-xander`, then follow [`02-technical-plan.md`](./02-technical-plan.md).