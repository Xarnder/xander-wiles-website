# Beutifully Living — Test Plan

**Feature:** Firebase migration + full admin CMS  
**Environments:** Local (`localhost:3000`), Vercel production (`xanderwiles.com`), Vercel previews (auth per Q12)

**Locked context:** Public read (Q1); full admin CRUD + reorder (Q7); dedicated `PUBLIC_HOME_DESIGN_FIREBASE_*` project.

---

## Test prerequisites

- [ ] **Dedicated** Firebase project created (not shared with To-Do, Work-Tracker, etc.)
- [ ] `PUBLIC_HOME_DESIGN_FIREBASE_*` in `.env.local` and/or Vercel
- [ ] Firestore + Storage rules deployed with `xanderwiles@gmail.com`
- [ ] One-time seed complete (~371 ideas, ≥16 with images)
- [ ] Second Google account for negative auth tests
- [ ] Built output verified: `deploy_out/pages/Home-Design/firebase-config.js` contains injected project ID

---

## Manual tests

### M1 — Public browse (unauthenticated)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/pages/Home-Design/` in incognito | Ideas load without sign-in wall |
| 2 | Wait for feed | ~371 ideas; stats match |
| 3 | Search “kitchen” | Filtered results |
| 4 | Topic chip / hash nav | `#section/...` works |
| 5 | Ideas with images | Storage URLs load |
| 6 | Lightbox | Prev/next/close/Escape |
| 7 | Carousel | Rotates when images exist |
| 8 | Admin controls | **Not visible** (no Add idea, no Image manager) |

### M2 — Google sign-in (owner)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign in with Google as **xanderwiles@gmail.com** | Popup succeeds on localhost / xanderwiles.com |
| 2 | UI | Signed-in state; admin controls visible |
| 3 | Refresh | Session persists |
| 4 | Sign out | Admin hidden; public browse still works |

### M3 — Google sign-in (non-owner) — negative

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign in with different Google account | No admin write UI (or clear “view only”) |
| 2 | Attempt create/update via devtools if exposed | **permission-denied** |
| 3 | Image manager attach | **Denied** |
| 4 | Console | No unintended Firestore/Storage changes |

### M4 — Image manager: upload and attach

**Owner signed in**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Image manager | Opens; **no** “Connect project folder” |
| 2 | Upload image | WebP preview |
| 3 | 16:9 crop toggle | Preview updates |
| 4 | Select idea + attach | Success message |
| 5 | Idea card + carousel | New image visible |
| 6 | Storage | `ideas/{ideaId}/...` |
| 7 | Firestore | `images` array has download URL |
| 8 | Hard refresh | Persists |

### M5 — Image manager: remove image

| Step | Action | Expected |
|------|--------|----------|
| 1 | Remove attached image | Confirm → removed from UI |
| 2 | Firestore | URL removed |
| 3 | Storage | Object deleted |

### M6 — Admin: add idea (Q7)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click Add idea | Form opens |
| 2 | Fill section, title, description | Valid submission |
| 3 | Save | New doc in Firestore; new `ideaId` (e.g. `idea-0372`) |
| 4 | Feed | Idea appears in correct section |
| 5 | `meta/counters` | `lastIdeaNumber` incremented |

### M7 — Admin: edit idea (Q7)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Edit existing idea title + description | Saves to Firestore |
| 2 | Change section | Idea moves in feed |
| 3 | Change parent / level | “Also consider” hierarchy updates |
| 4 | `updatedAt` | Updated in Console |

### M8 — Admin: delete idea (Q7)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Delete idea with confirm | Removed from feed |
| 2 | Firestore | Doc deleted |
| 3 | Storage | Images under `ideas/{ideaId}/` removed |
| 4 | Child ideas | Warn or handle per implementation |

### M9 — Admin: reorder ideas (Q7)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Move idea up/down or drag within subsection | Order changes in UI |
| 2 | Firestore | `sortIndex` values updated |
| 3 | Refresh | Order persists |

### M10 — Export CSV backup (Q13)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Trigger export (if exposed in admin) | Downloads valid CSV |
| 2 | Compare to git CSV | Row count ≥ seeded count; new ideas included |

### M11 — Theme and mobile

| Step | Action | Expected |
|------|--------|----------|
| 1 | Theme toggle | Persists |
| 2 | Mobile layout | Menu, carousel, admin usable |
| 3 | Image manager on mobile | Upload works |

### M12 — Error handling

| Step | Action | Expected |
|------|--------|----------|
| 1 | Block Firestore in DevTools | Graceful error state |
| 2 | Sign out mid-upload | Clear failure message |
| 3 | Non-image upload | Rejected |

### M13 — Local development

| Step | Action | Expected |
|------|--------|----------|
| 1 | `node build.js` with `.env.local` | No warnings for `PUBLIC_HOME_DESIGN_*` |
| 2 | Inspect `deploy_out/.../firebase-config.js` | Injected values; **Home-Design project ID** (not Work-Tracker etc.) |
| 3 | `npx serve deploy_out` on :3000 | Auth + data work |

### M14 — Vercel production

| Step | Action | Expected |
|------|--------|----------|
| 1 | Deploy with Vercel env vars | Build succeeds |
| 2 | `xanderwiles.com/pages/Home-Design/` | M1 + M2 pass |
| 3 | Admin CRUD on production | M6–M9 pass |

### M15 — Data parity (post-seed)

| Check | Expected |
|-------|----------|
| Firestore `ideas` count | ~371 |
| Ideas with images | ≥ 16 |
| Sections / hierarchy | Match pre-migration spot-check |
| All runtime images | Storage URLs (not `/pages/Home-Design/images/...`) |

### M16 — Security rules (Console)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Unauthenticated read `ideas/x` | **Allowed** |
| 2 | Unauthenticated write | **Denied** |
| 3 | Owner authenticated write | **Allowed** |
| 4 | Non-owner authenticated write | **Denied** |
| 5 | Public Storage read | **Allowed** |
| 6 | Unauthenticated Storage write | **Denied** |

### M17 — Monorepo isolation

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Work-Tracker or To-Do in same browser | Still uses **its own** Firebase project |
| 2 | Create idea in Home-Design | Appears only in Home-Design Firestore |
| 3 | Network tab on Home-Design | Requests go to Home-Design `projectId` |

### M18 — Accessibility (smoke)

| Check | Expected |
|-------|----------|
| Auth buttons | Accessible names |
| Admin forms | Labels on inputs |
| Image manager dialog | `aria-modal`, Escape closes |
| Feed | `aria-live` on updates |

---

## Automated tests

### A1 — Rules unit tests (recommended)

`@firebase/rules-unit-testing` against `firestore.rules` / `storage.rules`:

| Test | Assertion |
|------|-----------|
| Public read idea | allow |
| Public write idea | deny |
| Owner write idea | allow |
| Non-owner write | deny |
| Owner upload image | allow |
| 15 MB upload | deny |

### A2 — Build pipeline

| Test | Expected |
|------|----------|
| `node build.js` with env | `PUBLIC_HOME_DESIGN_*` injected in `deploy_out` |
| Missing env | Warning for `PUBLIC_HOME_DESIGN_*` |
| Wrong project ID in output | **Fail** — must match new Home-Design project |

### A3 — Unit tests (optional)

Reuse existing pure functions: `parseCsv`, `buildSections`, `migrateImageManifest` (seed script).

### A4 — Static checks

| Check | Expected |
|-------|----------|
| `git grep AIza pages/Home-Design` | No new hardcoded keys |
| `grep PUBLIC_WORK` in Home-Design | None — no cross-app env bleed |

---

## Regression scope

- Hash routing `#section/{id}`
- Search filtering
- Lightbox + carousel keyboard
- Theme `localStorage`
- `?show-keys` debug (if retained)

---

## Pass criteria

All applicable M1–M18 tests pass; M17 monorepo isolation confirmed; no Critical security failures.

---

## Definition of done (testing)

- [ ] M1–M14 on local + production
- [ ] M6–M9 admin CRUD verified
- [ ] M15 seed parity
- [ ] M16 rules verified
- [ ] M17 isolation verified
- [ ] A2 build injection passed
