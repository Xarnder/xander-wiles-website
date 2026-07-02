# Beutifully Living — Release Checklist

**Target:** `https://xanderwiles.com/pages/Home-Design/`  
**Feature cycle:** 2026-07-02  
**Firebase:** Dedicated project via `PUBLIC_HOME_DESIGN_FIREBASE_*`

---

## Phase 0 — Decisions

- [x] Product decisions locked — see [`01-questions-and-decisions.md`](./01-questions-and-decisions.md)
- [x] Q1 Public read / auth write
- [x] Q7 Full admin (add, delete, reorder, hierarchy, images)
- [x] **Q2 Admin Google email:** `xanderwiles@gmail.com`
- [x] **Q4 Firebase project ID:** `beautifully-living-xander`

---

## Phase 1 — Firebase Console

**Use a NEW project — not To-Do, Work-Tracker, Journal, Story, Prompt, or Social.**

- [ ] Project created; ID recorded → `PUBLIC_HOME_DESIGN_FIREBASE_PROJECT_ID`
- [ ] Web app registered; six config values saved to `.env.local` only
- [ ] Google Auth enabled
- [ ] Authorized domains: `localhost`, `xanderwiles.com`, `www.xanderwiles.com`
- [ ] Preview domains added when testing Vercel previews (Q12)
- [ ] Firestore created in **production mode**
- [ ] Storage enabled
- [ ] Firestore rules published (`isOwner()` → `xanderwiles@gmail.com`)
- [ ] Storage rules published
- [ ] Rules playground tests (M16)

---

## Phase 2 — Repository setup

- [ ] `PUBLIC_HOME_DESIGN_FIREBASE_*` block added to `.env.example` (sibling to TODO, WORK, etc.)
- [ ] Values in `.env.local` (not committed)
- [ ] `pages/Home-Design/firebase-config.js` — **Home-Design vars only**
- [ ] `auth.js`, `api.js`, `admin.js`
- [ ] `firestore.rules`, `storage.rules`, `firebase.json`
- [ ] Verify **no** imports from `Work-Tracker/js/config.js` or other apps

---

## Phase 3 — Implementation

- [ ] One-time `seed-firestore.mjs` run against **new** project
- [ ] `script.js` — Firestore load only (no CSV runtime fallback)
- [ ] `image-manager.js` — Firebase only; folder picker removed
- [ ] `admin.js` — add, edit, delete, reorder, hierarchy
- [ ] Auth UI + owner gating in `index.html` / `styles.css`
- [ ] `build.js` output checked: correct `projectId` in `deploy_out/.../firebase-config.js`

---

## Phase 4 — Local verification

- [ ] `node build.js` — no missing `PUBLIC_HOME_DESIGN_*` warnings
- [ ] `npx serve deploy_out` → `localhost:3000/pages/Home-Design/`
- [ ] Public browse (M1)
- [ ] Owner sign-in + full admin (M2, M6–M9)
- [ ] Image manager without folder picker (M4, M5)
- [ ] Non-owner denied (M3)
- [ ] Monorepo isolation — other Firebase apps unaffected (M17)

---

## Phase 5 — Vercel production

- [ ] Six `PUBLIC_HOME_DESIGN_FIREBASE_*` vars in Vercel (Production)
- [ ] Preview vars if testing admin on previews (Q12)
- [ ] **Confirm vars are not** `PUBLIC_WORK_*` / `PUBLIC_TODO_*` etc.
- [ ] Deploy succeeds; injection in build log
- [ ] `xanderwiles.com` — public browse + owner admin
- [ ] Google sign-in on production domain (no unauthorized-domain)

---

## Phase 6 — Post-release

- [ ] Firebase usage monitored (new project dashboard only)
- [ ] `meta/schema.seededAt` documented
- [ ] CSV/JSON remain in git as backup (Q13); Firestore is live source
- [ ] No new image binaries committed to `images/`
- [ ] Optional: export CSV snapshot after first week

---

## Rollback readiness

- [ ] Previous Vercel deployment ID noted
- [ ] Git tag of last static-only version
- [ ] CSV + JSON + images still in repo
- [ ] Rollback steps in [`03-risk-and-safety-review.md`](./03-risk-and-safety-review.md)

---

## Definition of done (release)

1. **Isolated:** Dedicated Firebase project + `PUBLIC_HOME_DESIGN_FIREBASE_*` only
2. **Functional:** Public browse; owner full admin + images without folder picker
3. **Secure:** Production rules; owner email writes only; non-owner denied
4. **Deployed:** Works on `xanderwiles.com` and localhost
5. **Data:** Seed complete; ~371 ideas; images on Storage
6. **Tested:** M1–M18 applicable tests passed
7. **Recoverable:** Rollback within 15 minutes

---

## Quick reference — Vercel env vars

**Home-Design only** (do not reuse other app values):

```
PUBLIC_HOME_DESIGN_FIREBASE_API_KEY
PUBLIC_HOME_DESIGN_FIREBASE_AUTH_DOMAIN
PUBLIC_HOME_DESIGN_FIREBASE_PROJECT_ID
PUBLIC_HOME_DESIGN_FIREBASE_STORAGE_BUCKET
PUBLIC_HOME_DESIGN_FIREBASE_MESSAGING_SENDER_ID
PUBLIC_HOME_DESIGN_FIREBASE_APP_ID
```

---

## Quick reference — sibling projects (do not use for Home-Design)

| Prefix | App |
|--------|-----|
| `PUBLIC_TODO_FIREBASE_*` | To-Do List |
| `PUBLIC_WORK_FIREBASE_*` | Work Tracker |
| `PUBLIC_STORY_FIREBASE_*` | Story Manager |
| `PUBLIC_PROMPT_FIREBASE_*` | Prompt Manager |
| `PUBLIC_SOCIAL_FIREBASE_*` | Social Network |
| `VITE_FIREBASE_*` | Journal |

---

## Sign-off

| Item | Status | Date |
|------|--------|------|
| Planning complete | ✅ | 2026-07-02 |
| Q&A locked (product) | ✅ | 2026-07-02 |
| Q2 email + Q4 project ID | ✅ `xanderwiles@gmail.com` / `beautifully-living-xander` | 2026-07-02 |
| Firebase Console setup | ⬜ | |
| Implementation | ⬜ | |
| Production release | ⬜ | |
