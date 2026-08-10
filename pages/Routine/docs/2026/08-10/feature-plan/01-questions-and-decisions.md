# Routine Manager — Questions and Decisions

**Feature cycle:** 2026-08-10  
**Status:** **Locked** (2026-08-10) — ready for implementation pending your approval of the summary in chat / updated [`02-technical-plan.md`](./02-technical-plan.md).

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
| Q1 | **B** — Any Google account; private `users/{uid}/routines` | `Locked` |
| Q2 | **A** — New dedicated Firebase project (project ID still TBD — see assumptions) | `Locked` |
| Q3 | Primary account: **`xanderwiles@gmail.com`** (testing; rules use uid, not email allowlist) | `Locked` |
| Q4 | **A** — `PUBLIC_ROUTINE_FIREBASE_*` | `Locked` |
| Q5 | **A** — Single doc with embedded `tasks[]` | `Locked` |
| Q6 | **A** — Session-local run state only | `Locked` |
| Q7 | **B** — Client-side summary phase on run route | `Locked` |
| Q8 | **A** — SPA fallback + Vercel rewrite (you accepted recommendation) | `Locked` |
| Q9 | **B** — Custom touch drag + keyboard/button fallback | `Locked` |
| Q10 | **A** — Nav + homepage card when shipping | `Locked` |
| Q11 | **B** — Firestore persistent local cache | `Locked` |
| Q12 | **B** — Setup messaging if env missing; in-memory repo for tests | `Locked` |
| Q13 | **A** — Daylight calm / teal accent | `Locked` |
| Q14 | **B** — Always celebrate any finished run | `Locked` |
| Q15 | **B** — Include library reorder (`sortOrder`) | `Locked` |
| Q16 | **A** — Playwright with in-memory/mocked backend | `Locked` |
| Q17 | **A** — Skip App Check v1 | `Locked` |
| Q18 | **A** — localhost + production (+ preview hosts as needed) | `Locked` |
| D1–D12 | Safe defaults from table below | `Locked` |

---

## Remaining assumption (needs confirmation before Firebase setup)

| Item | Assumption | Why |
|------|------------|-----|
| Firebase **project ID** | Propose **`routine-manager-xander`** | Q2-A selected but preferred ID left blank |

---

## Identity, access, and Firebase

### Question 1: Who can use Routine Manager? (Auth model)

- **Status**: `Locked` → **B**
- **Decision**: Any Google account can use the app with private per-user data under `users/{uid}/routines`.
- **Why it matters**: This drives Firestore security rules, UI chrome (sign-in gate vs public demo), Playwright setup, and whether strangers can write into your Firebase project. A wrong choice either leaks writable data or blocks you from using the app on a second device.
- **Recommended Default**: **B** — Google sign-in required for all use (same pattern as Work Tracker / To-Do List). Personal tool; data under `users/{uid}/…`.
- **Options**:
  - [ ] A — **Single-owner lock**: only your Google email can read/write; everyone else sees a locked/unavailable state
  - [x] B — **Any Google account** can use the app with private per-user data (`users/{uid}/routines`) — recommended
  - [ ] C — **No auth in v1**: anonymous or device-local only (Firestore optional later) — weak multi-device sync
  - [ ] D — **Public read / private write** (unlikely fit for personal routines)
  - [ ] Custom/Other:
- **Your Answer**: B

### Question 2: Firebase project strategy

- **Status**: `Locked` → **A** (project ID TBD)
- **Decision**: Create a **new dedicated Firebase project** for Routine. Preferred ID was left blank — assumed `routine-manager-xander` pending your confirmation.
- **Why it matters**: Monorepo convention is **one dedicated Firebase project per app** (Home-Design, Work-Tracker, Journal, etc.). Reusing another project mixes security rules and billing; creating a new one needs Console setup before deploy works.
- **Recommended Default**: **A** — New dedicated Firebase project for Routine (e.g. `routine-manager-xander` or similar).
- **Options**:
  - [x] A — **Create a new Firebase project** dedicated to Routine — recommended
  - [ ] B — Reuse an existing project — specify which:
  - [ ] Custom/Other:
- **If A**: preferred project ID? *(blank — assuming `routine-manager-xander`)*
- **Your Answer**: A

### Question 3: Which Google account(s) should work?

- **Status**: `Locked`
- **Decision**: Primary testing account **`xanderwiles@gmail.com`**. With Q1-B, security rules authorize by `request.auth.uid` (any signed-in Google user), not an email allowlist.
- **Why it matters**: If you choose single-owner rules (Q1-A), the email must be exact. Even for Q1-B, knowing your primary account helps with authorized domains testing and docs. Wrong email = locked out of your own data.
- **Recommended Default**: Use the same account as other personal tools (`xanderwiles@gmail.com`) as the primary account you sign in with. For Q1-B, rules use `request.auth.uid` (any signed-in user), not email allowlists.
- **Your Answer**: `xanderwiles@gmail.com`

### Question 4: Environment variable prefix

- **Status**: `Locked` → **A**
- **Decision**: `PUBLIC_ROUTINE_FIREBASE_API_KEY` … `APP_ID`.
- **Why it matters**: Root `.env.example` / `.env.local` / Vercel env and SvelteKit `PUBLIC_*` must align. A mismatched prefix means blank config at build or runtime.
- **Recommended Default**: **A** — `PUBLIC_ROUTINE_FIREBASE_*` (matches To-Do / Work / Home-Design style; works with SvelteKit public env).
- **Options**:
  - [x] A — `PUBLIC_ROUTINE_FIREBASE_API_KEY` … `APP_ID` — recommended
  - [ ] B — `VITE_ROUTINE_FIREBASE_*` (Journal-style; also works but less consistent with most site apps)
  - [ ] Custom/Other:
- **Your Answer**: A

---

## Data model and run behaviour

### Question 5: Firestore document shape for routines

- **Status**: `Locked` → **A**
- **Decision**: One document per routine at `users/{uid}/routines/{routineId}` with embedded `tasks[]`.
- **Why it matters**: Nested tasks in one document is simplest for small routines and atomic saves. Subcollections scale better for huge lists but complicate reorder/save and security rules. Bad choice increases code complexity for no benefit.
- **Recommended Default**: **A** — One document per routine at `users/{uid}/routines/{routineId}` with embedded `tasks[]` (fits the brief’s data model).
- **Options**:
  - [x] A — **Single doc with embedded tasks array** — recommended
  - [ ] B — Routine doc + `tasks` subcollection
  - [ ] C — Flat task docs with `routineId` field
  - [ ] Custom/Other:
- **Your Answer**: A

### Question 6: Persist in-progress run state across refresh / device?

- **Status**: `Locked` → **A**
- **Decision**: Run state is session-local (in memory; optional `sessionStorage` for same-tab refresh resilience). Definitions alone persist to Firestore. No cross-device run resume.
- **Why it matters**: Persisting runs enables resume-after-crash but adds schema, cleanup, and “stale run” UX. Local-only is simpler and matches the brief’s allowance.
- **Recommended Default**: **A** — Run state stays **in memory** (optionally `sessionStorage`) for the active session only; definitions alone persist to Firestore.
- **Options**:
  - [x] A — **Session-local only** (memory + optional sessionStorage) — recommended
  - [ ] B — Also persist active run to Firestore for cross-device resume
  - [ ] C — Persist active run to `localStorage` only (same device resume, no cloud)
  - [ ] Custom/Other:
- **Your Answer**: A

### Question 7: Summary screen routing

- **Status**: `Locked` → **B**
- **Decision**: Summary is a **client phase** after the last task on `/routines/[id]/run` (no dedicated summary URL in v1).
- **Why it matters**: A separate `/summary` URL is shareable/bookmarkable but can be opened without a completed run. A client phase keeps summary tied to the run store and avoids empty-state edge cases.
- **Recommended Default**: **B** — Summary as a **phase inside the run flow** (same `/routines/[id]/run` or store-driven view); optional soft URL hash later.
- **Options**:
  - [ ] A — Dedicated `/routines/[id]/summary` route
  - [x] B — **Client-side summary phase** after last task — recommended
  - [ ] Custom/Other:
- **Your Answer**: B

### Question 8: Static hosting strategy for dynamic `[id]` routes

- **Status**: `Locked` → **A**
- **Decision**: `adapter-static` with SPA `fallback: 'index.html'` + `vercel.json` rewrite for `/pages/Routine/(.*)` (you accepted the recommendation).
- **Why it matters**: Tax-Helper/Fighter-Jet use `adapter-static` with `fallback: undefined` and full prerender. Routine has **runtime Firestore IDs**, so prerendering every `[id]` is impossible. Without an SPA fallback + Vercel rewrite, deep links to `/routines/xyz/run` 404 on refresh.
- **Recommended Default**: **A** — `adapter-static` with SPA `fallback: 'index.html'` (or `200.html`) + `vercel.json` rewrite for `/pages/Routine/(.*)` similar to Journal.
- **Options**:
  - [x] A — **SPA fallback + Vercel rewrite** — recommended / safe default
  - [ ] B — Hash-based routing only (ugly URLs; avoid)
  - [ ] Custom/Other:
- **Your Answer**: Whatever you recommend → A

---

## UX and product polish

### Question 9: Task reordering implementation

- **Status**: `Locked` → **B**
- **Decision**: Custom Pointer Events drag with visible handles; up/down (or equivalent) button fallback for a11y. No heavy DnD library.
- **Why it matters**: True touch drag-and-drop is non-trivial. A heavy library adds weight; custom Pointer Events takes time; up/down buttons are less delightful but reliable.
- **Recommended Default**: **B** — Lightweight Pointer Events drag with visible handles; fallback up/down buttons for a11y. Avoid new heavy DnD frameworks unless needed.
- **Options**:
  - [ ] A — Up/down buttons only (simplest)
  - [x] B — **Custom touch drag handles + keyboard/button fallback** — recommended
  - [ ] C — Add a small DnD library (name it in custom)
  - [ ] Custom/Other:
- **Your Answer**: B

### Question 10: Add Routine to site homepage and nav?

- **Status**: `Locked` → **A**
- **Decision**: Add nav link + homepage card when the feature is ready to ship.
- **Why it matters**: Other apps are manually linked in `index.html` / `nav.html`. Shipping without links means the app only exists via direct URL. Adding links is a public surface-area decision.
- **Recommended Default**: **A** — Add to nav + homepage card when the app is ready to ship (same as Tax-Helper / Teleprompter).
- **Options**:
  - [x] A — **Yes — nav + homepage card** when feature is done — recommended
  - [ ] B — Nav only
  - [ ] C — No public links yet (URL-only / beta)
  - [ ] Custom/Other:
- **Your Answer**: A

### Question 11: Firestore offline persistence

- **Status**: `Locked` → **B**
- **Decision**: Enable Firestore persistent local cache (`persistentLocalCache`); keep UX honest when offline writes are pending.
- **Why it matters**: To-Do List enables multi-tab IndexedDB persistence. Helpful offline, but complicates first-load/auth timing and tests.
- **Recommended Default**: **B** — Enable Firestore **persistent local cache** (modern `persistentLocalCache`) for signed-in users; keep UX honest when offline writes are pending.
- **Options**:
  - [ ] A — Online-only (no persistent cache)
  - [x] B — **Enable persistent cache** — recommended
  - [ ] Custom/Other:
- **Your Answer**: B

### Question 12: Local / demo mode when Firebase env is missing?

- **Status**: `Locked` → **B**
- **Decision**: Clear setup empty state if Firebase config missing; Playwright/tests use an injected in-memory repository.
- **Why it matters**: Playwright and local UI work often need a path that does not depend on live Firebase. Silent mock data can hide production bugs; hard-failing blocks all local UI.
- **Recommended Default**: **B** — If config missing: show clear setup empty state; for automated tests, use an **in-memory repository** injected behind the data layer (not a fake “logged-in cloud”).
- **Options**:
  - [ ] A — Hard-fail app if Firebase env missing
  - [x] B — **Clear setup messaging + in-memory repo for tests** — recommended
  - [ ] C — Full localStorage fallback product mode without Firebase
  - [ ] Custom/Other:
- **Your Answer**: B

### Question 13: Visual design direction

- **Status**: `Locked` → **A**
- **Decision**: Daylight calm theme with teal / soft blue-green accent; atmospheric (non-flat) background; rounded cards; expressive typography; short slide transitions.
- **Why it matters**: The brief asks for calm, friendly, rounded, strong hierarchy — and your frontend rules forbid common AI-default looks (purple gradients, cream+terracotta, broadsheet, generic dark glow). Without a chosen palette/typography, implementation may feel generic or clash with your brand.
- **Recommended Default**: **A** — Soft daylight theme: warm off-white atmospheric background (not flat #F4F1EA cream cliché), deep ink text, single accent (teal or soft blue-green), rounded cards, expressive sans for UI + slightly friendlier display for run task titles. Motion: short slide transitions + Complete press feedback + optional subtle summary celebrate.
- **Options**:
  - [x] A — **Daylight calm / teal accent** — recommended default
  - [ ] B — Soft dark night theme (still calm; not neon/glow-heavy)
  - [ ] C — Match an existing site page’s look — specify which:
  - [ ] Custom/Other:
- **Your Answer**: A

### Question 14: Full-completion celebration

- **Status**: `Locked` → **B**
- **Decision**: **Always celebrate any finished run** (subtle, tasteful motion — not only 100% complete). Still respect `prefers-reduced-motion`.
- **Why it matters**: Tasteful motion helps; overdone confetti feels gimmicky and can annoy daily users.
- **Recommended Default**: **A** — Subtle one-shot checkmark / soft pulse only when **100% completed**; none when any skipped.
- **Options**:
  - [ ] A — **Subtle celebration only on 100% complete** — recommended
  - [x] B — Always celebrate any finished run
  - [ ] C — No celebration animation
  - [ ] Custom/Other:
- **Your Answer**: B

### Question 15: Reorder routines on the library screen

- **Status**: `Locked` → **B**
- **Decision**: Persist `sortOrder`; library reorder in v1 with same interaction language as task reorder (drag handles + fallback controls).
- **Why it matters**: Spec says “if practical.” Library reorder needs a persisted `order` field and UI. Deferring keeps v1 focused on run UX.
- **Recommended Default**: **B** — Persist `sortOrder` on routines; support library reorder in v1 via drag handles or simple move controls (same interaction language as task reorder).
- **Options**:
  - [ ] A — Skip library reorder in v1 (newest-first or name sort only)
  - [x] B — **Include library reorder** — recommended
  - [ ] Custom/Other:
- **Your Answer**: B

---

## Quality, security, ops

### Question 16: Playwright execution expectations

- **Status**: `Locked` → **A**
- **Decision**: E2E against in-memory/mocked data layer; optional manual Firebase smoke in README.
- **Why it matters**: Full Firebase Auth in CI is painful (secrets, Google OAuth). Tests should still cover the core journey.
- **Recommended Default**: **A** — Playwright against **in-memory / mocked data layer** for the 11-step journey; optional manual smoke against real Firebase documented in README.
- **Options**:
  - [x] A — **E2E with mocked/in-memory backend** — recommended
  - [ ] B — E2E against real Firebase emulator
  - [ ] C — E2E against live Firebase (manual credentials)
  - [ ] Custom/Other:
- **Your Answer**: A

### Question 17: Firebase App Check

- **Status**: `Locked` → **A**
- **Decision**: Skip App Check in v1; Auth + Firestore rules only.
- **Why it matters**: App Check reduces abuse of public web API keys; setup adds reCAPTCHA/site keys and friction. Home-Design skipped App Check in v1.
- **Recommended Default**: **A** — Skip App Check in v1; rely on Auth + strict Firestore rules.
- **Options**:
  - [x] A — **Skip App Check v1** — recommended
  - [ ] B — Enable App Check from day one
  - [ ] Custom/Other:
- **Your Answer**: A

### Question 18: Auth authorized domains

- **Status**: `Locked` → **A**
- **Decision**: Authorize `localhost`, `xanderwiles.com`, `www.xanderwiles.com`; add specific Vercel preview hostnames as needed.
- **Why it matters**: Google sign-in fails if the domain is not authorized in Firebase Console. Missing domains look like “auth is broken.”
- **Recommended Default**: **A** — Authorize `localhost`, `xanderwiles.com`, `www.xanderwiles.com`; add specific Vercel preview hostnames as needed (no wildcards).
- **Options**:
  - [x] A — **localhost + production (+ preview hostnames as needed)** — recommended
  - [ ] Custom/Other:
- **Your Answer**: A

---

## Safe-to-decide-now defaults (locked)

| ID | Default |
|----|---------|
| D1 | Stack: latest SvelteKit + Svelte 5 runes + TypeScript + standard CSS (no Tailwind) + npm |
| D2 | Persistence service: **Firestore** for routine definitions (not Storage) |
| D3 | IDs: `crypto.randomUUID()` (or equivalent) for routines and tasks |
| D4 | Empty routines cannot start; single-task and last-task-deleted edge cases handled |
| D5 | Exit confirms when any task is no longer `pending` |
| D6 | Starting always resets run to task 1 with all `pending` |
| D7 | Scaffold from Tax-Helper deploy pattern + Fighter-Jet test tooling |
| D8 | Wire `build.js` exclude/build/inject for `pages/Routine` |
| D9 | Add app-level `.env.example` and root `.env.example` `PUBLIC_ROUTINE_FIREBASE_*` block |
| D10 | Co-locate `firestore.rules` under `pages/Routine/` |
| D11 | Component set from brief: RoutineCard, RoutineEditor, TaskEditorRow, ProgressBar, RoutineTaskSlide, RoutineControls, RoutineSummary, ConfirmDialog |
| D12 | Pure run-state module unit-tested with Vitest (complete/skip/back/summary math) |
