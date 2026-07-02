# Beutifully Living — Risk and Safety Review

**Feature:** Firebase migration for `pages/Home-Design/`  
**Status:** Updated post Q&A — decisions locked

---

## Executive summary

This migration adds **Google Auth**, **Firestore**, and **Storage** to a public blog, plus a **full admin CMS** (add/delete/reorder/hierarchy). Risk is **medium**: misconfigured rules or wrong Firebase project reuse are the main threats. Using a **dedicated Firebase project** and `PUBLIC_HOME_DESIGN_FIREBASE_*` env prefix isolates Home-Design from six sibling Firebase apps in the monorepo.

---

## Security and privacy risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Reusing another app's Firebase project** | Critical | Low if D8 followed | New project only; unique env prefix; never import Work-Tracker config |
| **Firestore rules too permissive** | Critical | Low | Production mode; email-gated writes; test with non-owner account |
| **Storage public write** | Critical | Low | `isOwner()` on write/delete |
| **Wrong owner email in rules** | High | Low | Locked to `xanderwiles@gmail.com`; test with non-owner account |
| **API keys in git** | Medium | Medium | `PUBLIC_HOME_DESIGN_*` only via `.env.local` / Vercel; no hardcoded fallbacks |
| **Accidental delete of ideas/images** | Medium | Medium | Confirm dialogs; optional soft-delete later; git CSV backup (Q13) |
| **Hierarchy corruption** | Medium | Low | Validate parent exists; warn on delete with children |
| **Public read of all content** | Low | Certain (Q1=A) | Intended for public blog |
| **Google account compromise** | High | Low | 2FA on Google account |
| **Firebase API key in bundle** | Low | Certain | Rules + Auth prevent abuse; no App Check v1 (Q14) |

### Authentication and authorization (locked)

| Control | Implementation |
|---------|----------------|
| Identity provider | Google OAuth (Firebase Auth) |
| Admin identification | `request.auth.token.email == 'xanderwiles@gmail.com'` in rules |
| Public reads | **Allowed** for ideas + images (Q1=A) |
| Writes | Owner only — ideas CRUD, reorder, image upload/delete |
| Client gates | Admin UI + image manager hidden unless owner signed in |
| Server enforcement | Firestore + Storage rules (mandatory) |

**Must not happen:** Test-mode rules, world-writable collections, or pointing Home-Design at To-Do/Work-Tracker project IDs.

---

## Monorepo-specific risks

| Risk | What goes wrong | Mitigation |
|------|-----------------|------------|
| Wrong env vars in Vercel | Home-Design writes to Work-Tracker Firestore | Label vars `PUBLIC_HOME_DESIGN_*`; verify `projectId` in built `firebase-config.js` |
| Copied `firebase-config.js` from sibling | Cross-app data leak | New file with only Home-Design vars |
| `build.js` injects all `PUBLIC_*` | Harmless if files use correct prefix | Each app uses its own prefix — no collision |
| Multiple `initializeApp` on same page | N/A — Home-Design is standalone page | Single init in `firebase-config.js` |

---

## Privacy considerations

- No visitor accounts; no analytics added in v1.
- Admin email visible in UI when signed in.
- Design content is public by design (Q1).
- Data stored in new Firebase project region (choose at A5).

---

## Performance risks

| Risk | Mitigation |
|------|------------|
| 400-doc fetch on every visit | Acceptable v1; `getDocs` once for anonymous users |
| Admin `onSnapshot` while editing | Owner-only; acceptable read cost |
| Storage egress | WebP compression; lazy images |
| Reorder batch writes | Batch ≤ 500 ops per Firestore limit |
| Missing Vercel env vars | `build.js` warns on missing `PUBLIC_HOME_DESIGN_*` |

---

## Operational risks

| Risk | Mitigation |
|------|------------|
| Seed run twice | Idempotent doc IDs; `meta/schema.seededAt` guard |
| Partial seed | M10 count checks before cutover |
| Rules not deployed before client writes | High | Low | Deploy rules with `xanderwiles@gmail.com` before release |
| Vercel preview auth (Q12) | Add preview hostname to authorized domains when testing |
| Delete idea orphans Storage files | Delete Storage prefix `ideas/{ideaId}/` on idea delete |

---

## Data integrity risks (full admin — Q7)

| Risk | Mitigation |
|------|------------|
| Concurrent edits (two tabs) | Last write wins; acceptable for single admin |
| Reorder race | Batch update in single write batch |
| Parent/child mismatch | Validate `parentItem` against existing titles on save |
| Image removed from Storage but URL remains | Update Firestore in same flow; verify in M5 |
| Firestore vs git CSV drift | Firestore = truth; export CSV on demand (Q13) |

---

## Rollback plan

### Immediate
1. Promote previous Vercel deployment.
2. Revert JS to CSV `fetch` if needed — git backup files still present (Q13).

### Short-term
1. Git revert Firebase commits.
2. Redeploy; Firestore data preserved but unused.

### Recovery
- `Home Design Bullets.csv`, `idea-images.json`, `images/` remain in git.
- Firestore export via Console if needed.

### Rollback triggers
- Blank site >15 min
- Public write vulnerability
- Admin lockout with no Console access
- Wrong Firebase project receiving writes

---

## Pre-release safety checklist

- [ ] **Dedicated** Firebase project (not shared with other site apps)
- [ ] `PUBLIC_HOME_DESIGN_FIREBASE_PROJECT_ID` matches Console project
- [ ] Firestore production mode + custom rules live
- [ ] Owner email `xanderwiles@gmail.com` in rules
- [ ] Project ID `beautifully-living-xander` in env vars (not another app's project)
- [ ] Non-owner write denied (M3, M11)
- [ ] No `AIza` keys committed in Home-Design files
- [ ] `xanderwiles.com` in authorized domains
- [ ] Image manager + admin controls hidden when logged out

---

## Definition of done (safety)

- [ ] Critical/High risks mitigated
- [ ] Monorepo isolation verified (project ID + env prefix)
- [ ] Rules match Q1/Q3; owner email `xanderwiles@gmail.com`
- [ ] Rollback path documented
