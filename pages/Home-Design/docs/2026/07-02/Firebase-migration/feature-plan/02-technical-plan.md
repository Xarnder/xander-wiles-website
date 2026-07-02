# Beutifully Living — Technical Plan

**Status:** Locked — all decisions captured in [`01-questions-and-decisions.md`](./01-questions-and-decisions.md).

**Owner:** `xanderwiles@gmail.com` · **Project ID:** `beautifully-living-xander`

---

## Locked decisions (summary)

| ID | Decision |
|----|----------|
| Q1 | Public read; authenticated write |
| Q3 | Owner = `request.auth.token.email` in rules |
| Q5 | `ideas/{ideaId}` — one doc per idea |
| Q6 | All images in Firebase Storage; migrate 14 existing |
| Q7 | **Full admin v1** — add, delete, edit all fields, reorder, hierarchy |
| Q8 | One-time seed; Firestore-only at runtime (no CSV fallback) |
| Q9 | Remove folder picker; Firebase-only image manager |
| Q10 | `PUBLIC_HOME_DESIGN_FIREBASE_*` + `firebase-config.js` |
| Q11 | Local dev at `http://localhost:3000` |
| Q12 | Add Vercel preview domains to authorized domains as needed |
| Q13 | CSV/JSON stay in repo as backup/export |
| Q14 | No App Check v1 |
| D8 | **New dedicated Firebase project** — isolated from other site apps |

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser — /pages/Home-Design/                                           │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ index.html │  │ styles.css  │  │ script.js    │  │ image-manager  │ │
│  │ auth UI    │  │ admin UI    │  │ read/render  │  │ upload/remove  │ │
│  └─────┬──────┘  └─────────────┘  └──────┬───────┘  └───────┬────────┘ │
│        │         ┌───────────────────────┴──────────────────┘          │
│        │         │  firebase-config.js  auth.js  api.js  admin.js (new) │
│        └─────────┴─────────────────────────────────────────────────────│
└──────────────────────────────────────────────────────────────────────────┘
                                    │
              Google Auth           │  Firestore (ideas, meta)
              Firebase Storage      │  rules: public read, owner write
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  NEW Firebase project — beautifully-living-xander                        │
│  PUBLIC_HOME_DESIGN_FIREBASE_*                                           │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
         Vercel: build.js injects PUBLIC_HOME_DESIGN_FIREBASE_* → deploy_out/
```

**Stack:** Static HTML, CSS, vanilla JS (ES modules), Firebase Web SDK **12.9.0** via CDN — aligned with `pages/Work-Tracker/`.

---

## Monorepo Firebase projects — isolation rules

The `xander-wiles-website` repo already runs **multiple independent Firebase backends**. Home-Design adds another.

| Page | Config file | Env prefix | Notes |
|------|-------------|------------|-------|
| `pages/To-Do-List/` | `firebase-config.js` | `PUBLIC_TODO_FIREBASE_*` | |
| `pages/Work-Tracker/js/config.js` | | `PUBLIC_WORK_FIREBASE_*` | Reference impl for this migration |
| `pages/Story-Manager/` | inline in HTML | `PUBLIC_STORY_FIREBASE_*` | |
| `pages/Prompt-Manager/` | `app.js` | `PUBLIC_PROMPT_FIREBASE_*` | |
| `pages/Social-Network/` | `app.js` / `script.js` | `PUBLIC_SOCIAL_FIREBASE_*` | |
| `pages/journal/` | `src/firebase.js` | `VITE_FIREBASE_*` | Separate Vite build |
| `beta-pages/beta-to-do-list/` | `firebase-config.js` | `PUBLIC_BETA_TODO_FIREBASE_*` | |
| **`pages/Home-Design/`** | **`firebase-config.js`** | **`PUBLIC_HOME_DESIGN_FIREBASE_*`** | **This feature** |

### Implementation rules

1. **Create a new Firebase project** in Console — do not attach to an existing project ID from the table above.
2. **Add only** `PUBLIC_HOME_DESIGN_FIREBASE_*` to `.env.local` and Vercel — do not alias another app’s vars.
3. **`firebase-config.js` must call `initializeApp` once** with the Home-Design config only. Do not import Work-Tracker’s `config.js`.
4. **Root `build.js` needs no changes** — it already walks `deploy_out/` and replaces all `process.env.PUBLIC_*` tokens in `.js`/`.html`/`.css`.
5. **Add a new block to `.env.example`** under `# --- FIREBASE (Home-Design / Beutifully Living) ---` so the prefix is documented alongside siblings.
6. **Optional `pages/Home-Design/firebase.json`** should point only at this project’s rules — not journal’s `firebase.json`.

---

## Part A — Firebase Console setup (step-by-step)

Use Google account **`xanderwiles@gmail.com`** when setting up Auth and when signing in on the site. Create project ID **`beautifully-living-xander`** (dedicated — not shared with other site Firebase apps).

### A1. Create the project

1. [Firebase Console](https://console.firebase.google.com/) → **Add project**.
2. **Project name:** `Beautifully Living` (display name).
3. **Project ID:** `beautifully-living-xander` — **permanent**; becomes `PUBLIC_HOME_DESIGN_FIREBASE_PROJECT_ID`.
4. Analytics: optional (off is fine).
5. **Create project** → **Continue**.

### A2. Register the web app

1. Project overview → **Web** (`</>`).
2. Nickname: `beautifully-living-web`.
3. **Do not** enable Firebase Hosting (Vercel serves static files).
4. **Register app** → copy the six `firebaseConfig` values.
5. Map to `PUBLIC_HOME_DESIGN_FIREBASE_*` (Part B).

### A3. Enable Google Authentication

1. **Build** → **Authentication** → **Get started**.
2. **Sign-in method** → **Google** → **Enable**.
3. Support email = your admin address → **Save**.

### A4. Authorized domains

**Authentication** → **Settings** → **Authorized domains** → add:

| Domain | When |
|--------|------|
| `localhost` | Default — local dev |
| `xanderwiles.com` | Production |
| `www.xanderwiles.com` | If www is used |
| `YOUR_PROJECT_ID.firebaseapp.com` | Auto-added |
| `your-app-xyz.vercel.app` | Per preview deploy (Q12 — add when testing) |

Firebase does **not** support `*.vercel.app` wildcards — add each preview hostname when needed.

### A5. Firestore — production mode

1. **Build** → **Firestore Database** → **Create database**.
2. **Start in production mode** (deny all until custom rules published).
3. Region: e.g. `eur3 (Europe)` — immutable after creation.
4. **Enable**.

### A6. Storage

1. **Build** → **Storage** → **Get started**.
2. Production mode initially → replace with Part C rules.
3. Same region as Firestore if prompted.

### A7. Deploy rules

```bash
firebase login
cd pages/Home-Design
firebase use beautifully-living-xander
firebase deploy --only firestore:rules,storage
```

---

## Part B — Config (local + Vercel, keys not in git)

### B1. `.env.example` addition (alongside sibling Firebase blocks)

```bash
# --- FIREBASE (Home-Design / Beutifully Living) ---
PUBLIC_HOME_DESIGN_FIREBASE_API_KEY=
PUBLIC_HOME_DESIGN_FIREBASE_AUTH_DOMAIN=
PUBLIC_HOME_DESIGN_FIREBASE_PROJECT_ID=
PUBLIC_HOME_DESIGN_FIREBASE_STORAGE_BUCKET=
PUBLIC_HOME_DESIGN_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_HOME_DESIGN_FIREBASE_APP_ID=
```

### B2. `pages/Home-Design/firebase-config.js`

Same pattern as `pages/Work-Tracker/js/config.js`:

```javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-storage.js";

if (typeof process === 'undefined') {
    var process = { env: {} };
}

const firebaseConfig = {
    apiKey: process.env.PUBLIC_HOME_DESIGN_FIREBASE_API_KEY,
    authDomain: process.env.PUBLIC_HOME_DESIGN_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.PUBLIC_HOME_DESIGN_FIREBASE_PROJECT_ID,
    storageBucket: process.env.PUBLIC_HOME_DESIGN_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.PUBLIC_HOME_DESIGN_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.PUBLIC_HOME_DESIGN_FIREBASE_APP_ID
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
```

**Local:** values in repo-root `.env.local` → `node build.js` → serve `deploy_out/`.  
**Vercel:** same six vars in dashboard → `build.js` injects at build time.

**No hardcoded API keys** in committed files (unlike some older apps with fallbacks — Home-Design should fail clearly if env is missing).

---

## Part C — Security rules (copy-paste)

Owner email locked: **`xanderwiles@gmail.com`**. Paste these rules as-is into Firebase Console (or commit to `firestore.rules` / `storage.rules`).

### C1. Firestore rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner() {
      return request.auth != null
        && request.auth.token.email == 'xanderwiles@gmail.com';
    }

    match /ideas/{ideaId} {
      allow read: if true;
      allow create, update, delete: if isOwner();
    }

    match /meta/{docId} {
      allow read: if true;
      allow write: if isOwner();
    }
  }
}
```

Public read locked per Q1 — no auth wall variant needed.

### C2. Storage rules

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    function isOwner() {
      return request.auth != null
        && request.auth.token.email == 'xanderwiles@gmail.com';
    }

    match /ideas/{ideaId}/{fileName} {
      allow read: if true;
      allow write: if isOwner()
        && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
      allow delete: if isOwner();
    }
  }
}
```

---

## Part D — Firestore data model

### Collection: `ideas`

Document ID: `ideaId` (e.g. `idea-0001` from seed; `idea-0372` for new ideas)

| Field | Type | Notes |
|-------|------|-------|
| `ideaId` | string | Same as doc ID |
| `section` | string | e.g. `Kitchen` |
| `subsection` | string | |
| `level` | number | `1` = root; `2+` = child |
| `parentItem` | string | Parent title for hierarchy |
| `title` | string | |
| `description` | string | |
| `fullText` | string | |
| `images` | array of strings | Firebase Storage download URLs |
| `sortIndex` | number | **Order within section** — for reorder (Q7) |
| `createdAt` | timestamp | On create |
| `updatedAt` | timestamp | On every write |

### Collection: `meta`

| Document | Fields |
|----------|--------|
| `schema` | `{ version: 1, seededAt, rowCount }` |
| `counters` | `{ lastIdeaNumber: 371 }` — for generating `idea-0372` IDs |

### ID generation for new ideas

Reuse CSV convention: `idea-` + zero-padded number. Increment `meta/counters.lastIdeaNumber` in a transaction when creating ideas.

### Queries

- **Load all:** `collection(db, 'ideas')` ordered by `sortIndex` (client sort acceptable at ~400 docs).
- **Sections / hierarchy:** existing `buildSections()` in `script.js` — unchanged logic, new data source.
- **Search:** client-side `itemSearchText()` — unchanged.
- **Reorder:** batch `updateDoc` on affected `sortIndex` values within a section.

No composite indexes required for v1.

---

## Part E — Admin UI (Q7 full scope)

### E1. Auth chrome (`auth.js` + `index.html`)

- Header: **Sign in with Google** when logged out.
- When logged in as owner: show name/email + **Sign out**.
- When logged in as non-owner: show “View only” + sign out; hide admin controls.
- Owner detection: client compares `user.email` to `xanderwiles@gmail.com` (UX only); rules enforce server-side.

### E2. Idea editor (`admin.js` — new)

Visible only to owner when signed in:

| Action | UI | API |
|--------|-----|-----|
| **Add idea** | “Add idea” button → form (section, subsection, title, description, parent) | `setDoc` new `ideas/{ideaId}` |
| **Edit idea** | Edit icon on idea card → modal/inline form | `updateDoc` |
| **Delete idea** | Delete with confirm | `deleteDoc`; delete Storage files under `ideas/{ideaId}/` |
| **Reorder** | Drag handle or ↑↓ within subsection | Batch `updateDoc` on `sortIndex` |
| **Change parent** | Parent dropdown in edit form | Update `level`, `parentItem` |
| **Export CSV** | Optional footer control | Client-side `exportCsvText()` from in-memory rows (Q13) |

### E3. Image manager (`image-manager.js` refactor)

Per Q9 — **remove entirely:**

- `showDirectoryPicker` / folder connect UI
- IndexedDB directory handle storage (`at-home-image-manager` DB)
- `writeBlobToProject`, `writeManifestToProject`, CSV file writes
- Download fallback blobs for manual file replace

**Keep:**

- WebP conversion, 16:9 crop, preview, idea search UI

**Replace with:**

- `uploadBytes` → `getDownloadURL` → `arrayUnion` on `ideas/{ideaId}.images`
- Remove: `arrayRemove` + `deleteObject` on Storage path
- Gate: footer **Image manager** button visible only when owner signed in

### E4. Data loading (`script.js`)

- Replace `loadContent()` CSV/JSON `fetch` with `api.js` `subscribeIdeas()` or `loadIdeas()`.
- Map Firestore docs to existing row shape expected by `buildSections()`, `render()`, carousel.
- `images` field: Storage URLs only post-migration (no relative `images/...` paths at runtime).
- Emit `athome:ready` after first Firestore snapshot.
- **No CSV fallback** at runtime (Q8).

---

## Part F — Migration / seed (Q8)

One-time script: `pages/Home-Design/scripts/seed-firestore.mjs`

1. Parse `Home Design Bullets.csv` + `idea-images.json`.
2. For each local image file, `uploadBytes` to `ideas/{ideaId}/{filename}`.
3. Store **download URLs** in `images` array (not relative paths).
4. Write each idea doc with `sortIndex` = CSV row index.
5. Write `meta/schema` and `meta/counters`.
6. Verify counts: ~371 ideas, ≥16 with images.

Run once against the **new** project before switching `script.js` to Firestore-only.

Repo copies of CSV/JSON/images **remain in git** as backup (Q13) but are not read in production.

---

## Part G — Files

### New files

| File | Purpose |
|------|---------|
| `firebase-config.js` | Init app (Home-Design project only) |
| `auth.js` | Google sign-in/out, owner state |
| `api.js` | Firestore CRUD, Storage upload/delete, listeners |
| `admin.js` | Idea editor UI — add/edit/delete/reorder |
| `firestore.rules` | Rules source |
| `storage.rules` | Storage rules source |
| `firebase.json` | CLI deploy config |
| `scripts/seed-firestore.mjs` | One-time migration |

### Changed files

| File | Changes |
|------|---------|
| `script.js` | Firestore load; wire admin events; keep render pipeline |
| `image-manager.js` | Firebase-only; remove FS API |
| `index.html` | Auth UI, admin controls, module scripts |
| `styles.css` | Auth + admin editor styles |
| `.env.example` | `PUBLIC_HOME_DESIGN_FIREBASE_*` block |

### Unchanged / reference only

| File | Role |
|------|------|
| `Home Design Bullets.csv` | Seed + export backup |
| `idea-images.json` | Seed reference |
| `images/**` | Seed source; no new commits after migration |
| Root `build.js` | Already injects `PUBLIC_*` |
| `vercel.json` | No change expected |

### Reference implementations

- `pages/Work-Tracker/js/config.js`, `auth.js`, `api.js` — config + auth + Firestore patterns
- `pages/journal/firestore.rules` — different model (UID paths); do not copy structure

---

## Part H — API surface

| Operation | Method |
|-----------|--------|
| List ideas | `getDocs` / `onSnapshot` on `ideas` |
| Create idea | `setDoc(ideas/{newId})` + counter increment |
| Update idea | `updateDoc` |
| Delete idea | `deleteDoc` + Storage cleanup |
| Reorder | Batch `updateDoc` on `sortIndex` |
| Upload image | `uploadBytes` + `updateDoc` (`arrayUnion`) |
| Remove image | `updateDoc` (`arrayRemove`) + `deleteObject` |
| Export CSV | Client `exportCsvText()` from `state.rows` |

No Cloud Functions in v1.

---

## Part I — Performance

| Area | Approach |
|------|----------|
| ~400 docs | Single fetch OK; sort client-side by `sortIndex` |
| Public visitors | `getDocs` once (avoid permanent `onSnapshot` unless admin) |
| Admin editing | `onSnapshot` while signed in for live preview |
| Images | Lazy load; WebP; Storage CDN URLs |
| Long polling | Enabled per Work-Tracker pattern |

---

## Part J — Edge cases

- **Delete idea with children:** Warn if children reference `parentItem`; offer orphan or cascade delete (implementation detail).
- **Reorder across sections:** Changing `section` resets `sortIndex` to end of new section.
- **Non-owner sign-in:** Read works; all writes fail with permission error.
- **Seed re-run:** Idempotent doc IDs; script checks `meta/schema.seededAt`.
- **Broken Storage URL:** Existing `<img>` error handlers hide broken tiles.

---

## Definition of done (technical)

- [ ] Dedicated Firebase project + `PUBLIC_HOME_DESIGN_FIREBASE_*` in `.env.local` and Vercel
- [ ] Rules published with `xanderwiles@gmail.com`
- [ ] Seed complete; Firestore-only runtime
- [ ] Public browse without login
- [ ] Full admin: add, edit, delete, reorder, hierarchy, images
- [ ] Folder picker removed
- [ ] Tests in [`04-test-plan.md`](./04-test-plan.md) pass
